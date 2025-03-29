import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { auth } from '$lib/auth/auth';
import { db as dbModels } from '$db/model';
import { db } from '$db';
import { docs } from '$db/schema';
import { eq } from 'drizzle-orm';
import type { Context } from 'elysia';

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