<script lang="ts">
	import {
		processReactiveQuery,
		type LoroHqlQueryExtended,
		type QueryResult
	} from '$lib/KERNEL/hominio-query';
	import { get, type Readable, writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import type { LeafValue } from '$db/seeding/leaf.data';

	// --- Type Definitions ---
	interface AllLeavesResult extends QueryResult {
		id: string;
		data: LeafValue | Record<string, unknown> | null;
	}

	// <<< NEW: Type for related composite results (Updated for resolved values and type info) >>>
	interface RelatedCompositeResult extends QueryResult {
		compositePubKey: string;
		schemaName?: string | null;
		// Original pubkeys
		x1?: string | null;
		x2?: string | null;
		x3?: string | null;
		x4?: string | null;
		x5?: string | null;
		// Resolved display values
		x1Display?: unknown | null;
		x2Display?: unknown | null;
		x3Display?: unknown | null;
		x4Display?: unknown | null;
		x5Display?: unknown | null;
		// <<< NEW: Type information for resolved values >>>
		x1ResolvedFromType?: string | null;
		x2ResolvedFromType?: string | null;
		x3ResolvedFromType?: string | null;
		x4ResolvedFromType?: string | null;
		x5ResolvedFromType?: string | null;
	}

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// --- State ---
	let selectedLeafId = $state<string | null>(null);
	let currentSelectedLeaf = $state<AllLeavesResult | null>(null);
	const allLeavesQueryStore = writable<LoroHqlQueryExtended | null>(null);
	const relatedCompositesQueryStore = writable<LoroHqlQueryExtended | null>(null); // <<< NEW Store

	// --- Reactive Queries ---
	const allLeavesReadable = processReactiveQuery(getMe, allLeavesQueryStore) as Readable<
		AllLeavesResult[] | null | undefined
	>;

	// <<< NEW Readable (Updated type) >>>
	const relatedCompositesReadable = processReactiveQuery(
		getMe,
		relatedCompositesQueryStore
	) as Readable<RelatedCompositeResult[] | null | undefined>; // Type already updated by interface change

	// --- Effects to Set Queries ---
	$effect.pre(() => {
		const query: LoroHqlQueryExtended = {
			steps: [
				{
					action: 'iterateIndex',
					indexName: 'leaves',
					variables: { key: 'leafPubKey', value: '_leafValueExists' },
					resultVariable: 'leafIndexItems'
				},
				{
					action: 'get',
					from: { variable: 'leafIndexItems', sourceKey: 'leafPubKey', targetDocType: 'Leaf' },
					fields: {
						id: { field: 'doc.pubkey' },
						data: { field: 'self.data' }
					},
					resultVariable: 'leafDetails'
				},
				{
					action: 'select',
					groupBy: 'id',
					select: {
						id: { variable: 'id' },
						data: { variable: 'data' }
					}
				}
			]
		};
		allLeavesQueryStore.set(query);
	});

	// <<< NEW: Function to create the related composites query >>>
	function createQueryForRelatedComposites(leafPubKey: string | null): LoroHqlQueryExtended | null {
		if (!leafPubKey) return null;

		const query: LoroHqlQueryExtended = {
			steps: [
				{
					action: 'find',
					target: {
						schema: '*', // Search across all schemas
						place: '*', // Search in any place (x1-x5)
						value: leafPubKey // The leaf ID we are looking for
					},
					variables: {
						composite_key: { source: 'link.pubkey' }, // Extract the composite pubkey
						schema_id: { source: 'link.schemaId' }, // Extract schemaId
						x1: { source: 'link.x1' },
						x2: { source: 'link.x2' },
						x3: { source: 'link.x3' },
						x4: { source: 'link.x4' },
						x5: { source: 'link.x5' }
					},
					return: 'array',
					resultVariable: 'foundComposites'
				},
				{
					action: 'get',
					from: {
						variable: 'foundComposites',
						sourceKey: 'schema_id', // Use the extracted schema_id
						targetDocType: 'Schema' // Specify we are fetching Schemas
					},
					fields: {
						name: { field: 'self.data.name' } // Fetch the name
					},
					// We need to keep track of which schema ID this name belongs to for joining later
					// The 'get' step implicitly returns results linked by the sourceKey's original item (_sourceKey)
					// Let's also explicitly extract the schema id again perhaps? Or rely on context.
					variables: {
						retrieved_schema_id: { source: 'result._sourceKey' } // Get the schema_id this result corresponds to
					},
					resultVariable: 'schemaInfo' // Store schema details
				},
				{
					action: 'select',
					groupBy: 'composite_key', // Group by pubkey to get distinct composites
					select: {
						// Output the composite pubkey
						compositePubKey: { variable: 'composite_key' },
						// <<< Output the schema name fetched in the 'get' step >>>
						schemaName: { variable: 'correlated_schema_name' },
						// Output the original pubkeys for the resolve step
						x1: { variable: 'x1' },
						x2: { variable: 'x2' },
						x3: { variable: 'x3' },
						x4: { variable: 'x4' },
						x5: { variable: 'x5' }
					},
					// <<< ADD resultVariable to make output explicit for next step >>>
					resultVariable: 'selectedComposites'
				},
				// <<< NEW: Resolve step to get leaf values conditionally >>>
				{
					action: 'resolve',
					fromVariable: 'selectedComposites',
					resolveFields: {
						x1Display: {
							type: 'resolveLeafValue',
							pubkeyVar: 'x1',
							fallbackVar: 'x1',
							excludeType: 'Concept'
						},
						x2Display: {
							type: 'resolveLeafValue',
							pubkeyVar: 'x2',
							fallbackVar: 'x2',
							excludeType: 'Concept'
						},
						x3Display: {
							type: 'resolveLeafValue',
							pubkeyVar: 'x3',
							fallbackVar: 'x3',
							excludeType: 'Concept'
						},
						x4Display: {
							type: 'resolveLeafValue',
							pubkeyVar: 'x4',
							fallbackVar: 'x4',
							excludeType: 'Concept'
						},
						x5Display: {
							type: 'resolveLeafValue',
							pubkeyVar: 'x5',
							fallbackVar: 'x5',
							excludeType: 'Concept'
						}
					},
					resultVariable: 'resolvedComposites' // Final results
				}
			]
		};
		console.log('[LeafQueries] Generated Related Composites Query:', JSON.stringify(query));
		return query;
	}

	// <<< NEW: Effect to update related composites query when selection changes >>>
	$effect(() => {
		console.log('Selected Leaf ID changed, updating related composites query:', selectedLeafId);
		relatedCompositesQueryStore.set(createQueryForRelatedComposites(selectedLeafId));
	});

	// --- Functions ---
	function selectLeaf(id: string) {
		console.log('Selecting leaf with id:', id);
		selectedLeafId = id;
		const leaves = get(allLeavesReadable);
		if (leaves) {
			currentSelectedLeaf = leaves.find((leaf) => leaf.id === id) ?? null;
		} else {
			currentSelectedLeaf = null;
		}
	}

	function truncate(str: unknown | null | undefined, length = 16): string {
		// Handle null/undefined explicitly
		if (str === null || str === undefined) {
			return '-'; // Or return '' depending on desired display
		}

		// Handle potential non-string values from resolved leaf data
		if (typeof str !== 'string') {
			const jsonStr = JSON.stringify(str);
			// JSON.stringify can return 'undefined', handle that edge case
			return jsonStr === undefined ? '[Object]' : jsonStr;
		}
		// Original truncation for strings
		return str.length > length ? str.substring(0, length) + '...' : str;
	}
</script>

<div class="grid h-full grid-cols-[250px_1fr_1fr]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 h-full overflow-y-auto border-r bg-white p-4">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Available Leaves</h2>
		{#if $allLeavesReadable === undefined}
			<p class="text-muted-foreground">Loading leaves...</p>
		{:else if $allLeavesReadable === null}
			<p class="text-destructive">Error loading leaves.</p>
		{:else if $allLeavesReadable.length === 0}
			<p class="text-muted-foreground">No leaves found in index 'leaves'. Add some docs!</p>
		{:else}
			<ul class="space-y-1">
				{#each $allLeavesReadable as leaf (leaf.id)}
					<li>
						<button
							class="w-full rounded px-3 py-2 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-gray-200 {selectedLeafId ===
							leaf.id
								? 'bg-indigo-100 font-medium text-indigo-700'
								: 'text-gray-600'}"
							on:click={() => selectLeaf(leaf.id)}
						>
							{truncate(leaf.id, 20)}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area (Middle Column) -->
	<main class="col-span-1 h-full overflow-y-auto border-r border-l bg-white p-6 text-gray-900">
		{#if currentSelectedLeaf}
			<h2 class="mb-1 text-xl font-semibold">Selected Leaf Data</h2>
			<p class="mb-4 text-xs text-gray-500">
				ID: <code class="rounded bg-gray-200 px-1">{currentSelectedLeaf.id}</code>
			</p>
			<div class="space-y-2 rounded border border-gray-200 bg-gray-50 p-4 font-mono text-xs">
				{#if typeof currentSelectedLeaf.data === 'object' && currentSelectedLeaf.data !== null}
					{#each Object.entries(currentSelectedLeaf.data) as [key, value]}
						{@const _debug = console.log(
							'[LeafQueries Middle Panel] Key:',
							key,
							'Value:',
							value,
							'Type:',
							typeof value
						)}
						<div>
							<!-- Simplified for debugging -->
							<span>{key}: </span>
							<span>{value}</span>
						</div>
					{/each}
				{:else}
					<!-- Fallback for non-object data -->
					<pre class="whitespace-pre-wrap">{JSON.stringify(currentSelectedLeaf.data, null, 2)}</pre>
				{/if}
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-gray-500">Select a leaf from the list to view its data.</p>
			</div>
		{/if}
	</main>

	<!-- Related Composites (Right Column) -->
	<aside class="col-span-1 h-full overflow-y-auto bg-gray-50 p-6">
		<h2 class="mb-4 text-xl font-semibold text-gray-700">Related Composites</h2>
		{#if !selectedLeafId}
			<div class="flex h-full items-center justify-center">
				<p class="text-center text-sm text-gray-500">Select a leaf to see related composites.</p>
			</div>
		{:else if $relatedCompositesReadable === undefined}
			<p class="text-center text-sm text-gray-500">Loading related composites...</p>
		{:else if $relatedCompositesReadable === null}
			<p class="text-center text-sm text-red-600">Error loading related composites.</p>
		{:else if $relatedCompositesReadable.length === 0}
			<p class="text-center text-sm text-gray-500">No related composites found for this leaf.</p>
		{:else}
			<ul class="space-y-1 font-mono text-xs">
				{#each $relatedCompositesReadable as comp (comp.compositePubKey)}
					<li class="rounded border bg-white p-2">
						<!-- Display Schema Name and Pubkey -->
						<span class="block font-medium text-purple-700"
							>{comp.schemaName ?? '(Unknown Schema)'}</span
						>
						<span class="block break-all text-gray-600">{comp.compositePubKey}</span>
						<!-- Display Place Values (x1-x5) with Concept marker and Self badge -->
						<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 border-t pt-1">
							{#if comp.x1Display !== null && comp.x1Display !== undefined}
								<span class="text-gray-500">
									{#if comp.x1 === selectedLeafId}<span class="self-badge">self</span>{/if}
									x1:
									<code class="text-gray-700"
										>{comp.x1Display}{#if comp.x1ResolvedFromType === 'Concept'}
											(C){/if}</code
									>
								</span>
							{/if}
							{#if comp.x2Display !== null && comp.x2Display !== undefined}
								<span class="text-gray-500">
									{#if comp.x2 === selectedLeafId}<span class="self-badge">self</span>{/if}
									x2:
									<code class="text-gray-700"
										>{comp.x2Display}{#if comp.x2ResolvedFromType === 'Concept'}
											(C){/if}</code
									>
								</span>
							{/if}
							{#if comp.x3Display !== null && comp.x3Display !== undefined}
								<span class="text-gray-500">
									{#if comp.x3 === selectedLeafId}<span class="self-badge">self</span>{/if}
									x3:
									<code class="text-gray-700"
										>{comp.x3Display}{#if comp.x3ResolvedFromType === 'Concept'}
											(C){/if}</code
									>
								</span>
							{/if}
							{#if comp.x4Display !== null && comp.x4Display !== undefined}
								<span class="text-gray-500">
									{#if comp.x4 === selectedLeafId}<span class="self-badge">self</span>{/if}
									x4:
									<code class="text-gray-700"
										>{comp.x4Display}{#if comp.x4ResolvedFromType === 'Concept'}
											(C){/if}</code
									>
								</span>
							{/if}
							{#if comp.x5Display !== null && comp.x5Display !== undefined}
								<span class="text-gray-500">
									{#if comp.x5 === selectedLeafId}<span class="self-badge">self</span>{/if}
									x5:
									<code class="text-gray-700"
										>{comp.x5Display}{#if comp.x5ResolvedFromType === 'Concept'}
											(C){/if}</code
									>
								</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>
</div>

<style>
	.self-badge {
		display: inline-block;
		margin-right: 4px;
		padding: 1px 4px;
		font-size: 0.65rem; /* Smaller font */
		font-weight: bold;
		line-height: 1;
		color: #1e40af; /* dark blue text */
		background-color: #dbeafe; /* light blue background */
		border-radius: 0.25rem;
		vertical-align: middle; /* Align with text */
	}
</style>
