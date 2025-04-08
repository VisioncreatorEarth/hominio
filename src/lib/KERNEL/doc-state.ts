import { LoroDoc } from 'loro-crdt';
import { writable, derived, get, type Readable } from 'svelte/store';
import { hominio } from '$lib/client/hominio';

export interface DocStateOptions {
    peerId?: number;
    autoCleanup?: boolean;
}

export type UpdateSource = 'local' | 'remote' | 'initial';

export interface DocStateUpdate {
    source: UpdateSource;
    timestamp: number;
}

/**
 * Document metadata from API
 */
export interface DocMetadata {
    pubKey: string;
    title: string;
    snapshotCid: string;
    updateCids: string[];
    ownerId: string;
    createdAt: string;
    updatedAt: string;
    description?: string;
}

/**
 * Content item from the API
 */
export interface ContentItem {
    cid: string;
    type: string;
    metadata?: Record<string, unknown>;
    hasBinaryData: boolean;
    contentLength: number;
    verified: boolean;
    createdAt: string;
    binaryData?: number[]; // Binary data as array
}

/**
 * Todo document structure
 */
export interface TodoDocument {
    title: string;
    todos: Array<{ id: string; text: string; completed: boolean; createdAt: string }>;
    meta: {
        description: string;
    };
}

/**
 * Result of processing a document with updates
 */
export interface ProcessedDocumentResult {
    success: boolean;
    document?: TodoDocument;
    updatesApplied: number;
    error?: string;
}

/**
 * Status flags for UI operations
 */
export interface StatusFlags {
    loading: boolean;
    creatingDoc: boolean;
    updatingDoc: boolean;
    creatingSnapshot: boolean;
    processingState: boolean;
    addingTodo: boolean;
}

/**
 * A generic service that manages a Loro document and provides reactive state
 */
export class DocState<T = Record<string, unknown>> {
    private loroDoc: LoroDoc;
    private store = writable<T | null>(null);
    private unsubscribe: (() => void) | null = null;
    private lastUpdateTime = 0;
    private lastUpdateSource: UpdateSource = 'initial';

    constructor(options: DocStateOptions = {}) {
        this.loroDoc = new LoroDoc();

        // Set peer ID if provided, or generate a random one
        const peerId = options.peerId || Math.floor(Math.random() * 1000000);
        this.loroDoc.setPeerId(peerId);

        // Set up subscription to document changes
        this.setupSubscription();
    }

    /**
     * Get the store that provides reactive updates to the document state
     */
    public subscribe: Readable<T | null>['subscribe'] = (run, invalidate) => {
        return this.store.subscribe(run, invalidate);
    };

    /**
     * Get the raw Loro document instance
     */
    public getDoc(): LoroDoc {
        return this.loroDoc;
    }

    /**
     * Setup the subscription to document changes
     */
    private setupSubscription(): void {
        // Clean up any existing subscription
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        // Subscribe to document changes
        this.unsubscribe = this.loroDoc.subscribe(() => {
            // Update the store with the new state
            this.lastUpdateTime = Date.now();
            // Convert document to JSON and update the store
            this.updateStoreFromDoc();
        });

        // Initial state
        this.updateStoreFromDoc();
    }

    /**
     * Update the store from the Loro document
     * This ensures the Loro document is always the source of truth
     */
    private updateStoreFromDoc(): void {
        this.store.set(this.loroDoc.toJSON() as T);
    }

    /**
     * Import binary data into the document
     * @param data Binary data to import
     * @param source Source of the update
     */
    public import(data: Uint8Array | number[], source: UpdateSource = 'remote'): void {
        try {
            // Convert to Uint8Array if needed
            const binaryData = Array.isArray(data) ? new Uint8Array(data) : data;

            // Import the data
            this.loroDoc.import(binaryData);

            // Update the metadata
            this.lastUpdateTime = Date.now();
            this.lastUpdateSource = source;

            // Explicitly update the store to ensure it mirrors the document
            this.updateStoreFromDoc();
        } catch (error) {
            console.error('Error importing data to Loro document:', error);
            throw error;
        }
    }

    /**
     * Export the document as binary data
     * @param mode Export mode ('snapshot' or 'update')
     */
    public export(mode: 'snapshot' | 'update' = 'snapshot'): Uint8Array {
        return this.loroDoc.export({ mode });
    }

