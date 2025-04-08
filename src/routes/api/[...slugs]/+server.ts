// Disable prerendering for this dynamic API endpoint
export const prerender = false;

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { getAuthClient } from '$lib/auth/auth';
import { db } from '$db';
import { docs, content } from '$db/schema';
import * as schema from '$db/schema';
import { eq } from 'drizzle-orm';
import type { Context } from 'elysia';
import { ULTRAVOX_API_KEY } from '$env/static/private';
import { hashService } from '$lib/KERNEL/hash-service';
import { loroService } from '$lib/KERNEL/loro-service';

// Get the auth instance immediately as this is server-side code
const auth = getAuthClient();

// Convert array-like object to Uint8Array
function arrayToUint8Array(arr: number[]): Uint8Array {
    return new Uint8Array(arr);
}

// Types for API responses
type ContentResponse = {
    cid: string;
    type: string;
    metadata?: Record<string, unknown>;
    hasBinaryData: boolean;
    contentLength: number;
    verified: boolean;
    createdAt: string;
    binaryData?: number[]; // Optional binary data as an array of numbers
};

// Combined document and content response
type DocWithContentResponse = {
    document: typeof docs.$inferSelect;
    content?: ContentResponse;
};

const betterAuthView = (context: Context) => {
    const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"]
    // validate request method
    if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
        return auth.handler(context.request);
    } else {
        context.error(405)
    }
}

// Session protection middleware
const requireAuth = async ({ request, set }: Context) => {
    const session = await auth.api.getSession({
        headers: request.headers
    });

    if (!session) {
        set.status = 401;
        throw new Error('Unauthorized: Valid session required');
    }

    return {
        session
    };
}

// Function to fetch and verify content by CID
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

