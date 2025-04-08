<script lang="ts">
	import { onMount } from 'svelte';
	import { hominio } from '$lib/client/hominio';
	import { LoroDoc } from 'loro-crdt';

	// Define proper types
	type Doc = {
		pubKey: string;
		title: string;
		snapshotCid: string;
		updateCids: string[];
		ownerId: string;
		createdAt: string;
		updatedAt: string;
		description?: string;
	};

	type ContentItem = {
		cid: string;
		type: string;
		data: Record<string, unknown>;
		verified: boolean;
		createdAt: string;
	};

	// New combined response type
	type DocWithContent = {
		document: Doc;
		content?: ContentItem;
	};

	let docs: Doc[] = [];
	let contentMap = new Map<string, ContentItem>();
	let loading = true;
	let error: string | null = null;
	let selectedDoc: Doc | null = null;
	let autoSelectFirstDoc = false; // Set to false to prevent auto-selection
	let creatingDoc = false;
	let updatingDoc = false;
	let updateMessage: string | null = null;

	async function fetchDocs() {
		try {
			loading = true;
			error = null;

			// Use the correct Eden Treaty syntax - with empty object parameter
			const docsResponse = await hominio.api.docs.get({});

			if (!docsResponse.data) {
				throw new Error('Failed to fetch documents');
			}

			docs = docsResponse.data as Doc[];

			// Only select first doc if auto-select is enabled
			if (docs.length > 0 && autoSelectFirstDoc && !selectedDoc) {
				selectedDoc = docs[0];
			}
		} catch (e) {
			const err = e as Error;
			error = err.message || 'Failed to fetch documents';
			console.error('Error fetching docs:', e);
		} finally {
			loading = false;
		}
	}

	async function selectDoc(doc: Doc) {
		try {
			selectedDoc = doc;

			// Use the correct Eden Treaty syntax - with empty object parameter
			const response = await hominio.api.docs[doc.pubKey].get({});

			console.log('Document response:', response);

			if (response && response.data) {
				if (response.data.content) {
					// Store content in the contentMap
					contentMap.set(doc.pubKey, response.data.content as ContentItem);
				}

				// If we're using a full response with document included, update the selected doc
				if (response.data.document) {
					selectedDoc = response.data.document as Doc;
				}
			}
		} catch (e) {
			console.error(`Error fetching doc with content for ${doc.pubKey}:`, e);
		}
	}

	async function createNewDocument() {
		try {
			if (creatingDoc) return; // Prevent multiple clicks

			creatingDoc = true;

			// Call the create document API - with empty object parameter
			const response = await hominio.api.docs.post({});

			if (response && response.data && response.data.success) {
				console.log('Created new document:', response.data.document);

				// Add the new document to the list
				const newDoc = response.data.document as Doc;
				docs = [newDoc, ...docs];

				// Select the new document
				await selectDoc(newDoc);
			} else {
				throw new Error(response?.data?.error || 'Failed to create document');
			}
		} catch (e) {
			const err = e as Error;
			error = err.message || 'Failed to create document';
			console.error('Error creating document:', e);
		} finally {
			creatingDoc = false;
		}
	}

	async function updateDocument() {
		try {
			if (!selectedDoc || updatingDoc) return;

			updatingDoc = true;
			updateMessage = null;

			// Get the current content data to create a meaningful update
			const contentData = contentMap.get(selectedDoc.pubKey);
			if (!contentData) {
				throw new Error('Document content not loaded');
			}

			// Get the binary data from content
			const itemData = contentData.data as Record<string, unknown>;
			const binaryData = itemData.binary;

			if (!Array.isArray(binaryData)) {
				throw new Error('Invalid document binary data');
			}

			// Create a new Loro document and import the current snapshot
			const loroDoc = new LoroDoc();
			loroDoc.setPeerId(Math.floor(Math.random() * 1000000)); // Random peer ID

			// Convert the array back to Uint8Array and import
			const binaryArray = new Uint8Array(binaryData);
			loroDoc.import(binaryArray);

			// Make changes to the document using Loro CRDT operations
			// Update the title with a timestamp to show changes
			const newTitle = `Updated ${new Date().toLocaleTimeString()}`;
			loroDoc.getText('title').insert(0, newTitle);

			// Generate the update binary data using Loro's export function
			const updateBinary = loroDoc.export({ mode: 'update' });

			// Call the update endpoint with the proper Loro binary update
			const response = await hominio.api.docs[selectedDoc.pubKey].update.post({
				binaryUpdate: Array.from(updateBinary) // Convert Uint8Array to regular array for JSON
			});

			if (response && response.data && response.data.success) {
				console.log('Updated document:', response.data);

				// Refresh the document to get the updated data
				await selectDoc(selectedDoc);

				// Show success message
				updateMessage = 'Document updated successfully!';
			} else {
				throw new Error(response?.data?.error || 'Failed to update document');
			}
		} catch (e) {
			const err = e as Error;
			updateMessage = 'Error: ' + (err.message || 'Failed to update document');
			console.error('Error updating document:', e);
		} finally {
			updatingDoc = false;
		}
	}

	// Process data to remove binary property
	function processContentData(data: Record<string, unknown>): Record<string, unknown> {
		if (!data) return {};

		const processed = { ...data };
		if (processed.binary) {
			delete processed.binary;
		}
		return processed;
	}

	onMount(() => {
		fetchDocs();
	});
