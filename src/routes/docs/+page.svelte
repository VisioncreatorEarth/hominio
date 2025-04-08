<script lang="ts">
	import { onDestroy } from 'svelte';
	import { documentService } from '$lib/KERNEL/doc-state';
	import { TodoHelper } from '$lib/todo/todo-helpers';

	// Subscribe to all stores from the DocumentService
	const docs = documentService.docs;
	const selectedDoc = documentService.selectedDoc;
	const contentMap = documentService.contentMap;
	const status = documentService.status;
	const error = documentService.error;
	const updateMessage = documentService.updateMessage;
	const snapshotMessage = documentService.snapshotMessage;
	const docState = documentService.docState;

	// Handle selecting a document
	function handleSelectDoc(doc: any) {
		documentService.selectDoc(doc);
	}

	// Handle creating a new document
	function handleCreateNewDocument() {
		documentService.createNewDocument();
	}

	// Handle creating a Todo List document
	async function handleCreateTodoListDocument() {
		documentService.setStatus({ creatingDoc: true });
		try {
			const newDoc = await TodoHelper.createTodoListDocument({
				title: 'New Todo List',
				description: 'A simple todo list using Loro CRDT'
			});

			if (newDoc) {
				// Refresh document list and select the new doc
				await documentService.fetchDocs();
				const docs = await documentService.fetchDocs();
				const createdDoc = docs.find((d) => d.pubKey === newDoc.pubKey);
				if (createdDoc) {
					documentService.selectDoc(createdDoc);
				}
			} else {
				documentService.setError('Failed to create todo list document');
			}
		} catch (error) {
			console.error('Error creating todo list:', error);
			documentService.setError(
				error instanceof Error ? error.message : 'Failed to create todo list'
			);
		} finally {
			documentService.setStatus({ creatingDoc: false });
		}
	}

	// Handle updating document title
	function handleUpdateDocument() {
		documentService.updateDocument();
	}

	// Handle creating a snapshot
	function handleCreateSnapshot() {
		documentService.createSnapshot();
	}

	// Handle adding a random todo
	function handleAddRandomTodo() {
		if ($docState) {
			const randomTodoUpdate = TodoHelper.createRandomTodoUpdate($docState);
			documentService.addRandomTodo(randomTodoUpdate);
		}
	}

	// Process the document state on demand
	function handleProcessDocumentState() {
		documentService.processDocumentState();
	}

	// Process content data for display
	function processContentData(content: any) {
		if (!content || !content.metadata) return {};
		return { ...content.metadata };
	}

	onDestroy(() => {
		documentService.destroy();
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
						on:click={handleCreateNewDocument}
						disabled={$status.creatingDoc}
					>
						{#if $status.creatingDoc}
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
						on:click={handleCreateTodoListDocument}
						disabled={$status.creatingDoc}
					>
						{#if $status.creatingDoc}
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

			{#if $status.loading && $docs.length === 0}
				<div class="flex h-32 items-center justify-center">
					<div
						class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-blue-500"
					></div>
				</div>
			{:else if $error && $docs.length === 0}
				<div class="p-4">
					<div class="rounded-lg bg-red-900/50 p-3 text-sm">
						<p class="text-red-300">{$error}</p>
						<button
							class="mt-2 rounded-md bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600"
							on:click={() => documentService.fetchDocs()}
						>
							Retry
						</button>
					</div>
				</div>
			{:else if $docs.length === 0}
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
					{#each $docs as doc}
						<div
							class="cursor-pointer border-b border-slate-700 p-4 hover:bg-slate-800 {$selectedDoc?.pubKey ===
							doc.pubKey
								? 'bg-slate-800'
								: ''}"
							on:click={() => handleSelectDoc(doc)}
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
			{#if $selectedDoc}
				<!-- Document title at the top -->
				<div class="p-6 pb-0">
					<h1 class="text-3xl font-bold text-blue-400">{$selectedDoc.title}</h1>
					<p class="mb-6 text-slate-300">
						{$selectedDoc.description || 'A document using Loro CRDT'}
					</p>

					<!-- Action Buttons Row -->
					<div class="mb-4 flex space-x-4">
						<!-- Update Document Button -->
						<button
							class="flex items-center rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
							on:click={handleUpdateDocument}
							disabled={$status.updatingDoc}
						>
							{#if $status.updatingDoc}
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
							on:click={handleCreateSnapshot}
							disabled={$status.creatingSnapshot}
						>
							{#if $status.creatingSnapshot}
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

					{#if $updateMessage}
						<div
							class="mt-2 text-sm {$updateMessage.startsWith('Error')
								? 'text-red-400'
								: 'text-green-400'}"
						>
							{$updateMessage}
						</div>
					{/if}

					{#if $snapshotMessage}
						<div
							class="mt-2 text-sm {$snapshotMessage.startsWith('Error')
								? 'text-red-400'
								: 'text-green-400'}"
						>
							{$snapshotMessage}
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
								<span class="ml-2 font-mono">{$selectedDoc.pubKey}</span>
							</div>
							<div>
								<span class="font-medium">Owner ID:</span>
								<span class="ml-2 font-mono">{$selectedDoc.ownerId}</span>
							</div>
							<div>
								<span class="font-medium">Created:</span>
								<span class="ml-2">
									{new Date($selectedDoc.createdAt).toLocaleString()}
								</span>
							</div>
							<div>
								<span class="font-medium">Updated:</span>
								<span class="ml-2">
									{new Date($selectedDoc.updatedAt).toLocaleString()}
								</span>
							</div>
							<div>
								<span class="font-medium">Snapshot CID:</span>
								<div class="ml-2 font-mono break-all">{$selectedDoc.snapshotCid}</div>
							</div>

							<!-- Display Update CIDs -->
							<div>
								<span class="font-medium">Updates:</span>
								{#if $selectedDoc.updateCids && $selectedDoc.updateCids.length > 0}
									<div class="ml-2 font-mono">
										{#each $selectedDoc.updateCids as cid}
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

						{#if !$selectedDoc.snapshotCid}
							<div>
								<p class="text-slate-400">No content snapshot associated with this document</p>
							</div>
						{:else if $contentMap.has($selectedDoc.pubKey)}
							<div>
								{#if $contentMap.get($selectedDoc.pubKey)?.verified}
									<div class="mb-4 text-green-400">✓ Content verified</div>
								{:else}
									<div class="mb-4 text-red-400">✗ Content not verified</div>
								{/if}

								<div class="mb-4">
									<span class="font-medium">Binary size:</span>
									<span class="ml-2"
										>{$contentMap.get($selectedDoc.pubKey)?.contentLength || 0} bytes</span
									>
								</div>

								<div class="mb-4">
									<span class="font-medium">Updates:</span>
									<span class="ml-2">{$selectedDoc.updateCids?.length || 0}</span>
								</div>

								<!-- Add Todo Button for Todo List docs - always visible -->
								<div class="mb-4">
									<button
										class="flex items-center rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700"
										on:click={handleAddRandomTodo}
										disabled={$status.addingTodo || $status.updatingDoc}
									>
										{#if $status.addingTodo}
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
{JSON.stringify(processContentData($contentMap.get($selectedDoc.pubKey)), null, 2)}
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
					{#if $status.loading}
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
