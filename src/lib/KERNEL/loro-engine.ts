import type { LoroDoc } from 'loro-crdt';
import { LoroList, LoroMap } from 'loro-crdt';
import type { CompositeRecord } from '../../db/seeding/composite.data';
import type { SchemaId } from '../../db/seeding/schema.data';
import type { LeafId, LeafValue, Pubkey } from '../../db/seeding/leaf.data';
import { hominioDB } from '$lib/KERNEL/hominio-db'; // Import the singleton directly
import { getIndexLeafPubKey } from './index-registry'; // Ensure this is imported

// --- Doc Access Functions (Use HominioDB) ---

/**
 * Gets the LoroDoc for a Leaf by pubkey using HominioDB
 */
export async function getLeafDoc(pubkey: Pubkey): Promise<LoroDoc | null> {
    // Removed initialization check, use imported singleton directly
    return await hominioDB.getLoroDoc(pubkey);
}

/**
 * Gets the LoroDoc for a Composite by pubkey using HominioDB
 */
export async function getCompositeDoc(pubkey: Pubkey): Promise<LoroDoc | null> {
    // Removed initialization check
    return await hominioDB.getLoroDoc(pubkey);
}

/**
 * Gets the LoroDoc for a Schema by pubkey using HominioDB
 */
export async function getSchemaDoc(pubkey: Pubkey): Promise<LoroDoc | null> {
    // Removed initialization check
    return await hominioDB.getLoroDoc(pubkey);
}

// --- Plain Data Accessors (from LoroDocs) ---

/**
 * Helper to get the plain JS 'metadata' object from a LoroDoc's root map
 */
export function getMetadataFromDoc(doc: LoroDoc | null): Record<string, unknown> | undefined {
    if (!doc) return undefined;
    try {
        return doc.toJSON()?.['metadata'] as Record<string, unknown> | undefined;
    } catch (e) {
        console.error(`[Loro Engine] Error calling toJSON() on doc:`, e);
        return undefined;
    }
}

/**
 * Helper to get the plain JS 'data' object/value from a LoroDoc's root map
 */
export function getDataFromDoc(doc: LoroDoc | null): Record<string, unknown> | LeafValue | undefined {
    if (!doc) return undefined;
    try {
        const jsonData = doc.toJSON();
        const data = jsonData?.['data'];

        // Return the complete data object with its structure intact
        if (typeof data === 'object' && data !== null) {
            return data as Record<string, unknown> | LeafValue;
        } else if (typeof data === 'string') {
            console.warn(`[Loro Engine getDataFromDoc] Found raw string at 'data' key for doc. Reconstructing LeafValueText.`);
            return { type: 'LoroText', value: data } as LeafValue;
        } else {
            return data as Record<string, unknown> | LeafValue | undefined;
        }
    } catch (e) {
        console.error(`[Loro Engine] Error calling toJSON() on doc:`, e);
        return undefined;
    }
}

/**
 * Helper to get the plain JS 'metadata' object for a given pubkey
 */
export async function getMetadataForPubkey(pubkey: Pubkey): Promise<Record<string, unknown> | undefined> {
    const doc = await getLeafDoc(pubkey) || await getCompositeDoc(pubkey) || await getSchemaDoc(pubkey);
    return getMetadataFromDoc(doc);
}

/**
 * Helper to get the plain JS 'data' object/value for a given pubkey
 */
export async function getDataForPubkey(pubkey: Pubkey): Promise<Record<string, unknown> | LeafValue | undefined> {
    const doc = await getLeafDoc(pubkey) || await getCompositeDoc(pubkey) || await getSchemaDoc(pubkey);
    return getDataFromDoc(doc);
}

// --- Existence Index Check Functions ---

/**
 * Checks if a Leaf document exists in the Leaf index.
 * @param pubkey The public key of the Leaf document.
 * @returns True if the Leaf exists in the index, false otherwise.
 */
