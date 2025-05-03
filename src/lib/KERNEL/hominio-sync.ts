import { writable, get } from 'svelte/store';
import { hominio } from '$lib/KERNEL/hominio-client';
import { hominioDB, docChangeNotifier, type Docs } from '$lib/KERNEL/hominio-db';
import { browser } from '$app/environment';
import { canWrite, canDelete, type CapabilityUser } from './hominio-caps';
import { getContentStorage } from '$lib/KERNEL/hominio-storage';
import { getMe } from '$lib/KERNEL/hominio-auth';
import { GENESIS_PUBKEY } from '$db/constants';
import { updateIndexLeafRegistry, type IndexLeafType } from './index-registry';
import { LoroMap } from 'loro-crdt';

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
                    console.error("HominioSync deferred initialization error:", err); // Keep error
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
            return;
        }
        this.setSyncStatus(true);
        this.setSyncError(null); // Clear previous errors
        let overallPushError: string | null = null; // Track first error encountered

        try {
            const localDocsToSync = await hominioDB.getDocumentsWithLocalChanges();

            // <<< DEBUG LOG START >>>
            console.log(`[Sync Debug] Documents identified with local changes:`, localDocsToSync.map(d => d.pubKey));
            // <<< DEBUG LOG END >>>

            if (localDocsToSync.length === 0) {
                this.setSyncStatus(false); // Ensure status is reset if nothing to sync
                return;
            }

            for (const doc of localDocsToSync) {
                let docPushError: string | null = null;
                if (this.syncingDocs.has(doc.pubKey)) {
                    continue; // Skip this doc if already syncing
                }

                try {
                    // --- Acquire Sync Lock --- 
                    this.syncingDocs.add(doc.pubKey);
                    if (!canWrite(user, doc)) {
                        console.warn(`[Push] Permission denied for ${doc.pubKey}. Skipping.`); // Keep Permission denied log
                        continue; // Skip this document
                    }

                    // Double-check local state is still valid before proceeding
                    const refreshedDoc = await hominioDB.getDocument(doc.pubKey);
                    if (!refreshedDoc) {
                        console.warn(`[Push] Document ${doc.pubKey} disappeared during sync process. Skipping.`);
                        continue;
                    }
                    if (!refreshedDoc.localState ||
                        (!refreshedDoc.localState.snapshotCid &&
                            (!refreshedDoc.localState.updateCids || refreshedDoc.localState.updateCids.length === 0))) {
                        console.warn(`[Push] Local state for ${doc.pubKey} cleared during sync process. Skipping.`);
                        continue; // Skip if local state cleared up
                    }

                    let needsLocalUpdate = false;
                    const syncedCids: { snapshot?: string; updates?: string[]; serverConsolidated?: boolean; newServerSnapshotCid?: string } = {};

                    // --- Priority 1: Handle Local Snapshot Existence ---
                    if (refreshedDoc.localState?.snapshotCid) {
                        const localSnapshotCid = refreshedDoc.localState.snapshotCid;
                        const localUpdateCids = refreshedDoc.localState.updateCids ?? [];

                        // Fetch snapshot content
                        const snapshotData = await hominioDB.getRawContent(localSnapshotCid);
                        if (!snapshotData) {
                            docPushError = `Local snapshot data missing for ${localSnapshotCid}`;
                            continue; // Skip this doc
                        }

                        // Fetch update content (if any)
                        const updatesToUpload: Array<{ cid: string, type: string, binaryData: number[] }> = [];
                        let missingUpdateData = false;
                        for (const cid of localUpdateCids) {
                            const updateData = await hominioDB.getRawContent(cid);
                            if (updateData) {
                                updatesToUpload.push({ cid, type: 'update', binaryData: Array.from(updateData) });
                            } else {
                                docPushError = `Local update data missing for ${cid}`;
                                missingUpdateData = true;
                                break; // Stop fetching updates if one is missing
                            }
                        }
                        if (missingUpdateData) continue; // Skip this doc if required update data is missing

                        // Prepare combined content upload list
                        const contentItemsToUpload = [
                            { cid: localSnapshotCid, type: 'snapshot', binaryData: Array.from(snapshotData) },
                            ...updatesToUpload
                        ];

                        try {
                            console.log(`[Push] Uploading snapshot ${localSnapshotCid} and ${updatesToUpload.length} updates for ${doc.pubKey}`);

                            // Upload ALL content (snapshot + updates)
                            // @ts-expect-error Property 'batch' does not exist (Eden Treaty inference issue)
                            const contentResult = await hominio.api.content.batch.upload.post({ items: contentItemsToUpload });
                            if (contentResult.error) {
                                throw new Error(`Server error uploading content (snapshot/updates): ${contentResult.error.value?.message ?? `Status ${contentResult.error.status}`}`);
                            }

                            // Register snapshot + updates with the server
                            // Assumes endpoint supports newSnapshotCid + updateCids
                            console.log(`[Push] Registering snapshot ${localSnapshotCid} and updates for ${doc.pubKey}`);
                            // @ts-expect-error Property 'update' does not exist (Eden Treaty inference issue) - Assume endpoint accepts { newSnapshotCid, updateCids }
                            const registerResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({
                                newSnapshotCid: localSnapshotCid,
                                updateCids: updatesToUpload.map(u => u.cid)
                            });
                            if (registerResult.error) {
                                // Handle potential 404 if the doc didn't exist on the server yet
                                if (registerResult.error.status === 404) {
                                    console.log(`[Push] Doc ${doc.pubKey} not found on server during snapshot registration. Attempting creation...`);
                                    // @ts-expect-error Property 'post' does not exist (Eden Treaty inference issue)
                                    const createResult = await hominio.api.docs.post({
                                        pubKey: doc.pubKey,
                                        binarySnapshot: Array.from(snapshotData) // Send the initial snapshot
                                    });
                                    if (createResult.error) {
                                        throw new Error(`Server error creating doc ${doc.pubKey} after failed update: ${createResult.error.value?.message ?? `Status ${createResult.error.status}`}`);
                                    }
                                    // If creation succeeds, we might need to then register the updates separately if they existed
                                    if (updatesToUpload.length > 0) {
                                        console.log(`[Push] Registering updates for ${doc.pubKey} after successful creation.`);
                                        // @ts-expect-error Property 'update' does not exist (Eden Treaty inference issue)
                                        const updateAfterCreateResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({
                                            updateCids: updatesToUpload.map(u => u.cid)
                                        });
                                        if (updateAfterCreateResult.error) {
                                            // Log error but potentially proceed with local state update for snapshot
                                            console.error(`[Push] Failed to register updates for ${doc.pubKey} after creation: ${updateAfterCreateResult.error.value?.message ?? `Status ${updateAfterCreateResult.error.status}`}. Snapshot sync state might be incomplete.`);
                                            // Don't throw here, let local state update handle snapshot sync
                                        }
                                    }

                                } else {
                                    throw new Error(`Server error registering snapshot/updates: ${registerResult.error.value?.message ?? `Status ${registerResult.error.status}`}`);
                                }
                            }

                            // Success! Mark CIDs for local state update
                            syncedCids.snapshot = localSnapshotCid;
                            syncedCids.updates = updatesToUpload.map(u => u.cid);
                            needsLocalUpdate = true;
                            console.log(`[Push] Successfully pushed snapshot ${localSnapshotCid} and ${updatesToUpload.length} updates for ${doc.pubKey}`);


                        } catch (err) {
                            console.error(`[Push] Error in snapshot/update push for ${doc.pubKey}:`, err);
                            docPushError = `Snapshot/Update push failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
                        }

                        // --- Priority 2: Handle Only Local Updates (No Local Snapshot) ---
                    } else if (refreshedDoc.localState?.updateCids && refreshedDoc.localState.updateCids.length > 0) {
                        console.log(`[Push] Handling updates only for ${doc.pubKey}`);
                        // This is the original update logic block
                        const localUpdateCids = [...refreshedDoc.localState.updateCids]; // Copy array
                        const updatesToUpload: Array<{ cid: string, type: string, binaryData: number[] }> = [];

                        for (const cid of localUpdateCids) {
                            const updateData = await hominioDB.getRawContent(cid);
                            if (updateData) {
                                updatesToUpload.push({ cid, type: 'update', binaryData: Array.from(updateData) });
                            } else {
                                // If update data is missing, we cannot proceed with this doc
                                docPushError = `Local update data missing for ${cid}`;
                                break;
                            }
                        }

                        // Only proceed if all required update data was found
                        if (!docPushError && updatesToUpload.length > 0) {
                            try {
                                console.log(`[Push] Uploading ${updatesToUpload.length} updates for ${doc.pubKey}`);
                                // Upload update content
                                // @ts-expect-error Property 'batch' does not exist (Eden Treaty inference issue)
                                const contentResult = await hominio.api.content.batch.upload.post({ items: updatesToUpload });
                                if (contentResult.error) {
                                    console.error(`[Push] Server error uploading update content for ${doc.pubKey}:`, contentResult.error); // Keep Error uploading content
                                    throw new Error(`Server error uploading update content: ${contentResult.error.value?.message ?? `Status ${contentResult.error.status}`}`);
                                }

                                // Register updates
                                console.log(`[Push] Registering ${updatesToUpload.length} updates for ${doc.pubKey}`);
                                // @ts-expect-error Property 'update' does not exist (Eden Treaty inference issue)
                                const registerResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({ updateCids: updatesToUpload.map(u => u.cid) });
                                if (registerResult.error) {
                                    // Handle 404 - this implies the base doc is missing, which shouldn't happen if only updates exist locally
                                    if (registerResult.error.status === 404) {
                                        console.error(`[Push] Doc ${doc.pubKey} not found on server when trying to register updates. Sync state inconsistent.`);
                                        throw new Error(`Server missing base document ${doc.pubKey} required for updates.`);
                                    } else {
                                        console.error(`[Push] Server error registering updates for ${doc.pubKey}:`, registerResult.error); // Keep Error registering updates
                                        throw new Error(`Server error registering updates: ${registerResult.error.value?.message ?? `Status ${registerResult.error.status}`}`);
                                    }
                                }

                                // Check for Server-Side Consolidation
                                let serverConsolidated = false;
                                let newServerSnapshotCid: string | undefined = undefined;
                                const snapshotInfo = registerResult.data?.snapshotInfo;
                                if (snapshotInfo?.success && snapshotInfo?.newSnapshotCid) {
                                    serverConsolidated = true;
                                    newServerSnapshotCid = snapshotInfo.newSnapshotCid;
                                    // IMPORTANT: If server consolidated, the *new server snapshot* is the relevant one for local state.
                                    syncedCids.snapshot = newServerSnapshotCid;
                                    console.log(`[Push] Server consolidated updates for ${doc.pubKey} into new snapshot ${newServerSnapshotCid}`);
                                }

                                // Mark updates as successfully sent for local state update
                                syncedCids.updates = updatesToUpload.map(u => u.cid);
                                needsLocalUpdate = true;

                                // Pass server consolidation flag and potential new snapshot CID
                                syncedCids.serverConsolidated = serverConsolidated;
                                syncedCids.newServerSnapshotCid = newServerSnapshotCid;

                                console.log(`[Push] Successfully pushed ${updatesToUpload.length} updates for ${doc.pubKey}. Server consolidated: ${serverConsolidated}`);

                            } catch (err) {
                                console.error(`[Push] Error pushing updates for ${doc.pubKey}:`, err); // Keep Error during update push
                                docPushError = `Update push failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
                            }
                        } else if (!docPushError) {
                            // This case means localState.updateCids existed but maybe data was missing or array became empty
                            console.warn(`[Push] Skipping update push for ${doc.pubKey} - no valid update content found or error occurred fetching it.`);
                        }
                    } else {
                        // No local snapshot and no local updates - should have been caught by the initial check, but log just in case.
                        console.warn(`[Push] Doc ${doc.pubKey} reached sync logic with no actionable local state.`);
                    }
                    // --- End Sync Logic ---


                    // --- Update local state if anything was synced successfully ---
                    if (needsLocalUpdate && !docPushError) {
                        try {
                            console.log(`[Push] Updating local state for ${doc.pubKey} after sync. Synced CIDs:`, JSON.stringify(syncedCids));
                            await hominioDB.updateDocStateAfterSync(doc.pubKey, {
                                snapshotCid: syncedCids.snapshot, // Can be original local snapshot OR new server consolidated one
                                updateCids: syncedCids.updates,
                                serverConsolidated: syncedCids.serverConsolidated, // Only true if ONLY updates were pushed AND server consolidated
                                newServerSnapshotCid: syncedCids.newServerSnapshotCid // Only set if ONLY updates were pushed AND server consolidated
                            });
                            console.log(`[Push] Local state updated for ${doc.pubKey}.`);
                        } catch (updateStateErr) {
                            console.error(`[Push] Error updating local state for ${doc.pubKey} after sync:`, updateStateErr); // Keep Error updating local state
                            // If local state update fails, the changes might be pushed again later. This is safer than losing data.
                            // We still set the overallPushError so the UI knows something went wrong.
                            docPushError = `Local state update failed: ${updateStateErr instanceof Error ? updateStateErr.message : 'Unknown error'}`;
                        }
                    } else if (docPushError) {
                        console.error(`[Push] Not updating local state for ${doc.pubKey} due to push error: ${docPushError}`);
                    } else {
                        // No sync operations were needed or successfully performed
                        // console.log(`[Push] No local state update needed for ${doc.pubKey}. Needs update: ${needsLocalUpdate}, Error: ${docPushError}`);
                    }
                    // --- End Local State Update ---

                } catch (outerDocError) {
                    console.error(`[Push] Outer error processing document ${doc.pubKey}:`, outerDocError); // Keep Outer error
                    docPushError = `Failed to process ${doc.pubKey}: ${outerDocError instanceof Error ? outerDocError.message : 'Unknown error'}`;
                } finally {
                    // --- Release Sync Lock --- 
                    this.syncingDocs.delete(doc.pubKey);
                }

                // Store the first error encountered during the loop
                if (docPushError && !overallPushError) {
                    overallPushError = docPushError;
                }
            } // End loop over docs

            // After attempting to sync all docs, do a final recheck
            const stillPendingDocs = await hominioDB.getDocumentsWithLocalChanges();
            if (stillPendingDocs.length > 0) {
                console.warn(`[Push] ${stillPendingDocs.length} documents still have pending local changes after sync attempt.`);
            } else {
                console.log("[Push] All pending local changes processed (or skipped due to errors).");
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
                        console.warn(`[Pull Content] Server reported content CID ${result.cid} does not exist.`);
                    }
                }
            } catch (err) {
                console.error('[Pull Content] Failed to check content existence on server:', err); // Keep error
                this.setSyncError(`Content check failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                // Continue trying to fetch based on initial list, but log the check failure
            }

            // Determine which CIDs to actually attempt fetching (those server *claims* to have)
            const cidsToAttemptFetch = cidsToFetch.filter(cid => existingServerCids.has(cid));

            // 4. Fetch binary content for each existing CID (robustly)
            const fetchPromises = cidsToAttemptFetch.map(async (cid) => {
                try {
                    const contentItemMeta = contentItems.find(item => item.cid === cid)!;
                    // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route GETs
                    const binaryResponseResult = await hominio.api.content({ cid }).binary.get();
                    const binaryResponse = binaryResponseResult as ApiResponse<{ binaryData: number[] }>; // Cast for checking error

                    if (binaryResponse.error) {
                        if (binaryResponse.error.status === 404) {
                            console.warn(`[Pull Content] Server returned 404 for content ${cid} despite claiming it exists.`);
                            return null;
                        }
                        throw new Error(`Server Error fetching content ${cid}: ${binaryResponse.error.value?.message ?? `Status ${binaryResponse.error.status}`}`);
                    }
                    if (binaryResponse.data?.binaryData) {
                        const binaryData = new Uint8Array(binaryResponse.data.binaryData);
                        return { cid, binaryData, meta: { type: contentItemMeta.type, documentPubKey: contentItemMeta.docPubKey } };
                    } else {
                        console.warn(`[Pull Content] Server returned success for content ${cid} but no binaryData found.`);
                        return null;
                    }
                } catch (err) {
                    console.error(`[Pull Content] Error fetching content ${cid}:`, err); // Keep error
                    return null; // Indicate failure for this specific CID
                }
            });

            const fetchedContentResults = await Promise.all(fetchPromises);
            const contentToSave = fetchedContentResults.filter(result => result !== null) as Array<{ cid: string, binaryData: Uint8Array, meta: Record<string, unknown> }>;

            // 5. Save fetched content using hominioDB
            if (contentToSave.length > 0) {
                const savePromises = contentToSave.map(item =>
                    hominioDB.saveRawContent(item.cid, item.binaryData, item.meta)
                        .then(() => {
                            successfullySavedCids.add(item.cid); // Add CID to success set on successful save
                        })
                        .catch(saveErr => {
                            console.error(`[Pull Content] Failed to save content ${item.cid} locally:`, saveErr); // Keep error
                        })
                );
                await Promise.all(savePromises);
            }

        } catch (err) {
            console.error(`[Pull Content] Error syncing content batch:`, err); // KEEP Error Log
            if (!get(status).syncError) { // Avoid overwriting
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
            return;
        }
        this.setSyncStatus(true);
        this.setSyncError(null); // Clear previous errors

        try {
            const indexLeafPubKeys = new Set<string>();

            // --- Special Case: Get Facki Meta Document First ---
            if (GENESIS_PUBKEY) {
                try {
                    const metaResult = await hominio.api.docs({ pubKey: GENESIS_PUBKEY }).get();
                    const response = metaResult as ApiResponse<unknown>;

                    if (response.error && response.error.status !== 404) {
                        throw new Error(`Server error fetching genesis doc: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                    }

                    if (!response.error) {
                        // Get the genesis metadata
                        const genesisMetadata = response.data as ServerDocData;
                        if (!genesisMetadata || !genesisMetadata.snapshotCid) {
                            console.warn('[Pull] Genesis doc exists on server but missing snapshotCid!');
                        } else {
                            // Prepare for content fetch
                            let fetchedGenesisCid = false;

                            try {
                                // Use the same pattern as the working example in syncContentBatchFromServer
                                const contentCid = genesisMetadata.snapshotCid;
                                // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route GETs
                                const binaryResponseResult = await hominio.api.content({ cid: contentCid }).binary.get();
                                const binaryResponse = binaryResponseResult as ApiResponse<{ binaryData: number[] }>;

                                if (binaryResponse.error) {
                                    throw new Error(`Server error fetching genesis content: ${binaryResponse.error.value?.message ?? `Status ${binaryResponse.error.status}`}`);
                                }

                                // Store the content locally
                                if (binaryResponse.data?.binaryData) {
                                    const binaryData = new Uint8Array(binaryResponse.data.binaryData);
                                    try {
                                        await hominioDB.saveRawContent(contentCid, binaryData, { type: 'snapshot', documentPubKey: GENESIS_PUBKEY });
                                        fetchedGenesisCid = true;
                                    } catch (saveErr) {
                                        console.error('[Pull] Error saving genesis content to IndexedDB:', saveErr);
                                    }
                                }
                            } catch (contentErr) {
                                console.error('[Pull] Error fetching genesis content:', contentErr);
                            }

                            // Update metadata only if content was fetched
                            if (fetchedGenesisCid) {
                                try {
                                    const processedMetadata: Docs = {
                                        pubKey: GENESIS_PUBKEY,
                                        owner: genesisMetadata.owner,
                                        updatedAt: genesisMetadata.updatedAt instanceof Date ? genesisMetadata.updatedAt.toISOString() : genesisMetadata.updatedAt,
                                        snapshotCid: genesisMetadata.snapshotCid,
                                        updateCids: Array.isArray(genesisMetadata.updateCids) ? genesisMetadata.updateCids : [],
                                    };
                                    await hominioDB.saveSyncedDocument(processedMetadata);
                                } catch (saveErr) {
                                    console.error('[Pull] Error saving genesis metadata to IndexedDB:', saveErr);
                                }
                            }
                        }
                    } else {
                        console.warn('[Pull] Genesis document not found on server.');
                    }
                } catch (err) {
                    console.error('[Pull] Error fetching genesis document:', err);
                    this.setSyncError(`Genesis doc fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }

                // Try to find Genesis locally and extract index pubkeys
                try {
                    const genesisLoro = await hominioDB.getLoroDoc(GENESIS_PUBKEY);
                    if (genesisLoro) {
                        const dataMap = genesisLoro.getMap('data');
                        if (!(dataMap instanceof LoroMap)) {
                            throw new Error('@genesis data is not a LoroMap');
                        }
                        const valueContainer = dataMap.get('value');
                        if (!(valueContainer instanceof LoroMap)) {
                            throw new Error('@genesis data.value is not a LoroMap');
                        }
                        const indexValueMap = valueContainer;

                        const indexPubkeys: Partial<Record<IndexLeafType, string>> = {};
                        const leafKey = indexValueMap.get('leaves') as string | undefined;
                        const schemaKey = indexValueMap.get('schemas') as string | undefined;
                        const compositeKey = indexValueMap.get('composites') as string | undefined;
                        const compositeCompKey = indexValueMap.get('composites_by_component') as string | undefined;

                        if (leafKey) { indexLeafPubKeys.add(leafKey); indexPubkeys.leaves = leafKey; }
                        if (schemaKey) { indexLeafPubKeys.add(schemaKey); indexPubkeys.schemas = schemaKey; }
                        if (compositeKey) { indexLeafPubKeys.add(compositeKey); indexPubkeys.composites = compositeKey; }
                        if (compositeCompKey) { indexLeafPubKeys.add(compositeCompKey); indexPubkeys['composites-by-component'] = compositeCompKey; }

                        if (Object.keys(indexPubkeys).length > 0) {
                            updateIndexLeafRegistry(indexPubkeys);
                        } else {
                            console.warn('[Pull] No valid Index leaf keys found in local @genesis data.value map.');
                        }

                    } else {
                        console.warn('[Pull] Could not load @genesis LoroDoc locally to parse index keys.');
                    }
                } catch (parseErr) {
                    console.error('[Pull] Error parsing local @genesis document:', parseErr);
                }
            }

            // --- 1. Fetch ALL Server Document Metadata (excluding @genesis) ---
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

                const mappedData: (Docs | null)[] = response.data
                    .filter((element: unknown) => (element as ServerDocData)?.pubKey !== GENESIS_PUBKEY)
                    .map((element: unknown): Docs | null => {
                        const dbDoc = element as ServerDocData;
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
                allOtherServerDocs = mappedData.filter((doc): doc is Docs => doc !== null);

            } catch (err) {
                console.error('[Pull] Failed to fetch document list from server:', err); // Keep error
                this.setSyncError(`Doc list fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                this.setSyncStatus(false);
                return; // Cannot proceed without the document list
            }

            // --- 2. Fetch Local Document Metadata ---
            const localDocs = await hominioDB.loadAllDocsReturn();
            const localDocsMap = new Map(localDocs.map(doc => [doc.pubKey, doc]));

            // --- 3. Identify Metadata Changes and Required Content ---
            const allRequiredContentItems: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }> = [];
            const requiredContentCids = new Set<string>();

            const fackiServerDocsToUpdate: Docs[] = [];
            const otherServerDocsToUpdate: Docs[] = [];

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
            for (const indexPubKey of indexLeafPubKeys) {
                const serverDoc = allOtherServerDocs.find(d => d.pubKey === indexPubKey);
                if (!serverDoc) {
                    console.warn(`[Pull] Index leaf doc ${indexPubKey} (from meta) not found in server list.`); // Keep warning
                    continue;
                }

                const localDoc = localDocsMap.get(serverDoc.pubKey);

                const needsUpdate = !localDoc ||
                    new Date(serverDoc.updatedAt).getTime() > new Date(localDoc.updatedAt).getTime() ||
                    serverDoc.snapshotCid !== localDoc.snapshotCid ||
                    JSON.stringify(serverDoc.updateCids?.sort()) !== JSON.stringify(localDoc.updateCids?.sort()) ||
                    serverDoc.owner !== localDoc.owner;

                if (needsUpdate) {
                    fackiServerDocsToUpdate.push(serverDoc);
                }

                addRequiredContent(serverDoc);
            }

            // Process remaining (non-Facki) documents
            for (const serverDoc of allOtherServerDocs) {
                if (indexLeafPubKeys.has(serverDoc.pubKey)) continue;

                const localDoc = localDocsMap.get(serverDoc.pubKey);

                const needsUpdate = !localDoc ||
                    new Date(serverDoc.updatedAt).getTime() > new Date(localDoc.updatedAt).getTime() ||
                    serverDoc.snapshotCid !== localDoc.snapshotCid ||
                    JSON.stringify(serverDoc.updateCids?.sort()) !== JSON.stringify(localDoc.updateCids?.sort()) ||
                    serverDoc.owner !== localDoc.owner;

                if (needsUpdate) {
                    otherServerDocsToUpdate.push(serverDoc);
                }

                addRequiredContent(serverDoc);
            }

            // --- 4. Fetch All Required Content FIRST ---
            let successfullyFetchedCids = new Set<string>();
            if (allRequiredContentItems.length > 0) {
                try {
                    successfullyFetchedCids = await this.syncContentBatchFromServer(allRequiredContentItems);
                } catch (contentSyncErr) {
                    console.error("[Pull] Error occurred during content batch sync:", contentSyncErr); // Keep error
                    if (!get(status).syncError) {
                        this.setSyncError(`Content sync potentially incomplete: ${contentSyncErr instanceof Error ? contentSyncErr.message : 'Unknown error'}`);
                    }
                    // Decide if we should abort the pull entirely or continue with potentially incomplete data?
                    // Let's continue for now, but the error state will be set.
                }
            }

            // --- 5. Save Updated Metadata Locally (Facki indices first, then others) ---
            const processMetadataSave = async (docsToSave: Docs[]) => {
                for (const serverDocToSave of docsToSave) {
                    try {
                        // Critical Check: Only save metadata if the required snapshot was successfully fetched/exists locally
                        if (serverDocToSave.snapshotCid && !successfullyFetchedCids.has(serverDocToSave.snapshotCid)) {
                            console.warn(`[Pull] Skipping metadata save for ${serverDocToSave.pubKey} because required snapshot ${serverDocToSave.snapshotCid} was not fetched/saved.`); // Keep warning
                            if (!get(status).syncError) {
                                this.setSyncError(`Pull incomplete: Missing snapshot content for ${serverDocToSave.pubKey}`);
                            }
                            continue; // Skip saving this doc's metadata
                        }
                        // Also check update CIDs? Maybe too strict, allow saving if snapshot is present?
                        // Let's allow saving if snapshot is present, but updates might be missing.
                        await hominioDB.saveSyncedDocument(serverDocToSave);
                    } catch (saveErr) {
                        console.error(`[Pull] Failed to save synced doc metadata ${serverDocToSave.pubKey} locally:`, saveErr); // KEEP Error Log
                        if (!get(status).syncError) {
                            this.setSyncError(`Metadata save failed for ${serverDocToSave.pubKey}: ${saveErr instanceof Error ? saveErr.message : 'Unknown error'}`);
                        }
                    }
                }
            };

            await processMetadataSave(fackiServerDocsToUpdate);
            await processMetadataSave(otherServerDocsToUpdate);

            // --- 6. Cleanup Logic --- 
            try {
                await this.cleanupUnreferencedContent();
            } catch (cleanupErr) {
                console.error("[Pull] Error during local content cleanup:", cleanupErr); // Keep error
            }
            // --- Cleanup Logic End ---

            // --- 7. Final Status Update & Notification ---
            if (!get(status).syncError) {
                this.status.update(s => ({ ...s, lastSynced: new Date() }));
            } else {
                console.error("[Pull] Pull from server completed with errors:", get(status).syncError); // Keep error
            }

        } catch (err: unknown) {
            console.error('Error during pull from server:', err); // KEEP Error Log
            if (!get(status).syncError) {
                this.setSyncError(err instanceof Error ? err.message : 'Pull from server failed');
            }
        } finally {
            this.setSyncStatus(false); // Always reset syncing status
            this.updatePendingChangesCount(); // Update pending count based on final state
        }
    }

    /**
     * Performs local content cleanup after a pull operation.
     * Fetches all current doc metadata, identifies all referenced CIDs (including local state),
     * gets all CIDs in the content store, and deletes unreferenced ones.
     */
    private async cleanupUnreferencedContent(): Promise<void> {
        try {
            const refreshedLocalDocs = await hominioDB.loadAllDocsReturn();
            const stillReferencedCids = new Set<string>();
            refreshedLocalDocs.forEach(doc => {
                if (doc.snapshotCid) stillReferencedCids.add(doc.snapshotCid);
                doc.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                // IMPORTANT: Include CIDs from localState as they are still needed!
                if (doc.localState?.snapshotCid) stillReferencedCids.add(doc.localState.snapshotCid);
                doc.localState?.updateCids?.forEach(cid => stillReferencedCids.add(cid));
            });

            const cidsInContentStore = (await getContentStorage().getAllKeys()) as string[]; // Assume getAllKeys returns string[]

            const unreferencedCids = cidsInContentStore.filter(
                (cid: string) => !stillReferencedCids.has(cid)
            );

            if (unreferencedCids.length > 0) {
                console.log(`[Pull Cleanup] Found ${unreferencedCids.length} unreferenced content items to delete.`);
                const contentStorage = getContentStorage();
                let deleteFailures = 0;
                const deletePromises = unreferencedCids.map(cidToDelete =>
                    contentStorage.delete(cidToDelete).catch(deleteErr => {
                        deleteFailures++;
                        console.error(`[Pull Cleanup] Failed to delete CID ${cidToDelete}:`, deleteErr); // Log error minimally
                    })
                );
                await Promise.all(deletePromises);

                if (deleteFailures > 0) {
                    console.warn(`[Pull Cleanup] ${deleteFailures} unreferenced items failed to delete.`); // Keep warning if needed
                } else {
                    console.log(`[Pull Cleanup] Successfully deleted ${unreferencedCids.length} unreferenced items.`);
                }
            } else {
                console.log("[Pull Cleanup] No unreferenced content found to delete.");
            }
        } catch (cleanupErr) {
            console.error("[Pull Cleanup] Unexpected error during cleanup process:", cleanupErr);
            // Don't set global sync error for cleanup issues, just log it.
        }
    }


    /**
     * Deletes a document locally and attempts deletion on the server.
     * Performs capability checks before proceeding.
     */
    async deleteDocument(user: CapabilityUser | null, pubKey: string): Promise<boolean> {
        if (!browser) return false;

        try {
            // 1. Fetch metadata for capability check
            const docMeta = await hominioDB.getDocument(pubKey);
            if (!docMeta) {
                console.warn(`[Sync Delete] Document ${pubKey} not found locally.`); // Keep warn
                return true; // Considered success if not found locally
            }

            // 2. Local Capability Check (using hominio-caps)
            if (!canDelete(user, docMeta)) {
                console.warn(`[Sync Delete] Permission denied locally for user to delete doc ${pubKey}.`); // Keep warn
                throw new Error(`Permission denied to delete document ${pubKey}.`);
            }

            // 3. Attempt Server Deletion (ASYNC - don't wait)
            this.deleteDocumentOnServer(pubKey)
                .then(serverSuccess => {
                    if (!serverSuccess) {
                        console.warn(`[Sync Delete] Server deletion reported failure for ${pubKey}, but proceeding locally.`); // Keep warn
                    } else {
                        console.log(`[Sync Delete] Server deletion successful for ${pubKey}.`);
                    }
                })
                .catch(err => {
                    // Log server error but proceed with local deletion
                    console.error(`[Sync Delete] Error during server deletion attempt for ${pubKey} (ignored for local delete):`, err); // Keep error
                });

            // 4. Local Deletion (using hominioDB) - Proceed regardless of server outcome for now
            const localDeleteSuccess = await hominioDB.deleteDocument(user, pubKey); // Pass user
            if (localDeleteSuccess) {
                console.log(`[Sync Delete] Local deletion successful for ${pubKey}.`);
                // Optionally trigger cleanup after local deletion
                this.cleanupUnreferencedContent().catch(err => console.error("[Sync Delete] Post-delete cleanup failed:", err));
            } else {
                // This is unexpected if capability check passed
                console.error(`[Sync Delete] Local deletion failed for ${pubKey} even after capability check.`); // Keep error
                throw new Error(`Local deletion failed unexpectedly for ${pubKey}.`);
            }

            return true; // Return true indicating local success (or doc didn't exist)

        } catch (err) {
            console.error(`[Sync Delete] Error deleting document ${pubKey}:`, err); // Keep error
            this.setSyncError(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return false; // Return false on any error during the process
        }
    }

    /**
     * Private helper to call the server delete endpoint.
     */
    async deleteDocumentOnServer(pubKey: string): Promise<boolean> {
        if (!browser || !get(status).isOnline) {
            console.warn(`[Delete Server] Offline or not in browser. Cannot delete document ${pubKey} on server.`);
            return false; // Indicate failure due to environment/network state
        }
        try {
            console.log(`[Delete Server] Attempting to delete ${pubKey} on server...`);
            // @ts-expect-error Eden Treaty type inference issue - Keep: needed for dynamic route
            const result = await hominio.api.docs({ pubKey }).delete();
            const response = result as ApiResponse<{ success: boolean; message?: string }>;

            if (response.error) {
                let errorMessage = 'Unknown error deleting document';
                const errorValue = response.error.value;
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }
                if (response.error.status === 404) {
                    console.warn(`[Delete Server] Document ${pubKey} not found on server during delete, considering successful.`); // Keep warn
                    return true; // Treat 404 as success for delete operation
                }
                // Throw other errors
                throw new Error(`Server error deleting document ${pubKey}: ${errorMessage} (Status: ${response.error.status})`);
            }

            const success = response.data?.success ?? false;
            console.log(`[Delete Server] Server response for deleting ${pubKey}: success=${success}`);
            return success;

        } catch (err: unknown) {
            console.error(`[Delete Server] Error calling server delete for ${pubKey}:`, err); // Keep error
            // Don't re-throw here, return false to indicate server failure
            return false;
        }
    }

    // --- Online/Offline Handlers ---
    private handleOnline = () => {
        status.update(s => ({ ...s, isOnline: true }));
        console.log("HominioSync: Connection restored. Starting sync..."); // Simplified log
        // Attempt to PULL first when coming online
        this.pullFromServer().finally(() => {
            // Then attempt to push any pending local changes
            const user = getMe();
            this.updatePendingChangesCount().then(() => { // Ensure count is updated before checking
                if (get(status).pendingLocalChanges > 0) {
                    console.log(`[Sync Online] Pending changes found (${get(status).pendingLocalChanges}), initiating push...`);
                    this.pushToServer(user);
                } else {
                    console.log("[Sync Online] No pending changes to push after pull.");
                }
            });
        });
    };

    private handleOffline = () => {
        console.log("HominioSync: Connection lost. Sync paused."); // Simplified log
        status.update(s => ({ ...s, isOnline: false }));
    };
    // ------------------------------

    destroy() {
        if (this.unsubscribeNotifier) {
            this.unsubscribeNotifier();
            this.unsubscribeNotifier = null;
        }
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
