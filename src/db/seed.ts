import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { LoroDoc, LoroMap, LoroList } from 'loro-crdt';
import { blake3 } from '@noble/hashes/blake3';
import b4a from 'b4a';
import * as schema from './schema';
import { eq } from 'drizzle-orm';
import { GENESIS_HOMINIO } from './constants';

// Import data from seeding files
import { initialSumti } from './seeding/sumti';
import { initialSelbri } from './seeding/selbri';
import { initialBridi } from './seeding/bridi';
import type { SumtiRecord } from './seeding/sumti';
import type { SelbriRecord } from './seeding/selbri';
import type { BridiRecord } from './seeding/bridi';

// Define Facki index pubkeys
const FACKI_META_PUBKEY = '@facki_meta';
const FACKI_SUMTI_PUBKEY = '@facki_sumti';
const FACKI_SELBRI_PUBKEY = '@facki_selbri';
const FACKI_BRIDI_PUBKEY = '@facki_bridi';
const FACKI_BRIDI_BY_COMPONENT_PUBKEY = '@facki_bridi_by_component';

// Define Facki records directly here - Updated Structure
const initialFacki: SumtiRecord[] = [
    // System Index Sumti Definitions (Facki)
    {
        pubkey: FACKI_META_PUBKEY,
        ckaji: { klesi: 'Facki', cmene: '@facki_meta' }, // Added cmene for consistency
        // Datni for meta now directly holds the map
        datni: {
            klesi: 'LoroMap', // This klesi describes the datni container itself
            vasru: {
                sumti: FACKI_SUMTI_PUBKEY,
                selbri: FACKI_SELBRI_PUBKEY,
                bridi: FACKI_BRIDI_PUBKEY,
                bridi_by_component: FACKI_BRIDI_BY_COMPONENT_PUBKEY
            }
        }
    },
    {
        pubkey: FACKI_SUMTI_PUBKEY,
        ckaji: { klesi: 'Facki', cmene: '@facki_sumti' },
        // Datni for Sumti index is now directly the map
        datni: { klesi: 'LoroMap', vasru: {} } // Simple key-value store
    },
    {
        pubkey: FACKI_SELBRI_PUBKEY,
        ckaji: { klesi: 'Facki', cmene: '@facki_selbri' },
        // Datni for Selbri index is now directly the map
        datni: { klesi: 'LoroMap', vasru: {} } // Simple key-value store
    },
    {
        pubkey: FACKI_BRIDI_PUBKEY,
        ckaji: { klesi: 'Facki', cmene: '@facki_bridi' },
        datni: { klesi: 'LoroMap', vasru: {} } // Simple key-value store
    },
    {
        pubkey: FACKI_BRIDI_BY_COMPONENT_PUBKEY,
        ckaji: { klesi: 'Facki', cmene: '@facki_bridi_by_component' },
        // Datni remains a LoroMap holding LoroLists
        datni: { klesi: 'LoroMap', vasru: {} } // Structure for component index
    },
];

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
    return `0x${hexString}`;
}

