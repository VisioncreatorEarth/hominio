import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { LoroDoc, LoroMap, LoroText, LoroList } from 'loro-crdt';
import { blake3 } from '@noble/hashes/blake3';
import b4a from 'b4a';
import * as schema from './schema';
import { eq } from 'drizzle-orm';
import { validateSelbriDocStructure, validateBridiDocAgainstSelbri } from '../lib/KERNEL/hominio-validate';
import { GENESIS_PUBKEY, GENESIS_HOMINIO } from './constants';

// Define a type for the JSON representation expected by the validator
// This helps avoid using 'any'
type LoroDocJson = Record<string, unknown> & {
    meta?: Record<string, unknown>;
    data?: Record<string, unknown>;
    pubKey?: string;
}

// Basic placeholder types matching the structure used
interface SumtiDefinition {
    description: string;
}

// New interface for validation rules per sumti place (Simplified)
interface ValidationRule {
    required: boolean;
    type: string; // e.g., 'text', 'list', 'map', '@selbri_name'
}

interface TranslationContent { // Renamed from TranslationDefinition
    cmene: string; // Renamed from name
    sumti: Record<string, string>;
}

interface BaseDefinition {
    cmene: string; // Renamed from name
    sumti: Record<string, SumtiDefinition>; // Holds descriptions only
}

interface SelbriDefinition extends BaseDefinition {
    pubkey?: string; // Optional original pubkey, will be generated unless 'gismu'
    validation: Record<string, ValidationRule>; // NEW: Holds required flag and validation rules
    skicu?: Record<string, TranslationContent>; // NEW: Renamed from translations, map keyed by lang code
}

interface BridiDefinition {
    pubkey?: string; // Optional original pubkey, will be generated
    selbriRefName: string;
    cmene: string; // Renamed from name
    // Allow object types for sumti values in seed data (for LoroMap)
    sumti: Record<string, string | number | boolean | null | object>;
    skicu?: Record<string, TranslationContent>; // Added skicu to Bridi for consistency? Optional.
}

const selbriToSeed: Record<string, SelbriDefinition> = {
    "gismu": {
        cmene: "gismu",
        sumti: { // Descriptions only
            x1: { description: "lo lojbo ke krasi valsi" },
            x2: { description: "lo bridi be lo ka ce'u skicu zo'e" },
            x3: { description: "lo sumti javni" },
            x4: { description: "lo rafsi" }
        },
        validation: { // Validation rules separated
            x1: { required: true, type: 'text' },
            x2: { required: true, type: 'text' },
            x3: { required: true, type: 'text' },
            x4: { required: false, type: 'text' }
        },
        skicu: { // Renamed from translations, map keyed by lang
            "en": { cmene: "Root Word", sumti: { x1: "A Lojban root word", x2: "Relation/concept expressed by the word", x3: "Argument roles for the relation", x4: "Associated affix(es)" } },
            "de": { cmene: "Stammwort", sumti: { x1: "Das Stammwort", x2: "Ausgedrückte Relation/Konzept", x3: "Argumentrollen der Relation", x4: "Zugehörige Affixe" } }
        }
    },
    "prenu": {
        cmene: "prenu",
        sumti: {
            x1: { description: "lo prenu" }
        },
        validation: {
            x1: { required: true, type: 'text' }
        },
        skicu: {
            "en": { cmene: "Person", sumti: { x1: "Person/entity with personhood" } },
            "de": { cmene: "Person", sumti: { x1: "Person/Wesen mit Persönlichkeit" } }
        }
    },
    "gunka": {
        cmene: "gunka",
        sumti: {
            x1: { description: "lo gunka" },
            x2: { description: "lo se gunka" },
            x3: { description: "lo te gunka" }
        },
        validation: {
            x1: { required: true, type: '@prenu' },
            x2: { required: true, type: 'text' },
            x3: { required: false, type: 'text' }
        },
        skicu: {
            "en": { cmene: "Work", sumti: { x1: "Worker/laborer", x2: "Task/activity worked on", x3: "Purpose/goal of the work" } },
            "de": { cmene: "Arbeit", sumti: { x1: "Arbeiter", x2: "Aufgabe/Tätigkeit, an der gearbeitet wird", x3: "Zweck/Ziel der Arbeit" } }
        }
    },
    "tcini": {
        cmene: "tcini",
        sumti: {
            x1: { description: "lo tcini" },
            x2: { description: "lo se tcini" }
        },
        validation: {
            x1: { required: true, type: 'text' },
            x2: { required: true, type: '@gunka' }
        },
        skicu: {
            "en": { cmene: "Status", sumti: { x1: "Situation/state/condition", x2: "Entity in the situation/state/condition" } },
            "de": { cmene: "Status", sumti: { x1: "Situation/Zustand/Bedingung", x2: "Entität in der Situation/dem Zustand/der Bedingung" } }
        }
    },
    "liste": {
        cmene: "liste",
        sumti: {
            x1: { description: "lo liste be lo se lista" },
            x2: { description: "lo se lista" },
            x3: { description: "lo tcila be lo liste" },
            x4: { description: "lo ve lista" }
        },
        validation: {
            x1: { required: true, type: 'text' },
            x2: { required: true, type: 'map' },
            x3: { required: false, type: 'map' },
            x4: { required: false, type: 'map' }
        },
        skicu: {
            "en": { cmene: "List", sumti: { x1: "The list identifier/sequence", x2: "Item in the list", x3: "Property/ordering", x4: "Containing set/mass" } },
            "de": { cmene: "Liste", sumti: { x1: "Der Listenbezeichner/Sequenz", x2: "Element in der Liste", x3: "Eigenschaft/Ordnung", x4: "Enthaltende Menge" } }
        }
    },
};

