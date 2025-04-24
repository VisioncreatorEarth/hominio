import { type LoroDoc, LoroMap, LoroText, LoroList } from 'loro-crdt';
import {
    getSumtiDoc,
    getSelbriDoc,
    findBridiDocsBySelbriAndPlace,
    getCkajiFromDoc,
    getDatniFromDoc,
    checkSumtiExists,
    checkSelbriExists,
    FACKI_SELBRI_PUBKEY,
    FACKI_BRIDI_PUBKEY,
    FACKI_BRIDI_BY_COMPONENT_PUBKEY,
    getBridiDoc
} from './loro-engine';
import { canRead, type CapabilityUser } from '$lib/KERNEL/hominio-caps';
import { docChangeNotifier } from '$lib/KERNEL/hominio-db';
import { readable, type Readable, get } from 'svelte/store';
import { authClient, type getMe as getMeType } from '$lib/KERNEL/hominio-auth';
import { browser } from '$app/environment';

// --- LORO_HQL Query Types (Map-Based Syntax) ---

// Use string directly instead of SumtiPlace type alias if it came from db.ts
type SumtiPlaceKey = 'x1' | 'x2' | 'x3' | 'x4' | 'x5';

// Refined: Defines how to get a value for an output property
interface LoroHqlMapValue {
    field?: string;      // Option 1: Direct field access from *current* node (e.g., "self.ckaji.cmene")
    traverse?: LoroHqlTraverse; // Option 2: Traverse relationship from *current* node
    resolve?: LoroHqlResolve; // <<< Add resolve directive type

    // Target selection (used *only* inside traverse.map)
    place?: SumtiPlaceKey;  // Specifies the target node's place in the Bridi

    // Action on target node (used *only* inside traverse.map, requires 'place')
    map?: LoroHqlMap;    // Option 3a: Define a sub-map structure for the node found at 'place'
    // If used, `field` and `traverse` in this object are ignored.
    // `field` or nested `traverse` should be used *inside* this map.
}

// Defines the output structure (applies at top level and inside traverse)
interface LoroHqlMap {
    [outputKey: string]: LoroHqlMapValue;
}

// Filter condition
interface LoroHqlCondition {
    equals?: unknown;
    in?: unknown[];
    // Future: contains?: string; startsWith?: string; gt?: number; lt?: number; ...
}

// Top-level filter for starting nodes
interface LoroHqlWhereClause {
    field: string; // Path on the starting node (e.g., "self.ckaji.cmene")
    condition: LoroHqlCondition;
}

// Filter applied to related nodes during traversal
interface LoroHqlWhereRelatedClause {
    place: SumtiPlaceKey; // Which related node place to filter
    field: string;     // Path on the related node (e.g., "self.ckaji.pubkey")
    condition: LoroHqlCondition;
}

// Defines a traversal step
interface LoroHqlTraverse {
    bridi_where: {
        selbri: string; // Replaced SelbriId with string
        place: SumtiPlaceKey; // Place the *current* node occupies in this Bridi
    };
    return?: 'array' | 'first'; // Default: 'array'
    where_related?: LoroHqlWhereRelatedClause[]; // Filter related nodes (can be multiple conditions)
    map: LoroHqlMap; // Defines output structure for *each* related node
}

// <<< Add LoroHqlResolve interface >>>
interface LoroHqlResolve {
    fromField: string; // Path in the current node containing the pubkey(s) to resolve
    // e.g., "self.datni.sumti.x1"
    // Optional: onError?: 'null' | 'skip_key' (default 'null') - TODO: Implement error handling
    map: LoroHqlMap;   // The map definition to apply to the RESOLVED document(s)
    // e.g., { value: { field: 'self.datni.vasru' } }
}

// Top-level Query Structure
export interface LoroHqlQuery {
    from: {
        sumti_pubkeys?: string[]; // Replaced Pubkey[] with string[]
        selbri_pubkeys?: string[]; // Replaced Pubkey[] with string[]
        bridi_pubkeys?: string[]; // Replaced Pubkey[] with string[]
    };
    map: LoroHqlMap;
    where?: LoroHqlWhereClause[]; // Can be multiple conditions (implicitly ANDed)
}

// Result type remains the same
export type QueryResult = Record<string, unknown>;
// Type for the possible results of a traversal operation
// Include 'unknown' to handle the direct value extraction case
type TraversalResult = QueryResult[] | QueryResult | unknown | null;

// Define a minimal type for the session object structure needed
type MinimalSession = {
    data?: {
        user?: {
            id?: string | null;
        } | null;
    } | null;
} | null;

// --- Query Engine Implementation (Map-Based Syntax) ---

/**
 * Main function to execute a LORO_HQL map-based query.
 * Adds capability checks to filter documents based on user permissions.
 * Special handling: if selbri_pubkeys is provided but empty, returns all selbri.
 */
