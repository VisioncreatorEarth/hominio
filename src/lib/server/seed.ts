import { db, createLoroDoc } from './elysiaLegacy';

// Generate real UUIDs for all entities
export const META_SCHEMA_UUID = '2d1ee72f-6b58-4c0e-9d3c-b10bc0437317';
export const HUMAN_SCHEMA_UUID = 'a7b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d';
export const DAO_SCHEMA_UUID = 'f6e5d4c3-b2a1-4f8e-9d8c-7b6a5c4d3e2f';
export const REGISTRY_SCHEMA_UUID = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
export const BRIDI_SCHEMA_UUID = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
export const SELBRI_SCHEMA_UUID = 'e4d3c2b1-a9f8-4e7d-6c5b-4a3b2c1d0e9f';

// Core Document UUIDs
export const SAMUEL_UUID = '8f9e0d1c-2b3a-4c5d-6e7f-8a9b0c1d2e3f';
export const HOMINIO_DAO_UUID = 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a';
export const HUMANS_REGISTRY_UUID = 'c5d4e3f2-1a0b-4c9d-8e7f-6a5b4c3d2e1f';
export const DAOS_REGISTRY_UUID = '7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d';

// Selbri UUIDs
export const CONTAINS_SELBRI_UUID = '3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f';
export const CONTAINED_IN_SELBRI_UUID = '9a8b7c6d-5e4f-3d2c-1b0a-9f8e7d6c5b4a';
export const OWNS_SELBRI_UUID = '2f3e4d5c-6b7a-8c9d-0e1f-2a3b4c5d6e7f';
export const OWNED_BY_SELBRI_UUID = '5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b';

// Bridi UUIDs
export const SAMUEL_OWNS_HOMINIO_UUID = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';
export const HOMINIO_OWNS_HUMANS_REGISTRY_UUID = '4f5e6d7c-8b9a-0c1d-2e3f-4a5b6c7d8e9f';
export const HUMANS_REGISTRY_CONTAINS_SAMUEL_UUID = '1d2e3f4a-5b6c-7d8e-9f0a-1b2c3d4e5f6a';

// Schema types for documents
export const SCHEMA_TYPE = 'Schema';
export const HUMAN_TYPE = 'Human';
export const DAO_TYPE = 'DAO';
export const REGISTRY_TYPE = 'Registry';
export const BRIDI_TYPE = 'Bridi';
export const SELBRI_TYPE = 'Selbri';

