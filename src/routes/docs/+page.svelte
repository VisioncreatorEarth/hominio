<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { hominioDB, type Docs } from '$lib/KERNEL/hominio-db';
	import { hominioSync } from '$lib/KERNEL/hominio-sync';

	// Subscribe to hominioDB stores
	const docs = hominioDB.docs;
	const selectedDoc = hominioDB.selectedDoc;
	const status = hominioDB.status;
	const error = hominioDB.error;
	const docContent = hominioDB.docContent;

	// Subscribe to hominioSync store
	const syncStatus = hominioSync.status;

	// State for random property button
	let isAddingProperty = false;
	// State for snapshot button
	let isCreatingSnapshot = false;

	// Handle selecting a document
	function handleSelectDoc(doc: Docs) {
		hominioDB.selectDoc(doc);
	}

	// Handle creating a new document
	function handleCreateNewDocument() {
		hominioDB.createDocument();
	}

	// Handle adding random property
	async function handleAddRandomProperty() {
		if (isAddingProperty) return;

		isAddingProperty = true;
		try {
			await hominioDB.addRandomPropertyToDocument();
		} finally {
			isAddingProperty = false;
		}
	}

	// Handle creating a consolidated snapshot
	async function handleCreateSnapshot() {
		if (isCreatingSnapshot || !$selectedDoc) return;

		isCreatingSnapshot = true;
		try {
			await hominioSync.createConsolidatedSnapshot();
		} catch (err) {
			console.error('Error creating snapshot:', err);
		} finally {
			isCreatingSnapshot = false;
		}
	}

	// Handle manual pull from server
	function handlePull() {
		hominioSync.pullFromServer();
	}

	// Handle manual push to server
	function handlePush() {
		hominioSync.pushToServer();
	}

	// On mount, ensure we have properly initialized
	onMount(() => {
		console.log('Document component mounted');
	});

	onDestroy(() => {
		hominioDB.destroy();
		hominioSync.destroy();
	});
</script>