</script>

<div class="min-h-screen bg-[#0F1525] text-slate-200">
	<!-- Sidebar and Main Content Layout -->
	<div class="grid min-h-screen grid-cols-[250px_1fr]">
		<!-- Sidebar - Doc List -->
		<aside class="flex flex-col overflow-y-auto border-r border-slate-700 bg-[#0F1525]">
			<div class="border-b border-slate-700 p-4">
				<h1 class="text-xl font-bold text-white">Documents</h1>
			</div>

			<!-- Create New Document Button -->
			<div class="border-b border-slate-700 p-4">
				<button
					class="flex w-full items-center justify-center rounded-md bg-blue-600 py-2 text-white transition-colors hover:bg-blue-700"
					on:click={createNewDocument}
					disabled={creatingDoc}
				>
					{#if creatingDoc}
						<div
							class="mr-2 h-5 w-5 animate-spin rounded-full border-t-2 border-b-2 border-white"
						></div>
						Creating...
					{:else}
						<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						New Document
					{/if}
				</button>
			</div>

			{#if loading && docs.length === 0}
				<div class="flex h-32 items-center justify-center">
					<div
						class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-blue-500"
					></div>
				</div>
			{:else if error && docs.length === 0}
				<div class="p-4">
					<div class="rounded-lg bg-red-900/50 p-3 text-sm">
						<p class="text-red-300">{error}</p>
						<button
							class="mt-2 rounded-md bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600"
							on:click={fetchDocs}
						>
							Retry
						</button>
					</div>
				</div>
			{:else if docs.length === 0}
				<div class="flex flex-grow flex-col items-center justify-center p-4 text-center">
					<svg
						class="mb-3 h-12 w-12 text-slate-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
					<p class="mb-4 text-slate-400">No documents found</p>
					<p class="text-sm text-slate-500">
						Click the "New Document" button to create your first document
					</p>
				</div>
			{:else}
				<div class="flex-grow overflow-y-auto">
					{#each docs as doc}
						<div
							class="cursor-pointer border-b border-slate-700 p-4 hover:bg-slate-800 {selectedDoc?.pubKey ===
							doc.pubKey
								? 'bg-slate-800'
								: ''}"
							on:click={() => selectDoc(doc)}
						>
							<h2 class="font-medium text-blue-400">{doc.title}</h2>
							<p class="mt-1 truncate text-xs text-slate-400">
								{doc.description || 'No description'}
							</p>
							<div class="mt-1 font-mono text-xs text-slate-300">
								{doc.pubKey.substring(0, 10)}...
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</aside>

		<!-- Main Content Area -->
		<main class="flex-grow">
			{#if selectedDoc}
				<!-- Document title at the top -->
				<div class="p-6 pb-0">
					<h1 class="text-3xl font-bold text-blue-400">{selectedDoc.title}</h1>
					<p class="mb-6 text-slate-300">
						{selectedDoc.description || 'A document using Loro CRDT'}
					</p>

					<!-- Update Document Button -->
					<div class="mb-4">
						<button
							class="flex items-center rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
							on:click={updateDocument}
							disabled={updatingDoc}
						>
							{#if updatingDoc}
								<div
									class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
								></div>
								Updating...
							{:else}
								<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
								Update Document
							{/if}
						</button>

						{#if updateMessage}
							<div
								class="mt-2 text-sm {updateMessage.startsWith('Error')
									? 'text-red-400'
									: 'text-green-400'}"
							>
								{updateMessage}
							</div>
						{/if}
					</div>
				</div>

				<!-- 50/50 split content area -->
				<div class="grid grid-cols-2">
					<!-- Left side: Document Metadata -->
					<div class="overflow-y-auto p-6 pt-0">
						<h2 class="mb-4 text-xl font-bold">Document Metadata</h2>

						<div class="space-y-2">
							<div>
								<span class="font-medium">Public Key:</span>
								<span class="ml-2 font-mono">{selectedDoc.pubKey}</span>
							</div>
							<div>
								<span class="font-medium">Owner ID:</span>
								<span class="ml-2 font-mono">{selectedDoc.ownerId}</span>
							</div>
							<div>
								<span class="font-medium">Created:</span>
								<span class="ml-2">
									{new Date(selectedDoc.createdAt).toLocaleString()}
								</span>
							</div>
							<div>
								<span class="font-medium">Updated:</span>
								<span class="ml-2">
									{new Date(selectedDoc.updatedAt).toLocaleString()}
								</span>
							</div>
							<div>
								<span class="font-medium">Snapshot CID:</span>
								<div class="ml-2 font-mono break-all">{selectedDoc.snapshotCid}</div>
							</div>

							<!-- Display Update CIDs -->
							<div>
								<span class="font-medium">Updates:</span>
								{#if selectedDoc.updateCids && selectedDoc.updateCids.length > 0}
									<div class="ml-2 font-mono">
										{#each selectedDoc.updateCids as cid}
											<div class="mt-1 text-xs break-all">{cid}</div>
										{/each}
									</div>
								{:else}
									<div class="ml-2 text-slate-400">No updates</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Right side: Content Snapshot -->
					<div class="overflow-y-auto border-l border-slate-700 p-6 pt-0">
						<h2 class="mb-4 text-xl font-bold">Content Snapshot</h2>

						{#if !selectedDoc.snapshotCid}
							<div>
								<p class="text-slate-400">No content snapshot associated with this document</p>
							</div>
						{:else if contentMap.has(selectedDoc.pubKey)}
							<div>
								{#if contentMap.get(selectedDoc.pubKey)?.verified}
									<div class="mb-4 text-green-400">✓ Content verified</div>
								{:else}
									<div class="mb-4 text-red-400">✗ Content not verified</div>
								{/if}

								<pre class="font-mono whitespace-pre-wrap text-slate-200">
{JSON.stringify(
										processContentData(
											(contentMap.get(selectedDoc.pubKey)?.data as Record<string, unknown>) || {}
										),
										null,
										2
									)}
								</pre>
							</div>
						{:else}
							<div class="flex items-center">
								<div
									class="mr-3 h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-blue-500"
								></div>
								<span>Loading content...</span>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Empty state when no document is selected -->
				<div class="flex h-full items-center justify-center">
					{#if loading}
						<div
							class="h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-blue-500"
						></div>
					{:else}
						<div class="p-6 text-center">
							<svg
								class="mx-auto h-12 w-12 text-slate-400"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
							<h3 class="mt-2 text-xl font-medium text-slate-300">No document selected</h3>
							<p class="mt-1 text-slate-400">
								Please select a document from the sidebar to view its content
							</p>
						</div>
					{/if}
				</div>
			{/if}
		</main>
	</div>
</div>
