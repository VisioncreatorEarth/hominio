<script lang="ts">
	import {
		hominioQLService,
		type HqlQueryRequest,
		type HqlQueryResult,
		type ResolvedHqlDocument,
		type HqlMutationRequest
	} from '$lib/KERNEL/hominio-ql';
	import { readable, type Readable } from 'svelte/store';
	import { slide } from 'svelte/transition';
	import { hominioSync } from '$lib/KERNEL/hominio-sync';

	// --- Reactive Data Store (Using Auto-Subscription & Effects) ---

	// Schemas
	const allSchemasQuery: HqlQueryRequest = {
		operation: 'query',
		filter: {
			$or: [
				{ meta: { pubKey: '0x0000000000000000000000000000000000000000000000000000000000000000' } }, // Gismu
				{ meta: { schema: '@0x0000000000000000000000000000000000000000000000000000000000000000' } } // Uses Gismu
			]
		}
	};
	const schemasReadable: Readable<HqlQueryResult | null | undefined> =
		hominioQLService.processReactive(allSchemasQuery);

	// Selected Schema State
	let selectedSchemaPubKey = $state<string | null>(null);
	// Selected Entity State
	let selectedEntityPubKey = $state<string | null>(null);

	// Entities of Selected Schema
	let entitiesReadable = $state(readable<HqlQueryResult | null | undefined>(undefined));

	// Effect to update the entity query when selected schema changes
	$effect(() => {
		const currentPubKey = selectedSchemaPubKey; // Capture value for the effect
		if (currentPubKey) {
			console.log(`[Effect] Selected schema changed to: ${currentPubKey}. Fetching entities...`);
			const entityQuery: HqlQueryRequest = {
				operation: 'query',
				filter: { meta: { schema: `@${currentPubKey}` } } // Find entities using the selected schema
			};
			// Get the new readable store for entities and assign it to the state variable
			entitiesReadable = hominioQLService.processReactive(entityQuery);
			selectedEntityPubKey = null; // <-- Reset selected entity when schema changes
		} else {
			console.log(`[Effect] No schema selected. Resetting entities.`);
			// If no schema selected, reset to an empty/loading state
			entitiesReadable = readable(undefined);
			selectedEntityPubKey = null; // <-- Reset selected entity when schema changes
		}
	});

	// Derived value for the currently selected entity's full data
	const selectedEntityData = $derived(() => {
		if (selectedEntityPubKey && $entitiesReadable) {
			return $entitiesReadable.find((e) => e.pubKey === selectedEntityPubKey) || null;
		}
		return null;
	});

	// Helper function to format validation rules (simplified)
	function formatValidation(validation: any): string {
		if (!validation) return 'any';
		if (validation.schema) return `Ref: ${validation.schema.join(' | ')}`;
		if (validation.value?.options) return `Enum: [${validation.value.options.join(', ')}]`;
		if (validation.value) return `Type: ${validation.value}`;
		return JSON.stringify(validation);
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
		console.log('[Action] Creating new Prenu...');
		try {
			const randomName = samplePrenuNames[Math.floor(Math.random() * samplePrenuNames.length)];
			const prenuSchema = $schemasReadable?.find((s) => (s.meta as any)?.name === 'prenu');
			const prenuSchemaRef = '@' + (prenuSchema?.pubKey ?? 'prenu'); // Find prenu schema pubkey or fallback to name

			if (!prenuSchema) {
				console.error('Prenu schema not found!');
				return;
			}

			const mutation: HqlMutationRequest = {
				operation: 'mutate',
				action: 'create',
				schema: prenuSchemaRef, // Use the found schema ref
				places: {
					x1: randomName
				}
			};

			const result = await hominioQLService.process(mutation);
			console.log('[Action] Prenu creation result:', result);
			// List will update automatically due to reactive query
		} catch (err) {
			console.error('[Action] Error creating Prenu:', err);
			// TODO: Show error to user
		} finally {
			isCreatingPrenu = false;
		}
	}

	// --- Prenu Name Update ---
	let currentlyUpdatingPrenu = $state<string | null>(null);

	async function updatePrenuName(entityPubKey: string) {
		if (currentlyUpdatingPrenu) return; // Prevent concurrent updates
		currentlyUpdatingPrenu = entityPubKey;
		console.log(`[Action] Updating name for Prenu ${entityPubKey}...`);
		try {
			const randomName = samplePrenuNames[Math.floor(Math.random() * samplePrenuNames.length)];

			const mutation: HqlMutationRequest = {
				operation: 'mutate',
				action: 'update',
				pubKey: entityPubKey, // Use pubKey directly for update actions
				places: {
					x1: randomName // Update the name field
				}
			};

			const result = await hominioQLService.process(mutation);
			console.log(`[Action] Prenu ${entityPubKey} name update result:`, result);
			// List should update automatically due to reactive query
		} catch (err) {
			console.error(`[Action] Error updating Prenu ${entityPubKey} name:`, err);
			// TODO: Show error to user
		} finally {
			currentlyUpdatingPrenu = null;
		}
	}

	// --- Snapshot Creation ---
	let isCreatingSnapshot = $state(false);
	async function handleCreateSnapshot(entityPubKey: string) {
		if (isCreatingSnapshot || !entityPubKey) return;
		console.log(`[Action] Requesting server snapshot for ${entityPubKey}...`);
		isCreatingSnapshot = true;
		try {
			// Call the sync service method, which talks to the server
			await hominioSync.createConsolidatedSnapshot(entityPubKey);
			console.log(
				`[Action] Server snapshot request completed for ${entityPubKey}. Client will pull updates.`
			);
			// No direct result needed here, sync relies on pullFromServer implicitly called after server success
		} catch (err) {
			console.error(`[Action] Error requesting server snapshot for ${entityPubKey}:`, err);
			// TODO: Show error to user
		} finally {
			isCreatingSnapshot = false;
		}
	}

	// --- Sync Status ---
	const syncStatus = hominioSync.status;
	function handlePull() {
		if (!$syncStatus.isSyncing) {
			hominioSync.pullFromServer();
		}
	}

	function handlePush() {
		if (!$syncStatus.isSyncing && $syncStatus.pendingLocalChanges > 0) {
			hominioSync.pushToServer();
		}
	}