const bridiToSeed: Record<string, BridiDefinition> = {
    "fiona": {
        selbriRefName: "prenu",
        cmene: "Fiona Example", // Renamed from name
        sumti: {
            x1: "Fiona"
        }
    },
    "main_list": {
        selbriRefName: "liste",
        cmene: "Main Todo List", // Renamed from name
        sumti: {
            x1: "Main",
            x2: {}
        }
    },
    "task1_buy_milk": {
        selbriRefName: "gunka",
        cmene: "Buy Milk Task", // Renamed from name
        sumti: {
            x1: "@fiona",
            x2: "Buy Oat Milk",
            x3: "@main_list"
        }
    },
    "task2_feed_cat": {
        selbriRefName: "gunka",
        cmene: "Feed Cat Task", // Renamed from name
        sumti: {
            x1: "@fiona",
            x2: "Feed the cat",
            x3: "@main_list"
        }
    },
    "status_task1": {
        selbriRefName: "tcini",
        cmene: "Status for Task 1", // Renamed from name
        sumti: {
            x1: "todo",
            x2: "@task1_buy_milk"
        }
    },
    "status_task2": {
        selbriRefName: "tcini",
        cmene: "Status for Task 2", // Renamed from name
        sumti: {
            x1: "done",
            x2: "@task2_feed_cat"
        }
    }
};

// Define LoroJsonValue locally
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

async function generateDeterministicPubKey(seed: string): Promise<string> {
    const hashBytes = blake3(b4a.from(seed, 'utf8'));
    const hexString = b4a.toString(hashBytes, 'hex');
    return `0x${hexString}`;
}

async function hashSnapshot(snapshot: Uint8Array): Promise<string> {
    const hashBytes = blake3(snapshot);
    return b4a.toString(hashBytes, 'hex');
}

