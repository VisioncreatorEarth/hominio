import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { LoroDoc } from 'loro-crdt';
import { hashService } from './hash-service';
import { docIdService } from './docid-service';
import { getContentStorage, getDocsStorage, initStorage } from './hominio-storage';
import { authClient } from '$lib/client/auth-hominio'; // Assumed path for auth client
import { canRead, canWrite, type CapabilityUser, canDelete } from './hominio-capabilities'; // Import capabilities

// Constants
const CONTENT_TYPE_SNAPSHOT = 'snapshot';

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
    async createDocument(options: { name?: string, description?: string } = {}): Promise<string> {
        this.setStatus({ creatingDoc: true });

        try {
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!currentUser) {
                throw new Error("Permission denied: User must be logged in to create documents.");
            }

            const pubKey = await docIdService.generateDocId();
            // Use the actual logged-in user ID as the owner
            const owner = currentUser.id;

            const now = new Date().toISOString();
            const newDoc: Docs = {
                pubKey,
                owner, // Set owner to current user
                updatedAt: now
            };

            // Create a new Loro document
            const loroDoc = await this.getOrCreateLoroDoc(pubKey);

            // Set initial metadata if provided
            const meta = loroDoc.getMap("meta");
            if (options.name) {
                meta.set("name", options.name);
            }
            if (options.description) {
                meta.set("description", options.description);
            }

            // Create initial snapshot
            const snapshot = loroDoc.export({ mode: 'snapshot' });
            const snapshotCid = await hashService.hashSnapshot(snapshot);

            // Save snapshot to content storage
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshot, {
                type: 'snapshot',
                documentPubKey: pubKey,
                created: now
            });

            // Update document metadata: Place initial snapshot in localState
            newDoc.localState = { snapshotCid: snapshotCid };

            // Save document metadata to docs storage
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDoc)));

            // Update store
            docs.update(docs => [...docs, newDoc]);

            // Select the new document
            await this.selectDoc(newDoc);

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
                    console.log(`Loaded Loro doc for ${pubKey} from storage`);
                } catch (err) {
                    console.error(`Error importing binary data for doc ${pubKey}:`, err);
                }
            }
        }

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
        try {
            const allDocs = get(docs);
            const docIndex = allDocs.findIndex(d => d.pubKey === pubKey);

            if (docIndex === -1) {
                throw new Error(`Document ${pubKey} not found`);
            }
            const doc = allDocs[docIndex];

            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!canWrite(currentUser, doc)) {
                throw new Error('Permission denied: Cannot write to this document');
            }
            // *** End Capability Check ***

            // Get the Loro document
            const loroDoc = await this.getOrCreateLoroDoc(pubKey, doc.snapshotCid);

            // Apply the mutation
            mutationFn(loroDoc);

            // Create an update
            const updateData = loroDoc.export({ mode: 'update' });
            const updateCid = await hashService.hashSnapshot(updateData);

            // Save update to content storage
            const contentStorage = getContentStorage();
            await contentStorage.put(updateCid, updateData, {
                type: 'update',
                documentPubKey: pubKey,
                created: new Date().toISOString()
            });

            // Update the document metadata
            const updatedDoc = { ...doc };
            updatedDoc.updatedAt = new Date().toISOString();

            // Safely update localState
            updatedDoc.localState = updatedDoc.localState || {};
            updatedDoc.localState.updateCids = updatedDoc.localState.updateCids || [];
            updatedDoc.localState.updateCids.push(updateCid);

            // Save updated document metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));

            // Update the store
            allDocs[docIndex] = updatedDoc;
            docs.set([...allDocs]);

            // If this is the selected document, update content store AND selected doc store
            const selectedDocInfo = get(selectedDoc);
            if (selectedDocInfo && selectedDocInfo.pubKey === pubKey) {
                selectedDoc.set({ ...updatedDoc }); // Force reactivity update
                await this.loadDocumentContent(updatedDoc);
            }

            return updateCid;
        } catch (err) {
            console.error('Error updating document:', err);
            this.setError(`Failed to update document: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }
    }

    /**
     * Add a random property to a document (for testing purposes)
     * @param pubKey Document public key
     * @returns True if successful
     */
    async addRandomPropertyToDocument(pubKey?: string): Promise<boolean> {
        try {
            const targetPubKey = pubKey || get(selectedDoc)?.pubKey;
            if (!targetPubKey) {
                this.setError('No document selected');
                return false;
            }

            // Capability check happens inside updateDocument call below

            await this.updateDocument(targetPubKey, (loroDoc) => {
                // Generate random property key and value
                const randomKey = `prop_${Math.floor(Math.random() * 10000)}`;
                const randomValue = `value_${Math.floor(Math.random() * 10000)}`;

                // Add to Loro document using the data map
                const dataMap = loroDoc.getMap("data");
                dataMap.set(randomKey, randomValue);

                console.log(`Added random property to document: ${randomKey}=${randomValue}`);
            });

            // Ensure we refresh the selected document content after adding the property
            const currentSelectedDoc = get(selectedDoc);
            if (currentSelectedDoc && currentSelectedDoc.pubKey === targetPubKey) {
                await this.loadDocumentContent(currentSelectedDoc);
            }

            return true;
        } catch (err) {
            console.error('Error adding random property to document:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to update document');
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
                updateCids: []
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
}

// Create and export singleton instance
export const hominioDB = new HominioDB(); 