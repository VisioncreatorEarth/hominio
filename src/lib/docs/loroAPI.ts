import { LoroDoc, type Value, LoroMap, LoroList, LoroText, LoroTree, LoroMovableList, LoroCounter } from 'loro-crdt';
import { writable, get, type Writable } from 'svelte/store';
import type { ZodType } from 'zod';

/**
 * Schema definition interface
 */
export interface SchemaDefinition {
    name: string;
    docName: string;
    collectionName: string;
    containerType?: 'map' | 'list' | 'text' | 'tree' | 'movableList';
    validator?: ZodType<unknown>;
}

/**
 * LoroAPI provides a unified interface for working with Loro documents and collections.
 * It abstracts away the complexity of managing Loro instances and provides a consistent
 * API for CRUD operations across different container types.
 */
export class LoroAPI {
    private static instance: LoroAPI;
    private docRegistry = new Map<string, LoroDoc>();
    private schemaRegistry = new Map<string, SchemaDefinition>();
    private storeRegistry = new Map<string, Writable<[string, unknown][]>>();
    private operationsCache = new Map<string, Record<string, unknown>>();

    /**
     * Private constructor for singleton pattern
     */
    private constructor() { }

    /**
     * Get the singleton instance of LoroAPI
     */
    static getInstance(): LoroAPI {
        if (!LoroAPI.instance) {
            LoroAPI.instance = new LoroAPI();
        }
        return LoroAPI.instance;
    }

    /**
     * Register a schema with the API
     * @param schema Schema definition object
     * @returns Generated operations for the schema
     */
    registerSchema(schema: SchemaDefinition) {
        this.schemaRegistry.set(schema.name, schema);

        // Generate operations for this schema
        const operations = this.generateOperations(schema);
        this.operationsCache.set(schema.name, operations);

        return operations;
    }

    /**
     * Get the operations for a schema
     * @param schemaName Name of the schema
     * @returns Generated operations for the schema
     */
    getOperations<T>(schemaName: string) {
        if (!this.operationsCache.has(schemaName)) {
            const schema = this.schemaRegistry.get(schemaName);
            if (!schema) throw new Error(`Schema not found: ${schemaName}`);

            const operations = this.generateOperations(schema);
            this.operationsCache.set(schemaName, operations);
        }

        return this.operationsCache.get(schemaName) as {
            create: (data: Partial<T>) => string;
            get: (id: string) => T | null;
            update: (id: string, data: Partial<T>) => boolean;
            delete: (id: string) => boolean;
            query: (predicate: (item: T) => boolean) => [string, T][];
            store: Writable<[string, T][]>;
            doc: LoroDoc;
            collection: LoroMap<Record<string, unknown>> | LoroList<unknown> | Value;
        };
    }

    /**
     * Get or create a Loro document
     * @param docName Name of the document
     * @returns LoroDoc instance
     */
    getDoc(docName: string): LoroDoc {
        if (!this.docRegistry.has(docName)) {
            const doc = new LoroDoc();
            this.docRegistry.set(docName, doc);

            // Set up subscription to update stores when doc changes
            doc.subscribe(() => {
                this.updateStoresForDoc(docName);
            });
        }
        return this.docRegistry.get(docName)!;
    }

    /**
     * Get or create a Map container
     * @param docName Name of the document
     * @param mapName Name of the map
     * @returns LoroMap instance
     */
    getMap<T extends Record<string, unknown> = Record<string, unknown>>(docName: string, mapName: string): LoroMap<T> {
        const doc = this.getDoc(docName);
        return doc.getMap(mapName) as unknown as LoroMap<T>;
    }

    /**
     * Get or create a List container
     * @param docName Name of the document
     * @param listName Name of the list
     * @returns LoroList instance
     */
    getList<T>(docName: string, listName: string): LoroList<T> {
        const doc = this.getDoc(docName);
        return doc.getList(listName) as unknown as LoroList<T>;
    }

    /**
     * Get or create a Text container
     * @param docName Name of the document
     * @param textName Name of the text
     * @returns LoroText instance
     */
    getText(docName: string, textName: string): LoroText {
        const doc = this.getDoc(docName);
        return doc.getText(textName);
    }

    /**
     * Get or create a Tree container
     * @param docName Name of the document
     * @param treeName Name of the tree
     * @returns LoroTree instance
     */
    getTree<T extends Record<string, unknown> = Record<string, unknown>>(docName: string, treeName: string): LoroTree<T> {
        const doc = this.getDoc(docName);
        return doc.getTree(treeName) as unknown as LoroTree<T>;
    }

