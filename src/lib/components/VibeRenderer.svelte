<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { GLOBAL_CALL_TOOLS } from '$lib/ultravox/globalTools';
	import { getActiveVibe, initializeVibe } from '$lib/ultravox';
	import { loadVibeComponent, clearComponentCache } from '$lib/ultravox/loaders/viewLoader';
	import { todoState, getActiveDocName, toolState } from '$lib/ultravox/todoStore';
	import { currentAgent } from '$lib/ultravox/agents';
	import type { AgentConfig } from '$lib/ultravox/types';
	import TodoView from '$lib/components/TodoView.svelte';
	import HomeView from '$lib/components/HomeView.svelte';
	import CounterView from '$lib/components/CounterView.svelte';

	// Define interface for our vibe manifest that includes the view property
	interface ExtendedVibeManifest {
		name: string;
		description?: string;
		systemPrompt?: string;
		view?: string;
		vibeTools?: string[];
		defaultAgent?: string;
		agents?: AgentConfig[];
		[key: string]: any;
	}

	// Define type for the vibe selection event
	interface VibeSelectEvent {
		detail: {
			vibeId: string;
		};
	}

	const dispatch = createEventDispatcher();

	// Props using Svelte 5 runes
	const props = $props<{ vibeId?: string }>();
	const initialVibeId = props.vibeId || 'home';

	// Agent and tool management
	let globalSkills = $state<Array<{ name: string }>>([]);
	let vibeSkills = $state<Array<{ name: string }>>([]);
	let agentTools = $state<Record<string, Array<{ name: string }>>>({});
	let toolSkills = $state<Record<string, any>>({});
	let toolIcons = $state<Record<string, string>>({});
	let toolColors = $state<Record<string, string>>({});

	// Vibe state
	let activeVibeName = $state<string>(initialVibeId);
	let loadingVibe = $state(true);
	let vibeComponent = $state<any>(null);
	let vibeComponentName = $state<string>('');
	let loadingComponent = $state(true);
	let componentError = $state<string>('');
	let activeManifest = $state<ExtendedVibeManifest | null>(null);

	// Helper function to get global skills
	async function getGlobalSkills(): Promise<Array<{ name: string }>> {
		// Convert global tools to the expected format
		return GLOBAL_CALL_TOOLS.map((toolName) => ({ name: toolName }));
	}

	// Component loader for dynamic component rendering
	function loadComponentUI() {
		try {
			if (vibeComponentName === 'HomeView') {
				console.log(`🏠 Loading HomeView component directly`);
				vibeComponent = HomeView;
				loadingComponent = false;
				componentError = '';
				return;
			} else if (vibeComponentName === 'TodoView') {
				console.log(`📝 Loading TodoView component directly`);
				vibeComponent = TodoView;
				loadingComponent = false;
				componentError = '';
				return;
			} else if (vibeComponentName === 'CounterView') {
				console.log(`🔢 Loading CounterView component directly`);
				vibeComponent = CounterView;
				loadingComponent = false;
				componentError = '';
				return;
			}

			console.log(`🧩 Loading component dynamically: ${vibeComponentName}`);
			loadingComponent = true;
			componentError = '';

			loadVibeComponent(vibeComponentName)
				.then((component) => {
					console.log(`✅ Successfully loaded component: ${vibeComponentName}`);
					vibeComponent = component;
					loadingComponent = false;
				})
				.catch((error) => {
					console.error(`❌ Failed to load component: ${vibeComponentName}`, error);
					componentError = `Failed to load component: ${error.message}`;
					loadingComponent = false;
				});
		} catch (error) {
			console.error('Error in loadComponentUI:', error);
			componentError = `Error in loadComponentUI: ${error}`;
			loadingComponent = false;
		}
	}

	// Function to set up vibe configuration dynamically from manifest
	async function setupVibeConfig(vibe: ExtendedVibeManifest) {
		// Reset vibe-specific state
		vibeSkills = [];
		agentTools = {};

		// Set component name from the vibe manifest
		if (vibe.view) {
			vibeComponentName = vibe.view;
			console.log(`📋 Using view from manifest: ${vibeComponentName}`);
		} else {
			// Fallback to capitalized vibe name + "View" if no view specified
			vibeComponentName = `${vibe.name.charAt(0).toUpperCase() + vibe.name.slice(1)}View`;
			console.log(`⚠️ No view specified in manifest, using default: ${vibeComponentName}`);
		}

		// Set up vibe tools from manifest
		if (Array.isArray(vibe.vibeTools)) {
			vibeSkills = vibe.vibeTools.map((toolName) => ({ name: toolName }));
			console.log(`🛠️ Loaded ${vibeSkills.length} vibe tools from manifest`);
		}

		// Set up agent tools from manifest
		if (Array.isArray(vibe.agents)) {
			for (const agent of vibe.agents) {
				if (agent.name && Array.isArray(agent.tools)) {
					agentTools[agent.name] = agent.tools.map((toolName) => ({ name: toolName }));
					console.log(`👤 Loaded ${agentTools[agent.name].length} tools for agent ${agent.name}`);
				}
			}
		}

		console.log(`✅ Configured vibe "${vibe.name}" with ${vibeComponentName} component`);
	}

	// Function to handle vibe switching
	async function switchVibe(newVibeId: string) {
		console.log(`🔄 Switching to vibe: ${newVibeId}`);
		loadingVibe = true;
		dispatch('vibeChange', { vibeId: newVibeId });

		try {
			// Clear component cache to ensure fresh loading
			clearComponentCache();
			vibeComponent = null;

			// Update active vibe name
			activeVibeName = newVibeId;

			// Initialize the vibe using the Ultravox system
			await initializeVibe(newVibeId);

			// Try to get the vibe manifest for additional info
			try {
				const vibe = await getActiveVibe(newVibeId);
				activeManifest = vibe.manifest as ExtendedVibeManifest;
				console.log(`📋 Loaded manifest for ${newVibeId} vibe:`, activeManifest);

				// Setup configuration based on manifest
				await setupVibeConfig(activeManifest);

				// Load tools data
				await loadToolData([...globalSkills, ...vibeSkills, ...Object.values(agentTools).flat()]);
			} catch (error) {
				console.error(`❌ Failed to load vibe manifest: ${error}`);
				loadingVibe = false;
				componentError = `Failed to load vibe manifest: ${error}`;
				return;
			}

			// Load component UI
			loadComponentUI();
			loadingVibe = false;
		} catch (error) {
			console.error('Error switching vibe:', error);
			loadingVibe = false;
			componentError = `Error switching vibe: ${error}`;
		}
	}

	// Function to load tool data from manifests
	async function loadToolData(toolNames: Array<{ name: string }>) {
		const uniqueToolNames = [...new Set(toolNames.map((t) => t.name))];
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
				// Set default values if manifest load fails
				console.log(`⚠️ Using default values for tool ${toolName}: ${error}`);
				skills[toolName] =
					toolName === 'createTodo'
						? 'Create a new todo item'
						: toolName === 'toggleTodo'
							? 'Mark a todo as complete or incomplete'
							: toolName === 'deleteTodo'
								? 'Delete a todo item'
								: toolName === 'createList'
									? 'Create a new todo list'
									: toolName === 'switchList'
										? 'Switch between todo lists'
										: toolName === 'switchAgent'
											? "Change who you're speaking with"
											: toolName === 'hangUp'
												? 'End the current voice call'
												: '';

				// Set default icons
				icons[toolName] =
					toolName === 'createTodo'
						? 'M12 6v6m0 0v6m0-6h6m-6 0H6'
						: toolName === 'toggleTodo'
							? 'M5 13l4 4L19 7'
							: toolName === 'deleteTodo'
								? 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
								: toolName === 'createList'
									? 'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
									: toolName === 'switchList'
										? 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4'
										: toolName === 'switchAgent'
											? 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
											: toolName === 'hangUp'
												? 'M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z'
												: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';

				// Set default colors based on tool type
				colors[toolName] =
					toolName === 'createTodo' || toolName === 'createList'
						? 'blue'
						: toolName === 'toggleTodo'
							? 'green'
							: toolName === 'deleteTodo'
								? 'red'
								: toolName === 'switchList' || toolName === 'switchAgent'
									? 'cyan'
									: toolName === 'hangUp'
										? 'rose'
										: 'amber';
			}
		}

		toolSkills = skills;
		toolIcons = icons;
		toolColors = colors;

		console.log(`📊 Loaded data for ${uniqueToolNames.length} tools`);
	}

	// Initialize the component with the provided vibe
	onMount(async () => {
		console.log(`🚀 Initializing VibeRenderer with vibe: ${initialVibeId}`);

		// Load initial global skills
		globalSkills = await getGlobalSkills();
		console.log(`📊 Loaded ${globalSkills.length} global skills`);

		// Switch to the provided vibe
		await switchVibe(initialVibeId);

		// Listen for vibe change events from the tool implementation
		window.addEventListener('ultravox-vibe-changed', async (event) => {
			// Type assertion for the event
			const vibeEvent = event as CustomEvent<{ vibeId: string }>;
			const newVibeId = vibeEvent.detail.vibeId;

			console.log(`📣 Received ultravox-vibe-changed event for: ${newVibeId}`);
			if (newVibeId !== activeVibeName) {
				console.log(`🔄 VibeRenderer received vibe change event, updating UI for: ${newVibeId}`);
				await switchVibe(newVibeId);
			}
		});
	});

	onDestroy(() => {
		// Cleanup any resources
		console.log('VibeRenderer destroyed, cleaning up resources');
		window.removeEventListener('ultravox-vibe-changed', () => {});
	});
