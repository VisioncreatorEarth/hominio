<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { browser } from '$app/environment';
	import VibeRenderer from '$lib/components/VibeRenderer.svelte';

	export let data: PageData;

	// Client-side check: If the session is null after initial load, redirect.
	// This handles cases where the session might expire or be invalidated client-side.
	if (browser && !data.session) {
		goto('/');
	}
</script>

<main class="relative min-h-screen bg-[#f8f4ed]">
	<!-- Content on top -->
	<div class="relative z-10 min-h-screen w-full">
		<VibeRenderer vibeId="home" />
	</div>
</main>
