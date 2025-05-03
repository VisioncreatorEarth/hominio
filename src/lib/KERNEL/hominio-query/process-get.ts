import { LoroDoc } from 'loro-crdt';
import {
    getLeafDoc,
    getSchemaDoc,
    getCompositeDoc,
} from '../loro-engine';
import { canRead, type CapabilityUser } from '../hominio-caps';
import { hominioDB } from '../hominio-db'; // Added import for hominioDB
import type {
    QueryContext,
    StepResultItem,
    QueryResult,
    LoroHqlGetStep,
} from '../hominio-types';
import { selectFieldValue } from './helpers';

/**
 * Helper function for processing a get step
 */
export async function processGetStep( // Added export
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
            const docMeta = await hominioDB.getDocument(pubKey);
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