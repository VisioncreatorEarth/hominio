import type { ServerLoad } from '@sveltejs/kit';

export const load: ServerLoad = async () => {
    // You could fetch data from a database or other sources here
    return {
        serverGreeting: 'Hello from the server-side load function!',
        timestamp: new Date().toISOString()
    };
}; 