// Implementation extracted from hominio/+page.svelte
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import { o } from '$lib/KERNEL/hominio-svelte'; // Import Hominio facade
import { GENESIS_PUBKEY } from '$db/constants';
import type {
    IndexLeafType,
    LoroHqlQueryExtended,
    MutateHqlRequest,
    UpdateMutationOperation,
    QueryResult
} from '$lib/KERNEL/hominio-types';

/**
 * Updates a todo item's text or status using HQL, identified by taskId.
 * @param parameters Tool parameters ('taskId', 'newText', 'status')
 * @returns Result as JSON string
 */
export async function updateTodoImplementation(parameters: ToolParameters): Promise<string> {
    console.log('[updateTodo HQL - ID Based] Called with parameters:', parameters);

    try {
        // 1. Parse Parameters
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try { parsedParams = JSON.parse(parameters); } catch (parseError) {
                console.warn('[updateTodo HQL - ID Based] Failed to parse parameters string:', parameters, parseError);
            }
        }

        const taskId = parsedParams.taskId as string | undefined; // Use taskId directly
        const newText = parsedParams.newText as string | undefined;
        const status = parsedParams.status as string | undefined;

        if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
            return JSON.stringify({ success: false, message: "Missing required parameter: 'taskId'." });
        }
        if (!newText && !status) {
            return JSON.stringify({ success: false, message: "No update provided. Specify 'newText' or 'status'." });
        }

        let targetStatusPubKey: string | null = null;
        if (status) {
            targetStatusPubKey = STATUS_MAP[status.toLowerCase()];
            if (!targetStatusPubKey) {
                return JSON.stringify({ success: false, message: `Invalid status provided: '${status}'. Use 'not started', 'in progress', or 'done'.` });
            }
        }

        // 2. Fetch Schema Pubkeys
        // Fetch cneme only if updating text, tcini only if updating status
        const schemasToFetch = [];
        if (newText) schemasToFetch.push('cneme');
        if (status) schemasToFetch.push('tcini');

        const schemaPubkeys = await fetchSchemaPubkeys(schemasToFetch);
        const cnemePubKey = schemaPubkeys['cneme'];
        const tciniPubKey = schemaPubkeys['tcini'];

        if (newText && !cnemePubKey) {
            throw new Error(`Could not load required schema pubkey: cneme (needed for text update)`);
        }
        if (status && !tciniPubKey) {
            throw new Error(`Could not load required schema pubkey: tcini (needed for status update)`);
        }

        // 3. Prepare Mutations
        const mutations: UpdateMutationOperation[] = [];
        let nameLeafPubKey: string | null = null; // Need to find this if updating text

        // 3a. Update Name Leaf if newText is provided
        if (newText && typeof newText === 'string') {
            if (!cnemePubKey) throw new Error('Internal error: cnemePubKey not fetched but newText provided.'); // Should not happen due to check above

            // Find the Name Leaf PubKey associated with this taskId via cneme
            console.log(`[updateTodo HQL DEBUG] Attempting to find name leaf for task: ${taskId} using cneme: ${cnemePubKey}`); // DEBUG
            const findNameLeafQuery: LoroHqlQueryExtended = {
                steps: [
                    {
                        action: 'find',
                        target: { schema: cnemePubKey, x1: taskId }, // Find link where task is x1
                        variables: { nameLeafPubKeyVar: { source: 'link.x2' } }, // Get x2 (name leaf)
                        resultVariable: 'foundCnemeLink',
                        return: 'first'
                    }
                ]
            };
            const nameLeafLinkResult = await o.query(findNameLeafQuery) as NameLeafLinkResult[];
            nameLeafPubKey = nameLeafLinkResult?.[0]?.variables?.nameLeafPubKeyVar ?? null;

            // <<< DEBUG LOGGING >>>
            console.log(`[updateTodo HQL DEBUG] Find name leaf query result:`, { nameLeafLinkResult: JSON.stringify(nameLeafLinkResult) });
            console.log(`[updateTodo HQL DEBUG] Found nameLeafPubKey for text update: ${nameLeafPubKey}`);

            if (!nameLeafPubKey) {
                console.warn(`[updateTodo HQL - ID Based] Could not find name leaf link (cneme) for task ${taskId}. Cannot update text.`);
                // Optionally return an error or just skip the text update
                return JSON.stringify({ success: false, message: `Could not find name link for task ${taskId} to update text.` });
            } else {
                console.log(`[updateTodo HQL DEBUG] Found nameLeaf ${nameLeafPubKey} for task ${taskId}. Adding text update mutation.`); // DEBUG
                mutations.push({
                    operation: 'update',
                    type: 'Leaf',
                    targetPubKey: nameLeafPubKey,
                    data: { value: newText.trim() }
                });
            }
        }

        // 3b. Update Status Link if status is provided
        if (targetStatusPubKey) {
            if (!tciniPubKey) throw new Error('Internal error: tciniPubKey not fetched but status provided.'); // Should not happen

            // Find the existing tcini link for this task (using taskId directly)
            console.log(`[updateTodo HQL DEBUG] Attempting to find tcini link for task: ${taskId}`);
            const findTciniLinkQuery: LoroHqlQueryExtended = {
                steps: [
                    {
                        action: 'find',
                        target: { schema: tciniPubKey, x1: taskId }, // Find link where task is x1
                        variables: { linkId: { source: 'link.pubkey' }, currentStatusLeafId: { source: 'link.x2' } },
                        return: 'first',
                        resultVariable: 'foundLink'
                    }
                ]
            };
            const tciniLinkResult = await o.query(findTciniLinkQuery) as TciniLinkResult[];
            const tciniLinkId = tciniLinkResult?.[0]?.variables?.linkId;
            const currentStatusLeafId = tciniLinkResult?.[0]?.variables?.currentStatusLeafId;

            console.log(`[updateTodo HQL DEBUG] Find tcini link result:`, { tciniLinkResult: JSON.stringify(tciniLinkResult) });
            console.log(`[updateTodo HQL DEBUG] Found tciniLinkId: ${tciniLinkId}, currentStatusLeafId: ${currentStatusLeafId}, targetStatusPubKey: ${targetStatusPubKey}`);

            if (!tciniLinkId) {
                const errorMsg = `Could not find status link (tcini) for task ${taskId} to update.`;
                console.error('[updateTodo HQL - ID Based]', errorMsg);
                throw new Error(errorMsg);
            }

            console.log(`[updateTodo HQL DEBUG] Comparing current status '${currentStatusLeafId}' with target '${targetStatusPubKey}'`);
            if (currentStatusLeafId !== targetStatusPubKey) {
                console.log(`[updateTodo HQL DEBUG] Status needs update. Adding mutation for link ${tciniLinkId}.`);
                mutations.push({
                    operation: 'update',
                    type: 'Composite',
                    targetPubKey: tciniLinkId,
                    data: { places: { x2: targetStatusPubKey } }
                });
            } else {
                console.log('[updateTodo HQL - ID Based] Status is already set to the target value, skipping status update.');
            }
        }

        // 4. Execute Mutations (if any)
        if (mutations.length > 0) {
            const request: MutateHqlRequest = { mutations };
            const result = await o.mutate(request);

            if (result.status === 'success') {
                const updatedFields = [];
                if (newText && nameLeafPubKey) updatedFields.push('text'); // Only report text update if leaf was found
                if (targetStatusPubKey && mutations.some(m => m.type === 'Composite')) updatedFields.push('status');
                let message = 'No effective changes applied.';
                if (updatedFields.length > 0) {
                    message = `Successfully updated ${updatedFields.join(' and ')} for todo ID ${taskId}.`;
                }
                logToolActivity('updateTodo', message);
                return JSON.stringify({ success: true, message });
            } else {
                console.error('Failed to update todo via HQL:', result.message, result.errorDetails);
                logToolActivity('updateTodo', `HQL Error: ${result.message}`, false);
                return JSON.stringify({ success: false, message: `HQL Error: ${result.message}` });
            }
        } else {
            // No mutations were needed
            const message = `No changes needed for todo ID ${taskId}.`;
            logToolActivity('updateTodo', message);
            return JSON.stringify({ success: true, message });
        }
    } catch (error) {
        console.error('Error in updateTodo HQL tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logToolActivity('updateTodo', `Error: ${errorMessage}`, false);
        return JSON.stringify({ success: false, message: `Error updating todo: ${errorMessage}` });
    }
}

