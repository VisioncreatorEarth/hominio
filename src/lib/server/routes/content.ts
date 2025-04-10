import { Elysia } from 'elysia';
import { db } from '$db';
import { content } from '$db/schema';
import { eq, inArray } from 'drizzle-orm';
import { hashService } from '$lib/KERNEL/hash-service';

// Types
interface AuthContext {
    session: {
        user: {
            id: string;
            [key: string]: unknown;
        }
    },
    body?: unknown,
    set?: {
        status?: number;
    },
    params?: unknown,
    query?: unknown
}

// Define type for content response
type ContentResponse = {
    cid: string;
    type: string;
    metadata: Record<string, unknown>;
    hasBinaryData: boolean;
    contentLength: number;
    verified: boolean;
    createdAt: string;
    binaryData?: number[];
};

// Content-related helper functions
async function getContentByCid(cid: string): Promise<ContentResponse | null> {
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));

        if (!contentItem.length) {
            return null;
        }

        const item = contentItem[0];

        // Get binary data and metadata
        const binaryData = item.data as Buffer;
        const metadata = item.metadata as Record<string, unknown> || {};

        // Verify content integrity
        let verified = false;

        if (binaryData && binaryData.length > 0) {
            try {
                // Verify hash matches CID using binary data directly
                verified = await hashService.verifySnapshot(binaryData, cid);
            } catch (err) {
                console.error('Error verifying content hash:', err);
            }
        }

        // Return content with verification status
        return {
            cid: item.cid,
            type: item.type,
            metadata,
            hasBinaryData: binaryData.length > 0,
            contentLength: binaryData.length,
            verified,
            createdAt: item.createdAt.toISOString()
        };
    } catch (error) {
        console.error('Error retrieving content:', error);
        return null;
    }
}

// Function to get raw binary data by CID
async function getBinaryContentByCid(cid: string): Promise<Buffer | null> {
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));

        if (!contentItem.length) {
            return null;
        }

        // Return raw binary data
        return contentItem[0].data as Buffer;
    } catch (error) {
        console.error('Error retrieving binary content:', error);
        return null;
    }
}

// Create content handlers without prefix
export const contentHandlers = new Elysia()
    // List all content
    .get('/list', async () => {
        // Get all content items
        return await db.select().from(content);
    })
    // Get specific content by CID
    .get('/:cid', async ({ params, set }: AuthContext) => {
        try {
            const cid = (params as { cid: string }).cid;
            const contentData = await getContentByCid(cid);

            if (!contentData) {
                if (set) set.status = 404;
                return { error: 'Content not found' };
            }

            return contentData;
        } catch (error) {
            console.error('Error retrieving content:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to retrieve content',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });

// Batch operations for efficient sync
contentHandlers.group('/batch', app => app
    // Check existence of multiple CIDs at once
    .post('/exists', async ({ body, set }: AuthContext) => {
        try {
            const { cids } = body as { cids: string[] };

            if (!Array.isArray(cids) || cids.length === 0) {
                if (set) set.status = 400;
                return { error: 'Invalid request. Array of CIDs required.' };
            }

            // Get unique cids only
            const uniqueCids = [...new Set(cids)];

            // Find which content items exist
            const existingItems = await db
                .select({ cid: content.cid })
                .from(content)
                .where(inArray(content.cid, uniqueCids));

            // Create a map of which CIDs exist
            const existingCids = new Set(existingItems.map(item => item.cid));
            const results = uniqueCids.map(cid => ({
                cid,
                exists: existingCids.has(cid)
            }));

            return { results };
        } catch (error) {
            console.error('Error checking batch existence:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to check content existence',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    // Upload multiple content items at once
    .post('/upload', async ({ body, set }: AuthContext) => {
        try {
            const { items } = body as {
                items: Array<{
                    cid: string,
                    type: 'snapshot' | 'update',
                    binaryData: number[],
                    metadata?: Record<string, unknown>
                }>
            };

            if (!Array.isArray(items) || items.length === 0) {
                if (set) set.status = 400;
                return { error: 'Invalid request. Array of content items required.' };
            }

            // Get unique items by CID
            const uniqueItems = items.filter((item, index, self) =>
                index === self.findIndex(t => t.cid === item.cid)
            );

            // Check which items already exist
            const cids = uniqueItems.map(item => item.cid);
            const existingItems = await db
                .select({ cid: content.cid })
                .from(content)
                .where(inArray(content.cid, cids));

            const existingCids = new Set(existingItems.map(item => item.cid));

            // Filter to only new items that don't exist yet
            const newItems = uniqueItems.filter(item => !existingCids.has(item.cid));

            if (newItems.length === 0) {
                return {
                    success: true,
                    message: 'All items already exist',
                    uploaded: 0,
                    total: uniqueItems.length
                };
            }

            // Insert new content items
            const contentEntries = newItems.map(item => ({
                cid: item.cid,
                type: item.type,
                data: Buffer.from(new Uint8Array(item.binaryData)),
                metadata: item.metadata || {},
                createdAt: new Date()
            }));

            await db.insert(content).values(contentEntries);

            return {
                success: true,
                message: `Uploaded ${newItems.length} new content items`,
                uploaded: newItems.length,
                total: uniqueItems.length
            };
        } catch (error) {
            console.error('Error uploading batch content:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to upload content batch',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
);

// Binary data endpoint
contentHandlers.group('/:cid/binary', app => app
    .get('/', async ({ params, set }: AuthContext) => {
        try {
            const cid = (params as { cid: string }).cid;
            const binaryData = await getBinaryContentByCid(cid);

            if (!binaryData) {
                if (set) set.status = 404;
                return { error: 'Binary content not found' };
            }

            // Return in a format that can be transported over JSON
            return {
                cid,
                binaryData: Array.from(binaryData) // Convert to array for transport
            };
        } catch (error) {
            console.error('Error retrieving binary content:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to retrieve binary content',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
);

export default contentHandlers; 