    /**
     * Get or create a MovableList container
     * @param docName Name of the document
     * @param listName Name of the list
     * @returns LoroMovableList instance
     */
    getMovableList<T>(docName: string, listName: string): LoroMovableList<T> {
        const doc = this.getDoc(docName);
        return doc.getMovableList(listName) as unknown as LoroMovableList<T>;
    }

    /**
     * Get or create a Counter
     * @param docName Name of the document
     * @param counterName Name of the counter
     * @returns LoroCounter instance
     */
    getCounter(docName: string, counterName: string): LoroCounter {
        const doc = this.getDoc(docName);
        return doc.getCounter(counterName);
    }

    /**
     * Export a document to binary format
     * @param docName Name of the document
     * @param options Export options
     * @returns Uint8Array of the exported document
     */
    exportDoc(docName: string, options?: { mode: 'snapshot' | 'update' }): Uint8Array {
        const doc = this.getDoc(docName);
        return doc.export(options);
    }

    /**
     * Import data into a document
     * @param docName Name of the document
     * @param data Data to import
     */
    importDoc(docName: string, data: Uint8Array): void {
        const doc = this.getDoc(docName);
        doc.import(data);
    }

    /**
     * Auto-discover schemas from the schemas directory
     * @returns List of registered schema names
     */
    async discoverSchemas() {
        const schemaModules = import.meta.glob('../docs/schemas/*.ts');
        const registeredSchemas: string[] = [];

        for (const path in schemaModules) {
            try {
                const module = await schemaModules[path]();
                if (module.default) {
                    this.registerSchema(module.default);
                    registeredSchemas.push(module.default.name);
                }
            } catch (error) {
                console.error(`Failed to load schema from ${path}:`, error);
            }
        }

        return registeredSchemas;
    }

