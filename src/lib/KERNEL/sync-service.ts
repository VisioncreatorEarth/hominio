import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { openDB, type IDBPDatabase } from 'idb';
import { documentService, type DocMetadata, type ContentItem } from './doc-state'; // Import types

// Constants
const DB_NAME = 'hominio-docs';
const DOCS_STORE = 'docs';
const CONTENT_STORE = 'content';

// Types
interface SyncStatus {
    isSyncing: boolean;
    lastSynced: Date | null;
    syncError: string | null;
    pendingLocalChanges: number;
}

// Create store for sync status
const status = writable<SyncStatus>({
    isSyncing: false,
    lastSynced: null,
    syncError: null,
    pendingLocalChanges: 0
});

// SyncService class for handling synchronization
class SyncService {
    private db: IDBPDatabase | null = null;
    private isSyncingToServer = false; // Flag to prevent concurrent server syncs
    private syncInterval: ReturnType<typeof setInterval> | null = null;

    // Expose the status store
    status = status;

    constructor() {
        if (browser) {
            this.initializeDB().then(() => {
                // Don't run initial sync on service start
                // No longer starting periodic sync

                // Update pending changes count
                this.updatePendingChangesCount();
            }).catch(err => {
                console.error('Failed to initialize sync service:', err);
                this.setSyncError('Failed to initialize sync service');
            });

            // No longer need event listeners for online/offline
        }
    }

    // Initialize IndexedDB
    private async initializeDB(): Promise<void> {
        if (!browser) {
            throw new Error('IndexedDB not supported in non-browser environment');
        }

        try {
            this.db = await openDB(DB_NAME, 1);
            console.log('Sync service connected to IndexedDB');
        } catch (err) {
            console.error('Error opening IndexedDB for sync service:', err);
            throw new Error('Could not open IndexedDB for sync service');
        }
    }

    // Ensure DB is initialized
    private async ensureDB(): Promise<IDBPDatabase> {
        if (!this.db) {
            await this.initializeDB();
            if (!this.db) {
                throw new Error('Failed to initialize database for sync service');
            }
        }
        return this.db;
    }

    // Set sync status
    private setSyncStatus(isSyncing: boolean) {
        status.update(s => ({ ...s, isSyncing }));
    }

    // Set last synced time
    private setLastSynced() {
        status.update(s => ({ ...s, lastSynced: new Date(), syncError: null }));
    }

    // Set sync error
    private setSyncError(error: string) {
        status.update(s => ({ ...s, syncError: error }));
    }

    // Load content from IndexedDB by CID (Needed for syncToServer)
    private async loadContentFromIndexDB(cid: string): Promise<Uint8Array | null> {
        try {
            const db = await this.ensureDB();
            const content = await db.get(CONTENT_STORE, cid) as ContentItem | undefined;
            return content?.data || null;
        } catch (err) {
            console.error(`Error loading content ${cid} from IndexedDB:`, err);
            throw new Error('Failed to load content data from local storage');
        }
    }

    // Update local document state after successful sync
    private async updateLocalDocStateAfterSync(pubKey: string, syncedSnapshotCid?: string, syncedUpdateCids?: string[]) {
        const db = await this.ensureDB();
        const tx = db.transaction(DOCS_STORE, 'readwrite');
        const store = tx.objectStore(DOCS_STORE);
        const doc = await store.get(pubKey);

        if (doc && doc.localState) {
            const newLocalState = { ...doc.localState };

            if (syncedSnapshotCid && newLocalState.snapshotCid === syncedSnapshotCid) {
                delete newLocalState.snapshotCid; // Clear synced snapshot
            }
            if (syncedUpdateCids && newLocalState.updateCids) {
                newLocalState.updateCids = newLocalState.updateCids.filter(
                    (cid: string) => !syncedUpdateCids.includes(cid) // Add explicit type
                );
            }

            // If localState is now empty, remove it entirely
            if (!newLocalState.snapshotCid && (!newLocalState.updateCids || newLocalState.updateCids.length === 0)) {
                delete doc.localState;
            } else {
                doc.localState = newLocalState;
            }

            await store.put(doc);
            console.log(`Updated local state for doc ${pubKey} after sync.`);
            await tx.done;
            this.updatePendingChangesCount(); // Update count after change
        } else {
            console.warn(`Could not find doc ${pubKey} or no localState to update after sync.`);
        }
    }

