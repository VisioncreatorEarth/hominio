<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { todoState, toolState, initTodoStore, cleanupTodoStore } from '$lib/ultravox/todoStore';
	import { currentAgent } from '$lib/ultravox/agents';
	import { registerToolsFromRegistry } from '$lib/ultravox/loaders/toolLoader';
	import {
		getActiveVibe,
		GLOBAL_CALL_TOOLS,
		loadVibeComponent,
		clearComponentCache,
		initializeVibe
	} from '$lib/ultravox';
	import type { ComponentType, SvelteComponent } from 'svelte';

	// Initialize the todo store and get the unsubscribe function
	let unsubscribeTodo: () => void;
	let toolsRegistered = false;

	// Store for vibe data
	let globalSkills = $state<string[]>([]);
	let vibeSkills = $state<string[]>([]);
	let agentTools = $state<Record<string, string[]>>({});
	let toolSkills = $state<Record<string, string>>({});
	let toolIcons = $state<Record<string, string>>({});
	let toolColors = $state<Record<string, string>>({});
	let loadingVibe = $state(true);

	// Store for dynamic component
	let vibeComponent = $state<any>(null);
	let vibeComponentName = $state<string>('');
	let loadingComponent = $state(true);

	// Function to load vibe information
	async function loadVibeInfo() {
		try {
			loadingVibe = true;
			const vibe = await getActiveVibe();
			console.log('🔍 Active vibe:', vibe.manifest.name);

			// Get global skills (from globalTools.ts)
			globalSkills = [...GLOBAL_CALL_TOOLS];

			// Get vibe-specific skills
			vibeSkills = (vibe.manifest as any).vibeTools || [];

			// Get tools by agent
			const toolsByAgent: Record<string, string[]> = {};
			vibe.manifest.agents.forEach((agent) => {
				toolsByAgent[agent.name] = agent.tools || [];
			});

			agentTools = toolsByAgent;

			// Load tool data from manifests
			await loadToolData([...globalSkills, ...vibeSkills, ...Object.values(toolsByAgent).flat()]);

			// Get the view component from the vibe
			const viewName = (vibe.manifest as any).view;
			console.log(`🎮 Vibe view component name from manifest: "${viewName}"`);
			console.log(`🎮 Currently set component name: "${vibeComponentName}"`);

			// Don't change component name if already set directly
			// This preserves our direct setting in switchVibe

			// Load the component
			await loadVibeComponentUI();

			loadingVibe = false;
		} catch (error) {
			console.error('❌ Failed to load vibe info:', error);
			loadingVibe = false;
		}
	}

	// Function to load the dynamic vibe component
	async function loadVibeComponentUI() {
		loadingComponent = true;
		try {
			if (vibeComponentName === 'CounterView') {
				// Direct import for CounterView
				const module = await import('$lib/components/CounterView.svelte');
				vibeComponent = module.default;
				console.log(`📱 Directly loaded CounterView component`);
			} else {
				// Default to TodoView
				const module = await import('$lib/components/TodoView.svelte');
				vibeComponent = module.default;
				console.log(`📱 Directly loaded TodoView component`);
			}
		} catch (error) {
			console.error(`❌ Failed to load vibe component "${vibeComponentName}":`, error);
			vibeComponent = null;
		} finally {
			loadingComponent = false;
		}
	}

	// Function to load tool data from manifests
	async function loadToolData(toolNames: string[]) {
		const uniqueToolNames = [...new Set(toolNames)];
		const skills: Record<string, string> = {};
		const icons: Record<string, string> = {};
		const colors: Record<string, string> = {};

		for (const toolName of uniqueToolNames) {
			try {
				const manifest = await import(`../../lib/tools/${toolName}/manifest.json`);
				skills[toolName] = manifest.skill || '';
				icons[toolName] =
					manifest.icon || 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
				colors[toolName] = manifest.color || 'amber';
			} catch (error) {
				console.error(`Failed to load manifest for ${toolName}:`, error);
				skills[toolName] = '';
				icons[toolName] = 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
				colors[toolName] = 'amber';
			}
		}

		toolSkills = skills;
		toolIcons = icons;
		toolColors = colors;
	}

	// Function to handle Ultravox ready event
	async function handleUltravoxReady() {
		console.log('🔄 Ultravox ready event detected, registering tools...');
		try {
			await registerToolsFromRegistry();
			toolsRegistered = true;
			console.log('✅ Tools registered successfully');
		} catch (error) {
			console.error('❌ Failed to register tools:', error);
		}
	}

	// Function to ensure tools are registered
	async function ensureToolsRegistered() {
		if (!toolsRegistered) {
			if (window.__ULTRAVOX_SESSION?.registerTool) {
				await handleUltravoxReady();
			} else {
				console.log('⏳ Waiting for Ultravox session...');
			}
		}
		return toolsRegistered;
	}

	// Function to handle vibe switching
	async function switchVibe(vibeName: string) {
		loadingVibe = true;
		console.log(`🔄 Switching to ${vibeName} vibe...`);
		try {
			// Reset state first
			vibeComponent = null;

			// Set component name directly based on vibe
			if (vibeName === 'counter') {
				vibeComponentName = 'CounterView';
				console.log('⚠️ Setting component to CounterView directly');
			} else {
				vibeComponentName = 'TodoView';
				console.log('⚠️ Setting component to TodoView directly');
			}

			loadingComponent = true;

			// Clear component cache to force reload
			clearComponentCache();
			console.log('🧹 Component cache cleared');

			// Initialize the new vibe
			console.log(`🚀 Initializing ${vibeName} vibe...`);
			await initializeVibe(vibeName);

			// Reload vibe info
			console.log('📋 Loading vibe data...');
			await loadVibeInfo();
			console.log(`✅ Successfully switched to ${vibeName} vibe`);
		} catch (error) {
			console.error(`❌ Failed to initialize ${vibeName} vibe:`, error);
			loadingVibe = false;
		}
	}

	// Debug function to inspect manifest
	async function debugVibeManifest() {
		try {
			const vibe = await getActiveVibe();
			console.log('🔎 DEBUGGING VIBE MANIFEST');
			console.log('Name:', vibe.manifest.name);
			console.log('View:', (vibe.manifest as any).view);
			console.log('Full manifest:', vibe.manifest);
		} catch (error) {
			console.error('Debug error:', error);
		}
	}

	onMount(async () => {
		// Set the default agent to Hominio (the orchestrator)
		currentAgent.set('Hominio');

		// Initialize the todo store
		unsubscribeTodo = initTodoStore();

		// Add event listener for Ultravox ready
		window.addEventListener('ultravox-ready', handleUltravoxReady);

		// Try to register tools immediately if possible
		await ensureToolsRegistered();

		// Load vibe information
		await loadVibeInfo();
	});

	// Clean up on component destroy
	onDestroy(() => {
		if (unsubscribeTodo) {
			unsubscribeTodo();
		}
		cleanupTodoStore();

		// Remove the event listener
		window.removeEventListener('ultravox-ready', handleUltravoxReady);
	});
