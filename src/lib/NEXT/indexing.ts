import {
    type Loro,
    LoroMap,
    LoroList,
    type ContainerID,
    // LoroType - removed
} from 'loro-crdt';
// Removed unused imports: User, getDb, DbSchema, parseBridiInternal, Bridi, Pubkey

// Define the index root map key
const INDEX_ROOT_MAP_KEY = '__indexRoot';

/** Helper to get or create the root LoroMap container used for indexing */
export function getOrCreateIndexRootMap(doc: Loro): LoroMap {
    // Attempt to get the map
    // Use const as it's not reassigned
    const indexMap = doc.getMap(INDEX_ROOT_MAP_KEY);

    // If it doesn't exist, create it.
    // Note: LoroDoc doesn't directly expose a way to check if a container
    // exists without getting it, which creates it if absent.
    // So, getting it is sufficient. We assume if `getMap` returns, it's valid.

    // We might need to ensure it *is* a Map, though Loro's typing helps.
    // If doc.getMap could potentially return a different container type
    // under weird circumstances, more checks would be needed.

    return indexMap; // Return the map container
}


/** Helper to get or insert a LoroList container in a LoroMap */
export function getOrInsertListContainer(map: LoroMap, key: string): LoroList<string> {
    // Check if the key exists and holds a container
    const container = map.get(key);

    // Check if it's already a LoroList
    if (container instanceof LoroList) {
        // TODO: We might want to check if it's LoroList<string> specifically,
        // but runtime type checking for generics is complex. Assume correct for now.
        return container as LoroList<string>;
    } else if (container !== undefined) {
        // Key exists but is not a LoroList - this indicates a potential schema issue.
        console.error(`[Indexing] Error: Expected LoroList at key '${key}', but found different type.`);
        // Decide on error handling: throw error, or try replacing? Replacing is risky.
        // For now, let's throw an error to highlight the problem.
        throw new Error(`Indexing schema conflict: Expected LoroList at key '${key}'.`);
    } else {
        // Key doesn't exist, create and return a new LoroList<string>
        // console.log(`[Indexing] Creating LoroList<string> for key: ${key}`);
        const newList = new LoroList<string>();
        map.setContainer(key, newList);
        return newList;
    }
}

// Function to populate bridi index
export function populateBridiIndex(doc: Loro, bridiData: { selbri: string; sumti: Record<string, string> }, textContainerId: ContainerID): void {
    console.log('[Indexing] Starting bridi index population');
    try {
        // Use the exported helper function
        const indexMap = getOrCreateIndexRootMap(doc);

        // Convert the bridiData into the format needed for indexing
        const selbri = bridiData.selbri;
        const sumtiEntries = Object.entries(bridiData.sumti);

        // Index by selbri
        const selbriKey = `selbri:${selbri}`;
        const selbriList = getOrInsertListContainer(indexMap, selbriKey);

        // Use .toArray() and ensure ID is string
        const listValue = selbriList.toArray();
        const idString = textContainerId.toString();
        if (!listValue.includes(idString)) {
            selbriList.push(idString);
            console.log(`[Indexing] Added ${idString} to list for selbri: ${selbri}`);
        }

        // Index by sumti (for each place)
        for (const [place, sumtiValue] of sumtiEntries) {
            if (sumtiValue) {
                // Create composite key for efficient relational lookups
                // Format: selbri:place:sumtiValue (e.g., "@selbri_zukte:x1:@person1")
                const compositeKey = `${selbri}:${place}:${sumtiValue}`;
                const compositeList = getOrInsertListContainer(indexMap, compositeKey);

                // Add bridi reference if not already present
                const compositeListValue = compositeList.toArray();
                if (!compositeListValue.includes(idString)) {
                    compositeList.push(idString);
                    console.log(`[Indexing] Added ${idString} to composite list for key: ${compositeKey}`);
                }

                // Also index by sumti value directly
                const sumtiKey = `sumti:${sumtiValue}`;
                const sumtiList = getOrInsertListContainer(indexMap, sumtiKey);
                const sumtiListValue = sumtiList.toArray();
                if (!sumtiListValue.includes(idString)) {
                    sumtiList.push(idString);
                    console.log(`[Indexing] Added ${idString} to list for sumti: ${sumtiValue}`);
                }
            }
        }

        console.log('[Indexing] Bridi index population complete.');
    } catch (error) {
        console.error('[Indexing] Error during bridi index population:', error);
    }
}