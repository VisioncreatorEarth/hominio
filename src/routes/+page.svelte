<script lang="ts">
	import { onMount } from 'svelte';
	import { BROWSER } from 'esm-env';

	// Import section components
	import Hero from '$lib/components/sections/hominio/Hero.svelte';
	import DataPot from '$lib/components/sections/hominio/DataPot.svelte';
	import WhatsAVibe from '$lib/components/sections/hominio/WhatsAVibe.svelte';
	import GameChanger from '$lib/components/sections/hominio/GameChanger.svelte';
	import Marketplace from '$lib/components/sections/hominio/Marketplace.svelte';
	import BuildMonetize from '$lib/components/sections/hominio/BuildMonetize.svelte';
	import FutureFeatures from '$lib/components/sections/hominio/FutureFeatures.svelte';
	import Founders from '$lib/components/sections/hominio/Founders.svelte';
	import VibeEditorSection from '$lib/components/sections/hominio/VibeEditorSection.svelte';

	// State for mobile navigation menu
	let navMenuOpen = $state(false);

	// Section refs using Svelte 5 $state for potentially dynamic assignment if needed, though direct let is also fine
	let heroSection: HTMLElement | null = $state(null);
	let dataPotSection: HTMLElement | null = $state(null);
	let whatsAVibeSection: HTMLElement | null = $state(null);
	let gameChangerSection: HTMLElement | null = $state(null);
	let marketplaceSection: HTMLElement | null = $state(null);
	let buildMonetizeSection: HTMLElement | null = $state(null);
	let futureFeaturesSection: HTMLElement | null = $state(null);
	let foundersSection: HTMLElement | null = $state(null);
	let vibeEditorSection: HTMLElement | null = $state(null);

	// Array to track sections for intersection observing
	// Needs to be reactive if sections are added/removed dynamically, otherwise can be plain array
	let sectionsToObserve = $state<(HTMLElement | null)[]>([]);
	let currentSectionIdx = $state(0); // Stores the index of the current section

	// Toggle mobile menu
	function toggleMenu() {
		navMenuOpen = !navMenuOpen;
	}

	onMount(() => {
		if (!BROWSER) return;

		// Populate sectionsToObserve after components are mounted and refs are available
		// The order here determines the navigation dot order
		sectionsToObserve = [
			heroSection,
			dataPotSection,
			whatsAVibeSection,
			gameChangerSection,
			vibeEditorSection,
			marketplaceSection,
			buildMonetizeSection,
			futureFeaturesSection,
			foundersSection
		];

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						// Find the index of the intersecting section
						const idx = sectionsToObserve.findIndex((sec) => sec === entry.target);
						if (idx !== -1) {
							currentSectionIdx = idx;
						}
					}
				});
			},
			{ threshold: 0.5, rootMargin: '-50px 0px -50px 0px' }
		);

		sectionsToObserve.forEach((section) => {
			if (section) observer.observe(section);
		});

		return () => {
			sectionsToObserve.forEach((section) => {
				if (section) observer.unobserve(section);
			});
		};
	});

	function scrollToSection(index: number) {
		const section = sectionsToObserve[index];
		if (section) {
			section.scrollIntoView({ behavior: 'smooth' });
			// Close mobile menu if open after clicking a section link
			if (navMenuOpen) {
				navMenuOpen = false;
			}
		}
	}
</script>