</script>

<div class="grid h-screen grid-cols-1 bg-gray-100 md:grid-cols-[250px_1fr_400px]">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-300 bg-white p-4">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Schemas</h2>
		{#if $schemasReadable === undefined}
			<p class="text-sm text-gray-500">Loading schemas...</p>
		{:else if $schemasReadable === null}
			<p class="text-sm text-red-600">Error loading schemas.</p>
		{:else if $schemasReadable.length === 0}
			<p class="text-sm text-yellow-700">No schemas found.</p>
		{:else}
			<ul class="space-y-2">
				{#each $schemasReadable as schema (schema.pubKey)}
					{@const schemaMeta = schema.meta as Record<string, any> | undefined}
					<li>
						<button
							class="w-full rounded px-3 py-2 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-gray-200 {selectedSchemaPubKey ===
							schema.pubKey
								? 'bg-indigo-100 font-medium text-indigo-700'
								: 'text-gray-600'}"
							on:click={() => (selectedSchemaPubKey = schema.pubKey)}
						>
							{schemaMeta?.name ?? 'Unnamed Schema'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<!-- Sync Status Display & Button -->
		<div class="mt-auto border-t border-gray-300 p-4">
			<h3 class="mb-2 text-sm font-medium text-gray-600">Sync Status</h3>
			<!-- Display Sync Status -->
			<p class="mb-3 text-xs text-gray-500">
				{#if $syncStatus.isSyncing}
					Syncing...
				{:else if $syncStatus.syncError}
					<span class="text-red-600">Error: {$syncStatus.syncError}</span>
				{:else if $syncStatus.lastSynced}
					Last synced: {new Date($syncStatus.lastSynced).toLocaleTimeString()}
				{:else}
					Ready to sync.
				{/if}
				{#if $syncStatus.pendingLocalChanges > 0}
					<span class="ml-1 text-orange-600">({$syncStatus.pendingLocalChanges} pending)</span>
				{/if}
			</p>
			<div class="space-y-2">
				<button
					class="w-full rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
					on:click={handlePull}
					disabled={$syncStatus.isSyncing}
				>
					{$syncStatus.isSyncing ? 'Pulling...' : 'Pull from Server'}
				</button>
				<button
					class="w-full rounded-md bg-green-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
					on:click={handlePush}
					disabled={$syncStatus.isSyncing || $syncStatus.pendingLocalChanges === 0}
				>
					{$syncStatus.isSyncing
						? 'Pushing...'
						: `Push to Server (${$syncStatus.pendingLocalChanges})`}
				</button>
			</div>
		</div>
	</aside>

	<!-- Main Content Area (Middle Column) -->
	<main class="col-span-1 flex flex-col overflow-y-auto border-r border-gray-300 p-6">
		{#if selectedSchemaPubKey && $schemasReadable}
			{@const selectedSchema = $schemasReadable.find((s) => s.pubKey === selectedSchemaPubKey)}
			{#if selectedSchema}
				{@const selectedMetaData = selectedSchema.meta as Record<string, any> | undefined}
				{@const selectedData = selectedSchema.data as Record<string, any> | undefined}
				{@const places = selectedData?.places as Record<string, any> | undefined}

				<div class="flex-shrink-0 pb-6">
					<div class="mb-4 flex items-center justify-between">
						<h1 class="text-2xl font-bold text-gray-800">
							{selectedMetaData?.name ?? 'Schema Details'}
						</h1>
						{#if selectedMetaData?.name === 'prenu'}
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
						PubKey: <code class="rounded bg-gray-200 px-1 text-xs">{selectedSchema.pubKey}</code>
					</p>
					<p class="mb-4 text-sm text-gray-500">
						Schema: <code class="rounded bg-gray-200 px-1 text-xs"
							>{selectedMetaData?.schema ?? 'N/A'}</code
						>
					</p>

					<h2 class="mb-3 text-xl font-semibold text-gray-700">Places</h2>
					{#if places && Object.keys(places).length > 0}
						<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each Object.entries(places) as [key, placeDef] (key)}
								<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
									<div class="mb-2 flex items-center justify-between">
										<h3 class="font-mono text-lg font-bold text-indigo-600">{key}</h3>
										{#if placeDef.required}
											<span
												class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
												>Required</span
											>
										{/if}
									</div>
									<p class="mb-3 text-sm text-gray-600">
										{placeDef.description ?? 'No description'}
									</p>
									<div class="rounded bg-gray-50 p-2">
										<p class="text-xs font-medium text-gray-500">Validation:</p>
										<p class="text-xs break-words whitespace-pre-wrap text-gray-700">
											<code class="text-xs">{formatValidation(placeDef.validation)}</code>
										</p>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="mb-6 text-sm text-gray-500">No places defined for this schema.</p>
					{/if}
				</div>

				<!-- Entities List Section -->
				<div class="flex-grow border-t border-gray-300 pt-6">
					<h2 class="mb-4 text-xl font-semibold text-gray-700">Entities using this Schema</h2>
					<!-- Use $entitiesReadable directly -->
					{#if $entitiesReadable === undefined}
						<p class="text-sm text-gray-500">Loading entities...</p>
					{:else if $entitiesReadable === null}
						<p class="text-sm text-red-600">Error loading entities.</p>
					{:else if $entitiesReadable.length === 0}
						<p class="text-sm text-yellow-700">No entities found using this schema.</p>
					{:else}
						<ul class="divide-y divide-gray-200">
							{#each $entitiesReadable as entity (entity.pubKey)}
								{@const entityMeta = entity.meta as Record<string, any> | undefined}
								{@const entityData = entity.data as Record<string, any> | undefined}
								<li class="py-3">
									<div class="flex items-center justify-between">
										<!-- Entity Info & Selection Button -->
										<button
											class="flex-grow cursor-pointer rounded-l px-3 py-1 text-left transition-colors hover:bg-gray-100 {selectedEntityPubKey ===
											entity.pubKey
												? 'bg-blue-50'
												: ''}"
											on:click={() => (selectedEntityPubKey = entity.pubKey)}
										>
											<p class="font-medium text-gray-800">
												{entityData?.places?.x1 ?? entityMeta?.name ?? 'Unnamed Entity'}
											</p>
											<p class="text-xs text-gray-500">
												PubKey: <code class="text-xs">{entity.pubKey}</code>
											</p>
										</button>

										<!-- Edit Button (Only for Prenu Schema) -->
										{#if selectedMetaData?.name === 'prenu'}
											{@const isUpdatingThis = currentlyUpdatingPrenu === entity.pubKey}
											<div class="ml-2 flex flex-shrink-0 flex-col items-end space-y-1">
												<button
													class="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
													on:click={() => updatePrenuName(entity.pubKey)}
													disabled={currentlyUpdatingPrenu !== null || isCreatingSnapshot}
												>
													{isUpdatingThis ? '...' : 'Edit Name'}
												</button>
												<!-- Snapshot Button (Moved Here) -->
												<button
													class="rounded border border-purple-300 bg-purple-50 px-2 py-1 text-xs text-purple-700 shadow-sm transition-colors hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
													on:click={() => handleCreateSnapshot(entity.pubKey)}
													disabled={isCreatingSnapshot || currentlyUpdatingPrenu !== null}
													title="Request server snapshot (requires Pull)"
												>
													{isCreatingSnapshot ? '...' : 'Snapshot'}
												</button>
											</div>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else}
				<p class="text-red-600">Error: Selected schema not found in the list.</p>
			{/if}
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">Select a schema from the list to view details.</p>
			</div>
		{/if}
	</main>

	<!-- Right Sidebar (Restored) -->
	<aside class="col-span-1 overflow-y-auto bg-white p-6">
		{#if selectedSchemaPubKey && $schemasReadable}
			<!-- Show selected schema JSON -->
			{@const selectedSchema = $schemasReadable.find((s) => s.pubKey === selectedSchemaPubKey)}
			{#if selectedSchema}
				<details class="mb-4 rounded border border-gray-300 bg-white" open>
					<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
						>Schema: {(selectedSchema.meta as Record<string, any>)?.name ??
							selectedSchema.pubKey}</summary
					>
					<div class="border-t border-gray-300 p-3">
						<pre
							class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(
								selectedSchema,
								null,
								2
							)}</pre>
					</div>
				</details>
			{/if}
		{/if}

		{#if selectedEntityData}
			<!-- Show selected entity JSON -->
			<details class="mb-4 rounded border border-gray-300 bg-white" open>
				<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
					>Entity: {(selectedEntityData.meta as Record<string, any>)?.name ??
						selectedEntityData.pubKey}</summary
				>
				<div class="border-t border-gray-300 p-3">
					<pre
						class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs whitespace-pre-wrap text-gray-700">{JSON.stringify(
							selectedEntityData,
							null,
							2
						)}</pre>
				</div>
			</details>
		{:else if !selectedSchemaPubKey}
			<!-- Show only if nothing is selected (Schema or Entity) -->
			<div class="flex h-full items-center justify-center text-gray-500">
				<p>Select a schema or entity to view details.</p>
			</div>
		{/if}
	</aside>
</div>
