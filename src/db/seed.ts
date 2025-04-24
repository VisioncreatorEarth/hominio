import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { LoroDoc, LoroMap } from 'loro-crdt';
import { blake3 } from '@noble/hashes/blake3';
import b4a from 'b4a';
import * as schema from './schema';
import { GENESIS_HOMINIO, GENESIS_PUBKEY } from './constants';

// Import data from seeding files
import { initialSumti } from './seeding/sumti';
import { initialSelbri } from './seeding/selbri';
import { initialBridi } from './seeding/bridi';
import type { SumtiRecord } from './seeding/sumti';
import type { SelbriRecord } from './seeding/selbri';
import type { BridiRecord } from './seeding/bridi';

// Define semantic names for Facki indices (used as seeds for deterministic keys)
const FACKI_SEMANTIC_NAME_META = '@facki_meta'; // Corresponds to GENESIS_PUBKEY
const FACKI_SEMANTIC_NAME_SUMTI = '@facki_sumti';
const FACKI_SEMANTIC_NAME_SELBRI = '@facki_selbri';
const FACKI_SEMANTIC_NAME_BRIDI = '@facki_bridi';
const FACKI_SEMANTIC_NAME_BRIDI_BY_COMPONENT = '@facki_bridi_by_component';

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

// Function to create the core LoroDoc for a Sumti/Facki record
async function createLoroDocForSumti(
    sumtiRecord: SumtiRecord,
    generatedKeys: Map<string, string>, // Map of semantic name/original key -> generated key
    recordGeneratedPubKey: string // The actual generated pubkey for this specific record
): Promise<LoroDoc> {
    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1); // Use a consistent Peer ID for seeding

    // Set ckaji directly at the root
    const ckajiMap = loroDoc.getMap('ckaji');
    ckajiMap.set('klesi', sumtiRecord.ckaji.klesi);
    if (sumtiRecord.ckaji.cmene) {
        ckajiMap.set('cmene', sumtiRecord.ckaji.cmene);
    }

    // Special handling for the @genesis/@facki_meta document
    if (recordGeneratedPubKey === GENESIS_PUBKEY) {
        const datniContainer = loroDoc.getMap('datni');

        // Check if datni exists and is the expected LoroMap structure
        if (sumtiRecord.datni && 'klesi' in sumtiRecord.datni && sumtiRecord.datni.klesi === 'LoroMap' && 'vasru' in sumtiRecord.datni && typeof sumtiRecord.datni.vasru === 'object' && sumtiRecord.datni.vasru !== null) {
            // Populate datni with mappings from semantic key ('sumti') to generated key ('0x...')
            const fackiMetaVasru = sumtiRecord.datni.vasru as Record<string, string>; // e.g., { sumti: '@facki_sumti', ... }
            for (const semanticKey in fackiMetaVasru) {
                const semanticNameSeed = fackiMetaVasru[semanticKey]; // e.g., '@facki_sumti'
                const generatedIndexPubKey = generatedKeys.get(semanticNameSeed); // Look up the generated key for '@facki_sumti'
                if (generatedIndexPubKey) {
                    datniContainer.set(semanticKey, generatedIndexPubKey); // Store { sumti: '0x...' }
                    console.log(`    [Seed @genesis] Mapped ${semanticKey} ('${semanticNameSeed}') -> ${generatedIndexPubKey}`);
                } else {
                    console.error(`    [Seed @genesis] Failed to find generated key for semantic name: ${semanticNameSeed}`);
                }
            }
        } else {
            console.error(`[Seed @genesis] Invalid datni structure for @genesis record:`, sumtiRecord.datni);
        }
    } else if (sumtiRecord.datni) {
        // Handle other Sumti/Facki documents (e.g., the index documents themselves)
        const datniKlesi = sumtiRecord.datni.klesi;

        if (datniKlesi === 'LoroMap' && 'vasru' in sumtiRecord.datni) {
            // Get the container, but don't assign if not used immediately
            loroDoc.getMap('datni'); // Ensures the map exists
            const mapData = sumtiRecord.datni.vasru as Record<string, unknown>;
            // Indices should start empty, so mapData should be {}
            if (Object.keys(mapData).length !== 0) {
                console.warn(`[Seed] Index document ${sumtiRecord.ckaji.cmene} (${recordGeneratedPubKey}) datni.vasru is not empty as expected. Vasru:`, mapData);
            }
        } else if (datniKlesi === 'LoroText' && 'vasru' in sumtiRecord.datni) {
            const datniContainer = loroDoc.getText('datni');
            datniContainer.insert(0, sumtiRecord.datni.vasru as string);
        } else if ((datniKlesi === 'LoroList' || datniKlesi === 'LoroMovableList') && 'vasru' in sumtiRecord.datni) {
            const datniContainer = loroDoc.getList('datni');
            (sumtiRecord.datni.vasru as unknown[]).forEach((item, index) => {
                datniContainer.insert(index, item);
            });
        } else if (datniKlesi === 'concept') {
            // Handle 'concept' type if necessary
        } else {
            const datniContainer = loroDoc.getMap('datni');
            datniContainer.set('raw', sumtiRecord.datni);
            console.warn(`Unhandled datni klesi '${datniKlesi}' for Sumti ${sumtiRecord.ckaji.cmene}. Storing raw datni.`);
        }
    }
    return loroDoc;
}

