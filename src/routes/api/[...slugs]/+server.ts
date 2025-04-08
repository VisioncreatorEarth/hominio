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
    data: unknown;
    verified: boolean;
    createdAt: string;
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

        // Get binary data from content
        const itemData = item.data as Record<string, unknown>;
        const binaryData = itemData.binary;

        // Verify content integrity
        let verified = false;

        if (Array.isArray(binaryData)) {
            try {
                // Convert array back to Uint8Array
                const contentBytes = arrayToUint8Array(binaryData);

                // Verify hash matches CID
                verified = await hashService.verifySnapshot(contentBytes, cid);
            } catch (err) {
                console.error('Error verifying content hash:', err);
            }
        }

        // Return content with verification status
        return {
            cid: item.cid,
            type: item.type,
            data: item.data,
            verified: verified,
            createdAt: item.createdAt.toISOString()
        };
    } catch (error) {
        console.error('Error retrieving content:', error);
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
        .post('/', async ({ session, set }) => {
            try {
                // Use loroService to create a new document
                const { snapshot, cid, pubKey, jsonState } = await loroService.createDemoDoc();

                // First, store the content
                const contentEntry: schema.InsertContent = {
                    cid,
                    type: 'snapshot',
                    data: {
                        binary: Array.from(snapshot), // Convert Uint8Array to regular array for JSON storage
                        docState: jsonState // Store the JSON representation for easier debugging
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
                    title: 'New Loro Document',
                    description: 'Created on ' + new Date().toLocaleString()
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
        .get('/:pubKey', async ({ params: { pubKey }, session, set }) => {
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