    // Update the count of pending local changes that need syncing to server
    private async updatePendingChangesCount() {
        try {
            const db = await this.ensureDB();
            const tx = db.transaction(DOCS_STORE, 'readonly');
            const store = tx.objectStore(DOCS_STORE);

            // Get all docs
            const docs = await store.getAll();

            // Count docs with localState changes
            const pendingChanges = docs.filter(doc =>
                doc.localState && (
                    doc.localState.snapshotCid ||
                    (doc.localState.updateCids && doc.localState.updateCids.length > 0)
                )
            ).length;

            // Update the status
            status.update(s => ({ ...s, pendingLocalChanges: pendingChanges }));
        } catch (err) {
            console.error('Error updating pending changes count:', err);
        }
    }

    // Renamed: Pull documents from server to local storage (formerly syncFromServer)
    async pullFromServer() {
        if (!browser) return;

        this.setSyncStatus(true);
        this.setSyncError(''); // Clear any previous errors
        console.log('Starting pull from server...');

        try {
            // Store the currently selected document ID if there is one
            let currentlySelectedDocPubKey: string | undefined;

            // Get the current selected doc's pubKey using store subscription
            documentService.selectedDoc.subscribe(doc => {
                currentlySelectedDocPubKey = doc?.pubKey;
            })();  // Execute and immediately unsubscribe

            // 1. Fetch all documents from server
            console.log('Fetching documents from server...');
            const response = await fetch('/api/docs');

            if (!response.ok) {
                throw new Error(`Failed to fetch documents: ${response.statusText}`);
            }

            const serverDocs = await response.json();
            console.log(`Retrieved ${serverDocs.length} documents from server`);

            // 2. Get local docs from IndexedDB for comparison
            const db = await this.ensureDB();
            const localDocs = await db.getAll(DOCS_STORE);

            // Track which documents were updated
            const updatedDocPubKeys: string[] = [];

            // 3. Sync each server document to local storage
            for (const serverDoc of serverDocs) {
                console.log(`Processing server document: ${serverDoc.pubKey}`);
                // Make sure ownerId is preserved from server, even when using fetch API
                if (serverDoc.ownerId) {
                    console.log(`Server document owner: ${serverDoc.ownerId}`);
                }

                const wasUpdated = await this.syncDocFromServer(serverDoc, localDocs);
                if (wasUpdated) {
                    updatedDocPubKeys.push(serverDoc.pubKey);
                    console.log(`Updated document ${serverDoc.pubKey}`);
                }
            }

            // 4. Get all updated docs from IndexedDB
            const allUpdatedDocs = await db.getAll(DOCS_STORE);

            // 5. Update document service docs store with all documents
            documentService.docs.set(allUpdatedDocs);
            console.log(`Updated document service with ${allUpdatedDocs.length} documents`);

            // 6. If the currently selected document was updated, refresh it in the selectedDoc store
            if (currentlySelectedDocPubKey && updatedDocPubKeys.includes(currentlySelectedDocPubKey)) {
                const updatedSelectedDoc = allUpdatedDocs.find(doc => doc.pubKey === currentlySelectedDocPubKey);
                if (updatedSelectedDoc) {
                    console.log(`Updating selected document ${currentlySelectedDocPubKey} with latest data`);
                    documentService.selectedDoc.set(updatedSelectedDoc);
                }
            }

            // 7. Set success status
            this.setLastSynced();
            console.log('Pull from server completed successfully');

            // 8. Update pending changes count
            this.updatePendingChangesCount();
        } catch (err) {
            console.error('Error during pull from server:', err);
            this.setSyncError(err instanceof Error ? err.message : 'Pull from server failed');
        } finally {
            this.setSyncStatus(false);
        }
    }

