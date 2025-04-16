<script lang="ts">
	import {
		hominioQLService,
		type HqlQueryRequest,
		type HqlMutationRequest,
		type ResolvedHqlDocument,
		type HqlQueryResult
	} from '$lib/KERNEL/hominio-ql';
	import { authClient } from '$lib/client/auth-hominio';
	import type { CapabilityUser } from '$lib/KERNEL/hominio-capabilities';

	// Constants (Keep GENESIS_PUBKEY definition for schema query)
	const GENESIS_PUBKEY = `0x${'0'.repeat(64)}`;
	const GISMU_SCHEMA_REF = `@${GENESIS_PUBKEY}`;
	const PRENU_SCHEMA_PUBKEY = '0xfdd157564621e5bd35bc9276e6dfae3eb5b60076b0d0d20559ac588121be9cf7';
	const PRENU_SCHEMA_REF = `@${PRENU_SCHEMA_PUBKEY}`;

	// State variables for dedicated lists
	let schemasList = $state<ResolvedHqlDocument[]>([]);
	let entitiesList = $state<ResolvedHqlDocument[]>([]);
	let selectedSchema = $state<ResolvedHqlDocument | null>(null);

	let isLoadingSchemas = $state(false);
	let isLoadingEntities = $state(false);
	let error = $state<string | null>(null);
	let isCreating = $state(false);

	// Derived state for user
	const sessionStore = authClient.useSession();
	const sessionValue = $derived($sessionStore);
	const currentUser = $derived(sessionValue?.data?.user as CapabilityUser | null);

	// --- Data Loading Functions ---

	async function loadSchemas() {
		if (!currentUser) return;
		isLoadingSchemas = true;
		error = null;
		console.log('Loading schemas via HQL...');

		const queryRequest: HqlQueryRequest = {
			operation: 'query',
			filter: {
				// Find docs that are schemas (gismu or referencing gismu)
				$or: [{ meta: { schema: null } }, { meta: { schema: GISMU_SCHEMA_REF } }]
			}
		};

		try {
			const result = await hominioQLService.process(queryRequest, currentUser);
			if (Array.isArray(result)) {
				schemasList = result as HqlQueryResult;
				console.log(`Loaded ${schemasList.length} schemas.`);
			} else {
				throw new Error('Received unexpected data format while querying schemas.');
			}
		} catch (err) {
			console.error('Error loading schemas:', err);
			error = err instanceof Error ? err.message : 'Failed to load schemas.';
			schemasList = [];
		} finally {
			isLoadingSchemas = false;
		}
	}

	async function loadEntities(schemaPubKey: string) {
		if (!currentUser) return;
		isLoadingEntities = true;
		entitiesList = []; // Clear previous entities
		error = null;
		console.log(`Loading entities for schema @${schemaPubKey}...`);

		const queryRequest: HqlQueryRequest = {
			operation: 'query',
			from: { schema: `@${schemaPubKey}` } // Filter by selected schema
		};

		console.log('Sending HQL Request:', JSON.stringify(queryRequest, null, 2));

		try {
			const result = await hominioQLService.process(queryRequest, currentUser);

			console.log('Received HQL Result for entities:', JSON.stringify(result, null, 2));

			if (Array.isArray(result)) {
				entitiesList = result as HqlQueryResult;
				console.log(`Loaded ${entitiesList.length} entities for schema @${schemaPubKey}.`);
			} else {
				throw new Error('Received unexpected data format while querying entities.');
			}
		} catch (err) {
			console.error(`Error loading entities for ${schemaPubKey}:`, err);
			error =
				err instanceof Error ? err.message : `Failed to load entities for schema ${schemaPubKey}.`;
			entitiesList = [];
		} finally {
			isLoadingEntities = false;
		}
	}

	// --- Action Functions ---

	function selectSchema(schemaDoc: ResolvedHqlDocument | null) {
		selectedSchema = schemaDoc;
		entitiesList = []; // Clear entities when schema changes
		if (schemaDoc) {
			console.log('Selected schema:', schemaDoc.pubKey);
			loadEntities(schemaDoc.pubKey);
		} else {
			console.log('Deselected schema');
		}
	}

	async function createPrenuDoc() {
		if (!currentUser || !schemasList.some((s) => s.pubKey === PRENU_SCHEMA_PUBKEY)) {
			error = 'User not logged in or Prenu schema not found. Cannot create document.';
			if (!schemasList.some((s) => s.pubKey === PRENU_SCHEMA_PUBKEY)) {
				console.warn('Prenu schema pubkey not found in loaded schemasList');
			}
			return;
		}
		isCreating = true;
		error = null;
		console.log('Creating new prenu doc...');

		const mutationRequest: HqlMutationRequest = {
			operation: 'mutate',
			action: 'create',
			schema: PRENU_SCHEMA_REF,
			places: { x1: `New Person ${Date.now()}` }
		};

		try {
			await hominioQLService.process(mutationRequest, currentUser);
			console.log('Create prenu request processed.');
			// Refresh entities if prenu is the selected schema
			if (selectedSchema?.pubKey === PRENU_SCHEMA_PUBKEY) {
				await loadEntities(PRENU_SCHEMA_PUBKEY);
			} else {
				// Optionally, maybe refresh schemas if create could affect it? Unlikely here.
				// await loadSchemas();
				console.log('Prenu doc created, but not currently viewing Prenu schema.');
			}
		} catch (err) {
			console.error('Error creating prenu doc:', err);
			error = err instanceof Error ? err.message : 'Failed to create prenu document.';
		} finally {
			isCreating = false;
		}
	}

	// Effect Hook
	$effect(() => {
		if (currentUser) {
			console.log('User derived, loading initial schemas.');
			loadSchemas(); // Load schemas initially
			// Clear entities and selection if user changes?
			selectedSchema = null;
			entitiesList = [];
		} else {
			console.log('Waiting for user session (derived)...');
			schemasList = [];
			entitiesList = [];
			selectedSchema = null;
		}
	});