async function seedSumtiDocument(
    db: ReturnType<typeof drizzle>,
    sumtiRecord: SumtiRecord,
    generatedKeys: Map<string, string>, // Map: semantic name/original key -> generated key
    recordGeneratedPubKey: string // The pre-generated pubkey for this record
): Promise<{ contentEntry: schema.InsertContent; docEntry: schema.InsertDoc } | null> {

    const originalKeyOrSemanticName = sumtiRecord.pubkey; // This is now just the original identifier or semantic name
    const pubKey = recordGeneratedPubKey; // Use the passed-in generated key

    console.log(`Processing Sumti/Facki: ${originalKeyOrSemanticName} -> ${pubKey}`);

    // Create the LoroDoc using the helper function
    const loroDoc = await createLoroDocForSumti(sumtiRecord, generatedKeys, pubKey);

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

    console.log(`  - Prepared Sumti/Facki: ${originalKeyOrSemanticName} -> ${pubKey} (CID: ${cid.substring(0, 10)}...)`);
    return { contentEntry, docEntry };
}

async function seedSelbriDocument(
    db: ReturnType<typeof drizzle>,
    selbriRecord: SelbriRecord,
    generatedKeys: Map<string, string> // Map: original key -> generated key
): Promise<{ contentEntry: schema.InsertContent; docEntry: schema.InsertDoc } | null> {
    const originalPubKey = selbriRecord.pubkey;

    // Get the pre-generated pubkey for this record
    const pubKey = generatedKeys.get(originalPubKey);
    if (!pubKey) {
        console.error(`❌ ERROR creating Selbri ${originalPubKey}: Generated key not found.`);
        return null;
    }

    console.log(`Processing Selbri: ${originalPubKey} -> ${pubKey}`);

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Set ckaji directly at the root
    const ckajiMap = loroDoc.getMap('ckaji');
    ckajiMap.set('klesi', selbriRecord.ckaji.klesi);

    // Set datni with selbri reference remapped to the generated pubkey
    const datniMap = loroDoc.getMap('datni');
    // Use const as it's not reassigned
    const originalSelbriRef = selbriRecord.datni.selbri;
    let selbriRefToStore = originalSelbriRef; // Default to original

    // If the reference itself should be a generated key, look it up
    if (generatedKeys.has(originalSelbriRef)) {
        selbriRefToStore = generatedKeys.get(originalSelbriRef)!;
    } else if (originalSelbriRef.startsWith('@') && !originalSelbriRef.startsWith('@facki_')) {
        console.warn(`[Seed Selbri] Reference '${originalSelbriRef}' for Selbri ${originalPubKey} was not found in generatedKeys.`);
    }

    datniMap.set('selbri', selbriRefToStore); // Store the potentially remapped reference
    datniMap.set('cneme', selbriRecord.datni.cneme);

    // Set sumti with place structure
    const sumtiMap = datniMap.setContainer('sumti', new LoroMap());
    if (selbriRecord.datni.sumti.x1) sumtiMap.set('x1', selbriRecord.datni.sumti.x1);
    if (selbriRecord.datni.sumti.x2) sumtiMap.set('x2', selbriRecord.datni.sumti.x2);
    if (selbriRecord.datni.sumti.x3) sumtiMap.set('x3', selbriRecord.datni.sumti.x3);
    if (selbriRecord.datni.sumti.x4) sumtiMap.set('x4', selbriRecord.datni.sumti.x4);
    if (selbriRecord.datni.sumti.x5) sumtiMap.set('x5', selbriRecord.datni.sumti.x5);

    if (selbriRecord.datni.fanva) {
        datniMap.set('fanva', selbriRecord.datni.fanva);
    }

    if (selbriRecord.datni.stidi) {
        datniMap.set('stidi', selbriRecord.datni.stidi);
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

    console.log(`  - Prepared Selbri: ${originalPubKey} -> ${pubKey} (CID: ${cid.substring(0, 10)}...)`);
    return { contentEntry, docEntry };
}

async function seedBridiDocument(
    db: ReturnType<typeof drizzle>,
    bridiRecord: BridiRecord,
    generatedKeys: Map<string, string> // Map: original key -> generated key
): Promise<{ contentEntry: schema.InsertContent; docEntry: schema.InsertDoc } | null> {
    const originalPubKey = bridiRecord.pubkey;

    // Get the pre-generated pubkey for this record
    const pubKey = generatedKeys.get(originalPubKey);
    if (!pubKey) {
        console.error(`❌ ERROR creating Bridi ${originalPubKey}: Generated key not found.`);
        return null;
    }

    console.log(`Processing Bridi: ${originalPubKey} -> ${pubKey}`);

    // Check referenced selbri BEFORE creating the document
    const originalSelbriRef = bridiRecord.datni.selbri;
    const selbriRef = generatedKeys.get(originalSelbriRef);
    if (!selbriRef) {
        console.error(`❌ ERROR creating Bridi ${originalPubKey}: Referenced selbri ${originalSelbriRef} not found in generatedKeys.`);
        return null;
    }

    // Check all referenced sumti BEFORE creating the document
    const missingSumtiRefs: { place: string, originalRef: string }[] = []; // Store place and ref
    for (const place of ['x1', 'x2', 'x3', 'x4', 'x5'] as const) {
        const originalValue = bridiRecord.datni.sumti[place];
        // Only check strings starting with '@' (potential references)
        if (originalValue && typeof originalValue === 'string' && originalValue.startsWith('@')) {
            if (!generatedKeys.has(originalValue)) {
                missingSumtiRefs.push({ place, originalRef: originalValue });
            }
        }
    }
    if (missingSumtiRefs.length > 0) {
        const missingDetails = missingSumtiRefs.map(m => `${m.place}: ${m.originalRef}`).join(', ');
        console.error(`❌ ERROR creating Bridi ${originalPubKey}: Referenced sumti not found in generatedKeys: ${missingDetails}.`);
        return null; // Prevent seeding this Bridi if dependencies are missing
    }

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Set ckaji directly at the root
    const ckajiMap = loroDoc.getMap('ckaji');
    ckajiMap.set('klesi', bridiRecord.ckaji.klesi);

    // Set datni
    const datniMap = loroDoc.getMap('datni');
    datniMap.set('selbri', selbriRef);

    // Set sumti with place structure, remapping any references
    const sumtiMap = datniMap.setContainer('sumti', new LoroMap());
    // Using type-safe approach for sumti place properties
    for (const place of ['x1', 'x2', 'x3', 'x4', 'x5'] as const) {
        const originalValue = bridiRecord.datni.sumti[place];
        if (originalValue) {
            // If this is a reference (starts with @), replace with its mapped pubkey
            if (typeof originalValue === 'string' && originalValue.startsWith('@') && generatedKeys.has(originalValue)) {
                const mappedSumtiKey = generatedKeys.get(originalValue)!;
                sumtiMap.set(place, mappedSumtiKey); // Use the mapped key
            } else {
                sumtiMap.set(place, originalValue); // Use the original literal value
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

    console.log(`  - Prepared Bridi: ${originalPubKey} -> ${pubKey} (CID: ${cid.substring(0, 10)}...)`);
    return { contentEntry, docEntry };
}

async function main() {
    const dbUrl = process.env.SECRET_DATABASE_URL_HOMINIO;

    if (!dbUrl) {
        console.error('❌ Database URL not found in environment variables');
        process.exit(1);
    }

    console.log('🌱 Seeding database with Lojban structure data...');

    try {
        const sql = neon(dbUrl);
        const db = drizzle(sql, { schema });

        const generatedKeys = new Map<string, string>();
        // Manually set the GENESIS_PUBKEY as it's predefined
        generatedKeys.set(FACKI_SEMANTIC_NAME_META, GENESIS_PUBKEY);

        // --- Pre-generate Keys for all Facki indices ---
        const fackiSemanticNames = [
            FACKI_SEMANTIC_NAME_SUMTI,
            FACKI_SEMANTIC_NAME_SELBRI,
            FACKI_SEMANTIC_NAME_BRIDI,
            FACKI_SEMANTIC_NAME_BRIDI_BY_COMPONENT
        ];
        console.log("--- Pre-generating Facki Index PubKeys ---");
        for (const name of fackiSemanticNames) {
            const genKey = await generateDeterministicPubKey(name);
            generatedKeys.set(name, genKey);
            console.log(`  ${name} -> ${genKey}`);
        }

        // --- Pre-generate Keys for all regular Sumti, Selbri, Bridi ---
        console.log("\n--- Pre-generating Content PubKeys ---");
        const allContentRecords = [
            ...initialSumti,
            ...initialSelbri,
            ...initialBridi
        ];
        for (const record of allContentRecords) {
            const originalKey = record.pubkey;
            // Skip if it's a Facki semantic name (already handled) or GENESIS
            if (!originalKey.startsWith('@facki_') && originalKey !== GENESIS_PUBKEY && !generatedKeys.has(originalKey)) {
                const genKey = await generateDeterministicPubKey(originalKey);
                generatedKeys.set(originalKey, genKey);
                // console.log(`  ${originalKey} -> ${genKey}`); // Optional: Log generated keys
            }
        }
        console.log(`  Pre-generated keys for ${generatedKeys.size - 1 - fackiSemanticNames.length} content records.`); // Adjust count


        // --- Prepare data arrays ---
        const allContentEntries: schema.InsertContent[] = [];
        const allDocEntries: schema.InsertDoc[] = [];

        // Define Facki records using the semantic names as placeholders
        const fackiRecordsToSeed: SumtiRecord[] = [
            // System Index Sumti Definitions (Facki)
            {
                pubkey: FACKI_SEMANTIC_NAME_META, // Use semantic name
                ckaji: { klesi: 'Facki', cmene: '@facki_meta' }, // Keep cmene descriptive
                datni: {
                    klesi: 'LoroMap',
                    vasru: { // Map semantic key ('sumti') to semantic name ('@facki_sumti')
                        sumti: FACKI_SEMANTIC_NAME_SUMTI,
                        selbri: FACKI_SEMANTIC_NAME_SELBRI,
                        bridi: FACKI_SEMANTIC_NAME_BRIDI,
                        bridi_by_component: FACKI_SEMANTIC_NAME_BRIDI_BY_COMPONENT
                    }
                }
            },
            {
                pubkey: FACKI_SEMANTIC_NAME_SUMTI, // Use semantic name
                ckaji: { klesi: 'Facki', cmene: '@facki_sumti' },
                datni: { klesi: 'LoroMap', vasru: {} } // Index starts empty
            },
            {
                pubkey: FACKI_SEMANTIC_NAME_SELBRI, // Use semantic name
                ckaji: { klesi: 'Facki', cmene: '@facki_selbri' },
                datni: { klesi: 'LoroMap', vasru: {} } // Index starts empty
            },
            {
                pubkey: FACKI_SEMANTIC_NAME_BRIDI, // Use semantic name
                ckaji: { klesi: 'Facki', cmene: '@facki_bridi' },
                datni: { klesi: 'LoroMap', vasru: {} } // Index starts empty
            },
            {
                pubkey: FACKI_SEMANTIC_NAME_BRIDI_BY_COMPONENT, // Use semantic name
                ckaji: { klesi: 'Facki', cmene: '@facki_bridi_by_component' },
                datni: { klesi: 'LoroMap', vasru: {} } // Index starts empty
            },
        ];


        // 1. Prepare Facki records using their pre-generated keys
        console.log("\n--- Preparing Facki Records ---");
        for (const facki of fackiRecordsToSeed) {
            const generatedPubKey = generatedKeys.get(facki.pubkey); // Get pre-generated key using semantic name
            if (!generatedPubKey) {
                console.error(`❌ ERROR: Could not find pre-generated key for Facki record: ${facki.pubkey}`);
                continue;
            }
            const prepared = await seedSumtiDocument(db, facki, generatedKeys, generatedPubKey);
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
            }
        }

        // 2. Prepare Sumti records using their pre-generated keys
        console.log("\n--- Preparing Sumti Records ---");
        for (const sumti of initialSumti) {
            const generatedPubKey = generatedKeys.get(sumti.pubkey); // Get pre-generated key
            if (!generatedPubKey) {
                console.error(`❌ ERROR: Could not find pre-generated key for Sumti record: ${sumti.pubkey}`);
                continue;
            }
            const prepared = await seedSumtiDocument(db, sumti, generatedKeys, generatedPubKey);
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
            }
        }

        // 3. Prepare Selbri records using their pre-generated keys
        console.log("\n--- Preparing Selbri Records ---");
        for (const selbri of initialSelbri) {
            const generatedPubKey = generatedKeys.get(selbri.pubkey); // Get pre-generated key
            if (!generatedPubKey) {
                console.error(`❌ ERROR: Could not find pre-generated key for Selbri record: ${selbri.pubkey}`);
                continue;
            }
            const prepared = await seedSelbriDocument(db, selbri, generatedKeys); // Pass map
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
            }
        }

        // 4. Prepare Bridi records using their pre-generated keys
        console.log("\n--- Preparing Bridi Records ---");
        const successfullySeededBridiPubkeys = new Set<string>();
        for (const bridi of initialBridi) {
            const generatedPubKey = generatedKeys.get(bridi.pubkey); // Get pre-generated key
            if (!generatedPubKey) {
                console.error(`❌ ERROR: Could not find pre-generated key for Bridi record: ${bridi.pubkey}`);
                continue;
            }
            const prepared = await seedBridiDocument(db, bridi, generatedKeys); // Pass map
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
                successfullySeededBridiPubkeys.add(prepared.docEntry.pubKey);
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