import { type LoroDoc, LoroMap, LoroText, LoroList } from 'loro-crdt';
import {
    getLeafDoc,
    getSchemaDoc,
    getCompositeDoc,
    findCompositeDocsBySchemaAndPlace,
    getDataFromDoc,
    checkLeafExists,
    checkSchemaExists
} from './loro-engine';
import { canRead, type CapabilityUser } from '$lib/KERNEL/hominio-caps';
import { docChangeNotifier } from '$lib/KERNEL/hominio-db';
import { readable, type Readable, get } from 'svelte/store';
import { authClient, type getMe as getMeType } from '$lib/KERNEL/hominio-auth';
import { browser } from '$app/environment';
import { getIndexLeafPubKey, isIndexLeafDocument } from './index-registry';

// FIX: Export PlaceKey
export type PlaceKey = 'x1' | 'x2' | 'x3' | 'x4' | 'x5';

// Refined: Defines how to get a value for an output property
interface LoroHqlMapValue {
    field?: string;      // Option 1: Direct field access (e.g., "self.metadata.type", "self.data.value")
    traverse?: LoroHqlTraverse; // Option 2: Traverse relationship
    resolve?: LoroHqlResolve;

    // Target selection (used *only* inside traverse.map)
    place?: PlaceKey;  // Specifies the target node's place in the Composite

    // Action on target node (used *only* inside traverse.map, requires 'place')
    map?: LoroHqlMap;
}

// Defines the output structure
interface LoroHqlMap {
    [outputKey: string]: LoroHqlMapValue;
}

// Filter condition
interface LoroHqlCondition {
    equals?: unknown;
    in?: unknown[];
}

// Top-level filter for starting nodes
interface LoroHqlWhereClause {
    field: string; // Path on the starting node (e.g., "self.metadata.type")
    condition: LoroHqlCondition;
}

// Filter applied to related nodes during traversal
interface LoroHqlWhereRelatedClause {
    place: PlaceKey; // Which related node place to filter
    field: string;     // Path on the related node (e.g., "self.data.type")
    condition: LoroHqlCondition;
}

// Defines a traversal step
interface LoroHqlTraverse {
    composite_where: {
        schemaId: string | '*';
        place: PlaceKey | '*';
    };
    return?: 'array' | 'first';
    where_related?: LoroHqlWhereRelatedClause[];
    map: LoroHqlMap;
}

// Resolve definition
interface LoroHqlResolve {
    fromField: string; // Path in the current node containing the pubkey(s)
    targetType?: 'leaf' | 'gismu';
    map: LoroHqlMap;   // Map to apply to the RESOLVED document(s)
}

// Top-level Query Structure
export interface LoroHqlQuery {
    from: {
        leaf?: string[];          // Renamed from leaf_pubkeys
        schema?: string[];        // Renamed from gismu_pubkeys
        composite?: string[];     // Renamed from composite_pubkeys
    };
    map: LoroHqlMap;
    where?: LoroHqlWhereClause[];
}

// Result type
export type QueryResult = Record<string, unknown>;
type TraversalResult = QueryResult[] | QueryResult | unknown | null;

type MinimalSession = {
    data?: {
        user?: {
            id?: string | null;
        } | null;
    } | null;
} | null;

// --- Query Engine Implementation ---

/**
 * Main function to execute a LORO_HQL map-based query.
 */
