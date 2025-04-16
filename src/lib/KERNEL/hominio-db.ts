import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { LoroDoc, LoroMap } from 'loro-crdt';
import { hashService } from './hash-service';
import { docIdService } from './docid-service';
import { getContentStorage, getDocsStorage, initStorage } from './hominio-storage';
import { authClient } from '$lib/client/auth-hominio'; // Assumed path for auth client
import { canRead, canWrite, type CapabilityUser, canDelete } from './hominio-capabilities'; // Import capabilities

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

// Svelte stores for reactive UI
const docs = writable<Docs[]>([]);
const selectedDoc = writable<Docs | null>(null);
const status = writable({
    loading: false,
    error: false,
    creatingDoc: false
});
const error = writable<string | null>(null);
const docContent = writable<DocContentState>({
    content: null,
    loading: false,
    error: null,
    sourceCid: null,
    isLocalSnapshot: false
});

// Map to hold active Loro document instances
const activeLoroDocuments = new Map<string, LoroDoc>();

/**
 * HominioDB class implements the Content layer functionality
 */
class HominioDB {
    // Expose Svelte stores for reactive UI
    docs = docs;
    selectedDoc = selectedDoc;
    status = status;
    error = error;
    docContent = docContent;

    constructor() {
        if (browser) {
            this.initialize().catch(err => {
                console.error('Failed to initialize HominioDB:', err);
                this.setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
            });
        }
    }

    /**
     * Initialize the database and load all documents
     */
    private async initialize(): Promise<void> {
        try {
            this.setStatus({ loading: true });

            // Initialize storage adapters
            await initStorage();

            // Load all documents
            await this.loadAllDocs();

            this.setStatus({ loading: false });
        } catch (err) {
            this.setError(`Initialization error: ${err instanceof Error ? err.message : String(err)}`);
            this.setStatus({ loading: false });
            throw err;
        }
    }