export async function executeQuery(
    query: LoroHqlQuery,
    user: CapabilityUser | null = null
): Promise<QueryResult[]> {
    const results: QueryResult[] = [];

    // <<< ADD INDEX CONTENT LOGGING AT START >>>
    console.log("\n--- [Query Engine] Verifying Bridi Component Index Content at Query Start ---");
    try {
        const indexDoc = await getSumtiDoc(FACKI_BRIDI_BY_COMPONENT_PUBKEY); // <<< CORRECTED Pubkey
        if (indexDoc) {
            const indexMap = indexDoc.getMap('datni');
            if (indexMap) {
                const allKeys = Array.from(indexMap.keys());
                console.log(`  - Keys found in index (${allKeys.length} total):`);
                // Filter for cneme keys specifically for easier reading
                const cnemeKeys = allKeys.filter(k => k.startsWith('0x96360692ef7f876a32e1a3c46a15bd597da160e76ac9c4bfd96026cb4afe3412')); // Hardcode cneme pubkey here
                console.log("    CNEME Keys:", cnemeKeys);
                // console.log("    All Keys:", allKeys);
            } else {
                console.error("  - ERROR: Could not get 'datni' map from index doc.");
            }
        } else {
            console.error("  - ERROR: Could not load index doc itself.");
        }
    } catch (err) {
        console.error("  - ERROR loading/parsing index doc:", err);
    }
    console.log("--- [Query Engine] End Index Verification ---");
    // <<< END INDEX CONTENT LOGGING >>>

    // 1. Determine Starting Nodes & Process
    const startSumtiPubkeys = query.from.sumti_pubkeys || [];
    let startSelbriPubkeys = query.from.selbri_pubkeys;
    let startBridiPubkeys = query.from.bridi_pubkeys;

    // --- Special Handling for All Selbri --- 
    let fetchAllSelbri = false;
    if (startSelbriPubkeys && Array.isArray(startSelbriPubkeys) && startSelbriPubkeys.length === 0) {
        console.log('[Query Engine] Empty selbri_pubkeys array detected, attempting to fetch all Selbri from index.');
        fetchAllSelbri = true;
        try {
            const fackiSelbriDoc = await getSelbriDoc(FACKI_SELBRI_PUBKEY);
            if (fackiSelbriDoc) {
                const indexMap = fackiSelbriDoc.getMap('datni');

                if (indexMap instanceof LoroMap) {
                    startSelbriPubkeys = Array.from(indexMap.keys());
                    console.log(`[Query Engine] Fetched ${startSelbriPubkeys.length} Selbri pubkeys from index.`);
                } else {
                    console.warn('[Query Engine] Facki Selbri index map (root datni) not found or not a LoroMap. Cannot fetch all Selbri.');
                    startSelbriPubkeys = []; // Reset to empty to prevent processing
                }
            } else {
                console.warn(`[Query Engine] Facki Selbri index document (${FACKI_SELBRI_PUBKEY}) not found. Cannot fetch all Selbri.`);
                startSelbriPubkeys = []; // Reset to empty
            }
        } catch (error) {
            console.error('[Query Engine] Error fetching all Selbri from index:', error);
            startSelbriPubkeys = []; // Reset to empty on error
        }
    } else if (startSelbriPubkeys === undefined) {
        startSelbriPubkeys = []; // Ensure it's an array if not provided
    }
    // --- End Special Handling ---

    // --- Special Handling for All Bridi ---
    let fetchAllBridi = false;
    if (startBridiPubkeys && Array.isArray(startBridiPubkeys) && startBridiPubkeys.length === 0) {
        console.log('[Query Engine] Empty bridi_pubkeys array detected, attempting to fetch all Bridi from index.');
        fetchAllBridi = true;
        try {
            // <<< CHANGE: Use the *simple* Bridi index document >>>
            // Use getSumtiDoc for index doc as per getBridiIndexList usage - NO, use getBridiDoc (conceptually) or check FACKI type?
            // For consistency with Selbri/Sumti index loading, we assume the Facki doc is a Sumti type.
            // It's just a key-value map.
            const fackiBridiDoc = await getSumtiDoc(FACKI_BRIDI_PUBKEY); // <<< Use FACKI_BRIDI_PUBKEY
            if (fackiBridiDoc) {
                const indexMap = fackiBridiDoc.getMap('datni'); // datni IS the index map
                if (indexMap instanceof LoroMap) {
                    // <<< CHANGE: Get keys directly from the simple index map >>>
                    startBridiPubkeys = Array.from(indexMap.keys());

                    console.log(`[Query Engine] Fetched ${startBridiPubkeys.length} unique Bridi pubkeys from simple index.`);
                } else {
                    console.warn(`[Query Engine] Facki Bridi simple index map (root datni) not found or not a LoroMap. Cannot fetch all Bridi.`);
                    startBridiPubkeys = []; // Reset
                }
            } else {
                console.warn(`[Query Engine] Facki Bridi simple index document (${FACKI_BRIDI_PUBKEY}) not found. Cannot fetch all Bridi.`);
                startBridiPubkeys = []; // Reset
            }
        } catch (error) {
            console.error('[Query Engine] Error fetching all Bridi from simple index:', error);
            startBridiPubkeys = []; // Reset on error
        }
    } else if (startBridiPubkeys === undefined) {
        startBridiPubkeys = []; // Ensure it's an array
    }
    // --- End Special Handling ---

    // <<< Add log for fetched keys >>>
    console.log(`[Query Engine] Index fetch complete. Starting processing for ${startBridiPubkeys.length} Bridi keys.`);

    if (startSumtiPubkeys.length === 0 && startSelbriPubkeys.length === 0 && startBridiPubkeys.length === 0 && !fetchAllSelbri && !fetchAllBridi) {
        console.warn('Query requires sumti_pubkeys, non-empty selbri_pubkeys (or []), or non-empty bridi_pubkeys (or []) in "from" clause.');
        return [];
    }

    // Process Sumti Starting Nodes
    for (const pubkey of startSumtiPubkeys) {
        // Check existence index first
        const exists = await checkSumtiExists(pubkey);
        if (!exists) {
            console.warn(`Starting Sumti with pubkey ${pubkey} not found in existence index.`);
            continue;
        }

        // Get document metadata for capability check
        const docMeta = await import('$lib/KERNEL/hominio-db').then(
            module => module.hominioDB.getDocument(pubkey)
        );

        // Check if user has read access to this document
        if (docMeta && user && !canRead(user, docMeta)) {
            console.warn(`User ${user.id} does not have read access to Sumti ${pubkey}`);
            continue;
        }

        const startDoc = await getSumtiDoc(pubkey);
        if (!startDoc) {
            // This check might be redundant if index is accurate, but good fallback
            console.warn(`Starting Sumti with pubkey ${pubkey} not found.`);
            continue;
        }
        // Apply Top-Level Where Clause(s) (if any) - Pass pubkey
        if (query.where && !evaluateWhereClauses(startDoc, query.where, pubkey)) {
            continue;
        }
        // Process the Top-Level Map Clause - Pass pubkey and user
        const nodeResult = await processMap(startDoc, query.map, pubkey, user);
        results.push(nodeResult);
    }

    // Process Selbri Starting Nodes
    for (const pubkey of startSelbriPubkeys) {
        // Check existence index first (still useful even if fetched from index)
        const exists = await checkSelbriExists(pubkey);
        if (!exists) {
            // This might happen if index is slightly out of sync, log warning but continue
            console.warn(`Starting Selbri with pubkey ${pubkey} from index/query was not confirmed by checkSelbriExists.`);
            // continue; // Decide whether to skip or proceed if check fails
        }

        // Get document metadata for capability check
        const docMeta = await import('$lib/KERNEL/hominio-db').then(
            module => module.hominioDB.getDocument(pubkey)
        );

        // Check if user has read access to this document
        if (docMeta && user && !canRead(user, docMeta)) {
            console.warn(`User ${user.id} does not have read access to Selbri ${pubkey}`);
            continue;
        }

        const startDoc = await getSelbriDoc(pubkey);
        if (!startDoc) {
            console.warn(`Starting Selbri with pubkey ${pubkey} not found.`);
            continue;
        }
        // Apply Top-Level Where Clause(s) (if any) - Pass pubkey
        if (query.where && !evaluateWhereClauses(startDoc, query.where, pubkey)) {
            continue;
        }
        // Process the Top-Level Map Clause - Pass pubkey and user
        const nodeResult = await processMap(startDoc, query.map, pubkey, user);
        results.push(nodeResult);
    }

    // Process Bridi Starting Nodes
    for (const pubkey of startBridiPubkeys) {
        // <<< Add logs for each step >>>
        console.log(`[Query Engine] Processing Bridi: ${pubkey}`);
        // Capability check - assuming hominioDB is initialized and getDocument works for bridi
        let docMeta;
        try {
            // Need access to hominioDB instance. Assuming it's available via module import similar to Selbri/Sumti checks
            docMeta = await import('$lib/KERNEL/hominio-db').then(
                module => module.hominioDB.getDocument(pubkey)
            );
            console.log(`  - Got metadata for Bridi ${pubkey}:`, !!docMeta); // Log metadata status
        } catch (e) {
            console.error(`[Query Engine] Error getting document metadata for Bridi ${pubkey}:`, e);
            continue; // Skip if metadata cannot be fetched
        }

        // Check if user has read access to this document
        if (docMeta && user && !canRead(user, docMeta)) {
            console.warn(`  - User ${user.id} does not have read access to Bridi ${pubkey}. Skipping.`);
            continue;
        }
        // <<< Add log >>>
        if (docMeta) console.log(`  - Capability check passed for Bridi ${pubkey}.`);

        const startDoc = await getBridiDoc(pubkey);
        // <<< Add log >>>
        console.log(`  - Got LoroDoc for Bridi ${pubkey}:`, !!startDoc);
        if (!startDoc) {
            console.warn(`  - Starting Bridi with pubkey ${pubkey} not found (getBridiDoc failed). Skipping.`);
            continue;
        }
        // Apply Top-Level Where Clause(s) (if any) - Pass pubkey
        if (query.where && !evaluateWhereClauses(startDoc, query.where, pubkey)) {
            console.warn(`  - Bridi ${pubkey} failed top-level WHERE clause. Skipping.`);
            continue;
        }
        // Process the Top-Level Map Clause - Pass pubkey and user
        try { // <<< Add try/catch around processMap >>>
            const nodeResult = await processMap(startDoc, query.map, pubkey, user);
            results.push(nodeResult);
            console.log(`  - Successfully processed map for Bridi ${pubkey}.`);
        } catch (mapError) {
            console.error(`[Query Engine] Error processing map for Bridi ${pubkey}:`, mapError);
            // Decide whether to skip this result or halt entirely
            // For now, let's skip the problematic Bridi
            console.warn(`  - Skipping Bridi ${pubkey} due to map processing error.`);
            continue;
        }
    }

    return results;
}

