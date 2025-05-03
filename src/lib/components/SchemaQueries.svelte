<script lang="ts">
	import { getContext } from 'svelte';
	import type { SchemaLanguageTranslation } from '$db/seeding/schema.data';
	import { writable } from 'svelte/store';

	// Import types from facade
	import type { LoroHqlQueryExtended, QueryResult } from '$lib/KERNEL/hominio-svelte';

	// --- Get Hominio Facade from Context ---
	const o = getContext<typeof import('$lib/KERNEL/hominio-svelte').o>('o');

	// FIX: Rename type and update fields to match expected select output
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

	// --- Component State ---
	let selectedSchemaId = $state<string | null>(null);
	let currentSelectedSchema = $state<SchemaQueryResult | null>(null);

	// --- HQL Query Definition ---
	const allSchemaQueryDefinition: LoroHqlQueryExtended = {
		steps: [
			{
				action: 'iterateIndex',
				indexName: 'schemas', // Iterate the @index/schemas map
				variables: {
					key: 'schemaNameVar', // Output variable for the key (schema name)
					value: 'schemaPubKeyVar' // Output variable for the value (pubkey)
				},
				resultVariable: 'schemaIndexItems' // Store the array of {schemaNameVar, schemaPubKeyVar}
			},
			{
				action: 'get',
				from: {
					variable: 'schemaIndexItems', // Use the result from the previous step
					sourceKey: 'schemaPubKeyVar', // Specify which variable in the items holds the pubkey
					targetDocType: 'Schema' // Specify the type of document to fetch
				},
				fields: {
					id: { field: 'doc.pubkey' },
					name: { field: 'self.data.name' },
					places: { field: 'self.data.places' },
					translations: { field: 'self.data.translations' }
				},
				resultVariable: 'schemaDetails'
			},
			{
				action: 'select',
				groupBy: 'id', // Group by the fetched document ID (pubkey)
				select: {
					id: { variable: 'id' }, // Select the ID from the flattened context
					name: { variable: 'name' },
					places: { variable: 'places' },
					translations: { variable: 'translations' }
				}
			}
		]
	};

	// Create a writable store for the query definition
	const schemaQueryDefStore = writable<LoroHqlQueryExtended | null>(allSchemaQueryDefinition);

	// --- Reactive HQL Query Execution ---
	// Use o.subscribe and remove getMe argument
	const schemaReadable = o.subscribe(schemaQueryDefStore);

	// --- Event Handlers and Helpers ---
	function selectSchema(id: string) {
		console.log('Selecting schema with id:', id);
		selectedSchemaId = id;

		// FIX: Use the reactive schemaReadable store's current value
		const currentSchemaList = $schemaReadable; // Access Svelte 5 rune value

		if (currentSchemaList) {
			// FIX: Explicitly type item in find callback
			const found = currentSchemaList.find(
				(
					item: QueryResult
				): item is SchemaQueryResult => // Explicit type
					typeof item === 'object' && item !== null && (item as SchemaQueryResult).id === id
			);
			if (found) {
				console.log('Found schema directly:', found.name);
				currentSelectedSchema = found;
			} else {
				console.warn('Schema not found with ID:', id);
				currentSelectedSchema = null;
			}
		} else {
			console.warn('Schema list not yet loaded (schemaReadable is null/undefined).');
			currentSelectedSchema = null;
		}
	}

	// State for prenu creation (remains the same for now, assuming @schema/prenu ID is stable)
	let creationMessage = '';

	// --- REMOVED State for manual fetching ---
	// --- REMOVED Fetch Schema Index Key and Schemas ---
</script>