    /**
     * Generate CRUD operations for a schema
     * @param schema Schema definition
     * @returns Object with CRUD operations
     */
    private generateOperations(schema: SchemaDefinition): Record<string, unknown> {
        const docName = schema.docName;
        const collectionName = schema.collectionName;
        const schemaName = schema.name;

        // Get or create LoroDoc
        const doc = this.getDoc(docName);

        // Get collection based on container type
        const containerType = schema.containerType || 'map';
        let collection: Value;

        switch (containerType) {
            case 'map':
                collection = doc.getMap(collectionName);
                break;
            case 'list':
                collection = doc.getList(collectionName);
                break;
            case 'text':
                collection = doc.getText(collectionName);
                break;
            case 'tree':
                collection = doc.getTree(collectionName);
                break;
            case 'movableList':
                collection = doc.getMovableList(collectionName);
                break;
            default:
                collection = doc.getMap(collectionName);
        }

        // Create store if needed
        if (!this.storeRegistry.has(schemaName)) {
            this.storeRegistry.set(schemaName, writable<[string, unknown][]>([]));
            this.updateStore(schemaName);
        }

        // Return operations based on container type
        if (containerType === 'map') {
            return {
                // Create operation
                create: (data: any) => {
                    const id = data.id || crypto.randomUUID();
                    const fullData = { ...data, id };

                    collection.set(id, fullData as unknown as Value);
                    this.updateStore(schemaName);

                    return id;
                },

                // Get operation
                get: (id: string) => {
                    return collection.get(id) as unknown as any;
                },

                // Update operation
                update: (id: string, data: any) => {
                    const existing = collection.get(id);

                    if (!existing) return false;

                    collection.set(id, {
                        ...existing as object,
                        ...data
                    } as unknown as Value);

                    this.updateStore(schemaName);
                    return true;
                },

                // Delete operation
                delete: (id: string) => {
                    if (collection.has(id)) {
                        collection.delete(id);
                        this.updateStore(schemaName);
                        return true;
                    }

                    return false;
                },

                // Query operation
                query: (predicate: (item: any) => boolean) => {
                    const store = this.storeRegistry.get(schemaName);
                    if (!store) return [];

                    const items = get(store) as [string, any][];
                    return items.filter(([, item]) => predicate(item));
                },

                // Reactive store
                store: this.storeRegistry.get(schemaName),

                // Access to raw doc and collection
                doc,
                collection
            };
        } else if (containerType === 'list') {
            return {
                // Create operation (for lists, appends to the end by default)
                create: (data: any) => {
                    const id = data.id || crypto.randomUUID();
                    const fullData = { ...data, id };

                    // Add item to the end of the list
                    collection.insert(collection.length(), fullData as unknown as Value);
                    this.updateStore(schemaName);

                    return id;
                },

                // Get operation (for lists, this is more complex as we need to search)
                get: (id: string) => {
                    const items = collection.toArray();
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i] as any;
                        if (item && item.id === id) {
                            return item;
                        }
                    }
                    return null;
                },

                // Update operation (find and replace)
                update: (id: string, data: any) => {
                    const items = collection.toArray();
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i] as any;
                        if (item && item.id === id) {
                            collection.delete(i, 1);
                            collection.insert(i, {
                                ...item,
                                ...data
                            } as unknown as Value);
                            this.updateStore(schemaName);
                            return true;
                        }
                    }
                    return false;
                },

                // Delete operation (find and remove)
                delete: (id: string) => {
                    const items = collection.toArray();
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i] as any;
                        if (item && item.id === id) {
                            collection.delete(i, 1);
                            this.updateStore(schemaName);
                            return true;
                        }
                    }
                    return false;
                },

                // Query operation
                query: (predicate: (item: any) => boolean) => {
                    const store = this.storeRegistry.get(schemaName);
                    if (!store) return [];

                    const items = get(store) as [string, any][];
                    return items.filter(([, item]) => predicate(item));
                },

                // Reactive store
                store: this.storeRegistry.get(schemaName),

                // Access to raw doc and collection
                doc,
                collection
            };
        }

        // For other container types, we provide a basic set of operations
        // These would need to be expanded for real use cases
        return {
            // Basic create operation
            create: (data: any) => {
                // Implementation would depend on the container type
                console.warn(`Create operation not fully implemented for container type ${containerType}`);
                return data.id || crypto.randomUUID();
            },

            // Basic get operation
            get: (id: string) => {
                // Implementation would depend on the container type
                console.warn(`Get operation not fully implemented for container type ${containerType}`);
                return null;
            },

            // Basic update operation
            update: (id: string, data: any) => {
                // Implementation would depend on the container type
                console.warn(`Update operation not fully implemented for container type ${containerType}`);
                return false;
            },

            // Basic delete operation
            delete: (id: string) => {
                // Implementation would depend on the container type
                console.warn(`Delete operation not fully implemented for container type ${containerType}`);
                return false;
            },

            // Basic query operation
            query: (predicate: (item: any) => boolean) => {
                console.warn(`Query operation not fully implemented for container type ${containerType}`);
                return [];
            },

            // Reactive store
            store: this.storeRegistry.get(schemaName),

            // Access to raw doc and collection
            doc,
            collection
        };
    }

    /**
     * Update a store with the latest data from its collection
     * @param schemaName Name of the schema
     */
    private updateStore(schemaName: string) {
        const schema = this.schemaRegistry.get(schemaName);
        if (!schema) return;

        const containerType = schema.containerType || 'map';
        const docName = schema.docName;
        const collectionName = schema.collectionName;

        const doc = this.docRegistry.get(docName);
        if (!doc) return;

        const store = this.storeRegistry.get(schemaName);
        if (!store) return;

        if (containerType === 'map') {
            const collection = doc.getMap(collectionName);
            const entries = [...collection.entries()].map(([key, value]) => [key, value as unknown]);
            store.set(entries);
        } else if (containerType === 'list') {
            const collection = doc.getList(collectionName);
            // For lists, convert to an array with indices as keys
            const items = collection.toArray().map((item, index) => {
                // If the item has an id, use that, otherwise use the index
                const key = (item as any)?.id || `${index}`;
                return [key, item as unknown];
            });
            store.set(items);
        } else if (containerType === 'text') {
            const collection = doc.getText(collectionName);
            // For text, we create an entry with the full text content
            store.set([['content', collection.toString()]]);
        } else {
            // For other container types, we'd need custom handling
            console.warn(`Store update not fully implemented for container type ${containerType}`);
        }
    }

    /**
     * Public method to force an update of a schema's store
     * This is useful when directly manipulating the document
     * @param schemaName Name of the schema to update
     */
    updateStoreForSchema(schemaName: string): void {
        this.updateStore(schemaName);
    }

    /**
     * Update all stores associated with a document
     * @param docName Name of the document
     */
    private updateStoresForDoc(docName: string) {
        for (const [schemaName, schema] of this.schemaRegistry.entries()) {
            if (schema.docName === docName) {
                this.updateStore(schemaName);
            }
        }
    }
}

// Export singleton instance
export const loroAPI = LoroAPI.getInstance(); 