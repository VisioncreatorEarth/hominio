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
function getOrCreateIndexRootMap(doc: Loro): LoroMap {
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
function getOrInsertListContainer(map: LoroMap, key: string): LoroList<string> {
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
export function populateBridiIndex(doc: Loro, text: string, textContainerId: ContainerID): void {
    // TEMP: Placeholder for Bridi type until import is fixed
    type Bridi = { selbri: string; sumti: string[] };

    console.log('[Indexing] Starting bridi index population');
    try {
        // const parsed = await parseBridiInternal({ text, mode: 'strict', doc }); // Re-add when module fixed
        // console.log('[Indexing] Parsed bridi:', parsed);

        // TEMP: Placeholder for actual parsing result until available
        const parsed: Bridi[] = [
            // Add sample Bridi objects here based on the expected structure
            // Example: { selbri: "...", sumti: ["...", "..."] }
            // This needs to be replaced with actual parsing logic using `text`
        ];
        if (!parsed || parsed.length === 0) {
            // console.log('[Indexing] No bridi found or parsing failed.'); // Less noisy log
            return;
        }

        // Use the new helper function
        const indexMap = getOrCreateIndexRootMap(doc);

        parsed.forEach((bridi) => {
            const selbriKey = `selbri:${bridi.selbri}`;
            const selbriList = getOrInsertListContainer(indexMap, selbriKey);

            // Use .toArray() and ensure ID is string
            const listValue = selbriList.toArray();
            const idString = textContainerId.toString();
            if (!listValue.includes(idString)) {
                selbriList.push(idString);
                // console.log(`[Indexing] Added ${idString} to list for selbri: ${bridi.selbri}`);
            }

            bridi.sumti.forEach((sumti: string) => {
                const sumtiKey = `sumti:${sumti}`;
                const sumtiList = getOrInsertListContainer(indexMap, sumtiKey);
                // Use .toArray() and ensure ID is string
                const sumtiListValue = sumtiList.toArray();
                if (!sumtiListValue.includes(idString)) {
                    sumtiList.push(idString);
                    // console.log(`[Indexing] Added ${idString} to list for sumti: ${sumti}`);
                }
            });
        });

        // console.log('[Indexing] Bridi index population complete.'); // Less noisy log
        // console.log('[Indexing] Final index map state:', indexMap.toJSON()); // Be careful logging large states
    } catch (error) {
        console.error('[Indexing] Error during bridi index population:', error);
    }
}