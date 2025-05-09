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

<!-- Global Navbar -->
<nav class="sticky top-0 z-50 flex justify-center w-full bg-linen shadow-md">
	<div class="flex justify-between items-center w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 py-3">
		<a href="/" class="flex items-center gap-2 text-prussian-blue hover:opacity-80 transition-opacity">
			<div class="w-10 h-10 md:w-12 md:h-12">
				<!-- SVG Logo -->
				<svg class="w-full h-full" viewBox="0 0 123 124" fill="none" xmlns="http://www.w3.org/2000/svg">
					<g>
						<path d="M23.853,48.297C23.853,48.297,21.318,45.395,18.407,44.381C14.089,42.877,5.898,44.320,2.749,49.602C1.302,52.030,0.195,53.571,0.026,56.128C-0.406,62.663,4.536,69.915,14.323,71.791C21.662,73.198,29.855,77.434,35.427,83.538C40.191,88.757,42.688,95.857,42.688,103.678C42.688,111.102,45.834,115.587,49.042,118.779C53.168,122.883,57.467,124.000,61.296,124.000C68.104,124.000,80.812,118.036,80.812,103.678C80.812,89.321,88.981,80.184,97.151,76.269C99.236,75.269,109.058,71.843,112.355,70.486C122.672,66.240,126.580,56.987,119.163,48.297C116.717,45.431,114.476,44.416,111.674,43.729C110.604,43.466,109.360,43.028,108.270,43.076C106.995,43.133,105.848,43.744,104.186,44.381C100.282,45.878,97.825,49.421,95.763,53.783C94.655,56.128,94.182,57.179,93.293,58.739C92.347,60.399,91.251,62.002,90.343,63.216C87.606,66.878,82.751,69.999,77.635,71.791C71.461,73.954,64.956,74.401,61.977,74.401C58.360,74.401,51.116,74.471,44.277,71.791C40.817,70.435,38.150,68.528,34.746,65.265C33.065,63.653,31.018,60.660,29.300,57.434C27.470,53.999,25.960,50.316,23.853,48.297Z" class="fill-prussian-blue" />
						<ellipse cx="61.611" cy="23.494" rx="23.487" ry="23.494" class="fill-prussian-blue" />
					</g>
				</svg>
			</div>
			<span class="font-playfair-display font-bold text-2xl md:text-3xl">Hominio</span>
		</a>

		<!-- Mobile Menu Toggle -->
		<button
			class="md:hidden flex flex-col justify-around w-6 h-5 bg-transparent border-none cursor-pointer p-0 z-20"
			on:click={toggleMenu}
			aria-label="Toggle menu"
			aria-expanded={navMenuOpen}
		>
			<span class="block w-full h-0.5 bg-prussian-blue rounded-sm transition-transform duration-300 ease-in-out {navMenuOpen ? 'transform rotate-45 translate-y-[5px]' : ''}"></span>
			<span class="block w-full h-0.5 bg-prussian-blue rounded-sm transition-opacity duration-300 ease-in-out {navMenuOpen ? 'opacity-0' : ''}"></span>
			<span class="block w-full h-0.5 bg-prussian-blue rounded-sm transition-transform duration-300 ease-in-out {navMenuOpen ? 'transform -rotate-45 -translate-y-[5px]' : ''}"></span>
		</button>

		<!-- Navigation Links - Desktop -->
		<div class="hidden md:flex items-center space-x-6">
			<!-- Add actual navigation links here if any -->
			<!-- Example: <a href="/about" class="text-prussian-blue hover:text-persian-orange transition-colors">About</a> -->
		</div>

		<!-- Mobile Navigation Menu (Overlay) -->
		{#if navMenuOpen}
			<div
				class="md:hidden fixed inset-0 bg-linen/95 backdrop-blur-sm z-10 flex flex-col items-center justify-center space-y-6"
				on:click={() => (navMenuOpen = false)}
			>
				<!-- Add mobile navigation links here -->
				<!-- Example: <a href="/about" class="text-2xl text-prussian-blue hover:text-persian-orange" on:click|stopPropagation>About</a> -->
				<button class="text-2xl text-prussian-blue hover:text-persian-orange" on:click|stopPropagation={() => { scrollToSection(0); navMenuOpen = false;}}>Home</button>
				{#each sectionsToObserve as section, i}
					{#if section} <!-- Check if section element exists -->
						<button
							on:click|stopPropagation={() => scrollToSection(i)}
							class="text-2xl text-prussian-blue hover:text-persian-orange transition-colors {currentSectionIdx === i ? 'font-bold text-persian-orange' : ''}"
						>
							Section {i + 1} <!-- Placeholder name -->
						</button>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</nav>

<main class="bg-linen text-prussian-blue font-ibm-plex-sans">
	<!-- Section Navigation Indicators (Side Dots) -->
	<div class="fixed right-4 md:right-6 top-1/2 transform -translate-y-1/2 z-10 hidden md:block">
		<div class="flex flex-col space-y-3">
			{#each sectionsToObserve as _, i}
				<button
					class="w-3 h-3 rounded-full transition-all duration-300 {currentSectionIdx === i ? 'bg-prussian-blue scale-125' : 'bg-timberwolf-2 hover:bg-timberwolf-1'}"
					on:click={() => scrollToSection(i)}
					aria-label="Go to section {i + 1}"
				></button>
			{/each}
		</div>
	</div>

	<!-- Page Sections -->
	<!-- Ensure each section component can accept 'bind:this={variableName}' and 'aria-label' for navigation -->
	<Hero bind:heroSection={heroSection} />
	<DataPot bind:dataPotSection={dataPotSection} />
	<WhatsAVibe bind:sectionRef={whatsAVibeSection} />
	<GameChanger bind:sectionRef={gameChangerSection} />
	<Marketplace bind:sectionRef={marketplaceSection} />
	<BuildMonetize bind:sectionRef={buildMonetizeSection} />
	<FutureFeatures bind:sectionRef={futureFeaturesSection} />
	<Founders bind:sectionRef={foundersSection} />

	<!-- Newsletter Signup Section -->
	<section class="py-16 md:py-24 bg-linen text-prussian-blue">
		<div class="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="bg-timberwolf-1 rounded-2xl shadow-xl p-8 md:p-12">
				<div class="grid grid-cols-1 md:grid-cols-4 gap-8 items-center">
					<div class="hidden md:flex justify-center items-center md:col-span-1">
						<div class="w-24 h-24 text-prussian-blue">
							<!-- SVG Logo -->
							<svg class="w-full h-full" viewBox="0 0 123 124" fill="none" xmlns="http://www.w3.org/2000/svg">
								<g><path d="M23.853,48.297C23.853,48.297,21.318,45.395,18.407,44.381C14.089,42.877,5.898,44.320,2.749,49.602C1.302,52.030,0.195,53.571,0.026,56.128C-0.406,62.663,4.536,69.915,14.323,71.791C21.662,73.198,29.855,77.434,35.427,83.538C40.191,88.757,42.688,95.857,42.688,103.678C42.688,111.102,45.834,115.587,49.042,118.779C53.168,122.883,57.467,124.000,61.296,124.000C68.104,124.000,80.812,118.036,80.812,103.678C80.812,89.321,88.981,80.184,97.151,76.269C99.236,75.269,109.058,71.843,112.355,70.486C122.672,66.240,126.580,56.987,119.163,48.297C116.717,45.431,114.476,44.416,111.674,43.729C110.604,43.466,109.360,43.028,108.270,43.076C106.995,43.133,105.848,43.744,104.186,44.381C100.282,45.878,97.825,49.421,95.763,53.783C94.655,56.128,94.182,57.179,93.293,58.739C92.347,60.399,91.251,62.002,90.343,63.216C87.606,66.878,82.751,69.999,77.635,71.791C71.461,73.954,64.956,74.401,61.977,74.401C58.360,74.401,51.116,74.471,44.277,71.791C40.817,70.435,38.150,68.528,34.746,65.265C33.065,63.653,31.018,60.660,29.300,57.434C27.470,53.999,25.960,50.316,23.853,48.297Z" fill="currentColor"/><ellipse cx="61.611" cy="23.494" rx="23.487" ry="23.494" fill="currentColor"/></g>
							</svg>
						</div>
					</div>
					<div class="md:col-span-3 text-center md:text-left">
						<h2 class="font-playfair-display text-3xl md:text-4xl text-prussian-blue font-normal mb-2">Be Part of the Journey.</h2>
						<p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/90 mb-6">
							Get Hominio news, creator insights, and roadmap updates delivered.
						</p>
						<form class="mt-4 max-w-md mx-auto md:mx-0">
							<div class="flex flex-col sm:flex-row items-stretch gap-3">
								<input
									type="email"
									placeholder="Enter your email"
									class="appearance-none bg-transparent border-b-2 border-prussian-blue/50 focus:border-prussian-blue focus:ring-0 focus:outline-none w-full py-2 px-1 placeholder-prussian-blue/60 font-ibm-plex-sans text-lg text-prussian-blue flex-grow"
								/>
								<button
									type="submit"
									class="font-ibm-plex-sans inline-block bg-prussian-blue text-linen px-6 py-3 sm:py-2 rounded-md font-semibold text-base shadow-md hover:bg-prussian-blue/90 transition-colors flex-shrink-0"
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
	<meta name="description" content="Discover Hominio, the platform to create, manage, and monetize AI twins. Explore vibes, data pots, and a revolutionary marketplace." />
</svelte:head>
