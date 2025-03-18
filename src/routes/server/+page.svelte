<!-- 
<script lang="ts">
	import { hominio } from '$lib/client/hominio';
	import { onMount } from 'svelte';
	import {
		GENESIS_REGISTRY_UUID,
		HUMAN_REGISTRY_UUID,
		DAO_REGISTRY_UUID,
		HUMAN_REGISTRY_DOMAIN,
		DAO_REGISTRY_DOMAIN,
		INITIAL_ACCESS_CONTROL
	} from '$lib/constants/registry';
	import { LoroDoc } from 'loro-crdt';

	// Define types for our data structures
	interface Document {
		doc_id: string;
		name: string;
		doc_type: string;
		domain?: string;
		snapshot_count: number;
		last_updated: string;
		owner?: string | string[];
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

	// Add state for active tab
	let activeTab: 'docs' | 'snapshots' = 'docs';

	// Add state for selected owned document
	let selectedOwnedDoc: Document | null = null;
	let selectedOwnedDocContent: any = null;

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
		if (docId === HUMAN_REGISTRY_UUID) return 'HUMANS';
		if (docId === DAO_REGISTRY_UUID) return 'DAOS';
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

	// Function to get owned documents
	function getOwnedDocs(): Document[] {
		const currentDoc = selectedEntry || selectedRegistry;
		if (!currentDoc?.owner) return [];

		return documents.filter((doc) => {
			const docOwner = doc.owner;
			if (Array.isArray(docOwner)) {
				return docOwner.includes(currentDoc.doc_id);
			}
			return docOwner === currentDoc.doc_id;
		});
	}

	// Function to fetch document content
	async function fetchDocumentContent(docId: string) {
		try {
			loading = true;
			error = null;

			console.log('Fetching content for document:', docId);

			// Get the latest snapshot for this document
			const response = await hominio.agent.resources.docs.snapshots[docId].get();
			console.log('Response from snapshots endpoint:', response);

			if (
				response.data &&
				response.data.status === 'success' &&
				response.data.snapshots.length > 0
			) {
				const latestSnapshot = response.data.snapshots[0];
				console.log('Latest snapshot:', latestSnapshot);

				// Get the binary data directly from the snapshot
				const binaryData = latestSnapshot.binary_data;
				console.log('Binary data:', binaryData);

				if (binaryData) {
					try {
						// Create a new LoroDoc instance
						const doc = new LoroDoc();

						// Import the binary data
						doc.import(new Uint8Array(Object.values(binaryData)));

						// Get the document content
						const content = doc.toJSON();
						console.log('Parsed content:', content);

						if (content) {
							selectedOwnedDocContent = content;
						} else {
							error = 'No content in document';
							selectedOwnedDocContent = null;
						}
					} catch (importError) {
						console.error('Error importing document:', importError);
						error = `Error importing document: ${importError.message}`;
						selectedOwnedDocContent = null;
					}
				} else {
					error = 'No binary data in snapshot';
					selectedOwnedDocContent = null;
				}
			} else {
				console.log('No snapshots found or invalid response:', response);
				selectedOwnedDocContent = null;
				error = 'No content found for document';
			}
		} catch (e) {
			console.error('Error fetching document content:', e);
			error = e instanceof Error ? e.message : String(e);
			selectedOwnedDocContent = null;
		} finally {
			loading = false;
		}
	}

	// Function to select an owned document
	function selectOwnedDocument(doc: Document) {
		selectedOwnedDoc = doc;
		fetchDocumentContent(doc.doc_id);
	}

	// Function to format JSON for display with proper indentation
	function formatJSON(obj: any): string {
		try {
			return JSON.stringify(obj, null, 2);
		} catch (e) {
			console.error('Error formatting JSON:', e);
			return 'Error formatting document content';
		}
	}

	// Initialize on mount
	onMount(() => {
		fetchDocuments();
	});
</script>

<div class="w-screen min-h-screen bg-blue-950 text-emerald-100">
	<div class="w-full h-full p-6">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Server</h1>

		{#if error}
			<div class="p-3 mb-4 text-red-200 border border-red-700 rounded bg-red-900/50">
				{error}
			</div>
		{/if}

		<div class="flex w-full gap-6">
			<aside class="w-[320px] shrink-0">
				<h2 class="mb-4 text-xl font-semibold text-emerald-300">Registries</h2>

				{#if loading && registryDocs.length === 0}
					<div class="flex justify-center my-8">
						<div
							class="w-8 h-8 border-4 border-blue-800 rounded-full animate-spin border-t-emerald-500"
						></div>
					</div>
				{:else if registryDocs.length === 0}
					<div class="p-4 text-center rounded-md bg-blue-900/10 text-emerald-100/60">
						No registry documents found.
					</div>
				{:else}
					<div class="flex flex-col gap-3 mb-6">
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
							</button>
						{/each}
					</div>

					{#if selectedRegistry}
						{#if selectedRegistry.doc_id === HUMAN_REGISTRY_UUID}
							<h2
								class="pt-6 mb-4 text-xl font-semibold border-t border-blue-700/20 text-emerald-300"
							>
								Humans
							</h2>
						{:else if selectedRegistry.doc_id === DAO_REGISTRY_UUID}
							<h2
								class="pt-6 mb-4 text-xl font-semibold border-t border-blue-700/20 text-emerald-300"
							>
								DAOs
							</h2>
						{/if}

						{#if entryDocs.length === 0}
							<div class="p-4 text-center rounded-md bg-blue-900/10 text-emerald-100/60">
								No entries found in this registry.
							</div>
						{:else}
							<div class="flex flex-col gap-3">
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
									</button>
								{/each}
							</div>
						{/if}
					{/if}
				{/if}
			</aside>

			<main class="flex-1">
				{#if selectedDocId}
					<div class="p-6 border rounded-lg border-blue-700/20 bg-blue-900/5">
						<div class="pb-6 mb-6 border-b border-blue-700/20">
							<div class="flex items-center justify-between">
								<h3 class="text-2xl font-semibold text-emerald-300">
									{#if selectedEntry}
										{selectedEntry.name || selectedEntry.domain || 'Untitled'}
									{:else if selectedRegistry}
										{getRegistryType(selectedRegistry.doc_id)} Registry
									{:else}
										Document Details
									{/if}
								</h3>
								<span
									class={`${
										selectedEntry
											? getDocType(selectedEntry).bgColor
											: selectedRegistry
												? getDocType(selectedRegistry).bgColor
												: ''
									} ${
										selectedEntry
											? getDocType(selectedEntry).textColor
											: selectedRegistry
												? getDocType(selectedRegistry).textColor
												: ''
									} rounded px-2 py-0.5 text-xs font-medium`}
								>
									{#if selectedEntry}
										{getDocType(selectedEntry).label}
									{:else if selectedRegistry}
										{getDocType(selectedRegistry).label}
									{/if}
								</span>
							</div>
						</div>

						<div class="p-4 mb-8 border rounded-lg border-blue-700/20 bg-blue-900/10">
							<h4 class="mb-4 text-lg font-semibold text-emerald-300">Metadata</h4>
							<div class="grid gap-4 text-sm md:grid-cols-2">
								{#if selectedEntry || selectedRegistry}
									{#if selectedEntry?.domain || selectedRegistry?.domain}
										<div>
											<span class="text-emerald-100/60">Domain:</span>
											<span class="ml-2 font-mono text-emerald-100">
												{selectedEntry?.domain || selectedRegistry?.domain}
											</span>
										</div>
									{/if}
									<div>
										<span class="text-emerald-100/60">Document ID:</span>
										<span class="ml-2 font-mono text-emerald-100">
											{selectedEntry?.doc_id || selectedRegistry?.doc_id}
										</span>
									</div>
									<div>
										<span class="text-emerald-100/60">Type:</span>
										<span class="ml-2 font-mono text-emerald-100">
											{selectedEntry?.doc_type || selectedRegistry?.doc_type}
										</span>
									</div>
									<div>
										<span class="text-emerald-100/60">Last Updated:</span>
										<span class="ml-2 font-mono text-emerald-100">
											{selectedEntry?.last_updated || selectedRegistry?.last_updated
												? formatDate(
														selectedEntry?.last_updated || selectedRegistry?.last_updated || ''
													)
												: 'Never'}
										</span>
									</div>
									<div class="md:col-span-2">
										<span class="text-emerald-100/60">
											Owner{Array.isArray(selectedEntry?.owner || selectedRegistry?.owner)
												? 's'
												: ''}:
										</span>
										<span class="ml-2 font-mono text-emerald-100">
											{getOwnerName(selectedEntry?.owner || selectedRegistry?.owner || '')}
										</span>
									</div>
								{/if}
							</div>
						</div>

						<div class="mb-6 border-b border-blue-700/20">
							<div class="flex gap-4">
								<button
									class={`pb-3 text-sm font-medium transition-colors ${
										activeTab === 'docs'
											? 'border-b-2 border-emerald-500 text-emerald-400'
											: 'text-emerald-100/60 hover:text-emerald-100'
									}`}
									on:click={() => (activeTab = 'docs')}
								>
									Owned Documents
								</button>
								<button
									class={`pb-3 text-sm font-medium transition-colors ${
										activeTab === 'snapshots'
											? 'border-b-2 border-emerald-500 text-emerald-400'
											: 'text-emerald-100/60 hover:text-emerald-100'
									}`}
									on:click={() => (activeTab = 'snapshots')}
								>
									Snapshots
								</button>
							</div>
						</div>

						{#if activeTab === 'docs'}
							<div>
								<h4 class="mb-4 text-lg font-semibold text-emerald-300">Owned Documents</h4>
								{#if getOwnedDocs().length > 0}
									<div class="space-y-3">
										{#each getOwnedDocs() as doc}
											<button
												class={`w-full rounded-md border ${
													selectedOwnedDoc?.doc_id === doc.doc_id
														? 'border-emerald-500/50 bg-emerald-900/20'
														: 'border-blue-700/20 bg-blue-900/10 hover:bg-blue-900/20'
												} p-3 text-left transition-all`}
												on:click={() => selectOwnedDocument(doc)}
											>
												<div class="flex items-center justify-between">
													<div class="font-medium text-emerald-200">
														{doc.name || doc.domain || 'Untitled'}
													</div>
													<span
														class={`${getDocType(doc).bgColor} ${
															getDocType(doc).textColor
														} rounded px-2 py-0.5 text-xs`}
													>
														{getDocType(doc).label}
													</span>
												</div>
												<div class="mt-2 text-xs text-emerald-100/70">
													ID: {doc.doc_id}
												</div>
											</button>
										{/each}
									</div>
								{:else}
									<div class="p-4 text-center rounded-md bg-blue-900/10 text-emerald-100/60">
										No owned documents found.
									</div>
								{/if}
							</div>
						{:else}
							<div>
								<h4 class="mb-4 text-lg font-semibold text-emerald-300">Snapshots</h4>
								{#if snapshots.length > 0}
									<div class="space-y-3">
										{#each snapshots as snapshot}
											<div class="p-3 border rounded-md border-blue-700/20 bg-blue-900/10">
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
								{:else}
									<div class="p-4 text-center rounded-md bg-blue-900/10 text-emerald-100/60">
										No snapshots available for this document.
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<div
						class="flex items-center justify-center h-full p-6 border rounded-lg border-blue-700/20 bg-blue-900/5"
					>
						<p class="text-emerald-100/60">Select a document to view its details and snapshots.</p>
					</div>
				{/if}
			</main>

			<aside class="w-1/3 shrink-0">
				{#if selectedOwnedDoc}
					<div class="p-6 border rounded-lg border-blue-700/20 bg-blue-900/5">
						<div class="pb-6 mb-6 border-b border-blue-700/20">
							<div class="flex items-center justify-between">
								<h3 class="text-xl font-semibold text-emerald-300">
									{selectedOwnedDoc.name || selectedOwnedDoc.domain || 'Untitled'}
								</h3>
								<span
									class={`${getDocType(selectedOwnedDoc).bgColor} ${
										getDocType(selectedOwnedDoc).textColor
									} rounded px-2 py-0.5 text-xs font-medium`}
								>
									{getDocType(selectedOwnedDoc).label}
								</span>
							</div>
						</div>
						{#if loading}
							<div class="flex justify-center py-8">
								<div
									class="w-8 h-8 border-4 border-blue-800 rounded-full animate-spin border-t-emerald-500"
								/>
							</div>
						{:else if selectedOwnedDocContent}
							<div class="p-4 border rounded-lg border-blue-700/20 bg-blue-900/10">
								<div class="max-h-[calc(100vh-20rem)] overflow-auto">
									<pre
										class="font-mono text-sm break-words whitespace-pre-wrap text-emerald-100/90">{JSON.stringify(
											selectedOwnedDocContent,
											null,
											2
										)}</pre>
								</div>
							</div>
						{:else}
							<div class="p-4 text-center rounded-md bg-blue-900/10 text-emerald-100/60">
								No content available for this document.
							</div>
						{/if}
					</div>
				{:else}
					<div
						class="flex items-center justify-center h-full p-6 border rounded-lg border-blue-700/20 bg-blue-900/5"
					>
						<p class="text-emerald-100/60">Select an owned document to view its content.</p>
					</div>
				{/if}
			</aside>
		</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow-x: hidden;
	}
</style> -->
