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
	import type { LeafValue } from '$db/seeding/leaf.data'; // Import LeafValue

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// --- Type Definitions (Aligned with LeafQueries/SchemaQueries) ---
	// FIX: Rename type and update fields
	interface LeafQueryResult extends QueryResult {
		id: string; // doc.pubkey
		data?: LeafValue | Record<string, unknown> | null; // self.data
	}

	// FIX: Rename type and update fields
	interface ResolvedLeaf extends QueryResult {
		id: string | null;
		data?: LeafValue | Record<string, unknown> | null; // self.data
	}

	// Reuse SchemaQueryResult or define a minimal ResolvedSchema
	interface ResolvedSchema extends QueryResult {
		id: string | null;
		name?: string | null; // self.data.name
		// Add translations/purpose if needed for display
		translations?: Record<string, { purpose?: string }>;
	}

	// FIX: Rename type and update fields
	interface CompositeInstance extends QueryResult {
		composite_id: string; // doc.pubkey (of the composite)
		schemaId: string; // self.data.schemaId
		schema_resolved: ResolvedSchema | null;
		x1_resolved: ResolvedLeaf | null;
		x2_resolved: ResolvedLeaf | null;
		x3_resolved: ResolvedLeaf | null;
		x4_resolved: ResolvedLeaf | null;
		x5_resolved: ResolvedLeaf | null;
	}

	// FIX: Rename type
	interface LeafRelationshipQueryResult extends QueryResult {
		id: string; // The starting Leaf ID
		composites_involving_leaf: CompositeInstance[]; // Renamed field
	}

	// FIX: Rename query, update `from` and `where` keys
	const allConceptsQuery: LoroHqlQuery = {
		from: {
			leaf: [] // FIX: Use leaf key (Changed from leaf_pubkeys)
		},
		where: [
			{
				field: 'self.data.type', // FIX: Use self.data.type
				condition: {
					equals: 'Concept' // Keep value as 'Concept'
				}
			}
		],
		map: {
			id: { field: 'doc.pubkey' },
			// FIX: Map the entire data object for display
			data: { field: 'self.data' }
			// klesi: { field: 'self.metadata.type' }, // Could use metadata type if needed
		}
	};

	// FIX: Rename store variable
	const conceptLeafQueryStore = readable<LoroHqlQuery>(allConceptsQuery);

	// FIX: Rename readable store and update type cast
	const conceptLeafReadable = processReactiveQuery(getMe, conceptLeafQueryStore) as Readable<
		LeafQueryResult[] | null | undefined
	>;

	// FIX: Rename state variables
	let selectedLeafId = $state<string | null>(null);
	let currentSelectedLeaf = $derived(
		($conceptLeafReadable ?? []).find((s) => s.id === selectedLeafId) ?? null
	);

	// FIX: Rename selection function
	function selectLeaf(id: string) {
		console.log('Selecting leaf with id:', id);
		selectedLeafId = id;
	}

	// Helper function to truncate long strings
	function truncate(str: string | null | undefined, length = 16) {
		if (!str) return '';
		return str.length > length ? str.substring(0, length) + '...' : str;
	}

	// FIX: Helper to display Leaf data in readable format (from LeafQueries)
	function displayLeafData(data: LeafValue | Record<string, unknown> | null | undefined): string {
		if (data === null || data === undefined) return '(No data)';
		if (typeof data !== 'object') return String(data);

		if ('type' in data) {
			const leafVal = data as LeafValue;
			if (leafVal.type === 'LoroText') return leafVal.value;
			if (leafVal.type === 'Concept') return '(Concept)'; // Special display for Concept
			if (leafVal.type === 'LoroMap') return `(Map: ${Object.keys(leafVal.value).length} keys)`;
			if (leafVal.type === 'LoroList') return `(List: ${leafVal.value.length} items)`;
			return `(${leafVal.type})`;
		}
		return JSON.stringify(data);
	}

	// FIX: Rename derived value and update query logic
	const compositeQueryDefinition = $derived.by(() => {
		if (!selectedLeafId) {
			return null; // No query if nothing is selected
		}
		const query: LoroHqlQuery = {
			from: {
				// FIX: Start from the selected Leaf
				leaf: [selectedLeafId] // Use leaf key (Changed from leaf_pubkeys)
			},
			map: {
				id: { field: 'doc.pubkey' },
				// FIX: Rename map key and update traverse logic
				composites_involving_leaf: {
					traverse: {
						// FIX: Use composite_where, specify schema/place wildcards
						composite_where: {
							schemaId: '*', // Any relationship type
							place: '*' // Any place (x1-x5)
						},
						return: 'array',
						map: {
							// FIX: Map fields for each Composite instance
							composite_id: { field: 'doc.pubkey' }, // ID of the composite itself
							schemaId: { field: 'self.data.schemaId' }, // FIX: Path
							schema_resolved: {
								resolve: {
									fromField: 'self.data.schemaId', // FIX: Path
									targetType: 'gismu', // FIX: Target type
									map: {
										id: { field: 'doc.pubkey' },
										// FIX: Map schema name and maybe purpose
										name: { field: 'self.data.name' },
										translations: { field: 'self.data.translations' }
									}
								}
							},
							// FIX: Resolve each place to a Leaf
							x1_resolved: {
								resolve: {
									fromField: 'self.data.places.x1', // FIX: Path
									map: {
										id: { field: 'doc.pubkey' },
										data: { field: 'self.data' } // FIX: Map data
									}
								}
							},
							x2_resolved: {
								resolve: {
									fromField: 'self.data.places.x2', // FIX: Path
									map: {
										id: { field: 'doc.pubkey' },
										data: { field: 'self.data' } // FIX: Map data
									}
								}
							},
							x3_resolved: {
								resolve: {
									fromField: 'self.data.places.x3', // FIX: Path
									map: {
										id: { field: 'doc.pubkey' },
										data: { field: 'self.data' } // FIX: Map data
									}
								}
							},
							x4_resolved: {
								resolve: {
									fromField: 'self.data.places.x4', // FIX: Path
									map: {
										id: { field: 'doc.pubkey' },
										data: { field: 'self.data' } // FIX: Map data
									}
								}
							},
							x5_resolved: {
								resolve: {
									fromField: 'self.data.places.x5', // FIX: Path
									map: {
										id: { field: 'doc.pubkey' },
										data: { field: 'self.data' } // FIX: Map data
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

	// --- Manual Reactive Query Execution for Composites ---
	// FIX: Rename state variables
	let compositeResults = $state<CompositeInstance[] | null | undefined>(undefined);
	let isLoadingComposites = $state(false);

	// FIX: Rename debounce timer
	let compositeDebounceTimer: NodeJS.Timeout | null = null;
	const COMPOSITE_DEBOUNCE_MS = 150;

	// FIX: Update effect logic (essentially copied from LeafQueries)
	$effect(() => {
		const currentQuery = compositeQueryDefinition;

		if (compositeDebounceTimer) {
			clearTimeout(compositeDebounceTimer);
			// console.log('[NodesProps Effect] Cleared previous composite debounce timer.');
		}

		if (!currentQuery) {
			if (compositeResults !== undefined) compositeResults = undefined;
			isLoadingComposites = false;
			compositeDebounceTimer = null;
			return;
		}

		// console.log('[NodesProps Effect] Query definition changed. Setting loading state.');
		isLoadingComposites = true;

		compositeDebounceTimer = setTimeout(async () => {
			// console.log(`[NodesProps Effect Debounced] Executing after ${COMPOSITE_DEBOUNCE_MS}ms delay.`);
			const currentUser = getMe();
			const latestQuery = compositeQueryDefinition;

			if (!latestQuery) {
				isLoadingComposites = false;
				return;
			}

			try {
				// console.log('[NodesProps Effect Debounced] Calling executeQuery:', JSON.stringify(latestQuery));
				const results = await executeQuery(latestQuery, currentUser);
				// console.log('[NodesProps Effect Debounced] executeQuery completed.');

				if (compositeQueryDefinition !== latestQuery) {
					// console.log('[NodesProps Effect Debounced] Query became stale during fetch, ignoring results.');
					return;
				}

				if (
					results &&
					results.length > 0 &&
					results[0] &&
					'composites_involving_leaf' in results[0]
				) {
					// FIX: Update result extraction
					compositeResults =
						(results[0] as LeafRelationshipQueryResult).composites_involving_leaf ?? [];
					// console.log(`[NodesProps Effect Debounced] Set ${compositeResults.length} composite results.`);
				} else {
					compositeResults = [];
					// console.log('[NodesProps Effect Debounced] Set empty composite results.');
				}
			} catch (error) {
				console.error('[NodesProps Effect Debounced] Error executing composite query:', error);
				if (compositeQueryDefinition === latestQuery) {
					compositeResults = null;
				}
			} finally {
				// console.log('[NodesProps Effect Debounced] Entering finally block.');
				if (compositeQueryDefinition === latestQuery) {
					isLoadingComposites = false;
					// console.log('[NodesProps Effect Debounced] Set isLoadingComposites = false');
				} else {
					// console.log('[NodesProps Effect Debounced] Query is stale, leaving isLoadingComposites=true for next run.');
				}
			}
		}, COMPOSITE_DEBOUNCE_MS);

		return () => {
			// console.log('[NodesProps Effect] Cleanup: Clearing composite debounce timer if it exists.');
			if (compositeDebounceTimer) {
				clearTimeout(compositeDebounceTimer);
				compositeDebounceTimer = null;
			}
		};
	});
</script>

<!-- Outer grid for sidebar and main content -->
<div class="grid h-full grid-cols-1 md:grid-cols-[250px_1fr]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-300 bg-white p-4">
		<!-- FIX: Update title -->
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Concept Leafs</h2>
		<!-- FIX: Update readable store variable -->
		{#if $conceptLeafReadable === undefined}
			<p class="text-sm text-gray-500">Loading concepts...</p>
		{:else if $conceptLeafReadable === null}
			<p class="text-sm text-red-600">Error loading concepts.</p>
		{:else if ($conceptLeafReadable ?? []).length === 0}
			<!-- FIX: Update text -->
			<p class="text-sm text-yellow-700">No concept leafs found.</p>
		{:else}
			<ul class="max-h-[500px] space-y-1 overflow-y-auto">
				<!-- FIX: Update iteration variable and display logic -->
				{#each $conceptLeafReadable as leaf (leaf.id)}
					<li>
						<button
							class="w-full rounded px-3 py-1 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-gray-200 {selectedLeafId ===
							leaf.id
								? 'bg-green-100 font-medium text-green-700'
								: 'text-gray-600'}"
							on:click={() => selectLeaf(leaf.id)}
						>
							<!-- FIX: Display concept leaf ID (concepts have no .value) -->
							{truncate(leaf.id, 24)}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area -->
	<main class="col-span-1 flex flex-col overflow-y-auto p-6">
		<!-- FIX: Update selected variable -->
		{#if currentSelectedLeaf}
			{@const selectedLeaf = currentSelectedLeaf}

			<!-- Inner grid for main details and debug info -->
			<div class="grid h-full grid-cols-1 gap-6 lg:grid-cols-2">
				<!-- Left Column: Node Properties and Relationships -->
				<div class="col-span-1 flex flex-col gap-6 overflow-y-auto">
					<!-- Node Properties Section -->
					<div class="rounded-lg border border-gray-300 bg-white p-6 shadow">
						<h2 class="mb-4 text-2xl font-semibold text-gray-800">Selected Concept Leaf</h2>
						<div class="space-y-2 text-base">
							<p>
								<span class="font-medium text-gray-600">Name:</span>
								<!-- FIX: Display name (concept ID) -->
								<span class="ml-2 font-semibold break-all text-gray-900">{selectedLeaf.id}</span>
							</p>
							<p>
								<span class="font-medium text-gray-600">Type:</span>
								<!-- FIX: Display type from data -->
								<span class="ml-2 text-gray-800"
									>{(selectedLeaf.data as { type?: string })?.type || 'Unknown Type'}</span
								>
							</p>
							<p>
								<span class="font-medium text-gray-600">ID:</span>
								<code class="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-700"
									>{selectedLeaf.id}</code
								>
							</p>
						</div>
					</div>

					<!-- Relationships Section (Human Readable) -->
					<div class="rounded-lg border border-gray-300 bg-white p-6 shadow">
						<!-- FIX: Update title -->
						<h2 class="mb-4 text-2xl font-semibold text-gray-800">Composites</h2>
						<!-- FIX: Update loading/result variables -->
						{#if isLoadingComposites}
							<p class="text-sm text-gray-500">Loading composites...</p>
						{:else if compositeResults === null}
							<!-- FIX: Update text -->
							<p class="text-lg text-gray-500">Error loading composites.</p>
						{:else if !compositeResults || compositeResults.length === 0}
							<!-- FIX: Update text -->
							<p class="text-lg text-gray-500">No composites found involving this leaf.</p>
						{:else}
							<!-- Relationship List -->
							<div class="space-y-4">
								<!-- FIX: Update iteration variable and display logic -->
								{#each compositeResults as rel (rel.composite_id)}
									{@const _debug = console.log('[NodesProps Debug] Processing Composite:', rel)}

									<!-- FIX: Get schema name -->
									{@const schemaName =
										rel.schema_resolved?.name || // Access potentially problematic
										truncate(rel.schemaId) ||
										'Unknown Schema'}

									<!-- Generate participant parts -->
									{@const participants = []}
									{#each ['x1', 'x2', 'x3', 'x4', 'x5'] as place}
										<!-- FIX: Use ResolvedLeaf -->
										{@const resolvedNode = rel[`${place}_resolved`] as ResolvedLeaf | null}
										{@const _debugPlace = console.log(
											`[NodesProps Debug] Resolved ${place}:`,
											resolvedNode
										)}
										{#if resolvedNode && resolvedNode.id}
											{@const isSelf = resolvedNode.id === selectedLeafId}
											<!-- FIX: Use displayLeafData for node content -->
											{@const nodeName = displayLeafData(resolvedNode.data) || 'Unnamed Leaf'}
											{@const part = { place, name: nodeName, isSelf, id: resolvedNode.id }}
											{@const _ = participants.push(part)}
										{/if}
									{/each}

									<!-- Display relationship sentence -->
									<div class="rounded border border-gray-200 bg-gray-50 p-3">
										<div class="mb-1 text-xs text-gray-500">
											Composite: {truncate(rel.composite_id, 12)}
										</div>
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

												<!-- Separator / Schema Name -->
												{#if i === 0}
													<!-- Show schema after first participant -->
													<!-- Revert the complex #if block and just use schemaName -->
													<span class="mx-1 font-semibold text-blue-600">- {schemaName} -</span>
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
				</div>
				<!-- End Left Column -->

				<!-- Right Column: Debug Display -->
				<div class="col-span-1 flex flex-col gap-2 overflow-y-auto">
					<details class="rounded border border-gray-300 bg-white">
						<!-- FIX: Update summary -->
						<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
							>Raw Leaf Data</summary
						>
						<div class="border-t border-gray-300 p-3">
							<pre
								class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(
									// FIX: Use correct variable
									selectedLeaf,
									null,
									2
								)}</pre>
						</div>
					</details>
					<details
						class="rounded border border-gray-300 bg-white"
						open={compositeResults !== undefined}
					>
						<!-- FIX: Update summary -->
						<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
							>Raw Composite Query Result ({isLoadingComposites
								? 'Loading'
								: compositeResults === null
									? 'Error'
									: (compositeResults?.length ?? 'N/A')})</summary
						>
						>
						<div class="border-t border-gray-300 p-3">
							<pre
								class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(
									// FIX: Use correct variable
									compositeResults,
									null,
									2
								)}</pre>
						</div>
					</details>
				</div>
				<!-- End Right Column -->
			</div>
			<!-- End Inner Grid -->
		{:else}
			<div class="flex h-full items-center justify-center">
				<!-- FIX: Update text -->
				<p class="text-lg text-gray-500">Select a concept leaf from the list to view details.</p>
			</div>
		{/if}
	</main>
</div>
