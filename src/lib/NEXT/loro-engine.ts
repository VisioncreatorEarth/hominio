import type { BridiRecord, SumtiId, SelbriId, Pubkey, SumtiValue } from './db';
import { initialSumti, initialBridi, initialSelbri } from './db';
import { LoroDoc, LoroMap, LoroList } from 'loro-crdt';
// No longer importing populateBridiIndex as simulation is internal

// Define index pubkeys for easy reference using Facki
const FACKI_SUMTI_PUBKEY = '@facki_sumti';   // RENAMED
const FACKI_SELBRI_PUBKEY = '@facki_selbri'; // RENAMED
const FACKI_BRIDI_PUBKEY = '@facki_bridi';   // RENAMED

// --- LoroDoc Stores (In-Memory Maps) ---
const sumtiDocs = new Map<Pubkey, LoroDoc>();
const bridiDocs = new Map<Pubkey, LoroDoc>();
const selbriDocs = new Map<Pubkey, LoroDoc>();
// No separate mainIndexDoc anymore - index docs are part of sumtiDocs

// --- Initialization ---
function initializeDocs() {
    if (sumtiDocs.size > 0) return; // Already initialized

    console.log('[Loro Engine] Initializing LoroDocs...');

    // Initialize Sumti Docs (including the @liste_ ones)
    let nextPeerId = 1; // Start peer IDs from 1
    initialSumti.forEach(record => {
        const doc = new LoroDoc();
        try {
            doc.setPeerId(nextPeerId++);
        } catch (err) {
            if (!(err instanceof Error && err.message.includes('Peer id conflict'))) {
                console.warn(`[Loro Engine] Error setting peerId for Sumti ${record.pubkey}:`, err);
            }
        }
        const rootMap = doc.getMap('root');
        const ckajiData = { ...record.ckaji, pubkey: record.pubkey };
        rootMap.set('ckaji', ckajiData);
        // For index docs, datni might be initially empty {} or pre-populated (like @liste_meta)
        // We need the actual LoroMap container for datni, not just the plain object
        if (record.datni.klesi === 'LoroMap') {
            const datniMap = rootMap.setContainer('datni', new LoroMap());
            // Pre-populate if vasru exists (like @liste_meta)
            if (record.datni.vasru && typeof record.datni.vasru === 'object') {
                for (const [key, value] of Object.entries(record.datni.vasru)) {
                    datniMap.set(key, value);
                }
            }
        } else {
            // Handle other datni types if necessary, currently LoroText for some initialSumti
            rootMap.set('datni', record.datni); // Store the plain object for non-map klesi
        }
        sumtiDocs.set(record.pubkey, doc);
    });

    // Initialize Bridi Docs
    initialBridi.forEach(record => {
        const doc = new LoroDoc();
        try { doc.setPeerId(nextPeerId++); } catch { /* ignore error */ }
        const rootMap = doc.getMap('root');
        const ckajiData = { ...record.ckaji, pubkey: record.pubkey };
        rootMap.set('ckaji', ckajiData);
        rootMap.set('datni', record.datni);
        bridiDocs.set(record.pubkey, doc);
    });

    // Initialize Selbri Docs
    initialSelbri.forEach(record => {
        const doc = new LoroDoc();
        try { doc.setPeerId(nextPeerId++); } catch { /* ignore error */ }
        const rootMap = doc.getMap('root');
        const ckajiData = { ...record.ckaji, pubkey: record.pubkey };
        rootMap.set('ckaji', ckajiData);
        rootMap.set('datni', record.datni);
        selbriDocs.set(record.pubkey, doc);
    });
    console.log(`[Loro Engine] Initialized ${sumtiDocs.size} Sumti, ${bridiDocs.size} Bridi, ${selbriDocs.size} Selbri docs.`);


    // --- Populate Indexes from Initial Data (Simulation) ---
    console.log('[Loro Engine] Populating indexes from initial data (simulation)...');

    // Get index documents using new pubkeys
    const fackiSumtiDoc = getSumtiDoc(FACKI_SUMTI_PUBKEY);
    const fackiSelbriDoc = getSumtiDoc(FACKI_SELBRI_PUBKEY);
    const fackiBridiDoc = getSumtiDoc(FACKI_BRIDI_PUBKEY);

    if (!fackiSumtiDoc || !fackiSelbriDoc || !fackiBridiDoc) { // Updated check
        console.error("[Loro Engine] CRITICAL: Facki index documents not found after initialization!");
        return; // Cannot proceed with indexing
    }

    // Access the root 'datni' map within each index doc
    const sumtiIndexMap = fackiSumtiDoc.getMap('datni');
    const selbriIndexMap = fackiSelbriDoc.getMap('datni');
    const bridiIndexMap = fackiBridiDoc.getMap('datni');

    // Populate Sumti Existence Index
    let sumtiIndexedCount = 0;
    initialSumti.forEach(record => {
        if (sumtiIndexMap.get(record.pubkey) === undefined) {
            sumtiIndexMap.set(record.pubkey, true);
            sumtiIndexedCount++;
        }
    });
    console.log(`[Loro Engine] Added ${sumtiIndexedCount} entries to Sumti existence index.`);

    // Populate Selbri Existence Index
    let selbriIndexedCount = 0;
    initialSelbri.forEach(record => {
        if (selbriIndexMap.get(record.pubkey) === undefined) {
            selbriIndexMap.set(record.pubkey, true);
            selbriIndexedCount++;
        }
    });
    console.log(`[Loro Engine] Added ${selbriIndexedCount} entries to Selbri existence index.`);


    // Populate Bridi Relationship Index (using composite keys)
    let bridiIndexedCount = 0;
    let bridiEntriesAdded = 0;
    initialBridi.forEach(bridiRecord => {
        const bridiPubkey = bridiRecord.pubkey;
        const selbriId = bridiRecord.datni.selbri;

        // Add logging for the specific bridi we are debugging
        if (bridiPubkey === '@bridi_gunka_task1') {
            console.log(`[Loro Engine Debug] Processing ${bridiPubkey}...`);
        }

        // Iterate through each place (x1-x5) in the bridi's sumti map
        Object.entries(bridiRecord.datni.sumti).forEach(([place, sumtiId]) => {
            if (sumtiId !== undefined) { // Ensure sumtiId exists for the place
                // Construct the composite key: "<SelbriId>:<Place>:<SumtiId>"
                const compositeKey = `${selbriId}:${place}:${sumtiId}`;

                // Add logging for the specific key we are debugging
                if (bridiPubkey === '@bridi_gunka_task1' && place === 'x3') {
                    console.log(`[Loro Engine Debug]   Generating composite key: ${compositeKey}`);
                }

                try {
                    // Get or insert the LoroList for this composite key from the correct map
                    // Ensure bridiIndexMap is valid before calling helper
                    if (!bridiIndexMap) {
                        console.error(`[Loro Engine Debug] Cannot index ${compositeKey}, bridiIndexMap is null/undefined!`);
                        return; // Skip this entry
                    }
                    const list = getOrInsertListContainerInternal(bridiIndexMap, compositeKey);

                    // Add logging for the specific key we are debugging
                    if (bridiPubkey === '@bridi_gunka_task1' && place === 'x3') {
                        console.log(`[Loro Engine Debug]   Got list container for ${compositeKey}. Current content: ${JSON.stringify(list.toArray())}`);
                    }

                    // Add the Bridi's pubkey to the list if not already present
                    if (!list.toArray().includes(bridiPubkey)) {
                        list.push(bridiPubkey);
                        bridiEntriesAdded++;
                        if (bridiPubkey === '@bridi_gunka_task1' && place === 'x3') {
                            console.log(`[Loro Engine Debug]   Added ${bridiPubkey} to list for ${compositeKey}. New content: ${JSON.stringify(list.toArray())}`);
                        }
                    } else {
                        if (bridiPubkey === '@bridi_gunka_task1' && place === 'x3') {
                            console.log(`[Loro Engine Debug]   ${bridiPubkey} already present in list for ${compositeKey}.`);
                        }
                    }
                } catch (error) {
                    console.error(`[Loro Engine] Error indexing Bridi ${bridiPubkey} for key ${compositeKey}:`, error);
                }
            }
        });
        bridiIndexedCount++; // Count each bridi processed
    });
    console.log(`[Loro Engine] Processed ${bridiIndexedCount} initial Bridi records, adding ${bridiEntriesAdded} entries to Bridi relationship index.`);
    // Optional: Log the state of an index map for debugging
    const debugListContainer = bridiIndexMap.get('@selbri_gunka:x3:@project1');
    const debugListContent = (debugListContainer instanceof LoroList)
        ? debugListContainer.toArray()
        : `(Not found or not a List: ${typeof debugListContainer})`;
    console.log(`[Loro Engine] Bridi Index Map State sample ['@selbri_gunka:x3:@project1']:`, debugListContent);

}

