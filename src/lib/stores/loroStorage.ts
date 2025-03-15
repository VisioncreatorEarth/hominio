import type { LoroDoc, VersionVector } from 'loro-crdt';
import { loroPGLiteStorage } from './loroPGLiteStorage';

// Type definitions for versions and metadata
type LoroVersion = VersionVector;
type LoroMetadata = Record<string, unknown>;

// Type for snapshot saved callback
type SnapshotSavedCallback = (docId: string, loroDoc: LoroDoc, docType: string, meta: LoroMetadata) => void;

/**
 * LoroStorage - A storage adapter for Loro that uses PGlite
 * Provides persistent storage for Loro documents with version history
 */
export class LoroStorage {
    // Private array to store snapshot saved callbacks
    private _snapshotSavedCallbacks: SnapshotSavedCallback[] = [];

    constructor() {
        // console.log('LoroStorage initialized with PGlite backend');
    }

    /**
     * Register a callback to be called when a snapshot is saved
     * @param callback Function to call when a snapshot is saved
     */
    onSnapshotSaved(callback: SnapshotSavedCallback): void {
        this._snapshotSavedCallbacks.push(callback);
        // console.log('Snapshot saved callback registered');
    }

    /**
     * Save a Loro document snapshot
     * @param docId Unique identifier for the document
     * @param loroDoc The Loro document to save
     * @param docType Type of document for categorization
     * @param meta Optional metadata to store with the snapshot
     */
    async saveSnapshot(docId: string, loroDoc: LoroDoc, docType: string = 'default', meta: LoroMetadata = {}): Promise<void> {
        try {
            await loroPGLiteStorage.saveSnapshot(docId, loroDoc, docType, meta);
            // console.log(`Loro snapshot saved: ${docId}`);

            // Also store the current version for incremental updates
            // We store this in memory for now, but in a real application you'd want to persist this
            this._storeLastVersion(docId, loroDoc.version());

            // Notify callbacks
            this._notifySnapshotSaved(docId, loroDoc, docType, meta);
        } catch (error) {
            console.error('Error saving Loro snapshot:', error);
            throw error;
        }
    }

    /**
     * Notify all registered callbacks that a snapshot was saved
     */
    private _notifySnapshotSaved(docId: string, loroDoc: LoroDoc, docType: string, meta: LoroMetadata): void {
        // Call each registered callback
        for (const callback of this._snapshotSavedCallbacks) {
            try {
                callback(docId, loroDoc, docType, meta);
            } catch (error) {
                console.error('Error in snapshot saved callback:', error);
            }
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
            const loaded = await loroPGLiteStorage.loadSnapshot(docId, loroDoc);
            if (loaded) {
                // Store the version after loading for incremental updates
                this._storeLastVersion(docId, loroDoc.version());
                // console.log(`Loro snapshot loaded: ${docId}`);
            }
            return loaded;
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
    async listSnapshots(docId: string): Promise<Array<{
        id: string;
        docType: string;
        timestamp: number;
        meta: LoroMetadata;
    }>> {
        try {
            const snapshots = await loroPGLiteStorage.listSnapshots(docId);
            return snapshots.map(snapshot => ({
                id: snapshot.docId,
                docType: snapshot.docType,
                timestamp: snapshot.updatedAt.getTime(),
                meta: snapshot.meta
            }));
        } catch (error) {
            console.error('Error listing Loro snapshots:', error);
            return [];
        }
    }

    /**
     * Delete all snapshots for a document
     * @param docId Document ID to delete
     */
    async deleteAllSnapshots(docId: string): Promise<number> {
        try {
            return await loroPGLiteStorage.deleteSnapshot(docId);
        } catch (error) {
            console.error('Error deleting Loro snapshots:', error);
            return 0;
        }
    }

    /**
     * Get all document IDs in storage
     */
    async getAllDocumentIds(): Promise<string[]> {
        try {
            return await loroPGLiteStorage.getAllDocumentIds();
        } catch (error) {
            console.error('Error getting Loro document IDs:', error);
            return [];
        }
    }

    // Private map to store the last known version of each document
    private _lastVersions = new Map<string, LoroVersion>();

    // Store the last version for a document (for incremental updates)
    private _storeLastVersion(docId: string, version: LoroVersion): void {
        this._lastVersions.set(docId, version);
    }

    // Get the last version for a document
    private _getLastVersion(docId: string): LoroVersion | undefined {
        return this._lastVersions.get(docId);
    }
}

// Create and export a singleton instance
export const loroStorage = new LoroStorage(); 