import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { LoroDoc } from 'loro-crdt';
import { openDB, type IDBPDatabase } from 'idb';
import { hashService } from './hash-service';
import { loroService } from './loro-service';
import { hominio } from '$lib/client/hominio';

// Define interfaces for API responses
interface SnapshotResponse {
    success: boolean;
    document?: DocMetadata;
    newSnapshotCid?: string;
    appliedUpdates?: number;
    clearedUpdates?: number;
    error?: string;
    details?: string;
}

// Types
export interface DocMetadata {
    pubKey: string;
    ownerId: string;
    title: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    snapshotCid?: string;
    updateCids?: string[];
    // Local state tracking for sync queue
    localState?: {
        snapshotCid?: string;  // Local snapshot that needs syncing
        updateCids?: string[]; // Local updates that need syncing
    };
}

// Export ContentItem interface
export interface ContentItem {
    cid: string;
    type: string;
    data: Uint8Array;
    metadata?: Record<string, unknown>;
    createdAt: string;
}

// Document content interface
export interface DocContentState {
    content: unknown;
    loading: boolean;
    error: string | null;
    sourceCid: string | null;
    isLocalSnapshot: boolean;
    appliedUpdates?: number; // Number of updates applied to the content
}

// Constants
const DB_NAME = 'hominio-docs';
const DB_VERSION = 1;
const DOCS_STORE = 'docs';
const CONTENT_STORE = 'content';

