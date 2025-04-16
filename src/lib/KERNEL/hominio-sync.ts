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
    private unsubscribeNotifier: (() => void) | null = null; // Store the unsubscribe function

    constructor() {
        if (browser) {
            // Defer initialization steps that depend on other modules
            setTimeout(() => {
                try {
                    this.updatePendingChangesCount(); // Initial count

                    // Subscribe to DB changes to keep pending count updated
                    this.unsubscribeNotifier = docChangeNotifier.subscribe(() => {
                        this.updatePendingChangesCount();
                        // --- Trigger Auto-Sync on DB Change ---
                        this.pushToServer(); // Non-blocking call
                        // -------------------------------------
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

        this.setSyncStatus(true);
        this.setSyncError(null); // Clear previous errors
        try {
            const localDocsToSync = await hominioDB.getDocumentsWithLocalChanges();

            if (localDocsToSync.length === 0) {
                return;
            }

            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;

            for (const doc of localDocsToSync) {
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
                    // Use optional chaining and check value for error message
                    docExistsOnServer = !(checkResult as ApiResponse<unknown>).error;
                } catch (err) {
                    console.warn(`Error checking existence for ${doc.pubKey}, assuming does not exist:`, err); // KEEP Warning
                    docExistsOnServer = false;
                }

                let needsLocalUpdate = false;
                let syncedSnapshotCid: string | undefined = undefined;
                const syncedUpdateCids: string[] = [];

                // 1. Sync Snapshot if needed
                if (doc.localState?.snapshotCid) {
                    const localSnapshotCid = doc.localState.snapshotCid;
                    const snapshotData = await hominioDB.getRawContent(localSnapshotCid);

                    if (snapshotData) {
                        try {
                            if (!docExistsOnServer) {
                                // Create doc on server
                                // @ts-expect-error Eden Treaty doesn't fully type dynamic route POST bodies
                                const createResult = await hominio.api.docs.post({ pubKey: doc.pubKey, binarySnapshot: Array.from(snapshotData) });
                                if (createResult.error) throw new Error(`Server error creating doc: ${createResult.error.value?.message ?? 'Unknown error'}`);
                                docExistsOnServer = true;
                            } else {
                                // Update snapshot on existing doc
                                // @ts-expect-error Eden Treaty doesn't fully type dynamic route POST bodies
                                const snapshotResult = await hominio.api.docs({ pubKey: doc.pubKey }).snapshot.post({ binarySnapshot: Array.from(snapshotData) });
                                if (snapshotResult.error && !(snapshotResult.error.value?.message?.includes('duplicate key'))) throw new Error(`Server error updating snapshot: ${snapshotResult.error.value?.message ?? 'Unknown error'}`);
                            }
                            // Mark snapshot as synced
                            syncedSnapshotCid = localSnapshotCid;
                            needsLocalUpdate = true;
                        } catch (err) {
                            console.error(`  - Error pushing snapshot ${localSnapshotCid}:`, err); // KEEP Error Log
                            this.setSyncError(`Snapshot push failed for ${doc.pubKey}`);
                            // Continue to next doc if snapshot fails
                            continue;
                        }
                    } else {
                        console.warn(`  - Could not load local snapshot data for ${localSnapshotCid} via hominioDB.`); // KEEP Warning
                    }
                }

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
                            syncedUpdateCids.push(...updatesToUpload.map(u => u.cid));
                            needsLocalUpdate = true;
                        } catch (err) {
                            console.error(`  - Error pushing updates for ${doc.pubKey}:`, err); // KEEP Error Log
                            this.setSyncError(`Update push failed for ${doc.pubKey}`);
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
                    } catch (err) {
                        console.error(`  - Failed to update local doc state for ${doc.pubKey}:`, err); // KEEP Error Log
                    }
                }
            } // End loop over docs

        } catch (err) {
            console.error('Error during push to server process:', err); // KEEP Error Log
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
                return;
            }

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
                        console.warn(`Error fetching binary data for ${cid}: ${binaryResponse.error.value?.message ?? 'Unknown error'}`); // KEEP Warning
                        return null;
                    }
                    const data = (binaryResponse as ApiResponse<{ binaryData: number[] }>).data;
                    if (data?.binaryData) {
                        const binaryData = new Uint8Array(data.binaryData);
                        return { cid, binaryData, meta: { type: contentItemMeta.type, documentPubKey: contentItemMeta.docPubKey } };
                    } else {
                        console.warn(`No binary data returned for CID ${cid}`); // KEEP Warning
                        return null;
                    }
                } catch (err) {
                    console.error(`Error processing content ${cid}:`, err); // KEEP Error Log
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
            }

        } catch (err) {
            console.error(`Error syncing content batch:`, err); // KEEP Error Log
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

        // Prepare merged doc (logic moved to saveSyncedDocument, just pass server data)
        // The merge logic happens inside hominioDB.saveSyncedDocument now

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

        this.setSyncStatus(true);
        this.setSyncError(null);
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
                await this.syncContentBatchFromServer(Array.from(allRequiredContentCids.entries()).map(([cid, meta]) => ({ cid, ...meta })));
            }

            // --- Cleanup Logic Start ---
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
                const contentStorage = getContentStorage();
                for (const cidToDelete of unreferencedUpdateCids) {
                    try {
                        // Only delete updates, not snapshots, based on this logic
                        await contentStorage.delete(cidToDelete); // Don't need the result
                    } catch (deleteErr) {
                        console.warn(`  - Failed to delete update ${cidToDelete}:`, deleteErr); // KEEP Warning
                    }
                }
            }
            // --- Cleanup Logic End ---

            // Set success status
            // Trigger reactivity AFTER metadata and content sync is complete
            docChangeNotifier.update(n => n + 1);
            this.status.update(s => ({ ...s, lastSynced: new Date() }));

        } catch (err: unknown) {
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
        let serverDeleteSuccessful = false;
        let localDeleteSuccessful = false;

        try {
            // First try to delete on server
            try {
                serverDeleteSuccessful = await this.deleteDocumentOnServer(pubKey);
            } catch { // Remove unused serverErr variable
                // Keep console.error in the inner function deleteDocumentOnServer
            }

            // Then delete locally
            await hominioDB.deleteDocument(pubKey);
            localDeleteSuccessful = true;

            // Consider the operation successful if at least one succeeded
            return serverDeleteSuccessful || localDeleteSuccessful;
        } catch (err) {
            console.error('Error deleting document (local or server):', err); // Log combined error
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
                return true;
            } else {
                throw new Error(`Server failed to delete document: ${response.data?.message || 'Unknown reason'}`);
            }
        } catch (err: unknown) {
            console.error(`Error deleting document on server ${pubKey}:`, err); // KEEP Error Log
            this.setSyncError(err instanceof Error ? err.message : 'Server document deletion failed');
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
                await this.pullFromServer();
            } else {
                throw new Error(`Server failed to create snapshot: ${response.data?.message || 'Unknown reason'}`);
            }

        } catch (err: unknown) { // Type the error
            console.error(`Error creating consolidated snapshot for ${pubKey}:`, err); // KEEP Error Log
            this.setSyncError(err instanceof Error ? err.message : 'Snapshot creation failed');
        } finally {
            this.setSyncStatus(false);
        }
    }

    destroy() {
        if (this.unsubscribeNotifier) {
            this.unsubscribeNotifier();
            this.unsubscribeNotifier = null;
        }
    }
}

export const hominioSync = new HominioSync();
