<script lang="ts">
	import { onMount } from 'svelte';
	import type { Transcript } from '$lib/ultravox/callFunctions';
	import { currentAgent } from '$lib/ultravox/toolImplementation';

	let {
		callStatus,
		transcripts = [],
		onMute,
		onEndCall
	} = $props<{
		callStatus: string;
		transcripts?: Transcript[];
		onMute: () => void;
		onEndCall: () => void;
	}>();

	let transcriptContainer: HTMLDivElement;
	let isMuted = $state(false);

	// Auto-scroll to bottom when new transcripts arrive
	$effect(() => {
		if (transcriptContainer && transcripts.length > 0) {
			transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
		}
	});

	function handleMute() {
		isMuted = !isMuted;
		onMute();
	}

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
						<div class="text-xl font-bold text-teal-100">{$currentAgent}</div>
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
								{transcript.speaker === 'agent' ? $currentAgent + ':' : 'You:'}
							</span>
							<p class="text-white/80">{transcript.text}</p>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Call Controls -->
			<div class="flex space-x-3">
				<button
					class={`flex flex-1 items-center justify-center rounded-xl px-4 py-3 text-white/90 backdrop-blur-sm transition-all duration-200 ${
						isMuted
							? 'bg-amber-500/20 hover:bg-amber-500/30'
							: 'bg-blue-500/20 hover:bg-blue-500/30'
					}`}
					onclick={handleMute}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-2 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						{#if isMuted}
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
								stroke-dasharray="30"
								stroke-dashoffset="0"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
							/>
						{:else}
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
							/>
						{/if}
					</svg>
					{isMuted ? 'Unmute' : 'Mute'}
				</button>
				<button
					class="flex flex-1 items-center justify-center rounded-xl bg-red-500/20 px-4 py-3 text-white/90 backdrop-blur-sm transition-all duration-200 hover:bg-red-500/30"
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
