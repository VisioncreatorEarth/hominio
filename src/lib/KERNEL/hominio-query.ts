import { LoroDoc } from 'loro-crdt';
import {
    getLeafDoc,
    getSchemaDoc,
    getCompositeDoc,
    findCompositeDocsBySchemaAndPlace,
    getDataFromDoc,
} from './loro-engine';
import { canRead, type CapabilityUser } from '$lib/KERNEL/hominio-caps';
import { docChangeNotifier, hominioDB } from '$lib/KERNEL/hominio-db';
import { readable, type Readable, get } from 'svelte/store';
import { authClient, type getMe as getMeType } from '$lib/KERNEL/hominio-auth';
import { browser } from '$app/environment';
import { getIndexLeafPubKey } from './index-registry';

// FIX: Export PlaceKey
export type PlaceKey = 'x1' | 'x2' | 'x3' | 'x4' | 'x5';

// Refined: Defines how to get a value for an output property
interface LoroHqlMapValue {
    field?: string;      // Option 1: Direct field access (e.g., "self.metadata.type", "self.data.value")
    variable?: string; // Option 2: Reference a variable from context
    literal?: unknown; // Option 3: Use a literal value
}

// Defines the output structure (used in select step)
// interface LoroHqlMap {
//     [outputKey: string]: LoroHqlMapValue;
// }

// Filter condition
// interface LoroHqlCondition { ... }

// Top-level filter for starting nodes
// interface LoroHqlWhereClause { ... }

// Filter applied to related nodes during traversal
// interface LoroHqlWhereRelatedClause { ... }

// Defines a traversal step
// interface LoroHqlTraverse { ... } // REMOVED

// Resolve definition
// interface LoroHqlResolve { ... } // REMOVED

// Top-level Query Structure
// interface LoroHqlQuery { ... }

// --- NEW Steps-Based Query Engine Types ---

// --- Utility Types ---
// Define QueryContext to hold variables between steps
export type QueryContext = Record<string, unknown>;

// Define StepResultItem for arrays produced by find/get steps
export interface StepResultItem {
    _sourceKey?: unknown; // Key linking back to the source (e.g., pubkey from 'from', or index in source array)
    variables: Record<string, unknown>; // Extracted variables for this item
    // primaryResult?: unknown; // Optional: The main document or composite link object itself?
}

// Define possible step actions
type HqlStepAction = 'find' | 'get' | 'select' | 'setVar'; // Added setVar for initial inputs

// Base interface for a query step
interface LoroHqlStepBase {
    action: HqlStepAction;
    // Optional: Name to store the result(s) of this step for later reference in the context
    resultVariable?: string;
}

// Step to set initial variables from literals
interface LoroHqlSetVarStep extends LoroHqlStepBase {
    action: 'setVar';
    variables: {
        [varName: string]: { literal: unknown }; // Define variables with literal values
    };
    resultVariable?: undefined; // setVar doesn't produce a primary output array
}

// Find composites/links based on schema and place values (potentially variables)
interface LoroHqlFindStep extends LoroHqlStepBase {
    action: 'find';
    target: {
        schema: string | { variable: string }; // Schema pubkey (literal or variable reference)
        // Specific places to match (can be literals or variables)
        x1?: string | { variable: string };
        x2?: string | { variable: string };
        x3?: string | { variable: string };
        x4?: string | { variable: string };
        x5?: string | { variable: string };
        // OR generic place matching
        place?: '*'; // Indicate wildcard place
        value?: string | { variable: string }; // The value (e.g., leaf pubkey) to find in the wildcard place
        // OR index matching
        // index?: string; // Name of an index
        // indexKey?: string | { variable: string };
    };
    // Define variables to extract from the found composite(s)
    variables?: { // Made optional
        [varName: string]: { source: 'link.x1' | 'link.x2' | 'link.x3' | 'link.x4' | 'link.x5' | 'link.pubkey' | 'link.schemaId' };
    };
    return?: 'first' | 'array'; // How many composites to process
}

// Get details from specific documents (identified by variables)
interface LoroHqlGetStep extends LoroHqlStepBase {
    action: 'get';
    from: { variable: string, sourceKey?: string, targetDocType?: 'Leaf' | 'Schema' | 'Composite' } // Add targetDocType
    | { pubkey: string | string[] }
    | { type: 'Leaf' | 'Schema' | 'Composite' }; // Allow getting by variable, direct pubkey(s), or all of type
    // Define fields to extract into the step's result (and potentially new variables)
    fields: {
        [outputName: string]: { field: string }; // e.g., { field: 'self.data.value' } or { field: 'doc.pubkey' }
    };
    // Optionally define new variables based on the extracted fields
    variables?: {
        [varName: string]: { source: string }; // e.g., { source: 'result.value' } or { source: 'result.id' }
    };
    return?: 'first' | 'array'; // Handle multiple inputs/outputs
}

