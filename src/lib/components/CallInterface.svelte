<script lang="ts">
	import { onMount } from 'svelte';
	import { currentAgent } from '$lib/ultravox/agents';

	// Define the Transcript interface locally since it's not exported
	interface Transcript {
		speaker: 'user' | 'agent';
		text: string;
	}

	// Define AgentName type locally since it's not exported
	type AgentName = string;

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
	let transcriptContainer = $state<HTMLDivElement | null>(null);
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
		if (tab === 'transcript' && transcripts.length > 0) {
			setTimeout(() => {
				if (transcriptContainer) {
					transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
				}
			}, 0);
		}
	}

	// Ensure we always display the most current agent name
	$effect(() => {
		displayedAgent = $currentAgent;
	});

	// Auto-scroll to bottom when new transcripts arrive
	$effect(() => {
		if (isTabsVisible && activeTab === 'transcript' && transcripts.length > 0) {
			setTimeout(() => {
				if (transcriptContainer) {
					const elements = transcriptContainer.querySelectorAll('.transcript-message');
					if (elements.length > 0) {
						const lastElement = elements[elements.length - 1];
						lastElement.classList.add('highlight-new');

						// Remove the highlight after animation completes
						setTimeout(() => {
							lastElement.classList.remove('highlight-new');
						}, 2000);
					}
					transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
				}
			}, 100);
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
	<!-- Single row layout with 3 columns -->
	<div class="fixed inset-x-0 bottom-0 z-40 flex justify-center">
		<div
			class="w-full max-w-md rounded-2xl border border-white/5 bg-white/10 p-4 shadow-xl backdrop-blur-md dark:bg-slate-900/20"
		>
			<!-- Tabs Panel (Shown when toggled) -->
			{#if isTabsVisible}
				<div
					class="animate-in fade-in slide-in-from-bottom-4 absolute right-0 bottom-full left-0 mb-2 max-h-48 w-full overflow-y-auto rounded-xl border border-white/5 bg-white/15 p-5 shadow-xl backdrop-blur-md dark:bg-slate-900/30"
				>
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
				</div>
			{/if}

			<!-- Single row layout with 3 columns -->
			<div class="flex items-center justify-between">
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
					onclick={closeInterface}
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
