<script lang="ts">
	export let sectionRef: HTMLElement | null = null;

	// Define founder data (can be expanded later)
	const founders = [
		{ name: "Sami", image: "/images/sami.jpg", description: "Short description about Sami goes here.", style: "" },
		{ name: "Chielo", image: "/images/chielo.JPG", description: "Short description about Chielo goes here.", style: "object-position: center 50%;" }
	];
	// Example simple SVG icons (inline for brevity, normally you might use an icon library or separate components)
	const icons = {
		vision: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7 text-buff inline-block mr-3 align-middle"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.432 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>',
		whatWeDo: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7 text-buff inline-block mr-3 align-middle"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>',
		forCreators: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7 text-buff inline-block mr-3 align-middle"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L1.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.25 12L18 14.25l-.25-2.25a3.375 3.375 0 00-2.457-2.457L13 9.25l2.25-.25a3.375 3.375 0 002.457-2.457L18 4.25l.25 2.25a3.375 3.375 0 002.457 2.457L22.75 9.25l-2.25.25a3.375 3.375 0 00-2.457 2.457z" /></svg>',
		forUsers: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7 text-buff inline-block mr-3 align-middle"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>',
	};
</script>

<section bind:this={sectionRef} data-section="8" class="py-16 md:py-24 bg-linen text-prussian-blue">
	<div class="w-full max-w-4xl mx-auto px-4 md:px-8">
		<div class="text-center mb-10 md:mb-12">
            <h2 class="font-playfair-display text-4xl md:text-5xl font-normal mb-6">About Hominio</h2>
            <p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/90 leading-relaxed max-w-3xl mx-auto">
                At Hominio, we're building a bridge between human creativity and AI innovation. Our marketplace is more than a platform—it's a vision for a world where voice technology breaks down barriers and empowers creators everywhere.
            </p>
        </div>

        <div class="space-y-10 md:space-y-12 text-left">
            <div>
                <h3 class="font-playfair-display text-3xl md:text-4xl font-normal mb-3 text-prussian-blue">{@html icons.vision}Our Vision</h3>
                <p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/90 leading-relaxed">
                    We believe in a future where technology serves human potential. Hominio creates the space where creators and users connect directly, without corporate gatekeepers or technical hurdles. Through our voice-powered Vibes, we're making sophisticated technology accessible to everyone through the most natural interface: your voice.
                </p>
            </div>
            <p class="font-playfair-display text-2xl md:text-3xl text-persian-orange my-8 md:my-10 text-center italic px-6">"...making sophisticated technology accessible to everyone through the most natural interface: your voice."</p>

            <div>
                <h3 class="font-playfair-display text-3xl md:text-4xl font-normal mb-3 text-prussian-blue">{@html icons.whatWeDo}What We Do</h3>
                <p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/90 leading-relaxed">
                    The Hominio Marketplace curates voice-powered Vibes that transform how you interact with technology. Whether you're managing tasks, journaling thoughts, playing chess, or boosting productivity, our Vibes work the way humans naturally do—through conversation.
                </p>
            </div>
            <p class="font-playfair-display text-2xl md:text-3xl text-buff my-8 md:my-10 text-center italic px-6">"...a world where voice technology breaks down barriers and empowers creators everywhere."</p>
            
            <!-- Two-column grid for For Creators and For Users -->
            <div class="grid md:grid-cols-2 gap-x-10 lg:gap-x-12 gap-y-8 md:gap-y-10 pt-4 md:pt-6">
                <div>
                    <h3 class="font-playfair-display text-3xl md:text-4xl font-normal mb-3 text-prussian-blue">{@html icons.forCreators}For Creators</h3>
                    <p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/90 leading-relaxed">
                        We empower visionaries to share their ideas globally and earn from their innovation. Our platform provides the tools, audience, and infrastructure for creators to build, distribute, and monetize voice applications without needing advanced technical skills.
                    </p>
                </div>
    
                <div>
                    <h3 class="font-playfair-display text-3xl md:text-4xl font-normal mb-3 text-prussian-blue">{@html icons.forUsers}For Users</h3>
                    <p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/90 leading-relaxed">
                        Discover a new way to interact with your digital world. Launch any Vibe instantly and control your experience through simple voice commands. No more clicking through menus or typing commands—just speak naturally and let technology adapt to you.
                    </p>
                </div>
            </div>

            <div class="text-center pt-8 md:pt-10">
                <h3 class="font-playfair-display text-3xl md:text-4xl font-normal mb-3 text-prussian-blue text-center">Join Our Community</h3>
                <p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/90 leading-relaxed text-center max-w-2xl mx-auto mb-6 md:mb-8">
                    We're a team passionate about the future of voice and dedicated to building a platform that serves everyone. Get to know the people helping bring Hominio to life:
                </p>
            </div>
        </div>

        <!-- Founders Grid -->
        <div class="flex flex-col items-center gap-4 pt-2 md:flex-row md:justify-center md:gap-x-8">
            {#each founders as founder}
                <div class="text-center flex flex-col items-center">
                    <div class="w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden bg-gray-300 mb-4 shadow-lg">
                        <img 
                            src="{founder.image}" 
                            alt="{founder.name}" 
                            class="w-full h-full object-cover" 
                            loading="lazy"
                            style="{founder.style || ''}"
                        />
                    </div>
                    <h3 class="font-ibm-plex-sans text-xl font-semibold mb-2 text-prussian-blue">{founder.name}</h3>
                </div>
            {/each}
        </div>
	</div>
</section>

<style>
    /* Optional: Add specific styles if needed */
</style> 