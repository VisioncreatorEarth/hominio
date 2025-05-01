<script lang="ts">
	import { onMount, onDestroy, getContext, type ComponentType } from 'svelte';
	import { writable, type Readable } from 'svelte/store';
	import type { LoroHqlQueryExtended, QueryResult } from '$lib/KERNEL/hominio-query';
	import type { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import {
		executeMutation as executeMutationInstance,
		type MutateHqlRequest,
		type CreateMutationOperation
	} from '$lib/KERNEL/hominio-mutate';
	import type { CapabilityUser } from '$lib/KERNEL/hominio-caps';
	import { processReactiveQuery } from '$lib/KERNEL/hominio-query';

	// --- Get User Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getCurrentUser = getContext<GetCurrentUserFn>('getMe');

	// --- Constants ---
	const TCINI_SCHEMA_ID = '0xf4f64c16a96daf1d2b91269fe82946b21b7d1faa728ff20ed86a6c18dabc4943'; // Task -> Status
	const GUNKA_SCHEMA_ID = '0x7f7cd305d27b953759f16a461f26b3d237494dc98cc2fbca45b60960ab'; // Worker -> Task
	const CNEME_SCHEMA_ID = '0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96'; // Concept -> Name
	const STATUS_NOT_STARTED_ID =
		'0x3b302f86a7873b6533959d80c53efec82ce28ea3fd540da3ed90dd26cac76bde';
	const STATUS_COMPLETED_ID = '0xe3110ac83fd5ef52cf91873b8a94ef6662cd03d5eb433d51922942e834d63c66';

	// --- State ---
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let mutationError = $state<string | null>(null);
	let newTodoText = $state('');
	let isAdding = $state(false);
	let currentUser = $state<CapabilityUser | null>(null);
	let todos = $state<QueryResult[]>([]);

	// Define the Todos query using the structure from QueryEditor
	const todosQuery: LoroHqlQueryExtended = {
		steps: [
			{
				// Step 1: Find Task Status Links (tcini: task -> status)
				action: 'find',
				target: { schema: TCINI_SCHEMA_ID }, // Use Constant
				variables: {
					taskVar: { source: 'link.x1' },
					statusLeafVar: { source: 'link.x2' }
				},
				resultVariable: 'taskStatusLinks',
				return: 'array'
			},
			{
				// Step 2: Find Task Assignment Links (gunka: worker -> task)
				action: 'find',
				target: { schema: GUNKA_SCHEMA_ID }, // Use Constant
				variables: {
					workerVar: { source: 'link.x1' },
					assignedTaskVar: { source: 'link.x2' } // Task is x2 in gunka
				},
				resultVariable: 'taskAssignmentLinks',
				return: 'array'
			},
			{
				// Step 3: Join task status and assignments
				action: 'join',
				left: { variable: 'taskStatusLinks', key: 'taskVar' },
				right: { variable: 'taskAssignmentLinks', key: 'assignedTaskVar' },
				type: 'left',
				select: {
					taskId: { source: 'left.taskVar' },
					statusLeafId: { source: 'left.statusLeafVar' },
					workerId: { source: 'right.workerVar' }
				},
				resultVariable: 'joinedTaskInfo' // Result of the join
			},
			{
				// Step 4: Resolve Names and Status
				action: 'resolve',
				fromVariable: 'joinedTaskInfo', // Use the joined results
				resolveFields: {
					taskName: {
						type: 'resolveLeafValue',
						pubkeyVar: 'taskId',
						fallbackVar: 'taskId',
						excludeType: 'Concept' // Use cneme lookup for tasks
					},
					workerName: {
						type: 'resolveLeafValue',
						pubkeyVar: 'workerId',
						fallbackVar: 'workerId',
						excludeType: 'Concept' // Use cneme lookup for workers
					},
					status: {
						type: 'resolveLeafValue',
						pubkeyVar: 'statusLeafId',
						fallbackVar: 'statusLeafId',
						valueField: 'value' // Get the text value directly
					}
				},
				resultVariable: 'resolvedTodos' // Final results
			}
		]
	};

	// Store for the query JSON object
	const queryStore = writable<LoroHqlQueryExtended | null>(todosQuery);

	// Create the readable store using processReactiveQuery with the object store
	const todoReadable: Readable<QueryResult[] | null | undefined> = processReactiveQuery(
		getCurrentUser,
		queryStore // Pass the object store
	);

	// --- Helper Functions ---
	// Remove unused triggerIndexing function
	// async function triggerIndexing() {
	// 	console.log('[Todos.svelte] Manually triggering indexing...');
	// 	await hominioIndexing.startIndexingCycle();
	// 	console.log('[Todos.svelte] Indexing cycle complete.');
	// }

	// --- Refactored addTodo (Uses correct Schema IDs) ---
	async function addTodo() {
		if (!newTodoText.trim()) return;
		const user = currentUser;
		if (!user) {
			mutationError = 'Cannot add todo: User not logged in.';
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
					schemaId: CNEME_SCHEMA_ID, // Corrected: Use CNEME constant
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
					schemaId: TCINI_SCHEMA_ID, // Corrected: Use TCINI constant
					places: {
						x1: '$$newTask',
						x2: STATUS_NOT_STARTED_ID // Corrected: Use STATUS constant
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
				// REMOVED: Trigger indexing call
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

	// --- Refactored toggleTodoStatus (Uses correct Status IDs and item structure) ---
	async function toggleTodoStatus(item: QueryResult) {
		const user = currentUser;
		if (!user) {
			mutationError = 'User not authenticated.';
			console.error('User not authenticated.');
			return;
		}

		// Access IDs directly from the item (as selected/resolved in the query)
		const taskId = item.taskId as string; // Task Concept ID
		const currentStatusLeafId = item.statusLeafId as string;

		if (!taskId || !currentStatusLeafId) {
			mutationError = 'Cannot toggle status: Task or Status Leaf ID missing from query result.';
			console.error('Missing IDs from query result for toggle:', item);
			return;
		}

		// Find the tcini composite link (Task -> Status) to update its x2 place
		// We need a way to get this. We can't easily select it in the query currently.
		// WORKAROUND: Find the composite using the taskId and currentStatusLeafId
		let tciniCompositeId: string | null = null;
		try {
			const findLinkQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'find',
						target: {
							schema: TCINI_SCHEMA_ID,
							x1: taskId, // Find the link for *this* task
							x2: currentStatusLeafId // and *this* status
						},
						variables: {
							linkId: { source: 'link.pubkey' }
						},
						return: 'first',
						resultVariable: 'foundLink'
					}
				]
			};
			// Execute this small query immediately (not reactive)
			const findResult = await import('$lib/KERNEL/hominio-query').then((m) =>
				m.executeQuery(findLinkQuery, user)
			);
			if (findResult && findResult.length > 0 && findResult[0].linkId) {
				tciniCompositeId = findResult[0].linkId as string;
			} else {
				throw new Error(
					`Could not find the tcini link composite for task ${taskId} and status ${currentStatusLeafId}`
				);
			}
		} catch (err) {
			mutationError = err instanceof Error ? err.message : 'Failed to find link to update.';
			console.error('Error finding tcini composite for update:', err);
			return;
		}

		// Determine the next status ID
		const targetStatusLeafId =
			currentStatusLeafId === STATUS_COMPLETED_ID ? STATUS_NOT_STARTED_ID : STATUS_COMPLETED_ID;

		console.log(
			`Toggling todo tcini composite ${tciniCompositeId} from status leaf ${currentStatusLeafId} to ${targetStatusLeafId}`
		);
		mutationError = null;

		const mutationRequest: MutateHqlRequest = {
			mutations: [
				{
					operation: 'update',
					type: 'Composite',
					targetPubKey: tciniCompositeId, // Use the ID found above
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
			// REMOVED: Trigger indexing call
		} catch (err: unknown) {
			console.error('Failed to toggle todo status:', err);
			mutationError = err instanceof Error ? err.message : 'Failed to update todo status.';
		}
	}

	// --- Refactored deleteTodo (Needs to find composite/leaf IDs) ---
	async function deleteTodo(item: QueryResult) {
		const user = currentUser;
		if (!user) {
			mutationError = 'User not authenticated.';
			console.error('User not authenticated.');
			return;
		}

		// Access known IDs directly from the item
		const taskId = item.taskId as string;
		const workerId = item.workerId as string; // We have worker concept ID
		const statusLeafId = item.statusLeafId as string; // We have status leaf ID
		// We DON'T have the composite IDs or the name leaf ID from the current query result

		if (!taskId || !workerId || !statusLeafId) {
			mutationError = 'Cannot delete: Missing required IDs from query result.';
			console.error('Missing base IDs for deletion from query result:', item);
			return;
		}

		console.log('Attempting to delete todo (Task ID):', taskId);
		mutationError = null;

		// WORKAROUND: We need to find the related composites and the name leaf to delete them.
		// This requires multiple queries before the mutation.
		let tciniCompositeId: string | null = null;
		let gunkaCompositeId: string | null = null;
		let cnemeCompositeId: string | null = null;
		let nameLeafId: string | null = null;

		try {
			// 1. Find TCINI composite (Task -> Status)
			const findTciniQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'find',
						target: { schema: TCINI_SCHEMA_ID, x1: taskId, x2: statusLeafId },
						variables: { linkId: { source: 'link.pubkey' } },
						return: 'first',
						resultVariable: 'found'
					}
				]
			};
			const tciniRes = await import('$lib/KERNEL/hominio-query').then((m) =>
				m.executeQuery(findTciniQuery, user)
			);
			if (tciniRes && tciniRes.length > 0 && tciniRes[0].linkId)
				tciniCompositeId = tciniRes[0].linkId as string;
			else console.warn(`Could not find TCINI link for task ${taskId}`);

			// 2. Find GUNKA composite (Worker -> Task)
			const findGunkaQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'find',
						target: { schema: GUNKA_SCHEMA_ID, x1: workerId, x2: taskId },
						variables: { linkId: { source: 'link.pubkey' } },
						return: 'first',
						resultVariable: 'found'
					}
				]
			};
			const gunkaRes = await import('$lib/KERNEL/hominio-query').then((m) =>
				m.executeQuery(findGunkaQuery, user)
			);
			if (gunkaRes && gunkaRes.length > 0 && gunkaRes[0].linkId)
				gunkaCompositeId = gunkaRes[0].linkId as string;
			else console.warn(`Could not find GUNKA link for worker ${workerId} and task ${taskId}`);

			// 3. Find CNEME composite (Task Concept -> Name Leaf) and the Name Leaf ID itself
			const findCnemeQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'find',
						target: { schema: CNEME_SCHEMA_ID, x1: taskId }, // Find link by task concept
						variables: {
							linkId: { source: 'link.pubkey' },
							nameLeafVar: { source: 'link.x2' } // Get the name leaf ID (x2)
						},
						return: 'first',
						resultVariable: 'found'
					}
				]
			};
			const cnemeRes = await import('$lib/KERNEL/hominio-query').then((m) =>
				m.executeQuery(findCnemeQuery, user)
			);
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

		// Construct the deletion list carefully, only including found items
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
		mutationsToDelete.push({ operation: 'delete', type: 'Leaf', targetPubKey: taskId }); // Always delete the task concept itself

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
			// REMOVED: Trigger indexing call
		} catch (err: unknown) {
			console.error('Failed to delete todo:', err);
			mutationError = err instanceof Error ? err.message : 'Failed to delete todo.';
		}
	}

	// --- Lifecycle and Effects ---
	onMount(() => {
		currentUser = getCurrentUser();
	});

	// Reactive effect to update component state based on the readable store - CORRECTED
	$effect(() => {
		const currentResults = $todoReadable; // Get the direct value
		// console.log('[Todos.svelte $effect] Received direct value:', currentResults);

		if (currentResults === undefined) {
			// Still loading or initial state
			isLoading = true;
			error = null;
			// console.log('[Todos.svelte $effect] State: Loading');
		} else if (currentResults === null) {
			// Query execution failed
			isLoading = false;
			error = 'Query execution failed.';
			if (todos.length > 0) todos = []; // Clear existing todos
			// console.log('[Todos.svelte $effect] State: Error');
		} else {
			// Query succeeded, currentResults is QueryResult[]
			isLoading = false;
			error = null;
			// Optimization: Only update if results changed
			const currentTodosString = JSON.stringify(todos);
			const newResultsString = JSON.stringify(currentResults);
			if (currentTodosString !== newResultsString) {
				// console.log('[Todos.svelte $effect] State: Success - Updating todos');
				todos = currentResults;
			} else {
				// console.log('[Todos.svelte $effect] State: Success - No changes detected');
			}
		}
	});

	onDestroy(() => {
		console.log('[Todos.svelte] Component destroyed');
	});
