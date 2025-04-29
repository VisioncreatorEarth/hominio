import { LoroDoc, LoroMap } from 'loro-crdt';
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
import { getIndexLeafPubKey, type IndexLeafType } from './index-registry';

// FIX: Export PlaceKey
export type PlaceKey = 'x1' | 'x2' | 'x3' | 'x4' | 'x5';

// Refined: Defines how to get a value for an output property
interface LoroHqlMapValue {
    field?: string;      // Option 1: Direct field access (e.g., "self.metadata.type", "self.data.value")
    variable?: string; // Option 2: Reference a variable from context
    literal?: unknown; // Option 3: Use a literal value
}

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
type HqlStepAction = 'find' | 'get' | 'select' | 'setVar' | 'iterateIndex';

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
    // FIX: Update 'from' type to allow targetDocType with variable/sourceKey
    from: { variable: string, sourceKey?: string, targetDocType?: 'Leaf' | 'Schema' | 'Composite' } // Case 1: From variable
    | { pubkey: string | string[], targetDocType?: 'Leaf' | 'Schema' | 'Composite' } // Case 2: From literal pubkey(s) - ADDED targetDocType here too
    | { type: 'Leaf' | 'Schema' | 'Composite' }; // Case 3: From type (unimplemented)
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

// <<< START NEW STEP DEFINITION: iterateIndex >>>
interface LoroHqlIterateIndexStep extends LoroHqlStepBase {
    action: 'iterateIndex';
    indexName: IndexLeafType; // Which index to iterate (e.g., 'schemas')
    variables: {
        key: string;   // Variable name to store the index key (e.g., schemaName)
        value: string; // Variable name to store the index value (e.g., schemaPubKey)
    };
    resultVariable: string; // Required: Name for the array of {keyVar, valueVar} results
}
// <<< END NEW STEP DEFINITION >>>

// --- Resolve and Enrich Steps Removed ---

// Union type for any step
type LoroHqlStep = LoroHqlSetVarStep | LoroHqlFindStep | LoroHqlGetStep | LoroHqlSelectStep | LoroHqlIterateIndexStep;

// Redefined top-level query using steps
export interface LoroHqlQueryExtended {
    steps: LoroHqlStep[];
}

// --- END NEW Steps-Based Query Engine Types ---

