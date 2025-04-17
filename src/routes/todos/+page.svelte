<script lang="ts">
	import {
		hominioQLService,
		type HqlQueryRequest,
		type HqlMutationRequest,
		type HqlQueryResult,
		type ResolvedHqlDocument
	} from '$lib/KERNEL/hominio-ql';
	import { getContext } from 'svelte';
	import { readable, type Readable } from 'svelte/store';
	import { getCurrentEffectiveUser as getCurrentEffectiveUserType } from '$lib/KERNEL/hominio-auth';
	import type { CapabilityUser } from '$lib/KERNEL/hominio-caps';

	// --- Constants ---
	const LISTE_SCHEMA_NAME = 'liste';
	const GUNKA_SCHEMA_NAME = 'gunka';
	const TCINI_SCHEMA_NAME = 'tcini';
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
		console.log('[Todos Debug] Effect to fetch items running. listKey:', listKey);
		if (listKey) {
			const query: HqlQueryRequest = {
				operation: 'query',
				filter: {
					meta: { schema: '@0x379da4ae0349663a8a1f8a8972bb6294aeb187e0da77df1bef7406651a8cc79a' }, // Hardcoded Gunka PubKey Ref
					places: {
						// Ensure x3 references the specific list
						x3: `@${listKey}`
					}
				}
			};
			const currentUser = getCurrentEffectiveUser();
			todoItemsReadable = hominioQLService.processReactive(currentUser, query);
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
					meta: { schema: `@${LISTE_SCHEMA_NAME}` }, // Base schema
					places: { x1: DEFAULT_LIST_NAME }
				}
			};
			const currentUser = getCurrentEffectiveUser();
			const result = await hominioQLService.process(currentUser, findListQuery);

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
					schema: LISTE_SCHEMA_NAME, // Use base schema name
					places: {
						x1: DEFAULT_LIST_NAME,
						x2: '' // Add default empty string for required x2 place
						// No hominio_type marker needed
					}
				};
				const createListUser = getCurrentEffectiveUser();
				const createResult = await hominioQLService.process(createListUser, createListMutation);
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
				schema: GUNKA_SCHEMA_NAME, // Use base schema name
				places: {
					x1: FIONA_REF, // Assignee (Hardcoded to Fiona)
					x2: newTodoText.trim(), // Task description
					x3: `@${todoListPubKey}` // Reference to the list
					// x4 (status ref) will be added in step 3
				}
			};
			const createTodoUser = getCurrentEffectiveUser();
			const todoResult = await hominioQLService.process(createTodoUser, createTodoMutation);
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
				schema: TCINI_SCHEMA_NAME,
				places: {
					x1: STATUS_TODO, // Default status
					x2: `@${gunkaPubKey}` // Link to the gunka document
				}
			};
			const createTciniUser = getCurrentEffectiveUser();
			const tciniResult = await hominioQLService.process(createTciniUser, createTciniMutation);
			if (!tciniResult || Array.isArray(tciniResult) || !('pubKey' in tciniResult)) {
				// Attempt cleanup: Delete the gunka created in step 1
				console.warn(
					'[Todos Debug] Failed to create tcini (Step 2). Attempting to delete gunka ',
					gunkaPubKey
				);
				const cleanupUser1 = getCurrentEffectiveUser();
				await hominioQLService
					.process(cleanupUser1, { operation: 'mutate', action: 'delete', pubKey: gunkaPubKey })
					.catch((e) => console.error('Cleanup failed:', e));
				throw new Error('Failed to create status document for todo item. Unexpected result type.');
			}
			const tciniPubKey = tciniResult.pubKey;
			console.log('[Todos Debug] Created Tcini (Step 2): ', tciniPubKey);

			// 3. Update the gunka document to add the reference to the tcini document
			const updateTodoMutation: HqlMutationRequest = {
				operation: 'mutate',
				action: 'update',
				pubKey: gunkaPubKey,
				places: {
					x4: `@${tciniPubKey}` // Add the reference to the status document
				}
			};
			const updateTodoUser = getCurrentEffectiveUser();
			const updateResult = await hominioQLService.process(updateTodoUser, updateTodoMutation);
			if (!updateResult || Array.isArray(updateResult) || !('pubKey' in updateResult)) {
				// Attempt cleanup: Delete tcini and gunka
				console.warn(
					'[Todos Debug] Failed to update gunka (Step 3). Attempting to delete tcini and gunka.'
				);
				const cleanupUser2 = getCurrentEffectiveUser();
				await hominioQLService
					.process(cleanupUser2, { operation: 'mutate', action: 'delete', pubKey: tciniPubKey })
					.catch((e) => console.error('Tcini cleanup failed:', e));
				const cleanupUser3 = getCurrentEffectiveUser();
				await hominioQLService
					.process(cleanupUser3, { operation: 'mutate', action: 'delete', pubKey: gunkaPubKey })
					.catch((e) => console.error('Gunka cleanup failed:', e));
				throw new Error('Failed to update todo item with status reference.');
			}

			console.log(
				'[Todos Debug] Updated Gunka with Tcini ref (Step 3). Final Gunka PubKey:',
				gunkaPubKey
			);
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
				places: {
					x1: newStatus
				}
			};
			const toggleUser = getCurrentEffectiveUser();
			const updateResult = await hominioQLService.process(toggleUser, updateStatusMutation);

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
				{#if $todoItemsReadable === undefined}
					<p class="text-gray-500">Loading todos...</p>
				{:else if $todoItemsReadable === null}
					<p class="text-red-600">Error loading todos.</p>
				{:else if $todoItemsReadable.length === 0}
					<p class="text-yellow-700">No todos found in this list yet.</p>
				{:else}
					<ul class="divide-y divide-gray-200">
						{#each $todoItemsReadable as item (item.pubKey)}
							<!-- Check item.data and item.data.places before accessing -->
							{@const itemData = item.data as Record<string, unknown> | undefined}
							{@const itemPlaces = itemData?.places as Record<string, any> | undefined}
							<!-- Access the resolved status document object -->
							{@const statusDoc = itemPlaces?.x4 as Record<string, any> | undefined}
							{@const statusDocPlaces = statusDoc?.data?.places as Record<string, any> | undefined}
							{@const currentStatusText = statusDocPlaces?.x1 ?? 'Unknown Status'}
							{@const statusPubKey = statusDoc?.pubKey as string | undefined}
							{@const isDone = currentStatusText === STATUS_DONE}
							<li
								class="flex items-center justify-between py-3 transition-colors {statusPubKey
									? 'hover:bg-gray-50'
									: 'opacity-50'}"
							>
								<div class="flex flex-grow items-center space-x-3">
									<input
										type="checkbox"
										checked={isDone}
										class="h-5 w-5 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-75"
										on:change={() => toggleTodoStatus(statusPubKey, currentStatusText)}
										disabled={isSubmitting || !statusPubKey}
									/>
									<span class={isDone ? 'text-gray-500 line-through' : 'text-gray-800'}>
										{itemPlaces?.x2 ?? 'No description'}
									</span>
								</div>
								<span class="text-xs text-gray-400">({currentStatusText})</span>
								<!-- TODO: Add edit/delete buttons later -->
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
			<p class="text-center text-gray-500">Could not load or create the todo list.</p>
		{/if}
	</main>
</div>