</script>

<div class="flex h-full flex-col overflow-hidden bg-[#f8f4ed] p-4">
	<h2 class="mb-4 text-xl font-semibold text-[#0a2a4e]">Simple Todos</h2>

	<!-- Add Todo Input -->
	<form class="mb-4 flex items-center gap-2" on:submit|preventDefault={addTodo}>
		<input
			type="text"
			bind:value={newTodoText}
			placeholder="What needs to be done?"
			class="flex-grow rounded-l border border-gray-300 bg-white px-3 py-2 text-[#0a2a4e] transition-shadow focus:border-[#a7b7cb] focus:ring-2 focus:ring-[#c5d4e8] focus:outline-none"
			required
			disabled={isAdding}
		/>
		<button
			type="submit"
			class="rounded-r bg-[#0a2a4e] px-4 py-2 text-[#f8f4ed] transition-colors hover:bg-[#1e3a5e] focus:ring-2 focus:ring-[#0a2a4e] focus:ring-offset-2 focus:outline-none disabled:opacity-50"
			disabled={isAdding}
		>
			{#if isAdding}
				<span>Adding...</span>
			{:else}
				<span>Add Todo</span>
			{/if}
		</button>
	</form>

	<!-- Mutation Error State -->
	{#if mutationError}
		<div
			class="relative mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
			role="alert"
		>
			<strong class="font-bold">Mutation Error:</strong>
			<span class="block sm:inline">{mutationError}</span>
			<button
				class="absolute top-0 right-0 bottom-0 px-4 py-3"
				on:click={() => (mutationError = null)}
			>
				<svg
					class="h-6 w-6 fill-current text-red-500"
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

	<!-- Loading / Query Error State -->
	{#if isLoading}
		<div class="py-4 text-center text-gray-500">Loading todos...</div>
	{:else if error}
		<div
			class="relative mb-4 rounded border border-orange-400 bg-orange-100 px-4 py-3 text-orange-700"
			role="alert"
		>
			<strong class="font-bold">Query Error:</strong>
			<span class="block sm:inline">{error}</span>
		</div>
	{/if}

	<!-- Todo List -->
	{#if !isLoading && !error && todos.length > 0}
		<ul class="flex-1 divide-y divide-gray-200 overflow-y-auto pr-2">
			{#each todos as item (item.taskId)}
				{#if item.taskId}
					{@const taskName = typeof item.taskName === 'string' ? item.taskName : '(No Task Name)'}
					{@const workerName =
						typeof item.workerName === 'string' ? item.workerName : '(No Worker)'}
					{@const currentStatusLeafId =
						typeof item.statusLeafId === 'string' ? item.statusLeafId : undefined}
					{@const isDone = currentStatusLeafId === STATUS_COMPLETED_ID}
					{@const statusValue = typeof item.status === 'string' ? item.status : '(no status value)'}

					<li class="group flex items-center justify-between px-1 py-3">
						<div class="flex items-center">
							<input
								type="checkbox"
								checked={isDone}
								on:change={() => toggleTodoStatus(item)}
								class="mr-3 h-4 w-4 cursor-pointer rounded border-gray-300 text-[#0a2a4e] focus:ring-[#0a2a4e]"
							/>
							<span class={isDone ? 'text-gray-500 line-through' : 'text-[#0a2a4e]'}>
								{taskName}
							</span>
							<span class="ml-2 text-xs text-gray-500">
								assigned to <span class="font-medium text-gray-600">{workerName}</span>
							</span>
							<span class="ml-2 text-xs text-gray-400">({statusValue})</span>
						</div>
						<button
							on:click={() => deleteTodo(item)}
							class="rounded-full p-1 text-red-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-100 hover:text-red-700 focus:outline-none"
							aria-label="Delete todo"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{:else if !isLoading && !error && todos.length === 0}
		<div class="py-4 text-center text-gray-500">No todos found.</div>
	{/if}
</div>
