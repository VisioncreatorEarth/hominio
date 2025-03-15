import { Elysia } from 'elysia';
import { PGlite } from '@electric-sql/pglite';

// Define snapshot data type
interface SnapshotData {
    docId: string;
    docType: string;
    timestamp: number;
    meta?: Record<string, unknown>;
    clientId?: string;
}

// Create an in-memory PGLite instance for storing snapshots
// Using 'memory://' or no parameter creates an in-memory database
const db = new PGlite('memory://');

// Initialize the database schema
async function initializeDb() {
    try {
        // Create the snapshots table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS snapshots (
                id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                doc_type TEXT NOT NULL,
                data JSONB NOT NULL,
                client_id TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Create indexes for faster lookups
            CREATE INDEX IF NOT EXISTS idx_snapshots_doc_id ON snapshots(doc_id);
            CREATE INDEX IF NOT EXISTS idx_snapshots_doc_type ON snapshots(doc_type);
        `);

        console.log('Server-side PGLite initialized with in-memory database');
    } catch (error) {
        console.error('Failed to initialize server-side PGLite:', error);
    }
}

// Initialize the database immediately
initializeDb();

// Following Elysia's official SvelteKit integration guidance:
// For server placed in src/routes/agent/[...slugs]/+server.ts
// We need to set prefix as /agent
const app = new Elysia({ prefix: '/agent' })
    // Root endpoint - will be accessible at /agent
    // Access pattern will be hominio.agent.get()
    .get('/', () => {
        return {
            message: 'Hello from agent',
            timestamp: new Date().toISOString()
        }
    })
    // // Also make the index explicitly available
    // .get('/index', () => {
    //     return {
    //         message: 'Hello from agent index',
    //         timestamp: new Date().toISOString()
    //     }
    // })
    // Health endpoint - will be accessible at /agent/health
    .get('/health', async () => {
        // Get database stats
        const dbStats: Record<string, unknown> = {
            initialized: false,
            error: null,
            snapshots: 0,
            documents: 0
        };

        try {
            // Check if the database is initialized
            const tablesResult = await db.query(
                `SELECT name FROM sqlite_master 
                 WHERE type='table' AND name='snapshots'`
            );

            dbStats.initialized = tablesResult.rows.length > 0;

            // Get snapshot count if initialized
            if (dbStats.initialized) {
                interface CountResult {
                    count: number;
                }

                const countResult = await db.query<CountResult>('SELECT COUNT(*) as count FROM snapshots');
                if (countResult.rows.length > 0) {
                    dbStats.snapshots = countResult.rows[0].count;
                }

                // Get document count
                const docCountResult = await db.query<CountResult>(
                    'SELECT COUNT(DISTINCT doc_id) as count FROM snapshots'
                );
                if (docCountResult.rows.length > 0) {
                    dbStats.documents = docCountResult.rows[0].count;
                }
            }
        } catch (error) {
            dbStats.error = String(error);
        }

        // Return a detailed health check response
        return {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            memory: {
                heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
                heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
            },
            database: dbStats
        }
    })
    // New endpoint for document snapshots
    .post('/resources/docs/snapshots', async ({ body }) => {
        console.log('Received document snapshot:', body);

        try {
            // Generate a unique ID for this snapshot
            const snapshotId = crypto.randomUUID();

            // Type cast the body to our expected interface
            const snapshotData = body as SnapshotData;

            // Insert the snapshot into the database
            await db.query(
                `INSERT INTO snapshots (id, doc_id, doc_type, data, client_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    snapshotId,
                    snapshotData.docId,
                    snapshotData.docType,
                    JSON.stringify(body), // Store the entire payload as JSON
                    snapshotData.clientId || null,
                    new Date(snapshotData.timestamp) // Convert timestamp to date
                ]
            );

            console.log(`Snapshot stored with ID: ${snapshotId}`);

            // Return a success response
            return {
                status: 'success',
                received: true,
                stored: true,
                snapshotId,
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            console.error('Error storing snapshot:', error);

            // Return an error response
            return {
                status: 'error',
                received: true,
                stored: false,
                error: String(error),
                timestamp: new Date().toISOString()
            }
        }
    })
    // Add endpoint to retrieve snapshots for a document
    .get('/resources/docs/snapshots/:docId', async ({ params }) => {
        try {
            const { docId } = params;

            // Query the database for snapshots matching the document ID
            const result = await db.query(
                `SELECT id, doc_id, doc_type, data, client_id, created_at
                FROM snapshots
                WHERE doc_id = $1
                ORDER BY created_at DESC`,
                [docId]
            );

            return {
                status: 'success',
                docId,
                snapshots: result.rows,
                count: result.rows.length,
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            console.error('Error retrieving snapshots:', error);

            return {
                status: 'error',
                error: String(error),
                timestamp: new Date().toISOString()
            }
        }
    })
    // Add endpoint to list all documents with snapshots
    .get('/resources/docs', async () => {
        try {
            // Query the database for unique documents
            const result = await db.query(
                `SELECT DISTINCT doc_id, doc_type
                FROM snapshots
                ORDER BY doc_id`
            );

            return {
                status: 'success',
                documents: result.rows,
                count: result.rows.length,
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            console.error('Error retrieving document list:', error);

            return {
                status: 'error',
                error: String(error),
                timestamp: new Date().toISOString()
            }
        }
    });

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