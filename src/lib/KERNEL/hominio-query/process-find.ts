import { LoroDoc } from 'loro-crdt';
import {
    getLeafDoc,
    findCompositeDocsBySchemaAndPlace,
    getDataFromDoc,
} from '../loro-engine';
import { getIndexLeafPubKey } from '../index-registry';
import type {
    PlaceKey,
    QueryContext,
    StepResultItem,
    LoroHqlFindStep,
} from '../hominio-types';
import { resolveValue } from './helpers';

/**
 * Helper function for processing a find step
 */
export async function processFindStep(
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
        const placeKey = (Object.keys(step.target).find(k => k.startsWith('x') && k !== 'schema' && step.target[k as PlaceKey]) as PlaceKey | undefined);
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