import type { BridiRecord, SumtiId, SelbriId, Pubkey, SumtiValue } from './db';
import { LoroList, LoroMap } from 'loro-crdt';
import type { LoroDoc } from 'loro-crdt';

// Define index pubkeys for easy reference using Facki
export const FACKI_SUMTI_PUBKEY = '@facki_sumti';
export const FACKI_SELBRI_PUBKEY = '@facki_selbri';
export const FACKI_BRIDI_PUBKEY = '@facki_bridi';

// Define interface for HominioDB methods we use
interface HominioDBInterface {
    getLoroDoc(pubKey: string): Promise<LoroDoc | null>;
}

// Reference to the HominioDB instance (will be set during initialization)
let hominioDB: HominioDBInterface | null = null;

/**
 * Initialize the Loro Engine with a HominioDB instance
 * Must be called before using any other functions in this module
 */
export function initializeLoroEngine(db: HominioDBInterface): void {
    hominioDB = db;
    console.log('[Loro Engine] Initialized with HominioDB instance');
}

// --- Doc Access Functions (Use HominioDB) ---

/**
 * Gets the LoroDoc for a Sumti by pubkey using HominioDB
 */
export async function getSumtiDoc(pubkey: Pubkey): Promise<LoroDoc | null> {
    if (!hominioDB) {
        console.error('[Loro Engine] HominioDB not initialized. Call initializeLoroEngine first.');
        return null;
    }
    return await hominioDB.getLoroDoc(pubkey);
}

/**
 * Gets the LoroDoc for a Bridi by pubkey using HominioDB
 */
export async function getBridiDoc(pubkey: Pubkey): Promise<LoroDoc | null> {
    if (!hominioDB) {
        console.error('[Loro Engine] HominioDB not initialized. Call initializeLoroEngine first.');
        return null;
    }
    return await hominioDB.getLoroDoc(pubkey);
}

/**
 * Gets the LoroDoc for a Selbri by pubkey using HominioDB
 */
export async function getSelbriDoc(pubkey: Pubkey): Promise<LoroDoc | null> {
    if (!hominioDB) {
        console.error('[Loro Engine] HominioDB not initialized. Call initializeLoroEngine first.');
        return null;
    }
    return await hominioDB.getLoroDoc(pubkey);
}

// --- Plain Data Accessors (from LoroDocs) ---

/**
 * Helper to get the plain JS 'ckaji' object from a LoroDoc's root map
 */
export function getCkajiFromDoc(doc: LoroDoc | null): Record<string, unknown> | undefined {
    if (!doc) return undefined;
    // Access the 'data' map and then the ckaji field
    return doc.getMap('data').get('ckaji') as Record<string, unknown> | undefined;
}

/**
 * Helper to get the plain JS 'datni' object/value from a LoroDoc's root map
 */
export function getDatniFromDoc(doc: LoroDoc | null): Record<string, unknown> | SumtiValue | undefined {
    if (!doc) return undefined;
    // Access the 'data' map and then the datni field
    return doc.getMap('data').get('datni') as Record<string, unknown> | SumtiValue | undefined;
}

/**
 * Helper to get the plain JS 'ckaji' object for a given pubkey
 */
export async function getCkajiForPubkey(pubkey: Pubkey): Promise<Record<string, unknown> | undefined> {
    const doc = await getSumtiDoc(pubkey) || await getBridiDoc(pubkey) || await getSelbriDoc(pubkey);
    return getCkajiFromDoc(doc);
}

/**
 * Helper to get the plain JS 'datni' object/value for a given pubkey
 */
export async function getDatniForPubkey(pubkey: Pubkey): Promise<Record<string, unknown> | SumtiValue | undefined> {
    const doc = await getSumtiDoc(pubkey) || await getBridiDoc(pubkey) || await getSelbriDoc(pubkey);
    return getDatniFromDoc(doc);
}

// --- Existence Index Check Functions ---

/**
 * Checks if a Sumti pubkey exists in the Sumti existence index
 */