/**
 * Processes a `map` object for a given LoroDoc (the current context `self`).
 */
async function processMap(
    currentDoc: LoroDoc,
    mapDefinition: LoroHqlMap,
    docPubKey: string,
    user: CapabilityUser | null // <<< Add user for capability checks
): Promise<QueryResult> {
    const result: QueryResult = {};
    const mapEntries = Object.entries(mapDefinition);

    for (const [outputKey, valueDefinition] of mapEntries) {
        if (valueDefinition.field) {
            // Handle direct field selection from currentDoc, passing its pubkey
            result[outputKey] = selectFieldValue(currentDoc, valueDefinition.field, docPubKey);
        } else if (valueDefinition.traverse) {
            // Handle traversal starting from currentDoc, passing its pubkey and user
            let traverseResult: TraversalResult = await processTraversal(currentDoc, valueDefinition.traverse, docPubKey, user);

            console.log(`[Query Engine Debug] Traverse result for key "${outputKey}" (before simplification):`, JSON.stringify(traverseResult));

            // Simplify result if return: 'first' yielded a single-key object
            if (
                valueDefinition.traverse.return === 'first' &&
                traverseResult &&
                typeof traverseResult === 'object' &&
                !Array.isArray(traverseResult) &&
                Object.keys(traverseResult).length === 1
            ) {
                // Extract the single value, which could be any primitive or nested object
                const originalValue = Object.values(traverseResult)[0];
                console.log(`[Query Engine Debug] Simplifying single-key result for "${outputKey}". Original value:`, JSON.stringify(originalValue)); // Log extracted value
                traverseResult = originalValue;
            } else if (valueDefinition.traverse.return === 'first' && traverseResult === null) {
                console.log(`[Query Engine Debug] Traverse result for key "${outputKey}" was null.`);
            }

            // Assign the potentially simplified result
            result[outputKey] = traverseResult;
        } else if (valueDefinition.resolve) {
            // <<< Handle resolve directive >>>
            result[outputKey] = await processResolve(currentDoc, valueDefinition.resolve, user);
        }
        // Note: `place` and nested `map` are only valid *inside* a processTraversal context.
    }
    return result;
}

