import { o } from '$lib/KERNEL/hominio-svelte'; // Import Hominio facade
import { GENESIS_PUBKEY } from '$db/constants';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import type {
    IndexLeafType,
    LoroHqlQueryExtended,
    MutateHqlRequest,
    CreateMutationOperation,
    QueryResult
} from '$lib/KERNEL/hominio-types';

// --- Static Leaf IDs --- (Keep for now, needed for default status)
const STATUS_NOT_STARTED_ID =
    '0x3b302f86a7873b6533959d80c53efec82ce28ea3fd540da3ed90dd26cac76bde';

// --- Type Definitions for Query Results (Helper Types) ---
type MetaIndexResult = QueryResult & { variables: { index_map: Partial<Record<IndexLeafType, string>> } };
type SchemasIndexResult = QueryResult & { variables: { schema_map: Record<string, string> } };
type UserIdLeafResult = QueryResult & { _sourceKey: string, variables: { userIdValue: string } };
type PonseLinkResult = QueryResult & { variables: { personConceptPubKeyVar: string } };

// --- Helper: Fetch Schema Pubkeys using HQL ---
// In a real app, cache this, but for simplicity fetch each time for the tool
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

// --- Helper: Find User's Person Concept PubKey ---
async function findUserPersonConceptPubKey(ponseSchemaPubKey: string): Promise<string | null> {
    const user = o.me();
    if (!user) return null; // Cannot proceed without user

    const findPersonQuery: LoroHqlQueryExtended = {
        steps: [
            {
                action: 'find',
                target: { schema: ponseSchemaPubKey },
                variables: {
                    userIdLeafPubKeyVar: { source: 'link.x1' },
                    personConceptPubKeyVar: { source: 'link.x2' }
                },
                resultVariable: 'ponseLinks',
                return: 'array'
            },
            {
                action: 'get',
                from: { variable: 'ponseLinks', sourceKey: 'userIdLeafPubKeyVar', targetDocType: 'Leaf' },
                fields: { userIdValue: { field: 'self.data.value' } },
                resultVariable: 'userIdLeafDetails'
            }
        ]
    };

    try {
        const result = await o.query(findPersonQuery);
        let personPubKey: string | null = null;

        if (result && Array.isArray(result)) {
            // Cast the result to the specific type
            const userIdDetails = result as UserIdLeafResult[];
            const matchingUserIdLeaf = userIdDetails.find(
                (item) => item.variables.userIdValue === user.id
            );

            if (matchingUserIdLeaf) {
                const findLinkAgainQuery: LoroHqlQueryExtended = {
                    steps: [
                        {
                            action: 'find',
                            target: { schema: ponseSchemaPubKey, x1: matchingUserIdLeaf._sourceKey },
                            variables: { personConceptPubKeyVar: { source: 'link.x2' } },
                            resultVariable: 'foundLink',
                            return: 'first'
                        }
                    ]
                };
                const linkResult = await o.query(findLinkAgainQuery);
                if (
                    linkResult && Array.isArray(linkResult) && linkResult.length > 0 && linkResult[0] &&
                    typeof linkResult[0].variables === 'object' && linkResult[0].variables !== null &&
                    'personConceptPubKeyVar' in linkResult[0].variables &&
                    typeof (linkResult[0] as PonseLinkResult).variables.personConceptPubKeyVar === 'string'
                ) {
                    personPubKey = (linkResult[0] as PonseLinkResult).variables.personConceptPubKeyVar;
                }
            }
        }
        if (!personPubKey) console.warn(`[createTodo] Could not find person concept for user ${user.id}`);
        return personPubKey;
    } catch (err) {
        console.error('[findUserPersonConceptPubKey] Error:', err);
        return null;
    }
}

