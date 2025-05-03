import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import { o } from '$lib/KERNEL/hominio-svelte'; // Import Hominio facade
import { GENESIS_PUBKEY } from '$db/constants';
import type {
    IndexLeafType,
    LoroHqlQueryExtended,
    QueryResult
} from '$lib/KERNEL/hominio-types';

// REMOVED old execute function

// --- Type Definitions for Query Results (Helper Types) ---
type MetaIndexResult = QueryResult & { variables: { index_map: Partial<Record<IndexLeafType, string>> } };
type SchemasIndexResult = QueryResult & { variables: { schema_map: Record<string, string> } };
// Added specific type for the final aggregated result before filtering
type AggregatedTodoResult = QueryResult & {
    taskId: string;
    statusLeafId?: string; // Make optional as it might be missing
    tags?: string[]; // Make optional
    // Add other expected fields if needed for type safety
    taskName?: string;
    workerName?: string;
};

// --- Helper: Fetch Schema Pubkeys using HQL --- (Copied from createTodo/function.ts)
async function fetchSchemaPubkeys(schemaNames: string[]): Promise<Record<string, string | null>> {
    try {
        // Step 1: Get Schemas Index PubKey from Genesis
        const metaIndexQuery: LoroHqlQueryExtended = {
            steps: [
                {
                    action: 'get',
                    from: { pubkey: [GENESIS_PUBKEY], targetDocType: 'Leaf' },
                    fields: { index_map: { field: 'self.data.value' } },
                    resultVariable: 'metaIndex'
                }
            ]
        };
        const metaResult = await o.query(metaIndexQuery);
        let schemasIndexPubKey: string | null = null;
        if (
            metaResult && metaResult.length > 0 && metaResult[0].variables &&
            typeof metaResult[0].variables === 'object' && metaResult[0].variables !== null &&
            'index_map' in metaResult[0].variables && typeof metaResult[0].variables.index_map === 'object'
        ) {
            const indexRegistry = (metaResult[0] as MetaIndexResult).variables.index_map;
            schemasIndexPubKey = indexRegistry['schemas'] ?? null;
        } else {
            throw new Error('Meta Index query failed or missing index_map.');
        }
        if (!schemasIndexPubKey) throw new Error("Could not find 'schemas' index pubkey.");

        // Step 2: Get Schema Map from Schemas Index
        const schemasIndexQuery: LoroHqlQueryExtended = {
            steps: [
                {
                    action: 'get',
                    from: { pubkey: [schemasIndexPubKey], targetDocType: 'Leaf' },
                    fields: { schema_map: { field: 'self.data.value' } },
                    resultVariable: 'schemasIndexData'
                }
            ]
        };
        const schemasResult = await o.query(schemasIndexQuery);
        if (
            schemasResult && schemasResult.length > 0 && schemasResult[0].variables &&
            typeof schemasResult[0].variables === 'object' && schemasResult[0].variables !== null &&
            'schema_map' in schemasResult[0].variables && typeof schemasResult[0].variables.schema_map === 'object'
        ) {
            const schemaMap = (schemasResult[0] as SchemasIndexResult).variables.schema_map;
            const result: Record<string, string | null> = {};
            for (const name of schemaNames) {
                result[name] = schemaMap[name] ?? null;
            }
            return result;
        } else {
            throw new Error('Schemas index query failed or missing schema_map.');
        }
    } catch (err) {
        console.error('[fetchSchemaPubkeys] Error:', err);
        const errorResult: Record<string, string | null> = {};
        schemaNames.forEach(name => errorResult[name] = null);
        return errorResult;
    }
}

// --- Static Leaf IDs (for filtering by completed status) ---
const STATUS_COMPLETED_ID = '0xe3110ac83fd5ef52cf91873b8a94ef6662cd03d5eb433d51922942e834d63c66';
// REMOVED unused status constants

/**
 * Queries todos using HQL, similar to TodoView.svelte, with filtering.
 * @param parameters Tool parameters (tag, completed)
 * @returns Result as JSON string
 */
