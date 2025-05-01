<script lang="ts">
	import {
		processReactiveQuery,
		type QueryResult,
		type LoroHqlQueryExtended
	} from '$lib/KERNEL/hominio-query';
	import { readable, type Readable, derived, writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import SyncStatusUI from '$lib/components/SyncStatusUI.svelte';
	import SchemaQueries from '$lib/components/SchemaQueries.svelte';
	import LeafQueries from '$lib/components/LeafQueries.svelte';
	import QueryEditor from '$lib/components/QueryEditor.svelte';
	import IndexQueries from '$lib/components/IndexQueries.svelte';
	import Todos from '$lib/components/Todos.svelte';
	import type { SchemaLanguageTranslation } from '$db/seeding/schema.data';

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

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
	const allSchemaQuery: LoroHqlQueryExtended | null = null;

	// Convert query to a store for reactive processing
	const schemaQueryStore = readable<LoroHqlQueryExtended | null>(allSchemaQuery);

	// Create a reactive query store that will update when data changes
	const schemaReadable = processReactiveQuery(getMe, schemaQueryStore) as Readable<
		SchemaQueryResult[] | null | undefined
	>;

	// Create a function to generate a composite query filtered by schema type
	function createCompositeQueryForSchema(schemaId: string): LoroHqlQueryExtended | null {
		return null;
	}

	// Selected Schema State
	let selectedSchemaId = $state<string | null>(null);

	// New component-level data store for the selected schema
	let currentSelectedSchema = $state<SchemaQueryResult | null>(null);

	// Store for the current composite query
	const compositeQueryStore = writable<LoroHqlQueryExtended | null>(null);

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

<div class="flex h-screen flex-col bg-[#f8f4ed]">
	<!-- Header with status and tabs -->
	<header class="flex flex-col border-b border-gray-300 bg-[#f8f4ed]">
		<div class="flex items-center justify-between px-4 py-2">
			<div class="flex-1">
				<h1 class="text-lg font-bold text-[#0a2a4e]">HQL Query Explorer</h1>
			</div>
			<div class="flex-grow">
				<SyncStatusUI />
			</div>
		</div>

		<!-- Navigation Tabs -->
		<nav class="flex px-4">
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'schema'
					? 'border-[#0a2a4e] text-[#0a2a4e]'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
				on:click={() => setActiveTab('schema')}
			>
				Schemata
			</button>
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'leaf'
					? 'border-[#0a2a4e] text-[#0a2a4e]'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
				on:click={() => setActiveTab('leaf')}
			>
				Leafs
			</button>
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'query-editor'
					? 'border-[#0a2a4e] text-[#0a2a4e]'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
				on:click={() => setActiveTab('query-editor')}
			>
				Query Editor
			</button>

			<!-- Add Indices Tab Button -->
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'indices'
					? 'border-[#0a2a4e] text-[#0a2a4e]'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
				on:click={() => setActiveTab('indices')}
			>
				Indices
			</button>
			<!-- Add Todos Tab Button -->
			<button
				class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'todos'
					? 'border-[#0a2a4e] text-[#0a2a4e]'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
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
