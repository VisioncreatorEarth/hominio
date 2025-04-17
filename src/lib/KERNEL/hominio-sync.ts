import { writable, get } from 'svelte/store';
import { hominio } from '$lib/KERNEL/hominio-client';
import { hominioDB, docChangeNotifier, triggerDocChangeNotification, type Docs } from '$lib/KERNEL/hominio-db';
import { browser } from '$app/environment';
import { canWrite, canDelete, type CapabilityUser } from './hominio-caps'; // Import capabilities
import { getContentStorage } from '$lib/KERNEL/hominio-storage';
import { getCurrentEffectiveUser } from '$lib/KERNEL/hominio-auth'; // Import effective user utility

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
    private _syncDebounceTimer: NodeJS.Timeout | null = null;
    private _triggerSyncCount = 0;
    private _lastSyncTime = 0;

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
                        // Add a very short delay to allow IndexedDB writes to settle
                        setTimeout(() => {
                            this.updatePendingChangesCount();

                            // --- Trigger Auto-Sync on DB Change (if online) ---
                            if (get(status).isOnline) {
                                // Rate-limit sync triggers
                                const now = Date.now();
                                if (now - this._lastSyncTime < 5000) {
                                    this._triggerSyncCount++;
                                    if (this._triggerSyncCount > 5) {
                                        this._lastSyncTime = now;
                                        this._triggerSyncCount = 0;
                                        if (this._syncDebounceTimer) clearTimeout(this._syncDebounceTimer);
                                        this._syncDebounceTimer = setTimeout(() => {
                                            const user = getCurrentEffectiveUser();
                                            console.warn('[Sync] Auto-sync triggered after multiple changes'); // Keep warn
                                            this.pushToServer(user).catch(err => console.error('[Sync] Auto-sync failed:', err));
                                        }, 500);
                                    }
                                    return;
                                }
                                this._lastSyncTime = now;
                                this._triggerSyncCount = 0;
                                if (this._syncDebounceTimer) clearTimeout(this._syncDebounceTimer);
                                this._syncDebounceTimer = setTimeout(() => {
                                    const user = getCurrentEffectiveUser();
                                    this.pushToServer(user).catch(err => console.error('[Sync] Auto-sync failed:', err));
                                }, 500);
                            }
                            // -------------------------------------------------
                        }, 50); // 50ms delay
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
    async pushToServer(user: CapabilityUser | null) {
        if (!browser || !get(status).isOnline || get(status).isSyncing) {
            if (get(status).isSyncing) console.warn('[Push] Already syncing, skipping redundant push'); // Keep warn
            else if (!get(status).isOnline) console.warn('Offline: Skipping pushToServer.'); // Keep warn
            return;
        }
        this.setSyncStatus(true);
        this.setSyncError(null); // Clear previous errors
        let overallPushError: string | null = null; // Track first error encountered

        try {
            const localDocsToSync = await hominioDB.getDocumentsWithLocalChanges();
            if (localDocsToSync.length === 0) {
                this.setSyncStatus(false); // Ensure status is reset if nothing to sync
                return;
            }

            for (const doc of localDocsToSync) {
                // Declare docPushError at the beginning of the loop block
                let docPushError: string | null = null;
                if (this.syncingDocs.has(doc.pubKey)) {
                    console.warn(`[Push] Skipping ${doc.pubKey}: Sync already in progress.`);
                    continue; // Skip this doc if already syncing
                }

                try {
                    // --- Acquire Sync Lock --- 
                    this.syncingDocs.add(doc.pubKey);
                    if (!canWrite(user, doc)) {
                        console.warn(`[Push] Permission denied for ${doc.pubKey}. Skipping.`); // LOG: Permission denied
                        continue; // Skip this document
                    }

                    // Double-check local state is still valid before proceeding
                    const refreshedDoc = await hominioDB.getDocument(doc.pubKey);
                    if (!refreshedDoc) {
                        console.warn(`[Push] Doc ${doc.pubKey} disappeared locally before push. Skipping.`); // LOG: Doc disappeared
                        continue;
                    }
                    if (!refreshedDoc.localState ||
                        (!refreshedDoc.localState.snapshotCid &&
                            (!refreshedDoc.localState.updateCids || refreshedDoc.localState.updateCids.length === 0))) {
                        console.warn(`[Push] Doc ${doc.pubKey} no longer has pending changes or disappeared. Skipping.`); // LOG: No pending changes
                        continue;
                    }

                    // --- Restore Actual Server Interaction --- 
                    let docExistsOnServer = false;
                    try {
                        const checkResult = await hominio.api.docs({ pubKey: doc.pubKey }).get();
                        const response = checkResult as ApiResponse<unknown>; // Use defined type

                        if (response.error && response.error.status !== 404) {
                            // Treat non-404 errors as transient failures
                            console.error(`[Push] Server error checking existence for ${doc.pubKey}:`, response.error); // LOG: Server error on check
                            throw new Error(`Server error checking existence: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                        }
                        docExistsOnServer = !response.error; // Exists if no error or 404
                    } catch (err) {
                        // Catch network errors or specific server errors during check
                        console.warn(`[Push] Error checking existence for ${doc.pubKey}, assuming does not exist:`, err); // LOG: Error on check
                        docPushError = `Existence check failed for ${doc.pubKey}: ${err instanceof Error ? err.message : 'Unknown error'}`;
                        // Continue even if check fails, attempt create/update
                    }
                    // --- End Server Existence Check ---

                    let needsLocalUpdate = false;
                    const syncedCids: { snapshot?: string; updates?: string[]; serverConsolidated?: boolean; newServerSnapshotCid?: string } = {};

                    // --- Handle Initial Document Creation --- 
                    if (!docExistsOnServer && refreshedDoc.localState?.snapshotCid) {
                        const localSnapshotCid = refreshedDoc.localState.snapshotCid;
                        const snapshotData = await hominioDB.getRawContent(localSnapshotCid);

                        if (snapshotData) {
                            try {
                                // Use direct API call
                                const createResult = await hominio.api.docs.post({
                                    pubKey: doc.pubKey,
                                    binarySnapshot: Array.from(snapshotData)
                                });

                                if (createResult.error) {
                                    console.error(`[Push] Server error creating doc ${doc.pubKey}:`, createResult.error); // LOG: Server error on create
                                    throw new Error(`Server error creating doc ${doc.pubKey}: ${createResult.error.value?.message ?? 'Unknown error'}`);
                                }

                                docExistsOnServer = true; // Mark as existing now

                                // Mark this snapshot as synced for local state update
                                syncedCids.snapshot = localSnapshotCid;
                                needsLocalUpdate = true;
                            } catch (creationErr) {
                                console.error(`[Push] Error creating doc ${doc.pubKey} on server:`, creationErr); // LOG: Create error
                                docPushError = `Document creation failed: ${creationErr instanceof Error ? creationErr.message : 'Unknown error'}`;
                                // Don't continue to next doc, allow update attempt if creation failed but check passed before?
                            }
                        } else {
                            docPushError = `Local snapshot data missing for ${localSnapshotCid}`;
                        }
                    }
                    // --- End Initial Document Creation ---

                    // --- Sync Updates (if exists/created and has local updates) ---
                    if (docExistsOnServer && refreshedDoc.localState?.updateCids && refreshedDoc.localState.updateCids.length > 0) {
                        const localUpdateCids = [...refreshedDoc.localState.updateCids]; // Copy array
                        const updatesToUpload: Array<{ cid: string, type: string, binaryData: number[] }> = [];

                        for (const cid of localUpdateCids) {
                            const updateData = await hominioDB.getRawContent(cid);
                            if (updateData) {
                                updatesToUpload.push({ cid, type: 'update', binaryData: Array.from(updateData) });
                            } else {
                                console.warn(`[Push] Could not load local update data for CID ${cid} (doc ${doc.pubKey}). Skipping this update.`); // LOG: Update data missing
                            }
                        }

                        if (updatesToUpload.length > 0) {
                            try {
                                const contentResult = await hominio.api.content.batch.upload.post({ items: updatesToUpload });
                                if (contentResult.error) {
                                    console.error(`[Push] Server error uploading update content for ${doc.pubKey}:`, contentResult.error); // LOG: Error uploading content
                                    throw new Error(`Server error uploading update content: ${contentResult.error.value?.message ?? 'Unknown error'}`);
                                }

                                // Use direct API call
                                const registerResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({ updateCids: updatesToUpload.map(u => u.cid) });
                                if (registerResult.error) {
                                    console.error(`[Push] Server error registering updates for ${doc.pubKey}:`, registerResult.error); // LOG: Error registering updates
                                    throw new Error(`Server error registering updates: ${registerResult.error.value?.message ?? 'Unknown error'}`);
                                }

                                // Check for Server-Side Consolidation
                                let serverConsolidated = false;
                                let newServerSnapshotCid: string | undefined = undefined;
                                // Use optional chaining and nullish coalescing for safer access
                                const snapshotInfo = registerResult.data?.snapshotInfo;
                                if (snapshotInfo?.success && snapshotInfo?.newSnapshotCid) {
                                    serverConsolidated = true;
                                    newServerSnapshotCid = snapshotInfo.newSnapshotCid;
                                    console.warn(`[Push] Server consolidated updates for ${doc.pubKey} into new snapshot: ${newServerSnapshotCid}`); // LOG: Server consolidated
                                    // Pass consolidation info to local update step
                                    syncedCids.snapshot = newServerSnapshotCid; // Server snapshot becomes the new base
                                }

                                // Mark updates as successfully sent for local state update
                                syncedCids.updates = updatesToUpload.map(u => u.cid);
                                needsLocalUpdate = true;

                                // Pass server consolidation flag
                                syncedCids.serverConsolidated = serverConsolidated; // Add flag here
                                // Pass the new server snapshot CID if consolidation occurred
                                syncedCids.newServerSnapshotCid = newServerSnapshotCid;

                            } catch (err) {
                                // Catch network errors or specific server errors during update push
                                console.error(`[Push] Error pushing updates for ${doc.pubKey}:`, err); // LOG: Error during update push
                                docPushError = `Update push failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
                                // Do NOT continue to the next doc here, allow local state update attempt below
                            }
                        } else {
                            console.warn(`[Push] No valid update data found locally for ${doc.pubKey}, although update CIDs were listed.`); // LOG: No valid local update data
                        }
                    } else if (refreshedDoc.localState?.updateCids && refreshedDoc.localState.updateCids.length > 0) {
                        console.warn(`[Push] Skipping update sync for ${doc.pubKey} because doc doesn't exist on server (or check failed).`); // LOG: Skipping update sync
                    }
                    // --- End Sync Updates ---

                    // --- Update local state if anything was synced successfully ---
                    // Only update local state if there wasn't a critical error during the push attempt itself
                    if (needsLocalUpdate && !docPushError) {
                        try {
                            await hominioDB.updateDocStateAfterSync(doc.pubKey, {
                                snapshotCid: syncedCids.snapshot, // Pass snapshot if created/consolidated
                                updateCids: syncedCids.updates,   // Pass updates that were synced
                                serverConsolidated: syncedCids.serverConsolidated,
                                newServerSnapshotCid: syncedCids.newServerSnapshotCid
                            });
                        } catch (updateStateErr) {
                            console.error(`[Push] Error updating local state for ${doc.pubKey} after sync:`, updateStateErr); // LOG: Error updating local state
                            // This is critical, as it might cause repeated sync attempts
                            docPushError = `Local state update failed: ${updateStateErr instanceof Error ? updateStateErr.message : 'Unknown error'}`;
                        }
                    } else if (docPushError) {
                        console.warn(`[Push] Skipping local state update for ${doc.pubKey} due to sync error: ${docPushError}`); // LOG: Skipping local update due to error
                    } else {
                        console.warn(`[Push] No local state update needed for ${doc.pubKey} (no sync operations performed or needed).`); // LOG: No local update needed
                    }
                    // --- End Local State Update ---

                } catch (outerDocError) {
                    console.error(`[Push] Outer error processing document ${doc.pubKey}:`, outerDocError); // LOG: Outer error
                    docPushError = `Failed to process ${doc.pubKey}: ${outerDocError instanceof Error ? outerDocError.message : 'Unknown error'}`;
                } finally {
                    // --- Release Sync Lock --- 
                    this.syncingDocs.delete(doc.pubKey);
                }

                // Store the first error encountered during the loop
                if (docPushError && !overallPushError) {
                    console.error(`[Push] Storing first overall error encountered: ${docPushError}`); // LOG: Storing overall error
                    overallPushError = docPushError;
                }
            } // End loop over docs

            // After attempting to sync all docs, do a final recheck for any that still need syncing
            const stillPendingDocs = await hominioDB.getDocumentsWithLocalChanges();
            if (stillPendingDocs.length > 0) {
                console.warn(`[Push] After sync attempt, ${stillPendingDocs.length} documents still have pending changes`);
            }

        } catch (err) { // Catch errors in the overall process (e.g., loading local changes)
            console.error('Error during push to server process:', err); // KEEP Error Log
            overallPushError = err instanceof Error ? err.message : 'Push to server failed';
        } finally {
            if (overallPushError) {
                this.setSyncError(overallPushError); // Set the first error encountered
            }
            this.setSyncStatus(false);
            this.updatePendingChangesCount(); // Update count after sync attempt

            // Always trigger a docChangeNotifier update after sync
            // to ensure UI gets refreshed with latest state
            setTimeout(() => {
                try {
                    if (typeof triggerDocChangeNotification === 'function') {
                        triggerDocChangeNotification();
                    } else {
                        console.error("triggerDocChangeNotification is not available");
                        // Fallback to direct update
                        docChangeNotifier.update(n => n + 1);
                    }
                } catch (e) {
                    console.error("Error triggering doc change notification:", e);
                    // Use direct update as fallback
                    docChangeNotifier.update(n => n + 1);
                }
            }, 100);
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
        if (!browser || !get(status).isOnline || get(status).isSyncing) {
            if (get(status).isSyncing) console.warn('[Pull] Already syncing, skipping.');
            else if (!get(status).isOnline) console.warn('Offline: Skipping pullFromServer.');
            return;
        }
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
            triggerDocChangeNotification();

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
     * Deletes a document locally and attempts deletion on the server.
     * Performs capability checks before proceeding.
     * @param user The current user context.
     * @param pubKey The public key of the document to delete.
     * @returns True if local deletion succeeded, false otherwise.
     *          Server deletion success is logged but doesn't affect the return value directly.
     */
    async deleteDocument(user: CapabilityUser | null, pubKey: string): Promise<boolean> {
        if (!browser) return false;

        try {
            // 1. Fetch metadata for capability check
            const docMeta = await hominioDB.getDocument(pubKey);
            if (!docMeta) {
                console.warn(`[Sync Delete] Document ${pubKey} not found locally. Assuming already deleted or never existed.`);
                return true; // Considered success if not found locally
            }

            // 2. Local Capability Check (using hominio-caps)
            if (!canDelete(user, docMeta)) {
                console.warn(`[Sync Delete] Permission denied locally for user to delete doc ${pubKey}.`);
                throw new Error(`Permission denied to delete document ${pubKey}.`);
            }

            // 3. Attempt Server Deletion (best effort, non-blocking for local)
            // We attempt server deletion *before* local deletion
            // If server fails, we still proceed with local deletion for offline consistency
            this.deleteDocumentOnServer(pubKey) // Call async but don't await fully here
                .then(serverSuccess => {
                    if (!serverSuccess) {
                        console.warn(`[Sync Delete] Server deletion failed for ${pubKey}, but proceeding with local deletion.`);
                        // Optionally mark for later retry?
                    } else {
                        console.warn(`[Sync Delete] Successfully deleted ${pubKey} on server.`);
                    }
                })
                .catch(err => {
                    console.error(`[Sync Delete] Error during server deletion attempt for ${pubKey}:`, err);
                    // Logged, but local deletion continues
                });

            // 4. Local Deletion (using hominioDB)
            const localDeleteSuccess = await hominioDB.deleteDocument(user, pubKey); // Pass user
            if (localDeleteSuccess) {
                console.warn(`[Sync Delete] Successfully deleted ${pubKey} locally.`);
                // Trigger count update manually if needed, though notifier should handle it
                // await this.updatePendingChangesCount();
            } else {
                // This case should ideally not happen if canDelete passed, but handle defensively
                console.error(`[Sync Delete] Local deletion failed for ${pubKey} even after capability check.`);
                // Throw or return false? Returning false seems appropriate.
                return false;
            }

            return true; // Return true indicating local success

        } catch (err) {
            console.error(`[Sync Delete] Error deleting document ${pubKey}:`, err);
            this.setSyncError(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return false; // Return false on any error during the process
        }
    }

    /**
     * Private helper to call the server delete endpoint.
     */
    async deleteDocumentOnServer(pubKey: string): Promise<boolean> {
        if (!browser || !get(status).isOnline) throw new Error('Offline: Cannot delete document on server.');
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
        status.update(s => ({ ...s, isOnline: true }));
        // Attempt to push changes immediately when coming online
        const user = getCurrentEffectiveUser(); // Get user before pushing
        this.pushToServer(user); // Pass user
    };

    private handleOffline = () => {
        console.warn("HominioSync: Connection lost. Sync paused.");
        status.update(s => ({ ...s, isOnline: false }));
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
