<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { LoroDoc, type LoroMap } from 'loro-crdt';
	import { generateUUID } from '$lib/utils/uuid';
	import type { Writable } from 'svelte/store';

	// Constants - use the genesis UUID for the root registry
	const GENESIS_UUID = '00000000-0000-0000-0000-000000000000';
	const ROOT_REGISTRY_DOC_ID = GENESIS_UUID;
	const ROOT_REGISTRY_TITLE = 'o.homin.io';

	// Interface for registry document entry
	interface RegistryDocEntry {
		uuid: string; // UUID as primary identifier
		docType: string;
		title: string;
		createdAt: number;
		currentSnapshotId: string;
		meta?: Record<string, unknown>;
	}

	// Type definitions for context values
	interface StorageService {
		saveSnapshot: (docId: string, loroDoc: LoroDoc, docType: string, meta?: any) => Promise<void>;
		loadSnapshot: (docId: string, loroDoc: LoroDoc) => Promise<boolean>;
	}

	interface LoroDocsRegistry {
		update: (
			fn: (docs: Record<string, { doc: LoroDoc }>) => Record<string, { doc: LoroDoc }>
		) => void;
	}

	interface StorageInfo {
		mode: 'native' | 'indexeddb' | 'not-initialized';
		path: string | null;
		isInitialized: boolean;
		clientId: string;
	}

	// Get services from context
	const loroStorage = getContext<StorageService>('loro-storage');
	const loroDocsRegistry = getContext<LoroDocsRegistry>('loro-docs');
	const storageInfo = getContext<Writable<StorageInfo>>('storage-info');

	// State variables
	let registryDoc: LoroDoc | null = null;
	let documents: RegistryDocEntry[] = [];
	let isLoading = true;
	let error: string | null = null;
	let selectedDocId: string | null = null;
	let expandedDocIds = new Set<string>();

	// Function to load document from storage
	async function loadFromStorage(docId: string, doc: LoroDoc): Promise<boolean> {
		try {
			const success = await loroStorage.loadSnapshot(docId, doc);
			return success;
		} catch (err) {
			console.error(`Error loading doc ${docId} from storage:`, err);
			return false;
		}
	}

	// Format date for display
	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}

	// Navigate to document route
	function navigateToDocument(uuid: string, docType: string): void {
		if (docType === 'todos') {
			window.location.href = '/todos';
		} else {
			// For future document types, add routing here
			console.log(`Document type ${docType} doesn't have a dedicated route yet`);
		}
	}

	// Toggle document details expansion
	function toggleExpand(uuid: string): void {
		if (expandedDocIds.has(uuid)) {
			expandedDocIds.delete(uuid);
		} else {
			expandedDocIds.add(uuid);
		}
		// Force reactivity update
		expandedDocIds = new Set(expandedDocIds);
	}

	// View document details
	function viewDocumentDetails(uuid: string): void {
		selectedDocId = uuid;
	}

	// Load registry and its documents
	async function loadRegistry() {
		isLoading = true;
		error = null;
		documents = [];

		try {
			// Check if registry document is already in memory
			let existingRegistryDoc = false;

			loroDocsRegistry.update((docs) => {
				if (docs[ROOT_REGISTRY_DOC_ID]) {
					registryDoc = docs[ROOT_REGISTRY_DOC_ID].doc;
					existingRegistryDoc = true;
				}
				return docs;
			});

			// If not found in registry, create a new one
			if (!existingRegistryDoc) {
				registryDoc = new LoroDoc();

				// Try to load from storage
				const loaded = await loadFromStorage(ROOT_REGISTRY_DOC_ID, registryDoc);

				if (!loaded) {
					// Initialize if not loaded
					registryDoc.getMap('documents');

					// Register the doc
					loroDocsRegistry.update((docs) => {
						if (registryDoc) {
							docs[ROOT_REGISTRY_DOC_ID] = { doc: registryDoc };
						}
						return docs;
					});
				}
			}

			// Get documents from registry
			if (registryDoc) {
				const docsMap = registryDoc.getMap('documents');

				// Convert to array for display
				const entries: RegistryDocEntry[] = [];

				// Iterate over all entries using keys() and get()
				const keys = docsMap.keys();
				for (const key of keys) {
					const value = docsMap.get(key);
					if (value) {
						const entry = value as RegistryDocEntry;
						entries.push({
							uuid: entry.uuid || key,
							docType: entry.docType || 'unknown',
							title: entry.title || 'Untitled Document',
							createdAt: entry.createdAt || 0,
							currentSnapshotId: entry.currentSnapshotId || '',
							meta: entry.meta || {}
						});
					}
				}

				// Add the registry itself
				if (!entries.some((entry) => entry.uuid === ROOT_REGISTRY_DOC_ID)) {
					entries.push({
						uuid: ROOT_REGISTRY_DOC_ID,
						docType: 'dao',
						title: ROOT_REGISTRY_TITLE,
						createdAt: Date.now(), // Use current timestamp since we don't know when it was created
						currentSnapshotId: '', // We don't know the snapshot ID
						meta: {}
					});
				}

				// Sort by creation date (newest first)
				documents = entries.sort((a, b) => b.createdAt - a.createdAt);
			}
		} catch (err) {
			console.error('Error loading registry:', err);
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}

	// Initialize on mount
	onMount(() => {
		loadRegistry();

		// Make registry available for debugging
		if (registryDoc) {
			(window as any).registryDoc = registryDoc;
		}
	});

	// Get reactive values from the storage info store
	$: ({ isInitialized } = $storageInfo);
	$: if (isInitialized && isLoading) {
		loadRegistry();
	}
</script>

<div class="min-h-full bg-blue-950 text-emerald-100">
	<div class="mx-auto max-w-4xl">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Document Registry</h1>

		{#if isLoading}
			<!-- Loading State -->
			<div class="p-8 text-center">
				<div
					class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-800 border-t-emerald-500"
				></div>
				<p class="mt-4 text-emerald-200">Loading registry...</p>
			</div>
		{:else if error}
			<!-- Error State -->
			<div class="rounded border border-red-500/30 bg-red-900/20 p-4 text-red-300">
				<h3 class="mb-2 font-semibold">Error loading registry</h3>
				<p>{error}</p>
				<button
					on:click={loadRegistry}
					class="mt-4 rounded bg-red-800 px-4 py-2 text-sm text-white hover:bg-red-700"
				>
					Retry
				</button>
			</div>
		{:else if documents.length === 0}
			<!-- Empty State -->
			<div class="rounded border border-blue-700 bg-blue-900/30 p-8 text-center">
				<p class="text-emerald-200">No documents found in the registry</p>
			</div>
		{:else}
			<!-- Document List -->
			<div class="space-y-4">
				{#each documents as doc (doc.uuid)}
					<div
						class="rounded border border-emerald-500/10 bg-blue-900/40 p-4 transition-colors hover:bg-blue-900/60"
					>
						<div class="flex items-center justify-between">
							<div>
								<h3 class="text-lg font-medium text-emerald-300">{doc.title}</h3>
								<p class="text-sm text-emerald-100/70">
									{doc.docType} · Created {formatDate(doc.createdAt)}
								</p>
							</div>
							<div class="flex space-x-2">
								<button
									on:click={() => toggleExpand(doc.uuid)}
									class="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20"
								>
									{expandedDocIds.has(doc.uuid) ? 'Hide Details' : 'Show Details'}
								</button>

								{#if doc.uuid !== ROOT_REGISTRY_DOC_ID}
									<button
										on:click={() => navigateToDocument(doc.uuid, doc.docType)}
										class="rounded bg-emerald-600 px-3 py-1 text-sm text-black transition-colors hover:bg-emerald-500"
									>
										Open
									</button>
								{/if}
							</div>
						</div>

						{#if expandedDocIds.has(doc.uuid)}
							<div class="mt-4 rounded border border-blue-800/50 bg-blue-900/50 p-4">
								<h4 class="mb-2 text-sm font-medium text-emerald-300">Document Details</h4>
								<div class="grid grid-cols-2 gap-2 text-xs">
									<span class="text-emerald-100/50">UUID:</span>
									<span class="font-mono text-emerald-100">{doc.uuid}</span>

									<span class="text-emerald-100/50">Document Type:</span>
									<span class="text-emerald-100">{doc.docType}</span>

									{#if doc.currentSnapshotId}
										<span class="text-emerald-100/50">Current Snapshot:</span>
										<span class="truncate font-mono text-emerald-100">{doc.currentSnapshotId}</span>
									{/if}

									<span class="text-emerald-100/50">Created:</span>
									<span class="text-emerald-100">{formatDate(doc.createdAt)}</span>
								</div>

								{#if doc.meta && Object.keys(doc.meta).length > 0}
									<h4 class="mt-4 mb-2 text-sm font-medium text-emerald-300">Metadata</h4>
									<div class="grid grid-cols-2 gap-2 text-xs">
										{#each Object.entries(doc.meta) as [key, value]}
											<span class="text-emerald-100/50">{key}:</span>
											<span class="text-emerald-100">{JSON.stringify(value)}</span>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Registry Debug Info -->
			<div class="mt-8 rounded border border-blue-800/50 bg-blue-900/60 p-4">
				<h3 class="mb-2 text-sm font-medium text-emerald-300">Registry Information</h3>
				<div class="grid grid-cols-2 gap-2 text-xs">
					<span class="text-emerald-100/50">Registry UUID:</span>
					<span class="font-mono text-emerald-100">{ROOT_REGISTRY_DOC_ID}</span>

					<span class="text-emerald-100/50">Registry Title:</span>
					<span class="text-emerald-100">{ROOT_REGISTRY_TITLE}</span>

					<span class="text-emerald-100/50">Total Documents:</span>
					<span class="text-emerald-100">{documents.length}</span>

					<span class="text-emerald-100/50">Storage Status:</span>
					<span class="text-emerald-100">{isInitialized ? 'Initialized' : 'Not Initialized'}</span>
				</div>
			</div>
		{/if}
	</div>
</div>
