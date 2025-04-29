import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { LoroDoc, LoroMap, LoroText, LoroList } from 'loro-crdt';
import { blake3 } from '@noble/hashes/blake3';
import b4a from 'b4a';
import * as schema from './schema';
import { GENESIS_HOMINIO, GENESIS_PUBKEY } from './constants';

// Import data from seeding files
import { initialLeaves } from './seeding/leaf.data';
import { initialSchemas } from './seeding/schema.data';
import { initialComposites } from './seeding/composite.data';
import type { LeafRecord } from './seeding/leaf.data';
import type { SchemaRecord } from './seeding/schema.data';
import type { CompositeRecord } from './seeding/composite.data';

// Define semantic names for Index indices (used as seeds for deterministic keys)
const INDEX_SEMANTIC_NAME_META = '@facki_meta'; // Corresponds to GENESIS_PUBKEY
const INDEX_SEMANTIC_NAME_LEAF = '@facki_sumti';
const INDEX_SEMANTIC_NAME_SCHEMA = '@facki_selbri';
const INDEX_SEMANTIC_NAME_COMPOSITE = '@facki_bridi';
const INDEX_SEMANTIC_NAME_COMPOSITE_BY_COMPONENT = '@facki_bridi_by_component';

// Helper type for json data
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

async function hashSnapshot(snapshot: Uint8Array): Promise<string> {
    const hashBytes = blake3(snapshot);
    return b4a.toString(hashBytes, 'hex');
}

async function generateDeterministicPubKey(seed: string): Promise<string> {
    const hashBytes = blake3(b4a.from(seed, 'utf8'));
    const hexString = b4a.toString(hashBytes, 'hex');
    // Prefix with '0x' to match expected format, ensure fixed length if needed
    // Ensure the generated key length matches other pubkeys if necessary
    return `0x${hexString.padStart(64, '0')}`; // Example: Pad to 64 hex chars (32 bytes)
}

