import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { auth } from "$lib/auth/auth";
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

const app = new Elysia({ prefix: '/api' })
    .use(
        cors({
            origin: 'http://localhost:5173',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            credentials: true,
            allowedHeaders: ['Content-Type', 'Authorization'],
        }),
    )
    .use(
        swagger({
            documentation: {
                info: {
                    title: 'Hominio Documentation',
                    version: '1.0.0'
                }
            }
        })
    )
    .get('/hi', () => 'hi')
    .group('/auth', app => app
        .all('/*', betterAuthView)
    )
    .onError(({ code, error }) => {
        console.error(`API Error [${code}]:`, error);
        return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Internal Server Error'
        }), {
            status: code === 'NOT_FOUND' ? 404 : 500,
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