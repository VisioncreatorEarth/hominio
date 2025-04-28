import { writable, type Writable } from 'svelte/store';
import { hominioDB } from './hominio-db'; // Import hominioDB
import { GENESIS_PUBKEY } from '../../db/constants'; // Import GENESIS_PUBKEY
import { LoroMap } from 'loro-crdt'; // Import LoroMap for type checking

// RENAMED type and updated values
export type IndexLeafType = 'leaves' | 'schemas' | 'composites' | 'composites-by-component';

// In-memory cache of the registry, populated from @genesis or via update
// RENAMED keys to match IndexLeafType
const registry: Record<IndexLeafType, string | null> = {
    leaves: null,
    schemas: null,
    composites: null, // Simple existence index
    'composites-by-component': null // Composite index
};
let isGenesisLoaded = false; // Flag to track if we've loaded from @genesis

// Store for external reactivity if needed, reflects the cache
// RENAMED keys
const indexLeafPubkeysStore: Writable<Record<IndexLeafType, string | null>> = writable(registry);

// Function to update the in-memory registry cache (called by sync process after @genesis parse)
// RENAMED parameter type
export function updateIndexLeafRegistry(pubkeys: Partial<Record<IndexLeafType, string>>) {
    let changed = false;
    for (const key in pubkeys) {
        const indexType = key as IndexLeafType; // Use renamed type
        const newKey = pubkeys[indexType];
        if (newKey && typeof newKey === 'string' && newKey.length > 0) {
            if (registry[indexType] !== newKey) {
                registry[indexType] = newKey;
                changed = true;
            }
        } else {
            // Updated log message
            console.warn(`[IndexLeafRegistry] Attempted to update cache for ${indexType} with invalid value: ${newKey}`);
        }
    }
    if (changed) {
        indexLeafPubkeysStore.set(registry); // Update reactive store if cache changed
    }
    // Mark genesis as loaded if we successfully update the cache via this function
    if (Object.keys(pubkeys).length > 0) {
        isGenesisLoaded = true;
    }
}

/**
 * Asynchronously loads the Index Leaf registry keys from the @genesis document if not already loaded.
 * Populates the in-memory cache.
 */
async function ensureGenesisKeysLoaded(): Promise<void> {
    if (isGenesisLoaded) {
        return; // Already loaded or populated by sync
    }

    try {
        const genesisDoc = await hominioDB.getLoroDoc(GENESIS_PUBKEY);
        if (!genesisDoc) {
            // Updated log message
            console.error('[IndexLeafRegistry] Failed to load @genesis document.');
            return;
        }

        // GENESIS Structure Update: Expects data: { type: 'LoroMap', value: { leaves: '0x...', ... } }
        const dataMap = genesisDoc.getMap('data');
        if (!(dataMap instanceof LoroMap)) {
            console.error('[IndexLeafRegistry] @genesis document data is not a LoroMap.');
            isGenesisLoaded = true; // Mark as loaded to prevent retries
            return;
        }
        const dataType = dataMap.get('type');
        if (dataType !== 'LoroMap') {
            console.error(`[IndexLeafRegistry] @genesis document data.type is '${dataType}', expected 'LoroMap'.`);
            isGenesisLoaded = true;
            return;
        }

        // FIX: Access the nested 'value' map
        const valueContainer = dataMap.get('value');
        if (!(valueContainer instanceof LoroMap)) {
            console.error('[IndexLeafRegistry] @genesis document data.value is not a LoroMap.');
            isGenesisLoaded = true;
            return;
        }
        const indexValueMap = valueContainer; // Now we know it's the LoroMap containing the keys

        const extractedKeys: Partial<Record<IndexLeafType, string>> = {};
        // FIX: Use correct keys from the meta index definition
        const leavesKey = indexValueMap.get('leaves') as string | undefined;
        const schemasKey = indexValueMap.get('schemas') as string | undefined;
        const compositesKey = indexValueMap.get('composites') as string | undefined;
        const compositesCompKey = indexValueMap.get('composites_by_component') as string | undefined;

        if (leavesKey) extractedKeys.leaves = leavesKey;
        if (schemasKey) extractedKeys.schemas = schemasKey;
        if (compositesKey) extractedKeys.composites = compositesKey;
        if (compositesCompKey) extractedKeys['composites-by-component'] = compositesCompKey;

        if (Object.keys(extractedKeys).length > 0) {
            updateIndexLeafRegistry(extractedKeys);
            // console.log('[IndexLeafRegistry] Loaded keys from @genesis:', extractedKeys); // Optional debug
        } else {
            console.warn('[IndexLeafRegistry] Loaded @genesis, but found no valid keys in its data.value map.');
        }
        isGenesisLoaded = true; // Mark as loaded successfully or unsuccessfully (to prevent retries)

    } catch (err) {
        // Updated log message
        console.error('[IndexLeafRegistry] Error loading @genesis document:', err);
    }
}

// Getter function - tries cache, then falls back to loading @genesis
// RENAMED function and parameter type
export async function getIndexLeafPubKey(indexType: IndexLeafType): Promise<string | null> {
    // 1. Check cache first
    if (registry[indexType]) {
        return registry[indexType];
    }

    // 2. If not in cache, ensure keys are loaded from @genesis
    await ensureGenesisKeysLoaded();

    // 3. Check cache again after attempting load
    if (registry[indexType]) {
        return registry[indexType];
    } else {
        return null;
    }
}

// Helper to check if a given pubkey belongs to any known Index Leaf
// Subscribes to the store to keep the set updated
let knownIndexPubKeysSet = new Set<string>();
// Use renamed store
indexLeafPubkeysStore.subscribe(value => {
    const newSet = new Set<string>();
    Object.values(value).forEach(key => {
        if (key) newSet.add(key);
    });
    knownIndexPubKeysSet = newSet;
});

// RENAMED function
export function isIndexLeafDocument(pubKey: string): boolean {
    return knownIndexPubKeysSet.has(pubKey);
}

// Export the readable store if needed for reactivity elsewhere
// RENAMED export
export const readableIndexLeafPubkeys = {
    subscribe: indexLeafPubkeysStore.subscribe
}; 