<script lang="ts">
	import VibeRenderer from '$lib/components/VibeRenderer.svelte';
</script>

<main class="relative min-h-screen">
	<!-- Background div with image -->
	<div class="absolute inset-0 bg-[url('/bg.jpg')] bg-cover bg-fixed bg-center"></div>

	<!-- Dark overlay with opacity and blur -->
	<div class="absolute inset-0 bg-blue-950/60 backdrop-blur-xs"></div>

	<!-- Content on top -->
	<div class="relative z-10 min-h-screen w-full">
		<VibeRenderer vibeId="home" />
	</div>
</main>
