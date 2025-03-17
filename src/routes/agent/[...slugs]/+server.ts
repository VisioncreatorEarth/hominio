import { Elysia } from 'elysia';
import { PGlite } from '@electric-sql/pglite';
import {
    GENESIS_REGISTRY_UUID,
    GENESIS_REGISTRY_DOMAIN,
    GENESIS_REGISTRY_NAME,
    HUMAN_REGISTRY_UUID,
    HUMAN_REGISTRY_DOMAIN,
    HUMAN_REGISTRY_NAME,
    DAO_REGISTRY_UUID,
    DAO_REGISTRY_DOMAIN,
    DAO_REGISTRY_NAME,
    HOMINIO_DAO_UUID,
    HOMINIO_DAO_DOMAIN,
    HOMINIO_DAO_NAME,
    VISIONCREATOR_DAO_UUID,
    VISIONCREATOR_DAO_DOMAIN,
    VISIONCREATOR_DAO_NAME
} from '$lib/constants/registry';

// Define our hardcoded registry document ID with Genesis UUID
const GENESIS_REGISTRY_DOC_ID = GENESIS_REGISTRY_UUID;

// Document types
const DOC_TYPE_REGISTRY = 'registry';
const DOC_TYPE_DAO = 'dao';

// We'll generate random UUIDs for our entities 

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

// Define registry document entry type
interface RegistryDocEntry {
    uuid: string;
    docType: string;
    name: string;
    domain: string;
    owner: string;
    createdAt: number;
    currentSnapshotId: string;
}

// Hardcoded Genesis registry - this is not a loro doc but a system-level registry
const GENESIS_REGISTRY = {
    uuid: GENESIS_REGISTRY_UUID,
    name: GENESIS_REGISTRY_NAME,
    documents: {
        [HUMAN_REGISTRY_UUID]: {
            uuid: HUMAN_REGISTRY_UUID,
            docType: DOC_TYPE_REGISTRY,
            name: HUMAN_REGISTRY_NAME,
            domain: HUMAN_REGISTRY_DOMAIN,
            owner: GENESIS_REGISTRY_DOMAIN,
            createdAt: Date.now(),
            currentSnapshotId: 'system'
        },
        [DAO_REGISTRY_UUID]: {
            uuid: DAO_REGISTRY_UUID,
            docType: DOC_TYPE_REGISTRY,
            name: DAO_REGISTRY_NAME,
            domain: DAO_REGISTRY_DOMAIN,
            owner: GENESIS_REGISTRY_DOMAIN,
            createdAt: Date.now(),
            currentSnapshotId: 'system'
        }
    }
};

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
                name TEXT,
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

        // Check if the genesis root registry exists, if not create it
        await initializeRootRegistry();
    } catch (error) {
        console.error('Failed to initialize server-side PGLite:', error);
    }
}

