import { writable, get } from 'svelte/store';
import { hominio } from '$lib/client/hominio';
import { hominioDB, docChangeNotifier, type Docs } from '$lib/KERNEL/hominio-db';
import { browser } from '$app/environment';
import { authClient } from '$lib/client/auth-hominio'; // Assumed path for auth client
import { canWrite, type CapabilityUser } from './hominio-capabilities'; // Import capabilities
import { getContentStorage } from '$lib/KERNEL/hominio-storage';

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
                    const snapshotData = await hominioDB.getRawContent(localSnapshotCid);

                    if (snapshotData) {
                        try {
                            if (!docExistsOnServer) {
                                // Create doc on server
                                // @ts-expect-error Eden Treaty doesn't fully type dynamic route POST bodies
                                const createResult = await hominio.api.docs.post({ pubKey: doc.pubKey, binarySnapshot: Array.from(snapshotData) });
                                if (createResult.error) throw new Error(`Server error creating doc: ${createResult.error.value?.message ?? 'Unknown error'}`);
                                docExistsOnServer = true;
                                console.log(`  - Created doc ${doc.pubKey} on server with snapshot.`);
                            } else {
                                // Update snapshot on existing doc
                                // @ts-expect-error Eden Treaty doesn't fully type dynamic route POST bodies
                                const snapshotResult = await hominio.api.docs({ pubKey: doc.pubKey }).snapshot.post({ binarySnapshot: Array.from(snapshotData) });
                                if (snapshotResult.error && !(snapshotResult.error.value?.message?.includes('duplicate key'))) throw new Error(`Server error updating snapshot: ${snapshotResult.error.value?.message ?? 'Unknown error'}`);
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
                        console.warn(`  - Could not load local snapshot data for ${localSnapshotCid} via hominioDB.`);
                    }
                }

                // 2. Sync Updates if needed (only if doc exists or was just created)
                if (docExistsOnServer && doc.localState?.updateCids && doc.localState.updateCids.length > 0) {
                    const localUpdateCids = [...doc.localState.updateCids]; // Copy array
                    console.log(`  - Pushing ${localUpdateCids.length} local updates for ${doc.pubKey}...`);

                    const updatesToUpload: Array<{ cid: string, type: string, binaryData: number[] }> = [];
                    for (const cid of localUpdateCids) {
                        const updateData = await hominioDB.getRawContent(cid);
                        if (updateData) {
                            updatesToUpload.push({
                                cid,
                                type: 'update',
                                binaryData: Array.from(updateData)
                            });
                        } else {
                            console.warn(`  - Could not load local update data for ${cid} via hominioDB`);
                        }
                    }

                    if (updatesToUpload.length > 0) {
                        try {
                            // Batch upload content first
                            // @ts-expect-error Eden Treaty doesn't fully type nested batch route bodies
                            const contentResult = await hominio.api.content.batch.upload.post({ items: updatesToUpload });
                            if (contentResult.error) throw new Error(`Server error uploading update content: ${contentResult.error.value?.message ?? 'Unknown error'}`);
                            console.log(`  - Uploaded ${updatesToUpload.length} update content items.`);

                            // Batch register updates with document
                            // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route POST bodies
                            const registerResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({ updateCids: updatesToUpload.map(u => u.cid) });
                            if (registerResult.error) throw new Error(`Server error registering updates: ${registerResult.error.value?.message ?? 'Unknown error'}`);
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
     * Sync multiple content items from server to local storage at once
     */
    private async syncContentBatchFromServer(
        contentItems: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }>
    ): Promise<void> {
        if (!contentItems || contentItems.length === 0) return;
        try {
            const allCids = contentItems.map(item => item.cid);

            // 1. Check local existence using hominioDB
            const existingLocalCids = await hominioDB.batchCheckContentExists(allCids);

            // 2. Filter to content we need to fetch
            const cidsToFetch = contentItems.filter(item => !existingLocalCids.has(item.cid))
                .map(item => item.cid);

            if (cidsToFetch.length === 0) {
                console.log('All required content already exists locally.');
                return;
            }

            console.log(`Fetching ${cidsToFetch.length} content items from server...`);

            // 3. Check server existence (remains same, uses API)
            // @ts-expect-error Eden Treaty doesn't fully type nested batch route POST bodies
            const checkResult = await hominio.api.content.batch.exists.post({ cids: cidsToFetch });
            if (checkResult.error) {
                throw new Error(`Failed to check content existence on server: ${checkResult.error.value?.message ?? 'Unknown error'}`);
            }
            const serverData = (checkResult as ApiResponse<{ results: Array<{ cid: string, exists: boolean }> }>).data;
            const existingServerCids = new Set<string>();
            for (const result of serverData.results) {
                if (result.exists) {
                    existingServerCids.add(result.cid);
                }
            }

            // 4. Fetch binary content for each existing CID (remains same, uses API)
            const fetchPromises = Array.from(existingServerCids).map(async (cid) => {
                try {
                    const contentItemMeta = contentItems.find(item => item.cid === cid)!;
                    // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route GETs
                    const binaryResponse = await hominio.api.content({ cid }).binary.get();
                    if (binaryResponse.error) {
                        console.warn(`Error fetching binary data for ${cid}: ${binaryResponse.error.value?.message ?? 'Unknown error'}`);
                        return null;
                    }
                    const data = (binaryResponse as ApiResponse<{ binaryData: number[] }>).data;
                    if (data?.binaryData) {
                        const binaryData = new Uint8Array(data.binaryData);
                        return { cid, binaryData, meta: { type: contentItemMeta.type, documentPubKey: contentItemMeta.docPubKey } };
                    } else {
                        console.warn(`No binary data returned for CID ${cid}`);
                        return null;
                    }
                } catch (err) {
                    console.error(`Error processing content ${cid}:`, err);
                    return null;
                }
            });

            const fetchedContentResults = await Promise.all(fetchPromises);
            const contentToSave = fetchedContentResults.filter(result => result !== null) as Array<{ cid: string, binaryData: Uint8Array, meta: Record<string, unknown> }>;

            // 5. Save fetched content using hominioDB
            if (contentToSave.length > 0) {
                // Loop and call saveRawContent
                const savePromises = contentToSave.map(item =>
                    hominioDB.saveRawContent(item.cid, item.binaryData, item.meta)
                );
                await Promise.all(savePromises);
                console.log(`Saved ${contentToSave.length} content items via hominioDB.`);
            }

        } catch (err) {
            console.error(`Error syncing content batch:`, err);
            // Allow sync process to continue
        }
    }

    /**
     * Sync a single document metadata from server to local state (using hominioDB)
     * Returns true if the document was processed, false otherwise.
     */
    private async syncDocMetadataFromServer(serverDoc: Docs, localDocs: Docs[]): Promise<boolean> {
        console.log(`Processing server metadata for document ${serverDoc.pubKey}.`);

        const localDoc = localDocs.find(doc => doc.pubKey === serverDoc.pubKey);

        // Determine if an update is needed (comparison logic remains the same)
        const needsUpdate = !localDoc ||
            serverDoc.snapshotCid !== localDoc.snapshotCid ||
            JSON.stringify(serverDoc.updateCids?.sort()) !== JSON.stringify(localDoc.updateCids?.sort()) ||
            serverDoc.owner !== localDoc.owner;

        if (!needsUpdate) {
            console.log(`Document metadata ${serverDoc.pubKey} is already up-to-date locally.`);
            return false; // No changes needed
        }

        // Prepare merged doc (logic moved to saveSyncedDocument, just pass server data)
        // The merge logic happens inside hominioDB.saveSyncedDocument now

        // Save merged doc using hominioDB method (handles storage, stores, and notification)
        try {
            await hominioDB.saveSyncedDocument(serverDoc); // Pass server data directly
            console.log(`Called hominioDB.saveSyncedDocument for ${serverDoc.pubKey}.`);
            return true; // Document was processed
        } catch (saveErr) {
            console.error(`Failed to save synced doc metadata ${serverDoc.pubKey} via hominioDB:`, saveErr);
            return false; // Saving failed
        }
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

            // --- Fetch local docs using loadAllDocsReturn --- 
            // const localDocs = get(hominioDB.docs); // Removed store access
            const localDocs = await hominioDB.loadAllDocsReturn();
            // -------------------------------------------------
            const allRequiredContentCids = new Map<string, { type: 'snapshot' | 'update', docPubKey: string }>();
            const oldUpdateCids = new Set<string>();
            localDocs.forEach((doc: Docs) => { // Added explicit type for doc
                doc.updateCids?.forEach(cid => oldUpdateCids.add(cid));
                doc.localState?.updateCids?.forEach(cid => oldUpdateCids.add(cid));
            });

            // 1. Process metadata for all server documents FIRST
            console.log(`Processing metadata for ${serverDocs.length} server documents...`);
            for (const serverDoc of serverDocs) {
                // Pass the correctly fetched localDocs array
                await this.syncDocMetadataFromServer(serverDoc, localDocs);

                // Collect required CIDs from server data for batch content sync later
                if (serverDoc.snapshotCid) {
                    allRequiredContentCids.set(serverDoc.snapshotCid, { type: 'snapshot', docPubKey: serverDoc.pubKey });
                }
                serverDoc.updateCids?.forEach(cid => {
                    allRequiredContentCids.set(cid, { type: 'update', docPubKey: serverDoc.pubKey });
                });
            }
            console.log(`Finished processing server metadata.`);

            // 2. Sync all required content in one batch AFTER processing metadata
            if (allRequiredContentCids.size > 0) {
                console.log(`Preparing to sync ${allRequiredContentCids.size} unique content items...`);
                await this.syncContentBatchFromServer(Array.from(allRequiredContentCids.entries()).map(([cid, meta]) => ({ cid, ...meta })));
            }

            // --- Cleanup Logic Start ---
            console.log('Starting local content cleanup...');
            // Collect all update CIDs referenced *after* sync and content download
            const refreshedLocalDocs = await hominioDB.loadAllDocsReturn(); // Fetch latest state directly
            const stillReferencedCids = new Set<string>();
            refreshedLocalDocs.forEach(doc => {
                doc.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                doc.localState?.updateCids?.forEach(cid => stillReferencedCids.add(cid));
            });

            // Determine which old CIDs are no longer referenced
            const unreferencedUpdateCids = Array.from(oldUpdateCids).filter(
                cid => !stillReferencedCids.has(cid)
            );

            // Delete unreferenced update CIDs from local content storage
            if (unreferencedUpdateCids.length > 0) {
                console.log(`Cleaning up ${unreferencedUpdateCids.length} unreferenced update CIDs from local storage...`);
                // Keep direct access for cleanup ONLY
                const contentStorage = getContentStorage();
                for (const cidToDelete of unreferencedUpdateCids) {
                    try {
                        // Only delete updates, not snapshots, based on this logic
                        const deleted = await contentStorage.delete(cidToDelete);
                        if (deleted) {
                            console.log(`  - Deleted unreferenced update ${cidToDelete}`);
                        }
                    } catch (deleteErr) {
                        console.warn(`  - Failed to delete update ${cidToDelete}:`, deleteErr);
                    }
                }
                console.log(`Local update CID cleanup finished.`);
            } else {
                console.log('No unreferenced update CIDs found for cleanup.');
            }
            // --- Cleanup Logic End ---

            // Set success status
            // Trigger reactivity AFTER metadata and content sync is complete
            docChangeNotifier.update(n => n + 1);
            this.status.update(s => ({ ...s, lastSynced: new Date() }));
            console.log('Pull from server completed successfully.');

        } catch (err: unknown) {
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
            // REMOVED Unused @ts-expect-error 
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

    /**
     * Requests the server to create a consolidated snapshot for a given document.
     * Triggers a pull afterwards to refresh local state.
     * @param pubKey The public key of the document to snapshot.
     */
    async createConsolidatedSnapshot(pubKey: string): Promise<void> { // Added pubKey parameter
        if (!pubKey) { // Add basic check for provided pubKey
            this.setSyncError("No document pubKey provided to create snapshot for.");
            return;
        }

        console.log(`Requesting SERVER consolidated snapshot creation for ${pubKey}...`);
        this.setSyncStatus(true);
        this.setSyncError(null);

        try {
            // Call the server endpoint FIRST
            // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route POST bodies
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
