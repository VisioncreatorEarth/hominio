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

<div class="mx-auto max-w-5xl bg-[#f8f4ed] p-4 sm:p-6">
	<!-- Welcome heading -->
	<div class="mb-8 text-center">
		<h1 class="mb-2 text-4xl font-bold text-[#0a2a4e]">Welcome to Hominio</h1>
		<p class="text-xl text-gray-600">Select a vibe to get started</p>
	</div>

	<!-- Loading state -->
	{#if loading}
		<div class="flex justify-center py-10">
			<div class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-[#0a2a4e]"></div>
		</div>
	{:else}
		<!-- Vibe Grid -->
		<div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-2">
			{#each vibes as vibe}
				<button
					on:click={() => selectVibe(vibe.id)}
					class="group flex flex-col rounded-lg border border-[#d6c7b1] bg-[#f5f1e8] p-5 text-left transition-all hover:border-[#0a2a4e] hover:bg-[#e0d8cb] hover:shadow-md"
				>
					<div class="flex items-center gap-3">
						<div class={`rounded-full bg-[#0a2a4e] p-2.5`}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class={`h-6 w-6 text-[#f8f4ed]`}
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
						<h2 class="text-xl font-semibold text-[#0a2a4e]">{vibe.name}</h2>
					</div>
					<p class="mt-3 text-gray-600">
						{vibe.description}
					</p>
					<div class="mt-4 flex items-center">
						<span class="text-xs text-gray-500">
							Agents:
							{#each vibe.agents as agent, i}
								{#if i > 0},
								{/if}
								{#if agent === vibe.defaultAgent}
									<span class="font-medium text-[#0a2a4e]">{agent}</span>
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
	/* Removed custom hover style */
	button {
		transition: all 0.2s ease;
	}
</style>
