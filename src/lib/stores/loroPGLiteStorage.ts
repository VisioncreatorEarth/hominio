import { PGlite } from '@electric-sql/pglite';
import type { LoroDoc, VersionVector } from 'loro-crdt';
import { invoke } from '@tauri-apps/api/core';
import { generateUUID } from '$lib/utils/uuid';

// Type definitions for versions and metadata
type LoroVersion = VersionVector;
type LoroMetadata = Record<string, unknown>;

// Type definition for query result rows
interface PGResultRow {
    doc_id: string;
    doc_type: string;
    data: Uint8Array;
    updated_at: Date;
    meta: string;
    version?: string;
    from_version?: string;
    to_version?: string;
}

/**
 * LoroPGLiteStorage - A storage adapter for Loro that uses PGlite
 * Provides persistent SQL-based storage for Loro documents with support
 * for both snapshots and incremental updates
 */
export class LoroPGLiteStorage {
    private db: PGlite | null = null;
    private initialized = false;
    private initializing = false;
    private dbName = 'hominio.db';
    private dbPath: string | null = null;
    private storageMode: 'native' | 'indexeddb' | 'not-initialized' = 'not-initialized';
    private debugInfo: string[] = [];
    private tauriAvailable = false;
    private lastInitError: string | null = null;
    private initAttempts = 0;
    private maxInitAttempts = 5;

    constructor() {
        this.addDebugInfo('Constructor called');
        // No localStorage dependency - simpler initialization
    }

    /**
     * Get the current storage mode
     */
    getStorageMode(): 'native' | 'indexeddb' | 'not-initialized' {
        return this.storageMode;
    }

    /**
     * Get the database path
     */
    getDbPath(): string | null {
        return this.dbPath;
    }

    /**
     * Get debug information
     */
    getDebugInfo(): string[] {
        return this.debugInfo;
    }

    /**
     * Get the last initialization error
     */
    getLastInitError(): string | null {
        return this.lastInitError;
    }