export async function checkLeafExists(pubkey: string): Promise<boolean> {
    try {
        const indexPubKey = await getIndexLeafPubKey('leaves');
        if (!indexPubKey) {
            console.error('[Loro Engine] Leaf index pubkey not found.');
            return false; // Cannot check without index
        }
        const indexDoc = await getLeafDoc(indexPubKey);
        if (!indexDoc) {
            console.warn(`[Loro Engine] Leaf index document ${indexPubKey} not loaded.`);
            return false; // Consider it non-existent if index is missing
        }

        // FIX: Parse data.value LoroMap for the key
        const dataMap = indexDoc.getMap('data');
        if (!(dataMap instanceof LoroMap)) {
            console.error('[Loro Engine] Leaf index document structure invalid (data is not LoroMap) for existence check.');
            return false;
        }
        const valueContainer = dataMap.get('value');
        if (!(valueContainer instanceof LoroMap)) {
            console.error('[Loro Engine] Leaf index document structure invalid (data.value is not LoroMap) for existence check.');
            return false;
        }

        // FIX: Use .get() to check for key existence
        return valueContainer.get(pubkey) !== undefined;

    } catch (error) {
        console.error(`[Loro Engine] Error checking Leaf existence for ${pubkey}:`, error);
        return false;
    }
}

/**
 * Checks if a Schema document exists in the Schema index.
 * @param pubkey The public key of the Schema document.
 * @returns True if the Schema exists in the index, false otherwise.
 */
export async function checkSchemaExists(pubkey: string): Promise<boolean> {
    try {
        const indexPubKey = await getIndexLeafPubKey('schemas');
        if (!indexPubKey) {
            console.error('[Loro Engine] Schema index pubkey not found.');
            return false; // Cannot check without index
        }
        const indexDoc = await getLeafDoc(indexPubKey); // Index is a Leaf
        if (!indexDoc) {
            console.warn(`[Loro Engine] Schema index document ${indexPubKey} not loaded.`);
            return false; // Consider it non-existent if index is missing
        }

        // FIX: Parse data.value LoroMap for the key
        const dataMap = indexDoc.getMap('data');
        if (!(dataMap instanceof LoroMap)) {
            console.error('[Loro Engine] Schema index document structure invalid (data is not LoroMap) for existence check.');
            return false;
        }
        const valueContainer = dataMap.get('value');
        if (!(valueContainer instanceof LoroMap)) {
            console.error('[Loro Engine] Schema index document structure invalid (data.value is not LoroMap) for existence check.');
            return false;
        }

        // FIX: Use .get() to check for key existence
        return valueContainer.get(pubkey) !== undefined;

    } catch (error) {
        console.error(`[Loro Engine] Error checking Schema existence for ${pubkey}:`, error);
        return false;
    }
}

// --- Composite Index Access Function ---

/**
 * Retrieves the LoroList of Composite pubkeys for a given composite relationship key.
 * Key format: "schema:<SchemaId>:<Place>:<LeafId>"
 * Returns undefined if the index list doesn't exist or isn't a list.
 */
export async function getCompositeIndexList(compositeKey: string): Promise<LoroList<string> | undefined> {
    const indexCompositeByCompPubKey = await getIndexLeafPubKey('composites-by-component');
    if (!indexCompositeByCompPubKey) {
        console.error(`[Loro Engine] Cannot get Composite index list: Component index pubkey not available.`);
        return undefined;
    }
    const indexCompositeDoc = await getLeafDoc(indexCompositeByCompPubKey);
    if (!indexCompositeDoc) {
        console.warn(`[Loro Engine] Composite Component Index document (${indexCompositeByCompPubKey}) not found.`);
        return undefined;
    }

    try {
        // Use the broader LeafValue type which includes the LoroMap structure
        const indexData = getDataFromDoc(indexCompositeDoc) as LeafValue | undefined;
        if (!indexData || indexData.type !== 'LoroMap') {
            console.warn(`[Loro Engine] Composite Component Index document (${indexCompositeByCompPubKey}) data structure invalid (expected data.type 'LoroMap', got '${indexData?.type}').`);
            return undefined;
        }

        const rootDataMap = indexCompositeDoc.getMap('data');
        if (!rootDataMap) {
            console.warn(`[Loro Engine] Composite Component Index document (${indexCompositeByCompPubKey}) 'data' LoroMap not found.`);
            return undefined;
        }
        const indexValueContainer = rootDataMap.get('value');
        if (!(indexValueContainer instanceof LoroMap)) {
            console.warn(`[Loro Engine] Composite Component Index document (${indexCompositeByCompPubKey}) 'data.value' is not a LoroMap container.`);
            return undefined;
        }
        const indexValueMap = indexValueContainer as LoroMap;

        const container = indexValueMap.get(compositeKey);

        if (container instanceof LoroList) {
            return container as LoroList<string>;
        } else if (container !== undefined) {
            console.warn(`[Loro Engine] Composite index key '${compositeKey}' exists but is not a LoroList in the index map.`);
            return undefined;
        } else {
            console.warn(`[Loro Engine getCompositeIndexList] Key "${compositeKey}" not found in index map.`);
            return undefined;
        }
    } catch (error) {
        console.error(`[Loro Engine] Error retrieving index list for composite key '${compositeKey}':`, error);
        return undefined;
    }
}

