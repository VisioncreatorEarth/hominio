import Dexie from 'dexie';
import type { LoroDoc } from 'loro-crdt';

/**
 * LoroDatabase - A Dexie wrapper for storing Loro document snapshots
 * Uses IndexedDB for efficient storage and retrieval
 */
class LoroDatabase extends Dexie {
    // Table definitions
    snapshots: Dexie.Table<ISnapshot, string>;

    constructor() {
        super('LoroStorage');

        // Define tables and indexes
        this.version(1).stores({
            snapshots: 'id, timestamp, docType'
        });

        // Type the tables
        this.snapshots = this.table('snapshots');
    }
}

// Interface for a snapshot entry
interface ISnapshot {
    id: string;           // Unique ID for the snapshot
    docType: string;      // Type of document (e.g., 'todos', 'notes')
    data: Uint8Array;     // The binary snapshot data
    timestamp: number;    // When the snapshot was created
    meta?: any;           // Optional metadata
}

/**
 * LoroStorage - A storage adapter for Loro that uses IndexedDB via Dexie
 * Provides persistent storage for Loro documents with version history
 */
export class LoroStorage {
    private db: LoroDatabase;

    constructor() {
        this.db = new LoroDatabase();
    }

    /**
     * Save a Loro document snapshot
     * @param docId Unique identifier for the document
     * @param loroDoc The Loro document to save
     * @param docType Type of document for categorization
     * @param meta Optional metadata to store with the snapshot
     */
    async saveSnapshot(docId: string, loroDoc: LoroDoc, docType: string = 'default', meta: any = {}): Promise<void> {
        try {
            // Export snapshot as binary data
            const bytes = loroDoc.export({ mode: 'snapshot' });

            // Create snapshot entry
            const snapshot: ISnapshot = {
                id: docId,
                docType,
                data: bytes,
                timestamp: Date.now(),
                meta
            };

            // Store in IndexedDB
            await this.db.snapshots.put(snapshot);
            console.log(`Loro snapshot saved to IndexedDB: ${docId}`);
        } catch (error) {
            console.error('Error saving Loro snapshot:', error);
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
        try {
            // Retrieve the latest snapshot for this document
            const snapshot = await this.db.snapshots
                .where('id')
                .equals(docId)
                .reverse()
                .first();

            if (snapshot) {
                // Import the snapshot into the Loro document
                loroDoc.import(snapshot.data);
                console.log(`Loro snapshot loaded from IndexedDB: ${docId}`);
                return true;
            }

            console.log(`No snapshot found for document: ${docId}`);
            return false;
        } catch (error) {
            console.error('Error loading Loro snapshot:', error);
            return false;
        }
    }

    /**
     * List all available snapshots for a document
     * @param docId Document ID to query
     * @returns Array of snapshots (without binary data)
     */
    async listSnapshots(docId: string): Promise<Array<Omit<ISnapshot, 'data'>>> {
        const snapshots = await this.db.snapshots
            .where('id')
            .equals(docId)
            .toArray();

        // Return without the binary data to avoid large payloads
        return snapshots.map(({ data, ...rest }) => rest);
    }

    /**
     * Delete all snapshots for a document
     * @param docId Document ID to delete
     */
    async deleteAllSnapshots(docId: string): Promise<number> {
        return await this.db.snapshots
            .where('id')
            .equals(docId)
            .delete();
    }

    /**
     * Get all document IDs in storage
     */
    async getAllDocumentIds(): Promise<string[]> {
        const uniqueIds = await this.db.snapshots
            .orderBy('id')
            .uniqueKeys();
        return uniqueIds as string[];
    }
}

// Create and export a singleton instance
export const loroStorage = new LoroStorage(); 