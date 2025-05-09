<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { sineInOut } from 'svelte/easing';
	import { fly, fade } from 'svelte/transition';

	export let sectionRef: HTMLElement | null = null;
	let chatArea: HTMLElement | null = null;

	let chatVisible = false; // Controls whether the animation sequence *can* start
	let showUser = false;
	let showSearching = false;
	let showHominioInitialResponse = false; 
	let showUserFollowUpMessage = false;    
	let showHominioUpdatedResponse = false; 

	let observer: IntersectionObserver | null = null;

	// Variables to hold timeout IDs
	let searchTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let hominioInitialTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let userFollowUpTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let hominioUpdatedTimeoutId: ReturnType<typeof setTimeout> | null = null;

	function clearAllTimeouts() {
		if (searchTimeoutId) clearTimeout(searchTimeoutId);
		if (hominioInitialTimeoutId) clearTimeout(hominioInitialTimeoutId);
		if (userFollowUpTimeoutId) clearTimeout(userFollowUpTimeoutId);
		if (hominioUpdatedTimeoutId) clearTimeout(hominioUpdatedTimeoutId);
		searchTimeoutId = hominioInitialTimeoutId = userFollowUpTimeoutId = hominioUpdatedTimeoutId = null;
	}

	function resetSequence() {
		clearAllTimeouts();
		showUser = false;
		showSearching = false;
		showHominioInitialResponse = false;
		showUserFollowUpMessage = false;
		showHominioUpdatedResponse = false;
		chatVisible = false; // Allow sequence to start again on intersection
	}

	function startSequence() {
		chatVisible = true; // Mark sequence as started
		showUser = true; // Show user bubble immediately
		
		// Start searching after a short delay
		searchTimeoutId = setTimeout(() => {
			showSearching = true;
		}, 700); 

		// Show Hominio initial response after search delay
		hominioInitialTimeoutId = setTimeout(() => {
			showSearching = false; // Hide searching indicator
			showHominioInitialResponse = true;
		}, 2200); 

		// Show User follow-up message after Hominio's initial response
		userFollowUpTimeoutId = setTimeout(() => {
			showUserFollowUpMessage = true;
		}, 2200 + 1800); 

		// Show Hominio's updated response after user's follow-up
		hominioUpdatedTimeoutId = setTimeout(() => {
			showHominioInitialResponse = false; // Hide initial Hominio response
			showHominioUpdatedResponse = true;
		}, 2200 + 1800 + 1800); 
		// Removed observer.unobserve here
	}

	onMount(() => {
		if (!chatArea) return;

		observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					if (!chatVisible) { // Only start if not already visible/running
					startSequence();
					}
				} else {
					// Element scrolled out of view, reset everything
					resetSequence();
				}
			});
		}, { threshold: 0.3 });

		observer.observe(chatArea);
	});

	onDestroy(() => {
		clearAllTimeouts(); // Clear any pending timeouts
		chatArea && observer?.unobserve(chatArea);
		chatArea && observer?.disconnect(); // Disconnect observer fully
	});

</script>

