import { type LoroDoc, LoroMap, LoroText, LoroList } from 'loro-crdt';
import type { BridiRecord, Pubkey, SelbriId } from './db';
import {
    getSumtiDoc,
    getSelbriDoc,
    findBridiDocsBySelbriAndPlace,
    getCkajiFromDoc,
    getDatniFromDoc,
    checkSumtiExists,
    checkSelbriExists,
    FACKI_SELBRI_PUBKEY
} from './loro-engine';
import { canRead, type CapabilityUser } from '$lib/KERNEL/hominio-caps';
import { docChangeNotifier } from '$lib/KERNEL/hominio-db';
import { readable, type Readable, get } from 'svelte/store';
import { authClient, type getMe as getMeType } from '$lib/KERNEL/hominio-auth';
import { browser } from '$app/environment';

// --- LORO_HQL Query Types (Map-Based Syntax) ---

type SumtiPlace = keyof BridiRecord['datni']['sumti'];

// Refined: Defines how to get a value for an output property
interface LoroHqlMapValue {
    // Source selection (used at top level or inside traverse.map)
    field?: string;      // Option 1: Direct field access from *current* node (e.g., "self.ckaji.cmene")
    traverse?: LoroHqlTraverse; // Option 2: Traverse relationship from *current* node

    // Target selection (used *only* inside traverse.map)
    place?: SumtiPlace;  // Specifies the target node's place in the Bridi

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
    place: SumtiPlace; // Which related node place to filter
    field: string;     // Path on the related node (e.g., "self.ckaji.pubkey")
    condition: LoroHqlCondition;
}

// Defines a traversal step
interface LoroHqlTraverse {
    bridi_where: {
        selbri: SelbriId;
        place: SumtiPlace; // Place the *current* node occupies in this Bridi
    };
    return?: 'array' | 'first'; // Default: 'array'
    where_related?: LoroHqlWhereRelatedClause[]; // Filter related nodes (can be multiple conditions)
    map: LoroHqlMap; // Defines output structure for *each* related node
}

