<script lang="ts">
	// Removed onMount, onDestroy, IntersectionObserver logic
	export let dataPotSection: HTMLElement | null = null;

</script>

<section
    class="relative pt-8 pb-16 md:pb-24 bg-linen text-prussian-blue overflow-hidden" 
    bind:this={dataPotSection}
    data-section="2" 
    id="dataPotSection"
>
	<!-- Scrolling Marquee - Updated background color -->
	<div class="w-full bg-timberwolf-1 py-3 overflow-hidden mb-12 md:mb-16 whitespace-nowrap">
		<div class="inline-block animate-marquee">
			{#each Array(10) as _} <!-- Repeat text for seamless scroll -->
				<span class="font-playfair-display text-2xl text-prussian-blue mx-8">Change how you interact with your own data</span>
			{/each}
		</div>
		<div class="inline-block animate-marquee">
			{#each Array(10) as _} <!-- Repeat text for seamless scroll -->
				<span class="font-playfair-display text-2xl text-prussian-blue mx-8">Change how you interact with your own data</span>
			{/each}
		</div>
	</div>

	<!-- Main Content Area: 2 Columns -->
	<div class="w-full max-w-6xl mx-auto px-4 md:px-8 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
		
		<!-- Left Column: Title/Subtitle - Updated fonts and colors -->
		<div class="text-center md:text-left">
			<h2 class="font-playfair-display text-5xl md:text-6xl font-normal mb-4">
				The Hominio Data Pot
				</h2>
			<p class="font-ibm-plex-sans text-xl md:text-2xl text-prussian-blue/90">
				At the heart of Hominio is the <strong class="font-semibold text-prussian-blue">Data Pot</strong>—a centralized, secure repository where your data lives. Every Vibe taps into your Data Pot to retrieve, analyze, and visualize instantly.
			</p>
		</div>

		<!-- Right Column: Features Stacked - Updated fonts and colors -->
		<div class="space-y-12">
			
			<!-- Feature 1: Personal Data Pot - Removed background, updated icon color -->
			<div class="flex flex-col items-center text-center p-6 rounded-lg">
				<!-- Icon - Updated color -->
				<svg class="w-14 h-14 mb-4 text-buff" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>
				<!-- Text Content -->
				<h3 class="font-ibm-plex-sans text-2xl font-semibold mb-2 text-prussian-blue">Your Personal Data Pot</h3>
				<p class="font-ibm-plex-sans text-lg text-prussian-blue/90">
					Upload or sync your data once, and all your Vibes access it seamlessly.
				</p>
			</div>

			<!-- Feature 2: Smart AI - Removed background, updated icon color -->
			<div class="flex flex-col items-center text-center p-6 rounded-lg">
				<!-- Icon - Updated color -->
				<svg class="w-14 h-14 mb-4 text-persian-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
				<!-- Text Content -->
				<h3 class="font-ibm-plex-sans text-2xl font-semibold mb-2 text-prussian-blue">Smart AI</h3>
				<p class="font-ibm-plex-sans text-lg text-prussian-blue/90">
					Our AI organizes and understands your Data Pot for instant insights.
				</p>
			</div>

			<!-- Feature 3: Secure & Future-Ready - Removed background, updated icon color -->
			<div class="flex flex-col items-center text-center p-6 rounded-lg">
				<!-- Icon - Updated color -->
				<svg class="w-14 h-14 mb-4 text-moss-green" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
				<!-- Text Content -->
				<h3 class="font-ibm-plex-sans text-2xl font-semibold mb-2 text-prussian-blue">Secure & Future-Ready</h3>
				<p class="font-ibm-plex-sans text-lg text-prussian-blue/90">
					Safely stored today, with decentralized hosting on the roadmap.
				</p>
			</div>
			
		</div>
	</div>
</section>

<style>
	@keyframes marquee {
		0% { transform: translateX(0%); }
		100% { transform: translateX(-100%); }
	}
	.animate-marquee {
		animation: marquee 60s linear infinite; /* Adjust duration for speed */
	}

	/* Removed feature-item animation styles */
</style> 