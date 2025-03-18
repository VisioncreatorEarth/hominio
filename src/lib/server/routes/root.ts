import { app } from '../elysia';

// Root endpoint - will be accessible at /agent
app.get('/', () => {
    return {
        message: 'Hominio Agent API',
        version: '0.1.0',
        timestamp: new Date().toISOString()
    }
}); 