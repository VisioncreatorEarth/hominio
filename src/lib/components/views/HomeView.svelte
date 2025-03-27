<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { getAllVibes } from '$lib/ultravox/registries/vibeRegistry';
	import type { VibeInfo } from '$lib/ultravox/registries/vibeRegistry';

	const dispatch = createEventDispatcher();

	// Store for available vibes
	let vibes: VibeInfo[] = [];
	let loading = true;

	// Function to select a vibe
	function selectVibe(vibeId: string) {
		console.log(`🔄 Selecting vibe: ${vibeId} from HomeView`);
		// Dispatch an event to the parent component
		dispatch('selectVibe', { vibeId });
	}

	// Load vibes on component mount
	onMount(async () => {
		try {
			loading = true;
			vibes = await getAllVibes();
			console.log('✅ Loaded vibes:', vibes);
		} catch (error) {
			console.error('Error loading vibes:', error);
		} finally {
			loading = false;
		}
	});
</script>

<div class="mx-auto max-w-5xl p-4 sm:p-6">
	<!-- Welcome heading -->
	<div class="mb-8 text-center">
		<h1 class="mb-2 text-4xl font-bold text-white/95">Welcome to Hominio</h1>
		<p class="text-xl text-white/70">Select a vibe to get started</p>
	</div>

	<!-- Loading state -->
	{#if loading}
		<div class="flex justify-center py-10">
			<div class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-blue-500"></div>
		</div>
	{:else}
		<!-- Vibe Grid -->
		<div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-2">
			{#each vibes as vibe}
				<button
					on:click={() => selectVibe(vibe.id)}
					class="group flex flex-col rounded-lg border border-white/5 bg-white/5 p-5 text-left backdrop-blur-sm transition-all hover:border-blue-500/30 hover:bg-white/10"
				>
					<div class="flex items-center gap-3">
						<div class={`rounded-full bg-${vibe.color}-500/20 p-2.5`}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d={vibe.icon}
								/>
							</svg>
						</div>
						<h2 class="text-xl font-semibold text-white/90">{vibe.name}</h2>
					</div>
					<p class="mt-3 text-white/70">
						{vibe.description}
					</p>
					<div class="mt-4 flex items-center">
						<span class="text-xs text-white/50">
							Agents:
							{#each vibe.agents as agent, i}
								{#if i > 0},
								{/if}
								{#if agent === vibe.defaultAgent}
									<span class="font-medium text-blue-300">{agent}</span>
								{:else}
									{agent}
								{/if}
							{/each}
						</span>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
		transform: translateY(-2px);
		transition: all 0.2s ease;
	}

	button {
		transition: all 0.2s ease;
	}
</style>
