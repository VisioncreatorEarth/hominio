<!-- 
  Registry Page - Displays and manages the document registry
  This page lists all documents registered in the system
-->
<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { LoroDoc } from 'loro-crdt';
	import { hominio } from '$lib/client/hominio';
	import type { Writable } from 'svelte/store';

	// Constants for the registry
	const GENESIS_UUID = '00000000-0000-0000-0000-000000000000';
	const ROOT_REGISTRY_TITLE = 'o.homin.io';

	// Registry document entry type
	interface RegistryDocEntry {
		uuid: string;
		docType: string;
		title: string;
		createdAt: number;
		currentSnapshotId: string;
		meta?: Record<string, unknown>;
	}

	// Server document type
	interface ServerDocument {
		doc_id: string;
		title: string;
		doc_type: string;
		snapshot_count: number;
		last_updated: string;
	}

	// Interface for the storage service to load/save documents
	interface StorageService {
		saveSnapshot: (docId: string, loroDoc: LoroDoc, docType: string, meta?: any) => Promise<void>;
		loadSnapshot: (docId: string, loroDoc: LoroDoc) => Promise<boolean>;
	}

	// Registry interface for accessing and updating documents
	interface LoroDocsRegistry {
		update: (
			fn: (docs: Record<string, { doc: LoroDoc }>) => Record<string, { doc: LoroDoc }>
		) => void;
		subscribe: (subscriber: (value: Record<string, { doc: LoroDoc }>) => void) => () => void;
	}

	// Storage info interface
	interface StorageInfo {
		isInitialized: boolean;
		clientId: string;
	}

	// Get services from context
	const loroStorage = getContext<StorageService>('loro-storage');
	const loroDocsRegistry = getContext<LoroDocsRegistry>('loro-docs');
	const storageInfo = getContext<Writable<StorageInfo>>('storage-info');

	// State variables
	let loading = $state(true);
	let errorMessage = $state<string | null>(null);
	let registryDoc = $state<LoroDoc | null>(null);
	let documents = $state<RegistryDocEntry[]>([]);
	let serverDocuments = $state<ServerDocument[]>([]);
	let expandedDocs = $state<Record<string, boolean>>({});

	// Format date for display
	function formatDate(timestamp: number | undefined): string {
		if (!timestamp) return 'Unknown';
		return new Date(timestamp).toLocaleString();
	}

	// Format document types with color coding
	function getDocTypeStyle(docType: string) {
		switch (docType) {
			case 'dao':
				return 'bg-purple-600/20 text-purple-300';
			case 'todos':
				return 'bg-green-600/20 text-green-300';
			default:
				return 'bg-blue-600/20 text-blue-300';
		}
	}

	// Go to document page
	function navigateToDoc(uuid: string, docType: string) {
		if (docType === 'todos') {
			window.location.href = '/todos';
		} else {
			console.log(`No specific route for document type: ${docType}`);
		}
	}

	// Toggle document details expansion
	function toggleDocDetails(uuid: string) {
		expandedDocs[uuid] = !expandedDocs[uuid];
		expandedDocs = { ...expandedDocs };
	}

	// Get or load the registry document
	async function loadRegistry() {
		loading = true;
		errorMessage = null;

		try {
			// Try to get the server registry first
			await loadServerRegistry();

			// Then load the local registry for client-side operations
			await loadLocalRegistry();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
			console.error('Error loading registry:', error);
		} finally {
			loading = false;
		}
	}

	// Load registry info from the server
	async function loadServerRegistry() {
		try {
			// @ts-expect-error - Eden type mismatch but this works
			const response = await hominio.agent.resources.docs.get();
			if (response.data && response.data.status === 'success') {
				serverDocuments = response.data.documents || [];
			}
		} catch (error) {
			console.warn('Could not fetch server registry:', error);
			// Non-fatal - we still use the local registry
		}
	}

	// Load registry from local storage
	async function loadLocalRegistry() {
		// First check if we already have this loro doc in our app registry
		let existingRegistryDoc = false;
		let registry: LoroDoc = new LoroDoc();

		loroDocsRegistry.update((docs) => {
			if (docs[GENESIS_UUID]) {
				registry = docs[GENESIS_UUID].doc;
				existingRegistryDoc = true;
			}
			return docs;
		});

		// If we found it in the registry, use it
		if (existingRegistryDoc) {
			registryDoc = registry;
			loadDocumentsFromRegistry();
			return;
		}

		// Otherwise, try to load from storage
		registry = new LoroDoc();
		const loaded = await loroStorage.loadSnapshot(GENESIS_UUID, registry);

		if (loaded) {
			// Register the doc in our global registry
			loroDocsRegistry.update((docs) => {
				docs[GENESIS_UUID] = { doc: registry };
				return docs;
			});

			registryDoc = registry;
			loadDocumentsFromRegistry();
		} else {
			// Registry doesn't exist locally yet, use server data
			console.log('Registry does not exist locally, relying on server data');
		}
	}

	// Load documents from the registry
	function loadDocumentsFromRegistry() {
		if (!registryDoc) return;

		try {
			const docsMap = registryDoc.getMap('documents');
			if (!docsMap) return;

			const entries: RegistryDocEntry[] = [];
			const keys = docsMap.keys();

			for (const key of keys) {
				const entry = docsMap.get(key);
				if (entry) {
					entries.push(entry as RegistryDocEntry);
				}
			}

			// Sort documents by createdAt in descending order (newest first)
			documents = entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

			// Make sure the root registry is included if it exists locally but is not in the document list
			const hasRootRegistry = documents.some((doc) => doc.uuid === GENESIS_UUID);

			if (!hasRootRegistry && registryDoc) {
				documents.unshift({
					uuid: GENESIS_UUID,
					docType: 'dao',
					title: ROOT_REGISTRY_TITLE,
					createdAt: Date.now(),
					currentSnapshotId: 'local-only'
				});
			}
		} catch (error) {
			console.error('Error loading documents from registry:', error);
		}
	}

	// Initialize on mount
	onMount(() => {
		loadRegistry();

		// Make available for debugging
		(window as any).registryDoc = registryDoc;
	});

	// Get reactive values from the storage info store
	let storageInitialized = $derived($storageInfo.isInitialized);
	let clientId = $derived($storageInfo.clientId);
