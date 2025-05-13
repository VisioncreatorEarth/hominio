<script lang="ts">
	import { goto } from '$app/navigation';
	import StatusUI from '$lib/components/StatusUI.svelte';
	import type { LayoutData } from './$types';
	import { browser } from '$app/environment';
	import { o } from '$lib/KERNEL/hominio-svelte';
	import { setContext, onMount } from 'svelte';
	import { pageMetadataStore } from '$lib/stores/layoutStore';
	import { get } from 'svelte/store';

	setContext('o', o);

	onMount(() => {
		if (browser) {
			o.pkp.initializeProfileState();
		}
	});

	$effect(() => {
		if (browser && o.pkp) {
			const profile = get(o.pkp.profile);
			console.log('[Me Layout] Facade PKP Profile in Layout:', profile);
		}
	});

	let { data } = $props<{ data: LayoutData }>();

	$effect(() => {
		if (browser && data && !data.session) {
			console.log('[Layout /me] No session detected on client (via $effect), redirecting to /');
			goto('/');
		}
	});
</script>

<div class="flex h-screen flex-col bg-[#f8f4ed]">
	<!-- Header -->
	<header class="border-b border-gray-300 bg-[#f8f4ed] px-4 py-2 shadow-sm">
		<div class="flex items-center justify-between">
			<div class="flex-1">
				<!-- Display title and description from the store -->
				<h1 class="text-lg font-bold text-[#0a2a4e]">{$pageMetadataStore.title}</h1>
				{#if $pageMetadataStore.description}
					<p class="text-sm text-gray-600">{$pageMetadataStore.description}</p>
				{/if}
			</div>
			<div class="flex-shrink-0">
				{#if data.session}
					<!-- Only show StatusUI if logged in -->
					<StatusUI />
				{/if}
			</div>
		</div>
		<!-- Navigation for /me section -->
		{#if data.session}
			<nav class="mt-2 flex space-x-4 border-t border-gray-200 pt-2">
				<a href="/me" class="text-sm font-medium text-slate-700 hover:text-slate-900">Me</a>
				<a href="/me/todos" class="text-sm font-medium text-slate-700 hover:text-slate-900">Todos</a
				>
				<a href="/me/hql" class="text-sm font-medium text-slate-700 hover:text-slate-900">HQL</a>

				<a href="/me/wallet" class="text-sm font-medium text-slate-700 hover:text-slate-900"
					>Wallet</a
				>
				<a href="/me/settings" class="text-sm font-medium text-slate-700 hover:text-slate-900"
					>Settings</a
				>
				<a href="/me/guardian" class="text-sm font-medium text-slate-700 hover:text-slate-900"
					>Guardian</a
				>
				<!-- Add other /me links here if needed -->
			</nav>
		{/if}
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
