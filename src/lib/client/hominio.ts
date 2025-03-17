import { edenTreaty } from '@elysiajs/eden';
import type { App } from '../../routes/agent/[...slugs]/+server';

// Create the base Eden client
const baseClient = edenTreaty<App>('');

// Create a simple wrapper to add agent.get() functionality
type EnhancedClient = typeof baseClient & {
    agent: typeof baseClient.agent & {
        get: typeof baseClient.agent.index.get;
    };
};

// Create enhanced client with direct get() method that forwards to index.get()
const client = baseClient as EnhancedClient;
if (client.agent?.index?.get) {
    client.agent.get = client.agent.index.get;
}

// Export the enhanced client
export const hominio = client;

// This is a singleton client that can be imported anywhere in the application
// Access patterns:
// - hominio.agent.get() directly for the root endpoint (wrapper)
// - hominio.agent.health.get() for the health endpoint
// 
// Future endpoints:
// - hominio.agent.chat.* for chat endpoints
// - hominio.agent.resources.docs.* for resources endpoints etc