import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { LoroDoc, LoroMap } from 'loro-crdt';
import { hashService } from './hash-service';
import { docIdService } from './docid-service';
import { getContentStorage, getDocsStorage, initStorage } from './hominio-storage';
import { canRead, canWrite, canDelete } from './hominio-caps'; // Import central capability functions
import type { CapabilityUser } from './hominio-caps'; // Fixed import source
import type { ValidationRuleStructure } from './hominio-validate';

// --- Reactivity Notifier ---
// Simple store that increments when any tracked document changes.
// Consumed by services like HQL to trigger re-queries.
export const docChangeNotifier = writable(0);

// Debounced notification for batch operations
let notificationDebounceTimer: NodeJS.Timeout | null = null;
const NOTIFICATION_DEBOUNCE_MS = 50; // REDUCED from 150ms 

// Add variables to track notification timing
let lastNotificationTime: number = 0;
const NOTIFICATION_THROTTLE_MS = 75; // REDUCED from 200ms 

// Helper to trigger notification with debounce
export function triggerDocChangeNotification(): void {
    if (!browser) return; // Skip in SSR

    try {
        if (notificationDebounceTimer) {
            clearTimeout(notificationDebounceTimer);
        }

        // Throttle updates to no more than once per NOTIFICATION_THROTTLE_MS
        const now = Date.now();
        if (lastNotificationTime && now - lastNotificationTime < NOTIFICATION_THROTTLE_MS) {
            // Too soon after last notification, schedule for later
            notificationDebounceTimer = setTimeout(() => {
                lastNotificationTime = Date.now();
                docChangeNotifier.update(n => n + 1);
            }, NOTIFICATION_DEBOUNCE_MS);
            return;
        }

        // Normal debounced path
        notificationDebounceTimer = setTimeout(() => {
            lastNotificationTime = Date.now();
            docChangeNotifier.update(n => n + 1);
        }, NOTIFICATION_DEBOUNCE_MS);
    } catch (err) {
        console.error("Error in triggerDocChangeNotification:", err);
        // Try direct update as fallback with a slight delay
        setTimeout(() => {
            try {
                docChangeNotifier.update(n => n + 1);
            } catch (e) {
                console.error("Critical error updating docChangeNotifier:", e);
            }
        }, 10);
    }
}
// --------------------------

// Constants
const CONTENT_TYPE_SNAPSHOT = 'snapshot';

// Utility Types (mirrored from hominio-validate)
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

// --- Constants for Backlog Queue ---
const INDEXING_BACKLOG_KEY = '__indexing_backlog';
// Removing duplicate, non-exported interface declaration:
// interface IndexingBacklogItem {
//     pubKey: string;
//     addedTimestamp: string;
//     errorCount: number;
//     lastError?: string | null;
// }
// --- End Constants ---

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

    // --- NEW LOCAL Indexing State ---
    // This state is specific to the local client's indexing progress for this document.
    // It is stored in the local database registry alongside other metadata,
    // NOT within the synced LoroDoc content itself.
    indexingState?: {
        lastIndexedSnapshotCid?: string; // Base snapshot processed by local indexer
        lastIndexedUpdateCidsHash?: string; // Hash of sorted updateCids processed by local indexer
        needsReindex?: boolean; // Manual flag for forced re-indexing locally
        lastIndexedTimestamp?: string; // Timestamp of last local processing
        indexingError?: string | null; // Record last local indexing error for this doc (null indicates cleared)
    };
    // --- END NEW Indexing State ---
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
 * Define the structure for initialBridiData (add this near other types)
 */
interface InitialBridiData {
    gismu: 'bridi';
    selbriRef: string;
    sumtiData: Record<string, LoroJsonValue | string>;
    selbriJavni: Record<string, ValidationRuleStructure> | undefined;
}

/**
 * Represents the indexing state of a document.
 */
export interface IndexingState {
    lastIndexedTimestamp?: string; // ISO 8601 timestamp of the last successful indexing
    lastIndexedSnapshotCid?: string; // Snapshot CID at the time of last indexing
    lastIndexedUpdateCidsHash?: string; // Hash of updateCids array at the time of last indexing
    needsReindex: boolean; // Flag indicating if the document needs re-indexing
    indexingError?: string | null; // Last error message if indexing failed
}

/**
 * Represents an item in the indexing backlog.
 */
