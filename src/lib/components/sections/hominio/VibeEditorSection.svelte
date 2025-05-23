<script lang="ts">
	export let sectionRef: HTMLElement | null = null;
	// Removed: import { DeviceMockup } from 'flowbite-svelte';
</script>

<section bind:this={sectionRef} class="bg-linen text-prussian-blue py-16 md:py-24">
	<div class="mx-auto w-full max-w-5xl px-4 text-center sm:px-6 lg:px-8">
		<h2 class="font-playfair-display mb-12 text-5xl font-normal md:text-6xl lg:text-7xl">
			Craft Your Unique Vibes
		</h2>
		<div
			class="relative mx-auto flex w-full max-w-2xl flex-col items-center justify-center md:max-w-3xl"
		>
			<!-- Laptop Mockup with Tailwind -->
			<div class="relative z-0 h-[280px] w-[90%] rounded-t-lg bg-neutral-700 p-3 shadow-2xl md:h-[380px] md:w-[85%] md:p-4 lg:h-[420px]">
				<!-- Screen Bezel -->
				<div class="h-full w-full rounded bg-neutral-900 p-2 md:p-2.5">
					<!-- Screen Content Area (VIBE CREATOR App) -->
					<div
						class="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-sm bg-prussian-blue text-center"
					>
						<!-- Mac-like window bar -->
						<div
							class="mb-2 flex h-5 w-full flex-shrink-0 items-center rounded-t-sm bg-neutral-700/60 px-2 md:mb-3 md:h-6"
						>
							<span class="mr-1 h-2 w-2 rounded-full bg-red-500 md:mr-1.5 md:h-2.5 md:w-2.5"></span>
							<span class="mr-1 h-2 w-2 rounded-full bg-yellow-400 md:mr-1.5 md:h-2.5 md:w-2.5"></span>
							<span class="h-2 w-2 rounded-full bg-green-500 md:h-2.5 md:w-2.5"></span>
						</div>

						<!-- Main content -->
						<div class="flex flex-grow flex-col items-center justify-center overflow-hidden px-2 pb-2 md:px-3 md:pb-3">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="currentColor"
								class="mb-2 h-8 w-8 text-linen/70 md:mb-2 md:h-10 md:w-10 lg:h-12 lg:w-12"
							>
								<path
									d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15a.994.994 0 0 0-.98-.85c-.61 0-1.09.54-1 1.14.49 3.02 2.86 5.38 5.91 5.78V21h-2v2h6v-2h-2v-2.08c3.05-.4 5.42-2.76 5.91-5.78.1-.6-.39-1.14-1-1.14z"
								/>
							</svg>
							<p
								class="font-ibm-plex-sans max-w-xs text-xs text-linen/90 md:max-w-sm md:text-sm lg:text-base"
							>
								Create a Vibe with just your voice on our
								<span class="font-semibold text-persian-orange">VIBE CREATOR</span>
								mac app.
							</p>
							<!-- Optional: some abstract UI elements -->
							<div class="mt-2 flex space-x-2 opacity-50 md:mt-3 md:space-x-3">
								<div class="h-4 w-12 rounded bg-timberwolf-2/20 md:h-5 md:w-16"></div>
								<div class="h-4 w-20 rounded bg-timberwolf-2/20 md:h-5 md:w-24"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
			<!-- Laptop Base -->
			<div class="relative h-[20px] w-full rounded-b-lg bg-neutral-600 shadow-xl md:h-[25px]">
				<!-- Notch/Touchpad area (optional visual cue) -->
				<div
					class="absolute bottom-1 left-1/2 h-1 w-16 -translate-x-1/2 transform rounded-sm bg-neutral-500/50 md:w-20 lg:w-24"
				></div>
			</div>

			<!-- "Soon" Button -->
			<div
				class="absolute right-[-15px] top-1/2 -translate-y-1/2 transform md:right-[-25px] lg:right-[-35px]"
			>
				<button
					class="font-ibm-plex-sans rounded-lg bg-rosy-brown px-3 py-1.5 text-xs font-semibold text-linen shadow-md transition-transform hover:scale-105 md:px-4 md:py-2 md:text-sm lg:px-5 lg:py-2.5 lg:text-base"
				>
					Soon
				</button>
			</div>
		</div>
	</div>
</section>

<!-- No Svelte-specific <style> block needed if all styles are inline Tailwind --> 