// --- Type Definitions --- (Similar to queryTodos)
type MetaIndexResult = QueryResult & { variables: { index_map: Partial<Record<IndexLeafType, string>> } };
type SchemasIndexResult = QueryResult & { variables: { schema_map: Record<string, string> } };
// Type for finding the name leaf pubkey via cneme link
type NameLeafLinkResult = QueryResult & { variables: { nameLeafPubKeyVar: string } };
// Type for finding tcini link
type TciniLinkResult = QueryResult & { variables: { linkId: string, currentStatusLeafId: string } };

// --- Static Leaf IDs --- (Status IDs needed)
const STATUS_NOT_STARTED_ID =
    '0x3b302f86a7873b6533959d80c53efec82ce28ea3fd540da3ed90dd26cac76bde';
const STATUS_IN_PROGRESS_ID =
    '0x05447c2f4716f12eb30e49fad68e94aa017edeb6778610b96eb2f4b61c6c029e';
const STATUS_COMPLETED_ID =
    '0xe3110ac83fd5ef52cf91873b8a94ef6662cd03d5eb433d51922942e834d63c66';

const STATUS_MAP: Record<string, string> = {
    'not started': STATUS_NOT_STARTED_ID,
    'in progress': STATUS_IN_PROGRESS_ID,
    'done': STATUS_COMPLETED_ID
};