<section bind:this={sectionRef} data-section="3" class="py-16 md:py-24 bg-linen text-prussian-blue overflow-x-hidden">
    <div class="w-full max-w-4xl mx-auto px-4 md:px-8 text-center">
        <h2 class="font-playfair-display text-4xl md:text-5xl font-normal mb-6">What's a <span class="text-persian-orange">Vibe</span>?</h2>
        <p class="font-ibm-plex-sans text-xl md:text-2xl text-prussian-blue/90 mb-10 max-w-3xl mx-auto">
            A Vibe is a voice-first mini‑app. No menus, no dashboards. Just speak or click.
        </p>

        <div class="flex justify-center mb-8">
            <div class="w-14 h-14 rounded-full bg-prussian-blue flex items-center justify-center shadow-lg">
                <svg class="w-7 h-7 text-linen" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clip-rule="evenodd"></path></svg>
            </div>
        </div>

        <div class="max-w-2xl mx-auto space-y-4 mb-12 min-h-[250px] relative" bind:this={chatArea}>
            {#if showUser}
            <div class="flex items-start justify-start gap-3 pt-8" 
                 in:fly={{ y: 20, duration: 500, easing: sineInOut }}>
                <div class="w-10 h-10 rounded-full bg-timberwolf-1 flex items-center justify-center flex-shrink-0 mt-1">
                    <svg class="w-6 h-6 text-buff" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path></svg>
                </div>
                <div class="bg-timberwolf-2/80 backdrop-blur-sm border border-timberwolf-2/90 rounded-xl p-4 text-left shadow-lg">
                    <p class="font-ibm-plex-sans text-lg text-prussian-blue">
                        Hey Hominio, show me my To-Do Vibe.
                    </p>
                 </div>
            </div>
            {/if}

            {#if showSearching}
            <div class="flex justify-center items-center gap-2 pt-4 text-prussian-blue/80" 
                 transition:fade={{ duration: 300 }}>
                 <svg class="w-4 h-4 animate-spin text-prussian-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                <span class="font-ibm-plex-sans text-sm">Searching Data Pot...</span>
            </div>
            {/if}

            {#if showHominioInitialResponse}
            <div class="flex items-start justify-start gap-3" 
                 in:fly={{ y: 20, duration: 500, delay: 100, easing: sineInOut }}>
                <div class="w-10 h-10 rounded-full bg-prussian-blue flex items-center justify-center flex-shrink-0 mt-1 p-1.5">
					<svg class="w-full h-full" viewBox="0 0 123 124" fill="none" xmlns="http://www.w3.org/2000/svg">
						<g>
							<path d="M23.853,48.297C23.853,48.297,21.318,45.395,18.407,44.381C14.089,42.877,5.898,44.320,2.749,49.602C1.302,52.030,0.195,53.571,0.026,56.128C-0.406,62.663,4.536,69.915,14.323,71.791C21.662,73.198,29.855,77.434,35.427,83.538C40.191,88.757,42.688,95.857,42.688,103.678C42.688,111.102,45.834,115.587,49.042,118.779C53.168,122.883,57.467,124.000,61.296,124.000C68.104,124.000,80.812,118.036,80.812,103.678C80.812,89.321,88.981,80.184,97.151,76.269C99.236,75.269,109.058,71.843,112.355,70.486C122.672,66.240,126.580,56.987,119.163,48.297C116.717,45.431,114.476,44.416,111.674,43.729C110.604,43.466,109.360,43.028,108.270,43.076C106.995,43.133,105.848,43.744,104.186,44.381C100.282,45.878,97.825,49.421,95.763,53.783C94.655,56.128,94.182,57.179,93.293,58.739C92.347,60.399,91.251,62.002,90.343,63.216C87.606,66.878,82.751,69.999,77.635,71.791C71.461,73.954,64.956,74.401,61.977,74.401C58.360,74.401,51.116,74.471,44.277,71.791C40.817,70.435,38.150,68.528,34.746,65.265C33.065,63.653,31.018,60.660,29.300,57.434C27.470,53.999,25.960,50.316,23.853,48.297Z" fill="var(--color-linen)"/>
							<ellipse cx="61.611" cy="23.494" rx="23.487" ry="23.494" fill="var(--color-linen)"/>
						</g>
					</svg>
                 </div>
                <div class="bg-timberwolf-1/50 backdrop-blur-md border border-timberwolf-1/70 rounded-xl p-4 text-left shadow-xl flex-grow text-prussian-blue">
                    <div class="flex items-center justify-between mb-3">
                        <p class="font-ibm-plex-sans text-lg">
                            Okay, I found 3 tasks:
                        </p>
                        <div class="flex items-center gap-1 text-xs text-prussian-blue/70">
                             <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
                             <span>Data Pot</span>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <div class="bg-linen/80 backdrop-blur-sm border border-timberwolf-2/50 rounded-lg p-2.5 px-3 shadow-md hover:shadow-lg transition-shadow duration-200">
                            <p class="font-ibm-plex-sans text-base text-prussian-blue">Review Q1 report</p>
                        </div>
                        <div class="bg-linen/80 backdrop-blur-sm border border-timberwolf-2/50 rounded-lg p-2.5 px-3 shadow-md hover:shadow-lg transition-shadow duration-200">
                            <p class="font-ibm-plex-sans text-base text-prussian-blue">Send invoice</p>
                        </div>
                        <div class="bg-linen/80 backdrop-blur-sm border border-timberwolf-2/50 rounded-lg p-2.5 px-3 shadow-md hover:shadow-lg transition-shadow duration-200">
                            <p class="font-ibm-plex-sans text-base text-prussian-blue">Plan meeting</p>
                        </div>
                    </div>
                 </div>
            </div>
            {/if}

            {#if showUserFollowUpMessage}
            <div class="flex items-start justify-start gap-3 pt-4" 
                 in:fly={{ y: 20, duration: 500, easing: sineInOut }}>
                <div class="w-10 h-10 rounded-full bg-timberwolf-1 flex items-center justify-center flex-shrink-0 mt-1">
                    <svg class="w-6 h-6 text-buff" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path></svg>
                </div>
                <div class="bg-timberwolf-2/80 backdrop-blur-sm border border-timberwolf-2/90 rounded-xl p-4 text-left shadow-lg">
                    <p class="font-ibm-plex-sans text-lg text-prussian-blue">
                        Invoice already done.
                    </p>
                 </div>
            </div>
            {/if}

            {#if showHominioUpdatedResponse}
            <div class="flex items-start justify-start gap-3 pt-4" 
                 in:fly={{ y: 20, duration: 500, delay: 100, easing: sineInOut }}>
                <div class="w-10 h-10 rounded-full bg-prussian-blue flex items-center justify-center flex-shrink-0 mt-1 p-1.5">
                    <svg class="w-full h-full" viewBox="0 0 123 124" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <g>
                            <path d="M23.853,48.297C23.853,48.297,21.318,45.395,18.407,44.381C14.089,42.877,5.898,44.320,2.749,49.602C1.302,52.030,0.195,53.571,0.026,56.128C-0.406,62.663,4.536,69.915,14.323,71.791C21.662,73.198,29.855,77.434,35.427,83.538C40.191,88.757,42.688,95.857,42.688,103.678C42.688,111.102,45.834,115.587,49.042,118.779C53.168,122.883,57.467,124.000,61.296,124.000C68.104,124.000,80.812,118.036,80.812,103.678C80.812,89.321,88.981,80.184,97.151,76.269C99.236,75.269,109.058,71.843,112.355,70.486C122.672,66.240,126.580,56.987,119.163,48.297C116.717,45.431,114.476,44.416,111.674,43.729C110.604,43.466,109.360,43.028,108.270,43.076C106.995,43.133,105.848,43.744,104.186,44.381C100.282,45.878,97.825,49.421,95.763,53.783C94.655,56.128,94.182,57.179,93.293,58.739C92.347,60.399,91.251,62.002,90.343,63.216C87.606,66.878,82.751,69.999,77.635,71.791C71.461,73.954,64.956,74.401,61.977,74.401C58.360,74.401,51.116,74.471,44.277,71.791C40.817,70.435,38.150,68.528,34.746,65.265C33.065,63.653,31.018,60.660,29.300,57.434C27.470,53.999,25.960,50.316,23.853,48.297Z" fill="var(--color-linen)"/>
                            <ellipse cx="61.611" cy="23.494" rx="23.487" ry="23.494" fill="var(--color-linen)"/>
                        </g>
                    </svg>
                 </div>
                <div class="bg-timberwolf-1/50 backdrop-blur-md border border-timberwolf-1/70 rounded-xl p-4 text-left shadow-xl flex-grow text-prussian-blue">
                    <p class="font-ibm-plex-sans text-lg mb-3">
                        Got it! Here's the updated list:
                    </p>
                    <div class="grid sm:grid-cols-2 gap-3">
                        <!-- To Do Box -->
                        <div class="bg-timberwolf-2/70 p-3 rounded-lg shadow-md">
                            <h4 class="font-ibm-plex-sans font-semibold text-prussian-blue mb-2">To Do</h4>
                            <div class="space-y-2">
                                <div class="bg-linen/80 backdrop-blur-sm border border-timberwolf-2/50 rounded-lg p-2.5 px-3 shadow-sm">
                                    <p class="font-ibm-plex-sans text-base text-prussian-blue">Review Q1 report</p>
                                </div>
                                <div class="bg-linen/80 backdrop-blur-sm border border-timberwolf-2/50 rounded-lg p-2.5 px-3 shadow-sm">
                                    <p class="font-ibm-plex-sans text-base text-prussian-blue">Plan meeting</p>
                                </div>
                            </div>
                        </div>
                        <!-- Done Box -->
                        <div class="bg-moss-green/40 p-3 rounded-lg shadow-md">
                            <h4 class="font-ibm-plex-sans font-semibold text-prussian-blue mb-2">Done</h4>
                            <div class="space-y-2">
                                <div class="bg-linen/70 backdrop-blur-sm border border-timberwolf-2/50 rounded-lg p-2.5 px-3 shadow-sm">
                                    <p class="font-ibm-plex-sans text-base text-prussian-blue/70 line-through">Send invoice</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/if}
        </div>

        <p class="font-ibm-plex-sans text-2xl font-medium text-prussian-blue">
            A Vibe could be anything, so share your ideas!
        </p>
    </div>
</section>

<style>
	/* Removed animation styles */
</style> 