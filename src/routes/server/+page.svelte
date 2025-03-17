<!-- 
  Server Page - Displays documents from the server's PGLite instance
  This page focuses on showing the registry structure and document snapshots
-->
<script lang="ts">
	import { hominio } from '$lib/client/hominio';
	import { onMount } from 'svelte';
	import {
		HUMAN_REGISTRY_UUID,
		DAO_REGISTRY_UUID,
		HUMAN_REGISTRY_DOMAIN,
		DAO_REGISTRY_DOMAIN
	} from '$lib/constants/registry';

	// Define types for our data structures
	interface Document {
		doc_id: string;
		title: string;
		doc_type: string;
		domain?: string;
		snapshot_count: number;
		last_updated: string;
	}

	interface Registry {
		id: string;
		title: string;
		exists: boolean;
		snapshotId?: string;
	}

	interface Snapshot {
		snapshot_id: string;
		doc_id: string;
		doc_type: string;
		snapshot_type: string;
		title: string;
		domain?: string;
		version_vector: Record<string, number> | null;
		created_at: string;
	}

	// State variables using Svelte's reactive declarations
	let documents: Document[] = [];
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
				// Filter only registry documents
				documents = (response.data.documents || []).filter(
					(doc: Document) => doc.doc_type === 'registry'
				);
				registry = response.data.registry || null;

				// If we have documents and none is selected, select the first one
				if (documents.length > 0 && !selectedDocId) {
					selectedDocId = documents[0].doc_id;
					await fetchSnapshots(selectedDocId);
				}
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
		if (docId === HUMAN_REGISTRY_UUID) return 'HUMAN';
		if (docId === DAO_REGISTRY_UUID) return 'DAO';
		return 'Unknown';
	}

	// Is the document a registry document (either HUMAN or DAO)
	function isRegistryDoc(docId: string): boolean {
		return docId === HUMAN_REGISTRY_UUID || docId === DAO_REGISTRY_UUID;
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

		{#if loading && documents.length === 0}
			<div class="my-8 flex justify-center">
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-blue-800 border-t-emerald-500"
				></div>
			</div>
		{:else if documents.length === 0}
			<div class="rounded-md bg-blue-900/10 p-4 text-center text-emerald-100/60">
				No registry documents found.
			</div>
		{:else}
			<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
				{#each documents as doc}
					<button
						class={`flex flex-col rounded-lg border p-3 text-left transition-all ${
							selectedDocId === doc.doc_id
								? 'border-emerald-500/50 bg-emerald-900/20 shadow-md'
								: 'border-blue-700/20 bg-blue-900/10 hover:bg-blue-900/20'
						}`}
						on:click={() => fetchSnapshots(doc.doc_id)}
					>
						<div class="flex items-center justify-between">
							<span
								class="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-200"
							>
								{getRegistryType(doc.doc_id)}
							</span>
							<span class="text-xs text-emerald-100/50">{doc.snapshot_count} snapshots</span>
						</div>
						<div class="mt-2 text-lg font-medium text-emerald-200">
							{doc.title || doc.domain || 'Untitled'}
						</div>
						<div class="mt-1 text-xs text-emerald-100/70">
							Last updated: {formatDate(doc.last_updated)}
						</div>
					</button>
				{/each}
			</div>

			<button
				on:click={fetchDocuments}
				class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-emerald-500 disabled:opacity-50"
				disabled={loading}
			>
				{loading ? 'Loading...' : 'Refresh'}
			</button>

			<!-- Selected Registry Snapshots -->
			{#if selectedDocId && snapshots.length > 0}
				<div class="mt-6 border-t border-blue-700/20 pt-6">
					<h3 class="mb-4 text-lg font-semibold text-emerald-300">
						{#each documents as doc}
							{#if doc.doc_id === selectedDocId}
								{getRegistryType(doc.doc_id)} Registry Snapshots
							{/if}
						{/each}
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