// --- Helper: Fetch Schema Pubkeys --- (Can be shared or copied)
async function fetchSchemaPubkeys(schemaNames: string[]): Promise<Record<string, string | null>> {
    try {
        const metaIndexQuery: LoroHqlQueryExtended = {
            steps: [
                { action: 'get', from: { pubkey: [GENESIS_PUBKEY], targetDocType: 'Leaf' }, fields: { index_map: { field: 'self.data.value' } }, resultVariable: 'metaIndex' }
            ]
        };
        const metaResult = await o.query(metaIndexQuery);
        let schemasIndexPubKey: string | null = null;
        if (metaResult && metaResult.length > 0 && metaResult[0].variables && typeof metaResult[0].variables === 'object' && metaResult[0].variables !== null && 'index_map' in metaResult[0].variables && typeof metaResult[0].variables.index_map === 'object') {
            const indexRegistry = (metaResult[0] as MetaIndexResult).variables.index_map;
            schemasIndexPubKey = indexRegistry['schemas'] ?? null;
        } else { throw new Error('Meta Index query failed.'); }
        if (!schemasIndexPubKey) throw new Error("Could not find 'schemas' index pubkey.");

        const schemasIndexQuery: LoroHqlQueryExtended = {
            steps: [
                { action: 'get', from: { pubkey: [schemasIndexPubKey], targetDocType: 'Leaf' }, fields: { schema_map: { field: 'self.data.value' } }, resultVariable: 'schemasIndexData' }
            ]
        };
        const schemasResult = await o.query(schemasIndexQuery);
        if (schemasResult && schemasResult.length > 0 && schemasResult[0].variables && typeof schemasResult[0].variables === 'object' && schemasResult[0].variables !== null && 'schema_map' in schemasResult[0].variables && typeof schemasResult[0].variables.schema_map === 'object') {
            const schemaMap = (schemasResult[0] as SchemasIndexResult).variables.schema_map;
            const result: Record<string, string | null> = {};
            for (const name of schemaNames) { result[name] = schemaMap[name] ?? null; }
            return result;
        } else { throw new Error('Schemas index query failed.'); }
    } catch (err) {
        console.error('[fetchSchemaPubkeys] Error:', err);
        const errorResult: Record<string, string | null> = {};
        schemaNames.forEach(name => errorResult[name] = null);
        return errorResult;
    }
} 