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
	import SchemaQueries from '$lib/components/SchemaQueries.svelte';
	import LeafQueries from '$lib/components/LeafQueries.svelte';
	import QueryEditor from '$lib/components/QueryEditor.svelte';
	import NodesProps from '$lib/components/NodesProps.svelte';
	import GraphView from '$lib/components/GraphView.svelte';
	import IndexQueries from '$lib/components/IndexQueries.svelte';
	import Todos from '$lib/components/Todos.svelte';
	import type { SchemaPlaceTranslation, SchemaLanguageTranslation } from '$db/seeding/schema.data';

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
	interface SchemaQueryResult extends QueryResult {
		id: string;
		name?: string;
		places?: {
			x1?: string;
			x2?: string;
			x3?: string;
			x4?: string;
			x5?: string;
		};
		translations?: Record<string, SchemaLanguageTranslation>;
	}

	// Define type for bridi/relationship query results
	interface CompositeQueryResult extends QueryResult {
		id: string;
		schemaId?: string;
		x1?: { data: unknown; pubkey: string } | null;
		x2?: { data: unknown; pubkey: string } | null;
		x3?: { data: unknown; pubkey: string } | null;
		x4?: { data: unknown; pubkey: string } | null;
		x5?: { data: unknown; pubkey: string } | null;
	}

	// Create a query to fetch all schemas (empty array tells the engine to fetch all)
	const allSchemaQuery: LoroHqlQuery = {
		from: {
			schema: []
		},
		map: {
			id: { field: 'doc.pubkey' },
			name: { field: 'self.data.name' },
			places: { field: 'self.data.places' },
			translations: { field: 'self.data.translations' }
		}
	};

	// Convert query to a store for reactive processing
	const schemaQueryStore = readable<LoroHqlQuery>(allSchemaQuery);

	// Create a reactive query store that will update when data changes
	const schemaReadable = processReactiveQuery(getMe, schemaQueryStore) as Readable<
		SchemaQueryResult[] | null | undefined
	>;

	// Create a function to generate a composite query filtered by schema type
	function createCompositeQueryForSchema(schemaId: string): LoroHqlQuery {
		return {
			from: {
				composite: []
			},
			where: [
				{
					field: 'self.data.schemaId',
					condition: { equals: schemaId }
				}
			],
			map: {
				id: { field: 'doc.pubkey' },
				schemaId: { field: 'self.data.schemaId' },
				x1: {
					resolve: {
						fromField: 'self.data.places.x1',
						map: {
							data: { field: 'self.data' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x2: {
					resolve: {
						fromField: 'self.data.places.x2',
						map: {
							data: { field: 'self.data' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x3: {
					resolve: {
						fromField: 'self.data.places.x3',
						map: {
							data: { field: 'self.data' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x4: {
					resolve: {
						fromField: 'self.data.places.x4',
						map: {
							data: { field: 'self.data' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x5: {
					resolve: {
						fromField: 'self.data.places.x5',
						map: {
							data: { field: 'self.data' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				}
			}
		};
	}

	// Selected Schema State
	let selectedSchemaId = $state<string | null>(null);

	// New component-level data store for the selected schema
	let currentSelectedSchema = $state<SchemaQueryResult | null>(null);

	// Store for the current composite query
	const compositeQueryStore = writable<LoroHqlQuery | null>(null);

	// Create a reactive query for composite records
	const compositeReadable = processReactiveQuery(getMe, compositeQueryStore) as Readable<
		CompositeQueryResult[] | null | undefined
	>;

	// Function to handle schema selection
	function selectSchema(id: string) {
		console.log('Selecting schema with id:', id);
		selectedSchemaId = id;

		// Find the selected schema directly
		if ($schemaReadable) {
			const found = $schemaReadable.find((item) => item.id === id);
			if (found) {
				console.log('Found schema directly:', found.name);
				currentSelectedSchema = found;

				// Create and set the composite query for this schema
				const compositeQuery = createCompositeQueryForSchema(id);
				compositeQueryStore.set(compositeQuery);
			} else {
				console.log('Schema not found directly, trying flexible matching');
				// Try flexible matching if exact match fails
				for (const schema of $schemaReadable) {
					if (schema.id.toLowerCase() === id.toLowerCase()) {
						console.log('Found schema with case-insensitive match:', schema.name);
						currentSelectedSchema = schema;

						// Create and set the composite query for this schema
						const compositeQuery = createCompositeQueryForSchema(schema.id);
						compositeQueryStore.set(compositeQuery);
						break;
					}
				}
			}
		}
	}

	// Helper function to get English name
	function getSchemaDisplayInfo(schema: SchemaQueryResult): string {
		return schema.translations?.en?.places?.x1?.title || schema.name || 'Unnamed Schema';
	}

	// Helper function to truncate long strings
	function truncate(str: string, length = 16) {
		if (!str) return '';
		return str.length > length ? str.substring(0, length) + '...' : str;
	}

	// Tab state
	let activeTab = $state('schema'); // Default tab: 'schema', 'leaf', 'query-editor', 'nodes-props', 'graph-view', 'indices', 'todos'

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
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'schema'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('schema')}
			>
				Schemata
			</button>
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'leaf'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('leaf')}
			>
				Leafs
			</button>
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'query-editor'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('query-editor')}
			>
				Query Editor
			</button>
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'nodes-props'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('nodes-props')}
			>
				Nodes Props
			</button>
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'graph-view'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('graph-view')}
			>
				Graph View
			</button>
			<!-- Add Indices Tab Button -->
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'indices'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('indices')}
			>
				Indices
			</button>
			<!-- Add Todos Tab Button -->
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'todos'
					? 'border-indigo-500 text-indigo-600'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
				on:click={() => setActiveTab('todos')}
			>
				Todos
			</button>
		</nav>
	</header>

	<!-- Main Content -->
	<main class="flex-1 overflow-hidden">
		{#if activeTab === 'schema'}
			<div class="h-full">
				<SchemaQueries />
			</div>
		{:else if activeTab === 'leaf'}
			<div class="h-full">
				<LeafQueries />
			</div>
		{:else if activeTab === 'query-editor'}
			<div class="h-full">
				<QueryEditor />
			</div>
		{:else if activeTab === 'nodes-props'}
			<div class="h-full">
				<NodesProps />
			</div>
		{:else if activeTab === 'graph-view'}
			<div class="h-full">
				<GraphView />
			</div>
			<!-- Add Indices Tab Content -->
		{:else if activeTab === 'indices'}
			<div class="h-full">
				<IndexQueries />
			</div>
			<!-- Add Todos Tab Content -->
		{:else if activeTab === 'todos'}
			<div class="h-full">
				<Todos />
			</div>
		{/if}
	</main>
</div>
