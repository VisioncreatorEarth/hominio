<script lang="ts">
	export let heroSection: HTMLElement | null = null;

	// SVG Path Constants for Task Icons (using basic quotes)
	const checkCirclePath = 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z';
	const phonePath = 'M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z';
	const calendarPath = 'M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z';
</script>

<!-- SECTION 1: Hero -->
<!-- Updated background color using Tailwind class -->
<section 
	class="relative overflow-hidden min-h-screen bg-linen flex flex-col justify-start items-center pt-16 px-4 md:px-8 text-center"
	bind:this={heroSection} 
	data-section="1" 
	id="heroSection"
>
	<!-- Centered Content Wrapper -->
	<div class="w-full max-w-4xl mx-auto"> 
		<!-- Main Headline - Applying Playfair Display font -->
		<h1 class="font-playfair-display text-5xl sm:text-6xl lg:text-7xl font-normal text-prussian-blue leading-tight mb-10">
			Launch your idea as a 
			<span class="relative">
				<!-- Updated Vibe text color -->
				<span class="text-persian-orange">Vibe</span>
				<!-- Updated New badge colors, using IBM Plex Sans -->
				<span class="absolute -top-2 -right-5 bg-buff text-prussian-blue text-xs font-bold px-2 py-0.5 rounded-full rotate-12 shadow-md font-ibm-plex-sans">
					New
				</span>
			</span> 
			and monetize your creativity
		</h1>
		<!-- Subheadline - Applying IBM Plex Sans font -->
		<p 
			class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/80 mt-5 max-w-3xl mx-auto"
		>
			Simply share your use-case and our team will craft it into an interactive mini-app. Deploy instantly on our marketplace and monetize your idea as a Vibe creator.
		</p>

		<!-- App Grid Mockup - Wider, new greeting position, card redesign -->
		<div class="mt-12 md:mt-16 max-w-4xl mx-auto bg-timberwolf-1/30 backdrop-blur-md border border-timberwolf-1/50 rounded-lg shadow-lg text-prussian-blue overflow-hidden">
			<!-- Chrome-like Top Bar - Updated "My Vibes" text color -->
			<div class="bg-timberwolf-2/70 px-4 py-2 flex items-center">
				<span class="w-3 h-3 bg-rosy-brown rounded-full mr-2"></span>
				<span class="w-3 h-3 bg-buff rounded-full mr-2"></span>
				<span class="w-3 h-3 bg-moss-green rounded-full"></span>
				<span class="ml-auto text-xs font-medium text-persian-orange font-ibm-plex-sans">My Vibes</span>
			</div>
			<!-- Greeting Text - Updated content -->
			<div class="p-5 pb-4 text-center">
				<h3 class="font-ibm-plex-sans text-2xl font-semibold text-prussian-blue mb-1">Welcome to Hominio</h3>
				<p class="font-ibm-plex-sans text-lg text-prussian-blue/80">Select a vibe to get started</p>
			</div>
			<!-- Grid Content -->
			<div class="px-5 pb-5">
				<div class="grid grid-cols-2 gap-4 mb-4">
					<!-- Card: Todos - Visuals restored and improved, new icon, added filter pills -->
					<div class="p-4 rounded-xl bg-timberwolf-2/50 shadow-xl hover:shadow-2xl transition-shadow duration-300 flex flex-col min-h-[180px]">
						<div class="flex items-center mb-2 w-full">
							<div class="w-7 h-7 rounded-lg bg-moss-green flex items-center justify-center mr-2.5 flex-shrink-0">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-linen">
									<path d={checkCirclePath}></path>
								</svg>
							</div>
							<h4 class="font-ibm-plex-sans font-semibold text-lg text-prussian-blue text-left">Today's Tasks</h4>
						</div>

						<!-- Task Rows -->
						<div class="flex flex-col space-y-2 flex-grow mb-3 px-1">
							<!-- Task 1 Row -->
							<div class="flex items-center bg-timberwolf-1/40 border border-timberwolf-1/50 px-3 py-1.5 rounded-full text-left shadow-sm">
								<div class="w-5 h-5 rounded-md mr-2 flex items-center justify-center flex-shrink-0 bg-moss-green">
									<svg class="w-3 h-3 text-linen" fill="currentColor" viewBox="0 0 20 20">
										<path d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'></path>
									</svg>
								</div>
								<p class="font-ibm-plex-sans text-sm text-prussian-blue">Finalize Q1 Report</p>
							</div>
							<!-- Task 2 Row -->
							<div class="flex items-center bg-timberwolf-1/40 border border-timberwolf-1/50 px-3 py-1.5 rounded-full text-left shadow-sm">
								<div class="w-5 h-5 rounded-md mr-2 flex items-center justify-center flex-shrink-0 bg-moss-green">
									<svg class="w-3 h-3 text-linen" fill="currentColor" viewBox="0 0 20 20">
										<path d='M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z'></path>
									</svg>
								</div>
								<p class="font-ibm-plex-sans text-sm text-prussian-blue">Call with Client X</p>
							</div>
							<!-- Task 3 Row -->
							<div class="flex items-center bg-timberwolf-1/40 border border-timberwolf-1/50 px-3 py-1.5 rounded-full text-left shadow-sm">
								<div class="w-5 h-5 rounded-md mr-2 flex items-center justify-center flex-shrink-0 bg-persian-orange">
									<svg class="w-3 h-3 text-linen" fill="currentColor" viewBox="0 0 20 20">
										<path d='M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z'></path>
									</svg>
								</div>
								<p class="font-ibm-plex-sans text-sm text-prussian-blue">Plan Next Sprint</p>
							</div>
						</div>

						<!-- Filter Pills (Moved to bottom) -->
						<div class="mt-auto pt-2 border-t border-timberwolf-1/50 flex flex-wrap justify-center gap-1">
							<span class="bg-prussian-blue text-linen text-xs font-medium px-2 py-0.5 rounded-full">Work</span>
							<span class="bg-timberwolf-1/50 text-prussian-blue/80 text-xs font-medium px-2 py-0.5 rounded-full">Personal</span>
							<span class="bg-timberwolf-1/50 text-prussian-blue/80 text-xs font-medium px-2 py-0.5 rounded-full">Urgent</span>
						</div>
					</div>

					<!-- Card: Chess Vibe - Restored content, new icon -->
					<div class="p-4 rounded-xl bg-timberwolf-2/50 shadow-xl hover:shadow-2xl transition-shadow duration-300 flex flex-col min-h-[160px]">
						<div class="flex items-center mb-2 w-full">
							<div class="w-7 h-7 rounded-lg bg-persian-orange flex items-center justify-center mr-2.5 flex-shrink-0">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-linen">
									<path fill-rule="evenodd" d="M15.75 1.5a3 3 0 0 0-3 3V12a3 3 0 0 0 3 3h.75a3 3 0 0 0 3-3V4.5a3 3 0 0 0-3-3h-.75ZM9.75 8.25a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h.75a3 3 0 0 0 3-3V11.25a3 3 0 0 0-3-3h-.75ZM3.75 12a3 3 0 0 0-3 3v3.75a3 3 0 0 0 3 3H4.5a3 3 0 0 0 3-3v-3.75a3 3 0 0 0-3-3H3.75Z" clip-rule="evenodd" />
								</svg>
							</div>
							<h4 class="font-ibm-plex-sans font-semibold text-lg text-prussian-blue ml-1 text-left">Chess Vibe</h4>
						</div>
						<!-- Content: Chessboard left, text right -->
						<div class="flex-grow flex flex-row items-center justify-start space-x-4">
							<!-- Mini Chessboard (flex-shrink-0 to prevent shrinking) -->
							<div class="grid grid-cols-8 gap-0.5 w-[72px] h-[72px] p-0.5 bg-timberwolf-1/50 rounded shadow-inner flex-shrink-0">
								{#each Array(8) as _, r}
									{#each Array(8) as _, c}
										<div class={`w-full h-full flex items-center justify-center text-[10px] ${(r + c) % 2 === 0 ? 'bg-linen/60' : 'bg-buff/60'}`}>
											{#if r === 1 || r === 6}
												<span class={r === 1 ? 'text-prussian-blue' : 'text-prussian-blue/70'}>♟</span>
											{/if}
											{#if (r === 0 || r === 7) && (c === 0 || c === 7 || c === 2 || c === 5)}
												<span class={r === 0 ? 'text-prussian-blue' : 'text-prussian-blue/70'}>♜</span>
											{/if}
											{#if (r === 0 || r === 7) && (c === 1 || c === 6)}
												<span class={r === 0 ? 'text-prussian-blue' : 'text-prussian-blue/70'}>♞</span>
											{/if}
											{#if (r === 0 || r === 7) && (c === 3)}
												<span class={r === 0 ? 'text-prussian-blue' : 'text-prussian-blue/70'}>♛</span>
											{/if}
											{#if (r === 0 || r === 7) && (c === 4)}
												<span class={r === 0 ? 'text-prussian-blue' : 'text-prussian-blue/70'}>♚</span>
											{/if}
										</div>
									{/each}
								{/each}
							</div>
							<!-- Description Text -->
							<div class="text-left"> 
								<p class="font-ibm-plex-sans text-xs text-prussian-blue/90 leading-tight">
									Play chess via voice,<br>Current status: Your turn
								</p>
							</div>
						</div>
						<p class="font-ibm-plex-sans text-xs text-prussian-blue/70 mt-auto text-center pt-1">Agents: Magnus</p>
					</div>

					<!-- Card: Notes Vibe (Previously Journal) - Restored content, new icon, new title -->
					<div class="p-4 rounded-xl bg-timberwolf-2/50 shadow-xl hover:shadow-2xl transition-shadow duration-300 flex flex-col min-h-[200px]">
						<div class="flex items-center mb-2 w-full">
							<div class="w-7 h-7 rounded-lg bg-persian-orange flex items-center justify-center mr-2.5 flex-shrink-0">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-linen">
									<path fill-rule="evenodd" d="M5.625 1.5A3.375 3.375 0 0 0 2.25 4.875v14.25A3.375 3.375 0 0 0 5.625 22.5h12.75A3.375 3.375 0 0 0 21.75 19.125V4.875A3.375 3.375 0 0 0 18.375 1.5H5.625ZM8.25 9a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Zm0 3a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" clip-rule="evenodd" />
								</svg>
							</div>
							<h4 class="font-ibm-plex-sans font-semibold text-lg text-prussian-blue text-left">Journal Vibe</h4>
						</div>

						<!-- New Calendar Style -->
						<div class="mb-3 text-center font-ibm-plex-sans">
							<p class="text-sm font-semibold text-prussian-blue mb-1.5">April 2024</p>
							<div class="grid grid-cols-7 gap-1 text-xs text-prussian-blue/70 mb-1">
								<span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
							</div>
							<div class="grid grid-cols-7 gap-1 text-xs text-prussian-blue">
								{#each Array(7) as _, i}
									{@const day = i + 1} 
									<span class={`flex items-center justify-center h-5 
										${day === 3 ? 'bg-buff/70 rounded-full font-semibold text-prussian-blue' : ''}
									`}>{day}</span>
								{/each}
							</div>
						</div>

						<!-- Styled Text Entry Box -->
						<div class="bg-timberwolf-1/40 p-3 rounded-lg flex-grow text-left">
							<p class="font-ibm-plex-sans text-sm text-prussian-blue/90">
								Went for a long walk in the park today. The weather was beautiful, and it...
							</p>
						</div>
						
						<p class="font-ibm-plex-sans text-xs text-prussian-blue/70 mt-auto pt-2 text-center">Agents: Tanja</p>
					</div>

					<!-- Card: NEW Notes Vibe -->
					<div class="p-4 rounded-xl bg-timberwolf-2/50 shadow-xl hover:shadow-2xl transition-shadow duration-300 flex flex-col min-h-[180px]">
						<div class="flex items-center mb-2 w-full">
							<div class="w-7 h-7 rounded-lg bg-buff flex items-center justify-center mr-2.5 flex-shrink-0">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-linen">
									<path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" />
									<path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z" />
								</svg>
							</div>
							<h4 class="font-ibm-plex-sans font-semibold text-lg text-prussian-blue text-left">Notes Vibe</h4>
						</div>

						<!-- Tags -->
						<div class="flex flex-wrap justify-start gap-1 mb-3 pl-1"> 
							<span class="bg-prussian-blue text-linen text-xs font-medium px-2 py-0.5 rounded-full">Meeting</span>
							<span class="bg-timberwolf-1/50 text-prussian-blue/80 text-xs font-medium px-2 py-0.5 rounded-full">Ideas</span>
							<span class="bg-timberwolf-1/50 text-prussian-blue/80 text-xs font-medium px-2 py-0.5 rounded-full">Quick Note</span>
						</div>

						<!-- Note Snippet Box -->
						<div class="bg-timberwolf-1/40 p-3 rounded-lg flex-grow text-left">
							<p class="font-ibm-plex-sans font-semibold text-sm text-prussian-blue mb-1">Q3 Planning Ideas</p>
							<p class="font-ibm-plex-sans text-xs text-prussian-blue/90">
								Brainstorm features for next release, market positioning, timeline adjustments...
							</p>
						</div>
						
						<p class="font-ibm-plex-sans text-xs text-prussian-blue/70 mt-auto pt-2 text-center">Agents: Scribe</p>
					</div>

					<!-- Card: Explore Marketplace - Updated icon to Shopping Bag, wrapped with link -->
					<a href="#marketplaceSection" class="block p-4 rounded-xl bg-persian-orange/60 shadow-xl hover:shadow-2xl transition-shadow duration-300 flex flex-col items-center justify-center min-h-[160px] hover:bg-persian-orange/50 no-underline">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-10 h-10 mb-2 text-prussian-blue">
							<path fill-rule="evenodd" d="M7.5 6v.75H5.513c-.96 0-1.764.724-1.865 1.679l-1.263 12A1.875 1.875 0 0 0 4.25 22.5h15.5a1.875 1.875 0 0 0 1.865-2.071l-1.263-12A1.875 1.875 0 0 0 18.487 6.75H16.5V6a4.5 4.5 0 1 0-9 0ZM12 3a3 3 0 0 0-3 3v.75h6V6a3 3 0 0 0-3-3Zm-3 8.25a3 3 0 1 0 6 0v-.75a.75.75 0 0 1 1.5 0v.75a4.5 4.5 0 1 1-9 0v-.75a.75.75 0 0 1 1.5 0v.75Z" clip-rule="evenodd" />
						</svg>
						<h4 class="font-ibm-plex-sans font-semibold text-lg text-center text-prussian-blue">Explore Marketplace</h4>
						<p class="font-ibm-plex-sans text-sm text-center mt-1 text-prussian-blue/80">Discover Vibes</p>
					</a>

					<!-- Card: Build Your Own Vibe - Wrapped with link -->
					<a href="#buildMonetizeSection" class="block p-4 rounded-xl bg-buff/60 shadow-xl hover:shadow-2xl transition-shadow duration-300 flex flex-col items-center justify-center min-h-[160px] hover:bg-buff/50 no-underline">
						<svg class="w-10 h-10 mb-2 text-prussian-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
						<h4 class="font-ibm-plex-sans font-semibold text-lg text-center text-prussian-blue">Build your own Vibe</h4>
						<p class="font-ibm-plex-sans text-sm text-center mt-1 text-prussian-blue/80">Become a Vibe Creator</p>
					</a>

					<!-- Card: Say Prompt -->
					<div class="p-4 rounded-xl bg-timberwolf-2/50 shadow-xl hover:shadow-2xl transition-shadow duration-300 flex items-center justify-center col-span-2 min-h-[80px]">
						<p class="font-ibm-plex-sans text-base text-prussian-blue/90 text-center">Say <strong class="text-prussian-blue">"Show me my todos"</strong> or <strong class="text-prussian-blue">"Make a new note"</strong></p>
					</div>
				</div>

				<!-- Hominio Button -->
				<div class="flex justify-center mt-5">
					<button class="relative w-14 h-14 rounded-full bg-prussian-blue flex items-center justify-center shadow-lg hover:scale-105 transition-transform p-2 overflow-hidden">
						<div class="wave wave-1"></div>
						<div class="wave wave-2"></div>
						<svg class="w-full h-full z-10" viewBox="0 0 123 124" fill="none" xmlns="http://www.w3.org/2000/svg">
							<g>
								<path d="M23.853,48.297C23.853,48.297,21.318,45.395,18.407,44.381C14.089,42.877,5.898,44.320,2.749,49.602C1.302,52.030,0.195,53.571,0.026,56.128C-0.406,62.663,4.536,69.915,14.323,71.791C21.662,73.198,29.855,77.434,35.427,83.538C40.191,88.757,42.688,95.857,42.688,103.678C42.688,111.102,45.834,115.587,49.042,118.779C53.168,122.883,57.467,124.000,61.296,124.000C68.104,124.000,80.812,118.036,80.812,103.678C80.812,89.321,88.981,80.184,97.151,76.269C99.236,75.269,109.058,71.843,112.355,70.486C122.672,66.240,126.580,56.987,119.163,48.297C116.717,45.431,114.476,44.416,111.674,43.729C110.604,43.466,109.360,43.028,108.270,43.076C106.995,43.133,105.848,43.744,104.186,44.381C100.282,45.878,97.825,49.421,95.763,53.783C94.655,56.128,94.182,57.179,93.293,58.739C92.347,60.399,91.251,62.002,90.343,63.216C87.606,66.878,82.751,69.999,77.635,71.791C71.461,73.954,64.956,74.401,61.977,74.401C58.360,74.401,51.116,74.471,44.277,71.791C40.817,70.435,38.150,68.528,34.746,65.265C33.065,63.653,31.018,60.660,29.300,57.434C27.470,53.999,25.960,50.316,23.853,48.297Z" fill="var(--color-linen)"/>
								<ellipse cx="61.611" cy="23.494" rx="23.487" ry="23.494" fill="var(--color-linen)"/>
							</g>
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Removed Action Buttons -->
		<!-- Removed Right Column Graphic -->
	</div>
</section>

<style>
	section {
		min-height: 100vh; /* Ensure it takes full viewport height */
	}

	/* Assuming 'font-serif' will be configured in Tailwind or defined globally */
	/* Add specific font-family if needed, e.g., using @import */
	
	/* Removed animation styles */

	/* Define CSS variables for Tailwind colors if needed inside <style> */
	:root {
		/* Updated variable name for clarity and correctness */
		--color-linen: #FFF6EC; 
	}

	@keyframes soundWaves {
		0% {
			transform: translate(-50%, -50%) scale(1);
			opacity: 0.5; /* Slightly less opaque at start */
		}
		100% {
			transform: translate(-50%, -50%) scale(1.7); /* Expand further */
			opacity: 0;
		}
	}

	.wave {
		position: absolute;
		top: 50%; 
		left: 50%;
		width: 100%; /* Start at button's full width */
		height: 100%; /* Start at button's full height */
		transform: translate(-50%, -50%); /* Center the wave */
		border-radius: 50%;
		border: 2px solid var(--color-linen); /* Wave color */
		animation: soundWaves 2s infinite ease-out;
		opacity: 0; /* Start transparent, animation will make it visible */
	}

	.wave-1 {
		/* Default animation timing */
	}

	.wave-2 {
		animation-delay: 1s; /* Stagger the second wave */
	}
</style> 