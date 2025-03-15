import { Elysia } from 'elysia';
import { PGlite } from '@electric-sql/pglite';

// Define our hardcoded registry document ID with genesis UUID
const GENESIS_UUID = '00000000-0000-0000-0000-000000000000';
const ROOT_REGISTRY_DOC_ID = GENESIS_UUID;
const ROOT_REGISTRY_TITLE = 'o.homin.io';

// Define snapshot data type
interface SnapshotData {
    docId: string;
    docType: string;
    binaryData: string; // Base64 encoded binary data
    versionVector?: Record<string, number>;
    timestamp: number;
    meta?: Record<string, unknown>;
    clientId?: string;
}

// Define update data type
interface UpdateData {
    docId: string;
    binaryData: string; // Base64 encoded binary data
    fromVersion: Record<string, number>;
    toVersion: Record<string, number>;
    clientId?: string;
    timestamp: number;
}

// Registry snapshot response type
interface RegistrySnapshotResponse {
    exists: boolean;
    snapshotId?: string;
    binaryData?: Uint8Array;
    error?: unknown;
}

/**
 * Convert base64 string to buffer for PGLite storage
 */
function base64ToBuffer(base64: string): Buffer {
    return Buffer.from(base64, 'base64');
}

// Create an in-memory PGLite instance for storing snapshots
// Using 'memory://' creates an in-memory database
const db = new PGlite('memory://');

// Initialize the database schema
async function initializeDb() {
    try {
        // Create tables for our new schema
        await db.exec(`
            -- Immutable snapshots table: stores binary data for all documents (including registry)
            CREATE TABLE IF NOT EXISTS loro_snapshots (
                snapshot_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                binary_data BYTEA NOT NULL,
                snapshot_type TEXT NOT NULL,
                version_vector JSONB,
                client_id TEXT,
                title TEXT,
                doc_type TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Incremental updates table
            CREATE TABLE IF NOT EXISTS loro_updates (
                update_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                binary_data BYTEA NOT NULL,
                from_version JSONB,
                to_version JSONB,
                client_id TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Create indexes for faster lookups
            CREATE INDEX IF NOT EXISTS idx_loro_snapshots_doc_id ON loro_snapshots(doc_id);
            CREATE INDEX IF NOT EXISTS idx_loro_updates_doc_id ON loro_updates(doc_id);
        `);

        console.log('Server-side PGLite initialized with in-memory database');
    } catch (error) {
        console.error('Failed to initialize server-side PGLite:', error);
    }
}

// Initialize the database immediately
initializeDb();

