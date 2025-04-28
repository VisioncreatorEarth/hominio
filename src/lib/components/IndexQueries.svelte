<script lang="ts">
	import {
		processReactiveQuery,
		executeQuery, // Needed to fetch meta index initially
		type LoroHqlQuery,
		type QueryResult
	} from '$lib/KERNEL/hominio-query';
	import { readable, writable, type Readable } from 'svelte/store';
	import { getContext, onMount } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import { GENESIS_PUBKEY } from '$db/constants';
	import type { IndexLeafType } from '$lib/KERNEL/index-registry';
	import type { LeafValue } from '$db/seeding/leaf.data';

	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// --- State ---
	let indexRegistry = $state<Partial<Record<IndexLeafType, string>>>({}); // To store index name -> pubkey map
	let selectedIndexKey = $state<IndexLeafType | null>(null); // Which index is selected (e.g., 'leaves')
	let selectedIndexPubKey = $derived(selectedIndexKey ? indexRegistry[selectedIndexKey] : null);
	let isLoadingRegistry = $state(true);
	let registryError = $state<string | null>(null);

	// --- Query for selected Index Content ---
	const selectedIndexQueryStore = writable<LoroHqlQuery | null>(null);
	interface IndexContentResult extends QueryResult {
		id: string;
		data?: LeafValue | Record<string, unknown> | null;
	}
	const selectedIndexContent = processReactiveQuery(getMe, selectedIndexQueryStore) as Readable<
		IndexContentResult[] | null | undefined
	>;
	let currentSelectedIndexData = $derived(($selectedIndexContent ?? [])[0] ?? null);

	// --- Fetch Meta Index on Mount ---
	onMount(async () => {
		const metaIndexQuery: LoroHqlQuery = {
			from: {
				leaf: [GENESIS_PUBKEY]
			},
			map: {
				id: { field: 'doc.pubkey' },
				index_map: { field: 'self.data.value' } // Get the value map directly
			}
		};

		try {
			const currentUser = getMe();
			const result = await executeQuery(metaIndexQuery, currentUser);
			if (
				result &&
				result.length > 0 &&
				result[0].index_map &&
				typeof result[0].index_map === 'object'
			) {
				indexRegistry = result[0].index_map as Partial<Record<IndexLeafType, string>>;
				console.log('[IndexQueries] Loaded Index Registry:', indexRegistry);
				registryError = null;
			} else {
				throw new Error('Meta Index query returned invalid data.');
			}
		} catch (err) {
			console.error('[IndexQueries] Error fetching Meta Index:', err);
			console.error(
				'[IndexQueries] Error details:',
				JSON.stringify(err, Object.getOwnPropertyNames(err))
			);
			registryError = err instanceof Error ? err.message : 'Unknown error loading index registry.';
		} finally {
			isLoadingRegistry = false;
		}
	});

	// --- Functions ---
	function selectIndex(key: IndexLeafType) {
		selectedIndexKey = key;
		const pubKey = indexRegistry[key];
		if (pubKey) {
			const query: LoroHqlQuery = {
				from: {
					leaf: [pubKey]
				},
				map: {
					id: { field: 'doc.pubkey' },
					data: { field: 'self.data' } // Fetch the whole data object
				}
			};
			selectedIndexQueryStore.set(query);
		} else {
			selectedIndexQueryStore.set(null);
		}
	}

	function truncate(str: string | null | undefined, length = 16) {
		if (!str) return '';
		return str.length > length ? str.substring(0, length) + '...' : str;
	}

	// Helper to get Object entries for iterating maps in template
	function getEntries(obj: object | null | undefined): [string, unknown][] {
		if (!obj || typeof obj !== 'object') return [];
		return Object.entries(obj);
	}
</script>

