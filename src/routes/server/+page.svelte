<!-- 
  Server Page - Displays snapshots stored in the server's PGLite instance
  This page demonstrates the server-side storage and retrieval of Loro document snapshots
-->
<script lang="ts">
	import { hominio } from '$lib/client/hominio';
	import { onMount } from 'svelte';

	// Define types for our data structures
	interface Document {
		doc_id: string;
		doc_type: string;
	}

	interface Snapshot {
		id: string;
		doc_id: string;
		doc_type: string;
		data: Record<string, any>;
		client_id: string;
		created_at: string;
	}

	// Standard state variables using Svelte's reactive declarations
	let documents: Document[] = [];
	let selectedDocId: string = '';
	let snapshots: Snapshot[] = [];
	let loading = false;
	let error: string | null = null;

	// Fetch the list of documents that have snapshots
	async function fetchDocuments() {
		try {
			loading = true;
			error = null;

			// @ts-expect-error - Eden client doesn't know about our endpoint
			const response = await hominio.agent.resources.docs.get();

			if (response.status === 200 && response.data?.documents) {
				documents = response.data.documents;

				// If we have documents and none is selected, select the first one
				if (documents.length > 0 && !selectedDocId) {
					selectedDocId = documents[0].doc_id;
					await fetchSnapshots(selectedDocId);
				}
			} else {
				error = 'Failed to fetch documents';
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

			// @ts-expect-error - Eden client doesn't know about our endpoint
			const response = await hominio.agent.resources.docs.snapshots[docId].get();

			if (response.status === 200 && response.data?.snapshots) {
				// Parse the JSON data field in each snapshot
				snapshots = response.data.snapshots.map((snapshot: any) => ({
					...snapshot,
					data: typeof snapshot.data === 'string' ? JSON.parse(snapshot.data) : snapshot.data
				}));
			} else {
				snapshots = [];
				error = 'Failed to fetch snapshots';
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

	// Initialize on mount
	onMount(() => {
		fetchDocuments();
	});
</script>

<div class="min-h-screen bg-gray-950 p-8 text-white">
	<div class="mx-auto max-w-6xl">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Server</h1>
		<p class="mb-8 text-emerald-200">
			View snapshots stored in the server's in-memory PGLite database.
		</p>

		{#if error}
			<div class="mb-6 rounded border border-red-700 bg-red-900/50 p-4 text-red-200">
				{error}
			</div>
		{/if}

		<!-- Document Selection -->
		<div class="mb-8">
			<h2 class="mb-4 text-xl font-semibold text-emerald-300">Documents</h2>

			<div class="mb-4 flex flex-wrap gap-2">
				{#if documents.length === 0}
					<p class="text-gray-400">No documents found in the database.</p>
				{:else}
					{#each documents as doc}
						<button
							class={`rounded border px-4 py-2 transition-colors ${
								selectedDocId === doc.doc_id
									? 'border-emerald-500 bg-emerald-900/30'
									: 'border-gray-700 bg-gray-800/30'
							}`}
							on:click={() => fetchSnapshots(doc.doc_id)}
						>
							<span class="font-medium">ID: {doc.doc_id}</span>
							<span class="ml-2 text-xs opacity-70">({doc.doc_type})</span>
						</button>
					{/each}
				{/if}
			</div>

			<button
				on:click={fetchDocuments}
				class="rounded bg-blue-600 px-4 py-2 text-sm transition-colors hover:bg-blue-700"
				disabled={loading}
			>
				{loading ? 'Loading...' : 'Refresh Documents'}
			</button>
		</div>

		<!-- Snapshots Display -->
		{#if selectedDocId}
			<div>
				<h2 class="mb-4 text-xl font-semibold text-emerald-300">
					Snapshots for Document: <span class="text-emerald-400">{selectedDocId}</span>
				</h2>

				{#if loading}
					<div class="p-8 text-center">
						<div
							class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-800 border-t-emerald-500"
						></div>
						<p class="mt-4 text-emerald-200">Loading snapshots...</p>
					</div>
				{:else if snapshots.length === 0}
					<p class="text-gray-400">No snapshots found for this document.</p>
				{:else}
					<div class="space-y-6">
						{#each snapshots as snapshot}
							<div class="rounded border border-gray-700 bg-gray-800/30 p-4">
								<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
									<div>
										<span class="font-mono text-xs text-gray-400">ID: {snapshot.id}</span>
									</div>
									<div class="text-xs text-emerald-300">
										<span>Created: {formatDate(snapshot.created_at)}</span>
										{#if snapshot.client_id}
											<span class="ml-4">Client: {snapshot.client_id}</span>
										{/if}
									</div>
								</div>

								<div class="mt-3">
									<div class="mb-1 text-sm font-medium text-emerald-300">Data:</div>
									<pre
										class="overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-300">{JSON.stringify(
											snapshot.data,
											null,
											2
										)}</pre>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