    /**
     * Get information about the last update
     */
    public getLastUpdate(): DocStateUpdate {
        return {
            source: this.lastUpdateSource,
            timestamp: this.lastUpdateTime
        };
    }

    /**
     * Get the current state as a plain object
     * Always gets directly from the Loro document, not the store
     */
    public getState(): T | null {
        return this.loroDoc.toJSON() as T;
    }

    /**
     * Execute an update operation on the document
     * @param operation Function that modifies the document
     */
    public update(operation: (doc: LoroDoc) => void): void {
        try {
            operation(this.loroDoc);
            this.lastUpdateSource = 'local';
            this.lastUpdateTime = Date.now();

            // Explicitly update the store to ensure it mirrors the document
            this.updateStoreFromDoc();
        } catch (error) {
            console.error('Error updating Loro document:', error);
            throw error;
        }
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
}

/**
 * Create a document state manager
 */
export function createDocState<T = Record<string, unknown>>(
    options: DocStateOptions = {}
): DocState<T> {
    return new DocState<T>(options);
}

/**
 * Document Service - Handles document operations and state management
 */
export class DocumentService {
    // State stores for reactive UI
    private docsStore = writable<DocMetadata[]>([]);
    private selectedDocStore = writable<DocMetadata | null>(null);
    private contentMapStore = writable(new Map<string, ContentItem>());
    private statusStore = writable<StatusFlags>({
        loading: false,
        creatingDoc: false,
        updatingDoc: false,
        creatingSnapshot: false,
        processingState: false,
        addingTodo: false
    });
    private errorStore = writable<string | null>(null);
    private updateMessageStore = writable<string | null>(null);
    private snapshotMessageStore = writable<string | null>(null);
    private processedResultStore = writable<ProcessedDocumentResult | null>(null);

    // Active document state
    private activeDocState: DocState<TodoDocument> | null = null;

    // Expose readable stores for components to subscribe to
    public readonly docs = { subscribe: this.docsStore.subscribe };
    public readonly selectedDoc = { subscribe: this.selectedDocStore.subscribe };
    public readonly contentMap = { subscribe: this.contentMapStore.subscribe };
    public readonly status = { subscribe: this.statusStore.subscribe };
    public readonly error = { subscribe: this.errorStore.subscribe };
    public readonly updateMessage = { subscribe: this.updateMessageStore.subscribe };
    public readonly snapshotMessage = { subscribe: this.snapshotMessageStore.subscribe };
    public readonly processedResult = { subscribe: this.processedResultStore.subscribe };

    // Derived store for current active document state
    public readonly docState = derived(
        [this.selectedDocStore],
        () => this.activeDocState
    );

    constructor() {
        // Initialize by loading documents on creation
        this.fetchDocs();
    }

    /**
     * Update status flags
     */
    public setStatus(flags: Partial<StatusFlags>) {
        this.statusStore.update(current => ({ ...current, ...flags }));
    }

    /**
     * Set error message
     */
    public setError(message: string | null) {
        this.errorStore.set(message);
    }

    /**
     * Fetch all documents
     */
    async fetchDocs() {
        try {
            this.setStatus({ loading: true });
            this.errorStore.set(null);

            // @ts-expect-error - Eden Treaty client type issue
            const response = await hominio.api.docs.get();

            if (!response.data) {
                throw new Error('Failed to fetch documents: No data returned');
            }

            const docs = response.data as DocMetadata[];
            this.docsStore.set(docs);

            return docs;
        } catch (error) {
            console.error('Error fetching documents:', error);
            this.errorStore.set(error instanceof Error ? error.message : 'Failed to fetch documents');
            throw error;
        } finally {
            this.setStatus({ loading: false });
        }
    }

