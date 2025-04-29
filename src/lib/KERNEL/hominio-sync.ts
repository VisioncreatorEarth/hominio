import { writable, get } from 'svelte/store';
import { hominio } from '$lib/KERNEL/hominio-client';
import { hominioDB, docChangeNotifier, triggerDocChangeNotification, type Docs } from '$lib/KERNEL/hominio-db';
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
                        continue;
                    }
                    if (!refreshedDoc.localState ||
                        (!refreshedDoc.localState.snapshotCid &&
                            (!refreshedDoc.localState.updateCids || refreshedDoc.localState.updateCids.length === 0))) {
                        continue;
                    }

                    // --- Restore Actual Server Interaction --- 
                    let docExistsOnServer = false;
                    try {
                        const checkResult = await hominio.api.docs({ pubKey: doc.pubKey }).get();
                        const response = checkResult as ApiResponse<unknown>; // Use defined type

                        if (response.error && response.error.status !== 404) {
                            console.error(`[Push] Server error checking existence for ${doc.pubKey}:`, response.error); // Keep Server error on check
                            throw new Error(`Server error checking existence: ${response.error.value?.message ?? `Status ${response.error.status}`}`);
                        }
                        docExistsOnServer = !response.error; // Exists if no error or 404
                    } catch (err) {
                        console.warn(`[Push] Error checking existence for ${doc.pubKey}:`, err); // Keep Error on check
                        docPushError = `Existence check failed for ${doc.pubKey}: ${err instanceof Error ? err.message : 'Unknown error'}`;
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
                                // @ts-expect-error Property 'post' does not exist on type '...' (Eden Treaty type inference issue)
                                const createResult = await hominio.api.docs.post({
                                    pubKey: doc.pubKey,
                                    binarySnapshot: Array.from(snapshotData)
                                });

                                if (createResult.error) {
                                    console.error(`[Push] Server error creating doc ${doc.pubKey}:`, createResult.error); // Keep Server error on create
                                    throw new Error(`Server error creating doc ${doc.pubKey}: ${createResult.error.value?.message ?? 'Unknown error'}`);
                                }

                                docExistsOnServer = true; // Mark as existing now

                                // Mark this snapshot as synced for local state update
                                syncedCids.snapshot = localSnapshotCid;
                                needsLocalUpdate = true;
                            } catch (creationErr) {
                                console.error(`[Push] Error creating doc ${doc.pubKey} on server:`, creationErr); // Keep Create error
                                docPushError = `Document creation failed: ${creationErr instanceof Error ? creationErr.message : 'Unknown error'}`;
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
                            }
                        }

                        if (updatesToUpload.length > 0) {
                            try {
                                // @ts-expect-error Property 'batch' does not exist on type '...' (Eden Treaty type inference issue)
                                const contentResult = await hominio.api.content.batch.upload.post({ items: updatesToUpload });
                                if (contentResult.error) {
                                    console.error(`[Push] Server error uploading update content for ${doc.pubKey}:`, contentResult.error); // Keep Error uploading content
                                    throw new Error(`Server error uploading update content: ${contentResult.error.value?.message ?? 'Unknown error'}`);
                                }

                                // @ts-expect-error Property 'update' does not exist on type '...' (Eden Treaty type inference issue)
                                const registerResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({ updateCids: updatesToUpload.map(u => u.cid) });
                                if (registerResult.error) {
                                    console.error(`[Push] Server error registering updates for ${doc.pubKey}:`, registerResult.error); // Keep Error registering updates
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
                                }

                                // Mark updates as successfully sent for local state update
                                syncedCids.updates = updatesToUpload.map(u => u.cid);
                                needsLocalUpdate = true;

                                // Pass server consolidation flag
                                syncedCids.serverConsolidated = serverConsolidated; // Add flag here
                                // Pass the new server snapshot CID if consolidation occurred
                                syncedCids.newServerSnapshotCid = newServerSnapshotCid;

                            } catch (err) {
                                console.error(`[Push] Error pushing updates for ${doc.pubKey}:`, err); // Keep Error during update push
                                docPushError = `Update push failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
                            }
                        }
                    } else if (refreshedDoc.localState?.updateCids && refreshedDoc.localState.updateCids.length > 0) {
                        // Do nothing if doc doesn't exist on server for update sync
                    }
                    // --- End Sync Updates ---

                    // --- Update local state if anything was synced successfully ---
                    if (needsLocalUpdate && !docPushError) {
                        try {
                            await hominioDB.updateDocStateAfterSync(doc.pubKey, {
                                snapshotCid: syncedCids.snapshot,
                                updateCids: syncedCids.updates,
                                serverConsolidated: syncedCids.serverConsolidated,
                                newServerSnapshotCid: syncedCids.newServerSnapshotCid
                            });
                        } catch (updateStateErr) {
                            console.error(`[Push] Error updating local state for ${doc.pubKey} after sync:`, updateStateErr); // Keep Error updating local state
                            docPushError = `Local state update failed: ${updateStateErr instanceof Error ? updateStateErr.message : 'Unknown error'}`;
                        }
                    } else if (docPushError) {
                        // Logged error earlier, no state update needed
                    } else {
                        // No sync operations performed or error occurred
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
                // Optional: Log if docs still pending after push attempt
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
            setTimeout(() => {
                try {
                    if (typeof triggerDocChangeNotification === 'function') {
                        triggerDocChangeNotification();
                    } else {
                        console.error("triggerDocChangeNotification is not available");
                        docChangeNotifier.update(n => n + 1);
                    }
                } catch (e) {
                    console.error("Error triggering doc change notification:", e);
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
                    }
                }
            } catch (err) {
                console.error('[Pull Content] Failed to check content existence on server:', err); // Keep error
                this.setSyncError(`Content check failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }

            // 4. Fetch binary content for each existing CID (robustly)
            const fetchPromises = Array.from(existingServerCids).map(async (cid) => {
                try {
                    const contentItemMeta = contentItems.find(item => item.cid === cid)!;
                    // @ts-expect-error Eden Treaty doesn't fully type nested dynamic route GETs
                    const binaryResponseResult = await hominio.api.content({ cid }).binary.get();
                    const binaryResponse = binaryResponseResult as ApiResponse<{ binaryData: number[] }>; // Cast for checking error

                    if (binaryResponse.error) {
                        if (binaryResponse.error.status === 404) {
                            return null;
                        }
                        throw new Error(`Server Error fetching content ${cid}: ${binaryResponse.error.value?.message ?? `Status ${binaryResponse.error.status}`}`);
                    }
                    if (binaryResponse.data?.binaryData) {
                        const binaryData = new Uint8Array(binaryResponse.data.binaryData);
                        return { cid, binaryData, meta: { type: contentItemMeta.type, documentPubKey: contentItemMeta.docPubKey } };
                    } else {
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
                }
            }

            // --- 5. Save Updated Metadata Locally (Facki indices first, then others) ---
            const processMetadataSave = async (docsToSave: Docs[]) => {
                for (const serverDocToSave of docsToSave) {
                    try {
                        if (serverDocToSave.snapshotCid && !successfullyFetchedCids.has(serverDocToSave.snapshotCid)) {
                            console.warn(`[Pull] Skipping metadata save for ${serverDocToSave.pubKey} because required snapshot ${serverDocToSave.snapshotCid} was not fetched/saved.`); // Keep warning
                            if (!get(status).syncError) {
                                this.setSyncError(`Pull incomplete: Missing snapshot content for ${serverDocToSave.pubKey}`);
                            }
                            continue;
                        }
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
                const refreshedLocalDocs = await hominioDB.loadAllDocsReturn();
                const stillReferencedCids = new Set<string>();
                refreshedLocalDocs.forEach(doc => {
                    if (doc.snapshotCid) stillReferencedCids.add(doc.snapshotCid);
                    doc.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                    if (doc.localState?.snapshotCid) stillReferencedCids.add(doc.localState.snapshotCid);
                    doc.localState?.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                });

                const cidsInContentStore = (await getContentStorage().getAll()).map(item => item.key);

                const unreferencedCids = cidsInContentStore.filter(
                    (cid: string) => !stillReferencedCids.has(cid)
                );

                if (unreferencedCids.length > 0) {
                    const contentStorage = getContentStorage();
                    let deleteFailures = 0;
                    for (const cidToDelete of unreferencedCids) {
                        try {
                            await contentStorage.delete(cidToDelete);
                        } catch (deleteErr) {
                            deleteFailures++;
                            console.error("[Pull Cleanup] Deletion error (ignored):", deleteErr); // Log error minimally
                        }
                    }
                    if (deleteFailures > 0) {
                        console.warn(`[Pull Cleanup] ${deleteFailures} unreferenced items failed to delete.`); // Keep warning if needed
                    }
                }
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

            // 3. Attempt Server Deletion
            this.deleteDocumentOnServer(pubKey)
                .then(serverSuccess => {
                    if (!serverSuccess) {
                        console.warn(`[Sync Delete] Server deletion failed for ${pubKey}, proceeding locally.`); // Keep warn
                    }
                })
                .catch(err => {
                    console.error(`[Sync Delete] Error during server deletion attempt for ${pubKey}:`, err); // Keep error
                });

            // 4. Local Deletion (using hominioDB)
            const localDeleteSuccess = await hominioDB.deleteDocument(user, pubKey); // Pass user
            if (localDeleteSuccess) {
                // Local delete successful
            } else {
                console.error(`[Sync Delete] Local deletion failed for ${pubKey} even after capability check.`); // Keep error
                return false;
            }

            return true; // Return true indicating local success

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
        if (!browser || !get(status).isOnline) throw new Error('Offline: Cannot delete document on server.');
        try {
            // REMOVED: @ts-expect-error Eden Treaty type inference issue - Keep: needed for dynamic route
            const result = await hominio.api.docs({ pubKey }).delete();
            const response = result as ApiResponse<{ success: boolean; message?: string }>;

            if (response.error) {
                let errorMessage = 'Unknown error deleting document';
                const errorValue = response.error.value;
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }
                if (response.error.status === 404) {
                    console.warn(`Document ${pubKey} not found on server during delete, considering successful.`); // Keep warn
                    return true;
                }
                throw new Error(`Server error deleting document: ${errorMessage} (Status: ${response.error.status})`);
            }

            return response.data?.success ?? false;

        } catch (err: unknown) {
            console.error(`Error deleting document on server ${pubKey}:`, err); // Keep error
            throw err; // Re-throw for caller
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
            if (get(status).pendingLocalChanges > 0) {
                this.pushToServer(user);
            }
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
