import { writable, type Writable } from 'svelte/store';
import { hominioDB } from './hominio-db'; // Import hominioDB
import { GENESIS_PUBKEY } from '../../db/constants'; // Import GENESIS_PUBKEY
import { LoroMap } from 'loro-crdt'; // Import LoroMap for type checking

export type FackiIndexType = 'sumti' | 'selbri' | 'bridi' | 'bridi_by_component';

// In-memory cache of the registry, populated from @genesis or via update
const registry: Record<FackiIndexType, string | null> = {
    sumti: null,
    selbri: null,
    bridi: null, // Simple existence index
    bridi_by_component: null // Composite index
};
let isGenesisLoaded = false; // Flag to track if we've loaded from @genesis

// Store for external reactivity if needed, reflects the cache
const fackiIndexPubkeysStore: Writable<Record<FackiIndexType, string | null>> = writable(registry);

// Function to update the in-memory registry cache (called by sync process after @genesis parse)
export function updateFackiIndexRegistry(pubkeys: Partial<Record<FackiIndexType, string>>) {
    let changed = false;
    for (const key in pubkeys) {
        const indexType = key as FackiIndexType;
        const newKey = pubkeys[indexType];
        if (newKey && typeof newKey === 'string' && newKey.length > 0) {
            if (registry[indexType] !== newKey) {
                registry[indexType] = newKey;
                changed = true;
            }
        } else {
            console.warn(`[FackiIndexRegistry] Attempted to update cache for ${indexType} with invalid value: ${newKey}`);
        }
    }
    if (changed) {
        fackiIndexPubkeysStore.set(registry); // Update reactive store if cache changed
    }
    // Mark genesis as loaded if we successfully update the cache via this function
    if (Object.keys(pubkeys).length > 0) {
        isGenesisLoaded = true;
    }
}

/**
 * Asynchronously loads the Facki registry keys from the @genesis document if not already loaded.
 * Populates the in-memory cache.
 */
async function ensureGenesisKeysLoaded(): Promise<void> {
    if (isGenesisLoaded) {
        return; // Already loaded or populated by sync
    }

    try {
        const genesisDoc = await hominioDB.getLoroDoc(GENESIS_PUBKEY);
        if (!genesisDoc) {
            console.error('[FackiIndexRegistry] Failed to load @genesis document.');
            return;
        }

        const datniMap = genesisDoc.getMap('datni');
        if (!(datniMap instanceof LoroMap)) {
            console.error('[FackiIndexRegistry] @genesis document datni is not a LoroMap.');
            return;
        }

        const extractedKeys: Partial<Record<FackiIndexType, string>> = {};
        const sumtiKey = datniMap.get('sumti') as string | undefined;
        const selbriKey = datniMap.get('selbri') as string | undefined;
        const bridiKey = datniMap.get('bridi') as string | undefined;
        const bridiCompKey = datniMap.get('bridi_by_component') as string | undefined;

        if (sumtiKey) extractedKeys.sumti = sumtiKey;
        if (selbriKey) extractedKeys.selbri = selbriKey;
        if (bridiKey) extractedKeys.bridi = bridiKey;
        if (bridiCompKey) extractedKeys.bridi_by_component = bridiCompKey;

        if (Object.keys(extractedKeys).length > 0) {
            updateFackiIndexRegistry(extractedKeys); // Populate cache
            isGenesisLoaded = true;
        } else {
            console.warn('[FackiIndexRegistry] Loaded @genesis, but found no valid keys in its datni map.');
            // Mark as loaded anyway to prevent retries if genesis is empty/invalid
            isGenesisLoaded = true;
        }

    } catch (err) {
        console.error('[FackiIndexRegistry] Error loading @genesis document:', err);
    }
}

// Getter function - tries cache, then falls back to loading @genesis
export async function getFackiIndexPubKey(indexType: FackiIndexType): Promise<string | null> {
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

// Helper to check if a given pubkey belongs to any known Facki index
// Subscribes to the store to keep the set updated
let knownIndexPubKeysSet = new Set<string>();
fackiIndexPubkeysStore.subscribe(value => {
    const newSet = new Set<string>();
    Object.values(value).forEach(key => {
        if (key) newSet.add(key);
    });
    knownIndexPubKeysSet = newSet;
});

export function isFackiIndexDocument(pubKey: string): boolean {
    return knownIndexPubKeysSet.has(pubKey);
}

// Export the readable store if needed for reactivity elsewhere
export const readableFackiIndexPubkeys = {
    subscribe: fackiIndexPubkeysStore.subscribe
}; 