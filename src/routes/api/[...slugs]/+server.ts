// Disable prerendering for this dynamic API endpoint
export const prerender = false;

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { getAuthClient } from '$lib/auth/auth';
import type { Context } from 'elysia';

// Import modular route handlers from lib/server
import meHandlers from '$lib/server/routes/me';
import callHandlers from '$lib/server/routes/call';
import docsHandlers from '$lib/server/routes/docs';
import contentHandlers from '$lib/server/routes/content';

// Get the auth instance immediately as this is server-side code
const auth = getAuthClient();

// Session protection middleware
const requireAuth = async ({ request, set }: Context) => {
    try {
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

    } catch (error: unknown) {
        console.error("[requireAuth] Error during session validation:", error);
        if (error instanceof Error && (error.message.includes('ENOTFOUND') || error.message.includes('EADDRNOTAVAIL') || error.message.includes('timed out'))) {
            set.status = 503;
            throw new Error('Authentication service temporarily unavailable.');
        } else {
            set.status = 401;
            throw new Error('Unauthorized: Session validation failed.');
        }
    }
}

const betterAuthView = (context: Context) => {
    console.log(`[betterAuthView] Received request: ${context.request.method} ${context.request.url}`);
    const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET", "PUT"];

    if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
        console.log(`[betterAuthView] Forwarding to auth.handler.`);
        return auth.handler(context.request);
    } else {
        console.warn(`[betterAuthView] Method ${context.request.method} not allowed for ${context.request.url}`);
        context.error(405);
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
        .use(callHandlers)
    )
    // Define the /me prefix here in the main file
    .group('/me', app => app
        .derive(requireAuth)
        .use(meHandlers)
    )
    // Docs routes 
    .group('/docs', app => app
        .derive(requireAuth)
        .use(docsHandlers)
    )
    // Content routes
    .group('/content', app => app
        .derive(requireAuth)
        .use(contentHandlers)
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

// Use exported RequestHandler instead of local type
export type App = typeof app;
export const GET = async ({ request }: { request: Request }) => app.handle(request);
export const POST = async ({ request }: { request: Request }) => app.handle(request);
export const OPTIONS = async ({ request }: { request: Request }) => app.handle(request);
export const PUT = async ({ request }: { request: Request }) => app.handle(request);
export const DELETE = async ({ request }: { request: Request }) => app.handle(request);
