<script lang="ts">
	// We need to import the switchVibe function equivalent
	// Since we can't access it directly, we'll use the page-level function
	// through custom event dispatch

	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// Get list of available vibes (excluding home)
	const vibes = [
		{
			id: 'todos',
			name: 'Todo List',
			description: 'Manage your tasks with voice commands',
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
			color: 'indigo',
			agent: 'Hominio'
		},
		{
			id: 'counter',
			name: 'Counter',
			description: 'Simple interactive counter with Lily',
			icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
			color: 'blue',
			agent: 'Lily'
		}
	];

	// Function to select a vibe
	function selectVibe(vibeId: string) {
		console.log(`🔄 Selecting vibe: ${vibeId} from HomeView`);
		// Dispatch an event to the parent component
		dispatch('selectVibe', { vibeId });
	}
</script>

<div class="mx-auto max-w-5xl p-4 sm:p-6">
	<!-- Welcome heading -->
	<div class="mb-8 text-center">
		<h1 class="mb-2 text-4xl font-bold text-white/95">Welcome to Hominio</h1>
		<p class="text-xl text-white/70">Select a vibe to get started</p>
	</div>

	<!-- Vibe Grid -->
	<div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-2">
		{#each vibes as vibe}
			<button
				on:click={() => selectVibe(vibe.id)}
				class="flex flex-col rounded-xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-sm transition-all hover:bg-white/10"
			>
				<div class="flex items-center gap-3">
					<div class={`rounded-full bg-${vibe.color}-500/30 p-2.5`}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={vibe.icon} />
						</svg>
					</div>
					<h2 class="text-xl font-semibold text-white/90">{vibe.name}</h2>
				</div>
				<p class="mt-3 text-white/70">
					{vibe.description}
				</p>
				<div class="mt-4 flex items-center">
					<span class="text-xs text-white/50">Agent: {vibe.agent}</span>
				</div>
			</button>
		{/each}
	</div>
</div>

<style>
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
		transform: translateY(-2px);
		transition: all 0.2s ease;
	}

	button {
		transition: all 0.2s ease;
	}
</style>