</script>

<div class="mx-auto grid max-w-full grid-cols-1 gap-6 lg:grid-cols-6 lg:px-4">
	<!-- Left sidebar for Skills -->
	<div class="lg:col-span-1">
		<div class="sticky top-6 p-4">
			<!-- Vibe Selector -->
			<div class="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Select Vibe</h3>
				{#if loadingVibe}
					<div class="flex items-center justify-center py-3">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
						></div>
						<span class="ml-3 text-sm text-white/70">Switching vibe...</span>
					</div>
				{:else}
					<div class="space-y-2">
						<button
							on:click={() => switchVibe('todos')}
							class="w-full rounded-lg bg-indigo-500/30 py-2 text-sm font-medium text-white/90 transition-all hover:bg-indigo-500/50"
						>
							Todo Vibe
						</button>
						<button
							on:click={() => switchVibe('counter')}
							class="w-full rounded-lg bg-blue-500/30 py-2 text-sm font-medium text-white/90 transition-all hover:bg-blue-500/50"
						>
							Counter Vibe
						</button>
						<button
							on:click={debugVibeManifest}
							class="mt-4 w-full rounded-lg bg-orange-500/30 py-2 text-xs font-medium text-white/90 transition-all hover:bg-orange-500/50"
						>
							Debug Manifest
						</button>
						<button
							on:click={async () => {
								loadingComponent = true;
								vibeComponent = null;
								vibeComponentName = 'CounterView';
								try {
									const module = await import('$lib/components/CounterView.svelte');
									vibeComponent = module.default;
									console.log('Force loaded CounterView');
								} catch (e) {
									console.error('Failed to load CounterView:', e);
								} finally {
									loadingComponent = false;
								}
							}}
							class="w-full rounded-lg bg-red-500/30 py-2 text-xs font-medium text-white/90 transition-all hover:bg-red-500/50"
						>
							Force CounterView
						</button>
					</div>
				{/if}
			</div>

			<!-- Skills Section -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Available Skills</h3>

				{#if loadingVibe}
					<div class="flex items-center justify-center py-6">
						<div
							class="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
						></div>
						<span class="ml-3 text-sm text-white/70">Loading skills...</span>
					</div>
				{:else}
					<!-- Global Skills Section -->
					{#if globalSkills.length > 0}
						<div class="mb-4">
							<h4 class="mb-2 text-sm font-semibold text-white/60">Global Skills</h4>
							<div class="space-y-3">
								{#each globalSkills as toolName}
									<div
										class="rounded-lg border border-white/5 bg-cyan-900/20 p-3 transition-colors hover:bg-white/10"
									>
										<div class="flex items-center gap-2">
											<div class={`rounded-full bg-${toolColors[toolName]}-500/20 p-1.5`}>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d={toolIcons[toolName]}
													/>
												</svg>
											</div>
											<div class="text-xs font-medium text-white/80">{toolName}</div>
										</div>
										<div class="mt-1 text-xs text-white/70">
											{toolSkills[toolName]}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Vibe Skills Section -->
					{#if vibeSkills.length > 0}
						<div class="mb-4">
							<h4 class="mb-2 text-sm font-semibold text-white/60">Vibe Skills</h4>
							<div class="space-y-3">
								{#each vibeSkills as toolName}
									<div
										class="rounded-lg border border-white/5 bg-indigo-900/20 p-3 transition-colors hover:bg-white/10"
									>
										<div class="flex items-center gap-2">
											<div class={`rounded-full bg-${toolColors[toolName]}-500/20 p-1.5`}>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d={toolIcons[toolName]}
													/>
												</svg>
											</div>
											<div class="text-xs font-medium text-white/80">{toolName}</div>
										</div>
										<div class="mt-1 text-xs text-white/70">
											{toolSkills[toolName]}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Agent-Specific Skills -->
					{#each Object.entries(agentTools) as [agentName, tools]}
						{#if tools.length > 0}
							<div class="mt-5">
								<h4 class="mb-2 text-sm font-semibold text-white/60">{agentName}'s Skills</h4>
								<div class="space-y-3">
									{#each tools as toolName}
										<div
											class="rounded-lg border border-white/5 bg-white/5 p-3 transition-colors hover:bg-white/10"
										>
											<div class="flex items-center gap-2">
												<div class={`rounded-full bg-${toolColors[toolName]}-500/20 p-1.5`}>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-3.5 w-3.5"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d={toolIcons[toolName]}
														/>
													</svg>
												</div>
												<div class="text-xs font-medium text-white/80">{toolName}</div>
											</div>
											<div class="mt-1 text-xs text-white/70">
												{toolSkills[toolName]}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>
		</div>
	</div>

	<!-- Main content area - Dynamically loaded vibe component -->
	<div class="lg:col-span-4">
		{#if loadingComponent || !vibeComponent}
			<div class="flex h-64 items-center justify-center">
				<div class="flex flex-col items-center">
					<div
						class="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
					></div>
					<p class="mt-4 text-white/60">Loading {vibeComponentName} component...</p>
				</div>
			</div>
		{:else}
			<svelte:component this={vibeComponent} />
		{/if}
	</div>

	<!-- Right sidebar for activity log -->
	<div class="lg:col-span-1">
		<div class="sticky top-6 p-4">
			<!-- Tool Status Area -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Recent Activity</h3>
				{#if $toolState.history.length > 0}
					<div class="max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
						<div class="space-y-3">
							{#each $toolState.history as entry, i}
								<div class="rounded-lg border border-white/5 bg-white/5 p-3">
									<div class="flex items-center gap-2">
										<div
											class={`rounded-full p-1.5 ${
												entry.success
													? entry.action === 'create'
														? 'bg-blue-500/20'
														: entry.action === 'toggle'
															? 'bg-green-500/20'
															: entry.action === 'edit'
																? 'bg-indigo-500/20'
																: entry.action === 'delete'
																	? 'bg-red-500/20'
																	: entry.action === 'filter'
																		? 'bg-purple-500/20'
																		: entry.action === 'createList'
																			? 'bg-amber-500/20'
																			: entry.action === 'switchList'
																				? 'bg-cyan-500/20'
																				: entry.action === 'switchAgent'
																					? 'bg-cyan-500/20'
																					: 'bg-teal-500/20'
													: 'bg-orange-500/20'
											}`}
										>
											{#if entry.action === 'create'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M12 6v6m0 0v6m0-6h6m-6 0H6"
													/>
												</svg>
											{:else if entry.action === 'toggle'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M5 13l4 4L19 7"
													/>
												</svg>
											{:else if entry.action === 'edit'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
													/>
												</svg>
											{:else if entry.action === 'delete'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
													/>
												</svg>
											{:else if entry.action === 'filter'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
													/>
												</svg>
											{:else if entry.action === 'createList'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
													/>
												</svg>
											{:else if entry.action === 'switchList'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
													/>
												</svg>
											{:else if entry.action === 'switchAgent'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
													/>
												</svg>
											{/if}
										</div>
										<div class="text-xs font-medium text-white/80 capitalize">
											{entry.action === 'createList'
												? 'create list'
												: entry.action === 'switchList'
													? 'switch list'
													: entry.action === 'switchAgent'
														? 'switch agent'
														: entry.action}
										</div>
										<div class="ml-auto text-[10px] text-white/50">
											{new Date(entry.timestamp).toLocaleTimeString()}
										</div>
									</div>
									<div class="mt-1.5 text-xs text-white/70">
										{entry.message}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<p class="text-sm text-white/60">
						Activity will appear here as you interact with Hominio using voice commands.
					</p>
				{/if}
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
	}
</style>