/**
 * Selects a field value from a LoroDoc based on a path string starting with "self."
 * IMPORTANT: Access to 'self.ckaji.cmene' is discouraged for primary entity names.
 */
function selectFieldValue(doc: LoroDoc, fieldPath: string, docPubKey: string): unknown {
    // <<< ADD LOG >>>
    console.log(`[Query selectFieldValue] Called for doc ${docPubKey}, path: ${fieldPath}`);
    // <<< END LOG >>>
    // Handle the special case for accessing the document's own pubkey
    if (fieldPath === 'doc.pubkey') {
        return docPubKey;
    }

    // Existing check for "self." prefix
    if (!fieldPath || !fieldPath.startsWith('self.')) {
        console.warn(`Invalid field path: "${fieldPath}". Must start with "self." or be "doc.pubkey".`);
        return undefined;
    }

    const path = fieldPath.substring(5); // Remove "self."

    // Explicitly disallow using cmene as the primary name - enforce traversal
    if (path === 'ckaji.cmene') {
        console.warn(`Accessing 'self.ckaji.cmene' directly is deprecated for entity names. Use traversal to the linked name Sumti and access 'self.datni.vasru'.`);
        return undefined;
    }

    let baseObject: unknown;
    let relativePath: string;

    // Determine base object (ckaji or datni)
    if (path.startsWith('ckaji.')) {
        baseObject = getCkajiFromDoc(doc);
        relativePath = path.substring(6); // Remove "ckaji."
    } else if (path.startsWith('datni.')) {
        baseObject = getDatniFromDoc(doc);
        relativePath = path.substring(6); // Remove "datni."
    } else if (path === 'ckaji') {
        return getCkajiFromDoc(doc);
    } else if (path === 'datni') {
        const datniValue = getDatniFromDoc(doc);
        // <<< MODIFY LOG >>>
        console.log(`[Query selectFieldValue] Accessing 'self.datni' on doc ${docPubKey}. Value:`, JSON.stringify(datniValue));
        return datniValue;
    } else {
        // Allow accessing top-level ckaji fields directly e.g. "self.pubkey"
        if (path === 'cmene') {
            console.warn(`Accessing 'self.cmene' directly is deprecated. Use traversal for names.`);
            return undefined;
        }
        baseObject = getCkajiFromDoc(doc);
        relativePath = path;
    }

    if (!relativePath) { // Path was just "self.ckaji" or "self.datni"
        return baseObject;
    }

    // --- NEW: Traverse the relative path --- 
    const pathParts = relativePath.split('.');
    let currentValue: unknown = baseObject;

    for (const part of pathParts) {
        if (currentValue === undefined || currentValue === null) {
            return undefined; // Cannot traverse further
        }

        if (currentValue instanceof LoroMap) {
            currentValue = currentValue.get(part);
        } else if (currentValue instanceof LoroList) {
            // Handle list index access if needed (e.g., "self.datni.tags.0")
            const index = parseInt(part, 10);
            if (!isNaN(index) && index >= 0) {
                try {
                    currentValue = currentValue.get(index);
                } catch (e) {
                    console.warn(`Error accessing index ${index} in LoroList:`, e);
                    return undefined;
                }
            } else {
                console.warn(`Invalid index "${part}" for LoroList access in path "${fieldPath}".`);
                return undefined;
            }
        } else if (currentValue instanceof LoroText) {
            // Cannot traverse further into LoroText with dotted paths
            console.warn(`Cannot traverse into LoroText with path part "${part}" in "${fieldPath}".`);
            return undefined;
        } else if (typeof currentValue === 'object') {
            // Plain JS object access
            currentValue = (currentValue as Record<string, unknown>)[part];
        } else {
            // Primitive value, cannot traverse further
            return undefined;
        }
    }

    // Special handling for LoroText: return its string value if it's the final result
    if (currentValue instanceof LoroText) {
        return currentValue.toString();
    }
    // Consider if we need to convert LoroList/LoroMap to plain JS at the end?
    // For now, return the potentially live Loro container or primitive value.
    // If a LoroMap is the final result, it might need .toJSON() depending on usage.
    // Returning the raw LoroMap for 'translations' and 'prompts' seems correct based on the svelte component display logic.

    // --- Correction: Return JSON for Loro Containers --- 
    if (currentValue instanceof LoroMap || currentValue instanceof LoroList) {
        try {
            return currentValue.toJSON();
        } catch (e) {
            console.error(`Error converting Loro container to JSON for path "${fieldPath}":`, e);
            return undefined; // Return undefined on error
        }
    }
    // --- End Correction ---

    return currentValue;
    // --- END NEW Traversal Logic --- 
}

