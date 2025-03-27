<script lang="ts">
	import { onMount } from 'svelte';
	import type { Transcript } from '$lib/ultravox/callFunctions';
	import { currentAgent, type AgentName } from '$lib/ultravox/agents';
	import { fade } from 'svelte/transition';
	import { toolState } from '$lib/ultravox/todoStore';

	let {
		callStatus,
		transcripts = [],
		onEndCall
	} = $props<{
		callStatus: string;
		transcripts?: Transcript[];
		onEndCall: () => void;
	}>();

	// State for visibility
	let activeTab = $state('activity'); // 'activity' or 'transcript'
	let isTabsVisible = $state(false);
	let transcriptContainer: HTMLDivElement;
	let displayedAgent = $state<AgentName>($currentAgent);
	let isInterfaceVisible = $state(true);

	// Close the entire interface
	function closeInterface() {
		isInterfaceVisible = false;
		onEndCall();
	}

	// Toggle tabs visibility
	function toggleTabs() {
		isTabsVisible = !isTabsVisible;

		// If opening and transcript tab is active, scroll to bottom on next tick
		if (isTabsVisible && activeTab === 'transcript') {
			setTimeout(() => {
				if (transcriptContainer && transcripts.length > 0) {
					transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
				}
			}, 0);
		}
	}

	// Switch between tabs
	function switchTab(tab: 'activity' | 'transcript') {
		activeTab = tab;
		if (tab === 'transcript' && transcriptContainer && transcripts.length > 0) {
			setTimeout(() => {
				transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
			}, 0);
		}
	}

	// Ensure we always display the most current agent name
	$effect(() => {
		displayedAgent = $currentAgent;
	});

	// Auto-scroll to bottom when new transcripts arrive
	$effect(() => {
		if (
			isTabsVisible &&
			activeTab === 'transcript' &&
			transcriptContainer &&
			transcripts.length > 0
		) {
			transcriptContainer.scrollTop = transcriptContainer.scrollHeight;

			// Add highlight animation to the newest message
			if (transcripts.length > 0) {
				setTimeout(() => {
					const elements = transcriptContainer.querySelectorAll('.transcript-message');
					if (elements.length > 0) {
						const lastElement = elements[elements.length - 1];
						lastElement.classList.add('highlight-new');

						// Remove the highlight after animation completes
						setTimeout(() => {
							lastElement.classList.remove('highlight-new');
						}, 2000);
					}
				}, 100);
			}
		}
	});

	// Setup event listeners and ensure audio is always unmuted
	onMount(() => {
		// Access Ultravox session if available
		if (typeof window !== 'undefined' && (window as any).__ULTRAVOX_SESSION) {
			const uvSession = (window as any).__ULTRAVOX_SESSION;

			// Ensure speaker is not muted
			if (uvSession.isSpeakerMuted) {
				console.log('🔊 Forcibly unmuting speaker');
				uvSession.unmuteSpeaker();
			}

			// Listen for stage changes to update the agent display
			uvSession.addEventListener('stage_change', (evt: Event) => {
				console.log('🎭 Stage change detected in CallInterface');

				const stageChangeEvent = evt as unknown as {
					detail?: {
						stageId?: string;
						voiceId?: string;
						systemPrompt?: string;
					};
				};

				if (stageChangeEvent?.detail?.systemPrompt) {
					// Extract agent name from system prompt
					const systemPrompt = stageChangeEvent.detail.systemPrompt;
					const agentMatch = systemPrompt.match(/You are now ([A-Za-z]+),/i);

					if (agentMatch && agentMatch[1]) {
						console.log(`🎭 Detected new agent from stage change: ${agentMatch[1]}`);
						// Update displayed agent - cast to AgentName
						const newAgent = agentMatch[1] as AgentName;
						displayedAgent = newAgent;
					}
				}
			});
		}
	});

	// Format call status for display
	function formatStatus(status: string): string {
		switch (status) {
			case 'connecting':
				return 'Connecting...';
			case 'connected':
				return 'Connected';
			case 'disconnected':
				return 'Disconnected';
			case 'call_ended':
				return 'Call Ended';
			case 'error':
				return 'Error';
			default:
				return status;
		}
	}
</script>