async function seedSumtiDocument(
    db: ReturnType<typeof drizzle>,
    sumtiRecord: SumtiRecord,
    generatedKeys: Map<string, string>
): Promise<{ contentEntry: schema.InsertContent; docEntry: schema.InsertDoc } | null> {
    const originalPubKey = sumtiRecord.pubkey;

    // Skip Facki records - keep their original pubkeys
    const isFackiRecord = originalPubKey.startsWith('@facki_');

    // Generate deterministic pubkey if not already in the map and not a Facki record
    let pubKey = originalPubKey;
    if (!generatedKeys.has(originalPubKey) && !isFackiRecord) {
        pubKey = await generateDeterministicPubKey(originalPubKey);
        generatedKeys.set(originalPubKey, pubKey);
    } else if (generatedKeys.has(originalPubKey)) {
        pubKey = generatedKeys.get(originalPubKey)!;
    }

    console.log(`Processing Sumti: ${originalPubKey} -> ${pubKey}`);

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Set ckaji directly at the root
    const ckajiMap = loroDoc.getMap('ckaji');
    ckajiMap.set('klesi', sumtiRecord.ckaji.klesi);
    if (sumtiRecord.ckaji.cmene) { // Keep cmene in ckaji for now
        ckajiMap.set('cmene', sumtiRecord.ckaji.cmene);
    }

    // Set datni directly at the root with appropriate CRDT container
    if (sumtiRecord.datni) {
        // Determine the type of container needed based on klesi
        const datniKlesi = sumtiRecord.datni.klesi;

        if (datniKlesi === 'LoroMap' && 'vasru' in sumtiRecord.datni) {
            const datniContainer = loroDoc.getMap('datni');
            const mapData = sumtiRecord.datni.vasru as Record<string, unknown>; // Safe access
            for (const key in mapData) {
                datniContainer.set(key, mapData[key]);
            }
        } else if (datniKlesi === 'LoroText' && 'vasru' in sumtiRecord.datni) {
            // Dynamically import if needed
            await import('loro-crdt'); // Import the module, but don't need to destructure LoroText if not used
            const datniContainer = loroDoc.getText('datni');
            const textValue = sumtiRecord.datni.vasru as string; // Safe access
            datniContainer.insert(0, textValue);
        } else if ((datniKlesi === 'LoroList' || datniKlesi === 'LoroMovableList') && 'vasru' in sumtiRecord.datni) {
            // Dynamically import if needed
            await import('loro-crdt'); // Import the module, but don't need to destructure LoroList if not used
            const datniContainer = loroDoc.getList('datni');
            const listData = sumtiRecord.datni.vasru as unknown[]; // Safe access
            listData.forEach((item, index) => {
                datniContainer.insert(index, item);
            });
        } else if (datniKlesi === 'concept') {
            // For 'concept', ckaji might be enough, or datni could be a simple flag/map
            // For now, let's just ensure ckaji is set (done above)
            // If datni needs specific structure for 'concept', add it here.
            // Example: loroDoc.getMap('datni').set('isConcept', true);
        } else {
            // Handle unknown or simple types - maybe store as plain value in a root datni map?
            // This case needs clarification based on actual Sumti types used.
            // Fallback: Create a map and put the raw datni object?
            const datniContainer = loroDoc.getMap('datni');
            datniContainer.set('raw', sumtiRecord.datni); // Store the original structure as fallback
            console.warn(`Unhandled datni klesi '${datniKlesi}' for Sumti ${originalPubKey}. Storing raw datni.`);
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
        pubKey: pubKey,
        snapshotCid: cid,
        updateCids: [],
        owner: GENESIS_HOMINIO,
        updatedAt: now,
        createdAt: now
    };

    console.log(`  - Prepared Sumti: ${originalPubKey} -> ${pubKey} (CID: ${cid.substring(0, 10)}...)`);
    return { contentEntry, docEntry };
}

async function seedSelbriDocument(
    db: ReturnType<typeof drizzle>,
    selbriRecord: SelbriRecord,
    generatedKeys: Map<string, string>
): Promise<{ contentEntry: schema.InsertContent; docEntry: schema.InsertDoc } | null> {
    const originalPubKey = selbriRecord.pubkey;

    // Generate deterministic pubkey if not already in the map
    let pubKey = originalPubKey;
    if (!generatedKeys.has(originalPubKey)) {
        pubKey = await generateDeterministicPubKey(originalPubKey);
        generatedKeys.set(originalPubKey, pubKey);
    } else {
        pubKey = generatedKeys.get(originalPubKey)!;
    }

    console.log(`Processing Selbri: ${originalPubKey} -> ${pubKey}`);

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Set ckaji directly at the root
    const ckajiMap = loroDoc.getMap('ckaji');
    ckajiMap.set('klesi', selbriRecord.ckaji.klesi);

    // Set datni with selbri reference remapped to the generated pubkey
    const datniMap = loroDoc.getMap('datni');
    let selbriRef = selbriRecord.datni.selbri;
    if (generatedKeys.has(selbriRef)) {
        selbriRef = generatedKeys.get(selbriRef)!;
    }

    datniMap.set('selbri', selbriRef);
    datniMap.set('cneme', selbriRecord.datni.cneme);

    // Set sumti with place structure
    const sumtiMap = datniMap.setContainer('sumti', new LoroMap());
    // Using type-safe approach for sumti place properties
    if (selbriRecord.datni.sumti.x1) sumtiMap.set('x1', selbriRecord.datni.sumti.x1);
    if (selbriRecord.datni.sumti.x2) sumtiMap.set('x2', selbriRecord.datni.sumti.x2);
    if (selbriRecord.datni.sumti.x3) sumtiMap.set('x3', selbriRecord.datni.sumti.x3);
    if (selbriRecord.datni.sumti.x4) sumtiMap.set('x4', selbriRecord.datni.sumti.x4);
    if (selbriRecord.datni.sumti.x5) sumtiMap.set('x5', selbriRecord.datni.sumti.x5);

    // Set fanva (translations) if they exist
    if (selbriRecord.datni.fanva) {
        datniMap.set('fanva', selbriRecord.datni.fanva);
    }

    // Set stidi (usage guidance) if they exist
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
        pubKey: pubKey,
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
    generatedKeys: Map<string, string>
): Promise<{ contentEntry: schema.InsertContent; docEntry: schema.InsertDoc } | null> {
    const originalPubKey = bridiRecord.pubkey;

    // Generate deterministic pubkey if not already in the map
    let pubKey = originalPubKey;
    if (!generatedKeys.has(originalPubKey)) {
        pubKey = await generateDeterministicPubKey(originalPubKey);
        generatedKeys.set(originalPubKey, pubKey);
    } else {
        pubKey = generatedKeys.get(originalPubKey)!;
    }

    console.log(`Processing Bridi: ${originalPubKey} -> ${pubKey}`);

    // Check referenced selbri BEFORE creating the document
    const originalSelbriRef = bridiRecord.datni.selbri;
    const selbriRef = generatedKeys.get(originalSelbriRef);
    if (!selbriRef) {
        console.error(`❌ ERROR creating Bridi ${originalPubKey}: Referenced selbri ${originalSelbriRef} not found in generatedKeys.`);
        return null; // Prevent seeding this Bridi if its selbri wasn't processed
    }

    // Check all referenced sumti BEFORE creating the document
    const missingSumtiRefs: string[] = [];
    for (const place of ['x1', 'x2', 'x3', 'x4', 'x5'] as const) {
        const originalValue = bridiRecord.datni.sumti[place];
        if (originalValue && typeof originalValue === 'string' && originalValue.startsWith('@')) {
            if (!generatedKeys.has(originalValue)) {
                missingSumtiRefs.push(originalValue);
            }
        }
    }
    if (missingSumtiRefs.length > 0) {
        console.error(`❌ ERROR creating Bridi ${originalPubKey}: Referenced sumti not found in generatedKeys: ${missingSumtiRefs.join(', ')}.`);
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
                sumtiMap.set(place, generatedKeys.get(originalValue)!);
            } else {
                sumtiMap.set(place, originalValue);
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
        pubKey: pubKey,
        snapshotCid: cid,
        updateCids: [],
        owner: GENESIS_HOMINIO,
        updatedAt: now,
        createdAt: now
    };

    console.log(`  - Prepared Bridi: ${originalPubKey} -> ${pubKey} (CID: ${cid.substring(0, 10)}...)`);
    return { contentEntry, docEntry };
}

// --- NEW HELPER for modifying the index map in memory --- 
async function updateBridiIndexInMemory(
    indexMap: LoroMap, // Pass the map directly
    originalBridiPubkey: string,
    bridiData: {
        selbri: string;
        sumti: Record<string, string>;
    },
    generatedKeys: Map<string, string>
) {
    // LoroList is imported at the top level now

    // Get the generated pubkeys for the bridi and selbri
    const bridiPubkey = generatedKeys.get(originalBridiPubkey);
    const selbriId = generatedKeys.get(bridiData.selbri);

    if (!bridiPubkey) {
        console.warn(`  - [Bridi Index] Skipping Bridi ${originalBridiPubkey} - Could not find generated key.`);
        return;
    }
    if (!selbriId) {
        console.warn(`  - [Bridi Index] Skipping Bridi ${originalBridiPubkey} - Could not find generated key for Selbri ${bridiData.selbri}.`);
        return;
    }

    // Directly update the index map passed as argument
    for (const place in bridiData.sumti) {
        const originalSumtiId = bridiData.sumti[place];
        if (!originalSumtiId) continue;

        const sumtiId = generatedKeys.get(originalSumtiId);
        if (!sumtiId) {
            console.warn(`  - [Bridi Comp Index] Skipping place ${place} for Bridi ${originalBridiPubkey} - Could not find generated key for Sumti ${originalSumtiId}. This indicates an issue.`);
            continue;
        }

        // Ensure place is a valid key string (like 'x1', 'x2', etc.)
        const placeKey = String(place);

        // --- Index 1: selbri:place:sumti --- 
        const compositeKey1 = `${selbriId}:${placeKey}:${sumtiId}`;
        let listContainer1 = indexMap.get(compositeKey1);
        if (!listContainer1 || !(listContainer1 instanceof LoroList)) {
            const newList = new LoroList<string>();
            indexMap.setContainer(compositeKey1, newList);
            listContainer1 = newList;
        }
        const bridiList1 = listContainer1 as LoroList<string>; // Cast after check/creation
        // Using Set might be overkill if lists are expected short, direct check might be ok
        if (!bridiList1.toArray().includes(bridiPubkey)) {
            bridiList1.push(bridiPubkey);
            // console.log(`  - [Bridi Comp Index] Added ${bridiPubkey.substring(0, 10)}... to list for ${compositeKey1}`);
            if (selbriId === generatedKeys.get('@selbri_cneme')) {
                console.log(`    --> Indexed CNEME Bridi under key: ${compositeKey1}`);
            }
        }

        // --- Index 2: sumti:place:selbri --- 
        const compositeKey2 = `${sumtiId}:${placeKey}:${selbriId}`;
        let listContainer2 = indexMap.get(compositeKey2);
        if (!listContainer2 || !(listContainer2 instanceof LoroList)) {
            const newList = new LoroList<string>();
            indexMap.setContainer(compositeKey2, newList);
            listContainer2 = newList;
        }
        const bridiList2 = listContainer2 as LoroList<string>; // Cast after check/creation
        if (!bridiList2.toArray().includes(bridiPubkey)) {
            bridiList2.push(bridiPubkey);
            // console.log(`  - [Bridi Comp Index] Added ${bridiPubkey.substring(0, 10)}... to list for ${compositeKey2}`);
            if (selbriId === generatedKeys.get('@selbri_cneme')) {
                console.log(`    --> Indexed CNEME Bridi under key: ${compositeKey2}`);
            }
        }
    }
}

async function populateSelbriIndex(
    db: ReturnType<typeof drizzle>,
    generatedKeys: Map<string, string>
) {
    console.log("--- Populating Selbri Index ---");

    // Load the Facki selbri index document
    const indexDocMeta = await db.select({ snapshotCid: schema.docs.snapshotCid })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, FACKI_SELBRI_PUBKEY))
        .limit(1);

    if (indexDocMeta.length === 0 || !indexDocMeta[0].snapshotCid) {
        console.error(`❌ ERROR: Facki selbri index document ${FACKI_SELBRI_PUBKEY} not found or has no snapshot`);
        return;
    }

    // Load the snapshot content
    const contentResult = await db.select({ raw: schema.content.raw })
        .from(schema.content)
        .where(eq(schema.content.cid, indexDocMeta[0].snapshotCid))
        .limit(1);

    if (contentResult.length === 0 || !contentResult[0].raw) {
        console.error(`❌ ERROR: Content for ${FACKI_SELBRI_PUBKEY} not found`);
        return;
    }

    // Create in-memory LoroDoc and import the snapshot
    const loroDoc = new LoroDoc();
    loroDoc.import(contentResult[0].raw);

    // Get the index map directly from the root 'datni' map - FIX
    const indexMap = loroDoc.getMap('datni'); // datni IS the index map
    if (!indexMap) {
        console.error(`❌ ERROR: Could not find root 'datni' map in ${FACKI_SELBRI_PUBKEY}`);
        return;
    }

    // Iterate over all selbri records and add their generated pubkeys to the index
    let addedCount = 0;
    for (const selbri of initialSelbri) {
        const originalPubKey = selbri.pubkey;
        if (generatedKeys.has(originalPubKey)) {
            const generatedPubKey = generatedKeys.get(originalPubKey)!;
            if (indexMap.get(generatedPubKey) === undefined) {
                indexMap.set(generatedPubKey, true); // Store the pubkey as a key
                console.log(`  - Added Selbri ${generatedPubKey} (from ${originalPubKey}) to index.`);
                addedCount++;
            }
        } else {
            console.warn(`  - Could not find generated key for original Selbri: ${originalPubKey}`);
        }
    }

    if (addedCount === 0) {
        console.log("  - No new Selbri added to the index (already populated?).");
        return; // No need to save if nothing changed
    }


    // Export snapshot and save to database
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),

            createdAt: now
        })
        .onConflictDoNothing({ target: schema.content.cid });

    // Update the facki_selbri document to point to the new snapshot
    await db.update(schema.docs)
        .set({
            snapshotCid: cid,
            updatedAt: now
        })
        .where(eq(schema.docs.pubKey, FACKI_SELBRI_PUBKEY));

    console.log(`✅ Successfully updated Selbri index (${addedCount} added). New snapshot CID: ${cid}`);
}

