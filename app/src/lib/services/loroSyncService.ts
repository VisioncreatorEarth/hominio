import type { LoroDoc } from 'loro-crdt';

// Define sync status types
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// Define event types
export type SyncEvent = {
    type: 'status-change' | 'sync-complete' | 'updates-received';
    status?: SyncStatus;
    timestamp: number;
    details?: Record<string, unknown>;
};

// Define event listener type
export type SyncEventListener = (event: SyncEvent) => void;

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
    private longPollActive: boolean = false;
    private abortController: AbortController | null = null;
    private eventListeners: SyncEventListener[] = [];
    private currentStatus: SyncStatus = 'idle';

    // Store timeout ID for status reset
    private _statusResetTimeout: number | undefined = undefined;

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
     * Add an event listener for sync events
     */
    public addEventListener(listener: SyncEventListener): void {
        this.eventListeners.push(listener);
    }

    /**
     * Remove an event listener
     */
    public removeEventListener(listener: SyncEventListener): void {
        this.eventListeners = this.eventListeners.filter(l => l !== listener);
    }

    /**
     * Emit an event to all listeners
     */
    private emitEvent(event: SyncEvent): void {
        for (const listener of this.eventListeners) {
            listener(event);
        }
    }

    /**
     * Update the current sync status and emit an event
     */
    private updateStatus(status: SyncStatus, details?: Record<string, unknown>): void {
        // Prevent rapid status changes (debounce)
        // Don't change from success to idle too quickly
        if (this.currentStatus === 'success' && status === 'idle') {
            return;
        }

        // Don't change from success to syncing immediately
        if (this.currentStatus === 'success' && status === 'syncing') {
            // Clear any pending timeout for resetting to idle
            if (this._statusResetTimeout) {
                clearTimeout(this._statusResetTimeout);
                this._statusResetTimeout = undefined;
            }
        }

        this.currentStatus = status;
        this.emitEvent({
            type: 'status-change',
            status,
            timestamp: Date.now(),
            details
        });
    }

    /**
     * Get the current sync status
     */
    public getStatus(): SyncStatus {
        return this.currentStatus;
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

        // Start long polling for updates
        this.startLongPolling();

        // Also set a backup interval for regular syncs
        // This ensures we still sync even if long polling fails
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
        }

        // Stop long polling
        this.stopLongPolling();

        console.log(`Stopped Loro sync for document ${this.docId}`);
        this.updateStatus('idle');
    }

    /**
     * Start long polling for updates
     */
    private startLongPolling(): void {
        if (this.longPollActive) return;

        this.longPollActive = true;
        this.abortController = new AbortController();

        // Start the long polling loop
        this.longPollLoop();
    }

    /**
     * Stop long polling
     */
    private stopLongPolling(): void {
        this.longPollActive = false;

        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    /**
     * Long polling loop to receive real-time updates
     */
    private async longPollLoop(): Promise<void> {
        if (!this.longPollActive) return;

        try {
            // Create a new abort controller for this request
            this.abortController = new AbortController();

            // Build the URL with query parameters
            const url = `/api/sync?docId=${encodeURIComponent(this.docId)}&clientId=${encodeURIComponent(this.clientId)}&lastSync=${this.lastSyncTime}&longPoll=true`;

            // Make the long polling request
            const response = await fetch(url, {
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Long polling failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Update last sync time
            this.lastSyncTime = data.timestamp;

            // If updates are available, sync now
            if (data.type === 'updates-available') {
                console.log('Long polling detected updates, syncing now');
                this.emitEvent({
                    type: 'updates-received',
                    timestamp: Date.now(),
                    details: { source: 'long-poll' }
                });
                await this.syncWithServer();
            }

            // Continue the long polling loop if still active
            if (this.longPollActive) {
                this.longPollLoop();
            }
        } catch (error) {
            // If aborted, this is expected behavior when stopping
            if (error instanceof DOMException && error.name === 'AbortError') {
                console.log('Long polling aborted');
                return;
            }

            console.error('Error in long polling:', error);
            this.updateStatus('error', { source: 'long-poll', error });

            // Wait a bit before retrying to avoid hammering the server
            setTimeout(() => {
                if (this.longPollActive) {
                    this.longPollLoop();
                }
            }, 2000);
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
            this.updateStatus('error', { source: 'register', error });
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
        this.updateStatus('syncing');

        try {
            // 1. Get updates from server
            await this.pullUpdates();

            // 2. Send our updates to server
            await this.pushUpdates();

            // Update status to success
            this.updateStatus('success');

            // Emit sync complete event
            this.emitEvent({
                type: 'sync-complete',
                timestamp: Date.now()
            });

            // Reset status to idle after a longer delay (5 seconds)
            if (this._statusResetTimeout) {
                clearTimeout(this._statusResetTimeout);
            }

            this._statusResetTimeout = setTimeout(() => {
                if (this.currentStatus === 'success') {
                    this.updateStatus('idle');
                }
                this._statusResetTimeout = undefined;
            }, 5000);
        } catch (error) {
            console.error('Error during sync:', error);
            this.updateStatus('error', { error });

            // Reset status to idle after a short delay
            if (this._statusResetTimeout) {
                clearTimeout(this._statusResetTimeout);
            }

            this._statusResetTimeout = setTimeout(() => {
                if (this.currentStatus === 'error') {
                    this.updateStatus('idle');
                }
                this._statusResetTimeout = undefined;
            }, 3000);
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
            throw error; // Re-throw to be handled by syncWithServer
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

            // Emit event for received updates - force immediate UI update
            this.emitEvent({
                type: 'updates-received',
                timestamp: Date.now(),
                details: {
                    updateId,
                    clientId: updateData.clientId,
                    forceUpdate: true
                }
            });
        } catch (error) {
            console.error(`Error applying update ${updateId}:`, error);
            throw error;
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
            throw error;
        }
    }

    /**
     * Get the client ID for this sync instance
     */
    public getClientId(): string {
        return this.clientId;
    }

    /**
     * Get the last sync time
     */
    public getLastSyncTime(): number {
        return this.lastSyncTime;
    }
}

// Create and export a factory function for easier instantiation
export function createLoroSyncService(docId: string, loroDoc: LoroDoc, options = {}): LoroSyncService {
    return new LoroSyncService(docId, loroDoc, options);
} 