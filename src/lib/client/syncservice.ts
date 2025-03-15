import type { LoroDoc } from 'loro-crdt';
import { hominio } from './hominio';

// Interface for the snapshot data we'll send to the server
interface SnapshotData {
    docId: string;
    docType: string;
    timestamp: number;
    meta?: Record<string, unknown>;
    clientId?: string;
}

/**
 * Send a snapshot to the server
 * 
 * @param docId The document ID
 * @param loroDoc The Loro document
 * @param docType The document type
 * @param meta Optional metadata
 */
export async function syncSnapshot(
    docId: string,
    loroDoc: LoroDoc,
    docType: string = 'default',
    meta: Record<string, unknown> = {}
): Promise<boolean> {
    try {
        console.log(`Syncing snapshot for ${docId} to server...`);

        // Create snapshot payload
        const snapshotData: SnapshotData = {
            docId,
            docType,
            timestamp: Date.now(),
            meta,
            clientId: window.__CLIENT_ID // We'll get this from global context if available
        };

        // The Eden client types don't fully match our endpoint structure
        // This is expected since the endpoint was just created
        // @ts-expect-error - The Eden client doesn't know about our new endpoint yet
        const response = await hominio.agent.resources.docs.snapshots.post(snapshotData);

        console.log('Snapshot sync response:', response);
        return response.status === 200;
    } catch (error) {
        console.error('Error syncing snapshot to server:', error);
        return false;
    }
}

/**
 * Send pending snapshots to the server
 * Future implementation might batch multiple snapshots
 */
export async function syncPendingSnapshots(): Promise<boolean> {
    // This is a placeholder for future implementation
    // In a more complete solution, we could:
    // 1. Check for snapshots that failed to sync
    // 2. Retry sending them
    // 3. Implement a queue system
    return true;
}

// Type for the storage system that has snapshot hooks
interface SnapshotHookSupport {
    onSnapshotSaved: (
        callback: (
            docId: string,
            loroDoc: LoroDoc,
            docType: string,
            meta: Record<string, unknown>
        ) => void
    ) => void;
}

/**
 * Register the snapshot hook with the storage system
 * This will be called by the storage system when it's initialized
 */
export function registerSnapshotHook(storage: unknown): void {
    const storageWithHooks = storage as SnapshotHookSupport;

    if (storageWithHooks && typeof storageWithHooks.onSnapshotSaved === 'function') {
        storageWithHooks.onSnapshotSaved(
            (docId: string, loroDoc: LoroDoc, docType: string, meta: Record<string, unknown>) => {
                syncSnapshot(docId, loroDoc, docType, meta)
                    .catch(err => console.error('Error in snapshot hook:', err));
            }
        );
        console.log('Snapshot hook registered with storage system');
    } else {
        console.warn('Could not register snapshot hook - storage system not compatible');
    }
}

// Add a global variable for the client ID
declare global {
    interface Window {
        __CLIENT_ID?: string;
    }
} 