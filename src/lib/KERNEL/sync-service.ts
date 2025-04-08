import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { openDB, type IDBPDatabase } from 'idb';
import { hominio } from '$lib/client/hominio';

// Types
interface ContentItem {
    cid: string;
    type: string;
    data: Uint8Array;
    metadata?: Record<string, unknown>;
    createdAt: string;
}

// Constants
const DB_NAME = 'hominio-docs';
const DB_VERSION = 1;
const DOCS_STORE = 'docs';
const CONTENT_STORE = 'content';

// Status store for sync operations
const syncStatus = writable({
    isSyncing: false,
    lastSyncTime: null as Date | null,
    error: null as string | null,
    progress: {
        total: 0,
        current: 0
    }
});

/**
 * Sync Service - Handles synchronization between server and local IndexedDB
 */
class SyncService {
    private db: IDBPDatabase | null = null;

    // Expose status store
    status = syncStatus;

    constructor() {
        if (browser) {
            this.initializeDB().then(() => {
                // Auto-sync on initialization
                this.pullAllDocsFromServer().catch(err => {
                    console.error('Error in initial sync:', err);
                });
            }).catch(err => {
                console.error('Failed to initialize IndexedDB in SyncService:', err);
                this.setError('Failed to initialize database connection');
            });
        }
    }

    /**
     * Initialize IndexedDB for sync operations
     */
    private async initializeDB(): Promise<void> {
        if (!browser) {
            throw new Error('IndexedDB not supported in non-browser environment');
        }

        try {
            this.db = await openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    // Create document store if it doesn't exist
                    if (!db.objectStoreNames.contains(DOCS_STORE)) {
                        const docStore = db.createObjectStore(DOCS_STORE, { keyPath: 'pubKey' });
                        docStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }

                    // Create content store if it doesn't exist
                    if (!db.objectStoreNames.contains(CONTENT_STORE)) {
                        const contentStore = db.createObjectStore(CONTENT_STORE, { keyPath: 'cid' });
                        contentStore.createIndex('type', 'type', { unique: false });
                    }
                }
            });

            console.log('IndexedDB opened successfully in SyncService');
        } catch (err) {
            console.error('Error opening IndexedDB in SyncService:', err);
            throw new Error('Could not open IndexedDB for sync operations');
        }
    }

    /**
     * Ensure DB is initialized
     */
    private async ensureDB(): Promise<IDBPDatabase> {
        if (!this.db) {
            await this.initializeDB();
            if (!this.db) {
                throw new Error('Failed to initialize database');
            }
        }
        return this.db;
    }

    /**
     * Set error message in status
     */
    private setError(message: string | null) {
        syncStatus.update(s => ({ ...s, error: message }));
    }

    /**
     * Pull all documents from server and save to IndexedDB
     * This overwrites any existing documents with the same pubKey
     */
    async pullAllDocsFromServer(): Promise<boolean> {
        // Update sync status
        syncStatus.update(s => ({
            ...s,
            isSyncing: true,
            error: null,
            progress: { total: 0, current: 0 }
        }));

        try {
            // Get all documents from server
            console.log('Fetching documents from server...');
            const response = await hominio.api.docs[''].get();

            if (!response.data || !Array.isArray(response.data)) {
                throw new Error('Invalid response from server: No document data returned');
            }

            const serverDocs = response.data;
            console.log(`Retrieved ${serverDocs.length} documents from server`);

            // Update progress info
            syncStatus.update(s => ({
                ...s,
                progress: { total: serverDocs.length, current: 0 }
            }));

            // Get database connection
            const db = await this.ensureDB();

            // Process each document
            for (let i = 0; i < serverDocs.length; i++) {
                const doc = serverDocs[i];

                // Update progress
                syncStatus.update(s => ({
                    ...s,
                    progress: { ...s.progress, current: i + 1 }
                }));

                // Save document metadata to IndexedDB
                await db.put(DOCS_STORE, doc);

                // If document has a snapshot, fetch and save the binary data
                if (doc.snapshotCid) {
                    try {
                        // Fetch binary content for this document
                        const contentResponse = await hominio.api.content[doc.snapshotCid].binary.get();

                        if (contentResponse.data?.binaryData) {
                            // Convert array to Uint8Array
                            const binaryData = new Uint8Array(contentResponse.data.binaryData);

                            // Get metadata if available
                            const metadataResponse = await hominio.api.content[doc.snapshotCid].get();
                            const metadata = metadataResponse.data?.metadata || {};

                            // Save content to IndexedDB
                            const contentItem: ContentItem = {
                                cid: doc.snapshotCid,
                                type: 'snapshot',
                                data: binaryData,
                                metadata: { ...metadata, documentPubKey: doc.pubKey },
                                createdAt: new Date().toISOString()
                            };

                            await db.put(CONTENT_STORE, contentItem);

                            console.log(`Saved content data for document ${doc.pubKey}`);
                        }
                    } catch (error) {
                        console.error(`Error fetching content data for document ${doc.pubKey}:`, error);
                        // Continue with next document even if content fetch fails
                    }
                }

                // If document has updates, fetch and save them too
                if (doc.updateCids && doc.updateCids.length > 0) {
                    for (const updateCid of doc.updateCids) {
                        try {
                            // Fetch binary update data
                            const updateResponse = await hominio.api.content[updateCid].binary.get();

                            if (updateResponse.data?.binaryData) {
                                // Convert array to Uint8Array
                                const binaryData = new Uint8Array(updateResponse.data.binaryData);

                                // Save update to content store
                                const contentItem: ContentItem = {
                                    cid: updateCid,
                                    type: 'update',
                                    data: binaryData,
                                    metadata: { documentPubKey: doc.pubKey },
                                    createdAt: new Date().toISOString()
                                };

                                await db.put(CONTENT_STORE, contentItem);
                                console.log(`Saved update ${updateCid} for document ${doc.pubKey}`);
                            }
                        } catch (error) {
                            console.error(`Error fetching update ${updateCid} for document ${doc.pubKey}:`, error);
                            // Continue with next update
                        }
                    }
                }
            }

            // Update status with success
            const now = new Date();
            syncStatus.update(s => ({
                ...s,
                isSyncing: false,
                lastSyncTime: now,
                error: null
            }));

            console.log(`Successfully synced ${serverDocs.length} documents from server`);
            return true;
        } catch (error) {
            console.error('Error syncing documents from server:', error);

            // Update status with error
            syncStatus.update(s => ({
                ...s,
                isSyncing: false,
                error: error instanceof Error ? error.message : 'Unknown error syncing documents'
            }));

            return false;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Create and export a singleton instance
export const syncService = new SyncService(); 