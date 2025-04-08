import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { LoroDoc } from 'loro-crdt';
import { openDB, type IDBPDatabase } from 'idb';

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
}

interface ContentItem {
    cid: string;
    type: string;
    data: Uint8Array;
    metadata?: Record<string, unknown>;
    createdAt: string;
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

    constructor() {
        if (browser) {
            this.initializeDB().then(() => {
                this.loadDocsFromIndexDB();
            }).catch(err => {
                console.error('Failed to initialize IndexedDB:', err);
                this.setError('Failed to initialize local database');
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
    private async loadDocsFromIndexDB(): Promise<void> {
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
    private async saveContentToIndexDB(cid: string, data: Uint8Array, docPubKey: string): Promise<void> {
        try {
            const db = await this.ensureDB();
            const now = new Date().toISOString();

            const contentItem: ContentItem = {
                cid,
                type: 'snapshot',
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
            return content?.data || null;
        } catch (err) {
            console.error('Error loading content from IndexedDB:', err);
            throw new Error('Failed to load content data from local storage');
        }
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
                // Get or create a Loro doc instance for this document
                await this.getOrCreateLoroDoc(doc.pubKey, doc.snapshotCid);
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
            // Generate a unique pubKey
            const pubKey = crypto.randomUUID();

            // Create a new Loro document
            const loroDoc = new LoroDoc();

            // Get the binary representation
            const binaryData = loroDoc.export({ mode: 'snapshot' });

            // Generate a CID using current timestamp as placeholder
            // In a real implementation, this would use proper content-based hash
            const cid = `local-${Date.now()}-${Math.random().toString(36).substring(2)}`;

            // Save content to IndexedDB
            await this.saveContentToIndexDB(cid, binaryData, pubKey);

            // Create metadata for the new document
            const newDoc: DocMetadata = {
                pubKey,
                ownerId: 'local-user', // Will be updated when synced to server
                title: 'New Document',
                description: 'A new empty document',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                snapshotCid: cid,
                updateCids: []
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
