<script lang="ts">
	import { writable, type Readable } from 'svelte/store';
	import { getContext, onMount } from 'svelte';
	import { GENESIS_PUBKEY } from '$db/constants';
	import type {
		IndexLeafType,
		LeafValue,
		LoroHqlQueryExtended,
		QueryResult
	} from '$lib/KERNEL/hominio-types';

	const o = getContext<typeof import('$lib/KERNEL/hominio-svelte').o>('o');

	// --- State ---
	let indexRegistry = $state<Partial<Record<IndexLeafType, string>>>({}); // To store index name -> pubkey map
	let selectedIndexKey = $state<IndexLeafType | null>(null); // Which index is selected (e.g., 'leaves')
	let selectedIndexPubKey = $derived(selectedIndexKey ? indexRegistry[selectedIndexKey] : null);
	let isLoadingRegistry = $state(true);
	let registryError = $state<string | null>(null);

	// --- Query for selected Index Content ---
	const selectedIndexQueryStore = writable<LoroHqlQueryExtended | null>(null);
	interface IndexContentResult extends QueryResult {
		id: string;
		data?: LeafValue | Record<string, unknown> | null;
	}
	// Use o.subscribe
	const selectedIndexContent = o.subscribe(selectedIndexQueryStore) as Readable<
		IndexContentResult[] | null | undefined
	>;
	let currentSelectedIndexData = $derived(($selectedIndexContent ?? [])[0]);

	// --- Fetch Meta Index on Mount ---
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
			// Use o.query
			const result = await o.query(metaIndexQuery);
			if (
				result &&
				result.length > 0 &&
				result[0].variables &&
				(result[0].variables as any).index_map &&
				typeof (result[0].variables as any).index_map === 'object'
			) {
				indexRegistry = (result[0].variables as any).index_map as Partial<
					Record<IndexLeafType, string>
				>;
				console.log('[IndexQueries] Loaded Index Registry:', indexRegistry);
				registryError = null;
			} else {
				let reason = 'Unknown reason.';
				if (!result) reason = 'Query returned null/undefined.';
				else if (result.length === 0)
					reason = 'Query returned empty array (Genesis doc likely missing/not synced).';
				else if (!result[0].variables) reason = 'Result item missing variables field.';
				else if (!(result[0].variables as any).index_map)
					reason = 'Result item variables missing index_map field.';
				else if (typeof (result[0].variables as any).index_map !== 'object')
					reason = `index_map field is not an object (type: ${typeof (result[0].variables as any).index_map}).`;
				console.error(`[IndexQueries] Meta Index data invalid: ${reason}`, 'Result:', result);
				throw new Error(`Meta Index query returned invalid data. Reason: ${reason}`);
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
			const query: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'get',
						from: {
							pubkey: [pubKey],
							targetDocType: 'Leaf'
						},
						fields: {
							id: { field: 'doc.pubkey' },
							data: { field: 'self.data' }
						},
						resultVariable: 'indexDetails'
					},
					{
						action: 'select',
						groupBy: 'id',
						select: {
							id: { variable: 'id' },
							data: { variable: 'data' }
						},
						resultVariable: 'finalIndexData'
					}
				]
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
		// Allow iterating over maps even if they are not strictly objects (e.g., from LoroMap.toJSON())
		if (!obj) return [];
		// Ensure it's an object-like structure before trying Object.entries
		if (typeof obj !== 'object') return [];
		return Object.entries(obj);
	}
</script>

