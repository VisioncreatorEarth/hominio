import { app } from '$lib/server';

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