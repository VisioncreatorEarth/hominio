import { writable, get } from 'svelte/store';
import { hominio } from '$lib/client/hominio';
import { hominioDB, type Docs } from '$lib/KERNEL/hominio-db';
import { getContentStorage, getDocsStorage } from '$lib/KERNEL/hominio-storage';
import { browser } from '$app/environment';
import { authClient } from '$lib/client/auth-hominio'; // Assumed path for auth client
import { canWrite, type CapabilityUser } from './hominio-capabilities'; // Import capabilities

// Helper type for API response structure
type ApiResponse<T> = {
    data: T;
    error: null | { status: number; value?: { message?: string;[key: string]: unknown }; };
};

// Expected raw structure from API before mapping
interface ServerDocData {
    pubKey: string;
    owner: string;
    updatedAt: Date | string;
    snapshotCid?: string | null;
    updateCids?: string[] | null;
}

// --- SyncStatus Interface --- 
interface SyncStatus {
    isSyncing: boolean;
    lastSynced: Date | null;
    syncError: string | null;
    pendingLocalChanges: number;
}

// --- Status Store --- 
const status = writable<SyncStatus>({
    isSyncing: false,
    lastSynced: null,
    syncError: null,
    pendingLocalChanges: 0
});

export class HominioSync {
    status = status; // Expose the store for the UI

    constructor() {
        console.log("HominioSync initialized.");
        if (browser) {
            this.updatePendingChangesCount();
        }
    }

    private setSyncStatus(isSyncing: boolean): void {
        status.update(s => ({ ...s, isSyncing }));
    }
    private setSyncError(error: string | null): void {
        status.update(s => ({ ...s, syncError: error }));
    }

    private async updatePendingChangesCount(): Promise<void> {
        try {
            const pendingDocs = await hominioDB.getDocumentsWithLocalChanges();
            status.update(s => ({ ...s, pendingLocalChanges: pendingDocs.length }));
        } catch (err) {
            console.error("Error updating pending changes count:", err);
        }
    }

