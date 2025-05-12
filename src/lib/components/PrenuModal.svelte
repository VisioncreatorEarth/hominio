<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import type { CapabilityUser } from '$lib/KERNEL/hominio-caps';
	import { closeModal } from '$lib/KERNEL/modalStore'; // To close modal on success
	import type { IndexLeafType } from '$lib/KERNEL/index-registry';
	import { canCreatePersonConcept } from '$lib/KERNEL/hominio-caps';
	import type { LoroHqlQueryExtended } from '$lib/KERNEL/hominio-svelte';
	import type { MutateHqlRequest, CreateMutationOperation } from '$lib/KERNEL/hominio-mutate';

	// --- Props ---
	let { name: initialName = '' } = $props<{ name?: string }>();

	const o = getContext<typeof import('$lib/KERNEL/hominio-svelte').o>('o');

	// --- Component State ---
	let personName = $state(initialName); // Initialize with prop
	let isSchemaLoading = $state(true);
	let schemaError = $state<string | null>(null);
	let prenuSchemaId = $state<string | null>(null);
	let cnemeSchemaId = $state<string | null>(null);
	let ponseSchemaId = $state<string | null>(null);
	let isMutating = $state(false);
	let mutationError = $state<string | null>(null);
	// REMOVE: currentUser state
	// let currentUser = $state<CapabilityUser | null>(null);
	let isCheckingCapability = $state(false);
	let canActuallyCreate = $state<boolean | null>(null);
	let capabilityCheckError = $state<string | null>(null);

	// --- Fetch Schema PubKeys --- (Self-contained)
	async function loadSchemaPubKeys() {
		// Use o.me() to check if user exists
		const user = o.me();
		if (!user) {
			schemaError = 'Cannot load schemas: User not logged in.';
			isSchemaLoading = false;
			return;
		}
		// REMOVE: currentUser = user;
		isSchemaLoading = true;
		schemaError = null;

		try {
			const { GENESIS_PUBKEY } = await import('$db/constants');

			// STEP 1: Fetch Meta Index (use o.query)
			const metaIndexQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'get',
						from: { pubkey: [GENESIS_PUBKEY], targetDocType: 'Leaf' },
						fields: { index_map: { field: 'self.data.value' } },
						resultVariable: 'metaIndex'
					}
				]
			};
			const metaResult = await o.query(metaIndexQuery); // Use o.query

			let schemasIndexPubKey: string | null = null;
			if (
				metaResult &&
				metaResult.length > 0 &&
				metaResult[0].variables &&
				(metaResult[0].variables as any).index_map &&
				typeof (metaResult[0].variables as any).index_map === 'object'
			) {
				const indexRegistry = (metaResult[0].variables as any).index_map as Partial<
					Record<IndexLeafType, string>
				>;
				schemasIndexPubKey = indexRegistry['schemas'] ?? null;
			} else {
				throw new Error('Meta Index query returned invalid data.');
			}

			if (!schemasIndexPubKey) {
				throw new Error("Could not find pubkey for 'schemas' index.");
			}

			// STEP 2: Fetch the schemas index document (use o.query)
			const schemasIndexQuery: LoroHqlQueryExtended = {
				steps: [
					{
						action: 'get',
						from: { pubkey: [schemasIndexPubKey], targetDocType: 'Leaf' },
						fields: { schema_map: { field: 'self.data.value' } },
						resultVariable: 'schemasIndexData'
					}
				]
			};
			const schemasResult = await o.query(schemasIndexQuery); // Use o.query

			// STEP 3: Extract the schema map
			if (
				schemasResult &&
				schemasResult.length > 0 &&
				schemasResult[0].variables &&
				(schemasResult[0].variables as any).schema_map &&
				typeof (schemasResult[0].variables as any).schema_map === 'object'
			) {
				const schemaMap = (schemasResult[0].variables as any).schema_map as Record<string, string>;

				// STEP 4: Get specific schema pubkeys
				prenuSchemaId = schemaMap['prenu'] ?? null;
				cnemeSchemaId = schemaMap['cneme'] ?? null;
				ponseSchemaId = schemaMap['ponse'] ?? null;

				if (!prenuSchemaId || !cnemeSchemaId || !ponseSchemaId) {
					const missing = ['prenu', 'cneme', 'ponse'].filter((k) => !schemaMap[k]).join(', ');
					throw new Error(`Could not find required schema pubkeys: ${missing}`);
				}
				console.log('[Prenu Component] Successfully loaded prenu/cneme/ponse schema IDs.');
			} else {
				throw new Error("'schemas' index document query returned invalid data.");
			}
		} catch (err) {
			console.error('[Prenu Component] Error loading schema pubkeys:', err);
			schemaError = err instanceof Error ? err.message : 'Unknown error loading schemas.';
			prenuSchemaId = null;
			cnemeSchemaId = null;
			ponseSchemaId = null;
		} finally {
			isSchemaLoading = false;
			// --- Trigger capability check AFTER schemas are loaded ---
			// Use the user object obtained at the start of this function
			if (!schemaError && user) {
				await checkCreationCapability(user);
			}
		}
	}

	// --- NEW: Capability Check Function --- (No change needed here, accepts user)
	async function checkCreationCapability(user: CapabilityUser) {
		isCheckingCapability = true;
		capabilityCheckError = null;
		canActuallyCreate = null;
		try {
			console.log(`[Prenu Capability Check] Checking if user ${user.id} can create a person...`);
			canActuallyCreate = await canCreatePersonConcept(user);
			if (canActuallyCreate === false) {
				console.log(
					`[Prenu Capability Check] Result: User ${user.id} cannot create (likely already owns one).`
				);
			} else if (canActuallyCreate === true) {
				console.log(`[Prenu Capability Check] Result: User ${user.id} can create.`);
			}
		} catch (err) {
			console.error('[Prenu Capability Check] Error:', err);
			capabilityCheckError = `Capability check failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
			canActuallyCreate = false; // Fail safe
		} finally {
			isCheckingCapability = false;
		}
	}

	// --- Create Person Mutation Logic --- (Pre-check removed)
	async function handleCreatePerson() {
		if (!personName.trim()) {
			mutationError = 'Please enter a name.';
			return;
		}
		// Use o.me() to get current user ID
		const currentUserId = o.me()?.id;
		if (!currentUserId) {
			mutationError = 'Cannot create person: User not logged in or ID missing.';
			return;
		}
		if (!prenuSchemaId || !cnemeSchemaId || !ponseSchemaId) {
			mutationError = 'Cannot create person: Schema information not loaded correctly.';
			console.error('Create person failed: Schema pubkeys not available.', {
				prenuSchemaId,
				cnemeSchemaId,
				ponseSchemaId
			});
			return;
		}

		// --- REMOVED PRE-CHECK QUERY ---

		// Ensure the capability check passed before proceeding
		if (canActuallyCreate !== true) {
			mutationError = capabilityCheckError
				? `Cannot create: ${capabilityCheckError}`
				: 'Cannot create person. You might already own one, or the capability check failed.';
			console.warn('[Prenu Mutation] Creation blocked due to failed capability check.');
			return;
		}

		// Now proceed with the actual mutation
		isMutating = true;
		mutationError = null;
		console.log('Creating person:', personName);

		try {
			const personLeafOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Leaf',
				placeholder: '$$newPerson',
				data: { type: 'Concept' }
			};

			const nameLeafOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Leaf',
				placeholder: '$$personName',
				data: { type: 'LoroText', value: personName.trim() }
			};

			// --- Create User ID Leaf ---
			const userIdLeafOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Leaf',
				placeholder: '$$userIdLeaf',
				data: { type: 'LoroText', value: currentUserId } // Store the actual user ID
			};
			// -------------------------

			const prenuCompositeOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Composite',
				placeholder: '$$prenuLink',
				data: {
					schemaId: prenuSchemaId,
					places: {
						x1: '$$newPerson'
					}
				}
			};

			const cnemeCompositeOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Composite',
				placeholder: '$$cnemeLink',
				data: {
					schemaId: cnemeSchemaId,
					places: {
						x1: '$$newPerson',
						x2: '$$personName'
					}
				}
			};

			// --- Create ponse Composite ---
			const ponseCompositeOp: CreateMutationOperation = {
				operation: 'create',
				type: 'Composite',
				placeholder: '$$ponseLink',
				data: {
					schemaId: ponseSchemaId,
					places: {
						x1: '$$userIdLeaf', // Link to the new User ID Leaf
						x2: '$$newPerson' // Link to the new Person Concept Leaf
					}
				}
			};
			// -----------------------------

			const request: MutateHqlRequest = {
				mutations: [
					personLeafOp,
					nameLeafOp,
					userIdLeafOp,
					prenuCompositeOp,
					cnemeCompositeOp,
					ponseCompositeOp
				]
			};
			// Use o.mutate
			const result = await o.mutate(request);

			if (result.status === 'success') {
				console.log('Person created successfully:', result.generatedPubKeys);
				personName = '';
				closeModal(); // Close modal on success
			} else {
				console.error('Failed to create person:', result.message, result.errorDetails);
				mutationError = `Failed: ${result.message}`;
			}
		} catch (err) {
			console.error('Error executing mutation:', err);
			mutationError = `Error: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			isMutating = false;
		}
	}

	// --- Lifecycle --- (onMount remains)
	onMount(() => {
		loadSchemaPubKeys(); // This now also triggers checkCreationCapability
	});
