<script lang="ts">
	import type { PageData } from './$types';
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
</script>

<main class="relative h-full bg-[#f8f4ed]">
	<!-- Content on top -->
	<div class="m z-10 h-full w-full">
		<VibeRenderer vibeId="home" />
	</div>
</main>