</script>

<!-- Add a wrapper to control background and text color for this specific page -->
<div class="min-h-screen bg-[#e7e1d7] text-gray-800">
	<div class="mx-auto max-w-7xl p-6 md:p-8">
		<h1 class="mb-6 text-3xl font-bold text-[#1a365d]">Hominio QL Explorer</h1>

		{#if !currentUser}
			<div class="rounded-md border border-orange-200 bg-orange-100 p-4 text-orange-700">
				Authenticating...
			</div>
		{:else if error}
			<div class="rounded-md border border-red-200 bg-red-100 p-4 text-red-700">
				Error loading data: {error}
			</div>
		{:else}
			<!-- Main Layout: Sidebar + Content -->
			<div class="flex flex-col gap-6 md:flex-row">
				<!-- Sidebar (Schemas List) -->
				<aside class="flex-shrink-0 md:w-64">
					<h2 class="mb-3 text-xl font-semibold text-[#1a365d]">Schemas</h2>
					{#if isLoadingSchemas}
						<div class="text-gray-500">Loading schemas...</div>
					{:else if schemasList.length === 0}
						<div class="text-gray-500">No schemas found.</div>
					{:else}
						<ul class="space-y-1">
							{#each schemasList as schema (schema.pubKey)}
								{@const isSelected = selectedSchema?.pubKey === schema.pubKey}
								<li>
									<button
										onclick={() => selectSchema(schema)}
										class="w-full rounded px-3 py-1.5 text-left text-sm transition-colors {isSelected
											? 'bg-[#1a365d] text-white'
											: 'text-gray-700 hover:bg-gray-200'}"
									>
										{(schema.meta as Record<string, unknown>)?.name ?? 'Unnamed Schema'}
									</button>
								</li>
							{/each}
						</ul>
					{/if}

					<!-- Add Create Prenu Button Here? -->
					<button
						class="mt-6 inline-flex w-full items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-[#e7e1d7] focus:outline-none disabled:pointer-events-none disabled:opacity-60"
						onclick={createPrenuDoc}
						disabled={isCreating ||
							!currentUser ||
							!schemasList.some((s) => s.pubKey === PRENU_SCHEMA_PUBKEY)}
						title="Create a new Prenu document (requires Prenu schema to exist)"
					>
						{#if isCreating}
							<svg
								class="mr-2 -ml-1 h-4 w-4 animate-spin text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								><circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle><path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path></svg
							>
							Creating...
						{:else}
							Create Prenu Doc
						{/if}
					</button>
				</aside>

				<!-- Main Content Area -->
				<main class="min-w-0 flex-1">
					{#if isLoadingSchemas && !selectedSchema}
						<div
							class="flex h-64 items-center justify-center rounded-md border border-gray-200 bg-gray-100 p-4 text-gray-500"
						>
							Loading Schemas...
						</div>
					{:else if !selectedSchema}
						<div
							class="flex h-64 items-center justify-center rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500"
						>
							Select a schema from the left sidebar to view its details and associated entities.
						</div>
					{:else}
						<!-- Define constants related to the selected schema -->
						{@const places = (selectedSchema.data as Record<string, unknown>)?.places as Record<
							string,
							{
								description: string;
								required: boolean;
								validation?: Record<string, unknown> | null;
							}
						>}
						{@const englishTranslation = (
							(selectedSchema.data as Record<string, unknown>)?.translations as
								| { lang: string; places: Record<string, string> }[]
								| undefined
						)?.find((t) => t.lang === 'en')}
						{@const placeOrder = ['x1', 'x2', 'x3', 'x4', 'x5']}

						<!-- Selected Schema Details -->
						<div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
							<h3 class="mb-2 text-lg font-semibold text-[#1a365d]">
								Schema: {(selectedSchema.meta as Record<string, unknown>)?.name ?? 'N/A'}
							</h3>
							<p class="mb-3 text-xs text-gray-500">PubKey: {selectedSchema.pubKey}</p>

							<!-- Styled Places Definition -->
							<h4 class="mb-2 text-sm font-medium text-gray-600">Places Definition:</h4>
							{#if places && Object.keys(places).length > 0}
								<!-- {@const placeOrder = ['x1', 'x2', 'x3', 'x4', 'x5']} <-- Moved up -->
								<div class="flex flex-wrap items-start gap-x-4 gap-y-2">
									{#each placeOrder as key}
										{#if places[key]}
											{@const definition = places[key]}
											{@const englishDesc =
												englishTranslation?.places?.[key] ?? 'No EN translation'}
											<!-- Individual Place Item Styling -->
											<div
												class="flex flex-col items-start gap-0.5 rounded border border-gray-200 bg-gray-100 p-1.5 text-xs shadow-sm"
											>
												<div class="flex items-center gap-1">
													<span class="px-1 font-semibold text-[#1a365d]">{key}:</span>
													<span class="font-medium text-gray-700">{englishDesc}</span>
													{#if definition.required}
														<span
															class="inline-block rounded-full bg-red-100 px-1.5 py-0.5 font-medium text-red-700"
															>R</span
														>
													{/if}
												</div>
												{#if definition.validation}
													<!-- Show validation logic -->
													<div
														class="mt-0.5 rounded border border-gray-200 bg-gray-50 px-1 pl-1 font-mono text-[11px] text-gray-500"
													>
														Val: {JSON.stringify(definition.validation)}
													</div>
												{/if}
											</div>
										{/if}
									{/each}
								</div>
							{:else}
								<p class="text-sm text-gray-500 italic">No places defined for this schema.</p>
							{/if}
							<!-- End Styled Places Definition -->
						</div>

						<!-- Filtered Entities List -->
						<h3 class="mb-3 text-lg font-semibold text-[#1a365d]">Entities for this Schema</h3>
						{#if isLoadingEntities}
							<div class="text-gray-500">Loading entities...</div>
						{:else if entitiesList.length === 0}
							<div class="rounded-md border border-gray-200 bg-gray-100 p-4 text-gray-500">
								No entities found for this schema.
							</div>
						{:else}
							<div class="space-y-3">
								{#each entitiesList as entity (entity.pubKey)}
									{@const entityPlaces = (entity.data as Record<string, unknown>)?.places as
										| Record<string, unknown>
										| undefined}
									<!-- Start Entity Card -->
									<div class="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm">
										{#if entityPlaces && Object.keys(entityPlaces).length > 0}
											<!-- Reuse placeOrder (now defined above) -->
											<div class="flex flex-wrap items-start gap-x-4 gap-y-2">
												{#each placeOrder as key}
													{@const placeValue = entityPlaces[key]}
													{#if placeValue !== null && placeValue !== undefined}
														{@const englishDesc = englishTranslation?.places?.[key] ?? 'N/A'}
														<!-- Individual Place Card for Entity -->
														<div
															class="flex min-w-[120px] flex-col items-start gap-0.5 rounded border border-gray-200 bg-gray-50 p-1.5 text-xs shadow-sm"
														>
															<div class="flex items-center gap-1">
																<span class="px-1 font-semibold text-[#1a365d]">{key}:</span>
																<span class="text-[11px] text-gray-500">{englishDesc}</span>
															</div>
															<div
																class="mt-0.5 w-full rounded bg-white p-1 pl-1.5 text-sm font-medium text-gray-800"
															>
																<!-- Display resolved reference or raw value -->
																{#if typeof placeValue === 'object' && placeValue !== null && 'pubKey' in placeValue && 'meta' in placeValue}
																	<!-- If it looks like a resolved doc (has pubKey and meta), display its name or pubKey -->
																	<span class="text-blue-600">
																		Ref: {(placeValue.meta as Record<string, unknown>)?.name ??
																			placeValue.pubKey}
																	</span>
																{:else}
																	{String(placeValue)}
																{/if}
															</div>
														</div>
													{/if}
												{/each}
											</div>
										{:else}
											<p class="mb-2 text-xs text-gray-500 italic">
												No place data available for this entity.
											</p>
										{/if}

										<p class="mt-2 border-t border-gray-100 pt-1 text-xs text-gray-400">
											PubKey: {entity.pubKey}
										</p>
									</div>
									<!-- End Entity Card -->
								{/each}
							</div>
						{/if}
					{/if}
				</main>
			</div>
		{/if}
	</div>
</div>
