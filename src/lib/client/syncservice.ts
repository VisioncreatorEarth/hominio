import type { LoroDoc, VersionVector } from 'loro-crdt';
import { hominio } from './hominio';

// Interface for the snapshot data we'll send to the server
interface SnapshotData {
    docId: string;
    docType: string;
    binaryData: string; // Base64 encoded binary data
    versionVector?: VersionVector;
    timestamp: number;
    meta?: Record<string, unknown>;
    clientId?: string;
}

// Interface for update data we'll send to the server
interface UpdateData {
    docId: string;
    binaryData: string; // Base64 encoded binary data
    fromVersion: VersionVector;
    toVersion: VersionVector;
    timestamp: number;
    clientId?: string;
}

/**
 * Convert Uint8Array to base64 string for safe transport
 */
function arrayBufferToBase64(buffer: Uint8Array): string {
    // Use the browser's built-in btoa function with a workaround for Uint8Array
    const binary = Array.from(new Uint8Array(buffer))
        .map(byte => String.fromCharCode(byte))
        .join('');
    return btoa(binary);
}

/**
 * Send a snapshot to the server
 * 
 * @param docId The document ID (UUID)
 * @param loroDoc The Loro document
 * @param docType The document type
 * @param meta Optional metadata
 * @returns Promise<boolean> True if the snapshot was successfully synced
 */
export async function syncSnapshot(
    docId: string,
    loroDoc: LoroDoc,
    docType: string = 'default',
    meta: Record<string, unknown> = {}
): Promise<boolean> {
    try {
        console.log(`Syncing snapshot for ${docId} to server...`);

        // Create the binary snapshot
        const binaryData = loroDoc.export({ mode: 'snapshot' });

        // Convert binary data to base64 string for safer transport
        const base64Data = arrayBufferToBase64(binaryData);

        // Get the version vector
        const versionVector = loroDoc.version();

        // Create snapshot payload
        const snapshotData: SnapshotData = {
            docId,
            docType,
            binaryData: base64Data,
            versionVector,
            timestamp: Date.now(),
            meta,
            clientId: window.__CLIENT_ID // We'll get this from global context if available
        };

        // Call the snapshots endpoint with the new route (without .index)
        // @ts-expect-error - Eden type mismatch but this works
        const response = await hominio.agent.resources.docs.snapshots.post(snapshotData);

        console.log('Snapshot sync response:', response);
        return response.data && response.data.status === 'success';
    } catch (error) {
        console.error('Error syncing snapshot to server:', error);
        return false;
    }
}

/**
 * Send an incremental update to the server
 * 
 * @param docId The document ID (UUID)
 * @param loroDoc The Loro document
 * @param fromVersion The previous version vector
 * @returns Promise<boolean> True if the update was successfully synced
 */
export async function syncUpdate(
    docId: string,
    loroDoc: LoroDoc,
    fromVersion: VersionVector
): Promise<boolean> {
    try {
        console.log(`Syncing update for ${docId} to server...`);

        // Get current version
        const toVersion = loroDoc.version();

        // Get the binary update
        const binaryData = loroDoc.exportFrom(fromVersion);

        // Convert binary data to base64 string for safer transport
        const base64Data = arrayBufferToBase64(binaryData);

        // Create update payload
        const updateData: UpdateData = {
            docId,
            binaryData: base64Data,
            fromVersion,
            toVersion,
            timestamp: Date.now(),
            clientId: window.__CLIENT_ID
        };

        // Call the update endpoint with the new route (without .index)
        // @ts-expect-error - Eden type mismatch but this works
        const response = await hominio.agent.resources.docs.snapshots.updates.post(updateData);

        console.log('Update sync response:', response);
        return response.data && response.data.status === 'success';
    } catch (error) {
        console.error('Error syncing update to server:', error);
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