/**
 * Processes a 'traverse' instruction starting from the sourceDoc.
 */
async function processTraversal(
    sourceDoc: LoroDoc,
    traverseDefinition: LoroHqlTraverse,
    sourcePubKey: string,
    user: CapabilityUser | null
): Promise<QueryResult[] | QueryResult | null> {
    // <<< ADD LOG >>>
    const isNameTraversal = traverseDefinition.bridi_where.selbri === '0x96360692ef7f876a32e1a3c46a15bd597da160e76ac9c4bfd96026cb4afe3412'; // @selbri_cneme
    if (isNameTraversal) {
        console.log(`[Query processTraversal] Starting NAME traversal from ${sourcePubKey}`);
    }
    // <<< END LOG >>>
    if (!sourcePubKey) {
        console.error('Cannot traverse: source document pubkey is empty or undefined.');
        return traverseDefinition.return === 'first' ? null : [];
    }

    // 1. Find connecting Bridi documents
    const bridiMatches = await findBridiDocsBySelbriAndPlace(
        traverseDefinition.bridi_where.selbri,
        traverseDefinition.bridi_where.place,
        sourcePubKey
    );

    const results: QueryResult[] = [];

    // 2. Process each potential related node via the Bridi
    for (const { pubkey: bridiPubKey, doc: bridiDoc } of bridiMatches) {
        const bridiDatni = getDatniFromDoc(bridiDoc) as { selbri: string; sumti: Record<string, string> } | undefined;
        if (!bridiDatni) continue;
        // <<< Update LOG reference >>>
        if (isNameTraversal) {
            console.log(`[Query processTraversal] Processing NAME traversal via Bridi ${bridiPubKey}`);
        }
        // <<< END LOG >>>

        // 3. Filter related nodes based on `where_related`
        if (traverseDefinition.where_related) {
            let passesAllFilters = true;
            for (const relatedFilter of traverseDefinition.where_related) {
                const targetNodePubkey = bridiDatni.sumti[relatedFilter.place];
                if (!targetNodePubkey) {
                    passesAllFilters = false;
                    break;
                }
                const targetNodeDoc = await getSumtiDoc(targetNodePubkey);
                // Pass the target node's pubkey to evaluateSingleWhere
                if (!targetNodeDoc || !evaluateSingleWhere(targetNodeDoc, relatedFilter.field, relatedFilter.condition, targetNodePubkey)) {
                    passesAllFilters = false;
                    break;
                }
            }
            if (!passesAllFilters) {
                continue;
            }
        }

        // 4. Map the related nodes defined in `traverseDefinition.map`
        const relatedNodeResult: QueryResult = {};
        const mapEntries = Object.entries(traverseDefinition.map);

        for (const [outputKey, valueDefinition] of mapEntries) {
            if (!valueDefinition.place) {
                console.warn(`Missing 'place' for key "${outputKey}" in traverse.map. Defines the target node.`);
                continue;
            }

            const targetNodePubkey = bridiDatni.sumti[valueDefinition.place];
            // <<< ADD LOG >>>
            if (isNameTraversal && valueDefinition.place === 'x2') { // Specifically log the name Sumti pubkey
                console.log(`[Query processTraversal] Extracted potential name Sumti pubkey: ${targetNodePubkey} from Bridi ${bridiPubKey} at place ${valueDefinition.place}`);
            }
            // <<< END LOG >>>
            if (!targetNodePubkey) {
                relatedNodeResult[outputKey] = null;
                continue;
            }

            // <<< ADD LOG >>>
            if (isNameTraversal && valueDefinition.place === 'x2') {
                console.log(`[Query processTraversal] Attempting to fetch name Sumti Doc: ${targetNodePubkey}`);
            }
            // <<< END LOG >>>
            const targetNodeDoc = await getSumtiDoc(targetNodePubkey);
            // <<< ADD LOG >>>
            if (isNameTraversal && valueDefinition.place === 'x2') {
                console.log(`[Query processTraversal] Fetched name Sumti Doc (${targetNodePubkey}):`, !!targetNodeDoc);
            }
            // <<< END LOG >>>
            if (!targetNodeDoc) {
                relatedNodeResult[outputKey] = null;
                continue;
            }

            // Determine the value based on the definition type for the target node
            if (valueDefinition.field) {
                // Pass target node's pubkey
                relatedNodeResult[outputKey] = selectFieldValue(targetNodeDoc, valueDefinition.field, targetNodePubkey);
            } else if (valueDefinition.map) {
                // Pass target node's pubkey and user
                relatedNodeResult[outputKey] = await processMap(targetNodeDoc, valueDefinition.map, targetNodePubkey, user);
            } else if (valueDefinition.traverse) {
                // Pass target node's pubkey as the new source for the next traversal, and user
                relatedNodeResult[outputKey] = await processTraversal(targetNodeDoc, valueDefinition.traverse, targetNodePubkey, user);
            } else if (valueDefinition.resolve) {
                // <<< Handle nested resolve during traversal >>>
                relatedNodeResult[outputKey] = await processResolve(targetNodeDoc, valueDefinition.resolve, user);
            }
        }

        // Only add non-empty results
        if (Object.keys(relatedNodeResult).length > 0) {
            results.push(relatedNodeResult);
            if (traverseDefinition.return === 'first') {
                break;
            }
        }
    }

    // 5. Return based on `return` type
    if (traverseDefinition.return === 'first') {
        // Return the first full object or null
        return results.length > 0 ? results[0] : null;
    } else {
        return results; // Default return array
    }
}

