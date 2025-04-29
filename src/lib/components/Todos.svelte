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

	// --- Types ---
	// No longer need MappedTodo interface

	// --- State ---
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let mutationError = $state<string | null>(null);
	let newTodoText = $state('');
	let isAdding = $state(false);
	let currentUser = $state<CapabilityUser | null>(null);
	let todos = $state<QueryResult[]>([]);

	// Define the Todos query using the steps-based JSON format
	const todosQuery: LoroHqlQueryExtended = {
		steps: [
			{
				action: 'find',
				target: {
					schema: '0xf4f64c16a96daf1d2b91269fe82946b21b7d1faa728ff20ed86a6c18dabc4943'
				},
				variables: {
					taskVar: { source: 'link.x1' },
					statusLeafVar: { source: 'link.x2' }
				},
				resultVariable: 'taskStatusLinks',
				return: 'array'
			},
			{
				action: 'find',
				target: {
					schema: '0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96'
				},
				variables: {
					entityVar: { source: 'link.x1' },
					nameLeafVar: { source: 'link.x2' }
				},
				resultVariable: 'entityNameLinks',
				return: 'array'
			},
			{
				action: 'get',
				from: {
					variable: 'taskStatusLinks',
					sourceKey: 'statusLeafVar',
					targetDocType: 'Leaf'
				},
				fields: {
					statusValue: { field: 'self.data.value' }
				},
				variables: {
					// Corrected: Use doc.pubkey which IS the _sourceKey for the GET operation
					statusLeafKey: { source: 'doc.pubkey' }
				},
				resultVariable: 'statusDetails',
				return: 'array'
			},
			{
				action: 'get',
				from: {
					variable: 'entityNameLinks',
					sourceKey: 'nameLeafVar',
					targetDocType: 'Leaf'
				},
				fields: {
					nameValue: { field: 'self.data.value' }
				},
				variables: {
					// Corrected: Use doc.pubkey which IS the _sourceKey for the GET operation
					nameLeafKey: { source: 'doc.pubkey' }
				},
				resultVariable: 'nameDetails',
				return: 'array'
			},
			{
				action: 'select',
				groupBy: 'taskVar',
				select: {
					// Also select the composite/leaf IDs needed for mutations
					taskId: { variable: 'taskVar' },
					statusLeafId: { variable: 'taskStatusLinks_statusLeafVar' },
					status: { variable: 'status' },
					name: { variable: 'name' },
					tciniCompositeId: { variable: 'taskStatusLinks__sourceKey' }, // Get pubkey of the tcini link
					cnemeCompositeId: { variable: 'entityNameLinks__sourceKey' }, // Get pubkey of the cneme link
					nameLeafId: { variable: 'entityNameLinks_nameLeafVar' } // Get the name leaf id
				}
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

	// --- Constants ---
	const TCINI_SCHEMA_ID = '0xf4f64c16a96daf1d2b91269fe82946b21b7d1faa728ff20ed86a6c18dabc4943';
	const CNEME_SCHEMA_ID = '0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96';
	const STATUS_NOT_STARTED_ID = '@status_notstarted';
	const STATUS_COMPLETED_ID = '@status_completed';

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

	// --- Refactored toggleTodoStatus (Uses correct Status IDs) ---
	async function toggleTodoStatus(item: QueryResult) {
		const user = currentUser;
		if (!user) {
			mutationError = 'User not authenticated.';
			console.error('User not authenticated.');
			return;
		}

		// Access IDs directly from the item (as selected in the query)
		const tciniCompositeId = item.tciniCompositeId as string;
		const currentStatusLeafId = item.statusLeafId as string;

		if (!tciniCompositeId || !currentStatusLeafId) {
			mutationError = 'Cannot toggle status: Link information missing from query result.';
			console.error('Missing IDs from query result for toggle:', item);
			return;
		}

		// Corrected: Use STATUS constants
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

	// --- Refactored deleteTodo ---
	async function deleteTodo(item: QueryResult) {
		const user = currentUser;
		if (!user) {
			mutationError = 'User not authenticated.';
			console.error('User not authenticated.');
			return;
		}

		// Access IDs directly from the item (as selected in the query)
		const taskId = item.taskId as string;
		const tciniCompositeId = item.tciniCompositeId as string;
		const cnemeCompositeId = item.cnemeCompositeId as string;
		const nameLeafId = item.nameLeafId as string;

		if (!taskId || !tciniCompositeId || !cnemeCompositeId || !nameLeafId) {
			mutationError = 'Cannot delete: Missing required IDs from query result.';
			console.error('Missing IDs for deletion from query result:', item);
			return;
		}

		console.log('Attempting to delete todo (Task ID):', taskId);
		mutationError = null;

		const mutationRequest: MutateHqlRequest = {
			mutations: [
				{ operation: 'delete', type: 'Composite', targetPubKey: tciniCompositeId },
				{ operation: 'delete', type: 'Composite', targetPubKey: cnemeCompositeId },
				{ operation: 'delete', type: 'Leaf', targetPubKey: nameLeafId },
				{ operation: 'delete', type: 'Leaf', targetPubKey: taskId }
			]
		};

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

<div class="flex h-full flex-col overflow-hidden bg-white p-4">
	<h2 class="mb-4 text-xl font-semibold text-gray-800">Simple Todos (Local - Refactored)</h2>

	<!-- Add Todo Input -->
	<form class="mb-4 flex items-center gap-2" on:submit|preventDefault={addTodo}>
		<input
			type="text"
			bind:value={newTodoText}
			placeholder="What needs to be done?"
			class="flex-grow rounded-l border border-gray-300 px-3 py-2 text-gray-900 transition-shadow focus:border-transparent focus:ring-2 focus:ring-indigo-500 focus:outline-none"
			required
			disabled={isAdding}
		/>
		<button
			type="submit"
			class="rounded-r bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
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
					<!-- Add safety check for taskId -->
					{@const name = typeof item.name === 'string' ? item.name : '(No Name)'}
					<!-- Access name directly -->
					{@const currentStatusLeafId =
						typeof item.statusLeafId === 'string' ? item.statusLeafId : undefined}
					{@const isDone = currentStatusLeafId === STATUS_COMPLETED_ID}
					{@const statusValue = typeof item.status === 'string' ? item.status : 'no status value'}
					<!-- Access status directly -->

					<li class="group flex items-center justify-between px-1 py-3">
						<div class="flex items-center">
							<input
								type="checkbox"
								checked={isDone}
								on:change={() => toggleTodoStatus(item)}
								class="mr-3 h-4 w-4 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
							/>
							<span class={isDone ? 'text-gray-500 line-through' : 'text-gray-800'}>
								{name}
							</span>
							<span class="ml-2 text-xs text-gray-400">({statusValue})</span>
						</div>
						<button
							on:click={() => deleteTodo(item)}
							class="rounded-full p-1 text-red-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-100 hover:text-red-700 focus:outline-none"
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
