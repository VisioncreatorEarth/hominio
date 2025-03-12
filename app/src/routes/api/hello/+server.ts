import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
    // Simple server response
    return json({
        message: 'hello earth',
        timestamp: new Date().toISOString()
    });
}; 