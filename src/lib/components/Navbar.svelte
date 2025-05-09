<script lang="ts">
	import { page } from '$app/stores';

	let navMenuOpen = $state(false);

	function toggleMenu() {
		navMenuOpen = !navMenuOpen;
	}
</script>

{#if !$page.url.pathname.startsWith('/me')}
	<nav class="bg-linen sticky top-0 z-40 flex w-full justify-center shadow-md">
		<div class="flex w-full max-w-screen-xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
			<a href="/" class="text-prussian-blue flex items-center gap-2 transition-opacity hover:opacity-80">
				<div class="h-10 w-10 md:h-12 md:w-12">
					<!-- SVG Logo -->
					<svg class="h-full w-full" viewBox="0 0 123 124" fill="none" xmlns="http://www.w3.org/2000/svg">
						<g>
							<path
								d="M23.853,48.297C23.853,48.297,21.318,45.395,18.407,44.381C14.089,42.877,5.898,44.320,2.749,49.602C1.302,52.030,0.195,53.571,0.026,56.128C-0.406,62.663,4.536,69.915,14.323,71.791C21.662,73.198,29.855,77.434,35.427,83.538C40.191,88.757,42.688,95.857,42.688,103.678C42.688,111.102,45.834,115.587,49.042,118.779C53.168,122.883,57.467,124.000,61.296,124.000C68.104,124.000,80.812,118.036,80.812,103.678C80.812,89.321,88.981,80.184,97.151,76.269C99.236,75.269,109.058,71.843,112.355,70.486C122.672,66.240,126.580,56.987,119.163,48.297C116.717,45.431,114.476,44.416,111.674,43.729C110.604,43.466,109.360,43.028,108.270,43.076C106.995,43.133,105.848,43.744,104.186,44.381C100.282,45.878,97.825,49.421,95.763,53.783C94.655,56.128,94.182,57.179,93.293,58.739C92.347,60.399,91.251,62.002,90.343,63.216C87.606,66.878,82.751,69.999,77.635,71.791C71.461,73.954,64.956,74.401,61.977,74.401C58.360,74.401,51.116,74.471,44.277,71.791C40.817,70.435,38.150,68.528,34.746,65.265C33.065,63.653,31.018,60.660,29.300,57.434C27.470,53.999,25.960,50.316,23.853,48.297Z"
								class="fill-prussian-blue"
							/>
							<ellipse cx="61.611" cy="23.494" rx="23.487" ry="23.494" class="fill-prussian-blue" />
						</g>
					</svg>
				</div>
				<span class="font-playfair-display text-2xl font-bold md:text-3xl">Hominio</span>
			</a>

			<!-- Mobile Menu Toggle -->
			<button class="z-20 flex h-5 w-6 cursor-pointer flex-col justify-around border-none bg-transparent p-0 md:hidden" on:click={toggleMenu} aria-label="Toggle menu" aria-expanded={navMenuOpen}>
				<span class="bg-prussian-blue block h-0.5 w-full rounded-sm transition-transform duration-300 ease-in-out {navMenuOpen ? 'translate-y-[5px] rotate-45 transform' : ''}"></span>
				<span class="bg-prussian-blue block h-0.5 w-full rounded-sm transition-opacity duration-300 ease-in-out {navMenuOpen ? 'opacity-0' : ''}"></span>
				<span class="bg-prussian-blue block h-0.5 w-full rounded-sm transition-transform duration-300 ease-in-out {navMenuOpen ? '-translate-y-[5px] -rotate-45 transform' : ''}"></span>
			</button>

			<!-- Navigation Links - Desktop -->
			<div class="hidden items-center space-x-6 md:flex">
				<a href="/roadmap" class="text-prussian-blue hover:text-persian-orange transition-colors">Roadmap</a>
			</div>

			<!-- Mobile Navigation Menu (Overlay) -->
			{#if navMenuOpen}
				<div class="bg-linen/95 fixed inset-0 z-10 flex flex-col items-center justify-center space-y-6 backdrop-blur-sm md:hidden" on:click={() => (navMenuOpen = false)}>
					<a href="/" class="text-prussian-blue hover:text-persian-orange text-2xl" on:click={(e) => { e.stopPropagation(); navMenuOpen = false; }}>Home</a>
					<a href="/roadmap" class="text-prussian-blue hover:text-persian-orange text-2xl" on:click={(e) => { e.stopPropagation(); navMenuOpen = false; }}>Roadmap</a>
				</div>
			{/if}
		</div>
	</nav>
{/if} 