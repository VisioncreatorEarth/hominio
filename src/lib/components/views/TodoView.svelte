<script lang="ts">
	// REMOVED: Direct import of o
	// import { o } from '$lib/KERNEL/hominio-svelte';
	import { getContext } from 'svelte'; // Import getContext
	import { GENESIS_PUBKEY } from '$db/constants';
	import type { LoroHqlQueryExtended, QueryResult, IndexLeafType } from '$lib/KERNEL/hominio-types';
	import { filterState } from '$lib/tools/filterTodos/function'; // Keep for filtering UI
	import { onMount } from 'svelte';
	import { writable, type Readable } from 'svelte/store';

	// Get Hominio facade from context
	const o = getContext<typeof import('$lib/KERNEL/hominio-svelte').o>('o');

	// --- State ---
	let isLoadingQueryData = $state(true);
	let queryError = $state<string | null>(null);
	let isSchemaLoading = $state(true);
	let schemaError = $state<string | null>(null);
	let tciniPubKey = $state<string | null>(null);
	let cnemePubKey = $state<string | null>(null);
	let ckajiPubKey = $state<string | null>(null); // For tags
	let gunkaPubKey = $state<string | null>(null); // For assignee

	// --- HQL Query Setup ---
	const queryStore = writable<LoroHqlQueryExtended | null>(null);
	const todoReadable: Readable<QueryResult[] | null | undefined> = o.subscribe(queryStore);
	let allTodosFromQuery = $state<QueryResult[]>([]);
	let uniqueTags = $state<string[]>([]);

	// --- Fetch Schemas on Mount ---
	onMount(async () => {
		isSchemaLoading = true;
		schemaError = null;
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
				schemasResult &&
				schemasResult.length > 0 &&
				schemasResult[0].variables &&
				(schemasResult[0].variables as any).schema_map &&
				typeof (schemasResult[0].variables as any).schema_map === 'object'
			) {
				const schemaMap = (schemasResult[0].variables as any).schema_map as Record<string, string>;
				tciniPubKey = schemaMap['tcini'] ?? null;
				cnemePubKey = schemaMap['cneme'] ?? null;
				ckajiPubKey = schemaMap['ckaji'] ?? null;
				gunkaPubKey = schemaMap['gunka'] ?? null; // Get gunka pubkey

				if (!tciniPubKey || !cnemePubKey || !ckajiPubKey || !gunkaPubKey) {
					const missing = ['tcini', 'cneme', 'ckaji', 'gunka']
						.filter((n) => !schemaMap[n])
						.join(', ');
					throw new Error(`Could not load required schema pubkeys: ${missing}`);
				}
				schemaError = null;
			} else {
				throw new Error('Schemas index query failed or missing schema_map.');
			}
		} catch (err) {
			console.error('[TodoView] Error loading schema pubkeys:', err);
			schemaError = err instanceof Error ? err.message : 'Unknown error loading schemas.';
			tciniPubKey = null;
			cnemePubKey = null;
			ckajiPubKey = null;
			gunkaPubKey = null; // Reset gunka
		} finally {
			isSchemaLoading = false;
		}
	});

	// --- Reactive Query Construction ---
	$effect(() => {
		if (
			tciniPubKey &&
			cnemePubKey &&
			ckajiPubKey &&
			gunkaPubKey &&
			!isSchemaLoading &&
			!schemaError
		) {
			const todosQuery: LoroHqlQueryExtended = {
				steps: [
					// 1. Find Task Status Links (tcini: task -> status)
					{
						action: 'find',
						target: { schema: tciniPubKey },
						variables: { taskIdVar: { source: 'link.x1' }, statusLeafVar: { source: 'link.x2' } },
						resultVariable: 'taskStatusLinks',
						return: 'array'
					},
					// 2. Find Task Name Links (cneme: task -> nameLeaf)
					{
						action: 'find',
						target: { schema: cnemePubKey },
						variables: {
							taskForNameVar: { source: 'link.x1' },
							nameLeafVar: { source: 'link.x2' }
						},
						resultVariable: 'taskNameLinks',
						return: 'array'
					},
					// NEW 2b. Find Worker Assignment Links (gunka: worker -> task)
					{
						action: 'find',
						target: { schema: gunkaPubKey },
						variables: {
							workerIdVar: { source: 'link.x1' },
							assignedTaskVar: { source: 'link.x2' }
							// goalIdVar: { source: 'link.x3' } // Ignore goal for now
						},
						resultVariable: 'taskAssignmentLinks',
						return: 'array'
					},
					// NEW 2c. Find Worker Name Links (cneme: worker -> nameLeaf)
					{
						action: 'find',
						target: { schema: cnemePubKey }, // Assume cneme used for worker names too
						variables: {
							workerForNameVar: { source: 'link.x1' },
							workerNameLeafVar: { source: 'link.x2' }
						},
						resultVariable: 'workerNameLinks',
						return: 'array'
					},
					// 3. Join Status and Name links
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
					// NEW 3b. Join Worker Assignment onto Base Info
					{
						action: 'join',
						left: { variable: 'baseTaskInfo', key: 'taskId' },
						right: { variable: 'taskAssignmentLinks', key: 'assignedTaskVar' },
						type: 'left', // Keep tasks even if unassigned
						select: {
							taskId: { source: 'left.taskId' },
							statusLeafId: { source: 'left.statusLeafId' },
							nameLeafId: { source: 'left.nameLeafId' },
							workerId: { source: 'right.workerIdVar' } // Add workerId
						},
						resultVariable: 'taskWithWorkerInfo'
					},
					// NEW 3c. Join Worker Name onto Worker Info
					{
						action: 'join',
						left: { variable: 'taskWithWorkerInfo', key: 'workerId' },
						right: { variable: 'workerNameLinks', key: 'workerForNameVar' },
						type: 'left', // Keep tasks even if worker has no name link
						select: {
							taskId: { source: 'left.taskId' },
							statusLeafId: { source: 'left.statusLeafId' },
							nameLeafId: { source: 'left.nameLeafId' },
							workerId: { source: 'left.workerId' },
							workerNameLeafId: { source: 'right.workerNameLeafVar' } // Add worker name leaf ID
						},
						resultVariable: 'taskWithWorkerNameInfo'
					},
					// 4. Find Task Tag Links (ckaji: task -> tagLeaf)
					{
						action: 'find',
						target: { schema: ckajiPubKey },
						variables: { taskForTagVar: { source: 'link.x1' }, tagLeafVar: { source: 'link.x2' } },
						resultVariable: 'taskTagLinks',
						return: 'array'
					},
					// 5. Join Tags onto Task Info (Use taskWithWorkerNameInfo now)
					{
						action: 'join',
						left: { variable: 'taskWithWorkerNameInfo', key: 'taskId' }, // Changed variable
						right: { variable: 'taskTagLinks', key: 'taskForTagVar' },
						type: 'left',
						select: {
							taskId: { source: 'left.taskId' },
							statusLeafId: { source: 'left.statusLeafId' },
							nameLeafId: { source: 'left.nameLeafId' },
							workerId: { source: 'left.workerId' }, // Keep workerId
							workerNameLeafId: { source: 'left.workerNameLeafId' }, // Keep workerNameLeafId
							tagLeafId: { source: 'right.tagLeafVar' }
						},
						resultVariable: 'taskWithTagsInfo' // Reusing variable name is okay here
					},
					// 6. Resolve Leaf Values (Add workerName)
					{
						action: 'resolve',
						fromVariable: 'taskWithTagsInfo',
						resolveFields: {
							taskName: {
								type: 'resolveLeafValue',
								pubkeyVar: 'nameLeafId',
								fallbackVar: 'taskId'
							},
							workerName: {
								type: 'resolveLeafValue',
								pubkeyVar: 'workerNameLeafId',
								fallbackVar: 'workerId'
							}, // Resolve worker name
							status: {
								type: 'resolveLeafValue',
								pubkeyVar: 'statusLeafId',
								fallbackVar: 'statusLeafId'
							},
							tag: { type: 'resolveLeafValue', pubkeyVar: 'tagLeafId', fallbackVar: '' }
						},
						resultVariable: 'resolvedTodosWithTags'
					},
					// 7. Aggregate tags and workerName into an array
					{
						action: 'aggregate',
						fromVariable: 'resolvedTodosWithTags',
						groupByKey: 'taskId',
						aggregateFields: {
							taskName: { sourceField: 'taskName', operation: 'first' },
							workerName: { sourceField: 'workerName', operation: 'first' }, // Aggregate workerName
							status: { sourceField: 'status', operation: 'first' },
							statusLeafId: { sourceField: 'statusLeafId', operation: 'first' },
							tags: { sourceField: 'tag', operation: 'collect' }
						},
						resultVariable: 'allTodos' // Final result variable
					}
				]
			};
			queryStore.set(todosQuery);
		} else if (!isSchemaLoading && schemaError) {
			console.log('[TodoView] Schema loading failed, setting queryStore to null.');
			queryStore.set(null);
		} else {
			queryStore.set(null); // Set to null if schemas aren't ready
		}
	});

	// --- Reactive effect to update component state based on the readable store ---
	$effect(() => {
		const currentResults = $todoReadable;

		if (currentResults === undefined) {
			isLoadingQueryData = true;
			queryError = null;
		} else if (currentResults === null) {
			isLoadingQueryData = false;
			queryError = schemaError ?? 'Todo query execution failed.';
			if (allTodosFromQuery.length > 0) allTodosFromQuery = [];
		} else {
			isLoadingQueryData = false;
			queryError = null;
			// Basic check to avoid unnecessary updates if data hasn't changed
			if (JSON.stringify(allTodosFromQuery) !== JSON.stringify(currentResults)) {
				// Filter out empty strings from tags arrays potentially introduced by 'collect'
				allTodosFromQuery = currentResults.map((todo) => ({
					...todo,
					tags: Array.isArray(todo.tags) ? todo.tags.filter((tag) => tag !== '') : []
				}));
			}
		}
	});

	// --- Derive Unique Tags and Filtered Todos ---
	const filteredTodos = $derived.by(() => {
		const { tag } = $filterState; // Filter state dependency
		const allTodos = allTodosFromQuery; // Query result dependency

		if (!allTodos) return [];

		return allTodos.filter((todo) => {
			if (tag === null) return true; // No tag filter applied
			// Ensure todo.tags is an array before checking includes
			return Array.isArray(todo.tags) && todo.tags.includes(tag);
		});
	});

	$effect(() => {
		const allTags = new Set<string>();
		allTodosFromQuery.forEach((todo) => {
			// Ensure todo.tags exists and is an array
			if (Array.isArray(todo.tags)) {
				todo.tags.forEach((t) => {
					if (typeof t === 'string' && t) allTags.add(t);
				});
			}
		});
		// Basic check to avoid unnecessary updates
		if (JSON.stringify(uniqueTags) !== JSON.stringify(Array.from(allTags).sort())) {
			uniqueTags = Array.from(allTags).sort();
		}
	});

	// --- Utility Functions ---
	// Format date for display (assuming createdAt is a property, HQL needs to fetch this)
	function formatDate(timestamp: number | string | undefined): string {
		if (!timestamp) return '-'; // Handle missing timestamps from HQL
		try {
			// Attempt to parse if it's potentially a string date or number
			const date = new Date(timestamp);
			if (isNaN(date.getTime())) return String(timestamp); // Return original if invalid
			return date.toLocaleString();
		} catch {
			return String(timestamp); // Fallback
		}
	}

	// Filter todos by tag
	function filterByTag(tag: string | null) {
		filterState.update((state) => ({ ...state, tag }));
		// No need to call updateFilteredTodos, $derived handles it
	}

	// --- Placeholder Actions (Need HQL Implementation) ---
	async function toggleTodoCompletion(item: QueryResult) {
		// TODO: Implement HQL mutation to find tcini link and update x2 (statusLeafVar)
		console.warn('toggleTodoCompletion needs HQL mutation implementation', item);
		// Example structure (needs STATUS_ constants):
		// const targetStatusLeafId = item.status === 'completed' ? STATUS_NOT_STARTED_ID : STATUS_COMPLETED_ID;
		// Find tcini link where x1 == item.taskId
		// Update that tcini link composite, setting places.x2 = targetStatusLeafId
	}

	async function deleteTodo(item: QueryResult) {
		// TODO: Implement HQL mutation to find and delete task leaf, name leaf, tcini link, cneme link, ckaji links
		console.warn('deleteTodo needs HQL mutation implementation', item);
		// Find tcini link where x1 == item.taskId -> get link pubkey
		// Find cneme link where x1 == item.taskId -> get link pubkey AND x2 (name leaf pubkey)
		// Find ALL ckaji links where x1 == item.taskId -> get link pubkeys AND x2 (tag leaf pubkeys)
		// Construct DELETE mutations for all found composites, name leaf, tag leafs(?), and finally the task leaf (item.taskId)
	}

	// Helper function to get badge styles based on status
	function getStatusBadgeClass(status: string | undefined): string {
		switch (status) {
			case 'not-started':
				return 'bg-gray-200 text-gray-800';
			case 'in-progress':
				return 'bg-amber-200 text-amber-800';
			case 'completed':
				return 'bg-emerald-200 text-emerald-800';
			default:
				return 'bg-gray-100 text-gray-600';
		}
	}