// Initialize the database with seed data
export async function seedDatabase() {
    try {
        // Check if MetaSchema exists to avoid duplicating data
        const metaSchemaExists = await db.query(
            `SELECT EXISTS(SELECT 1 FROM loro_snapshots WHERE doc_id = $1) as exists`,
            [META_SCHEMA_UUID]
        );

        let needsSeeding = true;
        if (metaSchemaExists.rows.length > 0) {
            const row = metaSchemaExists.rows[0] as Record<string, unknown>;
            if (row.exists) {
                needsSeeding = false;
            }
        }

        if (needsSeeding) {
            console.log('Creating schema and documents...');

            // Create MetaSchema
            const metaSchema = await createLoroDoc(
                META_SCHEMA_UUID,
                'Meta Schema',
                META_SCHEMA_UUID, // Self-referencing
                'system',
                [HOMINIO_DAO_UUID],
                {
                    properties: {
                        '@id': { type: 'string', format: 'uuid' },
                        '@schema': { type: 'string', format: 'uuid' },
                        'label': { type: 'string' },
                        'created': { type: 'string', format: 'date-time' },
                        'updated': { type: 'string', format: 'date-time' },
                        'owners': { type: 'array', items: { type: 'string', format: 'uuid' } },
                        'latest_snapshot': { type: 'string', format: 'uuid' }
                    }
                }
            );

            // Create Human Schema
            const humanSchema = await createLoroDoc(
                HUMAN_SCHEMA_UUID,
                'Human Schema',
                META_SCHEMA_UUID,
                'system',
                [HOMINIO_DAO_UUID],
                {
                    properties: {
                        'name': { type: 'string' },
                        'email': { type: 'string', format: 'email' }
                    }
                }
            );

            // Create DAO Schema
            const daoSchema = await createLoroDoc(
                DAO_SCHEMA_UUID,
                'DAO Schema',
                META_SCHEMA_UUID,
                'system',
                [HOMINIO_DAO_UUID],
                {
                    properties: {
                        'name': { type: 'string' },
                        'description': { type: 'string' }
                    }
                }
            );

            // Create Registry Schema
            const registrySchema = await createLoroDoc(
                REGISTRY_SCHEMA_UUID,
                'Registry Schema',
                META_SCHEMA_UUID,
                'system',
                [HOMINIO_DAO_UUID],
                {
                    properties: {
                        'name': { type: 'string' },
                        'description': { type: 'string' }
                    }
                }
            );

            // Create Bridi Schema
            const bridiSchema = await createLoroDoc(
                BRIDI_SCHEMA_UUID,
                'Bridi Schema',
                META_SCHEMA_UUID,
                'system',
                [HOMINIO_DAO_UUID],
                {
                    properties: {
                        'selbri': { type: 'string', format: 'uuid' },
                        'x1': { type: 'string', format: 'uuid' },
                        'x2': { type: 'string', format: 'uuid' }
                    }
                }
            );

            // Create Selbri Schema
            const selbriSchema = await createLoroDoc(
                SELBRI_SCHEMA_UUID,
                'Selbri Schema',
                META_SCHEMA_UUID,
                'system',
                [HOMINIO_DAO_UUID],
                {
                    properties: {
                        'name': { type: 'string' },
                        'description': { type: 'string' },
                        'inverse': { type: 'string', format: 'uuid' }
                    }
                }
            );

            // Create Samuel's Human document
            const samuel = await createLoroDoc(
                SAMUEL_UUID,
                'Samuel Andert',
                HUMAN_SCHEMA_UUID,
                'user',
                [SAMUEL_UUID],
                {
                    name: 'Samuel Andert',
                    email: 'samuel@hominio.com'
                }
            );

            // Create Hominio DAO document
            const hominioDao = await createLoroDoc(
                HOMINIO_DAO_UUID,
                'Hominio DAO',
                DAO_SCHEMA_UUID,
                'user',
                [SAMUEL_UUID],
                {
                    name: 'Hominio DAO',
                    description: 'The Hominio ecosystem DAO'
                }
            );

            // Create HUMANS Registry document
            const humansRegistry = await createLoroDoc(
                HUMANS_REGISTRY_UUID,
                'HUMANS Registry',
                REGISTRY_SCHEMA_UUID,
                'user',
                [HOMINIO_DAO_UUID],
                {
                    name: 'HUMANS Registry',
                    description: 'Registry of all human entities'
                }
            );

            // Create DAOS Registry document
            const daosRegistry = await createLoroDoc(
                DAOS_REGISTRY_UUID,
                'DAOS Registry',
                REGISTRY_SCHEMA_UUID,
                'user',
                [HOMINIO_DAO_UUID],
                {
                    name: 'DAOS Registry',
                    description: 'Registry of all DAO entities'
                }
            );

            // Create Selbri 'Contains' document
            const containsSelbri = await createLoroDoc(
                CONTAINS_SELBRI_UUID,
                'Contains',
                SELBRI_SCHEMA_UUID,
                'relation',
                [HOMINIO_DAO_UUID],
                {
                    name: 'contains',
                    description: 'x1 contains x2 as member',
                    inverse: CONTAINED_IN_SELBRI_UUID
                }
            );

            // Create Selbri 'Contained In' document
            const containedInSelbri = await createLoroDoc(
                CONTAINED_IN_SELBRI_UUID,
                'Contained In',
                SELBRI_SCHEMA_UUID,
                'relation',
                [HOMINIO_DAO_UUID],
                {
                    name: 'containedIn',
                    description: 'x1 is contained in x2',
                    inverse: CONTAINS_SELBRI_UUID
                }
            );

            // Create Selbri 'Owns' document
            const ownsSelbri = await createLoroDoc(
                OWNS_SELBRI_UUID,
                'Owns',
                SELBRI_SCHEMA_UUID,
                'relation',
                [HOMINIO_DAO_UUID],
                {
                    name: 'owns',
                    description: 'x1 owns/has superadmin rights over x2',
                    inverse: OWNED_BY_SELBRI_UUID
                }
            );

            // Create Selbri 'Owned By' document
            const ownedBySelbri = await createLoroDoc(
                OWNED_BY_SELBRI_UUID,
                'Owned By',
                SELBRI_SCHEMA_UUID,
                'relation',
                [HOMINIO_DAO_UUID],
                {
                    name: 'ownedBy',
                    description: 'x1 is owned by/under superadmin control of x2',
                    inverse: OWNS_SELBRI_UUID
                }
            );

            // Create Bridi 'Samuel Owns Hominio DAO' document
            const samuelOwnsHominio = await createLoroDoc(
                SAMUEL_OWNS_HOMINIO_UUID,
                'Samuel Owns Hominio DAO',
                BRIDI_SCHEMA_UUID,
                'relation',
                [HOMINIO_DAO_UUID],
                {
                    selbri: OWNS_SELBRI_UUID,
                    x1: SAMUEL_UUID,
                    x2: HOMINIO_DAO_UUID
                }
            );

            // Create Bridi 'Hominio DAO Owns HUMANS Registry' document
            const hominioOwnsHumansRegistry = await createLoroDoc(
                HOMINIO_OWNS_HUMANS_REGISTRY_UUID,
                'Hominio DAO Owns HUMANS Registry',
                BRIDI_SCHEMA_UUID,
                'relation',
                [HOMINIO_DAO_UUID],
                {
                    selbri: OWNS_SELBRI_UUID,
                    x1: HOMINIO_DAO_UUID,
                    x2: HUMANS_REGISTRY_UUID
                }
            );

            // Create Bridi 'HUMANS Registry Contains Samuel' document
            const humansRegistryContainsSamuel = await createLoroDoc(
                HUMANS_REGISTRY_CONTAINS_SAMUEL_UUID,
                'HUMANS Registry Contains Samuel',
                BRIDI_SCHEMA_UUID,
                'relation',
                [HOMINIO_DAO_UUID],
                {
                    selbri: CONTAINS_SELBRI_UUID,
                    x1: HUMANS_REGISTRY_UUID,
                    x2: SAMUEL_UUID
                }
            );

            // Store all documents in the database
            const documents = [
                // Schemas
                { doc: metaSchema, id: META_SCHEMA_UUID, type: SCHEMA_TYPE },
                { doc: humanSchema, id: HUMAN_SCHEMA_UUID, type: SCHEMA_TYPE },
                { doc: daoSchema, id: DAO_SCHEMA_UUID, type: SCHEMA_TYPE },
                { doc: registrySchema, id: REGISTRY_SCHEMA_UUID, type: SCHEMA_TYPE },
                { doc: bridiSchema, id: BRIDI_SCHEMA_UUID, type: SCHEMA_TYPE },
                { doc: selbriSchema, id: SELBRI_SCHEMA_UUID, type: SCHEMA_TYPE },

                // Core Documents
                { doc: samuel, id: SAMUEL_UUID, type: HUMAN_TYPE },
                { doc: hominioDao, id: HOMINIO_DAO_UUID, type: DAO_TYPE },
                { doc: humansRegistry, id: HUMANS_REGISTRY_UUID, type: REGISTRY_TYPE },
                { doc: daosRegistry, id: DAOS_REGISTRY_UUID, type: REGISTRY_TYPE },

                // Selbri Documents
                { doc: containsSelbri, id: CONTAINS_SELBRI_UUID, type: SELBRI_TYPE },
                { doc: containedInSelbri, id: CONTAINED_IN_SELBRI_UUID, type: SELBRI_TYPE },
                { doc: ownsSelbri, id: OWNS_SELBRI_UUID, type: SELBRI_TYPE },
                { doc: ownedBySelbri, id: OWNED_BY_SELBRI_UUID, type: SELBRI_TYPE },

                // Bridi Documents
                { doc: samuelOwnsHominio, id: SAMUEL_OWNS_HOMINIO_UUID, type: BRIDI_TYPE },
                { doc: hominioOwnsHumansRegistry, id: HOMINIO_OWNS_HUMANS_REGISTRY_UUID, type: BRIDI_TYPE },
                { doc: humansRegistryContainsSamuel, id: HUMANS_REGISTRY_CONTAINS_SAMUEL_UUID, type: BRIDI_TYPE }
            ];

            for (const { doc, id, type } of documents) {
                const binary = doc.export({ mode: 'snapshot' });
                const snapshotId = crypto.randomUUID();

                // Update the document to include latest_snapshot in its metadata
                const meta = doc.getMap('meta');
                meta.set('latest_snapshot', snapshotId);

                // Check if document already exists
                const exists = await db.query(
                    `SELECT 1 FROM loro_snapshots WHERE doc_id = $1 LIMIT 1`,
                    [id]
                );

                if (exists.rows.length > 0) {
                    // Update existing document
                    await db.query(
                        `UPDATE loro_snapshots 
                         SET binary_data = $1, 
                             content_json = $2, 
                             name = $3, 
                             doc_type = $4
                         WHERE doc_id = $5`,
                        [
                            binary,
                            JSON.stringify(doc.toJSON()),
                            meta.get('label') || meta.get('name'),
                            type,
                            id
                        ]
                    );
                } else {
                    // Insert new document
                    await db.query(
                        `INSERT INTO loro_snapshots (
                            snapshot_id, doc_id, binary_data, snapshot_type,
                            name, doc_type, created_at, content_json
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            snapshotId,
                            id,
                            binary,
                            'full',
                            meta.get('label') || meta.get('name'),
                            type,
                            new Date(),
                            JSON.stringify(doc.toJSON())
                        ]
                    );
                }

                console.log(`Created/updated document: ${meta.get('label') || meta.get('name')} (${type})`);
            }

            console.log('Database seeding completed successfully.');
        } else {
            console.log('Database already contains schema documents - skipping seeding.');
        }
    } catch (error) {
        console.error('Failed to seed database:', error);
        throw error;
    }
}

// Registry snapshot response type
export interface RegistrySnapshotResponse {
    exists: boolean;
    snapshotId?: string;
    binaryData?: Uint8Array;
    error?: unknown;
}

// Get the registry document's latest snapshot
export async function getLatestRegistrySnapshot(registryId: string): Promise<RegistrySnapshotResponse> {
    try {
        // Query for the latest snapshot
        const result = await db.query(
            `SELECT snapshot_id, binary_data FROM loro_snapshots 
             WHERE doc_id = $1 
             ORDER BY created_at DESC LIMIT 1`,
            [registryId]
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
        console.error(`Error getting registry snapshot for ${registryId}:`, error);
        return { exists: false, error };
    }
} 