// Select and structure the final output from context variables
interface LoroHqlSelectStep extends LoroHqlStepBase {
    action: 'select';
    // Define how to combine variables from context into the final result structure
    // Requires careful design for joining/mapping results from different steps.
    select: {
        [outputKey: string]: LoroHqlMapValue; // Use LoroHqlMapValue which includes variable/literal
    };
    // Explicitly define how to group/correlate results if needed
    // Option 1: Group by a variable value
    groupBy?: string; // Variable name (e.g., 'taskVar')
    // Option 2: Define explicit join conditions
    // join?: { on: string; sources: string[]; type: 'inner' | 'left' }; // More complex
    resultVariable?: undefined; // Select is terminal
}

// Union type for any step
type LoroHqlStep = LoroHqlSetVarStep | LoroHqlFindStep | LoroHqlGetStep | LoroHqlSelectStep; // Added LoroHqlSetVarStep

// Redefined top-level query using steps
export interface LoroHqlQueryExtended {
    steps: LoroHqlStep[];
}

// --- END NEW Steps-Based Query Engine Types ---

// Result type
export type QueryResult = Record<string, unknown>;
// type TraversalResult = QueryResult[] | QueryResult | unknown | null; // REMOVED unused old type

// Minimal session type needed for reactive query
type MinimalSession = {
    data?: {
        user?: {
            id?: string | null;
        } | null;
    } | null;
} | null;

// --- Query Engine Implementation ---

/**
 * Selects a field value from a LoroDoc or a plain JS object based on a path string.
 * Paths like "doc.pubkey" require the pubkey to be passed explicitly.
 * Paths like "self.data..." or "self.metadata..." operate on the doc/object.
 * Paths like "link.x1" operate on a composite link object.
 * Paths like "result.fieldName" operate on an intermediate result object.
 */
function selectFieldValue(
    source: LoroDoc | Record<string, unknown> | null | undefined,
    fieldPath: string,
    docPubKey?: string // Optional: Needed for "doc.pubkey"
): unknown {
    if (!source) return undefined;

    if (fieldPath === 'doc.pubkey') return docPubKey;

    // Handle direct access on non-LoroDoc objects (like intermediate results or composite links)
    if (!(source instanceof LoroDoc)) {
        const pathParts = fieldPath.split('.');
        let currentValue: unknown = source;
        for (const part of pathParts) {
            if (currentValue === undefined || currentValue === null) return undefined;
            if (typeof currentValue === 'object' && currentValue !== null) {
                currentValue = (currentValue as Record<string, unknown>)[part];
            } else {
                return undefined; // Cannot access property on non-object
            }
        }
        return currentValue;
    }

    // Handle LoroDoc access
    if (!fieldPath.startsWith('self.')) {
        console.warn(`[selectFieldValue] Invalid field path for LoroDoc: "${fieldPath}". Must start with "self." or be "doc.pubkey".`);
        return undefined;
    }

    const path = fieldPath.substring(5);
    let baseObject: unknown;
    let relativePath: string;

    if (path.startsWith('metadata.')) {
        baseObject = source.getMap('metadata')?.toJSON();
        relativePath = path.substring(9);
    } else if (path.startsWith('data.')) {
        baseObject = getDataFromDoc(source); // Assumes getDataFromDoc handles Loro types correctly
        relativePath = path.substring(5);
    } else if (path === 'metadata') {
        baseObject = source.getMap('metadata')?.toJSON();
        relativePath = '';
    } else if (path === 'data') {
        baseObject = getDataFromDoc(source);
        relativePath = '';
    } else {
        // Default to accessing metadata if no prefix?
        console.warn(`[selectFieldValue] Ambiguous path for LoroDoc: "${fieldPath}". Assuming metadata access.`);
        baseObject = source.getMap('metadata')?.toJSON();
        relativePath = path;
    }

    if (baseObject === undefined || baseObject === null) return undefined;

    if (!relativePath) { // Path was just 'self.metadata' or 'self.data'
        return baseObject;
    }

    const pathParts = relativePath.split('.');
    let currentValue: unknown = baseObject;

    for (const part of pathParts) {
        if (currentValue === undefined || currentValue === null) return undefined;

        // Handle nested access within plain JS objects returned by toJSON() or getDataFromDoc()
        if (typeof currentValue === 'object' && currentValue !== null) {
            currentValue = (currentValue as Record<string, unknown>)[part];
        } else {
            return undefined; // Cannot access property on primitive
        }
    }

    return currentValue;
}

// Helper to resolve a variable reference or return a literal
function resolveValue(value: string | { variable: string } | undefined, context: QueryContext): string | undefined {
    if (typeof value === 'object' && value !== null && 'variable' in value && value.variable) {
        const resolved = context[value.variable];
        return typeof resolved === 'string' ? resolved : undefined;
    } else if (typeof value === 'string') {
        return value;
    }
    return undefined; // Return undefined if value is undefined or invalid format
}