export async function queryTodosImplementation(parameters: ToolParameters): Promise<string> {
    console.log('[queryTodos HQL] Called with parameters:', parameters);

    try {
        // Extract parameters
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try { parsedParams = JSON.parse(parameters); } catch (parseError) {
                console.warn('[queryTodos HQL] Failed to parse parameters string:', parameters, parseError);
            }
        }
        const filterTag = parsedParams.tag as string | null | undefined;
        const filterCompleted = typeof parsedParams.completed === 'boolean' ? parsedParams.completed : undefined;

        // Fetch required schema pubkeys
        const requiredSchemas = ['tcini', 'cneme', 'gunka', 'ckaji'];
        const schemaPubkeys = await fetchSchemaPubkeys(requiredSchemas);
        const tciniPubKey = schemaPubkeys['tcini'];
        const cnemePubKey = schemaPubkeys['cneme'];
        const gunkaPubKey = schemaPubkeys['gunka'];
        const ckajiPubKey = schemaPubkeys['ckaji'];

        if (!tciniPubKey || !cnemePubKey || !gunkaPubKey || !ckajiPubKey) {
            const missing = requiredSchemas.filter(n => !schemaPubkeys[n]).join(', ');
            throw new Error(`Could not load required schema pubkeys: ${missing}`);
        }

        // Construct the base HQL query (identical to TodoView)
        const query: LoroHqlQueryExtended = {
            steps: [
                // 1. Find Task Status Links
                {
                    action: 'find',
                    target: { schema: tciniPubKey },
                    variables: { taskIdVar: { source: 'link.x1' }, statusLeafVar: { source: 'link.x2' } },
                    resultVariable: 'taskStatusLinks',
                    return: 'array'
                },
                // 2. Find Task Name Links
                {
                    action: 'find',
                    target: { schema: cnemePubKey },
                    variables: { taskForNameVar: { source: 'link.x1' }, nameLeafVar: { source: 'link.x2' } },
                    resultVariable: 'taskNameLinks',
                    return: 'array'
                },
                // 2b. Find Worker Assignment Links
                {
                    action: 'find',
                    target: { schema: gunkaPubKey },
                    variables: {
                        workerIdVar: { source: 'link.x1' },
                        assignedTaskVar: { source: 'link.x2' }
                    },
                    resultVariable: 'taskAssignmentLinks',
                    return: 'array'
                },
                // 2c. Find Worker Name Links
                {
                    action: 'find',
                    target: { schema: cnemePubKey },
                    variables: {
                        workerForNameVar: { source: 'link.x1' },
                        workerNameLeafVar: { source: 'link.x2' }
                    },
                    resultVariable: 'workerNameLinks',
                    return: 'array'
                },
                // 3. Join Status and Name
                {
                    action: 'join',
                    left: { variable: 'taskStatusLinks', key: 'taskIdVar' },
                    right: { variable: 'taskNameLinks', key: 'taskForNameVar' },
                    type: 'left',
                    select: {
                        taskId: { source: 'left.taskIdVar' },
                        statusLeafId: { source: 'left.statusLeafVar' },
                        nameLeafId: { source: 'right.nameLeafVar' }
                    },
                    resultVariable: 'baseTaskInfo'
                },
                // 3b. Join Worker Assignment
                {
                    action: 'join',
                    left: { variable: 'baseTaskInfo', key: 'taskId' },
                    right: { variable: 'taskAssignmentLinks', key: 'assignedTaskVar' },
                    type: 'left',
                    select: {
                        taskId: { source: 'left.taskId' },
                        statusLeafId: { source: 'left.statusLeafId' },
                        nameLeafId: { source: 'left.nameLeafId' },
                        workerId: { source: 'right.workerIdVar' }
                    },
                    resultVariable: 'taskWithWorkerInfo'
                },
                // 3c. Join Worker Name
                {
                    action: 'join',
                    left: { variable: 'taskWithWorkerInfo', key: 'workerId' },
                    right: { variable: 'workerNameLinks', key: 'workerForNameVar' },
                    type: 'left',
                    select: {
                        taskId: { source: 'left.taskId' },
                        statusLeafId: { source: 'left.statusLeafId' },
                        nameLeafId: { source: 'left.nameLeafId' },
                        workerId: { source: 'left.workerId' },
                        workerNameLeafId: { source: 'right.workerNameLeafVar' }
                    },
                    resultVariable: 'taskWithWorkerNameInfo'
                },
                // 4. Find Task Tag Links
                {
                    action: 'find',
                    target: { schema: ckajiPubKey },
                    variables: { taskForTagVar: { source: 'link.x1' }, tagLeafVar: { source: 'link.x2' } },
                    resultVariable: 'taskTagLinks',
                    return: 'array'
                },
                // 5. Join Tags
                {
                    action: 'join',
                    left: { variable: 'taskWithWorkerNameInfo', key: 'taskId' },
                    right: { variable: 'taskTagLinks', key: 'taskForTagVar' },
                    type: 'left',
                    select: {
                        taskId: { source: 'left.taskId' },
                        statusLeafId: { source: 'left.statusLeafId' },
                        nameLeafId: { source: 'left.nameLeafId' },
                        workerId: { source: 'left.workerId' },
                        workerNameLeafId: { source: 'left.workerNameLeafId' },
                        tagLeafId: { source: 'right.tagLeafVar' }
                    },
                    resultVariable: 'taskWithTagsInfo'
                },
                // 6. Resolve Leaves
                {
                    action: 'resolve',
                    fromVariable: 'taskWithTagsInfo',
                    resolveFields: {
                        taskName: { type: 'resolveLeafValue', pubkeyVar: 'nameLeafId', fallbackVar: 'taskId' },
                        workerName: { type: 'resolveLeafValue', pubkeyVar: 'workerNameLeafId', fallbackVar: 'workerId' },
                        status: { type: 'resolveLeafValue', pubkeyVar: 'statusLeafId', fallbackVar: 'statusLeafId' },
                        tag: { type: 'resolveLeafValue', pubkeyVar: 'tagLeafId', fallbackVar: '' }
                    },
                    resultVariable: 'resolvedTodosWithTags'
                },
                // 7. Aggregate
                {
                    action: 'aggregate',
                    fromVariable: 'resolvedTodosWithTags',
                    groupByKey: 'taskId',
                    aggregateFields: {
                        taskName: { sourceField: 'taskName', operation: 'first' },
                        workerName: { sourceField: 'workerName', operation: 'first' },
                        status: { sourceField: 'status', operation: 'first' },
                        statusLeafId: { sourceField: 'statusLeafId', operation: 'first' }, // Keep for filtering
                        tags: { sourceField: 'tag', operation: 'collect' }
                    },
                    resultVariable: 'allTodos' // Final pre-filter result
                }
            ]
        };

        // Execute the query
        const rawResults = await o.query(query) as AggregatedTodoResult[]; // Cast to specific type

        if (!Array.isArray(rawResults)) {
            throw new Error('HQL query did not return an array.');
        }

        // Apply filtering based on parameters
        // Ensure the mapped result conforms to AggregatedTodoResult
        let filteredResults: AggregatedTodoResult[] = rawResults.map(todo => ({
            ...todo,
            tags: Array.isArray(todo.tags) ? todo.tags.filter((t: unknown) => t !== '') : []
        }));

        if (filterTag !== undefined) {
            if (filterTag === null) {
                // Filter for todos with no tags
                filteredResults = filteredResults.filter(todo => !todo.tags || todo.tags.length === 0);
            } else {
                // Filter for todos including the specific tag
                filteredResults = filteredResults.filter(todo => todo.tags && todo.tags.includes(filterTag));
            }
        }

        if (filterCompleted !== undefined) {
            const targetStatusLeafId = filterCompleted ? STATUS_COMPLETED_ID : null; // null means not completed
            if (targetStatusLeafId) {
                // Filter for completed (use optional chaining for safety)
                filteredResults = filteredResults.filter(todo => todo.statusLeafId === targetStatusLeafId);
            } else {
                // Filter for not completed (not started OR in progress) (use optional chaining for safety)
                filteredResults = filteredResults.filter(todo => todo.statusLeafId !== STATUS_COMPLETED_ID);
            }
        }

        const result = {
            success: true,
            message: `Retrieved ${filteredResults.length} todo items.`,
            todos: filteredResults
        };

        logToolActivity('queryTodos', result.message);
        return JSON.stringify(result);

    } catch (error) {
        console.error('Error in queryTodos HQL tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logToolActivity('queryTodos', `Error: ${errorMessage}`, false);
        return JSON.stringify({ success: false, message: `Error querying todos: ${errorMessage}`, todos: [] });
    }
}

// REMOVED legacy getTodosImplementation function 