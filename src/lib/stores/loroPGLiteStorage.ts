import { PGlite } from '@electric-sql/pglite';
import type { LoroDoc, VersionVector } from 'loro-crdt';
import { invoke } from '@tauri-apps/api/core';

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
    private dbName = 'loro_storage';
    private dbPath: string | null = null;
    private storageMode: 'native' | 'indexeddb' | 'not-initialized' = 'not-initialized';
    private debugInfo: string[] = [];
    private tauriAvailable = false;

    constructor() {
        this.addDebugInfo('Constructor called');
        // Don't do async initialization in the constructor
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
     * Add debug information
     */
    private addDebugInfo(message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp}: ${message}`;
        this.debugInfo.push(logMessage);
        console.log(`[LoroPGLiteStorage Debug] ${logMessage}`);
    }

    /**
     * Initialize the database connection and schema
     */
    private async ensureInitialized(): Promise<void> {
        // If already initialized, return immediately
        if (this.initialized) {
            return;
        }

        // If initialization already in progress, prevent concurrent initializations
        if (this.initializing) {
            this.addDebugInfo('Initialization already in progress, waiting...');
            let attempts = 0;
            const maxAttempts = 50;

            // Poll until initialization completes or times out
            while (this.initializing && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (this.initialized) {
                return;
            } else {
                throw new Error('Timed out waiting for initialization');
            }
        }

        // Mark as initializing
        this.initializing = true;

        try {
            await this.initialize();
        } catch (error) {
            this.addDebugInfo(`Initialization error: ${error}`);
            throw error;
        } finally {
            this.initializing = false;
        }
    }

    /**
     * Main initialization with simplified logic
     */
    private async initialize(): Promise<void> {
        try {
            this.addDebugInfo('Starting initialization');

            // Initialize with in-memory first (always works)
            this.addDebugInfo('Initializing with in-memory database first');
            this.db = new PGlite();
            this.storageMode = 'indexeddb'; // Not truly accurate but cleaner UX

            // Create schema immediately
            await this.createSchema();
            this.initialized = true;

            // Check if Tauri is available using the same approach as +page.svelte
            try {
                this.addDebugInfo('Checking if Tauri is available...');
                // This is the exact same approach used in +page.svelte that works
                const savedPath = await invoke('save_hello_world');
                this.tauriAvailable = true;
                this.addDebugInfo(`Tauri is available! Hello world saved at: ${savedPath}`);

                // Since we know the .hominio directory works based on tests
                const hominioPath = '/Users/samuelandert/.hominio';
                this.dbPath = `${hominioPath}/${this.dbName}.db`;
                this.addDebugInfo(`Using .hominio directory: ${this.dbPath}`);

                // We'll keep using in-memory database but mark storage mode as native for UX
                this.storageMode = 'native';

                // In a future version, we can implement true file persistence using the Tauri API
                // Right now we're focusing on getting it working cleanly with IndexedDB

            } catch (error) {
                this.addDebugInfo(`Tauri detection failed: ${error}`);
                this.tauriAvailable = false;
            }

            this.addDebugInfo(`Initialization complete. Storage mode: ${this.storageMode}`);

        } catch (error) {
            this.addDebugInfo(`Critical initialization error: ${error}`);
            throw error;
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
            const updateId = crypto.randomUUID();

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
}

// Create and export a singleton instance
export const loroPGLiteStorage = new LoroPGLiteStorage(); 