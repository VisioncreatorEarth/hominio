import { app, db } from '../elysia';
import { getLatestRegistrySnapshot, HUMANS_REGISTRY_UUID } from '../seed';

// Documents routes
app.group('/resources', app => app
    .group('/docs', app => app
        // Get all documents including the root registry
        .get('/', async () => {
            try {
                // Get the registry document first (using HUMANS_REGISTRY_UUID as default)
                const registrySnapshot = await getLatestRegistrySnapshot(HUMANS_REGISTRY_UUID);

                // Get all documents with their latest snapshot binary data
                const result = await db.query(
                    `WITH latest_snapshots AS (
                        SELECT DISTINCT ON (doc_id) 
                            doc_id,
                            name,
                            doc_type,
                            binary_data,
                            created_at,
                            snapshot_id
                        FROM loro_snapshots
                        ORDER BY doc_id, created_at DESC
                    )
                    SELECT 
                        doc_id,
                        name as label,
                        doc_type,
                        binary_data,
                        created_at as last_updated,
                        snapshot_id as latest_snapshot_id
                    FROM latest_snapshots
                    ORDER BY doc_type, name`
                );

                return {
                    status: 'success',
                    documents: result.rows,
                    registry: {
                        id: HUMANS_REGISTRY_UUID,
                        exists: registrySnapshot.exists,
                        snapshotId: registrySnapshot.snapshotId,
                        binaryData: registrySnapshot.binaryData
                    },
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

        // Get a specific document with its latest snapshot
        .get('/:docId', async ({ params }) => {
            try {
                const { docId } = params;

                // Query the database for the latest snapshot of this document
                const result = await db.query(
                    `SELECT 
                        doc_id,
                        name,
                        doc_type,
                        binary_data,
                        created_at as last_updated
                    FROM loro_snapshots
                    WHERE doc_id = $1
                    ORDER BY created_at DESC
                    LIMIT 1`,
                    [docId]
                );

                if (result.rows.length === 0) {
                    return {
                        status: 'error',
                        error: 'Document not found',
                        timestamp: new Date().toISOString()
                    }
                }

                return {
                    status: 'success',
                    document: result.rows[0],
                    timestamp: new Date().toISOString()
                }
            } catch (error) {
                console.error('Error retrieving document:', error);

                return {
                    status: 'error',
                    error: String(error),
                    timestamp: new Date().toISOString()
                }
            }
        })
    )
); 