</script>

<div class="mx-auto grid max-w-full grid-cols-1 gap-6 text-white lg:grid-cols-12 lg:px-4">
	<!-- Left sidebar for Skills -->
	<div class="relative z-10 lg:col-span-2">
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
							on:click={() => switchVibe('home')}
							class={`relative w-full rounded-lg py-2 text-sm font-medium text-white/90 transition-all ${
								activeVibeName === 'home'
									? 'bg-green-600/50 hover:bg-green-600/70'
									: 'bg-green-500/30 hover:bg-green-500/50'
							}`}
						>
							Home
							{#if activeVibeName === 'home'}
								<span class="absolute top-2.5 right-3 h-2 w-2 rounded-full bg-green-400"></span>
							{/if}
						</button>
						<button
							on:click={() => switchVibe('todos')}
							class={`relative w-full rounded-lg py-2 text-sm font-medium text-white/90 transition-all ${
								activeVibeName === 'todos'
									? 'bg-indigo-600/50 hover:bg-indigo-600/70'
									: 'bg-indigo-500/30 hover:bg-indigo-500/50'
							}`}
						>
							Todo Vibe
							{#if activeVibeName === 'todos'}
								<span class="absolute top-2.5 right-3 h-2 w-2 rounded-full bg-green-400"></span>
							{/if}
						</button>
						<button
							on:click={() => switchVibe('counter')}
							class={`relative w-full rounded-lg py-2 text-sm font-medium text-white/90 transition-all ${
								activeVibeName === 'counter'
									? 'bg-blue-600/50 hover:bg-blue-600/70'
									: 'bg-blue-500/30 hover:bg-blue-500/50'
							}`}
						>
							Counter Vibe
							{#if activeVibeName === 'counter'}
								<span class="absolute top-2.5 right-3 h-2 w-2 rounded-full bg-green-400"></span>
							{/if}
						</button>
					</div>
				{/if}
			</div>

			<!-- Skills Section -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">
					Available Skills
					{#if !loadingVibe}
						<span class="ml-2 text-sm text-white/60">
							({globalSkills.length + vibeSkills.length + Object.values(agentTools).flat().length} total)
						</span>
					{/if}
				</h3>

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
							<h4 class="mb-2 text-sm font-semibold text-white/60">
								Global Skills ({globalSkills.length})
							</h4>
							<div class="space-y-3">
								{#each globalSkills as tool}
									<div
										class="rounded-lg border border-white/5 bg-cyan-900/20 p-3 transition-colors hover:bg-white/10"
									>
										<div class="flex items-center gap-2">
											<div
												class={`rounded-full bg-${toolColors[tool.name] || 'amber'}-500/20 p-1.5`}
											>
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
														d={toolIcons[tool.name] ||
															'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}
													/>
												</svg>
											</div>
											<div class="text-xs font-medium text-white/80">{tool.name}</div>
										</div>
										<div class="mt-1 text-xs text-white/70">
											{toolSkills[tool.name] || 'No description available'}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Vibe Skills Section - Only show if there are vibe skills -->
					{#if vibeSkills.length > 0}
						<div class="mb-4">
							<h4 class="mb-2 text-sm font-semibold text-white/60">
								Vibe Skills ({vibeSkills.length})
							</h4>
							<div class="space-y-3">
								{#each vibeSkills as tool}
									<div
										class="rounded-lg border border-white/5 bg-indigo-900/20 p-3 transition-colors hover:bg-white/10"
									>
										<div class="flex items-center gap-2">
											<div
												class={`rounded-full bg-${toolColors[tool.name] || 'amber'}-500/20 p-1.5`}
											>
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
														d={toolIcons[tool.name] ||
															'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}
													/>
												</svg>
											</div>
											<div class="text-xs font-medium text-white/80">{tool.name}</div>
										</div>
										<div class="mt-1 text-xs text-white/70">
											{toolSkills[tool.name] || 'No description available'}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Only render agent sections that have tools -->
					{#each Object.entries(agentTools) as [agentName, tools]}
						{#if tools.length > 0 || ($currentAgent && agentName === $currentAgent) || (activeManifest?.defaultAgent && agentName === activeManifest.defaultAgent)}
							<div class="mt-5">
								<h4 class="mb-2 text-sm font-semibold text-white/60">
									{agentName}'s Skills ({tools.length})
								</h4>
								<div class="space-y-3">
									{#each tools as tool}
										<div
											class="rounded-lg border border-white/5 bg-white/5 p-3 transition-colors hover:bg-white/10"
										>
											<div class="flex items-center gap-2">
												<div
													class={`rounded-full bg-${toolColors[tool.name] || 'amber'}-500/20 p-1.5`}
												>
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
															d={toolIcons[tool.name] ||
																'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}
														/>
													</svg>
												</div>
												<div class="text-xs font-medium text-white/80">{tool.name}</div>
											</div>
											<div class="mt-1 text-xs text-white/70">
												{toolSkills[tool.name] || 'No description available'}
											</div>
										</div>
									{/each}

									{#if tools.length === 0}
										<p class="text-center text-xs text-white/60 italic">
											No specific tools available
										</p>
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>
		</div>
	</div>

	<!-- Main content area - Dynamically loaded vibe component -->
	<div class="relative z-10 lg:col-span-8">
		<!-- Header with vibe info -->
		<div class="mb-6 text-center">
			<h1 class="text-3xl font-bold text-white/95">
				{activeManifest?.name || activeVibeName.charAt(0).toUpperCase() + activeVibeName.slice(1)}
			</h1>
			{#if activeVibeName === 'todos' && $todoState}
				<p class="mt-2 text-white/70">
					Currently viewing <span class="font-semibold text-blue-300">{getActiveDocName()}</span>
				</p>
			{:else if activeVibeName === 'counter'}
				<p class="mt-2 text-white/70">Interactive counter component for the Counter vibe</p>
			{:else if activeVibeName === 'home'}
				<p class="mt-2 text-white/70">Choose a vibe to begin your experience</p>
			{/if}
		</div>

		{#if loadingVibe}
			<div class="flex h-64 items-center justify-center">
				<div class="flex flex-col items-center">
					<div
						class="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
					></div>
					<p class="mt-4 text-white/60">Loading {vibeComponentName} component...</p>
				</div>
			</div>
		{:else if componentError}
			<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
				<h3 class="text-lg font-bold text-red-400">Error Loading Component</h3>
				<p class="text-white/70">{componentError}</p>
			</div>
		{:else if !vibeComponent}
			<div class="py-8 text-center">
				<p class="text-white/70">No component available for {activeVibeName} vibe</p>
			</div>
		{:else if loadingComponent}
			<div class="flex h-64 items-center justify-center">
				<div class="flex flex-col items-center">
					<div
						class="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
					></div>
					<p class="mt-4 text-white/60">Loading {vibeComponentName} component...</p>
				</div>
			</div>
		{:else}
			<!-- Component UI -->
			<svelte:component
				this={vibeComponent}
				on:selectVibe={(e: VibeSelectEvent) => switchVibe(e.detail.vibeId)}
			/>
		{/if}
	</div>

	<!-- Right sidebar for activity log -->
	<div class="relative z-10 lg:col-span-2">
		<div class="sticky top-6 p-4">
			<!-- Tool Status Area -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Recent Activity</h3>
				{#if $toolState && $toolState.history && $toolState.history.length > 0}
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
