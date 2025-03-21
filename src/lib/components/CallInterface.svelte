<script lang="ts">
	import { onMount } from 'svelte';
	import type { Transcript } from '$lib/ultravox/callFunctions';
	import { currentAgent } from '$lib/ultravox/toolImplementation';

	let {
		callStatus,
		transcripts = [],
		onEndCall
	} = $props<{
		callStatus: string;
		transcripts?: Transcript[];
		onEndCall: () => void;
	}>();

	let transcriptContainer: HTMLDivElement;
	let displayedAgent = $state($currentAgent);

	// Ensure we always display the most current agent name
	$effect(() => {
		displayedAgent = $currentAgent;
	});

	// Auto-scroll to bottom when new transcripts arrive
	$effect(() => {
		if (transcriptContainer && transcripts.length > 0) {
			transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
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
						// Update displayed agent
						displayedAgent = agentMatch[1];
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

<div class="fixed inset-x-0 bottom-16 z-40 flex justify-center">
	<div
		class="w-full max-w-md rounded-2xl border border-white/5 bg-white/5 p-6 shadow-xl backdrop-blur-md dark:bg-slate-900/10"
	>
		<div class="flex flex-col">
			<!-- Agent Banner -->
			<div class="mb-4 rounded-xl border border-teal-500/20 bg-teal-500/10 p-3">
				<div class="flex items-center">
					<div class="mr-3 rounded-full bg-teal-500/20 p-2">
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
					<div>
						<div class="text-xs font-medium text-teal-300/80">CURRENT AGENT</div>
						<div class="text-xl font-bold text-teal-100">{displayedAgent}</div>
					</div>
					<div class="ml-auto">
						<span class="rounded-full bg-white/5 px-3 py-1 text-sm font-medium text-white/80">
							{formatStatus(callStatus)}
						</span>
					</div>
				</div>
			</div>

			<!-- Transcripts -->
			<div
				class="mb-4 h-48 overflow-y-auto rounded-xl bg-white/5 p-4 backdrop-blur-sm dark:bg-slate-900/10"
				bind:this={transcriptContainer}
			>
				{#if transcripts.length === 0}
					<p class="py-4 text-center text-white/60">Call is connecting...</p>
				{:else}
					{#each transcripts as transcript}
						<div class="mb-3">
							<span class="text-sm font-medium text-white/90">
								{transcript.speaker === 'agent' ? displayedAgent + ':' : 'You:'}
							</span>
							<p class="text-white/80">{transcript.text}</p>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Call Controls -->
			<div class="flex justify-center">
				<button
					class="flex w-2/3 items-center justify-center rounded-xl bg-red-500/20 px-4 py-3 text-white/90 backdrop-blur-sm transition-all duration-200 hover:bg-red-500/30"
					onclick={onEndCall}
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
					End Call
				</button>
			</div>
		</div>
	</div>
</div>

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
</style>