</script>

<!-- UI Updated to resemble SignerModal -->
<div
	class="mx-auto flex max-w-xl flex-col items-center justify-center rounded-2xl border border-stone-200 bg-[#fdf6ee] p-8 shadow-2xl"
>
	<h2 class="mb-4 text-2xl font-extrabold tracking-tight text-slate-800">
		Create Your Person Concept
	</h2>
	<p class="mb-6 text-center text-base text-slate-600">
		This represents you within the system. You can only create one.
	</p>

	{#if isSchemaLoading}
		<div class="flex items-center justify-center py-4 text-slate-500">
			<span class="spinner mr-3"></span> Loading required info...
		</div>
	{:else if schemaError}
		<div
			class="mb-4 w-full rounded-xl border-2 border-red-400 bg-red-50 p-4 text-sm text-red-700 shadow-md"
		>
			<strong>Error loading schemas:</strong>
			{schemaError} Cannot proceed.
		</div>
	{:else if isCheckingCapability}
		<div class="flex items-center justify-center py-4 text-slate-500">
			<span class="spinner mr-3"></span> Checking permissions...
		</div>
	{:else if capabilityCheckError}
		<div
			class="mb-4 w-full rounded-xl border-2 border-red-400 bg-red-50 p-4 text-sm text-red-700 shadow-md"
		>
			<strong>Error checking permissions:</strong>
			{capabilityCheckError}
		</div>
	{:else if canActuallyCreate === false}
		<div
			class="mb-4 w-full rounded-xl border-2 border-yellow-400 bg-yellow-50 p-4 text-sm text-yellow-700 shadow-md"
		>
			You already have a person concept linked to your account. You cannot create another.
		</div>
	{:else if canActuallyCreate === true}
		<!-- Form Area -->
		<div class="w-full space-y-4">
			<div>
				<label for="personNameInput" class="mb-1 block text-sm font-semibold text-slate-700"
					>Name Your Person Concept:</label
				>
				<input
					type="text"
					id="personNameInput"
					bind:value={personName}
					placeholder="E.g., Sam's Digital Twin"
					class="w-full rounded-lg border border-stone-300 px-4 py-2 text-slate-900 shadow-sm transition duration-150 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
					required
					disabled={isMutating}
				/>
			</div>

			{#if mutationError}
				<div class="rounded border border-red-300 bg-red-100 p-2 text-xs text-red-700">
					{mutationError}
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="mt-6 flex w-full justify-between gap-4">
				<button
					class="rounded-lg bg-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-300 disabled:opacity-50"
					on:click={closeModal}
					disabled={isMutating}>Cancel</button
				>
				<button
					class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
					on:click={handleCreatePerson}
					disabled={isMutating || !personName.trim()}
				>
					{#if isMutating}<span class="spinner mr-2"></span>Creating...{:else}Create Person{/if}
				</button>
			</div>
		</div>
	{:else}
		<!-- Fallback for unexpected state -->
		<div
			class="mb-4 w-full rounded-xl border-2 border-gray-400 bg-gray-50 p-4 text-sm text-gray-700 shadow-md"
		>
			Cannot determine creation status.
		</div>
	{/if}
</div>

<style>
	.spinner {
		display: inline-block;
		border: 2px solid currentColor;
		border-right-color: transparent;
		width: 0.75em;
		height: 0.75em;
		border-radius: 50%;
		animation: spin 0.75s linear infinite;
		vertical-align: text-bottom;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