    /**
     * Select a document and load its content
     */
    async selectDoc(doc: DocMetadata) {
        try {
            this.selectedDocStore.set(doc);

            // Fetch document with content
            // @ts-expect-error - Eden Treaty client type issue
            const response = await hominio.api.docs[doc.pubKey].get({
                $query: { includeBinary: 'true' }
            });

            if (!response.data) {
                throw new Error(`Failed to fetch document: No data returned`);
            }

            // Update selected doc with latest data
            if (response.data.document) {
                this.selectedDocStore.set(response.data.document);
            }

            // Store content in the map
            if (response.data.content) {
                this.contentMapStore.update(map => {
                    const newMap = new Map(map);
                    newMap.set(doc.pubKey, response.data.content!);
                    return newMap;
                });

                // Initialize document state
                await this.initializeDocState(
                    response.data.content,
                    response.data.document?.updateCids || []
                );

                // Process the full document state
                await this.processDocumentState();
            }

            return response.data;
        } catch (error) {
            console.error(`Error fetching doc with content for ${doc.pubKey}:`, error);
            throw error;
        }
    }

    /**
     * Create a new document with default template
     */
    async createNewDocument() {
        try {
            this.setStatus({ creatingDoc: true });
            this.errorStore.set(null);

            // @ts-expect-error - Eden Treaty client type issue
            const response = await hominio.api.docs.post({});

            if (!response.data || !response.data.success) {
                throw new Error(response.data?.error || 'Failed to create document');
            }

            const newDoc = response.data.document as DocMetadata;

            // Update docs list
            this.docsStore.update(docs => [newDoc, ...docs]);

            // Select the new document
            await this.selectDoc(newDoc);

            return newDoc;
        } catch (error) {
            console.error('Error creating document:', error);
            this.errorStore.set(error instanceof Error ? error.message : 'Failed to create document');
            throw error;
        } finally {
            this.setStatus({ creatingDoc: false });
        }
    }

    /**
     * Create a new document
     */
    async createDocument(data: Record<string, unknown>): Promise<DocMetadata> {
        try {
            this.setStatus({ creatingDoc: true });
            this.errorStore.set(null);

            // @ts-expect-error - Eden Treaty client type issue
            const response = await hominio.api.docs.post(data);

            if (!response.data || !response.data.success) {
                throw new Error(response.data?.error || 'Failed to create document');
            }

            const newDoc = response.data.document;

            // Update docs list
            this.docsStore.update(docs => [newDoc, ...docs]);

            return newDoc;
        } catch (error) {
            console.error('Error creating document:', error);
            this.errorStore.set(error instanceof Error ? error.message : 'Failed to create document');
            throw error;
        } finally {
            this.setStatus({ creatingDoc: false });
        }
    }

    /**
     * Create a todo list document
     */
    async createTodoListDocument(todoSnapshotData: Record<string, unknown>) {
        try {
            this.setStatus({ creatingDoc: true });
            this.errorStore.set(null);

            const newDoc = await this.createDocument(todoSnapshotData);

            // Select the new document
            await this.selectDoc(newDoc);

            return newDoc;
        } catch (error) {
            console.error('Error creating todo list document:', error);
            this.errorStore.set(error instanceof Error ? error.message : 'Failed to create todo list document');
            throw error;
        } finally {
            this.setStatus({ creatingDoc: false });
        }
    }

    /**
     * Update a document
     */
    async updateDocument(updateOperation?: (doc: LoroDoc) => void) {
        const selectedDoc = get(this.selectedDocStore);
        if (!selectedDoc || !this.activeDocState) return;

        try {
            this.setStatus({ updatingDoc: true });
            this.updateMessageStore.set(null);

            // Apply the update to our document state
            this.activeDocState.update(
                updateOperation ||
                ((doc) => {
                    // Default operation: update the title with a timestamp
                    const newTitle = `Updated ${new Date().toLocaleTimeString()}`;
                    doc.getText('title').insert(0, newTitle);
                })
            );

            // Generate the update binary data using Loro's export function
            const updateBinary = this.activeDocState.export('update');

            // Send update to server
            // @ts-expect-error - Eden Treaty client type issue
            const response = await hominio.api.docs[selectedDoc.pubKey].update.post({
                binaryUpdate: Array.from(updateBinary)
            });

            if (!response.data) {
                throw new Error('Failed to update document: No data returned');
            }

            // Update message
            this.updateMessageStore.set(response.data.message || 'Document updated successfully!');

            // Refresh the doc metadata (but don't reload the content since we already have it)
            await this.refreshDocMetadata(selectedDoc.pubKey);

            return response.data;
        } catch (error) {
            console.error('Error updating document:', error);
            this.updateMessageStore.set('Error: ' + (error instanceof Error ? error.message : 'Failed to update document'));
            throw error;
        } finally {
            this.setStatus({ updatingDoc: false });
        }
    }

