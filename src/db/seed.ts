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
import { eq } from 'drizzle-orm'; // Removed unused sql import
import { validateSchemaJsonStructure } from '../lib/KERNEL/hominio-validate';
import { GENESIS_PUBKEY, GENESIS_HOMINIO } from './constants'; // Import from new constants file

// Basic placeholder types matching the structure used
interface PlaceDefinition {
    description: string;
    required: boolean;
    validation?: { // Optional validation object
        schema?: (string | null)[]; // Allow null in schema array
        value?: string | { options?: unknown[]; min?: number; max?: number; minLength?: number; maxLength?: number; regex?: string; custom?: string }; // Allowed literal type or rule object
        rule?: Record<string, unknown>; // Added for consistency with rule object inside value
    };
}

interface TranslationDefinition {
    lang: string;
    name: string;
    description: string;
    places: Record<string, string>;
}

interface BaseDefinition {
    name: string;
    places: Record<string, PlaceDefinition>; // Use the correct interface
    translations?: TranslationDefinition[];
}

interface SchemaDefinition extends BaseDefinition {
    pubkey?: string; // Optional original pubkey, will be generated unless 'gismu'
    schema?: string | null; // Original schema key, will be replaced by generated ref
}

interface EntityDefinition extends BaseDefinition {
    pubkey?: string; // Optional original pubkey, will be generated
    schema: string; // Original schema key, will be replaced by generated ref
}

// Schemas to seed (adapted from data.ts, using the new validation structure)
const schemasToSeed: Record<string, SchemaDefinition> = {
    "gismu": {
        schema: null,
        name: "gismu",
        places: {
            x1: { description: "lo lojbo ke krasi valsi", required: true, validation: { value: "string" } },
            x2: { description: "lo bridi be lo ka ce'u skicu zo'e", required: true, validation: { value: "string" } },
            x3: { description: "lo sumti javni", required: true, validation: {} }, // any
            x4: { description: "lo rafsi", required: false, validation: { value: "string" } }
        },
        translations: [
            { lang: "en", name: "Root Word", description: "A Lojban root word (gismu) defining a fundamental concept", places: { x1: "A Lojban root word", x2: "Relation/concept expressed by the word", x3: "Argument roles for the relation", x4: "Associated affix(es)" } },
            { lang: "de", name: "Stammwort", description: "Ein Lojban-Stammwort (Gismu), das einen grundlegenden Begriff definiert", places: { x1: "Das Stammwort", x2: "Ausgedrückte Relation/Konzept", x3: "Argumentrollen der Relation", x4: "Zugehörige Affixe" } }
        ]
    },
    "prenu": {
        schema: "gismu", // References gismu by name
        name: "prenu",
        places: {
            x1: { description: "lo prenu", required: true, validation: { value: "string" } }
        },
        translations: [
            { lang: "en", name: "Person", description: "A person entity", places: { x1: "Person/entity with personhood" } },
            { lang: "de", name: "Person", description: "Eine Person", places: { x1: "Person/Wesen mit Persönlichkeit" } }
        ]
    },
    "gunka": {
        schema: "gismu", // References gismu by name
        name: "gunka",
        places: {
            // Reference to 'prenu' schema by name - will be resolved to @prenuPubKey by seedDocument
            x1: { description: "lo gunka", required: true, validation: { schema: ["prenu"] } },
            x2: { description: "lo se gunka", required: true, validation: { value: "string" } },
            x3: { description: "lo te gunka", required: false, validation: { value: "string" } }
        },
        translations: [
            { lang: "en", name: "Work", description: "To work/labor on something with a purpose", places: { x1: "Worker/laborer", x2: "Task/activity worked on", x3: "Purpose/goal of the work" } },
            { lang: "de", name: "Arbeit", description: "An etwas mit einem Zweck arbeiten", places: { x1: "Arbeiter", x2: "Aufgabe/Tätigkeit, an der gearbeitet wird", x3: "Zweck/Ziel der Arbeit" } }
        ]
    },
    // Add tcini schema
    "tcini": {
        schema: "gismu", // References gismu by name
        name: "tcini",
        places: {
            x1: {
                description: "lo tcini",
                required: true,
                // Adapt validation structure
                validation: { value: { options: ["todo", "in_progress", "done", "blocked"] } }
            },
            x2: {
                description: "lo se tcini",
                required: true,
                // Reference schema by name for deterministic key generation
                validation: { schema: ["gunka"] }
            }
        },
        translations: [
            {
                lang: "en",
                name: "Status",
                description: "A situation, state or condition",
                places: {
                    x1: "Situation/state/condition",
                    x2: "Entity in the situation/state/condition"
                }
            },
            {
                lang: "de",
                name: "Status",
                description: "Eine Situation, ein Zustand oder eine Bedingung",
                places: {
                    x1: "Situation/Zustand/Bedingung",
                    x2: "Entität in der Situation/dem Zustand/der Bedingung"
                }
            }
        ]
    },
    // <<< Add other schemas here later >>>
};

