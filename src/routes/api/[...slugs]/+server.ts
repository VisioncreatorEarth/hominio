// Disable prerendering for this dynamic API endpoint
export const prerender = false;

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { getAuthClient } from '$lib/auth/auth';
import { db as dbModels } from '$db/model';
import { db } from '$db';
import { docs } from '$db/schema';
import { eq } from 'drizzle-orm';
import type { Context } from 'elysia';
import { ULTRAVOX_API_KEY } from '$env/static/private';

// Get the auth instance immediately as this is server-side code
const auth = getAuthClient();

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
                // Cast body to any to handle unknown structure
                const requestData = body as Record<string, any>;

                // Log request for debugging
                console.log('Call API request with body:', JSON.stringify(requestData, null, 2));

                // Store vibeId in proper metadata field if provided
                // The API supports a 'metadata' field (without underscore)
                let requestBody: Record<string, any> = { ...requestData };

                // If _metadata exists (our temporary field), move it to the proper metadata field
                if (requestData._metadata && requestData._metadata.vibeId) {
                    const { _metadata, ...rest } = requestData;
                    requestBody = {
                        ...rest,
                        metadata: {
                            vibeId: _metadata.vibeId,
                            userId: session.user.id
                        }
                    };
                } else {
                    // Add userId to metadata if no custom metadata
                    requestBody = {
                        ...requestData,
                        metadata: {
                            ...(requestData.metadata || {}),
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
        .get('/', async () => {
            return await db.select().from(docs);
        })
        .get('/:id', async ({ params: { id } }) => {
            const doc = await db.select().from(docs).where(eq(docs.id, id));
            if (!doc.length) throw new Error('Document not found');
            return doc[0];
        })
        .post('/', async ({ body }) => {
            const result = await db.insert(docs).values({
                content: body.content,
                metadata: body.metadata
            }).returning();
            return result[0];
        }, {
            body: dbModels.insert.docs
        })
        .put('/:id', async ({ params: { id }, body }) => {
            const result = await db.update(docs)
                .set({
                    content: body.content,
                    metadata: body.metadata
                })
                .where(eq(docs.id, id))
                .returning();
            if (!result.length) throw new Error('Document not found');
            return result[0];
        }, {
            body: dbModels.insert.docs
        })
        .delete('/:id', async ({ params: { id } }) => {
            const result = await db.delete(docs)
                .where(eq(docs.id, id))
                .returning();
            if (!result.length) throw new Error('Document not found');
            return { success: true };
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