// Helper function for processing a find step
async function processFindStep(
    step: LoroHqlFindStep,
    context: QueryContext
): Promise<QueryContext> {
    console.log(`[Query Engine] Processing FIND step: Target=${JSON.stringify(step.target)}`);
    const updatedContext = { ...context };
    const stepResults: StepResultItem[] = [];

    const schemaId = resolveValue(step.target.schema, context);
    if (!schemaId) {
        throw new Error(`Find step failed: Schema ID is required and could not be resolved.`);
    }

    let foundComposites: { pubkey: string; doc: LoroDoc }[] = [];

    // --- Determine Find Strategy --- 
    if (step.target.place === '*' && step.target.value) {
        // Wildcard place find (potentially slow)
        console.warn("[Query Engine] Find step using wildcard place is not optimized yet.");
        const targetValue = resolveValue(step.target.value, context);
        if (!targetValue) throw new Error("Find step failed: Value required for wildcard place find.");
        // TODO: Implement wildcard find (e.g., iterate all composites or use a dedicated index)
    } else if (step.target.x1 || step.target.x2 || step.target.x3 || step.target.x4 || step.target.x5) {
        // Specific place find
        const placeKey = (Object.keys(step.target).find(k => k.startsWith('x') && step.target[k as PlaceKey]) as PlaceKey | undefined);
        const placeValue = placeKey ? resolveValue(step.target[placeKey], context) : undefined;
        if (placeKey && placeValue) {
            console.log(`[Query Engine] Finding composites by schema '${schemaId}' and place '${placeKey}'='${placeValue}'`);
            foundComposites = await findCompositeDocsBySchemaAndPlace(schemaId, placeKey, placeValue);
        } else {
            // A place key (x1-x5) was specified in the query, but its value couldn't be resolved.
            // This implies an intentional filter for a specific place that resolved to undefined/null.
            // So, we should find nothing in this case.
            console.warn(`[Query Engine] Find step specified place '${placeKey}' but value resolved to undefined/null. Finding 0 items.`);
            foundComposites = [];
        }

    } else {
        // --- Find by schema only (IMPLEMENTED) --- 
        console.log(`[Query Engine] Finding all composites with schema '${schemaId}'...`);
        const compositesIndexKey = await getIndexLeafPubKey('composites');
        if (!compositesIndexKey) {
            throw new Error("Find step failed: Could not find pubkey for 'composites' index leaf.");
        }
        const indexDoc = await getLeafDoc(compositesIndexKey);
        if (!indexDoc) {
            throw new Error(`Find step failed: Could not load 'composites' index document (${compositesIndexKey}).`);
        }
        const indexData = getDataFromDoc(indexDoc) as { value: Record<string, true> } | undefined;
        if (!indexData || typeof indexData.value !== 'object' || indexData.value === null) {
            throw new Error(`Find step failed: 'composites' index document (${compositesIndexKey}) has invalid data format. Expected object with a 'value' map.`);
        }

        const allCompositePubKeys = Object.keys(indexData.value);
        console.log(`[Query Engine] Found ${allCompositePubKeys.length} total composites in index. Filtering by schema...`);
        const matchingComposites: { pubkey: string; doc: LoroDoc }[] = [];

        for (const compPubKey of allCompositePubKeys) {
            try {
                const compDoc = await hominioDB.getLoroDoc(compPubKey);
                if (!compDoc) {
                    console.warn(`[Query Engine] Find by schema: Could not load composite doc ${compPubKey}. Skipping.`);
                    continue;
                }
                const compData = getDataFromDoc(compDoc) as { schemaId: string; places: Record<PlaceKey, string> } | undefined;
                if (compData?.schemaId === schemaId) {
                    matchingComposites.push({ pubkey: compPubKey, doc: compDoc });
                }
            } catch (loadError) {
                console.warn(`[Query Engine] Find by schema: Error loading composite doc ${compPubKey}:`, loadError);
            }
        }
        foundComposites = matchingComposites;
        console.log(`[Query Engine] Found ${foundComposites.length} composites matching schema '${schemaId}'.`);
    }

    // --- Extract Variables --- 
    for (const composite of foundComposites) {
        const compositePubKey = composite.pubkey;
        const compositeData = getDataFromDoc(composite.doc) as { schemaId: string; places: Record<PlaceKey, string> } | undefined;
        if (!compositeData) continue;

        const extractedVars: Record<string, unknown> = {};
        if (step.variables) {
            for (const [varName, sourceDef] of Object.entries(step.variables)) {
                if (sourceDef.source === 'link.pubkey') {
                    extractedVars[varName] = compositePubKey;
                } else if (sourceDef.source === 'link.schemaId') {
                    extractedVars[varName] = compositeData.schemaId;
                } else if (sourceDef.source.startsWith('link.x')) {
                    const place = sourceDef.source.substring(5) as PlaceKey;
                    extractedVars[varName] = compositeData.places?.[place];
                }
            }
        }
        stepResults.push({ _sourceKey: compositePubKey, variables: extractedVars });

        // Also add extracted variables directly to the main context, potentially prefixed?
        // This makes them easily accessible for subsequent steps without knowing the resultVariable.
        // Needs careful design to avoid clashes and handle arrays.
        // Example: updatedContext[`${step.resultVariable ?? 'find'}_${compositePubKey}_${varName}`] = extractedVars[varName];
        // For now, rely on processing stepResults in the 'select' step.
    }

    if (step.resultVariable) {
        updatedContext[step.resultVariable] = step.return === 'first' ? (stepResults[0] ?? null) : stepResults;
    }

    console.log(`[Query Engine] FIND step finished. Found ${stepResults.length} items.`);
    return updatedContext;
}

