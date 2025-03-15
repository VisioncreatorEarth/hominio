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
		title: string;
		doc_type: string;
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
		version_vector: Record<string, number> | null;
		created_at: string;
	}

	// Standard state variables using Svelte's reactive declarations
	let documents: Document[] = [];
	let registry: Registry | null = null;
	let selectedDocId: string = '';
	let snapshots: Snapshot[] = [];
	let loading = false;
	let error: string | null = null;

	// Constants
	const GENESIS_UUID = '00000000-0000-0000-0000-000000000000';

	// Fetch the list of documents that have snapshots
	async function fetchDocuments() {
		try {
			loading = true;
			error = null;

			// Use the resources/docs endpoint - now without .index
			// @ts-expect-error - Eden type mismatch but this works
			const response = await hominio.agent.resources.docs.get();

			// Check the data structure
			if (response.data && response.data.status === 'success') {
				documents = response.data.documents || [];
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

			// Use the resources/docs/snapshots/:docId endpoint - without .index
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

	// Get document type label with appropriate styling
	function getDocTypeLabel(docType: string): { text: string; bgColor: string; textColor: string } {
		switch (docType) {
			case 'dao':
				return { text: 'DAO', bgColor: 'bg-purple-600/20', textColor: 'text-purple-300' };
			case 'todos':
				return { text: 'Todos', bgColor: 'bg-green-600/20', textColor: 'text-green-300' };
			default:
				return { text: docType, bgColor: 'bg-blue-600/20', textColor: 'text-blue-300' };
		}
	}

	// Is the document the genesis registry
	function isRegistryDoc(docId: string): boolean {
		return docId === GENESIS_UUID;
	}

	// Initialize on mount
	onMount(() => {
		fetchDocuments();
	});
</script>

<div class="min-h-screen bg-blue-950 text-emerald-100">
	<div class="mx-auto max-w-6xl p-6">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Server</h1>
		<p class="mb-8 text-emerald-200">
			View snapshots stored in the server's in-memory PGLite database.
		</p>

		{#if error}
			<div class="mb-6 rounded border border-red-700 bg-red-900/50 p-4 text-red-200">
				{error}
			</div>
		{/if}

		<!-- Registry Info -->
		{#if registry}
			<div class="mb-8 rounded border border-purple-700/30 bg-purple-900/10 p-4">
				<h2 class="mb-2 text-xl font-semibold text-purple-300">Registry</h2>
				<div class="grid grid-cols-2 gap-2 text-sm">
					<span class="text-emerald-100/50">ID:</span>
					<span class="font-mono text-emerald-100">{registry.id}</span>

					<span class="text-emerald-100/50">Title:</span>
					<span class="text-emerald-100">{registry.title}</span>

					<span class="text-emerald-100/50">Status:</span>
					<span class="text-emerald-100">{registry.exists ? 'Exists' : 'Not found'}</span>

					{#if registry.snapshotId}
						<span class="text-emerald-100/50">Snapshot ID:</span>
						<span class="font-mono text-xs text-emerald-100">{registry.snapshotId}</span>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Document Selection -->
		<div class="mb-8">
			<h2 class="mb-4 text-xl font-semibold text-emerald-300">Documents</h2>

			<div class="mb-4 flex flex-wrap gap-2">
				{#if loading && documents.length === 0}
					<div class="w-full p-8 text-center">
						<div
							class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-800 border-t-emerald-500"
						></div>
						<p class="mt-4 text-emerald-200">Loading documents...</p>
					</div>
				{:else if documents.length === 0}
					<p class="text-emerald-100/50">No documents found in the database.</p>
				{:else}
					{#each documents as doc}
						<button
							class={`flex items-center gap-2 rounded border px-4 py-2 transition-colors ${
								selectedDocId === doc.doc_id
									? 'border-emerald-500 bg-emerald-900/30'
									: 'border-blue-700 bg-blue-900/30'
							}`}
							onclick={() => fetchSnapshots(doc.doc_id)}
						>
							{#if isRegistryDoc(doc.doc_id)}
								<span class="text-xs font-semibold tracking-wide text-purple-300 uppercase"
									>Root</span
								>
							{/if}
							<span class="font-medium">{doc.title || 'Untitled'}</span>
							{#if doc.doc_type}
								{@const label = getDocTypeLabel(doc.doc_type)}
								<span
									class={`ml-1 rounded px-1.5 py-0.5 text-xs font-medium ${label.bgColor} ${label.textColor}`}
								>
									{label.text}
								</span>
							{/if}
							<span class="ml-1 text-xs text-emerald-100/30">
								{doc.snapshot_count} snapshot{doc.snapshot_count !== 1 ? 's' : ''}
							</span>
						</button>
					{/each}
				{/if}
			</div>

			<button
				onclick={fetchDocuments}
				class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-emerald-500"
				disabled={loading}
			>
				{loading ? 'Loading...' : 'Refresh Documents'}
			</button>
		</div>

		<!-- Snapshots Display -->
		{#if selectedDocId}
			<div>
				<h2 class="mb-4 text-xl font-semibold text-emerald-300">
					Snapshots for Document:
					{#each documents as doc}
						{#if doc.doc_id === selectedDocId}
							<span class="text-emerald-400">{doc.title || selectedDocId}</span>
						{/if}
					{/each}
				</h2>

				{#if loading && snapshots.length === 0}
					<div class="p-8 text-center">
						<div
							class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-800 border-t-emerald-500"
						></div>
						<p class="mt-4 text-emerald-200">Loading snapshots...</p>
					</div>
				{:else if snapshots.length === 0}
					<p class="text-emerald-100/50">No snapshots found for this document.</p>
				{:else}
					<div class="space-y-6">
						{#each snapshots as snapshot}
							<div class="rounded border border-blue-700/50 bg-blue-900/30 p-4">
								<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
									<div>
										<span class="font-mono text-xs text-emerald-100/50">
											ID: <span class="text-emerald-100">{snapshot.snapshot_id}</span>
										</span>
										{#if snapshot.doc_type}
											{@const label = getDocTypeLabel(snapshot.doc_type)}
											<span
												class={`ml-3 rounded px-1.5 py-0.5 text-xs font-medium ${label.bgColor} ${label.textColor}`}
											>
												{label.text}
											</span>
										{/if}
										{#if snapshot.snapshot_type}
											<span
												class="ml-2 rounded bg-blue-600/20 px-1.5 py-0.5 text-xs font-medium text-blue-300"
											>
												{snapshot.snapshot_type}
											</span>
										{/if}
									</div>
									<div class="text-xs text-emerald-100/70">
										<span>Created: {formatDate(snapshot.created_at)}</span>
									</div>
								</div>

								{#if snapshot.version_vector}
									<div class="mt-3">
										<div class="mb-1 text-sm font-medium text-emerald-300">Version Vector:</div>
										<pre
											class="overflow-auto rounded bg-blue-900/50 p-3 text-xs text-emerald-100/70">{JSON.stringify(
												snapshot.version_vector,
												null,
												2
											)}</pre>
									</div>
								{/if}

								{#if snapshot.title}
									<div class="mt-3 text-sm">
										<span class="font-medium text-emerald-300">Title:</span>
										<span class="ml-2 text-emerald-100">{snapshot.title}</span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