<!-- FIX: Adjust grid columns for 3 columns: Sidebar, Main Content, Debug Aside - make right wider -->
<div class="grid h-full grid-cols-1 bg-[#f8f4ed] md:grid-cols-[250px_1.75fr_1.25fr]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-200 p-4">
		<h2 class="mb-4 text-lg font-semibold text-[#0a2a4e]">Schemas</h2>
		<!-- FIX: Use reactive store $schemaReadable -->
		{#if $schemaReadable === undefined}
			<p class="text-sm text-gray-500">Loading schemas...</p>
		{:else if $schemaReadable === null}
			<p class="text-sm text-red-600">Error loading schemas.</p>
		{:else if $schemaReadable.length === 0}
			<p class="text-sm text-yellow-700">No schemas found.</p>
		{:else}
			{@const schemaList = $schemaReadable}
			<!-- Assign to local const for clarity -->
			<ul class="space-y-1">
				{#each schemaList as schema (schema.id)}
					<li>
						<button
							class="w-full rounded px-3 py-2 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-[#e0d8cb] {selectedSchemaId ===
							(schema as SchemaQueryResult).id
								? 'bg-[#0a2a4e] font-medium text-[#f8f4ed]'
								: 'text-[#0a2a4e]'}"
							on:click={() => selectSchema((schema as SchemaQueryResult).id)}
						>
							<!-- Display schema name, fall back to ID if name is missing -->
							{(schema as SchemaQueryResult).name ?? (schema as SchemaQueryResult).id}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area (Middle Column) -->
	<main class="col-span-1 flex flex-col overflow-y-auto border-r border-gray-200 p-6">
		<!-- FIX: Update selected variable -->
		{#if currentSelectedSchema}
			{@const selectedSchema = currentSelectedSchema}

			<div class="flex-shrink-0 pb-6">
				<div class="flex items-center justify-between">
					<h1 class="text-2xl font-bold text-[#0a2a4e]">
						{selectedSchema.name ?? 'Schema Details'}
						<!-- Fallback title -->
					</h1>
				</div>
				<p class="mb-3 text-sm text-gray-500">
					<code class="rounded bg-[#e0d8cb] px-1 text-xs text-[#0a2a4e]">{selectedSchema.id}</code>
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
					<div class="mb-4 rounded-md bg-blue-100 p-4 text-sm text-blue-800">
						<p>{creationMessage}</p>
					</div>
				{/if}

				<h2 class="mb-3 text-xl font-semibold text-[#0a2a4e]">Arguments</h2>
				<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<!-- FIX: Update access to translations and places -->
					{#if selectedSchema.translations?.en?.places}
						{@const enPlaces = selectedSchema.translations.en.places}
						{#if selectedSchema.places?.x1 && enPlaces.x1}
							<div class="rounded border border-gray-300 bg-white p-4 text-[#0a2a4e] shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-[#0a2a4e]">x1</h3>
								</div>
								<p class="mb-1 text-sm font-medium">{enPlaces.x1.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x1.description}</p>
							</div>
						{/if}

						{#if selectedSchema.places?.x2 && enPlaces.x2}
							<div class="rounded border border-gray-300 bg-white p-4 text-[#0a2a4e] shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-[#0a2a4e]">x2</h3>
								</div>
								<p class="mb-1 text-sm font-medium">{enPlaces.x2.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x2.description}</p>
							</div>
						{/if}

						{#if selectedSchema.places?.x3 && enPlaces.x3}
							<div class="rounded border border-gray-300 bg-white p-4 text-[#0a2a4e] shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-[#0a2a4e]">x3</h3>
								</div>
								<p class="mb-1 text-sm font-medium">{enPlaces.x3.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x3.description}</p>
							</div>
						{/if}

						{#if selectedSchema.places?.x4 && enPlaces.x4}
							<div class="rounded border border-gray-300 bg-white p-4 text-[#0a2a4e] shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-[#0a2a4e]">x4</h3>
								</div>
								<p class="mb-1 text-sm font-medium">{enPlaces.x4.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x4.description}</p>
							</div>
						{/if}

						{#if selectedSchema.places?.x5 && enPlaces.x5}
							<div class="rounded border border-gray-300 bg-white p-4 text-[#0a2a4e] shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-[#0a2a4e]">x5</h3>
								</div>
								<p class="mb-1 text-sm font-medium">{enPlaces.x5.title}</p>
								<p class="text-xs text-gray-600">{enPlaces.x5.description}</p>
							</div>
						{/if}
					{:else}
						<div class="rounded border border-gray-300 bg-white p-4 text-[#0a2a4e] shadow-sm">
							<p class="mb-1 text-sm text-gray-600">
								No English translations available for places.
							</p>
						</div>
					{/if}
				</div>

				<!-- FIX: Update access to translations prompt -->
				{#if selectedSchema.translations?.en?.prompt}
					<h2 class="mt-6 mb-3 text-xl font-semibold text-[#0a2a4e]">Prompt (English)</h2>
					<div class="mb-6 rounded border border-gray-300 bg-white p-4 shadow-sm">
						<p class="text-sm whitespace-pre-wrap text-gray-700">
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
	<aside class="col-span-1 flex flex-col overflow-y-auto bg-[#f5f1e8] p-6">
		<!-- FIX: Change title -->
		<h2 class="mb-4 flex-shrink-0 text-xl font-semibold text-[#0a2a4e]">JSON</h2>

		{#if currentSelectedSchema}
			<!-- FIX: Remove <details> wrapper, make <pre> scroll directly -->
			<div class="flex-1 overflow-auto rounded border border-gray-300 bg-white p-3">
				<!-- Make div scrollable -->
				<pre class="font-mono text-xs text-[#0a2a4e]">{JSON.stringify(
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
