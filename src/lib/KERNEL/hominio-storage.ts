import { browser } from '$app/environment';
import { openDB, type IDBPDatabase } from 'idb';

// Constants
const DB_NAME = 'hominio-docs';
const DB_VERSION = 1;

/**
 * StorageItem represents a single item in storage with its metadata
 */
export interface StorageItem {
    key: string;
    value: Uint8Array;
    metadata: Record<string, unknown>;
    createdAt: string;
}

/**
 * StorageAdapter interface defines the required operations for any storage implementation
 */
export interface StorageAdapter {
    /**
     * Initialize the storage adapter
     */
    init(): Promise<void>;

    /**
     * Get a value by its key
     * @param key The unique identifier for the item
     * @returns The binary data or null if not found
     */
    get(key: string): Promise<Uint8Array | null>;

    /**
     * Store a value with its associated key and optional metadata
     * @param key The unique identifier for the item
     * @param value The binary data to store
     * @param metadata Optional metadata associated with the value
     */
    put(key: string, value: Uint8Array, metadata?: Record<string, unknown>): Promise<void>;

    /**
     * Delete a value by its key
     * @param key The unique identifier for the item to delete
     * @returns True if the item was deleted, false if it didn't exist
     */
    delete(key: string): Promise<boolean>;

    /**
     * Get all items, optionally filtering by a key prefix
     * @param prefix Optional key prefix to filter items
     * @returns Array of storage items matching the criteria
     */
    getAll(prefix?: string): Promise<Array<StorageItem>>;

    /**
     * Get metadata for a specific item
     * @param key The unique identifier for the item
     * @returns The metadata or null if not found
     */
    getMetadata(key: string): Promise<Record<string, unknown> | null>;

    /**
     * Query items based on metadata
     * @param filter Function that returns true for items to include
     * @returns Array of keys for matching items
     */
    query(filter: (metadata: Record<string, unknown>) => boolean): Promise<string[]>;

    /**
     * Check if multiple keys exist efficiently.
     * @param keys Array of keys to check.
     * @returns A Set containing the keys that exist.
     */
    batchExists(keys: string[]): Promise<Set<string>>;

    /**
     * Put multiple items into storage efficiently.
     * @param items Array of items to put.
     */
    batchPut(items: Array<{ key: string, value: Uint8Array, meta?: Record<string, unknown> }>): Promise<void>;

    /**
     * Create a transaction for batch operations
     */
    createTransaction(): StorageTransaction;

    /**
     * Close the storage connection
     */
    close(): void;
}

/**
 * StorageTransaction interface for batch operations
 */
export interface StorageTransaction {
    /**
     * Get a value within this transaction
     */
    get(key: string): Promise<Uint8Array | null>;

    /**
     * Put a value within this transaction
     */
    put(key: string, value: Uint8Array, metadata?: Record<string, unknown>): Promise<void>;

    /**
     * Delete a value within this transaction
     */
    delete(key: string): Promise<boolean>;

    /**
     * Complete the transaction
     */
    complete(): Promise<void>;

    /**
     * Abort the transaction
     */
    abort(): void;
}

/**
 * IndexedDB implementation of the StorageAdapter interface
 */
export class IndexedDBAdapter implements StorageAdapter {
    private db: IDBPDatabase | null = null;
    private storeName: string;

    /**
     * Create a new IndexedDBAdapter
     * @param storeName The name of the object store to use
     */
    constructor(storeName: string) {
        this.storeName = storeName;
    }