// Helper functions
// --------------------------------------------------------

// Deterministically generate pubkey from seed string (e.g., schema name or entity name)
async function generateDeterministicPubKey(seed: string): Promise<string> {
    const hashBytes = blake3(b4a.from(seed, 'utf8'));
    const hexString = b4a.toString(hashBytes, 'hex'); // Ensure 64 char hex
    return `0x${hexString}`;
}

// Hash snapshot data
async function hashSnapshot(snapshot: Uint8Array): Promise<string> {
    const hashBytes = blake3(snapshot);
    return b4a.toString(hashBytes, 'hex');
}

// Seed function to create the Gismu schema document - REMOVED (Handled by seedDocument)
// --------------------------------------------------------
// async function seedGismuSchemaDoc(db: ReturnType<typeof drizzle>) { ... } // REMOVED

// Function to seed a single document (schema or entity)
async function seedDocument(
    db: ReturnType<typeof drizzle>,
    docKey: string,
    docDefinition: SchemaDefinition | EntityDefinition,
    docType: 'schema' | 'entity',
    generatedKeys: Map<string, string>
) {
    let pubKey: string;
    let schemaRef: string | null = null; // Initialize as null
    const isGismu = docKey === 'gismu' && docType === 'schema';

    // 1. Determine PubKey
    if (isGismu) {
        pubKey = GENESIS_PUBKEY;
        // Explicitly set gismu key in map if not present
        if (!generatedKeys.has(docKey)) {
            generatedKeys.set(docKey, pubKey);
        }
    } else {
        pubKey = await generateDeterministicPubKey(docKey);
    }
    // Store generated key if not already present
    if (!generatedKeys.has(docKey)) {
        generatedKeys.set(docKey, pubKey);
    }

    // 2. Determine Schema Reference (Format: @pubKey)
    if (isGismu) {
        // Gismu references itself
        schemaRef = `@${pubKey}`;
    } else if ('schema' in docDefinition && docDefinition.schema) {
        // Other docs reference the schema defined in their definition
        const schemaName = docDefinition.schema;
        const schemaPubKey = generatedKeys.get(schemaName);
        if (!schemaPubKey) {
            console.warn(`Schema PubKey for "${schemaName}" not found for "${docKey}", attempting generation...`);
            const generatedSchemaKey = await generateDeterministicPubKey(schemaName);
            if (!generatedKeys.has(schemaName)) generatedKeys.set(schemaName, generatedSchemaKey);
            schemaRef = `@${generatedSchemaKey}`;
        } else {
            schemaRef = `@${schemaPubKey}`;
        }
    } else if (!isGismu && docType === 'schema') {
        // Fallback for non-gismu schemas without explicit schema: reference gismu
        const gismuPubKey = generatedKeys.get("gismu");
        if (!gismuPubKey) {
            throw new Error(`Root schema "gismu" PubKey not found. Ensure 'gismu' is processed first in schemasToSeed.`);
        }
        schemaRef = `@${gismuPubKey}`;
    }
    // If none of the above, schemaRef remains null (shouldn't happen for schemas/entities defined)

    console.log(`Processing ${docType}: ${docKey} -> PubKey: ${pubKey}, SchemaRef: ${schemaRef}`);

    // 3. Check for existing document
    const existingDoc = await db.select({ pubKey: schema.docs.pubKey })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, pubKey))
        .limit(1);
    if (existingDoc.length > 0) {
        console.log(`  - Document already exists. Skipping.`);
        return;
    }

    // 4. Prepare LoroDoc content
    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    const dataMapContent: Record<string, unknown> = {
        places: docDefinition.places,
        translations: docDefinition.translations || []
    };

    const meta = loroDoc.getMap('meta');
    meta.set('name', docDefinition.name);
    meta.set('schema', schemaRef); // Set resolved @pubkey or null

    const data = loroDoc.getMap('data');
    data.set('places', dataMapContent.places);
    if (dataMapContent.translations && Array.isArray(dataMapContent.translations) && dataMapContent.translations.length > 0) {
        data.set('translations', dataMapContent.translations);
    }

    // --- UPDATED: 4.5 Validate the LoroDoc structure VIA JSON --- //
    if (docType === 'schema') { // Only validate schema docs for now
        console.log(`  - Validating structure for schema: ${docKey}...`);
        // Get JSON representation for validation
        const schemaJsonForValidation = loroDoc.toJSON() as Record<string, unknown>;
        // Add pubKey to JSON as the validator might expect it (depending on its implementation)
        schemaJsonForValidation.pubKey = pubKey;

        const { isValid, errors } = validateSchemaJsonStructure(schemaJsonForValidation);
        if (!isValid) {
            console.error(`  - ❌ Validation Failed for ${docKey}:`);
            // Add type string to err parameter
            errors.forEach((err: string) => console.error(`    - ${err}`));
            console.warn(`  - Skipping database insertion for invalid schema: ${docKey}`);
            return; // Do not proceed if validation fails
        }
        console.log(`  - ✅ Structure validation passed for schema: ${docKey}`);
    }

    // 5. Export snapshot and hash
    // Use exportSnapshot() as export() with mode is deprecated/changed in newer Loro versions?
    // Reverting to exportSnapshot as it seems to be the intended method based on context.
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    // 6. Upsert Content Entry
    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            metadata: {
                name: docDefinition.name,
                schema: schemaRef
            },
            createdAt: now
        })
        .onConflictDoNothing({ target: schema.content.cid });

    console.log(`  - Ensured content entry exists: ${cid}`);

    // 7. Insert Document Entry
    const docEntry: schema.InsertDoc = {
        pubKey: pubKey,
        snapshotCid: cid,
        updateCids: [],
        owner: GENESIS_HOMINIO,
        updatedAt: now,
        createdAt: now
    };

    await db.insert(schema.docs).values(docEntry);
    console.log(`  - Created document entry: ${pubKey}`);
    console.log(`✅ Successfully seeded ${docType}: ${docKey}`);
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

    console.log('🌱 Seeding database with core schemas...');

    try {
        // Create direct database connection
        const sql = neon(dbUrl);
        const db = drizzle(sql, { schema }); // Pass schema correctly

        const generatedKeys = new Map<string, string>(); // name -> pubkey

        // --- Phase 1: Seed all Schemas ---
        console.log("\n--- Seeding Schemas ---");
        // Ensure gismu is first to establish GENESIS_PUBKEY association
        for (const schemaKey in schemasToSeed) {
            await seedDocument(db, schemaKey, schemasToSeed[schemaKey], 'schema', generatedKeys);
        }

        console.log('\n✅ Database schema seeding completed successfully.');
        console.log('\nGenerated Keys Map:');
        console.log(generatedKeys);

    } catch (error) {
        console.error('\n❌ Error during database seeding:', error);
        process.exit(1);
    }
}

// Run the main function
main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
}); 