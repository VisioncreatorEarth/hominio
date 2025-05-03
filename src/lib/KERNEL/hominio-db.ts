// import { writable } from 'svelte/store'; // REMOVED
import { browser } from '$app/environment';
import { LoroDoc, LoroMap } from 'loro-crdt';
import { hashService } from './hash-service';
import { docIdService } from './docid-service';
import { getContentStorage, getDocsStorage, initStorage } from './hominio-storage';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { canRead, canWrite, canDelete, canCreate } from './hominio-caps'; // Keep imports, acknowledge lint for now
import type { CapabilityUser } from './hominio-caps';
import type { ValidationRuleStructure } from './hominio-validate';
import { hominioIndexing } from './hominio-indexing';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LeafRecord, LeafValue } from '$db/seeding/leaf.data'; // Keep types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SchemaRecord } from '$db/seeding/schema.data'; // Keep types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { CompositeRecord } from '$db/seeding/composite.data'; // Keep types

// --- Reactivity Notifier REMOVED ---
// export const docChangeNotifier = writable(0); // REMOVED

// --- Framework-Agnostic Pub/Sub --- NEW
type ListenerCallback = () => void;
const listeners: ListenerCallback[] = [];

/**
 * Subscribes a callback function to database change notifications.
 * @param callback The function to call when a change occurs.
 * @returns An unsubscribe function.
 */
export function subscribeToDbChanges(callback: ListenerCallback): () => void {
    listeners.push(callback);
    return () => {
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    };
}

/** Internal function to notify all registered listeners */
function notifyListeners(): void {
    // console.log('[HominioDB] Notifying listeners:', listeners.length); // Optional Debug
    listeners.forEach(callback => {
        try {
            callback();
        } catch (err) {
            console.error('[HominioDB] Error executing DB change listener:', err);
        }
    });
}
// --- End Pub/Sub ---


// Debounced notification for batch operations
// let notificationDebounceTimer: NodeJS.Timeout | null = null; // REMOVED - No longer used directly here
// const NOTIFICATION_DEBOUNCE_MS = 50; // REMOVED

// Constants
const CONTENT_TYPE_SNAPSHOT = 'snapshot';

// Utility Types (mirrored from hominio-validate)
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

// --- Constants for Backlog Queue ---
const INDEXING_BACKLOG_KEY = '__indexing_backlog';

// --- End Constants ---

/**
 * Docs interface represents the document registry for tracking and searching
 */
export interface Docs {
    pubKey: string;
    owner: string;
    updatedAt: string;
    snapshotCid?: string;
    updateCids?: string[];

    // Local state tracking for sync
    localState?: {
        snapshotCid?: string;
        updateCids?: string[];
    };

    // --- NEW LOCAL Indexing State ---
    indexingState?: {
        lastIndexedSnapshotCid?: string;
        lastIndexedUpdateCidsHash?: string;
        needsReindex?: boolean;
        lastIndexedTimestamp?: string;
        indexingError?: string | null;
    };
    // --- END NEW Indexing State ---
}

/**
 * Content represents the binary content of a document with its metadata
 */
export interface Content {
    cid: string;
    type: string;
    raw: Uint8Array;
    metadata: Record<string, unknown>;
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
    appliedUpdates?: number;
}

// Map to hold active Loro document instances
const activeLoroDocuments = new Map<string, LoroDoc>();

/**
 * Define the structure for initialBridiData
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
    lastIndexedTimestamp?: string;
    lastIndexedSnapshotCid?: string;
    lastIndexedUpdateCidsHash?: string;
    needsReindex: boolean;
    indexingError?: string | null;
}

/**
 * Represents an item in the indexing backlog.
 */
export interface IndexingBacklogItem {
    pubKey: string;
    addedTimestamp: string;
    errorCount: number;
    lastError: string;
}

/**
 * HominioDB class implements the Content layer functionality
 */
class HominioDB {
    // Internal state for loading/errors, perhaps move to a dedicated status service later
    private _isLoading: boolean = false;
    private _isCreatingDoc: boolean = false;
    private _lastError: string | null = null;
    private _isInitializingDoc: boolean = false;
    private _suppressNotifications: boolean = false;
    private _needsNotification: boolean = false;

