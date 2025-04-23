import type { LoroDoc } from 'loro-crdt';
import type { BridiRecord, Pubkey, SelbriId } from './db';
import {
    getSumtiDoc,
    findBridiDocsBySelbriAndPlace,
    getCkajiFromDoc,
    getDatniFromDoc,
    getPathValue
} from './loro-engine';

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
        // selbri_filter?: ... // TBD
    };
    map: LoroHqlMap;
    where?: LoroHqlWhereClause[]; // Can be multiple conditions (implicitly ANDed)
}

// Result type remains the same
export type QueryResult = Record<string, unknown>;
// Type for the possible results of a traversal operation
// Include 'unknown' to handle the direct value extraction case
type TraversalResult = QueryResult[] | QueryResult | unknown | null;

// --- Query Engine Implementation (Map-Based Syntax) ---

/**
 * Main function to execute a LORO_HQL map-based query.
 */
export async function executeQuery(query: LoroHqlQuery): Promise<QueryResult[]> {
    const results: QueryResult[] = [];

    // 1. Determine Starting Nodes
    const startPubkeys = query.from.sumti_pubkeys || [];
    if (startPubkeys.length === 0) {
        console.warn('Query requires sumti_pubkeys in "from" clause.');
        return [];
    }

    // 2. Process Each Starting Node
    for (const pubkey of startPubkeys) {
        const startDoc = getSumtiDoc(pubkey);
        if (!startDoc) {
            console.warn(`Starting Sumti with pubkey ${pubkey} not found.`);
            continue;
        }

        // 3. Apply Top-Level Where Clause(s) (if any)
        if (query.where && !evaluateWhereClauses(startDoc, query.where)) {
            continue; // Skip this starting node if it doesn't match filters
        }

        // 4. Process the Top-Level Map Clause for the Starting Node
        const nodeResult = await processMap(startDoc, query.map);
        results.push(nodeResult);
    }

    return results;
}

/**
 * Processes a `map` object for a given LoroDoc (the current context `self`).
 */
async function processMap(currentDoc: LoroDoc, mapDefinition: LoroHqlMap): Promise<QueryResult> {
    const result: QueryResult = {};
    const mapEntries = Object.entries(mapDefinition);

    for (const [outputKey, valueDefinition] of mapEntries) {
        if (valueDefinition.field) {
            // Handle direct field selection from currentDoc
            result[outputKey] = selectFieldValue(currentDoc, valueDefinition.field);
        } else if (valueDefinition.traverse) {
            // Handle traversal starting from currentDoc
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
 */
function selectFieldValue(doc: LoroDoc, fieldPath: string): unknown {
    if (!fieldPath || !fieldPath.startsWith('self.')) {
        console.warn(`Invalid field path: "${fieldPath}". Must start with "self.".`);
        return undefined;
    }

    const path = fieldPath.substring(5); // Remove "self."
    let baseObject: unknown;
    let relativePath: string;

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
        baseObject = getCkajiFromDoc(doc);
        relativePath = path;
    }

    if (!relativePath) { // Path was just "self.ckaji" or "self.datni"
        return baseObject;
    }

    // Handle special case: accessing Loro container content using 'vasru'
    // Check specifically for path starting with datni.vasru
    if (path.startsWith('datni.vasru') && typeof baseObject === 'object' && baseObject !== null && 'klesi' in baseObject && 'vasru' in baseObject) {
        const contentPath = path.substring('datni.vasru'.length + 1);
        // Use 'vasru' field name here
        const sumtiValue = baseObject as { klesi: string; vasru: unknown };
        if (!contentPath) return sumtiValue.vasru; // Return raw vasru
        // Access nested fields within vasru if needed
        return getPathValue(sumtiValue.vasru as object, contentPath);
    }

    // General nested field access
    return getPathValue(baseObject as object, relativePath);
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
    const bridiMatches = findBridiDocsBySelbriAndPlace(
        traverseDefinition.bridi_where.selbri,
        traverseDefinition.bridi_where.place,
        sourcePubkey
    );

    const results: QueryResult[] = [];

    // 2. Process each potential related node via the Bridi
    for (const bridiDoc of bridiMatches) {
        const bridiDatni = getDatniFromDoc(bridiDoc) as BridiRecord['datni'] | undefined;
        if (!bridiDatni) continue;

        // 3. Filter related nodes based on `where_related` (before mapping)
        if (traverseDefinition.where_related) {
            let passesAllFilters = true;
            for (const relatedFilter of traverseDefinition.where_related) {
                const targetNodePubkey = bridiDatni.sumti[relatedFilter.place];
                if (!targetNodePubkey) {
                    passesAllFilters = false;
                    break;
                }
                const targetNodeDoc = getSumtiDoc(targetNodePubkey);
                if (!targetNodeDoc || !evaluateSingleWhere(targetNodeDoc, relatedFilter.field, relatedFilter.condition)) {
                    passesAllFilters = false;
                    break;
                }
            }
            if (!passesAllFilters) {
                continue;
            }
        }

        // 4. Map the related nodes defined in `traverseDefinition.map`
        // This map defines the structure for ONE related entity object generated from this Bridi link
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

            // For now, assume traversal targets are Sumti. Extend later if needed.
            const targetNodeDoc = getSumtiDoc(targetNodePubkey);
            if (!targetNodeDoc) {
                relatedNodeResult[outputKey] = null;
                continue;
            }

            // Determine the value based on the definition type for the target node
            if (valueDefinition.field) {
                // Get a specific field from the target node
                relatedNodeResult[outputKey] = selectFieldValue(targetNodeDoc, valueDefinition.field);
            } else if (valueDefinition.map) {
                // Apply a nested map to the target node
                relatedNodeResult[outputKey] = await processMap(targetNodeDoc, valueDefinition.map);
            } else if (valueDefinition.traverse) {
                // Start a new traversal from the target node
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
function evaluateWhereClauses(doc: LoroDoc, clauses: LoroHqlWhereClause[]): boolean {
    for (const clause of clauses) {
        if (!evaluateSingleWhere(doc, clause.field, clause.condition)) {
            return false; // If any clause fails, the whole condition fails
        }
    }
    return true; // All clauses passed
}

/**
 * Evaluates a single filter condition against a document.
 */
function evaluateSingleWhere(doc: LoroDoc, fieldPath: string, condition: LoroHqlCondition): boolean {
    const actualValue = selectFieldValue(doc, fieldPath);

    if (condition.equals !== undefined && actualValue !== condition.equals) {
        return false;
    }
    if (condition.in !== undefined) {
        if (!Array.isArray(condition.in) || !condition.in.includes(actualValue)) {
            return false;
        }
    }
    // Add checks for other conditions (contains, gt, lt) here

    return true; // Condition passed
} 