<script lang="ts">
	// Remove direct hominio-query imports
	// import { processReactiveQuery, type LoroHqlQueryExtended } from '$lib/KERNEL/hominio-query';
	// import { executeQuery } from '$lib/KERNEL/hominio-query';
	import { writable } from 'svelte/store';
	import { getContext, onMount } from 'svelte';
	// Remove direct hominio-auth import
	// import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import { GENESIS_PUBKEY } from '$db/constants';
	// Update import for IndexLeafType
	// import type { IndexLeafType } from '$lib/KERNEL/index-registry';
	import type { IndexLeafType } from '$lib/KERNEL/hominio-types';

	// Import types from facade/central types
	// import type { LoroHqlQueryExtended, QueryResult } from '$lib/KERNEL/hominio-svelte';
	import type { LoroHqlQueryExtended, QueryResult } from '$lib/KERNEL/hominio-types';

	// --- Get Hominio Facade from Context ---
	const o = getContext<typeof import('$lib/KERNEL/hominio-svelte').o>('o');
	// --- End Get Hominio Facade from Context ---

	// REMOVE: Get Effective User Function from Context
	// type GetCurrentUserFn = typeof getMeType;
	// const getMe = getContext<GetCurrentUserFn>('getMe');

	// Current query and editor state
	let queryText = writable('// Loading default query...');
	let queryError = writable<string | null>(null);

	// --- State for fetching index registry --- (Similar to IndexQueries)
	let indexRegistry = $state<Partial<Record<IndexLeafType, string>>>({});
	let isLoadingRegistry = $state(true);
	let registryError = $state<string | null>(null);

	// Current query store - Use new type
	const queryStore = writable<LoroHqlQueryExtended | null>(null);

	// Results store - Use o.subscribe
	const resultsStore = o.subscribe(queryStore);

	// Type for the actual map inside the schemas index
	// type SchemaRegistryMap = Record<string, string>; // MOVED or imported if needed

	// --- Fetch Meta Index and Set Default Query on Mount ---
	onMount(async () => {
		const metaIndexQuery: LoroHqlQueryExtended = {
			steps: [
				{
					action: 'get',
					from: {
						pubkey: [GENESIS_PUBKEY],
						targetDocType: 'Leaf'
					},
					fields: {
						id: { field: 'doc.pubkey' },
						index_map: { field: 'self.data.value' }
					},
					resultVariable: 'metaIndex'
				}
			]
		};

		try {
			// REMOVE: const currentUser = getMe();
			// Use o.query
			const metaResult = await o.query(metaIndexQuery);
			if (
				metaResult &&
				metaResult.length > 0 &&
				metaResult[0].variables &&
				(metaResult[0].variables as any).index_map &&
				typeof (metaResult[0].variables as any).index_map === 'object'
			) {
				indexRegistry = (metaResult[0].variables as any).index_map as Partial<
					Record<IndexLeafType, string>
				>;
				registryError = null;

				// STEP 2: Get the pubkey for the 'schemas' index doc itself
				const schemasIndexPubKey = indexRegistry['schemas'];
				if (!schemasIndexPubKey) {
					throw new Error("Could not find pubkey for 'schemas' index in meta-index.");
				}

				// STEP 3: Fetch the actual schemas index document
				const schemasIndexQuery: LoroHqlQueryExtended = {
					steps: [
						{
							action: 'get',
							from: {
								pubkey: [schemasIndexPubKey],
								targetDocType: 'Leaf'
							},
							fields: {
								schema_map: { field: 'self.data.value' } // Get the map
							},
							resultVariable: 'schemasIndexData'
						}
					]
				};

				// Use o.query
				const schemasResult = await o.query(schemasIndexQuery);

				// STEP 4: Extract the schema map
				if (
					schemasResult &&
					schemasResult.length > 0 &&
					schemasResult[0].variables &&
					(schemasResult[0].variables as any).schema_map &&
					typeof (schemasResult[0].variables as any).schema_map === 'object'
				) {
					const schemaRegistryMap = (schemasResult[0].variables as any)
						.schema_map as SchemaRegistryMap;

					// STEP 5: Get specific schema pubkeys from the map
					const tciniPubKey = schemaRegistryMap['tcini'] ?? 'TCINI_PUBKEY_NOT_FOUND';
					const gunkaPubKey = schemaRegistryMap['gunka'] ?? 'GUNKA_PUBKEY_NOT_FOUND'; // Get gunka key
					const ckajiPubKey = schemaRegistryMap['ckaji'] ?? 'CKAJI_PUBKEY_NOT_FOUND'; // <-- Get ckaji key

					// STEP 6: Construct the default query (more complex version)
					// Query Explanation:
					// 1. Find tcini composites (task -> status)
					// 2. Find gunka composites (worker -> task)
					// 3. Select Task & Status leaf ID
					// 4. Select Worker & Assigned Task ID
					// 5. Join Task/Status with Worker based on Task ID
					// 6. Resolve Task Concept, Worker Concept, and Status Leaf Value
					const defaultQuery = {
						steps: [
							{
								// Step 1: Find Task Status Links (tcini: task -> status)
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
								// Step 2: Find Task Assignment Links (gunka: worker -> task)
								action: 'find',
								target: { schema: gunkaPubKey },
								variables: {
									workerVar: { source: 'link.x1' },
									assignedTaskVar: { source: 'link.x2' } // Task is x2 in gunka
								},
								resultVariable: 'taskAssignmentLinks',
								return: 'array'
							},
							{
								// Step 3: Find Task Tag Links (ckaji: task -> tag)
								action: 'find',
								target: { schema: ckajiPubKey },
								variables: {
									taskForTagVar: { source: 'link.x1' },
									tagLeafVar: { source: 'link.x2' }
								},
								resultVariable: 'taskTagLinks',
								return: 'array'
							},
							{
								// Step 4: Join task status and assignments
								action: 'join',
								left: { variable: 'taskStatusLinks', key: 'taskVar' },
								right: { variable: 'taskAssignmentLinks', key: 'assignedTaskVar' },
								type: 'left', // Keep tasks even if unassigned
								select: {
									taskId: { source: 'left.taskVar' },
									statusLeafId: { source: 'left.statusLeafVar' },
									workerId: { source: 'right.workerVar' } // May be null
								},
								resultVariable: 'baseTaskInfo'
							},
							{
								// Step 5: Join Tags onto Base Info
								action: 'join',
								left: { variable: 'baseTaskInfo', key: 'taskId' },
								right: { variable: 'taskTagLinks', key: 'taskForTagVar' },
								type: 'left', // Keep tasks even without tags
								select: {
									taskId: { source: 'left.taskId' },
									statusLeafId: { source: 'left.statusLeafId' },
									workerId: { source: 'left.workerId' },
									tagLeafId: { source: 'right.tagLeafVar' } // May be null
								},
								resultVariable: 'taskWithTagsInfo' // Holds IDs for final resolve
							},
							{
								// Step 6: Resolve Names and Status (and Tag)
								action: 'resolve',
								fromVariable: 'taskWithTagsInfo', // Use the tag-joined results
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
										fallbackVar: 'tagLeafId' // Use ID as fallback
									}
								},
								resultVariable: 'resolvedTodosWithTags' // Final results variable name
							},
							// --- NEW Step 7: Aggregate tags into an array ---
							{
								action: 'aggregate',
								fromVariable: 'resolvedTodosWithTags', // Input is the flat list
								groupByKey: 'taskId', // Group by task ID
								aggregateFields: {
									// Take the first value for fields that are constant within the group
									taskName: { sourceField: 'taskName', operation: 'first' },
									workerName: { sourceField: 'workerName', operation: 'first' },
									status: { sourceField: 'status', operation: 'first' },
									statusLeafId: { sourceField: 'statusLeafId', operation: 'first' }, // Keep IDs if needed
									workerId: { sourceField: 'workerId', operation: 'first' },
									// Collect tag values into an array called 'tags'
									tags: { sourceField: 'tag', operation: 'collect' }
								},
								resultVariable: 'aggregatedTodos' // Final aggregated result
							}
							// --- END NEW Step 7 ---
						]
					};
					// Set the queryText store with the formatted JSON string
					queryText.set(JSON.stringify(defaultQuery, null, 2));
				} else {
					throw new Error(
						"'schemas' index document query returned invalid data or missing schema_map."
					);
				}
			} else {
				throw new Error('Meta Index query returned invalid data.');
			}
		} catch (err) {
			console.error('[QueryEditor] Error initializing default query:', err);
			registryError = err instanceof Error ? err.message : 'Unknown error loading schema registry.';
			// Set a fallback query text on error
			queryText.set(
				'{\n  "error": "Could not load default query - failed to fetch schema pubkeys.",\n  "details": "' +
					(registryError ?? '').replace(/"/g, '\"') + // Escape quotes for JSON
					'"\n}'
			);
		} finally {
			isLoadingRegistry = false;
		}
	});

	// Function to run the query from the editor
	function runCustomQuery() {
		try {
			const query: LoroHqlQueryExtended = JSON.parse($queryText); // Use new type
			// Basic validation for steps format
			if (!query || !Array.isArray(query.steps)) {
				throw new Error("Invalid query format: Must be an object with a 'steps' array.");
			}
			queryError.set(null);
			queryStore.set(query);
		} catch (e) {
			queryError.set(e instanceof Error ? e.message : String(e));
			queryStore.set(null); // Clear query on parse error
		}
	}

	// Helper function to truncate long strings
	function truncate(str: unknown, length = 16): string {
		if (!str) return '';
		if (typeof str !== 'string') return String(str).substring(0, length) + '...';
		return str.length > length ? str.substring(0, length) + '...' : str;
	}
