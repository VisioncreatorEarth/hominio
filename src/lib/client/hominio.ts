import { edenTreaty } from '@elysiajs/eden';
import type { App } from '../../routes/peer/[...slugs]/+server';

// Create the base Eden client with proper URL format
export const hominio = edenTreaty<App>('http://localhost:5173');

// Export the client type for better type inference
export type Hominio = typeof hominio;

// This is a singleton client that can be imported anywhere in the application
// Access patterns:
// - hominio.peer.get() directly for the root endpoint
// - hominio.peer.docs.get() for docs endpoints etc