{#if isInterfaceVisible}
	<div class="fixed inset-x-0 bottom-0 z-40 flex justify-center">
		<div
			class="w-full max-w-md rounded-2xl border border-white/5 bg-white/10 p-4 shadow-xl backdrop-blur-md dark:bg-slate-900/20"
		>
			<!-- Tabs Panel (Shown when toggled) -->
			{#if isTabsVisible}
				<div
					class="animate-in fade-in slide-in-from-bottom-4 absolute right-0 bottom-full left-0 mb-2 max-h-48 w-full overflow-y-auto rounded-xl border border-white/5 bg-white/15 p-5 shadow-xl backdrop-blur-md dark:bg-slate-900/30"
				>
					<!-- Tab Navigation -->
					<div class="mb-4 flex space-x-4 border-b border-white/10">
						<button
							class={`pb-2 text-sm font-medium transition-all ${
								activeTab === 'activity'
									? 'border-b-2 border-indigo-500 text-white'
									: 'text-white/60 hover:text-white'
							}`}
							on:click={() => switchTab('activity')}
						>
							Activity Stream
						</button>
						<button
							class={`pb-2 text-sm font-medium transition-all ${
								activeTab === 'transcript'
									? 'border-b-2 border-indigo-500 text-white'
									: 'text-white/60 hover:text-white'
							}`}
							on:click={() => switchTab('transcript')}
						>
							Transcript
						</button>
					</div>

					<!-- Tab Content -->
					{#if activeTab === 'activity'}
						<div class="space-y-3">
							{#if $toolState && $toolState.history && $toolState.history.length > 0}
								{#each $toolState.history as entry}
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
														d={entry.action === 'create'
															? 'M12 6v6m0 0v6m0-6h6m-6 0H6'
															: entry.action === 'toggle'
																? 'M5 13l4 4L19 7'
																: entry.action === 'delete'
																	? 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
																	: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}
													/>
												</svg>
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
							{:else}
								<p class="text-center text-sm text-white/60">No activity recorded yet</p>
							{/if}
						</div>
					{:else}
						<div bind:this={transcriptContainer}>
							{#if transcripts.length === 0}
								<p class="py-4 text-center text-white/60">Call is connecting...</p>
							{:else}
								{#each transcripts as transcript}
									<div class="transcript-message mb-3">
										<span class="text-sm font-medium text-white/90">
											{transcript.speaker === 'agent' ? displayedAgent + ':' : 'You:'}
										</span>
										<p class="text-white/80">{transcript.text}</p>
									</div>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Single row layout with 3 columns -->
			<div class="flex items-center justify-between">
				<!-- Toggle Tabs Button (Left) -->
				<button
					class="relative rounded-full bg-indigo-500/20 p-2 text-white/90 transition-all duration-200 hover:bg-indigo-500/30"
					on:click={toggleTabs}
					aria-label="Toggle tabs panel"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 text-indigo-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
						/>
					</svg>

					{#if !isTabsVisible && (transcripts.length > 0 || ($toolState?.history?.length || 0) > 0)}
						<span
							class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white"
						>
							{transcripts.length + ($toolState?.history?.length || 0)}
						</span>
					{/if}
				</button>

				<!-- Agent Info (Center) - Simplified -->
				<div class="mx-4 flex-1">
					<div
						class="flex items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/20 p-2"
					>
						<div class="mr-3 rounded-full bg-teal-500/30 p-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 text-teal-300"
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
						</div>
						<div class="text-xl font-bold text-teal-100">{displayedAgent}</div>
						<span
							class="ml-auto rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white/80"
						>
							{formatStatus(callStatus)}
						</span>
					</div>
				</div>

				<!-- End Call Button (Right) -->
				<button
					class="flex items-center justify-center rounded-xl bg-red-500/20 px-4 py-2 text-white/90 backdrop-blur-sm transition-all duration-200 hover:bg-red-500/30"
					on:click={closeInterface}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-2 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M16 8l4 4m0 0l-4 4m4-4H3"
						/>
					</svg>
					End
				</button>
			</div>
		</div>
	</div>
{/if}

<style lang="postcss">
	/* Add a custom scrollbar for the transcript container */
	div::-webkit-scrollbar {
		width: 6px;
	}

	div::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 10px;
	}

	div::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 10px;
	}

	div::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	/* Highlight animation for new messages */
	.highlight-new {
		animation: highlight-pulse 2s ease-in-out;
	}

	@keyframes highlight-pulse {
		0% {
			background-color: rgba(99, 102, 241, 0.1);
		}
		50% {
			background-color: rgba(99, 102, 241, 0.2);
		}
		100% {
			background-color: transparent;
		}
	}
</style>
