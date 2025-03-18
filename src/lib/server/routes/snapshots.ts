import { app, db, base64ToBuffer, parseBinaryToLoroDoc } from '../elysia';

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

// Snapshots routes
app.group('/resources', app => app
    .group('/docs', app => app
        .group('/snapshots', app => app
            // POST to store a snapshot
            .post('/', async ({ body }) => {
                console.log('Received document snapshot for storage');

                try {
                    // Type cast the body to our expected interface
                    const snapshotData = body as SnapshotData;
                    const { docId, docType, binaryData, versionVector, timestamp, clientId } = snapshotData;

                    // Generate a unique ID for this snapshot
                    const snapshotId = crypto.randomUUID();

                    // Convert base64 to buffer
                    const binaryBuffer = base64ToBuffer(binaryData);

                    // Parse the binary data into a LoroDoc
                    const loroDoc = await parseBinaryToLoroDoc(binaryBuffer);

                    if (!loroDoc) {
                        throw new Error('Failed to parse LoroDoc from binary data');
                    }

                    // Get the document metadata
                    const docMeta = loroDoc.getMap('meta').toJSON();
                    const title = docMeta.label || docMeta.name || docType;

                    // Update the document's metadata to include the latest snapshot
                    const metaMap = loroDoc.getMap('meta');
                    metaMap.set('latest_snapshot', snapshotId);
                    metaMap.set('updated', new Date(timestamp).toISOString());

                    // Re-export the binary with updated metadata
                    const updatedBinary = loroDoc.export({ mode: 'snapshot' });

                    // Insert the snapshot with content mirror
                    await db.query(
                        `INSERT INTO loro_snapshots (
                            snapshot_id, doc_id, binary_data, snapshot_type, 
                            version_vector, client_id, name, doc_type, created_at,
                            content_json
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                        [
                            snapshotId,
                            docId,
                            updatedBinary,
                            'full',
                            versionVector ? JSON.stringify(versionVector) : null,
                            clientId || null,
                            title,
                            docType,
                            new Date(timestamp),
                            JSON.stringify(loroDoc.toJSON())
                        ]
                    );

                    // Update any previous snapshots to point to this as latest
                    await db.query(
                        `UPDATE loro_snapshots 
                         SET content_json = jsonb_set(content_json::jsonb, '{meta,latest_snapshot}', '"${snapshotId}"'::jsonb)
                         WHERE doc_id = $1 AND snapshot_id != $2`,
                        [docId, snapshotId]
                    );

                    console.log(`Snapshot stored with ID: ${snapshotId} for document: ${docId}`);

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

                    // Query the database for snapshots matching the document ID, including binary data
                    const result = await db.query(
                        `SELECT 
                          snapshot_id,
                          doc_id,
                          doc_type,
                          snapshot_type,
                          version_vector,
                          name,
                          created_at,
                          binary_data
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

            // GET a specific snapshot with binary data only
            .get('/:docId/latest', async ({ params }) => {
                try {
                    const { docId } = params;

                    // Query the database for the latest snapshot matching the document ID
                    const result = await db.query<{ binary_data: Uint8Array }>(
                        `SELECT 
                          binary_data
                        FROM loro_snapshots
                        WHERE doc_id = $1
                        ORDER BY created_at DESC
                        LIMIT 1`,
                        [docId]
                    );

                    if (result.rows.length === 0) {
                        return {
                            status: 'error',
                            error: 'No snapshot found for document',
                            timestamp: new Date().toISOString()
                        }
                    }

                    // Return just the binary data
                    return {
                        status: 'success',
                        docId,
                        binary_data: result.rows[0]?.binary_data || null,
                        timestamp: new Date().toISOString()
                    }
                } catch (error) {
                    console.error('Error retrieving snapshot binary data:', error);

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