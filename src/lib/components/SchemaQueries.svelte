<script lang="ts">
	import {
		processReactiveQuery,
		type LoroHqlQuery,
		type QueryResult
	} from '$lib/KERNEL/hominio-query';
	import { readable, type Readable, writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import type { SchemaLanguageTranslation } from '$db/seeding/schema.data';
	import type { LeafValue } from '$db/seeding/leaf.data';

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// FIX: Rename type and update fields
	interface SchemaQueryResult extends QueryResult {
		id: string; // pubkey
		name?: string; // data.name
		places?: {
			// data.places
			x1?: string;
			x2?: string;
			x3?: string;
			x4?: string;
			x5?: string;
		};
		translations?: Record<string, SchemaLanguageTranslation>;
	}

	// FIX: Rename type and update fields
	interface CompositeQueryResult extends QueryResult {
		id: string; // pubkey
		schemaId?: string; // data.schemaId
		// Resolved Leaf data for each place
		x1?: { data: LeafValue | null; pubkey: string } | null; // Resolved LeafRecord.data
		x2?: { data: LeafValue | null; pubkey: string } | null;
		x3?: { data: LeafValue | null; pubkey: string } | null;
		x4?: { data: LeafValue | null; pubkey: string } | null;
		x5?: { data: LeafValue | null; pubkey: string } | null;
	}

	// FIX: Rename query, update fields, use schema key
	const allSchemaQuery: LoroHqlQuery = {
		from: {
			schema: [] // Use schema key (Changed from gismu_pubkeys)
		},
		map: {
			id: { field: 'doc.pubkey' },
			name: { field: 'self.data.name' },
			places: { field: 'self.data.places' },
			translations: { field: 'self.data.translations' }
		}
	};

	// FIX: Rename store
	const schemaQueryStore = readable<LoroHqlQuery>(allSchemaQuery);

	// FIX: Rename readable store and update type cast
	const schemaReadable = processReactiveQuery(getMe, schemaQueryStore) as Readable<
		SchemaQueryResult[] | null | undefined
	>;

	// FIX: Rename function and update query fields
	function createCompositeQueryForSchema(schemaId: string): LoroHqlQuery {
		return {
			from: {
				composite: [] // Use composite key (Changed from composite_pubkeys)
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

	// FIX: Rename state variable
	let selectedSchemaId = $state<string | null>(null);

	// FIX: Rename state variable and type
	let currentSelectedSchema = $state<SchemaQueryResult | null>(null);

	// FIX: Rename store
	const compositeQueryStore = writable<LoroHqlQuery | null>(null);

	// FIX: Rename readable store, update type cast
	const compositeReadable = processReactiveQuery(getMe, compositeQueryStore) as Readable<
		CompositeQueryResult[] | null | undefined
	>;

	// FIX: Rename function and update logic
	function selectSchema(id: string) {
		console.log('Selecting schema with id:', id);
		selectedSchemaId = id;

		if ($schemaReadable) {
			const found = $schemaReadable.find((item) => item.id === id);
			if (found) {
				console.log('Found schema directly:', found.name);
				currentSelectedSchema = found;

				const compositeQuery = createCompositeQueryForSchema(id);
				compositeQueryStore.set(compositeQuery);
			} else {
				console.log('Schema not found directly, trying flexible matching');
				for (const schema of $schemaReadable) {
					if (schema.id.toLowerCase() === id.toLowerCase()) {
						console.log('Found schema with case-insensitive match:', schema.name);
						currentSelectedSchema = schema;

						const compositeQuery = createCompositeQueryForSchema(schema.id);
						compositeQueryStore.set(compositeQuery);
						break;
					}
				}
			}
		}
	}

	// FIX: Rename helper function and update logic (if needed, check usage below)
	function getSchemaDisplayInfo(schema: SchemaQueryResult): string {
		// Example: Get English purpose or fallback to name
		return schema.translations?.en?.purpose || schema.name || 'Unnamed Schema';
	}

	// Helper function to truncate long strings (remains the same)
	function truncate(str: string, length = 16) {
		if (!str) return '';
		return str.length > length ? str.substring(0, length) + '...' : str;
	}

	// State for prenu creation (remains the same for now, assuming @schema/prenu ID is stable)
	let isCreatingPrenu = false;
	let creationMessage = '';
	const PRENU_SCHEMA_ID = '@schema/prenu'; // Define constant for clarity
</script>

<!-- FIX: Adjust grid columns for 3 columns: Sidebar, Main Content, Debug Aside - make right wider -->
<div class="grid h-full grid-cols-1 md:grid-cols-[250px_1.75fr_1.25fr]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-300 bg-white p-4">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Schemas</h2>
		<!-- FIX: Update readable store -->
		{#if $schemaReadable === undefined}
			<p class="text-sm text-gray-500">Loading schemas...</p>
		{:else if $schemaReadable === null}
			<p class="text-sm text-red-600">Error loading schemas.</p>
		{:else if $schemaReadable.length === 0}
			<p class="text-sm text-yellow-700">No schemas found.</p>
		{:else}
			<ul class="space-y-2">
				<!-- FIX: Update iteration variable and click handler -->
				{#each $schemaReadable as schema (schema.id)}
					<li>
						<button
							class="w-full rounded px-3 py-2 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-gray-200 {selectedSchemaId ===
							schema.id
								? 'bg-indigo-100 font-medium text-indigo-700'
								: 'text-gray-600'}"
							on:click={() => selectSchema(schema.id)}
						>
							{schema.name}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area (Middle Column) -->
	<main class="col-span-1 flex flex-col overflow-y-auto border-r border-gray-300 p-6">
		<!-- FIX: Update selected variable -->
		{#if currentSelectedSchema}
			{@const selectedSchema = currentSelectedSchema}

			<div class="flex-shrink-0 pb-6">
				<div class="flex items-center justify-between">
					<h1 class="text-2xl font-bold text-gray-800">
						{selectedSchema.name}
					</h1>
				</div>
				<p class="mb-3 text-sm text-gray-500">
					<code class="rounded bg-gray-200 px-1 text-xs">{selectedSchema.id}</code>
				</p>

				<!-- FIX: Add display for purpose -->
				{#if selectedSchema.translations?.en?.purpose}
					<p class="mb-4 text-sm text-gray-700 italic">
						{selectedSchema.translations.en.purpose}
					</p>
				{:else}
					<p class="mb-4 text-sm text-gray-500 italic">(No English purpose defined)</p>
				{/if}

				<!-- Creation Message -->
				{#if creationMessage}
					<div class="mb-4 rounded-md bg-blue-50 p-4 text-sm">
						<p class="text-blue-700">{creationMessage}</p>
					</div>
				{/if}

				<h2 class="mb-3 text-xl font-semibold text-gray-700">Arguments</h2>
				<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<!-- FIX: Update access to translations and places -->
					{#if selectedSchema.translations?.en?.places}
						{@const enPlaces = selectedSchema.translations.en.places}
						{#if selectedSchema.places?.x1 && enPlaces.x1}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x1</h3>
								</div>
								<p class="mb-1 text-sm font-medium text-gray-800">{enPlaces.x1.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x1.description}</p>
							</div>
						{/if}

						{#if selectedSchema.places?.x2 && enPlaces.x2}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x2</h3>
								</div>
								<p class="mb-1 text-sm font-medium text-gray-800">{enPlaces.x2.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x2.description}</p>
							</div>
						{/if}

						{#if selectedSchema.places?.x3 && enPlaces.x3}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x3</h3>
								</div>
								<p class="mb-1 text-sm font-medium text-gray-800">{enPlaces.x3.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x3.description}</p>
							</div>
						{/if}

						{#if selectedSchema.places?.x4 && enPlaces.x4}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x4</h3>
								</div>
								<p class="mb-1 text-sm font-medium text-gray-800">{enPlaces.x4.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x4.description}</p>
							</div>
						{/if}

						{#if selectedSchema.places?.x5 && enPlaces.x5}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x5</h3>
								</div>
								<p class="mb-1 text-sm font-medium text-gray-800">{enPlaces.x5.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x5.description}</p>
							</div>
						{/if}
					{:else}
						<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
							<p class="mb-1 text-sm text-gray-600">
								No English translations available for places.
							</p>
						</div>
					{/if}
				</div>

				<!-- FIX: Update access to translations prompt -->
				{#if selectedSchema.translations?.en?.prompt}
					<h2 class="mt-6 mb-3 text-xl font-semibold text-gray-700">Prompt (English)</h2>
					<div class="mb-6 rounded border border-gray-300 bg-white p-4 shadow-sm">
						<p class="text-sm whitespace-pre-wrap text-gray-600">
							{selectedSchema.translations.en.prompt}
						</p>
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">
					Select a schema from the list to view details. {selectedSchemaId
						? `(Selected ID: ${selectedSchemaId})`
						: ''}
				</p>
			</div>
		{/if}
	</main>

	<!-- Right Column (Debug JSON View) -->
	<aside class="col-span-1 flex flex-col overflow-y-auto bg-gray-50 p-6">
		<!-- FIX: Change title -->
		<h2 class="mb-4 flex-shrink-0 text-xl font-semibold text-gray-700">JSON</h2>

		{#if currentSelectedSchema}
			<!-- FIX: Remove <details> wrapper, make <pre> scroll directly -->
			<div class="flex-1 overflow-auto rounded border border-gray-300 bg-white p-3">
				<!-- Make div scrollable -->
				<pre class="font-mono text-xs text-gray-700">{JSON.stringify(
						currentSelectedSchema,
						null,
						2
					)}</pre>
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-center text-sm text-gray-500">Select a schema to view its JSON data.</p>
			</div>
		{/if}
	</aside>
</div>