// Helper kept internal for index population simulation
function getOrInsertListContainerInternal(map: LoroMap, key: string): LoroList<string> {
    let container = map.get(key); // Use 'let'

    // Check if it's already the correct type
    if (container instanceof LoroList) {
        return container as LoroList<string>;
    }

    // Check if something else exists at this key (schema conflict)
    if (container !== undefined) {
        console.error(`[Loro Engine] Index schema conflict: Expected LoroList at key '${key}', but found different type. Cannot proceed with this key.`);
        // Throw an error to halt faulty indexing, rather than replacing.
        throw new Error(`Indexing schema conflict at key '${key}'.`);
    }

    // Container is undefined, so create and set a new list
    // console.log(`[Loro Engine Debug] Creating new LoroList for key: ${key}`); // Optional debug log
    const newList = new LoroList<string>();
    map.setContainer(key, newList);
    // IMPORTANT: After setting, get it again to ensure we return the instance managed by the map
    container = map.get(key);
    if (container instanceof LoroList) {
        return container as LoroList<string>;
    } else {
        // This should ideally never happen if setContainer worked
        console.error(`[Loro Engine] CRITICAL: Failed to retrieve LoroList immediately after creation for key '${key}'!`);
        throw new Error(`Failed to create or retrieve LoroList for key '${key}'.`);
    }
}


