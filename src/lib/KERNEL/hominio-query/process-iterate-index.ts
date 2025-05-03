import { LoroMap } from 'loro-crdt';
import { getLeafDoc } from '../loro-engine';
import { getIndexLeafPubKey } from '../index-registry';
import type {
    QueryContext,
    StepResultItem,
    LoroHqlIterateIndexStep,
    // IndexLeafType // Removed unused import
} from '../hominio-types';

/**
 * Processes an iterateIndex step.
 */
export async function processIterateIndexStep( // Added export
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