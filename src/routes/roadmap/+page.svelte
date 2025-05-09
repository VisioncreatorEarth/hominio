<script lang="ts">
	import { roadmapConfig } from '$lib/roadmap/config';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	const phases = roadmapConfig.phases;
	let currentPhaseIndex = $state(0);
	let direction = $state(1); // 1 for next, -1 for previous

	function selectPhase(index: number) {
		if (index !== currentPhaseIndex) {
			direction = index > currentPhaseIndex ? 1 : -1;
			currentPhaseIndex = index;
		}
	}
</script>

<svelte:head>
	<title>Hominio Roadmap - Our Journey</title>
	<meta name="description" content="Explore the evolutionary development phases of the Hominio project, from genesis to the future." />
</svelte:head>

<div class="bg-linen text-prussian-blue font-ibm-plex-sans flex flex-col min-h-screen">
	<header class="py-8 px-4 md:px-8 text-center z-20 bg-linen shadow-md">
		<h1 class="font-playfair-display text-4xl sm:text-5xl font-bold text-prussian-blue mb-3">
			The Hominio Evolution
		</h1>
		<p class="text-lg sm:text-xl text-prussian-blue/80 max-w-2xl mx-auto leading-relaxed">
			Tap through our developmental eras, each a significant leap in our journey.
		</p>
	</header>

	<!-- Top Tab Navigation -->
	<nav class="py-4 px-4 bg-linen/90 backdrop-blur-md sticky top-0 z-10 border-b border-timberwolf-2 shadow-sm">
		<div class="max-w-xl mx-auto flex justify-center items-center space-x-1 sm:space-x-2 md:space-x-3 overflow-x-auto pb-2 scrollbar-hide">
			{#each phases as phase, i}
				<button
					on:click={() => selectPhase(i)}
					class="font-ibm-plex-sans text-xs sm:text-sm font-medium px-3 py-2 sm:px-4 sm:py-2 rounded-md transition-all duration-200 ease-in-out whitespace-nowrap
						{currentPhaseIndex === i
							? 'bg-prussian-blue text-linen shadow-md scale-105'
							: 'bg-timberwolf-1 text-prussian-blue/70 hover:bg-timberwolf-2 hover:text-prussian-blue focus:outline-none focus:ring-2 focus:ring-persian-orange/50'}"
					aria-label="Go to phase {phase.name}"
					title={phase.name}
				>
					{phase.name}
				</button>
			{/each}
		</div>
	</nav>

	<!-- Main Phase Display Area -->
	<main class="flex-grow flex items-center justify-center p-4 md:p-8 relative">
		<div class="w-full max-w-3xl text-center">
			{#key currentPhaseIndex}
				{@const currentPhase = phases[currentPhaseIndex]}
				<div
					class="bg-timberwolf-1 p-8 md:p-12 rounded-xl shadow-2xl border border-timberwolf-2"
					in:fly={{ x: direction * 200, duration: 500, easing: quintOut }}
					out:fly={{ x: -direction * 200, duration: 500, easing: quintOut }}
				>
					<h2 class="font-playfair-display text-3xl md:text-4xl lg:text-5xl font-bold text-prussian-blue mb-4">
						{currentPhase.name}
					</h2>
					<p class="font-ibm-plex-sans text-prussian-blue/80 text-base md:text-lg mb-6 mx-auto max-w-xl leading-relaxed">
						{currentPhase.description}
					</p>
					<div class="font-ibm-plex-sans text-md text-prussian-blue/90">
						<span class="font-semibold">Token Supply:</span>
						<span class="ml-2 bg-linen text-persian-orange px-4 py-2 rounded-full text-sm font-bold shadow-sm">
							{currentPhase.tokenSupply.toLocaleString()}
						</span>
					</div>
				</div>
			{/key}
		</div>
	</main>

</div>

<style>
	/* For browsers that don't support backdrop-filter well, or if it's disabled */
	@supports not (backdrop-filter: blur(10px)) {
		nav.sticky {
			background-color: var(--color-linen);
		}
	}

	/* Simple scrollbar hiding utility, use with caution for accessibility */
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;  /* IE and Edge */
		scrollbar-width: none;  /* Firefox */
	}
</style>