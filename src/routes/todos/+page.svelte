<script lang="ts">
	import {
		hql,
		type HqlQueryRequest,
		type HqlMutationRequest,
		type HqlQueryResult
	} from '$lib/KERNEL/hominio-ql';
	import { getContext } from 'svelte';
	import { readable, type Readable } from 'svelte/store';
	import { getCurrentEffectiveUser as getCurrentEffectiveUserType } from '$lib/KERNEL/hominio-auth';

	// --- Constants --- Define PubKeys directly ---
	const LISTE_SCHEMA_PUBKEY = '0x3fe09dd2eb611a10f3438692f60165fcc350d14f47a5de72ca603c1504bb38aa';
	const GUNKA_SCHEMA_PUBKEY = '0x379da4ae0349663a8a1f8a8972bb6294aeb187e0da77df1bef7406651a8cc79a';
	const TCINI_SCHEMA_PUBKEY = '0x6b0f40bcb19564eb2607ba56fb977f67c459c46f199d80576490defccf41cc6a';

	const DEFAULT_LIST_NAME = 'Main';
	const STATUS_TODO = 'todo';
	const STATUS_DONE = 'done';

	// --- State ---
	let todoListPubKey = $state<string | null>(null);
	let newTodoText = $state('');
	let isLoadingList = $state(true);
	let error = $state<string | null>(null);
	let isSubmitting = $state(false);

	// Hardcode Fiona's pubkey for assignment (replace current user logic)
	const FIONA_REF = '@0xfc9a97ea41a1f866f81c6fda2a5677669c9ce80d194b312a06ce085593262c40';

	// --- Reactive Stores ---
	let todoItemsReadable = $state(readable<HqlQueryResult | null | undefined>(undefined));
	let tciniItemsReadable = $state(readable<HqlQueryResult | null | undefined>(undefined)); // New store for tcini items

	// Get session store from context provided by layout
	// Define the expected type for the store more accurately if possible
	// This is a basic assumption for the store's structure
	type SessionStoreType = Readable<{
		ready: boolean;
		data: { user?: { id: string; [key: string]: any } | null; [key: string]: any } | null;
	}>;
	const sessionStore = getContext<SessionStoreType>('sessionStore');

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getCurrentEffectiveUserType;
	const getCurrentEffectiveUser = getContext<GetCurrentUserFn>('getCurrentEffectiveUser');

	// --- State for Resolved Statuses (Workaround for missing $refSchema) ---
	let todoStatuses = $state<Record<string, string>>({}); // pubKey -> status text

	// --- State for Sidebar ---
	let selectedTodoPubKey = $state<string | null>(null);

	// --- Debug Logging ---
	$effect(() => {
		console.log('[Todos Debug] todoListPubKey changed:', todoListPubKey);
	});
	$effect(() => {
		console.log('[Todos Debug] todoItemsReadable updated:', $todoItemsReadable);
	});

	// --- Effects ---
	// Effect to fetch todo items once the list pubKey is available
	$effect(() => {
		const listKey = todoListPubKey;
		console.log('[Todos Debug] Effect to fetch gunka items running. listKey:', listKey);
		if (listKey) {
			const gunkaQuery: HqlQueryRequest = {
				operation: 'query',
				filter: {
					meta: { gismu: 'bridi' },
					data: { selbri: `@${GUNKA_SCHEMA_PUBKEY}` },
					sumti: {
						x3: `@${listKey}`
					}
				}
			};
			// Pass the function to get the user for reactive queries
			todoItemsReadable = hql.processReactive(getCurrentEffectiveUser, gunkaQuery);

			// Also fetch related tcini items (could be optimized later)
			const tciniQuery: HqlQueryRequest = {
				operation: 'query',
				filter: {
					meta: { gismu: 'bridi' },
					data: { selbri: `@${TCINI_SCHEMA_PUBKEY}` }
				}
			};
			tciniItemsReadable = hql.processReactive(getCurrentEffectiveUser, tciniQuery);
		} else {
			// Reset both readables if listKey is null
			todoItemsReadable = readable(undefined);
			tciniItemsReadable = readable(undefined);
		}
	});

	// Use $effect.pre to wait for auth readiness before finding/creating list
	$effect.pre(() => {
		const session = $sessionStore; // Subscribe to the store from context

		console.log('[Todos Debug] Auth effect running. Session Data:', session.data);

		// Trigger when session data is loaded (exists) and we haven't started/finished loading the list yet
		if (session.data !== null && isLoadingList && todoListPubKey === null && !error) {
			if (session.data.user) {
				// Session loaded WITH user
				console.log(
					'[Todos Debug] Auth session loaded with user, attempting to find or create todo list...'
				);
				findOrCreateTodoList();
			} else {
				// Session loaded WITHOUT user
				console.log('[Todos Debug] Auth session loaded without user.');
				error = 'User not logged in. Cannot load or create todos.';
				isLoadingList = false; // Stop loading indicator
			}
		}
	});

	// --- Functions ---
	async function findOrCreateTodoList() {
		isLoadingList = true;
		error = null;
		try {
			// Query for the list by name, using the base 'liste' schema
			const findListQuery: HqlQueryRequest = {
				operation: 'query',
				filter: {
					meta: { gismu: 'bridi' },
					data: { selbri: `@${LISTE_SCHEMA_PUBKEY}` },
					sumti: { x1: DEFAULT_LIST_NAME }
				}
			};
			// Pass the current user object for non-reactive queries/mutations
			const currentUser = getCurrentEffectiveUser();
			const result = await hql.process(currentUser, findListQuery);

			// --- Type Guard for Query Result ---
			if (result && Array.isArray(result) && result.length > 0) {
				todoListPubKey = result[0].pubKey;
				console.log('[Todos Debug] Found existing Todo List:', todoListPubKey);
			} else {
				console.log('Todo List not found, creating...');
				// Create the list if not found, using the base 'liste' schema
				const createListMutation: HqlMutationRequest = {
					operation: 'mutate',
					action: 'create',
					selbri: `@${LISTE_SCHEMA_PUBKEY}`,
					sumti: {
						x1: DEFAULT_LIST_NAME,
						x2: ''
					}
				};
				// Pass the current user object for non-reactive queries/mutations
				const createListUser = getCurrentEffectiveUser();
				const createResult = await hql.process(createListUser, createListMutation);
				// --- Type Guard for Mutation Result (expecting Docs on create) ---
				if (createResult && !Array.isArray(createResult) && 'pubKey' in createResult) {
					todoListPubKey = createResult.pubKey;
					console.log('[Todos Debug] Created new Todo List:', todoListPubKey);
				} else {
					throw new Error('Failed to create the default todo list.');
				}
			}
		} catch (err: any) {
			console.error('Error finding or creating todo list:', err);
			error = err.message || 'Failed to load todo list.';
		} finally {
			isLoadingList = false;
		}
	}

	async function createTodoItem() {
		if (!newTodoText.trim() || !todoListPubKey || isSubmitting) return;
		isSubmitting = true;
		error = null;

		try {
			// 1. Create the 'todoItem' document, using the base 'gunka' schema
			const createTodoMutation: HqlMutationRequest = {
				operation: 'mutate',
				action: 'create',
				selbri: `@${GUNKA_SCHEMA_PUBKEY}`,
				sumti: {
					x1: FIONA_REF,
					x2: newTodoText.trim(),
					x3: `@${todoListPubKey}`
				}
			};
			// Pass the current user object for non-reactive queries/mutations
			const createTodoUser = getCurrentEffectiveUser();
			const todoResult = await hql.process(createTodoUser, createTodoMutation);
			// --- Type Guard for Mutation Result (expecting Docs on create) ---
			if (!todoResult || Array.isArray(todoResult) || !('pubKey' in todoResult)) {
				// TODO: Consider cleanup of the created tcini document if todo creation fails
				throw new Error('Failed to create todo item document.');
			}
			const gunkaPubKey = todoResult.pubKey;
			console.log('[Todos Debug] Created Gunka (Step 1): ', gunkaPubKey);

			// 2. Create the 'tcini' status document, linking it to the new gunka
			const createTciniMutation: HqlMutationRequest = {
				operation: 'mutate',
				action: 'create',
				selbri: `@${TCINI_SCHEMA_PUBKEY}`,
				sumti: {
					x1: STATUS_TODO,
					x2: `@${gunkaPubKey}`
				}
			};
			// Pass the current user object for non-reactive queries/mutations
			const createTciniUser = getCurrentEffectiveUser();
			const tciniResult = await hql.process(createTciniUser, createTciniMutation);
			if (!tciniResult || Array.isArray(tciniResult) || !('pubKey' in tciniResult)) {
				// Attempt cleanup: Delete the gunka created in step 1
				console.warn(
					'[Todos Debug] Failed to create tcini (Step 2). Attempting to delete gunka ',
					gunkaPubKey
				);
				const cleanupUser1 = getCurrentEffectiveUser();
				await hql
					.process(cleanupUser1, { operation: 'mutate', action: 'delete', pubKey: gunkaPubKey })
					.catch((e: unknown) => console.error('Cleanup failed:', e));
				throw new Error('Failed to create status document for todo item. Unexpected result type.');
			}
			const tciniPubKey = tciniResult.pubKey;
			console.log('[Todos Debug] Created Tcini (Step 2): ', tciniPubKey);

			// --- Step 3 Removed: No longer need to update Gunka ---

			newTodoText = ''; // Clear input
		} catch (err: any) {
			console.error('Error creating todo item:', err);
			error = err.message || 'Failed to create todo item.';
		} finally {
			isSubmitting = false;
		}
	}

	async function toggleTodoStatus(
		statusPubKey: string | undefined,
		currentStatus: string | undefined
	) {
		if (!statusPubKey || isSubmitting) {
			console.error('[Toggle Status] Invalid or missing statusPubKey');
			error = 'Cannot toggle status: Invalid status reference or action in progress.';
			return;
		}
		if (typeof currentStatus !== 'string') {
			console.error('[Toggle Status] Invalid or missing currentStatus', currentStatus);
			error = 'Cannot toggle status: Could not determine current status.';
			return;
		}

		isSubmitting = true; // Maybe use a per-item submitting state later
		error = null;

		try {
			// Determine the new status based on the passed currentStatus
			const newStatus = currentStatus === STATUS_DONE ? STATUS_TODO : STATUS_DONE;

			// Update the 'tcini' status document
			const updateStatusMutation: HqlMutationRequest = {
				operation: 'mutate',
				action: 'update',
				pubKey: statusPubKey,
				sumti: {
					x1: newStatus
				}
			};
			// Pass the current user object for non-reactive queries/mutations
			const toggleUser = getCurrentEffectiveUser();
			const updateResult = await hql.process(toggleUser, updateStatusMutation);

			// --- Type Guard for Mutation Result (expecting Docs on update) ---
			if (!updateResult || Array.isArray(updateResult) || !('pubKey' in updateResult)) {
				throw new Error('Failed to update todo status.');
			}

			console.log(`Updated status for ${statusPubKey} to ${newStatus}`);

			// --- Update local status state (workaround) ---
			todoStatuses[statusPubKey] = newStatus;
			// Trigger reactivity if needed, though modifying $state should be enough
			todoStatuses = { ...todoStatuses };
		} catch (err: any) {
			console.error('Error toggling todo status:', err);
			error = err.message || 'Failed to toggle status.';
		} finally {
			isSubmitting = false; // Reset general submitting flag
		}
	}

	// TODO (V1 enhancement): Function to update todo text (x2)
	// TODO (V2): Functions for tags, filtering, assigning people
