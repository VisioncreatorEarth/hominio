import { Elysia } from 'elysia';
import { PGlite } from '@electric-sql/pglite';
import { seedDatabase } from './seed';
import { LoroDoc } from 'loro-crdt';

// Create an in-memory PGLite instance for storing snapshots
// Using 'memory://' creates an in-memory database
export const db = new PGlite('memory://');

// Create a shared Elysia instance with the agent prefix
export const app = new Elysia({ prefix: '/agent' });

// Initialize the database schema
export async function initializeDb() {
    try {
        // Create tables with additional JSONB column for content mirror
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
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                content_json JSONB -- Mirror of the Loro document content for querying
            );
            
            -- Create trigger function to update content_json
            CREATE OR REPLACE FUNCTION update_content_json()
            RETURNS TRIGGER AS $$
            BEGIN
                -- Parse binary_data into LoroDoc and extract content
                -- This will be handled by the application layer for now
                -- as PL/pgSQL cannot directly work with LoroDoc
                NEW.content_json = NULL;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            -- Create trigger
            DROP TRIGGER IF EXISTS update_content_json_trigger ON loro_snapshots;
            CREATE TRIGGER update_content_json_trigger
            BEFORE INSERT OR UPDATE ON loro_snapshots
            FOR EACH ROW
            EXECUTE FUNCTION update_content_json();
            
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

        // Seed the database with initial data
        await seedDatabase();
    } catch (error) {
        console.error('Failed to initialize server-side PGLite:', error);
    }
}

// Helper function to parse binary data into LoroDoc
export async function parseBinaryToLoroDoc(binaryData: Uint8Array) {
    try {
        const { LoroDoc } = await import('loro-crdt');
        const doc = new LoroDoc();
        await doc.import(binaryData);
        return doc;
    } catch (error) {
        console.error('Error parsing binary to LoroDoc:', error);
        return null;
    }
}

// Convert base64 to Uint8Array buffer
export function base64ToBuffer(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Create a Loro document with metadata
export async function createLoroDoc(
    id: string,
    label: string,
    schema: string,
    docType: string,
    owners: string[] = [],
    data: Record<string, unknown> = {}
): Promise<LoroDoc> {
    // Create a new document
    const loroDoc = new LoroDoc();

    // Add metadata
    const meta = loroDoc.getMap('meta');
    meta.set('@id', id);
    meta.set('@schema', schema);
    meta.set('label', label);
    meta.set('type', docType);
    meta.set('created', new Date().toISOString());
    meta.set('updated', new Date().toISOString());

    // Add owners array if provided
    if (owners && owners.length > 0) {
        meta.set('owners', owners);
    }

    // Add the data to the document
    Object.entries(data).forEach(([key, value]) => {
        // Skip metadata entries
        if (key !== 'meta') {
            // Create a map for each property
            const propMap = loroDoc.getMap(key);

            // If the value is an object, add its properties to the map
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                Object.entries(value as Record<string, unknown>).forEach(([propKey, propValue]) => {
                    propMap.set(propKey, propValue);
                });
            } else {
                // Otherwise add the value directly
                propMap.set(key, value);
            }
        }
    });

    return loroDoc;
}

// Initialize the database immediately
initializeDb(); 