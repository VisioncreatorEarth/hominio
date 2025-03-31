import { writable, get, type Writable } from 'svelte/store';
import type { ZodType } from 'zod';
// Import types directly, but not the implementation yet
import type {
    LoroDoc as LoroDocType,
    LoroMap as LoroMapType,
    LoroList as LoroListType,
    LoroText as LoroTextType,
    LoroTree as LoroTreeType,
    LoroMovableList as LoroMovableListType,
    LoroCounter as LoroCounterType,
    Value,
    ExportMode
} from 'loro-crdt';

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

// --- Store Loro classes once loaded --- 
let LoroDoc: typeof LoroDocType | null = null;
let LoroMap: typeof LoroMapType | null = null;
let LoroList: typeof LoroListType | null = null;
let LoroText: typeof LoroTextType | null = null;
let LoroTree: typeof LoroTreeType | null = null;
let LoroMovableList: typeof LoroMovableListType | null = null;
// let LoroCounter: typeof LoroCounterType | null = null; // Counter not used in generateOperations yet

/**
 * LoroAPI provides a unified interface for working with Loro documents and collections.
 * It abstracts away the complexity of managing Loro instances and provides a consistent
 * API for CRUD operations across different container types.
 */
export class LoroAPI {
    private static instance: LoroAPI;
    private docRegistry = new Map<string, LoroDocType>();
    private schemaRegistry = new Map<string, SchemaDefinition>();
    private storeRegistry = new Map<string, Writable<[string, unknown][]>>();
    private operationsCache = new Map<string, Record<string, unknown>>();
    private isLoroLoaded = false;

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
     * Dynamically load the Loro classes from the 'loro-crdt' module
     */
    private async loadLoroIfNeeded(): Promise<void> {
        if (!this.isLoroLoaded) {
            try {
                const loroModule = await import('loro-crdt');
                // Assign loaded classes to module-level variables
                LoroDoc = loroModule.LoroDoc;
                LoroMap = loroModule.LoroMap;
                LoroList = loroModule.LoroList;
                LoroText = loroModule.LoroText;
                LoroTree = loroModule.LoroTree;
                LoroMovableList = loroModule.LoroMovableList;
                // LoroCounter = loroModule.LoroCounter;

                this.isLoroLoaded = true;
                console.log("✅ Loro classes loaded successfully.");
            } catch (err) {
                console.error("❌ Failed to load Loro WASM module:", err);
                throw new Error("Loro CRDT module failed to load.");
            }
        }
        // Ensure essential classes are loaded
        if (!LoroDoc || !LoroMap || !LoroList /* Add others if needed */) {
            throw new Error("Essential Loro classes not available after loading attempt.");
        }
    }

    /**
     * Register a schema with the API
     * @param schema Schema definition object
     * @returns Generated operations for the schema
     */
    async registerSchema(schema: SchemaDefinition) {
        this.schemaRegistry.set(schema.name, schema);
        const operations = await this.generateOperations(schema);
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

            // Note: generateOperations is async, but we might need to handle this differently
            // if getOperations needs to remain synchronous. For now, assuming async is okay.
            // If strict sync is required, this pattern needs rethinking (e.g., pre-generate on demand).
            this.generateOperations(schema).then(operations => {
                this.operationsCache.set(schemaName, operations);
            }).catch(err => {
                console.error(`Failed to generate operations for ${schemaName}:`, err);
            });
            // This immediate return might give undefined if generation is not complete
            // Consider returning a promise or ensuring generation completes first.
            throw new Error(`Operations for ${schemaName} are being generated asynchronously.`);
        }