    // Sync a single document from server to local storage
    // Returns true if the document was updated, false if no changes were made
    private async syncDocFromServer(serverDoc: DocMetadata, localDocs: DocMetadata[]): Promise<boolean> {
        const db = await this.ensureDB();

        console.log(`Syncing document ${serverDoc.pubKey} from server to local storage`);

        // Log server document details for debugging
        console.log(`Server doc ownerId: ${serverDoc.ownerId}, snapshotCid: ${serverDoc.snapshotCid}`);
        console.log(`Server doc updateCids: ${serverDoc.updateCids?.length || 0} updates`);

        // Find matching local doc
        const localDoc = localDocs.find(doc => doc.pubKey === serverDoc.pubKey);
        if (localDoc) {
            console.log(`Found local doc with ownerId: ${localDoc.ownerId}`);
        }

        // If no matching local doc or local doc differs from server doc, update is needed
        const needsUpdate = !localDoc ||
            localDoc.ownerId !== serverDoc.ownerId ||  // Also check ownerId
            localDoc.snapshotCid !== serverDoc.snapshotCid ||
            JSON.stringify(localDoc.updateCids) !== JSON.stringify(serverDoc.updateCids);

        if (!needsUpdate) {
            console.log(`No update needed for document ${serverDoc.pubKey}`);
            return false;
        }

        // Prepare merged doc - start with server doc
        const mergedDoc: DocMetadata = { ...serverDoc };
        console.log(`Created merged doc with ownerId: ${mergedDoc.ownerId}`);

        // If local doc exists, preserve its localState
        if (localDoc && localDoc.localState) {
            mergedDoc.localState = { ...localDoc.localState };
            console.log(`Preserved localState from local doc`);

            // If server has the snapshot that's in localState, remove it from localState
            if (mergedDoc.snapshotCid === localDoc.localState.snapshotCid) {
                delete mergedDoc.localState.snapshotCid;
                console.log(`Removed matching snapshot from localState`);
            }

            // If server has all the updates, remove them from localState
            if (mergedDoc.updateCids && localDoc.localState.updateCids) {
                mergedDoc.localState.updateCids = localDoc.localState.updateCids.filter(
                    cid => !mergedDoc.updateCids?.includes(cid)
                );
                console.log(`Filtered updateCids in localState, ${mergedDoc.localState.updateCids.length} remaining`);
            }

            // If localState is now empty, remove it
            if (!mergedDoc.localState.snapshotCid &&
                (!mergedDoc.localState.updateCids || mergedDoc.localState.updateCids.length === 0)) {
                delete mergedDoc.localState;
                console.log(`Removed empty localState`);
            }
        }

        // Save merged doc to IndexedDB
        await db.put(DOCS_STORE, mergedDoc);
        console.log(`Saved merged doc to IndexedDB, ownerId: ${mergedDoc.ownerId}`);

        // Sync content if needed
        if (serverDoc.snapshotCid) {
            await this.syncContentFromServer(serverDoc.snapshotCid, 'snapshot', serverDoc.pubKey);
        }

        if (serverDoc.updateCids && serverDoc.updateCids.length > 0) {
            for (const updateCid of serverDoc.updateCids) {
                await this.syncContentFromServer(updateCid, 'update', serverDoc.pubKey);
            }
        }

        return true; // Document was updated
    }

    // Sync content (snapshot or update) from server to local storage
    private async syncContentFromServer(cid: string, type: 'snapshot' | 'update', docPubKey: string) {
        try {
            const db = await this.ensureDB();

            // Check if we already have this content
            const existingContent = await db.get(CONTENT_STORE, cid);
            if (existingContent) {
                // Already have this content, no need to fetch
                return;
            }

            // Fetch content from server
            const contentResponse = await fetch(`/api/content/${cid}`);

            if (!contentResponse.ok) {
                throw new Error(`Failed to fetch content ${cid}: ${contentResponse.statusText}`);
            }

            // Get binary content data
            const contentData = await contentResponse.arrayBuffer();

            // Create content item
            const contentItem: ContentItem = {
                cid,
                type,
                data: new Uint8Array(contentData),
                metadata: {
                    documentPubKey: docPubKey
                },
                createdAt: new Date().toISOString()
            };

            // Save to IndexedDB
            await db.put(CONTENT_STORE, contentItem);

            console.log(`Synced ${type} content ${cid} for document ${docPubKey}`);
        } catch (err) {
            console.error(`Error syncing content ${cid}:`, err);
            // We don't throw here to allow other content to sync
        }
    }

    // Get list of documents that have local changes needing to be synced to server
    async getDocumentsForServerSync(): Promise<DocMetadata[]> {
        try {
            const db = await this.ensureDB();
            const allDocs = await db.getAll(DOCS_STORE);

            // Filter to docs with localState changes
            return allDocs.filter(doc =>
                doc.localState && (
                    doc.localState.snapshotCid ||
                    (doc.localState.updateCids && doc.localState.updateCids.length > 0)
                )
            );
        } catch (err) {
            console.error('Error getting documents for server sync:', err);
            return [];
        }
    }

