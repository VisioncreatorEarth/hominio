<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	export let sectionRef: HTMLElement | null = null;
	let roadmapElement: HTMLElement | null = null;

	const fullRoadmapText = "Discover a <span class=\"text-persian-orange font-semibold\">fully decentralized roadmap.</span>";
	let displayedRoadmapText = "";
	let roadmapCharIndex = 0;
	let roadmapIntervalId: ReturnType<typeof setInterval> | null = null;
	let roadmapObserver: IntersectionObserver | null = null;
	let isIntersecting = false; // Track intersection state

	function startRoadmapAnimation() {
		if (roadmapIntervalId) clearInterval(roadmapIntervalId); // Clear previous just in case
		displayedRoadmapText = "";
		roadmapCharIndex = 0;
		const tagsRegex = /<[^>]*>/g; // Regex to match HTML tags
		let plainText = fullRoadmapText.replace(tagsRegex, '');
		let tagMap = new Map<number, string>();
		let match;
		let offset = 0;
		while ((match = tagsRegex.exec(fullRoadmapText)) !== null) {
			tagMap.set(match.index - offset, match[0]);
			offset += match[0].length;
		}

		roadmapIntervalId = setInterval(() => {
			if (roadmapCharIndex < plainText.length) {
				let currentOutput = "";
				let plainCharCount = 0;
				for (let i = 0; i < fullRoadmapText.length && plainCharCount <= roadmapCharIndex; i++) {
					if (tagMap.has(i)) {
						currentOutput += tagMap.get(i) || '';
						i += (tagMap.get(i)?.length || 1) - 1; // Adjust index to skip tag
					} else {
						currentOutput += fullRoadmapText[i];
						plainCharCount++;
					}
				}
				displayedRoadmapText = currentOutput;
				roadmapCharIndex++;
			} else {
				displayedRoadmapText = fullRoadmapText; // Ensure full text with tags is displayed
				if (roadmapIntervalId) clearInterval(roadmapIntervalId);
				roadmapIntervalId = null;
			}
		}, 90); // Typing speed
	}

	function resetRoadmapAnimation() {
		if (roadmapIntervalId) clearInterval(roadmapIntervalId);
		roadmapIntervalId = null;
		displayedRoadmapText = "";
		roadmapCharIndex = 0;
	}

	onMount(() => {
		if (!roadmapElement) return;

		roadmapObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					isIntersecting = true;
					// Only start if title is empty to prevent restart if already typing
					if (displayedRoadmapText === "") {
						startRoadmapAnimation();
					}
				} else {
					isIntersecting = false;
					resetRoadmapAnimation();
				}
			});
		}, { threshold: 0.2 });

		roadmapObserver.observe(roadmapElement);
	});

	onDestroy(() => {
		if (roadmapIntervalId) clearInterval(roadmapIntervalId);
		if (roadmapObserver && roadmapElement) {
			roadmapObserver.unobserve(roadmapElement);
		}
		if (roadmapObserver) {
			roadmapObserver.disconnect();
		}
	});

</script>

<section bind:this={sectionRef} data-section="7" class="py-16 md:py-24 bg-linen text-prussian-blue">
	<div class="w-full max-w-4xl mx-auto px-4 md:px-8 text-center">
        <!-- Removed outer centered content box -->
        <p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/80 font-normal mb-4">
            The Path Forward:
        </p>
        <h2 
            class="font-playfair-display text-5xl md:text-6xl lg:text-7xl text-prussian-blue font-normal mb-10 leading-tight min-h-[100px] md:min-h-[150px] lg:min-h-[170px]"
            bind:this={roadmapElement}
        >
            {@html displayedRoadmapText}<span class="animate-blink">|</span>
        </h2>
        <a 
            href="#" 
            class="font-ibm-plex-sans inline-block bg-prussian-blue text-linen px-10 py-4 rounded-full font-bold text-lg shadow-lg hover:shadow-xl hover:transform hover:-translate-y-1 transition-all duration-300"
        >
            Learn More
        </a>
	</div>
</section>

<style>
    /* Copied blink animation from GameChanger */
    @keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}
	.animate-blink {
		animation: blink 1s step-end infinite;
	}
</style> 