export async function executeQuery(
    query: LoroHqlQuery,
    user: CapabilityUser | null = null
): Promise<QueryResult[]> {
    const results: QueryResult[] = [];

    // 1. Determine Starting Nodes & Process
    let startLeafPubkeys = query.from.leaf;
    let startGismuPubkeys = query.from.schema; // Renamed internal variable for clarity
    let startCompositePubkeys = query.from.composite;

    // --- Handling Fetch All (Leaf) ---
    if (startLeafPubkeys && Array.isArray(startLeafPubkeys) && startLeafPubkeys.length === 0) {
        try {
            const indexPubKey = await getIndexLeafPubKey('leaves');
            if (!indexPubKey) {
                console.error('[Query Engine] Cannot fetch all Leaves: Index pubkey for leaves not available.');
            } else {
                const indexDoc = await getLeafDoc(indexPubKey);
                if (!indexDoc) {
                    console.warn(`[Query Engine] Index document for leaves (${indexPubKey}) could not be loaded.`);
                } else {
                    // FIX: Correctly parse the index Leaf structure (data: { type:'LoroMap', value: LoroMap }) 
                    const dataMap = indexDoc.getMap('data');
                    if (!(dataMap instanceof LoroMap)) {
                        console.warn('[Query Engine] Leaves Index document data container is not a LoroMap.');
                    } else {
                        const valueContainer = dataMap.get('value');
                        if (!(valueContainer instanceof LoroMap)) {
                            console.warn('[Query Engine] Leaves Index document data.value is not a LoroMap.');
                        } else {
                            // Successfully found the value map, get its keys
                            startLeafPubkeys = Object.keys(valueContainer.toJSON());
                            console.log(`[Query Engine] Fetched ${startLeafPubkeys?.length ?? 0} Leaf keys from index:`, startLeafPubkeys);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Query Engine] Error fetching all Leaves from index:', error);
        }
        // Ensure startLeafPubkeys is always an array if it was initially empty array
        if (startLeafPubkeys && Array.isArray(startLeafPubkeys) && startLeafPubkeys.length === 0 && query.from.leaf?.length === 0) {
            startLeafPubkeys = []; // Keep it as empty array if fetch failed
        }
    } else if (startLeafPubkeys === undefined) {
        startLeafPubkeys = [];
    }

    // --- Handling Fetch All (Schema/Gismu) ---
    if (startGismuPubkeys && Array.isArray(startGismuPubkeys) && startGismuPubkeys.length === 0) {
        try {
            const indexPubKey = await getIndexLeafPubKey('schemas');
            if (!indexPubKey) {
                console.error('[Query Engine] Cannot fetch all Schemas: Index pubkey for schemas not available.');
            } else {
                const indexDoc = await getLeafDoc(indexPubKey);
                if (!indexDoc) {
                    console.warn(`[Query Engine] Index document for schemas (${indexPubKey}) could not be loaded.`);
                } else {
                    // FIX: Correctly parse the index Leaf structure
                    const dataMap = indexDoc.getMap('data');
                    if (!(dataMap instanceof LoroMap)) {
                        console.warn('[Query Engine] Schemas Index document data container is not a LoroMap.');
                    } else {
                        const valueContainer = dataMap.get('value');
                        if (!(valueContainer instanceof LoroMap)) {
                            console.warn('[Query Engine] Schemas Index document data.value is not a LoroMap.');
                        } else {
                            startGismuPubkeys = Object.keys(valueContainer.toJSON());
                            console.log(`[Query Engine] Fetched ${startGismuPubkeys.length} Schema keys from index.`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Query Engine] Error fetching all Schemas from index:', error);
        }
        // Ensure startGismuPubkeys is always an array if it was initially empty array
        if (startGismuPubkeys && Array.isArray(startGismuPubkeys) && startGismuPubkeys.length === 0 && query.from.schema?.length === 0) {
            startGismuPubkeys = [];
        }
    } else if (startGismuPubkeys === undefined) {
        startGismuPubkeys = [];
    }

    // --- Handling Fetch All (Composite) ---
    if (startCompositePubkeys && Array.isArray(startCompositePubkeys) && startCompositePubkeys.length === 0) {
        try {
            const indexPubKey = await getIndexLeafPubKey('composites');
            if (!indexPubKey) {
                console.error('[Query Engine] Cannot fetch all Composites: Index pubkey for composites not available.');
            } else {
                const indexDoc = await getLeafDoc(indexPubKey);
                if (!indexDoc) {
                    console.warn(`[Query Engine] Index document for composites (${indexPubKey}) could not be loaded.`);
                } else {
                    // FIX: Correctly parse the index Leaf structure
                    const dataMap = indexDoc.getMap('data');
                    if (!(dataMap instanceof LoroMap)) {
                        console.warn('[Query Engine] Composites Index document data container is not a LoroMap.');
                    } else {
                        const valueContainer = dataMap.get('value');
                        if (!(valueContainer instanceof LoroMap)) {
                            console.warn('[Query Engine] Composites Index document data.value is not a LoroMap.');
                        } else {
                            startCompositePubkeys = Object.keys(valueContainer.toJSON());
                            console.log(`[Query Engine] Fetched ${startCompositePubkeys.length} Composite keys from index.`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Query Engine] Error fetching all Composites from index:', error);
        }
        // Ensure startCompositePubkeys is always an array if it was initially empty array
        if (startCompositePubkeys && Array.isArray(startCompositePubkeys) && startCompositePubkeys.length === 0 && query.from.composite?.length === 0) {
            startCompositePubkeys = [];
        }
    } else if (startCompositePubkeys === undefined) {
        startCompositePubkeys = [];
    }

    // FIX: Update check message
    if (startLeafPubkeys.length === 0 && startGismuPubkeys.length === 0 && startCompositePubkeys.length === 0) {
        console.warn('[Query Engine] No starting keys provided in "from" and failed to fetch keys from index (or index is empty).');
        return [];
    }

    // Process Leaf Starting Nodes
    for (const pubkey of startLeafPubkeys) {
        if (!isIndexLeafDocument(pubkey)) {
            const exists = await checkLeafExists(pubkey);
            if (!exists) {
                console.log(`[Query Engine] Skipping Leaf ${pubkey}, does not exist in index.`);
                continue;
            }
        }
        const docMeta = await import('$lib/KERNEL/hominio-db').then(m => m.hominioDB.getDocument(pubkey));
        if (docMeta && user && !canRead(user, docMeta)) continue;
        const startDoc = await getLeafDoc(pubkey);
        console.log(`[Query Engine Debug] Processing Leaf ${pubkey}. startDoc loaded: ${!!startDoc}`);
        if (!startDoc) {
            console.warn(`[Query Engine] Failed to load Leaf doc for existing pubkey: ${pubkey}`);
            continue;
        }
        if (query.where && !evaluateWhereClauses(startDoc, query.where, pubkey)) continue;
        const nodeResult = await processMap(startDoc, query.map, pubkey, user);
        results.push(nodeResult);
    }

    // Process Schema (Gismu) Starting Nodes
    for (const pubkey of startGismuPubkeys) {
        if (!isIndexLeafDocument(pubkey)) {
            const exists = await checkSchemaExists(pubkey);
            if (!exists) {
                console.log(`[Query Engine] Skipping Schema ${pubkey}, does not exist in index.`);
                continue;
            }
        }
        const docMeta = await import('$lib/KERNEL/hominio-db').then(m => m.hominioDB.getDocument(pubkey));
        if (docMeta && user && !canRead(user, docMeta)) continue;
        const startDoc = await getSchemaDoc(pubkey);
        if (!startDoc) continue;
        if (query.where && !evaluateWhereClauses(startDoc, query.where, pubkey)) continue;
        const nodeResult = await processMap(startDoc, query.map, pubkey, user);
        results.push(nodeResult);
    }

    // Process Composite Starting Nodes
    for (const pubkey of startCompositePubkeys) {
        let docMeta;
        try {
            docMeta = await import('$lib/KERNEL/hominio-db').then(m => m.hominioDB.getDocument(pubkey));
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_e) { continue; }
        if (docMeta && user && !canRead(user, docMeta)) continue;
        const startDoc = await getCompositeDoc(pubkey);
        if (!startDoc) continue;
        if (query.where && !evaluateWhereClauses(startDoc, query.where, pubkey)) continue;
        try {
            const nodeResult = await processMap(startDoc, query.map, pubkey, user);
            results.push(nodeResult);
        } catch (mapError) { console.error(`[Query Engine] Error processing map for Composite ${pubkey}:`, mapError); continue; }
    }

    return results;
}

/**
 * Processes a `map` object for a given LoroDoc.
 */
async function processMap(
    currentDoc: LoroDoc,
    mapDefinition: LoroHqlMap,
    docPubKey: string,
    user: CapabilityUser | null
): Promise<QueryResult> {
    const result: QueryResult = {};
    const mapEntries = Object.entries(mapDefinition);

    for (const [outputKey, valueDefinition] of mapEntries) {
        if (valueDefinition.field) {
            result[outputKey] = selectFieldValue(currentDoc, valueDefinition.field, docPubKey);
        } else if (valueDefinition.traverse) {
            let traverseResult: TraversalResult = await processTraversal(currentDoc, valueDefinition.traverse, docPubKey, user);
            if (valueDefinition.traverse.return === 'first' && traverseResult && typeof traverseResult === 'object' && !Array.isArray(traverseResult) && Object.keys(traverseResult).length === 1) {
                traverseResult = Object.values(traverseResult)[0];
            }
            result[outputKey] = traverseResult;
        } else if (valueDefinition.resolve) {
            result[outputKey] = await processResolve(currentDoc, valueDefinition.resolve, user);
        }
    }
    return result;
}

/**
 * Selects a field value from a LoroDoc based on a path string (e.g., "self.metadata.type").
 */
function selectFieldValue(doc: LoroDoc, fieldPath: string, docPubKey: string): unknown {
    if (fieldPath === 'doc.pubkey') return docPubKey;
    if (!fieldPath || !fieldPath.startsWith('self.')) {
        console.warn(`Invalid field path: "${fieldPath}". Must start with "self." or be "doc.pubkey".`);
        return undefined;
    }

    const path = fieldPath.substring(5);
    let baseObject: unknown;
    let relativePath: string;

    if (path.startsWith('metadata.')) {
        baseObject = doc.getMap('metadata')?.toJSON();
        relativePath = path.substring(9);
    } else if (path.startsWith('data.')) {
        baseObject = getDataFromDoc(doc);
        relativePath = path.substring(5);
    } else if (path === 'metadata') {
        baseObject = doc.getMap('metadata')?.toJSON();
        relativePath = '';
    } else if (path === 'data') {
        baseObject = getDataFromDoc(doc);
        relativePath = '';
    } else {
        baseObject = doc.getMap('metadata')?.toJSON();
        relativePath = path;
    }

    if (!relativePath) {
        if (path === 'data') return baseObject;
        return baseObject;
    }

    const pathParts = relativePath.split('.');
    let currentValue: unknown = baseObject;

    for (const part of pathParts) {
        if (currentValue === undefined || currentValue === null) return undefined;

        if (typeof currentValue === 'object' && currentValue !== null && 'type' in currentValue && 'value' in currentValue && path.startsWith('data.')) {
            if (part === 'type' || part === 'value') {
                currentValue = (currentValue as Record<string, unknown>)[part];
                continue;
            }
            if (typeof (currentValue as { value: unknown }).value === 'object' && (currentValue as { value: unknown }).value !== null) {
                currentValue = ((currentValue as { value: Record<string, unknown> }).value)[part];
                continue;
            }
        }

        if (typeof currentValue === 'object' && currentValue !== null) {
            currentValue = (currentValue as Record<string, unknown>)[part];
        } else if (currentValue instanceof LoroMap) {
            currentValue = currentValue.get(part);
        } else if (currentValue instanceof LoroList) {
            const index = parseInt(part, 10);
            if (!isNaN(index) && index >= 0) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                try { currentValue = currentValue.get(index) as unknown; } catch (_e) { return undefined; }
            } else { return undefined; }
        } else if (currentValue instanceof LoroText) {
            return undefined;
        } else {
            return undefined;
        }
    }

    if (currentValue instanceof LoroText) return currentValue.toString();
    if (currentValue instanceof LoroMap || currentValue instanceof LoroList) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        try { return currentValue.toJSON(); } catch (_e) { return undefined; }
    }

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
    if (!sourcePubKey) return traverseDefinition.return === 'first' ? null : [];

    const compositeWhere = traverseDefinition.composite_where;
    console.log(`[Query Traversal] Starting from source Leaf/Schema: ${sourcePubKey}, Composite schemaId: ${compositeWhere.schemaId}, source place: ${compositeWhere.place}`);

    let compositeMatches: { pubkey: string; doc: LoroDoc }[] = [];
    const schemaWildcard = compositeWhere.schemaId === '*';
    const placeWildcard = compositeWhere.place === '*';
    const sourcePlaceInComposite = compositeWhere.place;

    // [Logging Point 1: Before finding composites]
    console.log(`[Query Traversal Detail] Finding composites for source ${sourcePubKey} (Schema: ${compositeWhere.schemaId}, Place: ${sourcePlaceInComposite})`);

    if (schemaWildcard) {
        console.warn(`[Query Engine] Traversing with Composite schemaId wildcard (place: ${sourcePlaceInComposite}) from ${sourcePubKey}. This may be slow.`);
        try {
            // 1. Get the 'composites' index pubkey
            const indexPubKey = await getIndexLeafPubKey('composites');
            console.log(`[Query Traversal Wildcard Debug] Index PubKey for 'composites': ${indexPubKey}`); // DEBUG LOG 1
            if (indexPubKey) {
                // 2. Get the 'composites' index Leaf document
                const indexDoc = await getLeafDoc(indexPubKey);
                if (indexDoc) {
                    // 3. Extract all composite pubkeys from the index Leaf's data.value
                    // FIX: Correctly read the { type: 'LoroMap', value: LoroMap } structure
                    const indexDocData = getDataFromDoc(indexDoc) as { type: string, value?: Record<string, unknown> } | undefined;
                    let allCompositePubkeys: string[] = [];
                    if (indexDocData && indexDocData.type === 'LoroMap' && indexDocData.value) {
                        allCompositePubkeys = Object.keys(indexDocData.value);
                    } else {
                        console.warn(`[Query Traversal Wildcard Debug] Index doc ${indexPubKey} data structure unexpected:`, indexDocData);
                    }

                    console.log(`[Query Traversal Wildcard Debug] Found ${allCompositePubkeys.length} total composite keys in index:`, allCompositePubkeys); // DEBUG LOG 2

                    // 4. Loop through every composite pubkey found
                    for (const compositePubKey of allCompositePubkeys) {
                        console.log(`[Query Traversal Wildcard Debug] Checking Composite PubKey: ${compositePubKey}`); // DEBUG LOG 3
                        const compositeDoc = await getCompositeDoc(compositePubKey);
                        if (compositeDoc) {
                            // 5. Get data from the actual composite document
                            const compositeData = getDataFromDoc(compositeDoc) as { schemaId: string; places: Record<string, string> } | undefined;
                            console.log(`[Query Traversal Wildcard Debug]   - Extracted places:`, compositeData?.places); // DEBUG LOG 4
                            if (compositeData?.places) {
                                // 6. Check if the sourcePubKey matches any place (since place='*')
                                if (placeWildcard) {
                                    const placesToCheck: PlaceKey[] = ['x1', 'x2', 'x3', 'x4', 'x5'];
                                    for (const place of placesToCheck) {
                                        const placeValue = compositeData.places[place];
                                        console.log(`[Query Traversal Wildcard Debug]   - Comparing place '${place}' value '${placeValue}' === '${sourcePubKey}'`); // DEBUG LOG 5
                                        // 7. Compare the Leaf ID in the place with the sourcePubKey
                                        if (placeValue === sourcePubKey) {
                                            console.log(`[Query Traversal Wildcard Debug]   - MATCH FOUND for place ${place}!`);
                                            compositeMatches.push({ pubkey: compositePubKey, doc: compositeDoc });
                                            break; // Found a match, move to next composite
                                        }
                                    }
                                } else {
                                    if (compositeData.places[sourcePlaceInComposite] === sourcePubKey) {
                                        compositeMatches.push({ pubkey: compositePubKey, doc: compositeDoc });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) { console.error('[Query Engine Wildcard] Error fetching all Composites:', error); }
    } else {
        if (placeWildcard) {
            console.error(`[Query Engine] Wildcard for 'place' is only supported when 'schemaId' is also a wildcard ('*').`);
            compositeMatches = [];
        } else {
            compositeMatches = await findCompositeDocsBySchemaAndPlace(
                compositeWhere.schemaId,
                sourcePlaceInComposite as PlaceKey,
                sourcePubKey
            );
        }
    }

    // [Logging Point 2: After finding composites]
    console.log(`[Query Traversal Detail] Found ${compositeMatches.length} composite matches for source ${sourcePubKey}.`);

    const results: QueryResult[] = [];
    if (compositeMatches.length === 0) {
        console.log(`[Query Traversal] No composite matches found for source ${sourcePubKey}.`); // Kept original log
    }

    for (const { pubkey: compositePubKey, doc: compositeDoc } of compositeMatches) {
        // [Logging Point 3: Processing a composite match]
        console.log(`[Query Traversal Detail] Processing composite match: ${compositePubKey}`);
        const compositeData = getDataFromDoc(compositeDoc) as { schemaId: string; places: Record<string, string> } | undefined;
        if (!compositeData) {
            console.warn(`[Query Traversal Detail] Skipping composite ${compositePubKey}: Failed to get data.`);
            continue;
        }

        if (traverseDefinition.where_related) {
            // [Logging Point 4: Evaluating where_related]
            console.log(`[Query Traversal Detail] Evaluating where_related filters for composite ${compositePubKey}`);
            let passesAllFilters = true;
            for (const relatedFilter of traverseDefinition.where_related) {
                const targetNodePubkey = compositeData.places[relatedFilter.place];
                if (!targetNodePubkey) {
                    console.log(`[Query Traversal Detail] Filter failed: Target node key not found at place '${relatedFilter.place}'.`);
                    passesAllFilters = false; break;
                }
                const targetNodeDoc = await getLeafDoc(targetNodePubkey);
                if (!targetNodeDoc) {
                    console.log(`[Query Traversal Detail] Filter failed: Could not load target node doc ${targetNodePubkey}.`);
                    passesAllFilters = false; break;
                }
                const passesSingle = evaluateSingleWhere(targetNodeDoc, relatedFilter.field, relatedFilter.condition, targetNodePubkey);
                console.log(`[Query Traversal Detail]   - Filter on place '${relatedFilter.place}' (node ${targetNodePubkey}, field '${relatedFilter.field}'): ${passesSingle}`);
                if (!passesSingle) {
                    passesAllFilters = false;
                    break;
                }
            }
            if (!passesAllFilters) {
                console.log(`[Query Traversal Detail] Skipping composite ${compositePubKey} due to where_related filter.`);
                continue;
            }
        }

        const relatedNodeResult: QueryResult = {};
        const mapEntries = Object.entries(traverseDefinition.map);

        // [Logging Point 5: Processing map entries for a composite]
        console.log(`[Query Traversal Detail] Processing map entries for composite ${compositePubKey}`);
        for (const [outputKey, valueDefinition] of mapEntries) {
            console.log(`[Query Traversal Detail]   - Mapping output key: "${outputKey}"`);
            let isCompositeField = false;
            if (valueDefinition.field && (valueDefinition.field === 'doc.pubkey' || valueDefinition.field.startsWith('self.'))) {
                isCompositeField = true;
            }

            let entryResult: unknown = undefined; // Variable to hold result before assignment

            if (isCompositeField && valueDefinition.field) {
                console.log(`[Query Traversal Detail]     - Type: Composite Field ('${valueDefinition.field}')`);
                entryResult = selectFieldValue(compositeDoc, valueDefinition.field, compositePubKey);
            } else if (valueDefinition.resolve) {
                console.log(`[Query Traversal Detail]     - Type: Resolve (from composite ${compositePubKey})`);
                entryResult = await processResolve(compositeDoc, valueDefinition.resolve, user);
            } else {
                if (!valueDefinition.place) {
                    console.warn(`[Query Traversal Detail]     - MISSING 'place' for key "${outputKey}". Skipping.`); continue;
                }
                const targetNodePubkey = compositeData.places[valueDefinition.place];
                console.log(`[Query Traversal Detail]     - Target Node PubKey (from place '${valueDefinition.place}'): ${targetNodePubkey}`);
                if (!targetNodePubkey) { relatedNodeResult[outputKey] = null; continue; }
                const targetNodeDoc = await getLeafDoc(targetNodePubkey);
                if (!targetNodeDoc) {
                    console.warn(`[Query Traversal Detail]     - Failed to load target node doc ${targetNodePubkey}. Setting null.`);
                    relatedNodeResult[outputKey] = null; continue;
                }

                if (valueDefinition.field) {
                    console.log(`[Query Traversal Detail]     - Type: Target Field ('${valueDefinition.field}' on ${targetNodePubkey})`);
                    entryResult = selectFieldValue(targetNodeDoc, valueDefinition.field, targetNodePubkey);
                } else if (valueDefinition.map) {
                    console.log(`[Query Traversal Detail]     - Type: Target Map (on ${targetNodePubkey})`);
                    entryResult = await processMap(targetNodeDoc, valueDefinition.map, targetNodePubkey, user);
                } else if (valueDefinition.traverse) {
                    console.log(`[Query Traversal Detail]     - Type: Target Traverse (from ${targetNodePubkey})`);
                    entryResult = await processTraversal(targetNodeDoc, valueDefinition.traverse, targetNodePubkey, user);
                }
            }
            // [Logging Point 6: Result for a map entry]
            console.log(`[Query Traversal Detail]     - Result for "${outputKey}":`, entryResult);
            relatedNodeResult[outputKey] = entryResult;
        }

        if (Object.keys(relatedNodeResult).length > 0) {
            // [Logging Point 7: Pushing result for a composite]
            console.log(`[Query Traversal Detail] Pushing result for composite ${compositePubKey}:`, relatedNodeResult);
            results.push(relatedNodeResult);
            if (traverseDefinition.return === 'first') break;
        } else {
            console.log(`[Query Traversal Detail] No data mapped for composite ${compositePubKey}. Skipping.`);
        }
    }

    // [Logging Point 8: Final result of traversal]
    const finalResult = traverseDefinition.return === 'first' ? (results.length > 0 ? results[0] : null) : results;
    console.log(`[Query Traversal Detail] Final traversal result for source ${sourcePubKey}:`, finalResult);
    return finalResult;
}

/**
 * Evaluates multiple top-level where clauses against a document.
 */
function evaluateWhereClauses(doc: LoroDoc, clauses: LoroHqlWhereClause[], docPubKey: string): boolean {
    for (const clause of clauses) {
        if (!evaluateSingleWhere(doc, clause.field, clause.condition, docPubKey)) return false;
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
    if (condition.equals !== undefined && actualValue !== condition.equals) return false;
    if (condition.in !== undefined && (!Array.isArray(condition.in) || !condition.in.includes(actualValue))) return false;
    return true;
}

/**
 * Processes a 'resolve' instruction.
 */
async function processResolve(
    sourceDoc: LoroDoc,
    resolveDefinition: LoroHqlResolve,
    user: CapabilityUser | null
): Promise<QueryResult | null> {
    // [Logging Point 9: Starting Resolve]
    console.log(`[Query Resolve Detail] Starting resolve. FromField: '${resolveDefinition.fromField}'`);
    const targetPubKey = selectFieldValue(sourceDoc, resolveDefinition.fromField, "") as string | undefined; // Note: PubKey not relevant here
    console.log(`[Query Resolve Detail]   - Extracted target PubKey: ${targetPubKey}`);
    if (!targetPubKey) {
        console.log(`[Query Resolve Detail]   - No target PubKey found. Returning null.`);
        return null;
    }

    const targetType = resolveDefinition.targetType ?? 'leaf';
    let targetDoc: LoroDoc | null = null;
    let docMeta: Awaited<ReturnType<typeof import('$lib/KERNEL/hominio-db')['hominioDB']['getDocument']>> | null = null;

    // [Logging Point 10: Checking existence and fetching doc]
    console.log(`[Query Resolve Detail]   - Checking existence and fetching doc for ${targetPubKey} (type: ${targetType})`);
    try {
        let exists = false;
        if (targetType === 'gismu') {
            exists = await checkSchemaExists(targetPubKey);
        } else {
            exists = await checkLeafExists(targetPubKey);
        }
        console.log(`[Query Resolve Detail]     - Exists in index: ${exists}`);
        if (!exists) return null;

        if (targetType === 'gismu') {
            targetDoc = await getSchemaDoc(targetPubKey);
        } else {
            targetDoc = await getLeafDoc(targetPubKey);
        }
        console.log(`[Query Resolve Detail]     - Loaded doc: ${!!targetDoc}`);
        if (!targetDoc) return null;

        docMeta = await import('$lib/KERNEL/hominio-db').then(m => m.hominioDB.getDocument(targetPubKey));
        console.log(`[Query Resolve Detail]     - Loaded docMeta: ${!!docMeta}`);
        if (!docMeta) return null;

    } catch (error) { console.error(`[Query Resolve Detail] Error fetching ${targetPubKey} (type: ${targetType}):`, error); return null; }

    if (user) {
        const canUserRead = canRead(user, docMeta);
        console.log(`[Query Resolve Detail]   - Read permission check for user: ${canUserRead}`);
        if (!canUserRead) return null;
    } else {
        console.log(`[Query Resolve Detail]   - No user provided, skipping read permission check.`);
    }


    // [Logging Point 11: Processing map for resolved doc]
    console.log(`[Query Resolve Detail]   - Processing map for resolved doc ${targetPubKey}`);
    try {
        const resolvedResult = await processMap(targetDoc, resolveDefinition.map, targetPubKey, user);
        console.log(`[Query Resolve Detail]   - Map result for ${targetPubKey}:`, resolvedResult);
        return resolvedResult;
    } catch (error) { console.error(`[Query Resolve Detail] Error processing map for ${targetPubKey}:`, error); return null; }
}

/**
 * Creates a reactive query.
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
            if (!initialQuery) { set([]); return; }
            executeQuery(initialQuery, ssrUser)
                .then(results => set(results))
                .catch(err => { console.error("[SSR LoroHQL] Error:", err); set(null); });
        });
    }

    // --- Client-Side Reactive Logic --- 
    return readable<QueryResult[] | null | undefined>(undefined, (set) => {
        let debounceTimer: NodeJS.Timeout | null = null;
        const DEBOUNCE_MS = 50;
        let lastSessionState: string | null = null;
        let lastQueryDefinitionString: string | null = null;
        let currentResults: QueryResult[] | null | undefined = undefined;

        const triggerDebouncedQuery = () => {
            const currentQueryDefinition = get(queryDefinitionStore);
            const queryDefString = JSON.stringify(currentQueryDefinition);
            const queryChanged = lastQueryDefinitionString !== queryDefString;
            lastQueryDefinitionString = queryDefString;

            if (!currentQueryDefinition) {
                if (debounceTimer) clearTimeout(debounceTimer);
                if (currentResults && currentResults.length > 0) { set([]); currentResults = []; }
                else if (currentResults === undefined || currentResults === null) { set([]); currentResults = []; }
                return;
            }
            if (!queryChanged && currentResults !== undefined) return;
            if (debounceTimer) clearTimeout(debounceTimer);
            if (currentResults === undefined || queryChanged) { set(undefined); currentResults = undefined; }

            debounceTimer = setTimeout(async () => {
                const currentUser = getCurrentUserFn();
                const latestQueryDefinition = get(queryDefinitionStore);
                const latestQueryDefString = JSON.stringify(latestQueryDefinition);

                if (!latestQueryDefinition || latestQueryDefString !== lastQueryDefinitionString) return;

                try {
                    if (currentResults !== undefined) set(undefined);
                    currentResults = undefined;
                    const results = await executeQuery(latestQueryDefinition, currentUser);
                    if (JSON.stringify(get(queryDefinitionStore)) !== lastQueryDefinitionString) return;
                    set(results);
                    currentResults = results;
                } catch (error) {
                    console.error("[LoroHQL Reactive] Error:", error);
                    if (JSON.stringify(get(queryDefinitionStore)) !== lastQueryDefinitionString) return;
                    set(null);
                    currentResults = null;
                }
            }, DEBOUNCE_MS);
        };

        const unsubscribeQueryDef = queryDefinitionStore.subscribe(newQueryDef => {
            const newQueryDefString = JSON.stringify(newQueryDef);
            if (lastQueryDefinitionString !== newQueryDefString || currentResults === undefined) {
                triggerDebouncedQuery();
            }
        });

        const unsubscribeNotifier = docChangeNotifier.subscribe(() => {
            triggerDebouncedQuery();
        });

        const sessionStore = authClient.useSession();
        const unsubscribeSession = sessionStore.subscribe((session: MinimalSession) => {
            const currentSessionState = JSON.stringify(session?.data?.user?.id ?? null);
            if (lastSessionState !== null && lastSessionState !== currentSessionState) {
                triggerDebouncedQuery();
            }
            lastSessionState = currentSessionState;
        });

        const initialSessionData = get(sessionStore);
        lastSessionState = JSON.stringify(initialSessionData?.data?.user?.id ?? null);
        lastQueryDefinitionString = JSON.stringify(get(queryDefinitionStore));
        currentResults = undefined;

        if (get(queryDefinitionStore)) { triggerDebouncedQuery(); } else { set([]); currentResults = []; }

        // Restore: Add the missing cleanup function
        return () => {
            unsubscribeQueryDef();
            unsubscribeNotifier();
            unsubscribeSession();
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    });
} 