    /**
     * Add debug information
     */
    private addDebugInfo(message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp}: ${message}`;
        this.debugInfo.push(logMessage);
    }

    /**
     * Helper method to check if we're running in a real Tauri environment
     * This checks for the __TAURI__ global object which is only present in Tauri apps
     */
    private isTauriEnvironment(): boolean {
        return typeof window !== 'undefined' && '__TAURI__' in window;
    }

    /**
     * Check for existing databases in IndexedDB
     */
    private async checkExistingDatabases(): Promise<void> {
        if (typeof window === 'undefined' || !window.indexedDB) {
            return;
        }

        try {
            // Open request to list databases
            const request = indexedDB.databases();
            const databases = await request;

            // Log all databases for diagnostics
            this.addDebugInfo(`Found ${databases.length} IndexedDB databases`);
            for (const db of databases) {
                this.addDebugInfo(`Found IndexedDB database: ${db.name} (v${db.version})`);
            }

            // Clear all existing db instances if we find multiple in development
            let dbCount = 0;
            for (const db of databases) {
                if (db.name && (
                    db.name === this.dbName ||
                    db.name === `/pglite/${this.dbName}` ||
                    db.name.includes('pglite') ||
                    db.name.includes('hominio')
                )) {
                    dbCount++;
                    if (dbCount > 1) {
                        // Delete extra databases to avoid confusion
                        this.addDebugInfo(`Deleting extra database: ${db.name}`);
                        try {
                            indexedDB.deleteDatabase(db.name);
                        } catch (e) {
                            this.addDebugInfo(`Error deleting database: ${e}`);
                        }
                    }
                }
            }
        } catch (error) {
            this.addDebugInfo(`Error listing IndexedDB databases: ${error}`);
        }
    }

    /**
     * Check the current state of the database for diagnostics
     */
    async checkDatabaseState(): Promise<{
        indexedDBDatabases: string[];
        storageMode: string;
        initialized: boolean;
        tablesFound: string[];
        documentCount: number;
        lastError: string | null;
        initAttempts: number;
        debugInfo: string[];
    }> {
        const result = {
            indexedDBDatabases: [] as string[],
            storageMode: this.storageMode,
            initialized: this.initialized,
            tablesFound: [] as string[],
            documentCount: 0,
            lastError: this.lastInitError,
            initAttempts: this.initAttempts,
            debugInfo: this.debugInfo.slice(-10) // Last 10 debug messages
        };

        // Check for existing databases in IndexedDB
        if (typeof window !== 'undefined' && window.indexedDB) {
            try {
                const databases = await indexedDB.databases();
                result.indexedDBDatabases = databases.map(db => `${db.name} (v${db.version})`);

                // Log all databases for diagnostics
                this.addDebugInfo(`Database state check found ${databases.length} IndexedDB databases`);
                for (const db of databases) {
                    this.addDebugInfo(`Found IndexedDB database: ${db.name} (v${db.version})`);
                }
            } catch (error) {
                this.addDebugInfo(`Error listing IndexedDB databases: ${error}`);
            }
        }

        // Check for tables if we're initialized
        if (this.initialized && this.db) {
            try {
                this.addDebugInfo('Checking database tables...');
                const schemaCheck = await this.db.query("SELECT name FROM sqlite_master WHERE type='table'");

                this.addDebugInfo(`Found ${schemaCheck.rows.length} tables in the database`);

                for (const row of schemaCheck.rows) {
                    const tableName = (row as { name: string }).name;
                    result.tablesFound.push(tableName);
                    this.addDebugInfo(`Found table: ${tableName}`);

                    // If it's the loro_snapshots table, count documents
                    if (tableName === 'loro_snapshots') {
                        try {
                            const countResult = await this.db.query("SELECT COUNT(*) as count FROM loro_snapshots");
                            result.documentCount = (countResult.rows[0] as { count: number }).count;
                            this.addDebugInfo(`Found ${result.documentCount} documents in loro_snapshots table`);
                        } catch (countError) {
                            this.addDebugInfo(`Error counting documents: ${countError}`);
                        }
                    }
                }
            } catch (error) {
                this.addDebugInfo(`Error checking database schema: ${error}`);

                // Try a simpler query if the schema check fails
                try {
                    this.addDebugInfo('Trying simpler database test query...');
                    await this.db.exec("SELECT 1 AS test");
                    this.addDebugInfo('Simple query succeeded, database connection works');
                } catch (testError) {
                    this.addDebugInfo(`Simple query failed, database connection may be broken: ${testError}`);
                }
            }
        } else {
            this.addDebugInfo(`Cannot check tables: initialized=${this.initialized}, db=${!!this.db}`);
        }

        this.addDebugInfo(`Database state check complete: ${JSON.stringify({
            storageMode: result.storageMode,
            initialized: result.initialized,
            tablesCount: result.tablesFound.length,
            documentCount: result.documentCount,
            initAttempts: result.initAttempts
        })}`);

        return result;
    }

    /**
     * Public initialize method - call this to initialize the storage
     */
    async initialize(): Promise<void> {
        this.initAttempts = 0;
        try {
            // Check for existing databases first
            await this.checkExistingDatabases();

            // Then ensure initialization
            await this.ensureInitialized();

            // Check database state after initialization for diagnostics
            const state = await this.checkDatabaseState();

            // Reset the error state on successful initialization
            this.lastInitError = null;
        } catch (error) {
            console.error("Failed to initialize storage:", error);
            this.storageMode = 'not-initialized';
            this.lastInitError = error instanceof Error ? error.message : String(error);
            throw error;
        }
    }

    /**
     * Initialize the database connection and schema
     */
    private async ensureInitialized(): Promise<void> {
        // If already initialized, return immediately
        if (this.initialized) {
            this.addDebugInfo('Already initialized, skipping initialization');
            return;
        }

        // Check if we've exceeded maximum attempts
        this.initAttempts++;
        if (this.initAttempts > this.maxInitAttempts) {
            this.addDebugInfo(`Exceeded maximum initialization attempts (${this.maxInitAttempts})`);
            throw new Error(`Failed to initialize after ${this.maxInitAttempts} attempts`);
        }

        // If initialization already in progress in this instance, wait for it to complete
        if (this.initializing) {
            this.addDebugInfo('Initialization already in progress in this instance, waiting...');

            // Use a more reliable waiting mechanism with timeout
            const startWaitTime = Date.now();
            const maxWaitTime = 5000; // 5 seconds max wait

            while (this.initializing && (Date.now() - startWaitTime < maxWaitTime)) {
                // Wait in shorter intervals for better responsiveness
                await new Promise(resolve => setTimeout(resolve, 100));

                // If initialization completed while waiting, return
                if (this.initialized) {
                    return;
                }
            }

            // If we're still initializing after timeout, something is wrong
            if (this.initializing) {
                this.addDebugInfo('Initialization wait timeout - forcing new initialization');
                // Force reset the initializing flag to allow a fresh attempt
                this.initializing = false;
            } else if (this.initialized) {
                // Double check if initialization completed
                return;
            }
        }

        // Mark as initializing with a timestamp for debugging
        this.initializing = true;
        const initStartTime = Date.now();
        this.addDebugInfo(`Starting initialization attempt ${this.initAttempts} at ${new Date(initStartTime).toISOString()}`);

        try {
            await this._initialize();
            const initDuration = Date.now() - initStartTime;
            this.addDebugInfo(`Initialization completed successfully in ${initDuration}ms`);
        } catch (error) {
            const initDuration = Date.now() - initStartTime;
            this.addDebugInfo(`Initialization failed after ${initDuration}ms: ${error}`);

            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
            throw error;
        } finally {
            this.initializing = false;
        }
    }

    /**
     * Main initialization with simplified logic
     */
    private async _initialize(): Promise<void> {
        try {
            this.addDebugInfo('Starting initialization');

            // === PHASE 1: First initialize with IndexedDB (always works) ===
            this.addDebugInfo('Initializing with IndexedDB database');

            // Format for IndexedDB persistence is 'idb://dbname'
            const dbUrl = `idb://${this.dbName}`;
            this.addDebugInfo(`Using database URL: ${dbUrl}`);

