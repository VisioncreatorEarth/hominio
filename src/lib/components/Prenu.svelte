<script lang="ts">
	import { onMount, getContext } from 'svelte';
	// Remove direct auth/caps imports
	// Remove direct hominio-auth import
	// import type { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import type { CapabilityUser } from '$lib/KERNEL/hominio-caps';
	// Remove direct hominio-query imports
	// import { executeQuery, type LoroHqlQueryExtended } from '$lib/KERNEL/hominio-query';
	// Remove direct hominio-mutate imports
	// import {
	// 	executeMutation as executeMutationInstance,
	// 	type MutateHqlRequest,
	// 	type CreateMutationOperation
	// } from '$lib/KERNEL/hominio-mutate';
	import { closeModal } from '$lib/KERNEL/modalStore'; // To close modal on success
	import type { IndexLeafType } from '$lib/KERNEL/index-registry';
	import { canCreatePersonConcept } from '$lib/KERNEL/hominio-caps';

	// Import types from facade/core modules
	import type { LoroHqlQueryExtended } from '$lib/KERNEL/hominio-svelte';
	import type { MutateHqlRequest, CreateMutationOperation } from '$lib/KERNEL/hominio-mutate';

	// --- Get Hominio Facade from Context ---
	const o = getContext<typeof import('$lib/KERNEL/hominio-svelte').o>('o');
	// --- End Get Hominio Facade from Context ---

	// --- Component State ---
	let personName = $state('');
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

	// REMOVE: Get User Context
	// type GetCurrentUserFn = typeof getMeType;
	// const getCurrentUser = getContext<GetCurrentUserFn>('getMe');

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

<div class="space-y-4">
	<h3 class="text-lg font-semibold text-[#153243]">Create New Person</h3>

	{#if isSchemaLoading}
		<p class="text-sm text-gray-500">Loading schema information...</p>
	{:else if schemaError}
		<div class="rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700">
			<strong>Error loading schemas:</strong>
			{schemaError}
		</div>
	{:else if isCheckingCapability}
		<p class="text-sm text-gray-500">Checking creation permissions...</p>
	{:else if capabilityCheckError}
		<div class="rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700">
			<strong>Error checking permissions:</strong>
			{capabilityCheckError}
		</div>
	{:else if canActuallyCreate === false}
		<div class="rounded border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-700">
			You already have a person concept linked to your account. You cannot create another.
		</div>
	{:else if canActuallyCreate === true}
		<div class="space-y-3">
			<div>
				<label for="personName" class="mb-1 block text-sm font-medium text-gray-700"
					>Person's Name:</label
				>
				<input
					type="text"
					id="personName"
					bind:value={personName}
					placeholder="Enter name"
					class="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-[#174C6B] focus:ring-[#174C6B]"
					required
					disabled={isMutating || !canActuallyCreate}
				/>
			</div>

			{#if mutationError}
				<p class="text-sm text-red-600">{mutationError}</p>
			{/if}

			<button
				on:click={handleCreatePerson}
				class="w-full rounded-md bg-[#153243] px-4 py-2 text-sm font-semibold text-[#DDD4C9] shadow-sm transition-colors hover:bg-[#174C6B] focus:ring-2 focus:ring-[#153243] focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				disabled={isMutating || !personName.trim() || !canActuallyCreate}
			>
				{#if isMutating}Creating...{:else}Create Person{/if}
			</button>
		</div>
	{/if}
</div>