async function seedDocument(
    db: ReturnType<typeof drizzle>,
    docKey: string,
    docDefinition: SelbriDefinition | BridiDefinition,
    gismuType: 'selbri' | 'bridi',
    generatedKeys: Map<string, string>
) {
    let pubKey: string;
    let selbriRef: string | null = null;
    const isRootGismuSelbri = docKey === 'gismu' && gismuType === 'selbri';

    if (isRootGismuSelbri) {
        pubKey = GENESIS_PUBKEY;
    } else if (docDefinition.pubkey) {
        pubKey = docDefinition.pubkey;
    } else {
        pubKey = await generateDeterministicPubKey(docKey);
    }
    if (!generatedKeys.has(docKey)) {
        generatedKeys.set(docKey, pubKey);
    }

    let referencedSelbriName: string | null = null;
    if (gismuType === 'bridi') {
        const bridiDef = docDefinition as BridiDefinition;
        referencedSelbriName = bridiDef.selbriRefName;
        if (!referencedSelbriName) {
            console.error(`❌ CRITICAL: Bridi "${docKey}" is missing the required 'selbriRefName' field.`);
            return;
        }
        const selbriPubKey = generatedKeys.get(referencedSelbriName);
        if (!selbriPubKey) {
            console.error(`❌ CRITICAL: Selbri PubKey for referenced selbri "${referencedSelbriName}" not found in generatedKeys map when seeding bridi "${docKey}". Ensure selbri are seeded first.`);
            return;
        }
        selbriRef = `@${selbriPubKey}`;
    }

    console.log(`Processing ${gismuType}: ${docKey} -> PubKey: ${pubKey}${gismuType === 'bridi' ? `, Refers to Selbri: ${referencedSelbriName} (${selbriRef})` : ''}`);

    const existingDoc = await db.select({ pubKey: schema.docs.pubKey })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, pubKey))
        .limit(1);
    if (existingDoc.length > 0) {
        console.log(`  - Document already exists. Skipping.`);
        return;
    }

    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);

    // Prepare meta first
    const metaForValidation: Record<string, unknown> = {
        gismu: gismuType,
        cmene: docDefinition.cmene,
        owner: GENESIS_HOMINIO
    };
    // Special case: Add meta.selbri ONLY for the root gismu selbri BEFORE validation
    if (isRootGismuSelbri) {
        metaForValidation.selbri = `@${GENESIS_PUBKEY}`;
    }

    // Prepare data based on type
    const dataForValidation: Record<string, unknown> = {};
    if (gismuType === 'bridi') {
        // Resolve bridi sumti references
        const bridiDef = docDefinition as BridiDefinition;
        const resolvedBridiSumti = { ...bridiDef.sumti };
        for (const sumtiKey in resolvedBridiSumti) {
            const sumtiValue = resolvedBridiSumti[sumtiKey];
            if (typeof sumtiValue === 'string' && sumtiValue.startsWith('@')) {
                const referencedKeyName = sumtiValue.substring(1);
                const referencedPubKey = generatedKeys.get(referencedKeyName);
                if (!referencedPubKey) {
                    console.error(`  - ❌ ERROR: Could not resolve reference "${sumtiValue}" for sumti "${sumtiKey}" in bridi "${docKey}". Referenced key "${referencedKeyName}" not found.`);
                    return; // Stop seeding this document
                }
                resolvedBridiSumti[sumtiKey] = `@${referencedPubKey}`;
            }
        }
        dataForValidation.sumti = resolvedBridiSumti;
        dataForValidation.selbri = selbriRef; // Set selbri reference (@pubkey)
        if (bridiDef.skicu) { // Optional: add skicu if present for bridi
            dataForValidation.skicu = bridiDef.skicu;
        }
    } else { // gismuType === 'selbri'
        const selbriDef = docDefinition as SelbriDefinition;
        // Separate sumti descriptions, validation rules, and skicu
        const sumtiDescriptions: Record<string, unknown> = {};
        for (const key in selbriDef.sumti) {
            sumtiDescriptions[key] = { description: selbriDef.sumti[key].description };
        }
        dataForValidation.sumti = sumtiDescriptions;
        dataForValidation.javni = selbriDef.validation; // Assign to javni, not validation
        if (selbriDef.skicu) {
            dataForValidation.skicu = selbriDef.skicu; // Access skicu only for SelbriDefinition
        }
    }

    const docJsonForValidation: LoroDocJson = {
        pubKey: pubKey,
        meta: metaForValidation,
        data: dataForValidation
    };

    // --- Populate LoroDoc ---
    const metaMap = loroDoc.getMap('meta');
    for (const key in metaForValidation) {
        if (Object.prototype.hasOwnProperty.call(metaForValidation, key)) {
            metaMap.set(key, metaForValidation[key]);
        }
    }
    metaMap.set('gismu', gismuType);

    const dataMap = loroDoc.getMap('data');
    let selbriJavniRules: Record<string, ValidationRule> | undefined = undefined;

    if (gismuType === 'bridi' && referencedSelbriName) {
        const selbriDef = selbriToSeed[referencedSelbriName];
        if (selbriDef) {
            selbriJavniRules = selbriDef.validation;
        }
        dataMap.set('selbri', dataForValidation.selbri);
    }

    // Always set sumti (descriptions for selbri, values or containers for bridi)
    if (dataForValidation.sumti && typeof dataForValidation.sumti === 'object') {
        const sumtiMap = dataMap.setContainer('sumti', new LoroMap());
        const sumtiData = dataForValidation.sumti as Record<string, LoroJsonValue>;

        for (const key in sumtiData) {
            if (Object.prototype.hasOwnProperty.call(sumtiData, key)) {
                const value = sumtiData[key];
                const rule = selbriJavniRules?.[key];
                const ruleType = rule?.type; // Use simplified type field

                try {
                    if (gismuType === 'bridi' && ruleType) {
                        if (ruleType.startsWith('@')) {
                            // It's a reference, set the primitive string value
                            if (typeof value === 'string' && value.startsWith('@')) {
                                sumtiMap.set(key, value);
                            } else {
                                console.warn(`[Seed] Expected reference string for sumti "${key}" but got:`, value);
                                sumtiMap.set(key, null); // Set null on mismatch
                            }
                        } else if (ruleType === 'text') {
                            if (typeof value === 'string') {
                                const textContainer = sumtiMap.setContainer(key, new LoroText());
                                textContainer.insert(0, value);
                            } else {
                                console.warn(`[Seed] Expected string value for LoroText sumti "${key}" but got:`, value);
                                // Create empty container on mismatch?
                                sumtiMap.setContainer(key, new LoroText());
                            }
                        } else if (ruleType === 'list') {
                            if (Array.isArray(value)) {
                                const listContainer = sumtiMap.setContainer(key, new LoroList());
                                value.forEach((item, index) => listContainer.insert(index, item));
                            } else {
                                console.warn(`[Seed] Expected array value for LoroList sumti "${key}" but got:`, value);
                                sumtiMap.setContainer(key, new LoroList());
                            }
                        } else if (ruleType === 'map') {
                            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                                const nestedMapContainer = sumtiMap.setContainer(key, new LoroMap());
                                for (const nestedKey in value as Record<string, unknown>) {
                                    nestedMapContainer.set(nestedKey, (value as Record<string, unknown>)[nestedKey]);
                                }
                            } else {
                                console.warn(`[Seed] Expected object value for LoroMap sumti "${key}" but got:`, value);
                                sumtiMap.setContainer(key, new LoroMap());
                            }
                        } else {
                            console.warn(`[Seed] Unsupported validation type "${ruleType}" for sumti "${key}". Setting value as is.`);
                            sumtiMap.set(key, value);
                        }
                    } else {
                        // For selbri sumti (descriptions) or bridi sumti without specific ruleType
                        sumtiMap.set(key, value);
                    }
                } catch (containerError) {
                    console.error(`[Seed] Error setting container for sumti "${key}" with type "${ruleType}":`, containerError);
                    // Fallback to setting primitive value on error
                    sumtiMap.set(key, value);
                }
            }
        }
    }
    // Set validation rules only for selbri
    if (gismuType === 'selbri' && dataForValidation.javni) {
        dataMap.set('javni', dataForValidation.javni);
    }
    // Set skicu (translations) if they exist
    // Check if dataForValidation.skicu exists before setting
    if (dataForValidation.skicu && typeof dataForValidation.skicu === 'object') {
        dataMap.set('skicu', dataForValidation.skicu);
    }

    let isValid = true;
    let validationErrors: string[] = [];

    if (gismuType === 'selbri') {
        console.log(`  - Validating structure for selbri: ${docKey}...`);
        const result = validateSelbriDocStructure(docJsonForValidation);
        isValid = result.isValid;
        validationErrors = result.errors;
    } else if (gismuType === 'bridi' && referencedSelbriName) {
        const selbriPubKey = generatedKeys.get(referencedSelbriName);
        if (selbriPubKey) {
            console.log(`  - Validating bridi "${docKey}" against selbri "${referencedSelbriName}" (${selbriPubKey})...`);
            const selbriDocMeta = await db.select({ snapshotCid: schema.docs.snapshotCid })
                .from(schema.docs)
                .where(eq(schema.docs.pubKey, selbriPubKey)).limit(1);

            if (selbriDocMeta.length > 0 && selbriDocMeta[0].snapshotCid) {
                const contentResult = await db.select({ raw: schema.content.raw })
                    .from(schema.content)
                    .where(eq(schema.content.cid, selbriDocMeta[0].snapshotCid))
                    .limit(1);

                if (contentResult.length > 0 && contentResult[0].raw) {
                    const snapshotData = contentResult[0].raw;
                    const selbriLoroDoc = new LoroDoc();
                    selbriLoroDoc.import(snapshotData);
                    // Use the defined LoroDocJson type here
                    const selbriJson = selbriLoroDoc.toJSON() as LoroDocJson;
                    selbriJson.pubKey = selbriPubKey;
                    const result = validateBridiDocAgainstSelbri(docJsonForValidation, selbriJson);
                    isValid = result.isValid;
                    validationErrors = result.errors;
                } else {
                    isValid = false;
                    validationErrors.push(`Could not load snapshot content for selbri ${selbriPubKey} (CID: ${selbriDocMeta[0].snapshotCid}) from database content table.`);
                }
            } else {
                isValid = false;
                validationErrors.push(`Could not find selbri document ${selbriPubKey} in database docs table.`);
            }
        } else {
            isValid = false;
            validationErrors.push(`Could not find PubKey for referenced selbri name "${referencedSelbriName}"`);
        }
    }

    if (!isValid) {
        console.error(`  - ❌ Validation Failed for ${gismuType} ${docKey}:`);
        validationErrors.forEach((err: string) => console.error(`    - ${err}`));
        console.warn(`  - Skipping database insertion for invalid ${gismuType}: ${docKey}`);
        return;
    }
    console.log(`  - ✅ Structure validation passed for ${gismuType}: ${docKey}`);

    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();

    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            metadata: {
                cmene: docDefinition.cmene,
                gismu: gismuType,
                selbri: gismuType === 'bridi' ? selbriRef : undefined
            },
            createdAt: now
        })
        .onConflictDoNothing({ target: schema.content.cid });
    console.log(`  - Ensured content entry exists: ${cid}`);

    // Check if meta exists before accessing owner
    const owner = docJsonForValidation.meta?.owner as string ?? GENESIS_HOMINIO;
    const docEntry: schema.InsertDoc = {
        pubKey: pubKey,
        snapshotCid: cid,
        updateCids: [],
        owner: owner,
        updatedAt: now,
        createdAt: now
    };
    await db.insert(schema.docs).values(docEntry);
    console.log(`  - Created document entry: ${pubKey}`);

    console.log(`✅ Successfully seeded ${gismuType}: ${docKey}`);
}