            // Initialize PGlite with IndexedDB
            this.db = new PGlite(dbUrl, {
                relaxedDurability: false // Disable relaxed durability for better data safety
            });

            try {
                // Test the connection
                await this.db.exec("SELECT 1 AS test");
                this.addDebugInfo('IndexedDB connection test successful');

                // Create schema immediately
                await this.createSchema();
                this.storageMode = 'indexeddb';
                this.initialized = true;

                this.addDebugInfo('IndexedDB storage initialized successfully');
            } catch (indexedDBError) {
                this.addDebugInfo(`IndexedDB initialization failed: ${indexedDBError}`);
                this.db = null;
                this.storageMode = 'not-initialized';
                this.initialized = false;
                throw new Error(`Failed to initialize IndexedDB storage: ${indexedDBError}`);
            }

            // === PHASE 2: Check if Tauri is available and switch if possible ===
            try {
                this.addDebugInfo('Checking if Tauri is available...');
                // Use test_fs_access instead of save_hello_world to check Tauri availability
                const homePath = '/Users/samuelandert/.hominio';
                try {
                    const fsResult = await invoke<{ exists: boolean; is_writable: boolean }>('test_fs_access', { path: homePath });
                    this.tauriAvailable = true;
                    this.addDebugInfo(`Tauri is available! Filesystem access at: ${homePath}`);
                    this.addDebugInfo(`Filesystem test results: exists=${fsResult.exists}, writable=${fsResult.is_writable}`);

                    // Set the database path - do NOT use resolve() which can cause issues
                    this.dbPath = `${homePath}/hominio.db`;
                    this.addDebugInfo(`Using db path: ${this.dbPath}`);

                    // When in Tauri mode, set storage mode to native
                    // This indicates to the app that data is saved natively
                    this.storageMode = 'native';
                    this.addDebugInfo('Switched to native storage mode for Tauri');
                } catch (tauriError) {
                    this.addDebugInfo(`Tauri detection failed: ${tauriError}`);
                    this.tauriAvailable = false;
                }
            } catch (error) {
                this.addDebugInfo(`Error during Tauri detection: ${error}`);
                this.tauriAvailable = false;
            }

