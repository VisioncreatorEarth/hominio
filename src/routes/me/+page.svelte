<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { browser } from '$app/environment';
	import VibeRenderer from '$lib/components/VibeRenderer.svelte';
	import { pageMetadataStore } from '$lib/stores/layoutStore';

	// Use $props() for runes mode
	let { data } = $props<{ data: PageData }>();

	// Use $effect to update the store when data changes
	$effect(() => {
		if (data.title && data.description) {
			$pageMetadataStore = { title: data.title, description: data.description };
		}
	});

	// Client-side check: If the session is null after initial load, redirect.
	// This handles cases where the session might expire or be invalidated client-side.
	// This check might be redundant now due to the layout's check, but kept for safety.
	// if (browser && !data.session) {
	// 	goto('/');
	// }
</script>

<main class="relative min-h-screen bg-[#f8f4ed]">
	<!-- Content on top -->
	<div class="relative z-10 min-h-screen w-full">
		<VibeRenderer vibeId="home" />
	</div>
</main>
