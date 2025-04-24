<script lang="ts">
	import {
		processReactiveQuery,
		type LoroHqlQuery,
		type QueryResult
	} from '$lib/KERNEL/hominio-query';
	import { readable, type Readable, derived, writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import SyncStatusUI from '$lib/components/SyncStatusUI.svelte';
	import SelbriQueries from '$lib/components/SelbriQueries.svelte';
	import SumtiQueries from '$lib/components/SumtiQueries.svelte';
	import QueryEditor from '$lib/components/QueryEditor.svelte';

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// Define language translation record type
	interface LanguageTranslation {
		x1?: string;
		x2?: string;
		x3?: string;
		x4?: string;
		x5?: string;
	}

	// Define a more specific type for our query results
	interface SelbriQueryResult extends QueryResult {
		id: string;
		name?: string;
		x1?: string;
		x2?: string;
		x3?: string;
		x4?: string;
		x5?: string;
		translations?: Record<string, LanguageTranslation>;
		prompts?: Record<string, string>;
	}

	// Define type for bridi/relationship query results
	interface BridiQueryResult extends QueryResult {
		id: string;
		selbri?: string;
		x1?: { value: unknown; pubkey: string } | null;
		x2?: { value: unknown; pubkey: string } | null;
		x3?: { value: unknown; pubkey: string } | null;
		x4?: { value: unknown; pubkey: string } | null;
		x5?: { value: unknown; pubkey: string } | null;
	}

	// Create a query to fetch all Selbri (empty array tells the engine to fetch all)
	const allSelbriQuery: LoroHqlQuery = {
		from: {
			selbri_pubkeys: [] // Empty array triggers "fetch all" logic in the query engine
		},
		map: {
			id: { field: 'doc.pubkey' },
			name: { field: 'self.datni.cneme' },
			x1: { field: 'self.datni.sumti.x1' },
			x2: { field: 'self.datni.sumti.x2' },
			x3: { field: 'self.datni.sumti.x3' },
			x4: { field: 'self.datni.sumti.x4' },
			x5: { field: 'self.datni.sumti.x5' },
			translations: { field: 'self.datni.fanva' },
			prompts: { field: 'self.datni.stidi' }
		}
	};

	// Convert query to a store for reactive processing
	const selbriQueryStore = readable<LoroHqlQuery>(allSelbriQuery);

	// Create a reactive query store that will update when data changes
	const selbriReadable = processReactiveQuery(getMe, selbriQueryStore) as Readable<
		SelbriQueryResult[] | null | undefined
	>;

	// Create a function to generate a bridi query filtered by selbri type
	function createBridiQueryForSelbri(selbriId: string): LoroHqlQuery {
		return {
			from: {
				bridi_pubkeys: [] // Empty array fetches all Bridi
			},
			where: [
				{
					field: 'self.datni.selbri',
					condition: { equals: selbriId }
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

	// Selected Selbri State
	let selectedSelbriId = $state<string | null>(null);

	// New component-level data store for the selected selbri
	let currentSelectedSelbri = $state<SelbriQueryResult | null>(null);

	// Store for the current bridi query
	const bridiQueryStore = writable<LoroHqlQuery | null>(null);

	// Create a reactive query for bridi records
	const bridiReadable = processReactiveQuery(getMe, bridiQueryStore) as Readable<
		BridiQueryResult[] | null | undefined
	>;

	// Function to handle selbri selection
	function selectSelbri(id: string) {
		console.log('Selecting selbri with id:', id);
		selectedSelbriId = id;

		// Find the selected selbri directly
		if ($selbriReadable) {
			const found = $selbriReadable.find((item) => item.id === id);
			if (found) {
				console.log('Found selbri directly:', found.name);
				currentSelectedSelbri = found;

				// Create and set the bridi query for this selbri
				const bridiQuery = createBridiQueryForSelbri(id);
				bridiQueryStore.set(bridiQuery);
			} else {
				console.log('Selbri not found directly, trying flexible matching');
				// Try flexible matching if exact match fails
				for (const selbri of $selbriReadable) {
					if (selbri.id.toLowerCase() === id.toLowerCase()) {
						console.log('Found selbri with case-insensitive match:', selbri.name);
						currentSelectedSelbri = selbri;

						// Create and set the bridi query for this selbri
						const bridiQuery = createBridiQueryForSelbri(selbri.id);
						bridiQueryStore.set(bridiQuery);
						break;
					}
				}
			}
		}
	}

	// Helper function to get English name
	function getEnglishName(selbri: SelbriQueryResult): string {
		return selbri.translations?.glico?.x1 || selbri.name || 'Unnamed Schema';
	}

	// Helper function to truncate long strings
	function truncate(str: string, length = 16) {
		if (!str) return '';
		return str.length > length ? str.substring(0, length) + '...' : str;
	}

	// Tab state
	let activeTab = $state('selbri'); // Default tab: 'selbri', 'sumti', 'query-editor'

	// Function to change active tab
	function setActiveTab(tab: string) {
		activeTab = tab;
	}
</script>

<div class="flex h-screen flex-col bg-gray-100">
	<!-- Header with status and tabs -->
	<header class="flex flex-col border-b border-gray-300 bg-white">
		<div class="flex items-center justify-between px-4 py-2">
			<div class="flex-1">
				<h1 class="text-lg font-bold text-gray-800">HQL Query Explorer</h1>
			</div>
			<div class="flex-grow">
				<SyncStatusUI />
			</div>
		</div>

		<!-- Navigation Tabs -->
		<nav class="flex px-4">
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'selbri'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('selbri')}
			>
				Selbri
			</button>
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'sumti'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('sumti')}
			>
				Sumti
			</button>
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'query-editor'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('query-editor')}
			>
				Query Editor
			</button>
		</nav>
	</header>

	<!-- Main Content -->
	<main class="flex-1 overflow-hidden">
		{#if activeTab === 'selbri'}
			<div class="h-full">
				<SelbriQueries />
			</div>
		{:else if activeTab === 'sumti'}
			<div class="h-full">
				<SumtiQueries />
			</div>
		{:else if activeTab === 'query-editor'}
			<div class="h-full">
				<QueryEditor />
			</div>
		{/if}
	</main>
</div>