// Top-level Query Structure
export interface LoroHqlQuery {
    from: {
        sumti_pubkeys?: Pubkey[];
        selbri_pubkeys?: Pubkey[];
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

    if (startSumtiPubkeys.length === 0 && startSelbriPubkeys.length === 0 && !fetchAllSelbri) {
        console.warn('Query requires sumti_pubkeys or non-empty selbri_pubkeys (or empty array [] to fetch all) in "from" clause.');
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
        // Process the Top-Level Map Clause - Pass pubkey
        const nodeResult = await processMap(startDoc, query.map, pubkey);
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
        // Process the Top-Level Map Clause - Pass pubkey
        const nodeResult = await processMap(startDoc, query.map, pubkey);
        results.push(nodeResult);
    }

    return results;
}

/**
 * Processes a `map` object for a given LoroDoc (the current context `self`).
 */
async function processMap(
    currentDoc: LoroDoc,
    mapDefinition: LoroHqlMap,
    docPubKey: Pubkey
): Promise<QueryResult> {
    const result: QueryResult = {};
    const mapEntries = Object.entries(mapDefinition);

    for (const [outputKey, valueDefinition] of mapEntries) {
        if (valueDefinition.field) {
            // Handle direct field selection from currentDoc, passing its pubkey
            result[outputKey] = selectFieldValue(currentDoc, valueDefinition.field, docPubKey);
        } else if (valueDefinition.traverse) {
            // Handle traversal starting from currentDoc, passing its pubkey
            let traverseResult: TraversalResult = await processTraversal(currentDoc, valueDefinition.traverse);

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
        }
        // Note: `place` and nested `map` are only valid *inside* a processTraversal context.
    }
    return result;
}

/**
 * Selects a field value from a LoroDoc based on a path string starting with "self."
 * IMPORTANT: Access to 'self.ckaji.cmene' is discouraged for primary entity names.
 */
function selectFieldValue(doc: LoroDoc, fieldPath: string, docPubKey: Pubkey): unknown {
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
        return getDatniFromDoc(doc);
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
    traverseDefinition: LoroHqlTraverse
): Promise<QueryResult[] | QueryResult | null> {
    const sourceCkaji = getCkajiFromDoc(sourceDoc);
    const sourcePubkey = sourceCkaji?.pubkey as Pubkey | undefined;

    if (!sourcePubkey) {
        console.error('Cannot traverse: source document pubkey not found in ckaji.');
        return traverseDefinition.return === 'first' ? null : [];
    }

    // 1. Find connecting Bridi documents
    const bridiMatches = await findBridiDocsBySelbriAndPlace(
        traverseDefinition.bridi_where.selbri,
        traverseDefinition.bridi_where.place,
        sourcePubkey
    );

    const results: QueryResult[] = [];

    // 2. Process each potential related node via the Bridi
    for (const bridiDoc of bridiMatches) {
        const bridiDatni = getDatniFromDoc(bridiDoc) as BridiRecord['datni'] | undefined;
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
                // Pass target node's pubkey
                relatedNodeResult[outputKey] = selectFieldValue(targetNodeDoc, valueDefinition.field, targetNodePubkey);
            } else if (valueDefinition.map) {
                // Pass target node's pubkey
                relatedNodeResult[outputKey] = await processMap(targetNodeDoc, valueDefinition.map, targetNodePubkey);
            } else if (valueDefinition.traverse) {
                // Pass target node's pubkey as the new source for the next traversal
                relatedNodeResult[outputKey] = await processTraversal(targetNodeDoc, valueDefinition.traverse);
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
function evaluateWhereClauses(doc: LoroDoc, clauses: LoroHqlWhereClause[], docPubKey: Pubkey): boolean {
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
    docPubKey: Pubkey
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

            // If no query definition, set empty result and clear debounce
            if (!currentQueryDefinition) {
                if (debounceTimer) clearTimeout(debounceTimer);
                if (currentResults !== null && currentResults !== undefined && currentResults.length > 0) {
                    set([]);
                    currentResults = [];
                }
                lastQueryDefinitionString = queryDefString;
                return;
            }

            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            // Set loading state immediately if results aren't already available
            if (currentResults === undefined) {
                set(undefined);
            }

            debounceTimer = setTimeout(async () => {
                const currentUser = getCurrentUserFn();
                // Re-check query definition *inside* timeout, in case it changed again rapidly
                const latestQueryDefinition = get(queryDefinitionStore);
                if (!latestQueryDefinition || JSON.stringify(latestQueryDefinition) !== queryDefString) {
                    // Query changed again before execution, let the next trigger handle it
                    return;
                }

                console.log('[LoroHQL Reactive] Running debounced query...', latestQueryDefinition);

                try {
                    const results = await executeQuery(latestQueryDefinition, currentUser);
                    set(results); // Update the store with results
                    currentResults = results;
                    lastQueryDefinitionString = queryDefString; // Update last processed query string
                } catch (error) {
                    console.error("[LoroHQL Reactive] Error executing query:", error);
                    set(null); // Set null on error
                    currentResults = null;
                    lastQueryDefinitionString = queryDefString; // Update last processed query string
                }
            }, DEBOUNCE_MS);
        };

        // 1. Subscribe to Query Definition Changes
        const unsubscribeQueryDef = queryDefinitionStore.subscribe(newQueryDef => {
            // Trigger only if the stringified definition changes
            const newQueryDefString = JSON.stringify(newQueryDef);
            if (lastQueryDefinitionString !== newQueryDefString) {
                console.log('[LoroHQL Reactive] Query definition changed.');
                lastQueryDefinitionString = newQueryDefString; // Update immediately
                currentResults = undefined; // Reset results state on query change
                triggerDebouncedQuery();
            }
        });

        // 2. Subscribe to Document Changes
        const unsubscribeNotifier = docChangeNotifier.subscribe(() => {
            console.log('[LoroHQL Reactive] docChangeNotifier triggered.');
            triggerDebouncedQuery();
        });

        // 3. Subscribe to Session Changes
        const sessionStore = authClient.useSession();
        const unsubscribeSession = sessionStore.subscribe((session: MinimalSession) => {
            const currentSessionState = JSON.stringify(session?.data?.user?.id ?? null); // Check only user ID
            if (lastSessionState !== null && lastSessionState !== currentSessionState) {
                console.log('[LoroHQL Reactive] Session changed.');
                triggerDebouncedQuery();
            }
            lastSessionState = currentSessionState;
        });

        // Initial setup: capture initial session state
        const initialSessionData = get(sessionStore);
        lastSessionState = JSON.stringify(initialSessionData?.data?.user?.id ?? null);
        lastQueryDefinitionString = JSON.stringify(get(queryDefinitionStore)); // Capture initial query def
        // Initial query run is handled by the queryDefinitionStore subscription if needed
        // Or run explicitly if there's an initial query definition
        if (get(queryDefinitionStore)) {
            triggerDebouncedQuery(); // Trigger initial run if query exists
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