        return this.operationsCache.get(schemaName) as {
            create: (data: Partial<T>) => string;
            get: (id: string) => T | null;
            update: (id: string, data: Partial<T>) => boolean;
            delete: (id: string) => boolean;
            query: (predicate: (item: T) => boolean) => [string, T][];
            store: Writable<[string, T][]>;
            doc: LoroDocType;
            collection: LoroMapType<Record<string, unknown>> | LoroListType<unknown> | Value;
        };
    }

    /**
     * Get or create a Loro document (now async due to dynamic import)
     * @param docName Name of the document
     * @returns Promise resolving to LoroDoc instance
     */
    async getDoc(docName: string): Promise<LoroDocType> {
        await this.loadLoroIfNeeded(); // Ensure Loro is loaded

        if (!LoroDoc) { // Check again after await
            throw new Error("LoroDoc class not available.");
        }

        if (!this.docRegistry.has(docName)) {
            const doc = new LoroDoc(); // Use the loaded class
            this.docRegistry.set(docName, doc);

            // Set up subscription to update stores when doc changes
            doc.subscribe(() => {
                this.updateStoresForDoc(docName); // Ensure this handles async updates if needed
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
    async getMap<T extends Record<string, unknown> = Record<string, unknown>>(docName: string, mapName: string): Promise<LoroMapType<T>> {
        const doc = await this.getDoc(docName);
        // No need to check LoroMap here, getDoc ensures loading
        return doc.getMap(mapName) as unknown as LoroMapType<T>;
    }

    /**
     * Get or create a List container
     * @param docName Name of the document
     * @param listName Name of the list
     * @returns LoroList instance
     */
    async getList<T>(docName: string, listName: string): Promise<LoroListType<T>> {
        const doc = await this.getDoc(docName);
        return doc.getList(listName) as unknown as LoroListType<T>;
    }

    /**
     * Get or create a Text container
     * @param docName Name of the document
     * @param textName Name of the text
     * @returns LoroText instance
     */
    async getText(docName: string, textName: string): Promise<LoroTextType> {
        const doc = await this.getDoc(docName);
        return doc.getText(textName);
    }

    /**
     * Get or create a Tree container
     * @param docName Name of the document
     * @param treeName Name of the tree
     * @returns LoroTree instance
     */
    async getTree<T extends Record<string, unknown> = Record<string, unknown>>(docName: string, treeName: string): Promise<LoroTreeType<T>> {
        const doc = await this.getDoc(docName);
        return doc.getTree(treeName) as unknown as LoroTreeType<T>;
    }

    /**
     * Get or create a MovableList container
     * @param docName Name of the document
     * @param listName Name of the list
     * @returns LoroMovableList instance
     */
    async getMovableList<T>(docName: string, listName: string): Promise<LoroMovableListType<T>> {
        const doc = await this.getDoc(docName);
        return doc.getMovableList(listName) as unknown as LoroMovableListType<T>;
    }

    /**
     * Get or create a Counter
     * @param docName Name of the document
     * @param counterName Name of the counter
     * @returns LoroCounter instance
     */
    async getCounter(docName: string, counterName: string): Promise<LoroCounterType> {
        const doc = await this.getDoc(docName);
        return doc.getCounter(counterName);
    }

    /**
     * Export a document to binary format
     * @param docName Name of the document
     * @param options Export options
     * @returns Uint8Array of the exported document
     */
    async exportDoc(docName: string, options?: { mode: 'snapshot' | 'update' }): Promise<Uint8Array> {
        const doc = await this.getDoc(docName);
        return doc.export(options?.mode);
    }

    /**
     * Import data into a document
     * @param docName Name of the document
     * @param data Data to import
     */
    async importDoc(docName: string, data: Uint8Array): Promise<void> {
        const doc = await this.getDoc(docName);
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
                const module = await schemaModules[path]() as { default: SchemaDefinition };
                if (module.default) {
                    await this.registerSchema(module.default);
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
    private async generateOperations(schema: SchemaDefinition): Promise<Record<string, unknown>> {
        const docName = schema.docName;
        const collectionName = schema.collectionName;
        const schemaName = schema.name;
        const containerType = schema.containerType || 'map';

        // Ensure Loro classes are loaded before proceeding
        await this.loadLoroIfNeeded();
        if (!LoroMap || !LoroList) { // Check for required classes
            throw new Error("Required Loro classes (Map, List) not loaded.");
        }

        let collection: LoroMapType<any> | LoroListType<any> | LoroTextType | LoroTreeType<any> | LoroMovableListType<any>;
        const doc = await this.getDoc(docName);

        switch (containerType) {
            case 'map':
                collection = await this.getMap(docName, collectionName);
                break;
            case 'list':
                collection = await this.getList(docName, collectionName);
                break;
            case 'text':
                collection = await this.getText(docName, collectionName);
                break;
            case 'tree':
                collection = await this.getTree(docName, collectionName);
                break;
            case 'movableList':
                collection = await this.getMovableList(docName, collectionName);
                break;
            default:
                collection = await this.getMap(docName, collectionName); // Default to map
        }

        if (!this.storeRegistry.has(schemaName)) {
            this.storeRegistry.set(schemaName, writable<[string, unknown][]>([]));
            await this.updateStore(schemaName);
        }
        const store = this.storeRegistry.get(schemaName)!;

        // --- Use loaded classes for instanceof checks --- 
        if (collection instanceof LoroMap) { // Use the variable LoroMap
            const mapCollection = collection as LoroMapType<Record<string, unknown>>;
            return {
                create: (data: Record<string, unknown>) => {
                    const id = (data.id as string) || crypto.randomUUID();
                    const fullData = { ...data, id };
                    mapCollection.set(id, fullData as unknown as Value);
                    this.updateStore(schemaName); // This might need to become async if updateStore is slow
                    return id;
                },
                get: (id: string) => {
                    return mapCollection.get(id) as unknown;
                },
                update: (id: string, data: Partial<Record<string, unknown>>) => {
                    const existing = mapCollection.get(id);
                    if (!existing) return false;
                    mapCollection.set(id, { ...existing as object, ...data } as unknown as Value);
                    this.updateStore(schemaName);
                    return true;
                },
                delete: (id: string) => {
                    // Check if mapCollection has the 'has' method or if 'get' returning undefined is sufficient
                    if (mapCollection.get(id) !== undefined) { // Use get check instead of has if needed
                        mapCollection.delete(id);
                        this.updateStore(schemaName);
                        return true;
                    }
                    return false;
                },
                query: (predicate: (item: Record<string, unknown>) => boolean) => {
                    const items = get(store) as [string, Record<string, unknown>][];
                    return items.filter(([, item]) => predicate(item));
                },
                store,
                doc,
                collection: mapCollection
            };
        } else if (collection instanceof LoroList) { // Use the variable LoroList
            const listCollection = collection as LoroListType<unknown>;
            // --- Placeholder for List operations --- 
            console.warn(`List operations need implementation in generateOperations`);
            return {
                create: (data: any) => { listCollection.insert(listCollection.length, data as Value); this.updateStore(schemaName); return data.id || 'temp-list-id'; },
                get: (id: string) => { return listCollection.toArray().find((item: any) => item.id === id) || null; },
                // Update/Delete for list need careful index handling or ID searching
                update: (id: string, data: any) => { console.warn('List update not implemented'); return false; },
                delete: (id: string) => { console.warn('List delete not implemented'); return false; },
                query: (predicate: (item: any) => boolean) => {
                    const items = get(store) as [string, any][];
                    return items.filter(([, item]) => predicate(item));
                },
                store,
                doc,
                collection: listCollection
            };
        }
        // --- Handle other types --- 
        else if (collection instanceof LoroText) {
            const textCollection = collection as LoroTextType;
            console.warn(`Text operations need implementation in generateOperations`);
            // Simplified operations for Text
            return {
                get: () => textCollection.toString(), // Get the full text
                update: (newText: string) => {
                    textCollection.delete(0, textCollection.length);
                    textCollection.insert(0, newText);
                    this.updateStore(schemaName);
                    return true;
                },
                store, doc, collection: textCollection
            };
        }
        // Add instanceof checks for LoroTree, LoroMovableList if needed
        else {
            console.warn(`Operations not fully implemented for container type: ${typeof collection}`);
            return { store, doc, collection }; // Return minimal object
        }
    }

    /**
     * Update a store with the latest data from its collection
     * @param schemaName Name of the schema
     */
    private async updateStore(schemaName: string) {
        await this.loadLoroIfNeeded(); // Ensure classes are loaded
        if (!LoroMap || !LoroList || !LoroText) {
            console.error("Cannot update store, required Loro classes not loaded.");
            return;
        }

        const schema = this.schemaRegistry.get(schemaName);
        if (!schema) return;

        const containerType = schema.containerType || 'map';
        const docName = schema.docName;
        const collectionName = schema.collectionName;
        const store = this.storeRegistry.get(schemaName);
        if (!store) return;

        const doc = await this.getDoc(docName); // getDoc already ensures loaded doc

        // --- Use loaded classes for instanceof checks/getters --- 
        if (containerType === 'map') {
            const collection = await this.getMap(docName, collectionName);
            if (collection instanceof LoroMap) { // Check type again
                const entries = [...collection.entries()].map(([key, value]) => [key, value as unknown]);
                store.set(entries);
            } else {
                console.error(`Expected LoroMap but got different type for ${schemaName}`);
            }
        } else if (containerType === 'list') {
            const collection = await this.getList(docName, collectionName);
            if (collection instanceof LoroList) {
                const items = collection.toArray().map((item, index) => {
                    const key = (item as any)?.id || `${index}`;
                    return [key, item as unknown];
                });
                store.set(items as [string, unknown][]);
            } else {
                console.error(`Expected LoroList but got different type for ${schemaName}`);
            }
        } else if (containerType === 'text') {
            const collection = await this.getText(docName, collectionName);
            if (collection instanceof LoroText) {
                store.set([['content', collection.toString()]]);
            } else {
                console.error(`Expected LoroText but got different type for ${schemaName}`);
            }
        } else {
            console.warn(`Store update not implemented for container type ${containerType}`);
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
     * Generic update helper that handles the common pattern of updating an item in a map
     * This provides a more reliable way to update items than the generic operations
     * @param schemaName Name of the schema
     * @param id ID of the item to update
     * @param updateFn Function that returns the updated item
     * @returns Whether the update was successful
     */
    async updateItem<T>(schemaName: string, id: string, updateFn: (currentItem: T) => T): Promise<boolean> {
        await this.loadLoroIfNeeded();
        const { schema, doc, map } = await this.getSchemaDetails(schemaName); // getSchemaDetails is async
        if (schema.containerType !== 'map' && schema.containerType !== undefined) {
            console.warn(`updateItem only supports map container types currently`);
            return false;
        }

        if (!(map instanceof LoroMap)) { // Use variable
            console.error("Cannot update item: Collection is not a LoroMap");
            return false;
        }

        const currentItem = map.get(id) as unknown as T;
        if (currentItem === undefined) return false; // Item doesn't exist

        const updatedItem = updateFn(currentItem);
        map.set(id, updatedItem as unknown as Value);
        await this.updateStore(schemaName);
        return true;
    }

    /**
     * Generic delete helper that handles the common pattern of deleting an item from a map
     * This provides a more reliable way to delete items than the generic operations
     * @param schemaName Name of the schema
     * @param id ID of the item to delete
     * @returns Whether the deletion was successful
     */
    async deleteItem(schemaName: string, id: string): Promise<boolean> {
        await this.loadLoroIfNeeded();
        const { schema, doc, map } = await this.getSchemaDetails(schemaName);
        if (schema.containerType !== 'map' && schema.containerType !== undefined) {
            console.warn(`deleteItem only supports map container types currently`);
            return false;
        }

        if (!(map instanceof LoroMap)) {
            console.error("Cannot delete item: Collection is not a LoroMap");
            return false;
        }

        if (map.get(id) === undefined) return false; // Item doesn't exist

        map.delete(id);
        await this.updateStore(schemaName);
        return true;
    }

    /**
     * Generic create helper that handles the common pattern of creating an item in a map
     * This provides a more reliable way to create items than the generic operations
     * @param schemaName Name of the schema
     * @param item Item to create (should include an id field)
     * @returns The ID of the created item, or null if creation failed
     */
    async createItem<T extends { id?: string }>(schemaName: string, item: T): Promise<string | null> {
        await this.loadLoroIfNeeded();
        const { schema, doc, map } = await this.getSchemaDetails(schemaName);
        if (schema.containerType !== 'map' && schema.containerType !== undefined) {
            console.warn(`createItem only supports map container types currently`);
            return null;
        }

        if (!(map instanceof LoroMap)) {
            console.error("Cannot create item: Collection is not a LoroMap");
            return null;
        }

        const id = item.id || crypto.randomUUID();
        const itemWithId = { ...item, id };
        map.set(id, itemWithId as unknown as Value);
        await this.updateStore(schemaName);
        return id;
    }

    /**
     * Update all stores associated with a document
     * @param docName Name of the document
     */
    private async updateStoresForDoc(docName: string) {
        for (const [schemaName, schema] of this.schemaRegistry.entries()) {
            if (schema.docName === docName) {
                await this.updateStore(schemaName);
            }
        }
    }

    /**
     * Get schema details, document and map collection for a schema
     * This is a helper method to avoid hardcoded imports in tool functions
     * @param schemaName Name of the schema
     * @returns Object with schema info, document and map
     */
    async getSchemaDetails(schemaName: string): Promise<{
        schema: SchemaDefinition;
        doc: LoroDocType;
        map: LoroMapType<Record<string, unknown>>; // Use LoroMapType
    }> {
        await this.loadLoroIfNeeded(); // Ensure loaded
        const schema = this.schemaRegistry.get(schemaName);
        if (!schema) {
            throw new Error(`Schema not found: ${schemaName}`);
        }
        if (schema.containerType !== 'map' && schema.containerType !== undefined) {
            throw new Error(`getSchemaDetails currently only supports map types, requested for ${schemaName} which is ${schema.containerType}`);
        }

        const doc = await this.getDoc(schema.docName);
        const map = await this.getMap(schema.docName, schema.collectionName);

        return { schema, doc, map };
    }

    /**
     * Find an item by various criteria in a schema collection
     * @param schemaName Name of the schema to search in
     * @param criteria Search criteria
     * @returns Found item ID and data, or null if not found
     */
    async findItem<T>(
        schemaName: string,
        criteria: {
            id?: string;
            searchField?: keyof T;
            searchValue?: string;
            exactMatch?: boolean;
        }
    ): Promise<[string, T] | null> {
        await this.loadLoroIfNeeded();
        // getOperations needs to handle the async generation properly
        // For now, assuming it might throw or return partially initialized ops
        try {
            const ops = this.getOperations<T>(schemaName);
            if (!ops) {
                console.warn(`Operations for ${schemaName} not ready yet.`);
                return null;
            }

            if (criteria.id) {
                const item = ops.get(criteria.id);
                if (item) {
                    return [criteria.id, item]; // Removed Promise.resolve
                }
            }

            if (criteria.searchField && criteria.searchValue) {
                const fieldName = criteria.searchField as string; // Cast needed
                const searchValue = criteria.searchValue.toLowerCase();
                const exactMatch = criteria.exactMatch ?? false;

                const matchingItems = ops.query(item => {
                    if (!item || typeof item !== 'object') return false;
                    const itemAsRecord = item as Record<string, unknown>;
                    const fieldValue = itemAsRecord[fieldName];
                    if (typeof fieldValue !== 'string') return false;
                    const lowerFieldValue = fieldValue.toLowerCase();
                    return exactMatch ? lowerFieldValue === searchValue : lowerFieldValue.includes(searchValue);
                });

                if (matchingItems.length === 1) {
                    return matchingItems[0];
                } else if (matchingItems.length > 1 && !exactMatch) {
                    // Try exact match among the multiple results
                    const exactMatches = matchingItems.filter(([, item]) => {
                        if (!item || typeof item !== 'object') return false;
                        const itemAsRecord = item as Record<string, unknown>;
                        const fieldValue = itemAsRecord[fieldName];
                        return typeof fieldValue === 'string' && fieldValue.toLowerCase() === searchValue;
                    });
                    if (exactMatches.length === 1) {
                        return exactMatches[0];
                    }
                }

                if (matchingItems.length > 0) { // Found multiple or exact match failed
                    // Maybe return the first match or handle ambiguity? Returning null for now.
                    console.warn(`Multiple items found for criteria in ${schemaName}, returning null.`);
                    return null;
                    // Alternatively, throw new Error or return all matches
                }
            }
        } catch (error) {
            console.error(`Error in findItem for ${schemaName}:`, error);
            return null; // Return null on error
        }

        return null; // No criteria matched or error occurred
    }
}

// DO NOT export a pre-created instance:
// export const loroAPI = LoroAPI.getInstance(); 

// Instead, allow consumers to get the instance when needed:
export function getLoroAPIInstance(): LoroAPI {
    return LoroAPI.getInstance();
} 