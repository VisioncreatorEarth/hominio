<script lang="ts">
	import {
		processReactiveQuery,
		type LoroHqlQuery,
		type QueryResult
	} from '$lib/KERNEL/hominio-query';
	import { getMe } from '$lib/KERNEL/hominio-auth';
	import { writable, type Readable } from 'svelte/store';

	// Define the example queries (keep these)
	const exampleQuery4: LoroHqlQuery = {
		from: {
			selbri_pubkeys: []
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

	// --- Add query for all Bridi ---
	const allBridiQuery: LoroHqlQuery = {
		from: {
			bridi_pubkeys: [] // Empty array fetches all Bridi
		},
		map: {
			id: { field: 'doc.pubkey' },
			selbri: { field: 'self.datni.selbri' },
			// Use resolve to get the vasru from the linked Sumti for each place
			x1: {
				resolve: {
					fromField: 'self.datni.sumti.x1',
					map: {
						value: { field: 'self.datni' },
						pubkey: { field: 'doc.pubkey' }
					}
				}
			},
			x2: {
				resolve: {
					fromField: 'self.datni.sumti.x2',
					map: {
						value: { field: 'self.datni' },
						pubkey: { field: 'doc.pubkey' }
					}
				}
			},
			x3: {
				resolve: {
					fromField: 'self.datni.sumti.x3',
					map: {
						value: { field: 'self.datni' },
						pubkey: { field: 'doc.pubkey' }
					}
				}
			},
			x4: {
				resolve: {
					fromField: 'self.datni.sumti.x4',
					map: {
						value: { field: 'self.datni' },
						pubkey: { field: 'doc.pubkey' }
					}
				}
			},
			x5: {
				resolve: {
					fromField: 'self.datni.sumti.x5',
					map: {
						value: { field: 'self.datni' },
						pubkey: { field: 'doc.pubkey' }
					}
				}
			}
		}
	};

	// --- NEW: Function to create a filtered bridi query by selbri type ---
	function createFilteredBridiQuery(selbriPubkey: string): LoroHqlQuery {
		return {
			from: {
				bridi_pubkeys: [] // Empty array fetches all Bridi
			},
			where: [
				{
					field: 'self.datni.selbri',
					condition: { equals: selbriPubkey }
				}
			],
			map: {
				id: { field: 'doc.pubkey' },
				selbri: { field: 'self.datni.selbri' },
				x1: {
					resolve: {
						fromField: 'self.datni.sumti.x1',
						map: {
							value: { field: 'self.datni' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x2: {
					resolve: {
						fromField: 'self.datni.sumti.x2',
						map: {
							value: { field: 'self.datni' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x3: {
					resolve: {
						fromField: 'self.datni.sumti.x3',
						map: {
							value: { field: 'self.datni' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x4: {
					resolve: {
						fromField: 'self.datni.sumti.x4',
						map: {
							value: { field: 'self.datni' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x5: {
					resolve: {
						fromField: 'self.datni.sumti.x5',
						map: {
							value: { field: 'self.datni' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				}
			}
		};
	}

	// --- EXAMPLE: Create a filtered query for specific selbri types ---
	const zukteQuery = createFilteredBridiQuery(
		'0x17af593bc5411987e911d3d49e033cbfc34c0f885cc2fd6a5b4161629eafaa93'
	);
	const cnemeQuery = createFilteredBridiQuery(
		'0x96360692ef7f876a32e1a3c46a15bd597da160e76ac9c4bfd96026cb4afe3412'
	);
	const gunkaQuery = createFilteredBridiQuery(
		'0xc05e9db099a2a9b699b208778a5c60db302700fd15147bba9f232c13183635b3'
	);
	const ckajiQuery = createFilteredBridiQuery(
		'0xa83a44305ddc3cc4f51ee41665eb0e6de585ab312a370fc47002f07d168a4d7b'
	);

	// --- NEW: Query for Tasks in Project1 ---
	const projectTasksQuery: LoroHqlQuery = {
		from: {
			// Start from the generated pubkey for @project1
			sumti_pubkeys: ['0x82987b80cd423e8ff658a00ab59e51827440a101636650716b01ef201b8d8ec5']
		},
		map: {
			project_id: { field: 'doc.pubkey' },
			project_name: {
				// Look for the project name in Project Sumti directly
				field: 'self.datni'
			},
			bridi_relationships: {
				// Find all bridi documents directly
				// This can be used to explore the actual relationships
				traverse: {
					bridi_where: {
						// Looking for project relationship with any selbri
						// where project is in any place
						selbri: 'selbri:0x96360692ef7f876a32e1a3c46a15bd597da160e76ac9c4bfd96026cb4afe3412', // @selbri_cneme
						place: 'x1'
					},
					return: 'array',
					map: {
						bridi_id: { field: 'doc.pubkey' },
						bridi_data: { field: 'self.datni' }
					}
				}
			},
			// Add a simpler query to verify we can at least get the selbri document
			selbri_test: {
				resolve: {
					fromField: 'doc.pubkey', // Use the project ID as a placeholder
					map: {
						// Try to resolve @selbri_gunka directly
						gunka_selbri: {
							field: 'self.datni',
							traverse: {
								bridi_where: {
									selbri:
										'selbri:0xc05e9db099a2a9b699b208778a5c60db302700fd15147bba9f232c13183635b3',
									place: 'x2'
								},
								return: 'array',
								map: {
									x1_sumti: { place: 'x1', field: 'doc.pubkey' }
								}
							}
						}
					}
				}
			}
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
		const queryName = queryToRun.from?.selbri_pubkeys
			? 'Selbri Defs'
			: queryToRun.from?.bridi_pubkeys
				? queryToRun.where
					? 'Filtered Bridi'
					: 'All Bridi'
				: 'Unknown Query';
		console.log(`[runQuery] Setting active query definition: ${queryName}`);
		activeQueryDefinition.set(queryToRun); // Use .set() on the writable store
	}

	// --- Reactive logging ---
	$: {
		if ($queryResultsStore !== undefined) {
			// Log only when it's defined (or null)
			console.log('UI Debug: queryResultsStore value:', $queryResultsStore);
		}
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

	// Update helper type for Bridi Query Result (reflecting resolved values AND pubkey)
	type BridiQueryResult = {
		id: string;
		selbri?: string;
		// Resolved value will be nested, include pubkey
		x1?: { value: unknown; pubkey: string } | null;
		x2?: { value: unknown; pubkey: string } | null;
		x3?: { value: unknown; pubkey: string } | null;
		x4?: { value: unknown; pubkey: string } | null;
		x5?: { value: unknown; pubkey: string } | null;
	};

	// --- NEW: Type for Project Tasks Query Result ---
	type TaskDetail = {
		id: string;
		name?: { value: string } | null; // Result of nested traverse { value: ... }
		status?: { value: string } | null;
		priority?: { value: string } | null;
		tags?: { value: string }[] | null; // Array result from nested traverse
		// assignee?: ...
	};

	type ProjectTaskQueryResult = {
		project_id: string;
		project_name?: { name: string } | null; // Result of traverse { name: ... }
		tasks?: { task: TaskDetail }[] | null; // Array of tasks, each nested under 'task' key
	};
</script>

<div class="p-6 text-black">
	<h1 class="mb-4 text-2xl font-bold">Loro HQL Test Page</h1>

	<div class="mb-4 flex flex-wrap items-start gap-2">
		<button
			class="rounded bg-slate-600 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
			on:click={() => runQuery(exampleQuery4)}
			disabled={$queryResultsStore === undefined && !!$activeQueryDefinition?.from?.selbri_pubkeys}
		>
			{$queryResultsStore === undefined && !!$activeQueryDefinition?.from?.selbri_pubkeys
				? 'Running...'
				: 'Run Query (Selbri Defs)'}
		</button>
		<button
			class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
			on:click={() => runQuery(allBridiQuery)}
			disabled={$queryResultsStore === undefined && !!$activeQueryDefinition?.from?.bridi_pubkeys}
		>
			{$queryResultsStore === undefined && !!$activeQueryDefinition?.from?.bridi_pubkeys
				? 'Running...'
				: 'Run Query (All Bridi)'}
		</button>
		<button
			class="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
			on:click={() => runQuery(projectTasksQuery)}
			disabled={$queryResultsStore === undefined && !!$activeQueryDefinition?.from?.sumti_pubkeys}
		>
			{$queryResultsStore === undefined && !!$activeQueryDefinition?.from?.sumti_pubkeys
				? 'Running...'
				: 'Run Query (Project Tasks)'}
		</button>
		<!-- Add buttons for the filtered queries -->
		<button
			class="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
			on:click={() => runQuery(zukteQuery)}
			disabled={$queryResultsStore === undefined && !!$activeQueryDefinition?.where}
		>
			{$queryResultsStore === undefined && !!$activeQueryDefinition?.where
				? 'Running...'
				: 'Run Query (Zukte Relationships)'}
		</button>
		<button
			class="rounded bg-pink-600 px-4 py-2 text-white hover:bg-pink-700 disabled:opacity-50"
			on:click={() => runQuery(cnemeQuery)}
			disabled={$queryResultsStore === undefined && !!$activeQueryDefinition?.where}
		>
			{$queryResultsStore === undefined && !!$activeQueryDefinition?.where
				? 'Running...'
				: 'Run Query (Name Relationships)'}
		</button>
		<button
			class="rounded bg-orange-600 px-4 py-2 text-white hover:bg-orange-700 disabled:opacity-50"
			on:click={() => runQuery(gunkaQuery)}
			disabled={$queryResultsStore === undefined && !!$activeQueryDefinition?.where}
		>
			{$queryResultsStore === undefined && !!$activeQueryDefinition?.where
				? 'Running...'
				: 'Run Query (Gunka Relationships)'}
		</button>
		<button
			class="rounded bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-700 disabled:opacity-50"
			on:click={() => runQuery(ckajiQuery)}
			disabled={$queryResultsStore === undefined && !!$activeQueryDefinition?.where}
		>
			{$queryResultsStore === undefined && !!$activeQueryDefinition?.where
				? 'Running...'
				: 'Run Query (Ckaji Relationships)'}
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
				{:else if $activeQueryDefinition?.from?.bridi_pubkeys && $queryResultsStore.length > 0}
					<div class="space-y-4">
						{#each $queryResultsStore as result (result.id)}
							{@const bridi = result as BridiQueryResult}
							<div class="rounded border border-gray-300 bg-blue-50 p-4">
								<h3 class="mb-2 text-lg font-semibold text-blue-800">{bridi.id}</h3>
								<p class="mb-1 text-sm"><strong>Selbri:</strong> {bridi.selbri || 'N/A'}</p>
								<ul class="list-disc space-y-1 pl-5 text-sm">
									{#if bridi.x1 === null}
										<li><strong>x1:</strong> [Resolution Failed/No Access]</li>
									{:else if bridi.x1?.value !== undefined}
										<li>
											<strong>x1:</strong>
											{bridi.x1.value}
											<span class="text-xs text-gray-500">({typeof bridi.x1.value})</span>
										</li>
									{:else if bridi.x1?.pubkey}
										<li>
											<strong>x1:</strong>
											{bridi.x1.pubkey.substring(0, 12)}...
											<span class="text-xs text-gray-500">(concept)</span>
										</li>
									{/if}
									{#if bridi.x2 === null}
										<li><strong>x2:</strong> [Resolution Failed/No Access]</li>
									{:else if bridi.x2?.value !== undefined}
										<li>
											<strong>x2:</strong>
											{bridi.x2.value}
											<span class="text-xs text-gray-500">({typeof bridi.x2.value})</span>
										</li>
									{:else if bridi.x2?.pubkey}
										<li>
											<strong>x2:</strong>
											{bridi.x2.pubkey.substring(0, 12)}...
											<span class="text-xs text-gray-500">(concept)</span>
										</li>
									{/if}
									{#if bridi.x3 === null}
										<li><strong>x3:</strong> [Resolution Failed/No Access]</li>
									{:else if bridi.x3?.value !== undefined}
										<li>
											<strong>x3:</strong>
											{bridi.x3.value}
											<span class="text-xs text-gray-500">({typeof bridi.x3.value})</span>
										</li>
									{:else if bridi.x3?.pubkey}
										<li>
											<strong>x3:</strong>
											{bridi.x3.pubkey.substring(0, 12)}...
											<span class="text-xs text-gray-500">(concept)</span>
										</li>
									{/if}
									{#if bridi.x4 === null}
										<li><strong>x4:</strong> [Resolution Failed/No Access]</li>
									{:else if bridi.x4?.value !== undefined}
										<li>
											<strong>x4:</strong>
											{bridi.x4.value}
											<span class="text-xs text-gray-500">({typeof bridi.x4.value})</span>
										</li>
									{:else if bridi.x4?.pubkey}
										<li>
											<strong>x4:</strong>
											{bridi.x4.pubkey.substring(0, 12)}...
											<span class="text-xs text-gray-500">(concept)</span>
										</li>
									{/if}
									{#if bridi.x5 === null}
										<li><strong>x5:</strong> [Resolution Failed/No Access]</li>
									{:else if bridi.x5?.value !== undefined}
										<li>
											<strong>x5:</strong>
											{bridi.x5.value}
											<span class="text-xs text-gray-500">({typeof bridi.x5.value})</span>
										</li>
									{:else if bridi.x5?.pubkey}
										<li>
											<strong>x5:</strong>
											{bridi.x5.pubkey.substring(0, 12)}...
											<span class="text-xs text-gray-500">(concept)</span>
										</li>
									{/if}
								</ul>
							</div>
						{/each}
					</div>
				{:else if $activeQueryDefinition?.from?.sumti_pubkeys && $queryResultsStore.length > 0}
					<!-- NEW: Display Project Tasks -->
					<div class="space-y-6">
						{#each $queryResultsStore as result (result.project_id)}
							{@const projectData = result as ProjectTaskQueryResult}
							<div class="rounded border border-green-300 bg-green-50 p-4">
								<h3 class="mb-3 text-xl font-semibold text-green-800">
									Project: {projectData.project_name?.name || projectData.project_id}
									{#if !projectData.project_name?.name}
										<span class="text-sm font-normal text-orange-600">
											(Name requires seeded @prop_name)
										</span>
									{/if}
								</h3>
								<h4 class="mb-2 text-lg font-medium text-gray-700">Tasks:</h4>
								{#if projectData.tasks && projectData.tasks.length > 0}
									<ul class="ml-4 space-y-3">
										{#each projectData.tasks as taskItem (taskItem.task.id)}
											{@const task = taskItem.task}
											<li class="rounded border border-gray-200 bg-white p-3 shadow-sm">
												<p class="font-semibold">
													{task.name?.value || task.id}
													{#if !task.name?.value}
														<span class="text-xs font-normal text-orange-600">
															(Name requires seeded @prop_name)
														</span>
													{/if}
												</p>
												<p class="text-sm text-gray-600">
													Status: <span class="font-medium">{task.status || 'N/A'}</span>
												</p>
												<p class="text-sm text-gray-600">
													Priority: <span class="font-medium">{task.priority || 'N/A'}</span>
												</p>
												{#if task.tags && task.tags.length > 0}
													<p class="mt-1 text-sm text-gray-600">
														Tags:
														{#each task.tags as tagItem (tagItem.value)}
															<span
																class="ml-1 inline-block rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-800"
															>
																{tagItem.value}
															</span>
														{/each}
													</p>
												{/if}
											</li>
										{/each}
									</ul>
								{:else}
									<p class="ml-4 text-sm text-gray-500">No tasks found for this project.</p>
								{/if}
							</div>
						{/each}
					</div>
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