/**
 * Evaluates multiple top-level where clauses against a document.
 * Returns true if ALL clauses pass.
 */
function evaluateWhereClauses(doc: LoroDoc, clauses: LoroHqlWhereClause[], docPubKey: string): boolean {
    for (const clause of clauses) {
        if (!evaluateSingleWhere(doc, clause.field, clause.condition, docPubKey)) {
            return false;
        }
    }
    return true;
}

/**
 * Evaluates a single filter condition against a document.
 */
function evaluateSingleWhere(
    doc: LoroDoc,
    fieldPath: string,
    condition: LoroHqlCondition,
    docPubKey: string
): boolean {
    const actualValue = selectFieldValue(doc, fieldPath, docPubKey);

    if (condition.equals !== undefined && actualValue !== condition.equals) {
        return false;
    }
    if (condition.in !== undefined) {
        if (!Array.isArray(condition.in) || !condition.in.includes(actualValue)) {
            return false;
        }
    }
    // Add checks for other conditions (contains, gt, lt) here

    return true;
}

/**
 * Processes a 'resolve' instruction: gets a pubkey from a field in the sourceDoc,
 * fetches the corresponding document, checks capabilities, and processes its map.
 */
async function processResolve(
    sourceDoc: LoroDoc,
    resolveDefinition: LoroHqlResolve,
    user: CapabilityUser | null
): Promise<QueryResult | null> {
    // 1. Get the pubkey from the source document field
    // For now, assume sourceDoc's pubkey isn't needed for selectFieldValue here, just the doc itself.
    // If resolve.fromField itself needs the source doc's pubkey, adjust selectFieldValue call.
    const targetPubKey = selectFieldValue(sourceDoc, resolveDefinition.fromField, "") as string | undefined;

    if (!targetPubKey) {
        console.warn(`[Query Resolve] Pubkey not found or invalid in field: ${resolveDefinition.fromField}`);
        return null; // Or handle based on onError policy
    }

    // 2. Fetch the target document (assuming Sumti for now)
    // TODO: Determine document type (Sumti, Selbri, Bridi) dynamically if needed?
    //       For now, assume resolve is primarily for Sumti references from Bridi.
    let targetDoc: LoroDoc | null = null;
    let docMeta: Awaited<ReturnType<typeof import('$lib/KERNEL/hominio-db')['hominioDB']['getDocument']>> | null = null;

    try {
        // Check existence first (optional but good practice)
        const exists = await checkSumtiExists(targetPubKey);
        if (!exists) {
            console.warn(`[Query Resolve] Target document ${targetPubKey} from field ${resolveDefinition.fromField} not found in Sumti index.`);
            return null;
        }

        targetDoc = await getSumtiDoc(targetPubKey);
        if (!targetDoc) {
            console.warn(`[Query Resolve] Target document ${targetPubKey} could not be fetched.`);
            return null;
        }
        // Get metadata for capability check
        docMeta = await import('$lib/KERNEL/hominio-db').then(
            module => module.hominioDB.getDocument(targetPubKey)
        );
        if (!docMeta) {
            console.warn(`[Query Resolve] Metadata not found for target document ${targetPubKey}. Denying access.`);
            return null;
        }

    } catch (error) {
        console.error(`[Query Resolve] Error fetching or getting metadata for ${targetPubKey}:`, error);
        return null;
    }

    // 3. Check capabilities
    if (user && !canRead(user, docMeta)) {
        console.warn(`[Query Resolve] User ${user.id} does not have read access to resolved document ${targetPubKey}`);
        return null;
    }

    // 4. Process the map for the resolved document
    try {
        const resolvedResult = await processMap(targetDoc, resolveDefinition.map, targetPubKey, user);
        return resolvedResult;
    } catch (error) {
        console.error(`[Query Resolve] Error processing map for resolved document ${targetPubKey}:`, error);
        return null;
    }
}

