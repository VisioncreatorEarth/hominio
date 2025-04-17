import { writable, get } from 'svelte/store';
import { hominio } from '$lib/KERNEL/hominio-client';
import { hominioDB, docChangeNotifier, type Docs } from '$lib/KERNEL/hominio-db';
import { browser } from '$app/environment';
import { authClient } from '$lib/KERNEL/hominio-auth'; // Assumed path for auth client
import { canWrite, type CapabilityUser } from './hominio-caps'; // Import capabilities
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
    isOnline: boolean;
}

// --- Status Store --- 
const status = writable<SyncStatus>({
    isSyncing: false,
    lastSynced: null,
    syncError: null,
    pendingLocalChanges: 0,
    isOnline: browser ? navigator.onLine : true
});

export class HominioSync {
    status = status; // Expose the store for the UI
    private unsubscribeNotifier: (() => void) | null = null; // Store the unsubscribe function
    private syncingDocs = new Set<string>(); // Track pubKeys currently being pushed

    constructor() {
        if (browser) {
            // Add event listeners for online/offline status changes
            window.addEventListener('online', this.handleOnline);
            window.addEventListener('offline', this.handleOffline);

            // Defer initialization steps that depend on other modules
            setTimeout(() => {
                try {
                    this.updatePendingChangesCount(); // Initial count

                    // Subscribe to DB changes to keep pending count updated AND trigger sync if online
                    this.unsubscribeNotifier = docChangeNotifier.subscribe(() => {
                        this.updatePendingChangesCount();
                        // --- Trigger Auto-Sync on DB Change (if online) ---
                        if (get(status).isOnline) {
                            this.pushToServer(); // Non-blocking call
                        }
                        // -------------------------------------------------
                    });
                } catch (err) {
                    console.error("HominioSync deferred initialization error:", err); // Log errors during deferred init
                    this.setSyncError("Sync service failed to initialize correctly.");
                }
            }, 0); // Execute after current JS tick
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
            console.error("Error updating pending changes count:", err); // KEEP Error Log
        }
    }

