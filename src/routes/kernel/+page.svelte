<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeKernel, KERNEL_REGISTRY, docStore } from '$lib/KERNEL/loro-service';
	import { syncService, CLIENT_PEER_ID, SERVER_PEER_ID } from '$lib/KERNEL/sync-service';
	import type { DocSyncState } from '$lib/KERNEL/sync-service';

	let currentDoc: any;
	let syncState: DocSyncState;
	let metadata: Record<string, string> = {};
	let content: Record<string, string> = {};

	onMount(() => {
		const kernel = initializeKernel();
		currentDoc = kernel.doc;
		updateSyncState();
		updateDocContent();
	});

	function updateSyncState() {
		if (currentDoc) {
			syncState = syncService.getSyncState(currentDoc);
		}
	}

	function updateDocContent() {
		if (currentDoc) {
			// Get metadata
			const meta = currentDoc.getMap('meta');
			metadata = {
				type: meta.get('@type') as string,
				created: meta.get('@created') as string
			};

			// Get content
			const contentMap = currentDoc.getMap('content');
			content = {
				message: contentMap.get('message') as string,
				description: contentMap.get('description') as string
			};
		}
	}

	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString();
	}

	function truncateHash(hash: string): string {
		return hash ? `${hash.slice(0, 6)}...${hash.slice(-6)}` : 'No hash';
	}
</script>

<div class="min-h-screen bg-gray-900 p-8 text-white">
	<div class="mx-auto max-w-6xl">
		<h1 class="mb-8 text-3xl font-bold">Hominio Kernel</h1>

		{#if currentDoc}
			<div class="mb-8 rounded-lg bg-gray-800 p-6">
				<h2 class="mb-4 text-xl font-semibold">Hello Earth Document</h2>

				<!-- Two Column Layout -->
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<!-- Left Column: Document Data -->
					<div class="space-y-4">
						<!-- Content Hash Section -->
						<div class="rounded border border-gray-700 p-4">
							<h3 class="mb-2 text-lg font-medium">Content Hash</h3>
							<p class="font-mono text-green-400">{truncateHash(syncState?.currentHash)}</p>
							<p class="mt-1 text-sm text-gray-400">
								Last Updated: {formatTime(syncState?.lastSyncedAt)}
							</p>
						</div>

						<!-- Metadata Section -->
						<div class="rounded border border-gray-700 p-4">
							<h3 class="mb-2 text-lg font-medium">Metadata</h3>
							<div class="space-y-2">
								<p>
									<span class="text-gray-400">Type:</span>
									<span class="ml-2 font-mono text-blue-400">{metadata.type}</span>
								</p>
								<p>
									<span class="text-gray-400">Created:</span>
									<span class="ml-2 font-mono text-blue-400">{metadata.created}</span>
								</p>
							</div>
						</div>

						<!-- Content Section -->
						<div class="rounded border border-gray-700 p-4">
							<h3 class="mb-2 text-lg font-medium">Content</h3>
							<div class="space-y-2">
								<p>
									<span class="text-gray-400">Message:</span>
									<span class="ml-2 font-mono text-emerald-400">{content.message}</span>
								</p>
								<p>
									<span class="text-gray-400">Description:</span>
									<span class="ml-2 font-mono text-emerald-400">{content.description}</span>
								</p>
							</div>
						</div>
					</div>

					<!-- Right Column: Sync Status -->
					<div class="rounded border border-gray-700 p-4">
						<h3 class="mb-4 text-lg font-medium">Peer Sync Status</h3>

						<!-- Client Peer -->
						<div class="mb-6">
							<div class="flex items-center">
								<div
									class={`mr-2 h-3 w-3 rounded-full ${
										syncService.isPeerSynced(currentDoc, CLIENT_PEER_ID)
											? 'bg-green-500'
											: 'bg-yellow-500'
									}`}
								></div>
								<h4 class="font-medium">Client Peer</h4>
							</div>
							<div class="mt-2 space-y-1">
								<p class="font-mono text-sm">{syncState?.peers.client.id}</p>
								<p class="text-sm text-gray-400">
									Last Sync: {formatTime(syncState?.peers.client.lastSyncedAt)}
								</p>
								<p class="font-mono text-sm text-gray-400">
									Hash: {truncateHash(syncState?.peers.client.lastKnownHash)}
								</p>
							</div>
						</div>

						<!-- Server Peer -->
						<div>
							<div class="flex items-center">
								<div
									class={`mr-2 h-3 w-3 rounded-full ${
										syncService.isPeerSynced(currentDoc, SERVER_PEER_ID)
											? 'bg-green-500'
											: 'bg-yellow-500'
									}`}
								></div>
								<h4 class="font-medium">Server Peer</h4>
							</div>
							<div class="mt-2 space-y-1">
								<p class="font-mono text-sm">{syncState?.peers.server.id}</p>
								<p class="text-sm text-gray-400">
									Last Sync: {formatTime(syncState?.peers.server.lastSyncedAt)}
								</p>
								<p class="font-mono text-sm text-gray-400">
									Hash: {truncateHash(syncState?.peers.server.lastKnownHash)}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
