import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// Interface for update metadata (without the actual update data)
interface UpdateMetadata {
    clientId: string;
    timestamp: number;
    updateId: string;
}

// Interface for poll response
interface PollResponse {
    type: 'updates-available' | 'no-updates';
    docId: string;
    timestamp: number;
}

// In-memory store for sync data (would use a database in production)
// Maps document IDs to their updates
const updateStore: Map<string, Array<{
    clientId: string,
    timestamp: number,
    updates: Uint8Array,
    updateId: string
}>> = new Map();

// Map of registered documents
const documents: Map<string, {
    lastActivity: number,
    clients: Set<string>,
    lastPollTime: number
}> = new Map();

// Map to track long-polling connections
const longPolls: Map<string, {
    resolver: (value: PollResponse) => void,
    timeout: ReturnType<typeof setTimeout>
}> = new Map();

// Poll interval in milliseconds
const POLL_INTERVAL = 1000; // Set to exactly 1 second as originally intended

// Minimum time between notifications for the same client (rate limiting)
const MIN_NOTIFICATION_INTERVAL = 1000; // 1 second minimum between notifications

// Track last notification time for each client
const lastNotificationTime: Map<string, number> = new Map();

// Function to notify clients of updates
function notifyClientsOfUpdates(docId: string, excludeClientId?: string) {
    const currentTime = Date.now();

    // Get all long-polling connections for this document
    for (const [key, poll] of longPolls.entries()) {
        // Check if this poll is for the current document
        if (key.startsWith(`${docId}:`)) {
            const clientId = key.split(':')[1];

            // Don't notify the client that sent the update
            if (excludeClientId && clientId === excludeClientId) {
                continue;
            }

            // Resolve the long-polling promise to send updates to the client
            poll.resolver({
                type: 'updates-available',
                docId,
                timestamp: currentTime
            });

            // Clear the timeout since we're resolving manually
            clearTimeout(poll.timeout);

            // Remove this poll from the map
            longPolls.delete(key);
        }
    }
}

