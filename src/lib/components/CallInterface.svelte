<script lang="ts">
	import { onMount } from 'svelte';
	import { currentAgent } from '$lib/ultravox/agents';

	// Define AgentName type locally
	type AgentName = string;

	let { callStatus, onEndCall } = $props<{
		callStatus: string;
		onEndCall: () => void;
	}>();

	// State for visibility
	let displayedAgent = $state<AgentName>($currentAgent);
	let isInterfaceVisible = $state(true);

	// Close the entire interface
	function closeInterface() {
		isInterfaceVisible = false;
		onEndCall();
	}

	// Ensure we always display the most current agent name
	$effect(() => {
		displayedAgent = $currentAgent;
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
			<div class="flex items-center justify-between">
				<!-- Agent Info -->
				<div class="flex-1">
					<div class="flex items-center rounded-xl border border-teal-500/20 bg-teal-500/20 p-2">
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
						<div class="text-lg font-bold text-teal-100">{displayedAgent}</div>
						<span
							class="ml-auto rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white/80"
						>
							{formatStatus(callStatus)}
						</span>
					</div>
				</div>

				<!-- End Call Button -->
				<button
					class="ml-4 flex items-center justify-center rounded-xl bg-red-500/20 px-4 py-2 text-white/90 backdrop-blur-sm transition-all duration-200 hover:bg-red-500/30"
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
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
	}
</style>