</script>

<!-- Use a grid layout similar to hql page -->
<div class="grid h-screen grid-cols-1 bg-gray-100 md:grid-cols-[1fr_350px]">
	<!-- Main Content Area (Left Column) -->
	<main class="col-span-1 flex flex-col overflow-y-auto p-6">
		<h1 class="mb-6 text-center text-3xl font-bold text-indigo-700">Hominio Todos (HQL)</h1>

		{#if isLoadingList}
			<p class="text-center text-gray-500">Loading todo list...</p>
		{:else if error}
			<p class="rounded border border-red-400 bg-red-100 p-3 text-center text-red-700">
				Error: {error}
			</p>
		{:else if todoListPubKey}
			<!-- Add Todo Section -->
			<div class="mb-6 rounded border border-gray-300 bg-white p-4 shadow-sm">
				<h2 class="mb-3 text-xl font-semibold text-gray-800">
					Add New Todo to "{DEFAULT_LIST_NAME}"
				</h2>
				<div class="flex items-center space-x-2">
					<input
						type="text"
						bind:value={newTodoText}
						placeholder="Enter task description..."
						class="flex-grow rounded border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
						class:text-gray-900={true}
						readonly={isSubmitting}
						on:keydown={(e) => e.key === 'Enter' && createTodoItem()}
					/>
					<button
						class="rounded bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
						on:click={createTodoItem}
						disabled={isSubmitting || !newTodoText.trim()}
					>
						{isSubmitting ? 'Adding...' : 'Add Todo'}
					</button>
				</div>
			</div>

			<!-- Todo List Section -->
			<div class="flex-grow rounded border border-gray-300 bg-white p-4 shadow-sm">
				<h2 class="mb-4 text-xl font-semibold text-gray-800">Current Todos</h2>
				{#if $todoItemsReadable === undefined || $tciniItemsReadable === undefined}
					<p class="text-gray-500">Loading todos and statuses...</p>
				{:else if $todoItemsReadable === null || $tciniItemsReadable === null}
					<p class="text-red-600">Error loading todos or statuses.</p>
				{:else if $todoItemsReadable.length === 0}
					<p class="text-yellow-700">No todos found in this list yet.</p>
				{:else if Array.isArray($todoItemsReadable) && Array.isArray($tciniItemsReadable)}
					<ul class="divide-y divide-gray-200">
						{#each $todoItemsReadable as item (item.pubKey)}
							{@const itemData = item.data as Record<string, unknown> | undefined}
							{@const itemSumti = itemData?.sumti as Record<string, any> | undefined}

							<!-- Find the corresponding tcini item -->
							{@const expectedTciniRef = `@${item.pubKey}`}
							{@const relatedTcini = $tciniItemsReadable?.find(
								// Updated: Compare the pubKey *within* the resolved reference object in tcini.data.sumti.x2
								(tcini) => (tcini.data as any)?.sumti?.x2?.pubKey === item.pubKey
							)}
							<!-- Use type assertion to satisfy linter -->
							{@const currentStatusText =
								// Updated: Get status from sumti.x1
								(relatedTcini?.data as any)?.sumti?.x1 ?? 'Unknown Status'}
							{@const statusPubKey = relatedTcini?.pubKey as string | undefined}
							{@const isDone = currentStatusText === STATUS_DONE}

							<li
								class="flex cursor-pointer items-center justify-between py-3 transition-colors {selectedTodoPubKey ===
								item.pubKey
									? 'bg-indigo-50'
									: 'hover:bg-gray-50'}"
								on:click={() => (selectedTodoPubKey = item.pubKey)}
							>
								<div class="flex flex-grow items-center space-x-3 overflow-hidden">
									<input
										type="checkbox"
										checked={isDone}
										class="h-5 w-5 flex-shrink-0 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-75"
										on:change={() => toggleTodoStatus(statusPubKey, currentStatusText)}
										disabled={isSubmitting || !statusPubKey}
									/>
									<span class="truncate {isDone ? 'text-gray-500 line-through' : 'text-gray-800'}">
										{itemSumti?.x2 ?? 'No description'}
									</span>
								</div>
								<span class="ml-2 flex-shrink-0 text-xs text-gray-400">({currentStatusText})</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
			<p class="text-center text-gray-500">Could not load or create the todo list.</p>
		{/if}
	</main>

	<!-- Right Sidebar (Todo Details) -->
	<aside class="col-span-1 flex flex-col overflow-y-auto border-l border-gray-300 bg-white p-6">
		{#if selectedTodoPubKey && $todoItemsReadable}
			{@const selectedTodo = $todoItemsReadable.find((item) => item.pubKey === selectedTodoPubKey)}
			{#if selectedTodo}
				{@const selectedMeta = selectedTodo.meta as Record<string, any> | undefined}
				{@const selectedData = selectedTodo.data as Record<string, any> | undefined}
				{@const selectedSumti = selectedData?.sumti as Record<string, any> | undefined}
				<h2 class="mb-4 flex-shrink-0 text-xl font-semibold text-gray-700">Todo Details</h2>
				<div class="flex-grow overflow-y-auto">
					<p class="mb-1 text-sm text-gray-500">
						PubKey: <code class="rounded bg-gray-200 px-1 text-xs">{selectedTodo.pubKey}</code>
					</p>
					<p class="mb-1 text-sm text-gray-500">
						Cmene: <code class="rounded bg-gray-200 px-1 text-xs"
							>{selectedMeta?.cmene ?? 'N/A'}</code
						>
					</p>
					<h3 class="mt-4 mb-3 text-lg font-semibold text-gray-700">Sumti</h3>
					{#if selectedSumti && Object.keys(selectedSumti).length > 0}
						<dl class="space-y-2">
							{#each Object.entries(selectedSumti).sort( ([keyA], [keyB]) => keyA.localeCompare(keyB) ) as [sumtiKey, sumtiValue] (sumtiKey)}
								<div class="flex items-baseline">
									<dt class="w-10 flex-shrink-0 font-mono font-medium text-indigo-600">
										{sumtiKey}:
									</dt>
									<dd class="ml-2 text-sm text-gray-800">
										{#if typeof sumtiValue === 'object' && sumtiValue !== null && sumtiValue.$ref}
											<span class="text-purple-700">
												[Ref: {sumtiValue.cmene ?? sumtiValue.pubKey}
												{#if sumtiValue.statusText}({sumtiValue.statusText}){/if}]
											</span>
											<code class="ml-1 text-xs text-gray-500">({sumtiValue.pubKey})</code>
										{:else}
											{JSON.stringify(sumtiValue)}
										{/if}
									</dd>
								</div>
							{/each}
						</dl>
					{:else}
						<p class="text-sm text-gray-500">No sumti defined for this bridi.</p>
					{/if}

					<!-- Raw JSON Toggle -->
					<details class="mt-6 rounded border border-gray-300 bg-white">
						<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
							>Raw JSON</summary
						>
						<div class="border-t border-gray-300 p-3">
							<pre
								class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(
									selectedTodo,
									null,
									2
								)}</pre>
						</div>
					</details>
				</div>
			{/if}
		{/if}
	</aside>
</div>