// Register or get document info
export const GET: RequestHandler = async ({ url }) => {
    const docId = url.searchParams.get('docId');
    const clientId = url.searchParams.get('clientId');
    const longPoll = url.searchParams.get('longPoll') === 'true';

    if (!docId || !clientId) {
        return new Response(JSON.stringify({ error: 'Missing docId or clientId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get or create document tracking info
    if (!documents.has(docId)) {
        documents.set(docId, {
            lastActivity: Date.now(),
            clients: new Set(),
            lastPollTime: Date.now()
        });

        // Initialize update store for this document
        if (!updateStore.has(docId)) {
            updateStore.set(docId, []);
        }
    }

    // Register client
    const docInfo = documents.get(docId)!;
    docInfo.clients.add(clientId);
    docInfo.lastActivity = Date.now();

    // Handle long polling request
    if (longPoll) {
        const lastSync = url.searchParams.get('lastSync');
        const lastSyncTime = lastSync ? parseInt(lastSync) : 0;
        const currentTime = Date.now();
        const pollKey = `${docId}:${clientId}`;

        // Check if this client was recently notified (rate limiting)
        const clientKey = `${docId}:${clientId}`;
        const lastNotifyTime = lastNotificationTime.get(clientKey) || 0;
        const timeSinceLastNotify = currentTime - lastNotifyTime;

        if (timeSinceLastNotify < MIN_NOTIFICATION_INTERVAL) {
            // If we recently notified this client, just return no-updates
            // This prevents creating a long poll that would be immediately resolved
            return json({
                type: 'no-updates',
                docId,
                timestamp: currentTime,
                rateLimit: true
            });
        }

        // Check if there are already updates available
        let hasUpdates = false;
        if (updateStore.has(docId)) {
            hasUpdates = updateStore.get(docId)!.some(
                update => update.timestamp > lastSyncTime && update.clientId !== clientId
            );
        }

        // If updates are already available, return them immediately
        if (hasUpdates) {
            // Update last notification time
            lastNotificationTime.set(clientKey, currentTime);

            return json({
                type: 'updates-available',
                docId,
                timestamp: currentTime
            });
        }

        // Otherwise, set up long polling
        // Create a promise that will resolve when updates are available
        // or after the timeout period
        const pollPromise = new Promise<PollResponse>(resolve => {
            // Set up a timeout to resolve the promise after the poll interval
            const timeout = setTimeout(() => {
                // If the poll is still in the map, resolve it with a no-updates response
                if (longPolls.has(pollKey)) {
                    resolve({
                        type: 'no-updates',
                        docId,
                        timestamp: Date.now()
                    });
                    longPolls.delete(pollKey);
                }
            }, POLL_INTERVAL);

            // Store the resolver and timeout in the map
            longPolls.set(pollKey, {
                resolver: resolve,
                timeout
            });
        });

        // Wait for the poll to resolve
        const result = await pollPromise;

        // If this was an updates-available response, update the last notification time
        if (result.type === 'updates-available') {
            lastNotificationTime.set(clientKey, Date.now());
        }

        return json(result);
    }

    // Regular (non-polling) request - get updates since last sync
    const lastSync = url.searchParams.get('lastSync');
    const lastSyncTime = lastSync ? parseInt(lastSync) : 0;

    let updates: UpdateMetadata[] = [];
    if (updateStore.has(docId)) {
        updates = updateStore.get(docId)!
            .filter(update => update.timestamp > lastSyncTime && update.clientId !== clientId)
            .map(({ clientId, timestamp, updateId }) => ({ clientId, timestamp, updateId }));
    }

    return json({
        docId,
        clients: Array.from(docInfo.clients),
        updates,
        lastActivity: docInfo.lastActivity,
        serverTime: Date.now()
    });
};

// Upload updates
export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { docId, clientId, updates, updateId } = body;

        if (!docId || !clientId || !updates || !updateId) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Register document if not exists
        if (!documents.has(docId)) {
            documents.set(docId, {
                lastActivity: Date.now(),
                clients: new Set([clientId]),
                lastPollTime: Date.now()
            });
        }

        // Update document activity and clients
        const docInfo = documents.get(docId)!;
        docInfo.clients.add(clientId);
        docInfo.lastActivity = Date.now();

        // Initialize update store for this document if needed
        if (!updateStore.has(docId)) {
            updateStore.set(docId, []);
        }

        // Convert updates array back to Uint8Array
        const updatesArray = new Uint8Array(updates);

        // Store the update
        const timestamp = Date.now();
        updateStore.get(docId)!.push({
            clientId,
            timestamp,
            updates: updatesArray,
            updateId
        });

        // Trim update store to prevent unbounded growth
        // In production, you'd use a more sophisticated retention policy
        if (updateStore.get(docId)!.length > 100) {
            updateStore.get(docId)!.splice(0, updateStore.get(docId)!.length - 100);
        }

        // Notify other clients immediately that updates are available
        // This is critical for real-time responsiveness
        notifyClientsOfUpdates(docId, clientId);

        return json({
            success: true,
            timestamp
        });
    } catch {
        return new Response(JSON.stringify({ error: 'Failed to process update' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

// Get specific update by ID
export const PUT: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { docId, updateId } = body;

        if (!docId || !updateId) {
            return new Response(JSON.stringify({ error: 'Missing docId or updateId' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Find the specific update
        if (updateStore.has(docId)) {
            const update = updateStore.get(docId)!.find(u => u.updateId === updateId);

            if (update) {
                return new Response(JSON.stringify({
                    docId,
                    updateId,
                    updates: Array.from(update.updates),
                    timestamp: update.timestamp,
                    clientId: update.clientId
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response(JSON.stringify({ error: 'Update not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch {
        return new Response(JSON.stringify({ error: 'Failed to fetch update' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}; 