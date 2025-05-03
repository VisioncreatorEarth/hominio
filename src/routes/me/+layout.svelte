<script lang="ts">
	import { goto } from '$app/navigation';
	import SyncStatusUI from '$lib/components/SyncStatusUI.svelte';
	import type { LayoutData } from './$types';
	import { browser } from '$app/environment';

	// --- Context Setup ---
	// Import necessary Hominio facade elements
	import { o } from '$lib/KERNEL/hominio-svelte';
	import { setContext } from 'svelte';

	// Expose Hominio facade to child components via context
	setContext('o', o);
	// REMOVED: getMe context setup, as it's part of 'o'
	// --- End Context Setup ---

	// --- Page Metadata Store ---
	import { pageMetadataStore } from '$lib/stores/layoutStore';
	// --- End Store Import ---

	export let data: LayoutData;

	// Reactive check for session on the client
	$: {
		if (browser && !data.session) {
			console.log('[Layout /me] No session detected on client, redirecting to /');
			goto('/');
		}
	}
</script>

<div class="flex h-screen flex-col bg-[#f8f4ed]">
	<!-- Header -->
	<header
		class="flex items-center justify-between border-b border-gray-300 bg-[#f8f4ed] px-4 py-2 shadow-sm"
	>
		<div class="flex-1">
			<!-- Display title and description from the store -->
			<h1 class="text-lg font-bold text-[#0a2a4e]">{$pageMetadataStore.title}</h1>
			{#if $pageMetadataStore.description}
				<p class="text-sm text-gray-600">{$pageMetadataStore.description}</p>
			{/if}
		</div>
		<div class="flex-grow">
			{#if data.session}
				<!-- Only show SyncStatusUI if logged in -->
				<SyncStatusUI />
			{/if}
		</div>
	</header>

	<!-- Main Content Area -->
	<main class="flex-1 overflow-auto">
		{#if data.session}
			<slot />
		{:else}
			<!-- Optional: Show a loading or unauthorized message while redirecting -->
			<div class="p-4 text-center text-gray-500">Redirecting...</div>
		{/if}
	</main>
</div>