    /**
     * Update a document with binary update
     */
    async updateDocumentWithBinary(pubKey: string, binaryUpdate: number[]): Promise<{
        success: boolean;
        message?: string;
        error?: string;
    }> {
        try {
            this.setStatus({ updatingDoc: true });

            // @ts-expect-error - Eden Treaty client type issue
            const response = await hominio.api.docs[pubKey].update.post({
                binaryUpdate
            });

            if (!response.data) {
                throw new Error('Failed to update document: No data returned');
            }

            // Update message
            this.updateMessageStore.set(response.data.message || 'Document updated successfully!');

            // Refresh the doc metadata
            await this.refreshDocMetadata(pubKey);

            return response.data;
        } catch (error) {
            console.error(`Error updating document ${pubKey}:`, error);
            this.updateMessageStore.set('Error: ' + (error instanceof Error ? error.message : 'Failed to update document'));
            throw error;
        } finally {
            this.setStatus({ updatingDoc: false });
        }
    }

    /**
     * Add a random todo
     */
    async addRandomTodo(randomTodoUpdate: number[]) {
        const selectedDoc = get(this.selectedDocStore);
        if (!selectedDoc || !this.activeDocState) return;

        try {
            this.setStatus({ addingTodo: true });
            this.updateMessageStore.set(null);

            // Send to server
            const result = await this.updateDocumentWithBinary(selectedDoc.pubKey, randomTodoUpdate);

            this.updateMessageStore.set(result.message || 'Todo added successfully!');

            return result;
        } catch (error) {
            console.error('Error adding todo:', error);
            this.updateMessageStore.set('Error: ' + (error instanceof Error ? error.message : 'Failed to add todo'));
            throw error;
        } finally {
            this.setStatus({ addingTodo: false });
        }
    }

    /**
     * Refresh document metadata
     */
    async refreshDocMetadata(pubKey: string) {
        try {
            // @ts-expect-error - Eden Treaty client type issue
            const response = await hominio.api.docs[pubKey].get();

            if (!response.data || !response.data.document) {
                throw new Error('Failed to refresh document metadata');
            }

            const updatedDoc = response.data.document;

            // Update the selected doc
            this.selectedDocStore.update(doc => {
                if (doc?.pubKey === pubKey) {
                    return updatedDoc;
                }
                return doc;
            });

            // Update in the docs list
            this.docsStore.update(docs =>
                docs.map(d => d.pubKey === pubKey ? updatedDoc : d)
            );

            return updatedDoc;
        } catch (error) {
            console.error('Error refreshing doc metadata:', error);
            throw error;
        }
    }

    /**
     * Create a snapshot
     */
    async createSnapshot() {
        const selectedDoc = get(this.selectedDocStore);
        if (!selectedDoc || !this.activeDocState) return;

        try {
            this.setStatus({ creatingSnapshot: true });
            this.snapshotMessageStore.set(null);

            // Generate a complete snapshot from current doc state
            const snapshotBinary = this.activeDocState.export('snapshot');

            // Send to server
            // @ts-expect-error - Eden Treaty client type issue
            const response = await hominio.api.docs[selectedDoc.pubKey].snapshot.post({
                binarySnapshot: Array.from(snapshotBinary)
            });

            if (!response.data) {
                throw new Error('Failed to create snapshot: No data returned');
            }

            this.snapshotMessageStore.set(response.data.message || 'Snapshot created successfully!');

            // Refresh the document metadata to get the updated snapshot CID
            await this.refreshDocMetadata(selectedDoc.pubKey);

            return response.data;
        } catch (error) {
            console.error('Error creating snapshot:', error);
            this.snapshotMessageStore.set('Error: ' + (error instanceof Error ? error.message : 'Failed to create snapshot'));
            throw error;
        } finally {
            this.setStatus({ creatingSnapshot: false });
        }
    }

    /**
     * Fetch binary content by CID
     */
    async fetchBinaryContent(cid: string): Promise<Uint8Array> {
        try {
            // @ts-expect-error - Eden Treaty client type issue
            const response = await hominio.api.content[cid].binary.get();

            if (!response.data || !response.data.binaryData) {
                throw new Error('Failed to fetch binary content: No data returned');
            }

            // Convert array back to Uint8Array
            return new Uint8Array(response.data.binaryData);
        } catch (error) {
            console.error(`Error fetching binary content ${cid}:`, error);
            throw error;
        }
    }

