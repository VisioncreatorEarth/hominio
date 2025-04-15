#!/usr/bin/env bun
/**
 * Standalone database seed script
 * This doesn't depend on any existing imports from src/db
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { LoroDoc } from 'loro-crdt';
import { blake3 } from '@noble/hashes/blake3';
import b4a from 'b4a';
import { randomBytes } from 'crypto';
import * as schema from './schema';

// Sample user ID for seed documents - use a real user ID from your BetterAuth database
const SAMPLE_USER_ID = "0DaaHRf7Khtw3UcBxcofmnTM4V27Dasd";

// Helper functions
// --------------------------------------------------------

// Helper function to hash the snapshot data
async function hashSnapshot(snapshot: Uint8Array): Promise<string> {
    const hashBytes = blake3(snapshot);
    return b4a.toString(hashBytes, 'hex');
}

// Helper function to generate a public key
function generatePublicKey(): string {
    // Format: z + base64url encoding of 32 bytes
    return 'z' + randomBytes(32).toString('base64url');
}

// Seed function to create a random Loro doc
async function seedRandomLoroDoc(db: ReturnType<typeof drizzle>) {
    try {
        // Create a new LoroDoc directly (without loroService)
        const loroDoc = new LoroDoc();

        // Set a random peer ID
        loroDoc.setPeerId(Math.floor(Math.random() * 1000000));

        // Add metadata to Loro document - this follows hominio-db.ts model
        const meta = loroDoc.getMap('meta');
        meta.set('name', 'Example Loro Document');
        meta.set('description', 'A test document using Loro CRDT');
        meta.set('author', 'SeedScript');
        meta.set('createdAt', new Date().toISOString());
        meta.set('schemaId', 'default');

        // Add data content - following hominio-db structure
        const dataMap = loroDoc.getMap("data");
        dataMap.set("prop_1", "This is a test document created with Loro CRDT library.");
        dataMap.set("prop_2", "Example property value");
        dataMap.set("prop_3", Math.floor(Math.random() * 100).toString());

        // Generate a pubKey
        const pubKey = generatePublicKey();
        const now = new Date().toISOString();

        // Export snapshot and generate hash
        const snapshot = loroDoc.exportSnapshot();
        const cid = await hashSnapshot(snapshot);
        // Get JSON representation only for logging/debugging if needed
        // const jsonState = loroDoc.toJSON();

        // First, store the content with BYTEA data - matching hominio-db.ts Content structure
        const contentEntry: schema.InsertContent = {
            cid,
            type: 'snapshot',
            // Store binary data directly as Buffer - match 'raw' field from interface
            raw: Buffer.from(snapshot),
            // Store metadata separately as JSON
            metadata: {
                created: now,
                // Include only schema ID and name from document metadata
                schemaId: meta.get('schemaId'),
                name: meta.get('name')
            }
        };

        // Save the content
        const contentResult = await db.insert(schema.content)
            .values(contentEntry)
            .returning();

        console.log('Created content entry:', contentResult[0].cid);

        // Then create document entry that references the content - matching schema requirements
        // but including metadata that's important for hominio-db
        const docEntry: schema.InsertDoc = {
            pubKey,
            snapshotCid: cid,
            updateCids: [],
            owner: SAMPLE_USER_ID, // Match 'owner' field in interface, not 'ownerId'
            // Use a Date object for updatedAt since that's what the schema expects
            updatedAt: new Date()
        };

        // Save the document entry
        const docResult = await db.insert(schema.docs)
            .values(docEntry)
            .returning();

        console.log('Created document entry:', docResult[0].pubKey);

        return {
            doc: docResult[0],
            content: contentResult[0]
        };
    } catch (error) {
        console.error('Error creating Loro doc:', error);
        throw error;
    }
}


// Main function
// --------------------------------------------------------

async function main() {
    // Get the database URL
    const dbUrl = process.env.SECRET_DATABASE_URL_HOMINIO;

    if (!dbUrl) {
        console.error('❌ Database URL not found in environment variables');
        process.exit(1);
    }

    console.log('🌱 Seeding database with Loro documents...');

    try {
        // Create direct database connection
        const sql = neon(dbUrl);
        const db = drizzle({ client: sql, schema });

        // Seed the database
        const result = await seedRandomLoroDoc(db);

        console.log('✅ Successfully created Loro document:');
        console.log('  - Public Key:', result.doc.pubKey);
        console.log('  - Snapshot CID:', result.doc.snapshotCid);
        console.log('  - Owner:', result.doc.owner);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
}

// Run the main function
main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});