export async function checkSumtiExists(pubkey: Pubkey): Promise<boolean> {
    const fackiSumtiDoc = await getSumtiDoc(FACKI_SUMTI_PUBKEY);
    if (!fackiSumtiDoc) {
        console.warn(`[Loro Engine] Facki Sumti Index document (${FACKI_SUMTI_PUBKEY}) not found for existence check.`);
        return false;
    }
    try {
        const sumtiIndexMap = fackiSumtiDoc.getMap('datni');
        return sumtiIndexMap.get(pubkey) !== undefined;
    } catch (error) {
        console.error(`[Loro Engine] Error checking Sumti existence for key '${pubkey}':`, error);
        return false;
    }
}

/**
 * Checks if a Selbri pubkey exists in the Selbri existence index
 */
export async function checkSelbriExists(pubkey: Pubkey): Promise<boolean> {
    const fackiSelbriDoc = await getSelbriDoc(FACKI_SELBRI_PUBKEY);
    if (!fackiSelbriDoc) {
        console.warn(`[Loro Engine] Facki Selbri Index document (${FACKI_SELBRI_PUBKEY}) not found for existence check.`);
        return false;
    }
    try {
        // Access the index map via data.datni.vasru
        const dataMap = fackiSelbriDoc.getMap('data');
        if (!dataMap) return false; // data map missing
        const datniMap = dataMap.get('datni') as LoroMap | undefined;
        if (!datniMap || !(datniMap instanceof LoroMap)) return false; // datni map missing or not a map
        const selbriIndexMap = datniMap.get('vasru') as LoroMap | undefined;
        if (!selbriIndexMap || !(selbriIndexMap instanceof LoroMap)) return false; // vasru map missing or not a map

        return selbriIndexMap.get(pubkey) !== undefined;
    } catch (error) {
        console.error(`[Loro Engine] Error checking Selbri existence for key '${pubkey}':`, error);
        return false;
    }
}

// --- Composite Index Access Function ---

/**
 * Retrieves the LoroList of Bridi pubkeys for a given composite relationship key.
 * Key format: "<SelbriId>:<Place>:<SumtiId>"
 * Returns undefined if the index list doesn't exist or isn't a list.
 */
export async function getBridiIndexList(compositeKey: string): Promise<LoroList<string> | undefined> {
    const fackiBridiDoc = await getSumtiDoc(FACKI_BRIDI_PUBKEY);
    if (!fackiBridiDoc) {
        console.warn(`[Loro Engine] Facki Bridi Index document (${FACKI_BRIDI_PUBKEY}) not found.`);
        return undefined;
    }

    try {
        const bridiIndexMap = fackiBridiDoc.getMap('datni');
        const container = bridiIndexMap.get(compositeKey);

        if (container instanceof LoroList) {
            return container as LoroList<string>;
        } else if (container !== undefined) {
            console.warn(`[Loro Engine] Composite index key '${compositeKey}' exists but is not a LoroList.`);
            return undefined;
        } else {
            // Key doesn't exist in the index map
            return undefined;
        }
    } catch (error) {
        console.error(`[Loro Engine] Error retrieving index list for composite key '${compositeKey}':`, error);
        return undefined;
    }
}

// --- Relationship Finding Functions ---

/**
 * Finds Bridi LoroDocs where a specific Sumti occupies a given place within a specific Selbri relationship.
 * Uses the composite index for efficient lookup.
 */