    /**
     * Load all documents from storage
     */
    public async loadAllDocs(): Promise<void> {
        try {
            const docsStorage = getDocsStorage();
            const allItems = await docsStorage.getAll();

            const loadedDocs: Docs[] = [];

            for (const item of allItems) {
                try {
                    if (item.value) {
                        // Get the Uint8Array value
                        const data = await docsStorage.get(item.key);
                        if (data) {
                            // Convert binary data to string and parse JSON
                            const docString = new TextDecoder().decode(data);
                            const doc = JSON.parse(docString) as Docs;
                            loadedDocs.push(doc);
                        }
                    }
                } catch (parseErr) {
                    console.error(`Error parsing document ${item.key}:`, parseErr);
                }
            }

            // Set loaded docs to store with a new array reference to trigger reactivity
            docs.set([...loadedDocs]);

            // If we have a selected document, make sure we reload its content
            const currentSelectedDoc = get(selectedDoc);
            if (currentSelectedDoc) {
                const refreshedDoc = loadedDocs.find(d => d.pubKey === currentSelectedDoc.pubKey);
                if (refreshedDoc) {
                    selectedDoc.set({ ...refreshedDoc });  // Force reactivity update
                    await this.loadDocumentContent(refreshedDoc);
                }
            }
        } catch (err) {
            console.error('Error loading documents:', err);
            this.setError(`Failed to load documents: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Create a new document
     * @param options Document creation options
     * @returns PubKey of the created document
     */
    async createDocument(options: { name?: string; description?: string } = {}): Promise<string> {
        this.setStatus({ creatingDoc: true });

        try {
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!currentUser) {
                throw new Error('Permission denied: User must be logged in to create documents.');
            }

            const pubKey = await docIdService.generateDocId();
            // Use the actual logged-in user ID as the owner
            const owner = currentUser.id;

            const now = new Date().toISOString();
            const newDocMeta: Docs = {
                pubKey,
                owner, // Set owner to current user
                updatedAt: now
            };

            // Get or create the Loro document instance (this also sets up the subscription)
            const loroDoc = await this.getOrCreateLoroDoc(pubKey);

            // Set initial metadata if provided (this triggers the Loro change event)
            const meta = loroDoc.getMap('meta');
            if (options.name) {
                meta.set('name', options.name);
            }
            if (options.description) {
                meta.set('description', options.description);
            }

            // Initial Snapshot Persistence (Still needed for new docs)
            // Note: The Loro event handler might trigger *another* persistence for the meta updates,
            //       this might need refinement later to only persist once or handle idempotency.
            const snapshot = loroDoc.export({ mode: 'snapshot' });
            const snapshotCid = await hashService.hashSnapshot(snapshot);
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshot, {
                type: 'snapshot',
                documentPubKey: pubKey,
                created: now
            });

            // Update document metadata with snapshot info
            newDocMeta.localState = { snapshotCid: snapshotCid }; // Mark for sync
            newDocMeta.snapshotCid = snapshotCid; // Set initial snapshot CID

            // Save initial document metadata to docs storage
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDocMeta)));

            // --- REMOVED SVELTE STORE UPDATES --- 
            // The Loro change handler (`_handleLoroChange`) will now update 
            // the stores based on the Loro event triggered by meta.set().
            // It will also handle selecting the new doc if needed.
            // docs.update(docs => [...docs, newDocMeta]);
            // await this.selectDoc(newDocMeta); // Selection handled by Loro event now?
            // ------------------------------------ 

            // We might still want to explicitly select the doc after creation?
            // Let's keep this for now, but be aware the event handler also selects.
            const finalDocMeta = await this.getDocument(pubKey); // Get potentially updated meta
            if (finalDocMeta) {
                await this.selectDoc(finalDocMeta);
            } else {
                console.warn(`[createDocument] Failed to get final metadata for ${pubKey} after creation.`);
            }

            return pubKey;
        } catch (err) {
            console.error('Error creating document:', err);
            this.setError(`Failed to create document: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        } finally {
            this.setStatus({ creatingDoc: false });
        }
    }

    /**
     * Select a document and load its content
     * @param doc Document to select
     */
    async selectDoc(doc: Docs): Promise<void> {
        selectedDoc.set(doc);

        if (doc) {
            try {
                // Determine which snapshot CID to use
                const snapshotCid = doc.localState?.snapshotCid || doc.snapshotCid;

                // Get or create a Loro doc instance for this document
                await this.getOrCreateLoroDoc(doc.pubKey, snapshotCid);

                // Load content (capability check is inside this method)
                await this.loadDocumentContent(doc);
            } catch (err) {
                console.error(`Error selecting doc ${doc.pubKey}:`, err);
                this.setError('Failed to load document data');
                // Error might be due to permissions from loadDocumentContent
                const currentContent = get(docContent);
                if (currentContent.error?.includes('Permission denied')) {
                    this.setError(currentContent.error);
                }
            }
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

        console.log(`[Loro Management] Creating or loading LoroDoc for ${pubKey}...`);
        // Create a new LoroDoc instance
        const loroDoc = new LoroDoc();
        let loadedFromStorage = false;

        // Try to load binary data if we have a snapshot CID
        if (snapshotCid) {
            const contentStorage = getContentStorage();
            const binaryData = await contentStorage.get(snapshotCid);

            if (binaryData) {
                try {
                    // Initialize with stored data
                    loroDoc.import(binaryData);
                    console.log(`[Loro Management] Loaded Loro doc ${pubKey} from snapshot ${snapshotCid}`);
                    loadedFromStorage = true;
                } catch (err) {
                    console.error(`[Loro Management] Error importing binary data for doc ${pubKey}:`, err);
                    // Proceed with an empty doc if import fails?
                }
            }
        }

        if (!loadedFromStorage) {
            console.log(`[Loro Management] Initializing empty LoroDoc for ${pubKey}.`);
        }

        // *** Add Loro Subscription ***
        // Subscribe to changes and trigger our handler
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        loroDoc.subscribe((_event) => {
            // console.log(`[Loro Subscribe Callback] Event for ${pubKey}`); // Simple log to use _event context implicitly via pubKey
            // TODO: Investigate event properties to see if we can reliably ignore local-only echoes
            // if (_event.local) return; 

            // Use a non-blocking way to handle the change to avoid blocking Loro
            setTimeout(() => {
                this._handleLoroChange(pubKey, loroDoc).catch(err => {
                    console.error(`[Loro Subscribe Callback] Error handling change for ${pubKey}:`, err);
                });
            }, 0);
        });
        console.log(`[Loro Management] Subscribed to changes for ${pubKey}.`);
        // ***************************

        // Store in the active documents map
        activeLoroDocuments.set(pubKey, loroDoc);

        return loroDoc;
    }

    /**
     * Load document content including all updates
     * @param doc Document to load content for
     */
    async loadDocumentContent(doc: Docs): Promise<void> {
        // *** Capability Check ***
        const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
        if (!canRead(currentUser, doc)) {
            console.warn(`Permission denied: User ${currentUser?.id ?? 'anonymous'} cannot read doc ${doc.pubKey} owned by ${doc.owner}`);
            docContent.set({
                content: null,
                loading: false,
                error: `Permission denied: Cannot read this document.`,
                sourceCid: null,
                isLocalSnapshot: false
            });
            return; // Don't proceed if read permission denied
        }
        // *** End Capability Check ***

        docContent.update(state => ({ ...state, loading: true, error: null }));

        try {
            // Determine which snapshot CID to use - prioritize local snapshot
            const snapshotCid = doc.localState?.snapshotCid || doc.snapshotCid;
            const isLocalSnapshot = !!doc.localState?.snapshotCid;

            if (!snapshotCid) {
                docContent.set({
                    content: { note: "No snapshot available for this document" },
                    loading: false,
                    error: null,
                    sourceCid: null,
                    isLocalSnapshot: false
                });
                return;
            }

            console.log(`Loading snapshot with CID: ${snapshotCid}, isLocal: ${isLocalSnapshot}`);

            // Load snapshot binary data
            const contentStorage = getContentStorage();
            const snapshotData = await contentStorage.get(snapshotCid);

            if (!snapshotData) {
                docContent.set({
                    content: null,
                    loading: false,
                    error: `Could not load snapshot content for CID: ${snapshotCid}`,
                    sourceCid: snapshotCid,
                    isLocalSnapshot
                });
                return;
            }

            console.log(`Loaded snapshot data, size: ${snapshotData.byteLength} bytes`);

            // Create a temporary LoroDoc to import the data
            const tempDoc = new LoroDoc();

            try {
                // Import the snapshot with proper error handling
                tempDoc.import(snapshotData);
                console.log(`Loaded base snapshot from CID: ${snapshotCid}`);
            } catch (importErr) {
                console.error(`Error importing snapshot data:`, importErr);
                docContent.set({
                    content: null,
                    loading: false,
                    error: `Failed to import snapshot: ${importErr instanceof Error ? importErr.message : 'Unknown error'}`,
                    sourceCid: snapshotCid,
                    isLocalSnapshot
                });
                return;
            }

            // Track number of updates applied
            let appliedUpdates = 0;

            // Gather all update CIDs (both from server and local)
            const allUpdateCids = [
                ...(doc.updateCids || []),
                ...(doc.localState?.updateCids || [])
            ];

            // Apply all updates in order
            for (const updateCid of allUpdateCids) {
                const updateData = await contentStorage.get(updateCid);
                if (updateData) {
                    try {
                        tempDoc.import(updateData);
                        appliedUpdates++;
                        console.log(`Applied update from CID: ${updateCid}`);
                    } catch (err) {
                        console.error(`Error applying update ${updateCid}:`, err);
                    }
                } else {
                    console.warn(`Could not load update data for CID: ${updateCid}`);
                }
            }

            // Get JSON representation of the fully updated document
            let content;
            try {
                content = tempDoc.toJSON();
                console.log(`Successfully converted Loro doc to JSON:`, content);
            } catch (jsonErr) {
                console.error(`Error converting Loro doc to JSON:`, jsonErr);
                docContent.set({
                    content: null,
                    loading: false,
                    error: `Failed to convert document to JSON: ${jsonErr instanceof Error ? jsonErr.message : 'Unknown error'}`,
                    sourceCid: snapshotCid,
                    isLocalSnapshot
                });
                return;
            }

            docContent.set({
                content,
                loading: false,
                error: null,
                sourceCid: snapshotCid,
                isLocalSnapshot,
                appliedUpdates // Add number of updates applied
            });

            console.log(`Document content loaded with ${appliedUpdates} updates applied`);
        } catch (err) {
            console.error('Error loading document content:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to load document content';
            docContent.set({
                content: null,
                loading: false,
                error: errorMessage,
                sourceCid: null,
                isLocalSnapshot: false
            });
        }
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
        const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
        if (!canWrite(currentUser, docMeta)) {
            throw new Error('Permission denied: Cannot write to this document');
        }
        // *** End Capability Check ***

        // Get the Loro document instance (this ensures it's active and subscribed)
        const loroDoc = await this.getOrCreateLoroDoc(pubKey, docMeta.snapshotCid);

        // Apply the mutation (this triggers the Loro change event)
        mutationFn(loroDoc);

        // --- REMOVED PERSISTENCE & SVELTE STORE UPDATES --- 
        // The Loro change handler (`_handleLoroChange`) is now responsible for:
        // 1. Exporting the update from the modified `loroDoc`.
        // 2. Persisting the update via `persistLoroUpdate`.
        // 3. Updating all relevant Svelte stores (`docs`, `selectedDoc`, `docContent`).

        // We might need the update CID here for some reason? 
        // If so, we'd have to export here, hash, but NOT persist/update stores.
        // For now, assume the CID isn't immediately needed by the caller.
        // const updateData: Uint8Array = loroDoc.export({ mode: 'update' });
        // const updateCid: string = await hashService.hashSnapshot(updateData);
        // return updateCid; // <--- Return CID if needed by caller
        // ---------------------------------------------------- 

        // Return something? Maybe pubKey or void?
        // Returning pubKey seems reasonable.
        return pubKey;

        // Note: Error handling is implicitly handled by the caller or the top-level try/catch
    }

    /**
     * Add a random property to a document (for testing purposes)
     * @param pubKey Document public key
     * @returns True if successful
     */
    async addRandomPropertyToDocument(pubKey?: string): Promise<boolean> {
        const targetPubKey = pubKey || get(selectedDoc)?.pubKey;
        if (!targetPubKey) {
            this.setError('No document selected');
            return false;
        }

        // Capability check happens inside updateDocument call below
        try {
            await this.updateDocument(targetPubKey, (loroDoc) => {
                // Generate random property key and value
                const randomKey = `prop_${Math.floor(Math.random() * 10000)}`;
                const randomValue = `value_${Math.floor(Math.random() * 10000)}`;

                // Add to Loro document using the data map
                const dataMap = loroDoc.getMap('data');
                dataMap.set(randomKey, randomValue);

                console.log(`[addRandomProperty] Added to LoroDoc: ${randomKey}=${randomValue}`);
            });

            // --- REMOVED REFRESH LOGIC ---
            // The Loro change handler will automatically update the content store 
            // if the currently selected document was the one modified.
            // const currentSelectedDoc = get(selectedDoc);
            // if (currentSelectedDoc && currentSelectedDoc.pubKey === targetPubKey) {
            // 	await this.loadDocumentContent(currentSelectedDoc);
            // }
            // ----------------------------

            return true;
        } catch (err) {
            console.error('[addRandomProperty] Error:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to add random property');
            return false;
        }
    }

    /**
     * Create a consolidated snapshot by applying all updates
     * @param pubKey Document public key
     * @returns The new snapshot CID or null if failed
     */
    async createConsolidatedSnapshot(pubKey?: string): Promise<string | null> {
        try {
            const targetPubKey = pubKey || get(selectedDoc)?.pubKey;
            if (!targetPubKey) {
                this.setError('No document selected');
                return null;
            }

            const doc = get(docs).find(d => d.pubKey === targetPubKey);
            if (!doc) {
                this.setError('Document not found');
                return null;
            }

            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!canWrite(currentUser, doc)) {
                this.setError('Permission denied: Cannot create snapshot for this document');
                return null;
            }
            // *** End Capability Check ***

            // Check if document has updates to consolidate
            if (!doc.updateCids || doc.updateCids.length === 0) {
                this.setError('No updates available to create a snapshot');
                return null;
            }

            this.setStatus({ loading: true });

            // Get or create the LoroDoc instance with all updates applied
            const loroDoc = await this.getOrCreateLoroDoc(targetPubKey);

            // Export as a new snapshot
            const snapshotData = loroDoc.export({ mode: 'snapshot' });

            // Generate content hash for the snapshot
            const snapshotCid = await hashService.hashSnapshot(snapshotData);

            // Save snapshot binary
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshotData, {
                type: CONTENT_TYPE_SNAPSHOT,
                documentPubKey: targetPubKey
            });

            // Create updated doc with new snapshot and no updates
            const updatedDoc: Docs = {
                ...doc,
                updatedAt: new Date().toISOString(),
                snapshotCid,      // Update main snapshot CID
                updateCids: [],   // Clear update CIDs since they're consolidated
                localState: {
                    ...(doc.localState || {}),
                    snapshotCid     // Mark new snapshot for syncing
                }
            };

            // Save updated document metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(targetPubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));

            // Update the docs store
            docs.update(docList => {
                const index = docList.findIndex(d => d.pubKey === targetPubKey);
                if (index !== -1) {
                    docList[index] = updatedDoc;
                }
                return docList;
            });

            // Update selected doc if this is the current one
            const currentSelectedDoc = get(selectedDoc);
            if (currentSelectedDoc && currentSelectedDoc.pubKey === targetPubKey) {
                selectedDoc.set({ ...updatedDoc }); // Force reactivity update
                await this.loadDocumentContent(updatedDoc);
            }

            return snapshotCid;
        } catch (err) {
            console.error('Error creating consolidated snapshot:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to create snapshot');
            return null;
        } finally {
            this.setStatus({ loading: false });
        }
    }

    /**
     * Get all documents that have local changes that need syncing
     * @returns Array of documents with local changes
     */
    async getDocumentsWithLocalChanges(): Promise<Docs[]> {
        try {
            const allDocs = get(docs);
            return allDocs.filter(doc =>
                doc.localState && (
                    doc.localState.snapshotCid ||
                    (doc.localState.updateCids && doc.localState.updateCids.length > 0)
                )
            );
        } catch (err) {
            console.error('Error getting documents with local changes:', err);
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
            // Get the document metadata
            const allDocs = get(docs);
            const docIndex = allDocs.findIndex(d => d.pubKey === pubKey);

            if (docIndex === -1) {
                throw new Error(`Document ${pubKey} not found`);
            }

            const doc = allDocs[docIndex];

            // Skip if no local state
            if (!doc.localState) {
                return;
            }

            let updatedDoc: Docs;

            // Create new local state object
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
                // Create a new object without the localState property
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { localState, ...docWithoutLocalState } = doc;
                updatedDoc = docWithoutLocalState;
            } else {
                // Keep the updated localState
                updatedDoc = { ...doc, localState: newLocalState };
            }

            // Save updated document metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));

            // Update the store
            allDocs[docIndex] = updatedDoc;
            docs.set([...allDocs]);
        } catch (err) {
            console.error('Error clearing local changes:', err);
            throw err;
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
            const allDocs = get(docs);
            const docIndex = allDocs.findIndex(d => d.pubKey === pubKey);
            if (docIndex === -1) {
                console.warn(`[updateDocStateAfterSync] Doc ${pubKey} not found.`);
                return;
            }

            const originalDoc = allDocs[docIndex];
            const updatedDoc = { ...originalDoc }; // Create a mutable copy
            let needsSave = false;

            // 1. Handle Synced Snapshot
            if (changes.snapshotCid && updatedDoc.localState?.snapshotCid === changes.snapshotCid) {
                updatedDoc.snapshotCid = changes.snapshotCid; // Promote to main snapshot
                if (updatedDoc.localState) {
                    updatedDoc.localState.snapshotCid = undefined; // Clear from local state
                }
                needsSave = true;
                console.log(`[updateDocStateAfterSync] Promoted snapshot ${changes.snapshotCid} for ${pubKey}`);
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
                console.log(`[updateDocStateAfterSync] Processed ${syncedCids.length} synced updates for ${pubKey}`);
            }

            // 3. Clean up localState if empty
            if (updatedDoc.localState && !updatedDoc.localState.snapshotCid && (!updatedDoc.localState.updateCids || updatedDoc.localState.updateCids.length === 0)) {
                delete updatedDoc.localState;
                needsSave = true;
                console.log(`[updateDocStateAfterSync] Removed empty localState for ${pubKey}`);
            }

            // 4. Save if changes were made
            if (needsSave) {
                updatedDoc.updatedAt = new Date().toISOString(); // Update timestamp
                const docsStorage = getDocsStorage();
                await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));

                // Update the store
                allDocs[docIndex] = updatedDoc;
                docs.set([...allDocs]);
                console.log(`[updateDocStateAfterSync] Saved updated state for ${pubKey}`);

                // If this is the selected document, update it too
                const currentSelected = get(selectedDoc);
                if (currentSelected && currentSelected.pubKey === pubKey) {
                    selectedDoc.set({ ...updatedDoc });
                }
            }

        } catch (err) {
            console.error('[updateDocStateAfterSync] Error:', err);
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
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
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

                // Use the metadata in newDoc below
                console.log('Extracted metadata:', docMetadata);
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

            // Update the docs store
            docs.update(docList => [newDoc, ...docList]);

            return { pubKey, snapshotCid };
        } catch (err) {
            console.error('Error importing content:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to import content');
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
            const doc = get(docs).find(d => d.pubKey === pubKey);
            if (!doc) {
                throw new Error('Document not found');
            }

            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!canRead(currentUser, doc)) {
                throw new Error('Permission denied: Cannot read this document to export');
            }
            // *** End Capability Check ***

            // Get the LoroDoc instance
            const loroDoc = await this.getOrCreateLoroDoc(pubKey);

            // Export based on requested mode
            return loroDoc.export({ mode: options.mode || 'snapshot' });
        } catch (err) {
            console.error('Error exporting content:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to export content');
            throw err;
        }
    }

    /**
     * Set status
     * @param newStatus Status update
     */
    private setStatus(newStatus: Partial<{ loading: boolean; error: boolean; creatingDoc: boolean }>): void {
        status.update(s => ({ ...s, ...newStatus }));
    }

    /**
     * Set error message
     * @param message Error message
     */
    private setError(message: string | null): void {
        error.set(message);
    }

    /**
     * Delete a document
     * @param pubKey Document public key
     * @returns True if successful, otherwise throws an error
     */
    async deleteDocument(pubKey: string): Promise<boolean> {
        try {
            const allDocs = get(docs);
            const docIndex = allDocs.findIndex(d => d.pubKey === pubKey);

            if (docIndex === -1) {
                throw new Error(`Document ${pubKey} not found`);
            }
            const doc = allDocs[docIndex];

            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!canDelete(currentUser, doc)) {
                throw new Error('Permission denied: Cannot delete this document');
            }
            // *** End Capability Check ***

            // Remove from the docs store
            allDocs.splice(docIndex, 1);
            docs.set([...allDocs]);

            // Clear selected doc if it's the one being deleted
            const currentSelected = get(selectedDoc);
            if (currentSelected && currentSelected.pubKey === pubKey) {
                selectedDoc.set(null);
                docContent.set({
                    content: null,
                    loading: false,
                    error: null,
                    sourceCid: null,
                    isLocalSnapshot: false
                });
            }

            // Close and cleanup any active LoroDoc instance
            if (activeLoroDocuments.has(pubKey)) {
                activeLoroDocuments.delete(pubKey);
            }

            // Delete from local storage
            const docsStorage = getDocsStorage();
            await docsStorage.delete(pubKey);

            // Note: We don't delete content CIDs here as they might be reused
            // The server handles content cleanup based on reference checks

            return true;
        } catch (err) {
            console.error('Error deleting document:', err);
            this.setError(`Failed to delete document: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
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
     * @returns The metadata (Docs object) of the newly created entity document.
     * @throws Error if creation fails.
     */
    public async createEntity(schemaPubKey: string, initialPlaces: Record<string, LoroJsonValue>, ownerId: string): Promise<Docs> {
        const pubKey: string = docIdService.generateDocId();
        const now: string = new Date().toISOString();

        try {
            const loroDoc: LoroDoc = await this.getOrCreateLoroDoc(pubKey);
            const meta: LoroMap = loroDoc.getMap('meta');
            meta.set('schema', `@${schemaPubKey}`);

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
            const snapshotCid: string = await hashService.hashSnapshot(snapshot);
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
                updateCids: [],
                localState: {
                    snapshotCid: snapshotCid
                }
            };
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDoc)));
            docs.update(currentDocs => [...currentDocs, newDoc]);
            activeLoroDocuments.set(pubKey, loroDoc);

            console.log(`[createEntity] Created entity ${pubKey} with schema @${schemaPubKey}`);
            return newDoc;

        } catch (err) {
            console.error(`[createEntity] Failed for schema @${schemaPubKey}:`, err);
            activeLoroDocuments.delete(pubKey);
            throw new Error(`Failed to create entity: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

            // 2. Store Update Content (check for existence first)
            const contentStorage = getContentStorage();
            const existingUpdate = await contentStorage.get(updateCid);
            if (!existingUpdate) {
                await contentStorage.put(updateCid, updateData, {
                    type: 'update',
                    documentPubKey: pubKey,
                    created: new Date().toISOString()
                });
                console.log(`[persistLoroUpdate] Stored new update content ${updateCid} for doc ${pubKey}`);
            } else {
                console.log(`[persistLoroUpdate] Update content ${updateCid} already exists.`);
            }

            // 3. Fetch Current Document Metadata (needed for atomic update simulation if needed)
            // We fetch it here to ensure we have the latest state before updating.
            // An alternative for true atomic DBs would be a single UPDATE command.
            const currentDoc = await this.getDocument(pubKey);
            if (!currentDoc) {
                throw new Error(`Document ${pubKey} not found during update persistence.`);
            }

            // 4. Check if update CID is already present
            if (currentDoc.updateCids?.includes(updateCid)) {
                console.log(`[persistLoroUpdate] Update CID ${updateCid} already present in doc ${pubKey}. Skipping metadata update.`);
                return updateCid; // Return existing CID, no metadata change needed
            }

            // 5. Update Document Metadata
            const updatedCids = [...(currentDoc.updateCids || []), updateCid];
            const updatedDocData: Docs = {
                ...currentDoc,
                updateCids: updatedCids,
                updatedAt: new Date().toISOString()
            };

            // Overwrite the existing metadata entry
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDocData)));

            // 6. Update Svelte store (for local UI consistency)
            docs.update(currentDocs => {
                const index = currentDocs.findIndex(d => d.pubKey === pubKey);
                if (index !== -1) {
                    currentDocs[index] = updatedDocData;
                    return [...currentDocs];
                }
                return currentDocs; // Should not happen if getDocument succeeded
            });
            // Update selectedDoc store if it's the current one
            const currentSelected = get(selectedDoc);
            if (currentSelected && currentSelected.pubKey === pubKey) {
                selectedDoc.set({ ...updatedDocData });
            }

            console.log(`[persistLoroUpdate] Appended update CID ${updateCid} to doc ${pubKey}`);
            return updateCid;

        } catch (err) {
            console.error(`[persistLoroUpdate] Failed for doc ${pubKey}:`, err);
            throw new Error(`Failed to persist update: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    /**
     * Retrieves the full JSON representation of a document by its pubKey.
     * Handles LoroDoc loading and conversion to JSON.
     * @param pubKey The public key of the document.
     * @returns The document content as a JSON object, or null if not found or error.
     */
    public async getDocumentDataAsJson(pubKey: string): Promise<Record<string, unknown> | null> {
        try {
            const loroDoc = await this.getLoroDoc(pubKey);
            if (!loroDoc) {
                return null;
            }
            // Add pubKey to the JSON representation for consistency
            const jsonData = loroDoc.toJSON() as Record<string, unknown>;
            jsonData.pubKey = pubKey;
            return jsonData;
        } catch (err) {
            console.error(`[getDocumentDataAsJson] Error fetching/parsing doc ${pubKey}:`, err);
            return null;
        }
    }

    /**
     * Retrieves the full JSON representation of a schema document by its reference (@pubKey).
     * @param schemaRef The schema reference string (e.g., "@0x...").
     * @returns The schema content as a JSON object, or null if not found or error.
     */
    public async getSchemaDataAsJson(schemaRef: string): Promise<Record<string, unknown> | null> {
        if (!schemaRef || !schemaRef.startsWith('@')) {
            console.error(`[getSchemaDataAsJson] Invalid schema reference format: ${schemaRef}`);
            return null;
        }
        const schemaPubKey = schemaRef.substring(1);
        // Use getDocumentDataAsJson to leverage its logic and pubKey injection
        return this.getDocumentDataAsJson(schemaPubKey);
    }

    /**
     * Updates the 'places' map of an entity document.
     * Handles LoroDoc loading, applying changes, validation (basic structure), snapshotting/updating, and persistence.
     * @param pubKey The public key of the entity document to update.
     * @param placesUpdate An object containing the key-value pairs to set in the 'places' map.
     * @returns The updated Docs metadata object.
     * @throws Error if the document is not found, update fails, or permission denied.
     */
    public async updateEntityPlaces(
        pubKey: string,
        placesUpdate: Record<string, LoroJsonValue>
    ): Promise<Docs> {
        // Get current metadata for capability check and return value
        const docMeta = await this.getDocument(pubKey);
        if (!docMeta) {
            throw new Error(`Document ${pubKey} not found for update.`);
        }

        // *** Capability Check ***
        const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
        if (!canWrite(currentUser, docMeta)) {
            throw new Error(`Permission denied: Cannot write to document ${pubKey}`);
        }
        // *** End Capability Check ***

        // Get the active LoroDoc instance (ensures it exists and is subscribed)
        const loroDoc = await this.getLoroDoc(pubKey);
        if (!loroDoc) {
            throw new Error(`Failed to load LoroDoc for update: ${pubKey}`);
        }

        // Get the data map, then the places map (create if needed)
        const dataMap = loroDoc.getMap('data');
        let placesMap: LoroMap;
        const potentialPlacesMap = dataMap.get('places');
        if (potentialPlacesMap instanceof LoroMap) {
            placesMap = potentialPlacesMap;
        } else {
            placesMap = dataMap.setContainer('places', new LoroMap());
            console.log(`[updateEntityPlaces] Created 'places' map for doc ${pubKey}`);
        }

        // Apply updates to the LoroMap (this triggers Loro change event)
        let changesMade = false;
        for (const key in placesUpdate) {
            if (Object.prototype.hasOwnProperty.call(placesUpdate, key)) {
                // TODO: Add check if value actually changed? Loro might handle this internally.
                placesMap.set(key, placesUpdate[key]);
                changesMade = true; // Assume change if key exists in update
            }
        }

        if (!changesMade) {
            console.log(`[updateEntityPlaces] No effective changes provided for doc ${pubKey}. Returning current metadata.`);
            return docMeta; // Return original metadata if no changes applied
        }

        // --- REMOVED PERSISTENCE & SVELTE STORE UPDATES ---
        // The Loro change handler (`_handleLoroChange`) will now handle:
        // 1. Exporting the update (only if byteLength > 0).
        // 2. Persisting the update via `persistLoroUpdate`.
        // 3. Updating relevant Svelte stores.
        // ---------------------------------------------------- 

        console.log(`[updateEntityPlaces] Applied Loro changes for doc ${pubKey}. Event handler will persist.`);

        // Return the metadata *before* the event handler potentially updates it.
        // The caller (HQL) might need this, and the UI will update reactively anyway.
        return docMeta;
    }

    // --- Loro Event Handling --- 
    private async _handleLoroChange(pubKey: string, loroDoc: LoroDoc) {
        console.log(`[Loro Event] Handling change for doc: ${pubKey}`);

        // 1. Increment global change notifier
        docChangeNotifier.update(n => n + 1);

        // 2. Fetch latest metadata (as it might have changed, e.g., updatedAt)
        // Note: This reads from storage. We might need a cached/in-memory version 
        // if direct Loro event doesn't provide enough context for metadata updates.
        const docMeta = await this.getDocument(pubKey);
        if (!docMeta) {
            console.warn(`[Loro Event] Metadata not found for changed doc ${pubKey}. Cannot update stores.`);
            return;
        }

        // Update updatedAt timestamp in the metadata object (reflecting the change)
        // This assumes the handler runs shortly after the change.
        // A more robust way might involve Loro'sLamport timestamps if available.
        docMeta.updatedAt = new Date().toISOString();

        // 3. Update the main 'docs' store
        docs.update(currentDocs => {
            const index = currentDocs.findIndex(d => d.pubKey === pubKey);
            if (index !== -1) {
                currentDocs[index] = { ...docMeta }; // Update with potentially new metadata
                return [...currentDocs]; // Return new array reference
            } else {
                // Doc changed but wasn't in the list? Add it? Or log error?
                console.warn(`[Loro Event] Changed doc ${pubKey} not found in docs store.`);
                return currentDocs; // Return original array
            }
        });

        // 4. Update 'selectedDoc' store if it's the one that changed
        const currentSelected = get(selectedDoc);
        if (currentSelected && currentSelected.pubKey === pubKey) {
            selectedDoc.set({ ...docMeta }); // Update selected doc with new metadata

            // 5. Reload content view for the selected document
            // Pass the *updated* metadata. loadDocumentContent reads from the *live* loroDoc.
            await this.loadDocumentContent(docMeta);
        }

        // 6. Trigger Asynchronous Persistence (Decoupled)
        // This should ideally be handled carefully to avoid race conditions 
        // and ensure atomicity if possible. For now, a simple async call.
        this._persistLoroUpdateAsync(pubKey, loroDoc).catch(err => {
            console.error(`[Loro Event] Background persistence failed for ${pubKey}:`, err);
            // Optionally notify user or set an error state?
            this.setError(`Background save failed for ${pubKey}`);
        });
    }

    // Helper for async persistence triggered by Loro event
    private async _persistLoroUpdateAsync(pubKey: string, loroDoc: LoroDoc): Promise<void> {
        // Removed redundant try...catch, caller handles errors
        const updateData = loroDoc.export({ mode: 'update' });
        if (updateData.byteLength > 0) {
            // Call the existing persistence logic (which also updates metadata)
            await this.persistLoroUpdate(pubKey, updateData);
            console.log(`[Loro Event] Background persistence successful for ${pubKey}.`);
        } else {
            console.log(`[Loro Event] No effective changes detected by Loro for ${pubKey}. Skipping persistence.`);
        }
    }
    // -------------------------
}

// Create and export singleton instance
export const hominioDB = new HominioDB(); 