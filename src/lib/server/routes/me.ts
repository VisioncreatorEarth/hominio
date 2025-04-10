import { Elysia } from 'elysia';

// Define the session type based on your auth context
interface AuthContext {
    session: {
        user: {
            id: string;
            [key: string]: unknown;
        }
    }
}

// Create a route handlers collection without the prefix
// The prefix will be defined in the main server file
export const meHandlers = new Elysia()
    // Handlers only without prefix 
    .get('/hi', ({ session }: AuthContext) => {
        return {
            message: 'Protected hello!',
            user: session.user
        }
    });

// Export the handlers for use in the main server
export default meHandlers; 