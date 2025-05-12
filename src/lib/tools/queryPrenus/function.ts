import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import { o } from '$lib/KERNEL/hominio-svelte';
import type {
    LoroHqlQueryExtended,
    QueryResult
} from '$lib/KERNEL/hominio-types';

// --- Type Definitions for Query Results (Helper Types) ---
type AggregatedPrenuResult = QueryResult & {
    prenuPubkey: string;
    name?: string;
};

/**
 * Queries prenus (people) using HQL and resolves their names.
 * @param parameters Tool parameters (currently unused)
 * @returns Result as JSON string
 */
export async function queryPrenusImplementation(parameters: ToolParameters): Promise<string> {
    console.log('[queryPrenus HQL] Called with parameters:', parameters);
    try {
        // Use the provided HQL steps
        const query: LoroHqlQueryExtended = {
            steps: [
                {
                    action: 'find',
                    target: {
                        schema: '0xc6025f573842e81ac505d29f4a77ac822a3e4db4f227c319ba6c54f927e1b663'
                    },
                    variables: {
                        prenuPubkey: { source: 'link.x1' }
                    },
                    resultVariable: 'prenuPubkeys',
                    return: 'array'
                },
                {
                    action: 'find',
                    target: {
                        schema: '0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96'
                    },
                    variables: {
                        entityId: { source: 'link.x1' },
                        nameLeafId: { source: 'link.x2' }
                    },
                    resultVariable: 'nameLinks',
                    return: 'array'
                },
                {
                    action: 'join',
                    left: { variable: 'prenuPubkeys', key: 'prenuPubkey' },
                    right: { variable: 'nameLinks', key: 'entityId' },
                    type: 'left',
                    select: {
                        prenuPubkey: { source: 'left.prenuPubkey' },
                        nameLeafId: { source: 'right.nameLeafId' }
                    },
                    resultVariable: 'prenusWithNames'
                },
                {
                    action: 'resolve',
                    fromVariable: 'prenusWithNames',
                    resolveFields: {
                        name: {
                            type: 'resolveLeafValue',
                            pubkeyVar: 'nameLeafId',
                            fallbackVar: 'prenuPubkey'
                        }
                    },
                    resultVariable: 'resolvedPrenus'
                }
            ]
        };

        // Execute the query
        const rawResults = await o.query(query) as AggregatedPrenuResult[];

        if (!Array.isArray(rawResults)) {
            throw new Error('HQL query did not return an array.');
        }

        const result = {
            success: true,
            message: `Retrieved ${rawResults.length} prenus with names.`,
            prenus: rawResults
        };

        logToolActivity('queryPrenus', result.message);
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in queryPrenus HQL tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logToolActivity('queryPrenus', `Error: ${errorMessage}`, false);
        return JSON.stringify({ success: false, message: `Error querying prenus: ${errorMessage}`, prenus: [] });
    }
} 