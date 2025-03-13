import type { LoroDoc } from 'loro-crdt';
import { generateUUID } from '$lib/utils/uuid';

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
    private retryCount: number = 0;
    private maxRetries: number = 3;
    private lastSuccessfulSync: number = 0;
    private syncPromise: Promise<void> | null = null;
    private pendingUpdates: boolean = false;

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
        this.clientId = options.clientId || generateUUID();
        this.syncIntervalTime = options.syncIntervalMs || 1000; // Default: sync every 1 second (more frequent)

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
            try {
                listener(event);
            } catch (error) {
                console.error('Error in sync event listener:', error);
            }
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
            // Check if we haven't synced successfully in a while (3x the interval)
            const timeSinceLastSync = Date.now() - this.lastSuccessfulSync;
            if (timeSinceLastSync > this.syncIntervalTime * 3) {
                // Force a sync if it's been too long
                this.forceSyncWithServer();
            } else {
                this.syncWithServer();
            }
        }, this.syncIntervalTime);
    }

    /**
     * Force a sync even if one is in progress
     */
    private forceSyncWithServer(): void {
        // Reset the syncing flag to force a new sync
        this.isSyncing = false;
        this.syncWithServer();
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

        const pollStartTime = Date.now();

        try {
            // Create a new abort controller for this request
            this.abortController = new AbortController();

            // Build the URL with query parameters
            const url = `/api/sync?docId=${encodeURIComponent(this.docId)}&clientId=${encodeURIComponent(this.clientId)}&lastSync=${this.lastSyncTime}&longPoll=true`;

            // Make the long polling request
            const response = await fetch(url, {
                signal: this.abortController.signal,
                // Add cache control to prevent caching of long poll requests
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });

            if (!response.ok) {
                throw new Error(`Long polling failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Update last sync time
            this.lastSyncTime = data.timestamp;

            // If updates are available, sync now
            if (data.type === 'updates-available') {
                this.pendingUpdates = true;

                // Emit event immediately to update UI
                this.emitEvent({
                    type: 'updates-received',
                    timestamp: Date.now(),
                    details: { source: 'long-poll', forceUpdate: true }
                });

                // Sync with server with high priority
                await this.syncWithServer(true);
            }

            // Reset retry count on successful poll
            this.retryCount = 0;

            // Continue the long polling loop if still active
            if (this.longPollActive) {
                // Calculate how long to wait before the next poll
                // If we got a rate limit response, wait the full interval
                const waitTime = data.rateLimit
                    ? 1000 // Wait full second if rate limited
                    : Math.max(0, 1000 - (Date.now() - pollStartTime)); // Otherwise ensure at least 1 second between polls

                if (waitTime > 0) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

                // Start the next poll
                this.longPollLoop();
            }
        } catch (error) {
            // If aborted, this is expected behavior when stopping
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }

            this.updateStatus('error', { source: 'long-poll', error });

            // Increment retry count
            this.retryCount++;

            // Exponential backoff for retries, but with a shorter initial delay
            const backoffTime = Math.min(1000 * Math.pow(1.5, this.retryCount - 1), 10000);

            // Wait a bit before retrying to avoid hammering the server
            setTimeout(() => {
                if (this.longPollActive) {
                    this.longPollLoop();
                }
            }, backoffTime);
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

            // Start from current server time
            this.lastSyncTime = data.serverTime;
            this.lastSuccessfulSync = Date.now();
        } catch (error) {
            this.updateStatus('error', { source: 'register', error });

            // Retry registration after a delay
            setTimeout(() => {
                if (this.syncInterval) {  // Only retry if we're still supposed to be syncing
                    this.registerWithServer();
                }
            }, 5000);
        }
    }

    /**
     * Manually trigger a sync with the server
     */
    public async syncWithServer(highPriority: boolean = false): Promise<void> {
        // If already syncing and not high priority, wait for the current sync to complete
        if (this.isSyncing && !highPriority) {
            if (this.syncPromise) {
                return this.syncPromise;
            }
            return;
        }

        // If high priority, cancel any existing sync
        if (highPriority && this.isSyncing) {
            this.isSyncing = false;
        }

        this.isSyncing = true;
        this.updateStatus('syncing');

        // Create a promise that we can return to callers
        this.syncPromise = this._doSync(highPriority);

        try {
            await this.syncPromise;
        } finally {
            this.syncPromise = null;
        }

        return;
    }

    /**
     * Internal sync implementation
     */
    private async _doSync(highPriority: boolean = false): Promise<void> {
        const syncStartTime = Date.now();

        try {
            // 1. Get updates from server
            await this.pullUpdates();

            // 2. Send our updates to server
            await this.pushUpdates();

            // Update status to success
            this.updateStatus('success');

            // Record successful sync time
            this.lastSuccessfulSync = Date.now();
            this.pendingUpdates = false;

            // Emit sync complete event
            this.emitEvent({
                type: 'sync-complete',
                timestamp: Date.now(),
                details: {
                    syncDuration: Date.now() - syncStartTime,
                    highPriority
                }
            });

            // Reset status to idle after a delay (shorter for high priority syncs)
            if (this._statusResetTimeout) {
                clearTimeout(this._statusResetTimeout);
            }

            this._statusResetTimeout = setTimeout(() => {
                if (this.currentStatus === 'success') {
                    this.updateStatus('idle');
                }
                this._statusResetTimeout = undefined;
            }, highPriority ? 1000 : 3000);
        } catch (error) {
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
            }, 2000);

            // If we have pending updates, retry after a shorter delay
            if (this.pendingUpdates) {
                setTimeout(() => {
                    if (this.pendingUpdates) {
                        this.forceSyncWithServer();
                    }
                }, highPriority ? 500 : 1500);
            }
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Pull updates from the server and apply them
     */
    private async pullUpdates(): Promise<void> {
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

        // Fetch and apply each update
        for (const updateInfo of data.updates) {
            await this.fetchAndApplyUpdate(updateInfo.updateId);
        }
    }

    /**
     * Fetch a specific update by ID and apply it
     */
    private async fetchAndApplyUpdate(updateId: string): Promise<void> {
        // Request the specific update
        const response = await fetch('/api/sync', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
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

        // Emit event for received updates - force immediate UI update
        this.emitEvent({
            type: 'updates-received',
            timestamp: Date.now(),
            details: {
                updateId,
                clientId: updateData.clientId,
                forceUpdate: true,
                immediate: true
            }
        });
    }

    /**
     * Push local updates to the server
     */
    private async pushUpdates(): Promise<void> {
        // Export updates
        const updates = this.loroDoc.export({ mode: 'update' });

        // Skip if no updates
        if (updates.length === 0) {
            return;
        }

        // Generate unique update ID
        const updateId = generateUUID();

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

        await response.json();
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

    /**
     * Check if there are pending updates
     */
    public hasPendingUpdates(): boolean {
        return this.pendingUpdates;
    }
}

// Create and export a factory function for easier instantiation
export function createLoroSyncService(docId: string, loroDoc: LoroDoc, options = {}): LoroSyncService {
    return new LoroSyncService(docId, loroDoc, options);
} 