<div class="grid h-full grid-cols-1 md:grid-cols-[250px_1.75fr_1.25fr]">
	<!-- Sidebar -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-300 bg-white p-4">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Index Leafs</h2>
		{#if isLoadingRegistry}
			<p class="text-sm text-gray-500">Loading index registry...</p>
		{:else if registryError}
			<p class="text-sm text-red-600">Error: {registryError}</p>
		{:else}
			<ul class="max-h-[calc(100vh-10rem)] space-y-1 overflow-y-auto">
				{#each getEntries(indexRegistry) as [key, pubkey] (key)}
					{@const indexTypeKey = key as IndexLeafType}
					<li>
						<button
							class:bg-gray-100={selectedIndexKey === indexTypeKey}
							class="w-full rounded px-3 py-1 text-left text-sm text-gray-800 transition-colors duration-150 ease-in-out hover:bg-gray-200"
							on:click={() => selectIndex(indexTypeKey)}
							title={pubkey?.toString() ?? 'N/A'}
						>
							<span class="font-medium">{indexTypeKey}</span>
							<span class="block text-xs text-gray-500">{truncate(pubkey?.toString(), 24)}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area (Index Details) -->
	<main class="col-span-1 flex flex-col overflow-y-auto p-6">
		{#if selectedIndexKey}
			{@const currentData = currentSelectedIndexData?.data}
			<h1 class="mb-4 text-2xl font-bold text-gray-800">Index: {selectedIndexKey}</h1>
			<p class="mb-4 text-sm text-gray-500">Pubkey: {selectedIndexPubKey}</p>

			{#if currentSelectedIndexData === undefined}
				<p class="text-gray-500">Loading index content...</p>
			{:else if currentSelectedIndexData === null}
				<p class="text-red-600">Error loading index content.</p>
			{:else if !currentData || typeof currentData !== 'object' || !('value' in currentData) || typeof currentData.value !== 'object' || currentData.value === null}
				<p class="text-yellow-700">Index data.value is empty or invalid.</p>
			{:else}
				{@const indexValueMap = currentData.value}
				<div class="overflow-auto rounded border border-gray-200 bg-gray-50 p-4">
					{#if selectedIndexKey === 'leaves' || selectedIndexKey === 'schemas' || selectedIndexKey === 'composites'}
						<h3 class="mb-2 text-lg font-semibold text-gray-700">Indexed PubKeys:</h3>
						<ul class="list-disc space-y-1 pl-5">
							{#each getEntries(indexValueMap) as [pubkey, _value] (pubkey)}
								<li><code class="text-sm text-gray-800">{pubkey}</code></li>
							{:else}
								<li class="text-gray-500 italic">No keys found.</li>
							{/each}
						</ul>
					{:else if selectedIndexKey === 'composites_by_component'}
						<h3 class="mb-2 text-lg font-semibold text-gray-700">
							Component Index (Component Key -> Composites List):
						</h3>
						<div class="space-y-3">
							{#each getEntries(indexValueMap) as [componentKey, compositeList] (componentKey)}
								<div>
									<code class="block font-medium text-blue-700">{componentKey}</code>
									<ul class="list-disc space-y-1 pt-1 pl-6">
										{#if Array.isArray(compositeList)}
											{#each compositeList as compositePubKey (compositePubKey)}
												<li><code class="text-sm text-gray-800">{compositePubKey}</code></li>
											{:else}
												<li class="text-gray-500 italic">Empty list.</li>
											{/each}
										{:else}
											<li class="text-red-600 italic">Invalid list data (expected Array).</li>
										{/if}
									</ul>
								</div>
							{:else}
								<p class="text-gray-500 italic">No component keys found.</p>
							{/each}
						</div>
					{:else}
						<p class="text-orange-600 italic">
							Display for index type '{selectedIndexKey}' not implemented.
						</p>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">Select an Index Leaf from the list to view its content.</p>
			</div>
		{/if}
	</main>

	<!-- Right Column (Raw JSON View) -->
	<aside class="col-span-1 flex flex-col overflow-y-auto bg-gray-50 p-6">
		<h2 class="mb-4 flex-shrink-0 text-xl font-semibold text-gray-700">JSON</h2>
		{#if currentSelectedIndexData}
			<div class="flex-1 overflow-auto rounded border border-gray-300 bg-white p-3">
				<pre class="font-mono text-xs text-gray-700">{JSON.stringify(
						currentSelectedIndexData,
						null,
						2
					)}</pre>
			</div>
		{:else if selectedIndexKey}
			<div class="flex h-full items-center justify-center">
				<p class="text-center text-sm text-gray-500">Loading or no data...</p>
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-center text-sm text-gray-500">Select an index to view its JSON data.</p>
			</div>
		{/if}
	</aside>
</div>