    /**
     * Initialize document state
     */
    async initializeDocState(contentItem: ContentItem, updateCids: string[] = []) {
        // Clean up any existing document state
        if (this.activeDocState) {
            this.activeDocState.destroy();
        }

        // Create new document state
        this.activeDocState = createDocState<TodoDocument>();

        // Import the snapshot
        if (contentItem?.binaryData) {
            try {
                // Import the snapshot
                this.activeDocState.import(contentItem.binaryData, 'initial');
                console.log('Imported base snapshot');

                // Apply any existing updates
                if (updateCids && updateCids.length > 0) {
                    await this.applyUpdatesToDocs(updateCids);
                }
            } catch (error) {
                console.error('Error initializing document state:', error);
            }
        }
    }

    /**
     * Apply updates to the active document
     */
    async applyUpdatesToDocs(updateCids: string[]) {
        if (!this.activeDocState) return;

        for (const updateCid of updateCids) {
            try {
                // Fetch the update
                const updateData = await this.fetchBinaryContent(updateCid);

                // Apply the update to our document state
                this.activeDocState.import(updateData, 'remote');
                console.log(`Applied update: ${updateCid}`);
            } catch (error) {
                console.warn(`Error applying update ${updateCid}:`, error);
            }
        }
    }

    /**
     * Process the full document state including snapshot and all updates
     */
    async processDocumentState() {
        const selectedDoc = get(this.selectedDocStore);
        if (!selectedDoc || !this.activeDocState) return;

        try {
            this.setStatus({ processingState: true });

            const result = await this.processFullDocumentState(selectedDoc, this.activeDocState);
            this.processedResultStore.set(result);

            return result;
        } catch (error) {
            console.error('Error processing document state:', error);
            const errorResult = {
                success: false,
                updatesApplied: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
            this.processedResultStore.set(errorResult);
            return errorResult;
        } finally {
            this.setStatus({ processingState: false });
        }
    }

    /**
     * Process full document state by applying all updates to the snapshot
     */
    async processFullDocumentState(
        doc: {
            pubKey: string;
            snapshotCid: string;
            updateCids: string[];
        },
        docState: DocState<TodoDocument>
    ): Promise<ProcessedDocumentResult> {
        if (!doc || !doc.snapshotCid) {
            return {
                success: false,
                updatesApplied: 0,
                error: 'No document or snapshot CID available'
            };
        }

        try {
            // Get binary snapshot data
            const snapshotData = await this.fetchBinaryContent(doc.snapshotCid);

            // Import the snapshot to doc state
            docState.import(snapshotData);
            console.log('Snapshot imported successfully');

            // Apply each update sequentially
            let updatesApplied = 0;
            if (doc.updateCids && doc.updateCids.length > 0) {
                for (const updateCid of doc.updateCids) {
                    try {
                        // Get binary update data
                        const updateData = await this.fetchBinaryContent(updateCid);

                        // Apply the update
                        docState.import(updateData);
                        updatesApplied++;
                        console.log(`Applied update ${updateCid}`);
                    } catch (error) {
                        console.warn(`Error applying update ${updateCid}:`, error);
                        // Continue with other updates even if one fails
                    }
                }
            }

            // Get the current state
            const currentState = docState.getState();

            // If we have a valid document state
            if (currentState) {
                // Ensure it has the expected structure or set defaults
                const todoDocument: TodoDocument = {
                    title: currentState.title || 'Untitled',
                    todos: Array.isArray(currentState.todos) ? currentState.todos : [],
                    meta: {
                        description: currentState.meta?.description || ''
                    }
                };

                return {
                    success: true,
                    document: todoDocument,
                    updatesApplied
                };
            }

            // Return default document if current state is null
            return {
                success: true,
                document: {
                    title: 'Untitled',
                    todos: [],
                    meta: { description: '' }
                },
                updatesApplied
            };
        } catch (error) {
            console.error('Error processing document state:', error);
            return {
                success: false,
                updatesApplied: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.activeDocState) {
            this.activeDocState.destroy();
            this.activeDocState = null;
        }
    }
}

// Export default document service instance
export const documentService = new DocumentService();