// Function to create the core LoroDoc for a Leaf/Index record
async function createLoroDocForLeaf(
    leafRecord: LeafRecord,
    generatedKeys: Map<string, string>,
    recordGeneratedPubKey: string
): Promise<LoroDoc> {
    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    const metadataMap = loroDoc.getMap('metadata');
    metadataMap.set('type', leafRecord.metadata.type);

    const dataMap = loroDoc.getMap('data');
    const dataType = leafRecord.data.type;
    dataMap.set('type', dataType);

    if (recordGeneratedPubKey === GENESIS_PUBKEY && dataType === 'LoroMap') {
        const valueMap = dataMap.setContainer('value', new LoroMap());
        if (leafRecord.data && 'value' in leafRecord.data && typeof leafRecord.data.value === 'object' && leafRecord.data.value !== null) {
            const metaIndexInputValue = leafRecord.data.value as Record<string, string>;
            for (const semanticKey in metaIndexInputValue) {
                const targetIndexSemanticName = metaIndexInputValue[semanticKey];
                const generatedIndexPubKey = generatedKeys.get(targetIndexSemanticName);
                if (generatedIndexPubKey) {
                    valueMap.set(semanticKey, generatedIndexPubKey);
                    console.log(`    [Seed Meta Index] Mapped ${semanticKey} ('${targetIndexSemanticName}') -> ${generatedIndexPubKey}`);
                } else {
                    console.error(`    [Seed Meta Index] Failed to find generated key for semantic name: ${targetIndexSemanticName}`);
                }
            }
        } else {
            console.error(`[Seed Meta Index] Invalid input data.value structure for meta index record (@index_meta):`, leafRecord.data);
        }
    } else if (
        (recordGeneratedPubKey === generatedKeys.get(INDEX_SEMANTIC_NAME_LEAF) ||
            recordGeneratedPubKey === generatedKeys.get(INDEX_SEMANTIC_NAME_SCHEMA) ||
            recordGeneratedPubKey === generatedKeys.get(INDEX_SEMANTIC_NAME_COMPOSITE) ||
            recordGeneratedPubKey === generatedKeys.get(INDEX_SEMANTIC_NAME_COMPOSITE_BY_COMPONENT)) &&
        dataType === 'LoroMap'
    ) {
        dataMap.setContainer('value', new LoroMap()); // Create the nested value map (starts empty)
        if (leafRecord.data && 'value' in leafRecord.data && typeof leafRecord.data.value === 'object' && leafRecord.data.value !== null && Object.keys(leafRecord.data.value).length === 0) {
            console.log(`[Seed Index] Initialized empty LoroMap for index ${recordGeneratedPubKey}`);
        } else {
            console.warn(`[Seed Index] Index Leaf (${recordGeneratedPubKey}) input data.value is not an empty object as expected. Forcing empty map. Input:`, leafRecord.data.value);
        }
    } else if (dataType === 'LoroMap' && 'value' in leafRecord.data) {
        const valueMap = dataMap.setContainer('value', new LoroMap());
        const mapData = leafRecord.data.value as Record<string, unknown>;
        if (Object.keys(mapData).length > 0) {
            console.log(`[Seed LoroMap] Populating data.value for Leaf ${recordGeneratedPubKey}. Value:`, mapData);
            for (const key in mapData) {
                // Allow complex objects within LoroMap values if they are JSON-compatible
                if (typeof mapData[key] === 'string' || typeof mapData[key] === 'number' || typeof mapData[key] === 'boolean' || mapData[key] === null || typeof mapData[key] === 'object') {
                    valueMap.set(key, mapData[key] as LoroJsonValue);
                } else {
                    console.warn(`[Seed LoroMap] Skipping invalid value type for key '${key}' in Leaf ${recordGeneratedPubKey}:`, mapData[key]);
                }
            }
        }
    } else if (dataType === 'LoroText' && 'value' in leafRecord.data) {
        if (typeof leafRecord.data.value === 'string') {
            const valueText = dataMap.setContainer('value', new LoroText());
            valueText.insert(0, leafRecord.data.value);
        } else {
            console.error(`[Seed LoroText] Invalid value type for LoroText Leaf ${recordGeneratedPubKey}. Expected string, got:`, typeof leafRecord.data.value);
            const valueText = dataMap.setContainer('value', new LoroText());
            valueText.insert(0, ''); // Default to empty string
        }
    } else if ((dataType === 'LoroList' || dataType === 'LoroMovableList') && 'value' in leafRecord.data) {
        if (Array.isArray(leafRecord.data.value)) {
            const valueList = dataMap.setContainer('value', new LoroList());
            // Ensure items are JSON-compatible before pushing
            (leafRecord.data.value as unknown[]).forEach(item => {
                if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null || typeof item === 'object') {
                    valueList.push(item as LoroJsonValue);
                } else {
                    console.warn(`[Seed LoroList] Skipping invalid value type in list for Leaf ${recordGeneratedPubKey}:`, item);
                }
            });
        } else {
            console.error(`[Seed LoroList] Invalid value type for ${dataType} Leaf ${recordGeneratedPubKey}. Expected array, got:`, typeof leafRecord.data.value);
            dataMap.setContainer('value', new LoroList()); // Default to empty list
        }
    } else if (dataType === 'Concept') {
        if ('value' in leafRecord.data) {
            console.warn(`[Seed Concept] Concept Leaf ${recordGeneratedPubKey} unexpectedly has a 'value' field in its input data. Ignoring it. Input data:`, leafRecord.data);
        }
        // Concepts don't have a 'value' container in the LoroDoc
    } else {
        console.warn(`[Seed Fallback] Unhandled data type or structure for Leaf ${recordGeneratedPubKey} with type '${dataType}'. Setting data.value to null. Input data:`, leafRecord.data);
        dataMap.set('value', null); // Set primitive null for fallback
    }

    return loroDoc;
}

