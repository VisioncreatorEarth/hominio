<script lang="ts">
	import { hominioDB, subscribeToDbChanges } from '$lib/KERNEL/hominio-db';
	import type { Docs } from '$lib/KERNEL/hominio-types';
	import { onMount } from 'svelte';
	import { writable, type Writable } from 'svelte/store';

	let docsState: Writable<Docs[] | null | undefined> = writable(undefined); // undefined: loading, null: error, Docs[]: loaded
	let lastError: string | null = null;

	async function loadDocs() {
		console.log('[DocStatusViewer] Loading docs...');
		try {
			const allDocs = await hominioDB.loadAllDocsReturn();
			docsState.set(allDocs);
			lastError = null;
			console.log(`[DocStatusViewer] Loaded ${allDocs.length} docs.`);
		} catch (error) {
			console.error('[DocStatusViewer] Error loading docs:', error);
			lastError = error instanceof Error ? error.message : 'Unknown error loading docs';
			docsState.set(null);
		}
	}

	onMount(() => {
		loadDocs(); // Initial load

		const unsubscribe = subscribeToDbChanges(() => {
			console.log('[DocStatusViewer] DB change detected, reloading docs.');
			// Add a small delay to allow potential DB operations to settle
			setTimeout(loadDocs, 50);
		});

		return () => {
			unsubscribe();
		};
	});

	// Helper to format arrays/objects for display
	function formatValue(value: unknown): string {
		if (Array.isArray(value)) {
			if (value.length === 0) return '[]';
			return `[${value.length} item(s)]`; // Just show count for brevity
		}
		if (typeof value === 'object' && value !== null) {
			return JSON.stringify(value, null, 2); // Pretty print objects
		}
		if (value === null || value === undefined) {
			return '-';
		}
		return String(value);
	}

	function truncateCid(cid: string | undefined | null): string {
		if (!cid) return '-';
		return `${cid.substring(0, 8)}...${cid.substring(cid.length - 6)}`;
	}
</script>

<div class="h-full overflow-auto bg-[#f8f4ed] p-4">
	<h2 class="mb-4 text-xl font-semibold text-[#0a2a4e]">Document Status Overview</h2>

	{#if $docsState === undefined}
		<p class="text-gray-500">Loading document states...</p>
	{:else if $docsState === null}
		<p class="text-red-600">Error loading document states: {lastError}</p>
	{:else if $docsState.length === 0}
		<p class="text-gray-500">No documents found in the local database.</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-300 border border-gray-200 bg-white text-xs">
				<thead class="bg-gray-100 text-left text-[#0a2a4e]">
					<tr>
						<th class="px-3 py-2 font-semibold">PubKey</th>
						<th class="px-3 py-2 font-semibold">Owner</th>
						<th class="px-3 py-2 font-semibold">Updated</th>
						<th class="px-3 py-2 font-semibold">Canon. Snapshot</th>
						<th class="px-3 py-2 font-semibold">Canon. Updates</th>
						<th class="px-3 py-2 font-semibold">Local Snapshot</th>
						<th class="px-3 py-2 font-semibold">Local Updates</th>
						<th class="px-3 py-2 font-semibold">Indexing State</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white text-gray-900">
					{#each $docsState as doc (doc.pubKey)}
						<tr class="hover:bg-gray-50">
							<td class="px-3 py-2 font-mono whitespace-nowrap" title={doc.pubKey}
								>{truncateCid(doc.pubKey)}</td
							>
							<td class="px-3 py-2 font-mono whitespace-nowrap" title={doc.owner}
								>{truncateCid(doc.owner)}</td
							>
							<td class="px-3 py-2 whitespace-nowrap">{new Date(doc.updatedAt).toLocaleString()}</td
							>
							<td class="px-3 py-2 font-mono whitespace-nowrap" title={doc.snapshotCid}
								>{truncateCid(doc.snapshotCid)}</td
							>
							<td class="px-3 py-2 font-mono whitespace-nowrap">
								{#if doc.updateCids && doc.updateCids.length > 0}
									<span title={doc.updateCids.join('\n')}>{doc.updateCids.length} CID(s)</span>
								{:else}
									-
								{/if}
							</td>
							<td
								class="px-3 py-2 font-mono whitespace-nowrap {doc.localState?.snapshotCid
									? 'font-semibold text-orange-700'
									: ''}"
								title={doc.localState?.snapshotCid}>{truncateCid(doc.localState?.snapshotCid)}</td
							>
							<td
								class="px-3 py-2 font-mono whitespace-nowrap {doc.localState?.updateCids &&
								doc.localState.updateCids.length > 0
									? 'font-semibold text-orange-700'
									: ''}"
							>
								{#if doc.localState?.updateCids && doc.localState.updateCids.length > 0}
									<span title={doc.localState.updateCids.join('\n')}
										>{doc.localState.updateCids.length} CID(s)</span
									>
								{:else}
									-
								{/if}
							</td>
							<td class="px-3 py-2">
								{#if doc.indexingState}
									<div class="flex flex-col space-y-1 text-[10px] leading-tight">
										{#if doc.indexingState.needsReindex}
											<span class="rounded bg-yellow-100 px-1 text-yellow-900">Needs Reindex</span>
										{/if}
										{#if doc.indexingState.indexingError}
											<span
												class="rounded bg-red-100 px-1 text-red-900"
												title={doc.indexingState.indexingError}>Error</span
											>
										{/if}
										{#if doc.indexingState.lastIndexedTimestamp}
											<span class="text-gray-500"
												>Idx: {new Date(
													doc.indexingState.lastIndexedTimestamp
												).toLocaleTimeString()}</span
											>
										{/if}
										<!-- Optionally add lastIndexedSnapshotCid / lastIndexedUpdateCidsHash if needed -->
									</div>
								{:else}
									<span class="text-gray-400">-</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