    // --- Push Implementation --- 
    async pushToServer() {
        if (!browser) return;

        this.setSyncStatus(true);
        this.setSyncError(null); // Clear previous errors
        console.log('Starting push to server...');

        try {
            const localDocsToSync = await hominioDB.getDocumentsWithLocalChanges();

            if (localDocsToSync.length === 0) {
                console.log('No local changes to push to server.');
                return;
            }

            console.log(`Found ${localDocsToSync.length} documents with local changes to push.`);
            const contentStorage = getContentStorage();
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;

            for (const doc of localDocsToSync) {
                // *** Capability Check ***
                if (!canWrite(currentUser, doc)) {
                    console.warn(`Permission denied: Cannot push changes for doc ${doc.pubKey} owned by ${doc.owner}. Skipping.`);
                    continue; // Skip this document
                }
                // *** End Capability Check ***

                let docExistsOnServer = false;
                try {
                    // Check server existence
                    const checkResult = await hominio.api.docs({ pubKey: doc.pubKey }).get();
                    // Use optional chaining and check value for error message
                    docExistsOnServer = !(checkResult as ApiResponse<unknown>).error;
                } catch (err) {
                    // Assuming error means it doesn't exist, but log it
                    console.warn(`Error checking existence for ${doc.pubKey}, assuming does not exist:`, err);
                    docExistsOnServer = false;
                }

                let needsLocalUpdate = false;
                let syncedSnapshotCid: string | undefined = undefined;
                const syncedUpdateCids: string[] = [];

                // 1. Sync Snapshot if needed
                if (doc.localState?.snapshotCid) {
                    const localSnapshotCid = doc.localState.snapshotCid;
                    console.log(`  - Pushing local snapshot ${localSnapshotCid} for ${doc.pubKey}...`);
                    const snapshotData = await contentStorage.get(localSnapshotCid);

                    if (snapshotData) {
                        try {
                            if (!docExistsOnServer) {
                                // Create doc on server
                                // @ts-expect-error // Eden Treaty typing issue with base route POST
                                const createResult = await hominio.api.docs.post({
                                    pubKey: doc.pubKey,
                                    binarySnapshot: Array.from(snapshotData)
                                });
                                if (createResult.error) {
                                    throw new Error(`Server error creating doc: ${createResult.error.value?.message ?? 'Unknown error'}`);
                                }
                                docExistsOnServer = true; // Now it exists
                                console.log(`  - Created doc ${doc.pubKey} on server with snapshot.`);
                            } else {
                                // Update snapshot on existing doc
                                // @ts-expect-error // Eden Treaty typing issue with nested routes
                                const snapshotResult = await hominio.api.docs({ pubKey: doc.pubKey }).snapshot.post({
                                    binarySnapshot: Array.from(snapshotData)
                                });
                                if (snapshotResult.error && !(snapshotResult.error.value?.message?.includes('duplicate key'))) {
                                    throw new Error(`Server error updating snapshot: ${snapshotResult.error.value?.message ?? 'Unknown error'}`);
                                }
                                console.log(`  - Updated snapshot for ${doc.pubKey} on server.`);
                            }
                            // Mark snapshot as synced
                            syncedSnapshotCid = localSnapshotCid;
                            needsLocalUpdate = true;
                        } catch (err) {
                            console.error(`  - Error pushing snapshot ${localSnapshotCid}:`, err);
                            this.setSyncError(`Snapshot push failed for ${doc.pubKey}`);
                            // Continue to next doc if snapshot fails
                            continue;
                        }
                    } else {
                        console.warn(`  - Could not load local snapshot data for ${localSnapshotCid}`);
                    }
                }

                // 2. Sync Updates if needed (only if doc exists or was just created)
                if (docExistsOnServer && doc.localState?.updateCids && doc.localState.updateCids.length > 0) {
                    const localUpdateCids = [...doc.localState.updateCids]; // Copy array
                    console.log(`  - Pushing ${localUpdateCids.length} local updates for ${doc.pubKey}...`);

                    const updatesToUpload: Array<{ cid: string, type: string, binaryData: number[] }> = [];
                    for (const cid of localUpdateCids) {
                        const updateData = await contentStorage.get(cid);
                        if (updateData) {
                            updatesToUpload.push({
                                cid,
                                type: 'update',
                                binaryData: Array.from(updateData)
                            });
                        } else {
                            console.warn(`  - Could not load local update data for ${cid}`);
                        }
                    }

                    if (updatesToUpload.length > 0) {
                        try {
                            // Batch upload content first
                            // @ts-expect-error // Eden Treaty typing issue with nested batch routes
                            const contentResult = await hominio.api.content.batch.upload.post({ items: updatesToUpload });
                            if (contentResult.error) {
                                throw new Error(`Server error uploading update content: ${contentResult.error.value?.message ?? 'Unknown error'}`);
                            }
                            console.log(`  - Uploaded ${updatesToUpload.length} update content items.`);

                            // Batch register updates with document
                            // @ts-expect-error // Eden Treaty typing issue with nested batch routes
                            const registerResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({
                                updateCids: updatesToUpload.map(u => u.cid)
                            });
                            if (registerResult.error) {
                                throw new Error(`Server error registering updates: ${registerResult.error.value?.message ?? 'Unknown error'}`);
                            }
                            console.log(`  - Registered ${updatesToUpload.length} updates with doc ${doc.pubKey}.`);

                            // Mark updates as synced
                            syncedUpdateCids.push(...updatesToUpload.map(u => u.cid));
                            needsLocalUpdate = true;
                        } catch (err) {
                            console.error(`  - Error pushing updates for ${doc.pubKey}:`, err);
                            this.setSyncError(`Update push failed for ${doc.pubKey}`);
                            // If updates fail, we still might have succeeded with snapshot, don't skip local update
                        }
                    }
                }

                // 3. Update local state if anything was synced successfully
                if (needsLocalUpdate) {
                    try {
                        // Call the new method in hominioDB to handle state promotion
                        await hominioDB.updateDocStateAfterSync(doc.pubKey, {
                            snapshotCid: syncedSnapshotCid,
                            updateCids: syncedUpdateCids
                        });
                        console.log(`  - Updated local doc state for ${doc.pubKey} after sync.`);
                    } catch (err) {
                        console.error(`  - Failed to update local doc state for ${doc.pubKey}:`, err);
                        // Don't set sync error here, as server push might have succeeded
                    }
                }
            } // End loop over docs

            console.log('Push to server finished.');

        } catch (err) {
            console.error('Error during push to server process:', err);
            this.setSyncError(err instanceof Error ? err.message : 'Push to server failed');
        } finally {
            this.setSyncStatus(false);
            this.updatePendingChangesCount(); // Update count after sync attempt
        }
    }

