<script lang="ts">
	import { processReactiveQuery, type LoroHqlQuery, type QueryResult } from '$lib/NEXT/query';
	import { getMe } from '$lib/KERNEL/hominio-auth';
	import { writable, type Readable } from 'svelte/store';

	// Define the example queries (keep these)
	const exampleQuery4: LoroHqlQuery = {
		from: {
			selbri_pubkeys: ['0x17af593bc5411987e911d3d49e033cbfc34c0f885cc2fd6a5b4161629eafaa93']
		},
		map: {
			id: { field: 'doc.pubkey' },
			lojban_name: { field: 'self.datni.cneme' },
			x1_def: { field: 'self.datni.sumti.x1' },
			x2_def: { field: 'self.datni.sumti.x2' },
			x3_def: { field: 'self.datni.sumti.x3' },
			x4_def: { field: 'self.datni.sumti.x4' },
			x5_def: { field: 'self.datni.sumti.x5' },
			translations: { field: 'self.datni.fanva' },
			prompts: { field: 'self.datni.stidi' }
		}
	};

	// --- Use writable store for active query ---
	const activeQueryDefinition = writable<LoroHqlQuery | null>(null);

	// --- Setup the main reactive query store using the writable store directly ---
	const queryResultsStore: Readable<QueryResult[] | null | undefined> = processReactiveQuery(
		getMe,
		activeQueryDefinition
	);

	// --- Simplified runQuery function using .set ---
	function runQuery(queryToRun: LoroHqlQuery) {
		const queryName = queryToRun.from?.selbri_pubkeys ? 'Example 4' : 'Example 5'; // Determine name based on from clause
		console.log(`[runQuery] Setting active query definition: ${queryName}`);
		activeQueryDefinition.set(queryToRun); // Use .set() on the writable store
	}

	// Update helper type
	type SelbriQueryResult = {
		id: string;
		lojban_name?: string;
		x1_def?: string;
		x2_def?: string;
		x3_def?: string;
		x4_def?: string;
		x5_def?: string;
		translations?: Record<string, Record<string, string>>;
		prompts?: Record<string, string>;
	};
</script>

<div class="p-6 text-black">
	<h1 class="mb-4 text-2xl font-bold">Loro HQL Test Page</h1>

	<div class="mb-4 flex flex-wrap items-start gap-2">
		<button
			class="rounded bg-slate-600 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
			on:click={() => runQuery(exampleQuery4)}
			disabled={$queryResultsStore === undefined && $activeQueryDefinition?.from?.selbri_pubkeys}
		>
			{$queryResultsStore === undefined && $activeQueryDefinition?.from?.selbri_pubkeys
				? 'Running...'
				: 'Run Query  (Selbri Defs)'}
		</button>
	</div>

	{#if $queryResultsStore === null}
		<div class="mt-4 rounded border border-red-400 bg-red-100 p-4 text-red-700">
			<strong>Error:</strong>
			Query execution failed
		</div>
	{/if}

	<div class="mt-6 flex w-full space-x-6">
		<div class="w-1/2">
			<h2 class="mb-2 text-xl font-semibold">Query Definition Used:</h2>
			{#if $activeQueryDefinition}
				<pre
					class="overflow-x-auto rounded border border-gray-300 bg-gray-100 p-4 text-sm">{JSON.stringify(
						$activeQueryDefinition,
						null,
						2
					)}</pre>
			{:else}
				<div
					class="flex h-48 items-center justify-center rounded border border-gray-300 bg-gray-100 p-4 text-gray-500"
				>
					Click a button to run a query...
				</div>
			{/if}
		</div>

		<div class="w-1/2">
			<h2 class="mb-2 text-xl font-semibold">Query Results:</h2>
			{#if $queryResultsStore === undefined}
				<div
					class="flex h-48 items-center justify-center rounded border border-gray-300 bg-gray-100 p-4 text-gray-500"
				>
					Loading results...
				</div>
			{:else if $queryResultsStore}
				{#if $activeQueryDefinition?.from?.selbri_pubkeys && $queryResultsStore.length > 0}
					<div class="space-y-4">
						{#each $queryResultsStore as result (result.id)}
							{@const selbri = result as SelbriQueryResult}
							<div class="rounded border border-gray-300 bg-gray-50 p-4">
								<h3 class="mb-2 text-lg font-semibold">
									{selbri.id} ({selbri.lojban_name || 'N/A'})
								</h3>
								<div class="mb-3">
									<h4 class="text-md mb-1 font-medium">Lojban Definitions:</h4>
									<ul class="list-disc space-y-1 pl-5 text-sm">
										{#if selbri.x1_def}<li><strong>x1:</strong> {selbri.x1_def}</li>{/if}
										{#if selbri.x2_def}<li><strong>x2:</strong> {selbri.x2_def}</li>{/if}
										{#if selbri.x3_def}<li><strong>x3:</strong> {selbri.x3_def}</li>{/if}
										{#if selbri.x4_def}<li><strong>x4:</strong> {selbri.x4_def}</li>{/if}
										{#if selbri.x5_def}<li><strong>x5:</strong> {selbri.x5_def}</li>{/if}
									</ul>
								</div>
								{#if selbri.translations}
									<div class="mb-3">
										<h4 class="text-md mb-1 font-medium">Translations:</h4>
										{#each Object.entries(selbri.translations) as [lang, trans] (lang)}
											<div class="mb-2 pl-3">
												<span class="font-semibold text-gray-700">{lang}:</span>
												<ul class="list-disc space-y-1 pl-5 text-sm">
													{#if trans.x1}<li><strong>x1:</strong> {trans.x1}</li>{/if}
													{#if trans.x2}<li><strong>x2:</strong> {trans.x2}</li>{/if}
													{#if trans.x3}<li><strong>x3:</strong> {trans.x3}</li>{/if}
													{#if trans.x4}<li><strong>x4:</strong> {trans.x4}</li>{/if}
													{#if trans.x5}<li><strong>x5:</strong> {trans.x5}</li>{/if}
												</ul>
											</div>
										{/each}
									</div>
								{/if}
								{#if selbri.prompts}
									<div class="mt-3 border-t border-gray-200 pt-3">
										<h4 class="text-md mb-1 font-medium">LLM Prompts:</h4>
										{#each Object.entries(selbri.prompts) as [lang, prompt] (lang)}
											<div class="mb-1 pl-3">
												<span class="font-semibold text-gray-700">{lang}:</span>
												<p class="text-sm text-gray-600 italic">{prompt}</p>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else if $activeQueryDefinition?.from?.sumti_pubkeys && $queryResultsStore.length > 0}
					<h3 class="mb-2 text-lg font-semibold">LORO HQL Syntax Prompt:</h3>
					{#each $queryResultsStore as result}
						<pre
							class="rounded border border-gray-300 bg-gray-100 p-4 font-mono text-sm whitespace-pre-wrap">{result.prompt_text}</pre>
					{/each}
				{:else}
					<pre
						class="overflow-x-auto rounded border border-gray-300 bg-gray-100 p-4 text-sm">{JSON.stringify(
							$queryResultsStore,
							null,
							2
						)}</pre>
				{/if}
			{:else}
				<div
					class="flex h-48 items-center justify-center rounded border border-gray-300 bg-gray-100 p-4 text-gray-500"
				>
					{$activeQueryDefinition ? 'No results returned.' : 'Click a button to run a query...'}
				</div>
			{/if}
		</div>
	</div>
</div>
