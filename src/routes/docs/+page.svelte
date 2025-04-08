<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { hominio } from '$lib/client/hominio';
	import { LoroDoc } from 'loro-crdt';
	import { writable } from 'svelte/store';

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
		metadata?: Record<string, unknown>;
		hasBinaryData: boolean;
		contentLength: number;
		verified: boolean;
		createdAt: string;
		binaryData?: number[]; // Add binary data field
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
	let creatingSnapshot = false;
	let snapshotMessage: string | null = null;
	let addingTodo = false;
	let processedDocState: Record<string, unknown> | null = null;
	let processingState = false;

	// Add a reactive Loro document
	let activeLoroDoc: LoroDoc | null = null;
	// Create a Svelte store for the document state
	const docState = writable<Record<string, unknown> | null>(null);
	// Keep track of subscriptions
	let docSubscription: any = null;

	async function fetchDocs() {
		try {
			loading = true;
			error = null;

			// Correct Eden Treaty syntax
			const docsResponse = await hominio.api.docs.get();

			if (!docsResponse || !docsResponse.data) {
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

			// Use Eden Treaty client instead of fetch
			const response = await hominio.api.docs[doc.pubKey].get({
				$query: { includeBinary: 'true' }
			});

			if (response && response.data) {
				const responseData = response.data;
				console.log('Document response:', responseData);

				if (responseData) {
					if (responseData.content) {
						// Store content in the contentMap
						contentMap.set(doc.pubKey, responseData.content as ContentItem);

						// Initialize the Loro document with this content
						await initializeLoroDoc(
							responseData.content as ContentItem,
							responseData.document?.updateCids || []
						);
					}

					// If we're using a full response with document included, update the selected doc
					if (responseData.document) {
						selectedDoc = responseData.document as Doc;
					}
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

			// Use correct Eden Treaty syntax
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

	async function updateDocument(updateOperation?: (doc: LoroDoc) => void) {
		try {
			if (!selectedDoc || updatingDoc) return;

			updatingDoc = true;
			updateMessage = null;

			// Get the current content data to create a meaningful update
			const contentData = contentMap.get(selectedDoc.pubKey);
			if (!contentData) {
				throw new Error('Document content not loaded');
			}

			// Create a new Loro document and import the current snapshot
			const loroDoc = new LoroDoc();
			loroDoc.setPeerId(Math.floor(Math.random() * 1000000)); // Random peer ID

			// Use the binary data from the content response if available
			if (!contentData.binaryData) {
				throw new Error('Binary data not loaded. Try refreshing the document.');
			}

			// Convert the binary data and import
			const binaryArray = new Uint8Array(contentData.binaryData);
			loroDoc.import(binaryArray);

			// If an operation is provided, apply it
			if (updateOperation) {
				updateOperation(loroDoc);
			} else {
				// Default operation: update the title with a timestamp
				const newTitle = `Updated ${new Date().toLocaleTimeString()}`;
				loroDoc.getText('title').insert(0, newTitle);
			}

			// Generate the update binary data using Loro's export function
			const updateBinary = loroDoc.export({ mode: 'update' });

			// Correct Eden Treaty syntax for post - pass body directly
			const updateResponse = await hominio.api.docs[selectedDoc.pubKey].update.post({
				binaryUpdate: Array.from(updateBinary) // Convert Uint8Array to regular array for JSON
			});

			if (updateResponse && updateResponse.data && updateResponse.data.success) {
				console.log('Updated document:', updateResponse.data);

				// Refresh the document to get the updated data
				await selectDoc(selectedDoc);

				// Show success message
				updateMessage = 'Document updated successfully!';
			} else {
				throw new Error(updateResponse?.data?.error || 'Failed to update document');
			}
		} catch (e) {
			const err = e as Error;
			updateMessage = 'Error: ' + (err.message || 'Failed to update document');
			console.error('Error updating document:', e);
		} finally {
			updatingDoc = false;
		}
	}

	async function createSnapshot() {
		try {
			if (!selectedDoc || creatingSnapshot) return;

			creatingSnapshot = true;
			snapshotMessage = null;

			// Get the current content data
			const contentData = contentMap.get(selectedDoc.pubKey);
			if (!contentData) {
				throw new Error('Document content not loaded');
			}

			// Create a new Loro document and import the current snapshot
			const loroDoc = new LoroDoc();
			loroDoc.setPeerId(Math.floor(Math.random() * 1000000)); // Random peer ID

			// Use the binary data from the content response if available
			if (!contentData.binaryData) {
				throw new Error('Binary data not loaded. Try refreshing the document.');
			}

			// Convert the binary data and import
			const binaryArray = new Uint8Array(contentData.binaryData);
			loroDoc.import(binaryArray);

			// Generate a complete snapshot (mode: 'snapshot')
			const snapshotBinary = loroDoc.export({ mode: 'snapshot' });

			// Correct Eden Treaty syntax for post - pass body directly
			const snapshotResponse = await hominio.api.docs[selectedDoc.pubKey].snapshot.post({
				binarySnapshot: Array.from(snapshotBinary) // Convert Uint8Array to regular array for JSON
			});

			if (snapshotResponse && snapshotResponse.data) {
				if (snapshotResponse.data.success) {
					console.log('Created snapshot:', snapshotResponse.data);

					// Show custom message if one was provided
					if (snapshotResponse.data.message) {
						snapshotMessage = snapshotResponse.data.message;
					} else {
						snapshotMessage = 'Snapshot created successfully!';
					}

					// Refresh the document to get the updated data
					await selectDoc(selectedDoc);
				} else {
					throw new Error(snapshotResponse.data.error || 'Failed to create snapshot');
				}
			} else {
				throw new Error('Invalid response from server');
			}
		} catch (e) {
			const err = e as Error;
			snapshotMessage = 'Error: ' + (err.message || 'Failed to create snapshot');
			console.error('Error creating snapshot:', e);
		} finally {
			creatingSnapshot = false;
		}
	}

	// Add a function to create a Todo List document
	async function createTodoListDocument() {
		try {
			if (creatingDoc) return; // Prevent multiple clicks

			creatingDoc = true;
			error = null;

			// Create a new Loro document
			const loroDoc = new LoroDoc();
			loroDoc.setPeerId(Math.floor(Math.random() * 1000000)); // Random peer ID

			// Set up the document with todo list structure
			loroDoc.getText('title').insert(0, 'Todo List');
			loroDoc.getMap('meta').set('description', 'A simple todo list using Loro CRDT');

			// Initialize an empty todos array
			loroDoc.getList('todos'); // This creates an empty list named 'todos'

			// Generate snapshot binary data
			const snapshotBinary = loroDoc.export({ mode: 'snapshot' });

			// Correct Eden Treaty syntax for post - pass body directly
			const response = await hominio.api.docs.post({
				binarySnapshot: Array.from(snapshotBinary),
				title: 'Todo List',
				description: 'A simple todo list using Loro CRDT'
			});

			if (response && response.data && response.data.success) {
				console.log('Created todo list document:', response.data.document);

				// Add the new document to the list
				const newDoc = response.data.document as Doc;
				docs = [newDoc, ...docs];

				// Select the new document
				await selectDoc(newDoc);
			} else {
				throw new Error(response?.data?.error || 'Failed to create todo list document');
			}
		} catch (e) {
			const err = e as Error;
			error = err.message || 'Failed to create todo list document';
			console.error('Error creating todo list document:', e);
		} finally {
			creatingDoc = false;
		}
	}

	// Function to initialize or update the Loro document
	async function initializeLoroDoc(contentItem: ContentItem, updateCids: string[] = []) {
		// Clean up any existing subscription
		if (docSubscription) {
			docSubscription.unsubscribe();
			docSubscription = null;
		}

		// Create a new Loro document or reset the existing one
		if (!activeLoroDoc) {
			activeLoroDoc = new LoroDoc();
		}

		// Import the snapshot
		if (contentItem?.binaryData) {
			try {
				// Import the snapshot
				activeLoroDoc.import(new Uint8Array(contentItem.binaryData));
				console.log('Imported base snapshot');

				// Update the store with the initial state
				docState.set(activeLoroDoc.toJSON());

				// Set up subscription for changes
				docSubscription = activeLoroDoc.subscribe((event) => {
					console.log('Document changed:', event);
					// Update the store with the new state
					docState.set(activeLoroDoc?.toJSON() || null);
				});

				// Apply any existing updates
				if (updateCids && updateCids.length > 0) {
					await applyUpdatesToDocs(updateCids);
				}
			} catch (error) {
				console.error('Error initializing Loro document:', error);
				docState.set({ error: 'Failed to initialize document' });
			}
		}
	}

	// Function to apply updates to the active Loro document
	async function applyUpdatesToDocs(updateCids: string[]) {
		if (!activeLoroDoc) return;

		for (const updateCid of updateCids) {
			try {
				// Correct Eden Treaty syntax
				const updateResp = await hominio.api.content[updateCid].binary.get();

				if (updateResp && updateResp.data && updateResp.data.binaryData) {
					// Apply the update locally to our active document
					activeLoroDoc.import(new Uint8Array(updateResp.data.binaryData));
					console.log(`Applied update: ${updateCid}`);
				} else {
					console.warn(`Update ${updateCid} missing binary data`);
				}
			} catch (error) {
				console.warn(`Error applying update ${updateCid}:`, error);
			}
		}
	}

	// Function to add a todo to the Loro document
	function addTodoToDoc(text: string) {
		if (!activeLoroDoc) return false;

		try {
			// Try to get the todos list
			const todos = activeLoroDoc.getList('todos');

			// Add the new todo
			todos.push({
				id: crypto.randomUUID(),
				text,
				completed: false,
				createdAt: new Date().toISOString()
			});

			return true;
		} catch (e) {
			console.error('Error adding todo to document:', e);
			return false;
		}
	}

	// Update the addRandomTodo function to use Eden Treaty
	async function addRandomTodo() {
		if (addingTodo || !activeLoroDoc || !selectedDoc) return;

		addingTodo = true;

		try {
			// Generate a random todo
			const todoText = `Task ${Math.floor(Math.random() * 1000)}: ${
				[
					'Buy groceries',
					'Call mom',
					'Fix the bug',
					'Write documentation',
					'Go for a run',
					'Read a book',
					'Learn a new language',
					'Cook dinner'
				][Math.floor(Math.random() * 8)]
			}`;

			// Add the todo directly to the active document - LOCAL UPDATE
			const added = addTodoToDoc(todoText);

			if (added) {
				// Export the update
				const updateBinary = activeLoroDoc.export({ mode: 'update' });

				// Send the update to the server - REMOTE PERSISTENCE
				// Correct Eden Treaty syntax - pass body directly
				const updateResponse = await hominio.api.docs[selectedDoc.pubKey].update.post({
					binaryUpdate: Array.from(updateBinary)
				});

				if (updateResponse && updateResponse.data && updateResponse.data.success) {
					console.log('Server update response:', updateResponse.data);

					// We don't need to refresh the document here because
					// we already updated the activeLoroDoc and the UI will update reactively
					updateMessage = 'Todo added successfully!';
				} else {
					throw new Error(`Server error: ${updateResponse?.data?.error || 'Unknown server error'}`);
				}
			} else {
				throw new Error('Failed to add todo to document');
			}
		} catch (e) {
			const err = e as Error;
			updateMessage = 'Error: ' + (err.message || 'Failed to add todo');
			console.error('Error adding todo:', e);
		} finally {
			addingTodo = false;
		}
	}

	// Process data to display metadata nicely
	function processContentData(content: ContentItem): Record<string, unknown> {
		if (!content || !content.metadata) return {};

		// Return a copy of the metadata for display
		return { ...content.metadata };
	}

	// Function to process the full document state
	async function processDocumentState() {
		if (!selectedDoc || !contentMap.has(selectedDoc.pubKey) || processingState) return;

		processingState = true;
		processedDocState = null;

		try {
			const contentItem = contentMap.get(selectedDoc.pubKey);
			if (!contentItem?.binaryData) {
				throw new Error('No binary data available for processing');
			}

			// Create and initialize the Loro document with the snapshot
			const loroDoc = new LoroDoc();
			loroDoc.import(new Uint8Array(contentItem.binaryData));

			// If there are updates, fetch and apply them
			if (selectedDoc.updateCids && selectedDoc.updateCids.length > 0) {
				for (const updateCid of selectedDoc.updateCids) {
					try {
						// Use Eden Treaty client with empty params
						const updateResp = await fetch(`/api/content/${updateCid}/binary`);
						if (!updateResp.ok) {
							console.warn(`Failed to fetch update ${updateCid}`);
							continue;
						}

						const updateData = await updateResp.json();
						if (updateData && updateData.binaryData) {
							// Apply the update
							loroDoc.import(new Uint8Array(updateData.binaryData));
							console.log(`Applied update: ${updateCid}`);
						}
					} catch (error) {
						console.warn(`Error applying update ${updateCid}:`, error);
					}
				}
			}

			// Get the final document state
			processedDocState = loroDoc.toJSON();
			console.log('Processed document state:', processedDocState);
		} catch (error) {
			console.error('Error processing document state:', error);
			processedDocState = { error: 'Failed to process document state' };
		} finally {
			processingState = false;
		}
	}

	onMount(() => {
		fetchDocs();
	});

	// Clean up subscription when component is destroyed
	onDestroy(() => {
		if (docSubscription) {
			docSubscription.unsubscribe();
			docSubscription = null;
		}
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
				<div class="flex flex-col space-y-2">
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

					<button
						class="flex w-full items-center justify-center rounded-md bg-emerald-600 py-2 text-white transition-colors hover:bg-emerald-700"
						on:click={createTodoListDocument}
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
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								/>
							</svg>
							New Todo List
						{/if}
					</button>
				</div>
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

					<!-- Action Buttons Row -->
					<div class="mb-4 flex space-x-4">
						<!-- Update Document Button -->
						<button
							class="flex items-center rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
							on:click={() => updateDocument()}
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
								Update Title
							{/if}
						</button>

						<!-- Create Snapshot Button -->
						<button
							class="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
							on:click={createSnapshot}
							disabled={creatingSnapshot}
						>
							{#if creatingSnapshot}
								<div
									class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
								></div>
								Creating Snapshot...
							{:else}
								<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
									/>
								</svg>
								Create Snapshot
							{/if}
						</button>
					</div>

					{#if updateMessage}
						<div
							class="mt-2 text-sm {updateMessage.startsWith('Error')
								? 'text-red-400'
								: 'text-green-400'}"
						>
							{updateMessage}
						</div>
					{/if}

					{#if snapshotMessage}
						<div
							class="mt-2 text-sm {snapshotMessage.startsWith('Error')
								? 'text-red-400'
								: 'text-green-400'}"
						>
							{snapshotMessage}
						</div>
					{/if}
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

								<div class="mb-4">
									<span class="font-medium">Binary size:</span>
									<span class="ml-2"
										>{contentMap.get(selectedDoc.pubKey)?.contentLength || 0} bytes</span
									>
								</div>

								<div class="mb-4">
									<span class="font-medium">Updates:</span>
									<span class="ml-2">{selectedDoc.updateCids?.length || 0}</span>

									{#if selectedDoc.updateCids?.length > 0}
										<button
											class="ml-4 rounded bg-blue-600 px-2 py-1 text-sm transition-colors hover:bg-blue-700"
											on:click={processDocumentState}
											disabled={processingState}
										>
											{#if processingState}
												<div
													class="inline-block h-3 w-3 animate-spin rounded-full border-t-2 border-b-2 border-white"
												></div>
												Processing...
											{:else}
												Refresh State
											{/if}
										</button>
									{/if}
								</div>

								<!-- Add Todo Button for Todo List docs - always visible -->
								<div class="mb-4">
									<button
										class="flex items-center rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700"
										on:click={addRandomTodo}
										disabled={addingTodo || updatingDoc}
									>
										{#if addingTodo}
											<div
												class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
											></div>
											Adding Todo...
										{:else}
											<svg
												class="mr-2 h-4 w-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M12 6v6m0 0v6m0-6h6m-6 0H6"
												/>
											</svg>
											Add Random Todo
										{/if}
									</button>
								</div>

								<!-- Document state tabs -->
								<div class="mb-4 border-b border-slate-700">
									<div class="flex space-x-4">
										<h3 class="font-bold text-blue-400">Current Document State</h3>
									</div>
								</div>

								<!-- Display the reactive document state -->
								{#if $docState}
									<div class="mb-4 rounded-md bg-slate-800 p-4">
										<div class="mb-2 flex items-center justify-between">
											<h3 class="text-lg font-semibold text-green-400">Live Document State</h3>
											<span class="text-sm text-slate-400"> Updates applied in real-time </span>
										</div>
										<pre class="font-mono whitespace-pre-wrap text-slate-200">
{JSON.stringify($docState, null, 2)}
										</pre>
									</div>
								{/if}

								<!-- Content Metadata Section -->
								<div class="mb-4">
									<h3 class="mb-2 text-lg font-semibold text-slate-300">Content Metadata</h3>
									<pre class="font-mono whitespace-pre-wrap text-slate-200">
{JSON.stringify(processContentData(contentMap.get(selectedDoc.pubKey) as ContentItem), null, 2)}
									</pre>
								</div>
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