// Ensure initialization happens on first use
initializeDocs();


// --- NEW: Composite Index Access Function ---

/**
 * Retrieves the LoroList of Bridi pubkeys for a given composite relationship key.
 * Key format: "<SelbriId>:<Place>:<SumtiId>"
 * Returns undefined if the index list doesn't exist or isn't a list.
 */
export function getBridiIndexList(compositeKey: string): LoroList<string> | undefined {
    const fackiBridiDoc = getSumtiDoc(FACKI_BRIDI_PUBKEY); // Use new constant
    if (!fackiBridiDoc) {
        console.warn(`[Loro Engine] Facki Bridi Index document (${FACKI_BRIDI_PUBKEY}) not found.`); // Updated log
        return undefined;
    }

    try {
        const bridiIndexMap = fackiBridiDoc.getMap('datni'); // Access the root 'datni' map
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


// --- LoroDoc Access Functions ---
/** Gets the LoroDoc for a Sumti by pubkey. */
export function getSumtiDoc(pubkey: Pubkey): LoroDoc | undefined {
    return sumtiDocs.get(pubkey);
}

/** Gets the LoroDoc for a Bridi by pubkey. */
export function getBridiDoc(pubkey: Pubkey): LoroDoc | undefined {
    return bridiDocs.get(pubkey);
}

/** Gets the LoroDoc for a Selbri by pubkey. */
export function getSelbriDoc(pubkey: Pubkey): LoroDoc | undefined {
    return selbriDocs.get(pubkey);
}

/** Gets all Sumti LoroDocs. */
export function getAllSumtiDocs(): LoroDoc[] {
    return Array.from(sumtiDocs.values());
}

/** Gets all Bridi LoroDocs. */
export function getAllBridiDocs(): LoroDoc[] {
    return Array.from(bridiDocs.values());
}

// --- Plain Data Accessors (from LoroDocs) ---

/** Helper to get the plain JS 'ckaji' object from a LoroDoc's root map */
export function getCkajiFromDoc(doc: LoroDoc | undefined): Record<string, unknown> | undefined {
    // Use .value to get the plain JS object/value
    return doc?.getMap('root').get('ckaji') as Record<string, unknown> | undefined;
}

/** Helper to get the plain JS 'datni' object/value from a LoroDoc's root map */
export function getDatniFromDoc(doc: LoroDoc | undefined): Record<string, unknown> | SumtiValue | undefined {
    // Use .value to get the plain JS object/value
    return doc?.getMap('root').get('datni') as Record<string, unknown> | SumtiValue | undefined;
}

/** Helper to get the plain JS 'ckaji' object for a given pubkey */
export function getCkajiForPubkey(pubkey: Pubkey): Record<string, unknown> | undefined {
    const doc = getSumtiDoc(pubkey) ?? getBridiDoc(pubkey) ?? getSelbriDoc(pubkey);
    return getCkajiFromDoc(doc);
}

/** Helper to get the plain JS 'datni' object/value for a given pubkey */
export function getDatniForPubkey(pubkey: Pubkey): Record<string, unknown> | SumtiValue | undefined {
    const doc = getSumtiDoc(pubkey) ?? getBridiDoc(pubkey) ?? getSelbriDoc(pubkey);
    return getDatniFromDoc(doc);
}


// --- Relationship Finding Functions (Operating on LoroDocs) ---

/**
 * Finds Bridi LoroDocs where a specific Sumti occupies a given place within a specific Selbri relationship.
 * REFACTORED TO USE COMPOSITE INDEX
 */
export function findBridiDocsBySelbriAndPlace(
    selbriId: SelbriId,
    place: keyof BridiRecord['datni']['sumti'],
    sumtiId: SumtiId
): LoroDoc[] {
    const results: LoroDoc[] = [];

    // --- Index Usage ---
    const compositeKey = `${selbriId}:${place}:${sumtiId}`;
    const indexedBridiPubkeys = getBridiIndexList(compositeKey)?.toArray(); // Use new function

    if (indexedBridiPubkeys) {
        // If index found, directly get those Bridi docs
        console.log(`[Loro Engine] Using composite Bridi index for '${compositeKey}', found ${indexedBridiPubkeys.length} candidates.`);
        for (const pubkey of indexedBridiPubkeys) {
            const bridiDoc = getBridiDoc(pubkey);
            if (bridiDoc) {
                // Verification might still be good practice, though index should be accurate
                const datni = getDatniFromDoc(bridiDoc) as BridiRecord['datni'] | undefined;
                if (datni && datni.selbri === selbriId && datni.sumti[place] === sumtiId) {
                    results.push(bridiDoc);
                } else {
                    console.warn(`[Loro Engine] Index inconsistency? Doc ${pubkey} found via key ${compositeKey} but data mismatch.`);
                }
            } else {
                console.warn(`[Loro Engine] Index inconsistency? Pubkey ${pubkey} from index key ${compositeKey} not found in bridiDocs.`);
            }
        }
    } else {
        // --- Fallback: Optional - Could still scan all if index fails, but less likely needed ---
        console.log(`[Loro Engine] Composite index miss for '${compositeKey}'. No matching Bridi found via index.`);
        // Omitting full scan fallback for composite index, as a miss means no direct match exists.
        // If partial matches were needed, different indexing/querying would be required.
    }
    // --- End Index Usage ---

    return results;
}


/**
 * Finds Bridi LoroDocs involving a specific Sumti in any place within a specific Selbri relationship.
 * Returns the Bridi LoroDoc and the place the Sumti occupies.
 * REFACTORED TO USE COMPOSITE INDEX (Iterating through potential places)
 */
export function findBridiDocsInvolvingSumti(
    selbriId: SelbriId,
    sumtiId: SumtiId
): { bridiDoc: LoroDoc; place: keyof BridiRecord['datni']['sumti'] }[] {
    const results: { bridiDoc: LoroDoc; place: keyof BridiRecord['datni']['sumti'] }[] = [];
    const places: (keyof BridiRecord['datni']['sumti'])[] = ['x1', 'x2', 'x3', 'x4', 'x5'];
    const foundBridiPubkeys = new Set<string>(); // Track found Bridi to avoid duplicates

    console.log(`[Loro Engine] Finding Bridi involving Sumti '${sumtiId}' in Selbri '${selbriId}' using composite index checks.`);

    // --- Index Usage ---
    // Iterate through each possible place the sumti could be
    for (const place of places) {
        const compositeKey = `${selbriId}:${place}:${sumtiId}`;
        const indexedBridiPubkeys = getBridiIndexList(compositeKey)?.toArray(); // Use new function

        if (indexedBridiPubkeys && indexedBridiPubkeys.length > 0) {
            console.log(`[Loro Engine] Composite index hit for '${compositeKey}', found ${indexedBridiPubkeys.length} candidates.`);
            for (const pubkey of indexedBridiPubkeys) {
                // Avoid adding the same Bridi multiple times if it matches different composite keys (unlikely but possible)
                if (!foundBridiPubkeys.has(pubkey)) {
                    const bridiDoc = getBridiDoc(pubkey);
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
                        console.warn(`[Loro Engine] Index inconsistency? Pubkey ${pubkey} from index key ${compositeKey} not found in bridiDocs.`);
                    }
                }
            }
        } else {
            // console.log(`[Loro Engine] Composite index miss for '${compositeKey}'.`); // Log misses if needed
        }
    }
    // --- End Index Usage ---

    // If no results found via index, we could optionally fall back to a full scan,
    // but with composite keys, index misses strongly suggest no matches exist.
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

// --- Initial Data Exports ---
export { initialSumti, initialSelbri, initialBridi };

// --- IMPORTANT ---
// No longer exporting mainIndexDoc
// export { mainIndexDoc }; // REMOVED 