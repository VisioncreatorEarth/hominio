import { writable, get } from 'svelte/store';
import { hominio } from '$lib/KERNEL/hominio-client';
import { hominioDB, subscribeToDbChanges } from './hominio-db';
import { browser } from '$app/environment';
import { canWrite, canDelete } from './hominio-caps';
import { getContentStorage } from '$lib/KERNEL/hominio-storage';
import { getMe } from './hominio-auth';
import { GENESIS_PUBKEY } from '$db/constants';
import { updateIndexLeafRegistry } from './index-registry';
import { LoroMap } from 'loro-crdt';

// --- Import Types from hominio-types.ts ---
import type {
    ApiResponse,
    ServerDocData,
    SyncStatus,
    Docs,
    IndexLeafType,
    CapabilityUser
} from './hominio-types';
// Re-export types if needed
export type {
    ApiResponse,
    ServerDocData,
    SyncStatus,
};
// --- End Import Types ---

// Helper type for API response structure
// type ApiResponse<T> = {
//     data: T;
//     error: null | { status: number; value?: { message?: string;[key: string]: unknown }; };
// };

// Expected raw structure from API before mapping
// interface ServerDocData {
//     pubKey: string;
//     owner: string;
//     updatedAt: Date | string;
//     snapshotCid?: string | null;
//     updateCids?: string[] | null;
// }

// --- SyncStatus Interface ---
// interface SyncStatus {
//     isSyncing: boolean;
//     lastSynced: Date | null;
//     syncError: string | null;
//     pendingLocalChanges: number;
//     isOnline: boolean;
// }

// --- Status Store ---
const status = writable<SyncStatus>({
    isSyncing: false,
    lastSynced: null,
    syncError: null,
    pendingLocalChanges: 0,
    isOnline: browser ? navigator.onLine : true
});

// --- Constants ---
const PUSH_DEBOUNCE_MS = 750; // Wait this long after the last change before pushing
const PUSH_COOLDOWN_MS = 5000; // Minimum time between push attempts
const PERIODIC_CHECK_INTERVAL_MS = 15000; // Check for pending changes every 15 seconds

export class HominioSync {
    status = status; // Expose the store for the UI
    private unsubscribeDbChanges: (() => void) | null = null;
    private syncingDocs = new Set<string>(); // Track pubKeys currently being pushed
    private _syncDebounceTimer: NodeJS.Timeout | null = null;
    private _periodicCheckTimer: NodeJS.Timeout | null = null; // Timer for periodic checks
    private _lastPushAttemptTime = 0; // Timestamp of the last push *attempt*

