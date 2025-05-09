<script lang="ts">
	export let sectionRef: HTMLElement | null = null;

	interface Vibe {
		name: string;
		description: string;
		iconPath: string;
		iconContainerClass: string;
		creatorName?: string;
		creatorLocation?: string;
		creatorInitials: string;
		creatorAvatarBg: string;
		creatorImagePath?: string;
		agentName: string;
		vibeId: string;
	}

	// Assign distinct background colors for avatars
	const avatarBgs = ['bg-prussian-blue', 'bg-persian-orange', 'bg-rosy-brown', 'bg-moss-green', 'bg-buff'];

	const vibes: Vibe[] = [
		{
			vibeId: 'todo',
			name: 'To Do Vibe',
			description: 'Manage tasks by voice—add, complete, and organize without clicking.',
			iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
			iconContainerClass: 'bg-moss-green',
			creatorName: 'Ceva',
			creatorLocation: 'Global',
			creatorInitials: 'C',
			creatorAvatarBg: avatarBgs[0],
			creatorImagePath: '/images/ceva.jpeg',
			agentName: 'Oliver'
		},
		{
			vibeId: 'chess',
			name: 'Chess Vibe',
			description: 'Challenge a friend or the AI, all through simple voice commands.',
			iconPath: 'M15.75 1.5a3 3 0 0 0-3 3V12a3 3 0 0 0 3 3h.75a3 3 0 0 0 3-3V4.5a3 3 0 0 0-3-3h-.75ZM9.75 8.25a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h.75a3 3 0 0 0 3-3V11.25a3 3 0 0 0-3-3h-.75ZM3.75 12a3 3 0 0 0-3 3v3.75a3 3 0 0 0 3 3H4.5a3 3 0 0 0 3-3v-3.75a3 3 0 0 0-3-3H3.75Z',
			iconContainerClass: 'bg-persian-orange',
			creatorName: 'Ayomide',
			creatorLocation: 'Nigeria',
			creatorInitials: 'A',
			creatorAvatarBg: avatarBgs[1],
			creatorImagePath: undefined,
			agentName: 'Magnus'
		},
		{
			vibeId: 'journal',
			name: 'Journal Vibe',
			description: 'Dictate entries, retrieve past notes, and reflect on your day without typing.',
			iconPath: 'M5.625 1.5A3.375 3.375 0 0 0 2.25 4.875v14.25A3.375 3.375 0 0 0 5.625 22.5h12.75A3.375 3.375 0 0 0 21.75 19.125V4.875A3.375 3.375 0 0 0 18.375 1.5H5.625ZM8.25 9a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Zm0 3a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z',
			iconContainerClass: 'bg-persian-orange',
			creatorName: 'Chielo',
			creatorLocation: 'Worldwide',
			creatorInitials: 'C',
			creatorAvatarBg: avatarBgs[2],
			creatorImagePath: '/images/chielo.JPG',
			agentName: 'Tanja'
		},
		{
			vibeId: 'notes',
			name: 'Notes Vibe',
			description: 'Quickly capture thoughts, ideas, and meeting minutes using just your voice.',
			iconPath: `M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z`,
			iconContainerClass: 'bg-buff',
			creatorName: 'Sami',
			creatorLocation: 'Remote',
			creatorInitials: 'S',
			creatorAvatarBg: avatarBgs[3],
			creatorImagePath: '/images/sami.jpg',
			agentName: 'Scribe'
		}
	];

	const spotlightVibes = vibes.filter(vibe => vibe.vibeId === 'chess' || vibe.vibeId === 'journal');

</script>

