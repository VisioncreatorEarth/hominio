import { Elysia } from 'elysia';

// Initialize Elysia server with the '/agent' prefix
const app = new Elysia({ prefix: '/agent' })
    .get('/', () => {
        return {
            message: 'Hello from agent',
            timestamp: new Date().toISOString()
        }
    })
    .get('/health', () => {
        return {
            status: 'ok',
            uptime: process.uptime()
        }
    });

// Define the request handler type as per SvelteKit
type RequestHandler = (v: { request: Request }) => Response | Promise<Response>;

// Export handlers for HTTP methods
export const GET: RequestHandler = ({ request }) => app.handle(request);
export const POST: RequestHandler = ({ request }) => app.handle(request);
export const PUT: RequestHandler = ({ request }) => app.handle(request);
export const DELETE: RequestHandler = ({ request }) => app.handle(request);
export const PATCH: RequestHandler = ({ request }) => app.handle(request); 