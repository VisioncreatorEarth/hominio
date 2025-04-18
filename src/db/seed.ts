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
import { validateEntityJsonAgainstSchema } from '../lib/KERNEL/hominio-validate';
import { LoroMap } from 'loro-crdt';

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

// Allow simple values (string, number, boolean, null) or @ref strings directly in entity places
interface EntityDefinition {
    pubkey?: string; // Optional original pubkey, will be generated
    schema: string; // Original schema key, will be replaced by generated ref
    name: string;
    places: Record<string, string | number | boolean | null>; // Places are direct values or @ref strings
    translations?: TranslationDefinition[]; // Translations still use PlaceDefinition structure
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
                validation: { value: { options: ["todo", "in_progress", "done", "blocked"] } }
            },
            x2: {
                description: "lo se tcini",
                required: true,
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
    // Lojban 'liste' (list)
    "liste": {
        schema: "gismu",
        name: "liste",
        places: {
            x1: { description: "lo liste be lo se lista", required: true, validation: { value: "string" } }, // the list itself (e.g., its name or identifier)
            x2: { description: "lo se lista", required: true, validation: { value: "any" } }, // element in list
            x3: { description: "lo tcila be lo liste", required: false, validation: { value: "any" } }, // list property (e.g., ordering)
            x4: { description: "lo ve lista", required: false, validation: { value: "any" } } // list containing elements (mass/set)
        },
        translations: [
            { lang: "en", name: "List", description: "A sequence/ordered set of items", places: { x1: "The list identifier/sequence", x2: "Item in the list", x3: "Property/ordering", x4: "Containing set/mass" } },
            { lang: "de", name: "Liste", description: "Eine Sequenz/geordnete Menge von Elementen", places: { x1: "Der Listenbezeichner/Sequenz", x2: "Element in der Liste", x3: "Eigenschaft/Ordnung", x4: "Enthaltende Menge" } }
        ]
    },
    // <<< Add other schemas here later >>>
};