// Get or create the registry document's latest snapshot
async function getLatestRegistrySnapshot(): Promise<RegistrySnapshotResponse> {
    try {
        const result = await db.query(
            `SELECT snapshot_id, binary_data 
             FROM loro_snapshots 
             WHERE doc_id = $1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [ROOT_REGISTRY_DOC_ID]
        );

        if (result.rows.length > 0) {
            const row = result.rows[0] as Record<string, unknown>;
            return {
                exists: true,
                snapshotId: row.snapshot_id as string,
                binaryData: row.binary_data as Uint8Array
            };
        } else {
            return { exists: false };
        }
    } catch (error) {
        console.error('Error getting registry snapshot:', error);
        return { exists: false, error };
    }
}

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
    // Health endpoint - will be accessible at /agent/health
    .get('/health', async () => {
        // Get database stats
        const dbStats: Record<string, unknown> = {
            initialized: false,
            error: null,
            snapshots: 0,
            documents: 0,
            registryExists: false
        };

        try {
            // Check if the database is initialized
            const tablesResult = await db.query(
                `SELECT name FROM sqlite_master 
                 WHERE type='table' AND name='loro_snapshots'`
            );

            dbStats.initialized = tablesResult.rows.length > 0;

            // Get snapshot count if initialized
            if (dbStats.initialized) {
                interface CountResult {
                    count: number;
                }

                const countResult = await db.query<CountResult>('SELECT COUNT(*) as count FROM loro_snapshots');
                if (countResult.rows.length > 0) {
                    dbStats.snapshots = countResult.rows[0].count;
                }

                // Get document count
                const docCountResult = await db.query<CountResult>(
                    'SELECT COUNT(DISTINCT doc_id) as count FROM loro_snapshots'
                );
                if (docCountResult.rows.length > 0) {
                    dbStats.documents = docCountResult.rows[0].count;
                }

                // Check if registry exists
                const registryResult = await db.query(
                    'SELECT EXISTS(SELECT 1 FROM loro_snapshots WHERE doc_id = $1) as exists',
                    [ROOT_REGISTRY_DOC_ID]
                );

                if (registryResult.rows.length > 0) {
                    const row = registryResult.rows[0] as Record<string, unknown>;
                    dbStats.registryExists = row.exists;
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
    // Registry endpoints
    .get('/registry', async () => {
        const registrySnapshot = await getLatestRegistrySnapshot();

        return {
            status: registrySnapshot.exists ? 'success' : 'not_found',
            registryId: ROOT_REGISTRY_DOC_ID,
            registryTitle: ROOT_REGISTRY_TITLE,
            exists: registrySnapshot.exists,
            snapshotId: registrySnapshot.snapshotId,
            timestamp: new Date().toISOString()
        };
    })
    // New endpoint for document snapshots
    .post('/snapshots', async ({ body }) => {
        console.log('Received document snapshot for storage');

        try {
            // Type cast the body to our expected interface
            const snapshotData = body as SnapshotData;
            const { docId, docType, binaryData, versionVector, timestamp, meta, clientId } = snapshotData;

            // Determine if this is the root registry document
            const isRootRegistry = docId === ROOT_REGISTRY_DOC_ID;

            // Generate a unique ID for this snapshot
            const snapshotId = crypto.randomUUID();

            // Convert base64 to buffer
            const binaryBuffer = base64ToBuffer(binaryData);

            // Add optional title if provided in metadata
            const title = isRootRegistry
                ? ROOT_REGISTRY_TITLE
                : (meta?.title as string) || docType;

            // Insert the snapshot into the database
            await db.query(
                `INSERT INTO loro_snapshots (
                    snapshot_id, doc_id, binary_data, snapshot_type, 
                    version_vector, client_id, title, doc_type, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    snapshotId,
                    docId,
                    binaryBuffer,
                    'full', // Assuming full snapshot by default
                    versionVector ? JSON.stringify(versionVector) : null,
                    clientId || null,
                    title,
                    isRootRegistry ? 'dao' : docType,
                    new Date(timestamp)
                ]
            );

            console.log(`Snapshot stored with ID: ${snapshotId} for document: ${docId}`);

            // Return a success response
            return {
                status: 'success',
                received: true,
                stored: true,
                snapshotId,
                docId,
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
    // Add endpoint for storing incremental updates
    .post('/updates', async ({ body }) => {
        console.log('Received document update');

        try {
            // Generate a unique ID for this update
            const updateId = crypto.randomUUID();
            const updateData = body as UpdateData;
            const { docId, binaryData, fromVersion, toVersion, clientId, timestamp } = updateData;

            // Convert base64 to buffer
            const binaryBuffer = base64ToBuffer(binaryData);

            // Insert the update into the database
            await db.query(
                `INSERT INTO loro_updates (
                    update_id, doc_id, binary_data, from_version, 
                    to_version, client_id, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    updateId,
                    docId,
                    binaryBuffer,
                    JSON.stringify(fromVersion),
                    JSON.stringify(toVersion),
                    clientId || null,
                    new Date(timestamp)
                ]
            );

            return {
                status: 'success',
                updateId,
                docId,
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            console.error('Error storing update:', error);

            return {
                status: 'error',
                received: true,
                stored: false,
                error: String(error),
                timestamp: new Date().toISOString()
            }
        }
    })
    // Add endpoint to retrieve latest snapshot for a document
    .get('/snapshots/:docId/latest', async ({ params }) => {
        try {
            const { docId } = params;

            // Query the database for the latest snapshot matching the document ID
            const result = await db.query(
                `SELECT snapshot_id, binary_data, snapshot_type, version_vector, title, doc_type, created_at
                FROM loro_snapshots
                WHERE doc_id = $1
                ORDER BY created_at DESC
                LIMIT 1`,
                [docId]
            );

            if (result.rows.length === 0) {
                return {
                    status: 'not_found',
                    docId,
                    timestamp: new Date().toISOString()
                }
            }

            return {
                status: 'success',
                docId,
                snapshot: result.rows[0],
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            console.error('Error retrieving latest snapshot:', error);

            return {
                status: 'error',
                error: String(error),
                timestamp: new Date().toISOString()
            }
        }
    })
    // Add endpoint to retrieve all snapshots for a document
    .get('/snapshots/:docId', async ({ params }) => {
        try {
            const { docId } = params;

            // Query the database for snapshots matching the document ID
            const result = await db.query(
                `SELECT snapshot_id, snapshot_type, version_vector, title, doc_type, created_at
                FROM loro_snapshots
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
    .get('/documents', async () => {
        try {
            // Query the database for unique documents with titles and types
            const result = await db.query(
                `SELECT doc_id, 
                  MAX(title) as title,
                  MAX(doc_type) as doc_type,
                  COUNT(snapshot_id) as snapshot_count,
                  MAX(created_at) as last_updated
                FROM loro_snapshots
                GROUP BY doc_id
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