// Helper function for processing a get step
async function processGetStep(
    step: LoroHqlGetStep,
    context: QueryContext,
    user: CapabilityUser | null
): Promise<QueryContext> {
    console.log(`[Query Engine] Processing GET step: From=${JSON.stringify(step.from)}`);
    const updatedContext = { ...context };
    const stepResults: StepResultItem[] = [];
    let pubKeysToFetch: string[] = [];
    let sourceType: 'Leaf' | 'Schema' | 'Composite' | null = null;

    // --- Determine PubKeys to Fetch --- 
    if ('variable' in step.from) {
        const sourceData = context[step.from.variable];
        const sourceKey = step.from.sourceKey; // Get the optional sourceKey
        console.log(`[Query Engine] GET step: Fetching from variable '${step.from.variable}'${sourceKey ? ` using sourceKey '${sourceKey}'` : ''}`);

        // FIX: Type check sourceData more carefully and use sourceKey if provided
        if (Array.isArray(sourceData)) {
            pubKeysToFetch = sourceData
                .map(item => {
                    if (typeof item !== 'object' || item === null) return null; // Skip non-objects

                    let pubkey: string | undefined | null = null;

                    // 1. If sourceKey is provided, prioritize extracting from item.variables[sourceKey]
                    if (sourceKey && 'variables' in item && typeof item.variables === 'object' && item.variables !== null) {
                        const potentialPubkey = (item.variables as Record<string, unknown>)[sourceKey];
                        if (typeof potentialPubkey === 'string') {
                            pubkey = potentialPubkey;
                        }
                    }

                    // 2. If pubkey still not found, try previous logic (item.variables.pubkey or item.pubkey)
                    if (!pubkey) {
                        if ('variables' in item && typeof item.variables === 'object' && item.variables !== null && typeof (item.variables as Record<string, unknown>).pubkey === 'string') {
                            pubkey = (item.variables as { pubkey: string }).pubkey;
                        } else if (typeof (item as Record<string, unknown>)?.pubkey === 'string') {
                            pubkey = (item as { pubkey: string }).pubkey;
                        } else if (typeof item === 'string') { // Check if item itself is a pubkey string
                            pubkey = item;
                        }
                    }

                    return pubkey;
                })
                .filter((pubkey): pubkey is string => typeof pubkey === 'string' && pubkey !== ''); // Ensure not null/empty

        } else if (typeof sourceData === 'object' && sourceData !== null) {
            let pubkey: string | undefined | null = null;
            // Similar logic for single object case
            if (sourceKey && 'variables' in sourceData && typeof sourceData.variables === 'object' && sourceData.variables !== null) {
                const potentialPubkey = (sourceData.variables as Record<string, unknown>)[sourceKey];
                if (typeof potentialPubkey === 'string') {
                    pubkey = potentialPubkey;
                }
            }
            if (!pubkey) {
                if ('variables' in sourceData && typeof sourceData.variables === 'object' && sourceData.variables !== null && typeof (sourceData.variables as Record<string, unknown>).pubkey === 'string') {
                    pubkey = (sourceData.variables as { pubkey: string }).pubkey;
                } else if (typeof (sourceData as Record<string, unknown>)?.pubkey === 'string') {
                    pubkey = (sourceData as { pubkey: string }).pubkey;
                } else if (typeof sourceData === 'string') {
                    pubkey = sourceData;
                }
            }

            if (typeof pubkey === 'string' && pubkey !== '') {
                pubKeysToFetch = [pubkey];
            } else {
                console.warn(`[Query Engine] GET step: Variable '${step.from.variable}' contains single object without identifiable pubkey${sourceKey ? ` using sourceKey '${sourceKey}'` : ''}:`, sourceData);
            }
        } else if (typeof sourceData === 'string') { // Check if sourceData itself is a pubkey
            pubKeysToFetch = [sourceData];
        } else {
            console.warn(`[Query Engine] GET step: Variable '${step.from.variable}' contains unexpected data type:`, sourceData);
        }
    } else if ('pubkey' in step.from) {
        pubKeysToFetch = Array.isArray(step.from.pubkey) ? step.from.pubkey : [step.from.pubkey];
    } else if ('type' in step.from) {
        // FIX: Remove unimplemented getAllDocsOfType logic
        sourceType = step.from.type;
        console.error(`[Query Engine] GET step 'by type' (${sourceType}) is not implemented. Use FIND steps with index lookups instead.`);
        throw new Error(`Get step failed: Cannot fetch all docs of type ${sourceType}. Feature not implemented.`);
        // try {
        //     pubKeysToFetch = await getAllDocsOfType(sourceType);
        // } catch (e) { throw new Error(`Get step failed: Could not fetch all docs of type ${sourceType}. ${e}`); }
    }

    if (pubKeysToFetch.length === 0) {
        console.log("[Query Engine] GET step: No pubkeys to fetch.");
        if (step.resultVariable) updatedContext[step.resultVariable] = step.return === 'first' ? null : []; // Set to null or empty array
        return updatedContext;
    }

    // --- Fetch Documents and Extract Data --- 
    for (const pubKey of pubKeysToFetch) {
        if (!pubKey) continue; // Skip null/empty pubkeys
        let doc: LoroDoc | null = null;
        try {
            // Determine document type if not explicitly given
            // Use targetDocType from the step definition if available
            const docType = sourceType ?? ('targetDocType' in step.from ? step.from.targetDocType : null);

            if (!docType) {
                // TODO: Could potentially try fetching metadata here to determine type, but adds overhead.
                console.error(`[Query Engine] GET step: Document type cannot be determined for pubkey ${pubKey}. Specify type in 'from.type' or 'from.targetDocType'.`);
                throw new Error(`Cannot determine document type for GET operation on pubkey ${pubKey}`);
            }

            console.log(`[Query Engine] GET step: Fetching pubkey ${pubKey} as type ${docType}`); // Log determined type

            // Fetch based on type
            if (docType === 'Leaf') doc = await getLeafDoc(pubKey);
            else if (docType === 'Schema') doc = await getSchemaDoc(pubKey);
            else if (docType === 'Composite') doc = await getCompositeDoc(pubKey);
            else {
                console.warn(`[Query Engine] GET step: Unsupported document type ${docType} for pubkey ${pubKey}`);
                continue; // Skip unsupported types
            }

            if (!doc) {
                console.warn(`[Query Engine] GET step: Failed to load doc for pubkey ${pubKey} (type: ${docType})`);
                continue; // Skip if doc fetch fails
            }

            // Permission Check (Requires fetching metadata - potential optimization needed)
            const docMeta = await import('$lib/KERNEL/hominio-db').then(m => m.hominioDB.getDocument(pubKey));
            if (docMeta && !canRead(user, docMeta)) {
                console.log(`[Query Engine] GET step: Permission denied for ${pubKey}.`);
                continue; // Skip documents user cannot read
            }

            // Extract fields
            const extractedFields: QueryResult = {};
            for (const [outputName, fieldDef] of Object.entries(step.fields)) {
                extractedFields[outputName] = selectFieldValue(doc, fieldDef.field, pubKey);
            }

            // Extract variables
            const extractedVars: Record<string, unknown> = {};
            if (step.variables) {
                for (const [varName, sourceDef] of Object.entries(step.variables)) {
                    // Assuming source like 'result.fieldName' refers to extractedFields
                    if (sourceDef.source.startsWith('result.')) {
                        const fieldName = sourceDef.source.substring(7);
                        extractedVars[varName] = extractedFields[fieldName];
                    } else {
                        // Allow selecting directly from doc as well?
                        extractedVars[varName] = selectFieldValue(doc, sourceDef.source, pubKey);
                    }
                }
            }

            // Combine fields and variables for the step result item
            // Store under _sourceKey for potential correlation later
            stepResults.push({ _sourceKey: pubKey, variables: { ...extractedFields, ...extractedVars } });

        } catch (err) {
            console.error(`[Query Engine] GET step: Error processing pubkey ${pubKey}:`, err);
            // Optionally skip or halt based on error strategy
        }
    }

    if (step.resultVariable) {
        updatedContext[step.resultVariable] = step.return === 'first' ? (stepResults[0] ?? null) : stepResults;
    }
    console.log(`[Query Engine] GET step finished. Processed ${stepResults.length} items.`);
    return updatedContext;
}

