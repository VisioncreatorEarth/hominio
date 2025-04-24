import { type LoroDoc, LoroMap, LoroText, LoroList } from 'loro-crdt';
import {
    getSumtiDoc,
    getSelbriDoc,
    findBridiDocsBySelbriAndPlace,
    getCkajiFromDoc,
    getDatniFromDoc,
    checkSumtiExists,
    getBridiDoc
} from './loro-engine';
import { canRead, type CapabilityUser } from '$lib/KERNEL/hominio-caps';
import { docChangeNotifier } from '$lib/KERNEL/hominio-db';
import { readable, type Readable, get } from 'svelte/store';
import { authClient, type getMe as getMeType } from '$lib/KERNEL/hominio-auth';
import { browser } from '$app/environment';
import { getFackiIndexPubKey } from '$lib/KERNEL/facki-indices';


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

    // 1. Determine Starting Nodes & Process
    const startSumtiPubkeys = query.from.sumti_pubkeys || [];
    let startSelbriPubkeys = query.from.selbri_pubkeys;
    let startBridiPubkeys = query.from.bridi_pubkeys;

    // --- Special Handling for All Selbri --- 
    let fetchAllSelbri = false;
    if (startSelbriPubkeys && Array.isArray(startSelbriPubkeys) && startSelbriPubkeys.length === 0) {
        fetchAllSelbri = true;
        try {
            const fackiSelbriPubKey = await getFackiIndexPubKey('selbri');
            if (!fackiSelbriPubKey) {
                console.error('[Query Engine] Cannot fetch all Selbri: Facki Selbri index pubkey not available.');
                startSelbriPubkeys = []; // Reset to prevent processing
            } else {
                const fackiSelbriDoc = await getSelbriDoc(fackiSelbriPubKey);
                if (fackiSelbriDoc) {
                    const indexMap = fackiSelbriDoc.getMap('datni');
                    if (indexMap instanceof LoroMap) {
                        startSelbriPubkeys = Array.from(indexMap.keys());
                    } else {
                        console.warn('[Query Engine] Facki Selbri index map not found or not a LoroMap.');
                        startSelbriPubkeys = [];
                    }
                } else {
                    console.warn(`[Query Engine] Facki Selbri index document could not be loaded.`);
                    startSelbriPubkeys = [];
                }
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
        fetchAllBridi = true;
        try {
            const fackiBridiPubKey = await getFackiIndexPubKey('bridi');
            if (!fackiBridiPubKey) {
                console.error('[Query Engine] Cannot fetch all Bridi: Facki Bridi index pubkey not available.');
                startBridiPubkeys = [];
            } else {
                const fackiBridiDoc = await getSumtiDoc(fackiBridiPubKey);
                if (fackiBridiDoc) {
                    const indexMap = fackiBridiDoc.getMap('datni');
                    if (indexMap instanceof LoroMap) {
                        startBridiPubkeys = Array.from(indexMap.keys());
                    } else {
                        console.warn(`[Query Engine] Facki Bridi simple index map not found or not a LoroMap.`);
                        startBridiPubkeys = [];
                    }
                } else {
                    console.warn(`[Query Engine] Facki Bridi simple index document could not be loaded.`);
                    startBridiPubkeys = [];
                }
            }
        } catch (error) {
            console.error('[Query Engine] Error fetching all Bridi from simple index:', error);
            startBridiPubkeys = []; // Reset on error
        }
    } else if (startBridiPubkeys === undefined) {
        startBridiPubkeys = []; // Ensure it's an array
    }
    // --- End Special Handling ---

    if (startSumtiPubkeys.length === 0 && startSelbriPubkeys.length === 0 && startBridiPubkeys.length === 0 && !fetchAllSelbri && !fetchAllBridi) {
        console.warn('Query requires start keys in "from" clause or empty array [] to fetch all.');
        return [];
    }

    // Process Sumti Starting Nodes
    for (const pubkey of startSumtiPubkeys) {
        const exists = await checkSumtiExists(pubkey);
        if (!exists) {
            continue;
        }
        const docMeta = await import('$lib/KERNEL/hominio-db').then(
            module => module.hominioDB.getDocument(pubkey)
        );
        if (docMeta && user && !canRead(user, docMeta)) {
            continue;
        }
        const startDoc = await getSumtiDoc(pubkey);
        if (!startDoc) {
            continue;
        }
        if (query.where && !evaluateWhereClauses(startDoc, query.where, pubkey)) {
            continue;
        }
        const nodeResult = await processMap(startDoc, query.map, pubkey, user);
        results.push(nodeResult);
    }

    // Process Selbri Starting Nodes
    for (const pubkey of startSelbriPubkeys) {
        // Skip existence check - if it came from Facki index, assume it exists
        const docMeta = await import('$lib/KERNEL/hominio-db').then(
            module => module.hominioDB.getDocument(pubkey)
        );
        if (docMeta && user && !canRead(user, docMeta)) {
            continue;
        }
        const startDoc = await getSelbriDoc(pubkey);
        if (!startDoc) {
            continue;
        }
        if (query.where && !evaluateWhereClauses(startDoc, query.where, pubkey)) {
            continue;
        }
        const nodeResult = await processMap(startDoc, query.map, pubkey, user);
        results.push(nodeResult);
    }

    // Process Bridi Starting Nodes
    for (const pubkey of startBridiPubkeys) {
        let docMeta;
        try {
            docMeta = await import('$lib/KERNEL/hominio-db').then(
                module => module.hominioDB.getDocument(pubkey)
            );
        } catch (e) {
            console.error(`[Query Engine] Error getting document metadata for Bridi ${pubkey}:`, e);
            continue; // Skip if metadata cannot be fetched
        }

        if (docMeta && user && !canRead(user, docMeta)) {
            continue;
        }

        const startDoc = await getBridiDoc(pubkey);
        if (!startDoc) {
            continue;
        }
        if (query.where && !evaluateWhereClauses(startDoc, query.where, pubkey)) {
            continue;
        }
        try {
            const nodeResult = await processMap(startDoc, query.map, pubkey, user);
            results.push(nodeResult);
        } catch (mapError) {
            console.error(`[Query Engine] Error processing map for Bridi ${pubkey}:`, mapError);
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

            // Simplify result if return: 'first' yielded a single-key object
            if (
                valueDefinition.traverse.return === 'first' &&
                traverseResult &&
                typeof traverseResult === 'object' &&
                !Array.isArray(traverseResult) &&
                Object.keys(traverseResult).length === 1
            ) {
                const originalValue = Object.values(traverseResult)[0];
                traverseResult = originalValue;
            } else if (valueDefinition.traverse.return === 'first' && traverseResult === null) {
                // Result was null, do nothing extra
            }

            // Assign the potentially simplified result
            result[outputKey] = traverseResult;
        } else if (valueDefinition.resolve) {
            // <<< Handle resolve directive >>>
            result[outputKey] = await processResolve(currentDoc, valueDefinition.resolve, user);
        }
    }
    return result;
}

/**
 * Selects a field value from a LoroDoc based on a path string starting with "self."
 */
function selectFieldValue(doc: LoroDoc, fieldPath: string, docPubKey: string): unknown {
    if (fieldPath === 'doc.pubkey') {
        return docPubKey;
    }

    if (!fieldPath || !fieldPath.startsWith('self.')) {
        console.warn(`Invalid field path: "${fieldPath}". Must start with "self." or be "doc.pubkey".`);
        return undefined;
    }

    const path = fieldPath.substring(5); // Remove "self."

    if (path === 'ckaji.cmene') {
        console.warn(`Accessing 'self.ckaji.cmene' directly is deprecated.`);
        return undefined;
    }

    let baseObject: unknown;
    let relativePath: string;

    // Determine base object (ckaji or datni)
    if (path.startsWith('ckaji.')) {
        baseObject = getCkajiFromDoc(doc);
        relativePath = path.substring(6);
    } else if (path.startsWith('datni.')) {
        baseObject = getDatniFromDoc(doc);
        relativePath = path.substring(6);
    } else if (path === 'ckaji') {
        return getCkajiFromDoc(doc);
    } else if (path === 'datni') {
        const datniValue = getDatniFromDoc(doc);
        return datniValue;
    } else {
        // Allow accessing top-level ckaji fields directly e.g. "self.pubkey"
        if (path === 'cmene') {
            console.warn(`Accessing 'self.cmene' directly is deprecated.`);
            return undefined;
        }
        baseObject = getCkajiFromDoc(doc);
        relativePath = path;
    }

    if (!relativePath) {
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
            console.warn(`Cannot traverse into LoroText with path part "${part}" in "${fieldPath}".`);
            return undefined;
        } else if (typeof currentValue === 'object') {
            currentValue = (currentValue as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }

    if (currentValue instanceof LoroText) {
        return currentValue.toString();
    }

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
    for (const { /* pubkey: bridiPubKey, */ doc: bridiDoc } of bridiMatches) {
        const bridiDatni = getDatniFromDoc(bridiDoc) as { selbri: string; sumti: Record<string, string> } | undefined;
        if (!bridiDatni) continue;

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
                console.warn(`Missing 'place' for key "${outputKey}" in traverse.map.`);
                continue;
            }

            const targetNodePubkey = bridiDatni.sumti[valueDefinition.place];
            if (!targetNodePubkey) {
                relatedNodeResult[outputKey] = null;
                continue;
            }

            const targetNodeDoc = await getSumtiDoc(targetNodePubkey);
            if (!targetNodeDoc) {
                relatedNodeResult[outputKey] = null;
                continue;
            }

            // Determine the value based on the definition type for the target node
            if (valueDefinition.field) {
                relatedNodeResult[outputKey] = selectFieldValue(targetNodeDoc, valueDefinition.field, targetNodePubkey);
            } else if (valueDefinition.map) {
                relatedNodeResult[outputKey] = await processMap(targetNodeDoc, valueDefinition.map, targetNodePubkey, user);
            } else if (valueDefinition.traverse) {
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
        return results.length > 0 ? results[0] : null;
    } else {
        return results; // Default return array
    }
}

/**
 * Evaluates multiple top-level where clauses against a document.
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
 */
async function processResolve(
    sourceDoc: LoroDoc,
    resolveDefinition: LoroHqlResolve,
    user: CapabilityUser | null
): Promise<QueryResult | null> {
    // 1. Get the pubkey from the source document field
    const targetPubKey = selectFieldValue(sourceDoc, resolveDefinition.fromField, "") as string | undefined;

    if (!targetPubKey) {
        console.warn(`[Query Resolve] Pubkey not found or invalid in field: ${resolveDefinition.fromField}`);
        return null; // Or handle based on onError policy
    }

    // 2. Fetch the target document
    let targetDoc: LoroDoc | null = null;
    let docMeta: Awaited<ReturnType<typeof import('$lib/KERNEL/hominio-db')['hominioDB']['getDocument']>> | null = null;

    try {
        const exists = await checkSumtiExists(targetPubKey);
        if (!exists) {
            console.warn(`[Query Resolve] Target document ${targetPubKey} not found in Sumti index.`);
            return null;
        }

        targetDoc = await getSumtiDoc(targetPubKey);
        if (!targetDoc) {
            return null;
        }
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
 */
export function processReactiveQuery(
    getCurrentUserFn: typeof getMeType,
    queryDefinitionStore: Readable<LoroHqlQuery | null>
): Readable<QueryResult[] | null | undefined> {
    if (!browser) {
        // --- Server-Side Rendering (SSR) Handling --- 
        const initialQuery = get(queryDefinitionStore);
        const ssrUser = getCurrentUserFn();
        return readable<QueryResult[] | null | undefined>(undefined, (set) => {
            if (!initialQuery) {
                set([]);
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

            const queryChanged = lastQueryDefinitionString !== queryDefString;
            lastQueryDefinitionString = queryDefString; // Update last known definition

            if (!currentQueryDefinition) {
                if (debounceTimer) clearTimeout(debounceTimer);
                if (currentResults && currentResults.length > 0) {
                    set([]);
                    currentResults = [];
                } else if (currentResults === undefined || currentResults === null) {
                    set([]);
                    currentResults = [];
                }
                return;
            }

            if (!queryChanged && currentResults !== undefined) {
                return;
            }


            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            if (currentResults === undefined || queryChanged) {
                set(undefined);
                currentResults = undefined;
            }


            debounceTimer = setTimeout(async () => {
                const currentUser = getCurrentUserFn();
                const latestQueryDefinition = get(queryDefinitionStore);
                const latestQueryDefString = JSON.stringify(latestQueryDefinition);

                if (!latestQueryDefinition || latestQueryDefString !== lastQueryDefinitionString) {
                    return;
                }


                console.log('[LoroHQL Reactive] Running debounced query...');

                try {
                    if (currentResults !== undefined) {
                        set(undefined);
                    }
                    currentResults = undefined; // Mark as loading

                    const results = await executeQuery(latestQueryDefinition, currentUser);

                    if (JSON.stringify(get(queryDefinitionStore)) !== lastQueryDefinitionString) {
                        return; // Don't set stale results
                    }

                    set(results); // Update the store with results
                    currentResults = results;
                } catch (error) {
                    console.error("[LoroHQL Reactive] Error executing query:", error);
                    if (JSON.stringify(get(queryDefinitionStore)) !== lastQueryDefinitionString) {
                        return; // Don't set stale error state
                    }
                    set(null); // Set null on error
                    currentResults = null;
                }
            }, DEBOUNCE_MS);
        };

        // 1. Subscribe to Query Definition Changes
        const unsubscribeQueryDef = queryDefinitionStore.subscribe(newQueryDef => {
            const newQueryDefString = JSON.stringify(newQueryDef);
            if (lastQueryDefinitionString !== newQueryDefString || currentResults === undefined) {
                triggerDebouncedQuery();
            }
        });

        // 2. Subscribe to Document Changes
        const unsubscribeNotifier = docChangeNotifier.subscribe(() => {
            triggerDebouncedQuery();
        });

        // 3. Subscribe to Session Changes
        const sessionStore = authClient.useSession();
        const unsubscribeSession = sessionStore.subscribe((session: MinimalSession) => {
            const currentSessionState = JSON.stringify(session?.data?.user?.id ?? null); // Check only user ID
            if (lastSessionState !== null && lastSessionState !== currentSessionState) {
                triggerDebouncedQuery();
            }
            lastSessionState = currentSessionState;
        });

        // Initial setup: capture initial session state
        const initialSessionData = get(sessionStore);
        lastSessionState = JSON.stringify(initialSessionData?.data?.user?.id ?? null);
        lastQueryDefinitionString = JSON.stringify(get(queryDefinitionStore));
        currentResults = undefined; // Start in undefined state

        if (get(queryDefinitionStore)) {
            triggerDebouncedQuery(); // Trigger initial run
        } else {
            set([]);
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
        };
    });
} 