// --- Entities to Seed ---
const entitiesToSeed: Record<string, EntityDefinition> = {
    // --- Prenu --- 
    "fiona": {
        schema: "prenu", // Refers to the 'prenu' schema defined above
        name: "Fiona Example",
        places: {
            x1: "Fiona" // Name of the person
        }
    },
    // --- Liste ---
    "main_list": {
        schema: "liste", // Refers to the 'liste' schema
        name: "Main Todo List",
        places: {
            x1: "Main", // Name/Identifier of the list
            x2: "" // Required place, initially empty conceptually (list holds gunka refs via tcini)
        }
    },
    // --- Gunka (Tasks) ---
    "task1_buy_milk": {
        schema: "gunka", // Refers to the 'gunka' schema
        name: "Buy Milk Task",
        places: {
            x1: "@fiona", // Assignee: Reference Fiona (will be resolved to @fiona_pubkey)
            x2: "Buy Oat Milk", // Task description
            x3: "@main_list" // Belongs to: Reference Main List (will be resolved to @main_list_pubkey)
            // x4 (status link) is NOT part of gunka schema
        }
    },
    "task2_feed_cat": {
        schema: "gunka",
        name: "Feed Cat Task",
        places: {
            x1: "@fiona",
            x2: "Feed the cat",
            x3: "@main_list"
        }
    },
    // --- Tcini (Statuses) ---
    "status_task1": {
        schema: "tcini", // Refers to the 'tcini' schema
        name: "Status for Task 1", // Optional descriptive name for the tcini doc itself
        places: {
            x1: "todo", // The actual status value
            x2: "@task1_buy_milk" // Link to the entity this status is for (resolved to @task1_pubkey)
        }
    },
    "status_task2": {
        schema: "tcini",
        name: "Status for Task 2",
        places: {
            x1: "done",
            x2: "@task2_feed_cat"
        }
    }
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

// Refactored function to seed a single document (schema or entity)
async function seedDocument(
    db: ReturnType<typeof drizzle>,
    docKey: string,
    docDefinition: SchemaDefinition | EntityDefinition,
    docType: 'schema' | 'entity',
    generatedKeys: Map<string, string> // Map<name, pubkey>
) {
    let pubKey: string;
    let schemaRef: string | null = null; // Initialize as null
    const isGismuSchema = docKey === 'gismu' && docType === 'schema';

    // 1. Determine PubKey
    if (isGismuSchema) {
        pubKey = GENESIS_PUBKEY;
    } else if (docDefinition.pubkey) { // Use pre-defined pubkey if available (e.g., for testing)
        pubKey = docDefinition.pubkey;
    } else { // Generate deterministically otherwise
        pubKey = await generateDeterministicPubKey(docKey);
    }
    // Store generated/used key if not already present (maps NAME to PUBKEY)
    if (!generatedKeys.has(docKey)) {
        generatedKeys.set(docKey, pubKey);
    }

    // 2. Determine Schema Reference (@pubKey)
    let referencedSchemaName: string | null | undefined = null;
    if (isGismuSchema) {
        // Gismu references itself according to validator expectation
        schemaRef = `@${pubKey}`;
        referencedSchemaName = docKey; // Gismu is its own schema name reference
    } else if (docDefinition.schema) {
        referencedSchemaName = docDefinition.schema; // Name like "gismu" or "prenu"
        const schemaPubKey = generatedKeys.get(referencedSchemaName);
        if (!schemaPubKey) {
            // This should not happen if schemas are seeded first
            console.error(`❌ CRITICAL: Schema PubKey for referenced schema "${referencedSchemaName}" not found in generatedKeys map when seeding "${docKey}". Ensure schemas are seeded first.`);
            return; // Stop processing this document
        }
        schemaRef = `@${schemaPubKey}`;
    } else {
        console.error(`❌ CRITICAL: Document "${docKey}" (type: ${docType}) is missing the required 'schema' field.`);
        return; // Stop processing this document
    }

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

    // --- Resolve Place References for Entities ---
    const resolvedPlaces = { ...docDefinition.places }; // Shallow copy
    if (docType === 'entity') {
        for (const placeKey in resolvedPlaces) {
            const placeDef = resolvedPlaces[placeKey];
            // Check if the place value itself is a reference string like "@someKey"
            if (typeof placeDef === 'string' && placeDef.startsWith('@')) {
                const referencedKeyName = placeDef.substring(1);
                const referencedPubKey = generatedKeys.get(referencedKeyName);
                if (!referencedPubKey) {
                    console.error(`  - ❌ ERROR: Could not resolve reference "${placeDef}" for place "${placeKey}" in entity "${docKey}". Referenced key "${referencedKeyName}" not found in generatedKeys map.`);
                    return; // Cannot seed this entity if reference is broken
                }
                resolvedPlaces[placeKey] = `@${referencedPubKey}`; // Replace name ref with pubkey ref
            }
            // Note: This doesn't handle nested references within place values that are objects/arrays yet.
        }
    }
    // --- End Place Reference Resolution ---

    // 4. Prepare LoroDoc content
    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Define the structure clearly for validation
    // Revert to using Record<string, any> for flexibility before validation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docJsonForValidation: Record<string, any> = {
        pubKey: pubKey,
        meta: {
            name: docDefinition.name,
            schema: schemaRef,
            owner: GENESIS_HOMINIO // Default owner for seeded docs
        },
        data: {
            places: resolvedPlaces,
            translations: docDefinition.translations || []
        }
    };

    // Populate LoroDoc from the JSON structure
    const metaMap = loroDoc.getMap('meta');
    for (const key in docJsonForValidation.meta) {
        metaMap.set(key, docJsonForValidation.meta[key]);
    }
    const dataMap = loroDoc.getMap('data');
    const placesMap = dataMap.setContainer('places', new LoroMap());
    for (const key in docJsonForValidation.data.places) {
        placesMap.set(key, docJsonForValidation.data.places[key]);
    }
    if (docJsonForValidation.data.translations.length > 0) {
        dataMap.set('translations', docJsonForValidation.data.translations);
    }

    // --- 4.5 Validate Structure --- //
    let isValid = true;
    let validationErrors: string[] = [];

    if (docType === 'schema') {
        console.log(`  - Validating structure for schema: ${docKey}...`);
        const result = validateSchemaJsonStructure(docJsonForValidation);
        isValid = result.isValid;
        validationErrors = result.errors;
    } else if (docType === 'entity' && referencedSchemaName) {
        const schemaPubKey = generatedKeys.get(referencedSchemaName);
        if (schemaPubKey) {
            console.log(`  - Validating entity "${docKey}" against schema "${referencedSchemaName}" (${schemaPubKey})...`);
            const schemaDocData = await db.select({ snapshotCid: schema.docs.snapshotCid })
                .from(schema.docs)
                .where(eq(schema.docs.pubKey, schemaPubKey)).limit(1);

            if (schemaDocData.length > 0 && schemaDocData[0].snapshotCid) {
                // Fetch content directly from DB using Drizzle
                const contentResult = await db.select({ raw: schema.content.raw })
                    .from(schema.content)
                    .where(eq(schema.content.cid, schemaDocData[0].snapshotCid))
                    .limit(1);

                if (contentResult.length > 0 && contentResult[0].raw) {
                    const snapshotData = contentResult[0].raw; // This should be Buffer/Uint8Array
                    const schemaLoroDoc = new LoroDoc();
                    schemaLoroDoc.import(snapshotData);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const schemaJson = schemaLoroDoc.toJSON() as Record<string, any>; // Revert to any
                    const result = validateEntityJsonAgainstSchema(docJsonForValidation, schemaJson);
                    isValid = result.isValid;
                    validationErrors = result.errors;
                } else {
                    isValid = false;
                    validationErrors.push(`Could not load snapshot content for schema ${schemaPubKey} (CID: ${schemaDocData[0].snapshotCid}) from database content table.`);
                }
            } else {
                isValid = false;
                validationErrors.push(`Could not find schema document ${schemaPubKey} in database docs table.`);
            }
        } else {
            isValid = false;
            validationErrors.push(`Schema ${referencedSchemaName} pubkey not found in generatedKeys.`);
        }
    }

    if (!isValid) {
        console.error(`  - ❌ Validation Failed for ${docType} ${docKey}:`);
        validationErrors.forEach((err: string) => console.error(`    - ${err}`));
        console.warn(`  - Skipping database insertion for invalid ${docType}: ${docKey}`);
        return; // Do not proceed if validation fails
    }
    console.log(`  - ✅ Structure validation passed for ${docType}: ${docKey}`);
    // --- End Validation --- //

    // 5. Export snapshot and hash
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    // 6. Upsert Content Entry
    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            metadata: { // Add relevant metadata for content
                name: docDefinition.name,
                schema: schemaRef,
                docType: docType
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
        owner: docJsonForValidation.meta.owner, // Use owner from prepared JSON
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
        // Ensure gismu is first
        if (schemasToSeed['gismu']) {
            await seedDocument(db, 'gismu', schemasToSeed['gismu'], 'schema', generatedKeys);
        }
        // Seed remaining schemas
        for (const schemaKey in schemasToSeed) {
            if (schemaKey !== 'gismu') {
                await seedDocument(db, schemaKey, schemasToSeed[schemaKey], 'schema', generatedKeys);
            }
        }
        console.log("\n✅ Schema seeding completed.");

        // --- Phase 2: Seed Entities ---
        console.log("\n--- Seeding Entities ---");
        for (const entityKey in entitiesToSeed) {
            await seedDocument(db, entityKey, entitiesToSeed[entityKey], 'entity', generatedKeys);
        }
        console.log("\n✅ Entity seeding completed.");

        // --- Final Output ---
        console.log('\n✅ Database seeding completed successfully.');
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