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
import * as schema from './schema';
import { sql } from 'drizzle-orm'; // Import sql for querying

const GENESIS_HOMINIO = "00000000000000000000000000000000";
const GENESIS_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000000";

// Basic placeholder type for SchemaDefinition matching the structure used
interface SchemaDefinition {
    pubkey: string | null;
    schema: string | null;
    name: string;
    places: Record<string, {
        description: string;
        type: string | string[];
        required: boolean;
        validation?: Record<string, unknown>;
        entitySchemas?: string[];
    }>;
    translations: Array<{
        lang: string;
        name: string;
        description: string;
        places: Record<string, string>;
    }>;
}

const gismuSchema: SchemaDefinition = {
    pubkey: GENESIS_PUBKEY,
    schema: null, // Self-referential as the fundamental meta-schema
    name: "gismu",
    places: {
        x1: {
            description: "lo lojbo ke krasi valsi",
            type: "string",
            required: true
        },
        x2: {
            description: "lo bridi be lo ka ce'u skicu zo'e",
            type: "string",
            required: true
        },
        x3: {
            description: "lo sumti javni",
            type: "any", // Consider defining a structure for places later
            required: true
        },
        x4: {
            description: "lo rafsi",
            type: "string", // Should likely be array of strings
            required: false
        }
    },
    translations: [
        {
            lang: "en",
            name: "Root Word",
            description: "A Lojban root word (gismu) defining a fundamental concept",
            places: {
                x1: "A Lojban root word",
                x2: "Relation/concept expressed by the word",
                x3: "Argument roles for the relation",
                x4: "Associated affix(es)"
            }
        },
        {
            lang: "de",
            name: "Stammwort",
            description: "Ein Lojban-Stammwort (Gismu), das einen grundlegenden Begriff definiert",
            places: {
                x1: "Das Stammwort",
                x2: "Ausgedrückte Relation/Konzept",
                x3: "Argumentrollen der Relation",
                x4: "Zugehörige Affixe"
            }
        }
    ]
};


// Helper functions
// --------------------------------------------------------

// Helper function to hash the snapshot data
async function hashSnapshot(snapshot: Uint8Array): Promise<string> {
    const hashBytes = blake3(snapshot);
    return b4a.toString(hashBytes, 'hex');
}

// Removed generatePublicKey helper


// Seed function to create the Gismu schema document
// --------------------------------------------------------
async function seedGismuSchemaDoc(db: ReturnType<typeof drizzle>) {
    try {
        console.log(`Checking for existing Gismu schema with pubKey: ${GENESIS_PUBKEY}...`);

        // Check if the document already exists
        const existingDoc = await db.select()
            .from(schema.docs)
            .where(sql`${schema.docs.pubKey} = ${GENESIS_PUBKEY}`)
            .limit(1);

        if (existingDoc.length > 0) {
            console.log(`✅ Gismu schema document already exists (pubKey: ${existingDoc[0].pubKey}). Skipping creation.`);
            return;
        }

        console.log("Gismu schema document not found. Creating...");

        // Create a new LoroDoc to store the schema definition
        const loroDoc = new LoroDoc();
        loroDoc.setPeerId(1); // Static peer ID for seeding

        // Populate the LoroDoc using the standard meta/data structure
        const meta = loroDoc.getMap('meta');
        meta.set('name', gismuSchema.name); // Store name in meta
        // The schema reference is null for the self-referential gismu schema
        meta.set('schema', gismuSchema.schema); // Should be null

        const data = loroDoc.getMap('data');
        data.set('places', gismuSchema.places); // Store places in data
        data.set('translations', gismuSchema.translations); // Store translations in data

        // Export snapshot and generate hash
        const snapshot = loroDoc.exportSnapshot();
        const cid = await hashSnapshot(snapshot);
        const now = new Date().toISOString();

        // 1. Store the content
        const contentEntry: schema.InsertContent = {
            cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            // Update metadata stored alongside content - keep it minimal
            metadata: {
                name: gismuSchema.name,
                schema: gismuSchema.schema, // null (indicates it's the root schema)
                created: now
            }
        };

        const contentResult = await db.insert(schema.content)
            .values(contentEntry)
            .returning();
        console.log('  - Created content entry:', contentResult[0].cid);

        // 2. Create the document entry
        const docEntry: schema.InsertDoc = {
            pubKey: GENESIS_PUBKEY,
            snapshotCid: cid,
            updateCids: [],
            owner: GENESIS_HOMINIO,
            updatedAt: new Date()
        };

        const docResult = await db.insert(schema.docs)
            .values(docEntry)
            .returning();
        console.log('  - Created document entry:', docResult[0].pubKey);

        console.log('✅ Successfully created Gismu schema document.');

    } catch (error) {
        console.error('Error seeding Gismu schema document:', error);
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

    console.log('🌱 Seeding database with Gismu schema...');

    try {
        // Create direct database connection
        const sql = neon(dbUrl);
        const db = drizzle(sql, { schema }); // Pass schema correctly

        // Seed the Gismu schema document
        await seedGismuSchemaDoc(db);

        console.log('✅ Database seeding completed successfully.');

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