// --- NEW FUNCTION for SUMTI INDEX ---
async function populateSumtiIndex(
    db: ReturnType<typeof drizzle>,
    generatedKeys: Map<string, string>
) {
    console.log("--- Populating Sumti Index ---");

    // Load the Facki sumti index document
    const indexDocMeta = await db.select({ snapshotCid: schema.docs.snapshotCid })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, FACKI_SUMTI_PUBKEY))
        .limit(1);

    if (indexDocMeta.length === 0 || !indexDocMeta[0].snapshotCid) {
        console.error(`❌ ERROR: Facki sumti index document ${FACKI_SUMTI_PUBKEY} not found or has no snapshot`);
        return;
    }

    // Load the snapshot content
    const contentResult = await db.select({ raw: schema.content.raw })
        .from(schema.content)
        .where(eq(schema.content.cid, indexDocMeta[0].snapshotCid))
        .limit(1);

    if (contentResult.length === 0 || !contentResult[0].raw) {
        console.error(`❌ ERROR: Content for ${FACKI_SUMTI_PUBKEY} not found`);
        return;
    }

    // Create in-memory LoroDoc and import the snapshot
    const loroDoc = new LoroDoc();
    loroDoc.import(contentResult[0].raw);

    // Get the index map directly from the root 'datni' map
    const indexMap = loroDoc.getMap('datni'); // datni IS the index map
    if (!indexMap) {
        console.error(`❌ ERROR: Could not find root 'datni' map in ${FACKI_SUMTI_PUBKEY}`);
        return;
    }

    // Iterate over all sumti records and add their generated pubkeys to the index
    let addedCount = 0;
    // Combine initialSumti and initialFacki as Facki records also need to be in the index?
    // Let's just index initialSumti for now, as Facki pubkeys are predictable.
    // If Facki needs indexing, add initialFacki to the loop.
    for (const sumti of initialSumti) {
        const originalPubKey = sumti.pubkey;
        // Skip Facki records for now (they have predictable keys)
        if (originalPubKey.startsWith('@facki_')) continue;

        if (generatedKeys.has(originalPubKey)) {
            const generatedPubKey = generatedKeys.get(originalPubKey)!;
            if (indexMap.get(generatedPubKey) === undefined) {
                indexMap.set(generatedPubKey, true); // Store the pubkey as a key, value can be simple
                console.log(`  - Added Sumti ${generatedPubKey} (from ${originalPubKey}) to index.`);
                addedCount++;
            }
        } else {
            console.warn(`  - Could not find generated key for original Sumti: ${originalPubKey}`);
        }
    }

    if (addedCount === 0) {
        console.log("  - No new Sumti added to the index (already populated?).");
        return; // No need to save if nothing changed
    }

    // Export snapshot and save to database
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            createdAt: now
        })
        .onConflictDoNothing({ target: schema.content.cid });

    // Update the facki_sumti document to point to the new snapshot
    await db.update(schema.docs)
        .set({
            snapshotCid: cid,
            updatedAt: now
        })
        .where(eq(schema.docs.pubKey, FACKI_SUMTI_PUBKEY));

    console.log(`✅ Successfully updated Sumti index (${addedCount} added). New snapshot CID: ${cid}`);
}
// --- END NEW SUMTI INDEX FUNCTION ---

