import type { LoroDoc } from 'loro-crdt';

/**
 * LoroSyncService - Client-side service for synchronizing Loro documents
 * across different clients (web app, Tauri app, etc.) via a central server
 */
export class LoroSyncService {
    private clientId: string;
    private syncInterval: number | null = null;
    private lastSyncTime: number = 0;
    private isSyncing: boolean = false;
    private docId: string;
    private loroDoc: LoroDoc;
    private syncIntervalTime: number;

    /**
     * Create a new LoroSyncService
     * @param docId Unique identifier for the document to sync
     * @param loroDoc The Loro document instance to sync
     * @param options Configuration options
     */
    constructor(docId: string, loroDoc: LoroDoc, options: {
        clientId?: string,
        syncIntervalMs?: number,
        autoStart?: boolean
    } = {}) {
        this.docId = docId;
        this.loroDoc = loroDoc;
        this.clientId = options.clientId || crypto.randomUUID();
        this.syncIntervalTime = options.syncIntervalMs || 5000; // Default: sync every 5 seconds

        if (options.autoStart) {
            this.startSync();
        }
    }

    /**
     * Start the automatic synchronization
     */
    public startSync(): void {
        if (this.syncInterval) {
            this.stopSync(); // Stop any existing interval
        }

        // Register with the server
        this.registerWithServer();

        // Start the sync interval
        this.syncInterval = window.setInterval(() => {
            this.syncWithServer();
        }, this.syncIntervalTime);

        console.log(`Started Loro sync for document ${this.docId} with client ${this.clientId}`);
    }

    /**
     * Stop the automatic synchronization
     */
    public stopSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log(`Stopped Loro sync for document ${this.docId}`);
        }
    }

    /**
     * Register this client with the server
     */
    private async registerWithServer(): Promise<void> {
        try {
            const url = `/api/sync?docId=${encodeURIComponent(this.docId)}&clientId=${encodeURIComponent(this.clientId)}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to register: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`Registered with sync server: ${this.docId}`, data);

            // Start from current server time
            this.lastSyncTime = data.serverTime;
        } catch (error) {
            console.error('Error registering with sync server:', error);
        }
    }

    /**
     * Manually trigger a sync with the server
     */
    public async syncWithServer(): Promise<void> {
        if (this.isSyncing) {
            return; // Prevent concurrent syncs
        }

        this.isSyncing = true;

        try {
            // 1. Get updates from server
            await this.pullUpdates();

            // 2. Send our updates to server
            await this.pushUpdates();
        } catch (error) {
            console.error('Error during sync:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Pull updates from the server and apply them
     */
    private async pullUpdates(): Promise<void> {
        try {
            // Get available updates since last sync
            const url = `/api/sync?docId=${encodeURIComponent(this.docId)}&clientId=${encodeURIComponent(this.clientId)}&lastSync=${this.lastSyncTime}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to pull updates: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Update last sync time
            this.lastSyncTime = data.serverTime;

            // No updates available
            if (!data.updates || data.updates.length === 0) {
                return;
            }

            console.log(`Found ${data.updates.length} updates to pull`);

            // Fetch and apply each update
            for (const updateInfo of data.updates) {
                await this.fetchAndApplyUpdate(updateInfo.updateId);
            }
        } catch (error) {
            console.error('Error pulling updates:', error);
        }
    }

    /**
     * Fetch a specific update by ID and apply it
     */
    private async fetchAndApplyUpdate(updateId: string): Promise<void> {
        try {
            // Request the specific update
            const response = await fetch('/api/sync', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    docId: this.docId,
                    updateId
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch update: ${response.status} ${response.statusText}`);
            }

            const updateData = await response.json();

            if (!updateData.updates) {
                throw new Error('Update data missing');
            }

            // Convert updates array back to Uint8Array
            const updatesArray = new Uint8Array(updateData.updates);

            // Apply the update to our local Loro doc
            this.loroDoc.import(updatesArray);
            console.log(`Applied update ${updateId} from client ${updateData.clientId}`);
        } catch (error) {
            console.error(`Error applying update ${updateId}:`, error);
        }
    }

    /**
     * Push local updates to the server
     */
    private async pushUpdates(): Promise<void> {
        try {
            // Export updates
            const updates = this.loroDoc.export({ mode: 'update' });

            // Skip if no updates
            if (updates.length === 0) {
                return;
            }

            // Generate unique update ID
            const updateId = crypto.randomUUID();

            // Send to server
            const response = await fetch('/api/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    docId: this.docId,
                    clientId: this.clientId,
                    updates: Array.from(updates),
                    updateId
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to push updates: ${response.status} ${response.statusText}`);
            }

            console.log(`Pushed updates to server with ID ${updateId}`);
        } catch (error) {
            console.error('Error pushing updates:', error);
        }
    }

    /**
     * Get the client ID for this sync instance
     */
    public getClientId(): string {
        return this.clientId;
    }
}

// Create and export a factory function for easier instantiation
export function createLoroSyncService(docId: string, loroDoc: LoroDoc, options = {}): LoroSyncService {
    return new LoroSyncService(docId, loroDoc, options);
} 