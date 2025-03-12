import { PGlite } from '@electric-sql/pglite';
import type { LoroDoc, VersionVector } from 'loro-crdt';
import * as tauriFS from '$lib/utils/tauriFS';

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
    private dbName = 'loro_storage';
    private dbPath: string | null = null;
    private storageMode: 'native' | 'indexeddb' | 'not-initialized' = 'not-initialized';

    constructor() {
        // Initialize database on first use
    }

    /**
     * Get the current storage mode
     * @returns The storage mode ('native', 'indexeddb', or 'not-initialized')
     */
    getStorageMode(): 'native' | 'indexeddb' | 'not-initialized' {
        return this.storageMode;
    }

    /**
     * Get the database path (only available in native mode)
     * @returns The database path or null if not using native filesystem
     */
    getDbPath(): string | null {
        return this.dbPath;
    }

    /**
     * Initialize the database connection and schema
     */
    private async ensureInitialized(): Promise<void> {
        if (this.initialized) return;

        try {
            // Determine if we're running in Tauri to use native filesystem
            if (tauriFS.isTauri()) {
                // Use native filesystem for Tauri mode
                console.log("Running in Tauri mode - using native filesystem for PGlite");

                // Get app data directory path
                const appDataDirPath = await tauriFS.getAppDataDir();
                const hominioDirPath = `${appDataDirPath}hominio`;

                // Ensure the directory exists
                const dirExists = await tauriFS.exists(hominioDirPath);
                if (!dirExists) {
                    await tauriFS.createDir(hominioDirPath, { recursive: true });
                    console.log(`Created hominio directory at ${hominioDirPath}`);
                }

                // Set the database file path 
                this.dbPath = `${hominioDirPath}/${this.dbName}.db`;
                console.log(`Using native filesystem for PGlite at: ${this.dbPath}`);

                // Initialize PGlite with file:// protocol for native filesystem
                this.db = new PGlite(`file://${this.dbPath}`);
                this.storageMode = 'native';
            } else {
                // Use IndexedDB for browser mode
                console.log("Running in browser mode - using IndexedDB for PGlite");
                this.db = new PGlite(`idb://${this.dbName}`);
                this.storageMode = 'indexeddb';
            }

            // Create schema if it doesn't exist
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

            this.initialized = true;
            console.log('LoroPGLiteStorage initialized successfully');
        } catch (error) {
            console.error('Failed to initialize LoroPGLiteStorage:', error);
            throw error;
        }
    }

    /**
     * Save a Loro document snapshot
     * @param docId Unique identifier for the document
     * @param loroDoc The Loro document to save
     * @param docType Type of document for categorization
     * @param meta Optional metadata to store with the snapshot
     */
    async saveSnapshot(docId: string, loroDoc: LoroDoc, docType: string = 'default', meta: LoroMetadata = {}): Promise<void> {
        await this.ensureInitialized();

        try {
            // Get the current timestamp
            const now = new Date();

            // Export snapshot as binary data
            const snapshot = loroDoc.export({ mode: 'snapshot' });

            // Convert to buffer for storage and version to string
            const version = JSON.stringify(loroDoc.version());

            // Store the snapshot with upsert pattern
            await this.db!.query(
                `INSERT INTO loro_snapshots (doc_id, doc_type, data, version, meta, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (doc_id) 
         DO UPDATE SET data = $3, version = $4, meta = $5, updated_at = $6`,
                [docId, docType, snapshot, version, JSON.stringify(meta), now]
            );

            console.log(`Loro snapshot saved to PGlite: ${docId}`);
        } catch (error) {
            console.error('Error saving Loro snapshot to PGlite:', error);
            throw error;
        }
    }

    /**
     * Save an incremental update for a document
     * @param docId Unique identifier for the document
     * @param loroDoc The Loro document with updates
     * @param fromVersion The version to generate updates from
     * @returns The new version after the update
     */
    async saveUpdate(docId: string, loroDoc: LoroDoc, fromVersion: LoroVersion): Promise<string> {
        await this.ensureInitialized();

        try {
            // Generate an update ID
            const updateId = crypto.randomUUID();

            // Export incremental update - properly handle the type 
            // The LoroDoc.export method expects a VersionVector for the 'from' parameter
            const updateData = loroDoc.export({ mode: 'update', from: fromVersion });

            // Current version after the update
            const toVersion = JSON.stringify(loroDoc.version());
            const fromVersionStr = JSON.stringify(fromVersion);

            // Store the update
            await this.db!.query(
                `INSERT INTO loro_updates (update_id, doc_id, data, from_version, to_version)
         VALUES ($1, $2, $3, $4, $5)`,
                [updateId, docId, updateData, fromVersionStr, toVersion]
            );

            console.log(`Loro update saved to PGlite: ${docId} (${updateId})`);

            return toVersion;
        } catch (error) {
            console.error('Error saving Loro update to PGlite:', error);
            throw error;
        }
    }

    /**
     * Load a Loro document snapshot
     * @param docId Unique identifier for the document
     * @param loroDoc The Loro document to load into
     * @returns true if snapshot was found and loaded, false otherwise
     */
    async loadSnapshot(docId: string, loroDoc: LoroDoc): Promise<boolean> {
        await this.ensureInitialized();

        try {
            // Query for the snapshot
            const result = await this.db!.query<PGResultRow>(
                'SELECT data FROM loro_snapshots WHERE doc_id = $1',
                [docId]
            );

            if (result.rows.length === 0) {
                console.log(`No snapshot found for document: ${docId}`);
                return false;
            }

            // Get the binary data and import into Loro doc
            const snapshotData = result.rows[0].data;
            loroDoc.import(snapshotData);

            console.log(`Loro snapshot loaded from PGlite: ${docId}`);
            return true;
        } catch (error) {
            console.error('Error loading Loro snapshot from PGlite:', error);
            return false;
        }
    }

    /**
     * Load incremental updates for a document
     * @param docId Unique identifier for the document
     * @param loroDoc The Loro document to apply updates to
     * @param fromVersion The version to start loading updates from
     * @returns true if any updates were loaded, false otherwise
     */
    async loadUpdates(docId: string, loroDoc: LoroDoc, fromVersion: LoroVersion): Promise<boolean> {
        await this.ensureInitialized();

        try {
            const fromVersionStr = JSON.stringify(fromVersion);

            // Query for updates since fromVersion
            const result = await this.db!.query<PGResultRow>(
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

            console.log(`${result.rows.length} Loro updates loaded from PGlite for ${docId}`);
            return true;
        } catch (error) {
            console.error('Error loading Loro updates from PGlite:', error);
            return false;
        }
    }

    /**
     * List all available snapshots, optionally filtered by document type
     * @param docType Optional document type to filter by
     * @returns Array of document IDs and metadata
     */
    async listSnapshots(docId?: string, docType?: string): Promise<Array<{
        docId: string;
        docType: string;
        updatedAt: Date;
        meta: LoroMetadata;
    }>> {
        await this.ensureInitialized();

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

            const result = await this.db!.query<PGResultRow>(query, params);

            return result.rows.map(row => ({
                docId: row.doc_id,
                docType: row.doc_type,
                updatedAt: row.updated_at,
                meta: JSON.parse(row.meta || '{}')
            }));
        } catch (error) {
            console.error('Error listing Loro snapshots from PGlite:', error);
            return [];
        }
    }

    /**
     * Delete all snapshots for a document (and its updates due to foreign key)
     * @param docId Document ID to delete
     * @returns Number of snapshots deleted
     */
    async deleteSnapshot(docId: string): Promise<number> {
        await this.ensureInitialized();

        try {
            const result = await this.db!.query<PGResultRow>(
                'DELETE FROM loro_snapshots WHERE doc_id = $1 RETURNING doc_id',
                [docId]
            );

            console.log(`Deleted ${result.rows.length} snapshots for document ${docId}`);
            return result.rows.length;
        } catch (error) {
            console.error('Error deleting Loro snapshot from PGlite:', error);
            return 0;
        }
    }

    /**
     * Delete all snapshots
     * @returns Number of snapshots deleted
     */
    async deleteAllSnapshots(): Promise<number> {
        await this.ensureInitialized();

        try {
            const result = await this.db!.query<PGResultRow>(
                'DELETE FROM loro_snapshots RETURNING doc_id'
            );

            console.log(`Deleted all ${result.rows.length} snapshots`);
            return result.rows.length;
        } catch (error) {
            console.error('Error deleting all Loro snapshots from PGlite:', error);
            return 0;
        }
    }

    /**
     * Get all document IDs in storage
     * @returns Array of document IDs
     */
    async getAllDocumentIds(): Promise<string[]> {
        await this.ensureInitialized();

        try {
            const result = await this.db!.query<PGResultRow>(
                'SELECT DISTINCT doc_id FROM loro_snapshots ORDER BY doc_id'
            );

            return result.rows.map(row => row.doc_id);
        } catch (error) {
            console.error('Error getting document IDs from PGlite:', error);
            return [];
        }
    }
}

// Create and export a singleton instance
export const loroPGLiteStorage = new LoroPGLiteStorage(); 