</script>

<div class="mx-auto max-w-7xl bg-[#f8f4ed] p-4 sm:p-6">
	<!-- Loading / Error States -->
	{#if isSchemaLoading}
		<div class="py-4 text-center text-gray-500">Loading schema definitions...</div>
	{:else if schemaError}
		<div class="mb-4 rounded border border-red-400 bg-red-100 p-3 text-red-700">
			Schema Error: {schemaError}
		</div>
	{:else if isLoadingQueryData}
		<div class="py-4 text-center text-gray-500">Loading todos...</div>
	{:else if queryError}
		<div class="mb-4 rounded border border-orange-400 bg-orange-100 p-3 text-orange-700">
			Query Error: {queryError}
		</div>
	{/if}

	<!-- Tags Filter -->
	{#if uniqueTags.length > 0}
		<div class="mb-6 rounded-xl border border-[#d6c7b1] bg-[#f5f1e8] p-4">
			<h3 class="mb-2 text-sm font-medium text-gray-600">Filter by tag:</h3>
			<div class="flex flex-wrap gap-2">
				<button
					on:click={() => filterByTag(null)}
					class={`rounded-lg px-3 py-1 text-sm transition-colors ${
						$filterState.tag === null
							? 'bg-[#0a2a4e] text-[#f8f4ed]'
							: 'bg-[#e0d8cb] text-[#0a2a4e] hover:bg-[#c5d4e8]'
					}`}
				>
					All
				</button>
				{#each uniqueTags as tag}
					<button
						on:click={() => filterByTag(tag)}
						class={`rounded-lg px-3 py-1 text-sm transition-colors ${
							$filterState.tag === tag
								? 'bg-[#0a2a4e] text-[#f8f4ed]'
								: 'bg-[#e0d8cb] text-[#0a2a4e] hover:bg-[#c5d4e8]'
						}`}
					>
						{tag}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Todo List -->
	<div class="space-y-3">
		{#if filteredTodos.length === 0 && !isLoadingQueryData && !queryError && !isSchemaLoading}
			<div
				class="flex items-center justify-center rounded-xl border border-[#d6c7b1] bg-[#f5f1e8] p-12 text-gray-500"
			>
				{#if $filterState.tag}
					No todos match the selected filter.
				{:else}
					No todos found. Use the "Create Todo" tool to add some!
				{/if}
			</div>
		{:else}
			{#each filteredTodos as todo (todo.taskId)}
				{@const isCompleted = todo.status === 'completed'}
				{@const workerNameStr =
					typeof todo.workerName === 'string' && todo.workerName !== todo.workerId
						? todo.workerName
						: '(Unassigned)'}
				<div
					class="flex items-center gap-4 rounded-lg border border-[#d6c7b1] bg-[#f5f1e8] p-3 transition-colors hover:bg-[#e0d8cb]"
				>
					<!-- Left: Status Pill -->
					{#if todo.status}
						<span
							class={`inline-block flex-shrink-0 self-center rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${getStatusBadgeClass((todo.status as string) ?? '')}`}
						>
							{((todo.status as string) ?? '').replace('-', ' ')}
						</span>
					{/if}

					<!-- Center: Task Name -->
					<div class="flex flex-grow flex-col items-start justify-center gap-1">
						<span
							class={isCompleted
								? 'text-base text-gray-500 line-through'
								: 'text-base text-[#0a2a4e]'}
						>
							{todo.taskName ?? '(No Name)'}
						</span>
					</div>

					<!-- Right: Tags & Assignee Badge -->
					<div class="ml-auto flex flex-shrink-0 items-center gap-3">
						<!-- Tags -->
						{#if Array.isArray(todo.tags) && todo.tags.length > 0}
							<div class="flex flex-wrap items-center justify-end gap-1.5">
								{#each todo.tags as tag}
									{#if tag}
										<span
											class="rounded-full bg-[#c5d4e8] px-3 py-0.5 text-xs whitespace-nowrap text-[#0a2a4e]"
										>
											{tag}
										</span>
									{/if}
								{/each}
							</div>
						{/if}

						<!-- Assignee Badge (Corrected - Single Span) -->
						<span
							class={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${isCompleted ? 'bg-gray-600 text-gray-100 opacity-70' : 'bg-[#0a2a4e] text-[#f8f4ed]'}`}
						>
							{workerNameStr}
						</span>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
