import { edenTreaty } from '@elysiajs/eden';
import type { App } from '../../routes/api/[...slugs]/+server';

// Create the base Eden client with proper URL format
export const hominio = edenTreaty<App>('http://localhost:5173');

// Export the client type for better type inference
export type Hominio = typeof hominio;