</script>

<div class="h-full bg-[#f8f4ed] p-4">
	<h2 class="mb-4 text-xl font-semibold text-[#0a2a4e]">Query Editor</h2>

	<div class="grid h-[calc(100%-52px)] grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<h3 class="mb-2 text-lg font-medium text-[#0a2a4e]">Edit Query</h3>
			<div class="relative flex flex-col">
				<textarea
					bind:value={$queryText}
					class="h-[60vh] w-full resize-none rounded-t border border-gray-300 bg-white p-3 font-mono text-sm text-[#0a2a4e]"
					placeholder="Enter your LoroHQL query here..."
					disabled={isLoadingRegistry}
				></textarea>
				{#if $queryError}
					<div class="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
						{$queryError}
					</div>
				{:else if registryError}
					<div class="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-700">
						Registry Error: {registryError}
					</div>
				{/if}
				<button
					class="flex-shrink-0 rounded-b bg-[#0a2a4e] px-4 py-2 text-[#f8f4ed] hover:bg-[#1e3a5e] disabled:cursor-not-allowed disabled:opacity-50"
					on:click={runCustomQuery}
					disabled={isLoadingRegistry}
				>
					{isLoadingRegistry ? 'Loading...' : 'Run Query'}
				</button>
			</div>
		</div>

		<div>
			<h3 class="mb-2 text-lg font-medium text-[#0a2a4e]">Results</h3>
			<!-- Remove h-full, flex-grow; Add fixed height to inner scrollable div -->
			<div class="overflow-hidden rounded border border-gray-300 bg-white text-[#0a2a4e]">
				{#if $resultsStore === undefined}
					<div class="flex h-full items-center justify-center text-gray-500">
						<p>Loading results...</p>
					</div>
				{:else if $resultsStore === null}
					<div class="flex h-full items-center justify-center text-red-600">
						<p>Error executing query</p>
					</div>
				{:else if $resultsStore.length === 0}
					<div class="flex h-full items-center justify-center text-gray-500">
						<p>No results found</p>
					</div>
				{:else}
					<!-- Set fixed height and overflow-auto here -->
					<div class="h-[calc(60vh+58px)] space-y-4 overflow-auto p-3">
						{#each $resultsStore as result (result.id ?? JSON.stringify(result))}
							<div class="rounded border border-gray-200 bg-gray-50 p-3">
								<pre
									class="max-h-48 overflow-auto rounded p-2 text-xs text-[#0a2a4e]">{JSON.stringify(
										result,
										null,
										2
									)}</pre>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
