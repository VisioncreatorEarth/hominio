import { Elysia } from 'elysia';

// Following Elysia's official SvelteKit integration guidance:
// For server placed in src/routes/agent/[...slugs]/+server.ts
// We need to set prefix as /agent
const app = new Elysia({ prefix: '/agent' })
    // Root endpoint - will be accessible at /agent
    // Access pattern will be hominio.agent.get()
    .get('/', () => {
        return {
            message: 'Hello from agent',
            timestamp: new Date().toISOString()
        }
    })
    // Also make the index explicitly available
    .get('/index', () => {
        return {
            message: 'Hello from agent index',
            timestamp: new Date().toISOString()
        }
    })
    // Health endpoint - will be accessible at /agent/health
    .get('/health', () => {
        // Return a simple health check response
        return {
            status: 'ok',
            uptime: process.uptime()
        }
    });

// Export the app type for Eden client
export type App = typeof app;

// Define the request handler type for SvelteKit
type RequestHandler = (v: { request: Request }) => Response | Promise<Response>;

// The GET handler - using the standard Elysia SvelteKit pattern
export const GET: RequestHandler = ({ request }) => app.handle(request);

// Handle other HTTP methods the same way
export const POST: RequestHandler = ({ request }) => app.handle(request);
export const PUT: RequestHandler = ({ request }) => app.handle(request);
export const DELETE: RequestHandler = ({ request }) => app.handle(request);
export const PATCH: RequestHandler = ({ request }) => app.handle(request); 