<section bind:this={sectionRef} data-section="5" id="marketplaceSection" class="py-16 md:py-24 bg-linen text-prussian-blue">
	<div class="w-full max-w-6xl mx-auto px-4 md:px-8">
		<!-- Main two-column grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 lg:gap-x-16 items-start">

			<!-- Left Column: Vibe Showcase UI -->
			<div class="md:sticky md:top-24 h-full">
                <div class="bg-timberwolf-1/20 backdrop-blur-lg border border-timberwolf-1/40 rounded-2xl p-6 md:p-8 shadow-xl flex flex-col h-full">
                    <h3 class="font-playfair-display text-3xl text-prussian-blue/80 mb-6 text-center">Available Vibes</h3>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 flex-grow">
                        {#each vibes as vibe (vibe.vibeId)}
                            <div class="bg-timberwolf-2/50 border border-timberwolf-2/40 rounded-xl p-4 shadow-xl flex flex-col text-center hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                                <div class="flex items-center mb-2 w-full">
                                    <div class="w-7 h-7 rounded-lg {vibe.iconContainerClass} flex items-center justify-center mr-2.5 flex-shrink-0">
                                        <svg class="h-4 w-4 text-linen" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path fill-rule="evenodd" d="{vibe.iconPath}" clip-rule="evenodd"></path> 
                                        </svg>
                                    </div>
                                    <h4 class="font-ibm-plex-sans text-lg font-semibold text-prussian-blue text-left">{vibe.name}</h4>
                                </div>

                                <!-- Centered Creator Avatar/Image and Name -->
                                <div class="flex flex-col items-center my-2">
                                    {#if vibe.creatorImagePath}
                                        <img src={vibe.creatorImagePath} alt="{vibe.creatorName ?? 'Creator'} avatar" class="w-12 h-12 rounded-full object-cover shadow-md mb-1">
                                    {:else}
                                        <div class="w-12 h-12 rounded-full {vibe.creatorAvatarBg} flex items-center justify-center text-xl font-semibold mb-1 shadow-md">
                                            <span class="text-linen">{vibe.creatorInitials}</span>
                                        </div>
                                    {/if}
                                    <p class="font-ibm-plex-sans text-sm font-medium text-prussian-blue/80" class:mt-1={!vibe.creatorImagePath}>{vibe.creatorName ?? 'Hominio Team'}</p>
                                </div>
                                
                                <p class="font-ibm-plex-sans text-sm text-prussian-blue/90 mb-2 flex-grow min-h-[50px]">{vibe.description}</p>
                            </div>
                        {/each}
                    </div>
				</div>
			</div>

			<!-- Right Column: Marketplace Explanation & Creator Spotlight -->
			<div class="mt-12 md:mt-0 bg-timberwolf-1/30 backdrop-blur-md border border-timberwolf-1/50 rounded-2xl p-6 py-8 md:p-10 shadow-xl flex flex-col space-y-6 md:space-y-8">
				<div class="text-left">
					<h2 class="font-playfair-display text-4xl md:text-5xl font-normal mb-4">Explore the Marketplace</h2>
					<p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/80">
						In the Hominio Marketplace, discover a curated collection of voice-powered Vibes you can launch instantly.
			</p>
		</div>

				<!-- Creator Spotlights -->
				<div class="space-y-5">
					{#each spotlightVibes as vibe (vibe.vibeId)}
					<div class="bg-linen/50 p-4 rounded-lg border border-timberwolf-2/30 shadow-sm">
						<h4 class="font-ibm-plex-sans text-lg font-semibold text-prussian-blue mb-0.5">{vibe.name}</h4>
						<p class="font-ibm-plex-sans text-sm text-prussian-blue/70">
							By <span class="font-medium text-persian-orange">{vibe.creatorName}</span> from <span class="font-medium text-persian-orange">{vibe.creatorLocation}</span>
						</p>
						<!-- Optional: could add vibe.description here if desired -->
					</div>
				{/each}

					<!-- YOUR VIBE HERE Callout -->
					<div class="bg-buff/30 p-4 rounded-lg border border-buff/50 text-center shadow-md hover:shadow-lg transition-shadow cursor-pointer">
						<h4 class="font-playfair-display text-xl font-semibold text-prussian-blue mb-1">This could be Your Vibe!</h4>
						<p class="font-ibm-plex-sans text-base text-prussian-blue/80">
							Join our global community of Vibe creators.
						</p>
					</div>
				</div>

				<p class="font-ibm-plex-sans text-lg md:text-xl text-prussian-blue/80">
					Use your voice to launch any Vibe and interact with your data in groundbreaking ways. We're empowering creators from all over the world to share their ideas, co-create the next generation of Vibes, and earn passive income.
				</p>
			</div>
		</div>
	</div>
</section>

<style>
	/* Optional styles can go here if needed, but aiming for utility-first Tailwind */
</style> 