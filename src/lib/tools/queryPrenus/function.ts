import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import { o } from '$lib/KERNEL/hominio-svelte';
import type {
    LoroHqlQueryExtended,
    QueryResult
} from '$lib/KERNEL/hominio-types';

// --- Type Definitions for Query Results (Helper Types) ---
// Export the type so it can be imported by other modules
export type AggregatedPrenuResult = QueryResult & {
    prenuPubkey: string;
    name?: string;
    walletAddress?: string;
};

// Resolved Schema IDs (Replace with actual resolved IDs if known, otherwise keep placeholders for seeding)
// TODO: Ideally fetch these dynamically or read from a shared constants file
const prenuSchemaId = '0xc6025f573842e81ac505d29f4a77ac822a3e4db4f227c319ba6c54f927e1b663';
const cnemeSchemaId = '0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96';
const ponseSchemaId = '0xff494b92bc1a534343fe5182f3f4c0c7c825a99eee6e909496614fa422ca94ec'; // Assuming this is resolved ponse ID

/**
 * Queries prenus (people) using HQL and resolves their names and wallet addresses.
 * @param parameters Tool parameters (currently unused)
 * @returns Result as JSON string
 */
export async function queryPrenusImplementation(parameters: ToolParameters): Promise<string> {
    console.log('[queryPrenus HQL] Called with parameters:', parameters);
    try {
        // Use the HQL query including wallet address resolution
        const query: LoroHqlQueryExtended = {
            steps: [
                // 1. Find all prenu links (prenuPubkey is the person concept)
                {
                    action: 'find',
                    target: { schema: prenuSchemaId },
                    variables: { prenuPubkey: { source: 'link.x1' } },
                    resultVariable: 'prenuLinks',
                    return: 'array'
                },
                // 2. Find name links (cneme: prenu -> nameLeaf)
                {
                    action: 'find',
                    target: { schema: cnemeSchemaId },
                    variables: {
                        prenuForName: { source: 'link.x1' },
                        nameLeaf: { source: 'link.x2' }
                    },
                    resultVariable: 'cnemeLinks',
                    return: 'array'
                },
                // 3. Find wallet ownership links (ponse: prenu -> walletConcept)
                {
                    action: 'find',
                    target: { schema: ponseSchemaId }, // Use ponse schema
                    variables: {
                        prenuOwner: { source: 'link.x1' },
                        walletConcept: { source: 'link.x2' }
                    },
                    resultVariable: 'ponseWalletLinks',
                    return: 'array'
                },
                // 4. Find wallet address links (cneme: walletConcept -> walletAddressLeaf)
                {
                    action: 'find',
                    target: { schema: cnemeSchemaId }, // Use cneme schema again
                    variables: {
                        walletForAddress: { source: 'link.x1' },
                        walletAddressLeaf: { source: 'link.x2' }
                    },
                    resultVariable: 'cnemeWalletAddressLinks',
                    return: 'array'
                },
                // 5. Join prenuLinks with cnemeLinks (get prenu + nameLeaf)
                {
                    action: 'join',
                    left: { variable: 'prenuLinks', key: 'prenuPubkey' },
                    right: { variable: 'cnemeLinks', key: 'prenuForName' },
                    type: 'left',
                    select: {
                        prenuPubkey: { source: 'left.prenuPubkey' },
                        nameLeafId: { source: 'right.nameLeaf' }
                    },
                    resultVariable: 'prenusWithNameLeaf'
                },
                // 6. Join prenusWithNameLeaf with ponseWalletLinks (add walletConcept)
                {
                    action: 'join',
                    left: { variable: 'prenusWithNameLeaf', key: 'prenuPubkey' },
                    right: { variable: 'ponseWalletLinks', key: 'prenuOwner' },
                    type: 'left',
                    select: {
                        prenuPubkey: { source: 'left.prenuPubkey' },
                        nameLeafId: { source: 'left.nameLeafId' },
                        walletConceptId: { source: 'right.walletConcept' }
                    },
                    resultVariable: 'prenusWithWalletConcept'
                },
                // 7. Join prenusWithWalletConcept with cnemeWalletAddressLinks (add walletAddressLeaf)
                {
                    action: 'join',
                    left: { variable: 'prenusWithWalletConcept', key: 'walletConceptId' },
                    right: { variable: 'cnemeWalletAddressLinks', key: 'walletForAddress' },
                    type: 'left',
                    select: {
                        prenuPubkey: { source: 'left.prenuPubkey' },
                        nameLeafId: { source: 'left.nameLeafId' },
                        walletAddressLeafId: { source: 'right.walletAddressLeaf' }
                    },
                    resultVariable: 'prenusWithWalletAddressLeaf'
                },
                // 8. Resolve name and wallet address
                {
                    action: 'resolve',
                    fromVariable: 'prenusWithWalletAddressLeaf',
                    resolveFields: {
                        name: {
                            type: 'resolveLeafValue',
                            pubkeyVar: 'nameLeafId',
                            fallbackVar: 'prenuPubkey',
                            valueField: 'value'
                        },
                        walletAddress: {
                            type: 'resolveLeafValue',
                            pubkeyVar: 'walletAddressLeafId',
                            fallbackVar: 'walletAddressLeafId',
                            valueField: 'value'
                        }
                    },
                    resultVariable: 'resolvedPrenusWithWallet'
                }
            ]
        };

        // Execute the query
        // Cast to the updated result type
        const rawResults = await o.query(query) as AggregatedPrenuResult[];

        if (!Array.isArray(rawResults)) {
            throw new Error('HQL query did not return an array.');
        }

        // The rawResults should now include prenuPubkey, name?, and walletAddress?
        const result = {
            success: true,
            message: `Retrieved ${rawResults.length} prenus with names and wallets.`,
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