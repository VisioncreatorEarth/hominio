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
	import type { SchemaPlaceTranslation } from '$db/seeding/schema.data';

	// --- Type Definitions ---
	interface AllLeavesResult extends QueryResult {
		id: string;
		data: LeafValue | Record<string, unknown> | null;
	}

	// <<< Define expected structure for placeTitles >>>
	type PlaceTitles =
		| {
				x1?: SchemaPlaceTranslation;
				x2?: SchemaPlaceTranslation;
				x3?: SchemaPlaceTranslation;
				x4?: SchemaPlaceTranslation;
				x5?: SchemaPlaceTranslation;
		  }
		| null
		| undefined;

	// <<< Updated: Type for related composite results >>>
	interface RelatedCompositeResult extends QueryResult {
		compositePubKey: string;
		schemaName?: string | null;
		placeTitles?: PlaceTitles; // <<< ADDED: Place titles object
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
		// Type information for resolved values
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
						name: { field: 'self.data.name' }, // Fetch the name
						placeTitles: { field: 'self.data.translations.en.places' }
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
						// <<< UPDATED: Request original variable names from correlated schemaInfo >>>
						schemaName: { variable: 'name' },
						placeTitles: { variable: 'placeTitles' },
						// Output the original pubkeys for the resolve step
						x1: { variable: 'x1' },
						x2: { variable: 'x2' },
						x3: { variable: 'x3' },
						x4: { variable: 'x4' },
						x5: { variable: 'x5' }
					},
					resultVariable: 'selectedComposites'
				},
				// NEW: Resolve step to get leaf values conditionally
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