async function seedLeafDocument(
    db: ReturnType<typeof drizzle>,
    leafRecord: LeafRecord,
    generatedKeys: Map<string, string>, // Map: semantic name/original key -> generated key
    recordGeneratedPubKey: string // The pre-generated pubkey for this record
): Promise<{ contentEntry: schema.InsertContent; docEntry: schema.InsertDoc } | null> {

    const originalKeyOrSemanticName = leafRecord.pubkey; // This is now just the original identifier or semantic name
    const pubKey = recordGeneratedPubKey; // Use the passed-in generated key

    console.log(`Processing Leaf/Index: ${originalKeyOrSemanticName} -> ${pubKey}`);

    // Create the LoroDoc using the helper function
    const loroDoc = await createLoroDocForLeaf(leafRecord, generatedKeys, pubKey);

    // Export snapshot and save to database
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    // --- Prepare data instead of inserting ---
    const contentEntry: schema.InsertContent = {
        cid: cid,
        type: 'snapshot',
        raw: Buffer.from(snapshot),
        createdAt: now
    };

    const docEntry: schema.InsertDoc = {
        pubKey: pubKey, // Use the generated pubKey
        snapshotCid: cid,
        updateCids: [],
        owner: GENESIS_HOMINIO,
        updatedAt: now,
        createdAt: now
    };

    console.log(`  - Prepared Leaf/Index: ${originalKeyOrSemanticName} -> ${pubKey} (CID: ${cid.substring(0, 10)}...)`);
    return { contentEntry, docEntry };
}

async function seedSchemaDocument(
    db: ReturnType<typeof drizzle>,
    schemaRecord: SchemaRecord,
    generatedKeys: Map<string, string> // Map: original key -> generated key
): Promise<{ contentEntry: schema.InsertContent; docEntry: schema.InsertDoc } | null> {
    const originalPubKey = schemaRecord.pubkey;

    // Get the pre-generated pubkey for this record
    const pubKey = generatedKeys.get(originalPubKey);
    if (!pubKey) {
        console.error(`❌ ERROR creating Schema ${originalPubKey}: Generated key not found.`);
        return null;
    }

    console.log(`Processing Schema: ${originalPubKey} -> ${pubKey}`);

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Set metadata directly at the root
    const metadataMap = loroDoc.getMap('metadata');
    metadataMap.set('type', schemaRecord.metadata.type);

    // Set data with schemaId reference remapped to the generated pubkey
    const dataMap = loroDoc.getMap('data');
    // Use const as it's not reassigned
    const originalSchemaRef = schemaRecord.data.schemaId;
    let schemaRefToStore = originalSchemaRef; // Default to original

    // If the reference itself should be a generated key, look it up
    if (generatedKeys.has(originalSchemaRef)) {
        schemaRefToStore = generatedKeys.get(originalSchemaRef)!;
    } else if (originalSchemaRef.startsWith('@') && !originalSchemaRef.startsWith('@facki_')) {
        console.warn(`[Seed Schema] Reference '${originalSchemaRef}' for Schema ${originalPubKey} was not found in generatedKeys.`);
    }

    dataMap.set('schemaId', schemaRefToStore); // Store the potentially remapped reference
    dataMap.set('name', schemaRecord.data.name);

    // Set places with place structure
    const placesMap = dataMap.setContainer('places', new LoroMap());
    if (schemaRecord.data.places.x1) placesMap.set('x1', schemaRecord.data.places.x1);
    if (schemaRecord.data.places.x2) placesMap.set('x2', schemaRecord.data.places.x2);
    if (schemaRecord.data.places.x3) placesMap.set('x3', schemaRecord.data.places.x3);
    if (schemaRecord.data.places.x4) placesMap.set('x4', schemaRecord.data.places.x4);
    if (schemaRecord.data.places.x5) placesMap.set('x5', schemaRecord.data.places.x5);

    if (schemaRecord.data.translations) {
        dataMap.set('translations', schemaRecord.data.translations);
    }

    // Export snapshot and save to database
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    // --- Prepare data instead of inserting ---
    const contentEntry: schema.InsertContent = {
        cid: cid,
        type: 'snapshot',
        raw: Buffer.from(snapshot),
        createdAt: now
    };

    const docEntry: schema.InsertDoc = {
        pubKey: pubKey, // Use the generated pubKey
        snapshotCid: cid,
        updateCids: [],
        owner: GENESIS_HOMINIO,
        updatedAt: now,
        createdAt: now
    };

    console.log(`  - Prepared Schema: ${originalPubKey} -> ${pubKey} (CID: ${cid.substring(0, 10)}...)`);
    return { contentEntry, docEntry };
}

