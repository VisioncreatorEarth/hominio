import { LoroDoc, LoroMap } from 'loro-crdt';
import {
    getLeafDoc,
    getSchemaDoc,
    getCompositeDoc,
    findCompositeDocsBySchemaAndPlace,
    getDataFromDoc,
} from './loro-engine';
import { canRead, type CapabilityUser } from '$lib/KERNEL/hominio-caps';
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
}

// <<< NEW TYPE: Represents possible structures entering a JOIN step >>>
// It can be a direct result from FIND/GET (with .variables)
// or a processed result from a previous JOIN/RESOLVE (flat structure)
type JoinInputItem = StepResultItem | QueryResult; // QueryResult is Record<string, unknown>
// <<< END NEW TYPE >>>

// Define possible step actions
type HqlStepAction = 'find' | 'get' | 'select' | 'setVar' | 'iterateIndex' | 'resolve' | 'join' | 'aggregate';

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
    resultVariable?: string;
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

// <<< START NEW STEP DEFINITION: resolve >>>
// Rule for resolving a leaf's value conditionally based on its type
interface ResolveLeafValueRule {
    type: 'resolveLeafValue';
    pubkeyVar: string;      // Variable in the source item holding the leaf pubkey (e.g., 'x1')
    fallbackVar: string;    // Variable in the source item to use as fallback (e.g., 'x1')
    valueField?: string;     // Field in leaf data containing the value (default: 'value')
    typeField?: string;      // Field in leaf data containing the type (default: 'type')
    excludeType?: string;    // Type value to exclude (e.g., 'concept')
}

// Union of possible resolution rules (can be extended later)
type ResolveRule = ResolveLeafValueRule;

interface LoroHqlResolveStep extends LoroHqlStepBase {
    action: 'resolve';
    fromVariable: string; // Variable in context holding the array to process
    resolveFields: {
        [outputFieldName: string]: ResolveRule; // Map output names to resolution rules
    };
    resultVariable: string; // Required: Name for the array of resolved items
}
// <<< END NEW STEP DEFINITION >>>

// <<< START NEW STEP DEFINITION: join >>>
interface LoroHqlJoinSource {
    variable: string; // Variable name in context holding the array
    key: string; // Variable name *within* the items' `variables` object to join on
}

interface LoroHqlJoinStep extends LoroHqlStepBase {
    action: 'join';
    left: LoroHqlJoinSource;
    right: LoroHqlJoinSource;
    type?: 'inner' | 'left'; // Optional: Type of join (default: 'inner')
    select: {
        // Output field name -> source variable name (e.g., { taskId: 'left.taskVar' })
        [outputKey: string]: { source: string };
    };
    resultVariable: string; // Required: Name for the array of joined items
}
// <<< END NEW STEP DEFINITION >>>

// <<< START NEW STEP DEFINITION: aggregate >>>
interface AggregateFieldRule {
    sourceField: string;        // Field name in the input items
    operation: 'collect' | 'first'; // How to aggregate this field
}

interface LoroHqlAggregateStep extends LoroHqlStepBase {
    action: 'aggregate';
    fromVariable: string;       // Variable in context holding the flat array to aggregate
    groupByKey: string;         // Field name within the input items to group by (e.g., 'taskId')
    aggregateFields: {          // Defines how to handle other fields
        [outputFieldName: string]: AggregateFieldRule;
    };
    resultVariable: string;       // Required: Name for the array of aggregated items
}
// <<< END NEW STEP DEFINITION >>>

// --- Resolve and Enrich Steps Removed ---

// Union type for any step
type LoroHqlStep =
    | LoroHqlSetVarStep
    | LoroHqlFindStep
    | LoroHqlGetStep
    | LoroHqlSelectStep
    | LoroHqlIterateIndexStep
    | LoroHqlResolveStep
    | LoroHqlJoinStep
    | LoroHqlAggregateStep; // <-- Add Aggregate step

// Redefined top-level query using steps
export interface LoroHqlQueryExtended {
    steps: LoroHqlStep[];
}

// --- END NEW Steps-Based Query Engine Types ---

