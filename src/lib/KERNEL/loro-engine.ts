import type { LoroDoc } from 'loro-crdt';
import { LoroList } from 'loro-crdt';
import type { BridiRecord } from '../../db/seeding/bridi';
import type { SelbriId } from '../../db/seeding/selbri';
import type { SumtiId, SumtiValue, Pubkey } from '../../db/seeding/sumti';
import { hominioDB } from '$lib/KERNEL/hominio-db'; // Import the singleton directly
import { getFackiIndexPubKey } from './facki-indices'; // Ensure this is imported

// --- Doc Access Functions (Use HominioDB) ---

/**
 * Gets the LoroDoc for a Sumti by pubkey using HominioDB
 */
export async function getSumtiDoc(pubkey: Pubkey): Promise<LoroDoc | null> {
    // Removed initialization check, use imported singleton directly
    // if (!hominioDB) {
    //     console.error('[Loro Engine] HominioDB not initialized. Call initializeLoroEngine first.');
    //     return null;
    // }
    return await hominioDB.getLoroDoc(pubkey);
}

/**
 * Gets the LoroDoc for a Bridi by pubkey using HominioDB
 */
export async function getBridiDoc(pubkey: Pubkey): Promise<LoroDoc | null> {
    // Removed initialization check
    return await hominioDB.getLoroDoc(pubkey);
}

/**
 * Gets the LoroDoc for a Selbri by pubkey using HominioDB
 */
export async function getSelbriDoc(pubkey: Pubkey): Promise<LoroDoc | null> {
    // Removed initialization check
    return await hominioDB.getLoroDoc(pubkey);
}

// --- Plain Data Accessors (from LoroDocs) ---

/**
 * Helper to get the plain JS 'ckaji' object from a LoroDoc's root map
 */
export function getCkajiFromDoc(doc: LoroDoc | null): Record<string, unknown> | undefined {
    if (!doc) return undefined;
    try {
        return doc.toJSON()?.['ckaji'] as Record<string, unknown> | undefined;
    } catch (e) {
        console.error(`[Loro Engine] Error calling toJSON() on doc:`, e);
        return undefined;
    }
}

/**
 * Helper to get the plain JS 'datni' object/value from a LoroDoc's root map
 */
export function getDatniFromDoc(doc: LoroDoc | null): Record<string, unknown> | SumtiValue | undefined {
    if (!doc) return undefined;
    try {
        const jsonData = doc.toJSON();
        console.log(`[Loro Engine getDatniFromDoc] doc.toJSON() result:`, JSON.stringify(jsonData));
        return jsonData?.['datni'] as Record<string, unknown> | SumtiValue | undefined;
    } catch (e) {
        console.error(`[Loro Engine] Error calling toJSON() on doc:`, e);
        return undefined;
    }
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
 * Checks if a Sumti document exists in the Facki Sumti index.
 * @param pubKey The public key of the Sumti document.
 * @returns True if the Sumti exists in the index, false otherwise.
 */
export async function checkSumtiExists(pubKey: string): Promise<boolean> {
    const fackiIndexKey = await getFackiIndexPubKey('sumti'); // Await the key

    // Add log to check resolved key
    console.log(`[checkSumtiExists] fackiIndexKey type: ${typeof fackiIndexKey}, value: ${fackiIndexKey}`);

    if (!fackiIndexKey) {
        console.warn('[Loro Engine] Facki Sumti Index Key not available for existence check.');
        return false;
    }
    const fackiDoc = await getSumtiDoc(fackiIndexKey); // Use the resolved string key
    if (!fackiDoc) {
        console.warn(`[Loro Engine] Facki Sumti Index document (${fackiIndexKey}) not found for existence check.`);
        return false;
    }
    const indexMap = fackiDoc.getMap('datni');
    // Use .get() and check for undefined instead of .has()
    return indexMap.get(pubKey) !== undefined;
}

/**
 * Checks if a Selbri document exists in the Facki Selbri index.
 * @param pubKey The public key of the Selbri document.
 * @returns True if the Selbri exists in the index, false otherwise.
 */
export async function checkSelbriExists(pubKey: string): Promise<boolean> { // Use correct parameter name pubKey
    const fackiIndexKey = await getFackiIndexPubKey('selbri'); // Await the key

    // Log added previously
    console.log(`[checkSelbriExists] fackiIndexKey type: ${typeof fackiIndexKey}, value: ${fackiIndexKey}`);

    if (!fackiIndexKey) {
        console.warn('[Loro Engine] Facki Selbri Index Key not available for existence check.');
        return false;
    }
    const fackiDoc = await getSelbriDoc(fackiIndexKey); // Use the resolved string key
    if (!fackiDoc) {
        console.warn(`[Loro Engine] Facki Selbri Index document (${fackiIndexKey}) not found for existence check.`);
        return false;
    }
    const indexMap = fackiDoc.getMap('datni');
    // Use .get() and check for undefined instead of .has()
    return indexMap.get(pubKey) !== undefined; // Use correct parameter name pubKey
}

// --- Composite Index Access Function ---

/**
 * Retrieves the LoroList of Bridi pubkeys for a given composite relationship key.
 * Key format: "<SelbriId>:<Place>:<SumtiId>"
 * Returns undefined if the index list doesn't exist or isn't a list.
 */
export async function getBridiIndexList(compositeKey: string): Promise<LoroList<string> | undefined> {
    const fackiBridiByCompPubKey = getFackiIndexPubKey('bridi_by_component'); // <<< Use dynamic key
    if (!fackiBridiByCompPubKey) {
        console.error(`[Loro Engine] Cannot get Bridi index list: Facki Bridi Component index pubkey not available.`);
        return undefined;
    }
    const fackiBridiDoc = await getSumtiDoc(fackiBridiByCompPubKey); // Assumes index docs are like Sumti (Map root)
    if (!fackiBridiDoc) {
        console.warn(`[Loro Engine] Facki Bridi Component Index document (${fackiBridiByCompPubKey}) not found.`);
        return undefined;
    }

    try {
        // Access the index map directly from the root 'datni' map
        const bridiIndexMap = fackiBridiDoc.getMap('datni');
        if (!bridiIndexMap) {
            console.warn(`[Loro Engine] Facki Bridi Component Index document (${fackiBridiByCompPubKey}) 'datni' map not found.`);
            return undefined;
        }

        // Access the specific list using the composite key from the root datni map
        const container = bridiIndexMap.get(compositeKey);

        if (container instanceof LoroList) {
            return container as LoroList<string>;
        } else if (container !== undefined) {
            console.warn(`[Loro Engine] Composite index key '${compositeKey}' exists but is not a LoroList.`);
            return undefined;
        } else {
            // Key doesn't exist in the index map
            console.warn(`[Loro Engine getBridiIndexList] Key "${compositeKey}" not found in index map. Available keys:`, Array.from(bridiIndexMap.keys()));
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
): Promise<{ pubkey: string; doc: LoroDoc }[]> {
    const results: { pubkey: string; doc: LoroDoc }[] = [];

    // Build the composite key and check the index
    const compositeKey = `${selbriId}:${String(place)}:${sumtiId}`;
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
                    results.push({ pubkey, doc: bridiDoc });
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
        const compositeKey = `${selbriId}:${String(place)}:${sumtiId}`;
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