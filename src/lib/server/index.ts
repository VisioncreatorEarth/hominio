import { app } from './elysia';

// Import all routes
import './routes/root';
import './routes/health';
import './routes/documents';
import './routes/snapshots';

// Export the app for use in the SvelteKit server
export { app }; 