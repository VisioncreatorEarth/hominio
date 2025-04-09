import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { openDB, type IDBPDatabase } from 'idb';
import { documentService, type DocMetadata, type ContentItem } from './doc-state'; // Import types
import { hominio } from '$lib/client/hominio';

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

// Helper types for Eden Treaty responses
type ApiResponse<T> = {
    data: T;
    error: null | { message: string };
};

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

    // Batch load content from IndexedDB by CIDs
    private async batchLoadContentFromIndexDB(cids: string[]): Promise<Map<string, Uint8Array>> {
        try {
            const db = await this.ensureDB();
            const contentMap = new Map<string, Uint8Array>();

            // Get all content items in one transaction
            const tx = db.transaction(CONTENT_STORE, 'readonly');
            const store = tx.objectStore(CONTENT_STORE);

            // Create promises for all gets
            const promises = cids.map(async cid => {
                const content = await store.get(cid) as ContentItem | undefined;
                if (content?.data) {
                    contentMap.set(cid, content.data);
                }
            });

            // Wait for all gets to complete
            await Promise.all(promises);
            await tx.done;

            return contentMap;
        } catch (err) {
            console.error(`Error batch loading content from IndexedDB:`, err);
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

    // Check which content CIDs exist on the server (batch operation)
    private async checkContentExistenceBatch(cids: string[]): Promise<Set<string>> {
        if (!cids.length) return new Set();

        try {
            // Using Eden Treaty with type assertion for batch existence check
            const response = await (hominio.api.content.batch.exists as any).post({
                cids
            }) as ApiResponse<{ results: Array<{ cid: string, exists: boolean }> }>;

            if (response.error) {
                throw new Error(`Failed to check content existence: ${response.error.message}`);
            }

            // Create a set of existing CIDs
            const existingCids = new Set<string>();
            for (const result of response.data.results) {
                if (result.exists) {
                    existingCids.add(result.cid);
                }
            }

            return existingCids;
        } catch (error) {
            console.error('Error checking content existence:', error);
            throw error;
        }
    }

    // Upload content to server in batch
    private async uploadContentBatch(items: Array<{
        cid: string,
        type: string,
        binaryData: Uint8Array,
        metadata?: Record<string, unknown>
    }>): Promise<number> {
        if (!items.length) return 0;

        try {
            // Format items for API
            const formattedItems = items.map(item => ({
                cid: item.cid,
                type: item.type,
                binaryData: Array.from(item.binaryData),
                metadata: item.metadata || {}
            }));

            // Using Eden Treaty with type assertion for batch upload
            const response = await (hominio.api.content.batch.upload as any).post({
                items: formattedItems
            }) as ApiResponse<{ success: boolean, uploaded: number, total: number }>;

            if (response.error) {
                throw new Error(`Failed to upload content batch: ${response.error.message}`);
            }

            return response.data.uploaded;
        } catch (error) {
            console.error('Error uploading content batch:', error);
            throw error;
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

            // 1. Fetch all documents from server using Eden Treaty
            console.log('Fetching documents from server...');

            // Using Eden Treaty with proper error handling and type assertions
            const result = await (hominio.api.docs.list as any).get() as ApiResponse<DocMetadata[]>;

            if (result.error) {
                throw new Error(`Failed to fetch documents: ${result.error.message}`);
            }

            const serverDocs = result.data;
            console.log(`Retrieved ${serverDocs.length} documents from server`);

            // 2. Get local docs from IndexedDB for comparison
            const db = await this.ensureDB();
            const localDocs = await db.getAll(DOCS_STORE);

            // Track which documents were updated
            const updatedDocPubKeys: string[] = [];

            // Keep track of old update CIDs that might need cleanup
            const oldUpdateCids = new Set<string>();

            // Keep track of all update CIDs still referenced by docs
            const stillReferencedCids = new Set<string>();

            // Add all local update CIDs to the old list for potential cleanup
            for (const doc of localDocs) {
                // Add server update CIDs to still referenced list since we'll keep them
                if (doc.updateCids) {
                    for (const cid of doc.updateCids) {
                        oldUpdateCids.add(cid);
                    }
                }

                // Also add local update CIDs to the old list for potential cleanup
                if (doc.localState?.updateCids) {
                    for (const cid of doc.localState.updateCids) {
                        oldUpdateCids.add(cid);
                    }
                }
            }

            // 3. Sync each server document to local storage
            for (const serverDoc of serverDocs) {
                console.log(`Processing server document: ${serverDoc.pubKey}`);
                // Make sure ownerId is preserved from server, even when using fetch API
                if (serverDoc.ownerId) {
                    console.log(`Server document owner: ${serverDoc.ownerId}`);
                }

                // Clear the update list in local state if the server has no updates
                // This handles the case where a snapshot was created and updates cleared on the server
                const localDoc = localDocs.find(doc => doc.pubKey === serverDoc.pubKey);
                if (localDoc &&
                    (!serverDoc.updateCids || serverDoc.updateCids.length === 0) &&
                    localDoc.localState?.updateCids &&
                    localDoc.localState.updateCids.length > 0) {

                    console.log(`Server has no updates for ${serverDoc.pubKey}, this may be due to a snapshot creation`);

                    // Since server has no updates, this implies they were consolidated into a snapshot
                    // We'll verify the snapshot CID has changed
                    if (serverDoc.snapshotCid !== localDoc.snapshotCid) {
                        console.log(`Server has a new snapshot ${serverDoc.snapshotCid}, clearing local updates`);

                        // Keep other localState properties but clear updateCids
                        if (localDoc.localState) {
                            localDoc.localState.updateCids = [];

                            // If localState is now empty, remove it entirely
                            if (!localDoc.localState.snapshotCid && localDoc.localState.updateCids.length === 0) {
                                delete localDoc.localState;
                            }

                            // Save the modified local doc
                            await db.put(DOCS_STORE, localDoc);
                        }
                    }
                }

                const wasUpdated = await this.syncDocFromServer(serverDoc, localDocs);
                if (wasUpdated) {
                    updatedDocPubKeys.push(serverDoc.pubKey);
                    console.log(`Updated document ${serverDoc.pubKey}`);
                }

                // Add server document update CIDs to the still referenced list
                if (serverDoc.updateCids) {
                    for (const cid of serverDoc.updateCids) {
                        stillReferencedCids.add(cid);
                    }
                }
            }

            // 4. Get all updated docs from IndexedDB
            const allUpdatedDocs = await db.getAll(DOCS_STORE);

            // Add any remaining local update CIDs to the still referenced list
            for (const doc of allUpdatedDocs) {
                // Add any remaining local updateCids to the still referenced list
                if (doc.localState?.updateCids) {
                    for (const cid of doc.localState.updateCids) {
                        stillReferencedCids.add(cid);
                    }
                }
            }

            // 5. Find update CIDs that are no longer referenced by any document
            const unreferencedUpdateCids = Array.from(oldUpdateCids).filter(cid => !stillReferencedCids.has(cid));

            // 6. Clean up unreferenced update CIDs from the content store
            if (unreferencedUpdateCids.length > 0) {
                console.log(`Cleaning up ${unreferencedUpdateCids.length} unreferenced update CIDs from IndexedDB`);

                const tx = db.transaction(CONTENT_STORE, 'readwrite');
                const store = tx.objectStore(CONTENT_STORE);

                for (const cid of unreferencedUpdateCids) {
                    try {
                        // Only delete if it's an update (not a snapshot)
                        const content = await store.get(cid);
                        if (content && content.type === 'update') {
                            await store.delete(cid);
                            console.log(`Deleted unreferenced update ${cid} from IndexedDB`);
                        }
                    } catch (err) {
                        console.warn(`Failed to delete unreferenced update ${cid}:`, err);
                    }
                }

                await tx.done;
                console.log(`Cleanup of unreferenced updates completed`);
            }

            // 7. Update document service docs store with all documents
            documentService.docs.set(allUpdatedDocs);
            console.log(`Updated document service with ${allUpdatedDocs.length} documents`);

            // 8. If the currently selected document was updated, refresh it in the selectedDoc store
            if (currentlySelectedDocPubKey && updatedDocPubKeys.includes(currentlySelectedDocPubKey)) {
                const updatedSelectedDoc = allUpdatedDocs.find(doc => doc.pubKey === currentlySelectedDocPubKey);
                if (updatedSelectedDoc) {
                    console.log(`Updating selected document ${currentlySelectedDocPubKey} with latest data`);
                    documentService.selectedDoc.set(updatedSelectedDoc);
                }
            }

            // 9. Set success status
            this.setLastSynced();
            console.log('Pull from server completed successfully');

            // 10. Update pending changes count
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

        // Always consider as needing update since we want to prefer server state
        // Only skip update if server doc has no snapshot and no updates
        const skipUpdate = !serverDoc.snapshotCid && (!serverDoc.updateCids || serverDoc.updateCids.length === 0);

        if (skipUpdate) {
            console.log(`Server document ${serverDoc.pubKey} has no snapshot or updates, skipping`);
            return false;
        }

        // Prepare merged doc - start with server doc
        const mergedDoc: DocMetadata = { ...serverDoc };
        console.log(`Created merged doc with ownerId: ${mergedDoc.ownerId}`);

        // If local doc exists, preserve only its unsynced updates
        if (localDoc && localDoc.localState) {
            // Create a new localState object or use the existing one
            mergedDoc.localState = { updateCids: [] };

            // Keep only local updates that haven't been synced
            if (localDoc.localState.updateCids && localDoc.localState.updateCids.length > 0) {
                mergedDoc.localState.updateCids = [...localDoc.localState.updateCids];
                console.log(`Preserved ${mergedDoc.localState.updateCids.length} local updates that need syncing`);
            }

            // IMPORTANT: Always clear local snapshot as we're preferring server snapshot
            // This ensures we always use the server snapshot rather than a local one
            console.log(`Clearing any local snapshot to prefer server snapshot`);

            // If localState is now empty, remove it
            if (!mergedDoc.localState.updateCids || mergedDoc.localState.updateCids.length === 0) {
                delete mergedDoc.localState;
                console.log(`Removed empty localState`);
            }
        }

        // Save merged doc to IndexedDB
        await db.put(DOCS_STORE, mergedDoc);
        console.log(`Saved merged doc to IndexedDB, ownerId: ${mergedDoc.ownerId}`);

        // Collect all content CIDs that need to be synced
        const contentCidsToSync: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }> = [];

        if (serverDoc.snapshotCid) {
            contentCidsToSync.push({
                cid: serverDoc.snapshotCid,
                type: 'snapshot',
                docPubKey: serverDoc.pubKey
            });
        }

        if (serverDoc.updateCids && serverDoc.updateCids.length > 0) {
            for (const updateCid of serverDoc.updateCids) {
                contentCidsToSync.push({
                    cid: updateCid,
                    type: 'update',
                    docPubKey: serverDoc.pubKey
                });
            }
        }

        // If we have content to sync, do it in batches
        if (contentCidsToSync.length > 0) {
            await this.syncContentBatchFromServer(contentCidsToSync);
        }

        return true; // Document was updated
    }

    // Sync multiple content items from server to local storage at once
    private async syncContentBatchFromServer(
        contentItems: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }>
    ) {
        try {
            const db = await this.ensureDB();

            // 1. Check which content we already have locally
            const allCids = contentItems.map(item => item.cid);
            const existingLocalContent = await db.getAll(CONTENT_STORE, allCids);
            const existingLocalCids = new Set(existingLocalContent.map(item => item.cid));

            // 2. Filter to content we need to fetch
            const cidsToFetch = contentItems.filter(item => !existingLocalCids.has(item.cid))
                .map(item => item.cid);

            if (cidsToFetch.length === 0) {
                console.log('All content already exists locally, no need to fetch from server');
                return;
            }

            console.log(`Fetching ${cidsToFetch.length} content items from server...`);

            // 3. Batch check which content exists on server
            const existingServerCids = await this.checkContentExistenceBatch(cidsToFetch);

            // 4. Fetch binary content for each existing CID
            const contentItemsToSave: ContentItem[] = [];

            for (const cid of existingServerCids) {
                try {
                    // Get content metadata first
                    const contentItem = contentItems.find(item => item.cid === cid)!;

                    // For binary content, we need to make a separate call
                    const binaryResponse = await (hominio.api.content({ cid }).binary as any).get() as ApiResponse<{ binaryData: number[] }>;

                    if (binaryResponse.error) {
                        console.error(`Failed to fetch binary content ${cid}: ${binaryResponse.error.message}`);
                        continue;
                    }

                    // Convert the array back to Uint8Array
                    const binaryData = new Uint8Array(binaryResponse.data.binaryData);

                    // Create content item
                    contentItemsToSave.push({
                        cid,
                        type: contentItem.type,
                        data: binaryData,
                        createdAt: new Date().toISOString()
                    });
                } catch (err) {
                    console.error(`Error fetching content ${cid}:`, err);
                    // Continue with other content
                }
            }

            // 5. Save all content to IndexedDB in one transaction
            if (contentItemsToSave.length > 0) {
                const tx = db.transaction(CONTENT_STORE, 'readwrite');
                const store = tx.objectStore(CONTENT_STORE);

                for (const item of contentItemsToSave) {
                    await store.put(item);
                }

                await tx.done;
                console.log(`Saved ${contentItemsToSave.length} content items to IndexedDB`);
            }

        } catch (err) {
            console.error(`Error syncing content batch:`, err);
            // We don't throw here to allow sync process to continue
        }
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

            // Fetch content from server using Eden Treaty with type assertion
            const contentResponse = await (hominio.api.content({ cid }) as any).get() as ApiResponse<any>;

            if (contentResponse.error) {
                throw new Error(`Failed to fetch content ${cid}: ${contentResponse.error.message}`);
            }

            // For binary content, we need to make a separate call
            const binaryResponse = await (hominio.api.content({ cid }).binary as any).get() as ApiResponse<{ binaryData: number[] }>;

            if (binaryResponse.error) {
                throw new Error(`Failed to fetch binary content ${cid}: ${binaryResponse.error.message}`);
            }

            // Convert the array back to Uint8Array
            const binaryData = new Uint8Array(binaryResponse.data.binaryData);

            // Create content item
            const contentItem: ContentItem = {
                cid,
                type,
                data: binaryData,
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

                    // Check if document exists on server
                    let docExistsOnServer = false;

                    try {
                        // Check if doc exists using Eden Treaty with type assertion
                        const checkResult = await (hominio.api.docs({ pubKey: doc.pubKey }) as any).get() as ApiResponse<any>;
                        docExistsOnServer = !checkResult.error;
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
                                // Create new document using Eden Treaty
                                try {
                                    // Use type assertion for Eden Treaty calls
                                    // IMPORTANT: Send the binary data directly without separate content registration
                                    const createResult = await (hominio.api.docs as any).post({
                                        pubKey: doc.pubKey,
                                        binarySnapshot: Array.from(snapshotData),
                                        title: doc.title,
                                        description: doc.description
                                    }) as ApiResponse<any>;

                                    if (!createResult.error) {
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
                                        const errorMsg = createResult.error.message;
                                        if (errorMsg.includes('duplicate key')) {
                                            docExistsOnServer = true;
                                        } else {
                                            throw new Error(`Server error: ${errorMsg}`);
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

                            // If doc exists on server, upload snapshot content if needed
                            if (docExistsOnServer) {
                                try {
                                    // IMPORTANT: Skip content batch operations which may create ghost entries
                                    // Just update the document's snapshot reference on server directly
                                    const snapshotResult = await (hominio.api.docs({ pubKey: doc.pubKey }).snapshot as any).post({
                                        binarySnapshot: Array.from(snapshotData)
                                    }) as ApiResponse<any>;

                                    if (snapshotResult.error && !snapshotResult.error.message.includes('duplicate key')) {
                                        throw new Error(`Failed to update snapshot: ${snapshotResult.error.message}`);
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

                    // Handle updates - using true batch updating instead of individual calls
                    if ((success || !doc.localState?.snapshotCid) && doc.localState?.updateCids && doc.localState.updateCids.length > 0) {
                        const updateCids = [...doc.localState.updateCids];
                        console.log(`  - Pushing ${updateCids.length} updates for ${doc.pubKey} in batches...`);

                        if (updateCids.length > 0) {
                            // 1. Load all update data in one batch
                            const updateDataMap = await this.batchLoadContentFromIndexDB(updateCids);

                            if (updateDataMap.size === 0) {
                                console.warn(`  - Could not load any update data, skipping`);
                            } else {
                                console.log(`  - Loaded ${updateDataMap.size}/${updateCids.length} updates`);

                                // Process updates in efficient batches
                                // Use a smaller batch size to prevent timeouts/payload size issues
                                const BATCH_SIZE = 20;
                                const successfulUpdateCids: string[] = [];

                                // Get array of CIDs that have data
                                const availableCids = Array.from(updateDataMap.keys());

                                // Process in batches
                                for (let i = 0; i < availableCids.length; i += BATCH_SIZE) {
                                    const batchCids = availableCids.slice(i, i + BATCH_SIZE);
                                    console.log(`  - Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(availableCids.length / BATCH_SIZE)} (${batchCids.length} updates)`);

                                    try {
                                        // Use the batch upload endpoint for more efficient processing
                                        // First register all content in a batch
                                        const batchItems = batchCids.map(cid => ({
                                            cid,
                                            type: 'update',
                                            binaryData: Array.from(updateDataMap.get(cid)!),
                                            metadata: { documentPubKey: doc.pubKey }
                                        }));

                                        // Use Eden Treaty batch content upload
                                        const contentBatchResult = await (hominio.api.content.batch.upload as any).post({
                                            items: batchItems
                                        }) as ApiResponse<{ success: boolean, uploaded: number }>;

                                        if (contentBatchResult.error) {
                                            console.error(`  - Error uploading batch content: ${contentBatchResult.error.message}`);
                                            continue;
                                        }

                                        console.log(`  - Uploaded ${contentBatchResult.data.uploaded}/${batchItems.length} content items`);

                                        // Now register these updates with the document in a single call
                                        const updateRegistrationResult = await (hominio.api.docs[doc.pubKey].update.batch as any).post({
                                            updateCids: batchCids
                                        }) as ApiResponse<{ success: boolean, registeredCount: number, updatedCids: string[] }>;

                                        if (updateRegistrationResult.error) {
                                            console.error(`  - Error registering updates with document: ${updateRegistrationResult.error.message}`);
                                            continue;
                                        }

                                        console.log(`  - Registered ${updateRegistrationResult.data.registeredCount}/${batchCids.length} updates with document`);

                                        // Add successful CIDs to our tracking
                                        successfulUpdateCids.push(...batchCids);
                                    } catch (batchError) {
                                        console.error(`  - Error processing batch: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);
                                        // Continue with next batch even if this one fails
                                    }
                                }

                                // If we have successful updates, update the document
                                if (successfulUpdateCids.length > 0) {
                                    // 5. Register successful updates with document
                                    for (const updateCid of successfulUpdateCids) {
                                        // Add update to document's updateCids if not already there
                                        if (!doc.updateCids) {
                                            doc.updateCids = [];
                                        }
                                        if (!doc.updateCids.includes(updateCid)) {
                                            doc.updateCids.push(updateCid);
                                        }
                                    }

                                    // 6. Remove successful updates from localState
                                    if (doc.localState) {
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
                            }
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