    // Store the local peer info for potential use
    private _localUserId: string | null = null;
    private _localPeerId: string | null = null;

    constructor() {
        if (browser) {
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
        const ME_STORAGE_KEY = 'hominio_me';
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
            await initStorage();
            this._setStatus({ loading: false });
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
        console.warn("loadAllDocs() called, but no longer updates internal stores. Use loadAllDocsReturn() for data.");
        try {
            await this.loadAllDocsReturn();
        } catch (err) {
            console.error('Error loading documents in loadAllDocs:', err);
            this._setError(`Failed to load documents: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Internal method to persist a NEW document given a prepared LoroDoc.
     * Assumes pubKey is already generated and LoroDoc is populated.
     * Handles snapshotting, saving content, saving doc metadata (with indexing state),
     * caching, and subscribing.
     * Called by createDocument and potentially by executeMutation.
     * @private Internal use only.
     */
    private async _persistNewDocument(
        user: CapabilityUser | null,
        pubKey: string,
        owner: string,
        preparedDoc: LoroDoc
    ): Promise<{ snapshotCid: string }> {
        const now = new Date().toISOString();

        // --- Snapshot and Save Content --- 
        const snapshot = preparedDoc.exportSnapshot();
        const snapshotCid = await hashService.hashSnapshot(snapshot);
        const contentStorage = getContentStorage();
        await contentStorage.put(snapshotCid, snapshot, {
            type: 'snapshot',
            documentPubKey: pubKey,
            created: now
        });

        // --- Create Doc Metadata --- 
        const newDocMeta: Docs = {
            pubKey,
            owner,
            updatedAt: now,
            snapshotCid: snapshotCid,
            updateCids: [],
            indexingState: {
                needsReindex: true,
                indexingError: null
            },
            localState: {
                snapshotCid: snapshotCid
            }
        };

        const docsStorage = getDocsStorage();
        await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDocMeta)));

        // Cache the new LoroDoc instance
        activeLoroDocuments.set(pubKey, preparedDoc);
        // Subscribe AFTER initial save
        preparedDoc.subscribe(() => {
            this._persistLoroUpdateAsync(pubKey, preparedDoc).catch(err => {
                console.error(`[Loro Subscribe - PersistNew] Failed to persist update for ${pubKey}:`, err);
            });
        });

        // <<< Call internal trigger >>>
        this._triggerNotification();

        return { snapshotCid };
    }

    /**
     * Create a new document (Public API)
     * Generates ID, determines owner, creates LoroDoc, populates initial data,
     * then calls _persistNewDocument.
     * @param options Document creation options
     * @param initialBridiData Optional data to initialize a bridi document
     * @returns PubKey of the created document
     */
    async createDocument(
        user: CapabilityUser | null,
        options: { name?: string; description?: string; owner?: string } = {},
        initialBridiData?: InitialBridiData
    ): Promise<string> {
        this._setStatus({ creatingDoc: true });
        this._setError(null);
        this._isInitializingDoc = true;

        try {
            const owner = options.owner ?? user?.id;
            if (!owner) {
                throw new Error("Cannot create document: Owner must be specified in options or user must be provided.");
            }
            const pubKey = await docIdService.generateDocId();

            // --- Create LoroDoc and Populate Initial Data --- 
            const loroDoc = new LoroDoc();
            loroDoc.setPeerId(1); // Use default numeric ID

            const metadataMap = loroDoc.getMap('metadata');
            metadataMap.set('type', 'Unknown'); // Default type
            const dataMap = loroDoc.getMap('data');

            if (initialBridiData) { // Example specific population
                metadataMap.set('type', 'Bridi');
                dataMap.set('selbri', initialBridiData.selbriRef);
                const sumtiMap = dataMap.setContainer('sumti', new LoroMap());
                for (const [place, value] of Object.entries(initialBridiData.sumtiData)) {
                    sumtiMap.set(place, value);
                }
            } // Add more specific population logic if needed for other types via this API

            // --- Persist using the internal method --- 
            await this._persistNewDocument(user, pubKey, owner, loroDoc);

            return pubKey;
        } catch (err) {
            console.error('Error creating document:', err);
            this._setError(`Failed to create document: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        } finally {
            this._setStatus({ creatingDoc: false });
            this._isInitializingDoc = false;
        }
    }

    /**
     * Ensures a LoroDoc instance is loaded/created for the given document.
     * Does NOT load the content into a store anymore.
     * @param doc Document metadata
     */
    async selectDoc(doc: Docs): Promise<void> {
        if (!doc) {
            console.warn("[selectDoc] Received null document.");
            return;
        }

        try {
            const snapshotCid = doc.localState?.snapshotCid || doc.snapshotCid;
            await this.getOrCreateLoroDoc(doc.pubKey, snapshotCid);
        } catch (err) {
            console.error(`Error preparing LoroDoc for ${doc.pubKey} during selectDoc:`, err);
            this._setError(`Failed to prepare document instance: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Get or create a Loro document instance
     * @param pubKey Document public key
     * @param snapshotCid Optional snapshot CID to initialize from
     */
    private async getOrCreateLoroDoc(pubKey: string, snapshotCid?: string): Promise<LoroDoc> {
        if (activeLoroDocuments.has(pubKey)) {
            return activeLoroDocuments.get(pubKey)!;
        }

        const storage = getDocsStorage();
        const docMetaDataBytes = await storage.get(pubKey);
        const docMeta: Docs | null = docMetaDataBytes ? JSON.parse(new TextDecoder().decode(docMetaDataBytes)) : null;
        const targetSnapshotCid = snapshotCid ?? docMeta?.snapshotCid;

        const loroDoc = new LoroDoc();
        loroDoc.setPeerId(1);

        if (targetSnapshotCid) {
            const contentStorage = getContentStorage();
            const rawSnapshot = await contentStorage.get(targetSnapshotCid);
            if (rawSnapshot) {
                try {
                    loroDoc.import(rawSnapshot);
                } catch (e) {
                    console.error(`Failed to import snapshot ${targetSnapshotCid} for doc ${pubKey}:`, e);
                    this._setError(`Failed to load snapshot ${targetSnapshotCid}`);
                }
            } else {
                console.warn(`Snapshot content ${targetSnapshotCid} for doc ${pubKey} not found in storage.`);
                this._setError(`Snapshot ${targetSnapshotCid} missing`);
            }
        }

        activeLoroDocuments.set(pubKey, loroDoc);
        return loroDoc;
    }

    /**
     * Update a document in storage - MODIFIED FOR MUTATION ENGINE
     * This version is simplified as the mutation engine handles LoroDoc manipulation.
     * It primarily focuses on persisting the changes prepared by the mutation engine.
     * @param user The user performing the update.
     * @param pubKey Document public key.
     * @param updatedLoroDoc The LoroDoc instance with updates already applied (from mutation engine).
     * @returns The CID of the new snapshot created.
     * @throws Error if persistence fails or document not found.
     */
    async updateDocument(
        user: CapabilityUser | null,
        pubKey: string,
        updatedLoroDoc: LoroDoc
    ): Promise<string> {
        this._setError(null);
        try {
            const docMeta = await this.getDocument(pubKey);
            if (!docMeta) {
                throw new Error(`Document ${pubKey} not found for update.`);
            }

            // Permission check (using imported function)
            if (!canWrite(user, docMeta)) { // Example usage
                throw new Error('Permission denied: Cannot write to this document');
            }

            const snapshotBytes = updatedLoroDoc.exportSnapshot();
            const snapshotCid = await hashService.hashSnapshot(snapshotBytes);

            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshotBytes, {
                type: CONTENT_TYPE_SNAPSHOT,
                documentPubKey: pubKey,
                createdAt: new Date().toISOString()
            });

            const updatedDocMeta: Docs = {
                ...docMeta,
                snapshotCid: snapshotCid,
                updatedAt: new Date().toISOString(),
                updateCids: [],
                localState: undefined,
                indexingState: {
                    ...(docMeta.indexingState || {}),
                    needsReindex: true,
                    lastIndexedTimestamp: undefined,
                    lastIndexedSnapshotCid: undefined,
                    lastIndexedUpdateCidsHash: undefined
                }
            };
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDocMeta)));

            activeLoroDocuments.set(pubKey, updatedLoroDoc);
            updatedLoroDoc.subscribe(() => {
                this._persistLoroUpdateAsync(pubKey, updatedLoroDoc).catch(err => {
                    console.error(`[Loro Subscribe - Update] Failed to persist update for ${pubKey}:`, err);
                });
            });

            this._triggerNotification();

            return snapshotCid;
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
        user: CapabilityUser | null,
        pubKey: string
    ): Promise<string | null> {
        this._setStatus({ loading: true });
        this._setError(null);
        try {
            const doc = await this.getDocument(pubKey);
            if (!doc) {
                throw new Error(`Document ${pubKey} not found for snapshot creation.`);
            }

            if (!canWrite(user, doc)) {
                throw new Error('Permission denied: Cannot create snapshot for this document');
            }

            if (!doc.updateCids || doc.updateCids.length === 0) {
                throw new Error('No updates available to create a snapshot');
            }

            const loroDoc = await this.getLoroDoc(pubKey);
            if (!loroDoc) {
                throw new Error(`Could not load LoroDoc instance for ${pubKey}`);
            }

            const snapshotData = loroDoc.export({ mode: 'snapshot' });
            const snapshotCid = await hashService.hashSnapshot(snapshotData);

            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshotData, {
                type: CONTENT_TYPE_SNAPSHOT,
                documentPubKey: pubKey
            });

            const updatedDoc: Docs = {
                ...doc,
                updatedAt: new Date().toISOString(),
                snapshotCid,
                updateCids: [],
                localState: {
                    ...(doc.localState || {}),
                    snapshotCid
                }
            };

            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));

            // <<< TRIGGER NOTIFICATION AFTER SAVE >>>
            this._triggerNotification();

            return snapshotCid;
        } catch (err) {
            console.error(`Error creating consolidated snapshot for ${pubKey}:`, err);
            this._setError(err instanceof Error ? err.message : 'Failed to create snapshot');
            return null;
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
            const allDocs = await this.loadAllDocsReturn();
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
            const doc = await this.getDocument(pubKey);

            if (!doc) {
                throw new Error(`Document ${pubKey} not found for clearing local changes`);
            }

            if (!doc.localState) {
                return;
            }

            let updatedDoc: Docs;
            const newLocalState = { ...doc.localState };

            if (changes.snapshotCid && doc.localState.snapshotCid === changes.snapshotCid) {
                newLocalState.snapshotCid = undefined;
            }

            if (changes.updateCids && changes.updateCids.length > 0 && newLocalState.updateCids) {
                newLocalState.updateCids = newLocalState.updateCids.filter(
                    cid => !changes.updateCids?.includes(cid)
                );
            }

            if (!newLocalState.snapshotCid &&
                (!newLocalState.updateCids || newLocalState.updateCids.length === 0)) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { localState, ...docWithoutLocalState } = doc;
                updatedDoc = docWithoutLocalState;
            } else {
                updatedDoc = { ...doc, localState: newLocalState };
            }

            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));
        } catch (err) {
            console.error(`Error clearing local changes for ${pubKey}:`, err);
            this._setError(`Failed to clear local changes: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
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
        snapshotCid?: string;
        updateCids?: string[];
        serverConsolidated?: boolean;
        newServerSnapshotCid?: string;
    }): Promise<void> {
        if (!browser) return;

        try {
            const doc = await this.getDocument(pubKey);
            if (!doc) {
                console.warn(`[updateDocStateAfterSync] Doc ${pubKey} not found.`);
                return;
            }

            const updatedDoc = { ...doc };
            let needsSave = false;

            if (changes.serverConsolidated && changes.newServerSnapshotCid) {
                updatedDoc.snapshotCid = changes.newServerSnapshotCid;
                updatedDoc.updateCids = [];
                if (!updatedDoc.localState) updatedDoc.localState = {};
                updatedDoc.localState.updateCids = [];
                delete updatedDoc.localState.snapshotCid;
                needsSave = true;
            } else {
                if (!updatedDoc.localState) updatedDoc.localState = {};
                if (!updatedDoc.updateCids) updatedDoc.updateCids = [];
                if (!updatedDoc.localState.updateCids) updatedDoc.localState.updateCids = [];

                if (changes.updateCids && changes.updateCids.length > 0) {
                    const updatesToRemove = new Set(changes.updateCids);
                    const originalLocalUpdatesCount = updatedDoc.localState.updateCids.length;
                    updatedDoc.localState.updateCids = updatedDoc.localState.updateCids.filter(cid => !updatesToRemove.has(cid));
                    const currentBaseUpdates = new Set(updatedDoc.updateCids);
                    changes.updateCids.forEach(cid => {
                        if (!currentBaseUpdates.has(cid)) {
                            updatedDoc.updateCids!.push(cid);
                            currentBaseUpdates.add(cid);
                        }
                    });
                    if (updatedDoc.localState.updateCids.length !== originalLocalUpdatesCount ||
                        updatedDoc.updateCids.length !== currentBaseUpdates.size) {
                        needsSave = true;
                    }
                }

                if (changes.snapshotCid && updatedDoc.localState.snapshotCid === changes.snapshotCid) {
                    updatedDoc.snapshotCid = changes.snapshotCid;
                    delete updatedDoc.localState.snapshotCid;
                    needsSave = true;
                }
            }

            if (updatedDoc.localState) {
                const hasLocalSnapshot = !!updatedDoc.localState.snapshotCid;
                const hasLocalUpdates = updatedDoc.localState.updateCids && updatedDoc.localState.updateCids.length > 0;
                if (!hasLocalSnapshot && !hasLocalUpdates) {
                    delete updatedDoc.localState;
                    needsSave = true;
                }
            }

            if (needsSave) {
                updatedDoc.updatedAt = new Date().toISOString();
                const docsStorage = getDocsStorage();
                await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));
                this._triggerNotification();
            }
        } catch (err) {
            console.error(`[updateDocStateAfterSync] Error updating state for ${pubKey}:`, err);
            this._setError(`Failed sync state update: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Import content into the database
     * @param binaryData Binary data to import
     * @param options Import options
     * @returns The document pubKey and snapshot CID
     */
    async importContent(
        user: CapabilityUser | null,
        binaryData: Uint8Array,
        options: {
            pubKey?: string,
            owner?: string
        } = {}
    ): Promise<{ pubKey: string, snapshotCid: string }> {
        try {
            const determinedOwner = options.owner ?? user?.id;
            if (!determinedOwner) {
                throw new Error("Import requires an owner to be specified in options or user must be provided.");
            }

            const tempDoc = new LoroDoc();
            tempDoc.import(binaryData);

            const snapshotCid = await hashService.hashSnapshot(binaryData);
            const pubKey = options.pubKey || docIdService.generateDocId();

            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, binaryData, {
                type: CONTENT_TYPE_SNAPSHOT,
                documentPubKey: pubKey
            });

            interface DocMetadata {
                name: string;
                description?: string;
            }
            const docMetadata: DocMetadata = { name: "Imported Document" };
            try {
                const meta = tempDoc.getMap("meta");
                if (meta.get("name") !== undefined) docMetadata.name = meta.get("name") as string;
                if (meta.get("description") !== undefined) docMetadata.description = meta.get("description") as string;
            } catch (metaErr) {
                console.warn('Could not extract metadata from imported document', metaErr);
            }

            const now = new Date().toISOString();
            const newDoc: Docs = {
                pubKey,
                owner: determinedOwner,
                updatedAt: now,
                snapshotCid,
                updateCids: [],
                localState: {
                    snapshotCid: snapshotCid
                }
            };

            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDoc)));

            return { pubKey, snapshotCid };
        } catch (err) {
            console.error('Error importing content:', err);
            this._setError(err instanceof Error ? err.message : 'Failed to import content');
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
        user: CapabilityUser | null,
        pubKey: string,
        options: { mode?: 'snapshot' | 'update' } = {}
    ): Promise<Uint8Array> {
        try {
            const doc = await this.getDocument(pubKey);
            if (!doc) {
                throw new Error(`Document ${pubKey} not found for export`);
            }

            if (!canRead(user, doc)) {
                throw new Error('Permission denied: Cannot read this document to export');
            }

            const loroDoc = await this.getLoroDoc(pubKey);
            if (!loroDoc) {
                throw new Error(`Could not load LoroDoc instance for export: ${pubKey}`);
            }

            return loroDoc.export({ mode: options.mode || 'snapshot' });
        } catch (err) {
            console.error(`Error exporting content for ${pubKey}:`, err);
            this._setError(err instanceof Error ? err.message : 'Failed to export content');
            throw err;
        }
    }

    /**
     * Set internal status flags
     * @param newStatus Status update
     */
    private _setStatus(newStatus: Partial<{ loading: boolean; creatingDoc: boolean }>): void {
        if (newStatus.loading !== undefined) this._isLoading = newStatus.loading;
        if (newStatus.creatingDoc !== undefined) this._isCreatingDoc = newStatus.creatingDoc;
    }

    /**
     * Set internal error message
     * @param message Error message
     */
    private _setError(message: string | null): void {
        this._lastError = message;
    }

    // Public getters for internal state (optional, if needed externally)
    public get isLoading(): boolean { return this._isLoading; }
    public get isCreatingDoc(): boolean { return this._isCreatingDoc; }
    public get lastError(): string | null { return this._lastError; }

    /**
     * Delete a document - NO CHANGE NEEDED FOR INDEXING STATE
     * Assumes hominio-mutate handles permissions and dependency checks.
     * @param user The user performing the deletion (still needed for potential audit/future rules).
     * @param pubKey Document public key.
     * @returns True if successful, otherwise throws an error.
     */
    async deleteDocument(
        user: CapabilityUser | null,
        pubKey: string
    ): Promise<boolean> {
        this._setError(null);
        try {
            const doc = await this.getDocument(pubKey);
            if (!doc) {
                console.warn(`[deleteDocument] Document ${pubKey} not found, assuming deletion successful.`);
                return true;
            }

            if (activeLoroDocuments.has(pubKey)) {
                activeLoroDocuments.delete(pubKey);
            }

            const docsStorage = getDocsStorage();
            const deleted = await docsStorage.delete(pubKey);

            if (deleted) {
                this._triggerNotification();
            }

            return deleted;
        } catch (err) {
            console.error(`Error deleting document ${pubKey}:`, err);
            this._setError(`Failed to delete document: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }
    }

    /**
     * Clean up resources
     */
    destroy(): void {
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
                    if (item.key === INDEXING_BACKLOG_KEY) continue;
                    if (item.key && item.value) {
                        const data = await docsStorage.get(item.key);
                        if (data) {
                            const docString = new TextDecoder().decode(data);
                            const parsedDoc = JSON.parse(docString);
                            if (parsedDoc && typeof parsedDoc === 'object' && typeof parsedDoc.pubKey === 'string' && parsedDoc.pubKey) {
                                loadedDocs.push(parsedDoc as Docs);
                            } else {
                                console.warn(`[HominioDB loadAllDocsReturn] Skipping invalid/incomplete metadata entry for key ${item.key}. Data:`, parsedDoc);
                            }
                        }
                    } else {
                        console.warn(`[HominioDB loadAllDocsReturn] Encountered item with missing key or value:`, item);
                    }
                } catch (parseErr) {
                    console.warn(`[HominioDB loadAllDocsReturn] Error parsing document metadata for key ${item.key}:`, parseErr);
                }
            }
        } catch (err) {
            console.error('[HominioDB loadAllDocsReturn] Error fetching documents from storage:', err);
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
        if (activeLoroDocuments.has(pubKey)) {
            return activeLoroDocuments.get(pubKey)!;
        }
        const docMetadata = await this.getDocument(pubKey);
        if (!docMetadata) {
            console.error(`[getLoroDoc] Metadata not found for ${pubKey}`);
            return null;
        }
        const snapshotCid = docMetadata.localState?.snapshotCid || docMetadata.snapshotCid;
        if (!snapshotCid) {
            console.warn(`[getLoroDoc] No snapshot CID found for ${pubKey}. Returning empty doc.`);
            const emptyDoc = new LoroDoc();
            emptyDoc.setPeerId(1);
            emptyDoc.subscribe(() => {
                this._persistLoroUpdateAsync(pubKey, emptyDoc).catch(err => {
                    console.error(`[Loro Subscribe - EmptyDoc] Failed to persist update for ${pubKey}:`, err);
                });
            });
            activeLoroDocuments.set(pubKey, emptyDoc);
            return emptyDoc;
        }
        const contentStorage = getContentStorage();
        const snapshotData = await contentStorage.get(snapshotCid);
        if (!snapshotData) {
            console.error(`[getLoroDoc] Snapshot content not found for CID ${snapshotCid} (doc ${pubKey})`);
            return null;
        }
        const loroDoc = new LoroDoc();
        try {
            loroDoc.import(snapshotData);
            loroDoc.setPeerId(1);
            const baseUpdates = docMetadata.updateCids ?? [];
            const localUpdates = docMetadata.localState?.updateCids ?? [];
            const allUpdateCids = [...new Set([...baseUpdates, ...localUpdates])];
            if (allUpdateCids.length > 0) {
                for (const updateCid of allUpdateCids) {
                    try {
                        const updateData = await contentStorage.get(updateCid);
                        if (updateData) {
                            loroDoc.import(updateData);
                        } else {
                            console.warn(`[getLoroDoc] Update content not found for CID ${updateCid} (doc ${pubKey})`);
                        }
                    } catch (updateImportErr) {
                        console.error(`[getLoroDoc] Error importing update ${updateCid} for ${pubKey}:`, updateImportErr);
                    }
                }
            }
            loroDoc.subscribe(() => {
                this._persistLoroUpdateAsync(pubKey, loroDoc).catch(err => {
                    console.error(`[Loro Subscribe] Failed to persist update for ${pubKey}:`, err);
                });
            });
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
            const updateCid = await hashService.hashSnapshot(updateData);
            const contentStorage = getContentStorage();
            await contentStorage.put(updateCid, updateData, {
                type: 'update',
                documentPubKey: pubKey,
                created: new Date().toISOString()
            });
            const currentDoc = await this.getDocument(pubKey);
            if (!currentDoc) {
                throw new Error(`Document ${pubKey} not found during update persistence.`);
            }
            const updatedDocData: Docs = { ...currentDoc };
            let metadataWasUpdated = false;
            if (!updatedDocData.localState) {
                updatedDocData.localState = { updateCids: [] };
            }
            if (!updatedDocData.localState.updateCids) {
                updatedDocData.localState.updateCids = [];
            }
            if (!updatedDocData.localState.updateCids.includes(updateCid)) {
                updatedDocData.localState.updateCids.push(updateCid);
                updatedDocData.updatedAt = new Date().toISOString();
                const docsStorage = getDocsStorage();
                await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDocData)));
                metadataWasUpdated = true;
            }
            if (metadataWasUpdated) {
                this._triggerNotification();
            }
            return updateCid;
        } catch (err) {
            console.error(`[persistLoroUpdate] Failed for doc ${pubKey}:`, err);
            this._setError(`Failed to persist update: ${err instanceof Error ? err.message : 'Unknown error'}`);
            throw err;
        }
    }

    // Helper for async persistence triggered by Loro event
    private async _persistLoroUpdateAsync(pubKey: string, loroDoc: LoroDoc): Promise<void> {
        if (this._isInitializingDoc) return;
        try {
            const updateBytes = loroDoc.export({ mode: "update" });
            if (updateBytes && updateBytes.length > 0) {
                await this.persistLoroUpdate(pubKey, updateBytes);
            }
        } catch (err) {
            console.error(`[HominioDB _persistLoroUpdateAsync] Error processing update for ${pubKey}:`, err);
        }
    }

    // --- Backlog Queue Management Methods ---
    public async addToIndexingBacklog(item: IndexingBacklogItem): Promise<void> {
        try {
            const storage = getDocsStorage();
            const backlogData = await storage.get(INDEXING_BACKLOG_KEY);
            let backlog: Record<string, IndexingBacklogItem> = {};
            if (backlogData) {
                try {
                    backlog = JSON.parse(new TextDecoder().decode(backlogData));
                } catch (parseErr) {
                    console.error("[addToIndexingBacklog] Failed to parse existing backlog, starting fresh.", parseErr);
                    backlog = {};
                }
            }
            backlog[item.pubKey] = item;
            await storage.put(INDEXING_BACKLOG_KEY, new TextEncoder().encode(JSON.stringify(backlog)));
        } catch (err) {
            // Log the error but don't re-throw, backlog failure shouldn't stop main flow
            console.error(`[addToIndexingBacklog] Error adding item for ${item.pubKey}:`, err);
        }
    }

    public async getNextFromIndexingBacklog(count = 1): Promise<IndexingBacklogItem[]> {
        try {
            const storage = getDocsStorage();
            const backlogData = await storage.get(INDEXING_BACKLOG_KEY);
            if (!backlogData) return [];
            let backlog: Record<string, IndexingBacklogItem> = {};
            try {
                backlog = JSON.parse(new TextDecoder().decode(backlogData));
            } catch (parseErr) {
                console.error("[getNextFromIndexingBacklog] Failed to parse backlog.", parseErr);
                return [];
            }
            const keys = Object.keys(backlog);
            if (keys.length === 0) return [];
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

    public async removeFromIndexingBacklog(pubKey: string): Promise<void> {
        try {
            const storage = getDocsStorage();
            const backlogData = await storage.get(INDEXING_BACKLOG_KEY);
            if (!backlogData) return;
            let backlog: Record<string, IndexingBacklogItem> = {};
            try {
                backlog = JSON.parse(new TextDecoder().decode(backlogData));
            } catch (parseErr) {
                console.error("[removeFromIndexingBacklog] Failed to parse backlog.", parseErr);
                return;
            }
            if (backlog[pubKey]) {
                delete backlog[pubKey];
                await storage.put(INDEXING_BACKLOG_KEY, new TextEncoder().encode(JSON.stringify(backlog)));
            }
        } catch (err) {
            console.error(`[removeFromIndexingBacklog] Error removing item ${pubKey}:`, err);
        }
    }

    // --- End Backlog Queue Management Methods ---

    /** Starts a batch operation, suppressing notifications */
    public startBatchOperation(): void {
        this._suppressNotifications = true;
        this._needsNotification = false;
    }

    /** Ends a batch operation, allowing notifications and firing deferred ones */
    public endBatchOperation(): void {
        const wasSuppressed = this._suppressNotifications;
        this._suppressNotifications = false;
        if (wasSuppressed && this._needsNotification) {
            this._needsNotification = false;
            this._triggerNotification();
        }
    }

    /** Internal trigger method with suppression check */
    private _triggerNotification(): void {
        if (!browser) return;

        if (this._suppressNotifications) {
            this._needsNotification = true;
            return;
        }

        // --- Trigger Indexing FIRST (if not suppressed) ---
        hominioIndexing.startIndexingCycle().catch(err => {
            console.error('[_triggerNotification] Error triggering indexing cycle:', err);
        });
        // --------------------------------------------------

        // --- Trigger Pub/Sub Listeners (if not suppressed) --- UPDATED
        notifyListeners();
        // --- End Pub/Sub Trigger ---
    }

    // --- Methods needed by HominioSync (re-added/ensured public) ---

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
            return new Set<string>();
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
            const localDoc = await this.getDocument(pubKey);
            const mergedDoc: Docs = { ...serverDocData };
            if (localDoc?.localState?.updateCids && localDoc.localState.updateCids.length > 0) {
                if (!mergedDoc.localState) mergedDoc.localState = {};
                mergedDoc.localState.updateCids = [...(localDoc.localState.updateCids ?? [])];
                mergedDoc.localState.snapshotCid = undefined;
            } else {
                delete mergedDoc.localState;
            }
            mergedDoc.updatedAt = new Date().toISOString();
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(mergedDoc)));
            this._triggerNotification();
        } catch (err) {
            console.error(`[saveSyncedDocument] Error processing doc ${pubKey}:`, err);
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
            const newIndexingState = { ...currentDoc.indexingState, ...stateUpdate };
            const updatedDocData: Docs = {
                ...currentDoc,
                indexingState: newIndexingState,
            };
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDocData)));
        } catch (err) {
            console.error(`[updateDocIndexingState] Failed for doc ${pubKey}:`, err);
            // Don't throw, just log the error. The indexer should handle its own errors.
        }
    }

    // --- End Methods needed by HominioSync ---
}

// Create and export singleton instance
export const hominioDB = new HominioDB(); 