<div class="grid h-full grid-cols-[250px_1fr_1fr] bg-[#f8f4ed]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 h-full overflow-y-auto border-r border-gray-200 p-4">
		<h2 class="mb-4 text-lg font-semibold text-[#0a2a4e]">Available Leaves</h2>
		{#if $allLeavesReadable === undefined}
			<p class="text-sm text-gray-500">Loading leaves...</p>
		{:else if $allLeavesReadable === null}
			<p class="text-sm text-red-600">Error loading leaves.</p>
		{:else if $allLeavesReadable.length === 0}
			<p class="text-sm text-gray-500">No leaves found in index 'leaves'. Add some docs!</p>
		{:else}
			<ul class="space-y-1">
				{#each $allLeavesReadable as leaf (leaf.id)}
					<li>
						<button
							class="w-full rounded px-3 py-2 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-[#e0d8cb] {selectedLeafId ===
							leaf.id
								? 'bg-[#0a2a4e] font-medium text-[#f8f4ed]'
								: 'text-[#0a2a4e]'}"
							on:click={() => selectLeaf(leaf.id)}
						>
							{leaf.id.substring(0, 20)}...
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area (Middle Column) -->
	<main class="col-span-1 h-full overflow-y-auto border-r border-l border-gray-200 p-6">
		{#if currentSelectedLeaf}
			<h2 class="mb-1 text-xl font-semibold text-[#0a2a4e]">Selected Leaf Data</h2>
			<p class="mb-4 text-xs text-gray-500">
				ID: <code class="rounded bg-[#e0d8cb] px-1 text-[#0a2a4e]">{currentSelectedLeaf.id}</code>
			</p>
			<div
				class="space-y-2 rounded border border-gray-200 bg-white p-4 font-mono text-xs text-[#0a2a4e]"
			>
				{#if typeof currentSelectedLeaf.data === 'object' && currentSelectedLeaf.data !== null}
					{#each Object.entries(currentSelectedLeaf.data) as [key, value]}
						<div>
							<span class="font-semibold">{key}: </span>
							<span class="text-gray-700">{JSON.stringify(value)}</span>
						</div>
					{/each}
				{:else}
					<pre class="whitespace-pre-wrap text-gray-700">{JSON.stringify(
							currentSelectedLeaf.data,
							null,
							2
						)}</pre>
				{/if}
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-gray-500">Select a leaf from the list to view its data.</p>
			</div>
		{/if}
	</main>

	<!-- Related Composites (Right Column) -->
	<aside class="col-span-1 h-full overflow-y-auto p-4">
		<h2 class="mb-4 text-lg font-semibold text-[#0a2a4e]">Related Composites</h2>
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
			<ul class="space-y-3 font-mono text-xs">
				{#each $relatedCompositesReadable as comp (comp.compositePubKey)}
					<li class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
						<!-- Composite Pubkey -->
						<div class="mb-3 border-b border-gray-200 pb-2">
							<span class="block text-[10px] break-all text-gray-500">{comp.compositePubKey}</span>
						</div>
						<!-- Place Definitions (Horizontal) -->
						<div class="flex flex-wrap items-start gap-x-4 gap-y-3">
							<!-- Place x1 -->
							{#if (comp.x1Display !== null && comp.x1Display !== undefined) || comp.x1 === selectedLeafId}
								{@const title = comp.placeTitles?.x1?.title}
								<div class="flex min-w-[80px] flex-col items-center">
									{#if comp.x1 === selectedLeafId}
										<span
											class="mb-1 inline-block rounded-full bg-yellow-400 px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-yellow-900"
											>Self</span
										>
									{:else}
										<span
											class="mb-1 inline-block rounded-full border border-[#d6c7b1] bg-[#f5f1e8] px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-[#0a2a4e]"
											>{comp.x1Display}{#if comp.x1ResolvedFromType === 'Concept'}
												(C){/if}</span
										>
									{/if}
									<span class="block text-[0.65rem] leading-none text-gray-600">
										x1{#if title}: {title}{/if}
									</span>
								</div>
							{/if}

							<!-- Schema Item (Moved Here) -->
							<div class="flex min-w-[80px] flex-col items-center">
								<span
									class="mb-1 inline-block rounded-full bg-[#0a2a4e] px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-[#f8f4ed]"
									>{comp.schemaName ?? '(Unknown)'}</span
								>
								<!-- Removed Schema Label -->
								<span class="block text-[0.65rem] leading-none text-gray-600">schema</span>
							</div>

							<!-- Place x2 -->
							{#if (comp.x2Display !== null && comp.x2Display !== undefined) || comp.x2 === selectedLeafId}
								{@const title = comp.placeTitles?.x2?.title}
								<div class="flex min-w-[80px] flex-col items-center">
									{#if comp.x2 === selectedLeafId}
										<span
											class="mb-1 inline-block rounded-full bg-yellow-400 px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-yellow-900"
											>Self</span
										>
									{:else}
										<span
											class="mb-1 inline-block rounded-full border border-[#d6c7b1] bg-[#f5f1e8] px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-[#0a2a4e]"
											>{comp.x2Display}{#if comp.x2ResolvedFromType === 'Concept'}
												(C){/if}</span
										>
									{/if}
									<span class="block text-[0.65rem] leading-none text-gray-600">
										x2{#if title}: {title}{/if}
									</span>
								</div>
							{/if}

							<!-- Place x3 -->
							{#if (comp.x3Display !== null && comp.x3Display !== undefined) || comp.x3 === selectedLeafId}
								{@const title = comp.placeTitles?.x3?.title}
								<div class="flex min-w-[80px] flex-col items-center">
									{#if comp.x3 === selectedLeafId}
										<span
											class="mb-1 inline-block rounded-full bg-yellow-400 px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-yellow-900"
											>Self</span
										>
									{:else}
										<span
											class="mb-1 inline-block rounded-full border border-[#d6c7b1] bg-[#f5f1e8] px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-[#0a2a4e]"
											>{comp.x3Display}{#if comp.x3ResolvedFromType === 'Concept'}
												(C){/if}</span
										>
									{/if}
									<span class="block text-[0.65rem] leading-none text-gray-600">
										x3{#if title}: {title}{/if}
									</span>
								</div>
							{/if}

							<!-- Place x4 -->
							{#if (comp.x4Display !== null && comp.x4Display !== undefined) || comp.x4 === selectedLeafId}
								{@const title = comp.placeTitles?.x4?.title}
								<div class="flex min-w-[80px] flex-col items-center">
									{#if comp.x4 === selectedLeafId}
										<span
											class="mb-1 inline-block rounded-full bg-yellow-400 px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-yellow-900"
											>Self</span
										>
									{:else}
										<span
											class="mb-1 inline-block rounded-full border border-[#d6c7b1] bg-[#f5f1e8] px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-[#0a2a4e]"
											>{comp.x4Display}{#if comp.x4ResolvedFromType === 'Concept'}
												(C){/if}</span
										>
									{/if}
									<span class="block text-[0.65rem] leading-none text-gray-600">
										x4{#if title}: {title}{/if}
									</span>
								</div>
							{/if}

							<!-- Place x5 -->
							{#if (comp.x5Display !== null && comp.x5Display !== undefined) || comp.x5 === selectedLeafId}
								{@const title = comp.placeTitles?.x5?.title}
								<div class="flex min-w-[80px] flex-col items-center">
									{#if comp.x5 === selectedLeafId}
										<span
											class="mb-1 inline-block rounded-full bg-yellow-400 px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-yellow-900"
											>Self</span
										>
									{:else}
										<span
											class="mb-1 inline-block rounded-full border border-[#d6c7b1] bg-[#f5f1e8] px-4 py-1 text-xs leading-tight font-semibold whitespace-nowrap text-[#0a2a4e]"
											>{comp.x5Display}{#if comp.x5ResolvedFromType === 'Concept'}
												(C){/if}</span
										>
									{/if}
									<span class="block text-[0.65rem] leading-none text-gray-600">
										x5{#if title}: {title}{/if}
									</span>
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>
</div>