    // Push local changes to server (formerly syncToServer)
    async pushToServer() {
        if (!browser) return;

        this.setSyncStatus(true);
        this.setSyncError(''); // Clear previous errors
        console.log('Starting push to server...');

        try {
            // Get documents that need syncing
            const localDocsToSync = await this.getDocumentsForServerSync();

            if (localDocsToSync.length === 0) {
                console.log('No local changes to push to server.');
                return;
            }

            console.log(`Found ${localDocsToSync.length} documents with local changes to push.`);

            // Load all docs once at the beginning
            const db = await this.ensureDB();

            for (const doc of localDocsToSync) {
                console.log(`Attempting to push doc ${doc.pubKey} to server...`);
                let success = false;
                let needsSave = false;

                try {
                    // Always get the latest version of the document from IndexedDB
                    // to ensure we have the most up-to-date localState
                    const freshDoc = await db.get(DOCS_STORE, doc.pubKey);
                    if (!freshDoc || !freshDoc.localState) {
                        console.log(`No local changes found for ${doc.pubKey}, skipping.`);
                        continue;
                    }

                    // Replace our working copy with the fresh version
                    Object.assign(doc, freshDoc);

                    // Check if document exists on server to determine if it's new
                    let docExistsOnServer = false;

                    try {
                        // Check if doc exists using fetch API to avoid Eden Treaty type issues
                        const response = await fetch(`/api/docs/${doc.pubKey}`);
                        docExistsOnServer = response.ok;
                    } catch {
                        docExistsOnServer = false;
                    }

                    // Prioritize syncing snapshot if it exists in localState
                    if (doc.localState?.snapshotCid) {
                        const snapshotCid = doc.localState.snapshotCid;
                        console.log(`  - Pushing local snapshot ${snapshotCid}...`);
                        const snapshotData = await this.loadContentFromIndexDB(snapshotCid);

                        if (snapshotData) {
                            if (!docExistsOnServer) {
                                // Create new document
                                try {
                                    const response = await fetch('/api/docs', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            pubKey: doc.pubKey,
                                            binarySnapshot: Array.from(snapshotData),
                                            title: doc.title,
                                            description: doc.description
                                        })
                                    });

                                    if (response.ok) {
                                        // Update main document with server snapshot
                                        doc.snapshotCid = snapshotCid;

                                        // IMPORTANT: Clear from localState - directly modify the object
                                        if (doc.localState) {
                                            delete doc.localState.snapshotCid;
                                            // Clean up empty localState
                                            if (!doc.localState.updateCids || doc.localState.updateCids.length === 0) {
                                                delete doc.localState;
                                            }
                                        }

                                        needsSave = true;
                                        success = true;
                                    } else {
                                        const errorText = await response.text();
                                        if (errorText.includes('duplicate key')) {
                                            docExistsOnServer = true;
                                        } else {
                                            throw new Error(`Server error: ${errorText}`);
                                        }
                                    }
                                } catch (error) {
                                    if (error instanceof Error && error.message.includes('duplicate key')) {
                                        docExistsOnServer = true;
                                    } else {
                                        throw error;
                                    }
                                }
                            }

                            // If doc exists on server, update snapshot
                            if (docExistsOnServer) {
                                try {
                                    // Check if content exists
                                    const contentResponse = await fetch(`/api/content/${snapshotCid}`);

                                    if (!contentResponse.ok) {
                                        // Upload the snapshot
                                        const response = await fetch(`/api/docs/${doc.pubKey}/snapshot`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                binarySnapshot: Array.from(snapshotData)
                                            })
                                        });

                                        if (!response.ok) {
                                            const errorText = await response.text();
                                            if (!errorText.includes('duplicate key')) {
                                                throw new Error(`Failed to update snapshot: ${errorText}`);
                                            }
                                        }
                                    }

                                    // Whether we just uploaded it or it already existed, update the document
                                    doc.snapshotCid = snapshotCid;

                                    // IMPORTANT: Clear from localState - directly modify the object
                                    if (doc.localState) {
                                        delete doc.localState.snapshotCid;
                                        // Clean up empty localState
                                        if (!doc.localState.updateCids || doc.localState.updateCids.length === 0) {
                                            delete doc.localState;
                                        }
                                    }

                                    needsSave = true;
                                    success = true;
                                } catch (error) {
                                    if (error instanceof Error && error.message.includes('duplicate key')) {
                                        // Already exists, so we can consider it successful
                                        doc.snapshotCid = snapshotCid;

                                        // IMPORTANT: Clear from localState - directly modify the object
                                        if (doc.localState) {
                                            delete doc.localState.snapshotCid;
                                            // Clean up empty localState
                                            if (!doc.localState.updateCids || doc.localState.updateCids.length === 0) {
                                                delete doc.localState;
                                            }
                                        }

                                        needsSave = true;
                                        success = true;
                                    } else {
                                        throw error;
                                    }
                                }
                            }
                        }
                    }

                    // Handle updates
                    if ((success || !doc.localState?.snapshotCid) && doc.localState?.updateCids && doc.localState.updateCids.length > 0) {
                        const updateCids = [...doc.localState.updateCids];
                        console.log(`  - Pushing ${updateCids.length} individual updates for ${doc.pubKey}...`);

                        const successfulUpdateCids: string[] = [];

                        for (const updateCid of updateCids) {
                            try {
                                const updateData = await this.loadContentFromIndexDB(updateCid);

                                if (!updateData) {
                                    console.warn(`  - Could not load update data for CID ${updateCid}, skipping`);
                                    continue;
                                }

                                // Check if content exists
                                let contentExists = false;
                                try {
                                    const contentResponse = await fetch(`/api/content/${updateCid}`);
                                    contentExists = contentResponse.ok;
                                } catch {
                                    contentExists = false;
                                }

                                if (!contentExists) {
                                    // Upload the update
                                    const response = await fetch(`/api/docs/${doc.pubKey}/update`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            binaryUpdate: Array.from(updateData)
                                        })
                                    });

                                    if (!response.ok) {
                                        const errorText = await response.text();
                                        if (!errorText.includes('duplicate key')) {
                                            console.error(`  - Failed to push update ${updateCid}: ${errorText}`);
                                            continue;
                                        }
                                    }
                                }

                                // Whether we just uploaded it or it already existed, add to successful list
                                if (!doc.updateCids) {
                                    doc.updateCids = [];
                                }
                                if (!doc.updateCids.includes(updateCid)) {
                                    doc.updateCids.push(updateCid);
                                }

                                successfulUpdateCids.push(updateCid);

                            } catch (err) {
                                console.error(`  - Error pushing update ${updateCid}:`, err);
                            }
                        }

                        // IMPORTANT: Remove successful updates from localState
                        if (successfulUpdateCids.length > 0 && doc.localState) {
                            doc.localState.updateCids = doc.localState.updateCids.filter(
                                cid => !successfulUpdateCids.includes(cid)
                            );

                            // Clean up empty localState
                            if ((!doc.localState.snapshotCid || !doc.localState.snapshotCid.length) &&
                                (!doc.localState.updateCids || doc.localState.updateCids.length === 0)) {
                                delete doc.localState;
                            }

                            needsSave = true;
                            success = true;
                        }
                    }

                    // Save document if needed
                    if (needsSave) {
                        await db.put(DOCS_STORE, doc);
                        console.log(`  - Updated document ${doc.pubKey} in IndexedDB.`);

                        // Update docs store to reflect changes
                        const allDocs = await db.getAll(DOCS_STORE);
                        documentService.docs.set(allDocs);
                    }

                } catch (syncError) {
                    console.error(`Error pushing doc ${doc.pubKey} to server:`, syncError);
                    this.setSyncError(`Failed to push ${doc.pubKey}: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`);
                }
            }

            // Update pending changes count at the end
            this.updatePendingChangesCount();

            console.log('Push to server finished.');

        } catch (err) {
            console.error('Error during push to server process:', err);
            this.setSyncError(err instanceof Error ? err.message : 'Push to server failed');
        } finally {
            this.setSyncStatus(false);
        }
    }

    // Clean up resources
    destroy() {
        // No need to stop periodic sync or remove event listeners since they don't exist anymore
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Create and export singleton instance
export const syncService = new SyncService();