</script>

<div class="min-h-screen bg-blue-950 text-emerald-100">
	<div class="mx-auto max-w-4xl px-4 py-6">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Document Registry</h1>

		{#if errorMessage}
			<div class="mb-6 rounded-md border-l-4 border-red-500 bg-red-900/30 p-4 text-red-200">
				<p class="text-lg font-semibold">Error</p>
				<p>{errorMessage}</p>
			</div>
		{/if}

		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div
					class="h-10 w-10 animate-spin rounded-full border-t-2 border-b-2 border-emerald-500"
				></div>
				<span class="ml-3 text-lg text-emerald-300">Loading registry...</span>
			</div>
		{:else}
			<!-- Registry Info -->
			<div class="mb-8 rounded border border-purple-700/30 bg-purple-900/10 p-4 shadow-md">
				<h2 class="mb-3 text-xl font-semibold text-purple-300">Registry Information</h2>
				<div class="grid gap-2 text-sm md:grid-cols-2">
					<div class="font-semibold text-emerald-200">UUID:</div>
					<div class="font-mono text-emerald-100">{GENESIS_UUID}</div>

					<div class="font-semibold text-emerald-200">Title:</div>
					<div class="text-emerald-100">{ROOT_REGISTRY_TITLE}</div>

					<div class="font-semibold text-emerald-200">Storage Status:</div>
					<div class="text-emerald-100">{storageInitialized ? 'Ready' : 'Initializing...'}</div>

					<div class="font-semibold text-emerald-200">Local Documents:</div>
					<div class="text-emerald-100">{documents.length}</div>

					<div class="font-semibold text-emerald-200">Server Documents:</div>
					<div class="text-emerald-100">{serverDocuments.length}</div>
				</div>
			</div>

			<!-- Documents Display -->
			<div>
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-xl font-semibold text-emerald-300">Documents</h2>
					<button
						on:click={loadRegistry}
						class="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-blue-500"
					>
						Refresh
					</button>
				</div>

				{#if serverDocuments.length === 0 && documents.length === 0}
					<p class="rounded-md bg-blue-900/20 p-6 text-center text-emerald-100/70">
						No documents found in the registry.
						<br />Create a document using one of the available document types.
					</p>
				{:else}
					<!-- Server Documents Section -->
					{#if serverDocuments.length > 0}
						<h3 class="mb-2 text-lg font-medium text-emerald-200">Server Documents</h3>
						<div class="mb-6 space-y-3">
							{#each serverDocuments as doc}
								<div
									class="rounded border border-emerald-700/20 bg-blue-900/30 p-4 shadow-md transition-colors hover:bg-blue-900/40"
								>
									<div class="mb-2 flex items-center justify-between">
										<div class="flex items-center gap-2">
											<span class="font-medium text-emerald-300">{doc.title || 'Untitled'}</span>
											<span
												class={`rounded px-2 py-0.5 text-xs font-medium ${getDocTypeStyle(
													doc.doc_type
												)}`}
											>
												{doc.doc_type.toUpperCase()}
											</span>

											{#if doc.doc_id === GENESIS_UUID}
												<span
													class="rounded bg-indigo-500/40 px-2 py-0.5 text-xs font-bold text-indigo-200"
												>
													GENESIS
												</span>
											{/if}
										</div>

										<div class="flex gap-2">
											<button
												on:click={() => toggleDocDetails(doc.doc_id)}
												class="rounded px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-900/30"
											>
												{expandedDocs[doc.doc_id] ? 'Hide' : 'Details'}
											</button>

											{#if doc.doc_type === 'todos'}
												<button
													on:click={() => navigateToDoc(doc.doc_id, doc.doc_type)}
													class="rounded bg-emerald-600/80 px-2 py-1 text-xs font-medium text-black hover:bg-emerald-500"
												>
													Open
												</button>
											{/if}
										</div>
									</div>

									{#if expandedDocs[doc.doc_id]}
										<div class="mt-3 grid grid-cols-2 gap-2 rounded bg-blue-950/50 p-3 text-xs">
											<span class="text-emerald-100/70">Document ID:</span>
											<span class="font-mono text-emerald-100">{doc.doc_id}</span>

											<span class="text-emerald-100/70">Snapshots:</span>
											<span class="text-emerald-100">{doc.snapshot_count}</span>

											<span class="text-emerald-100/70">Last Updated:</span>
											<span class="text-emerald-100"
												>{doc.last_updated
													? new Date(doc.last_updated).toLocaleString()
													: 'Unknown'}</span
											>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Local Documents Section -->
					{#if documents.length > 0}
						<h3 class="mb-2 text-lg font-medium text-emerald-200">Local Documents</h3>
						<div class="space-y-3">
							{#each documents as doc}
								<div
									class="rounded border border-emerald-700/20 bg-blue-900/30 p-4 shadow-md transition-colors hover:bg-blue-900/40"
								>
									<div class="mb-2 flex items-center justify-between">
										<div class="flex items-center gap-2">
											<span class="font-medium text-emerald-300">{doc.title || 'Untitled'}</span>
											<span
												class={`rounded px-2 py-0.5 text-xs font-medium ${getDocTypeStyle(
													doc.docType
												)}`}
											>
												{doc.docType.toUpperCase()}
											</span>

											{#if doc.uuid === GENESIS_UUID}
												<span
													class="rounded bg-indigo-500/40 px-2 py-0.5 text-xs font-bold text-indigo-200"
												>
													GENESIS
												</span>
											{/if}
										</div>

										<div class="flex gap-2">
											<button
												on:click={() => toggleDocDetails(doc.uuid)}
												class="rounded px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-900/30"
											>
												{expandedDocs[doc.uuid] ? 'Hide' : 'Details'}
											</button>

											{#if doc.docType === 'todos'}
												<button
													on:click={() => navigateToDoc(doc.uuid, doc.docType)}
													class="rounded bg-emerald-600/80 px-2 py-1 text-xs font-medium text-black hover:bg-emerald-500"
												>
													Open
												</button>
											{/if}
										</div>
									</div>

									{#if expandedDocs[doc.uuid]}
										<div class="mt-3 grid grid-cols-2 gap-2 rounded bg-blue-950/50 p-3 text-xs">
											<span class="text-emerald-100/70">Document UUID:</span>
											<span class="font-mono text-emerald-100">{doc.uuid}</span>

											<span class="text-emerald-100/70">Created At:</span>
											<span class="text-emerald-100">{formatDate(doc.createdAt)}</span>

											<span class="text-emerald-100/70">Snapshot:</span>
											<span class="truncate font-mono text-emerald-100"
												>{doc.currentSnapshotId}</span
											>

											{#if doc.meta}
												<span class="text-emerald-100/70">Metadata:</span>
												<span class="font-mono text-emerald-100">{JSON.stringify(doc.meta)}</span>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>