// Helper function for processing a select step
async function processSelectStep(
    step: LoroHqlSelectStep,
    context: QueryContext // Use defined type
    // REMOVED unused _user parameter
): Promise<QueryResult[]> {
    console.log(`[Query Engine] Processing SELECT step: GroupBy=${step.groupBy}, Select=${JSON.stringify(step.select)}`);
    const finalResults: QueryResult[] = [];

    if (!step.groupBy) {
        // Simple select - assumes context holds a single result object or requires iterating a specific variable?
        console.warn("Simple SELECT step (no groupBy) needs clear definition on what context variable to use.");
        // Example: Assume a single result object in context under a known key like 'finalData'?
        // Or iterate over the result of the *last* step that set resultVariable?
        // For now, return context as a single item for debugging.
        return [context as QueryResult];
    }

    // --- Grouping Logic --- 
    const groupByVar = step.groupBy;
    // Find the context variable that contains the array defining the groups
    // This needs a clear rule - e.g., assume it's the resultVariable of the first step?
    // Or maybe the step explicitly names the sourceVariable?

    // Find a context entry that is an array of StepResultItem
    let sourceArray: StepResultItem[] | null = null; // Use defined type
    let sourceVarName: string | null = null;
    for (const [key, value] of Object.entries(context)) {
        // Check if it's an array of potential StepResultItems
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'variables' in value[0]) {
            const potentialSourceArray = value as StepResultItem[]; // Tentative cast
            // Check if items in this array actually have the groupBy variable
            if (potentialSourceArray.some(item => typeof item === 'object' && item !== null && 'variables' in item && groupByVar in item.variables)) {
                sourceArray = potentialSourceArray;
                sourceVarName = key;
                break;
            }
        }
    }


    if (!sourceArray || !sourceVarName) {
        console.error(`[Query Engine] SELECT step failed: Could not find source array in context containing groupBy variable '${groupByVar}'. Context:`, JSON.stringify(context));
        return [];
    }
    console.log(`[Query Engine] SELECT: Grouping based on variable '${groupByVar}' found in context.'${sourceVarName}'.`);

    // Build groups Map<groupKey, correlatedContext>
    const groupedData = new Map<unknown, QueryContext>(); // Use defined type

    // 1. Initialize groups from the source array
    for (const item of sourceArray) {
        // Ensure item is a valid StepResultItem before accessing variables
        if (typeof item !== 'object' || item === null || !('variables' in item)) continue;

        const groupKey = item.variables[groupByVar];
        if (groupKey === undefined) continue; // Skip items without the group key

        if (!groupedData.has(groupKey)) {
            groupedData.set(groupKey, {}); // Initialize group context
        }
        const groupContext = groupedData.get(groupKey)!;
        // Add variables from this source item to the group context, prefixed with sourceVarName
        for (const [varName, varValue] of Object.entries(item.variables)) {
            groupContext[`${sourceVarName}_${varName}`] = varValue;
            // Also add the groupBy variable without prefix for easy access
            if (varName === groupByVar) {
                groupContext[varName] = varValue;
            }
        }
        // Store the raw source item itself? Might be useful but increases context size.
        // groupContext[sourceVarName] = item; 
    }

    // 2. Correlate data from OTHER context arrays and FLATTEN relevant fields
    // Find potential data arrays in the context (hardcoded for now, needs generalization)
    const statusDetailsArray = context['statusDetails'] as StepResultItem[] | undefined;
    const entityNameLinksArray = context['entityNameLinks'] as StepResultItem[] | undefined;
    const nameDetailsArray = context['nameDetails'] as StepResultItem[] | undefined;

    // --- Log the content of the arrays being searched --- 
    console.log(`[Query Engine] SELECT Correlate: statusDetailsArray content:`, JSON.stringify(statusDetailsArray));
    console.log(`[Query Engine] SELECT Correlate: nameDetailsArray content:`, JSON.stringify(nameDetailsArray));
    // --------------------------------------------------

    // Iterate through each initialized group
    for (const [groupKey, groupContext] of groupedData.entries()) {
        console.log(`[Query Engine] SELECT Correlate: Processing groupKey (taskVar): ${groupKey}`); // Log group key

        // --- Correlate Status --- 
        const targetStatusLeafVar = groupContext[`${sourceVarName}_statusLeafVar`];
        console.log(`[Query Engine] SELECT Correlate: Target statusLeafVar: ${targetStatusLeafVar}`); // Log target status leaf
        if (statusDetailsArray && targetStatusLeafVar) { // Check target exists
            const statusItem = statusDetailsArray.find(item =>
                item._sourceKey === targetStatusLeafVar
            );
            console.log(`[Query Engine] SELECT Correlate: Found statusItem by _sourceKey: ${JSON.stringify(statusItem?.variables)}`); // Log found status item
            if (statusItem && statusItem.variables?.statusValue !== undefined) {
                groupContext['status'] = statusItem.variables.statusValue; // Flatten directly
                console.log(`[Query Engine] SELECT Correlate: Flattened status: ${groupContext['status']}`); // Log flattened value
            } else {
                console.log(`[Query Engine] SELECT Correlate: Could not flatten status.`);
            }
        } else {
            console.log(`[Query Engine] SELECT Correlate: Skipping status (missing statusDetailsArray or targetStatusLeafVar)`);
        }

        // --- Correlate Name (Multi-step) --- 
        console.log(`[Query Engine] SELECT Correlate: Finding entityLink for groupKey: ${groupKey}`);
        if (entityNameLinksArray && nameDetailsArray) {
            // a) Find the entityNameLink for this groupKey (taskVar)
            const entityLinkItem = entityNameLinksArray.find(item =>
                item.variables?.entityVar === groupKey
            );
            console.log(`[Query Engine] SELECT Correlate: Found entityLinkItem: ${JSON.stringify(entityLinkItem?.variables)}`); // Log found link item
            if (entityLinkItem && entityLinkItem.variables?.nameLeafVar) {
                const targetNameLeafVar = entityLinkItem.variables.nameLeafVar;
                console.log(`[Query Engine] SELECT Correlate: Target nameLeafVar: ${targetNameLeafVar}`); // Log target name leaf
                // b) Find the nameDetail using the nameLeafVar from the link
                const nameItem = nameDetailsArray.find(item =>
                    item._sourceKey === targetNameLeafVar
                );
                console.log(`[Query Engine] SELECT Correlate: Found nameItem by _sourceKey: ${JSON.stringify(nameItem?.variables)}`); // Log found name item
                if (nameItem && nameItem.variables?.nameValue !== undefined) {
                    groupContext['name'] = nameItem.variables.nameValue; // Flatten directly
                    console.log(`[Query Engine] SELECT Correlate: Flattened name: ${groupContext['name']}`); // Log flattened value
                } else {
                    console.log(`[Query Engine] SELECT Correlate: Could not flatten name.`);
                }
            } else {
                console.log(`[Query Engine] SELECT Correlate: Skipping name correlation step b (missing entityLinkItem or targetNameLeafVar)`);
            }
        } else {
            console.log(`[Query Engine] SELECT Correlate: Skipping name correlation (missing entityNameLinksArray or nameDetailsArray)`);
        }

        // TODO: Generalize this correlation logic beyond hardcoded variable names
    }


    // 3. Construct final results from grouped and flattened data
    for (const [groupKey, groupContext] of groupedData.entries()) {
        const resultItem: QueryResult = {};
        console.log(`[Query Engine] SELECT: Processing group key:`, groupKey);
        // console.log(`[Query Engine] SELECT: Group context:`, groupContext);

        for (const [outputKey, valueDef] of Object.entries(step.select)) {
            if (typeof valueDef === 'object' && valueDef !== null) {
                // Resolve variable: Now expects flattened names like 'status', 'name', or prefixed like 'taskStatusLinks_statusLeafVar'
                if ('variable' in valueDef && typeof valueDef.variable === 'string') {
                    const varName = valueDef.variable;
                    // Direct access on the potentially flattened groupContext
                    resultItem[outputKey] = groupContext[varName];
                } else if ('literal' in valueDef) {
                    resultItem[outputKey] = valueDef.literal;
                } else if ('field' in valueDef && typeof valueDef.field === 'string') {
                    // Field access remains difficult without storing the original documents in context.
                    console.warn(`[Query Engine] SELECT: Direct 'field' usage in select step remains problematic.`);
                    // const sourceItem = groupContext[sourceVarName!] as StepResultItem | undefined; 
                    // ... lookup logic ...
                } else {
                    console.warn(`[Query Engine] SELECT: Unsupported value definition for key '${outputKey}':`, valueDef);
                }
            } else {
                console.warn(`[Query Engine] SELECT: Invalid value definition for key '${outputKey}':`, valueDef);
            }
        }
        finalResults.push(resultItem);
    }

    console.log(`[Query Engine] SELECT step finished. Produced ${finalResults.length} results.`);
    return finalResults;
}


