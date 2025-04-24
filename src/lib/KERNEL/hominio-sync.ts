import { writable, get } from 'svelte/store';
import { hominio } from '$lib/KERNEL/hominio-client';
import { hominioDB, docChangeNotifier, triggerDocChangeNotification, type Docs } from '$lib/KERNEL/hominio-db';
import { browser } from '$app/environment';
import { canWrite, canDelete, type CapabilityUser } from './hominio-caps'; // Import capabilities
import { getContentStorage } from '$lib/KERNEL/hominio-storage';
import { getMe } from '$lib/KERNEL/hominio-auth'; // Import renamed function
import { GENESIS_PUBKEY } from '$db/constants'; // <<< Import GENESIS_PUBKEY

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
                                            const user = getMe();
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
                                    const user = getMe();
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
                                // @ts-expect-error Property 'post' does not exist on type '...' (Eden Treaty type inference issue)
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
                                // @ts-expect-error Property 'batch' does not exist on type '...' (Eden Treaty type inference issue)
                                const contentResult = await hominio.api.content.batch.upload.post({ items: updatesToUpload });
                                if (contentResult.error) {
                                    console.error(`[Push] Server error uploading update content for ${doc.pubKey}:`, contentResult.error); // LOG: Error uploading content
                                    throw new Error(`Server error uploading update content: ${contentResult.error.value?.message ?? 'Unknown error'}`);
                                }

                                // Use direct API call
                                // @ts-expect-error Property 'update' does not exist on type '...' (Eden Treaty type inference issue)
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
                        // It's normal to reach here if only the existence check failed initially, but no creation/update was applicable
                        // console.warn(`[Push] No local state update needed for ${doc.pubKey} (no sync operations performed or needed).`); // LOG: No local update needed - Commented out as it can be noisy
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
    ): Promise<Set<string>> { // Return the set of CIDs successfully saved locally
        const successfullySavedCids = new Set<string>();
        if (!contentItems || contentItems.length === 0) return successfullySavedCids;

        try {
            const allCids = contentItems.map(item => item.cid);

            // 1. Check local existence using hominioDB
            const existingLocalCids = await hominioDB.batchCheckContentExists(allCids);

            // 2. Filter to content we need to fetch
            const cidsToFetch = contentItems.filter(item => !existingLocalCids.has(item.cid))
                .map(item => item.cid);

            // Add already existing local CIDs to the success set
            existingLocalCids.forEach(cid => successfullySavedCids.add(cid));

            if (cidsToFetch.length === 0) {
                return successfullySavedCids; // All content already exists locally
            }

            // 3. Check server existence (robustly)
            const existingServerCids = new Set<string>();
            try {
                // @ts-expect-error Eden Treaty doesn't fully type nested batch route POST bodies
                const checkResult = await hominio.api.content.batch.exists.post({ cids: cidsToFetch });
                const response = checkResult as ApiResponse<{ results: Array<{ cid: string, exists: boolean }> }>; // Cast for checking error

                if (response.error) {
                    throw new Error(`Server Error checking content existence: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                }
                for (const result of response.data.results) {
                    if (result.exists) {
                        existingServerCids.add(result.cid);
                    } else {
                        // If server says content doesn't exist, we can't fetch it. Log it.
                        console.warn(`[Pull Content] Server reported content CID ${result.cid} does not exist.`);
                    }
                }
            } catch (err) {
                console.error('[Pull Content] Failed to check content existence on server:', err);
                // Don't re-throw here, proceed with CIDs that *might* exist or were confirmed
                // The fetch step below will handle individual failures.
                // But we should probably report this as a sync error if it happens.
                this.setSyncError(`Content check failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                // Continue, but the batch might be incomplete.
            }

            // 4. Fetch binary content for each existing CID (robustly)
            const fetchPromises = Array.from(existingServerCids).map(async (cid) => {
                try {
                    const contentItemMeta = contentItems.find(item => item.cid === cid)!;
                    // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route GETs
                    const binaryResponseResult = await hominio.api.content({ cid }).binary.get();
                    const binaryResponse = binaryResponseResult as ApiResponse<{ binaryData: number[] }>; // Cast for checking error

                    if (binaryResponse.error) {
                        // Handle 404 specifically - maybe content disappeared between check and fetch
                        if (binaryResponse.error.status === 404) {
                            console.warn(`[Pull Content] Content ${cid} not found during fetch (404).`);
                            return null;
                        }
                        throw new Error(`Server Error fetching content ${cid}: ${binaryResponse.error.value?.message ?? `Status ${binaryResponse.error.status}`}`);
                    }
                    if (binaryResponse.data?.binaryData) {
                        const binaryData = new Uint8Array(binaryResponse.data.binaryData);
                        return { cid, binaryData, meta: { type: contentItemMeta.type, documentPubKey: contentItemMeta.docPubKey } };
                    } else {
                        console.warn(`[Pull Content] No binary data returned for CID ${cid}`); // KEEP Warning
                        return null;
                    }
                } catch (err) {
                    // Log specific fetch error but don't fail the whole batch
                    console.error(`[Pull Content] Error fetching content ${cid}:`, err);
                    return null; // Indicate failure for this specific CID
                }
            });

            const fetchedContentResults = await Promise.all(fetchPromises);
            const contentToSave = fetchedContentResults.filter(result => result !== null) as Array<{ cid: string, binaryData: Uint8Array, meta: Record<string, unknown> }>;

            // 5. Save fetched content using hominioDB (catch errors individually?)
            if (contentToSave.length > 0) {
                const savePromises = contentToSave.map(item =>
                    hominioDB.saveRawContent(item.cid, item.binaryData, item.meta)
                        .then(() => {
                            successfullySavedCids.add(item.cid); // Add CID to success set on successful save
                        })
                        .catch(saveErr => {
                            console.error(`[Pull Content] Failed to save content ${item.cid} locally:`, saveErr); // Log specific save error
                            // Don't fail the whole batch, don't add to success set
                        })
                );
                await Promise.all(savePromises);
            }

        } catch (err) {
            // Catch errors from steps 1 (should be rare)
            console.error(`[Pull Content] Error syncing content batch:`, err); // KEEP Error Log
            // Propagate the error? Maybe just log and return potentially incomplete success set.
            // Setting sync error here might be too broad if some content was saved.
            if (!get(status).syncError) { // Avoid overwriting a more specific error
                this.setSyncError(`Content batch sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }
        return successfullySavedCids;
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
        this.setSyncError(null); // Clear previous errors at the start

        // <<< Define sets for prioritization >>>
        const fackiIndexPubKeys = new Set<string>();

        try {
            // --- 0. Ensure Genesis Facki Meta is synced first --- 
            let fackiMetaDoc: Docs | null = null;
            let fackiMetaSynced = false;
            try {
                console.log('[Pull] Prioritizing fetch for Facki Meta (@genesis)... ');
                // @ts-expect-error Eden Treaty issue - Keep: needed for dynamic route
                const metaResult = await hominio.api.docs({ pubKey: GENESIS_PUBKEY }).get();
                const metaResponse = metaResult as ApiResponse<ServerDocData | null>; // Expect single doc or null/error

                if (metaResponse.error && metaResponse.error.status !== 404) {
                    throw new Error(`Server Error fetching Facki Meta: ${metaResponse.error.value?.message ?? `Status ${metaResponse.error.status}`}`);
                } else if (metaResponse.data) {
                    // <<< Add Log: Inspect raw data >>>
                    console.log('[Pull Debug] Raw Facki Meta data received from server:', JSON.stringify(metaResponse.data));
                    // <<< End Log >>>

                    // Basic validation and map to Docs type
                    if (typeof metaResponse.data !== 'object' || metaResponse.data === null || typeof metaResponse.data.pubKey !== 'string' || typeof metaResponse.data.owner !== 'string') {
                        throw new Error(`Invalid Facki Meta data format received from server`);
                    }
                    let updatedAtString: string;
                    if (metaResponse.data.updatedAt instanceof Date) updatedAtString = metaResponse.data.updatedAt.toISOString();
                    else if (typeof metaResponse.data.updatedAt === 'string') updatedAtString = metaResponse.data.updatedAt;
                    else updatedAtString = new Date().toISOString(); // Fallback

                    fackiMetaDoc = {
                        pubKey: metaResponse.data.pubKey,
                        owner: metaResponse.data.owner,
                        updatedAt: updatedAtString,
                        snapshotCid: metaResponse.data.snapshotCid ?? undefined,
                        updateCids: Array.isArray(metaResponse.data.updateCids) ? metaResponse.data.updateCids : [],
                    };

                    console.log(`[Pull] Facki Meta doc found on server. Snapshot CID: ${fackiMetaDoc.snapshotCid}`);

                    if (fackiMetaDoc.snapshotCid) {
                        const contentItems = [{ cid: fackiMetaDoc.snapshotCid, type: 'snapshot' as const, docPubKey: GENESIS_PUBKEY }];
                        const savedCids = await this.syncContentBatchFromServer(contentItems);
                        if (savedCids.has(fackiMetaDoc.snapshotCid)) {
                            await hominioDB.saveSyncedDocument(fackiMetaDoc); // Save metadata after content
                            console.log('[Pull] Facki Meta content synced and metadata saved.');
                            fackiMetaSynced = true;
                        } else {
                            throw new Error(`Failed to sync Facki Meta snapshot content: ${fackiMetaDoc.snapshotCid}`);
                        }
                    }
                    // TODO: Handle fackiMetaDoc updates if necessary?
                } else {
                    console.warn('[Pull] Facki Meta document (${GENESIS_PUBKEY}) not found on server. Indexing may fail.');
                }

            } catch (err) {
                console.error('[Pull] Failed to sync Facki Meta document:', err);
                this.setSyncError(`Facki Meta sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                this.setSyncStatus(false); // Ensure sync status is reset on early exit
                return; // Cannot proceed without Facki Meta (or if fetch failed)
            }

            // --- Parse Facki Meta to find other index pubkeys --- 
            if (fackiMetaSynced && fackiMetaDoc?.snapshotCid) {
                try {
                    const fackiLoro = await hominioDB.getLoroDoc(GENESIS_PUBKEY);
                    if (fackiLoro) {
                        const datniMap = fackiLoro.getMap('datni');
                        const indexMap = datniMap.get('vasru') as { sumti?: string, selbri?: string, bridi?: string, bridi_by_component?: string } | undefined;
                        if (indexMap?.sumti) fackiIndexPubKeys.add(indexMap.sumti);
                        if (indexMap?.selbri) fackiIndexPubKeys.add(indexMap.selbri);
                        if (indexMap?.bridi) fackiIndexPubKeys.add(indexMap.bridi);
                        if (indexMap?.bridi_by_component) fackiIndexPubKeys.add(indexMap.bridi_by_component);
                        console.log('[Pull] Identified Facki Index PubKeys:', Array.from(fackiIndexPubKeys));
                    } else {
                        console.warn('[Pull] Could not load Facki Meta LoroDoc locally after sync to parse index keys.');
                    }
                } catch (parseErr) {
                    console.error('[Pull] Error parsing Facki Meta document locally:', parseErr);
                    // Proceed with sync, but indexing might be incomplete
                }
            }

            // --- 1. Fetch ALL Server Document Metadata (excluding Facki Meta) --- 
            let allOtherServerDocs: Docs[] = [];
            try {
                const serverResult = await hominio.api.docs.list.get();
                const response = serverResult as ApiResponse<unknown>; // Cast for checking error

                if (response.error) {
                    throw new Error(`Server Error fetching doc list: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                }
                if (!Array.isArray(response.data)) {
                    throw new Error(`Invalid data format received for doc list (expected array)`);
                }

                // Map raw server data to Docs type, handling potential issues
                const mappedData: (Docs | null)[] = response.data
                    .filter((element: unknown) => (element as ServerDocData)?.pubKey !== GENESIS_PUBKEY) // <<< Exclude Facki Meta
                    .map((element: unknown): Docs | null => {
                        const dbDoc = element as ServerDocData; // Assuming ServerDocData structure
                        if (typeof dbDoc !== 'object' || dbDoc === null || typeof dbDoc.pubKey !== 'string' || typeof dbDoc.owner !== 'string') {
                            console.warn('[Pull] Skipping invalid document data from server:', element); // KEEP Warning
                            return null;
                        }
                        let updatedAtString: string;
                        if (dbDoc.updatedAt instanceof Date) {
                            updatedAtString = dbDoc.updatedAt.toISOString();
                        } else if (typeof dbDoc.updatedAt === 'string') {
                            updatedAtString = dbDoc.updatedAt;
                        } else {
                            console.warn(`[Pull] Unexpected updatedAt type for doc ${dbDoc.pubKey}:`, typeof dbDoc.updatedAt, '. Using current time.');
                            updatedAtString = new Date().toISOString(); // Fallback
                        }
                        const docResult: Docs = {
                            pubKey: dbDoc.pubKey,
                            owner: dbDoc.owner,
                            updatedAt: updatedAtString,
                            snapshotCid: dbDoc.snapshotCid ?? undefined,
                            updateCids: Array.isArray(dbDoc.updateCids) ? dbDoc.updateCids : [],
                            // localState should NOT be present in server data
                        };
                        return docResult;
                    });
                allOtherServerDocs = mappedData.filter((doc): doc is Docs => doc !== null);

            } catch (err) {
                console.error('[Pull] Failed to fetch document list from server:', err);
                this.setSyncError(`Doc list fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                this.setSyncStatus(false); // Ensure sync status is reset on early exit
                return; // Cannot proceed without the document list
            }

            // --- 2. Fetch Local Document Metadata ---
            const localDocs = await hominioDB.loadAllDocsReturn();
            const localDocsMap = new Map(localDocs.map(doc => [doc.pubKey, doc]));

            // --- 3. Identify Metadata Changes and Required Content ---
            const allRequiredContentItems: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }> = [];
            const requiredContentCids = new Set<string>(); // Use a Set to avoid duplicates

            // --- Separate Facki Indices from other docs --- 
            const fackiServerDocsToUpdate: Docs[] = [];
            const otherServerDocsToUpdate: Docs[] = [];

            // Function to add required content items safely
            const addRequiredContent = (doc: Docs) => {
                if (doc.snapshotCid && !requiredContentCids.has(doc.snapshotCid)) {
                    requiredContentCids.add(doc.snapshotCid);
                    allRequiredContentItems.push({ cid: doc.snapshotCid, type: 'snapshot', docPubKey: doc.pubKey });
                }
                doc.updateCids?.forEach(cid => {
                    if (!requiredContentCids.has(cid)) {
                        requiredContentCids.add(cid);
                        allRequiredContentItems.push({ cid, type: 'update', docPubKey: doc.pubKey });
                    }
                });
            };

            // Process Facki indices identified earlier
            for (const fackiPubKey of fackiIndexPubKeys) {
                const serverDoc = allOtherServerDocs.find(d => d.pubKey === fackiPubKey);
                if (!serverDoc) {
                    console.warn(`[Pull] Facki index doc ${fackiPubKey} (from meta) not found in server list.`);
                    continue;
                }

                const localDoc = localDocsMap.get(serverDoc.pubKey);

                // Determine if metadata update is needed
                const needsUpdate = !localDoc ||
                    new Date(serverDoc.updatedAt).getTime() > new Date(localDoc.updatedAt).getTime() || // Simple timestamp check
                    serverDoc.snapshotCid !== localDoc.snapshotCid ||
                    JSON.stringify(serverDoc.updateCids?.sort()) !== JSON.stringify(localDoc.updateCids?.sort()) ||
                    serverDoc.owner !== localDoc.owner;

                // If an update is needed based on metadata comparison, mark for update and collect content CIDs
                if (needsUpdate) {
                    fackiServerDocsToUpdate.push(serverDoc);
                }

                // Always collect required CIDs from server doc
                addRequiredContent(serverDoc);
            }

            // Process remaining (non-Facki) documents
            for (const serverDoc of allOtherServerDocs) {
                // Skip if it was already processed as a Facki index
                if (fackiIndexPubKeys.has(serverDoc.pubKey)) continue;

                const localDoc = localDocsMap.get(serverDoc.pubKey);

                // Determine if metadata update is needed
                const needsUpdate = !localDoc ||
                    new Date(serverDoc.updatedAt).getTime() > new Date(localDoc.updatedAt).getTime() || // Simple timestamp check
                    serverDoc.snapshotCid !== localDoc.snapshotCid ||
                    JSON.stringify(serverDoc.updateCids?.sort()) !== JSON.stringify(localDoc.updateCids?.sort()) ||
                    serverDoc.owner !== localDoc.owner;

                // If an update is needed based on metadata comparison, mark for update and collect content CIDs
                if (needsUpdate) {
                    otherServerDocsToUpdate.push(serverDoc);
                }

                // Always collect required CIDs from server doc
                addRequiredContent(serverDoc);
            }

            // --- 4. Fetch All Required Content FIRST ---
            let successfullyFetchedCids = new Set<string>();
            if (allRequiredContentItems.length > 0) {
                try {
                    // syncContentBatchFromServer now returns the set of CIDs it successfully saved/found locally
                    successfullyFetchedCids = await this.syncContentBatchFromServer(allRequiredContentItems);
                } catch (contentSyncErr) {
                    // Errors during the batch sync are logged within the function.
                    // We might have partial success, so we continue to metadata saving.
                    console.error("[Pull] Error occurred during content batch sync:", contentSyncErr);
                    // The function might have already set a syncError, or we can set a generic one here if not set
                    if (!get(status).syncError) {
                        this.setSyncError(`Content sync potentially incomplete: ${contentSyncErr instanceof Error ? contentSyncErr.message : 'Unknown error'}`);
                    }
                }
            }

            // --- 5. Save Updated Metadata Locally (Facki indices first, then others) ---
            const processMetadataSave = async (docsToSave: Docs[]) => {
                for (const serverDocToSave of docsToSave) {
                    try {
                        // Optional: Add a check here if saving metadata depends critically on the snapshot being present
                        if (serverDocToSave.snapshotCid && !successfullyFetchedCids.has(serverDocToSave.snapshotCid)) {
                            console.warn(`[Pull] Skipping metadata save for ${serverDocToSave.pubKey} because required snapshot ${serverDocToSave.snapshotCid} was not successfully fetched/saved.`);
                            // Optionally set an error or flag this doc for retry later
                            if (!get(status).syncError) { // Avoid overwriting more critical errors
                                this.setSyncError(`Pull incomplete: Missing snapshot content for ${serverDocToSave.pubKey}`);
                            }
                            continue; // Skip saving this metadata for now
                        }

                        // Save the metadata using the server version
                        await hominioDB.saveSyncedDocument(serverDocToSave);
                        // This call within hominioDB should ideally handle the docChangeNotifier trigger
                    } catch (saveErr) {
                        console.error(`[Pull] Failed to save synced doc metadata ${serverDocToSave.pubKey} locally:`, saveErr); // KEEP Error Log
                        // Set a generic error if none exists yet
                        if (!get(status).syncError) {
                            this.setSyncError(`Metadata save failed for ${serverDocToSave.pubKey}: ${saveErr instanceof Error ? saveErr.message : 'Unknown error'}`);
                        }
                    }
                }
            };

            console.log(`[Pull] Saving metadata for ${fackiServerDocsToUpdate.length} Facki index docs...`);
            await processMetadataSave(fackiServerDocsToUpdate);

            console.log(`[Pull] Saving metadata for ${otherServerDocsToUpdate.length} other docs...`);
            await processMetadataSave(otherServerDocsToUpdate);

            // --- 6. Cleanup Logic --- (Should run even if some errors occurred)
            try {
                // Fetch the latest local state *after* metadata updates
                const refreshedLocalDocs = await hominioDB.loadAllDocsReturn();
                const stillReferencedCids = new Set<string>();
                refreshedLocalDocs.forEach(doc => {
                    // Include CIDs from both synced state and potential local pending state
                    if (doc.snapshotCid) stillReferencedCids.add(doc.snapshotCid);
                    doc.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                    if (doc.localState?.snapshotCid) stillReferencedCids.add(doc.localState.snapshotCid);
                    doc.localState?.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                });

                // Get all CIDs currently in the content store
                const cidsInContentStore = (await getContentStorage().getAll()).map(item => item.key); // Revert to original method

                // Determine which stored CIDs are no longer referenced anywhere
                const unreferencedCids = cidsInContentStore.filter(
                    (cid: string) => !stillReferencedCids.has(cid) // Explicitly type cid
                );

                // Delete unreferenced CIDs from local content storage
                if (unreferencedCids.length > 0) {
                    console.warn(`[Pull Cleanup] Deleting ${unreferencedCids.length} unreferenced content items...`); // Keep warn
                    const contentStorage = getContentStorage();
                    let deleteFailures = 0;
                    for (const cidToDelete of unreferencedCids) {
                        try {
                            await contentStorage.delete(cidToDelete);
                        } catch (deleteErr) {
                            deleteFailures++;
                            console.warn(`  - Failed to delete unreferenced content ${cidToDelete}:`, deleteErr); // KEEP Warning
                        }
                    }
                    if (deleteFailures > 0) console.warn(`[Pull Cleanup] Failed to delete ${deleteFailures} items.`);
                    else console.warn(`[Pull Cleanup] Finished deleting unreferenced content.`);
                }
            } catch (cleanupErr) {
                console.error("[Pull] Error during local content cleanup:", cleanupErr);
                // Don't setSyncError here, as the main pull might have partially succeeded
            }
            // --- Cleanup Logic End ---

            // --- 7. Final Status Update & Notification ---
            // Set success status only if no errors were previously set during the process
            if (!get(status).syncError) {
                this.status.update(s => ({ ...s, lastSynced: new Date() }));
                console.warn("[Pull] Pull from server completed successfully."); // Keep warn
            } else {
                console.error("[Pull] Pull from server completed with errors:", get(status).syncError);
            }

            // Explicitly trigger notification *after* all processing steps
            // This ensures listeners get the state *after* content and metadata sync attempts
            triggerDocChangeNotification();

        } catch (err: unknown) {
            // Catch errors from the main pull process steps (e.g., initial list fetch failure handled above, or local DB load failure)
            console.error('Error during pull from server:', err); // KEEP Error Log
            // Set error only if not already set by a more specific step
            if (!get(status).syncError) {
                this.setSyncError(err instanceof Error ? err.message : 'Pull from server failed');
            }
        } finally {
            this.setSyncStatus(false); // Always reset syncing status
            this.updatePendingChangesCount(); // Update pending count based on final state
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
            // @ts-expect-error Eden Treaty type inference issue - Keep: needed for dynamic route
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
        console.warn("HominioSync: Connection restored. Attempting sync..."); // Keep warn
        // Attempt to PULL first when coming online to get latest server state
        this.pullFromServer().finally(() => {
            // Then attempt to push any pending local changes
            const user = getMe();
            if (get(status).pendingLocalChanges > 0) {
                console.warn("[Sync Online] Pending changes detected, attempting push..."); // Keep warn
                this.pushToServer(user);
            }
        });
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
        if (this._syncDebounceTimer) {
            clearTimeout(this._syncDebounceTimer);
            this._syncDebounceTimer = null;
        }
    }
}

export const hominioSync = new HominioSync();

// Helper function to get all keys from content storage (adjust if needed)
// This assumes getContentStorage returns an object with a method like getAllKeys()
// or you might need to adapt it based on the actual storage implementation.
declare module '$lib/KERNEL/hominio-storage' {
    interface ContentStorage {
        getAllKeys(): Promise<string[]>;
    }
}