// Stores
const docs = writable<DocMetadata[]>([]);
const selectedDoc = writable<DocMetadata | null>(null);
const status = writable({
    loading: false,
    error: false,
    creatingDoc: false,
    syncingDocs: false
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

// DocumentService class to handle document operations
class DocumentService {
    private db: IDBPDatabase | null = null;

    // Stores exposed as properties
    docs = docs;
    selectedDoc = selectedDoc;
    status = status;
    error = error;
    docContent = docContent;

    constructor() {
        if (browser) {
            this.initializeDB().then(() => {
                this.loadDocsFromIndexDB();
            }).catch(err => {
                console.error('Failed to initialize IndexedDB:', err);
                this.setError('Failed to initialize local database');
            });

            // Subscribe to selectedDoc changes to load content
            selectedDoc.subscribe(doc => {
                if (doc) {
                    this.loadDocumentContent(doc);
                } else {
                    docContent.set({
                        content: null,
                        loading: false,
                        error: null,
                        sourceCid: null,
                        isLocalSnapshot: false
                    });
                }
            });
        }
    }

    // Initialize IndexedDB
    private async initializeDB(): Promise<void> {
        if (!browser) {
            throw new Error('IndexedDB not supported in non-browser environment');
        }

        try {
            this.db = await openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    // Create document store
                    if (!db.objectStoreNames.contains(DOCS_STORE)) {
                        const docStore = db.createObjectStore(DOCS_STORE, { keyPath: 'pubKey' });
                        docStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }

                    // Create content store
                    if (!db.objectStoreNames.contains(CONTENT_STORE)) {
                        const contentStore = db.createObjectStore(CONTENT_STORE, { keyPath: 'cid' });
                        contentStore.createIndex('type', 'type', { unique: false });
                    }
                }
            });

            console.log('IndexedDB opened successfully');
        } catch (err) {
            console.error('Error opening IndexedDB:', err);
            throw new Error('Could not open IndexedDB');
        }
    }

    // Ensure DB is initialized
    private async ensureDB(): Promise<IDBPDatabase> {
        if (!this.db) {
            await this.initializeDB();
            if (!this.db) {
                throw new Error('Failed to initialize database');
            }
        }
        return this.db;
    }

    // Load documents from IndexedDB
    async loadDocsFromIndexDB(): Promise<void> {
        this.setStatus({ loading: true });

        try {
            const db = await this.ensureDB();
            const docList = await db.getAll(DOCS_STORE);

            // Sort documents by updated date
            docs.set(docList.sort((a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            ));
        } catch (err) {
            console.error('Error loading docs from IndexedDB:', err);
            this.setError('Failed to load documents from local storage');
        } finally {
            this.setStatus({ loading: false });
        }
    }

    // Save document to IndexedDB
    private async saveDocToIndexDB(doc: DocMetadata): Promise<void> {
        try {
            const db = await this.ensureDB();
            await db.put(DOCS_STORE, doc);
        } catch (err) {
            console.error('Error saving doc to IndexedDB:', err);
            throw new Error('Failed to save document to local storage');
        }
    }

    // Save content to IndexedDB
    private async saveContentToIndexDB(cid: string, data: Uint8Array, docPubKey: string, type: 'snapshot' | 'update' = 'snapshot'): Promise<void> {
        try {
            const db = await this.ensureDB();
            const now = new Date().toISOString();

            const contentItem: ContentItem = {
                cid,
                type,
                data,
                metadata: { documentPubKey: docPubKey },
                createdAt: now
            };

            await db.put(CONTENT_STORE, contentItem);
        } catch (err) {
            console.error('Error saving content to IndexedDB:', err);
            throw new Error('Failed to save content data to local storage');
        }
    }

    // Load content from IndexedDB by CID
    private async loadContentFromIndexDB(cid: string): Promise<Uint8Array | null> {
        try {
            const db = await this.ensureDB();
            const content = await db.get(CONTENT_STORE, cid) as ContentItem | undefined;

            if (!content || !content.data) {
                console.warn(`Content with CID ${cid} not found or has no data in IndexedDB`);
                return null;
            }

            const data = content.data;
            console.log(`Loaded content ${cid}, data type: ${typeof data}`);

            // Handle the data based on its type
            if (data instanceof Uint8Array) {
                console.log(`Content ${cid} loaded as Uint8Array directly, size: ${data.byteLength} bytes`);
                return data;
            } else if (data instanceof ArrayBuffer) {
                const uint8Array = new Uint8Array(data);
                console.log(`Content ${cid} converted from ArrayBuffer to Uint8Array, size: ${uint8Array.byteLength} bytes`);
                return uint8Array;
            } else if (typeof data === 'object' && data !== null && 'buffer' in data) {
                // Handle Node.js Buffer-like objects without direct dependency
                try {
                    // Try to convert Buffer-like object to Uint8Array
                    // @ts-ignore - We've already checked 'buffer' property exists
                    const uint8Array = new Uint8Array(data.buffer);
                    console.log(`Content ${cid} converted from Buffer-like to Uint8Array, size: ${uint8Array.byteLength} bytes`);
                    return uint8Array;
                } catch (err) {
                    console.error(`Failed to convert Buffer-like to Uint8Array:`, err);
                }
            } else if (Array.isArray(data)) {
                // Handle array representation
                const uint8Array = new Uint8Array(data);
                console.log(`Content ${cid} converted from Array to Uint8Array, size: ${uint8Array.byteLength} bytes`);
                return uint8Array;
            }

            // Last resort: try to convert whatever we have to Uint8Array
            console.warn(`Content ${cid} has format that needs manual conversion: ${typeof data}`);
            try {
                // Use generic conversion, relies on types being convertible to TypedArray
                const uint8Array = new Uint8Array(data as unknown as ArrayBufferLike);
                console.log(`Content ${cid} converted using fallback method, size: ${uint8Array.byteLength} bytes`);
                return uint8Array;
            } catch (err) {
                console.error(`Failed to convert content data to Uint8Array using fallback:`, err);
                return null;
            }
        } catch (err) {
            console.error(`Error loading content from IndexedDB:`, err);
            throw new Error('Failed to load content data from local storage');
        }
    }

    // Load document content
    async loadDocumentContent(doc: DocMetadata): Promise<void> {
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

            // Load snapshot binary data from IndexedDB
            const snapshotData = await this.loadContentFromIndexDB(snapshotCid);

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
                console.log(`First 16 bytes of snapshot data:`, Array.from(snapshotData.slice(0, 16)));
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
                const updateData = await this.loadContentFromIndexDB(updateCid);
                if (updateData) {
                    try {
                        tempDoc.import(updateData);
                        appliedUpdates++;
                        console.log(`Applied update from CID: ${updateCid}`);
                    } catch (err) {
                        console.error(`Error applying update ${updateCid}:`, err);
                        console.log(`First 16 bytes of update data:`, Array.from(updateData.slice(0, 16)));
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

    // Add random property to document and create update
    async addRandomPropertyToDocument(): Promise<boolean> {
        // Get the current selected document directly from the store
        const doc = get(selectedDoc);

        if (!doc) {
            this.setError('No document selected');
            return false;
        }

        try {
            const docPubKey = doc.pubKey;
            const loroDoc = activeLoroDocuments.get(docPubKey);

            if (!loroDoc) {
                this.setError('Document instance not found');
                return false;
            }

            // Generate random property key and value
            const randomKey = `prop_${Math.floor(Math.random() * 10000)}`;
            const randomValue = `value_${Math.floor(Math.random() * 10000)}`;

            // Add to Loro document using a Map
            const dataMap = loroDoc.getMap("data");
            dataMap.set(randomKey, randomValue);

            console.log(`Added random property to document: ${randomKey}=${randomValue}`);

            // Create update binary
            const updateData = loroDoc.export({ mode: 'update' });

            // Generate content hash for the update
            const updateCid = await this.generateContentHash(updateData);

            // Save update to IndexedDB
            await this.saveContentToIndexDB(updateCid, updateData, docPubKey, 'update');

            // Create updated doc
            const updatedDoc: DocMetadata = {
                ...doc,
                updatedAt: new Date().toISOString(),
                localState: {
                    ...(doc.localState || {}),
                    updateCids: [...(doc.localState?.updateCids || []), updateCid]
                }
            };

            // Save updated document metadata
            await this.saveDocToIndexDB(updatedDoc);

            // Update the docs store
            docs.update(docList => {
                const index = docList.findIndex(d => d.pubKey === docPubKey);
                if (index !== -1) {
                    docList[index] = updatedDoc;
                }
                return docList;
            });

            // Update selected doc
            selectedDoc.set(updatedDoc);

            // Reload document content
            this.loadDocumentContent(updatedDoc);

            return true;
        } catch (err) {
            console.error('Error adding random property to document:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to update document');
            return false;
        }
    }

    // Generate a content hash
    private async generateContentHash(data: Uint8Array): Promise<string> {
        return hashService.hashSnapshot(data);
    }

    // Get or create a Loro document instance
    private async getOrCreateLoroDoc(pubKey: string, snapshotCid?: string): Promise<LoroDoc> {
        // If we already have an active instance, return it
        if (activeLoroDocuments.has(pubKey)) {
            return activeLoroDocuments.get(pubKey)!;
        }

        // Create a new LoroDoc instance
        const loroDoc = new LoroDoc();

        // Try to load binary data from IndexedDB if we have a snapshot CID
        if (snapshotCid) {
            const binaryData = await this.loadContentFromIndexDB(snapshotCid);
            if (binaryData) {
                try {
                    // Initialize with stored data
                    loroDoc.import(binaryData);
                    console.log(`Loaded Loro doc for ${pubKey} from IndexedDB`);
                } catch (err) {
                    console.error(`Error importing binary data for doc ${pubKey}:`, err);
                }
            }
        }

        // Store in the active documents map
        activeLoroDocuments.set(pubKey, loroDoc);

        return loroDoc;
    }

    // Select a document and load its Loro instance if needed
    async selectDoc(doc: DocMetadata) {
        selectedDoc.set(doc);

        if (doc) {
            try {
                // Determine which snapshot CID to use
                const snapshotCid = doc.localState?.snapshotCid || doc.snapshotCid;

                // Get or create a Loro doc instance for this document
                await this.getOrCreateLoroDoc(doc.pubKey, snapshotCid);
            } catch (err) {
                console.error(`Error selecting doc ${doc.pubKey}:`, err);
                this.setError('Failed to load document data');
            }
        }
    }

    // Create a new empty document locally
    async createNewDocument() {
        this.setStatus({ creatingDoc: true });
        this.setError(null);

        try {
            // Generate a unique pubKey using loroService
            const pubKey = loroService.generatePublicKey();

            // Create a new Loro document
            const loroDoc = new LoroDoc();

            // Get the binary representation
            const binaryData = loroDoc.export({ mode: 'snapshot' });

            // Generate a real content hash
            const snapshotCid = await this.generateContentHash(binaryData);

            // Save content to IndexedDB
            await this.saveContentToIndexDB(snapshotCid, binaryData, pubKey);

            // Create metadata for the new document
            const newDoc: DocMetadata = {
                pubKey,
                ownerId: 'local-user', // Will be updated when synced to server
                title: 'New Document',
                description: 'A new empty document',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                // Set the localState to track this as needing sync
                localState: {
                    snapshotCid,
                    updateCids: []
                }
            };

            // Save document metadata to IndexedDB
            await this.saveDocToIndexDB(newDoc);

            // Store in active documents
            activeLoroDocuments.set(pubKey, loroDoc);

            // Update the docs store
            docs.update(docList => [newDoc, ...docList]);

            // Select the new document
            this.selectDoc(newDoc);

            return newDoc;
        } catch (err) {
            console.error('Error creating document:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to create document');
            return null;
        } finally {
            this.setStatus({ creatingDoc: false });
        }
    }

    // Create a consolidated snapshot by applying all updates
    async createConsolidatedSnapshot(): Promise<boolean> {
        // Get the current selected document directly from the store
        const doc = get(selectedDoc);

        if (!doc) {
            this.setError('No document selected');
            return false;
        }

        // Check if document has updates to consolidate
        if (!doc.updateCids || doc.updateCids.length === 0) {
            this.setError('No updates available to create a snapshot');
            return false;
        }

        try {
            this.setStatus({ loading: true });

            // Call the server endpoint to create a consolidated snapshot
            console.log(`Creating consolidated snapshot for document ${doc.pubKey} with ${doc.updateCids.length} updates`);

            const result = await (hominio.api.docs({ pubKey: doc.pubKey }).snapshot.create as any).post({}) as {
                data: SnapshotResponse;
                error: null | { message: string }
            };

            // Handle errors in the response
            if (result.error) {
                this.setError(`Failed to create snapshot: ${result.error.message}`);
                return false;
            }

            // Type assertion for the response data
            const response = result.data;

            if (response && response.success) {
                // Reload document list to get the updated metadata
                await this.loadDocsFromIndexDB();

                // Display success message
                this.setError(null);
                console.log(`Created snapshot successfully with ${response.appliedUpdates} updates`);

                // If the document has been returned in the response and the current document is still selected
                if (response.document) {
                    const currentDoc = get(selectedDoc);
                    if (currentDoc && currentDoc.pubKey === response.document.pubKey) {
                        await this.selectDoc(response.document);
                    }
                } else {
                    // Otherwise trigger a refresh manually
                    const currentDoc = get(selectedDoc);
                    if (currentDoc) {
                        await this.loadDocumentContent(currentDoc);
                    }
                }

                return true;
            } else {
                this.setError(`Failed to create snapshot: ${response.error || 'Unknown error'}`);
                return false;
            }
        } catch (err) {
            console.error('Error creating consolidated snapshot:', err);
            this.setError('Failed to create snapshot: ' + (err instanceof Error ? err.message : 'Unknown error'));
            return false;
        } finally {
            this.setStatus({ loading: false });
        }
    }

    // Update status
    setStatus(newStatus: Partial<{ loading: boolean; error: boolean; creatingDoc: boolean; syncingDocs: boolean }>) {
        status.update(s => ({ ...s, ...newStatus }));
    }

    // Set error message
    setError(message: string | null) {
        error.set(message);
    }

    // Clean up resources
    destroy() {
        // Close all active Loro documents
        activeLoroDocuments.forEach(() => {
            // No specific cleanup needed for LoroDoc instances
        });
        activeLoroDocuments.clear();

        // Close IndexedDB connection
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Create and export a singleton instance
export const documentService = new DocumentService();