    // --- Push Implementation --- 
    async pushToServer() {
        if (!browser) return;
        // --- Offline Check ---
        if (!get(status).isOnline) {
            console.warn('Offline: Skipping pushToServer.');
            return;
        }
        // ---------------------

        this.setSyncStatus(true);
        this.setSyncError(null); // Clear previous errors
        let overallPushError: string | null = null; // Track first error encountered

        try {
            const localDocsToSync = await hominioDB.getDocumentsWithLocalChanges();

            if (localDocsToSync.length === 0) {
                return;
            }

            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;

            for (const doc of localDocsToSync) {
                let docPushError: string | null = null; // Track error for *this* doc
                // --- Sync Lock Check --- 
                if (this.syncingDocs.has(doc.pubKey)) {
                    console.log(`[Push] Skipping ${doc.pubKey}: Sync already in progress.`);
                    continue; // Skip this doc if already syncing
                }
                // --- End Sync Lock Check --- 

                try {
                    // --- Acquire Sync Lock --- 
                    this.syncingDocs.add(doc.pubKey);
                    // -----------------------

                    // *** Capability Check ***
                    if (!canWrite(currentUser, doc)) {
                        console.warn(`Permission denied: Cannot push changes for doc ${doc.pubKey} owned by ${doc.owner}. Skipping.`); // KEEP Warning
                        continue; // Skip this document
                    }
                    // *** End Capability Check ***

                    let docExistsOnServer = false;
                    try {
                        // Check server existence
                        const checkResult = await hominio.api.docs({ pubKey: doc.pubKey }).get();
                        const response = checkResult as ApiResponse<unknown>; // Cast for checking error
                        if (response.error && response.error.status !== 404) {
                            // Treat non-404 errors as transient failures
                            throw new Error(`Server error checking existence: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                        }
                        docExistsOnServer = !response.error; // Exists if no error (or 404, handled below)
                    } catch (err) {
                        // Catch network errors or specific server errors during check
                        console.warn(`Error checking existence for ${doc.pubKey}, assuming does not exist:`, err);
                        docPushError = `Existence check failed for ${doc.pubKey}: ${err instanceof Error ? err.message : 'Unknown error'}`;
                        // Assuming it doesn't exist might be wrong, maybe skip this doc?
                        // For now, log the error and potentially continue trying to create/update
                        // docExistsOnServer remains false
                    }

                    let needsLocalUpdate = false;
                    const syncedUpdateCids: string[] = [];

                    // --- Handle Initial Document Creation --- 
                    if (!docExistsOnServer && doc.localState?.snapshotCid) {
                        const localSnapshotCid = doc.localState.snapshotCid;
                        const snapshotData = await hominioDB.getRawContent(localSnapshotCid);
                        if (snapshotData) {
                            try {
                                console.log(`[Push] Document ${doc.pubKey} not found on server. Creating with local snapshot ${localSnapshotCid}...`);
                                // Create doc on server using the local snapshot
                                // @ts-expect-error Eden Treaty may not fully type dynamic route POST bodies
                                const createResult = await hominio.api.docs.post({ pubKey: doc.pubKey, binarySnapshot: Array.from(snapshotData) });
                                if (createResult.error) {
                                    throw new Error(`Server error creating doc ${doc.pubKey}: ${createResult.error.value?.message ?? 'Unknown error'}`);
                                }
                                console.log(`[Push] Successfully created doc ${doc.pubKey} on server.`);
                                docExistsOnServer = true; // Mark as existing now
                                // Mark this snapshot as synced for local state update
                                syncedUpdateCids.push(localSnapshotCid);
                                needsLocalUpdate = true;
                            } catch (creationErr) {
                                console.error(`  - Error creating doc ${doc.pubKey} on server:`, creationErr);
                                docPushError = `Document creation failed: ${creationErr instanceof Error ? creationErr.message : 'Unknown error'}`;
                                continue; // Skip to the next document if creation fails
                            }
                        } else {
                            console.warn(`[Push] Doc ${doc.pubKey} needs creation, but local snapshot data ${localSnapshotCid} not found.`);
                            // Cannot create without snapshot, skip this doc for now
                            continue;
                        }
                    }
                    // --- End Initial Document Creation --- 

                    // 2. Sync Updates if needed (only if doc exists or was just created)
                    if (docExistsOnServer && doc.localState?.updateCids && doc.localState.updateCids.length > 0) {
                        const localUpdateCids = [...doc.localState.updateCids]; // Copy array
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
                                console.warn(`  - Could not load local update data for ${cid} via hominioDB`); // KEEP Warning
                            }
                        }

                        if (updatesToUpload.length > 0) {
                            try {
                                // Batch upload content first
                                // @ts-expect-error Eden Treaty doesn't fully type nested batch route bodies
                                const contentResult = await hominio.api.content.batch.upload.post({ items: updatesToUpload });
                                if (contentResult.error) throw new Error(`Server error uploading update content: ${contentResult.error.value?.message ?? 'Unknown error'}`);

                                // Batch register updates with document
                                // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route POST bodies
                                const registerResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({ updateCids: updatesToUpload.map(u => u.cid) });
                                if (registerResult.error) throw new Error(`Server error registering updates: ${registerResult.error.value?.message ?? 'Unknown error'}`);

                                // --- Check for Server-Side Consolidation --- 
                                let serverConsolidated = false;
                                let newServerSnapshotCid: string | undefined = undefined;
                                if (registerResult.data?.snapshotInfo?.success && registerResult.data.snapshotInfo.newSnapshotCid) {
                                    serverConsolidated = true;
                                    newServerSnapshotCid = registerResult.data.snapshotInfo.newSnapshotCid;
                                    console.log(`[Push] Server consolidated updates for ${doc.pubKey} into new snapshot: ${newServerSnapshotCid}`);
                                    // We still mark these updates as synced locally, as they were successfully sent
                                    // The subsequent call to updateDocStateAfterSync will handle clearing them based on the flag.
                                }
                                // --------------------------------------------

                                // Mark updates as successfully sent for local state update
                                syncedUpdateCids.push(...updatesToUpload.map(u => u.cid));
                                needsLocalUpdate = true;

                                // --- Pass consolidation info to local update step --- 
                                if (needsLocalUpdate) {
                                    await hominioDB.updateDocStateAfterSync(doc.pubKey, {
                                        snapshotCid: newServerSnapshotCid, // Pass ONLY the server-generated CID if consolidation happened
                                        updateCids: syncedUpdateCids,   // Pass updates that were just pushed
                                        serverConsolidated: serverConsolidated, // NEW FLAG
                                        newServerSnapshotCid: newServerSnapshotCid // NEW CID if consolidated
                                    });
                                    needsLocalUpdate = false; // Mark as handled here
                                }
                                // -------------------------------------------------
                            } catch (err) {
                                // Catch network errors or specific server errors during update push
                                console.error(`  - Error pushing updates for ${doc.pubKey}:`, err);
                                docPushError = `Update push failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
                                // Allow sync process to continue, but log error
                            }
                        }
                    }

                    // 3. Update local state if anything was synced successfully
                    if (needsLocalUpdate) {
                        try {
                            // Call the new method in hominioDB to handle state promotion
                            // This path is now only for snapshot-only pushes or failed update pushes where we still sync snapshot
                            // If this block is reached, it means the update push failed or didn't happen,
                            // but maybe a local snapshot was created earlier (though we removed that push).
                            // Let's pass undefined for snapshotCid here as no *new* snapshot was confirmed.
                            await hominioDB.updateDocStateAfterSync(doc.pubKey, {
                                snapshotCid: undefined, // No new snapshot confirmed in this path
                                updateCids: syncedUpdateCids // Pass any updates that *might* have been synced before error (unlikely now)
                            });
                        } catch (err) {
                            console.error(`  - Failed to update local doc state for ${doc.pubKey}:`, err);
                            // This is a local error, maybe set a different kind of status?
                            docPushError = `Local state update failed after sync: ${err instanceof Error ? err.message : 'Unknown error'}`;
                        }
                    }

                } catch (outerDocError) {
                    // Catch errors specific to processing this document (like capability check fail)
                    console.error(`Failed to process document ${doc.pubKey} for push:`, outerDocError);
                    docPushError = `Failed to process ${doc.pubKey}: ${outerDocError instanceof Error ? outerDocError.message : 'Unknown error'}`;
                }

                // --- Release Sync Lock --- 
                finally {
                    this.syncingDocs.delete(doc.pubKey);
                }
                // -----------------------

                // Store the first error encountered during the loop
                if (docPushError && !overallPushError) {
                    overallPushError = docPushError;
                }
            } // End loop over docs

        } catch (err) { // Catch errors in the overall process (e.g., loading local changes)
            console.error('Error during push to server process:', err); // KEEP Error Log
            overallPushError = err instanceof Error ? err.message : 'Push to server failed';
        } finally {
            if (overallPushError) {
                this.setSyncError(overallPushError); // Set the first error encountered
            }
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
                return;
            }

            // 3. Check server existence (robustly)
            const existingServerCids = new Set<string>();
            try {
                // @ts-expect-error Eden Treaty doesn't fully type nested batch route POST bodies
                const checkResult = await hominio.api.content.batch.exists.post({ cids: cidsToFetch });
                const response = checkResult as ApiResponse<{ results: Array<{ cid: string, exists: boolean }> }>; // Cast for checking error

                if (response.error) {
                    throw new Error(`Server Error: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                }
                for (const result of response.data.results) {
                    if (result.exists) {
                        existingServerCids.add(result.cid);
                    }
                }
            } catch (err) {
                console.error('Failed to check content existence on server:', err);
                // Decide how to proceed - maybe stop content sync for this batch?
                // Re-throwing for now to signal a problem
                throw new Error(`Content check failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }

            // 4. Fetch binary content for each existing CID (robustly)
            const fetchPromises = Array.from(existingServerCids).map(async (cid) => {
                try {
                    const contentItemMeta = contentItems.find(item => item.cid === cid)!;
                    // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route GETs
                    const binaryResponseResult = await hominio.api.content({ cid }).binary.get();
                    const binaryResponse = binaryResponseResult as ApiResponse<{ binaryData: number[] }>; // Cast for checking error

                    if (binaryResponse.error) {
                        throw new Error(`Server Error: ${binaryResponse.error.value?.message ?? `Status ${binaryResponse.error.status}`}`);
                    }
                    if (binaryResponse.data?.binaryData) {
                        const binaryData = new Uint8Array(binaryResponse.data.binaryData);
                        return { cid, binaryData, meta: { type: contentItemMeta.type, documentPubKey: contentItemMeta.docPubKey } };
                    } else {
                        console.warn(`No binary data returned for CID ${cid}`); // KEEP Warning
                        return null;
                    }
                } catch (err) {
                    // Log specific fetch error but don't fail the whole batch
                    console.error(`Error fetching content ${cid}:`, err);
                    return null;
                }
            });

            const fetchedContentResults = await Promise.all(fetchPromises);
            const contentToSave = fetchedContentResults.filter(result => result !== null) as Array<{ cid: string, binaryData: Uint8Array, meta: Record<string, unknown> }>;

            // 5. Save fetched content using hominioDB (catch errors individually?)
            if (contentToSave.length > 0) {
                const savePromises = contentToSave.map(item =>
                    hominioDB.saveRawContent(item.cid, item.binaryData, item.meta)
                        .catch(saveErr => {
                            console.error(`Failed to save content ${item.cid} locally:`, saveErr); // Log specific save error
                            // Don't fail the whole batch
                        })
                );
                await Promise.all(savePromises);
            }

        } catch (err) {
            // Catch errors from steps 1, 3
            console.error(`Error syncing content batch:`, err); // KEEP Error Log
            // Propagate the error to the main pull function
            throw err;
        }
    }

    /**
     * Sync a single document metadata from server to local state (using hominioDB)
     * Returns true if the document was processed, false otherwise.
     */
    private async syncDocMetadataFromServer(serverDoc: Docs, localDocs: Docs[]): Promise<boolean> {
        const localDoc = localDocs.find(doc => doc.pubKey === serverDoc.pubKey);

        // Determine if an update is needed (comparison logic remains the same)
        const needsUpdate = !localDoc ||
            serverDoc.snapshotCid !== localDoc.snapshotCid ||
            JSON.stringify(serverDoc.updateCids?.sort()) !== JSON.stringify(localDoc.updateCids?.sort()) ||
            serverDoc.owner !== localDoc.owner;

        if (!needsUpdate) {
            return false; // No changes needed
        }

        // Save merged doc using hominioDB method (handles storage, stores, and notification)
        try {
            await hominioDB.saveSyncedDocument(serverDoc); // Pass server data directly
            return true; // Document was processed
        } catch (saveErr) {
            console.error(`Failed to save synced doc metadata ${serverDoc.pubKey} via hominioDB:`, saveErr); // KEEP Error Log
            return false; // Saving failed
        }
    }

    /**
     * Pull documents from server to local storage
     */
    async pullFromServer() {
        if (!browser) return;
        // --- Offline Check ---
        if (!get(status).isOnline) {
            console.warn('Offline: Skipping pullFromServer.');
            return;
        }
        // ---------------------

        this.setSyncStatus(true);
        this.setSyncError(null);
        try {
            let serverDocs: Docs[] = [];
            try {
                const serverResult = await hominio.api.docs.list.get();
                const response = serverResult as ApiResponse<unknown>; // Cast for checking error

                if (response.error) {
                    throw new Error(`Server Error: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                }

                if (!Array.isArray(response.data)) {
                    throw new Error(`Invalid data format received (expected array)`);
                }

                const mappedData: (Docs | null)[] = response.data.map((element: unknown): Docs | null => {
                    const dbDoc = element as ServerDocData;
                    if (typeof dbDoc !== 'object' || dbDoc === null || typeof dbDoc.pubKey !== 'string' || typeof dbDoc.owner !== 'string') {
                        console.warn('Skipping invalid document data from server:', element); // KEEP Warning
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
                    const docResult: Docs = {
                        pubKey: dbDoc.pubKey,
                        owner: dbDoc.owner,
                        updatedAt: updatedAtString,
                        snapshotCid: dbDoc.snapshotCid ?? undefined,
                        updateCids: Array.isArray(dbDoc.updateCids) ? dbDoc.updateCids : [],
                    };
                    return docResult;
                });
                serverDocs = mappedData.filter((doc): doc is Docs => doc !== null);
            } catch (err) {
                // Catch network or server errors during doc list fetch
                console.error('Failed to fetch document list from server:', err);
                this.setSyncError(`Doc list fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                // Don't proceed if we can't get the list
                return;
            }


            // --- Fetch local docs using loadAllDocsReturn --- 
            const localDocs = await hominioDB.loadAllDocsReturn();
            // -------------------------------------------------
            const allRequiredContentCids = new Map<string, { type: 'snapshot' | 'update', docPubKey: string }>();
            const oldUpdateCids = new Set<string>();
            localDocs.forEach((doc: Docs) => { // Added explicit type for doc
                doc.updateCids?.forEach(cid => oldUpdateCids.add(cid));
                doc.localState?.updateCids?.forEach(cid => oldUpdateCids.add(cid));
            });

            // 1. Process metadata for all server documents FIRST
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

            // 2. Sync all required content in one batch AFTER processing metadata
            if (allRequiredContentCids.size > 0) {
                try {
                    await this.syncContentBatchFromServer(Array.from(allRequiredContentCids.entries()).map(([cid, meta]) => ({ cid, ...meta })));
                } catch (contentSyncErr) {
                    console.error("Error during content batch sync:", contentSyncErr);
                    this.setSyncError(`Content sync failed: ${contentSyncErr instanceof Error ? contentSyncErr.message : 'Unknown error'}`);
                    // Allow metadata updates to persist, but report content sync error
                }
            }

            // --- Cleanup Logic Start --- (Should be safe even if content sync failed)
            try {
                const refreshedLocalDocs = await hominioDB.loadAllDocsReturn(); // Fetch latest state directly
                const stillReferencedCids = new Set<string>();
                refreshedLocalDocs.forEach(doc => {
                    doc.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                    doc.localState?.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                    // Add snapshot CIDs too, don't delete needed snapshots
                    if (doc.snapshotCid) stillReferencedCids.add(doc.snapshotCid);
                    if (doc.localState?.snapshotCid) stillReferencedCids.add(doc.localState.snapshotCid);
                });

                // Determine which old CIDs are no longer referenced
                const cidsInContentStore = (await getContentStorage().getAll()).map(item => item.key);
                const unreferencedCids = cidsInContentStore.filter(
                    cid => !stillReferencedCids.has(cid)
                );

                // Delete unreferenced CIDs from local content storage
                if (unreferencedCids.length > 0) {
                    const contentStorage = getContentStorage();
                    for (const cidToDelete of unreferencedCids) {
                        try {
                            await contentStorage.delete(cidToDelete); // Delete any unreferenced content
                        } catch (deleteErr) {
                            console.warn(`  - Failed to delete unreferenced content ${cidToDelete}:`, deleteErr); // KEEP Warning
                        }
                    }
                }
            } catch (cleanupErr) {
                console.error("Error during local content cleanup:", cleanupErr);
                // Don't setSyncError here, as the main pull might have succeeded
            }
            // --- Cleanup Logic End ---

            // Set success status (if no major errors occurred)
            if (!get(status).syncError) { // Only update lastSynced if no error was set
                this.status.update(s => ({ ...s, lastSynced: new Date() }));
            }
            // Trigger reactivity AFTER metadata and content sync is complete
            docChangeNotifier.update(n => n + 1);

        } catch (err: unknown) {
            // Catch errors from the main pull process steps (e.g., initial list fetch failure)
            console.error('Error during pull from server:', err); // KEEP Error Log
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
        let localDeleteSuccessful = false;
        let overallError: Error | null = null;
        let success = false;

        try {
            // First try to delete on server
            try {
                /* serverDeleteSuccessful = */ await this.deleteDocumentOnServer(pubKey);
            } catch (serverErr) {
                console.error("Server delete failed:", serverErr);
                overallError = serverErr instanceof Error ? serverErr : new Error(String(serverErr));
                // Don't stop, still try local delete
            }

            // Then delete locally
            await hominioDB.deleteDocument(pubKey);
            localDeleteSuccessful = true;

        } catch (localErr) {
            console.error('Error deleting document locally:', localErr);
            overallError = localErr instanceof Error ? localErr : new Error(String(localErr));
        } finally {
            this.setSyncStatus(false);
            this.updatePendingChangesCount();
            if (overallError) {
                this.setSyncError(`Deletion failed: ${overallError.message}`);
                success = false;
            } else {
                success = localDeleteSuccessful;
            }
        }
        return success;
    }

    async deleteDocumentOnServer(pubKey: string): Promise<boolean> {
        if (!browser) return false;

        // --- Offline Check (Throw error as server interaction is mandatory) ---
        if (!get(status).isOnline) {
            throw new Error('Offline: Cannot delete document on server.');
        }
        // ------------------------------------------------------------------

        // No need to set status here, handled by caller (deleteDocument)
        try {
            const result = await hominio.api.docs({ pubKey }).delete();
            const response = result as ApiResponse<{ success: boolean; message?: string }>;

            if (response.error) {
                let errorMessage = 'Unknown error deleting document';
                const errorValue = response.error.value;
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }
                // Handle 404 specifically - if server says not found, it's effectively deleted from server perspective
                if (response.error.status === 404) {
                    console.warn(`Document ${pubKey} not found on server during delete, considering server delete successful.`);
                    return true;
                }
                throw new Error(`Server error deleting document: ${errorMessage} (Status: ${response.error.status})`);
            }

            return response.data?.success ?? false;

        } catch (err: unknown) {
            // Catch network errors or errors thrown above
            console.error(`Error deleting document on server ${pubKey}:`, err);
            // Don't setSyncError here, let caller handle it
            throw err; // Re-throw for caller
        }
    }

    // --- Online/Offline Handlers ---
    private handleOnline = () => {
        console.log("HominioSync: Connection established.");
        status.update(s => ({ ...s, isOnline: true, syncError: null }));
        // Trigger sync operations after a short delay (Pull first, then Push)
        setTimeout(() => {
            console.log("HominioSync: Triggering pull then push after 1s delay...");
            this.pullFromServer(); // <-- Pull first
            this.pushToServer(); // <-- Then push
        }, 1000); // 1 second delay
    };

    private handleOffline = () => {
        console.warn("HominioSync: Connection lost. Sync paused.");
        status.update(s => ({ ...s, isOnline: false }));
        // Optionally set an error/status indicating offline
        // status.update(s => ({ ...s, syncError: "Offline: Synchronization paused." })); 
    };
    // ------------------------------

    destroy() {
        if (this.unsubscribeNotifier) {
            this.unsubscribeNotifier();
            this.unsubscribeNotifier = null;
        }
        // Remove event listeners
        if (browser) {
            window.removeEventListener('online', this.handleOnline);
            window.removeEventListener('offline', this.handleOffline);
        }
    }
}

export const hominioSync = new HominioSync();