<div class="min-h-screen bg-[#0F1525] text-slate-200">
	<!-- Three-column layout: Sidebar, Main Content, and Right Aside -->
	<div class="grid min-h-screen grid-cols-[250px_1fr_400px]">
		<!-- Sidebar - Doc List -->
		<aside class="flex flex-col overflow-y-auto border-r border-slate-700 bg-[#0F1525]">
			<div class="border-b border-slate-700 p-4">
				<h1 class="text-xl font-bold text-white">
					Documents <span class="text-xs text-slate-400">(Local First)</span>
				</h1>

				<!-- Sync status indicator -->
				<div class="mt-2 flex items-center text-xs">
					<span class="mr-2">Server Sync:</span>
					{#if $syncStatus.isSyncing}
						<span class="flex items-center text-blue-300">
							<div class="mr-1 h-2 w-2 animate-pulse rounded-full bg-blue-400"></div>
							Syncing...
						</span>
					{:else if $syncStatus.lastSynced}
						<span class="text-green-300">
							Synced {new Date($syncStatus.lastSynced).toLocaleTimeString()}
						</span>
					{:else}
						<span class="text-yellow-400">Not synced</span>
					{/if}

					{#if !$syncStatus.isSyncing}
						<div class="ml-2 flex gap-2">
							<button
								class="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700"
								on:click={handlePush}
								title="Push local changes to server"
							>
								Push
							</button>
							<button
								class="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700"
								on:click={handlePull}
								title="Pull changes from server"
							>
								Pull
							</button>
							<!-- Remove Test Get Button -->
							<!--
							<button
								class="rounded bg-yellow-600 px-2 py-0.5 text-xs text-white hover:bg-yellow-700"
								on:click={() =>
									testDocGet('e14858526407fec42e729fab85c7ed404a4a3ae0283e2d9b097e50a8238f29f5')}
								title="Test GET request for specific doc"
							>
								Test Get
							</button>
							-->
						</div>
					{/if}
				</div>

				{#if $syncStatus.syncError}
					<div class="mt-1 text-xs text-red-400">
						Error: {$syncStatus.syncError}
					</div>
				{/if}

				<!-- Display pending changes count -->
				{#if $syncStatus.pendingLocalChanges > 0}
					<div class="mt-1 text-xs text-amber-400">
						{$syncStatus.pendingLocalChanges} document{$syncStatus.pendingLocalChanges !== 1
							? 's'
							: ''} with local changes
					</div>
				{/if}
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
					<p class="mb-4 text-slate-400">No documents found in local storage</p>
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
							<h2 class="font-medium text-blue-400">{doc.pubKey}</h2>
							<p class="mt-1 truncate text-xs text-slate-400">
								{doc.owner || 'No owner'}
							</p>
							<div class="mt-1 flex items-center text-xs">
								<span class="font-mono text-slate-300">
									{doc.pubKey.substring(0, 10)}...
								</span>
								{#if doc.localState}
									<span class="ml-2 rounded bg-amber-800 px-1 text-xs text-amber-200"
										>Local Only</span
									>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</aside>

		<!-- Main Content Area -->
		<main class="flex-grow overflow-y-auto border-r border-slate-700">
			{#if $selectedDoc}
				<!-- Document title at the top -->
				<div class="p-6">
					<h1 class="text-3xl font-bold text-blue-400">{$selectedDoc.pubKey}</h1>
					<p class="mb-6 text-slate-300">
						{$selectedDoc.owner || 'A document using Loro CRDT'}
					</p>

					<!-- Document Metadata -->
					<div class="overflow-y-auto">
						<h2 class="mb-4 text-xl font-bold">Document Metadata</h2>

						<div class="space-y-2">
							<div>
								<span class="font-medium">Public Key:</span>
								<span class="ml-2 font-mono">{$selectedDoc.pubKey}</span>
							</div>
							<div>
								<span class="font-medium">Owner ID:</span>
								<span class="ml-2 font-mono">
									{$selectedDoc.owner}
									{#if $selectedDoc.localState}
										<span class="ml-2 rounded bg-amber-800 px-1 text-xs text-amber-200"
											>Not yet synced to server</span
										>
									{/if}
								</span>
							</div>
							<div>
								<span class="font-medium">Updated:</span>
								<span class="ml-2">
									{new Date($selectedDoc.updatedAt).toLocaleString()}
								</span>
							</div>

							<!-- Always show Snapshot CID field -->
							<div>
								<span class="font-medium">Snapshot CID:</span>
								{#if $selectedDoc.snapshotCid}
									<div class="ml-2 font-mono break-all">
										{$selectedDoc.snapshotCid}
										{#if $selectedDoc.snapshotCid.startsWith('local-')}
											<span class="ml-2 rounded bg-amber-800 px-1 text-xs text-amber-200"
												>Local CID</span
											>
										{/if}
									</div>
								{:else}
									<div class="ml-2 text-slate-500 italic">No server snapshot</div>
								{/if}
							</div>

							<!-- Always show Update CIDs field -->
							<div>
								<span class="font-medium">Updates ({$selectedDoc.updateCids?.length || 0}):</span>
								{#if $selectedDoc.updateCids && $selectedDoc.updateCids.length > 0}
									<div class="ml-2 font-mono">
										{#each $selectedDoc.updateCids as cid}
											<div class="mt-1 text-xs break-all">
												{cid}
												{#if cid.startsWith('local-')}
													<span class="ml-2 rounded bg-amber-800 px-1 text-xs text-amber-200"
														>Local CID</span
													>
												{/if}
											</div>
										{/each}
									</div>
								{:else}
									<div class="ml-2 text-slate-500 italic">No updates</div>
								{/if}
							</div>

							<!-- Always show Local State section -->
							<div class="mt-4 border-t border-slate-700 pt-4">
								<h3 class="mb-2 text-lg font-semibold">Local State (Pending Sync)</h3>

								<!-- Always show Local Snapshot CID field -->
								<div>
									<span class="font-medium">Local Snapshot CID:</span>
									{#if $selectedDoc.localState?.snapshotCid}
										<div class="ml-2 font-mono break-all text-amber-300">
											{$selectedDoc.localState.snapshotCid}
										</div>
									{:else}
										<div class="ml-2 text-slate-500 italic">No local snapshot</div>
									{/if}
								</div>

								<!-- Always show Local Update CIDs field -->
								<div class="mt-2">
									<span class="font-medium">
										Local Updates ({$selectedDoc.localState?.updateCids?.length || 0}):
									</span>
									{#if $selectedDoc.localState?.updateCids && $selectedDoc.localState.updateCids.length > 0}
										<div class="ml-2 font-mono">
											{#each $selectedDoc.localState.updateCids as cid}
												<div class="mt-1 text-xs break-all text-amber-300">
													{cid}
												</div>
											{/each}
										</div>
									{:else}
										<div class="ml-2 text-slate-500 italic">No local updates</div>
									{/if}
								</div>
							</div>
						</div>
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

		<!-- Right Aside - Document Content -->
		<aside class="overflow-y-auto bg-[#0F1525]">
			{#if $selectedDoc}
				<div class="p-6">
					<div class="mb-4 flex items-center justify-between">
						<h2 class="text-xl font-bold">Document Content</h2>

						<!-- Add Random Property Button -->
						<button
							class="flex items-center rounded-md bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
							on:click={handleAddRandomProperty}
							disabled={isAddingProperty || $docContent.loading}
						>
							{#if isAddingProperty}
								<div
									class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
								></div>
								Adding...
							{:else}
								<svg class="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 6v6m0 0v6m0-6h6m-6 0H6"
									/>
								</svg>
								Add Random Property
							{/if}
						</button>
					</div>

					<!-- Source info -->
					<div class="mb-4 rounded bg-slate-800/50 p-3 text-sm">
						<p class="font-medium">
							{#if $docContent.isLocalSnapshot && $docContent.sourceCid}
								<span class="text-amber-300">
									Showing content from local snapshot:
									<span class="font-mono">{$docContent.sourceCid.substring(0, 12)}...</span>
								</span>
							{:else if $docContent.sourceCid}
								<span class="text-blue-300">
									Showing content from server snapshot:
									<span class="font-mono">{$docContent.sourceCid.substring(0, 12)}...</span>
								</span>
							{:else}
								<span class="text-red-300">No snapshot available</span>
							{/if}
						</p>

						<!-- Show applied updates info -->
						{#if $docContent.appliedUpdates !== undefined && $docContent.appliedUpdates > 0}
							<p class="mt-1">
								<span class="text-green-300">
									{$docContent.appliedUpdates} update{$docContent.appliedUpdates !== 1 ? 's' : ''} applied
								</span>
							</p>
						{:else if $docContent.sourceCid}
							<p class="mt-1 text-slate-400">No updates applied (base snapshot only)</p>
						{/if}

						<!-- Show pending updates count -->
						{#if $selectedDoc.localState?.updateCids && $selectedDoc.localState.updateCids.length > 0}
							<p class="mt-2 text-amber-300">
								{$selectedDoc.localState.updateCids.length} pending update{$selectedDoc.localState
									.updateCids.length !== 1
									? 's'
									: ''} (already reflected in content)
							</p>
						{/if}
					</div>

					<!-- Document Content -->
					{#if $docContent.loading}
						<div class="flex h-32 items-center justify-center">
							<div
								class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-blue-500"
							></div>
						</div>
					{:else if $docContent.error}
						<div class="rounded bg-red-900/30 p-4 text-red-200">
							<p class="font-medium">Error loading content:</p>
							<p class="mt-2">{$docContent.error}</p>
						</div>
					{:else if $docContent.content}
						<!-- Add snapshot button if document has updates -->
						{#if $selectedDoc && $selectedDoc.updateCids && $selectedDoc.updateCids.length > 0}
							<div class="mb-4 flex justify-end">
								<button
									class="flex items-center rounded-md bg-purple-600 px-3 py-1 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
									on:click={handleCreateSnapshot}
									disabled={isCreatingSnapshot}
									title="Consolidate all updates into a new snapshot"
								>
									{#if isCreatingSnapshot}
										<div
											class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
										></div>
										Creating Snapshot...
									{:else}
										<svg class="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
											/>
										</svg>
										Create Snapshot ({$selectedDoc.updateCids.length} updates)
									{/if}
								</button>
							</div>
						{/if}
						<div class="rounded bg-slate-800/50 p-4">
							<pre class="overflow-x-auto text-xs text-green-300">{JSON.stringify(
									$docContent.content,
									null,
									2
								)}</pre>
						</div>
					{:else}
						<div class="rounded bg-slate-800/50 p-4 text-slate-400">
							<p>No content available</p>
						</div>
					{/if}
				</div>
			{:else}
				<div class="flex h-full items-center justify-center p-6 text-center text-slate-400">
					<p>Select a document to view its content</p>
				</div>
			{/if}
		</aside>
	</div>
</div>