/**
 * Creates a reactive query that automatically updates when the underlying data changes
 * or the user session changes. Mimics the interface of hominio-ql's processReactive.
 *
 * @param getCurrentUserFn Function to get the current user (for capability checks)
 * @param queryDefinitionStore A Svelte readable store containing the LORO_HQL query object or null
 * @returns A Svelte readable store that updates with query results or null/undefined
 */
export function processReactiveQuery(
    getCurrentUserFn: typeof getMeType,
    queryDefinitionStore: Readable<LoroHqlQuery | null> // Accept a store for the query definition
): Readable<QueryResult[] | null | undefined> {
    if (!browser) {
        // --- Server-Side Rendering (SSR) Handling --- 
        // Run once and return a readable store with the initial result.
        const initialQuery = get(queryDefinitionStore); // Get initial query from store
        const ssrUser = getCurrentUserFn();
        return readable<QueryResult[] | null | undefined>(undefined, (set) => {
            if (!initialQuery) {
                set([]); // No query definition, return empty array
                return;
            }
            executeQuery(initialQuery, ssrUser)
                .then(results => set(results))
                .catch(err => {
                    console.error("[SSR LoroHQL] Reactive Query Error:", err);
                    set(null); // Set to null on error
                });
        });
        // --- End SSR Handling --- 
    }

    // --- Client-Side Reactive Logic --- 
    return readable<QueryResult[] | null | undefined>(undefined, (set) => {
        let debounceTimer: NodeJS.Timeout | null = null;
        const DEBOUNCE_MS = 50; // Debounce time
        let lastSessionState: string | null = null;
        let lastQueryDefinitionString: string | null = null;
        let currentResults: QueryResult[] | null | undefined = undefined; // Track current state

        // Function to execute the query and update the store, with debouncing
        const triggerDebouncedQuery = () => {
            const currentQueryDefinition = get(queryDefinitionStore);
            const queryDefString = JSON.stringify(currentQueryDefinition); // Use string compare

            // Check if query definition actually changed (and is not null) before logging/running
            const queryChanged = lastQueryDefinitionString !== queryDefString;
            lastQueryDefinitionString = queryDefString; // Update last known definition

            // If no query definition, set empty result and clear debounce
            if (!currentQueryDefinition) {
                if (debounceTimer) clearTimeout(debounceTimer);
                // Only set if results were previously non-empty to avoid unnecessary updates
                if (currentResults && currentResults.length > 0) {
                    set([]);
                    currentResults = [];
                } else if (currentResults === undefined || currentResults === null) {
                    // Ensure initial state or error state transitions to empty array
                    set([]);
                    currentResults = [];
                }
                return;
            }

            // Only trigger if the query actually changed
            if (!queryChanged && currentResults !== undefined) {
                // If query hasn't changed and we already have results (or are loading), don't re-trigger
                // unless triggered by notifier/session change later
                return;
            }


            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            // Set loading state immediately only if results aren't already available
            // or if the query definition actually changed
            if (currentResults === undefined || queryChanged) {
                set(undefined);
                currentResults = undefined; // Explicitly mark as loading
            }


            debounceTimer = setTimeout(async () => {
                const currentUser = getCurrentUserFn();
                // Re-check query definition *inside* timeout, in case it changed again rapidly
                const latestQueryDefinition = get(queryDefinitionStore);
                const latestQueryDefString = JSON.stringify(latestQueryDefinition);

                // Ensure the query we are about to run *is* the latest one requested
                if (!latestQueryDefinition || latestQueryDefString !== lastQueryDefinitionString) {
                    // Query changed again before execution, or became null.
                    // The subscription handler will catch this and trigger a new debounced run.
                    console.log('[LoroHQL Reactive] Query changed during debounce, skipping stale run.');
                    return;
                }


                console.log('[LoroHQL Reactive] Running debounced query...', latestQueryDefinition);

                try {
                    // Mark as loading just before the async call, in case it wasn't set before
                    if (currentResults !== undefined) { // Only set if not already loading
                        set(undefined);
                    }
                    currentResults = undefined; // Mark as loading

                    const results = await executeQuery(latestQueryDefinition, currentUser);
                    // Check again if the query definition changed *while* the query was running
                    if (JSON.stringify(get(queryDefinitionStore)) !== lastQueryDefinitionString) {
                        console.log('[LoroHQL Reactive] Query changed during execution, discarding stale results.');
                        return; // Don't set stale results
                    }

                    set(results); // Update the store with results
                    currentResults = results;
                } catch (error) {
                    console.error("[LoroHQL Reactive] Error executing query:", error);
                    // Check if query changed during error handling
                    if (JSON.stringify(get(queryDefinitionStore)) !== lastQueryDefinitionString) {
                        console.log('[LoroHQL Reactive] Query changed during error, discarding stale error state.');
                        return; // Don't set stale error state
                    }
                    set(null); // Set null on error
                    currentResults = null;
                }
            }, DEBOUNCE_MS);
        };

        // 1. Subscribe to Query Definition Changes
        const unsubscribeQueryDef = queryDefinitionStore.subscribe(newQueryDef => {
            // Trigger only if the stringified definition changes OR if results are currently undefined (initial load)
            const newQueryDefString = JSON.stringify(newQueryDef);
            // if (lastQueryDefinitionString !== newQueryDefString) { // Original condition
            if (lastQueryDefinitionString !== newQueryDefString || currentResults === undefined) {
                console.log('[LoroHQL Reactive] Query definition changed or initial load.');
                // lastQueryDefinitionString = newQueryDefString; // Moved to triggerDebouncedQuery
                // currentResults = undefined; // Reset results state only if definition changed, handled in triggerDebouncedQuery
                triggerDebouncedQuery();
            }
        });

        // 2. Subscribe to Document Changes
        const unsubscribeNotifier = docChangeNotifier.subscribe(() => {
            console.log('[LoroHQL Reactive] docChangeNotifier triggered.');
            // Re-run the *current* query on data change
            triggerDebouncedQuery();
        });

        // 3. Subscribe to Session Changes
        const sessionStore = authClient.useSession();
        const unsubscribeSession = sessionStore.subscribe((session: MinimalSession) => {
            const currentSessionState = JSON.stringify(session?.data?.user?.id ?? null); // Check only user ID
            if (lastSessionState !== null && lastSessionState !== currentSessionState) {
                console.log('[LoroHQL Reactive] Session changed.');
                // Re-run the *current* query on session change
                triggerDebouncedQuery();
            }
            lastSessionState = currentSessionState;
        });

        // Initial setup: capture initial session state
        const initialSessionData = get(sessionStore);
        lastSessionState = JSON.stringify(initialSessionData?.data?.user?.id ?? null);
        lastQueryDefinitionString = JSON.stringify(get(queryDefinitionStore)); // Capture initial query def
        currentResults = undefined; // Start in undefined state

        // Explicitly trigger the first run if an initial query definition exists.
        // The subscription might fire, but this ensures it runs even if the initial
        // definition is the same as the "last" (null) one initially.
        if (get(queryDefinitionStore)) {
            triggerDebouncedQuery(); // Trigger initial run
        } else {
            set([]); // If no initial query, set to empty array
            currentResults = [];
        }


        // Cleanup function
        return () => {
            unsubscribeQueryDef();
            unsubscribeNotifier();
            unsubscribeSession();
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            console.log('[LoroHQL Reactive] Unsubscribed.');
        };
    });
} 