const app = new Elysia({ prefix: '/api' })
    .use(
        cors({
            origin: 'http://localhost:5173',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            credentials: true,
            allowedHeaders: ['Content-Type', 'Authorization'],
        }),
    )
    .use(
        swagger({
            documentation: {
                info: {
                    title: 'Hominio Documentation',
                    version: '0.1.0'
                }
            }
        })
    )
    // Public routes
    .group('/auth', app => app
        .all('/*', betterAuthView)
    )
    // Call endpoints - protected with authentication
    .group('/call', app => app
        .derive(requireAuth)
        .post('/create', async ({ body, session, set }) => {
            try {
                // Cast body to handle unknown structure
                const requestData = body as Record<string, unknown>;

                // Log request for debugging
                console.log('Call API request with body:', JSON.stringify(requestData, null, 2));

                // Store vibeId in proper metadata field if provided
                // The API supports a 'metadata' field (without underscore)
                let requestBody: Record<string, unknown> = { ...requestData };

                // If _metadata exists (our temporary field), move it to the proper metadata field
                if (requestData._metadata && typeof requestData._metadata === 'object') {
                    const metadata = requestData._metadata as Record<string, unknown>;
                    if ('vibeId' in metadata) {
                        // Use object destructuring with rest to exclude _metadata
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { _metadata, ...rest } = requestData;
                        requestBody = {
                            ...rest,
                            metadata: {
                                vibeId: metadata.vibeId,
                                userId: session.user.id
                            }
                        };
                    }
                } else {
                    // Add userId to metadata if no custom metadata
                    const existingMetadata = (requestData.metadata as Record<string, unknown> | undefined) || {};
                    requestBody = {
                        ...requestData,
                        metadata: {
                            ...existingMetadata,
                            userId: session.user.id
                        }
                    };
                }

                console.log('Calling Ultravox API with:', JSON.stringify(requestBody, null, 2));

                // Forward the request to the Ultravox API
                const response = await fetch('https://api.ultravox.ai/api/calls', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': ULTRAVOX_API_KEY
                    },
                    body: JSON.stringify(requestBody)
                });

                console.log('Ultravox API response status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Ultravox API error:', errorText);
                    set.status = response.status;
                    return {
                        error: 'Error calling Ultravox API',
                        details: errorText
                    };
                }

                // Return the Ultravox API response directly
                const data = await response.json();
                console.log('Ultravox API response data:', JSON.stringify(data, null, 2));
                return data;
            } catch (error) {
                console.error('Error creating call:', error);
                set.status = 500;
                return {
                    error: 'Failed to create call',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
    )
    // Protected routes
    .group('/me', app => app
        .derive(requireAuth) // Use derive instead of use for type safety
        .get('/hi', ({ session }) => {
            return {
                message: 'Protected hello!',
                user: session.user
            }
        })
    )
    // Docs routes
    .group('/docs', app => app
        .derive(requireAuth)
        .get('/', async ({ session }) => {
            // Get only docs owned by the current user
            return await db.select().from(docs)
                .where(eq(docs.ownerId, session.user.id))
                .orderBy(docs.updatedAt);
        })
        .post('/', async ({ body, session, set }) => {
            try {
                // Parse request body to extract optional snapshot
                const createDocBody = body as {
                    binarySnapshot?: number[];
                    title?: string;
                    description?: string;
                };

                let snapshot, cid, pubKey, jsonState;

                // If a snapshot is provided, use it; otherwise create a default one
                if (createDocBody.binarySnapshot && Array.isArray(createDocBody.binarySnapshot)) {
                    // Use the provided snapshot
                    const snapshotData = arrayToUint8Array(createDocBody.binarySnapshot);

                    // Verify this is a valid Loro snapshot
                    const loroDoc = loroService.createEmptyDoc();
                    try {
                        // Import to verify it's valid
                        loroDoc.import(snapshotData);

                        // Generate state information from the imported doc
                        snapshot = snapshotData;
                        cid = await hashService.hashSnapshot(snapshotData);
                        pubKey = loroService.generatePublicKey();
                        jsonState = loroDoc.toJSON();
                    } catch (error) {
                        set.status = 400;
                        return {
                            success: false,
                            error: 'Invalid Loro snapshot',
                            details: error instanceof Error ? error.message : 'Unknown error'
                        };
                    }
                } else {
                    // Create a default document if no snapshot provided
                    ({ snapshot, cid, pubKey, jsonState } = await loroService.createDemoDoc());
                }

                // First, store the content
                const contentEntry: schema.InsertContent = {
                    cid,
                    type: 'snapshot',
                    // Store binary data directly
                    data: Buffer.from(snapshot),
                    // Store metadata separately
                    metadata: {
                        docState: jsonState
                    }
                };

                // Save the content
                const contentResult = await db.insert(schema.content)
                    .values(contentEntry)
                    .returning();

                console.log('Created content entry:', contentResult[0].cid);

                // Create document entry with the current user as owner
                const docEntry: schema.InsertDoc = {
                    pubKey,
                    snapshotCid: cid,
                    updateCids: [],
                    ownerId: session.user.id, // Associate with current user
                    title: createDocBody.title || 'New Loro Document',
                    description: createDocBody.description || 'Created on ' + new Date().toLocaleString()
                };

                // Save the document
                const docResult = await db.insert(schema.docs)
                    .values(docEntry)
                    .returning();

                console.log('Created document entry:', docResult[0].pubKey);

                // Return the created document
                return {
                    success: true,
                    document: docResult[0]
                };
            } catch (error) {
                console.error('Error creating document:', error);
                set.status = 500;
                return {
                    success: false,
                    error: 'Failed to create document',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
        .get('/:pubKey', async ({ params: { pubKey }, query, session, set }) => {
            try {
                // Get doc by pubKey
                const doc = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
                if (!doc.length) {
                    set.status = 404;
                    return { error: 'Document not found' };
                }

                const document = doc[0];

                // Verify the user owns this document
                if (document.ownerId !== session.user.id) {
                    set.status = 403;
                    return { error: 'Not authorized to access this document' };
                }

                // Create the response including document data
                const response: DocWithContentResponse = {
                    document
                };

                // If document has a snapshot CID, fetch and include the content
                if (document.snapshotCid) {
                    const contentData = await getContentByCid(document.snapshotCid);
                    if (contentData) {
                        response.content = contentData;

                        // Check if binary data was requested using includeBinary query param
                        const includeBinary = query?.includeBinary === "true";
                        if (includeBinary) {
                            // Get the binary data directly
                            const binaryData = await getBinaryContentByCid(document.snapshotCid);
                            if (binaryData) {
                                // Add binary data to the response
                                response.content.binaryData = Array.from(binaryData);
                            }
                        }
                    }
                }

                // Return the combined document and content data
                return response;
            } catch (error) {
                console.error('Error retrieving document:', error);
                set.status = 500;
                return {
                    error: 'Failed to retrieve document',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
        .post('/:pubKey/update', async ({ params: { pubKey }, body, session, set }) => {
            try {
                // Verify document exists and user owns it
                const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
                if (!docResult.length) {
                    set.status = 404;
                    return { error: 'Document not found' };
                }

                const document = docResult[0];

                // Verify the user owns this document
                if (document.ownerId !== session.user.id) {
                    set.status = 403;
                    return { error: 'Not authorized to update this document' };
                }

                // Parse the update data from request body, handling both direct and wrapped formats
                const updateBody = body as { data?: { binaryUpdate: number[] }; binaryUpdate?: number[] };

                // Extract binaryUpdate from either format
                const binaryUpdate = updateBody.data?.binaryUpdate || updateBody.binaryUpdate;

                if (!binaryUpdate || !Array.isArray(binaryUpdate)) {
                    set.status = 400;
                    return { error: 'Invalid update data. Binary update required.' };
                }

                // Convert the array to Uint8Array
                const binaryUpdateArray = arrayToUint8Array(binaryUpdate);

                // Get current document content
                const contentItem = await db.select().from(content).where(eq(content.cid, document.snapshotCid));
                if (!contentItem.length) {
                    set.status = 500;
                    return { error: 'Document content not found' };
                }

                // Load the document from snapshot
                const loroDoc = loroService.createEmptyDoc();
                const snapshotData = contentItem[0].data as Buffer;

                // Import the snapshot to the document directly from buffer
                loroDoc.import(new Uint8Array(snapshotData));

                // Apply the update
                loroService.applyUpdate(loroDoc, binaryUpdateArray);

                // Get update CID
                const { update, cid } = await loroService.createUpdate(loroDoc);

                // Store the update content with metadata
                const updateContentEntry: schema.InsertContent = {
                    cid,
                    type: 'update',
                    // Store binary data directly
                    data: Buffer.from(update),
                    // Store metadata separately
                    metadata: {
                        appliedTo: document.snapshotCid
                    }
                };

                const updateResult = await db.insert(schema.content)
                    .values(updateContentEntry)
                    .returning();

                console.log('Created update content entry:', updateResult[0].cid);

                // Update the document's updateCids array to include this update
                // Handle the case where updateCids might be null
                const currentCids = document.updateCids || [];
                const updatedCids = [...currentCids, cid];

                await db.update(schema.docs)
                    .set({
                        updateCids: updatedCids,
                        updatedAt: new Date()
                    })
                    .where(eq(schema.docs.pubKey, pubKey))
                    .returning();

                // Return success response
                return {
                    success: true,
                    updateCid: cid,
                    updatedCids
                };
            } catch (error) {
                console.error('Error updating document:', error);
                set.status = 500;
                return {
                    error: 'Failed to update document',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
        // New endpoint for updating a document's snapshot
        .post('/:pubKey/snapshot', async ({ params: { pubKey }, body, session, set }) => {
            try {
                // Verify document exists and user owns it
                const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
                if (!docResult.length) {
                    set.status = 404;
                    return { error: 'Document not found' };
                }

                const document = docResult[0];

                // Verify the user owns this document
                if (document.ownerId !== session.user.id) {
                    set.status = 403;
                    return { error: 'Not authorized to update this document' };
                }

                // Parse the snapshot data from request body
                const snapshotBody = body as {
                    data?: { binarySnapshot: number[] };
                    binarySnapshot?: number[]
                };

                // Extract binarySnapshot from either format
                const binarySnapshot = snapshotBody.data?.binarySnapshot || snapshotBody.binarySnapshot;

                if (!binarySnapshot || !Array.isArray(binarySnapshot)) {
                    set.status = 400;
                    return { error: 'Invalid snapshot data. Binary snapshot required.' };
                }

                // Convert the array to Uint8Array for processing
                const snapshotData = arrayToUint8Array(binarySnapshot);

                // Verify this is a valid Loro snapshot
                const loroDoc = loroService.createEmptyDoc();
                try {
                    // Import to verify it's valid
                    loroDoc.import(snapshotData);
                } catch (error) {
                    set.status = 400;
                    return {
                        error: 'Invalid Loro snapshot',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    };
                }

                // Generate a CID for the snapshot
                const snapshotCid = await hashService.hashSnapshot(snapshotData);

                // Check if this exact snapshot already exists (same CID)
                if (snapshotCid === document.snapshotCid) {
                    return {
                        success: true,
                        document,
                        snapshotCid,
                        message: 'Document unchanged, snapshot is already up to date'
                    };
                }

                // Check if content with this CID already exists
                const existingContent = await db.select()
                    .from(content)
                    .where(eq(content.cid, snapshotCid));

                // If the content already exists, we can just update the document to point to it
                if (existingContent.length === 0) {
                    // Create a content entry for the snapshot
                    const contentEntry: schema.InsertContent = {
                        cid: snapshotCid,
                        type: 'snapshot',
                        // Store binary data directly
                        data: Buffer.from(snapshotData),
                        // Store metadata with docState if available
                        metadata: {
                            updatedAt: new Date().toISOString(),
                            previousSnapshotCid: document.snapshotCid
                        }
                    };

                    // Store the snapshot content
                    const contentResult = await db.insert(schema.content)
                        .values(contentEntry)
                        .returning();

                    console.log('Created snapshot content entry:', contentResult[0].cid);
                } else {
                    console.log('Content already exists with CID:', snapshotCid);
                }

                // Update the document's snapshotCid to point to the new snapshot
                const updatedDoc = await db.update(schema.docs)
                    .set({
                        snapshotCid: snapshotCid,
                        updatedAt: new Date()
                    })
                    .where(eq(schema.docs.pubKey, pubKey))
                    .returning();

                // Return success response
                return {
                    success: true,
                    document: updatedDoc[0],
                    snapshotCid
                };
            } catch (error) {
                console.error('Error updating document snapshot:', error);
                set.status = 500;
                return {
                    error: 'Failed to update document snapshot',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
    )
    // Content routes
    .group('/content', app => app
        .derive(requireAuth)
        .get('/', async () => {
            // Get all content items
            return await db.select().from(content);
        })
        .get('/:cid', async ({ params: { cid }, set }) => {
            try {
                const contentData = await getContentByCid(cid);

                if (!contentData) {
                    set.status = 404;
                    return { error: 'Content not found' };
                }

                return contentData;
            } catch (error) {
                console.error('Error retrieving content:', error);
                set.status = 500;
                return {
                    error: 'Failed to retrieve content',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
        // New route for getting binary data
        .get('/:cid/binary', async ({ params: { cid }, set }) => {
            try {
                const binaryData = await getBinaryContentByCid(cid);

                if (!binaryData) {
                    set.status = 404;
                    return { error: 'Binary content not found' };
                }

                // Return in a format that can be transported over JSON
                return {
                    cid,
                    binaryData: Array.from(binaryData) // Convert to array for transport
                };
            } catch (error) {
                console.error('Error retrieving binary content:', error);
                set.status = 500;
                return {
                    error: 'Failed to retrieve binary content',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
    )
    .onError(({ code, error }) => {
        console.error(`API Error [${code}]:`, error);
        return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Internal Server Error'
        }), {
            status: code === 'NOT_FOUND' ? 404 :
                code === 'INTERNAL_SERVER_ERROR' && error.message.includes('Unauthorized') ? 401 : 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'http://localhost:5173',
                'Access-Control-Allow-Credentials': 'true'
            }
        });
    });

type RequestHandler = (v: { request: Request }) => Response | Promise<Response>

export type App = typeof app
export const GET: RequestHandler = async ({ request }) => app.handle(request)
export const POST: RequestHandler = async ({ request }) => app.handle(request)
export const OPTIONS: RequestHandler = async ({ request }) => app.handle(request)
export const PUT: RequestHandler = async ({ request }) => app.handle(request)
export const DELETE: RequestHandler = async ({ request }) => app.handle(request)