async function main() {
    const dbUrl = process.env.SECRET_DATABASE_URL_HOMINIO;

    if (!dbUrl) {
        console.error('❌ Database URL not found in environment variables');
        process.exit(1);
    }

    console.log('🌱 Seeding database with core selbri & bridi...');

    try {
        const sql = neon(dbUrl);
        const db = drizzle(sql, { schema });

        const generatedKeys = new Map<string, string>();

        console.log("\n--- Seeding Selbri ---");
        if (selbriToSeed['gismu']) {
            await seedDocument(db, 'gismu', selbriToSeed['gismu'], 'selbri', generatedKeys);
        }
        for (const selbriKey in selbriToSeed) {
            if (selbriKey !== 'gismu') {
                await seedDocument(db, selbriKey, selbriToSeed[selbriKey], 'selbri', generatedKeys);
            }
        }
        console.log("\n✅ Selbri seeding completed.");

        console.log("\n--- Seeding Bridi ---");
        for (const bridiKey in bridiToSeed) {
            await seedDocument(db, bridiKey, bridiToSeed[bridiKey], 'bridi', generatedKeys);
        }
        console.log("\n✅ Bridi seeding completed.");

        console.log('\n✅ Database seeding completed successfully.');
        console.log('\nGenerated Keys Map: (Name -> PubKey)');
        console.log(generatedKeys);

    } catch (error) {
        console.error('\n❌ Error during database seeding:', error);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
}); 