// --- NEW FUNCTION for Simple Bridi Index --- 
async function populateBridiIndexSimple(
    db: ReturnType<typeof drizzle>,
    generatedKeys: Map<string, string>,
    seededBridiPubkeys: Set<string> // Pass the set of successfully seeded Bridi keys
) {
    console.log("--- Populating Simple Bridi Index ---");

    // Load the Facki Bridi index document (the simple one)
    const indexDocMeta = await db.select({ snapshotCid: schema.docs.snapshotCid })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, FACKI_BRIDI_PUBKEY))
        .limit(1);

    if (indexDocMeta.length === 0 || !indexDocMeta[0].snapshotCid) {
        console.error(`❌ ERROR: Facki simple bridi index document ${FACKI_BRIDI_PUBKEY} not found or has no snapshot`);
        return;
    }

    // Load the snapshot content
    const contentResult = await db.select({ raw: schema.content.raw })
        .from(schema.content)
        .where(eq(schema.content.cid, indexDocMeta[0].snapshotCid))
        .limit(1);

    if (contentResult.length === 0 || !contentResult[0].raw) {
        console.error(`❌ ERROR: Content for ${FACKI_BRIDI_PUBKEY} not found`);
        return;
    }

    // Create in-memory LoroDoc and import the snapshot
    const loroDoc = new LoroDoc();
    loroDoc.import(contentResult[0].raw);

    // Get the index map directly from the root 'datni' map
    const indexMap = loroDoc.getMap('datni'); // datni IS the index map
    if (!indexMap) {
        console.error(`❌ ERROR: Could not find root 'datni' map in ${FACKI_BRIDI_PUBKEY}`);
        return;
    }

    // Iterate over successfully seeded bridi records and add their generated pubkeys
    let addedCount = 0;
    for (const bridiPubKey of seededBridiPubkeys) {
        if (indexMap.get(bridiPubKey) === undefined) {
            indexMap.set(bridiPubKey, true); // Store the pubkey as a key
            console.log(`  - Added Bridi ${bridiPubKey.substring(0, 10)}... to simple index.`);
            addedCount++;
        }
    }

    if (addedCount === 0) {
        console.log("  - No new Bridi added to the simple index (already populated?).");
        return; // No need to save if nothing changed
    }

    // Export snapshot and save to database
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            createdAt: now
        })
        .onConflictDoNothing({ target: schema.content.cid });

    // Update the facki_bridi document to point to the new snapshot
    await db.update(schema.docs)
        .set({
            snapshotCid: cid,
            updatedAt: now
        })
        .where(eq(schema.docs.pubKey, FACKI_BRIDI_PUBKEY));

    console.log(`✅ Successfully updated Simple Bridi index (${addedCount} added). New snapshot CID: ${cid}`);
}
// --- END NEW Simple Bridi Index --- 

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

        // Keep track of generated keys (original pubkey -> generated pubkey)
        const generatedKeys = new Map<string, string>();

        // Preserve Facki pubkeys (don't hash them)
        generatedKeys.set(FACKI_META_PUBKEY, FACKI_META_PUBKEY);
        generatedKeys.set(FACKI_SUMTI_PUBKEY, FACKI_SUMTI_PUBKEY);
        generatedKeys.set(FACKI_SELBRI_PUBKEY, FACKI_SELBRI_PUBKEY);
        generatedKeys.set(FACKI_BRIDI_PUBKEY, FACKI_BRIDI_PUBKEY);
        generatedKeys.set(FACKI_BRIDI_BY_COMPONENT_PUBKEY, FACKI_BRIDI_BY_COMPONENT_PUBKEY);

        // --- Prepare data arrays --- 
        const allContentEntries: schema.InsertContent[] = [];
        const allDocEntries: schema.InsertDoc[] = [];

        // 1. Prepare Facki records
        console.log("\n--- Preparing Facki Records ---");
        for (const facki of initialFacki) {
            const prepared = await seedSumtiDocument(db, facki, generatedKeys);
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
            }
        }

        // 2. Prepare Sumti records
        console.log("\n--- Preparing Sumti Records ---");
        for (const sumti of initialSumti) {
            const prepared = await seedSumtiDocument(db, sumti, generatedKeys);
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
            }
        }

        // 3. Prepare Selbri records
        console.log("\n--- Preparing Selbri Records ---");
        for (const selbri of initialSelbri) {
            const prepared = await seedSelbriDocument(db, selbri, generatedKeys);
            if (prepared) {
                allContentEntries.push(prepared.contentEntry);
                allDocEntries.push(prepared.docEntry);
            }
        }

        // 4. Prepare Bridi records
        console.log("\n--- Preparing Bridi Records ---");
        const successfullySeededBridiPubkeys = new Set<string>();
        for (const bridi of initialBridi) {
            const prepared = await seedBridiDocument(db, bridi, generatedKeys);
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

        // 5. Indexing step (Refactored Bridi Indexing)
        console.log("\n--- Building Facki indexes ---");

        // Populate Selbri and Sumti indexes (these are already reasonably efficient)
        await populateSelbriIndex(db, generatedKeys);
        await populateSumtiIndex(db, generatedKeys);

        // <<< Populate the NEW simple Bridi index FIRST >>>
        await populateBridiIndexSimple(db, generatedKeys, successfullySeededBridiPubkeys);

        // --- Efficient Bridi Component Index Population --- 
        console.log("--- Populating Bridi Component Index ---");
        const bridiCompIndexDocMeta = await db.select({ snapshotCid: schema.docs.snapshotCid })
            .from(schema.docs)
            .where(eq(schema.docs.pubKey, FACKI_BRIDI_BY_COMPONENT_PUBKEY))
            .limit(1);

        if (bridiCompIndexDocMeta.length === 0 || !bridiCompIndexDocMeta[0].snapshotCid) {
            console.error(`❌ ERROR: Cannot populate Bridi component index - ${FACKI_BRIDI_BY_COMPONENT_PUBKEY} not found or has no snapshot.`);
        } else {
            const bridiCompIndexContent = await db.select({ raw: schema.content.raw })
                .from(schema.content)
                .where(eq(schema.content.cid, bridiCompIndexDocMeta[0].snapshotCid))
                .limit(1);

            if (bridiCompIndexContent.length === 0 || !bridiCompIndexContent[0].raw) {
                console.error(`❌ ERROR: Cannot populate Bridi component index - Content for ${FACKI_BRIDI_BY_COMPONENT_PUBKEY} not found.`);
            } else {
                const indexLoroDoc = new LoroDoc();
                indexLoroDoc.import(bridiCompIndexContent[0].raw);
                const indexMap = indexLoroDoc.getMap('datni');

                if (!indexMap) {
                    console.error(`❌ ERROR: Cannot populate Bridi component index - Could not find root 'datni' map in ${FACKI_BRIDI_BY_COMPONENT_PUBKEY}`);
                } else {
                    console.log("  - Updating Bridi Component Index in memory...");
                    let bridiUpdateCount = 0;
                    for (const bridi of initialBridi) {
                        const generatedBridiKey = generatedKeys.get(bridi.pubkey);
                        if (generatedBridiKey && successfullySeededBridiPubkeys.has(generatedBridiKey)) {
                            await updateBridiIndexInMemory(indexMap, bridi.pubkey, {
                                selbri: bridi.datni.selbri,
                                sumti: bridi.datni.sumti as Record<string, string>
                            }, generatedKeys);
                            bridiUpdateCount++;
                        }
                    }
                    console.log(`  - Processed ${bridiUpdateCount} successfully seeded Bridis for component index update.`);

                    console.log("  - Saving updated Bridi Component Index Document...");
                    const finalSnapshot = indexLoroDoc.exportSnapshot();
                    const finalCid = await hashSnapshot(finalSnapshot);
                    const now = new Date();

                    await db.insert(schema.content)
                        .values({
                            cid: finalCid,
                            type: 'snapshot',
                            raw: Buffer.from(finalSnapshot),
                            createdAt: now
                        })
                        .onConflictDoNothing({ target: schema.content.cid });

                    await db.update(schema.docs)
                        .set({
                            snapshotCid: finalCid,
                            updatedAt: now
                        })
                        .where(eq(schema.docs.pubKey, FACKI_BRIDI_BY_COMPONENT_PUBKEY));

                    console.log(`✅ Successfully updated Bridi Component index. New snapshot CID: ${finalCid}`);
                }
            }
        }
        // --- End Efficient Bridi Component Index Population --- 

        // <<< ADD INDEX VERIFICATION LOGGING >>>
        console.log("\n--- Verifying Saved Bridi Component Index ---");
        const verifyIndexDoc = await db.select({ snapshotCid: schema.docs.snapshotCid })
            .from(schema.docs)
            .where(eq(schema.docs.pubKey, FACKI_BRIDI_BY_COMPONENT_PUBKEY))
            .limit(1);
        if (verifyIndexDoc.length > 0 && verifyIndexDoc[0].snapshotCid) {
            const verifyContent = await db.select({ raw: schema.content.raw })
                .from(schema.content)
                .where(eq(schema.content.cid, verifyIndexDoc[0].snapshotCid))
                .limit(1);
            if (verifyContent.length > 0 && verifyContent[0].raw) {
                const loadedIndexDoc = new LoroDoc();
                loadedIndexDoc.import(verifyContent[0].raw);
                const loadedIndexMap = loadedIndexDoc.getMap('datni');
                if (loadedIndexMap) {
                    const allKeys = Array.from(loadedIndexMap.keys());
                    console.log(`  - Keys found in saved index (${allKeys.length} total):`);
                    // Filter for cneme keys specifically for easier reading
                    const cnemeKeys = allKeys.filter(k => k.startsWith(generatedKeys.get('@selbri_cneme')!));
                    console.log("    CNEME Keys:", cnemeKeys);
                    // Log a few others for context
                    // console.log("    All Keys:", allKeys);
                } else {
                    console.error("  - ERROR: Could not get 'datni' map from reloaded index doc.");
                }
            } else {
                console.error("  - ERROR: Could not reload content for saved index doc.");
            }
        } else {
            console.error("  - ERROR: Could not reload saved index doc metadata.");
        }
        // <<< END INDEX VERIFICATION LOGGING >>>

        console.log('\n✅ Database seeding completed successfully.');
        console.log('\nGenerated Keys Map: (Original -> Generated)');
        console.log('----------------------------------------');
        for (const [original, generated] of generatedKeys.entries()) {
            if (original !== generated) {
                console.log(`${original} -> ${generated}`);
            }
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