/**
 * Legacy implementation for Ultravox compatibility, now using HQL.
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export async function createTodoImplementation(parameters: ToolParameters): Promise<string> {
    console.log('Called createTodo tool with parameters (HQL):', parameters);

    try {
        // Handle both object and string parameter formats
        let parsedParams: Record<string, unknown> = {};

        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try { parsedParams = JSON.parse(parameters); } catch (parseError) {
                console.warn('[createTodo] Failed to parse parameters string:', parameters, parseError);
            }
        }

        // Extract parameters
        const todoText = parsedParams.todoText as string | undefined;
        const tagsString = parsedParams.tags as string | undefined;

        if (!todoText || typeof todoText !== 'string' || !todoText.trim()) {
            return JSON.stringify({ success: false, message: 'Invalid todo text provided' });
        }

        // Fetch required schema pubkeys
        const requiredSchemas = ['tcini', 'cneme', 'ponse', 'ckaji', 'gunka']; // Added gunka
        const schemaPubkeys = await fetchSchemaPubkeys(requiredSchemas);
        const tciniPubKey = schemaPubkeys['tcini'];
        const cnemePubKey = schemaPubkeys['cneme'];
        const ponsePubKey = schemaPubkeys['ponse'];
        const ckajiPubKey = schemaPubkeys['ckaji'];
        const gunkaPubKey = schemaPubkeys['gunka']; // Fetch gunka

        if (!tciniPubKey || !cnemePubKey || !ponsePubKey || !ckajiPubKey || !gunkaPubKey) { // Added gunka check
            const missing = requiredSchemas.filter(n => !schemaPubkeys[n]).join(', ');
            throw new Error(`Could not load required schema pubkeys: ${missing}`);
        }

        // Find user's person concept
        const workerPubKey = await findUserPersonConceptPubKey(ponsePubKey);
        if (!workerPubKey) {
            throw new Error('Could not find the person concept linked to the current user.');
        }

        // Prepare mutations
        const mutations: CreateMutationOperation[] = [];

        // 1. Create Task Concept Leaf
        mutations.push({
            operation: 'create',
            type: 'Leaf',
            placeholder: '$$newTask',
            data: { type: 'Concept' }
        });

        // 2. Create Task Name Leaf
        mutations.push({
            operation: 'create',
            type: 'Leaf',
            placeholder: '$$taskName',
            data: { type: 'LoroText', value: todoText.trim() }
        });

        // 3. Create Name Link (cneme: task -> name)
        mutations.push({
            operation: 'create',
            type: 'Composite',
            placeholder: '$$cnemeLink',
            data: {
                schemaId: cnemePubKey,
                places: { x1: '$$newTask', x2: '$$taskName' }
            }
        });

        // 4. Create Status Link (tcini: task -> status)
        mutations.push({
            operation: 'create',
            type: 'Composite',
            placeholder: '$$tciniLink',
            data: {
                schemaId: tciniPubKey,
                places: { x1: '$$newTask', x2: STATUS_NOT_STARTED_ID }
            }
        });

        // 5. Create Assignment Link (gunka: worker -> task)
        mutations.push({
            operation: 'create',
            type: 'Composite',
            placeholder: '$$gunkaLink',
            data: {
                schemaId: gunkaPubKey, // Now defined
                places: {
                    x1: workerPubKey,
                    x2: '$$newTask'
                    // Goal (x3) is omitted here, but could be added if needed
                }
            }
        });

        // 6. Create Tag Links (ckaji: task -> tag) - If tags are provided
        const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(t => t) : [];
        for (let i = 0; i < tags.length; i++) {
            const tagName = tags[i];
            const tagPlaceholder = `$$tagLeaf${i}`;
            const linkPlaceholder = `$$tagLink${i}`;

            // 6a. Create Tag Leaf (or find existing - simple create for now)
            mutations.push({
                operation: 'create', // TODO: Ideally find-or-create
                type: 'Leaf',
                placeholder: tagPlaceholder,
                data: { type: 'LoroText', value: tagName }
            });

            // 6b. Create Tag Link (ckaji)
            mutations.push({
                operation: 'create',
                type: 'Composite',
                placeholder: linkPlaceholder,
                data: {
                    schemaId: ckajiPubKey,
                    places: { x1: '$$newTask', x2: tagPlaceholder }
                }
            });
        }

        // Execute mutation
        const request: MutateHqlRequest = { mutations };
        const result = await o.mutate(request);

        if (result.status === 'success') {
            console.log('Todo created via HQL successfully:', result.generatedPubKeys);
            logToolActivity('createTodo', `Todo created: ${todoText}`);
            return JSON.stringify({ success: true, message: `Created todo: "${todoText}"` });
        } else {
            console.error('Failed to create todo via HQL:', result.message, result.errorDetails);
            logToolActivity('createTodo', `HQL Error: ${result.message}`, false);
            return JSON.stringify({ success: false, message: `HQL Error: ${result.message}` });
        }
    } catch (error) {
        console.error('Error in createTodo HQL tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logToolActivity('createTodo', `Error: ${errorMessage}`, false);
        return JSON.stringify({ success: false, message: `Error creating todo: ${errorMessage}` });
    }
}

// Removed the old execute function as it's superseded by createTodoImplementation for tools 