<script lang="ts">
	import { executeQuery, type LoroHqlQuery, type QueryResult } from '$lib/NEXT/query';

	let results: QueryResult[] | null = null;
	let isLoading = false;
	let error: string | null = null;

	// Example Query 1 (Map-Based Syntax): Find tasks assigned to 'Project: Website' (@project1) and their status.
	const exampleQuery: LoroHqlQuery = {
		from: { sumti_pubkeys: ['@project1'] },
		map: {
			project_name: { field: 'self.ckaji.cmene' },
			tasks: {
				// Output array property
				traverse: {
					bridi_where: { selbri: '@selbri_gunka', place: 'x3' },
					return: 'array',
					map: {
						// Define structure for each related task object
						task_id: { place: 'x2', field: 'self.ckaji.pubkey' },
						task_name: { place: 'x2', field: 'self.ckaji.cmene' },
						worker: {
							place: 'x1', // Target the worker node (at place x1 of gunka)
							map: {
								// Map the worker node itself
								id: { field: 'self.ckaji.pubkey' },
								// Traverse from the worker node to find its linked name
								name: {
									traverse: {
										bridi_where: { selbri: '@selbri_ckaji', place: 'x1' }, // Worker is x1 in ckaji
										return: 'first',
										map: {
											// Map the related name Sumti node (at place x2 of ckaji)
											// Use temporary key, engine extracts value
											_value: { place: 'x2', field: 'self.datni.vasru' }
										}
									}
								}
							} // End map for worker node
						}, // End worker object definition
						status: {
							// Nested traversal to find the task's status
							place: 'x2', // Start traversal from the task node (x2 in gunka bridi)
							traverse: {
								bridi_where: { selbri: '@selbri_ckaji', place: 'x1' }, // Task is x1 in ckaji
								return: 'first',
								where_related: [
									{
										place: 'x2',
										field: 'self.ckaji.pubkey',
										condition: {
											in: ['@status_inprogress', '@status_notstarted', '@status_completed']
										}
									}
								],
								map: {
									value: { place: 'x2', field: 'self.datni.vasru' },
									pubkey: { place: 'x2', field: 'self.ckaji.pubkey' }
								}
							}
						} // End status object definition
					} // End map for the main traverse
				} // End traverse object
			} // End tasks definition
		} // End top-level map
	}; // End exampleQuery definition

	async function runQuery() {
		isLoading = true;
		error = null;
		results = null;
		try {
			console.log('Running Query:', JSON.stringify(exampleQuery, null, 2));
			const queryResults = await executeQuery(exampleQuery);
			console.log('Query Results:', queryResults);
			results = queryResults;
		} catch (err) {
			console.error('Query execution failed:', err);
			error = err instanceof Error ? err.message : 'An unknown error occurred';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="p-6 text-black">
	<h1 class="mb-4 text-2xl font-bold">Loro HQL Test Page</h1>

	<button
		class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
		on:click={runQuery}
		disabled={isLoading}
	>
		{isLoading ? 'Running Query...' : 'Run Example Query (Project Tasks & Status)'}
	</button>

	{#if error}
		<div class="mt-4 rounded border border-red-400 bg-red-100 p-4 text-red-700">
			<strong>Error:</strong>
			{error}
		</div>
	{/if}

	<!-- 50/50 Layout Container -->
	<div class="mt-6 flex w-full space-x-6">
		<!-- Left Side: Query Definition -->
		<div class="w-1/2">
			<h2 class="mb-2 text-xl font-semibold">Query Definition Used:</h2>
			<pre
				class="overflow-x-auto rounded border border-gray-300 bg-gray-100 p-4 text-sm">{JSON.stringify(
					exampleQuery,
					null,
					2
				)}</pre>
		</div>

		<!-- Right Side: Query Results -->
		<div class="w-1/2">
			{#if results}
				<h2 class="mb-2 text-xl font-semibold">Query Results:</h2>
				<pre
					class="overflow-x-auto rounded border border-gray-300 bg-gray-100 p-4 text-sm">{JSON.stringify(
						results,
						null,
						2
					)}</pre>
			{:else}
				<!-- Optional: Placeholder if results are null -->
				<div
					class="flex h-48 items-center justify-center rounded border border-gray-300 bg-gray-100 p-4 text-gray-500"
				>
					Click button to run query...
				</div>
			{/if}
		</div>
	</div>
</div>