    // --- Pull Implementation --- 
    // Based on legacy sync-service.ts

    /**
     * Check which content CIDs exist on the server (batch operation)
     */
    private async checkContentExistenceBatch(cids: string[]): Promise<Set<string>> {
        if (!cids.length) return new Set();
        try {
            // @ts-expect-error // Eden Treaty typing issue with nested batch routes
            const response = await hominio.api.content.batch.exists.post({ cids });
            if (response.error) {
                throw new Error(`Failed to check content existence: ${response.error.value?.message ?? 'Unknown error'}`);
            }
            const data = (response as ApiResponse<{ results: Array<{ cid: string, exists: boolean }> }>).data;
            const existingCids = new Set<string>();
            for (const result of data.results) {
                if (result.exists) {
                    existingCids.add(result.cid);
                }
            }
            return existingCids;
        } catch (error) {
            console.error('Error checking content existence:', error);
            throw error; // Re-throw to be handled by the caller
        }
    }

    /**
     * Sync multiple content items from server to local storage at once
     */
    private async syncContentBatchFromServer(
        contentItems: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }>
    ): Promise<void> {
        if (!contentItems || contentItems.length === 0) return;
        try {
            const contentStorage = getContentStorage();
            const allCids = contentItems.map(item => item.cid);

            // 1. Check which content we already have locally using the storage adapter
            const existingLocalCids = await contentStorage.batchExists(allCids);

            // 2. Filter to content we need to fetch
            const cidsToFetch = contentItems.filter(item => !existingLocalCids.has(item.cid))
                .map(item => item.cid);

            if (cidsToFetch.length === 0) {
                console.log('All required content already exists locally.');
                return;
            }

            console.log(`Fetching ${cidsToFetch.length} content items from server...`);

            // 3. Check which CIDs exist on server (redundant check? maybe remove if server GET /binary handles 404)
            const existingServerCids = await this.checkContentExistenceBatch(cidsToFetch);

            // 4. Fetch binary content for each existing CID
            const contentToSave: Array<{ key: string, value: Uint8Array, meta: Record<string, unknown> }> = [];
            for (const cid of existingServerCids) {
                try {
                    const contentItemMeta = contentItems.find(item => item.cid === cid)!;
                    // Use Eden client to get binary data
                    // @ts-expect-error // Eden Treaty typing issue with nested routes
                    const binaryResponse = await hominio.api.content({ cid }).binary.get();
                    if (binaryResponse.error) {
                        console.warn(`Error fetching binary data for ${cid}: ${binaryResponse.error.value?.message ?? 'Unknown error'}`);
                        continue;
                    }
                    const data = (binaryResponse as ApiResponse<{ binaryData: number[] }>).data;
                    if (data?.binaryData) {
                        const binaryData = new Uint8Array(data.binaryData);
                        contentToSave.push({
                            key: cid,
                            value: binaryData,
                            meta: { type: contentItemMeta.type, documentPubKey: contentItemMeta.docPubKey }
                        });
                    } else {
                        console.warn(`No binary data returned for CID ${cid}`);
                    }
                } catch (err) {
                    console.error(`Error processing content ${cid}:`, err);
                }
            }

            // 5. Save all fetched content to local storage in one batch
            if (contentToSave.length > 0) {
                await contentStorage.batchPut(contentToSave);
                console.log(`Saved ${contentToSave.length} content items to local storage.`);
            }

        } catch (err) {
            console.error(`Error syncing content batch:`, err);
            // Allow sync process to continue
        }
    }

    /**
     * Sync a single document from server to local storage
     * Returns true if the document was updated, false if no changes were made
     */
    private async syncDocFromServer(serverDoc: Docs, localDocs: Docs[]): Promise<boolean> {
        const docsStorage = getDocsStorage();
        console.log(`Syncing document ${serverDoc.pubKey} from server.`);

        const localDoc = localDocs.find(doc => doc.pubKey === serverDoc.pubKey);

        // Determine if an update is *actually* needed by comparing critical fields
        const needsUpdate = !localDoc ||
            serverDoc.snapshotCid !== localDoc.snapshotCid ||
            JSON.stringify(serverDoc.updateCids?.sort()) !== JSON.stringify(localDoc.updateCids?.sort()) ||
            serverDoc.owner !== localDoc.owner; // Ensure owner changes are reflected
        // updatedAt check might be too noisy, omitted for now

        if (!needsUpdate) {
            console.log(`Document ${serverDoc.pubKey} is already up-to-date locally.`);
            return false; // No changes made
        }

        // Prepare merged doc - start with server doc data
        const mergedDoc: Docs = { ...serverDoc };

        // If local doc exists, *only preserve local updates* (not local snapshot)
        if (localDoc?.localState?.updateCids && localDoc.localState.updateCids.length > 0) {
            // Initialize localState if it doesn't exist on mergedDoc yet
            if (!mergedDoc.localState) {
                mergedDoc.localState = {};
            }
            // Only copy updateCids. Discard localState.snapshotCid.
            mergedDoc.localState.updateCids = [...localDoc.localState.updateCids];
            console.log(`Preserved ${mergedDoc.localState.updateCids.length} local updates for ${serverDoc.pubKey}. Local snapshot was discarded.`);
        } else {
            // If no local updates to preserve, ensure localState is removed
            delete mergedDoc.localState;
        }

        // Save merged doc to local storage
        try {
            await docsStorage.put(serverDoc.pubKey, new TextEncoder().encode(JSON.stringify(mergedDoc)));
            console.log(`Saved merged state for doc ${serverDoc.pubKey} to local storage.`);
        } catch (saveErr) {
            console.error(`Failed to save merged doc ${serverDoc.pubKey} locally:`, saveErr);
            // If saving fails, we didn't truly update, return false
            return false;
        }

        // Collect content CIDs that need to be synced (snapshot + updates)
        const contentCidsToSync: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }> = [];
        if (serverDoc.snapshotCid) {
            contentCidsToSync.push({ cid: serverDoc.snapshotCid, type: 'snapshot', docPubKey: serverDoc.pubKey });
        }
        if (serverDoc.updateCids) {
            serverDoc.updateCids.forEach(cid => contentCidsToSync.push({ cid, type: 'update', docPubKey: serverDoc.pubKey }));
        }

        // Sync required content
        if (contentCidsToSync.length > 0) {
            await this.syncContentBatchFromServer(contentCidsToSync);
        }

        return true; // Document was updated locally
    }

    /**
     * Pull documents from server to local storage
     */
    async pullFromServer() {
        if (!browser) return;

        this.setSyncStatus(true);
        this.setSyncError(null);
        console.log('Starting pull from server...');

        try {
            const serverResult = await hominio.api.docs.list.get();
            if (serverResult.error) {
                let errorMessage = 'Unknown error fetching documents';
                const errorValue = serverResult.error.value;
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }
                throw new Error(`Failed to fetch documents: ${errorMessage}`);
            }

            const serverData = serverResult.data as unknown;
            if (!Array.isArray(serverData)) {
                throw new Error(`Failed to fetch documents: Invalid data format received (expected array)`);
            }

            // Map server data, potentially returning null for invalid entries
            const mappedData: (Docs | null)[] = serverData.map((element: unknown): Docs | null => {
                const dbDoc = element as ServerDocData;
                if (typeof dbDoc !== 'object' || dbDoc === null || typeof dbDoc.pubKey !== 'string' || typeof dbDoc.owner !== 'string') {
                    console.warn('Skipping invalid document data from server:', element);
                    return null;
                }

                let updatedAtString: string;
                if (dbDoc.updatedAt instanceof Date) {
                    updatedAtString = dbDoc.updatedAt.toISOString();
                } else if (typeof dbDoc.updatedAt === 'string') {
                    updatedAtString = dbDoc.updatedAt;
                } else {
                    console.warn(`Unexpected updatedAt type for doc ${dbDoc.pubKey}:`, typeof dbDoc.updatedAt);
                    updatedAtString = new Date().toISOString();
                }

                // Construct the Docs object
                const docResult: Docs = {
                    pubKey: dbDoc.pubKey,
                    owner: dbDoc.owner,
                    updatedAt: updatedAtString,
                    snapshotCid: dbDoc.snapshotCid ?? undefined,
                    updateCids: Array.isArray(dbDoc.updateCids) ? dbDoc.updateCids : [],
                    // localState is client-side only, ensure it's not added here
                };
                return docResult;
            });

            // Filter out nulls and assert the final type
            const serverDocs: Docs[] = mappedData.filter((doc): doc is Docs => doc !== null);

            console.log(`Retrieved and mapped ${serverDocs.length} documents from server`);

            const localDocs = get(hominioDB.docs);
            const updatedDocPubKeys: string[] = [];
            const oldUpdateCids = new Set<string>();
            localDocs.forEach(doc => {
                doc.updateCids?.forEach(cid => oldUpdateCids.add(cid));
                doc.localState?.updateCids?.forEach(cid => oldUpdateCids.add(cid));
            });

            // 3. Sync each server document to local storage
            for (const serverDoc of serverDocs) {
                // Pass localDocs array for comparison within syncDocFromServer
                const wasUpdated = await this.syncDocFromServer(serverDoc, localDocs);
                if (wasUpdated) {
                    updatedDocPubKeys.push(serverDoc.pubKey);
                }
            }

            // 4. Refresh the main docs store in hominioDB after all updates
            // This is simpler than updating one by one during the loop
            await hominioDB.loadAllDocs(); // Reload all docs from storage
            console.log(`Refreshed local document list.`);

            // --- Cleanup Logic Start ---
            // 4. Collect all update CIDs referenced *after* sync
            const refreshedLocalDocs = get(hominioDB.docs); // Get the latest state
            const stillReferencedCids = new Set<string>();
            refreshedLocalDocs.forEach(doc => {
                doc.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                doc.localState?.updateCids?.forEach(cid => stillReferencedCids.add(cid));
            });

            // 5. Determine which old CIDs are no longer referenced
            const unreferencedUpdateCids = Array.from(oldUpdateCids).filter(
                cid => !stillReferencedCids.has(cid)
            );

            // 6. Delete unreferenced update CIDs from local content storage
            if (unreferencedUpdateCids.length > 0) {
                console.log(`Cleaning up ${unreferencedUpdateCids.length} unreferenced update CIDs from local storage...`);
                const contentStorage = getContentStorage();
                for (const cidToDelete of unreferencedUpdateCids) {
                    try {
                        // We only delete if it's an update, although snapshots shouldn't be in these lists anyway
                        // A check against content metadata might be needed in a more complex system
                        // For now, assume if it was in oldUpdateCids and not referenced, it's safe to delete
                        const deleted = await contentStorage.delete(cidToDelete);
                        if (deleted) {
                            console.log(`  - Deleted unreferenced update ${cidToDelete}`);
                        }
                    } catch (deleteErr) {
                        console.warn(`  - Failed to delete update ${cidToDelete}:`, deleteErr);
                    }
                }
                console.log(`Local update CID cleanup finished.`);
            }
            // --- Cleanup Logic End ---

            // 5. Set success status
            this.status.update(s => ({ ...s, lastSynced: new Date() }));
            console.log('Pull from server completed successfully.');

        } catch (err: unknown) { // Type the error
            console.error('Error during pull from server:', err);
            this.setSyncError(err instanceof Error ? err.message : 'Pull from server failed');
        } finally {
            this.setSyncStatus(false);
            this.updatePendingChangesCount();
        }
    }

    /**
     * Delete a document both locally and on the server
     * @param pubKey Document public key to delete
     * @returns True if successful
     */
    async deleteDocument(pubKey: string): Promise<boolean> {
        if (!browser) return false;

        this.setSyncStatus(true);
        this.setSyncError(null);
        console.log(`Deleting document ${pubKey} locally and on server...`);

        let serverDeleteSuccessful = false;
        let localDeleteSuccessful = false;

        try {
            // First try to delete on server
            try {
                serverDeleteSuccessful = await this.deleteDocumentOnServer(pubKey);
                console.log(`Server deletion ${serverDeleteSuccessful ? 'succeeded' : 'failed'}`);
            } catch (serverErr) {
                console.error('Server deletion error:', serverErr);
                // Continue with local delete even if server fails
            }

            // Then delete locally
            try {
                await hominioDB.deleteDocument(pubKey);
                localDeleteSuccessful = true;
                console.log('Local deletion succeeded');
            } catch (localErr) {
                console.error('Local deletion error:', localErr);
                throw localErr; // Re-throw local errors
            }

            // Consider the operation successful if at least one succeeded
            return serverDeleteSuccessful || localDeleteSuccessful;
        } catch (err) {
            this.setSyncError(err instanceof Error ? err.message : 'Document deletion failed');
            return false;
        } finally {
            this.setSyncStatus(false);
            this.updatePendingChangesCount();
        }
    }

    async deleteDocumentOnServer(pubKey: string): Promise<boolean> {
        if (!browser) return false;

        this.setSyncStatus(true);
        this.setSyncError(null);
        console.log(`Requesting document deletion from server for ${pubKey}...`);

        try {
            // Call the server's delete endpoint
            // @ts-expect-error Eden Treaty typing issue with dynamic routes
            const result = await hominio.api.docs({ pubKey }).delete();
            const response = result as ApiResponse<{ success: boolean; message?: string }>;

            if (response.error) {
                let errorMessage = 'Unknown error deleting document';
                const errorValue = response.error.value;
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }
                throw new Error(`Server error deleting document: ${errorMessage}`);
            }

            if (response.data?.success) {
                console.log(`Server successfully deleted document ${pubKey}: ${response.data.message || ''}`);
                return true;
            } else {
                throw new Error(`Server failed to delete document: ${response.data?.message || 'Unknown reason'}`);
            }
        } catch (err: unknown) {
            console.error(`Error deleting document ${pubKey}:`, err);
            this.setSyncError(err instanceof Error ? err.message : 'Document deletion failed');
            throw err;
        } finally {
            this.setSyncStatus(false);
        }
    }

    async createConsolidatedSnapshot(): Promise<void> {
        const selected = get(hominioDB.selectedDoc);
        if (!selected?.pubKey) {
            this.setSyncError("No document selected to create snapshot for.");
            return;
        }

        const pubKey = selected.pubKey;
        console.log(`Requesting SERVER consolidated snapshot creation for ${pubKey}...`);
        this.setSyncStatus(true);
        this.setSyncError(null);

        try {
            // Call the server endpoint FIRST
            // @ts-expect-error // Eden Treaty typing issue with nested routes
            const result = await hominio.api.docs({ pubKey }).snapshot.create.post({});
            const response = result as ApiResponse<{ success: boolean; message?: string; newSnapshotCid?: string;[key: string]: unknown }>;

            if (response.error) {
                let errorMessage = 'Unknown server error creating snapshot';
                const errorValue = response.error.value;
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }
                throw new Error(`Server error creating snapshot: ${errorMessage}`);
            }

            if (response.data?.success) {
                console.log(`Server successfully created snapshot ${response.data.newSnapshotCid || ''} for ${pubKey}.`);

                // Local state is now stale - DO NOT update it manually here.
                // Rely on pullFromServer to get the correct state.

                // Trigger a pull AFTER successful server snapshot
                console.log('Triggering pull to refresh final state...');
                await this.pullFromServer();

            } else {
                throw new Error(`Server failed to create snapshot: ${response.data?.message || 'Unknown reason'}`);
            }

        } catch (err: unknown) { // Type the error
            console.error(`Error creating consolidated snapshot for ${pubKey}:`, err);
            this.setSyncError(err instanceof Error ? err.message : 'Snapshot creation failed');
        } finally {
            this.setSyncStatus(false);
        }
    }

    destroy() { console.log('HominioSync destroyed'); }
}

export const hominioSync = new HominioSync();
