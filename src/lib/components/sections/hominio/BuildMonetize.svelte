<script lang="ts">
	// Component logic will go here
	export let sectionRef: HTMLElement | null = null;
</script>

<!-- Updated section background and text color -->
<section bind:this={sectionRef} data-section="6" id="buildMonetizeSection" class="py-16 md:py-24 bg-linen text-prussian-blue">
	<div class="w-full max-w-4xl mx-auto px-4 md:px-8">
		<!-- Updated text fonts and colors -->
		<div class="text-center mb-12 md:mb-16">
			<h2 class="font-playfair-display text-4xl md:text-5xl font-normal mb-6">Co-Build & Profit Together</h2>
		</div>

		<!-- Placeholder for the new three-card layout -->
		<div class="flex flex-col md:flex-row justify-between items-stretch gap-8 mb-12 md:mb-16">
			<!-- Card 1: Share Your Idea -->
			<div class="flex-1 bg-buff p-8 rounded-xl shadow-lg flex flex-col text-center min-h-[420px]">
				<!-- Icon placeholder -->
				<div class="mx-auto mb-4">
					<!-- SVG Lightbulb Icon -->
					<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="currentColor" class="w-16 h-16 text-prussian-blue">
                        <path fill="currentColor" d="M288 464h-64a16 16 0 0 0 0 32h64a16 16 0 0 0 0-32m16-48h-96a16 16 0 0 0 0 32h96a16 16 0 0 0 0-32m65.42-353.31C339.35 32.58 299.07 16 256 16A159.62 159.62 0 0 0 96 176c0 46.62 17.87 90.23 49 119.64l4.36 4.09C167.37 316.57 192 339.64 192 360v24a16 16 0 0 0 16 16h24a8 8 0 0 0 8-8V274.82a8 8 0 0 0-5.13-7.47A130.7 130.7 0 0 1 208.71 253a16 16 0 1 1 18.58-26c7.4 5.24 21.65 13 28.71 13s21.31-7.78 28.73-13a16 16 0 0 1 18.56 26a130.7 130.7 0 0 1-26.16 14.32a8 8 0 0 0-5.13 7.47V392a8 8 0 0 0 8 8h24a16 16 0 0 0 16-16v-24c0-19.88 24.36-42.93 42.15-59.77l4.91-4.66C399.08 265 416 223.61 416 176a159.16 159.16 0 0 0-46.58-113.31"/>
                    </svg>
				</div>
				<h3 class="font-playfair-display text-2xl font-semibold text-prussian-blue mb-3">Share Your Idea</h3>
				<p class="font-ibm-plex-sans text-prussian-blue/90 mb-6 text-sm">
					Tell us the problem you need solved or the task you want to automate.
				</p>
				<hr class="border-prussian-blue/50 my-4">
				<p class="font-ibm-plex-sans font-medium text-prussian-blue">Share Your Idea</p>
			</div>

			<!-- Card 2: Co-Create -->
			<div class="flex-1 bg-persian-orange p-8 rounded-xl shadow-lg flex flex-col text-center min-h-[420px]">
				<!-- Icon placeholder -->
				<div class="mx-auto mb-4">
					<!-- SVG Handshake Icon -->
					<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="currentColor" class="w-16 h-16 text-prussian-blue">
                        <path fill="currentColor" d="M49.725 16.293c-.027.27-.043.578-.05.912l-3.834 1.831c-.537-.088-3.2.067-7.172-1.893c-1.007-.497-1.991-.761-2.936-.761a5.4 5.4 0 0 0-2.459.595c-1.003-.217-2.448-.773-3.293-.771c-1.912.01-6.259 1.567-7.463 1.7c-1.178.129-2.391.453-3.612.969c-2.219-.646-5.001-1.701-6.491-2.284L2 9v24.41l7.654 3.642c.111-.13.238-.33.376-.578l.237.11q.174.45.384.896c-.84 1.414-.94 3.007-.269 4.392c.575 1.185 1.646 2.017 2.839 2.25c.065.738.313 1.452.731 2.071c.75 1.107 1.942 1.768 3.191 1.768q.17 0 .338-.018c.178.481.439.929.778 1.317c.754.867 1.81 1.364 2.896 1.364q.12 0 .237-.008c.138.524.373 1.02.701 1.462c.755 1.02 1.92 1.627 3.118 1.627c.744 0 1.455-.228 2.082-.655c1.212.778 2.266 1.325 3.201 1.661c.469.191.957.289 1.455.289c1.178 0 2.321-.55 3.137-1.512c.303-.358.549-.758.729-1.186a3.8 3.8 0 0 0 1.087.162c1.252 0 2.439-.613 3.26-1.685a4.7 4.7 0 0 0 .83-1.711q.129.009.256.009c1.447 0 2.832-.849 3.611-2.216a4.74 4.74 0 0 0 .629-2.336c1.43-.213 2.689-1.23 3.302-2.713c.604-1.461.44-3.073-.403-4.417l3.895-2.195c.1.342.198.657.293.913L62 31.098V10.642zm-.001 3.037c.062 1.082.175 2.305.321 3.582c-.8-1.344-1.81-1.957-3.064-2.262zm-5.228 23.756c-2.148-.739-6.619-5.995-6.619-5.995h.088c.455-.032 1.438-.511 2.541-.282c-1.732-1.488-3.637-.229-4.934-1c.301.965 1.748 1.269 2.119 1.281l4.284 4.982c1.94 2.255.589 5.045-1.356 5.489c-1.305-.635-4.99-5.018-4.99-5.018c.126-.023.873-.257 1.634-.157c-1.757-1.314-3.749-.174-4.931-.999c.67 1.655 2.877 1.231 3.108 1.191l2.292 2.926c1.834 2.34.393 5.043-1.555 5.409c-1.727-.607-2.848-2.767-2.848-2.767c.174-.028.756-.287 1.584-.167c-1.473-1.291-3.188-.12-4.219-.855c.637 1.388 2.225 1.072 2.314 1.062c1.588 2.501-.059 5.109-2.027 5.187h-.002l-.002.001c-1.182-.205-2.42-1.15-3.818-2.12c.48-.532.904-1.467.904-1.467c1.404-2.542-.418-4.79-2.299-4.597c1.526.417 2.67 2.365 1.479 4.528l-.523.88c-.568 1.035-1.455 1.66-2.107 1.583c-1.004-.122-2.419-1.588-1.824-3.656c.23-.21 2.448-3.603 2.448-3.603c1.525-2.456-.187-4.807-2.073-4.727c1.502.507 2.555 2.521 1.26 4.611l-1.803 2.811c-.615.994-1.411 1.557-2.17 1.453c-1.178-.16-2.004-1.597-1.815-3.08c-.01.009 1.298-1.454 1.298-1.454c1.738-2.271.25-4.807-1.633-4.94c1.447.674 2.309 2.798.832 4.731l-.638.782c-.704.926-1.55 1.391-2.293 1.202c-1.548-.392-2.321-2.782-.84-4.722c0 0-.503-1.598-.73-2.281l-.746-.346c1.749-4.075 4.391-13.069 4.513-16.057c1.288.459 4.688 1.437 5.049 1.439l-.002.002c3.66-1.15 7.496-1.023 9.246-1.699c.567-.216 1.695-.23 2.891.454c-.747.655-1.453 1.435-2.186 2.162c-1.752 1.739-8.266 4.451-7.01 7.303c1.084 2.461 4.137 4.979 9.258 1.026l2.88-.396l4.479 2.21l5.74 5.895c2.047 2.098.888 4.946-1.003 5.556m1.44-6.495c-.658-1.23-2.709-3.247-4.645-4.896l-.012-.012c.893.036 1.83-1.402 3.041-1.513c-.846-.646-2.248.1-2.685.218c-2.409.648-6.153-2.383-6.153-2.383l-3.582.516s-4.26 5.199-7.849.916c-1.949-2.326 5.114-5.364 6.854-7.093c2.229-2.215 4.215-4.925 7.882-3.079c3.046 1.536 4.246 1.441 8.332 2.152c1.218.213 2.062.771 2.967 1.86c.426 3.584 1.115 7.559 1.776 10.325c-.341.287-3.264 2.253-5.926 2.989"/>
                    </svg>
				</div>
				<h3 class="font-playfair-display text-2xl font-semibold text-prussian-blue mb-3">Co-Create</h3>
				<p class="font-ibm-plex-sans text-prussian-blue/90 mb-6 text-sm">
					We co-build the Vibe and gather feedback to perfect every detail.
				</p>
				<hr class="border-prussian-blue/50 my-4">
				<p class="font-ibm-plex-sans font-medium text-prussian-blue">Co-Create</p>
			</div>

			<!-- Card 3: Launch & Earn -->
			<div class="flex-1 bg-moss-green p-8 rounded-xl shadow-lg flex flex-col text-center min-h-[420px]">
				<!-- Icon placeholder -->
				<div class="mx-auto mb-4">
					<!-- SVG Rocket Icon -->
					<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="currentColor" class="w-16 h-16 text-prussian-blue">
                        <path fill="currentColor" d="M477.64 38.26a4.75 4.75 0 0 0-3.55-3.66c-58.57-14.32-193.9 36.71-267.22 110a317 317 0 0 0-35.63 42.1c-22.61-2-45.22-.33-64.49 8.07C52.38 218.7 36.55 281.14 32.14 308a9.64 9.64 0 0 0 10.55 11.2l87.31-9.63a194 194 0 0 0 1.19 19.7a19.53 19.53 0 0 0 5.7 12L170.7 375a19.6 19.6 0 0 0 12 5.7a194 194 0 0 0 19.59 1.19l-9.58 87.2a9.65 9.65 0 0 0 11.2 10.55c26.81-4.3 89.36-20.13 113.15-74.5c8.4-19.27 10.12-41.77 8.18-64.27a317.7 317.7 0 0 0 42.21-35.64C441 232.05 491.74 99.74 477.64 38.26M294.07 217.93a48 48 0 1 1 67.86 0a47.95 47.95 0 0 1-67.86 0"/><path fill="currentColor" d="M168.4 399.43c-5.48 5.49-14.27 7.63-24.85 9.46c-23.77 4.05-44.76-16.49-40.49-40.52c1.63-9.11 6.45-21.88 9.45-24.88a4.37 4.37 0 0 0-3.65-7.45a60 60 0 0 0-35.13 17.12C50.22 376.69 48 464 48 464s87.36-2.22 110.87-25.75A59.7 59.7 0 0 0 176 403.09c.37-4.18-4.72-6.67-7.6-3.66"/>
                    </svg>
				</div>
				<h3 class="font-playfair-display text-2xl font-semibold text-prussian-blue mb-3">Launch & Earn</h3>
				<p class="font-ibm-plex-sans text-prussian-blue/90 mb-6 text-sm">
					Publish your Vibe, receive 50% of every sale or subscription.
				</p>
				<hr class="border-prussian-blue/50 my-4">
				<p class="font-ibm-plex-sans font-medium text-prussian-blue">Launch & Earn</p>
			</div>
		</div>

		<div class="text-center mt-12 md:mt-16">
			<a href="#" class="font-ibm-plex-sans inline-block bg-prussian-blue text-linen px-10 py-4 rounded-full font-bold text-lg shadow-lg hover:shadow-xl hover:transform hover:-translate-y-1 transition-all duration-300">
                Share Your Idea Now
			</a>
        </div>
	</div>
</section>

<!-- Added empty style block back -->
<style>
	/* Optional styles */
</style> 