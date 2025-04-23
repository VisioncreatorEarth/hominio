import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { LoroDoc, LoroMap, LoroText, LoroList } from 'loro-crdt';
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

// Define Facki records directly here
const initialFacki: SumtiRecord[] = [
    // System Index Sumti Definitions (Facki)
    {
        pubkey: FACKI_META_PUBKEY,
        ckaji: { klesi: 'Facki' },
        datni: {
            klesi: 'LoroMap',
            vasru: {
                sumti: FACKI_SUMTI_PUBKEY,
                selbri: FACKI_SELBRI_PUBKEY,
                bridi: FACKI_BRIDI_PUBKEY
            }
        }
    },
    {
        pubkey: FACKI_SUMTI_PUBKEY,
        ckaji: { klesi: 'Facki' },
        datni: { klesi: 'LoroMap', vasru: {} }
    },
    {
        pubkey: FACKI_SELBRI_PUBKEY,
        ckaji: { klesi: 'Facki' },
        datni: { klesi: 'LoroMap', vasru: {} }
    },
    {
        pubkey: FACKI_BRIDI_PUBKEY,
        ckaji: { klesi: 'Facki' },
        datni: { klesi: 'LoroMap', vasru: {} }
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
) {
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

    const existingDoc = await db.select({ pubKey: schema.docs.pubKey })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, pubKey))
        .limit(1);
    if (existingDoc.length > 0) {
        console.log(`  - Document already exists. Skipping.`);
        return pubKey;
    }

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Set meta data
    const metaMap = loroDoc.getMap('meta');
    metaMap.set('gismu', 'sumti');
    metaMap.set('owner', GENESIS_HOMINIO);
    if (sumtiRecord.ckaji.cmene) {
        metaMap.set('cmene', sumtiRecord.ckaji.cmene);
    }

    // Set data structure
    const dataMap = loroDoc.getMap('data');

    // Set ckaji
    dataMap.set('ckaji', {
        klesi: sumtiRecord.ckaji.klesi,
        cmene: sumtiRecord.ckaji.cmene,
    });

    // Set datni with appropriate CRDT container
    if (sumtiRecord.datni) {
        const datniMap = dataMap.setContainer('datni', new LoroMap());

        if (sumtiRecord.datni.klesi === 'LoroMap') {
            const vasruMap = datniMap.setContainer('vasru', new LoroMap());
            const vasruData = sumtiRecord.datni.vasru as Record<string, unknown>;
            for (const key in vasruData) {
                vasruMap.set(key, vasruData[key]);
            }
            datniMap.set('klesi', 'LoroMap');
        } else if (sumtiRecord.datni.klesi === 'LoroText') {
            const textValue = sumtiRecord.datni.vasru as string;
            const textContainer = datniMap.setContainer('vasru', new LoroText());
            textContainer.insert(0, textValue);
            datniMap.set('klesi', 'LoroText');
        } else if (sumtiRecord.datni.klesi === 'LoroList' || sumtiRecord.datni.klesi === 'LoroMovableList') {
            const listContainer = datniMap.setContainer('vasru', new LoroList());
            const listData = sumtiRecord.datni.vasru as unknown[];
            listData.forEach((item, index) => {
                listContainer.insert(index, item);
            });
            datniMap.set('klesi', sumtiRecord.datni.klesi);
        } else if (sumtiRecord.datni.klesi === 'concept') {
            // For concept, no vasru property
            datniMap.set('klesi', 'concept');
        }
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
            metadata: {
                klesi: sumtiRecord.ckaji.klesi,
                cmene: sumtiRecord.ckaji.cmene,
            },
            createdAt: now
        })
        .onConflictDoNothing({ target: schema.content.cid });
    console.log(`  - Ensured content entry exists: ${cid}`);

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

    console.log(`✅ Successfully seeded Sumti: ${originalPubKey} -> ${pubKey}`);
    return pubKey;
}

