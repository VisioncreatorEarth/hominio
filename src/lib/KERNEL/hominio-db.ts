import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { LoroDoc, LoroMap } from 'loro-crdt';
import { hashService } from './hash-service';
import { docIdService } from './docid-service';
import { getContentStorage, getDocsStorage, initStorage } from './hominio-storage';
import { authClient } from '$lib/KERNEL/hominio-auth'; // Assumed path for auth client
import { canRead, canWrite, type CapabilityUser, canDelete } from './hominio-caps'; // Import capabilities

// --- Reactivity Notifier ---
// Simple store that increments when any tracked document changes.
// Consumed by services like HQL to trigger re-queries.
export const docChangeNotifier = writable(0);
// --------------------------

// Constants
const CONTENT_TYPE_SNAPSHOT = 'snapshot';

// Utility Types (mirrored from hominio-validate)
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

/**
 * Docs interface represents the document registry for tracking and searching
 */
export interface Docs {
    pubKey: string;          // Stable document identity (like IPNS)
    owner: string;           // Document owner
    updatedAt: string;       // Last update timestamp
    snapshotCid?: string;    // Content hash of latest snapshot (like IPFS)
    updateCids?: string[];   // Content hashes of incremental updates

    // Local state tracking for sync
    localState?: {
        snapshotCid?: string;  // Local snapshot that needs syncing
        updateCids?: string[]; // Local updates that need syncing
    };
}

/**
 * Content represents the binary content of a document with its metadata
 */
export interface Content {
    cid: string;             // Content identifier (hash)
    type: string;            // 'snapshot' or 'update'
    raw: Uint8Array;         // Raw binary data (serialized LoroDoc)
    metadata: Record<string, unknown>; // Mirrored metadata for indexability
    createdAt: string;
}

/**
 * DocContentState represents the current loaded state of a document
 */
export interface DocContentState {
    content: unknown;
    loading: boolean;
    error: string | null;
    sourceCid: string | null;
    isLocalSnapshot: boolean;
    appliedUpdates?: number; // Number of updates applied to the content
}

// Map to hold active Loro document instances
const activeLoroDocuments = new Map<string, LoroDoc>();

/**
 * HominioDB class implements the Content layer functionality
 */
class HominioDB {
    // Internal state for loading/errors, perhaps move to a dedicated status service later
    private _isLoading: boolean = false;
    private _isCreatingDoc: boolean = false;
    private _lastError: string | null = null;
    private _isInitializingDoc: boolean = false; // Flag to prevent persistence during creation

    constructor() {
        if (browser) {
            this.initialize().catch(err => {
                console.error('Failed to initialize HominioDB:', err);
                this._setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
            });
        }
    }

    /**
     * Initialize the database and load all documents
     */
    private async initialize(): Promise<void> {
        try {
            this._setStatus({ loading: true });

            // Initialize storage adapters
            await initStorage();

            // Load all documents (optional: could pre-load LoroDocs here too)
            // await this.loadAllDocs(); // This was updating a store, remove direct call

            this._setStatus({ loading: false });
            // Notify that DB is ready (optional)
            // docChangeNotifier.update(n => n + 1);
        } catch (err) {
            this._setError(`Initialization error: ${err instanceof Error ? err.message : String(err)}`);
            this._setStatus({ loading: false });
            throw err;
        }
    }

