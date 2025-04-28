<script lang="ts">
	import {
		processReactiveQuery,
		// executeQuery, // No longer needed for composites
		type LoroHqlQuery,
		type QueryResult
	} from '$lib/KERNEL/hominio-query';
	import { readable, type Readable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import type { LeafValue } from '$db/seeding/leaf.data';
	// Removed unused imports

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// --- Type Definitions ---
	interface LeafQueryResult extends QueryResult {
		id: string; // doc.pubkey
		data?: LeafValue | Record<string, unknown> | null; // self.data
	}

	// --- Leaf Query ---
	const allLeafQuery: LoroHqlQuery = {
		from: {
			leaf: [] // Fetch all leaves (Changed from leaf_pubkeys)
		},
		map: {
			id: { field: 'doc.pubkey' },
			data: { field: 'self.data' }
		}
	};

	const leafQueryStore = readable<LoroHqlQuery>(allLeafQuery);
	const leafReadable = processReactiveQuery(getMe, leafQueryStore) as Readable<
		LeafQueryResult[] | null | undefined
	>;

	// --- State ---
	let selectedLeafId = $state<string | null>(null);
	let currentSelectedLeaf = $derived(
		($leafReadable ?? []).find((leaf) => leaf.id === selectedLeafId) ?? null
	);

	// --- Functions ---
	function selectLeaf(id: string) {
		console.log('Selecting leaf with id:', id);
		selectedLeafId = id;
	}

	function truncate(str: string | null | undefined, length = 16) {
		if (!str) return '';
		return str.length > length ? str.substring(0, length) + '...' : str;
	}

	function displayLeafData(data: LeafValue | Record<string, unknown> | null | undefined): string {
		if (data === null || data === undefined) return '(No data)';
		if (typeof data !== 'object') return String(data);

		if ('type' in data) {
			const leafVal = data as LeafValue;
			if (leafVal.type === 'LoroText') return leafVal.value;
			if (leafVal.type === 'Concept') return '(Concept)';
			if (leafVal.type === 'LoroMap') return `(Map: ${Object.keys(leafVal.value).length} keys)`;
			if (leafVal.type === 'LoroList') return `(List: ${leafVal.value.length} items)`;
			return `(${leafVal.type})`;
		}
		return JSON.stringify(data);
	}

	// REMOVED: Composite query definition, state, and effect
</script>

<!-- FIX: Update grid layout -->
<div class="grid h-full grid-cols-1 md:grid-cols-[250px_1.75fr_1.25fr]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-300 bg-white p-4">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Leafs</h2>
		{#if $leafReadable === undefined}
			<p class="text-sm text-gray-500">Loading leafs...</p>
		{:else if $leafReadable === null}
			<p class="text-sm text-red-600">Error loading leafs.</p>
		{:else if ($leafReadable ?? []).length === 0}
			<p class="text-sm text-yellow-700">No leafs found.</p>
		{:else}
			<ul class="max-h-[calc(100vh-10rem)] space-y-1 overflow-y-auto">
				<!-- Adjust max height if needed -->
				{#each $leafReadable as leaf (leaf.id)}
					<li>
						<button
							class:bg-gray-100={selectedLeafId === leaf.id}
							class="w-full rounded px-3 py-1 text-left text-sm text-gray-800 transition-colors duration-150 ease-in-out hover:bg-gray-200"
							on:click={() => selectLeaf(leaf.id)}
							title={leaf.id}
						>
							<!-- FIX: Display only truncated pubkey -->
							{truncate(leaf.id, 24)}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area (Details) -->
	<main class="col-span-1 flex flex-col overflow-y-auto p-6">
		{#if currentSelectedLeaf}
			{@const selectedLeaf = currentSelectedLeaf}

			<div class="flex-shrink-0 pb-6">
				<!-- Leaf Header Info -->
				<div class="flex items-center justify-between">
					<!-- FIX: Title is now the ID -->
					<h1 class="text-2xl font-bold break-all text-gray-800">
						{selectedLeaf.id}
					</h1>
				</div>
				<!-- <p class="mb-3 text-sm text-gray-500">
					<code class="rounded bg-gray-200 px-1 text-xs">{selectedLeaf.id}</code>
				</p> -->

				<!-- FIX: Display Leaf data type and rendered value below ID -->
				<div class="mt-2 mb-4 flex flex-col">
					{#if typeof selectedLeaf.data === 'object' && selectedLeaf.data?.type}
						<span
							class="mr-2 mb-1 inline-block w-fit rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800"
						>
							type: {selectedLeaf.data.type}
						</span>
					{/if}
					<span class="text-lg text-gray-700">
						{displayLeafData(selectedLeaf.data)}
					</span>
				</div>

				<!-- REMOVED: Leaf Data Display (now shown above) -->
				<!-- REMOVED: Composites Section -->
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">Select a leaf from the list to view details.</p>
			</div>
		{/if}
	</main>

	<!-- Right Column (Raw JSON View) -->
	<aside class="col-span-1 flex flex-col overflow-y-auto bg-gray-50 p-6">
		<h2 class="mb-4 flex-shrink-0 text-xl font-semibold text-gray-700">JSON</h2>
		{#if currentSelectedLeaf}
			<div class="flex-1 overflow-auto rounded border border-gray-300 bg-white p-3">
				<pre class="font-mono text-xs text-gray-700">{JSON.stringify(
						currentSelectedLeaf,
						null,
						2
					)}</pre>
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-center text-sm text-gray-500">Select a leaf to view its JSON data.</p>
			</div>
		{/if}
	</aside>
</div>
