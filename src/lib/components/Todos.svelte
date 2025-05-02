<script lang="ts">
	import { onMount, onDestroy, getContext, type ComponentType } from 'svelte';
	import { writable, type Readable } from 'svelte/store';
	import {
		executeQuery,
		processReactiveQuery,
		type LoroHqlQueryExtended,
		type QueryResult
	} from '$lib/KERNEL/hominio-query';
	import type { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import {
		executeMutation as executeMutationInstance,
		type MutateHqlRequest,
		type CreateMutationOperation
	} from '$lib/KERNEL/hominio-mutate';
	import type { CapabilityUser } from '$lib/KERNEL/hominio-caps';
	import { GENESIS_PUBKEY } from '$db/constants';
	import type { IndexLeafType } from '$lib/KERNEL/index-registry';
	import { draggable, droppable, type DragDropState } from '@thisux/sveltednd';

	// --- Get User Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getCurrentUser = getContext<GetCurrentUserFn>('getMe');

	// --- Static Leaf IDs (Keep these) ---
	const STATUS_NOT_STARTED_ID =
		'0x3b302f86a7873b6533959d80c53efec82ce28ea3fd540da3ed90dd26cac76bde';
	const STATUS_IN_PROGRESS_ID =
		'0x05447c2f4716f12eb30e49fad68e94aa017edeb6778610b96eb2f4b61c6c029e';
	const STATUS_COMPLETED_ID = '0xe3110ac83fd5ef52cf91873b8a94ef6662cd03d5eb433d51922942e834d63c66';

	// --- State ---
	let isLoadingQueryData = $state(true);
	let queryError = $state<string | null>(null);
	let mutationError = $state<string | null>(null);
	let newTodoText = $state('');
	let isAdding = $state(false);
	let currentUser = $state<CapabilityUser | null>(null);
	let todos = $state<QueryResult[]>([]);

	// --- Schema PubKey State ---
	let isSchemaLoading = $state(true);
	let schemaError = $state<string | null>(null);
	let tciniPubKey = $state<string | null>(null);
	let gunkaPubKey = $state<string | null>(null);
	let cnemePubKey = $state<string | null>(null);

	// Type for the actual map inside the schemas index
	type SchemaRegistryMap = Record<string, string>;

	// Store for the query JSON object - Start as null
	const queryStore = writable<LoroHqlQueryExtended | null>(null);

	// Create the readable store using processReactiveQuery
	const todoReadable: Readable<QueryResult[] | null | undefined> = processReactiveQuery(
		getCurrentUser,
		queryStore
	);

	// --- Fetch Schemas on Mount ---
	onMount(async () => {
		currentUser = getCurrentUser();
		if (!currentUser) {
			schemaError = 'Cannot load schemas: User not logged in.';
			isSchemaLoading = false;
			return;
		}

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

			const metaResult = await executeQuery(metaIndexQuery, currentUser);

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

			const schemasResult = await executeQuery(schemasIndexQuery, currentUser);

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

				if (!tciniPubKey || !gunkaPubKey || !cnemePubKey) {
					const missing = ['tcini', 'gunka', 'cneme'].filter((k) => !schemaMap[k]).join(', ');
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
		} finally {
			isSchemaLoading = false;
		}
	});

	// --- Reactive Query Construction ---
	$effect(() => {
		if (tciniPubKey && gunkaPubKey && cnemePubKey && !isSchemaLoading && !schemaError) {
			console.log('[Todos] Constructing dynamic query with fetched schema IDs.');
			const dynamicTodosQuery: LoroHqlQueryExtended = {
				steps: [
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
					{
						action: 'find',
						target: { schema: gunkaPubKey },
						variables: {
							workerVar: { source: 'link.x1' },
							assignedTaskVar: { source: 'link.x2' }
						},
						resultVariable: 'taskAssignmentLinks',
						return: 'array'
					},
					{
						action: 'join',
						left: { variable: 'taskStatusLinks', key: 'taskVar' },
						right: { variable: 'taskAssignmentLinks', key: 'assignedTaskVar' },
						type: 'left',
						select: {
							taskId: { source: 'left.taskVar' },
							statusLeafId: { source: 'left.statusLeafVar' },
							workerId: { source: 'right.workerVar' }
						},
						resultVariable: 'joinedTaskInfo'
					},
					{
						action: 'resolve',
						fromVariable: 'joinedTaskInfo',
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
							}
						},
						resultVariable: 'resolvedTodos'
					}
				]
			};
			queryStore.set(dynamicTodosQuery);
		} else if (!isSchemaLoading && schemaError) {
			console.log('[Todos] Schema loading failed, setting queryStore to null.');
			queryStore.set(null);
		} else if (!tciniPubKey || !gunkaPubKey || !cnemePubKey) {
			queryStore.set(null);
		}
	});

	// --- Refactored addTodo (Uses dynamic Schema IDs) ---
	async function addTodo() {
		if (!newTodoText.trim()) return;
		const user = currentUser;
		if (!user) {
			mutationError = 'Cannot add todo: User not logged in.';
			return;
		}
		if (!tciniPubKey || !cnemePubKey) {
			mutationError = 'Cannot add todo: Schema information not loaded yet.';
			console.error('Add todo failed: Schema pubkeys not available.', { tciniPubKey, cnemePubKey });
			return;
		}
		isAdding = true;
		mutationError = null;
		console.log('Adding todo:', newTodoText);

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

			// Link task to its name using cneme
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

			// Link task to its initial status using tcini
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

			const request: MutateHqlRequest = {
				mutations: [taskLeafOp, taskNameLeafOp, cnemeCompositeOp, tciniCompositeOp]
			};
			const result = await executeMutationInstance(request, user);

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
		const user = currentUser;
		if (!user) {
			mutationError = 'User not authenticated.';
			console.error('User not authenticated.');
			return;
		}
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
			// Log inputs before executing the find query
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
			const findResult = await executeQuery(findLinkQuery, user);

			// <<< End Detailed Logging >>>

			// Correct check for single-element array result (expecting [{ variables: { linkId: ... } }])
			if (
				findResult &&
				Array.isArray(findResult) &&
				findResult.length === 1 &&
				findResult[0] && // Check if the first element exists
				typeof findResult[0].variables === 'object' && // Check if variables is an object
				findResult[0].variables !== null && // Check if variables is not null
				'linkId' in findResult[0].variables // Check if linkId key exists
			) {
				// Safe to access linkId now
				tciniCompositeId = findResult[0].variables.linkId as string;
			} else {
				// Log the failing result before throwing error
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
			const result = await executeMutationInstance(mutationRequest, user);
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
		const user = currentUser;
		if (!user) {
			mutationError = 'User not authenticated.';
			console.error('User not authenticated.');
			return;
		}
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
			const tciniRes = await executeQuery(findTciniQuery, user);
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
			const gunkaRes = await executeQuery(findGunkaQuery, user);
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
			const cnemeRes = await executeQuery(findCnemeQuery, user);
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
			const result = await executeMutationInstance(mutationRequest, user);
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
	onMount(() => {
		currentUser = getCurrentUser();
	});

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

	// --- Kanban Grouping ---
	let groupedTodos = $derived.by(() => {
		console.log(
			'[Todos $derived] Grouping todos. Input count:',
			todos.length,
			'Data:',
			JSON.stringify(todos)
		);
		const groups: { [key: string]: QueryResult[] } = {
			'not-started': [],
			'in-progress': [],
			completed: []
		};
		for (const todo of todos) {
			const status = todo.status as string;
			console.log(`[Todos $derived] Processing todo ${todo.taskId}, status: '${status}'`);
			if (groups[status]) {
				groups[status].push(todo);
				console.log(
					`[Todos $derived] Added ${todo.taskId} to group '${status}'. Group size: ${groups[status].length}`
				);
			} else {
				console.warn(`[Todos $derived] Todo with unknown status found: '${status}'`, todo);
			}
		}
		console.log('[Todos $derived] Final groups:', JSON.stringify(groups));
		return groups;
	});

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

<div class="flex h-full flex-col overflow-hidden bg-[#f8f4ed] p-6">
	<h1 class="mb-1 text-2xl font-bold text-[#153243]">Kanban Board</h1>
	<p class="mb-6 text-sm text-gray-500">
		Drag and drop tasks between columns to reorder them in the board.
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
			<div class="flex flex-col overflow-hidden rounded-lg bg-white p-4 shadow">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="font-semibold text-[#153243]">Todo</h3>
					<span class="ml-2 rounded-md bg-[#DDD4C9] px-2 py-0.5 text-xs font-medium text-[#153243]"
						>{groupedTodos['not-started'].length}</span
					>
				</div>
				<ul
					class="flex-1 space-y-3 overflow-y-auto pr-1"
					use:droppable={{
						container: STATUS_NOT_STARTED_ID,
						callbacks: { onDrop: handleDrop }
					}}
				>
					{#each groupedTodos['not-started'] as item (item.taskId)}
						{#if item.taskId}
							{@const taskName = typeof item.taskName === 'string' ? item.taskName : '(No Name)'}
							{@const workerName =
								typeof item.workerName === 'string' ? item.workerName : '(No Worker)'}
							<li
								class="group relative cursor-grab rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm"
								use:draggable={{
									container: STATUS_NOT_STARTED_ID,
									dragData: item
								}}
							>
								<p class="mb-1 font-semibold text-[#153243]">{taskName}</p>
								<p class="text-xs text-gray-500">Assignee: {workerName}</p>
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

			<div class="flex flex-col overflow-hidden rounded-lg bg-white p-4 shadow">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="font-semibold text-[#153243]">In Progress</h3>
					<span class="ml-2 rounded-md bg-[#DDD4C9] px-2 py-0.5 text-xs font-medium text-[#153243]"
						>{groupedTodos['in-progress'].length}</span
					>
				</div>
				<ul
					class="flex-1 space-y-3 overflow-y-auto pr-1"
					use:droppable={{
						container: STATUS_IN_PROGRESS_ID,
						callbacks: { onDrop: handleDrop }
					}}
				>
					{#each groupedTodos['in-progress'] as item (item.taskId)}
						{#if item.taskId}
							{@const taskName = typeof item.taskName === 'string' ? item.taskName : '(No Name)'}
							{@const workerName =
								typeof item.workerName === 'string' ? item.workerName : '(No Worker)'}
							<li
								class="group relative cursor-grab rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm"
								use:draggable={{
									container: STATUS_IN_PROGRESS_ID,
									dragData: item
								}}
							>
								<p class="mb-1 font-semibold text-[#153243]">{taskName}</p>
								<p class="text-xs text-gray-500">Assignee: {workerName}</p>
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

			<div class="flex flex-col overflow-hidden rounded-lg bg-[#f5f1e8] p-4 shadow">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="font-semibold text-[#153243]">Done</h3>
					<span class="ml-2 rounded-md bg-[#DDD4C9] px-2 py-0.5 text-xs font-medium text-[#153243]"
						>{groupedTodos['completed'].length}</span
					>
				</div>
				<ul
					class="flex-1 space-y-3 overflow-y-auto pr-1"
					use:droppable={{
						container: STATUS_COMPLETED_ID,
						callbacks: { onDrop: handleDrop }
					}}
				>
					{#each groupedTodos['completed'] as item (item.taskId)}
						{#if item.taskId}
							{@const taskName = typeof item.taskName === 'string' ? item.taskName : '(No Name)'}
							{@const workerName =
								typeof item.workerName === 'string' ? item.workerName : '(No Worker)'}
							<li
								class="group relative cursor-grab rounded-lg border border-gray-200 bg-gray-50 p-3 opacity-75 shadow-sm"
								use:draggable={{
									container: STATUS_COMPLETED_ID,
									dragData: item
								}}
							>
								<p class="mb-1 font-semibold text-gray-500 line-through">{taskName}</p>
								<p class="text-xs text-gray-400 line-through">Assignee: {workerName}</p>
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
	{:else if !isSchemaLoading && !isLoadingQueryData && !queryError && todos.length === 0}
		<div class="py-4 text-center text-gray-500">No todos found.</div>
	{/if}
</div>