    /**
     * Load all documents from storage (REMOVED store update)
     */
    public async loadAllDocs(): Promise<void> {
        // This method is now less useful internally as we don't maintain a store.
        // Use loadAllDocsReturn() instead when needing the data.
        // Kept for potential external use or future refinement.
        console.warn("loadAllDocs() called, but no longer updates internal stores. Use loadAllDocsReturn() for data.");
        try {
            await this.loadAllDocsReturn(); // Just loads data, doesn't store it class-wide
        } catch (err) {
            console.error('Error loading documents in loadAllDocs:', err);
            this._setError(`Failed to load documents: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Create a new document
     * @param options Document creation options
     * @returns PubKey of the created document
     */
    async createDocument(options: { name?: string; description?: string } = {}): Promise<string> {
        this._setStatus({ creatingDoc: true });
        this._setError(null); // Clear previous error
        this._isInitializingDoc = true; // Set flag before creation starts

        try {
            // Capability check still uses get() on authClient, assuming it's external
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!currentUser) {
                throw new Error('Permission denied: User must be logged in to create documents.');
            }

            const pubKey = await docIdService.generateDocId();
            const owner = currentUser.id;
            const now = new Date().toISOString();

            const newDocMeta: Docs = {
                pubKey,
                owner,
                updatedAt: now
            };

            const loroDoc = await this.getOrCreateLoroDoc(pubKey); // Creates/loads LoroDoc, adds to map, subscribes

            const meta = loroDoc.getMap('meta');
            if (options.name) meta.set('name', options.name);
            if (options.description) meta.set('description', options.description);
            // Applying meta triggers the Loro change event

            // Snapshotting and initial save logic remains largely the same
            const snapshot = loroDoc.export({ mode: 'snapshot' });
            const snapshotCid = await hashService.hashSnapshot(snapshot);
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshot, {
                type: 'snapshot',
                documentPubKey: pubKey,
                created: now
            });

            newDocMeta.localState = { snapshotCid: snapshotCid };
            newDocMeta.snapshotCid = snapshotCid;

            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDocMeta)));

            // Explicitly trigger reactivity *after* metadata is saved
            // docChangeNotifier.update(n => n + 1);

            return pubKey;
        } catch (err) {
            console.error('Error creating document:', err);
            this._setError(`Failed to create document: ${err instanceof Error ? err.message : String(err)}`);
            throw err; // Re-throw error
        } finally {
            this._setStatus({ creatingDoc: false });
            this._isInitializingDoc = false; // Clear flag
        }
    }

    /**
     * Ensures a LoroDoc instance is loaded/created for the given document.
     * Does NOT load the content into a store anymore.
     * @param doc Document metadata
     */
    async selectDoc(doc: Docs): Promise<void> {
        // Removed: selectedDoc.set(doc);
        if (!doc) {
            console.warn("[selectDoc] Received null document.");
            return;
        }

        try {
            // Determine which snapshot CID to use
            const snapshotCid = doc.localState?.snapshotCid || doc.snapshotCid;

            // Get or create a Loro doc instance for this document
            // This ensures the LoroDoc is cached in activeLoroDocuments and subscribed
            await this.getOrCreateLoroDoc(doc.pubKey, snapshotCid);


        } catch (err) {
            console.error(`Error preparing LoroDoc for ${doc.pubKey} during selectDoc:`, err);
            this._setError(`Failed to prepare document instance: ${err instanceof Error ? err.message : String(err)}`);
            // Removed error setting related to docContent store
        }
    }

    /**
     * Get or create a Loro document instance
     * @param pubKey Document public key
     * @param snapshotCid Optional snapshot CID to initialize from
     */
    private async getOrCreateLoroDoc(pubKey: string, snapshotCid?: string): Promise<LoroDoc> {
        // If we already have an active instance, return it
        if (activeLoroDocuments.has(pubKey)) {
            return activeLoroDocuments.get(pubKey)!;
        }

        // Create a new LoroDoc instance
        const loroDoc = new LoroDoc();

        // Try to load binary data if we have a snapshot CID
        if (snapshotCid) {
            const contentStorage = getContentStorage();
            const binaryData = await contentStorage.get(snapshotCid);

            if (binaryData) {
                try {
                    // Initialize with stored data
                    loroDoc.import(binaryData);
                } catch (err) {
                    console.error(`[Loro Management] Error importing binary data for doc ${pubKey}:`, err);
                    // Proceed with an empty doc if import fails?
                }
            }
        }


        // *** Add Loro Subscription ***
        // Subscribe to changes and trigger our handler
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        loroDoc.subscribe((_event) => {
            // Directly trigger async persistence on change
            this._persistLoroUpdateAsync(pubKey, loroDoc).catch((err: unknown) => {
                console.error(`[Loro Subscribe Callback] Background persistence failed for ${pubKey}:`, err);
                this._setError(`Background save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            });
        });

        // Store in the active documents map
        activeLoroDocuments.set(pubKey, loroDoc);

        return loroDoc;
    }

    /**
     * Load document content including all updates
     * THIS METHOD IS DEPRECATED as content loading is now externalized.
     * Use getLoroDoc(pubKey) and then loroDoc.toJSON() instead.
     * @param doc Document to load content for
     */
    async loadDocumentContent(doc: Docs): Promise<void> {
        console.warn("[DEPRECATED] loadDocumentContent called. Use getLoroDoc(pubKey).then(d => d?.toJSON()) instead.");

        // *** Capability Check ***
        const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null; // Still uses external store getter
        if (!canRead(currentUser, doc)) {
            console.warn(`Permission denied: User ${currentUser?.id ?? 'anonymous'} cannot read doc ${doc.pubKey} owned by ${doc.owner}`);
            // Removed docContent.set error
            this._setError(`Permission denied: Cannot read document ${doc.pubKey}.`);
            return;
        }
        // *** End Capability Check ***

        this._setError("loadDocumentContent is deprecated."); // Set general error
    }

    /**
     * Update a document in storage
     * @param pubKey Document public key
     * @param mutationFn Function that mutates the document
     * @returns CID of the update
     */
    async updateDocument(pubKey: string, mutationFn: (doc: LoroDoc) => void): Promise<string> {
        // Get current metadata for capability check BEFORE getting LoroDoc
        const docMeta = await this.getDocument(pubKey);
        if (!docMeta) {
            throw new Error(`Document ${pubKey} not found for update.`);
        }

        // *** Capability Check ***
        const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null; // Still uses external store getter
        if (!canWrite(currentUser, docMeta)) {
            throw new Error('Permission denied: Cannot write to this document');
        }
        // *** End Capability Check ***

        // Get the Loro document instance (this ensures it's active and subscribed)
        const loroDoc = await this.getOrCreateLoroDoc(pubKey, docMeta.snapshotCid);

        // Apply the mutation (this triggers the Loro change event)
        mutationFn(loroDoc);

        // *** Explicitly commit the transaction to trigger events ***
        loroDoc.commit();



        // *** Manually trigger persistence since subscribe isn't firing reliably ***
        this._persistLoroUpdateAsync(pubKey, loroDoc).catch((err: unknown) => {
            console.error(`[updateDocument] Manual persistence trigger failed for ${pubKey}:`, err);
            // Handle error appropriately, maybe set an error state?
            this._setError(`Background save failed after manual trigger: ${err instanceof Error ? err.message : 'Unknown error'}`);
        });



        // Return something? Maybe pubKey or void?
        // Returning pubKey seems reasonable.
        return pubKey;

        // Note: Error handling is implicitly handled by the caller or the top-level try/catch
    }

    /**
     * Create a consolidated snapshot by applying all updates
     * @param pubKey Document public key (Now Required)
     * @returns The new snapshot CID or null if failed
     */
    async createConsolidatedSnapshot(pubKey: string): Promise<string | null> { // Made pubKey required
        this._setStatus({ loading: true });
        this._setError(null);
        try {
            // --- Fetch doc metadata directly using getDocument ---
            const doc = await this.getDocument(pubKey); // Fetch directly
            if (!doc) {
                throw new Error(`Document ${pubKey} not found for snapshot creation.`); // Throw error instead of setError
            }
            // --------------------------------------------------

            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null; // Still uses external store getter
            if (!canWrite(currentUser, doc)) {
                throw new Error('Permission denied: Cannot create snapshot for this document'); // Throw error
            }
            // *** End Capability Check ***

            // Check if document has updates to consolidate
            if (!doc.updateCids || doc.updateCids.length === 0) {
                throw new Error('No updates available to create a snapshot'); // Throw error
            }

            // Get or create the LoroDoc instance with all updates applied
            // Use getLoroDoc which loads snapshot + updates
            const loroDoc = await this.getLoroDoc(pubKey);
            if (!loroDoc) {
                throw new Error(`Could not load LoroDoc instance for ${pubKey}`);
            }

            // Export as a new snapshot
            const snapshotData = loroDoc.export({ mode: 'snapshot' });
            const snapshotCid = await hashService.hashSnapshot(snapshotData);

            // Save snapshot binary
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshotData, {
                type: CONTENT_TYPE_SNAPSHOT,
                documentPubKey: pubKey // Use pubKey directly
            });

            // Create updated doc metadata
            const updatedDoc: Docs = {
                ...doc,
                updatedAt: new Date().toISOString(),
                snapshotCid,
                updateCids: [], // Clear updates
                localState: {
                    ...(doc.localState || {}),
                    snapshotCid // Mark new snapshot for syncing
                }
            };

            // Save updated document metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc))); // Use pubKey directly

            // Explicitly trigger reactivity *after* metadata is saved
            // docChangeNotifier.update(n => n + 1);

            return snapshotCid;
        } catch (err) {
            console.error(`Error creating consolidated snapshot for ${pubKey}:`, err);
            this._setError(err instanceof Error ? err.message : 'Failed to create snapshot');
            return null; // Return null on error as before
        } finally {
            this._setStatus({ loading: false });
        }
    }

    /**
     * Get all documents that have local changes that need syncing
     * @returns Array of documents with local changes
     */
    async getDocumentsWithLocalChanges(): Promise<Docs[]> {
        try {
            // --- Fetch directly instead of using store ---
            // const allDocs = get(docs); // Removed
            const allDocs = await this.loadAllDocsReturn(); // Fetch directly
            // --------------------------------------------
            return allDocs.filter(doc =>
                doc.localState && (
                    doc.localState.snapshotCid ||
                    (doc.localState.updateCids && doc.localState.updateCids.length > 0)
                )
            );
        } catch (err) {
            console.error('Error getting documents with local changes:', err);
            this._setError(`Failed to get pending changes: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }

    /**
     * Clear local changes after they are synced to server
     * @param pubKey Document public key
     * @param changes Changes to clear (snapshot and/or updates)
     */
    async clearLocalChanges(pubKey: string, changes: {
        snapshotCid?: string,
        updateCids?: string[]
    }): Promise<void> {
        try {
            // --- Fetch directly instead of using store ---
            // const allDocs = get(docs); // Removed
            // const docIndex = allDocs.findIndex(d => d.pubKey === pubKey); // Removed
            const doc = await this.getDocument(pubKey); // Fetch directly
            // --------------------------------------------

            if (!doc) { // Check if doc was found
                throw new Error(`Document ${pubKey} not found for clearing local changes`);
            }

            // Skip if no local state
            if (!doc.localState) {
                return;
            }

            let updatedDoc: Docs;
            const newLocalState = { ...doc.localState };

            // Clear snapshot if needed
            if (changes.snapshotCid && doc.localState.snapshotCid === changes.snapshotCid) {
                newLocalState.snapshotCid = undefined;
            }

            // Clear updates if needed
            if (changes.updateCids && changes.updateCids.length > 0 && newLocalState.updateCids) {
                newLocalState.updateCids = newLocalState.updateCids.filter(
                    cid => !changes.updateCids?.includes(cid)
                );
            }

            // Check if localState should be removed entirely
            if (!newLocalState.snapshotCid &&
                (!newLocalState.updateCids || newLocalState.updateCids.length === 0)) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { localState, ...docWithoutLocalState } = doc;
                updatedDoc = docWithoutLocalState;
            } else {
                updatedDoc = { ...doc, localState: newLocalState };
            }

            // Save updated document metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));

            // Explicitly trigger reactivity *after* metadata is saved
            // docChangeNotifier.update(n => n + 1);

        } catch (err) {
            console.error(`Error clearing local changes for ${pubKey}:`, err);
            this._setError(`Failed to clear local changes: ${err instanceof Error ? err.message : String(err)}`);
            throw err; // Re-throw error
        }
    }

    /**
     * Update local document state after successful sync to server.
     * Moves synced snapshot/updates from localState to the main fields.
     * @param pubKey Document public key
     * @param changes Changes that were successfully synced
     */
    async updateDocStateAfterSync(pubKey: string, changes: {
        snapshotCid?: string,
        updateCids?: string[]
    }): Promise<void> {
        try {
            // --- Fetch directly instead of using store ---
            // const allDocs = get(docs); // Removed
            // const docIndex = allDocs.findIndex(d => d.pubKey === pubKey); // Removed
            const originalDoc = await this.getDocument(pubKey); // Fetch directly
            // --------------------------------------------

            if (!originalDoc) { // Check if doc exists
                console.warn(`[updateDocStateAfterSync] Doc ${pubKey} not found.`);
                return;
            }

            const updatedDoc = { ...originalDoc }; // Create a mutable copy
            let needsSave = false;

            // 1. Handle Synced Snapshot
            if (changes.snapshotCid && updatedDoc.localState?.snapshotCid === changes.snapshotCid) {
                updatedDoc.snapshotCid = changes.snapshotCid; // Promote to main snapshot
                if (updatedDoc.localState) {
                    updatedDoc.localState.snapshotCid = undefined; // Clear from local state
                }
                needsSave = true;
            }

            // 2. Handle Synced Updates
            if (changes.updateCids && changes.updateCids.length > 0 && updatedDoc.localState?.updateCids) {
                const syncedCids = changes.updateCids;
                const originalLocalUpdates = updatedDoc.localState.updateCids || [];

                // Add synced updates to main list (avoid duplicates)
                updatedDoc.updateCids = updatedDoc.updateCids || [];
                syncedCids.forEach(cid => {
                    if (!updatedDoc.updateCids?.includes(cid)) {
                        updatedDoc.updateCids?.push(cid);
                    }
                });

                // Remove synced updates from local state
                updatedDoc.localState.updateCids = originalLocalUpdates.filter(
                    cid => !syncedCids.includes(cid)
                );

                needsSave = true;
            }

            // 3. Clean up localState if empty
            if (updatedDoc.localState && !updatedDoc.localState.snapshotCid && (!updatedDoc.localState.updateCids || updatedDoc.localState.updateCids.length === 0)) {
                delete updatedDoc.localState;
                needsSave = true;
            }

            // 4. Save if changes were made
            if (needsSave) {
                updatedDoc.updatedAt = new Date().toISOString(); // Update timestamp
                const docsStorage = getDocsStorage();
                await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));

                // Explicitly trigger reactivity *after* metadata is saved
                // docChangeNotifier.update(n => n + 1);
                console.log(`[updateDocStateAfterSync] Saved updated state for ${pubKey}`);
            }

        } catch (err) {
            console.error(`[updateDocStateAfterSync] Error updating state for ${pubKey}:`, err);
            this._setError(`Failed sync state update: ${err instanceof Error ? err.message : String(err)}`);
            // Don't throw, log the error
        }
    }

    /**
     * Import content into the database
     * @param binaryData Binary data to import
     * @param options Import options
     * @returns The document pubKey and snapshot CID
     */
    async importContent(binaryData: Uint8Array, options: {
        pubKey?: string,
        owner?: string
    } = {}): Promise<{ pubKey: string, snapshotCid: string }> {
        try {
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null; // Still uses external store getter
            if (!currentUser) {
                throw new Error("Permission denied: User must be logged in to import content.");
            }

            // Create a new LoroDoc to analyze the content
            const tempDoc = new LoroDoc();
            tempDoc.import(binaryData);

            // Generate content hash
            const snapshotCid = await hashService.hashSnapshot(binaryData);

            // Get or generate a pubKey
            const pubKey = options.pubKey || docIdService.generateDocId();

            // Store the content
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, binaryData, {
                type: CONTENT_TYPE_SNAPSHOT,
                documentPubKey: pubKey
            });

            // Try to extract metadata from the Loro document
            interface DocMetadata {
                name: string;
                description?: string;
            }

            const docMetadata: DocMetadata = { name: "Imported Document" };

            try {
                const meta = tempDoc.getMap("meta");
                if (meta.get("name") !== undefined) {
                    docMetadata.name = meta.get("name") as string;
                }
                if (meta.get("description") !== undefined) {
                    docMetadata.description = meta.get("description") as string;
                }

            } catch (metaErr) {
                console.warn('Could not extract metadata from imported document', metaErr);
            }

            // Create document metadata
            const now = new Date().toISOString();
            const newDoc: Docs = {
                pubKey,
                owner: options.owner || currentUser.id, // Use current user ID as owner
                updatedAt: now,
                snapshotCid,
                updateCids: [],
                localState: {
                    snapshotCid: snapshotCid
                }
            };

            // Store document metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDoc)));

            // Explicitly trigger reactivity *after* metadata is saved
            // docChangeNotifier.update(n => n + 1);

            return { pubKey, snapshotCid };
        } catch (err) {
            console.error('Error importing content:', err);
            // Removed setError as it used a store
            // this.setError(err instanceof Error ? err.message : 'Failed to import content');
            this._setError(err instanceof Error ? err.message : 'Failed to import content'); // Use internal method
            throw err;
        }
    }

    /**
     * Export content
     * @param pubKey Document public key
     * @param options Export options
     * @returns Binary data
     */
    async exportContent(pubKey: string, options: { mode?: 'snapshot' | 'update' } = {}): Promise<Uint8Array> {
        try {
            // --- Fetch directly instead of using store ---
            // const doc = get(docs).find(d => d.pubKey === pubKey); // Removed
            const doc = await this.getDocument(pubKey); // Fetch directly
            // --------------------------------------------
            if (!doc) {
                throw new Error(`Document ${pubKey} not found for export`);
            }

            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null; // Still uses external store getter
            if (!canRead(currentUser, doc)) {
                throw new Error('Permission denied: Cannot read this document to export');
            }
            // *** End Capability Check ***

            // Get the LoroDoc instance
            const loroDoc = await this.getLoroDoc(pubKey); // Use getLoroDoc which loads if needed
            if (!loroDoc) {
                throw new Error(`Could not load LoroDoc instance for export: ${pubKey}`);
            }

            // Export based on requested mode
            return loroDoc.export({ mode: options.mode || 'snapshot' });
        } catch (err) {
            console.error(`Error exporting content for ${pubKey}:`, err);
            this._setError(err instanceof Error ? err.message : 'Failed to export content'); // Use internal method
            throw err;
        }
    }

    /**
     * Set internal status flags
     * @param newStatus Status update
     */
    private _setStatus(newStatus: Partial<{ loading: boolean; creatingDoc: boolean }>): void {
        // status.update(s => ({ ...s, ...newStatus })); // Removed store update
        if (newStatus.loading !== undefined) this._isLoading = newStatus.loading;
        if (newStatus.creatingDoc !== undefined) this._isCreatingDoc = newStatus.creatingDoc;
        // Consider adding a notifier update here if UI needs to react to loading states
    }

    /**
     * Set internal error message
     * @param message Error message
     */
    private _setError(message: string | null): void {
        // error.set(message); // Removed store update
        this._lastError = message;
        // Consider adding a notifier update here if UI needs to react to errors
    }

    // Public getters for internal state (optional, if needed externally)
    public get isLoading(): boolean { return this._isLoading; }
    public get isCreatingDoc(): boolean { return this._isCreatingDoc; }
    public get lastError(): string | null { return this._lastError; }

    /**
     * Delete a document
     * @param pubKey Document public key
     * @returns True if successful, otherwise throws an error
     */
    async deleteDocument(pubKey: string): Promise<boolean> {
        this._setError(null); // Clear error
        try {
            // --- Fetch directly instead of using store ---
            // const allDocs = get(docs); // Removed
            // const docIndex = allDocs.findIndex(d => d.pubKey === pubKey); // Removed
            const doc = await this.getDocument(pubKey); // Fetch directly
            // --------------------------------------------

            if (!doc) { // Check if doc exists
                throw new Error(`Document ${pubKey} not found for deletion`);
            }

            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null; // Still uses external store getter
            if (!canDelete(currentUser, doc)) {
                throw new Error('Permission denied: Cannot delete this document');
            }
            // *** End Capability Check ***

            // Close and cleanup any active LoroDoc instance
            if (activeLoroDocuments.has(pubKey)) {
                activeLoroDocuments.delete(pubKey);
            }

            // Delete from local storage
            const docsStorage = getDocsStorage();
            await docsStorage.delete(pubKey);

            // Explicitly trigger reactivity *after* metadata is saved
            // docChangeNotifier.update(n => n + 1);

            return true;
        } catch (err) {
            console.error(`Error deleting document ${pubKey}:`, err);
            this._setError(`Failed to delete document: ${err instanceof Error ? err.message : String(err)}`); // Use internal method
            throw err; // Re-throw error
        }
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        // Close all active Loro documents
        activeLoroDocuments.clear();
    }

    /**
     * Load all document metadata from storage and return them as an array.
     * Does not update the Svelte store.
     * @returns Array of Docs metadata.
     */
    public async loadAllDocsReturn(): Promise<Docs[]> {
        try {
            const docsStorage = getDocsStorage();
            const allItems = await docsStorage.getAll();
            const loadedDocs: Docs[] = [];

            for (const item of allItems) {
                try {
                    if (item.value) {
                        const data = await docsStorage.get(item.key);
                        if (data) {
                            const docString = new TextDecoder().decode(data);
                            const doc = JSON.parse(docString) as Docs;
                            loadedDocs.push(doc);
                        }
                    }
                } catch (parseErr) {
                    console.error(`Error parsing document ${item.key} in loadAllDocsReturn:`, parseErr);
                }
            }
            return loadedDocs;
        } catch (err) {
            console.error('Error loading documents in loadAllDocsReturn:', err);
            return []; // Return empty array on error
        }
    }

    /**
     * Get the metadata for a single document by its pubKey.
     * Does not update the Svelte store.
     * @param pubKey The public key of the document.
     * @returns The Docs metadata or null if not found or error.
     */
    public async getDocument(pubKey: string): Promise<Docs | null> {
        try {
            const docsStorage = getDocsStorage();
            const data = await docsStorage.get(pubKey);
            if (data) {
                const docString = new TextDecoder().decode(data);
                return JSON.parse(docString) as Docs;
            }
            return null;
        } catch (err) {
            console.error(`Error getting document ${pubKey}:`, err);
            return null;
        }
    }

    /**
     * Retrieves or reconstructs the LoroDoc instance for a given pubKey.
     * Handles loading snapshot and applying updates from storage.
     * Caches active instances.
     * @param pubKey The public key of the document.
     * @returns The LoroDoc instance or null if document/content not found or error.
     */
    public async getLoroDoc(pubKey: string): Promise<LoroDoc | null> {
        // 1. Check cache
        if (activeLoroDocuments.has(pubKey)) {
            return activeLoroDocuments.get(pubKey)!;
        }

        // 2. Get document metadata
        const docMetadata = await this.getDocument(pubKey);
        if (!docMetadata) {
            console.error(`[getLoroDoc] Metadata not found for ${pubKey}`);
            return null;
        }

        // 3. Determine Snapshot CID (prioritize local if available, though less relevant server-side)
        const snapshotCid = docMetadata.localState?.snapshotCid || docMetadata.snapshotCid;
        if (!snapshotCid) {
            console.warn(`[getLoroDoc] No snapshot CID found for ${pubKey}. Returning empty doc.`);
            // Return a new empty doc, maybe? Or null? Returning null seems safer.
            // const newDoc = new LoroDoc();
            // activeLoroDocuments.set(pubKey, newDoc);
            // return newDoc;
            return null;
        }

        // 4. Load Snapshot Content
        const contentStorage = getContentStorage();
        const snapshotData = await contentStorage.get(snapshotCid);
        if (!snapshotData) {
            console.error(`[getLoroDoc] Snapshot content not found for CID ${snapshotCid} (doc ${pubKey})`);
            return null;
        }

        // 5. Create LoroDoc and Import Snapshot
        const loroDoc = new LoroDoc();
        try {
            loroDoc.import(snapshotData);
        } catch (importErr) {
            console.error(`[getLoroDoc] Error importing snapshot ${snapshotCid} for ${pubKey}:`, importErr);
            return null;
        }

        // 6. Apply Updates
        const allUpdateCids = [
            ...(docMetadata.updateCids || []),
            ...(docMetadata.localState?.updateCids || []) // Include local updates if present
        ];

        // Optimization: Fetch all updates at once if storage supports it (assuming basic get for now)
        const updatesData: Uint8Array[] = [];
        for (const updateCid of allUpdateCids) {
            const updateData = await contentStorage.get(updateCid);
            if (updateData) {
                updatesData.push(updateData);
            } else {
                console.warn(`[getLoroDoc] Update content not found for CID ${updateCid} (doc ${pubKey})`);
                // Decide: continue applying others or fail? Continue seems reasonable.
            }
        }

        // 7. Import Updates in Batch (if any)
        if (updatesData.length > 0) {
            try {
                loroDoc.importBatch(updatesData);
            } catch (batchImportErr) {
                console.error(`[getLoroDoc] Error batch importing updates for ${pubKey}:`, batchImportErr);
                // Should we return null or the doc state before failed batch import?
                // Returning null seems safer to indicate incomplete state.
                return null;
            }
        }

        // 8. Cache and Return
        activeLoroDocuments.set(pubKey, loroDoc);
        return loroDoc;
    }

    /**
     * Creates a new entity document.
     * Handles LoroDoc creation, snapshotting, content storage, and metadata storage.
     * @param schemaPubKey PubKey of the schema this entity conforms to (without the '@').
     * @param initialPlaces Initial data for the entity's 'places' map.
     * @param ownerId The ID of the user creating the entity.
     * @param options Optional data like name.
     * @returns The metadata (Docs object) of the newly created entity document.
     * @throws Error if creation fails.
     */
    public async createEntity(schemaPubKey: string, initialPlaces: Record<string, LoroJsonValue>, ownerId: string, options: { name?: string } = {}): Promise<Docs> {
        const pubKey: string = docIdService.generateDocId();
        const now: string = new Date().toISOString();
        this._isInitializingDoc = true; // Set flag before creation starts

        try {
            const loroDoc: LoroDoc = await this.getOrCreateLoroDoc(pubKey);
            const meta: LoroMap = loroDoc.getMap('meta');
            meta.set('schema', `@${schemaPubKey}`);
            if (options.name) meta.set('name', options.name);

            // Correctly create the nested places map
            const dataMap: LoroMap = loroDoc.getMap('data');
            // Use setContainer with a NEW LoroMap instance
            const placesMap: LoroMap = dataMap.setContainer("places", new LoroMap());

            // Now placesMap is guaranteed to be a LoroMap, set values
            for (const key in initialPlaces) {
                if (Object.prototype.hasOwnProperty.call(initialPlaces, key)) {
                    placesMap.set(key, initialPlaces[key]);
                }
            }

            const snapshot: Uint8Array = loroDoc.export({ mode: 'snapshot' });
            const snapshotCid = await hashService.hashSnapshot(snapshot);
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshot, {
                type: 'snapshot',
                documentPubKey: pubKey,
                created: now,
                schema: `@${schemaPubKey}`
            });
            const newDoc: Docs = {
                pubKey,
                owner: ownerId,
                updatedAt: now,
                snapshotCid,
                updateCids: [],
                localState: {
                    snapshotCid: snapshotCid
                }
            };
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDoc)));
            activeLoroDocuments.set(pubKey, loroDoc);

            // Explicitly trigger reactivity *after* metadata is saved
            // docChangeNotifier.update(n => n + 1);

            return newDoc;

        } catch (err) {
            console.error(`[createEntity] Failed for schema @${schemaPubKey}:`, err);
            activeLoroDocuments.delete(pubKey);
            throw new Error(`Failed to create entity: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            this._isInitializingDoc = false; // Clear flag
        }
    }

    /**
     * Persists a pre-exported Loro update binary to storage and updates document metadata.
     * Calculates CID, stores content, and atomically appends CID to updateCids array.
     * Intended for use by HQL service after validation.
     * @param pubKey The public key of the document being updated.
     * @param updateData The binary update data (Uint8Array).
     * @returns The CID of the persisted update.
     * @throws Error if persistence fails or document not found.
     */
    public async persistLoroUpdate(pubKey: string, updateData: Uint8Array): Promise<string> {
        try {
            // 1. Calculate CID
            const updateCid = await hashService.hashSnapshot(updateData); // Use same hash function

            // 2. Store Update Content
            const contentStorage = getContentStorage();
            // Removed existence check for simplicity, assume put handles it or overwrites are cheap
            await contentStorage.put(updateCid, updateData, {
                type: 'update',
                documentPubKey: pubKey,
                created: new Date().toISOString()
            });

            // 3. Fetch Current Document Metadata
            const currentDoc = await this.getDocument(pubKey);
            if (!currentDoc) {
                throw new Error(`Document ${pubKey} not found during update persistence.`);
            }

            // 4. Prepare updated metadata with the new update CID in localState
            const updatedDocData: Docs = { ...currentDoc }; // Shallow copy

            // Ensure localState and updateCids array exist
            if (!updatedDocData.localState) {
                updatedDocData.localState = { updateCids: [] };
            }
            // Explicitly check and initialize updateCids if localState exists but updateCids doesn't
            if (!updatedDocData.localState.updateCids) {
                updatedDocData.localState.updateCids = [];
            }

            // Append CID if not already present in localState
            // Now we know updatedDocData.localState.updateCids is an array
            if (!updatedDocData.localState.updateCids.includes(updateCid)) {
                updatedDocData.localState.updateCids.push(updateCid);
                updatedDocData.updatedAt = new Date().toISOString(); // Update timestamp only if CID added

                // 5. Save Updated Document Metadata
                const docsStorage = getDocsStorage();
                await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDocData)));

            } else {
                console.warn(`[persistLoroUpdate] Update CID ${updateCid} already present in localState for doc ${pubKey}. Skipping metadata update.`); // KEEP Warning
            }

            return updateCid; // Return the CID regardless of whether metadata was updated

        } catch (err) {
            console.error(`[persistLoroUpdate] Failed for doc ${pubKey}:`, err); // <-- Log: Error
            this._setError(`Failed to persist update: ${err instanceof Error ? err.message : 'Unknown error'}`);
            throw err; // Re-throw error
        }
    }

    // Helper for async persistence triggered by Loro event
    private async _persistLoroUpdateAsync(pubKey: string, loroDoc: LoroDoc): Promise<void> {
        // Check initialization flag first
        if (this._isInitializingDoc) {
            return;
        }

        const updateData = loroDoc.export({ mode: 'update' });

        if (updateData.byteLength > 0) {
            // Call the existing persistence logic (which also updates metadata & triggers notifier)
            await this.persistLoroUpdate(pubKey, updateData);
        } else {
            console.log(`[Loro Event] No effective changes detected by Loro for ${pubKey}. Skipping persistence.`);
        }
    }
    // -------------------------

    // --- NEW METHODS FOR SYNC SERVICE ---

    /**
     * Retrieves raw binary content from the content store.
     * @param cid Content ID.
     * @returns Uint8Array or null if not found.
     */
    public async getRawContent(cid: string): Promise<Uint8Array | null> {
        try {
            const contentStorage = getContentStorage();
            return await contentStorage.get(cid);
        } catch (err) {
            console.error(`[getRawContent] Error fetching CID ${cid}:`, err);
            return null;
        }
    }

    /**
     * Saves raw binary content to the content store.
     * @param cid Content ID.
     * @param data Binary data.
     * @param meta Metadata (e.g., { type: 'snapshot' | 'update', documentPubKey: string }).
     */
    public async saveRawContent(cid: string, data: Uint8Array, meta: Record<string, unknown>): Promise<void> {
        try {
            const contentStorage = getContentStorage();
            // Check if exists first? Optional optimization.
            // const exists = await contentStorage.get(cid);
            // if (!exists) {
            await contentStorage.put(cid, data, meta);
            // } else {
            // 	console.log(`[saveRawContent] Content ${cid} already exists.`);
            // }
        } catch (err) {
            console.error(`[saveRawContent] Error saving CID ${cid}:`, err);
            throw new Error(`Failed to save raw content: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    /**
     * Checks for the existence of multiple content CIDs efficiently.
     * @param cids Array of Content IDs.
     * @returns A Set containing the keys that exist.
     */
    public async batchCheckContentExists(cids: string[]): Promise<Set<string>> {
        try {
            const contentStorage = getContentStorage();
            return await contentStorage.batchExists(cids);
        } catch (err) {
            console.error(`[batchCheckContentExists] Error checking CIDs:`, err);
            return new Set<string>(); // Return empty set on error
        }
    }

    /**
     * Saves document metadata received from the server during a pull.
     * Merges with local state, updates storage, updates Svelte stores, and triggers notifier.
     * @param serverDocData The document metadata received from the server.
     */
    public async saveSyncedDocument(serverDocData: Docs): Promise<void> {
        const pubKey = serverDocData.pubKey;
        try {
            // 1. Fetch local version for state merging
            const localDoc = await this.getDocument(pubKey); // Uses storage directly

            // 2. Merge state
            const mergedDoc: Docs = { ...serverDocData }; // Start with server state

            if (localDoc?.localState?.updateCids && localDoc.localState.updateCids.length > 0) {
                // Preserve local *updates*, discard local *snapshot*
                if (!mergedDoc.localState) mergedDoc.localState = {};
                mergedDoc.localState.updateCids = [...(localDoc.localState.updateCids ?? [])];
                mergedDoc.localState.snapshotCid = undefined; // Ensure local snapshot ref is gone
            } else {
                // No local updates to preserve, ensure localState field is removed
                delete mergedDoc.localState;
            }

            // Add/update updatedAt timestamp (reflects sync time)
            mergedDoc.updatedAt = new Date().toISOString();

            // 3. Save merged data to storage
            const docsStorage = getDocsStorage();
            console.log(`[saveSyncedDocument] Saving merged metadata to docs store:`, JSON.stringify(mergedDoc)); // <-- Log before save
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(mergedDoc)));




        } catch (err) {
            console.error(`[saveSyncedDocument] Error processing doc ${pubKey}:`, err);
            // Optionally re-throw or handle differently
            throw err;
        }
    }

    // ---------------------------------
}

// Create and export singleton instance
export const hominioDB = new HominioDB(); 