<!-- Apply styling similar to LeafQueries -->
<div class="grid h-full grid-cols-[250px_1fr_1fr] bg-[#f8f4ed]">
	<!-- Sidebar -->
	<aside class="col-span-1 h-full overflow-y-auto border-r border-gray-200 p-4">
		<h2 class="mb-4 text-lg font-semibold text-[#0a2a4e]">Index Leafs</h2>
		{#if isLoadingRegistry}
			<p class="text-sm text-gray-500">Loading index registry...</p>
		{:else if registryError}
			<p class="text-sm text-red-600">Error: {registryError}</p>
		{:else}
			<ul class="space-y-1">
				{#each getEntries(indexRegistry) as [key, pubkey] (key)}
					{@const indexTypeKey = key as IndexLeafType}
					<li>
						<button
							class="w-full rounded px-3 py-2 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-[#e0d8cb] {selectedIndexKey ===
							indexTypeKey
								? 'bg-[#0a2a4e] font-medium text-[#f8f4ed]'
								: 'text-[#0a2a4e]'}"
							on:click={() => selectIndex(indexTypeKey)}
							title={pubkey?.toString() ?? 'N/A'}
						>
							<span class="font-semibold">{indexTypeKey}</span>
							<span class="text-opacity-70 block text-xs">{truncate(pubkey?.toString(), 24)}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area (Index Details) -->
	<main class="col-span-1 h-full overflow-y-auto border-r border-l border-gray-200 p-6">
		{#if selectedIndexKey}
			<h2 class="mb-1 text-xl font-semibold text-[#0a2a4e]">Index: {selectedIndexKey}</h2>
			<p class="mb-4 text-xs text-gray-500">
				Pubkey: <code class="rounded bg-[#e0d8cb] px-1 text-[#0a2a4e]">{selectedIndexPubKey}</code>
			</p>

			{#if $selectedIndexContent === undefined}
				<p class="text-sm text-gray-500">Loading index content...</p>
			{:else if $selectedIndexContent === null}
				<p class="text-sm text-red-600">Error loading index content.</p>
			{:else if typeof currentSelectedIndexData !== 'object' || !currentSelectedIndexData}
				<p class="text-red-600">Error loading index content or data field missing.</p>
			{:else if !currentSelectedIndexData.data || typeof currentSelectedIndexData.data !== 'object' || !(currentSelectedIndexData.data as any).value}
				<p class="text-yellow-700">Index data.value is empty or invalid.</p>
			{:else}
				{@const indexValueMap = (currentSelectedIndexData.data as any).value}
				<div
					class="space-y-2 rounded border border-gray-200 bg-white p-4 font-mono text-xs text-[#0a2a4e]"
				>
					{#if selectedIndexKey === 'leaves' || selectedIndexKey === 'schemas' || selectedIndexKey === 'composites'}
						<h3 class="mb-2 text-sm font-semibold text-gray-700">Indexed PubKeys:</h3>
						<ul class="space-y-1">
							{#each getEntries(indexValueMap) as [pubkey, _value] (pubkey)}
								<li>
									<code class="text-xs text-gray-600">{pubkey}: {JSON.stringify(_value)}</code>
								</li>
							{:else}
								<li class="text-gray-500 italic">No keys found.</li>
							{/each}
						</ul>
					{:else if selectedIndexKey === 'composites-by-component'}
						<h3 class="mb-2 text-sm font-semibold text-gray-700">
							Component Index (Component Key -> Composites List):
						</h3>
						<div class="space-y-3">
							{#each getEntries(indexValueMap) as [componentKey, compositeList] (componentKey)}
								<div>
									<code class="block font-semibold text-[#1e40af]">{componentKey}</code>
									<ul class="mt-1 space-y-1 pl-4">
										{#if Array.isArray(compositeList)}
											{#each compositeList as compositePubKey (compositePubKey)}
												<li>
													<code class="text-xs text-gray-700">{compositePubKey}</code>
												</li>
											{:else}
												<li class="text-gray-500 italic">Empty list.</li>
											{/each}
										{:else}
											<li class="text-red-600 italic">
												Invalid list data: {JSON.stringify(compositeList)}.
											</li>
										{/if}
									</ul>
								</div>
							{:else}
								<p class="text-gray-500 italic">No component keys found.</p>
							{/each}
						</div>
					{:else}
						<p class="text-orange-500 italic">
							Display for index type '{selectedIndexKey}' not implemented.
						</p>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-gray-500">Select an Index Leaf from the list to view its content.</p>
			</div>
		{/if}
	</main>

	<!-- Right Column (Raw JSON View) -->
	<aside class="col-span-1 h-full overflow-y-auto p-4">
		<h2 class="mb-4 text-lg font-semibold text-[#0a2a4e]">JSON</h2>
		{#if $selectedIndexContent === undefined}
			<div class="flex h-full items-center justify-center">
				<p class="text-center text-sm text-gray-500">Loading JSON...</p>
			</div>
		{:else if $selectedIndexContent === null}
			<div class="flex h-full items-center justify-center">
				<p class="text-center text-sm text-red-600">Error loading JSON.</p>
			</div>
		{:else if currentSelectedIndexData}
			<div class="flex-1 overflow-auto rounded border border-gray-200 bg-white p-3">
				<pre class="font-mono text-xs text-gray-700">{JSON.stringify(
						currentSelectedIndexData.data ?? currentSelectedIndexData,
						null,
						2
					)}</pre>
			</div>
		{:else if selectedIndexKey}
			<div class="flex h-full items-center justify-center">
				<p class="text-center text-sm text-gray-500">Select an index to view its JSON data.</p>
			</div>
		{/if}
	</aside>
</div>