            // Register cleanup handlers regardless of mode
            this.registerCleanupHandlers();

            this.addDebugInfo(`Initialization complete. Storage mode: ${this.storageMode}`);

        } catch (error) {
            // This catches any errors not handled in the inner try-catch blocks
            this.addDebugInfo(`Critical initialization error: ${error}`);
            this.storageMode = 'not-initialized';
            this.initialized = false;
            this.db = null;
            throw error;
        }
    }

    /**
     * Register handlers for cleanup on page unload
     */
    private registerCleanupHandlers(): void {
        if (typeof window !== 'undefined') {
            // Add event listener for beforeunload to ensure proper database shutdown
            window.addEventListener('beforeunload', () => {
                this.addDebugInfo('Page unloading, performing cleanup');

                // If using IndexedDB, try to force a sync
                if (this.db && this.storageMode === 'indexeddb') {
                    try {
                        // Execute a simple query to ensure any pending writes are flushed
                        // This won't actually wait for the promise to resolve due to beforeunload,
                        // but it might trigger the flush operation to start
                        this.db.exec("PRAGMA wal_checkpoint(FULL)");
                        this.addDebugInfo('Requested final flush before unload');
                    } catch (e) {
                        this.addDebugInfo(`Error during final flush: ${e}`);
                    }
                }
            });
        }
    }

    /**
     * Create the database schema
     */
    private async createSchema(): Promise<void> {
        if (!this.db) {
            this.addDebugInfo('Cannot create schema: database not initialized');
            throw new Error('Database not initialized');
        }

        try {
            this.addDebugInfo('Creating schema...');
            await this.db.exec(`
                -- Table for storing document snapshots
                CREATE TABLE IF NOT EXISTS loro_snapshots (
                  doc_id TEXT PRIMARY KEY,
                  doc_type TEXT NOT NULL,
                  data BYTEA NOT NULL,
                  version TEXT NOT NULL,
                  meta JSONB DEFAULT '{}',
                  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                
                -- Create index on doc_type for filtering
                CREATE INDEX IF NOT EXISTS idx_snapshots_doc_type 
                ON loro_snapshots(doc_type);
                
                -- Table for storing incremental updates
                CREATE TABLE IF NOT EXISTS loro_updates (
                  update_id TEXT PRIMARY KEY,
                  doc_id TEXT NOT NULL,
                  data BYTEA NOT NULL,
                  from_version TEXT NOT NULL,
                  to_version TEXT NOT NULL,
                  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (doc_id) REFERENCES loro_snapshots(doc_id) ON DELETE CASCADE
                );
                
                -- Create index on doc_id and from_version for faster lookups
                CREATE INDEX IF NOT EXISTS idx_updates_doc_id_from 
                ON loro_updates(doc_id, from_version);
            `);
            this.addDebugInfo('Schema created successfully');
        } catch (error) {
            this.addDebugInfo(`Error creating schema: ${error}`);
            throw error;
        }
    }

    /**
     * Export the database to a file (Tauri only)
     */
    async exportDatabaseToFile(): Promise<boolean> {
        if (!this.tauriAvailable || !this.dbPath) {
            this.addDebugInfo('Cannot export database: not in Tauri mode or path not set');
            return false;
        }

        try {
            // Get all snapshots
            const snapshots = await this.listSnapshots();
            if (snapshots.length === 0) {
                this.addDebugInfo('No snapshots to export');
                return false;
            }

            // Convert to a serializable format for file storage
            const exportData = {
                version: 1,
                timestamp: new Date().toISOString(),
                snapshots: await Promise.all(snapshots.map(async (snapshot) => {
                    // For each snapshot, get the data
                    // Need to query again to get the binary data
                    const result = await this.db!.query<PGResultRow>(
                        'SELECT * FROM loro_snapshots WHERE doc_id = $1',
                        [snapshot.docId]
                    );

                    if (result.rows.length === 0) {
                        return null;
                    }

                    const row = result.rows[0];

                    // Convert binary data to base64 for storage
                    const base64Data = this.uint8ArrayToBase64(row.data);

                    return {
                        docId: snapshot.docId,
                        docType: snapshot.docType,
                        data: base64Data,
                        version: row.version,
                        meta: snapshot.meta,
                        updatedAt: snapshot.updatedAt
                    };
                })).then(items => items.filter(Boolean))
            };

            // Write to file
            const jsonData = JSON.stringify(exportData);
            await invoke('write_text_file', {
                path: this.dbPath,
                contents: jsonData
            });

            this.addDebugInfo(`Database exported to ${this.dbPath}`);
            return true;
        } catch (error) {
            this.addDebugInfo(`Error exporting database: ${error}`);
            return false;
        }
    }

    /**
     * Import database from file (Tauri only)
     */
    async importDatabaseFromFile(): Promise<boolean> {
        if (!this.tauriAvailable || !this.dbPath) {
            this.addDebugInfo('Cannot import database: not in Tauri mode or path not set');
            return false;
        }

        try {
            // Read from file
            const fileContents = await invoke<string>('read_text_file', {
                path: this.dbPath
            });

            if (!fileContents) {
                this.addDebugInfo('No data to import (file empty or not found)');
                return false;
            }

            // Parse the JSON
            const importData = JSON.parse(fileContents);
            if (!importData || !importData.snapshots || !Array.isArray(importData.snapshots)) {
                this.addDebugInfo('Invalid import data format');
                return false;
            }

            // Import each snapshot
            let importCount = 0;
            for (const snapshot of importData.snapshots) {
                if (!snapshot || !snapshot.docId || !snapshot.data) {
                    continue;
                }

                // Convert base64 back to binary
                const binaryData = this.base64ToUint8Array(snapshot.data);

                // Insert into database
                await this.db!.query(
                    `INSERT INTO loro_snapshots (doc_id, doc_type, data, version, meta, updated_at) 
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (doc_id) 
                    DO UPDATE SET data = $3, version = $4, meta = $5, updated_at = $6`,
                    [
                        snapshot.docId,
                        snapshot.docType,
                        binaryData,
                        snapshot.version,
                        JSON.stringify(snapshot.meta),
                        new Date(snapshot.updatedAt)
                    ]
                );

                importCount++;
            }

            this.addDebugInfo(`Imported ${importCount} snapshots from ${this.dbPath}`);
            return importCount > 0;
        } catch (error) {
            this.addDebugInfo(`Error importing database: ${error}`);
            return false;
        }
    }

    /**
     * Convert Uint8Array to base64 string
     */
    private uint8ArrayToBase64(bytes: Uint8Array): string {
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * Convert base64 string to Uint8Array
     */
    private base64ToUint8Array(base64: string): Uint8Array {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Save a Loro document snapshot
     */
    async saveSnapshot(docId: string, loroDoc: LoroDoc, docType: string = 'default', meta: LoroMetadata = {}): Promise<void> {
        await this.ensureInitialized();

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            // Get the current timestamp
            const now = new Date();

            // Export snapshot as binary data
            const snapshot = loroDoc.export({ mode: 'snapshot' });

            // Log snapshot size for diagnostics
            this.addDebugInfo(`Exporting snapshot for ${docId}: ${snapshot.byteLength} bytes`);

            // Convert version to string
            const version = JSON.stringify(loroDoc.version());

            // Store the snapshot with upsert pattern
            await this.db.query(
                `INSERT INTO loro_snapshots (doc_id, doc_type, data, version, meta, updated_at) 
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (doc_id) 
                DO UPDATE SET data = $3, version = $4, meta = $5, updated_at = $6`,
                [docId, docType, snapshot, version, JSON.stringify(meta), now]
            );

            this.addDebugInfo(`Snapshot saved for document: ${docId}`);

            // Verify the snapshot was actually saved by reading it back
            try {
                const verifyResult = await this.db.query(
                    'SELECT doc_id, length(data) as data_length FROM loro_snapshots WHERE doc_id = $1',
                    [docId]
                );

                if (verifyResult.rows.length > 0) {
                    const dataLength = (verifyResult.rows[0] as { data_length: number }).data_length;
                    this.addDebugInfo(`Verified snapshot saved for ${docId}: ${dataLength} bytes in database`);

                    // Force a checkpoint/flush if we're using IndexedDB
                    if (this.storageMode === 'indexeddb') {
                        // Execute a simple PRAGMA to encourage flushing to disk
                        await this.db.exec("PRAGMA wal_checkpoint(FULL)");
                        this.addDebugInfo('Executed checkpoint to flush data');
                    }
                } else {
                    this.addDebugInfo(`WARNING: Verification failed - snapshot for ${docId} not found after save!`);
                }
            } catch (verifyError) {
                this.addDebugInfo(`Error verifying snapshot: ${verifyError}`);
            }

            // If in Tauri mode, also export to file
            if (this.tauriAvailable && this.storageMode === 'native') {
                this.addDebugInfo('Exporting database to file after snapshot save');
                await this.exportDatabaseToFile();
            }
        } catch (error) {
            this.addDebugInfo(`Error saving snapshot: ${error}`);
            throw error;
        }
    }

    /**
     * Save an incremental update for a document
     */
    async saveUpdate(docId: string, loroDoc: LoroDoc, fromVersion: LoroVersion): Promise<string> {
        await this.ensureInitialized();

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            // Generate an update ID
            const updateId = generateUUID();

            // Export incremental update
            const updateData = loroDoc.export({ mode: 'update', from: fromVersion });

            // Current version after the update
            const toVersion = JSON.stringify(loroDoc.version());
            const fromVersionStr = JSON.stringify(fromVersion);

            // Store the update
            await this.db.query(
                `INSERT INTO loro_updates (update_id, doc_id, data, from_version, to_version)
                VALUES ($1, $2, $3, $4, $5)`,
                [updateId, docId, updateData, fromVersionStr, toVersion]
            );

            this.addDebugInfo(`Update saved for document: ${docId}`);
            return toVersion;
        } catch (error) {
            this.addDebugInfo(`Error saving update: ${error}`);
            throw error;
        }
    }

    /**
     * Load a Loro document snapshot
     */
    async loadSnapshot(docId: string, loroDoc: LoroDoc): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            // If in Tauri mode and we haven't loaded from file yet, try to import
            if (this.tauriAvailable && this.storageMode === 'native') {
                try {
                    await this.importDatabaseFromFile();
                } catch (error) {
                    this.addDebugInfo(`Error importing database during loadSnapshot: ${error}`);
                    // Continue with in-memory data even if import fails
                }
            }

            // Query for the snapshot
            const result = await this.db.query<PGResultRow>(
                'SELECT data FROM loro_snapshots WHERE doc_id = $1',
                [docId]
            );

            if (result.rows.length === 0) {
                this.addDebugInfo(`No snapshot found for document: ${docId}`);
                return false;
            }

            // Get the binary data and import into Loro doc
            const snapshotData = result.rows[0].data;
            loroDoc.import(snapshotData);

            this.addDebugInfo(`Snapshot loaded for document: ${docId}`);
            return true;
        } catch (error) {
            this.addDebugInfo(`Error loading snapshot: ${error}`);
            return false;
        }
    }

    /**
     * Load incremental updates for a document
     */
    async loadUpdates(docId: string, loroDoc: LoroDoc, fromVersion: LoroVersion): Promise<boolean> {
        await this.ensureInitialized();

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            const fromVersionStr = JSON.stringify(fromVersion);

            // Query for updates since fromVersion
            const result = await this.db.query<PGResultRow>(
                `SELECT data FROM loro_updates 
                WHERE doc_id = $1 AND from_version = $2
                ORDER BY created_at ASC`,
                [docId, fromVersionStr]
            );

            if (result.rows.length === 0) {
                return false;
            }

            // Apply each update
            for (const row of result.rows) {
                loroDoc.import(row.data);
            }

            this.addDebugInfo(`${result.rows.length} updates loaded for document: ${docId}`);
            return true;
        } catch (error) {
            this.addDebugInfo(`Error loading updates: ${error}`);
            return false;
        }
    }

    /**
     * List all available snapshots, optionally filtered by document type
     */
    async listSnapshots(docId?: string, docType?: string): Promise<Array<{
        docId: string;
        docType: string;
        updatedAt: Date;
        meta: LoroMetadata;
    }>> {
        await this.ensureInitialized();

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            let query = `
                SELECT doc_id, doc_type, updated_at, meta
                FROM loro_snapshots
            `;

            const params: Array<string> = [];
            let whereClause = '';

            if (docId) {
                whereClause = 'WHERE doc_id = $1';
                params.push(docId);

                if (docType) {
                    whereClause += ' AND doc_type = $2';
                    params.push(docType);
                }
            } else if (docType) {
                whereClause = 'WHERE doc_type = $1';
                params.push(docType);
            }

            query += whereClause + ' ORDER BY updated_at DESC';

            const result = await this.db.query<PGResultRow>(query, params);

            return result.rows.map(row => {
                // Safely parse the meta JSON with proper error handling
                let parsedMeta: LoroMetadata = {};
                try {
                    if (row.meta && typeof row.meta === 'string') {
                        // Try to parse the JSON string
                        parsedMeta = JSON.parse(row.meta);
                    } else if (row.meta && typeof row.meta === 'object') {
                        // If it's already an object, use it directly
                        parsedMeta = row.meta as unknown as LoroMetadata;
                    }
                } catch (parseError) {
                    this.addDebugInfo(`Error parsing meta JSON for doc ${row.doc_id}: ${parseError}`);
                    // Use empty object on parse error
                    parsedMeta = {};
                }

                return {
                    docId: row.doc_id,
                    docType: row.doc_type,
                    updatedAt: row.updated_at,
                    meta: parsedMeta
                };
            });
        } catch (error) {
            this.addDebugInfo(`Error listing snapshots: ${error}`);
            return [];
        }
    }

    /**
     * Delete all snapshots for a document
     */
    async deleteSnapshot(docId: string): Promise<number> {
        await this.ensureInitialized();

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            const result = await this.db.query<PGResultRow>(
                'DELETE FROM loro_snapshots WHERE doc_id = $1 RETURNING doc_id',
                [docId]
            );

            this.addDebugInfo(`Deleted ${result.rows.length} snapshots for document ${docId}`);
            return result.rows.length;
        } catch (error) {
            this.addDebugInfo(`Error deleting snapshot: ${error}`);
            return 0;
        }
    }

    /**
     * Delete all snapshots
     */
    async deleteAllSnapshots(): Promise<number> {
        await this.ensureInitialized();

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            const result = await this.db.query<PGResultRow>(
                'DELETE FROM loro_snapshots RETURNING doc_id'
            );

            this.addDebugInfo(`Deleted all ${result.rows.length} snapshots`);
            return result.rows.length;
        } catch (error) {
            this.addDebugInfo(`Error deleting all snapshots: ${error}`);
            return 0;
        }
    }

    /**
     * Get all document IDs in storage
     */
    async getAllDocumentIds(): Promise<string[]> {
        await this.ensureInitialized();

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            const result = await this.db.query<PGResultRow>(
                'SELECT DISTINCT doc_id FROM loro_snapshots ORDER BY doc_id'
            );

            return result.rows.map(row => row.doc_id);
        } catch (error) {
            this.addDebugInfo(`Error getting document IDs: ${error}`);
            return [];
        }
    }

    /**
     * Diagnose and attempt to fix database issues
     * This method can be called when there are problems with the database
     */
    async diagnoseAndFix(): Promise<{
        fixed: boolean;
        actions: string[];
        state: Awaited<ReturnType<LoroPGLiteStorage['checkDatabaseState']>>;
    }> {
        const actions: string[] = [];
        let fixed = false;

        this.addDebugInfo('Starting database diagnosis and repair');
        actions.push('Starting diagnosis');

        // First check the current state
        const initialState = await this.checkDatabaseState();

        // If we're already initialized and working, nothing to fix
        if (initialState.initialized &&
            (initialState.storageMode === 'native' || initialState.storageMode === 'indexeddb') &&
            initialState.tablesFound.length > 0) {

            this.addDebugInfo('Database appears to be working correctly, no fixes needed');
            actions.push('Database is already working correctly');
            return { fixed: true, actions, state: initialState };
        }

        // Try to clean up any broken database connections
        if (this.db) {
            this.addDebugInfo('Closing existing database connection');
            actions.push('Closed existing database connection');
            this.db = null;
        }

        // Reset initialization state
        this.initialized = false;
        this.initializing = false;
        actions.push('Reset initialization state');

        // Check for and clean up any duplicate or corrupted IndexedDB databases
        if (typeof window !== 'undefined' && window.indexedDB) {
            try {
                const databases = await indexedDB.databases();

                // Log all databases
                this.addDebugInfo(`Found ${databases.length} IndexedDB databases`);
                actions.push(`Found ${databases.length} IndexedDB databases`);

                // Delete all PGlite/hominio databases to start fresh
                for (const db of databases) {
                    if (db.name && (
                        db.name === this.dbName ||
                        db.name === `/pglite/${this.dbName}` ||
                        db.name.includes('pglite') ||
                        db.name.includes('hominio')
                    )) {
                        this.addDebugInfo(`Deleting database: ${db.name}`);
                        actions.push(`Deleted database: ${db.name}`);
                        try {
                            await new Promise<void>((resolve, reject) => {
                                const request = indexedDB.deleteDatabase(db.name!);
                                request.onsuccess = () => resolve();
                                request.onerror = () => reject(new Error(`Failed to delete database: ${db.name}`));
                            });
                        } catch (e) {
                            this.addDebugInfo(`Error deleting database: ${e}`);
                            actions.push(`Error deleting database: ${e}`);
                        }
                    }
                }
            } catch (error) {
                this.addDebugInfo(`Error cleaning up databases: ${error}`);
                actions.push(`Error cleaning up databases: ${error}`);
            }
        }

        // Try to reinitialize
        try {
            this.addDebugInfo('Attempting to reinitialize storage');
            actions.push('Attempting reinitialization');

            // Reset attempt counter
            this.initAttempts = 0;

            // Try to initialize again
            await this.initialize();

            // Check if it worked
            const finalState = await this.checkDatabaseState();

            if (finalState.initialized &&
                (finalState.storageMode === 'native' || finalState.storageMode === 'indexeddb')) {

                this.addDebugInfo('Successfully fixed database issues');
                actions.push('Successfully fixed database issues');
                fixed = true;
            } else {
                this.addDebugInfo('Failed to fix database issues');
                actions.push('Failed to fix database issues');
            }

            return { fixed, actions, state: finalState };
        } catch (error) {
            this.addDebugInfo(`Error during repair: ${error}`);
            actions.push(`Error during repair: ${error}`);

            // Final state check
            const finalState = await this.checkDatabaseState();
            return { fixed: false, actions, state: finalState };
        }
    }

    /**
     * Force use of IndexedDB storage, bypassing Tauri detection
     * This can be useful for debugging or if there are persistent problems with Tauri
     */
    async forceIndexedDBMode(): Promise<void> {
        this.addDebugInfo('Forcing IndexedDB mode and bypassing Tauri detection');

        // Reset state
        this.initialized = false;
        this.initializing = false;
        this.tauriAvailable = false;
        this.dbPath = null;  // Clear the database path
        this.db = null;
        this.storageMode = 'not-initialized';
        this.initAttempts = 0;

        // Attempt initialization with IndexedDB only
        try {
            await this.initialize();
            this.addDebugInfo('Successfully forced IndexedDB mode');
        } catch (error) {
            this.addDebugInfo(`Failed to force IndexedDB mode: ${error}`);
            throw error;
        }
    }
}

// Create and export a singleton instance
export const loroPGLiteStorage = new LoroPGLiteStorage(); 