<script lang="ts">
	import {
		processReactiveQuery,
		type LoroHqlQuery,
		type QueryResult
	} from '$lib/KERNEL/hominio-query';
	import { readable, type Readable, derived, writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import { hominioMutate } from '$lib/KERNEL/hominio-mutate';

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
							value: { field: 'self.datni.vasru' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x2: {
					resolve: {
						fromField: 'self.datni.sumti.x2',
						map: {
							value: { field: 'self.datni.vasru' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x3: {
					resolve: {
						fromField: 'self.datni.sumti.x3',
						map: {
							value: { field: 'self.datni.vasru' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x4: {
					resolve: {
						fromField: 'self.datni.sumti.x4',
						map: {
							value: { field: 'self.datni.vasru' },
							pubkey: { field: 'doc.pubkey' }
						}
					}
				},
				x5: {
					resolve: {
						fromField: 'self.datni.sumti.x5',
						map: {
							value: { field: 'self.datni.vasru' },
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

	// State for prenu creation
	let isCreatingPrenu = false;
	let creationMessage = '';

	// Function to create a random person with a generated name
	async function createRandomPrenu() {
		isCreatingPrenu = true;
		creationMessage = '';

		try {
			// Get current user
			const currentUser = getMe();
			if (!currentUser) {
				throw new Error('User not authenticated');
			}

			// Generate a random name
			const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Heidi'];
			const randomName =
				names[Math.floor(Math.random() * names.length)] + ' ' + Math.floor(Math.random() * 1000);

			// Use the mutation service to create a person with a name
			const result = await hominioMutate.createPrenuWithName(randomName, currentUser);

			if (result.success) {
				creationMessage = `Successfully created person: "${randomName}" with ID: ${result.prenuId}`;
				console.log('Created person:', result);
			} else {
				throw new Error('Failed to create person');
			}
		} catch (error) {
			console.error('Error creating random person:', error);
			creationMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
		} finally {
			isCreatingPrenu = false;
		}
	}
</script>

<div class="grid h-full grid-cols-1 md:grid-cols-[250px_1fr_1fr]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-300 bg-white p-4">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Schemas</h2>
		{#if $selbriReadable === undefined}
			<p class="text-sm text-gray-500">Loading schemas...</p>
		{:else if $selbriReadable === null}
			<p class="text-sm text-red-600">Error loading schemas.</p>
		{:else if $selbriReadable.length === 0}
			<p class="text-sm text-yellow-700">No schemas found.</p>
		{:else}
			<ul class="space-y-2">
				{#each $selbriReadable as selbri (selbri.id)}
					<li>
						<button
							class="w-full rounded px-3 py-2 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-gray-200 {selectedSelbriId ===
							selbri.id
								? 'bg-indigo-100 font-medium text-indigo-700'
								: 'text-gray-600'}"
							on:click={() => selectSelbri(selbri.id)}
						>
							{selbri.name}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Main Content Area (Middle Column) -->
	<main class="col-span-1 flex flex-col overflow-y-auto border-r border-gray-300 p-6">
		{#if currentSelectedSelbri}
			{@const selectedSelbri = currentSelectedSelbri}

			<div class="flex-shrink-0 pb-6">
				<div class="flex items-center justify-between">
					<h1 class="text-2xl font-bold text-gray-800">
						{selectedSelbri.name}
					</h1>

					<!-- Add Create Prenu Button -->
					{#if selectedSelbri.id === '0x687dba1d3d67122c33b082ac9ea4be59a85cedd3d3e3bf6ea15f475cb670a475'}
						<button
							on:click={createRandomPrenu}
							disabled={isCreatingPrenu}
							class="rounded bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if isCreatingPrenu}
								Creating...
							{:else}
								Create Random Person
							{/if}
						</button>
					{/if}
				</div>
				<p class="mb-3 text-sm text-gray-500">
					<code class="rounded bg-gray-200 px-1 text-xs">{selectedSelbri.id}</code>
				</p>

				<!-- Creation Message -->
				{#if creationMessage}
					<div class="mb-4 rounded-md bg-blue-50 p-4 text-sm">
						<p class="text-blue-700">{creationMessage}</p>
					</div>
				{/if}

				<h2 class="mb-3 text-xl font-semibold text-gray-700">Arguments</h2>
				<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#if selectedSelbri.translations?.glico}
						{#if selectedSelbri.x1 && selectedSelbri.translations.glico.x1}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x1</h3>
								</div>
								<p class="mb-3 text-sm text-gray-600">{selectedSelbri.translations.glico.x1}</p>
							</div>
						{/if}

						{#if selectedSelbri.x2 && selectedSelbri.translations.glico.x2}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x2</h3>
								</div>
								<p class="mb-3 text-sm text-gray-600">{selectedSelbri.translations.glico.x2}</p>
							</div>
						{/if}

						{#if selectedSelbri.x3 && selectedSelbri.translations.glico.x3}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x3</h3>
								</div>
								<p class="mb-3 text-sm text-gray-600">{selectedSelbri.translations.glico.x3}</p>
							</div>
						{/if}

						{#if selectedSelbri.x4 && selectedSelbri.translations.glico.x4}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x4</h3>
								</div>
								<p class="mb-3 text-sm text-gray-600">{selectedSelbri.translations.glico.x4}</p>
							</div>
						{/if}

						{#if selectedSelbri.x5 && selectedSelbri.translations.glico.x5}
							<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
								<div class="mb-2">
									<h3 class="font-mono text-lg font-bold text-indigo-600">x5</h3>
								</div>
								<p class="mb-3 text-sm text-gray-600">{selectedSelbri.translations.glico.x5}</p>
							</div>
						{/if}
					{:else}
						<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
							<p class="mb-1 text-sm text-gray-600">No English translations available.</p>
						</div>
					{/if}
				</div>

				{#if selectedSelbri.prompts && selectedSelbri.prompts.glico}
					<h2 class="mt-6 mb-3 text-xl font-semibold text-gray-700">Prompts</h2>
					<div class="mb-6 rounded border border-gray-300 bg-white p-4 shadow-sm">
						<p class="text-sm whitespace-pre-wrap text-gray-600">{selectedSelbri.prompts.glico}</p>
					</div>
				{/if}
			</div>

			<!-- Debug Display -->
			<div class="mt-6 border-t border-gray-300 pt-6">
				<details class="rounded border border-gray-300 bg-white">
					<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
						>Schema Debug Data</summary
					>
					<div class="border-t border-gray-300 p-3">
						<pre
							class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(
								selectedSelbri,
								null,
								2
							)}</pre>
					</div>
				</details>
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">
					Select a schema from the list to view details. {selectedSelbriId
						? `(Selected ID: ${selectedSelbriId})`
						: ''}
				</p>
			</div>
		{/if}
	</main>

	<!-- Right Column (Relationships list) -->
	<aside class="col-span-1 flex flex-col overflow-y-auto bg-white p-6">
		<h2 class="mb-4 flex-shrink-0 text-xl font-semibold text-gray-700">
			Relationships using this Schema
		</h2>

		{#if !currentSelectedSelbri}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">Select a schema to view its relationships</p>
			</div>
		{:else if $bridiReadable === undefined}
			<div class="flex items-center justify-center py-6">
				<p class="text-sm text-gray-500">Loading relationships...</p>
			</div>
		{:else if $bridiReadable === null}
			<div class="rounded border border-red-200 bg-red-50 p-4 text-red-700">
				<p class="text-sm">Error loading relationships</p>
			</div>
		{:else if $bridiReadable.length === 0}
			<div class="rounded border border-yellow-200 bg-yellow-50 p-4">
				<p class="text-sm text-yellow-700">No relationships found for this schema</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each $bridiReadable as bridi (bridi.id)}
					<div class="rounded border border-blue-100 bg-blue-50 p-4 shadow-sm">
						<div class="mb-2 flex items-center justify-between">
							<h3 class="font-medium text-blue-800">{truncate(bridi.id, 16)}</h3>
						</div>
						<div class="space-y-2">
							{#if bridi.x1}
								<div class="flex">
									<span class="mr-2 font-mono text-sm font-bold text-indigo-600">x1:</span>
									<span class="text-sm text-gray-700">
										{typeof bridi.x1.value === 'string'
											? bridi.x1.value
											: truncate(bridi.x1.pubkey, 10)}
									</span>
								</div>
							{/if}
							{#if bridi.x2}
								<div class="flex">
									<span class="mr-2 font-mono text-sm font-bold text-indigo-600">x2:</span>
									<span class="text-sm text-gray-700">
										{typeof bridi.x2.value === 'string'
											? bridi.x2.value
											: truncate(bridi.x2.pubkey, 10)}
									</span>
								</div>
							{/if}
							{#if bridi.x3}
								<div class="flex">
									<span class="mr-2 font-mono text-sm font-bold text-indigo-600">x3:</span>
									<span class="text-sm text-gray-700">
										{typeof bridi.x3.value === 'string'
											? bridi.x3.value
											: truncate(bridi.x3.pubkey, 10)}
									</span>
								</div>
							{/if}
							{#if bridi.x4}
								<div class="flex">
									<span class="mr-2 font-mono text-sm font-bold text-indigo-600">x4:</span>
									<span class="text-sm text-gray-700">
										{typeof bridi.x4.value === 'string'
											? bridi.x4.value
											: truncate(bridi.x4.pubkey, 10)}
									</span>
								</div>
							{/if}
							{#if bridi.x5}
								<div class="flex">
									<span class="mr-2 font-mono text-sm font-bold text-indigo-600">x5:</span>
									<span class="text-sm text-gray-700">
										{typeof bridi.x5.value === 'string'
											? bridi.x5.value
											: truncate(bridi.x5.pubkey, 10)}
									</span>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</aside>
</div>