async function seedSelbriDocument(
    db: ReturnType<typeof drizzle>,
    selbriRecord: SelbriRecord,
    generatedKeys: Map<string, string>
) {
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

    const existingDoc = await db.select({ pubKey: schema.docs.pubKey })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, pubKey))
        .limit(1);
    if (existingDoc.length > 0) {
        console.log(`  - Document already exists. Skipping.`);
        return pubKey;
    }

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Set meta data
    const metaMap = loroDoc.getMap('meta');
    metaMap.set('gismu', 'selbri');
    metaMap.set('owner', GENESIS_HOMINIO);

    // Set data structure
    const dataMap = loroDoc.getMap('data');

    // Set ckaji
    dataMap.set('ckaji', {
        klesi: selbriRecord.ckaji.klesi
    });

    // Set datni with selbri reference remapped to the generated pubkey
    const datniMap = dataMap.setContainer('datni', new LoroMap());

    // Translate selbri reference if it exists in our map
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

    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            metadata: {
                klesi: 'Selbri',
                cneme: selbriRecord.datni.cneme,
            },
            createdAt: now
        })
        .onConflictDoNothing({ target: schema.content.cid });
    console.log(`  - Ensured content entry exists: ${cid}`);

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

    console.log(`✅ Successfully seeded Selbri: ${originalPubKey} -> ${pubKey}`);
    return pubKey;
}

async function seedBridiDocument(
    db: ReturnType<typeof drizzle>,
    bridiRecord: BridiRecord,
    generatedKeys: Map<string, string>
) {
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

    const existingDoc = await db.select({ pubKey: schema.docs.pubKey })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, pubKey))
        .limit(1);
    if (existingDoc.length > 0) {
        console.log(`  - Document already exists. Skipping.`);
        return pubKey;
    }

    // Make sure the referenced selbri exists and get its mapped pubkey
    const originalSelbriRef = bridiRecord.datni.selbri;
    if (!generatedKeys.has(originalSelbriRef)) {
        console.error(`❌ ERROR: Bridi ${originalPubKey} references non-existent selbri ${originalSelbriRef}`);
        return null;
    }
    const selbriRef = generatedKeys.get(originalSelbriRef)!;

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Set meta data
    const metaMap = loroDoc.getMap('meta');
    metaMap.set('gismu', 'bridi');
    metaMap.set('owner', GENESIS_HOMINIO);

    // Set data structure
    const dataMap = loroDoc.getMap('data');

    // Set ckaji
    dataMap.set('ckaji', {
        klesi: bridiRecord.ckaji.klesi
    });

    // Set datni
    const datniMap = dataMap.setContainer('datni', new LoroMap());
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

    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            metadata: {
                klesi: 'Bridi',
                selbri: selbriRef,
            },
            createdAt: now
        })
        .onConflictDoNothing({ target: schema.content.cid });
    console.log(`  - Ensured content entry exists: ${cid}`);

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

    console.log(`✅ Successfully seeded Bridi: ${originalPubKey} -> ${pubKey}`);
    return pubKey;
}

