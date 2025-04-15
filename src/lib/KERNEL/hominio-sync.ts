import { writable, get } from 'svelte/store';
import { hominio } from '$lib/client/hominio';
import { hominioDB, type Docs } from '$lib/KERNEL/hominio-db';
import { getContentStorage, getDocsStorage } from '$lib/KERNEL/hominio-storage';
import { browser } from '$app/environment';

// Helper type for API response structure
type ApiResponse<T> = {
    data: T;
    error: null | { message: string; status?: number;[key: string]: unknown };
};

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

            for (const doc of localDocsToSync) {
                let docExistsOnServer = false;
                try {
                    // Check server existence
                    const checkResult = await hominio.api.docs({ pubKey: doc.pubKey }).get();
                    // Cast to check error property safely
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
                                // Create doc on server - Cast base route to any
                                const createResult = await (hominio.api.docs as any).post({
                                    pubKey: doc.pubKey,
                                    binarySnapshot: Array.from(snapshotData)
                                });
                                if ((createResult as ApiResponse<unknown>).error) {
                                    throw new Error(`Server error creating doc: ${(createResult as ApiResponse<unknown>).error?.message}`);
                                }
                                docExistsOnServer = true; // Now it exists
                                console.log(`  - Created doc ${doc.pubKey} on server with snapshot.`);
                            } else {
                                // Update snapshot on existing doc - Cast base call to any
                                const snapshotResult = await (hominio.api.docs({ pubKey: doc.pubKey }) as any).snapshot.post({
                                    binarySnapshot: Array.from(snapshotData)
                                });
                                // Allow duplicate key errors for snapshots (idempotent)
                                if ((snapshotResult as ApiResponse<unknown>).error && !(snapshotResult as ApiResponse<unknown>).error?.message.includes('duplicate key')) {
                                    throw new Error(`Server error updating snapshot: ${(snapshotResult as ApiResponse<unknown>).error?.message}`);
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
                            // Batch upload content first - Cast base route to any
                            const contentResult = await (hominio.api.content as any).batch.upload.post({ items: updatesToUpload });
                            if ((contentResult as ApiResponse<unknown>).error) {
                                throw new Error(`Server error uploading update content: ${(contentResult as ApiResponse<unknown>).error?.message}`);
                            }
                            console.log(`  - Uploaded ${updatesToUpload.length} update content items.`);

                            // Batch register updates with document - Cast base call to any
                            const registerResult = await (hominio.api.docs({ pubKey: doc.pubKey }) as any).update.batch.post({
                                updateCids: updatesToUpload.map(u => u.cid)
                            });
                            if ((registerResult as ApiResponse<unknown>).error) {
                                throw new Error(`Server error registering updates: ${(registerResult as ApiResponse<unknown>).error?.message}`);
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
            // Cast before accessing batch
            const response = await (hominio.api.content as any).batch.exists.post({ cids });
            if ((response as ApiResponse<unknown>).error) {
                throw new Error(`Failed to check content existence: ${(response as ApiResponse<unknown>).error?.message}`);
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
            const contentToSave: Array<{ key: string, value: Uint8Array, meta: Record<string, any> }> = [];
            for (const cid of existingServerCids) {
                try {
                    const contentItemMeta = contentItems.find(item => item.cid === cid)!;
                    // Use Eden client to get binary data - Cast before accessing binary
                    const binaryResponse = await (hominio.api.content({ cid }) as any).binary.get();
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
                    console.error(`Error fetching content ${cid}:`, err);
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
        console.log(`Syncing document ${serverDoc.pubKey} from server to local storage`);

        const localDoc = localDocs.find(doc => doc.pubKey === serverDoc.pubKey);

        // Determine if an update is needed
        // Basic check: Update if server has a snapshot/updates, or if local doc doesn't exist
        // More robust check would involve comparing snapshotCids and updateCids lengths/contents
        const needsUpdate = !localDoc ||
            serverDoc.snapshotCid !== localDoc.snapshotCid ||
            (serverDoc.updateCids?.length || 0) !== (localDoc.updateCids?.length || 0) ||
            // Quick check if update arrays differ (doesn't check order or exact content)
            JSON.stringify(serverDoc.updateCids?.sort()) !== JSON.stringify(localDoc.updateCids?.sort());

        if (!needsUpdate) {
            console.log(`Document ${serverDoc.pubKey} is already up-to-date.`);
            return false;
        }

        // Prepare merged doc - start with server doc
        const mergedDoc: Docs = { ...serverDoc };

        // Preserve local-only state if local doc exists
        if (localDoc?.localState) {
            mergedDoc.localState = { ...localDoc.localState };
            console.log(`Preserved local state for ${serverDoc.pubKey}`);
        }

        // Save merged doc to local storage
        await docsStorage.put(serverDoc.pubKey, new TextEncoder().encode(JSON.stringify(mergedDoc)));
        console.log(`Saved merged doc ${serverDoc.pubKey} to local storage.`);

        // Collect all content CIDs that need to be synced (snapshot + updates)
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

        return true; // Document was updated
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
            // 1. Fetch all document metadata from server
            console.log('Fetching documents metadata from server...');
            // Use `as any` for the result type due to potential mismatch
            const serverResult = await hominio.api.docs.list.get() as any;
            // Check for error structure before accessing data
            if (serverResult?.error) {
                throw new Error(`Failed to fetch documents: ${serverResult.error.message || 'Unknown error'}`);
            }
            const serverDocs = serverResult?.data as Docs[]; // Assert data type
            if (!serverDocs) {
                throw new Error(`Failed to fetch documents: No data received`);
            }
            console.log(`Retrieved ${serverDocs.length} documents metadata from server`);

            // 2. Get local docs for comparison
            const localDocs = get(hominioDB.docs);
            const updatedDocPubKeys: string[] = [];

            // --- Cleanup Logic Start ---
            // 1. Collect all existing update CIDs before sync
            const oldUpdateCids = new Set<string>();
            localDocs.forEach(doc => {
                doc.updateCids?.forEach(cid => oldUpdateCids.add(cid));
                doc.localState?.updateCids?.forEach(cid => oldUpdateCids.add(cid));
            });
            // --- Cleanup Logic End ---

            // 3. Sync each server document to local storage
            for (const serverDoc of serverDocs) {
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

        } catch (err) {
            console.error('Error during pull from server:', err);
            this.setSyncError(err instanceof Error ? err.message : 'Pull from server failed');
        } finally {
            this.setSyncStatus(false);
            this.updatePendingChangesCount();
        }
    }
    // --- End Pull Implementation ---

    async createConsolidatedSnapshot(): Promise<void> {
        const selected = get(hominioDB.selectedDoc);
        if (!selected?.pubKey) {
            this.setSyncError("No document selected to create snapshot for.");
            return;
        }

        const pubKey = selected.pubKey;
        console.log(`Requesting consolidated snapshot creation for ${pubKey} on server...`);
        this.setSyncStatus(true);
        this.setSyncError(null);

        try {
            // Call the server endpoint - Use cast for potentially complex/nested route type
            const result = await (hominio.api.docs({ pubKey }) as any).snapshot.create.post({});
            const response = result as ApiResponse<{ success: boolean; message?: string;[key: string]: unknown }>; // Basic response check

            if (response.error) {
                throw new Error(`Server error creating snapshot: ${response.error.message}`);
            }

            if (response.data?.success) {
                console.log(`Server successfully created snapshot for ${pubKey}. Triggering pull to refresh.`);
                // Trigger a pull to get the updated document state from the server
                await this.pullFromServer();
            } else {
                throw new Error(`Server failed to create snapshot: ${response.data?.message || 'Unknown error'}`);
            }

        } catch (err) {
            console.error(`Error creating consolidated snapshot for ${pubKey}:`, err);
            this.setSyncError(err instanceof Error ? err.message : 'Snapshot creation failed');
        } finally {
            this.setSyncStatus(false);
        }
    }

    destroy() { console.log('HominioSync destroyed'); }
}

export const hominioSync = new HominioSync();
