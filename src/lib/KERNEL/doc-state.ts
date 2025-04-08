import { LoroDoc } from 'loro-crdt';
import { writable, type Readable } from 'svelte/store';

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
            this.store.set(this.loroDoc.toJSON() as T);
        });

        // Initial state
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

            // The store update will happen via the subscription
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
            // Store will update automatically via subscription
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