async function seedCompositeDocument(
    db: ReturnType<typeof drizzle>,
    compositeRecord: CompositeRecord,
    generatedKeys: Map<string, string> // Map: original key -> generated key
): Promise<{ contentEntry: schema.InsertContent; docEntry: schema.InsertDoc } | null> {
    const originalPubKey = compositeRecord.pubkey;

    // Get the pre-generated pubkey for this record
    const pubKey = generatedKeys.get(originalPubKey);
    if (!pubKey) {
        console.error(`❌ ERROR creating Composite ${originalPubKey}: Generated key not found.`);
        return null;
    }

    console.log(`Processing Composite: ${originalPubKey} -> ${pubKey}`);

    // Check referenced schema BEFORE creating the document
    const originalSchemaRef = compositeRecord.data.schemaId;
    const schemaRef = generatedKeys.get(originalSchemaRef);
    if (!schemaRef) {
        console.error(`❌ ERROR creating Composite ${originalPubKey}: Referenced schema ${originalSchemaRef} not found in generatedKeys.`);
        return null;
    }

    // Check all referenced leaves BEFORE creating the document
    const missingLeafRefs: { place: string, originalRef: string }[] = []; // Store place and ref
    for (const place of ['x1', 'x2', 'x3', 'x4', 'x5'] as const) {
        const originalValue = compositeRecord.data.places[place];
        // Only check strings starting with '@' (potential references)
        if (originalValue && typeof originalValue === 'string' && originalValue.startsWith('@')) {
            if (!generatedKeys.has(originalValue)) {
                missingLeafRefs.push({ place, originalRef: originalValue });
            }
        }
    }
    if (missingLeafRefs.length > 0) {
        const missingDetails = missingLeafRefs.map(m => `${m.place}: ${m.originalRef}`).join(', ');
        console.error(`❌ ERROR creating Composite ${originalPubKey}: Referenced leaf not found in generatedKeys: ${missingDetails}.`);
        return null; // Prevent seeding this Composite if dependencies are missing
    }

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Set metadata directly at the root
    const metadataMap = loroDoc.getMap('metadata');
    metadataMap.set('type', compositeRecord.metadata.type);

    // Set data
    const dataMap = loroDoc.getMap('data');
    dataMap.set('schemaId', schemaRef);

    // Set places with place structure, remapping any references
    const placesMap = dataMap.setContainer('places', new LoroMap());
    // Using type-safe approach for places place properties
    for (const place of ['x1', 'x2', 'x3', 'x4', 'x5'] as const) {
        const originalValue = compositeRecord.data.places[place];
        if (originalValue) {
            // If this is a reference (starts with @), replace with its mapped pubkey
            if (typeof originalValue === 'string' && originalValue.startsWith('@') && generatedKeys.has(originalValue)) {
                const mappedLeafKey = generatedKeys.get(originalValue)!;
                placesMap.set(place, mappedLeafKey); // Use the mapped key
            } else {
                placesMap.set(place, originalValue); // Use the original literal value
            }
        }
    }

    // Export snapshot and save to database
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    // --- Prepare data instead of inserting ---
    const contentEntry: schema.InsertContent = {
        cid: cid,
        type: 'snapshot',
        raw: Buffer.from(snapshot),
        createdAt: now
    };

    const docEntry: schema.InsertDoc = {
        pubKey: pubKey, // Use the generated pubKey
        snapshotCid: cid,
        updateCids: [],
        owner: GENESIS_HOMINIO,
        updatedAt: now,
        createdAt: now
    };

    console.log(`  - Prepared Composite: ${originalPubKey} -> ${pubKey} (CID: ${cid.substring(0, 10)}...)`);
    return { contentEntry, docEntry };
}

