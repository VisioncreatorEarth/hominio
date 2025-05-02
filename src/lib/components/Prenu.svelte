<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import type { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import type { CapabilityUser } from '$lib/KERNEL/hominio-caps';
	import { executeQuery, type LoroHqlQueryExtended } from '$lib/KERNEL/hominio-query';
	import {
		executeMutation as executeMutationInstance,
		type MutateHqlRequest,
		type CreateMutationOperation
	} from '$lib/KERNEL/hominio-mutate';
	import { closeModal } from '$lib/KERNEL/modalStore'; // To close modal on success
	import type { IndexLeafType } from '$lib/KERNEL/index-registry'; // <-- Import type at top level

	// --- Component State ---
	let personName = $state('');
	let isSchemaLoading = $state(true);
	let schemaError = $state<string | null>(null);
	let prenuSchemaId = $state<string | null>(null);
	let cnemeSchemaId = $state<string | null>(null);
	let isMutating = $state(false);
	let mutationError = $state<string | null>(null);
	let currentUser = $state<CapabilityUser | null>(null);

	// --- Get User Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getCurrentUser = getContext<GetCurrentUserFn>('getMe');

	// --- Fetch Schema PubKeys --- (Self-contained)
	async function loadSchemaPubKeys() {
		const user = getCurrentUser();
		if (!user) {
			schemaError = 'Cannot load schemas: User not logged in.';
			isSchemaLoading = false;
			return;
		}
		currentUser = user; // Store user for mutation
		isSchemaLoading = true;
		schemaError = null;

		try {
			const { GENESIS_PUBKEY } = await import('$db/constants');
			// const { type IndexLeafType } = await import('$lib/KERNEL/index-registry'); // Removed dynamic import

			// STEP 1: Fetch Meta Index
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
			const metaResult = await executeQuery(metaIndexQuery, user);

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

			// STEP 2: Fetch the schemas index document
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
			const schemasResult = await executeQuery(schemasIndexQuery, user);

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

				if (!prenuSchemaId || !cnemeSchemaId) {
					const missing = ['prenu', 'cneme'].filter((k) => !schemaMap[k]).join(', ');
					throw new Error(`Could not find required schema pubkeys: ${missing}`);
				}
				console.log('[Prenu Component] Successfully loaded prenu/cneme schema IDs.');
			} else {
				throw new Error("'schemas' index document query returned invalid data.");
			}
		} catch (err) {
			console.error('[Prenu Component] Error loading schema pubkeys:', err);
			schemaError = err instanceof Error ? err.message : 'Unknown error loading schemas.';
			prenuSchemaId = null;
			cnemeSchemaId = null;
		} finally {
			isSchemaLoading = false;
		}
	}

	// --- Create Person Mutation Logic ---
	async function handleCreatePerson() {
		if (!personName.trim()) {
			mutationError = 'Please enter a name.';
			return;
		}
		if (!currentUser) {
			mutationError = 'Cannot create person: User not logged in.';
			return;
		}
		if (!prenuSchemaId || !cnemeSchemaId) {
			mutationError = 'Cannot create person: Schema information not loaded correctly.';
			console.error('Create person failed: Schema pubkeys not available.', {
				prenuSchemaId,
				cnemeSchemaId
			});
			return;
		}

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

			const request: MutateHqlRequest = {
				mutations: [personLeafOp, nameLeafOp, prenuCompositeOp, cnemeCompositeOp]
			};
			const result = await executeMutationInstance(request, currentUser);

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

	// --- Lifecycle ---
	onMount(() => {
		loadSchemaPubKeys();
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
	{:else}
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
					disabled={isMutating}
				/>
			</div>

			{#if mutationError}
				<p class="text-sm text-red-600">{mutationError}</p>
			{/if}

			<button
				on:click={handleCreatePerson}
				class="w-full rounded-md bg-[#153243] px-4 py-2 text-sm font-semibold text-[#DDD4C9] shadow-sm transition-colors hover:bg-[#174C6B] focus:ring-2 focus:ring-[#153243] focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				disabled={isMutating || !personName.trim()}
			>
				{#if isMutating}Creating...{:else}Create Person{/if}
			</button>
		</div>
	{/if}
</div>
