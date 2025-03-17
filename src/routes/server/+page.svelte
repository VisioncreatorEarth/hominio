<!-- 
  Server Page - Displays documents from the server's PGLite instance
  This page focuses on showing the registry structure and document snapshots
-->
<script lang="ts">
	import { hominio } from '$lib/client/hominio';
	import { onMount } from 'svelte';
	import {
		GENESIS_REGISTRY_UUID,
		HUMAN_REGISTRY_UUID,
		DAO_REGISTRY_UUID,
		HUMAN_REGISTRY_DOMAIN,
		DAO_REGISTRY_DOMAIN,
		INITIAL_ACCESS_CONTROL,
		type AccessControl
	} from '$lib/constants/registry';

	// Define types for our data structures
	interface Document {
		doc_id: string;
		name: string;
		doc_type: string;
		domain?: string;
		snapshot_count: number;
		last_updated: string;
		owner?: string;
		accessControl?: Record<string, AccessControl>;
	}

	interface Registry {
		id: string;
		name: string;
		exists: boolean;
		snapshotId?: string;
	}

	interface Snapshot {
		snapshot_id: string;
		doc_id: string;
		doc_type: string;
		snapshot_type: string;
		name: string;
		domain?: string;
		version_vector: Record<string, number> | null;
		created_at: string;
	}

	// State variables using Svelte's reactive declarations
	let documents: Document[] = [];
	let registryDocs: Document[] = [];
	let entryDocs: Document[] = [];
	let selectedRegistry: Document | null = null;
	let selectedEntry: Document | null = null;
	let registry: Registry | null = null;
	let selectedDocId: string = '';
	let snapshots: Snapshot[] = [];
	let loading = false;
	let error: string | null = null;

	// Fetch the list of documents that have snapshots
	async function fetchDocuments() {
		try {
			loading = true;
			error = null;

			// Use the resources/docs endpoint
			// @ts-expect-error - Eden type mismatch but this works
			const response = await hominio.agent.resources.docs.get();

			// Check the data structure
			if (response.data && response.data.status === 'success') {
				// Get all documents and enrich them with ownership data
				documents = (response.data.documents || []).map((doc: Document) => ({
					...doc,
					owner: INITIAL_ACCESS_CONTROL[doc.doc_id]?.owner
				}));

				// Filter registry documents
				registryDocs = documents.filter((doc: Document) => doc.doc_type === 'registry');

				// Set initial selection to the first registry
				if (registryDocs.length > 0 && !selectedRegistry) {
					selectRegistry(registryDocs[0]);
				}

				registry = response.data.registry || null;
			} else {
				error = 'Failed to fetch documents';
				console.error('Failed response:', response);
			}
		} catch (e) {
			console.error('Error fetching documents:', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// Select a registry and filter its entries
	async function selectRegistry(doc: Document) {
		selectedRegistry = doc;
		selectedDocId = doc.doc_id;

		// Update entries based on selected registry
		if (doc.doc_id === HUMAN_REGISTRY_UUID) {
			// Show human accounts
			entryDocs = documents.filter((d: Document) => d.doc_type === 'human');
		} else if (doc.doc_id === DAO_REGISTRY_UUID) {
			// Show DAO entries
			entryDocs = documents.filter((d: Document) => d.doc_type === 'dao');
		} else {
			// Genesis registry or other - no entries
			entryDocs = [];
		}

		// Clear selected entry
		selectedEntry = null;

		// Fetch snapshots for the registry
		await fetchSnapshots(doc.doc_id);
	}

	// Select an entry
	async function selectEntry(doc: Document) {
		selectedEntry = doc;
		selectedDocId = doc.doc_id;
		await fetchSnapshots(doc.doc_id);
	}

	// Fetch snapshots for a specific document
	async function fetchSnapshots(docId: string) {
		try {
			loading = true;
			error = null;
			selectedDocId = docId;

			// Use the resources/docs/snapshots/:docId endpoint
			const response = await hominio.agent.resources.docs.snapshots[docId].get();

			// Check the data structure
			if (response.data && response.data.status === 'success') {
				snapshots = response.data.snapshots || [];
			} else {
				snapshots = [];
				error = 'Failed to fetch snapshots';
				console.error('Failed response:', response);
			}
		} catch (e) {
			console.error('Error fetching snapshots:', e);
			error = e instanceof Error ? e.message : String(e);
			snapshots = [];
		} finally {
			loading = false;
		}
	}

	// Format date for display
	function formatDate(dateString: string): string {
		try {
			const date = new Date(dateString);
			return date.toLocaleString();
		} catch (e) {
			return dateString;
		}
	}

	// Get registry type based on document ID
	function getRegistryType(docId: string): string {
		if (docId === GENESIS_REGISTRY_UUID) return 'Genesis';
		if (docId === HUMAN_REGISTRY_UUID) return 'HUMAN';
		if (docId === DAO_REGISTRY_UUID) return 'DAO';
		return 'Unknown';
	}

	// Get document type for display
	function getDocType(doc: Document): { label: string; bgColor: string; textColor: string } {
		if (doc.doc_type === 'registry') {
			return {
				label: getRegistryType(doc.doc_id),
				bgColor: 'bg-indigo-500/20',
				textColor: 'text-indigo-200'
			};
		} else if (doc.doc_type === 'dao') {
			return {
				label: 'DAO',
				bgColor: 'bg-emerald-500/20',
				textColor: 'text-emerald-200'
			};
		} else if (doc.doc_type === 'human') {
			return {
				label: 'HUMAN',
				bgColor: 'bg-blue-500/20',
				textColor: 'text-blue-200'
			};
		} else {
			return {
				label: doc.doc_type.toUpperCase(),
				bgColor: 'bg-blue-500/20',
				textColor: 'text-blue-200'
			};
		}
	}

	// Get owner name by UUID
	function getOwnerName(ownerUuid: string | string[]): string {
		if (Array.isArray(ownerUuid)) {
			return ownerUuid.map((uuid) => INITIAL_ACCESS_CONTROL[uuid]?.name || 'Unknown').join(', ');
		}
		return INITIAL_ACCESS_CONTROL[ownerUuid]?.name || 'No Owner';
	}

	// Initialize on mount
	onMount(() => {
		fetchDocuments();
	});
</script>

<div class="min-h-screen bg-blue-950 text-emerald-100">
	<div class="mx-auto max-w-4xl p-6">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Server</h1>

		{#if error}
			<div class="mb-4 rounded border border-red-700 bg-red-900/50 p-3 text-red-200">
				{error}
			</div>
		{/if}

		<!-- Registry Documents -->
		<h2 class="mb-4 text-xl font-semibold text-emerald-300">Registries</h2>

		{#if loading && registryDocs.length === 0}
			<div class="my-8 flex justify-center">
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-blue-800 border-t-emerald-500"
				></div>
			</div>
		{:else if registryDocs.length === 0}
			<div class="rounded-md bg-blue-900/10 p-4 text-center text-emerald-100/60">
				No registry documents found.
			</div>
		{:else}
			<div class="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
				{#each registryDocs as doc}
					<button
						class={`flex flex-col rounded-lg border p-3 text-left transition-all ${
							selectedRegistry?.doc_id === doc.doc_id
								? 'border-emerald-500/50 bg-emerald-900/20 shadow-md'
								: 'border-blue-700/20 bg-blue-900/10 hover:bg-blue-900/20'
						}`}
						on:click={() => selectRegistry(doc)}
					>
						<div class="flex items-center justify-between">
							<span
								class={`${getDocType(doc).bgColor} ${getDocType(doc).textColor} rounded px-2 py-0.5 text-xs font-medium`}
							>
								{getDocType(doc).label}
							</span>
						</div>
						<div class="mt-2 text-lg font-medium text-emerald-200">
							{doc.name || doc.domain || 'Untitled'}
						</div>
						<div class="mt-1 flex items-center justify-between">
							<span class="text-xs text-emerald-100/70">
								{doc.snapshot_count} snapshot{doc.snapshot_count !== 1 ? 's' : ''}
							</span>
						</div>
						{#if doc.owner}
							<div class="mt-2 border-t border-blue-700/20 pt-2">
								<div class="text-xs text-emerald-100/70">
									Owner{Array.isArray(doc.owner) ? 's' : ''}: {getOwnerName(doc.owner)}
								</div>
							</div>
						{/if}
					</button>
				{/each}
			</div>

			<button
				on:click={fetchDocuments}
				class="mb-6 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-emerald-500 disabled:opacity-50"
				disabled={loading}
			>
				{loading ? 'Loading...' : 'Refresh'}
			</button>

			<!-- Registry Entries Section (DAOs or Humans) -->
			{#if selectedRegistry}
				{#if selectedRegistry.doc_id === HUMAN_REGISTRY_UUID}
					<h2
						class="mt-8 mb-4 border-t border-blue-700/20 pt-6 text-xl font-semibold text-emerald-300"
					>
						Humans
					</h2>
				{:else if selectedRegistry.doc_id === DAO_REGISTRY_UUID}
					<h2
						class="mt-8 mb-4 border-t border-blue-700/20 pt-6 text-xl font-semibold text-emerald-300"
					>
						DAOs
					</h2>
				{/if}

				{#if entryDocs.length === 0}
					<div class="mb-6 rounded-md bg-blue-900/10 p-4 text-center text-emerald-100/60">
						No entries found in this registry.
					</div>
				{:else}
					<div class="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
						{#each entryDocs as doc}
							<button
								class={`flex flex-col rounded-lg border p-3 text-left transition-all ${
									selectedEntry?.doc_id === doc.doc_id
										? 'border-emerald-500/50 bg-emerald-900/20 shadow-md'
										: 'border-blue-700/20 bg-blue-900/10 hover:bg-blue-900/20'
								}`}
								on:click={() => selectEntry(doc)}
							>
								<div class="flex items-center justify-between">
									<span
										class={`${getDocType(doc).bgColor} ${getDocType(doc).textColor} rounded px-2 py-0.5 text-xs font-medium`}
									>
										{getDocType(doc).label}
									</span>
								</div>
								<div class="mt-2 text-lg font-medium text-emerald-200">
									{doc.name || doc.domain || 'Untitled'}
								</div>
								<div class="mt-1 flex items-center justify-between">
									<span class="text-xs text-emerald-100/70">
										{doc.snapshot_count} snapshot{doc.snapshot_count !== 1 ? 's' : ''}
									</span>
								</div>
								{#if doc.owner}
									<div class="mt-2 border-t border-blue-700/20 pt-2">
										<div class="text-xs text-emerald-100/70">
											Owner{Array.isArray(doc.owner) ? 's' : ''}: {getOwnerName(doc.owner)}
										</div>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			{/if}

			<!-- Selected Document Snapshots -->
			{#if selectedDocId && snapshots.length > 0}
				<div class="mt-8 border-t border-blue-700/20 pt-6">
					<h3 class="mb-4 text-lg font-semibold text-emerald-300">
						{#if selectedEntry}
							{selectedEntry.name || selectedEntry.domain} Snapshots
						{:else if selectedRegistry}
							{getRegistryType(selectedRegistry.doc_id)} Registry Snapshots
						{:else}
							Document Snapshots
						{/if}
					</h3>

					<div class="space-y-3">
						{#each snapshots as snapshot}
							<div class="rounded-md border border-blue-700/20 bg-blue-900/10 p-3">
								<div class="flex items-center justify-between text-sm">
									<div class="font-medium text-emerald-200">
										{formatDate(snapshot.created_at)}
									</div>
									<div class="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-200">
										{snapshot.snapshot_type}
									</div>
								</div>
								<div class="mt-2 overflow-hidden font-mono text-xs text-emerald-100/70">
									ID: {snapshot.snapshot_id}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