<main class="bg-linen text-prussian-blue font-ibm-plex-sans">
	<!-- Section Navigation Indicators (Side Dots) -->
	<div class="fixed top-1/2 right-4 z-10 hidden -translate-y-1/2 transform md:right-6 md:block">
		<div class="flex flex-col space-y-3">
			{#each sectionsToObserve as _, i}
				<button
					class="h-3 w-3 rounded-full transition-all duration-300 {currentSectionIdx === i
						? 'bg-prussian-blue scale-125'
						: 'bg-timberwolf-2 hover:bg-timberwolf-1'}"
					on:click={() => scrollToSection(i)}
					aria-label="Go to section {i + 1}"
				></button>
			{/each}
		</div>
	</div>

	<!-- Page Sections -->
	<!-- Ensure each section component can accept 'bind:this={variableName}' and 'aria-label' for navigation -->
	<Hero bind:heroSection />
	<DataPot bind:dataPotSection />
	<WhatsAVibe bind:sectionRef={whatsAVibeSection} />
	<GameChanger bind:sectionRef={gameChangerSection} />
	<VibeEditorSection bind:sectionRef={vibeEditorSection} />
	<Marketplace bind:sectionRef={marketplaceSection} />
	<BuildMonetize bind:sectionRef={buildMonetizeSection} />
	<FutureFeatures bind:sectionRef={futureFeaturesSection} />
	<Founders bind:sectionRef={foundersSection} />

	<!-- Newsletter Signup Section -->
	<section class="bg-linen text-prussian-blue py-16 md:py-24">
		<div class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
			<div class="bg-timberwolf-1 rounded-2xl p-8 shadow-xl md:p-12">
				<div class="grid grid-cols-1 items-center gap-8 md:grid-cols-4">
					<div class="hidden items-center justify-center md:col-span-1 md:flex">
						<div class="text-prussian-blue h-24 w-24">
							<!-- SVG Logo -->
							<svg
								class="h-full w-full"
								viewBox="0 0 123 124"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<g
									><path
										d="M23.853,48.297C23.853,48.297,21.318,45.395,18.407,44.381C14.089,42.877,5.898,44.320,2.749,49.602C1.302,52.030,0.195,53.571,0.026,56.128C-0.406,62.663,4.536,69.915,14.323,71.791C21.662,73.198,29.855,77.434,35.427,83.538C40.191,88.757,42.688,95.857,42.688,103.678C42.688,111.102,45.834,115.587,49.042,118.779C53.168,122.883,57.467,124.000,61.296,124.000C68.104,124.000,80.812,118.036,80.812,103.678C80.812,89.321,88.981,80.184,97.151,76.269C99.236,75.269,109.058,71.843,112.355,70.486C122.672,66.240,126.580,56.987,119.163,48.297C116.717,45.431,114.476,44.416,111.674,43.729C110.604,43.466,109.360,43.028,108.270,43.076C106.995,43.133,105.848,43.744,104.186,44.381C100.282,45.878,97.825,49.421,95.763,53.783C94.655,56.128,94.182,57.179,93.293,58.739C92.347,60.399,91.251,62.002,90.343,63.216C87.606,66.878,82.751,69.999,77.635,71.791C71.461,73.954,64.956,74.401,61.977,74.401C58.360,74.401,51.116,74.471,44.277,71.791C40.817,70.435,38.150,68.528,34.746,65.265C33.065,63.653,31.018,60.660,29.300,57.434C27.470,53.999,25.960,50.316,23.853,48.297Z"
										fill="currentColor"
									/><ellipse
										cx="61.611"
										cy="23.494"
										rx="23.487"
										ry="23.494"
										fill="currentColor"
									/></g
								>
							</svg>
						</div>
					</div>
					<div class="text-center md:col-span-3 md:text-left">
						<h2
							class="font-playfair-display text-prussian-blue mb-2 text-3xl font-normal md:text-4xl"
						>
							Be Part of the Journey.
						</h2>
						<p class="font-ibm-plex-sans text-prussian-blue/90 mb-6 text-lg md:text-xl">
							Get Hominio news, creator insights, and roadmap updates delivered.
						</p>
						<form class="mx-auto mt-4 max-w-md md:mx-0">
							<div class="flex flex-col items-stretch gap-3 sm:flex-row">
								<input
									type="email"
									placeholder="Enter your email"
									class="border-prussian-blue/50 focus:border-prussian-blue placeholder-prussian-blue/60 font-ibm-plex-sans text-prussian-blue w-full flex-grow appearance-none border-b-2 bg-transparent px-1 py-2 text-lg focus:ring-0 focus:outline-none"
								/>
								<button
									type="submit"
									class="font-ibm-plex-sans bg-prussian-blue text-linen hover:bg-prussian-blue/90 inline-block flex-shrink-0 rounded-md px-6 py-3 text-base font-semibold shadow-md transition-colors sm:py-2"
								>
									Subscribe
								</button>
							</div>
						</form>
					</div>
				</div>
			</div>
		</div>
	</section>
</main>

<!-- No <style> block needed here as global styles are in app.css and component styles are inline via Tailwind -->
<!-- Font imports are expected to be in app.css or layout -->

<svelte:head>
	<title>Hominio - Your AI Twin for Personalized Experiences</title>
	<meta
		name="description"
		content="Discover Hominio, the platform to create, manage, and monetize AI twins. Explore vibes, data pots, and a revolutionary marketplace."
	/>
</svelte:head>