async function main() {
    const dbUrl = process.env.SECRET_DATABASE_URL_HOMINIO;

    if (!dbUrl) {
        console.error('❌ Database URL not found in environment variables');
        process.exit(1);
    }

    console.log('🌱 Seeding database with structure data...');

    try {
        const sql = neon(dbUrl);
        const db = drizzle(sql, { schema });

        const generatedKeys = new Map<string, string>();
        // Manually set the GENESIS_PUBKEY as it's predefined
        generatedKeys.set(INDEX_SEMANTIC_NAME_META, GENESIS_PUBKEY);

        // --- Pre-generate Keys for all Index indices ---
        const indexSemanticNames = [
            INDEX_SEMANTIC_NAME_LEAF,
            INDEX_SEMANTIC_NAME_SCHEMA,
            INDEX_SEMANTIC_NAME_COMPOSITE,
            INDEX_SEMANTIC_NAME_COMPOSITE_BY_COMPONENT
        ];
        console.log("--- Pre-generating Index PubKeys ---");
        for (const name of indexSemanticNames) {
            const genKey = await generateDeterministicPubKey(name);
            generatedKeys.set(name, genKey);
            console.log(`  ${name} -> ${genKey}`);
        }

        // --- Pre-generate Keys for all regular Leaf, Schema, Composite ---
        console.log("\n--- Pre-generating Content PubKeys ---");
        const allContentRecords = [
            ...initialLeaves,
            ...initialSchemas,
            ...initialComposites
        ];
        for (const record of allContentRecords) {
            const originalKey = record.pubkey;
            // Skip if it's a Index semantic name (already handled) or GENESIS
            if (!originalKey.startsWith('@facki_') && originalKey !== GENESIS_PUBKEY && !generatedKeys.has(originalKey)) {
                const genKey = await generateDeterministicPubKey(originalKey);
                generatedKeys.set(originalKey, genKey);
                // console.log(`  ${originalKey} -> ${genKey}`); // Optional: Log generated keys
            }
        }
        console.log(`  Pre-generated keys for ${generatedKeys.size - 1 - indexSemanticNames.length} content records.`); // Adjust count


        // --- Prepare data arrays ---
        const allContentEntries: schema.InsertContent[] = [];
        const allDocEntries: schema.InsertDoc[] = [];

        // Define Index records using the semantic names as placeholders
        const indexLeafRecordsToSeed: LeafRecord[] = [
            // Meta Index Leaf (Special - GENESIS_PUBKEY)
            {
                pubkey: INDEX_SEMANTIC_NAME_META,
                metadata: { type: 'Leaf' },
                data: {
                    type: 'LoroMap', // Use LoroMap type for the index itself
                    value: { // Map semantic key to semantic name for lookup during seeding
                        leaves: INDEX_SEMANTIC_NAME_LEAF,
                        schemas: INDEX_SEMANTIC_NAME_SCHEMA,
                        composites: INDEX_SEMANTIC_NAME_COMPOSITE,
                        composites_by_component: INDEX_SEMANTIC_NAME_COMPOSITE_BY_COMPONENT
                    }
                }
            },
            // Other Index Leaves (Start empty)
            {
                pubkey: INDEX_SEMANTIC_NAME_LEAF,
                metadata: { type: 'Index' },
                data: { type: 'LoroMap', value: {} } // Index starts as empty LoroMap
            },
            {
                pubkey: INDEX_SEMANTIC_NAME_SCHEMA,
                metadata: { type: 'Index' },
                data: { type: 'LoroMap', value: {} } // Index starts as empty LoroMap
            },
            {
                pubkey: INDEX_SEMANTIC_NAME_COMPOSITE,
                metadata: { type: 'Index' },
                data: { type: 'LoroMap', value: {} } // Index starts as empty LoroMap
            },
            {
                pubkey: INDEX_SEMANTIC_NAME_COMPOSITE_BY_COMPONENT,
                metadata: { type: 'Index' },
                data: { type: 'LoroMap', value: {} } // Index starts as empty LoroMap
            },
        ];


        // 1. Prepare Index records using their pre-generated keys
        console.log("\n--- Preparing Index Records ---");
        for (const index of indexLeafRecordsToSeed) {
            const generatedPubKey = generatedKeys.get(index.pubkey); // Get pre-generated key using semantic name
            if (!generatedPubKey) {
                console.error(`❌ ERROR: Could not find pre-generated key for Index record: ${index.pubkey}`);
                continue;
            }
            const prepared = await seedLeafDocument(db, index, generatedKeys, generatedPubKey);
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
            }
        }

        // 2. Prepare Leaf records using their pre-generated keys
        console.log("\n--- Preparing Leaf Records ---");
        for (const leaf of initialLeaves) {
            const generatedPubKey = generatedKeys.get(leaf.pubkey); // Get pre-generated key
            if (!generatedPubKey) {
                console.error(`❌ ERROR: Could not find pre-generated key for Leaf record: ${leaf.pubkey}`);
                continue;
            }
            const prepared = await seedLeafDocument(db, leaf, generatedKeys, generatedPubKey);
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
            }
        }

        // 3. Prepare Schema records using their pre-generated keys
        console.log("\n--- Preparing Schema Records ---");
        for (const schema of initialSchemas) {
            const generatedPubKey = generatedKeys.get(schema.pubkey); // Get pre-generated key
            if (!generatedPubKey) {
                console.error(`❌ ERROR: Could not find pre-generated key for Schema record: ${schema.pubkey}`);
                continue;
            }
            const prepared = await seedSchemaDocument(db, schema, generatedKeys); // Pass map
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
            }
        }

        // 4. Prepare Composite records using their pre-generated keys
        console.log("\n--- Preparing Composite Records ---");
        const successfullySeededCompositePubkeys = new Set<string>();
        for (const composite of initialComposites) {
            const generatedPubKey = generatedKeys.get(composite.pubkey); // Get pre-generated key
            if (!generatedPubKey) {
                console.error(`❌ ERROR: Could not find pre-generated key for Composite record: ${composite.pubkey}`);
                continue;
            }
            const prepared = await seedCompositeDocument(db, composite, generatedKeys); // Pass map
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
                successfullySeededCompositePubkeys.add(prepared.docEntry.pubKey);
            }
        }

        // --- Perform Batch Inserts --- 
        console.log(`\n--- Inserting ${allContentEntries.length} Content Entries ---`);
        if (allContentEntries.length > 0) {
            // Insert content entries, ignore conflicts on CID
            await db.insert(schema.content)
                .values(allContentEntries)
                .onConflictDoNothing({ target: schema.content.cid });
            console.log("✅ Content entries inserted.");
        } else {
            console.log("  - No new content entries to insert.");
        }

        console.log(`\n--- Inserting ${allDocEntries.length} Document Entries ---`);
        if (allDocEntries.length > 0) {
            // Insert doc entries, update snapshotCid and updatedAt on conflict
            await db.insert(schema.docs)
                .values(allDocEntries)
                .onConflictDoUpdate({
                    target: schema.docs.pubKey,
                    set: {
                        snapshotCid: schema.docs.snapshotCid, // Reference column directly
                        updatedAt: schema.docs.updatedAt      // Reference column directly
                    }
                });
            console.log("✅ Document entries inserted/updated.");
        } else {
            console.log("  - No new document entries to insert.");
        }

        console.log('\n✅ Database seeding completed successfully (Document creation only).');
        console.log('\nGenerated Keys Map: (Original -> Generated)');
        console.log('----------------------------------------');
        for (const [originalOrSemantic, generated] of generatedKeys.entries()) {
            // Optionally filter to only show non-facki/non-genesis mappings if desired
            // if (!originalOrSemantic.startsWith('@') && originalOrSemantic !== GENESIS_PUBKEY) {
            console.log(`${originalOrSemantic} -> ${generated}`);
            // }
        }

    } catch (error) {
        console.error('\n❌ Error during database seeding:', error);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
}); 