export async function findBridiDocsBySelbriAndPlace(
    selbriId: SelbriId,
    place: keyof BridiRecord['datni']['sumti'],
    sumtiId: SumtiId
): Promise<LoroDoc[]> {
    const results: LoroDoc[] = [];

    // Build the composite key and check the index
    const compositeKey = `${selbriId}:${place}:${sumtiId}`;
    const indexedBridiPubkeys = await getBridiIndexList(compositeKey);
    const bridiKeys = indexedBridiPubkeys?.toArray() || [];

    if (bridiKeys.length > 0) {
        console.log(`[Loro Engine] Using composite Bridi index for '${compositeKey}', found ${bridiKeys.length} candidates.`);

        // Fetch each Bridi document and verify
        for (const pubkey of bridiKeys) {
            const bridiDoc = await getBridiDoc(pubkey);
            if (bridiDoc) {
                // Verification is still good practice
                const datni = getDatniFromDoc(bridiDoc) as BridiRecord['datni'] | undefined;
                if (datni && datni.selbri === selbriId && datni.sumti[place] === sumtiId) {
                    results.push(bridiDoc);
                } else {
                    console.warn(`[Loro Engine] Index inconsistency? Doc ${pubkey} found via key ${compositeKey} but data mismatch.`);
                }
            } else {
                console.warn(`[Loro Engine] Index inconsistency? Pubkey ${pubkey} from index key ${compositeKey} not found.`);
            }
        }
    } else {
        console.log(`[Loro Engine] Composite index miss for '${compositeKey}'. No matching Bridi found via index.`);
    }

    return results;
}

/**
 * Finds Bridi LoroDocs involving a specific Sumti in any place within a specific Selbri relationship.
 * Returns the Bridi LoroDoc and the place the Sumti occupies.
 */
export async function findBridiDocsInvolvingSumti(
    selbriId: SelbriId,
    sumtiId: SumtiId
): Promise<{ bridiDoc: LoroDoc; place: keyof BridiRecord['datni']['sumti'] }[]> {
    const results: { bridiDoc: LoroDoc; place: keyof BridiRecord['datni']['sumti'] }[] = [];
    const places: (keyof BridiRecord['datni']['sumti'])[] = ['x1', 'x2', 'x3', 'x4', 'x5'];
    const foundBridiPubkeys = new Set<string>(); // Track found Bridi to avoid duplicates

    console.log(`[Loro Engine] Finding Bridi involving Sumti '${sumtiId}' in Selbri '${selbriId}' using composite index checks.`);

    // Check each possible place the sumti could be
    for (const place of places) {
        const compositeKey = `${selbriId}:${place}:${sumtiId}`;
        const indexedBridiPubkeys = await getBridiIndexList(compositeKey);
        const bridiKeys = indexedBridiPubkeys?.toArray() || [];

        if (bridiKeys.length > 0) {
            console.log(`[Loro Engine] Composite index hit for '${compositeKey}', found ${bridiKeys.length} candidates.`);

            for (const pubkey of bridiKeys) {
                // Avoid adding the same Bridi multiple times
                if (!foundBridiPubkeys.has(pubkey)) {
                    const bridiDoc = await getBridiDoc(pubkey);
                    if (bridiDoc) {
                        // Verification
                        const datni = getDatniFromDoc(bridiDoc) as BridiRecord['datni'] | undefined;
                        if (datni && datni.selbri === selbriId && datni.sumti[place] === sumtiId) {
                            results.push({ bridiDoc, place });
                            foundBridiPubkeys.add(pubkey); // Mark as found
                        } else {
                            console.warn(`[Loro Engine] Index inconsistency? Doc ${pubkey} found via key ${compositeKey} but data mismatch.`);
                        }
                    } else {
                        console.warn(`[Loro Engine] Index inconsistency? Pubkey ${pubkey} from index key ${compositeKey} not found.`);
                    }
                }
            }
        }
    }

    if (results.length === 0) {
        console.log(`[Loro Engine] No Bridi found involving Sumti '${sumtiId}' in Selbri '${selbriId}' via composite index checks.`);
    }

    return results;
}

// --- Utility Functions ---

/**
 * Simple utility to get a value from a potentially nested object path string like "ckaji.cmene".
 * Operates on plain JS objects/values retrieved from LoroDocs.
 */
export function getPathValue<T = unknown>(obj: object | null | undefined, path: string): T | undefined {
    if (!obj || !path) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return path.split('.').reduce((acc: any, key) => (acc && typeof acc === 'object' && acc[key] !== undefined ? acc[key] : undefined), obj) as T | undefined;
}