async function populateBridiIndex(
    db: ReturnType<typeof drizzle>,
    originalBridiPubkey: string,
    bridiData: {
        selbri: string;
        sumti: Record<string, string>;
    },
    generatedKeys: Map<string, string>
) {
    // Get the generated pubkeys for the bridi and selbri
    const bridiPubkey = generatedKeys.get(originalBridiPubkey)!;
    const selbriId = generatedKeys.get(bridiData.selbri)!;

    // Load the Facki bridi index document
    const indexDoc = await db.select({ snapshotCid: schema.docs.snapshotCid })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, FACKI_BRIDI_PUBKEY))
        .limit(1);

    if (indexDoc.length === 0 || !indexDoc[0].snapshotCid) {
        console.error(`❌ ERROR: Facki bridi index document ${FACKI_BRIDI_PUBKEY} not found or has no snapshot`);
        return;
    }

    // Load the snapshot
    const contentResult = await db.select({ raw: schema.content.raw })
        .from(schema.content)
        .where(eq(schema.content.cid, indexDoc[0].snapshotCid))
        .limit(1);

    if (contentResult.length === 0 || !contentResult[0].raw) {
        console.error(`❌ ERROR: Content for ${FACKI_BRIDI_PUBKEY} not found`);
        return;
    }

    // Create in-memory LoroDoc and import the snapshot
    const loroDoc = new LoroDoc();
    loroDoc.import(contentResult[0].raw);

    // Get the data.datni.vasru map
    const dataMap = loroDoc.getMap('data');
    const datniMap = dataMap.get('datni') as LoroMap;
    const vasruMap = datniMap.get('vasru') as LoroMap;

    // Update the index with the bridi data
    // First check if there's an entry for this selbri
    if (vasruMap.get(selbriId) === undefined) {
        // Create a new map for this selbri
        vasruMap.set(selbriId, {});
    }

    const selbriMap = vasruMap.get(selbriId) as Record<string, unknown>;

    // For each place in the sumti, add the bridi to the index
    for (const place in bridiData.sumti) {
        const originalSumtiId = bridiData.sumti[place];
        if (!originalSumtiId) continue;

        const sumtiId = generatedKeys.get(originalSumtiId)!;

        // Ensure there's an entry for this place
        if (!selbriMap[place]) {
            selbriMap[place] = {};
        }

        const placeMap = selbriMap[place] as Record<string, unknown>;

        // Ensure there's an entry for this sumti
        if (!placeMap[sumtiId]) {
            placeMap[sumtiId] = [];
        }

        // Add this bridi to the list for this sumti at this place
        const bridiList = placeMap[sumtiId] as string[];
        if (!bridiList.includes(bridiPubkey)) {
            bridiList.push(bridiPubkey);
        }

        // Update the place map with the updated bridi list
        placeMap[sumtiId] = bridiList;
        selbriMap[place] = placeMap;
    }

    // Update the vasru map with the updated selbri map
    vasruMap.set(selbriId, selbriMap);

    // Export snapshot and save to database
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            metadata: {
                klesi: 'Facki',
                gismu: 'bridi_index',
            },
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

    console.log(`✅ Updated Bridi index with ${bridiPubkey} (was ${originalBridiPubkey})`);
}

// --- NEW FUNCTION ---
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

    // Get the data.datni.vasru map (the index map)
    const dataMap = loroDoc.getMap('data');
    const datniMap = dataMap.get('datni') as LoroMap;
    const indexMap = datniMap.get('vasru') as LoroMap; // This is where we store selbri pubkeys

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
            metadata: {
                klesi: 'Facki',
                gismu: 'selbri_index', // Indicate this is the selbri index content
            },
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
// --- END NEW FUNCTION ---

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

        // 1. Seed Facki records
        console.log("\n--- Seeding Facki Records ---");
        for (const facki of initialFacki) {
            await seedSumtiDocument(db, facki, generatedKeys);
        }

        // 2. Seed Sumti records
        console.log("\n--- Seeding Sumti Records ---");
        for (const sumti of initialSumti) {
            await seedSumtiDocument(db, sumti, generatedKeys);
        }

        // 3. Seed Selbri records
        console.log("\n--- Seeding Selbri Records ---");
        for (const selbri of initialSelbri) {
            await seedSelbriDocument(db, selbri, generatedKeys);
        }

        // 4. Seed Bridi records
        console.log("\n--- Seeding Bridi Records ---");
        for (const bridi of initialBridi) {
            await seedBridiDocument(db, bridi, generatedKeys);
        }

        // 5. Temporary static indexing step
        console.log("\n--- Building Facki indexes ---");
        await populateSelbriIndex(db, generatedKeys);
        for (const bridi of initialBridi) {
            await populateBridiIndex(db, bridi.pubkey, {
                selbri: bridi.datni.selbri,
                sumti: bridi.datni.sumti as Record<string, string>
            }, generatedKeys);
        }

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