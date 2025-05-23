<script lang="ts">
	export let sectionRef: HTMLElement | null = null;
	// Removed: import { DeviceMockup } from 'flowbite-svelte';
</script>

<section bind:this={sectionRef} class="bg-linen text-prussian-blue py-16 md:py-24">
	<div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
		<h2 class="font-playfair-display mb-12 text-center text-5xl font-normal md:mb-16 md:text-6xl lg:text-7xl">
			Craft Your Unique Vibes
		</h2>
		<div class="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16 lg:gap-24">
			<!-- Text Content -->
			<div class="text-center md:text-left">
				<h3 class="font-ibm-plex-sans text-2xl font-medium text-prussian-blue md:text-3xl lg:text-4xl">
					Your voice is unlike any other.
				</h3>
				<h4 class="font-ibm-plex-sans mt-2 text-xl text-prussian-blue/80 md:text-2xl lg:text-3xl">
					Now, it's your ultimate coding tool.
				</h4>
				<p
					class="font-ibm-plex-sans mt-4 text-base text-prussian-blue/70 md:mt-6 md:text-lg lg:text-xl"
				>
					Our native <span class="font-semibold text-persian-orange">VIBE CREATOR</span> for Mac empowers you to craft deeply personal and unique digital experiences—all powered by your sound.
				</p>
			</div>

			<!-- Laptop Mockup Side -->
			<div
				class="relative mx-auto flex w-full max-w-md flex-col items-center justify-center md:max-w-none"
			>
				<!-- Laptop Mockup with Tailwind -->
				<div class="relative z-0 h-[260px] w-full rounded-t-lg bg-neutral-700 p-2.5 shadow-2xl sm:h-[280px] md:h-[300px] md:p-3 lg:h-[340px]">
					<!-- Screen Bezel -->
					<div class="h-full w-full rounded bg-neutral-900 p-2 md:p-2">
						<!-- Screen Content Area -->
						<div
							class="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-sm bg-prussian-blue text-center"
						>
							<!-- Mac-like window bar -->
							<div
								class="mb-2 flex h-5 w-full flex-shrink-0 items-center rounded-t-sm bg-neutral-700/60 px-2 md:h-5"
							>
								<span class="mr-1 h-2 w-2 rounded-full bg-red-500 md:mr-1.5 md:h-2.5 md:w-2.5"></span>
								<span class="mr-1 h-2 w-2 rounded-full bg-yellow-400 md:mr-1.5 md:h-2.5 md:w-2.5"></span>
								<span class="h-2 w-2 rounded-full bg-green-500 md:h-2.5 md:w-2.5"></span>
							</div>

							<!-- Main Screen Content (Microphone) -->
							<div class="flex flex-grow items-center justify-center">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="currentColor"
									class="h-16 w-16 text-linen/50 md:h-20 md:w-20 lg:h-24 lg:w-24"
								>
									<path
										d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15a.994.994 0 0 0-.98-.85c-.61 0-1.09.54-1 1.14.49 3.02 2.86 5.38 5.91 5.78V21h-2v2h6v-2h-2v-2.08c3.05-.4 5.42-2.76 5.91-5.78.1-.6-.39-1.14-1-1.14z"
									/>
								</svg>
							</div>
						</div>
					</div>
				</div>
				<!-- Laptop Base -->
				<div class="relative h-[18px] w-[105%] rounded-b-lg bg-neutral-600 shadow-xl md:h-[20px]">
					<!-- Notch/Touchpad area (optional visual cue) -->
					<div
						class="absolute bottom-0.5 left-1/2 h-0.5 w-14 -translate-x-1/2 transform rounded-sm bg-neutral-500/50 md:w-16 lg:w-20"
					></div>
				</div>

				<!-- "Soon" Button -->
				<div
					class="absolute right-[-20px] top-[40%] -translate-y-1/2 transform md:right-[-30px] lg:right-[-40px]"
				>
					<button
						class="font-ibm-plex-sans rounded-lg bg-rosy-brown px-3 py-1.5 text-xs font-semibold text-linen shadow-md transition-transform hover:scale-105 md:px-4 md:py-2 md:text-sm lg:px-5 lg:py-2.5"
					>
						Soon
					</button>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- No Svelte-specific <style> block needed if all styles are inline Tailwind --> 