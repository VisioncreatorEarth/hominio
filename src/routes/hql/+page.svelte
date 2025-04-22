<script lang="ts">
	import {
		hql,
		type HqlQueryRequest,
		type HqlQueryResult,
		type HqlMutationRequest
	} from '$lib/KERNEL/hominio-ql';
	import { readable, type Readable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import SyncStatusUI from '$lib/components/SyncStatusUI.svelte';

	// Define the specific Prenu schema pubkey
	const PRENU_SCHEMA_PUBKEY = '0xfdd157564621e5bd35bc9276e6dfae3eb5b60076b0d0d20559ac588121be9cf7';

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// Schemas -> Selbri
	const allSelbriQuery: HqlQueryRequest = {
		// Renamed from allSchemasQuery
		operation: 'query',
		filter: {
			// Updated filter: Find documents where gismu is 'selbri'
			meta: { gismu: 'selbri' }
		}
	};
	// Get current user BEFORE creating reactive query
	const selbriReadable: Readable<HqlQueryResult | null | undefined> = hql.processReactive(
		// Renamed from schemasReadable
		getMe,
		allSelbriQuery // Use renamed query variable
	);

	// Selected Schema State -> Selected Selbri State
	let selectedSelbriPubKey = $state<string | null>(null); // Renamed from selectedSchemaPubKey
	// Selected Entity State -> Selected Bridi State
	let selectedBridiPubKey = $state<string | null>(null); // Renamed from selectedEntityPubKey

	// Entities of Selected Schema -> Bridi of Selected Selbri
	let bridiReadable = $state(readable<HqlQueryResult | null | undefined>(undefined)); // Renamed from entitiesReadable

	// Effect to update the entity query when selected schema changes -> bridi query / selbri changes
	$effect(() => {
		const currentPubKey = selectedSelbriPubKey; // Use renamed state variable
		if (currentPubKey) {
			const bridiQuery: HqlQueryRequest = {
				// Renamed from entityQuery
				operation: 'query',
				filter: {
					// Updated filter: Find bridi using the selected selbri
					meta: { gismu: 'bridi' }, // Ensure it's a bridi
					data: { selbri: `@${currentPubKey}` } // Ensure it references the selected selbri
				}
			};
			// Get current user BEFORE creating reactive query
			// Get the new readable store for entities and assign it to the state variable
			bridiReadable = hql.processReactive(getMe, bridiQuery); // Use renamed state variable
			selectedBridiPubKey = null; // <-- Reset selected bridi when selbri changes
		} else {
			// If no selbri selected, reset to an empty/loading state
			bridiReadable = readable(undefined); // Use renamed state variable
			selectedBridiPubKey = null; // <-- Reset selected bridi when selbri changes
		}
	});

	// Helper function to format validation rules (updated for simplified type)
	function formatValidation(validation: any): string {
		if (!validation || !validation.type) return 'any (no rule)'; // Handle missing validation or type

		const type = validation.type as string;

		if (type.startsWith('@')) {
			// Extract selbri name after '@'
			const selbriName = type.substring(1);
			return `Ref: ${selbriName}`;
		} else if (type === 'text' || type === 'list' || type === 'map') {
			return `Type: ${type}`;
		} else {
			// Fallback for potentially other simple types or unknowns
			return `Type: ${type}`;
		}
	}

	// --- Prenu Creation ---
	const samplePrenuNames = [
		'Alice',
		'Bob',
		'Charlie',
		'Diana',
		'Ethan',
		'Fiona',
		'George',
		'Hannah',
		'Ian',
		'Julia'
	];
	let isCreatingPrenu = $state(false);

	async function createPrenu() {
		if (isCreatingPrenu) return;
		isCreatingPrenu = true;
		try {
			const randomName = samplePrenuNames[Math.floor(Math.random() * samplePrenuNames.length)];
			// Find the prenu selbri document
			const prenuSelbri = $selbriReadable?.find((s) => (s.meta as any)?.cmene === 'prenu'); // Use renamed readable

			// --- ADD GUARD --- Check if prenuSelbri was found
			if (!prenuSelbri) {
				console.error(
					'[Action] Create Prenu Error: Prenu selbri definition not found in $selbriReadable.',
					$selbriReadable
				);
				// Optionally set an error state for the UI
				isCreatingPrenu = false;
				return;
			}

			// Check PubKey (This check might be redundant if find is reliable, but keep for now)
			if (prenuSelbri.pubKey !== PRENU_SCHEMA_PUBKEY) {
				console.error(
					'[Action] Create Prenu Error: Prenu selbri PubKey mismatch! Expected:',
					PRENU_SCHEMA_PUBKEY,
					'Found:',
					prenuSelbri.pubKey
				);
				isCreatingPrenu = false;
				return;
			}

			const prenuSelbriRef = '@' + prenuSelbri.pubKey;

			const mutation: HqlMutationRequest = {
				operation: 'mutate',
				action: 'create',
				selbri: prenuSelbriRef, // Renamed from schema
				sumti: {
					// Renamed from places
					x1: randomName
				}
			};

			// Get current user before processing mutation
			const currentUser = getMe();
			const result = await hql.process(currentUser, mutation);
			console.log('[Action] Create Prenu Result:', result);
		} catch (err) {
			console.error('[Action] Error creating Prenu:', err);
		} finally {
			isCreatingPrenu = false;
		}
	}

	// --- Prenu Name Update ---
	let currentlyUpdatingPrenu = $state<string | null>(null);

	async function updatePrenuName(entityPubKey: string) {
		if (currentlyUpdatingPrenu) return; // Prevent concurrent updates
		currentlyUpdatingPrenu = entityPubKey;
		try {
			const randomName = samplePrenuNames[Math.floor(Math.random() * samplePrenuNames.length)];

			const mutation: HqlMutationRequest = {
				operation: 'mutate',
				action: 'update',
				pubKey: entityPubKey, // Use pubKey directly for update actions
				sumti: {
					// Renamed from places
					x1: randomName // Update the name field
				}
			};

			// Get current user before processing mutation
			const currentUser = getMe();
			const result = await hql.process(currentUser, mutation);
		} catch (err) {
			console.error(`[Action] Error updating Prenu ${entityPubKey} name:`, err);
		} finally {
			currentlyUpdatingPrenu = null;
		}
	}
</script>

<div class="grid h-screen grid-cols-1 bg-gray-100 md:grid-cols-[250px_3fr_2fr]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-300 bg-white p-4">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Selbri (Schemas)</h2>
		<!-- Updated Title -->
		{#if $selbriReadable === undefined}
			<!-- Use renamed readable -->
			<p class="text-sm text-gray-500">Loading selbri...</p>
		{:else if $selbriReadable === null}
			<p class="text-sm text-red-600">Error loading selbri.</p>
		{:else if $selbriReadable.length === 0}
			<p class="text-sm text-yellow-700">No selbri found.</p>
		{:else}
			<ul class="space-y-2">
				{#each $selbriReadable as selbri (selbri.pubKey)}
					<!-- Use renamed readable and loop variable -->
					{@const selbriMeta = selbri.meta as Record<string, any> | undefined}
					<!-- Use renamed loop variable -->
					<li>
						<button
							class="w-full rounded px-3 py-2 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-gray-200 {selectedSelbriPubKey ===
							selbri.pubKey
								? 'bg-indigo-100 font-medium text-indigo-700'
								: 'text-gray-600'}"
							on:click={() => (selectedSelbriPubKey = selbri.pubKey)}
						>
							{selbriMeta?.cmene ?? 'Unnamed Selbri'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<!-- Use the new component -->
		<SyncStatusUI />
	</aside>

	<!-- Main Content Area (Middle Column) -->
	<main class="col-span-1 flex flex-col overflow-y-auto border-r border-gray-300 p-6">
		{#if selectedSelbriPubKey && $selbriReadable}
			<!-- Use renamed state and readable -->
			{@const selectedSelbri = $selbriReadable.find((s) => s.pubKey === selectedSelbriPubKey)}
			<!-- Use renamed variables -->
			{#if selectedSelbri}
				{@const selectedMetaData = selectedSelbri.meta as Record<string, any> | undefined}
				<!-- Use renamed variable -->
				{@const selectedData = selectedSelbri.data as Record<string, any> | undefined}
				<!-- Use renamed variable -->
				{@const sumti = selectedData?.sumti as Record<string, any> | undefined}
				<!-- Renamed from places -->
				{@const javni = selectedData?.javni as Record<string, any> | undefined}

				<div class="flex-shrink-0 pb-6">
					<div class="mb-4 flex items-center justify-between">
						<h1 class="text-2xl font-bold text-gray-800">
							{selectedMetaData?.cmene ?? 'Selbri Details'}
							<!-- Updated text -->
						</h1>
						{#if selectedMetaData?.cmene === 'prenu'}
							<button
								class="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
								on:click={createPrenu}
								disabled={isCreatingPrenu}
							>
								{isCreatingPrenu ? 'Creating...' : 'Add Random Prenu'}
							</button>
						{/if}
					</div>
					<p class="mb-1 text-sm text-gray-500">
						PubKey: <code class="rounded bg-gray-200 px-1 text-xs">{selectedSelbri.pubKey}</code>
						<!-- Use renamed variable -->
					</p>
					<p class="mb-4 text-sm text-gray-500">
						Gismu: <code class="rounded bg-gray-200 px-1 text-xs"
							>{selectedMetaData?.gismu ?? 'N/A'}</code
						>
						<!-- Updated label -->
					</p>

					<h2 class="mb-3 text-xl font-semibold text-gray-700">Sumti Descriptions</h2>
					<!-- Updated Title -->
					{#if sumti && Object.keys(sumti).length > 0}
						<!-- Use renamed variable -->
						<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each Object.entries(sumti) as [key, placeDesc] (key)}
								<!-- Use renamed variable -->
								<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
									<div class="mb-2 flex items-center justify-between">
										<h3 class="font-mono text-lg font-bold text-indigo-600">{key}</h3>
										<!-- {#if placeDef.required} Removed required check here -->
										<!-- <span
												class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
												>Required</span
											>
										{/if} -->
									</div>
									<p class="mb-3 text-sm text-gray-600">
										{placeDesc.description ?? 'No description'}
									</p>
									<!-- REMOVED Validation display block from here -->
								</div>
							{/each}
						</div>
					{:else}
						<p class="mb-6 text-sm text-gray-500">No sumti descriptions defined for this selbri.</p>
					{/if}

					<!-- ADDED: Display Javni (Validation Rules) -->
					<h2 class="mb-3 text-xl font-semibold text-gray-700">Javni (Validation Rules)</h2>
					{#if javni && Object.keys(javni).length > 0}
						<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each Object.entries(javni) as [key, ruleDef] (key)}
								<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
									<div class="mb-2 flex items-center justify-between">
										<h3 class="font-mono text-lg font-bold text-indigo-600">{key}</h3>
										{#if ruleDef.required}
											<span
												class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
												>Required</span
											>
										{/if}
									</div>
									<div class="rounded bg-gray-50 p-2">
										<p class="text-xs font-medium text-gray-500">Rule:</p>
										<p class="text-xs break-words whitespace-pre-wrap text-gray-700">
											<code class="text-xs">{formatValidation(ruleDef)}</code>
										</p>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="mb-6 text-sm text-gray-500">
							No javni (validation rules) defined for this selbri.
						</p>
					{/if}
				</div>

				<!-- Entities List Section - MOVED TO RIGHT SIDEBAR -->
				<div class="mt-6 border-t border-gray-300 pt-6">
					<details class="rounded border border-gray-300 bg-white">
						<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
							>Selbri JSON: {selectedMetaData?.cmene ?? selectedSelbri.pubKey}</summary
						>
						<!-- Updated text -->
						<div class="border-t border-gray-300 p-3">
							<pre
								class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(
									selectedSelbri, // Use renamed variable
									null,
									2
								)}</pre>
						</div>
					</details>
				</div>
			{:else}
				<p class="text-red-600">Error: Selected selbri not found in the list.</p>
				<!-- Updated text -->
			{/if}
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">Select a selbri from the list to view details.</p>
				<!-- Updated text -->
			</div>
		{/if}
	</main>

	<!-- Right Sidebar (Restored) -->
	<aside class="col-span-1 flex flex-col overflow-y-auto bg-white p-6">
		<h2 class="mb-4 flex-shrink-0 text-xl font-semibold text-gray-700">
			Bridi using this Selbri <!-- Updated Title -->
		</h2>
		{#if selectedSelbriPubKey}
			<!-- Use renamed state -->
			<!-- Use $entitiesReadable directly -->
			<div class="flex-grow overflow-y-auto">
				{#if $bridiReadable === undefined}
					<!-- Use renamed readable -->
					<p class="text-sm text-gray-500">Loading bridi...</p>
				{:else if $bridiReadable === null}
					<p class="text-sm text-red-600">Error loading bridi.</p>
				{:else if $bridiReadable.length === 0}
					<p class="text-sm text-yellow-700">No bridi found using this selbri.</p>
					<!-- Updated text -->
				{:else}
					<ul class="divide-y divide-gray-200">
						{#each $bridiReadable as bridi (bridi.pubKey)}
							<!-- Use renamed readable and loop variable -->
							{@const bridiMeta = bridi.meta as Record<string, any> | undefined}
							<!-- Use renamed loop variable -->
							{@const bridiData = bridi.data as Record<string, any> | undefined}
							<!-- Use renamed loop variable -->
							{@const bridiSelbriRef = bridiData?.selbri as string | undefined}
							<!-- Get selbri ref -->
							{@const bridiSumti = bridiData?.sumti as Record<string, any> | undefined}
							<!-- Get sumti -->
							<li class="py-3">
								<div class="flex items-start justify-between space-x-2">
									<!-- Entity Info & Selection Button -->
									<button
										class="flex-grow cursor-pointer rounded-l px-3 py-1 text-left transition-colors hover:bg-gray-100 {selectedBridiPubKey ===
										bridi.pubKey
											? 'bg-blue-50'
											: ''}"
										on:click={() => (selectedBridiPubKey = bridi.pubKey)}
									>
										<!-- Name and Edit Button Container -->
										<div class="flex items-center space-x-2">
											<p class="font-medium text-gray-800">
												{#if bridiSelbriRef === `@${PRENU_SCHEMA_PUBKEY}`}
													<!-- Check against specific prenu pubkey -->
													{bridiSumti?.x1 ?? 'Unnamed Prenu'}
													<!-- Use sumti.x1 for name -->
												{:else}
													{bridiMeta?.cmene ?? 'Unnamed Bridi'}
												{/if}
											</p>
											<!-- Edit Button (Inline) -->
											{#if bridiSelbriRef === `@${PRENU_SCHEMA_PUBKEY}`}
												{@const isUpdatingThis = currentlyUpdatingPrenu === bridi.pubKey}
												<!-- Remove the wrapping div, button goes directly here -->
												<button
													type="button"
													class="flex-shrink-0 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
													on:click|stopPropagation={() => updatePrenuName(bridi.pubKey)}
													disabled={currentlyUpdatingPrenu !== null}
												>
													{isUpdatingThis ? '...' : 'Update'}
												</button>
											{/if}
										</div>

										<p class="mt-1 text-xs text-gray-500">
											PubKey: <code class="truncate text-xs">{bridi.pubKey}</code>
										</p>
										<!-- Display Place Values -->
										<div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
											{#each Object.entries(bridiSumti ?? {}).sort( ([keyA], [keyB]) => keyA.localeCompare(keyB) ) as [sumtiKey, sumtiValue] (sumtiKey)}
												<!-- Use sumti variable -->
												<div class="flex items-baseline">
													<span class="mr-1 font-mono font-medium text-indigo-600">{sumtiKey}:</span
													>
													{#if typeof sumtiValue === 'string' && sumtiValue.startsWith('@')}
														<code class="truncate text-blue-700">{sumtiValue}</code>
													{:else if typeof sumtiValue === 'object' && sumtiValue !== null && (sumtiValue as any).pubKey}
														{@const resolvedName =
															(sumtiValue as any)?.data?.sumti?.x1 ?? // Check resolved sumti.x1 first
															(sumtiValue as any)?.meta?.cmene ?? // Then resolved meta.cmene
															(sumtiValue as any).pubKey} // Fallback to pubkey
														<span class="ml-1 truncate font-medium text-purple-700"
															>[Ref: {resolvedName}]</span
														>
													{:else}
														<span class="truncate text-gray-800">{JSON.stringify(sumtiValue)}</span>
													{/if}
												</div>
											{/each}
										</div>
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">Select a selbri to view bridi.</p>
				<!-- Updated text -->
			</div>
		{/if}
	</aside>
</div>