/**
 * Main function to execute a LORO_HQL steps-based query.
 */
export async function executeQuery(
    query: LoroHqlQueryExtended, // Only accept the new steps-based format
    user: CapabilityUser | null = null
): Promise<QueryResult[]> {
    console.log(`[Query Engine] Executing STEPS-based query`);
    let context: QueryContext = {}; // Use defined type
    let finalResults: QueryResult[] = [];

    // Check if the query object and steps array are valid
    if (!query || typeof query !== 'object' || !Array.isArray(query.steps)) {
        console.error("[Query Engine] Invalid query format provided. Expected LoroHqlQueryExtended with a steps array.", query);
        throw new Error("Invalid query format: Expected object with a steps array.");
    }

    try {
        for (const step of query.steps) {
            console.log(`[Query Engine] --- Starting Step: ${step.action} ---`);
            // Use a temporary context for the step to potentially isolate errors?
            // Or modify context directly and rely on overall try/catch?
            // For simplicity, modify context directly for now.

            switch (step.action) {
                case 'setVar': { // Handle setting initial variables - Add braces for scope
                    // FIX: Type assertion for step and check literal definition
                    const setVarStep = step as LoroHqlSetVarStep;
                    if (setVarStep.variables && typeof setVarStep.variables === 'object') {
                        for (const [varName, varDef] of Object.entries(setVarStep.variables)) {
                            // Check if varDef has the literal property
                            if (typeof varDef === 'object' && varDef !== null && 'literal' in varDef) {
                                context[varName] = varDef.literal;
                            } else {
                                console.warn(`[Query Engine] SetVar step: Invalid definition for variable '${varName}'. Missing 'literal'.`);
                            }
                        }
                    }
                    console.log("[Query Engine] SetVar step completed. Context:", context);
                    break;
                }
                case 'find':
                    context = await processFindStep(step as LoroHqlFindStep, context);
                    break;
                case 'get':
                    context = await processGetStep(step as LoroHqlGetStep, context, user);
                    break;
                case 'select':
                    finalResults = await processSelectStep(step as LoroHqlSelectStep, context);
                    // Select is considered terminal for now
                    console.log("[Query Engine] Select step completed. Final results generated.");
                    // Optional: break or return immediately after select?
                    return finalResults; // Assuming select is always last for now
                default: {
                    const unknownAction = (step as LoroHqlStepBase)?.action ?? 'unknown';
                    console.error(`[Query Engine] Unsupported step action encountered: ${unknownAction}`);
                    throw new Error(`Unsupported step action: ${unknownAction}`);
                }
            }
            console.log(`[Query Engine] --- Finished Step: ${step.action}. Context Keys:`, Object.keys(context)); // Log context keys for brevity

        }
        console.log(`[Query Engine] STEPS execution finished. No terminal 'select' step found? Returning empty results.`);
        // If loop finishes without a select step, what should happen?
        return finalResults; // Might be empty if no select step ran

    } catch (error) {
        console.error("[Query Engine] Error during STEPS execution:", error);
        // Return empty array on error
        return [];
    }
}