    /**
     * Initialize the IndexedDB connection
     */
    async init(): Promise<void> {
        if (!browser) {
            throw new Error('IndexedDB not supported in non-browser environment');
        }

        try {
            this.db = await openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    // Create the store if it doesn't exist
                    if (!db.objectStoreNames.contains('content')) {
                        const store = db.createObjectStore('content', { keyPath: 'key' });
                        store.createIndex('createdAt', 'createdAt', { unique: false });
                        store.createIndex('type', 'metadata.type', { unique: false });
                    }

                    // Create docs store with keyPath 'key' to match how we're storing data
                    if (!db.objectStoreNames.contains('docs')) {
                        const docsStore = db.createObjectStore('docs', { keyPath: 'key' });
                        docsStore.createIndex('pubKey', 'value.pubKey', { unique: true });
                        docsStore.createIndex('updatedAt', 'value.updatedAt', { unique: false });
                    }
                }
            });

            console.log(`IndexedDB opened successfully for store: ${this.storeName}`);
        } catch (err) {
            console.error('Error opening IndexedDB:', err);
            throw new Error('Could not open IndexedDB');
        }
    }

    /**
     * Ensure the database is initialized
     */
    private async ensureDB(): Promise<IDBPDatabase> {
        if (!this.db) {
            await this.init();
        }
        if (!this.db) {
            throw new Error('Failed to initialize database');
        }
        return this.db;
    }

    /**
     * Get a value by its key
     */
    async get(key: string): Promise<Uint8Array | null> {
        try {
            const db = await this.ensureDB();
            const item = await db.get(this.storeName, key) as StorageItem | undefined;

            if (!item) {
                return null;
            }

            // Special handling for docs store
            if (this.storeName === 'docs') {
                if (!item.value) return null;

                // Convert the stored object back to a string and then to Uint8Array
                const jsonString = JSON.stringify(item.value);
                return new TextEncoder().encode(jsonString);
            }

            // For content store
            if (!item.value) {
                return null;
            }

            return this.ensureUint8Array(item.value);
        } catch (err) {
            console.error(`Error getting key ${key}:`, err);
            throw new Error(`Failed to get item: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Store a value with metadata
     */
    async put(key: string, value: Uint8Array, metadata: Record<string, unknown> = {}): Promise<void> {
        try {
            const db = await this.ensureDB();
            const now = new Date().toISOString();

            // Special handling for docs store
            if (this.storeName === 'docs') {
                try {
                    // For docs store, we expect value to be a JSON string that we can parse
                    const text = new TextDecoder().decode(value);
                    const docObj = JSON.parse(text);

                    // Create a proper storage item with the key as the keyPath
                    const item = {
                        key,
                        value: docObj, // Store the parsed object
                        metadata,
                        createdAt: now
                    };

                    await db.put(this.storeName, item);
                    return;
                } catch (parseErr) {
                    console.error(`Error parsing doc data for ${key}:`, parseErr);
                    throw new Error(`Failed to parse document data: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
                }
            }

            // For other stores (content), use the standard approach
            const item: StorageItem = {
                key,
                value,
                metadata,
                createdAt: now
            };

            await db.put(this.storeName, item);
        } catch (err) {
            console.error(`Error putting key ${key}:`, err);
            throw new Error(`Failed to store item: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Delete a value by its key
     */
    async delete(key: string): Promise<boolean> {
        try {
            const db = await this.ensureDB();

            // Check if item exists
            const exists = await db.get(this.storeName, key);
            if (!exists) {
                return false;
            }

            await db.delete(this.storeName, key);
            return true;
        } catch (err) {
            console.error(`Error deleting key ${key}:`, err);
            throw new Error(`Failed to delete item: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Get all items, optionally filtering by prefix
     */
    async getAll(prefix?: string): Promise<Array<StorageItem>> {
        try {
            const db = await this.ensureDB();
            const allItems = await db.getAll(this.storeName);

            // For docs store, we need to handle the different structure
            if (this.storeName === 'docs') {
                const items = allItems as any[];
                return items.map(item => ({
                    key: item.key,
                    value: new TextEncoder().encode(JSON.stringify(item.value)),
                    metadata: item.metadata || {},
                    createdAt: item.createdAt
                }));
            }

            if (!prefix) {
                return allItems as StorageItem[];
            }

            // Filter by prefix
            return allItems.filter(item =>
                item.key.startsWith(prefix)
            ) as StorageItem[];
        } catch (err) {
            console.error('Error getting all items:', err);
            throw new Error(`Failed to get items: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Get metadata for a specific item
     */
    async getMetadata(key: string): Promise<Record<string, unknown> | null> {
        try {
            const db = await this.ensureDB();
            const item = await db.get(this.storeName, key) as StorageItem | undefined;

            if (!item) {
                return null;
            }

            return item.metadata;
        } catch (err) {
            console.error(`Error getting metadata for ${key}:`, err);
            throw new Error(`Failed to get metadata: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Query items based on metadata
     */
    async query(filter: (metadata: Record<string, unknown>) => boolean): Promise<string[]> {
        try {
            const db = await this.ensureDB();
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            let cursor = await store.openCursor();
            const matchingKeys: string[] = [];

            while (cursor) {
                if (cursor.value.metadata && filter(cursor.value.metadata)) {
                    matchingKeys.push(cursor.key as string);
                }
                cursor = await cursor.continue();
            }

            await tx.done;
            return matchingKeys;
        } catch (err) {
            console.error('Error querying items:', err);
            throw new Error(`Failed to query items: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Check if multiple keys exist efficiently.
     * @param keys Array of keys to check.
     * @returns A Set containing the keys that exist.
     */
    async batchExists(keys: string[]): Promise<Set<string>> {
        if (!keys.length) return new Set();
        try {
            const db = await this.ensureDB();
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const existingKeys = new Set<string>();

            const promises = keys.map(async key => {
                // Use count instead of get for potentially better performance
                const count = await store.count(key);
                if (count > 0) {
                    existingKeys.add(key);
                }
            });

            await Promise.all(promises);
            await tx.done;
            return existingKeys;
        } catch (err) {
            console.error('Error in batchExists:', err);
            throw new Error(`Batch exists failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Put multiple items into storage efficiently.
     * @param items Array of items to put.
     */
    async batchPut(items: Array<{ key: string, value: Uint8Array, meta?: Record<string, unknown> }>): Promise<void> {
        if (!items.length) return;
        try {
            const db = await this.ensureDB();
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const now = new Date().toISOString();

            const putPromises = items.map(item => {
                let valueToStore: unknown = item.value; // Default for content
                const metadataToStore: Record<string, unknown> = item.meta || {}; // Use const

                // Special handling for docs store
                if (this.storeName === 'docs') {
                    try {
                        const text = new TextDecoder().decode(item.value);
                        valueToStore = JSON.parse(text); // Store parsed object
                    } catch (parseErr) {
                        console.error(`Error parsing doc data for ${item.key} in batchPut:`, parseErr);
                        // Skip this item if parsing fails
                        return Promise.resolve();
                    }
                }

                const storageItem: StorageItem = {
                    key: item.key,
                    value: valueToStore as Uint8Array, // Cast here if necessary after checks
                    metadata: metadataToStore,
                    createdAt: now // Consider if a per-item timestamp is needed
                };
                return store.put(storageItem);
            });

            await Promise.all(putPromises);
            await tx.done;
        } catch (err) {
            console.error('Error in batchPut:', err);
            throw new Error(`Batch put failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Create a transaction for batch operations
     */
    createTransaction(): StorageTransaction {
        return new IndexedDBTransaction(this.ensureDB(), this.storeName);
    }

    /**
     * Close the database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    /**
     * Ensure value is a Uint8Array
     * Handles various formats that might be stored in IndexedDB
     */
    private ensureUint8Array(value: any): Uint8Array {
        if (value instanceof Uint8Array) {
            return value;
        } else if (value instanceof ArrayBuffer) {
            return new Uint8Array(value);
        } else if (typeof value === 'object' && value !== null && 'buffer' in value) {
            // Handle Buffer-like objects
            try {
                // Ensure 'buffer' is a property and it's an ArrayBuffer
                if (typeof value === 'object' && value !== null && 'buffer' in value && value.buffer instanceof ArrayBuffer) {
                    return new Uint8Array(value.buffer);
                }
            } catch (err) {
                console.error('Failed to convert Buffer-like to Uint8Array:', err);
            }
        } else if (Array.isArray(value)) {
            // Handle array representation
            return new Uint8Array(value);
        }

        // Last resort: try generic conversion
        try {
            return new Uint8Array(value as unknown as ArrayBufferLike);
        } catch (err) {
            console.error('Failed to convert value to Uint8Array:', err);
            throw new Error('Could not convert value to Uint8Array');
        }
    }
}

/**
 * IndexedDB transaction implementation
 */
class IndexedDBTransaction implements StorageTransaction {
    private dbPromise: Promise<IDBPDatabase>;
    private storeName: string;
    private tx: import('idb').IDBPTransaction<unknown, [string], "readwrite"> | null = null;
    private activePromise: Promise<import('idb').IDBPTransaction<unknown, [string], "readwrite"> | null> | null = null;
    private completed = false;
    private aborted = false;

    constructor(dbPromise: Promise<IDBPDatabase>, storeName: string) {
        this.dbPromise = dbPromise;
        this.storeName = storeName;
    }

    private async ensureTx(): Promise<import('idb').IDBPTransaction<unknown, [string], "readwrite">> {
        if (this.completed) {
            throw new Error('Transaction already completed');
        }
        if (this.aborted) {
            throw new Error('Transaction aborted');
        }
        if (!this.tx) {
            this.tx = await this.dbPromise.then(db => db.transaction(this.storeName, 'readwrite'));
        }
        return this.tx;
    }

    async get(key: string): Promise<Uint8Array | null> {
        const tx = await this.ensureTx();
        const store = tx.objectStore(this.storeName);
        const item = await store.get(key) as StorageItem | undefined;

        if (!item || !item.value) {
            return null;
        }

        // Now item.value is known to be defined, attempt conversion
        const value: unknown = item.value; // Use unknown for safety before checks
        if (value instanceof Uint8Array) {
            return value;
        } else if (value instanceof ArrayBuffer) {
            return new Uint8Array(value);
        } else if (Array.isArray(value)) {
            // Attempt conversion from number array
            try {
                return new Uint8Array(value);
            } catch (e) {
                console.error('Failed to convert array to Uint8Array:', e);
                return null;
            }
        } else {
            console.warn(`Unexpected type for item.value for key ${key}: ${typeof value}`);
            // Try generic conversion as a last resort if appropriate for your data types
            // return new Uint8Array(value as unknown as ArrayBufferLike);
            return null;
        }
    }

    async put(key: string, value: Uint8Array, metadata: Record<string, unknown> = {}): Promise<void> {
        const tx = await this.ensureTx();
        const now = new Date().toISOString();

        const item: StorageItem = {
            key,
            value,
            metadata,
            createdAt: now
        };

        await tx.objectStore(this.storeName).put(item);
    }

    async delete(key: string): Promise<boolean> {
        const tx = await this.ensureTx();

        // Check if item exists
        const exists = await tx.objectStore(this.storeName).get(key);
        if (!exists) {
            return false;
        }

        await tx.objectStore(this.storeName).delete(key);
        return true;
    }

    async complete(): Promise<void> {
        // Mark transaction as completed
        this.completed = true;
        this.tx = null;
    }

    abort(): void {
        // Mark transaction as aborted
        this.aborted = true;
        this.tx = null;
    }
}

// Default store names
export const CONTENT_STORE = 'content';
export const DOCS_STORE = 'docs';

// Storage singleton instances
let contentStorage: IndexedDBAdapter | null = null;
let docsStorage: IndexedDBAdapter | null = null;

/**
 * Get the content storage adapter
 * @returns A storage adapter for content data
 */
export function getContentStorage(): StorageAdapter {
    if (!contentStorage) {
        contentStorage = new IndexedDBAdapter(CONTENT_STORE);
    }
    return contentStorage;
}

/**
 * Get the docs storage adapter
 * @returns A storage adapter for document metadata
 */
export function getDocsStorage(): StorageAdapter {
    if (!docsStorage) {
        docsStorage = new IndexedDBAdapter(DOCS_STORE);
    }
    return docsStorage;
}

/**
 * Initialize all storage
 * Call this at app startup
 */
export async function initStorage(): Promise<void> {
    if (browser) {
        const contentStore = getContentStorage();
        const docsStore = getDocsStorage();

        await Promise.all([
            contentStore.init(),
            docsStore.init()
        ]);

        console.log('All storage initialized successfully');
    }
}

/**
 * Close all storage connections
 * Call this before app shutdown
 */
export function closeStorage(): void {
    if (contentStorage) {
        contentStorage.close();
        contentStorage = null;
    }

    if (docsStorage) {
        docsStorage.close();
        docsStorage = null;
    }
} 