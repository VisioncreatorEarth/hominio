<script lang="ts">
	import { hominio } from '$lib/client/hominio';
	import { onMount } from 'svelte';

	interface KernelRegistry {
		status: string;
		version: string;
		registry: {
			id: string;
			contentHash: string;
		};
	}

	interface LoroDocResponse {
		status: string;
		data: {
			meta: Record<string, string>;
			content: Record<string, string>;
		};
	}

	let loading = true;
	let error: string | null = null;
	let kernelData: KernelRegistry | null = null;
	let currentDoc: LoroDocResponse | null = null;

	async function loadDoc(contentHash: string) {
		try {
			const response = await hominio.peer.docs[contentHash].get();
			if (response.error) {
				throw new Error(response.error.message);
			}
			currentDoc = response.data;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load document';
		}
	}

	async function initializeKernel() {
		try {
			// Load the kernel registry
			const response = await hominio.peer.get();
			if (!response.data) {
				throw new Error('Failed to load kernel registry');
			}

			kernelData = response.data;

			// Load the document directly using the content hash
			await loadDoc(kernelData.registry.contentHash);
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to connect to kernel';
			kernelData = null;
			currentDoc = null;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		initializeKernel();
	});
</script>

<div class="min-h-screen bg-gray-900 p-4 text-white dark:bg-gray-950">
	{#if loading}
		<div class="text-center">
			<div class="mx-auto h-8 w-8 animate-spin rounded-full border-t-2 border-emerald-500"></div>
			<p class="mt-2">Initializing Kernel...</p>
		</div>
	{:else if error}
		<div class="rounded-lg border border-red-500/20 bg-red-900/50 p-4 dark:bg-red-950/50">
			<h2 class="font-bold text-red-400">Connection Error</h2>
			<p>{error}</p>
		</div>
	{:else if kernelData && currentDoc}
		<div class="space-y-6">
			<!-- Kernel Registry -->
			<div class="rounded-lg border border-emerald-500/20 bg-gray-800/50 p-4 dark:bg-gray-900/50">
				<h2 class="mb-4 text-xl font-bold text-emerald-400">Kernel Registry</h2>
				<div class="space-y-2">
					<p>
						<span class="text-emerald-300">Status:</span>
						<span class="text-emerald-100">{kernelData.status}</span>
					</p>
					<p>
						<span class="text-emerald-300">Version:</span>
						<span class="text-emerald-100">{kernelData.version}</span>
					</p>
				</div>
				<div class="mt-4">
					<h3 class="mb-2 text-lg font-semibold text-emerald-300">Registry Entry</h3>
					<div class="rounded bg-gray-900/50 p-3">
						<p class="mb-2 font-mono text-sm">
							<span class="text-emerald-300">Registry ID:</span>
							<span class="ml-2 text-emerald-100">{kernelData.registry.id}</span>
						</p>
						<p class="font-mono text-sm">
							<span class="text-emerald-300">Content Hash:</span>
							<span class="ml-2 text-emerald-100">{kernelData.registry.contentHash}</span>
						</p>
					</div>
				</div>
			</div>

			<!-- Current Document -->
			<div class="rounded-lg border border-blue-500/20 bg-gray-800/50 p-4 dark:bg-gray-900/50">
				<h2 class="mb-4 text-xl font-bold text-blue-400">Hello Earth Document</h2>

				<!-- Metadata -->
				<div class="mb-4">
					<h3 class="mb-2 text-lg font-semibold text-blue-300">Metadata</h3>
					<div class="space-y-2">
						{#each Object.entries(currentDoc.data.meta) as [key, value]}
							<p>
								<span class="text-blue-300">{key}:</span>
								<span class="ml-2 text-blue-100">{value}</span>
							</p>
						{/each}
					</div>
				</div>

				<!-- Content -->
				<div>
					<h3 class="mb-2 text-lg font-semibold text-blue-300">Content</h3>
					<div class="space-y-2">
						{#each Object.entries(currentDoc.data.content) as [key, value]}
							<p>
								<span class="text-blue-300">{key}:</span>
								<span class="ml-2 text-blue-100">{value}</span>
							</p>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
