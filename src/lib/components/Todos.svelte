<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { writable, type Readable } from 'svelte/store';
	import type { LoroHqlQueryExtended, QueryResult } from '$lib/KERNEL/hominio-svelte';
	import type { MutateHqlRequest, CreateMutationOperation } from '$lib/KERNEL/hominio-mutate';
	import { GENESIS_PUBKEY } from '$db/constants';
	import type { IndexLeafType } from '$lib/KERNEL/index-registry';
	import { draggable, droppable, type DragDropState } from '@thisux/sveltednd';

	// --- Get Hominio Facade from Context ---
	const o = getContext<typeof import('$lib/KERNEL/hominio-svelte').o>('o');

	// --- Static Leaf IDs (Re-added) ---
	const STATUS_NOT_STARTED_ID =
		'0x3b302f86a7873b6533959d80c53efec82ce28ea3fd540da3ed90dd26cac76bde';
	const STATUS_IN_PROGRESS_ID =
		'0x05447c2f4716f12eb30e49fad68e94aa017edeb6778610b96eb2f4b61c6c029e';
	const STATUS_COMPLETED_ID = '0xe3110ac83fd5ef52cf91873b8a94ef6662cd03d5eb433d51922942e834d63c66';
	// --- End Static Leaf IDs ---

	// --- State ---
	let isLoadingQueryData = $state(true);
	let queryError = $state<string | null>(null);
	let mutationError = $state<string | null>(null);
	let newTodoText = $state('');
	let isAdding = $state(false);
	let todos = $state<QueryResult[]>([]);
	let selectedGoalId = $state<string | null>(null);

	// --- Schema PubKey State ---
	let isSchemaLoading = $state(true);
	let schemaError = $state<string | null>(null);
	let tciniPubKey = $state<string | null>(null);
	let gunkaPubKey = $state<string | null>(null);
	let cnemePubKey = $state<string | null>(null);
	let ponsePubKey = $state<string | null>(null);
	let ckajiPubKey = $state<string | null>(null);

	// Type for the actual map inside the schemas index
	type SchemaRegistryMap = Record<string, string>;

	// Store for the query JSON object - Start as null
	const queryStore = writable<LoroHqlQueryExtended | null>(null);

	// Create the readable store using o.subscribe
	const todoReadable: Readable<QueryResult[] | null | undefined> = o.subscribe(queryStore);

	// --- NEW: Goal List State and Query ---
	let goalList = $state<QueryResult[]>([]);
	let isGoalListLoading = $state(true);
	let goalListError = $state<string | null>(null);

	const goalListQueryStore = writable<LoroHqlQueryExtended | null>(null);

	// Update goalListReadable call using o.subscribe
	const goalListReadable: Readable<QueryResult[] | null | undefined> =
		o.subscribe(goalListQueryStore);
	// --- END NEW ---

	// --- Fetch Schemas on Mount ---
	onMount(async () => {
		isSchemaLoading = true;
		schemaError = null;
		try {
			// STEP 1: Fetch Meta Index to find the Schemas Index Pubkey
			const metaIndexQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'get',
						from: {
							pubkey: [GENESIS_PUBKEY],
							targetDocType: 'Leaf'
						},
						fields: {
							index_map: { field: 'self.data.value' }
						},
						resultVariable: 'metaIndex'
					}
				]
			};

			// Use o.query
			const metaResult = await o.query(metaIndexQuery);

			let schemasIndexPubKey: string | null = null;
			if (
				metaResult &&
				metaResult.length > 0 &&
				metaResult[0].variables &&
				(metaResult[0].variables as any).index_map &&
				typeof (metaResult[0].variables as any).index_map === 'object'
			) {
				const indexRegistry = (metaResult[0].variables as any).index_map as Partial<
					Record<IndexLeafType, string>
				>;
				schemasIndexPubKey = indexRegistry['schemas'] ?? null;
			} else {
				throw new Error('Meta Index query returned invalid data or missing index_map.');
			}

			if (!schemasIndexPubKey) {
				throw new Error("Could not find pubkey for 'schemas' index in meta-index.");
			}

			// STEP 2: Fetch the actual schemas index document using its pubkey
			const schemasIndexQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'get',
						from: {
							pubkey: [schemasIndexPubKey],
							targetDocType: 'Leaf'
						},
						fields: {
							schema_map: { field: 'self.data.value' } // Get the actual map
						},
						resultVariable: 'schemasIndexData'
					}
				]
			};

			// Use o.query
			const schemasResult = await o.query(schemasIndexQuery);

			// STEP 3: Extract the schema map from the result
			if (
				schemasResult &&
				schemasResult.length > 0 &&
				schemasResult[0].variables &&
				(schemasResult[0].variables as any).schema_map &&
				typeof (schemasResult[0].variables as any).schema_map === 'object'
			) {
				const schemaMap = (schemasResult[0].variables as any).schema_map as SchemaRegistryMap;

				// STEP 4: Get specific schema pubkeys from the map
				tciniPubKey = schemaMap['tcini'] ?? null;
				gunkaPubKey = schemaMap['gunka'] ?? null;
				cnemePubKey = schemaMap['cneme'] ?? null;
				ponsePubKey = schemaMap['ponse'] ?? null;
				ckajiPubKey = schemaMap['ckaji'] ?? null;

				if (!tciniPubKey || !gunkaPubKey || !cnemePubKey || !ponsePubKey || !ckajiPubKey) {
					const missing = ['tcini', 'gunka', 'cneme', 'ponse', 'ckaji']
						.filter((k) => !schemaMap[k])
						.join(', ');
					throw new Error(`Could not find required schema pubkeys in 'schemas' index: ${missing}`);
				}
				schemaError = null; // Clear error on success
			} else {
				throw new Error(
					"'schemas' index document query returned invalid data or missing schema_map."
				);
			}
		} catch (err) {
			console.error('[Todos] Error loading schema pubkeys:', err);
			schemaError = err instanceof Error ? err.message : 'Unknown error loading schemas.';
			tciniPubKey = null;
			gunkaPubKey = null;
			cnemePubKey = null;
			ponsePubKey = null;
			ckajiPubKey = null;
		} finally {
			isSchemaLoading = false;
		}
	});

	// --- Reactive Query Construction ---
	$effect(() => {
		if (tciniPubKey && gunkaPubKey && cnemePubKey && !isSchemaLoading && !schemaError) {
			console.log('[Todos] Constructing query with aggregate step.');
			const dynamicTodosQuery: LoroHqlQueryExtended = {
				steps: [
					// Step 1: Find Task Status Links (tcini: task -> status)
					{
						action: 'find',
						target: { schema: tciniPubKey },
						variables: {
							taskVar: { source: 'link.x1' },
							statusLeafVar: { source: 'link.x2' }
						},
						resultVariable: 'taskStatusLinks',
						return: 'array'
					},
					// Step 2: Find Task Assignment Links (gunka: worker -> task)
					{
						action: 'find',
						target: { schema: gunkaPubKey },
						variables: {
							workerVar: { source: 'link.x1' },
							assignedTaskVar: { source: 'link.x2' },
							goalIdVar: { source: 'link.x3' }
						},
						resultVariable: 'taskAssignmentLinks',
						return: 'array'
					},
					// Step 3: Find Task Tag Links (ckaji: task -> tag)
					{
						action: 'find',
						target: { schema: ckajiPubKey! },
						variables: {
							taskForTagVar: { source: 'link.x1' },
							tagLeafVar: { source: 'link.x2' }
						},
						resultVariable: 'taskTagLinks',
						return: 'array'
					},
					// Step 4: Join task status and assignments
					{
						action: 'join',
						left: { variable: 'taskStatusLinks', key: 'taskVar' },
						right: { variable: 'taskAssignmentLinks', key: 'assignedTaskVar' },
						type: 'left',
						select: {
							taskId: { source: 'left.taskVar' },
							statusLeafId: { source: 'left.statusLeafVar' },
							workerId: { source: 'right.workerVar' },
							goalId: { source: 'right.goalIdVar' }
						},
						resultVariable: 'baseTaskInfo'
					},
					// Step 5: Join Tags onto Base Info
					{
						action: 'join',
						left: { variable: 'baseTaskInfo', key: 'taskId' },
						right: { variable: 'taskTagLinks', key: 'taskForTagVar' },
						type: 'left',
						select: {
							taskId: { source: 'left.taskId' },
							statusLeafId: { source: 'left.statusLeafId' },
							workerId: { source: 'left.workerId' },
							goalId: { source: 'left.goalId' },
							tagLeafId: { source: 'right.tagLeafVar' }
						},
						resultVariable: 'taskWithTagsInfo'
					},
					// Step 6: Resolve Names and Status (and Tag)
					{
						action: 'resolve',
						fromVariable: 'taskWithTagsInfo',
						resolveFields: {
							taskName: {
								type: 'resolveLeafValue',
								pubkeyVar: 'taskId',
								fallbackVar: 'taskId',
								excludeType: 'Concept'
							},
							workerName: {
								type: 'resolveLeafValue',
								pubkeyVar: 'workerId',
								fallbackVar: 'workerId',
								excludeType: 'Concept'
							},
							status: {
								type: 'resolveLeafValue',
								pubkeyVar: 'statusLeafId',
								fallbackVar: 'statusLeafId',
								valueField: 'value'
							},
							tag: {
								type: 'resolveLeafValue',
								pubkeyVar: 'tagLeafId',
								valueField: 'value',
								fallbackVar: 'tagLeafId'
							},
							goalName: {
								type: 'resolveLeafValue',
								pubkeyVar: 'goalId',
								fallbackVar: 'goalId',
								excludeType: 'Concept'
							}
						},
						resultVariable: 'resolvedTodosWithTags' // Flat list result
					},
					// Step 7: Aggregate tags into an array
					{
						action: 'aggregate',
						fromVariable: 'resolvedTodosWithTags',
						groupByKey: 'taskId',
						aggregateFields: {
							taskName: { sourceField: 'taskName', operation: 'first' },
							workerName: { sourceField: 'workerName', operation: 'first' },
							status: { sourceField: 'status', operation: 'first' },
							statusLeafId: { sourceField: 'statusLeafId', operation: 'first' },
							workerId: { sourceField: 'workerId', operation: 'first' },
							tags: { sourceField: 'tag', operation: 'collect' },
							goalName: { sourceField: 'goalName', operation: 'first' },
							goalId: { sourceField: 'goalId', operation: 'first' }
						},
						resultVariable: 'aggregatedTodos' // Final result variable
					}
				]
			};
			queryStore.set(dynamicTodosQuery);

			// <<< NEW: Construct Goal List Query >>>
			const goalListQuery: LoroHqlQueryExtended = {
				steps: [
					// 1. Find all gunka links to get goal IDs (x3)
					{
						action: 'find',
						target: { schema: gunkaPubKey! },
						variables: {
							goalId: { source: 'link.x3' }
						},
						resultVariable: 'gunkaLinks',
						return: 'array'
					},
					// 2. Find all cneme links (entity -> nameLeaf)
					{
						action: 'find',
						target: { schema: cnemePubKey! },
						variables: {
							entityId: { source: 'link.x1' },
							nameLeafId: { source: 'link.x2' }
						},
						resultVariable: 'nameLinks',
						return: 'array'
					},
					// 3. Join gunkaLinks (goals) with nameLinks on goal ID = entity ID
					{
						action: 'join',
						left: { variable: 'gunkaLinks', key: 'goalId' },
						right: { variable: 'nameLinks', key: 'entityId' },
						type: 'inner', // Only keep goals that have names
						select: {
							goalId: { source: 'left.goalId' },
							nameLeafId: { source: 'right.nameLeafId' }
						},
						resultVariable: 'goalsWithNameLeaves'
					},
					// 4. Resolve the name leaf ID to get the actual goal name string
					{
						action: 'resolve',
						fromVariable: 'goalsWithNameLeaves',
						resolveFields: {
							goalName: {
								type: 'resolveLeafValue',
								pubkeyVar: 'nameLeafId',
								fallbackVar: 'nameLeafId', // Fallback to ID if resolution fails
								valueField: 'value' // Get the string value
								// No excludeType needed here, we expect a LoroText leaf
							}
						},
						resultVariable: 'resolvedGoalNames'
					},
					// 5. Aggregate to get unique goals
					{
						action: 'aggregate',
						fromVariable: 'resolvedGoalNames',
						groupByKey: 'goalId',
						aggregateFields: {
							goalName: { sourceField: 'goalName', operation: 'first' }
							// goalId is already the group key
						},
						resultVariable: 'goalList' // Final result
					}
				]
			};
			goalListQueryStore.set(goalListQuery);
			// <<< END NEW >>>
		} else if (!isSchemaLoading && schemaError) {
			console.log('[Todos] Schema loading failed, setting queryStore to null.');
			queryStore.set(null);
			goalListQueryStore.set(null); // <<< NEW: Clear goal list query too
		} else if (!tciniPubKey || !gunkaPubKey || !cnemePubKey) {
			queryStore.set(null);
			goalListQueryStore.set(null); // <<< NEW: Clear goal list query too
		}
	});

	// --- NEW Helper: Find User's Person Concept PubKey ---
	async function findUserPersonConceptPubKey(): Promise<string | null> {
		if (!ponsePubKey) {
			console.error('[findUserPersonConceptPubKey] ponsePubKey not available.');
			return null;
		}

		const findPersonQuery: LoroHqlQueryExtended = {
			steps: [
				{
					action: 'find',
					target: { schema: ponsePubKey },
					variables: {
						userIdLeafPubKeyVar: { source: 'link.x1' },
						personConceptPubKeyVar: { source: 'link.x2' }
					},
					resultVariable: 'ponseLinks',
					return: 'array'
				},
				{
					action: 'get',
					from: {
						variable: 'ponseLinks',
						sourceKey: 'userIdLeafPubKeyVar',
						targetDocType: 'Leaf'
					},
					fields: { userIdValue: { field: 'self.data.value' } }, // Extract the value
					resultVariable: 'userIdLeafDetails'
				}
			]
		};

		try {
			// Use o.query
			const result = await o.query(findPersonQuery);

			// Get user ID using o.me
			const userForIdLookup = o.me(); // Use o.me directly
			if (!userForIdLookup) {
				console.error('[findUserPersonConceptPubKey] Cannot get user ID for filtering.');
				return null;
			}

			let personPubKey: string | null = null;

			if (result && Array.isArray(result)) {
				const userIdDetails = result as {
					_sourceKey: string;
					variables: { userIdValue: string };
				}[];
				const matchingUserIdLeaf = userIdDetails.find(
					(item) => item.variables.userIdValue === userForIdLookup.id
				);

				if (matchingUserIdLeaf) {
					const findLinkAgainQuery: LoroHqlQueryExtended = {
						steps: [
							{
								action: 'find',
								target: { schema: ponsePubKey!, x1: matchingUserIdLeaf._sourceKey },
								variables: {
									personConceptPubKeyVar: { source: 'link.x2' }
								},
								resultVariable: 'foundLink',
								return: 'first'
							}
						]
					};
					// Use o.query
					const linkResult = await o.query(findLinkAgainQuery);

					if (
						linkResult &&
						Array.isArray(linkResult) &&
						linkResult.length > 0 &&
						linkResult[0] &&
						typeof linkResult[0].variables === 'object' &&
						linkResult[0].variables !== null &&
						'personConceptPubKeyVar' in linkResult[0].variables &&
						typeof linkResult[0].variables.personConceptPubKeyVar === 'string'
					) {
						personPubKey = linkResult[0].variables.personConceptPubKeyVar;
					} else {
						console.warn(
							'[findUserPersonConceptPubKey] Query result structure for link is unexpected:',
							linkResult
						);
					}
				}
			}

			if (!personPubKey) {
				console.warn(
					`[findUserPersonConceptPubKey] Could not find person concept linked to current user`
				);
				return null;
			}

			return personPubKey;
		} catch (err) {
			console.error('[findUserPersonConceptPubKey] Error querying for person concept:', err);
			return null;
		}
	}

	// --- Refactored addTodo (Uses dynamic Schema IDs) ---
	async function addTodo() {
		if (!newTodoText.trim()) return;
		if (!tciniPubKey || !gunkaPubKey || !cnemePubKey || !ponsePubKey) {
			mutationError =
				'Cannot add todo: Required schema information (tcini, gunka, cneme, ponse) not loaded yet.';
			console.error('Add todo failed: Schema pubkeys not available.', {
				tciniPubKey,
				gunkaPubKey,
				cnemePubKey,
				ponsePubKey
			});
			return;
		}

		isAdding = true;
		mutationError = null;

		const workerPubKey = await findUserPersonConceptPubKey();
		if (!workerPubKey) {
			mutationError =
				'Cannot add todo: Could not find the person concept linked to your user account. Please create one first.';
			isAdding = false;
			return;
		}

		console.log(`Adding todo '${newTodoText}' with worker (person concept): ${workerPubKey}`);

		try {
			const taskLeafOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Leaf',
				placeholder: '$$newTask',
				data: { type: 'Concept' }
			};

			const taskNameLeafOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Leaf',
				placeholder: '$$taskName',
				data: { type: 'LoroText', value: newTodoText.trim() }
			};

			const cnemeCompositeOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Composite',
				placeholder: '$$cnemeLink',
				data: {
					schemaId: cnemePubKey,
					places: {
						x1: '$$newTask',
						x2: '$$taskName'
					}
				}
			};

			const tciniCompositeOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Composite',
				placeholder: '$$tciniLink',
				data: {
					schemaId: tciniPubKey,
					places: {
						x1: '$$newTask',
						x2: STATUS_NOT_STARTED_ID
					}
				}
			};

			const gunkaCompositeOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Composite',
				placeholder: '$$gunkaLink',
				data: {
					schemaId: gunkaPubKey,
					places: {
						x1: workerPubKey,
						x2: '$$newTask',
						...(selectedGoalId && { x3: selectedGoalId })
					}
				}
			};

			const request: MutateHqlRequest = {
				mutations: [
					taskLeafOp,
					taskNameLeafOp,
					cnemeCompositeOp,
					tciniCompositeOp,
					gunkaCompositeOp
				]
			};
			// Use o.mutate
			const result = await o.mutate(request);

			if (result.status === 'success') {
				console.log('Todo added successfully:', result.generatedPubKeys);
				newTodoText = '';
			} else {
				console.error('Failed to add todo:', result.message, result.errorDetails);
				mutationError = `Failed to add todo: ${result.message}`;
			}
		} catch (err) {
			console.error('Error executing mutation:', err);
			mutationError = `Error: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			isAdding = false;
		}
	}

	// --- Refactored changeTodoStatus (Replaces toggle) ---
	async function changeTodoStatus(item: QueryResult, targetStatusLeafId: string) {
		if (!tciniPubKey) {
			mutationError = 'Cannot change status: Schema information not loaded yet.';
			console.error('Change status failed: tciniPubKey not available.');
			return;
		}

		const taskId = item.taskId as string;
		const currentStatusLeafId = item.statusLeafId as string;

		if (!taskId || !currentStatusLeafId) {
			mutationError = 'Cannot change status: Task or Status Leaf ID missing from query result.';
			console.error('Missing IDs from query result for status change:', item);
			return;
		}

		if (currentStatusLeafId === targetStatusLeafId) {
			console.log('Status is already set to the target status.');
			return;
		}

		let tciniCompositeId: string | null = null;
		try {
			console.log(
				`[ChangeStatus Find] Attempting to find tcini link. TaskID: ${taskId}, CurrentStatusID: ${currentStatusLeafId}, tciniPubKey: ${tciniPubKey}`
			);

			const findLinkQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'find',
						target: {
							schema: tciniPubKey,
							x1: taskId
						},
						variables: { linkId: { source: 'link.pubkey' } },
						return: 'first',
						resultVariable: 'foundLink'
					}
				]
			};
			// Use o.query
			const findResult = await o.query(findLinkQuery);

			if (
				findResult &&
				Array.isArray(findResult) &&
				findResult.length === 1 &&
				findResult[0] &&
				typeof findResult[0].variables === 'object' &&
				findResult[0].variables !== null &&
				'linkId' in findResult[0].variables
			) {
				tciniCompositeId = findResult[0].variables.linkId as string;
			} else {
				console.error('[ChangeStatus ERROR] Check failed. findResult:', JSON.stringify(findResult));
				throw new Error(
					`Could not find the tcini link composite for task ${taskId} (looked in x1)`
				);
			}
		} catch (err) {
			mutationError = err instanceof Error ? err.message : 'Failed to find link to update.';
			console.error('Error finding tcini composite for update:', err);
			return;
		}

		console.log(
			`Changing todo tcini composite ${tciniCompositeId} from status leaf ${currentStatusLeafId} to ${targetStatusLeafId}`
		);
		mutationError = null;

		const mutationRequest: MutateHqlRequest = {
			mutations: [
				{
					operation: 'update',
					type: 'Composite',
					targetPubKey: tciniCompositeId,
					data: {
						places: { x2: targetStatusLeafId }
					}
				}
			]
		};

		try {
			// Use o.mutate
			const result = await o.mutate(mutationRequest);
			if (result.status === 'error') {
				throw new Error(result.message);
			}
			console.log('Todo status toggled successfully.');
		} catch (err: unknown) {
			console.error('Failed to toggle todo status:', err);
			mutationError = err instanceof Error ? err.message : 'Failed to update todo status.';
		}
	}

	// --- Refactored deleteTodo (Uses dynamic Schema IDs) ---
	async function deleteTodo(item: QueryResult) {
		if (!tciniPubKey || !gunkaPubKey || !cnemePubKey) {
			mutationError = 'Cannot delete: Schema information not loaded yet.';
			console.error('Delete todo failed: Schema pubkeys not available.', {
				tciniPubKey,
				gunkaPubKey,
				cnemePubKey
			});
			return;
		}

		const taskId = item.taskId as string;
		const workerId = item.workerId as string;
		const statusLeafId = item.statusLeafId as string;

		if (!taskId || !workerId || !statusLeafId) {
			mutationError = 'Cannot delete: Missing required IDs from query result.';
			console.error('Missing base IDs for deletion from query result:', item);
			return;
		}

		console.log('Attempting to delete todo (Task ID):', taskId);
		mutationError = null;

		let tciniCompositeId: string | null = null;
		let gunkaCompositeId: string | null = null;
		let cnemeCompositeId: string | null = null;
		let nameLeafId: string | null = null;

		try {
			const findTciniQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'find',
						target: { schema: tciniPubKey, x1: taskId, x2: statusLeafId },
						variables: { linkId: { source: 'link.pubkey' } },
						return: 'first',
						resultVariable: 'found'
					}
				]
			};
			// Use o.query
			const tciniRes = await o.query(findTciniQuery);
			if (tciniRes && tciniRes.length > 0 && tciniRes[0].linkId)
				tciniCompositeId = tciniRes[0].linkId as string;
			else console.warn(`Could not find TCINI link for task ${taskId}`);

			const findGunkaQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'find',
						target: { schema: gunkaPubKey, x1: workerId, x2: taskId },
						variables: { linkId: { source: 'link.pubkey' } },
						return: 'first',
						resultVariable: 'found'
					}
				]
			};
			// Use o.query
			const gunkaRes = await o.query(findGunkaQuery);
			if (gunkaRes && gunkaRes.length > 0 && gunkaRes[0].linkId)
				gunkaCompositeId = gunkaRes[0].linkId as string;
			else console.warn(`Could not find GUNKA link for worker ${workerId} and task ${taskId}`);

			const findCnemeQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'find',
						target: { schema: cnemePubKey, x1: taskId },
						variables: {
							linkId: { source: 'link.pubkey' },
							nameLeafVar: { source: 'link.x2' }
						},
						return: 'first',
						resultVariable: 'found'
					}
				]
			};
			// Use o.query
			const cnemeRes = await o.query(findCnemeQuery);
			if (cnemeRes && cnemeRes.length > 0 && cnemeRes[0].linkId && cnemeRes[0].nameLeafVar) {
				cnemeCompositeId = cnemeRes[0].linkId as string;
				nameLeafId = cnemeRes[0].nameLeafVar as string;
			} else {
				console.warn(`Could not find CNEME link or name leaf for task ${taskId}`);
			}
		} catch (err) {
			mutationError =
				err instanceof Error ? err.message : 'Failed to find related items for deletion.';
			console.error('Error finding items for deletion:', err);
			return;
		}

		const mutationsToDelete: MutateHqlRequest['mutations'] = [];
		if (tciniCompositeId)
			mutationsToDelete.push({
				operation: 'delete',
				type: 'Composite',
				targetPubKey: tciniCompositeId
			});
		if (gunkaCompositeId)
			mutationsToDelete.push({
				operation: 'delete',
				type: 'Composite',
				targetPubKey: gunkaCompositeId
			});
		if (cnemeCompositeId)
			mutationsToDelete.push({
				operation: 'delete',
				type: 'Composite',
				targetPubKey: cnemeCompositeId
			});
		if (nameLeafId)
			mutationsToDelete.push({ operation: 'delete', type: 'Leaf', targetPubKey: nameLeafId });
		mutationsToDelete.push({ operation: 'delete', type: 'Leaf', targetPubKey: taskId });

		if (mutationsToDelete.length === 1 && (mutationsToDelete[0] as any).targetPubKey === taskId) {
			console.warn(
				`Could not find any related items for task ${taskId}, only deleting the task concept itself.`
			);
		}

		const mutationRequest: MutateHqlRequest = { mutations: mutationsToDelete };

		try {
			// Use o.mutate
			const result = await o.mutate(mutationRequest);
			if (result.status === 'error') {
				throw new Error(result.message);
			}
			console.log('Todo deleted successfully.');
		} catch (err: unknown) {
			console.error('Failed to delete todo:', err);
			mutationError = err instanceof Error ? err.message : 'Failed to delete todo.';
		}
	}

	// --- Lifecycle and Effects ---
	onMount(() => {});

	// Reactive effect to update component state based on the readable store
	$effect(() => {
		const currentResults = $todoReadable;

		if (currentResults === undefined) {
			isLoadingQueryData = true;
			queryError = null;
		} else if (currentResults === null) {
			isLoadingQueryData = false;
			queryError = schemaError ?? 'Query execution failed.';
			if (todos.length > 0) todos = [];
		} else {
			isLoadingQueryData = false;
			queryError = null;
			const currentTodosString = JSON.stringify(todos);
			const newResultsString = JSON.stringify(currentResults);
			if (currentTodosString !== newResultsString) {
				todos = currentResults;
			}
		}
	});

	// --- NEW: Effect for goal list readable store ---
	$effect(() => {
		const currentGoalResults = $goalListReadable;

		if (currentGoalResults === undefined) {
			isGoalListLoading = true;
			goalListError = null;
		} else if (currentGoalResults === null) {
			isGoalListLoading = false;
			goalListError = schemaError ?? 'Goal list query execution failed.';
			if (goalList.length > 0) goalList = [];
		} else {
			isGoalListLoading = false;
			goalListError = null;
			const currentGoalsString = JSON.stringify(goalList);
			const newResultsString = JSON.stringify(currentGoalResults);
			if (currentGoalsString !== newResultsString) {
				goalList = currentGoalResults;
			}
		}
	});
	// --- END NEW ---

	// --- Computed: Filtered Todos ---
	const filteredTodos = $derived(
		todos.filter((todo) => selectedGoalId === null || todo.goalId === selectedGoalId)
	);

	// --- Dnd Handling ---
	const statuses = [STATUS_NOT_STARTED_ID, STATUS_IN_PROGRESS_ID, STATUS_COMPLETED_ID];

	// Renamed function to match droppable callback name and added correct type
	function handleDrop(state: DragDropState<QueryResult>) {
		// Correct destructuring based on @thisux/sveltednd examples
		const { draggedItem, sourceContainer, targetContainer } = state;

		console.log(
			`[DND Drop] Item: ${draggedItem?.taskId} from ${sourceContainer} to ${targetContainer}`
		);

		if (!draggedItem || !targetContainer || sourceContainer === targetContainer) {
			console.log('[DND Drop] Invalid drop or no container change.');
			return; // Invalid drop or dropped in the same container
		}

		if (statuses.includes(targetContainer)) {
			// The targetContainerId is one of the valid status leaf IDs
			changeTodoStatus(draggedItem, targetContainer);
		} else {
			console.error('[DND Drop] Invalid target container ID:', targetContainer);
		}
	}

	onDestroy(() => {
		console.log('[Todos.svelte] Component destroyed');
	});
</script>

<div class="flex h-full flex-row overflow-hidden bg-[#f8f4ed]">
	<!-- Sidebar -->
	<aside class="w-64 flex-shrink-0 border-r border-gray-200 bg-white p-4 shadow-md">
		<h2 class="mb-4 text-lg font-semibold text-[#153243]">Goals</h2>
		{#if isGoalListLoading}
			<p class="text-sm text-gray-500">Loading goals...</p>
		{:else if goalListError}
			<p class="text-sm text-red-600">Error: {goalListError}</p>
		{:else if goalList.length === 0}
			<p class="text-sm text-gray-500">No goals found.</p>
		{:else}
			<ul class="space-y-1">
				<!-- All Goals Button -->
				<li>
					<button
						class="w-full truncate rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-gray-100 {selectedGoalId ===
						null
							? 'bg-blue-100 font-semibold text-blue-800'
							: 'text-gray-700'}"
						on:click={() => (selectedGoalId = null)}
					>
						All Goals
					</button>
				</li>
				<!-- Goal List -->
				{#each goalList as goal (goal.goalId)}
					<li>
						<button
							class="w-full truncate rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-gray-100 {selectedGoalId ===
							goal.goalId
								? 'bg-blue-100 font-semibold text-blue-800'
								: 'text-gray-700'}"
							on:click={() => (selectedGoalId = goal.goalId as string)}
						>
							{goal.goalName ?? '(Unnamed Goal)'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content -->
	<div class="flex flex-1 flex-col overflow-hidden p-6">
		<h1 class="mb-1 text-2xl font-bold text-[#153243]">Kanban Board</h1>
		<p class="mb-6 text-sm text-gray-500">
			Drag and drop tasks between columns to change their status.
		</p>

		<form class="mb-6 flex items-center gap-2" on:submit|preventDefault={addTodo}>
			<input
				type="text"
				bind:value={newTodoText}
				placeholder="What needs to be done?"
				class="flex-grow rounded-md border border-gray-300 bg-white px-3 py-2 text-[#153243] transition-shadow focus:border-[#a7b7cb] focus:ring-2 focus:ring-[#c5d4e8] focus:outline-none"
				required
				disabled={isAdding || isSchemaLoading}
			/>
			<button
				type="submit"
				class="rounded-md bg-[#153243] px-4 py-2 text-[#DDD4C9] transition-colors hover:bg-[#174C6B] focus:ring-2 focus:ring-[#153243] focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				disabled={isAdding || isSchemaLoading}
			>
				{#if isAdding}
					Adding...
				{:else if isSchemaLoading}
					Loading...
				{:else}
					Add Todo
				{/if}
			</button>
		</form>

		{#if mutationError}
			<div
				class="relative mb-4 rounded border border-[#D38F7A] bg-[#fceded] px-4 py-3 text-[#D38F7A]"
				role="alert"
			>
				<strong class="font-bold">Mutation Error:</strong>
				<span class="block sm:inline">{mutationError}</span>
				<button
					class="absolute top-0 right-0 bottom-0 px-4 py-3"
					on:click={() => (mutationError = null)}
				>
					<svg
						class="h-6 w-6 fill-current text-[#D38F7A]"
						role="button"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						><title>Close</title><path
							d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"
						/></svg
					>
				</button>
			</div>
		{/if}

		{#if isSchemaLoading}
			<div class="py-4 text-center text-gray-500">Loading schema definitions...</div>
		{:else if isLoadingQueryData}
			<div class="py-4 text-center text-gray-500">Loading todos...</div>
		{:else if queryError}
			<div
				class="relative mb-4 rounded border border-[#DBAD75] bg-[#fff8ed] px-4 py-3 text-[#DBAD75]"
				role="alert"
			>
				<strong class="font-bold">Error:</strong>
				<span class="block sm:inline">{queryError}</span>
			</div>
		{/if}

		{#if !isSchemaLoading && !isLoadingQueryData && !queryError}
			<div class="grid flex-1 grid-cols-3 gap-4 overflow-hidden">
				<!-- Not Started Column -->
				<div class="flex flex-col overflow-hidden rounded-lg bg-white p-4 shadow">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="font-semibold text-[#153243]">Todo</h3>
						<span
							class="ml-2 rounded-md bg-[#DDD4C9] px-2 py-0.5 text-xs font-medium text-[#153243]"
						>
							{filteredTodos.filter((t) => t.status === 'not-started').length}
						</span>
					</div>
					<ul
						class="flex-1 space-y-3 overflow-y-auto pr-1"
						use:droppable={{
							container: STATUS_NOT_STARTED_ID,
							callbacks: { onDrop: handleDrop }
						}}
					>
						{#each filteredTodos as item (item.taskId)}
							{#if item.status === 'not-started'}
								{@const taskName = typeof item.taskName === 'string' ? item.taskName : '(No Name)'}
								{@const workerName =
									typeof item.workerName === 'string' ? item.workerName : '(No Worker)'}
								{@const goalName = typeof item.goalName === 'string' ? item.goalName : '(No Goal)'}
								<li
									class="group relative cursor-grab rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm"
									use:draggable={{
										container: STATUS_NOT_STARTED_ID,
										dragData: item
									}}
								>
									<p class="mb-1 font-semibold text-[#153243]">{taskName}</p>
									<p class="text-xs text-gray-500">Assignee: {workerName}</p>
									<p class="text-xs text-gray-500">Goal: {goalName}</p>
									{#if item.tags && Array.isArray(item.tags) && item.tags.length > 0}
										<div class="mt-2 flex flex-wrap gap-1">
											{#each item.tags as tag}
												{#if tag}
													<span
														class="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800"
													>
														{tag}
													</span>
												{/if}
											{/each}
										</div>
									{/if}
									<button
										on:click={() => deleteTodo(item)}
										class="absolute top-1 right-1 rounded-full p-1 text-[#D38F7A] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 focus:opacity-100 focus:outline-none"
										aria-label="Delete todo"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/></svg
										>
									</button>
								</li>
							{/if}
						{:else}
							<p class="text-center text-xs text-gray-400">Empty</p>
						{/each}
					</ul>
				</div>

				<!-- In Progress Column -->
				<div class="flex flex-col overflow-hidden rounded-lg bg-white p-4 shadow">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="font-semibold text-[#153243]">In Progress</h3>
						<span
							class="ml-2 rounded-md bg-[#DDD4C9] px-2 py-0.5 text-xs font-medium text-[#153243]"
						>
							{filteredTodos.filter((t) => t.status === 'in-progress').length}
						</span>
					</div>
					<ul
						class="flex-1 space-y-3 overflow-y-auto pr-1"
						use:droppable={{
							container: STATUS_IN_PROGRESS_ID,
							callbacks: { onDrop: handleDrop }
						}}
					>
						{#each filteredTodos as item (item.taskId)}
							{#if item.status === 'in-progress'}
								{@const taskName = typeof item.taskName === 'string' ? item.taskName : '(No Name)'}
								{@const workerName =
									typeof item.workerName === 'string' ? item.workerName : '(No Worker)'}
								{@const goalName = typeof item.goalName === 'string' ? item.goalName : '(No Goal)'}
								<li
									class="group relative cursor-grab rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm"
									use:draggable={{
										container: STATUS_IN_PROGRESS_ID,
										dragData: item
									}}
								>
									<p class="mb-1 font-semibold text-[#153243]">{taskName}</p>
									<p class="text-xs text-gray-500">Assignee: {workerName}</p>
									<p class="text-xs text-gray-500">Goal: {goalName}</p>
									{#if item.tags && Array.isArray(item.tags) && item.tags.length > 0}
										<div class="mt-2 flex flex-wrap gap-1">
											{#each item.tags as tag}
												{#if tag}
													<span
														class="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800"
													>
														{tag}
													</span>
												{/if}
											{/each}
										</div>
									{/if}
									<button
										on:click={() => deleteTodo(item)}
										class="absolute top-1 right-1 rounded-full p-1 text-[#D38F7A] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 focus:opacity-100 focus:outline-none"
										aria-label="Delete todo"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/></svg
										>
									</button>
								</li>
							{/if}
						{:else}
							<p class="text-center text-xs text-gray-400">Empty</p>
						{/each}
					</ul>
				</div>

				<!-- Done Column -->
				<div class="flex flex-col overflow-hidden rounded-lg bg-[#f5f1e8] p-4 shadow">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="font-semibold text-[#153243]">Done</h3>
						<span
							class="ml-2 rounded-md bg-[#DDD4C9] px-2 py-0.5 text-xs font-medium text-[#153243]"
						>
							{filteredTodos.filter((t) => t.status === 'completed').length}
						</span>
					</div>
					<ul
						class="flex-1 space-y-3 overflow-y-auto pr-1"
						use:droppable={{
							container: STATUS_COMPLETED_ID,
							callbacks: { onDrop: handleDrop }
						}}
					>
						{#each filteredTodos as item (item.taskId)}
							{#if item.status === 'completed'}
								{@const taskName = typeof item.taskName === 'string' ? item.taskName : '(No Name)'}
								{@const workerName =
									typeof item.workerName === 'string' ? item.workerName : '(No Worker)'}
								{@const goalName = typeof item.goalName === 'string' ? item.goalName : '(No Goal)'}
								<li
									class="group relative cursor-grab rounded-lg border border-gray-200 bg-gray-50 p-3 opacity-75 shadow-sm"
									use:draggable={{
										container: STATUS_COMPLETED_ID,
										dragData: item
									}}
								>
									<p class="mb-1 font-semibold text-gray-500 line-through">{taskName}</p>
									<p class="text-xs text-gray-400 line-through">Assignee: {workerName}</p>
									<p class="text-xs text-gray-400 line-through">Goal: {goalName}</p>
									{#if item.tags && Array.isArray(item.tags) && item.tags.length > 0}
										<div class="mt-2 flex flex-wrap gap-1">
											{#each item.tags as tag}
												{#if tag}
													<span
														class="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 line-through"
													>
														{tag}
													</span>
												{/if}
											{/each}
										</div>
									{/if}
									<button
										on:click={() => deleteTodo(item)}
										class="absolute top-1 right-1 rounded-full p-1 text-[#D38F7A] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 focus:opacity-100 focus:outline-none"
										aria-label="Delete todo"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/></svg
										>
									</button>
								</li>
							{/if}
						{:else}
							<p class="text-center text-xs text-gray-400">Empty</p>
						{/each}
					</ul>
				</div>
			</div>
		{:else if !isSchemaLoading && !isLoadingQueryData && !queryError && filteredTodos.length === 0}
			<div class="py-4 text-center text-gray-500">
				No todos found{selectedGoalId ? ' for the selected goal' : ''}.
			</div>
		{/if}
	</div>
</div>