    constructor() {
        if (browser) {
            window.addEventListener('online', this.handleOnline);
            window.addEventListener('offline', this.handleOffline);

            // Defer initialization
            setTimeout(() => {
                try {
                    this.updatePendingChangesCount(); // Initial count

                    // Subscribe to DB changes
                    this.unsubscribeDbChanges = subscribeToDbChanges(() => {
                        // Add a very short delay to allow IndexedDB writes to settle
                        setTimeout(() => {
                            this.updatePendingChangesCount();
                            this.triggerDebouncedPush(); // Trigger sync on DB change
                        }, 50);
                    });

                    // Start periodic check timer
                    this._periodicCheckTimer = setInterval(
                        this.periodicSyncCheck,
                        PERIODIC_CHECK_INTERVAL_MS
                    );

                    // Initial check in case changes exist on load
                    this.periodicSyncCheck();

                } catch (err) {
                    console.error("HominioSync deferred initialization error:", err);
                    this.setSyncError("Sync service failed to initialize correctly.");
                }
            }, 0);
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

    /**
     * Checks periodically if there are pending changes and triggers a push if needed.
     */
    private periodicSyncCheck = async () => {
        const currentStatus = get(status);
        if (!currentStatus.isOnline || currentStatus.isSyncing) {
            return; // Don't check if offline or already syncing
        }

        try {
            const pendingDocs = await hominioDB.getDocumentsWithLocalChanges();
            if (pendingDocs.length > 0) {
                console.log(`[Sync] Periodic check found ${pendingDocs.length} pending changes. Triggering push.`); // Keep Log for debugging
                this.triggerDebouncedPush(); // Use the same debounced trigger
            }
        } catch (err) {
            console.error("[Sync] Error during periodic check:", err); // Keep Error Log
        }
    };

    /**
     * Triggers a push to the server after a debounce period and respecting cooldown.
     */
    private triggerDebouncedPush = () => {
        if (!browser) return;

        // Clear existing debounce timer
        if (this._syncDebounceTimer) {
            clearTimeout(this._syncDebounceTimer);
        }

        this._syncDebounceTimer = setTimeout(async () => {
            const currentStatus = get(status);
            if (!currentStatus.isOnline || currentStatus.isSyncing) {
                console.log("[Sync] Debounced push skipped: Offline or already syncing."); // Keep Log for debugging
                return; // Don't push if offline or already syncing
            }

            const now = Date.now();
            if (now - this._lastPushAttemptTime < PUSH_COOLDOWN_MS) {
                console.log("[Sync] Debounced push skipped: Cooldown active."); // Keep Log for debugging
                // Optional: Schedule another check after cooldown?
                // setTimeout(this.triggerDebouncedPush, PUSH_COOLDOWN_MS - (now - this._lastPushAttemptTime));
                return;
            }

            console.log("[Sync] Debounced push executing..."); // Keep Log for debugging
            this._lastPushAttemptTime = now; // Record attempt time
            const user = getMe();
            // Check again for pending changes right before pushing
            const pendingDocs = await hominioDB.getDocumentsWithLocalChanges();
            if (pendingDocs.length > 0 && currentStatus.isOnline && !get(status).isSyncing) {
                this.pushToServer(user).catch(err => console.error('[Sync] Debounced auto-sync failed:', err));
            } else {
                console.log("[Sync] Debounced push skipped: No pending changes or state changed."); // Keep Log for debugging
            }

        }, PUSH_DEBOUNCE_MS);
    };


    // --- Push Implementation ---
    async pushToServer(user: CapabilityUser | null) {
        // Basic checks moved to triggerDebouncedPush, but keep a final guard
        if (!browser || !get(status).isOnline || get(status).isSyncing) {
            console.warn("[Push] Push attempt blocked: Offline, not browser, or already syncing."); // Keep warning
            return;
        }

        // Ensure pending changes count is up-to-date before starting
        await this.updatePendingChangesCount();
        if (get(status).pendingLocalChanges === 0) {
            console.log("[Push] Push skipped: No pending changes detected before starting."); // Keep log
            return; // Exit if no changes found right before starting
        }

        this.setSyncStatus(true);
        this.setSyncError(null); // Clear previous errors
        let overallPushError: string | null = null; // Track first error encountered
        console.log(`[Push] Starting push. Initial pending count: ${get(status).pendingLocalChanges}`); // Keep Log

        // Use a temporary set to track docs being processed in *this specific run*
        const docsInThisPush = new Set<string>();


        try {
            // --- Stage 1: Identify Syncable Docs and Gather Required Content CIDs ---
            console.log("[Push Stage 1] Identifying syncable documents and required content..."); // Keep Log
            const initialLocalDocsToSync = await hominioDB.getDocumentsWithLocalChanges();
            if (initialLocalDocsToSync.length === 0) {
                this.setSyncStatus(false);
                console.log("[Push] Push aborted: No pending changes found after acquiring sync status.");
                return;
            }

            const docsToProcess: Array<{
                doc: Docs; // Original doc from DB query
                refreshedDoc: Docs; // Doc state refreshed before processing
                needsCreation: boolean; // Flag if it needs creation vs update
                docPushError: string | null; // Track errors specific to this doc *during identification*
            }> = [];
            const requiredContent = new Map<string, { type: 'snapshot' | 'update', docPubKey: string }>(); // Map CID -> { type, docPubKey }


            for (const doc of initialLocalDocsToSync) {
                // Avoid processing if already locked by another concurrent push (should be rare with single instance)
                if (this.syncingDocs.has(doc.pubKey)) {
                    console.log(`[Push Stage 1] Skipping ${doc.pubKey}: Already being synced (concurrent lock).`); // Keep Log
                    continue;
                }

                let identifiedDocError: string | null = null;
                let needsCreation = false;
                let refreshedDoc: Docs | null = null;

                try {
                    // Lock this doc for this push run
                    docsInThisPush.add(doc.pubKey);
                    this.syncingDocs.add(doc.pubKey); // Add to main lock set

                    if (!canWrite(user, doc)) {
                        console.warn(`[Push Stage 1] Permission denied for ${doc.pubKey}. Skipping.`); // Keep warning
                        identifiedDocError = "Permission denied"; // Mark as error for this doc
                        docsToProcess.push({ doc, refreshedDoc: doc, needsCreation: false, docPushError: identifiedDocError });
                        continue;
                    }

                    // Refresh doc state right before check
                    refreshedDoc = await hominioDB.getDocument(doc.pubKey);
                    if (!refreshedDoc || !refreshedDoc.localState || (!refreshedDoc.localState.snapshotCid && (!refreshedDoc.localState.updateCids || refreshedDoc.localState.updateCids.length === 0))) {
                        console.warn(`[Push Stage 1] Skipping ${doc.pubKey}: No local changes found in refreshed doc or doc disappeared.`); // Keep warning
                        identifiedDocError = "No local changes found or doc disappeared";
                        // Still push to docsToProcess to ensure lock is released later
                        docsToProcess.push({ doc, refreshedDoc: refreshedDoc ?? doc, needsCreation: false, docPushError: identifiedDocError });
                        continue;
                    }

                    // Check server existence
                    let docExistsOnServer = false;
                    try {
                        const checkResult = await hominio.api.docs({ pubKey: doc.pubKey }).get();
                        const response = checkResult as ApiResponse<unknown>;
                        if (response.error && response.error.status !== 404) {
                            console.error(`[Push Stage 1] Server error checking existence for ${doc.pubKey}:`, response.error); // Keep error
                            throw new Error(`Server error checking existence: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                        }
                        docExistsOnServer = !response.error;
                    } catch (err) {
                        console.warn(`[Push Stage 1] Error checking existence for ${doc.pubKey}:`, err); // Keep warning
                        identifiedDocError = `Existence check failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
                        // Continue gathering content CIDs even if check fails? Or mark as error and skip? Let's skip gathering if check fails.
                        docsToProcess.push({ doc, refreshedDoc, needsCreation: false, docPushError: identifiedDocError });
                        continue;
                    }

                    // Determine action and gather CIDs
                    if (!docExistsOnServer) {
                        needsCreation = true;
                        if (refreshedDoc.localState.snapshotCid) {
                            if (!requiredContent.has(refreshedDoc.localState.snapshotCid)) {
                                requiredContent.set(refreshedDoc.localState.snapshotCid, { type: 'snapshot', docPubKey: doc.pubKey });
                            }
                        } else {
                            console.warn(`[Push Stage 1] Doc ${doc.pubKey} needs creation but has no local snapshot CID.`); // Keep warning
                            identifiedDocError = "Missing snapshot CID for creation";
                        }
                    } else {
                        // Needs update (or potentially no-op if only snapshot existed and server has it)
                        needsCreation = false;
                        if (refreshedDoc.localState.updateCids && refreshedDoc.localState.updateCids.length > 0) {
                            refreshedDoc.localState.updateCids.forEach(cid => {
                                if (!requiredContent.has(cid)) {
                                    requiredContent.set(cid, { type: 'update', docPubKey: doc.pubKey });
                                }
                            });
                        }
                    }

                    // Add to list for processing in Stage 3
                    docsToProcess.push({ doc, refreshedDoc, needsCreation, docPushError: identifiedDocError });

                } catch (outerIdentError) {
                    console.error(`[Push Stage 1] Outer error identifying doc ${doc.pubKey}:`, outerIdentError); // Keep error
                    identifiedDocError = `Failed to identify ${doc.pubKey}: ${outerIdentError instanceof Error ? outerIdentError.message : 'Unknown error'}`;
                    // Ensure it's added to docsToProcess so lock gets released
                    docsToProcess.push({ doc, refreshedDoc: refreshedDoc ?? doc, needsCreation: false, docPushError: identifiedDocError });
                }
            } // End loop over initialLocalDocsToSync

            console.log(`[Push Stage 1] Identified ${docsToProcess.length} docs for potential processing. Required unique content items: ${requiredContent.size}`); // Keep Log

            // --- Stage 2: Fetch and Batch Upload Content ---
            let uploadedCids = new Set<string>();
            let batchUploadError: string | null = null;
            if (requiredContent.size > 0) {
                console.log(`[Push Stage 2] Fetching binary data for ${requiredContent.size} content items...`); // Keep Log
                const contentToFetch = Array.from(requiredContent.keys());
                const fetchedRawContent = new Map<string, Uint8Array>();
                let fetchErrors = 0;

                const fetchPromises = contentToFetch.map(async (cid) => {
                    try {
                        const data = await hominioDB.getRawContent(cid);
                        if (data) {
                            fetchedRawContent.set(cid, data);
                        } else {
                            console.warn(`[Push Stage 2] Local content data missing for CID ${cid} (required by ${requiredContent.get(cid)?.docPubKey}).`); // Keep warning
                            fetchErrors++;
                        }
                    } catch (fetchErr) {
                        console.error(`[Push Stage 2] Error fetching local content for CID ${cid}:`, fetchErr); // Keep error
                        fetchErrors++;
                    }
                });
                await Promise.all(fetchPromises);

                console.log(`[Push Stage 2] Fetched ${fetchedRawContent.size} content items locally. ${fetchErrors} fetch errors.`); // Keep Log

                if (fetchedRawContent.size > 0) {
                    console.log(`[Push Stage 2] Batch uploading ${fetchedRawContent.size} content items...`); // Keep Log
                    const itemsToUpload = Array.from(fetchedRawContent.entries()).map(([cid, binaryData]) => ({
                        cid,
                        type: requiredContent.get(cid)!.type, // Assume type exists from requiredContent map
                        binaryData: Array.from(binaryData) // Convert Uint8Array to number[] for API
                    }));

                    try {
                        // @ts-expect-error Property 'batch' does not exist on type '...'
                        const contentResult = await hominio.api.content.batch.upload.post({ items: itemsToUpload });
                        if (contentResult.error) {
                            console.error(`[Push Stage 2] Server error during batch content upload:`, contentResult.error); // Keep error
                            throw new Error(`Batch content upload failed: ${contentResult.error.value?.message ?? 'Unknown server error'}`);
                        }
                        // Assume success means all CIDs in the batch are now available server-side
                        uploadedCids = new Set(fetchedRawContent.keys());
                        console.log(`[Push Stage 2] Batch content upload successful for ${uploadedCids.size} CIDs.`); // Keep Log
                    } catch (uploadErr) {
                        console.error(`[Push Stage 2] Batch content upload failed:`, uploadErr); // Keep error
                        batchUploadError = `Batch content upload failed: ${uploadErr instanceof Error ? uploadErr.message : 'Network or unknown error'}`;
                        overallPushError = batchUploadError; // Mark overall push as failed if batch upload fails
                    }
                } else if (fetchErrors > 0) {
                    // If we needed content but couldn't fetch any of it locally
                    batchUploadError = "Failed to fetch required local content for upload.";
                    overallPushError = batchUploadError;
                    console.error(`[Push Stage 2] ${batchUploadError}`); // Keep error
                } else {
                    console.log("[Push Stage 2] No content needed fetching/uploading."); // Keep log
                }
            } else {
                console.log("[Push Stage 2] No required content identified in Stage 1."); // Keep Log
            }

            // --- Stage 3: Process Documents (Creation/Update Registration) ---
            console.log(`[Push Stage 3] Processing ${docsToProcess.length} documents individually...`); // Keep Log

            // Abort processing if batch upload critically failed and was needed
            if (batchUploadError && requiredContent.size > 0) {
                console.error("[Push Stage 3] Aborting document processing due to critical batch upload failure."); // Keep error
            } else {
                for (const { doc, refreshedDoc, needsCreation, docPushError: initialDocError } of docsToProcess) {
                    let docProcessingError: string | null = initialDocError; // Start with errors from Stage 1
                    let needsLocalUpdate = false;
                    const syncedCids: { snapshot?: string; updates?: string[]; serverConsolidated?: boolean; newServerSnapshotCid?: string } = {};

                    // Skip processing if already marked with error from Stage 1 or batch upload error relevant to it
                    if (docProcessingError) {
                        console.warn(`[Push Stage 3] Skipping processing for ${doc.pubKey} due to initial error: ${docProcessingError}`); // Keep warning
                    } else if (batchUploadError && ((needsCreation && !uploadedCids.has(refreshedDoc.localState?.snapshotCid ?? '')) || (!needsCreation && refreshedDoc.localState?.updateCids?.some(cid => !uploadedCids.has(cid))))) {
                        // If batch upload failed AND this doc relied on it
                        console.warn(`[Push Stage 3] Skipping processing for ${doc.pubKey} due to relevant batch upload failure.`); // Keep warning
                        docProcessingError = "Batch upload dependency failed";
                    } else {
                        // Proceed with creation or update registration
                        try {
                            if (needsCreation) {
                                // --- Handle Initial Document Creation ---
                                const localSnapshotCid = refreshedDoc.localState?.snapshotCid;
                                if (!localSnapshotCid) {
                                    // This case should have been caught in Stage 1, but double-check
                                    throw new Error("Missing snapshot CID for creation (Stage 3 check)");
                                }
                                // We assume content is available on server due to batch upload (or was already there)
                                // No need to fetch binaryData again here

                                try {
                                    console.log(`[Push Stage 3] Creating doc ${doc.pubKey} on server...`); // Keep Log
                                    // @ts-expect-error Property 'post' does not exist on type '...'
                                    const createResult = await hominio.api.docs.post({
                                        pubKey: doc.pubKey,
                                        // Send only the necessary info, server uses content store
                                        initialSnapshotCid: localSnapshotCid // Assuming API accepts CID directly? ** Needs API confirmation **
                                        // OR if API still requires binary: This approach is invalidated.
                                        // binarySnapshot: Array.from(fetchedRawContent.get(localSnapshotCid)!) // Less ideal
                                    });
                                    // TODO: Adjust the .post call based on actual API capabilities for creation using existing content CID

                                    if (createResult.error) {
                                        console.error(`[Push Stage 3] Server error creating doc ${doc.pubKey}:`, createResult.error); // Keep error
                                        throw new Error(`Server error creating doc: ${createResult.error.value?.message ?? 'Unknown error'}`);
                                    }

                                    syncedCids.snapshot = localSnapshotCid;
                                    needsLocalUpdate = true;
                                    console.log(`[Push Stage 3] Successfully created doc ${doc.pubKey} on server.`); // Keep Log
                                } catch (creationErr) {
                                    console.error(`[Push Stage 3] Error creating doc ${doc.pubKey} on server:`, creationErr); // Keep error
                                    docProcessingError = `Document creation failed: ${creationErr instanceof Error ? creationErr.message : 'Unknown error'}`;
                                }
                            } else {
                                // --- Sync Updates ---
                                const localUpdateCids = refreshedDoc.localState?.updateCids?.filter(cid => !!cid) ?? []; // Ensure valid CIDs

                                if (localUpdateCids.length > 0) {
                                    // Filter out CIDs whose content might have failed local fetch/upload
                                    const updatesToRegister = localUpdateCids.filter(cid => uploadedCids.has(cid) || requiredContent.get(cid) === undefined); // Register if uploaded OR if wasn't required (implies already on server/local)
                                    const skippedUpdateCids = localUpdateCids.filter(cid => !updatesToRegister.includes(cid));
                                    if (skippedUpdateCids.length > 0) {
                                        console.warn(`[Push Stage 3] Skipping registration of ${skippedUpdateCids.length} update CIDs for ${doc.pubKey} due to content fetch/upload issues: ${skippedUpdateCids.join(', ')}`); // Keep warning
                                    }

                                    if (updatesToRegister.length > 0) {
                                        try {
                                            console.log(`[Push Stage 3] Registering ${updatesToRegister.length} update(s) for ${doc.pubKey}...`); // Keep Log
                                            // @ts-expect-error Property 'update' does not exist on type '...'
                                            const registerResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({ updateCids: updatesToRegister });
                                            if (registerResult.error) {
                                                console.error(`[Push Stage 3] Server error registering updates for ${doc.pubKey}:`, registerResult.error); // Keep error
                                                throw new Error(`Server error registering updates: ${registerResult.error.value?.message ?? 'Unknown error'}`);
                                            }

                                            // Check for Server-Side Consolidation
                                            let serverConsolidated = false;
                                            let newServerSnapshotCid: string | undefined = undefined;
                                            const snapshotInfo = registerResult.data?.snapshotInfo;
                                            if (snapshotInfo?.success && snapshotInfo?.newSnapshotCid) {
                                                serverConsolidated = true;
                                                newServerSnapshotCid = snapshotInfo.newSnapshotCid;
                                                syncedCids.snapshot = newServerSnapshotCid; // Server snapshot becomes the new base
                                                console.log(`[Push Stage 3] Server consolidated updates for ${doc.pubKey} into new snapshot ${newServerSnapshotCid}`); // Keep Log
                                            }

                                            syncedCids.updates = updatesToRegister; // Only mark registered CIDs as synced
                                            needsLocalUpdate = true;
                                            syncedCids.serverConsolidated = serverConsolidated;
                                            syncedCids.newServerSnapshotCid = newServerSnapshotCid;

                                        } catch (err) {
                                            console.error(`[Push Stage 3] Error registering updates for ${doc.pubKey}:`, err); // Keep error
                                            docProcessingError = `Update registration failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
                                        }
                                    } else {
                                        console.log(`[Push Stage 3] No valid updates to register for ${doc.pubKey} after filtering.`); // Keep Log
                                    }
                                } else {
                                    console.log(`[Push Stage 3] No local update CIDs found for existing doc ${doc.pubKey}.`); // Keep Log
                                }
                            }

                        } catch (processErr) {
                            console.error(`[Push Stage 3] Error processing document ${doc.pubKey}:`, processErr); // Keep error
                            docProcessingError = `Failed processing doc: ${processErr instanceof Error ? processErr.message : 'Unknown error'}`;
                        }
                    } // End else block for processing

                    // --- Update local state if anything was synced successfully FOR THIS DOC ---
                    if (needsLocalUpdate && !docProcessingError) {
                        try {
                            await hominioDB.updateDocStateAfterSync(doc.pubKey, {
                                snapshotCid: syncedCids.snapshot,
                                updateCids: syncedCids.updates,
                                serverConsolidated: syncedCids.serverConsolidated,
                                newServerSnapshotCid: syncedCids.newServerSnapshotCid
                            });
                            console.log(`[Push Stage 3] Successfully updated local state for ${doc.pubKey} after sync.`); // Keep Log
                        } catch (updateStateErr) {
                            console.error(`[Push Stage 3] Error updating local state for ${doc.pubKey} after sync:`, updateStateErr); // Keep error
                            // Don't overwrite the processing error, but log this one too
                            if (!docProcessingError) docProcessingError = `Local state update failed: ${updateStateErr instanceof Error ? updateStateErr.message : 'Unknown error'}`;
                        }
                    } else if (docProcessingError) {
                        console.error(`[Push Stage 3] Skipping local state update for ${doc.pubKey} due to processing error: ${docProcessingError}`); // Keep Error
                    } else {
                        // No sync needed or performed for this doc in this cycle
                        // console.log(`[Push Stage 3] No local state update needed for ${doc.pubKey}.`);
                    }

                    // Store the first *processing* error encountered during the loop
                    if (docProcessingError && !overallPushError) {
                        // Only set overall error if it wasn't already set by batch upload failure
                        overallPushError = docProcessingError;
                    }

                } // End loop over docsToProcess
            } // End else block (skip processing if batch failed)


            // --- Stage 4: Final Checks and Cleanup ---
            console.log("[Push Stage 4] Final checks and cleanup..."); // Keep Log
            await this.updatePendingChangesCount(); // Update count after sync attempt
            const stillPending = get(status).pendingLocalChanges;
            if (stillPending > 0) {
                console.warn(`[Push Stage 4] ${stillPending} documents still have pending changes after push cycle completed.`); // Keep warning
            } else if (!overallPushError) {
                // Only mark as fully synced if no errors occurred *and* no pending changes remain
                console.log(`[Push Stage 4] Push cycle completed successfully. No more pending local changes found.`); // Keep Log
                status.update(s => ({ ...s, lastSynced: new Date() }));
            } else {
                console.log(`[Push Stage 4] Push cycle completed, but with errors or remaining changes. Error: ${overallPushError ?? 'None'}, Pending: ${stillPending}`); // Keep Log
            }

        } catch (err) { // Catch errors in the overall process (e.g., loading initial local changes)
            console.error('[Push] Top-level error during push to server process:', err); // Keep error
            if (!overallPushError) { // Avoid overwriting more specific errors
                overallPushError = err instanceof Error ? err.message : 'Push to server failed (unknown top-level error)';
            }
        } finally {
            // Release locks for all docs attempted in this run
            docsInThisPush.forEach(pubKey => this.syncingDocs.delete(pubKey));
            console.log(`[Push Finally] Released ${docsInThisPush.size} sync locks.`); // Keep Log

            if (overallPushError) {
                this.setSyncError(overallPushError);
                console.error(`[Push Finally] Push finished with error: ${overallPushError}`); // Keep Error Log
            }

            this.setSyncStatus(false);
            // Update count one last time in finally
            await this.updatePendingChangesCount();
            console.log(`[Push Finally] Push process finished. isSyncing: false, Pending changes: ${get(status).pendingLocalChanges}`); // Keep Log
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

        console.log(`[Pull Content] Starting batch sync for ${contentItems.length} items.`); // Keep Log

        try {
            const allCids = contentItems.map(item => item.cid);

            // 1. Check local existence using hominioDB
            const existingLocalCids = await hominioDB.batchCheckContentExists(allCids);
            console.log(`[Pull Content] ${existingLocalCids.size} CIDs already exist locally.`); // Keep Log

            // 2. Filter to content we need to fetch
            const cidsToFetch = contentItems.filter(item => !existingLocalCids.has(item.cid))
                .map(item => item.cid);

            // Add already existing local CIDs to the success set
            existingLocalCids.forEach(cid => successfullySavedCids.add(cid));

            if (cidsToFetch.length === 0) {
                console.log(`[Pull Content] Batch sync complete: All content already local.`); // Keep Log
                return successfullySavedCids;
            }
            console.log(`[Pull Content] Need to fetch ${cidsToFetch.length} CIDs from server.`); // Keep Log

            // 3. Check server existence (robustly)
            const existingServerCids = new Set<string>();
            try {
                console.log(`[Pull Content] Checking server existence for ${cidsToFetch.length} CIDs...`); // Keep Log
                // @ts-expect-error Eden Treaty doesn't fully type nested batch route POST bodies
                const checkResult = await hominio.api.content.batch.exists.post({ cids: cidsToFetch });
                const response = checkResult as ApiResponse<{ results: Array<{ cid: string, exists: boolean }> }>;

                if (response.error) {
                    throw new Error(`Server Error checking content existence: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                }
                for (const result of response.data.results) {
                    if (result.exists) {
                        existingServerCids.add(result.cid);
                    } else {
                        console.warn(`[Pull Content] CID ${result.cid} does not exist on server.`); // Keep warning
                    }
                }
                console.log(`[Pull Content] ${existingServerCids.size} of the required CIDs exist on server.`); // Keep Log
            } catch (err) {
                console.error('[Pull Content] Failed to check content existence on server:', err);
                this.setSyncError(`Content check failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                // Decide if we should stop or continue with potentially incomplete data
                // return successfullySavedCids; // Option: Abort if check fails
            }

            // 4. Fetch binary content for each existing CID (robustly)
            const cidsToActuallyFetch = Array.from(existingServerCids);
            if (cidsToActuallyFetch.length === 0) {
                console.log(`[Pull Content] No content to fetch from server after existence check.`); // Keep Log
                return successfullySavedCids;
            }

            console.log(`[Pull Content] Fetching binary data for ${cidsToActuallyFetch.length} CIDs...`); // Keep Log
            const fetchPromises = cidsToActuallyFetch.map(async (cid) => {
                try {
                    const contentItemMeta = contentItems.find(item => item.cid === cid)!;
                    // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route GETs
                    const binaryResponseResult = await hominio.api.content({ cid }).binary.get();
                    const binaryResponse = binaryResponseResult as ApiResponse<{ binaryData: number[] }>;

                    if (binaryResponse.error) {
                        if (binaryResponse.error.status === 404) {
                            console.warn(`[Pull Content] Server returned 404 for CID ${cid} during fetch (expected existing).`); // Keep warning
                            return null;
                        }
                        throw new Error(`Server Error fetching content ${cid}: ${binaryResponse.error.value?.message ?? `Status ${binaryResponse.error.status}`}`);
                    }
                    if (binaryResponse.data?.binaryData) {
                        const binaryData = new Uint8Array(binaryResponse.data.binaryData);
                        return { cid, binaryData, meta: { type: contentItemMeta.type, documentPubKey: contentItemMeta.docPubKey } };
                    } else {
                        console.warn(`[Pull Content] Server response for CID ${cid} lacked binary data.`); // Keep warning
                        return null;
                    }
                } catch (err) {
                    console.error(`[Pull Content] Error fetching content ${cid}:`, err);
                    return null; // Indicate failure for this specific CID
                }
            });

            const fetchedContentResults = await Promise.all(fetchPromises);
            const contentToSave = fetchedContentResults.filter(result => result !== null) as Array<{ cid: string, binaryData: Uint8Array, meta: Record<string, unknown> }>;
            console.log(`[Pull Content] Successfully fetched binary data for ${contentToSave.length} CIDs.`); // Keep Log

            // 5. Save fetched content using hominioDB
            if (contentToSave.length > 0) {
                console.log(`[Pull Content] Saving ${contentToSave.length} fetched content items locally...`); // Keep Log
                const savePromises = contentToSave.map(item =>
                    hominioDB.saveRawContent(item.cid, item.binaryData, item.meta)
                        .then(() => {
                            successfullySavedCids.add(item.cid); // Add CID to success set on successful save
                        })
                        .catch(saveErr => {
                            console.error(`[Pull Content] Failed to save content ${item.cid} locally:`, saveErr);
                        })
                );
                await Promise.all(savePromises);
                console.log(`[Pull Content] Finished saving ${contentToSave.length} items. Total successful CIDs: ${successfullySavedCids.size}`); // Keep Log
            }

        } catch (err) {
            console.error(`[Pull Content] Error syncing content batch:`, err);
            if (!get(status).syncError) { // Avoid overwriting
                this.setSyncError(`Content batch sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }
        console.log(`[Pull Content] Batch sync finished. Returning ${successfullySavedCids.size} successfully saved CIDs.`); // Keep Log
        return successfullySavedCids;
    }

    /**
     * Pull documents from server to local storage
     */
    async pullFromServer() {
        if (!browser || !get(status).isOnline || get(status).isSyncing) {
            console.warn("[Pull] Pull attempt blocked: Offline, not browser, or already syncing."); // Keep warning
            return;
        }
        this.setSyncStatus(true);
        this.setSyncError(null); // Clear previous errors
        console.log("[Pull] Starting pull from server..."); // Keep Log

        try {
            const indexLeafPubKeys = new Set<string>();

            // --- Special Case: Get Facki Meta Document First ---
            if (GENESIS_PUBKEY) {
                console.log("[Pull] Fetching @genesis document..."); // Keep Log
                try {
                    const metaResult = await hominio.api.docs({ pubKey: GENESIS_PUBKEY }).get();
                    const response = metaResult as ApiResponse<unknown>;

                    if (response.error && response.error.status !== 404) {
                        throw new Error(`Server error fetching genesis doc: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                    }

                    if (!response.error) {
                        const genesisMetadata = response.data as ServerDocData;
                        console.log("[Pull] @genesis document found on server."); // Keep Log
                        if (!genesisMetadata || !genesisMetadata.snapshotCid) {
                            console.warn('[Pull] Genesis doc exists on server but missing snapshotCid!');
                        } else {
                            let fetchedGenesisCid = false;
                            const contentCid = genesisMetadata.snapshotCid;
                            console.log(`[Pull] @genesis snapshot CID: ${contentCid}. Fetching content...`); // Keep Log
                            try {
                                // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route GETs
                                const binaryResponseResult = await hominio.api.content({ cid: contentCid }).binary.get();
                                const binaryResponse = binaryResponseResult as ApiResponse<{ binaryData: number[] }>;

                                if (binaryResponse.error) {
                                    throw new Error(`Server error fetching genesis content: ${binaryResponse.error.value?.message ?? `Status ${binaryResponse.error.status}`}`);
                                }

                                if (binaryResponse.data?.binaryData) {
                                    const binaryData = new Uint8Array(binaryResponse.data.binaryData);
                                    try {
                                        await hominioDB.saveRawContent(contentCid, binaryData, { type: 'snapshot', documentPubKey: GENESIS_PUBKEY });
                                        fetchedGenesisCid = true;
                                        console.log(`[Pull] Successfully fetched and saved @genesis content ${contentCid}.`); // Keep Log
                                    } catch (saveErr) {
                                        console.error('[Pull] Error saving genesis content to IndexedDB:', saveErr);
                                    }
                                } else {
                                    console.warn(`[Pull] Server response for @genesis content ${contentCid} lacked binary data.`); // Keep warning
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
                                    console.log(`[Pull] Successfully saved @genesis metadata locally.`); // Keep Log
                                } catch (saveErr) {
                                    console.error('[Pull] Error saving genesis metadata to IndexedDB:', saveErr);
                                }
                            } else {
                                console.warn(`[Pull] Skipping @genesis metadata save because content ${contentCid} was not fetched/saved.`); // Keep warning
                            }
                        }
                    } else {
                        console.warn('[Pull] Genesis document not found on server.');
                    }
                } catch (err) {
                    console.error('[Pull] Error fetching genesis document:', err);
                    this.setSyncError(`Genesis doc fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    // Decide if we should continue pull without genesis? Depends on importance.
                }

                // Try to find Genesis locally and extract index pubkeys (always try, even if server fetch failed)
                console.log("[Pull] Attempting to parse index keys from local @genesis..."); // Keep Log
                try {
                    const genesisLoro = await hominioDB.getLoroDoc(GENESIS_PUBKEY);
                    if (genesisLoro) {
                        const dataMap = genesisLoro.getMap('data');
                        if (!(dataMap instanceof LoroMap)) {
                            console.warn('[Pull] Local @genesis data is not a LoroMap'); // Keep warning
                        } else {
                            const valueContainer = dataMap.get('value');
                            if (!(valueContainer instanceof LoroMap)) {
                                console.warn('[Pull] Local @genesis data.value is not a LoroMap'); // Keep warning
                            } else {
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
                                    console.log(`[Pull] Found and registered index leaf keys:`, indexPubkeys); // Keep Log
                                } else {
                                    console.warn('[Pull] No valid Index leaf keys found in local @genesis data.value map.');
                                }
                            }
                        }
                    } else {
                        console.warn('[Pull] Could not load @genesis LoroDoc locally to parse index keys.');
                    }
                } catch (parseErr) {
                    console.error('[Pull] Error parsing local @genesis document:', parseErr);
                }
            } else {
                console.log("[Pull] GENESIS_PUBKEY not defined, skipping special @genesis handling."); // Keep Log
            }

            // --- 1. Fetch ALL Server Document Metadata (excluding @genesis if handled) ---
            console.log("[Pull] Fetching document list from server..."); // Keep Log
            let allOtherServerDocs: Docs[] = [];
            try {
                const serverResult = await hominio.api.docs.list.get();
                const response = serverResult as ApiResponse<unknown>;

                if (response.error) {
                    throw new Error(`Server Error fetching doc list: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                }
                if (!Array.isArray(response.data)) {
                    throw new Error(`Invalid data format received for doc list (expected array)`);
                }
                console.log(`[Pull] Received ${response.data.length} total document entries from server.`); // Keep Log

                const mappedData: (Docs | null)[] = response.data
                    .filter((element: unknown) => (element as ServerDocData)?.pubKey !== GENESIS_PUBKEY) // Exclude genesis again just in case
                    .map((element: unknown): Docs | null => {
                        const dbDoc = element as ServerDocData;
                        // Basic validation
                        if (typeof dbDoc !== 'object' || dbDoc === null || typeof dbDoc.pubKey !== 'string' || typeof dbDoc.owner !== 'string') {
                            console.warn('[Pull] Skipping invalid document data from server:', element);
                            return null;
                        }
                        // Ensure updatedAt is a string
                        let updatedAtString: string;
                        if (dbDoc.updatedAt instanceof Date) {
                            updatedAtString = dbDoc.updatedAt.toISOString();
                        } else if (typeof dbDoc.updatedAt === 'string') {
                            // Attempt to parse and reformat for consistency, fallback to original
                            try {
                                updatedAtString = new Date(dbDoc.updatedAt).toISOString();
                            } catch {
                                updatedAtString = dbDoc.updatedAt;
                            }
                        } else {
                            console.warn(`[Pull] Document ${dbDoc.pubKey} has invalid updatedAt type, using current time.`); // Keep warning
                            updatedAtString = new Date().toISOString();
                        }
                        const docResult: Docs = {
                            pubKey: dbDoc.pubKey,
                            owner: dbDoc.owner,
                            updatedAt: updatedAtString,
                            snapshotCid: dbDoc.snapshotCid ?? undefined, // Use undefined for missing
                            updateCids: Array.isArray(dbDoc.updateCids) ? dbDoc.updateCids : [], // Ensure array
                        };
                        return docResult;
                    });
                allOtherServerDocs = mappedData.filter((doc): doc is Docs => doc !== null);
                console.log(`[Pull] Processed ${allOtherServerDocs.length} non-genesis documents from server list.`); // Keep Log

            } catch (err) {
                console.error('[Pull] Failed to fetch document list from server:', err);
                this.setSyncError(`Doc list fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                this.setSyncStatus(false);
                return; // Cannot proceed without the document list
            }

            // --- 2. Fetch Local Document Metadata ---
            console.log("[Pull] Loading local document metadata..."); // Keep Log
            const localDocs = await hominioDB.loadAllDocsReturn();
            const localDocsMap = new Map(localDocs.map(doc => [doc.pubKey, doc]));
            console.log(`[Pull] Loaded ${localDocsMap.size} documents from local DB.`); // Keep Log

            // --- 3. Identify Metadata Changes and Required Content ---
            console.log("[Pull] Comparing server and local metadata, identifying required content..."); // Keep Log
            const allRequiredContentItems: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }> = [];
            const requiredContentCids = new Set<string>(); // Track CIDs we need to avoid duplicates in allRequiredContentItems

            const fackiServerDocsToUpdate: Docs[] = []; // Metadata that needs updating locally (Index leaves)
            const otherServerDocsToUpdate: Docs[] = []; // Metadata that needs updating locally (Others)

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
                    console.warn(`[Pull] Index leaf doc ${indexPubKey} (from meta) not found in server list.`);
                    continue; // Skip if server doesn't know about this index leaf anymore
                }

                const localDoc = localDocsMap.get(serverDoc.pubKey);
                const serverUpdateTime = new Date(serverDoc.updatedAt).getTime();
                const localUpdateTime = localDoc ? new Date(localDoc.updatedAt).getTime() : 0;

                // More robust comparison, handling potentially undefined updateCids
                const serverUpdatesStr = JSON.stringify(serverDoc.updateCids?.sort() ?? []);
                const localUpdatesStr = JSON.stringify(localDoc?.updateCids?.sort() ?? []);

                const needsUpdate = !localDoc ||
                    isNaN(serverUpdateTime) || isNaN(localUpdateTime) || serverUpdateTime > localUpdateTime || // Handle invalid dates defensively
                    serverDoc.snapshotCid !== localDoc.snapshotCid ||
                    serverUpdatesStr !== localUpdatesStr ||
                    serverDoc.owner !== localDoc.owner;

                if (needsUpdate) {
                    fackiServerDocsToUpdate.push(serverDoc);
                    // console.log(`[Pull Debug] Index ${serverDoc.pubKey} needs update. Server: ${serverUpdateTime}, Local: ${localUpdateTime}, Snapshot: ${serverDoc.snapshotCid} vs ${localDoc?.snapshotCid}, Updates: ${serverUpdatesStr} vs ${localUpdatesStr}`);
                }

                addRequiredContent(serverDoc); // Always check for required content, even if metadata matches (local content might be missing)
            }

            // Process remaining (non-Facki) documents
            for (const serverDoc of allOtherServerDocs) {
                if (indexLeafPubKeys.has(serverDoc.pubKey)) continue; // Already processed

                const localDoc = localDocsMap.get(serverDoc.pubKey);
                const serverUpdateTime = new Date(serverDoc.updatedAt).getTime();
                const localUpdateTime = localDoc ? new Date(localDoc.updatedAt).getTime() : 0;

                const serverUpdatesStr = JSON.stringify(serverDoc.updateCids?.sort() ?? []);
                const localUpdatesStr = JSON.stringify(localDoc?.updateCids?.sort() ?? []);

                const needsUpdate = !localDoc ||
                    isNaN(serverUpdateTime) || isNaN(localUpdateTime) || serverUpdateTime > localUpdateTime ||
                    serverDoc.snapshotCid !== localDoc.snapshotCid ||
                    serverUpdatesStr !== localUpdatesStr ||
                    serverDoc.owner !== localDoc.owner;

                if (needsUpdate) {
                    otherServerDocsToUpdate.push(serverDoc);
                    // console.log(`[Pull Debug] Doc ${serverDoc.pubKey} needs update. Server: ${serverUpdateTime}, Local: ${localUpdateTime}, Snapshot: ${serverDoc.snapshotCid} vs ${localDoc?.snapshotCid}, Updates: ${serverUpdatesStr} vs ${localUpdatesStr}`);
                }

                addRequiredContent(serverDoc); // Always check for required content
            }

            console.log(`[Pull] Identified ${fackiServerDocsToUpdate.length} index documents and ${otherServerDocsToUpdate.length} other documents needing metadata updates.`); // Keep Log
            console.log(`[Pull] Identified ${allRequiredContentItems.length} total potentially required content items (before checking local existence).`); // Keep Log

            // --- 4. Fetch All Required Content FIRST ---
            let successfullyFetchedCids = new Set<string>();
            if (allRequiredContentItems.length > 0) {
                console.log("[Pull] Starting batch content fetch..."); // Keep Log
                try {
                    successfullyFetchedCids = await this.syncContentBatchFromServer(allRequiredContentItems);
                    console.log(`[Pull] Batch content fetch completed. Successfully fetched/verified ${successfullyFetchedCids.size} CIDs locally.`); // Keep Log
                } catch (contentSyncErr) {
                    console.error("[Pull] Error occurred during content batch sync:", contentSyncErr);
                    if (!get(status).syncError) {
                        this.setSyncError(`Content sync potentially incomplete: ${contentSyncErr instanceof Error ? contentSyncErr.message : 'Unknown error'}`);
                    }
                    // Decide if we should stop here or proceed with potentially missing content
                    // this.setSyncStatus(false); return; // Option: stop if content fetch fails significantly
                }
            } else {
                console.log("[Pull] No content items required fetching."); // Keep Log
            }

            // --- 5. Save Updated Metadata Locally (Facki indices first, then others) ---
            console.log("[Pull] Saving updated metadata locally..."); // Keep Log
            const processMetadataSave = async (docsToSave: Docs[], type: string) => {
                let savedCount = 0;
                let skippedCount = 0;
                for (const serverDocToSave of docsToSave) {
                    try {
                        // CRITICAL CHECK: Ensure required snapshot content is available locally before saving metadata
                        if (serverDocToSave.snapshotCid && !successfullyFetchedCids.has(serverDocToSave.snapshotCid)) {
                            console.warn(`[Pull] Skipping metadata save for ${serverDocToSave.pubKey} because required snapshot ${serverDocToSave.snapshotCid} was not successfully fetched/saved.`);
                            if (!get(status).syncError) { // Report first encountered missing content issue
                                this.setSyncError(`Pull incomplete: Missing snapshot content for ${serverDocToSave.pubKey}`);
                            }
                            skippedCount++;
                            continue; // DO NOT SAVE METADATA IF SNAPSHOT IS MISSING
                        }
                        // Optional Check: Also check for update CIDs? Less critical than snapshot usually.
                        // const missingUpdate = serverDocToSave.updateCids?.some(cid => !successfullyFetchedCids.has(cid));
                        // if(missingUpdate) { ... log warning, maybe skip }

                        await hominioDB.saveSyncedDocument(serverDocToSave);
                        savedCount++;
                    } catch (saveErr) {
                        console.error(`[Pull] Failed to save synced doc metadata ${serverDocToSave.pubKey} locally:`, saveErr);
                        if (!get(status).syncError) { // Report first encountered save error
                            this.setSyncError(`Metadata save failed for ${serverDocToSave.pubKey}: ${saveErr instanceof Error ? saveErr.message : 'Unknown error'}`);
                        }
                        skippedCount++; // Also count save errors as skipped/failed
                    }
                }
                console.log(`[Pull] Finished saving ${type} metadata. Saved: ${savedCount}, Skipped/Failed: ${skippedCount}`); // Keep Log
            };

            await processMetadataSave(fackiServerDocsToUpdate, "index");
            await processMetadataSave(otherServerDocsToUpdate, "other");

            // --- 6. Cleanup Logic ---
            console.log("[Pull] Starting local content cleanup..."); // Keep Log
            try {
                // Reload ALL docs metadata *after* saving updates
                const refreshedLocalDocs = await hominioDB.loadAllDocsReturn();
                const stillReferencedCids = new Set<string>();

                // Gather CIDs referenced by the current state (synced and local-only)
                refreshedLocalDocs.forEach(doc => {
                    // Synced state
                    if (doc.snapshotCid) stillReferencedCids.add(doc.snapshotCid);
                    doc.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                    // Local-only state
                    if (doc.localState?.snapshotCid) stillReferencedCids.add(doc.localState.snapshotCid);
                    doc.localState?.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                });
                console.log(`[Pull Cleanup] Found ${stillReferencedCids.size} CIDs referenced by current document states.`); // Keep Log

                // Get all CIDs currently in the raw content store
                const cidsInContentStore = (await getContentStorage().getAllKeys()); // Use getAllKeys for efficiency
                console.log(`[Pull Cleanup] Found ${cidsInContentStore.length} CIDs currently in the content store.`); // Keep Log

                const unreferencedCids = cidsInContentStore.filter(
                    (cid: string) => !stillReferencedCids.has(cid)
                );

                if (unreferencedCids.length > 0) {
                    console.log(`[Pull Cleanup] Found ${unreferencedCids.length} unreferenced CIDs. Attempting deletion...`); // Keep Log
                    const contentStorage = getContentStorage();
                    let deleteSuccesses = 0;
                    let deleteFailures = 0;
                    // Delete in chunks to avoid overwhelming IndexedDB? Maybe not needed for simple deletes.
                    const deletePromises = unreferencedCids.map(async (cidToDelete) => {
                        try {
                            await contentStorage.delete(cidToDelete);
                            deleteSuccesses++;
                        } catch (deleteErr) {
                            deleteFailures++;
                            console.error(`[Pull Cleanup] Deletion error for CID ${cidToDelete} (ignored):`, deleteErr);
                        }
                    });
                    await Promise.all(deletePromises);

                    if (deleteFailures > 0) {
                        console.warn(`[Pull Cleanup] ${deleteFailures} unreferenced items failed to delete.`);
                    }
                    console.log(`[Pull Cleanup] Deletion complete. Success: ${deleteSuccesses}, Failures: ${deleteFailures}`); // Keep Log
                } else {
                    console.log(`[Pull Cleanup] No unreferenced CIDs found to delete.`); // Keep Log
                }
            } catch (cleanupErr) {
                console.error("[Pull] Error during local content cleanup:", cleanupErr);
                // Don't set syncError here usually, as cleanup failure is less critical than pull failure
            }
            // --- Cleanup Logic End ---

            // --- 7. Final Status Update ---
            if (!get(status).syncError) {
                console.log("[Pull] Pull from server completed successfully."); // Keep Log
                status.update(s => ({ ...s, lastSynced: new Date() }));
            } else {
                console.error("[Pull] Pull from server completed with errors:", get(status).syncError);
            }

        } catch (err: unknown) {
            console.error('Error during pull from server:', err);
            if (!get(status).syncError) { // Avoid overwriting more specific errors
                this.setSyncError(err instanceof Error ? err.message : 'Pull from server failed');
            }
        } finally {
            this.setSyncStatus(false); // Always reset syncing status
            // Update pending count *after* pull, as pull might resolve pending states
            await this.updatePendingChangesCount();
            console.log(`[Pull] Pull process finished. isSyncing: false, Pending changes: ${get(status).pendingLocalChanges}`); // Keep Log
        }
    }

    /**
     * Deletes a document locally and attempts deletion on the server.
     * Performs capability checks before proceeding.
     */
    async deleteDocument(user: CapabilityUser | null, pubKey: string): Promise<boolean> {
        if (!browser) return false;
        console.log(`[Sync Delete] Attempting to delete document ${pubKey}...`); // Keep Log

        try {
            // 1. Fetch metadata for capability check
            const docMeta = await hominioDB.getDocument(pubKey);
            if (!docMeta) {
                console.warn(`[Sync Delete] Document ${pubKey} not found locally. Assuming success.`);
                return true; // Consistent with previous logic: success if not found locally
            }

            // 2. Local Capability Check
            if (!canDelete(user, docMeta)) {
                console.warn(`[Sync Delete] Permission denied locally for user to delete doc ${pubKey}.`);
                throw new Error(`Permission denied to delete document ${pubKey}.`);
            }
            console.log(`[Sync Delete] Local permission check passed for ${pubKey}.`); // Keep Log

            // 3. Attempt Server Deletion (Fire-and-forget style, but log results)
            console.log(`[Sync Delete] Attempting server deletion for ${pubKey}...`); // Keep Log
            this.deleteDocumentOnServer(pubKey)
                .then(serverSuccess => {
                    if (serverSuccess) {
                        console.log(`[Sync Delete] Server deletion successful for ${pubKey}.`); // Keep Log
                    } else {
                        // Error/Warning logged within deleteDocumentOnServer or if it returns false explicitly
                        console.warn(`[Sync Delete] Server deletion appears to have failed for ${pubKey} (or returned false), but proceeding with local deletion.`);
                    }
                })
                .catch(err => {
                    // Error logged within deleteDocumentOnServer
                    console.error(`[Sync Delete] Error during server deletion attempt for ${pubKey} (error caught here):`, err); // Keep Error Log
                    // Potentially flag this document for later retry?
                });

            // 4. Local Deletion (using hominioDB) - Proceed even if server delete fails/errors
            console.log(`[Sync Delete] Proceeding with local deletion for ${pubKey}...`); // Keep Log
            const localDeleteSuccess = await hominioDB.deleteDocument(user, pubKey); // Pass user again (hominioDB might re-check)

            if (localDeleteSuccess) {
                console.log(`[Sync Delete] Local deletion successful for ${pubKey}.`); // Keep Log
            } else {
                // This implies hominioDB.deleteDocument failed despite canDelete passing earlier. Should be rare.
                console.error(`[Sync Delete] Local deletion failed for ${pubKey} unexpectedly.`);
                // Throw an error because the intended local action failed.
                throw new Error(`Local deletion failed unexpectedly for ${pubKey}.`);
            }

            return true; // Return true indicating the *local* deletion was initiated and (presumably) succeeded.

        } catch (err) {
            console.error(`[Sync Delete] Error deleting document ${pubKey}:`, err);
            // Set sync error to inform UI
            this.setSyncError(`Delete failed for ${pubKey}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return false; // Return false on any error during the process
        } finally {
            // Update pending changes count after delete attempt
            await this.updatePendingChangesCount();
        }
    }

    /**
     * Private helper to call the server delete endpoint. Returns true if server confirms deletion or doc not found, false otherwise.
     */
    private async deleteDocumentOnServer(pubKey: string): Promise<boolean> {
        // No network check here, assume called when appropriate
        if (!browser) return false; // Should not happen if called correctly

        try {
            // REMOVED: @ts-expect-error Eden Treaty type inference issue - Keep: needed for dynamic route
            const result = await hominio.api.docs({ pubKey }).delete();
            // Type assertion might be needed if Eden doesn't infer well for DELETE
            const response = result as ApiResponse<{ success: boolean; message?: string } | null>; // Allow null data for success cases

            if (response.error) {
                const errorValue = response.error.value;
                let errorMessage = 'Unknown error deleting document';
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }

                if (response.error.status === 404) {
                    console.warn(`[Server Delete] Document ${pubKey} not found on server during delete, considering successful.`);
                    return true; // Treat 404 as success for deletion idempotency
                }
                if (response.error.status === 403) { // Handle permission denied specifically
                    console.error(`[Server Delete] Permission denied by server to delete document ${pubKey}. (Status: 403)`);
                    // Don't throw, let the caller decide, but return false
                    return false;
                }
                // Throw for other server errors
                throw new Error(`Server error deleting document ${pubKey}: ${errorMessage} (Status: ${response.error.status})`);
            }

            // Check success flag if present, otherwise assume success if no error
            const success = response.data?.success ?? (response.error === null);
            if (!success) {
                console.warn(`[Server Delete] Server responded with success=false for ${pubKey}. Message: ${response.data?.message ?? 'N/A'}`);
            }
            return success;

        } catch (err: unknown) {
            console.error(`[Server Delete] Network or unexpected error deleting document ${pubKey} on server:`, err);
            // Don't set global syncError here, let the caller handle it
            // Re-throw might be too aggressive if we want local deletion to proceed
            // throw err; // Option: Re-throw
            return false; // Indicate failure due to error
        }
    }


    // --- Online/Offline Handlers ---
    private handleOnline = () => {
        console.log("HominioSync: Connection restored. Scheduling checks..."); // Keep Log
        status.update(s => ({ ...s, isOnline: true, syncError: null })); // Clear errors on reconnect
        // 1. Immediately trigger a pull
        this.pullFromServer().finally(async () => {
            // 2. After pull completes (or fails), check for and trigger push if needed
            console.log("HominioSync: Pull finished after reconnect. Checking for pending changes..."); // Keep Log
            await this.updatePendingChangesCount(); // Ensure count is fresh
            if (get(status).pendingLocalChanges > 0) {
                console.log("HominioSync: Pending changes found after reconnect and pull. Triggering push..."); // Keep Log
                this.triggerDebouncedPush(); // Use the standard debounced push trigger
            }
            // 3. Ensure periodic check is running (it should restart automatically if interval was cleared)
            if (!this._periodicCheckTimer) {
                console.log("HominioSync: Restarting periodic check timer after reconnect."); // Keep Log
                this._periodicCheckTimer = setInterval(
                    this.periodicSyncCheck,
                    PERIODIC_CHECK_INTERVAL_MS
                );
            }
            // 4. Run an immediate periodic check as well
            this.periodicSyncCheck();
        });
    };

    private handleOffline = () => {
        console.log("HominioSync: Connection lost. Sync paused."); // Keep Log
        status.update(s => ({ ...s, isOnline: false }));
        // Optional: Clear debounce timer when going offline? Prevents immediate push on reconnect if changes happened right before disconnect.
        if (this._syncDebounceTimer) {
            clearTimeout(this._syncDebounceTimer);
            this._syncDebounceTimer = null;
        }
        // Optional: Clear periodic timer? It will fail anyway, but cleaner maybe.
        // if (this._periodicCheckTimer) {
        //     clearInterval(this._periodicCheckTimer);
        //     this._periodicCheckTimer = null;
        // }
    };
    // ------------------------------

    destroy() {
        console.log("HominioSync: Destroying instance..."); // Keep Log
        // Unsubscribe from DB changes
        if (this.unsubscribeDbChanges) {
            this.unsubscribeDbChanges();
            this.unsubscribeDbChanges = null;
        }
        // Remove event listeners
        if (browser) {
            window.removeEventListener('online', this.handleOnline);
            window.removeEventListener('offline', this.handleOffline);
        }
        // Clear timers
        if (this._syncDebounceTimer) {
            clearTimeout(this._syncDebounceTimer);
            this._syncDebounceTimer = null;
        }
        if (this._periodicCheckTimer) {
            clearInterval(this._periodicCheckTimer);
            this._periodicCheckTimer = null;
        }
        console.log("HominioSync: Instance destroyed."); // Keep Log
    }
}

export const hominioSync = new HominioSync();