// Result type
export type QueryResult = Record<string, unknown>;

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
                const compDoc = await getLeafDoc(compPubKey);
                if (!compDoc) {
                    continue;
                }
                const compData = getDataFromDoc(compDoc) as { schemaId: string; places: Record<PlaceKey, string> } | undefined;
                if (schemaId !== '*' && compData?.schemaId !== schemaId) {
                    continue; // Skip if schema doesn't match the specific one requested
                }
                if (compData?.places && Object.values(compData.places).includes(targetValue)) {
                    matchingComposites.push({ pubkey: compPubKey, doc: compDoc });
                }
            } catch (loadError) {
                console.error(`[Query Engine] Find by schema: Error loading composite doc ${compPubKey}:`, loadError); // Log error
            }
        }
        foundComposites = matchingComposites;
        // <<< END IMPLEMENTATION >>>

    } else if (step.target.x1 || step.target.x2 || step.target.x3 || step.target.x4 || step.target.x5) {
        // Specific place find
        const placeKey = (Object.keys(step.target).find(k => k.startsWith('x') && step.target[k as PlaceKey]) as PlaceKey | undefined);
        const placeValue = placeKey ? resolveValue(step.target[placeKey], context) : undefined;


        if (placeKey && placeValue) {
            try {
                foundComposites = await findCompositeDocsBySchemaAndPlace(schemaId, placeKey, placeValue);
            } catch (findError) {
                console.error(`[processFindStep ERROR] Error calling findCompositeDocsBySchemaAndPlace:`, findError);
                foundComposites = []; // Ensure it's an empty array on error
            }
        } else {
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

        for (const compPubKey of allCompositePubKeys) {
            try {
                const compDoc = await getLeafDoc(compPubKey);
                if (!compDoc) {
                    continue;
                }
                const compData = getDataFromDoc(compDoc) as { schemaId: string; places: Record<PlaceKey, string> } | undefined;
                if (compData?.schemaId === schemaId) {
                    matchingComposites.push({ pubkey: compPubKey, doc: compDoc });
                }
            } catch (loadError) {
                console.error(`[Query Engine] Find by schema: Error loading composite doc ${compPubKey}:`, loadError); // Log error
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

                // Logic for LeafQueries: Correlate schema info (name, placeTitles, etc.)
                if (otherVarName === 'schemaInfo') {
                    const schemaIdToFind = groupContext['schema_id']; // schema_id comes from the foundComposites group
                    if (schemaIdToFind) {
                        const matchingSchemaInfo = otherDataArray.find(infoItem => infoItem.variables?.retrieved_schema_id === schemaIdToFind);
                        if (matchingSchemaInfo && typeof matchingSchemaInfo.variables === 'object') {
                            // <<< GENERIC CORRELATION: Copy all variables from schemaInfo result >>>
                            for (const [schemaVarKey, schemaVarValue] of Object.entries(matchingSchemaInfo.variables)) {
                                // Avoid overwriting the key used for matching, if necessary
                                // (In this case, 'retrieved_schema_id' is unlikely to clash with foundComposites vars)
                                // Prefixing could be added here if needed: e.g., groupContext[`schemaInfo_${schemaVarKey}`] = schemaVarValue;
                                groupContext[schemaVarKey] = schemaVarValue;
                            }
                        }
                    }
                }
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
                // Resolve variable: Expects variables directly available in groupContext
                // (e.g., 'composite_key', 'schema_id', 'x1', 'name', 'placeTitles')
                if ('variable' in valueDef && typeof valueDef.variable === 'string') {
                    const varName = valueDef.variable;
                    resultItem[outputKey] = groupContext[varName];
                } else if ('literal' in valueDef) {
                    resultItem[outputKey] = valueDef.literal;
                } else if ('field' in valueDef && typeof valueDef.field === 'string') {
                    // ... (field access warning remains) ...
                } else {
                    // ... (unsupported definition warning remains) ...
                }
            } else {
                // ... (invalid definition warning remains) ...
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

// <<< START NEW STEP PROCESSING FUNCTION: processResolveStep >>>
/**
 * Helper function to perform the core logic of resolveLeafValue rule,
 * including the secondary lookup for concept types.
 */
async function resolveSingleLeafValue(
    pubkey: string | null | undefined,
    valueField: string,
    typeField: string,
    excludeType: string | undefined,
    cnemeSchemaPubKey: string | null // <<< Pass cneme schema key
): Promise<[unknown | null]> { // <<< Return tuple [value]
    if (!pubkey) {
        return [null]; // <<< Return [null value]
    }
    try {
        const leafDoc = await getLeafDoc(pubkey);
        if (!leafDoc) {
            return [null]; // Indicate failure to resolve
        }
        const data = getDataFromDoc(leafDoc);

        if (
            data &&
            typeof data === 'object'
        ) {
            const dataType = (data as Record<string, unknown>)[typeField];
            const dataValue = (data as Record<string, unknown>)[valueField]; // Re-add assignment

            // Check if the type should be excluded (e.g., 'Concept')
            if (excludeType !== undefined && dataType === excludeType) {
                // <<< START Secondary Lookup Logic for Concepts >>>
                if (!cnemeSchemaPubKey) {
                    console.warn(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Cannot resolve concept - 'cneme' schema pubkey not available.`); // DEBUG
                    return [null]; // <<< Return [null value]
                }
                try {
                    const relatedCnemeComposites = await findCompositeDocsBySchemaAndPlace(cnemeSchemaPubKey, 'x1', pubkey);

                    if (relatedCnemeComposites.length === 1) {
                        const cnemeComp = relatedCnemeComposites[0];
                        const cnemeData = getDataFromDoc(cnemeComp.doc) as { places: Record<PlaceKey, string> } | undefined;
                        const x2PubKey = cnemeData?.places?.x2;

                        if (x2PubKey) {
                            // Fetch the x2 leaf and its value
                            const x2LeafDoc = await getLeafDoc(x2PubKey);
                            if (x2LeafDoc) {
                                const x2Data = getDataFromDoc(x2LeafDoc);
                                if (x2Data && typeof x2Data === 'object' && (x2Data as Record<string, unknown>)[valueField] !== undefined) {
                                    const resolvedValue = (x2Data as Record<string, unknown>)[valueField];
                                    return [resolvedValue]; // <<< SUCCESS! Return [resolved value]
                                } else {
                                    console.warn(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Found cneme composite ${cnemeComp.pubkey}, but x2 leaf ${x2PubKey} has no '${valueField}' or invalid data. x2Data:`, x2Data); // DEBUG
                                }
                            } else {
                                console.warn(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Found cneme composite ${cnemeComp.pubkey}, but failed to load x2 leaf ${x2PubKey}.`); // DEBUG
                            }
                        } else {
                            console.warn(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Found cneme composite ${cnemeComp.pubkey}, but it has no x2 value.`); // DEBUG
                        }
                    }
                } catch (secondaryLookupError) {
                    console.error(`[Query Engine Resolve DEBUG] Concept ${pubkey}: Error during secondary lookup:`, secondaryLookupError); // DEBUG
                }
                return [null]; // <<< Fallback: Return [null value]
                // <<< END Secondary Lookup Logic >>>
            }

            // Original logic: Not the excluded type, check if value exists
            if (dataValue !== undefined) {
                return [dataValue]; // <<< Return [direct value]
            }
        }
        // Data missing, value missing, or type excluded (if check passed but value missing)
        return [null]; // <<< Signal fallback: Return [null value]
    } catch (error) {
        console.error(`resolveSingleLeafValue: Error fetching/processing leaf ${pubkey}:`, error);
        return [null]; // <<< Signal fallback on error: Return [null value]
    }
}


/**
 * Processes a 'resolve' step, performing conditional lookups based on previous results.
 */
async function processResolveStep(
    step: LoroHqlResolveStep,
    context: QueryContext
): Promise<QueryContext> {
    const updatedContext = { ...context };
    const inputData = context[step.fromVariable];
    const resolvedResults: QueryResult[] = [];

    // <<< Fetch 'cneme' schema pubkey once >>>
    let cnemeSchemaPubKey: string | null = null;
    try {
        const schemasIndexKey = await getIndexLeafPubKey('schemas');
        if (schemasIndexKey) {
            const indexDoc = await getLeafDoc(schemasIndexKey);
            if (indexDoc) {
                const valueMap = indexDoc.getMap('data')?.get('value') as LoroMap | undefined;
                cnemeSchemaPubKey = valueMap?.get('cneme') as string | undefined ?? null;
                if (!cnemeSchemaPubKey) {
                    console.warn("[Query Engine Resolve] Could not find pubkey for schema 'cneme' in the index.");
                }
            }
        }
    } catch (e) {
        console.error("[Query Engine Resolve] Error fetching 'cneme' schema pubkey:", e);
    }

    if (!Array.isArray(inputData)) {
        console.warn(`[Query Engine] Resolve step: Input variable '${step.fromVariable}' is not an array. Skipping.`);
        updatedContext[step.resultVariable] = [];
        return updatedContext;
    }

    for (const item of inputData) {
        if (typeof item !== 'object' || item === null) {
            console.warn(`[Query Engine] Resolve step: Skipping non-object item in '${step.fromVariable}'.`);
            continue;
        }

        const resolvedItem: QueryResult = { ...item }; // Start with a copy of the original item

        for (const [outputField, rule] of Object.entries(step.resolveFields)) {
            if (rule.type === 'resolveLeafValue') {
                const pubkey = item[rule.pubkeyVar] as string | undefined;
                const fallbackValue = item[rule.fallbackVar];
                const valueField = rule.valueField ?? 'value';
                const typeField = rule.typeField ?? 'type';
                const excludeType = rule.excludeType;

                try {
                    // <<< Capture the tuple returned by resolveSingleLeafValue >>>
                    const [resolvedValue] = await resolveSingleLeafValue(
                        pubkey,
                        valueField,
                        typeField,
                        excludeType,
                        cnemeSchemaPubKey // Pass fetched key
                    );

                    // If resolution succeeded (returned non-null value), use the resolved value.
                    // Otherwise, use the fallback value.
                    resolvedItem[outputField] = resolvedValue !== null ? resolvedValue : fallbackValue;

                } catch (error) {
                    console.error(`[Query Engine] Resolve step: Error applying rule for '${outputField}' on item:`, item, error);
                    resolvedItem[outputField] = fallbackValue; // Use fallback on error during resolution
                }
            }
            else {
                // FIX: Safer access to rule type for logging
                const unknownType = (typeof rule === 'object' && rule !== null && 'type' in rule) ? rule.type : '(unknown format)';
                console.warn(`[Query Engine] Resolve step: Unsupported rule type '${unknownType}' for field '${outputField}'.`);
                // Keep original value or set to undefined?
                // resolvedItem[outputField] = item[outputField]; // Assuming outputField might exist in input
            }
        }
        resolvedResults.push(resolvedItem);
    } // End loop through input items

    updatedContext[step.resultVariable] = resolvedResults;
    return updatedContext;
}
// <<< END NEW STEP PROCESSING FUNCTION >>>

// <<< START NEW STEP PROCESSING FUNCTION: processJoinStep >>>
async function processJoinStep(
    step: LoroHqlJoinStep,
    context: QueryContext
): Promise<QueryContext> {
    const updatedContext = { ...context };
    // Use the new union type for inputs
    const leftArray = context[step.left.variable] as JoinInputItem[] | undefined;
    const rightArray = context[step.right.variable] as JoinInputItem[] | undefined;
    const joinType = step.type ?? 'inner';
    const joinedResults: QueryResult[] = [];

    // <<< JOIN DEBUG LOGS START >>>
    const isTagJoin = step.left.variable === 'baseTaskInfo' && step.right.variable === 'taskTagLinks';
    if (isTagJoin) {
        console.log(`[Query Engine JOIN DEBUG - Tags] Entering join step.`);
        console.log(`  - Left Array (${step.left.variable}, key: ${step.left.key}):`, JSON.stringify(leftArray));
        console.log(`  - Right Array (${step.right.variable}, key: ${step.right.key}):`, JSON.stringify(rightArray));
    }
    // <<< JOIN DEBUG LOGS END >>>

    if (!Array.isArray(leftArray) || !Array.isArray(rightArray)) {
        console.warn(
            `[Query Engine JOIN] Input variables '${step.left.variable}' or '${step.right.variable}' are not arrays. Skipping join.`
        );
        updatedContext[step.resultVariable] = [];
        return updatedContext;
    }

    // Build a map from the right array for efficient lookup (inner/left join)
    const rightMap = new Map<unknown, JoinInputItem[]>(); // Value is array of JoinInputItem
    for (const rightItem of rightArray) {
        let rightKey: unknown;
        if (typeof rightItem === 'object' && rightItem !== null) {
            // Explicit type guard
            if ('variables' in rightItem && typeof rightItem.variables === 'object' && rightItem.variables !== null) {
                // Cast to StepResultItem within this block
                rightKey = (rightItem as StepResultItem).variables[step.right.key];
            } else {
                // Cast to QueryResult (flat structure) within this block
                rightKey = (rightItem as QueryResult)[step.right.key];
            }
            if (rightKey !== undefined) {
                if (!rightMap.has(rightKey)) {
                    rightMap.set(rightKey, []);
                }
                rightMap.get(rightKey)!.push(rightItem);
            }
        }
    }

    // Iterate through the left array and perform the join
    for (const leftItem of leftArray) {
        let leftKey: unknown;
        if (typeof leftItem === 'object' && leftItem !== null) {
            // Explicit type guard
            if ('variables' in leftItem && typeof leftItem.variables === 'object' && leftItem.variables !== null) {
                // Cast to StepResultItem within this block
                leftKey = (leftItem as StepResultItem).variables[step.left.key];
            } else {
                // Cast to QueryResult (flat structure) within this block
                leftKey = (leftItem as QueryResult)[step.left.key];
            }
        }

        // <<< JOIN DEBUG LOGS START >>>
        if (isTagJoin) {
            console.log(`[Query Engine JOIN DEBUG - Tags] Processing left item with key ${step.left.key}=${leftKey}`);
        }
        // <<< JOIN DEBUG LOGS END >>>

        const matchingRightItems = leftKey !== undefined ? rightMap.get(leftKey) : undefined;

        // <<< JOIN DEBUG LOGS START >>>
        if (isTagJoin) {
            if (matchingRightItems && matchingRightItems.length > 0) {
                console.log(`  - Found ${matchingRightItems.length} matching right item(s) for key ${leftKey}`);
            } else {
                console.log(`  - Found NO matching right item(s) for key ${leftKey}`);
            }
        }
        // <<< JOIN DEBUG LOGS END >>>

        if (matchingRightItems && matchingRightItems.length > 0) {
            // Inner join: process matches
            for (const rightItem of matchingRightItems) {
                const joinedItem: QueryResult = {};
                for (const [outputKey, sourceDef] of Object.entries(step.select)) {
                    // FIX: Use explicit casts based on type guard
                    if (sourceDef.source.startsWith('left.')) {
                        const varName = sourceDef.source.substring(5);
                        if (typeof leftItem === 'object' && leftItem !== null) {
                            if ('variables' in leftItem && typeof leftItem.variables === 'object' && leftItem.variables !== null) {
                                joinedItem[outputKey] = (leftItem as StepResultItem).variables[varName];
                            } else {
                                joinedItem[outputKey] = (leftItem as QueryResult)[varName];
                            }
                        } else {
                            joinedItem[outputKey] = undefined;
                        }
                    } else if (sourceDef.source.startsWith('right.')) {
                        const varName = sourceDef.source.substring(6);
                        if (typeof rightItem === 'object' && rightItem !== null) {
                            if ('variables' in rightItem && typeof rightItem.variables === 'object' && rightItem.variables !== null) {
                                joinedItem[outputKey] = (rightItem as StepResultItem).variables[varName];
                            } else {
                                joinedItem[outputKey] = (rightItem as QueryResult)[varName];
                            }
                        } else {
                            joinedItem[outputKey] = undefined;
                        }
                    } else {
                        console.warn(`[Query Engine JOIN] Invalid source '${sourceDef.source}' in select. Must start with 'left.' or 'right.'.`);
                    }
                }
                joinedResults.push(joinedItem);
            }
        } else if (joinType === 'left') {
            // Left join: process left item even if no match on right
            const joinedItem: QueryResult = {};
            for (const [outputKey, sourceDef] of Object.entries(step.select)) {
                if (sourceDef.source.startsWith('left.')) {
                    const varName = sourceDef.source.substring(5);
                    // FIX: Use explicit casts based on type guard
                    if (typeof leftItem === 'object' && leftItem !== null) {
                        if ('variables' in leftItem && typeof leftItem.variables === 'object' && leftItem.variables !== null) {
                            joinedItem[outputKey] = (leftItem as StepResultItem).variables[varName];
                        } else {
                            joinedItem[outputKey] = (leftItem as QueryResult)[varName];
                        }
                    } else {
                        joinedItem[outputKey] = undefined;
                    }
                } else {
                    // Right side fields are null/undefined in a left join with no match
                    joinedItem[outputKey] = undefined;
                }
            }
            joinedResults.push(joinedItem);
        }
        // Inner join and no match: leftItem is discarded
    }

    updatedContext[step.resultVariable] = joinedResults;
    return updatedContext;
}
// <<< END NEW STEP PROCESSING FUNCTION >>>

// <<< START NEW STEP PROCESSING FUNCTION: processAggregateStep >>>
async function processAggregateStep(
    step: LoroHqlAggregateStep,
    context: QueryContext
): Promise<QueryContext> {
    const updatedContext = { ...context };
    const inputData = context[step.fromVariable] as QueryResult[] | undefined;
    const groupMap = new Map<unknown, QueryResult>();

    if (!Array.isArray(inputData)) {
        console.warn(
            `[Query Engine AGGREGATE] Input variable '${step.fromVariable}' is not an array. Skipping aggregation.`
        );
        updatedContext[step.resultVariable] = [];
        return updatedContext;
    }

    for (const item of inputData) {
        if (typeof item !== 'object' || item === null) continue;

        const groupKey = item[step.groupByKey];
        if (groupKey === undefined) continue; // Skip items missing the group key

        if (!groupMap.has(groupKey)) {
            // First item for this group - initialize the aggregated object
            const newGroupItem: QueryResult = {};
            // Include the group key itself
            newGroupItem[step.groupByKey] = groupKey;

            for (const [outputField, rule] of Object.entries(step.aggregateFields)) {
                const sourceValue = item[rule.sourceField];
                if (rule.operation === 'first') {
                    newGroupItem[outputField] = sourceValue;
                } else if (rule.operation === 'collect') {
                    // Initialize array and add the first value (if it exists)
                    newGroupItem[outputField] = sourceValue !== undefined && sourceValue !== null ? [sourceValue] : [];
                } else {
                    console.warn(`[Query Engine AGGREGATE] Unsupported operation '${rule.operation}' for field '${outputField}'.`);
                }
            }
            groupMap.set(groupKey, newGroupItem);
        } else {
            // Existing group - update collected arrays
            const existingGroupItem = groupMap.get(groupKey)!;
            for (const [outputField, rule] of Object.entries(step.aggregateFields)) {
                if (rule.operation === 'collect') {
                    const sourceValue = item[rule.sourceField];
                    const currentArray = existingGroupItem[outputField] as unknown[];
                    // Add sourceValue if it exists and is not already in the array
                    if (sourceValue !== undefined && sourceValue !== null && !currentArray.includes(sourceValue)) {
                        currentArray.push(sourceValue);
                    }
                } // 'first' operation fields are already set from the first item
            }
        }
    }

    // Convert map values to array
    updatedContext[step.resultVariable] = Array.from(groupMap.values());
    return updatedContext;
}
// <<< END NEW STEP PROCESSING FUNCTION >>>

/**
 * Main function to execute a LORO_HQL steps-based query.
 * Now framework-agnostic.
 */
export async function executeQuery(
    query: LoroHqlQueryExtended,
    user: CapabilityUser | null = null // Accepts user directly
): Promise<QueryResult[]> {
    let context: QueryContext = {};
    let finalResults: QueryResult[] = [];
    let lastStepResultVariable: string | null = null;

    if (!query || typeof query !== 'object' || !Array.isArray(query.steps)) {
        console.error("[Query Engine] Invalid query format provided.", query);
        throw new Error("Invalid query format: Expected object with a steps array.");
    }

    try {
        for (const step of query.steps) {
            switch (step.action) {
                case 'setVar': {
                    const setVarStep = step as LoroHqlSetVarStep;
                    if (setVarStep.variables && typeof setVarStep.variables === 'object') {
                        for (const [varName, varDef] of Object.entries(setVarStep.variables)) {
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
                    context = await processGetStep(step as LoroHqlGetStep, context, user); // Pass user
                    break;
                case 'select':
                    {
                        const selectResults = await processSelectStep(step as LoroHqlSelectStep, context);
                        if (step.resultVariable) {
                            context[step.resultVariable] = selectResults;
                        } else {
                            finalResults = selectResults;
                        }
                    }
                    break;
                case 'iterateIndex':
                    context = await processIterateIndexStep(step as LoroHqlIterateIndexStep, context);
                    break;
                case 'resolve':
                    context = await processResolveStep(step as LoroHqlResolveStep, context);
                    break;
                case 'join':
                    context = await processJoinStep(step as LoroHqlJoinStep, context);
                    break;
                case 'aggregate':
                    context = await processAggregateStep(step as LoroHqlAggregateStep, context);
                    break;
                default: {
                    const unknownAction = (step as LoroHqlStepBase)?.action ?? 'unknown';
                    console.error(`[Query Engine] Unsupported step action encountered: ${unknownAction}`);
                    throw new Error(`Unsupported step action: ${unknownAction}`);
                }
            }
            if (step.resultVariable) {
                lastStepResultVariable = step.resultVariable;
            } else if (step.action !== 'setVar') {
                lastStepResultVariable = null;
            }
        }

        // Return logic as before
        if (lastStepResultVariable && context[lastStepResultVariable] !== undefined) {
            const resultValue = context[lastStepResultVariable];
            return Array.isArray(resultValue) ? resultValue as QueryResult[] : (resultValue ? [resultValue as QueryResult] : []);
        } else {
            return finalResults;
        }

    } catch (error) {
        console.error("[Query Engine] Error during STEPS execution:", error);
        return [];
    }
} 