// Initialize the registry document if it doesn't exist yet
async function initializeRootRegistry() {
    try {
        // Check if the HUMAN registry document exists
        const humanRegistryExists = await db.query(
            `SELECT EXISTS(SELECT 1 FROM loro_snapshots WHERE doc_id = $1) as exists`,
            [HUMAN_REGISTRY_UUID]
        );

        let needsHumanRegistryCreation = true;
        if (humanRegistryExists.rows.length > 0) {
            const row = humanRegistryExists.rows[0] as Record<string, unknown>;
            if (row.exists) {
                needsHumanRegistryCreation = false;
            }
        }

        // Check if the DAO registry document exists
        const daoRegistryExists = await db.query(
            `SELECT EXISTS(SELECT 1 FROM loro_snapshots WHERE doc_id = $1) as exists`,
            [DAO_REGISTRY_UUID]
        );

        let needsDaoRegistryCreation = true;
        if (daoRegistryExists.rows.length > 0) {
            const row = daoRegistryExists.rows[0] as Record<string, unknown>;
            if (row.exists) {
                needsDaoRegistryCreation = false;
            }
        }

        if (needsHumanRegistryCreation) {
            // Create the HUMAN registry
            const humanSnapshotId = crypto.randomUUID();
            const humanPlaceholderData = Buffer.from(JSON.stringify({
                version: 1,
                documents: {},
                meta: {
                    name: HUMAN_REGISTRY_NAME,
                    createdAt: Date.now()
                }
            }));

            // Insert the HUMAN registry document
            await db.query(
                `INSERT INTO loro_snapshots (
                    snapshot_id, doc_id, binary_data, snapshot_type, 
                    name, doc_type, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    humanSnapshotId,
                    HUMAN_REGISTRY_UUID,
                    humanPlaceholderData,
                    'full',
                    HUMAN_REGISTRY_NAME,
                    DOC_TYPE_REGISTRY,
                    new Date()
                ]
            );
        }

        if (needsDaoRegistryCreation) {
            // Create the DAO registry with Hominio DAO and Visioncreator DAO entries
            const daoSnapshotId = crypto.randomUUID();
            const daoDocuments: Record<string, RegistryDocEntry> = {};

            // Add Hominio DAO reference to the DAO registry
            daoDocuments[HOMINIO_DAO_UUID] = {
                uuid: HOMINIO_DAO_UUID,
                docType: DOC_TYPE_DAO,
                name: HOMINIO_DAO_NAME,
                domain: HOMINIO_DAO_DOMAIN,
                owner: DAO_REGISTRY_DOMAIN,
                createdAt: Date.now(),
                currentSnapshotId: 'server'
            };

            // Add Visioncreator DAO reference to the DAO registry
            daoDocuments[VISIONCREATOR_DAO_UUID] = {
                uuid: VISIONCREATOR_DAO_UUID,
                docType: DOC_TYPE_DAO,
                name: VISIONCREATOR_DAO_NAME,
                domain: VISIONCREATOR_DAO_DOMAIN,
                owner: DAO_REGISTRY_DOMAIN,
                createdAt: Date.now(),
                currentSnapshotId: 'server'
            };

            const daoRegistryData = Buffer.from(JSON.stringify({
                version: 1,
                documents: daoDocuments,
                meta: {
                    name: DAO_REGISTRY_NAME,
                    createdAt: Date.now()
                }
            }));

            // Insert the DAO registry document
            await db.query(
                `INSERT INTO loro_snapshots (
                    snapshot_id, doc_id, binary_data, snapshot_type, 
                    name, doc_type, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    daoSnapshotId,
                    DAO_REGISTRY_UUID,
                    daoRegistryData,
                    'full',
                    DAO_REGISTRY_NAME,
                    DOC_TYPE_REGISTRY,
                    new Date()
                ]
            );

            // Create Hominio DAO document
            const hominioDaoSnapshotId = crypto.randomUUID();
            const hominioDaoData = Buffer.from(JSON.stringify({
                version: 1,
                members: [],
                properties: {
                    name: HOMINIO_DAO_NAME,
                    description: 'The root DAO in the DAO registry',
                    founded: Date.now()
                },
                meta: {
                    name: HOMINIO_DAO_NAME,
                    domain: HOMINIO_DAO_DOMAIN,
                    createdAt: Date.now()
                }
            }));

            // Insert the Hominio DAO document
            await db.query(
                `INSERT INTO loro_snapshots (
                    snapshot_id, doc_id, binary_data, snapshot_type, 
                    name, doc_type, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    hominioDaoSnapshotId,
                    HOMINIO_DAO_UUID,
                    hominioDaoData,
                    'full',
                    HOMINIO_DAO_NAME,
                    DOC_TYPE_DAO,
                    new Date()
                ]
            );

            // Create Visioncreator DAO document
            const visioncreatorDaoSnapshotId = crypto.randomUUID();
            const visioncreatorDaoData = Buffer.from(JSON.stringify({
                version: 1,
                members: [],
                properties: {
                    name: VISIONCREATOR_DAO_NAME,
                    description: 'The visionary DAO in the DAO registry',
                    founded: Date.now()
                },
                meta: {
                    name: VISIONCREATOR_DAO_NAME,
                    domain: VISIONCREATOR_DAO_DOMAIN,
                    createdAt: Date.now()
                }
            }));

            // Insert the Visioncreator DAO document
            await db.query(
                `INSERT INTO loro_snapshots (
                    snapshot_id, doc_id, binary_data, snapshot_type, 
                    name, doc_type, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    visioncreatorDaoSnapshotId,
                    VISIONCREATOR_DAO_UUID,
                    visioncreatorDaoData,
                    'full',
                    VISIONCREATOR_DAO_NAME,
                    DOC_TYPE_DAO,
                    new Date()
                ]
            );
        }
    } catch (error) {
        console.error('Failed to initialize registries:', error);
    }
}

