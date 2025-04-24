<script lang="ts">
	import {
		processReactiveQuery,
		executeQuery,
		type LoroHqlQuery,
		type QueryResult
	} from '$lib/KERNEL/hominio-query';
	import { readable, type Readable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// Define a more specific type for our sumti query results
	interface SumtiQueryResult extends QueryResult {
		id: string;
		ckaji?: { klesi?: string; cmene?: string }; // <<< Fix ckaji type
		datni?: {
			klesi?: string; // datni.klesi
			vasru?: any; // datni.vasru
			// other datni fields...
		};
	}

	// --- Types for Relationship Query Results ---
	interface ResolvedSumti extends QueryResult {
		id: string | null;
		klesi?: string | null;
		content?: any | null;
		fanva?: any | null;
	}

	interface Relationship extends QueryResult {
		bridi_id: string;
		selbri_id: string;
		selbri_resolved: ResolvedSumti | null;
		x1_resolved: ResolvedSumti | null;
		x2_resolved: ResolvedSumti | null;
		x3_resolved: ResolvedSumti | null;
		x4_resolved: ResolvedSumti | null;
		x5_resolved: ResolvedSumti | null;
	}

	interface RelationshipQueryResult extends QueryResult {
		id: string; // The starting Sumti ID
		all_relationships_involved_in: Relationship[];
	}

	// Create a query to fetch all Concept Sumti
	const allConceptsQuery: LoroHqlQuery = {
		from: {
			sumti_pubkeys: [] // Empty array triggers "fetch all" logic in the query engine
		},
		where: [
			{
				field: 'self.datni.klesi',
				condition: {
					equals: 'concept'
				}
			}
		],
		map: {
			id: { field: 'doc.pubkey' },
			klesi: { field: 'self.ckaji.klesi' }, // Assuming klesi is in ckaji for display
			datni: { field: 'self.datni' } // Get datni for checking concept klesi
		}
	};

	// Convert query to a store for reactive processing
	const conceptQueryStore = readable<LoroHqlQuery>(allConceptsQuery);

	// Create a reactive query store that will update when data changes
	const conceptSumtiReadable = processReactiveQuery(getMe, conceptQueryStore) as Readable<
		SumtiQueryResult[] | null | undefined
	>;

	// Selected Sumti State
	let selectedSumtiId = $state<string | null>(null);
	let currentSelectedSumti = $derived(
		($conceptSumtiReadable ?? []).find((s) => s.id === selectedSumtiId) ?? null
	);

	// Function to handle sumti selection
	function selectSumti(id: string) {
		console.log('Selecting sumti with id:', id);
		selectedSumtiId = id;
	}

	// Helper function to truncate long strings
	function truncate(str: string | null | undefined, length = 16) {
		if (!str) return '';
		return str.length > length ? str.substring(0, length) + '...' : str;
	}

	// --- Reactive Query for Selected Sumti's Relationships ---
	// Create a derived value for the query definition based on selectedSumtiId
	const relationshipQueryDefinition = $derived.by(() => {
		if (!selectedSumtiId) {
			return null; // No query if nothing is selected
		}
		const query: LoroHqlQuery = {
			from: {
				sumti_pubkeys: [selectedSumtiId] // Start from the selected Sumti
			},
			map: {
				id: { field: 'doc.pubkey' },
				all_relationships_involved_in: {
					traverse: {
						bridi_where: {
							selbri: '*', // Any relationship type
							place: '*' // Any place (x1-x5)
						},
						return: 'array',
						map: {
							// Define what to get for each relationship (Bridi)
							bridi_id: { field: 'doc.pubkey' },
							selbri_id: { field: 'self.datni.selbri' },
							selbri_resolved: {
								resolve: {
									fromField: 'self.datni.selbri',
									targetType: 'selbri',
									map: {
										id: { field: 'doc.pubkey' },
										klesi: { field: 'self.ckaji.klesi' },
										content: { field: 'self.datni.cneme' },
										fanva: { field: 'self.datni.fanva' }
									}
								}
							},
							x1_resolved: {
								resolve: {
									fromField: 'self.datni.sumti.x1',
									map: {
										id: { field: 'doc.pubkey' },
										klesi: { field: 'self.datni.klesi' },
										content: { field: 'self.datni.vasru' }
									}
								}
							},
							x2_resolved: {
								resolve: {
									fromField: 'self.datni.sumti.x2',
									map: {
										id: { field: 'doc.pubkey' },
										klesi: { field: 'self.datni.klesi' },
										content: { field: 'self.datni.vasru' }
									}
								}
							},
							x3_resolved: {
								resolve: {
									fromField: 'self.datni.sumti.x3',
									map: {
										id: { field: 'doc.pubkey' },
										klesi: { field: 'self.datni.klesi' },
										content: { field: 'self.datni.vasru' }
									}
								}
							},
							x4_resolved: {
								resolve: {
									fromField: 'self.datni.sumti.x4',
									map: {
										id: { field: 'doc.pubkey' },
										klesi: { field: 'self.datni.klesi' },
										content: { field: 'self.datni.vasru' }
									}
								}
							},
							x5_resolved: {
								resolve: {
									fromField: 'self.datni.sumti.x5',
									map: {
										id: { field: 'doc.pubkey' },
										klesi: { field: 'self.datni.klesi' },
										content: { field: 'self.datni.vasru' }
									}
								}
							}
						}
					}
				}
			}
		};
		return query;
	});

	// --- Manual Reactive Query Execution for Relationships ---
	let relationshipResults = $state<Relationship[] | null | undefined>(undefined); // undefined: loading, null: error, array: results
	let isLoadingRelationships = $state(false);

	// Debounce timer for relationship query
	let relationshipDebounceTimer: NodeJS.Timeout | null = null;
	const RELATIONSHIP_DEBOUNCE_MS = 150; // Adjust as needed

	$effect(() => {
		const currentQuery = relationshipQueryDefinition; // Track the derived query

		// --- Clear previous timer on dependency change ---
		if (relationshipDebounceTimer) {
			clearTimeout(relationshipDebounceTimer);
			console.log('[SumtiQueries Effect] Cleared previous debounce timer.');
		}

		if (!currentQuery) {
			// If no query (no sumti selected), clear results immediately (no debounce)
			if (relationshipResults !== undefined) relationshipResults = undefined;
			isLoadingRelationships = false;
			relationshipDebounceTimer = null; // Ensure timer is null
			return; // Stop the effect
		}

		// --- Set Loading State Immediately ---
		console.log(
			'[SumtiQueries Effect] Query definition changed. Setting loading state and scheduling debounced execution.'
		);
		isLoadingRelationships = true;
		// Optional: Set results to undefined immediately for faster loading feedback
		// Comment this out if you prefer less flicker and want to keep old data until new data arrives
		// relationshipResults = undefined;

		// --- Debounced Execution ---
		relationshipDebounceTimer = setTimeout(async () => {
			console.log(
				`[SumtiQueries Effect Debounced] Executing after ${RELATIONSHIP_DEBOUNCE_MS}ms delay.`
			);
			const currentUser = getMe(); // Get user *inside* debounced function
			// Re-check the query definition *inside* the timeout
			// to ensure we use the latest value if it changed again during the debounce period.
			const latestQuery = relationshipQueryDefinition;

			if (!latestQuery) {
				// Should ideally not happen if outer check passed, but safety first
				isLoadingRelationships = false;
				return;
			}

			// Execute Query (Original async logic moved inside timeout)
			// let isStale = false;
			// const execute = async () => {
			// 	console.log(
			// 		'[SumtiQueries Effect] Query definition changed, executing relationship query:',
			// 		JSON.stringify(currentQuery)
			// 	);
			// 	isLoadingRelationships = true;
			// 	// Set to undefined only if not already loading to avoid flicker
			// 	if (relationshipResults !== undefined) relationshipResults = undefined;

			try {
				console.log(
					'[SumtiQueries Effect Debounced] Calling executeQuery:',
					JSON.stringify(latestQuery)
				);
				const results = await executeQuery(latestQuery, currentUser);
				console.log('[SumtiQueries Effect Debounced] executeQuery completed.');

				// Check if the query definition has changed *again* while we were fetching
				// if (isStale) {
				// 	console.log('[SumtiQueries Effect] Query became stale during fetch, ignoring results.');
				// 	return;
				// }

				// No need for isStale flag with debounce, we check against the latest definition
				if (relationshipQueryDefinition !== latestQuery) {
					console.log(
						'[SumtiQueries Effect Debounced] Query became stale during fetch, ignoring results.'
					);
					// Loading state will be handled by the *next* effect run/timeout
					return;
				}

				if (results && results.length > 0) {
					// Assuming the query returns [{ id: ..., all_relationships_involved_in: [...] }]
					relationshipResults =
						(results[0] as RelationshipQueryResult).all_relationships_involved_in ?? [];
					console.log(
						`[SumtiQueries Effect Debounced] Set ${relationshipResults.length} relationship results.`
					);
				} else {
					relationshipResults = []; // No relationships found
					console.log('[SumtiQueries Effect Debounced] Set empty relationship results.');
				}
			} catch (error) {
				console.error('[SumtiQueries Effect Debounced] Error executing relationship query:', error);
				if (relationshipQueryDefinition === latestQuery) {
					// Only set error if not stale
					relationshipResults = null; // Set to null on error
				}
			} finally {
				console.log('[SumtiQueries Effect Debounced] Entering finally block.');
				// Always set loading to false when the async function finishes, regardless of staleness.
				// If it became stale, the *next* effect run will set loading back to true if needed.
				// if (!isStale) {
				// 	isLoadingRelationships = false;
				// }
				if (relationshipQueryDefinition === latestQuery) {
					// Only set loading false if not stale
					isLoadingRelationships = false;
					console.log('[SumtiQueries Effect Debounced] Set isLoadingRelationships = false');
				} else {
					console.log(
						'[SumtiQueries Effect Debounced] Query is stale, leaving isLoadingRelationships=true for next run.'
					);
				}
			}
			// };

			// execute(); // Run the async function
		}, RELATIONSHIP_DEBOUNCE_MS); // End of setTimeout

		// Cleanup function for the effect
		return () => {
			console.log('[SumtiQueries Effect] Cleanup: Clearing debounce timer if it exists.');
			if (relationshipDebounceTimer) {
				clearTimeout(relationshipDebounceTimer);
				relationshipDebounceTimer = null;
			}
		};
	});
</script>

<div class="grid h-full grid-cols-1 md:grid-cols-[250px_1fr]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-300 bg-white p-4">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Concept Sumti</h2>
		{#if $conceptSumtiReadable === undefined}
			<p class="text-sm text-gray-500">Loading concepts...</p>
		{:else if $conceptSumtiReadable === null}
			<p class="text-sm text-red-600">Error loading concepts.</p>
		{:else if ($conceptSumtiReadable ?? []).length === 0}
			<p class="text-sm text-yellow-700">No concept sumti found.</p>
		{:else}
			<ul class="max-h-[500px] space-y-1 overflow-y-auto">
				{#each $conceptSumtiReadable as sumti (sumti.id)}
					<li>
						<button
							class="w-full rounded px-3 py-1 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-gray-200 {selectedSumtiId ===
							sumti.id
								? 'bg-green-100 font-medium text-green-700'
								: 'text-gray-600'}"
							on:click={() => selectSumti(sumti.id)}
						>
							{truncate(sumti.datni?.vasru?.toString()) || truncate(sumti.id, 12)}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area (Details) -->
	<main class="col-span-1 flex flex-col overflow-y-auto p-6">
		{#if currentSelectedSumti}
			{@const selectedSumti = currentSelectedSumti}

			<!-- Node Properties Section -->
			<div class="mb-8 rounded-lg border border-gray-300 bg-white p-6 shadow">
				<h2 class="mb-4 text-2xl font-semibold text-gray-800">Selected Node</h2>
				<div class="space-y-2 text-base">
					<p>
						<span class="font-medium text-gray-600">Name:</span>
						<span class="ml-2 font-semibold text-gray-900"
							>{selectedSumti.datni?.vasru?.toString() ||
								selectedSumti.ckaji?.cmene ||
								'Unnamed'}</span
						>
					</p>
					<p>
						<span class="font-medium text-gray-600">Type:</span>
						<span class="ml-2 text-gray-800"
							>{selectedSumti.datni?.klesi || selectedSumti.ckaji?.klesi || 'Unknown Type'}</span
						>
					</p>
					<p>
						<span class="font-medium text-gray-600">ID:</span>
						<code class="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-700"
							>{selectedSumti.id}</code
						>
					</p>
				</div>
			</div>

			<!-- Relationships Section (Human Readable) -->
			<div class="rounded-lg border border-gray-300 bg-white p-6 shadow">
				<h2 class="mb-4 text-2xl font-semibold text-gray-800">Relationships</h2>
				{#if isLoadingRelationships}
					<p class="text-sm text-gray-500">Loading relationships...</p>
				{:else if relationshipResults === null}
					<p class="text-lg text-gray-500">Error loading relationships.</p>
				{:else if !relationshipResults || relationshipResults.length === 0}
					<p class="text-lg text-gray-500">No relationships found for this node.</p>
				{:else}
					<!-- Relationship List -->
					<div class="space-y-4">
						{#each relationshipResults as rel (rel.bridi_id)}
							{@const selbriName =
								rel.selbri_resolved?.fanva?.glico?.x1 ||
								rel.selbri_resolved?.content ||
								truncate(rel.selbri_id) ||
								'Unknown Relationship'}

							<!-- Generate participant parts -->
							{@const participants = []}
							{#each ['x1', 'x2', 'x3', 'x4', 'x5'] as place}
								{@const resolvedNode = rel[`${place}_resolved`] as ResolvedSumti | null}
								{#if resolvedNode && resolvedNode.id}
									{@const isSelf = resolvedNode.id === selectedSumtiId}
									{@const nodeName = resolvedNode.content || 'Unnamed Node'}
									{@const part = { place, name: nodeName, isSelf, id: resolvedNode.id }}
									{@const _ = participants.push(part)}
								{/if}
							{/each}

							<!-- Display relationship sentence -->
							<div class="rounded border border-gray-200 bg-gray-50 p-3">
								<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
									{#each participants as part, i}
										<!-- Participant Node -->
										<span class="inline-flex items-center" title={part.id}>
											<span
												class="font-medium text-gray-800 {part.isSelf
													? 'font-bold text-indigo-700'
													: ''}">{part.isSelf ? 'Self' : part.name}</span
											>
											{#if !part.isSelf}
												<code class="ml-1 rounded bg-gray-200 px-1 py-0.5 text-xs text-gray-500"
													>{truncate(part.id, 6)}</code
												>{/if}
										</span>

										<!-- Separator / Selbri Name -->
										{#if i === 0}
											<!-- Show selbri after first participant -->
											<span class="mx-1 font-semibold text-blue-600">- {selbriName} -</span>
										{:else if i < participants.length - 1}
											<!-- Show hyphen between other participants -->
											<span class="text-gray-400">-</span>
										{/if}
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Debug Display -->
			<div class="mt-6 border-t border-gray-300 pt-6">
				<details class="rounded border border-gray-300 bg-white">
					<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
						>Raw Concept Data</summary
					>
					<div class="border-t border-gray-300 p-3">
						<pre
							class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(
								selectedSumti,
								null,
								2
							)}</pre>
					</div>
				</details>
				<details
					class="mt-2 rounded border border-gray-300 bg-white"
					open={relationshipResults !== undefined}
				>
					<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
						>Raw Relationship Query Result ({isLoadingRelationships
							? 'Loading'
							: relationshipResults === null
								? 'Error'
								: (relationshipResults?.length ?? 'N/A')})</summary
					>
					<div class="border-t border-gray-300 p-3">
						<pre
							class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(
								relationshipResults,
								null,
								2
							)}</pre>
					</div>
				</details>
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">Select a concept sumti from the list to view details.</p>
			</div>
		{/if}
	</main>
</div>
