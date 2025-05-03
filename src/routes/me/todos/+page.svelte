<script lang="ts">
	import Todos from '$lib/components/Todos.svelte';
	import { pageMetadataStore } from '$lib/stores/layoutStore';
	import type { PageData } from './$types';

	// Use $props() for runes mode
	let { data } = $props<{ data: PageData }>();

	// Use $effect to update the store when data changes
	$effect(() => {
		if (data.title && data.description) {
			$pageMetadataStore = { title: data.title, description: data.description };
		}
	});
</script>

<div class="h-full w-full">
	<Todos />
</div>