export interface IndexingBacklogItem { // Keeping the exported version
    pubKey: string;
    addedTimestamp: string; // ISO 8601 timestamp when added
    errorCount: number; // How many times indexing failed
    lastError: string; // The last error message encountered
}

/**
 * HominioDB class implements the Content layer functionality
 */
class HominioDB {
    // Internal state for loading/errors, perhaps move to a dedicated status service later
    private _isLoading: boolean = false;
    private _isCreatingDoc: boolean = false;
    private _lastError: string | null = null;
    private _isInitializingDoc: boolean = false; // Flag to prevent persistence during creation

    // Store the local peer info for potential use (though Loro peerId needs to be numeric)
    private _localUserId: string | null = null;
    private _localPeerId: string | null = null;

    constructor() {
        if (browser) {
            // Read initial MeData on construction
            this._readLocalPeerInfo();
            this.initialize().catch(err => {
                console.error('Failed to initialize HominioDB:', err);
                this._setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
            });
        }
    }

    /** Read local user/peer info from storage */
    private _readLocalPeerInfo(): void {
        if (!browser) return;
        const ME_STORAGE_KEY = 'hominio_me'; // Use the same key as in hominio-auth
        try {
            const meDataString = localStorage.getItem(ME_STORAGE_KEY);
            if (meDataString) {
                const meStored = JSON.parse(meDataString);
                this._localUserId = meStored?.id ?? null;
                this._localPeerId = meStored?.peer ?? null;
            }
        } catch (e) {
            console.warn('[HominioDB] Could not read/parse stored MeData for initial peer info.', e);
            this._localUserId = null;
            this._localPeerId = null;
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
     * @param initialBridiData Optional data to initialize a bridi document before the first snapshot
     * @returns PubKey of the created document
     */
    async createDocument(
        user: CapabilityUser | null,
        options: { name?: string; description?: string; owner?: string } = {},
        initialBridiData?: InitialBridiData
    ): Promise<string> {
        this._setStatus({ creatingDoc: true });
        this._setError(null); // Clear previous error
        this._isInitializingDoc = true; // Set flag before creation starts

        try {
            // Determine owner: prioritize options.owner, then user.id, then error
            const owner = options.owner ?? user?.id;
            if (!owner) {
                throw new Error("Cannot create document: Owner must be specified in options or user must be provided.");
            }

            const pubKey = await docIdService.generateDocId();
            const now = new Date().toISOString();

            const newDocMeta: Docs = {
                pubKey,
                owner,
                updatedAt: now
            };

            const loroDoc = await this.getOrCreateLoroDoc(pubKey); // Creates LoroDoc

            // Get or create top-level ckaji map and set cmene
            const ckajiMap = loroDoc.getMap('ckaji');

            // Apply initialBridiData if provided - directly creating top-level maps
            if (initialBridiData) {
                // Set klesi directly in ckaji
                ckajiMap.set('klesi', initialBridiData.gismu); // Assuming gismu maps to klesi for Bridi

                // Create top-level datni map
                const datniMap = loroDoc.getMap('datni');
                datniMap.set('selbri', initialBridiData.selbriRef);
                const sumtiMap = datniMap.setContainer('sumti', new LoroMap());
                for (const [place, value] of Object.entries(initialBridiData.sumtiData)) {
                    sumtiMap.set(place, value);
                }
            }
            // --- End Apply Initial Data ---

            // Snapshotting and initial save logic 
            const snapshot = loroDoc.export({ mode: 'snapshot' }); // Snapshot NOW includes initial data
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

            // Explicitly trigger reactivity after metadata is saved
            triggerDocChangeNotification();

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
        // Check if already active
        if (activeLoroDocuments.has(pubKey)) {
            return activeLoroDocuments.get(pubKey)!;
        }

        const storage = getDocsStorage();
        const docMetaDataBytes = await storage.get(pubKey);
        const docMeta: Docs | null = docMetaDataBytes ? JSON.parse(new TextDecoder().decode(docMetaDataBytes)) : null;
        const targetSnapshotCid = snapshotCid ?? docMeta?.snapshotCid;

        const loroDoc = new LoroDoc();
        // Assign numeric peerId (temporary, replace with actual sync mechanism)
        // This is complex. Loro peerIDs should ideally be stable and unique *numeric* IDs.
        // Hashing a string peerID isn't guaranteed unique numerically and changes on restart.
        // Using a fixed '1' for now, but this breaks multi-peer collaboration assumptions.
        // TODO: Integrate with a proper peer ID generation/sync system.
        loroDoc.setPeerId(1); // Placeholder

        if (targetSnapshotCid) {
            const contentStorage = getContentStorage();
            const rawSnapshot = await contentStorage.get(targetSnapshotCid);
            if (rawSnapshot) {
                try {
                    loroDoc.import(rawSnapshot);
                } catch (e) {
                    console.error(`Failed to import snapshot ${targetSnapshotCid} for doc ${pubKey}:`, e);
                    this._setError(`Failed to load snapshot ${targetSnapshotCid}`);
                    // Optionally create empty doc anyway or re-throw?
                    // Fall through to return the (likely empty) loroDoc instance
                }
            } else {
                console.warn(`Snapshot content ${targetSnapshotCid} for doc ${pubKey} not found in storage.`);
                this._setError(`Snapshot ${targetSnapshotCid} missing`);
                // Fall through to return the empty loroDoc instance
            }
        }

        // Add to active map
        activeLoroDocuments.set(pubKey, loroDoc);

        // REMOVED: Ensure core maps exist (safe to call multiple times)
        // REMOVED: if (!loroDoc.getMap('meta')) {
        // REMOVED:     loroDoc.getMap('meta');
        // REMOVED: }
        // REMOVED: if (!loroDoc.getMap('data')) {
        // REMOVED:     loroDoc.getMap('data');
        // REMOVED: }

        return loroDoc;
    }

    /**
     * Update a document in storage
     * @param pubKey Document public key
     * @param mutationFn Function that mutates the document
     * @returns CID of the update
     */
    async updateDocument(
        user: CapabilityUser | null,
        pubKey: string,
        mutationFn: (doc: LoroDoc) => void
    ): Promise<string> {
        this._setError(null);
        try {
            const docMeta = await this.getDocument(pubKey);
            if (!docMeta) {
                throw new Error(`Document ${pubKey} not found for update.`);
            }
            if (!canWrite(user, docMeta)) {
                throw new Error('Permission denied: Cannot write to this document');
            }

            const loroDoc = await this.getOrCreateLoroDoc(pubKey, docMeta.snapshotCid);

            // Apply User's Mutation
            mutationFn(loroDoc);

            loroDoc.commit();
            return pubKey;
        } catch (err) {
            console.error(`Error updating document ${pubKey}:`, err);
            this._setError(`Failed to update document: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }
    }

    /**
     * Create a consolidated snapshot by applying all updates
     * @param pubKey Document public key (Now Required)
     * @returns The new snapshot CID or null if failed
     */
    async createConsolidatedSnapshot(
        user: CapabilityUser | null, // Added user argument
        pubKey: string
    ): Promise<string | null> { // Made pubKey required
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
            if (!canWrite(user, doc)) { // Added user argument to canWrite
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
     * Updates the local document state after a successful sync operation.
     * Moves CIDs from localState to the main fields.
     * Handles server-side snapshot consolidation signaled by the sync service.
     * @param pubKey Document public key
     * @param changes Information about synced CIDs and potential server consolidation
     */
    async updateDocStateAfterSync(pubKey: string, changes: {
        snapshotCid?: string,     // Locally generated snapshot CID that was synced
        updateCids?: string[],    // Locally generated update CIDs that were synced
        serverConsolidated?: boolean; // Flag: Did server consolidate updates into a new snapshot?
        newServerSnapshotCid?: string; // The CID of the new snapshot created by the server
    }): Promise<void> {
        if (!browser) return;

        try {
            const doc = await this.getDocument(pubKey);
            if (!doc) { // Check if doc exists
                console.warn(`[updateDocStateAfterSync] Doc ${pubKey} not found.`);
                return;
            }

            const updatedDoc = { ...doc }; // Create a mutable copy
            let needsSave = false;

            // --- Handle Server Consolidation --- 
            if (changes.serverConsolidated && changes.newServerSnapshotCid) {
                updatedDoc.snapshotCid = changes.newServerSnapshotCid;
                updatedDoc.updateCids = [];

                // Create localState if it doesn't exist
                if (!updatedDoc.localState) {
                    updatedDoc.localState = {};
                }

                // Clear update CIDs from local state
                updatedDoc.localState.updateCids = [];
                // Also clear local snapshot if it existed, it's irrelevant now
                delete updatedDoc.localState.snapshotCid;

                needsSave = true;
            } else {
                // --- Standard Update Promotion (Only if NOT consolidated) --- 

                // Create localState if it doesn't exist
                if (!updatedDoc.localState) {
                    updatedDoc.localState = {};
                }

                // Initialize arrays if they don't exist
                if (!updatedDoc.updateCids) updatedDoc.updateCids = [];
                if (!updatedDoc.localState.updateCids) updatedDoc.localState.updateCids = [];

                // Promote synced updates (original logic)
                if (changes.updateCids && changes.updateCids.length > 0) {
                    const updatesToRemove = new Set(changes.updateCids);
                    const originalLocalUpdatesCount = updatedDoc.localState.updateCids.length;

                    // Remove synced CIDs from localState.updateCids 
                    updatedDoc.localState.updateCids = updatedDoc.localState.updateCids.filter(cid => !updatesToRemove.has(cid));

                    // Add synced CIDs to the main updateCids array (if not already present)
                    const currentBaseUpdates = new Set(updatedDoc.updateCids);
                    changes.updateCids.forEach(cid => {
                        if (!currentBaseUpdates.has(cid)) {
                            updatedDoc.updateCids!.push(cid);
                            currentBaseUpdates.add(cid); // Keep set updated
                        }
                    });

                    // If localState.updateCids changed length or base updateCids changed length
                    if (updatedDoc.localState.updateCids.length !== originalLocalUpdatesCount ||
                        updatedDoc.updateCids.length !== currentBaseUpdates.size) {
                        needsSave = true;
                    }
                }

                // Handle snapshot promotion if provided
                if (changes.snapshotCid && updatedDoc.localState.snapshotCid === changes.snapshotCid) {
                    updatedDoc.snapshotCid = changes.snapshotCid;
                    delete updatedDoc.localState.snapshotCid;
                    needsSave = true;
                }

                // --- End Standard Update Promotion --- 
            }
            // --- End Handle Server Consolidation ---

            // Clean up localState if empty
            if (updatedDoc.localState) {
                const hasLocalSnapshot = !!updatedDoc.localState.snapshotCid;
                const hasLocalUpdates = updatedDoc.localState.updateCids && updatedDoc.localState.updateCids.length > 0;

                if (!hasLocalSnapshot && !hasLocalUpdates) {
                    delete updatedDoc.localState;
                    needsSave = true;
                }
            }

            // Save if changes were made
            if (needsSave) {
                updatedDoc.updatedAt = new Date().toISOString(); // Update timestamp
                const docsStorage = getDocsStorage();
                await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));
                triggerDocChangeNotification();
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
    async importContent(
        user: CapabilityUser | null, // Added user argument
        binaryData: Uint8Array,
        options: {
            pubKey?: string,
            owner?: string
        } = {}
    ): Promise<{ pubKey: string, snapshotCid: string }> {
        try {
            // Determine owner: prioritize options.owner, then user.id, then error
            const determinedOwner = options.owner ?? user?.id;
            if (!determinedOwner) {
                throw new Error("Import requires an owner to be specified in options or user must be provided.");
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
                owner: determinedOwner, // Use determined owner
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
    async exportContent(
        user: CapabilityUser | null, // Added user argument
        pubKey: string,
        options: { mode?: 'snapshot' | 'update' } = {}
    ): Promise<Uint8Array> {
        try {
            // --- Fetch directly instead of using store ---
            // const doc = get(docs).find(d => d.pubKey === pubKey); // Removed
            const doc = await this.getDocument(pubKey); // Fetch directly
            // --------------------------------------------
            if (!doc) {
                throw new Error(`Document ${pubKey} not found for export`);
            }

            // *** Capability Check ***
            if (!canRead(user, doc)) { // Added user argument to canRead
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
        const wasLoading = this._isLoading;
        const wasCreating = this._isCreatingDoc;

        if (newStatus.loading !== undefined) this._isLoading = newStatus.loading;
        if (newStatus.creatingDoc !== undefined) this._isCreatingDoc = newStatus.creatingDoc;

        // Trigger notifier when loading/creating state changes to false (completed operation)
        if ((wasLoading && !this._isLoading) || (wasCreating && !this._isCreatingDoc)) {
            docChangeNotifier.update(n => n + 1);
        }
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
    async deleteDocument(
        user: CapabilityUser | null,
        pubKey: string
    ): Promise<boolean> {
        this._setError(null); // Clear error
        try {
            const doc = await this.getDocument(pubKey); // Fetch directly

            if (!doc) { // Check if doc exists
                throw new Error(`Document ${pubKey} not found for deletion`);
            }

            // *** Capability Check ***
            if (!canDelete(user, doc)) { // Added user argument to canDelete
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

            // Explicitly trigger reactivity *after* deletion
            docChangeNotifier.update(n => n + 1);

            return true;
        } catch (err) {
            console.error(`Error deleting document ${pubKey}:`, err);
            this._setError(`Failed to delete document: ${err instanceof Error ? err.message : String(err)}`);
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
     * Skips entries that fail to parse or lack a pubKey.
     * @returns Array of valid Docs metadata.
     */
    public async loadAllDocsReturn(): Promise<Docs[]> {
        const loadedDocs: Docs[] = [];
        try {
            const docsStorage = getDocsStorage();
            const allItems = await docsStorage.getAll();

            for (const item of allItems) {
                try {
                    if (item.key && item.value) { // Ensure key and value exist
                        const data = await docsStorage.get(item.key); // Re-fetch ensures we have Uint8Array
                        if (data) {
                            const docString = new TextDecoder().decode(data);
                            const parsedDoc = JSON.parse(docString);

                            // --- Validation Step --- 
                            if (parsedDoc && typeof parsedDoc === 'object' && typeof parsedDoc.pubKey === 'string' && parsedDoc.pubKey) {
                                // It looks like a valid Docs object (at least has a pubKey)
                                loadedDocs.push(parsedDoc as Docs);
                            } else {
                                console.warn(`[HominioDB loadAllDocsReturn] Skipping invalid/incomplete metadata entry for key ${item.key}. Data:`, parsedDoc);
                            }
                            // -----------------------
                        }
                    } else {
                        console.warn(`[HominioDB loadAllDocsReturn] Encountered item with missing key or value:`, item);
                    }
                } catch (parseErr) {
                    console.warn(`[HominioDB loadAllDocsReturn] Error parsing document metadata for key ${item.key}:`, parseErr);
                    // Optionally log the problematic string: console.warn("Problematic string:", new TextDecoder().decode(item.value));
                }
            }
        } catch (err) {
            console.error('[HominioDB loadAllDocsReturn] Error fetching documents from storage:', err);
            // Return whatever was loaded successfully before the error
        }
        return loadedDocs;
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
            const emptyDoc = new LoroDoc();
            emptyDoc.setPeerId(1);

            // <<< FIX: Add subscription to the newly created empty doc >>>
            emptyDoc.subscribe(() => {
                this._persistLoroUpdateAsync(pubKey, emptyDoc).catch(err => {
                    console.error(`[Loro Subscribe - EmptyDoc] Failed to persist update for ${pubKey}:`, err);
                });
            });
            // <<< END FIX >>>

            activeLoroDocuments.set(pubKey, emptyDoc); // Caches potentially unsubscribed doc
            return emptyDoc;
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
            loroDoc.setPeerId(1); // Set a default peer ID

            // Add subscribe to changes
            loroDoc.subscribe(() => {
                console.log(`[Loro Subscribe Callback] Triggered for pubKey: ${pubKey}`);
                // Check if there are changes that need persisting
                // This is called when the document changes in-memory
                this._persistLoroUpdateAsync(pubKey, loroDoc).catch(err => {
                    console.error(`[Loro Subscribe] Failed to persist update for ${pubKey}:`, err);
                });
            });

            // Store in cache
            activeLoroDocuments.set(pubKey, loroDoc);

            return loroDoc;

        } catch (importErr) {
            console.error(`[getLoroDoc] Error importing snapshot ${snapshotCid} for ${pubKey}:`, importErr);
            return null;
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
            const updateCid = await hashService.hashSnapshot(updateData);

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
                // Always update the updatedAt timestamp to ensure change detection
                updatedDocData.updatedAt = new Date().toISOString();
                // Persist updated metadata
                const docsStorage = getDocsStorage();
                await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDocData)));
                // Always trigger the notifier after updates
                docChangeNotifier.update((n) => n + 1);
            } else {

                // Trigger notification even if no new updates to ensure UI refreshes
                docChangeNotifier.update((n) => n + 1);
            }

            return updateCid; // Return the CID regardless of whether metadata was updated

        } catch (err) {
            console.error(`[persistLoroUpdate] Failed for doc ${pubKey}:`, err);
            this._setError(`Failed to persist update: ${err instanceof Error ? err.message : 'Unknown error'}`);
            throw err; // Re-throw error
        }
    }

    // Helper for async persistence triggered by Loro event
    private async _persistLoroUpdateAsync(pubKey: string, loroDoc: LoroDoc): Promise<void> {
        if (this._isInitializingDoc) {
            // REMOVED: console.log("[HominioDB] Skipping persistence during initial document creation.");
            return; // Skip persistence if called during createDocument
        }

        const isFacki = pubKey.startsWith('@facki_');
        if (isFacki) {
            console.log(`[HominioDB _persistLoroUpdateAsync] START for Facki: ${pubKey}`);
        }

        const docsStorage = getDocsStorage();
        // <<< REMOVED Log: Fetching Metadata >>>
        const docMetaDataBytes = await docsStorage.get(pubKey);
        const docMeta: Docs | null = docMetaDataBytes ? JSON.parse(new TextDecoder().decode(docMetaDataBytes)) : null;
        if (!docMeta) {
            console.error(`Cannot persist update for non-existent document: ${pubKey}`); // Keep Error
            return;
        }

        // 1. Export Snapshot
        // <<< REMOVED Log: Exporting Snapshot >>>
        const snapshotBytes = loroDoc.exportSnapshot();
        const snapshotCid = await hashService.hashSnapshot(snapshotBytes);

        // 2. Save Content
        // <<< REMOVED Log: Saving Content >>>
        const contentStorage = getContentStorage();

        // Save content with minimal metadata known by hominio-db
        await contentStorage.put(snapshotCid, snapshotBytes, {
            type: CONTENT_TYPE_SNAPSHOT,
            createdAt: new Date().toISOString()
        });

        // <<< REMOVED Log: Content Saved >>>

        // 3. Update Docs Registry
        const updatedDocMeta: Docs = {
            ...docMeta,
            snapshotCid: snapshotCid,
            updatedAt: new Date().toISOString(),
            updateCids: [], // Clear update CIDs as they are now part of the snapshot
            localState: undefined // Clear local state as snapshot is persisted
        };

        // <<< REMOVED Log: Updating Metadata >>>
        await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDocMeta)));

        // REMOVED: console.log(`[HominioDB] Persisted snapshot for ${pubKey}. CID: ${snapshotCid}`);

        // 4. Trigger notification AFTER successful persistence
        triggerDocChangeNotification();

        // <<< REMOVED Log: Snapshot details >>>

        // REMOVED: Redundant put and logs

        if (isFacki) {
            console.log(`[HominioDB _persistLoroUpdateAsync] END for Facki: ${pubKey} (New CID: ${snapshotCid.substring(0, 10)}...)`);
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
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(mergedDoc)));

            // Trigger reactivity after saving document
            // REMOVED: docChangeNotifier.update(n => n + 1);
            // The main sync loop should trigger the notification once at the end.

        } catch (err) {
            console.error(`[saveSyncedDocument] Error processing doc ${pubKey}:`, err);
            // Optionally re-throw or handle differently
            throw err;
        }
    }

    /**
     * Updates ONLY the indexingState part of a document's metadata in the local registry.
     * @param pubKey The public key of the document.
     * @param stateUpdate An object containing the indexingState fields to update.
     */
    public async updateDocIndexingState(
        pubKey: string,
        stateUpdate: Partial<NonNullable<Docs['indexingState']>>
    ): Promise<void> {
        try {
            const currentDoc = await this.getDocument(pubKey);
            if (!currentDoc) {
                console.warn(`[updateDocIndexingState] Document ${pubKey} not found. Cannot update indexing state.`);
                return;
            }

            // Merge the update with the existing state
            const newIndexingState = { ...currentDoc.indexingState, ...stateUpdate };

            // Create the updated document metadata, ensuring not to modify other fields
            const updatedDocData: Docs = {
                ...currentDoc,
                indexingState: newIndexingState,
                // IMPORTANT: Do NOT update updatedAt here unless specifically intended by the caller
                // Indexing state changes shouldn't necessarily mark the doc as updated for sync purposes.
            };

            // Persist updated metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDocData)));

            // Trigger notifier? Maybe not for just indexing state?
            // Let's assume for now that changes relevant to queries will come from
            // the index documents themselves changing, not just this metadata.
            // docChangeNotifier.update(n => n + 1); 

        } catch (err) {
            console.error(`[updateDocIndexingState] Failed for doc ${pubKey}:`, err);
            // Don't throw, just log the error. The indexer should handle its own errors.
        }
    }

    // --- Backlog Queue Management Methods ---

    /**
     * Adds or updates an item in the indexing backlog queue.
     * Uses a dedicated key in the KV store.
     * @param item The backlog item to add/update.
     */
    public async addToIndexingBacklog(item: IndexingBacklogItem): Promise<void> {
        try {
            const storage = getDocsStorage(); // Assuming docsStorage is the KV store
            // Fetch the current backlog (assuming it's stored as a single object/map)
            const backlogData = await storage.get(INDEXING_BACKLOG_KEY);
            let backlog: Record<string, IndexingBacklogItem> = {};
            if (backlogData) {
                try {
                    backlog = JSON.parse(new TextDecoder().decode(backlogData));
                } catch (parseErr) {
                    console.error("[addToIndexingBacklog] Failed to parse existing backlog, starting fresh.", parseErr);
                    backlog = {}; // Reset on parse error
                }
            }
            // Add/update the item
            backlog[item.pubKey] = item;
            // Save the updated backlog
            await storage.put(INDEXING_BACKLOG_KEY, new TextEncoder().encode(JSON.stringify(backlog)));
        } catch (err) {
            console.error(`[addToIndexingBacklog] Error adding item for ${item.pubKey}:`, err);
            // Consider how to handle failure here - maybe retry?
        }
    }

    /**
     * Retrieves the next item (or items) from the indexing backlog queue.
     * Simple implementation: gets the first item based on object key order.
     * More sophisticated strategies (priority, oldest) could be added.
     * @param count Number of items to retrieve (default 1)
     * @returns An array of backlog items, or an empty array if none.
     */
    public async getNextFromIndexingBacklog(count = 1): Promise<IndexingBacklogItem[]> {
        try {
            const storage = getDocsStorage();
            const backlogData = await storage.get(INDEXING_BACKLOG_KEY);
            if (!backlogData) {
                return [];
            }
            let backlog: Record<string, IndexingBacklogItem> = {};
            try {
                backlog = JSON.parse(new TextDecoder().decode(backlogData));
            } catch (parseErr) {
                console.error("[getNextFromIndexingBacklog] Failed to parse backlog.", parseErr);
                return [];
            }

            const keys = Object.keys(backlog);
            if (keys.length === 0) {
                return [];
            }

            // Return the first 'count' items
            const itemsToReturn: IndexingBacklogItem[] = [];
            for (let i = 0; i < Math.min(count, keys.length); i++) {
                itemsToReturn.push(backlog[keys[i]]);
            }
            return itemsToReturn;

        } catch (err) {
            console.error("[getNextFromIndexingBacklog] Error getting items:", err);
            return [];
        }
    }

    /**
     * Removes an item from the indexing backlog queue by its pubKey.
     * @param pubKey The pubKey of the item to remove.
     */
    public async removeFromIndexingBacklog(pubKey: string): Promise<void> {
        try {
            const storage = getDocsStorage();
            const backlogData = await storage.get(INDEXING_BACKLOG_KEY);
            if (!backlogData) {
                return; // Nothing to remove from
            }
            let backlog: Record<string, IndexingBacklogItem> = {};
            try {
                backlog = JSON.parse(new TextDecoder().decode(backlogData));
            } catch (parseErr) {
                console.error("[removeFromIndexingBacklog] Failed to parse backlog.", parseErr);
                return; // Cannot modify corrupt backlog
            }

            if (backlog[pubKey]) {
                delete backlog[pubKey];
                // Save the modified backlog
                await storage.put(INDEXING_BACKLOG_KEY, new TextEncoder().encode(JSON.stringify(backlog)));
            } // Else: Item wasn't in the backlog anyway

        } catch (err) {
            console.error(`[removeFromIndexingBacklog] Error removing item ${pubKey}:`, err);
        }
    }

    // --- End Backlog Queue Management Methods ---
}

// Create and export singleton instance
export const hominioDB = new HominioDB(); 