// Result type
export type QueryResult = Record<string, unknown>;

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
    const updatedContext = { ...context };
    const stepResults: StepResultItem[] = [];

    const schemaId = resolveValue(step.target.schema, context);
    if (!schemaId) {
        throw new Error(`Find step failed: Schema ID is required and could not be resolved.`);
    }

    let foundComposites: { pubkey: string; doc: LoroDoc }[] = [];

    // --- Determine Find Strategy --- 
    if (step.target.place === '*') {
        // Wildcard place find (potentially slow)
        console.warn("[Query Engine] Find step using wildcard place is not optimized yet.");
        const targetValue = resolveValue(step.target.value, context);
        if (!targetValue) throw new Error("Find step failed: Value required for wildcard place find.");

        // <<< START IMPLEMENTATION for place: '*' >>>
        const compositesIndexKey = await getIndexLeafPubKey('composites');
        if (!compositesIndexKey) {
            throw new Error("Find step (wildcard) failed: Could not find pubkey for 'composites' index leaf.");
        }
        const indexDoc = await getLeafDoc(compositesIndexKey);
        if (!indexDoc) {
            throw new Error(`Find step (wildcard) failed: Could not load 'composites' index document (${compositesIndexKey}).`);
        }
        const indexData = getDataFromDoc(indexDoc) as { value: Record<string, true> } | undefined;
        if (!indexData || typeof indexData.value !== 'object' || indexData.value === null) {
            throw new Error(`Find step (wildcard) failed: 'composites' index document (${compositesIndexKey}) has invalid data format.`);
        }

        const allCompositePubKeys = Object.keys(indexData.value);
        const matchingComposites: { pubkey: string; doc: LoroDoc }[] = [];

        for (const compPubKey of allCompositePubKeys) {
            try {
                const compDoc = await hominioDB.getLoroDoc(compPubKey);
                if (!compDoc) {
                    console.warn(`[Query Engine] Wildcard find: Could not load composite doc ${compPubKey}. Skipping.`);
                    continue;
                }
                const compData = getDataFromDoc(compDoc) as { schemaId: string; places: Record<PlaceKey, string> } | undefined;
                // Check if schema matches (if schema is not also wildcard)
                if (schemaId !== '*' && compData?.schemaId !== schemaId) {
                    continue; // Skip if schema doesn't match the specific one requested
                }
                // Check if targetValue exists in any place
                if (compData?.places && Object.values(compData.places).includes(targetValue)) {
                    matchingComposites.push({ pubkey: compPubKey, doc: compDoc });
                }
            } catch (loadError) {
                console.warn(`[Query Engine] Wildcard find: Error loading composite doc ${compPubKey}:`, loadError);
            }
        }
        foundComposites = matchingComposites;
        // <<< END IMPLEMENTATION >>>

    } else if (step.target.x1 || step.target.x2 || step.target.x3 || step.target.x4 || step.target.x5) {
        // Specific place find
        const placeKey = (Object.keys(step.target).find(k => k.startsWith('x') && step.target[k as PlaceKey]) as PlaceKey | undefined);
        const placeValue = placeKey ? resolveValue(step.target[placeKey], context) : undefined;
        if (placeKey && placeValue) {
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
        const matchingComposites: { pubkey: string; doc: LoroDoc }[] = [];

        // --- DEBUGGING: Log index data and search schemaId --- 
        console.log(`[Query Engine DEBUG] Composites Index Contents:`, JSON.stringify(indexData.value));
        console.log(`[Query Engine DEBUG] Searching for Schema ID:`, schemaId);
        // --- END DEBUGGING ---

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

    return updatedContext;
}

// Helper function for processing a get step
async function processGetStep(
    step: LoroHqlGetStep,
    context: QueryContext,
    user: CapabilityUser | null
): Promise<QueryContext> {
    const updatedContext = { ...context };
    const stepResults: StepResultItem[] = [];
    let pubKeysToFetch: string[] = [];
    let sourceType: 'Leaf' | 'Schema' | 'Composite' | null = null;

    // --- Determine PubKeys to Fetch --- 
    if ('variable' in step.from) {
        const sourceData = context[step.from.variable];
        const sourceKey = step.from.sourceKey; // Get the optional sourceKey

        // FIX: Type check sourceData more carefully and use sourceKey if provided
        if (Array.isArray(sourceData)) {
            pubKeysToFetch = sourceData
                .map(item => {
                    if (typeof item !== 'object' || item === null) return null; // Skip non-objects

                    let pubkey: string | undefined | null = null;

                    // 1. If sourceKey is provided, prioritize extracting from item.variables[sourceKey]
                    if (sourceKey && 'variables' in item && typeof item.variables === 'object' && item.variables !== null) {
                        const potentialPubkey = (item.variables as Record<string, unknown>)[sourceKey];
                        // <<< START DEBUG LOGGING >>>
                        console.log(`[Query Engine GET DEBUG] Array Item: Extracted potential pubkey using sourceKey '${sourceKey}':`, potentialPubkey, '(type:', typeof potentialPubkey, ') from item:', item);
                        // <<< END DEBUG LOGGING >>>
                        if (typeof potentialPubkey === 'string') {
                            pubkey = potentialPubkey;
                        } else {
                            // DEBUG: Log if the expected key exists but isn't a string
                            if (Object.prototype.hasOwnProperty.call(item.variables, sourceKey)) {
                                console.warn(`[Query Engine GET] Found key '${sourceKey}' but value is not a string:`, potentialPubkey, 'in item:', item);
                            }
                        }
                    }

                    // 2. If pubkey still not found AND sourceKey was NOT provided, try fallback logic
                    // FIX: Only use fallbacks if sourceKey was *not* provided or failed
                    if (!pubkey && !sourceKey) {
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
            // FIX: Only use fallbacks if sourceKey was *not* provided or failed
            if (!pubkey && !sourceKey) {
                if ('variables' in sourceData && typeof sourceData.variables === 'object' && sourceData.variables !== null && typeof (sourceData.variables as Record<string, unknown>).pubkey === 'string') {
                    pubkey = (sourceData.variables as { pubkey: string }).pubkey;
                } else if (typeof (sourceData as Record<string, unknown>)?.pubkey === 'string') {
                    pubkey = (sourceData as { pubkey: string }).pubkey;
                } else if (typeof sourceData === 'string') {
                    // This case should ideally not happen if sourceKey logic is correct, but kept as fallback
                    pubkey = sourceData;
                }
            }

            if (typeof pubkey === 'string' && pubkey !== '') {
                pubKeysToFetch = [pubkey];
            } else {
                console.warn(`[Query Engine] GET step: Variable '${step.from.variable}' contains single object without identifiable pubkey${sourceKey ? ` using sourceKey '${sourceKey}'` : ''}:`, sourceData);
            }
        } else if (typeof sourceData === 'string') { // Check if sourceData itself is a pubkey
            // FIX: Handle case where the variable holds the pubkey directly (no sourceKey)
            if (!sourceKey) {
                pubKeysToFetch = [sourceData];
                console.log(`[Query Engine GET DEBUG] Variable '${step.from.variable}' is string: ${sourceData}`);
            } else {
                console.warn(`[Query Engine] GET step: Variable '${step.from.variable}' is a string, but sourceKey '${sourceKey}' was also provided. Ignoring string value.`);
            }
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
                    // <<< FIX: Handle result._sourceKey specifically >>>
                    if (sourceDef.source === 'result._sourceKey') {
                        // Assign the pubKey used for the fetch (which is the _sourceKey for this result item)
                        extractedVars[varName] = pubKey;
                    } else if (sourceDef.source.startsWith('result.')) {
                        // Handle other result.fieldName references (accessing extractedFields)
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
    return updatedContext;
}

// Helper function for processing a select step
async function processSelectStep(
    step: LoroHqlSelectStep,
    context: QueryContext // Use defined type
): Promise<QueryResult[]> {
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

    // FIX: Handle case where sourceArray is null or empty *before* trying to group
    if (!sourceArray || sourceArray.length === 0) {
        console.log(`[Query Engine] SELECT step: Source array for groupBy '${groupByVar}' is empty or not found. Returning empty results.`);
        return []; // Return empty array directly
    }

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

        // <<< START REFINED LOGIC: Prefix variables unless it's a simple single-source group case >>>
        // Determine if this is likely a simple grouping case (only one source array identified)
        // A more robust check might be needed, but this covers the current schema query.
        const isSimpleGroupCase = true; // Assume simple unless other potential sources exist
        // Example check (could be enhanced): Check if context has other arrays besides sourceVarName
        for (const key in context) {
            if (key !== sourceVarName && Array.isArray(context[key])) {
                // Found another array, might not be a simple case
                // isSimpleGroupCase = false; // Disable for now, assume simple
            }
        }

        for (const [varName, varValue] of Object.entries(item.variables)) {
            if (isSimpleGroupCase) {
                // Add directly without prefix
                groupContext[varName] = varValue;
            } else {
                // Keep prefixing logic for complex multi-source joins (like original task example)
                groupContext[`${sourceVarName}_${varName}`] = varValue;
                // Also add the groupBy variable without prefix for easy access
                if (varName === groupByVar) {
                    groupContext[varName] = varValue;
                }
            }
        }
        // <<< END REFINED LOGIC >>>

        // Store the raw source item itself? Might be useful but increases context size.
        // groupContext[sourceVarName] = item;
    }

    // 2. Correlate data from OTHER context arrays and FLATTEN relevant fields
    // <<< NEW: Iterate through potential secondary data arrays in context for correlation >>>
    for (const [otherVarName, otherValue] of Object.entries(context)) {
        if (otherVarName === sourceVarName || !Array.isArray(otherValue)) {
            continue; // Skip the source array itself and non-arrays
        }

        // Check if it looks like an array of StepResultItem
        if (otherValue.length > 0 && typeof otherValue[0] === 'object' && otherValue[0] !== null && 'variables' in otherValue[0]) {
            const otherDataArray = otherValue as StepResultItem[];

            // Iterate through each group we've built from the sourceArray
            for (const [groupKey, groupContext] of groupedData.entries()) {

                // --- BEGIN Specific Correlation Logic --- 

                // Logic for Todos: Correlate status
                if (otherVarName === 'statusDetails') {
                    const targetStatusLeafVar = groupContext[`${sourceVarName}_statusLeafVar`]; // Assumes sourceVarName is taskStatusLinks
                    if (targetStatusLeafVar) {
                        const statusItem = otherDataArray.find(item => item._sourceKey === targetStatusLeafVar);
                        if (statusItem && statusItem.variables?.statusValue !== undefined) {
                            groupContext['status'] = statusItem.variables.statusValue;
                        }
                    }
                }

                // Logic for Todos: Correlate name (multi-step, depends on entityNameLinks existing)
                if (otherVarName === 'nameDetails' && context['entityNameLinks']) {
                    const entityNameLinksArray = context['entityNameLinks'] as StepResultItem[] | undefined;
                    const entityLinkItem = entityNameLinksArray?.find(item => item.variables?.entityVar === groupKey); // groupKey is taskVar here
                    if (entityLinkItem && entityLinkItem.variables?.nameLeafVar) {
                        const targetNameLeafVar = entityLinkItem.variables.nameLeafVar;
                        const nameItem = otherDataArray.find(item => item._sourceKey === targetNameLeafVar);
                        if (nameItem && nameItem.variables?.nameValue !== undefined) {
                            groupContext['name'] = nameItem.variables.nameValue;
                        }
                    }
                }

                // Logic for LeafQueries: Correlate schema name (using a distinct variable)
                if (otherVarName === 'schemaInfo') {
                    const schemaIdToFind = groupContext['schema_id']; // schema_id comes from the foundComposites group
                    // DEBUG: Log the ID we are trying to match
                    // console.log(`[Query Engine SELECT DEBUG - schemaInfo] Trying to find schemaId: ${schemaIdToFind}`);
                    if (schemaIdToFind) {
                        const matchingSchemaInfo = otherDataArray.find(infoItem => infoItem.variables?.retrieved_schema_id === schemaIdToFind);
                        if (matchingSchemaInfo && matchingSchemaInfo.variables?.name !== undefined) {
                            // DEBUG: Log successful match and the name found
                            console.log(`[Query Engine SELECT DEBUG - schemaInfo] Found match for ${schemaIdToFind}. Name: ${matchingSchemaInfo.variables.name}`);
                            // <<< Use a distinct key to avoid collision with 'name' from Todos query >>>
                            groupContext['correlated_schema_name'] = matchingSchemaInfo.variables.name;
                        } else {
                            // DEBUG: Log if no match or name was found
                            console.log(`[Query Engine SELECT DEBUG - schemaInfo] No matching schema name found for ${schemaIdToFind}. Match found: ${!!matchingSchemaInfo}, Name defined: ${matchingSchemaInfo?.variables?.name !== undefined}`); // More detailed log
                        }
                    }
                    // DEBUG: Log group context after attempting correlation for this group
                    // console.log(`[Query Engine SELECT DEBUG - schemaInfo] Group context for key ${groupKey} after schemaInfo correlation:`, JSON.stringify(groupContext));
                }

                // <<< NEW: Logic for LeafQueries Places (x1-x5) >>>
                // Repeat this block for x1LeafDetails through x5LeafDetails
                if (otherVarName.match(/^x[1-5]LeafDetails$/)) {
                    const placeNum = otherVarName.charAt(1); // Extract '1' from 'x1LeafDetails'
                    const placeKey = `x${placeNum}` as PlaceKey; // e.g., 'x1'
                    const targetLeafPubKey = groupContext[placeKey]; // Get the pubkey stored in x1, x2 etc.

                    if (targetLeafPubKey && typeof targetLeafPubKey === 'string') {
                        const matchingLeafInfo = otherDataArray.find(infoItem => infoItem._sourceKey === targetLeafPubKey);
                        const outputVarName = `correlated_${placeKey}_display`;

                        if (matchingLeafInfo && matchingLeafInfo.variables?.type !== undefined && matchingLeafInfo.variables?.type !== 'Concept') {
                            // Not a concept, use the value
                            groupContext[outputVarName] = matchingLeafInfo.variables.value;
                        } else {
                            // It IS a concept, or fetching failed, or type is missing - use the original pubkey
                            groupContext[outputVarName] = targetLeafPubKey;
                        }
                    } else {
                        // No pubkey was stored in this place for this composite
                        groupContext[`correlated_${placeKey}_display`] = null;
                    }
                }

                // --- END Specific Correlation Logic --- 

            }
        }
    }


    // 3. Construct final results from grouped and flattened data
    for (const [groupKey, groupContext] of groupedData.entries()) {
        const resultItem: QueryResult = {};
        // Add the groupKey value using the groupBy variable name as the key
        if (step.groupBy) {
            resultItem[step.groupBy] = groupKey;
        }

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

    return finalResults;
}

// <<< START NEW STEP PROCESSING FUNCTION: processIterateIndexStep >>>
async function processIterateIndexStep(
    step: LoroHqlIterateIndexStep,
    context: QueryContext
): Promise<QueryContext> {
    const updatedContext = { ...context };
    const stepResults: StepResultItem[] = [];

    try {
        const indexPubKey = await getIndexLeafPubKey(step.indexName);
        if (!indexPubKey) {
            throw new Error(`IterateIndex step failed: Could not find pubkey for index leaf '${step.indexName}'.`);
        }

        const indexDoc = await getLeafDoc(indexPubKey); // Index is always a Leaf
        if (!indexDoc) {
            throw new Error(`IterateIndex step failed: Could not load index document '${step.indexName}' (${indexPubKey}).`);
        }

        // Assuming index data structure: { data: { type: 'LoroMap', value: LoroMap<string, any> } }
        const dataMap = indexDoc.getMap('data');
        if (!(dataMap instanceof LoroMap)) {
            throw new Error(`IterateIndex step failed: Index document '${step.indexName}' (${indexPubKey}) has no 'data' map.`);
        }
        const valueContainer = dataMap.get('value');
        if (!(valueContainer instanceof LoroMap)) {
            throw new Error(`IterateIndex step failed: Index document '${step.indexName}' (${indexPubKey}) 'data.value' is not a LoroMap.`);
        }
        const indexValueMap = valueContainer as LoroMap;

        // Iterate over the map entries
        const entries = indexValueMap.entries();
        for (const [key, value] of entries) {
            const itemVariables: Record<string, unknown> = {};
            itemVariables[step.variables.key] = key;
            itemVariables[step.variables.value] = value; // Store the value (e.g., pubKey)

            stepResults.push({ _sourceKey: key, variables: itemVariables });
        }

        console.log(`[Query Engine] IterateIndex '${step.indexName}' found ${stepResults.length} items.`); // DEBUG

    } catch (error) {
        console.error(`[Query Engine] Error during IterateIndex step for '${step.indexName}':`, error);
        // Set empty result on error
        updatedContext[step.resultVariable] = [];
        return updatedContext; // Or re-throw?
    }

    // Store results in context
    updatedContext[step.resultVariable] = stepResults;
    return updatedContext;
}
// <<< END NEW STEP PROCESSING FUNCTION >>>

/**
 * Main function to execute a LORO_HQL steps-based query.
 */
export async function executeQuery(
    query: LoroHqlQueryExtended, // Only accept the new steps-based format
    user: CapabilityUser | null = null
): Promise<QueryResult[]> {
    let context: QueryContext = {}; // Use defined type
    let finalResults: QueryResult[] = [];

    // Check if the query object and steps array are valid
    if (!query || typeof query !== 'object' || !Array.isArray(query.steps)) {
        console.error("[Query Engine] Invalid query format provided. Expected LoroHqlQueryExtended with a steps array.", query);
        throw new Error("Invalid query format: Expected object with a steps array.");
    }

    try {
        for (const step of query.steps) {
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
                    return finalResults; // Assuming select is always last for now
                case 'iterateIndex':
                    context = await processIterateIndexStep(step as LoroHqlIterateIndexStep, context);
                    break;
                default: {
                    const unknownAction = (step as LoroHqlStepBase)?.action ?? 'unknown';
                    console.error(`[Query Engine] Unsupported step action encountered: ${unknownAction}`);
                    throw new Error(`Unsupported step action: ${unknownAction}`);
                }
            }
        }
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