// Get the registry document's latest snapshot
async function getLatestRegistrySnapshot(): Promise<RegistrySnapshotResponse> {
    try {
        // For Genesis registry, return a hardcoded response
        if (GENESIS_REGISTRY) {
            return {
                exists: true,
                snapshotId: 'system',
                // Create a fake binary representation of the Genesis registry
                binaryData: Buffer.from(JSON.stringify(GENESIS_REGISTRY)) as unknown as Uint8Array
            };
        } else {
            return { exists: false };
        }
    } catch (error) {
        console.error('Error getting Genesis registry snapshot:', error);
        return { exists: false, error };
    }
}

// Initialize the database immediately
initializeDb();

// Following Elysia's official SvelteKit integration guidance:
// For server placed in src/routes/agent/[...slugs]/+server.ts
// We need to set prefix as /agent
const app = new Elysia({ prefix: '/agent' })
    // Root endpoint - will be accessible at /agent
    .get('/', () => {
        return {
            message: 'Hominio Agent API',
            version: '1.0.0',
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
                    [GENESIS_REGISTRY_DOC_ID]
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

    // Resource endpoints
    .group('/resources', app => app
        .group('/docs', app => app
            // Get all documents including the root registry
            .get('/', async () => {
                try {
                    // Get the registry document first
                    const registrySnapshot = await getLatestRegistrySnapshot();

                    // Then get all documents
                    const result = await db.query(
                        `SELECT doc_id, 
                          MAX(name) as name,
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
                        registry: {
                            id: GENESIS_REGISTRY_DOC_ID,
                            name: GENESIS_REGISTRY_NAME,
                            exists: registrySnapshot.exists,
                            snapshotId: registrySnapshot.snapshotId,
                        },
                        genesisUuid: GENESIS_REGISTRY_UUID,
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
            })

            // Handle all snapshot operations
            .group('/snapshots', app => app
                // POST to store a snapshot
                .post('/', async ({ body }) => {
                    // console.log('Received document snapshot for storage');

                    try {
                        // Type cast the body to our expected interface
                        const snapshotData = body as SnapshotData;
                        const { docId, docType, binaryData, versionVector, timestamp, meta, clientId } = snapshotData;

                        // Determine if this is the root registry document
                        const isRootRegistry = docId === GENESIS_REGISTRY_DOC_ID;

                        // Generate a unique ID for this snapshot
                        const snapshotId = crypto.randomUUID();

                        // Convert base64 to buffer
                        const binaryBuffer = base64ToBuffer(binaryData);

                        // Add optional title if provided in metadata
                        const title = isRootRegistry
                            ? GENESIS_REGISTRY_DOMAIN
                            : (meta?.name as string) || docType;

                        // Insert the snapshot into the database
                        await db.query(
                            `INSERT INTO loro_snapshots (
                                snapshot_id, doc_id, binary_data, snapshot_type, 
                                version_vector, client_id, name, doc_type, created_at
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
                                isRootRegistry ? DOC_TYPE_REGISTRY : docType,
                                new Date(timestamp)
                            ]
                        );

                        // console.log(`Snapshot stored with ID: ${snapshotId} for document: ${docId}`);

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

                // POST to store an update
                .post('/updates', async ({ body }) => {
                    // console.log('Received document update');

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

                // GET all snapshots for a document
                .get('/:docId', async ({ params }) => {
                    try {
                        const { docId } = params;

                        // Query the database for snapshots matching the document ID
                        const result = await db.query(
                            `SELECT 
                              snapshot_id,
                              doc_id,
                              doc_type,
                              snapshot_type,
                              version_vector,
                              name,
                              created_at
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
            )
        )
    );

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