// --- Relationship Finding Functions ---

/**
 * Finds Composite LoroDocs where a specific Leaf occupies a given place within a specific Schema relationship.
 * Uses the composite index for efficient lookup.
 */
export async function findCompositeDocsBySchemaAndPlace(
    schemaId: SchemaId,
    place: keyof CompositeRecord['data']['places'],
    leafId: LeafId
): Promise<{ pubkey: string; doc: LoroDoc }[]> {
    const results: { pubkey: string; doc: LoroDoc }[] = [];

    const compositeKey = `schema:${schemaId}:${String(place)}:${leafId}`;
    const indexedCompositePubkeys = await getCompositeIndexList(compositeKey);

    const compositeKeys = indexedCompositePubkeys?.toArray() || [];

    if (compositeKeys.length === 0) {
        console.log(`[Loro Engine] Composite index miss for '${compositeKey}'. No matching Composite found via index.`);
        return [];
    }

    for (const pubkey of compositeKeys) {
        const compositeDoc = await getCompositeDoc(pubkey);
        if (compositeDoc) {
            const data = getDataFromDoc(compositeDoc) as CompositeRecord['data'] | undefined;
            if (data && data.schemaId === schemaId && data.places[place] === leafId) {
                results.push({ pubkey, doc: compositeDoc });
            } else {
                console.warn(`[Loro Engine] Index inconsistency? Doc ${pubkey} found via key ${compositeKey} but data mismatch.`);
            }
        } else {
            console.warn(`[Loro Engine] Index inconsistency? Pubkey ${pubkey} from index key ${compositeKey} not found.`);
        }
    }

    return results;
}

/**
 * Finds Composite LoroDocs involving a specific Leaf in any place within a specific Schema relationship.
 * Returns the Composite LoroDoc and the place the Leaf occupies.
 */
export async function findCompositeDocsInvolvingLeaf(
    schemaId: SchemaId,
    leafId: LeafId
): Promise<{ compositeDoc: LoroDoc; place: keyof CompositeRecord['data']['places'] }[]> {
    const results: { compositeDoc: LoroDoc; place: keyof CompositeRecord['data']['places'] }[] = [];
    const places: (keyof CompositeRecord['data']['places'])[] = ['x1', 'x2', 'x3', 'x4', 'x5'];
    const foundCompositePubkeys = new Set<string>();

    for (const place of places) {
        const compositeKey = `schema:${schemaId}:${String(place)}:${leafId}`;
        const indexedCompositePubkeys = await getCompositeIndexList(compositeKey);
        const compositeKeys = indexedCompositePubkeys?.toArray() || [];

        if (compositeKeys.length > 0) {

            for (const pubkey of compositeKeys) {
                if (!foundCompositePubkeys.has(pubkey)) {
                    const compositeDoc = await getCompositeDoc(pubkey);
                    if (compositeDoc) {
                        const data = getDataFromDoc(compositeDoc) as CompositeRecord['data'] | undefined;
                        if (data && data.schemaId === schemaId && data.places[place] === leafId) {
                            results.push({ compositeDoc, place });
                            foundCompositePubkeys.add(pubkey);
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

    return results;
}

// --- Utility Functions ---

/**
 * Simple utility to get a value from a potentially nested object path string like "metadata.type".
 * Operates on plain JS objects/values retrieved from LoroDocs.
 */
export function getPathValue<T = unknown>(obj: object | null | undefined, path: string): T | undefined {
    if (!obj || !path) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return path.split('.').reduce((acc: any, key) => (acc && typeof acc === 'object' && acc[key] !== undefined ? acc[key] : undefined), obj) as T | undefined;
}