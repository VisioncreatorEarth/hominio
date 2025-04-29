<script lang="ts">
	import { processReactiveQuery, type LoroHqlQueryExtended } from '$lib/KERNEL/hominio-query';
	import { writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// Current query and editor state
	let queryText = writable(
		'{\n  "steps": [\n    {\n      "action": "find",\n      "target": {\n        "schema": "YOUR_TCINI_SCHEMA_PUBKEY"\n      },\n      "variables": {\n        "taskVar": { "source": "link.x1" },\n        "statusLeafVar": { "source": "link.x2" }\n      },\n      "resultVariable": "taskStatusLinks",\n      "return": "array"\n    },\n    {\n      "action": "find",\n      "target": {\n        "schema": "YOUR_CNEME_SCHEMA_PUBKEY"\n      },\n      "variables": {\n        "entityVar": { "source": "link.x1" },\n        "nameLeafVar": { "source": "link.x2" }\n      },\n      "resultVariable": "entityNameLinks",\n      "return": "array"\n    },\n    {\n      "action": "select",\n      "groupBy": "taskVar",\n      "select": {\n        "taskId": { "variable": "taskVar" },\n        "statusLeafId": { "variable": "taskStatusLinks_statusLeafVar" }\n      }\n    }\n  ]\n}'
	);
	let queryError = writable<string | null>(null);

	// Current query store - Use new type
	const queryStore = writable<LoroHqlQueryExtended | null>(null);

	// Results store
	const resultsStore = processReactiveQuery(getMe, queryStore);

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

<div class="p-4">
	<h2 class="mb-4 text-xl font-semibold text-black">Query Editor</h2>

	<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<h3 class="mb-2 text-lg font-medium text-black">Edit Query</h3>
			<div class="relative">
				<textarea
					bind:value={$queryText}
					class="h-[400px] w-full resize-none rounded border border-gray-300 bg-white p-3 font-mono text-sm text-black"
				></textarea>
				{#if $queryError}
					<div class="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
						{$queryError}
					</div>
				{/if}
				<button
					class="mt-2 rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
					on:click={runCustomQuery}
				>
					Run Query
				</button>
			</div>
		</div>

		<div>
			<h3 class="mb-2 text-lg font-medium text-black">Results</h3>
			<div class="h-[400px] overflow-auto rounded border border-gray-300 bg-white p-3">
				{#if $resultsStore === undefined}
					<div class="flex h-full items-center justify-center text-gray-500">
						<p>Loading results...</p>
					</div>
				{:else if $resultsStore === null}
					<div class="flex h-full items-center justify-center text-red-500">
						<p>Error executing query</p>
					</div>
				{:else if $resultsStore.length === 0}
					<div class="flex h-full items-center justify-center text-gray-500">
						<p>No results found</p>
					</div>
				{:else}
					<div class="space-y-4">
						{#each $resultsStore as result (result.id ?? JSON.stringify(result))}
							<div class="rounded border border-gray-200 bg-white p-3">
								<h4 class="mb-2 font-medium text-black">
									{truncate(result.id ?? result.taskId ?? 'Unknown', 24)}
								</h4>
								<pre
									class="max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs text-black">{JSON.stringify(
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
