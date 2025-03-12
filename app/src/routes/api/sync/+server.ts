import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

// Interface for update metadata (without the actual update data)
interface UpdateMetadata {
    clientId: string;
    timestamp: number;
    updateId: string;
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
    clients: Set<string>
}> = new Map();

// Register or get document info
export const GET: RequestHandler = async ({ url }) => {
    const docId = url.searchParams.get('docId');
    const clientId = url.searchParams.get('clientId');

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
            clients: new Set()
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

    // Get updates since last sync
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
                clients: new Set([clientId])
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
        updateStore.get(docId)!.push({
            clientId,
            timestamp: Date.now(),
            updates: updatesArray,
            updateId
        });

        // Trim update store to prevent unbounded growth
        // In production, you'd use a more sophisticated retention policy
        if (updateStore.get(docId)!.length > 100) {
            updateStore.get(docId)!.splice(0, updateStore.get(docId)!.length - 100);
        }

        return json({
            success: true,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Error processing sync update:', error);
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
    } catch (error) {
        console.error('Error fetching specific update:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch update' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}; 