// --- Removed Old Helper Functions ---

/**
 * Creates a reactive query.
 * TODO: Update this function to work reliably with the new LoroHqlQueryExtended format.
 * The current implementation might work if executeQuery handles the new format,
 * but the queryDefinitionStore type needs to be updated.
 */
export function processReactiveQuery(
    getCurrentUserFn: typeof getMeType,
    queryDefinitionStore: Readable<LoroHqlQueryExtended | null> // Updated to expect only new format
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
            // Ensure we only proceed if the definition is valid (has steps)
            if (!currentQueryDefinition || !Array.isArray(currentQueryDefinition.steps)) {
                console.log("[Reactive Query] Skipping execution: Query definition is null or invalid.");
                if (debounceTimer) clearTimeout(debounceTimer); debounceTimer = null;
                if (currentResults !== undefined && currentResults !== null && currentResults.length > 0) {
                    set([]);
                    currentResults = [];
                } else if (currentResults === undefined) {
                    set([]); // Set to empty array if loading was interrupted by invalid query
                    currentResults = [];
                }
                lastQueryDefinitionString = JSON.stringify(currentQueryDefinition); // Still update last string
                return;
            }

            const queryDefString = JSON.stringify(currentQueryDefinition);
            const queryChanged = lastQueryDefinitionString !== queryDefString;
            lastQueryDefinitionString = queryDefString;

            // if (!currentQueryDefinition) { // Check moved above
            //     if (debounceTimer) clearTimeout(debounceTimer);
            //     if (currentResults && currentResults.length > 0) { set([]); currentResults = []; }
            //     else if (currentResults === undefined || currentResults === null) { set([]); currentResults = []; }
            //     return;
            // }
            if (!queryChanged && currentResults !== undefined) return;
            if (debounceTimer) clearTimeout(debounceTimer);
            if (currentResults === undefined || queryChanged) {
                console.log("[Reactive Query] Setting state to undefined (loading)"); // Changed log message
                set(undefined);
                currentResults = undefined;
            }

            debounceTimer = setTimeout(async () => {
                const currentUser = getCurrentUserFn();
                const latestQueryDefinition = get(queryDefinitionStore);
                const latestQueryDefString = JSON.stringify(latestQueryDefinition);

                // Re-validate query before execution
                if (!latestQueryDefinition || !Array.isArray(latestQueryDefinition.steps) || latestQueryDefString !== lastQueryDefinitionString) {
                    console.log("[Reactive Query Debounced] Skipping execution: Query became null, invalid, or stale.");
                    return;
                }

                console.log("[Reactive Query Debounced] Executing query:", latestQueryDefString);
                try {
                    // Set to undefined only if not already undefined (prevents flicker if query is fast)
                    if (currentResults !== undefined) set(undefined);
                    currentResults = undefined;

                    const results = await executeQuery(latestQueryDefinition, currentUser);

                    // Check if query changed *again* during async execution
                    if (JSON.stringify(get(queryDefinitionStore)) !== lastQueryDefinitionString) {
                        console.log("[Reactive Query Debounced] Query became stale during execution, ignoring results.");
                        return;
                    }
                    console.log("[Reactive Query Debounced] Setting results:", results);
                    set(results);
                    currentResults = results;
                } catch (error) {
                    console.error("[LoroHQL Reactive] Error:", error);
                    // Check staleness before setting error state
                    if (JSON.stringify(get(queryDefinitionStore)) === lastQueryDefinitionString) {
                        console.log("[Reactive Query Debounced] Setting state to null (error)");
                        set(null);
                        currentResults = null;
                    } else {
                        console.log("[Reactive Query Debounced] Query became stale during error, ignoring error state.");
                    }
                }
            }, DEBOUNCE_MS);
        };

        const unsubscribeQueryDef = queryDefinitionStore.subscribe(newQueryDef => {
            const newQueryDefString = JSON.stringify(newQueryDef);
            // Trigger if query changes OR if results are still undefined (initial load)
            if (lastQueryDefinitionString !== newQueryDefString || currentResults === undefined) {
                triggerDebouncedQuery();
            }
        });

        const unsubscribeNotifier = docChangeNotifier.subscribe(() => {
            console.log("[Reactive Query] docChangeNotifier triggered.");
            triggerDebouncedQuery();
        });

        const sessionStore = authClient.useSession();
        const unsubscribeSession = sessionStore.subscribe((session: MinimalSession) => { // Use defined type
            const currentSessionState = JSON.stringify(session?.data?.user?.id ?? null);
            if (lastSessionState !== null && lastSessionState !== currentSessionState) {
                console.log("[Reactive Query] Session changed.");
                triggerDebouncedQuery();
            }
            lastSessionState = currentSessionState;
        });

        const initialSessionData = get(sessionStore);
        lastSessionState = JSON.stringify(initialSessionData?.data?.user?.id ?? null);
        lastQueryDefinitionString = JSON.stringify(get(queryDefinitionStore));
        currentResults = undefined; // Start in loading state

        // Trigger initial query execution if valid
        if (get(queryDefinitionStore) && Array.isArray(get(queryDefinitionStore)?.steps)) {
            console.log("[Reactive Query] Triggering initial query execution.");
            triggerDebouncedQuery();
        } else {
            console.log("[Reactive Query] Initial query is invalid, setting state to empty array.");
            set([]); // Set empty array if initial query is invalid
            currentResults = [];
        }

        return () => {
            console.log("[Reactive Query] Cleanup.");
            unsubscribeQueryDef();
            unsubscribeNotifier();
            unsubscribeSession();
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    });
}

// Defined once earlier now
// type MinimalSession = { ... } 