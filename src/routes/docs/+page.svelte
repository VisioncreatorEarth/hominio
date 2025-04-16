<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { hominioDB, type Docs } from '$lib/KERNEL/hominio-db';
	import { hominioSync } from '$lib/KERNEL/hominio-sync';
	import { authClient } from '$lib/KERNEL/hominio-auth'; // Import auth client
	import { canDelete, type CapabilityUser } from '$lib/KERNEL/hominio-caps'; // Import capability check

	// Subscribe to hominioDB stores
	const docs = hominioDB.docs;
	const selectedDoc = hominioDB.selectedDoc;
	const status = hominioDB.status;
	const error = hominioDB.error;
	const docContent = hominioDB.docContent;

	// Subscribe to auth store for capability checking
	const session = authClient.useSession();

	// Subscribe to hominioSync store
	const syncStatus = hominioSync.status;

	// State for random property button
	let isAddingProperty = false;
	// State for snapshot button
	let isCreatingSnapshot = false;
	// State for delete button
	let isDeleting = false;
	// Track delete permission
	let canDeleteDoc = false;

	// Reactive variable to check if user can delete the selected document
	$: {
		if ($selectedDoc && $session.data?.user) {
			const currentUser = $session.data?.user as CapabilityUser;
			canDeleteDoc = canDelete(currentUser, $selectedDoc);
			console.log('Delete capability check:', {
				userId: currentUser.id,
				docOwner: $selectedDoc.owner,
				canDelete: canDeleteDoc
			});
		} else {
			canDeleteDoc = false;
		}
	}

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

	// Handle document deletion
	async function handleDeleteDocument() {
		if (isDeleting || !$selectedDoc) return;

		if (
			!confirm(
				`Are you sure you want to delete document "${$selectedDoc.pubKey}"? This action cannot be undone.`
			)
		) {
			return;
		}

		isDeleting = true;
		try {
			const success = await hominioSync.deleteDocument($selectedDoc.pubKey);
			if (success) {
				console.log(`Document ${$selectedDoc.pubKey} deleted successfully`);
			}
		} catch (err) {
			console.error('Error deleting document:', err);
		} finally {
			isDeleting = false;
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

<div class="min-h-screen bg-[#e7e1d7] text-gray-800">
	<!-- Three-column layout: Sidebar, Main Content, and Right Aside -->
	<div class="grid min-h-screen grid-cols-[250px_1fr_400px]">
		<!-- Sidebar - Doc List -->
		<aside
			class="flex flex-col overflow-y-auto border-r border-gray-200 bg-white shadow-sm"
			style="border-color: rgba(0,0,0,0.08);"
		>
			<!-- Header with title and sync status -->
			<div class="border-b border-gray-200 p-4" style="border-color: rgba(0,0,0,0.08);">
				<h1 class="text-xl font-bold text-[#3c2c8c]">
					Documents <span class="text-xs font-normal text-gray-500">(Local First)</span>
				</h1>

				<!-- Sync status indicator -->
				<div class="mt-2 flex flex-wrap items-center gap-y-1 text-xs text-gray-600">
					<span class="mr-2 whitespace-nowrap">Server Sync:</span>
					{#if $syncStatus.isSyncing}
						<span class="flex items-center text-[#65d1de]">
							<div class="mr-1 h-2 w-2 animate-pulse rounded-full bg-[#65d1de]"></div>
							Syncing...
						</span>
					{:else if $syncStatus.lastSynced}
						<span class="text-green-600">
							Synced {new Date($syncStatus.lastSynced).toLocaleTimeString()}
						</span>
					{:else}
						<span class="text-orange-600">Not synced</span>
					{/if}

					{#if !$syncStatus.isSyncing}
						<div class="ml-auto flex flex-shrink-0 gap-2 pl-2">
							<button
								class="rounded bg-[#65d1de] px-2 py-0.5 text-xs font-medium text-[#3c2c8c] shadow-sm transition-colors hover:bg-[#5ac4d1] focus:ring-1 focus:ring-[#65d1de] focus:ring-offset-1 focus:outline-none"
								on:click={handlePush}
								title="Push local changes to server"
							>
								Push
							</button>
							<button
								class="rounded bg-[#65d1de] px-2 py-0.5 text-xs font-medium text-[#3c2c8c] shadow-sm transition-colors hover:bg-[#5ac4d1] focus:ring-1 focus:ring-[#65d1de] focus:ring-offset-1 focus:outline-none"
								on:click={handlePull}
								title="Pull changes from server"
							>
								Pull
							</button>
						</div>
					{/if}
				</div>

				{#if $syncStatus.syncError}
					<div class="mt-1 text-xs text-red-600">
						Error: {$syncStatus.syncError}
					</div>
				{/if}

				<!-- Display pending changes count -->
				{#if $syncStatus.pendingLocalChanges > 0}
					<div class="mt-1 text-xs text-orange-600">
						{$syncStatus.pendingLocalChanges} document{$syncStatus.pendingLocalChanges !== 1
							? 's'
							: ''} with local changes
					</div>
				{/if}
			</div>

			<!-- Create New Document Button -->
			<div class="border-b border-gray-200 p-4" style="border-color: rgba(0,0,0,0.08);">
				<button
					class="flex w-full items-center justify-center rounded-md bg-[#3c2c8c] py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2a1f62] focus:ring-2 focus:ring-[#3c2c8c] focus:ring-offset-2 focus:ring-offset-white focus:outline-none disabled:opacity-60"
					on:click={handleCreateNewDocument}
					disabled={$status.creatingDoc}
				>
					{#if $status.creatingDoc}
						<div
							class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
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

			<!-- Document List -->
			{#if $status.loading && $docs.length === 0}
				<div class="flex h-32 items-center justify-center">
					<div
						class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-[#3c2c8c]"
					></div>
				</div>
			{:else if $error && $docs.length === 0}
				<div class="p-4">
					<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
						<p>{$error}</p>
					</div>
				</div>
			{:else if $docs.length === 0}
				<div class="flex flex-grow flex-col items-center justify-center p-4 text-center">
					<svg
						class="mb-3 h-12 w-12 text-gray-400"
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
					<p class="mb-4 text-gray-500">No documents found in local storage</p>
					<p class="text-sm text-gray-400">
						Click the "New Document" button to create your first document
					</p>
				</div>
			{:else}
				<div class="flex-grow overflow-y-auto">
					<ul class="divide-y divide-gray-200" style="border-color: rgba(0,0,0,0.08);">
						{#each $docs as doc (doc.pubKey)}
							{@const isSelected = $selectedDoc?.pubKey === doc.pubKey}
							<li>
								<button
									class="block w-full cursor-pointer p-4 text-left transition-colors {isSelected
										? 'bg-[#3c2c8c] text-white'
										: 'hover:bg-gray-100'}"
									on:click={() => handleSelectDoc(doc)}
								>
									<h2 class="font-medium {isSelected ? 'text-white' : 'text-[#3c2c8c]'}">
										{doc.pubKey.substring(0, 10)}...
									</h2>
									<p class="mt-1 truncate text-xs {isSelected ? 'text-gray-300' : 'text-gray-500'}">
										{doc.owner || 'No owner'} - {new Date(doc.updatedAt).toLocaleTimeString()}
									</p>
									{#if doc.localState}
										<span
											class="mt-1 inline-block rounded px-1.5 py-0.5 text-xs {isSelected
												? 'bg-[#65d1de] text-[#3c2c8c]'
												: 'bg-orange-100 text-orange-700'}">Local Only</span
										>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</aside>

		<!-- Main Content Area -->
		<main
			class="flex-grow overflow-y-auto border-r border-gray-200 bg-white p-6 shadow-sm"
			style="border-color: rgba(0,0,0,0.08);"
		>
			{#if $selectedDoc}
				<!-- Document title at the top -->
				<div class="mb-6">
					<h1 class="text-2xl font-bold break-all text-[#3c2c8c]">{$selectedDoc.pubKey}</h1>
					<p class="mt-1 text-sm text-gray-600">
						Owned by: {$selectedDoc.owner || 'N/A'}
					</p>
				</div>

				<!-- Delete Button Section -->
				{#if canDeleteDoc}
					<div class="mb-6 rounded-lg border-l-4 border-red-400 bg-red-50 p-4 shadow-sm">
						<div
							class="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
						>
							<div>
								<h3 class="text-base font-semibold text-red-800">Danger Zone</h3>
								<p class="text-sm text-red-700">
									Permanently delete this document and all its data.
								</p>
							</div>
							<button
								class="flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-red-50 focus:outline-none disabled:opacity-50"
								on:click={handleDeleteDocument}
								disabled={isDeleting}
							>
								{#if isDeleting}
									<div
										class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
									></div>
									Deleting...
								{:else}
									<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
									Delete
								{/if}
							</button>
						</div>
					</div>
				{/if}

				<!-- Document Metadata Card -->
				<div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
					<h2 class="mb-3 text-lg font-semibold text-[#3c2c8c]">Document Metadata</h2>
					<div class="space-y-3 text-sm">
						<div>
							<span class="font-medium text-gray-600">Public Key:</span>
							<span class="ml-2 block font-mono text-xs break-all text-gray-700"
								>{$selectedDoc.pubKey}</span
							>
						</div>
						<div>
							<span class="font-medium text-gray-600">Owner ID:</span>
							<span class="ml-2 font-mono text-xs text-gray-700">{$selectedDoc.owner}</span>
						</div>
						<div>
							<span class="font-medium text-gray-600">Updated:</span>
							<span class="ml-2 text-gray-700">
								{new Date($selectedDoc.updatedAt).toLocaleString()}
							</span>
						</div>

						<!-- Server State -->
						<div class="space-y-2 border-t border-gray-200 pt-3">
							<h3 class="text-sm font-semibold text-gray-800">Server State</h3>
							<div>
								<span class="font-medium text-gray-600">Snapshot CID:</span>
								{#if $selectedDoc.snapshotCid}
									<div class="mt-0.5 ml-2 font-mono text-xs break-all text-gray-700">
										{$selectedDoc.snapshotCid}
									</div>
								{:else}
									<div class="ml-2 text-xs text-gray-400 italic">No server snapshot</div>
								{/if}
							</div>
							<div>
								<span class="font-medium text-gray-600"
									>Updates ({$selectedDoc.updateCids?.length || 0}):</span
								>
								{#if $selectedDoc.updateCids && $selectedDoc.updateCids.length > 0}
									<div class="ml-2 space-y-1 font-mono text-xs text-gray-700">
										{#each $selectedDoc.updateCids as cid}
											<div class="break-all">{cid}</div>
										{/each}
									</div>
								{:else}
									<div class="ml-2 text-xs text-gray-400 italic">No server updates</div>
								{/if}
							</div>
						</div>

						<!-- Local State (Pending Sync) -->
						<div class="space-y-2 border-t border-gray-200 pt-3">
							<h3 class="text-sm font-semibold text-[#65d1de]">Local State (Pending Sync)</h3>
							<div>
								<span class="font-medium text-gray-600">Local Snapshot CID:</span>
								{#if $selectedDoc.localState?.snapshotCid}
									<div class="mt-0.5 ml-2 font-mono text-xs break-all text-[#65d1de]">
										{$selectedDoc.localState.snapshotCid}
									</div>
								{:else}
									<div class="ml-2 text-xs text-gray-400 italic">No local snapshot</div>
								{/if}
							</div>
							<div>
								<span class="font-medium text-gray-600">
									Local Updates ({$selectedDoc.localState?.updateCids?.length || 0}):
								</span>
								{#if $selectedDoc.localState?.updateCids && $selectedDoc.localState.updateCids.length > 0}
									<div class="ml-2 space-y-1 font-mono text-xs text-[#65d1de]">
										{#each $selectedDoc.localState.updateCids as cid}
											<div class="break-all">{cid}</div>
										{/each}
									</div>
								{:else}
									<div class="ml-2 text-xs text-gray-400 italic">No local updates</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{:else}
				<!-- Empty state when no document is selected -->
				<div class="flex h-full flex-col items-center justify-center">
					{#if $status.loading}
						<div
							class="h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-[#3c2c8c]"
						></div>
					{:else}
						<div class="p-6 text-center">
							<svg
								class="mx-auto h-16 w-16 text-gray-400"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
							<h3 class="mt-2 text-lg font-medium text-gray-700">No document selected</h3>
							<p class="mt-1 text-sm text-gray-500">
								Please select or create a document from the sidebar.
							</p>
						</div>
					{/if}
				</div>
			{/if}
		</main>

		<!-- Right Aside - Document Content -->
		<aside
			class="overflow-y-auto border-l border-gray-200 bg-white p-6 shadow-sm"
			style="border-color: rgba(0,0,0,0.08);"
		>
			{#if $selectedDoc}
				<div class="h-full">
					<div
						class="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
					>
						<h2 class="text-lg font-semibold text-[#3c2c8c]">Document Content</h2>

						<!-- Add Random Property Button -->
						<button
							class="flex items-center rounded-md bg-[#65d1de] px-3 py-1 text-sm font-medium text-[#3c2c8c] shadow-sm transition-colors hover:bg-[#5ac4d1] focus:ring-2 focus:ring-[#65d1de] focus:ring-offset-2 focus:ring-offset-white focus:outline-none disabled:opacity-50"
							on:click={handleAddRandomProperty}
							disabled={isAddingProperty || $docContent.loading}
						>
							{#if isAddingProperty}
								<div
									class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-[#3c2c8c]"
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

					<!-- Source info Card -->
					<div class="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm">
						<h3 class="mb-2 text-sm font-semibold text-gray-700">Content Source</h3>
						<p class="font-medium">
							{#if $docContent.isLocalSnapshot && $docContent.sourceCid}
								<span class="text-[#65d1de]">
									Local snapshot:
									<span class="block font-mono text-xs"
										>{$docContent.sourceCid.substring(0, 12)}...</span
									>
								</span>
							{:else if $docContent.sourceCid}
								<span class="text-[#3c2c8c]">
									Server snapshot:
									<span class="block font-mono text-xs"
										>{$docContent.sourceCid.substring(0, 12)}...</span
									>
								</span>
							{:else}
								<span class="text-red-600">No snapshot available</span>
							{/if}
						</p>

						<!-- Show applied updates info -->
						{#if $docContent.appliedUpdates !== undefined && $docContent.appliedUpdates > 0}
							<p class="mt-1 text-green-600">
								+ {$docContent.appliedUpdates} update{$docContent.appliedUpdates !== 1 ? 's' : ''}
								applied
							</p>
						{:else if $docContent.sourceCid}
							<p class="mt-1 text-xs text-gray-500">No updates applied (base snapshot only)</p>
						{/if}

						<!-- Show pending updates count -->
						{#if $selectedDoc.localState?.updateCids && $selectedDoc.localState.updateCids.length > 0}
							<p class="mt-2 text-[#65d1de]">
								{$selectedDoc.localState.updateCids.length} pending update{$selectedDoc.localState
									.updateCids.length !== 1
									? 's'
									: ''} (Reflected below)
							</p>
						{/if}
					</div>

					<!-- Document Content Display -->
					{#if $docContent.loading}
						<div class="flex h-32 items-center justify-center">
							<div
								class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-[#3c2c8c]"
							></div>
						</div>
					{:else if $docContent.error}
						<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm">
							<p class="font-medium">Error loading content:</p>
							<p class="mt-2">{$docContent.error}</p>
						</div>
					{:else if $docContent.content}
						<!-- Create Snapshot Button (Conditional) -->
						{#if $selectedDoc && ($selectedDoc.updateCids?.length ?? 0) > 0}
							<div class="mb-4 flex justify-end">
								<button
									class="flex items-center rounded-md bg-[#3c2c8c] px-3 py-1 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2a1f62] focus:ring-2 focus:ring-[#3c2c8c] focus:ring-offset-2 focus:ring-offset-white focus:outline-none disabled:opacity-50"
									on:click={handleCreateSnapshot}
									disabled={isCreatingSnapshot}
									title="Consolidate all server updates into a new snapshot"
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
										Create Snapshot ({$selectedDoc.updateCids?.length ?? 0} updates)
									{/if}
								</button>
							</div>
						{/if}
						<!-- JSON Content Display -->
						<div class="overflow-hidden rounded-lg border border-gray-200 bg-gray-800 shadow-sm">
							<pre class="overflow-x-auto p-4 font-mono text-xs text-[#a5f3fc]">{JSON.stringify(
									$docContent.content,
									null,
									2
								)}</pre>
						</div>
					{:else}
						<div
							class="rounded-lg border border-gray-200 bg-white p-4 text-center text-gray-500 shadow-sm"
						>
							<p>No content available for this document.</p>
						</div>
					{/if}
				</div>
			{:else}
				<div class="flex h-full items-center justify-center p-6 text-center text-gray-500">
					<p>Select a document to view its content</p>
				</div>
			{/if}
		</aside>
	</div>
</div>
