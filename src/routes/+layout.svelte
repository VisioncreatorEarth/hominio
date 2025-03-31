<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy } from 'svelte';
	import { startCall, endCall } from '$lib/ultravox/callFunctions';
	import CallInterface from '$lib/components/CallInterface.svelte';
	import { initializeVibe, getActiveVibe } from '$lib/ultravox';
	import { DEFAULT_CALL_CONFIG } from '$lib/ultravox/callConfig';
	import { initDocs } from '$lib/docs';

	// Disable Server-Side Rendering since Tauri is client-only
	export const ssr = false;

	const DEFAULT_VIBE = 'home';

	let isCallActive = $state(false);
	let callStatus = $state<string>('off');
	let transcripts = $state<any[]>([]);
	let isVibeInitialized = $state(false);

	// Global state for notifications
	let recentToolActivity = $state<{ action: string; message: string; timestamp: number } | null>(
		null
	);

	// Use effect to monitor window.__recentToolActivity for changes
	$effect(() => {
		if (typeof window !== 'undefined') {
			// Set up interval to check for notifications
			const checkInterval = setInterval(() => {
				const windowActivity = (window as any).__recentToolActivity;
				if (windowActivity) {
					recentToolActivity = windowActivity;
				}
			}, 300);

			// Clear interval on cleanup
			return () => clearInterval(checkInterval);
		}
	});

	// Initialize vibe
	async function initVibe() {
		try {
			if (!isVibeInitialized) {
				await initializeVibe(DEFAULT_VIBE);
				isVibeInitialized = true;
			}
		} catch (error) {
			console.error('❌ Failed to initialize vibe:', error);
		}
	}

	// Toggle modal state
	async function toggleCall() {
		if (isCallActive) {
			await handleEndCall();
		} else {
			await handleStartCall();
		}
	}

	// Handle starting a call
	async function handleStartCall() {
		try {
			// Make sure vibe is initialized
			if (!isVibeInitialized) {
				await initVibe();
			}

			// Get active vibe configuration
			const vibe = await getActiveVibe(DEFAULT_VIBE);

			// Wait for DOM to be fully rendered
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Use the default config - vibe-specific properties will be added in createCall
			await startCall(
				{
					onStatusChange: (status) => {
						callStatus = status || 'unknown';
						isCallActive =
							status !== 'disconnected' && status !== 'call_ended' && status !== 'error';

						if (isCallActive) {
						}
					},
					onTranscriptChange: (newTranscripts) => {
						if (newTranscripts) {
							transcripts = [...newTranscripts];
						}
					}
				},
				DEFAULT_CALL_CONFIG,
				DEFAULT_VIBE
			);
		} catch (error) {
			console.error('Failed to start call:', error);
		}
	}

	// Handle ending a call
	async function handleEndCall() {
		try {
			await endCall();
			isCallActive = false;
			callStatus = 'off';
			transcripts = [];
		} catch (error) {
			console.error('Failed to end call:', error);
		}
	}

	// This helps ensure storage is ready before child components need it
	if (typeof window !== 'undefined') {
		initVibe(); // Initialize vibe as well
	}

	// Initialize on mount
	onMount(() => {
		// If vibe isn't initialized, try to initialize it
		if (!isVibeInitialized) {
			initVibe().catch((error) => {
				console.error('Failed to initialize vibe:', error);
			});
		}
	});

	// Clean up on component destruction
	onDestroy(() => {
		// Clean up registry

		// End any active call
		if (isCallActive) {
			handleEndCall();
		}
	});

	// Initialize docs system
	onMount(async () => {
		try {
			await initDocs();
		} catch (error) {
			console.error('Failed to initialize docs system:', error);
		}
	});

	let { children } = $props();
</script>

<div
	class="relative min-h-screen w-full overflow-hidden bg-cover bg-center text-white"
	style="background-image: url('/bg.jpg');"
>
	<!-- Overlay gradient - reduced opacity -->
	<div
		class="absolute inset-0 bg-gradient-to-b from-blue-950/70 to-indigo-950/70 backdrop-blur-[2px]"
	></div>

	<!-- Background circles/shapes for design - increased transparency -->
	<div class="absolute top-20 right-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl"></div>
	<div class="absolute bottom-40 left-20 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl"></div>

	<!-- Main Content Container -->
	<div class="relative z-10 flex h-screen flex-col">
		<!-- Main Content -->
		<main class="flex-1 overflow-auto">
			<div class="mx-auto w-full">
				<!-- Slot for page content -->
				{@render children()}
			</div>
		</main>

		<!-- Centered Logo Button - more transparent -->
		<div class="fixed bottom-0 left-1/2 z-50 -translate-x-1/2">
			{#if !isCallActive}
				<button
					class="flex h-16 w-16 transform items-center justify-center rounded-full bg-white/5 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/10 focus:outline-none"
					onclick={toggleCall}
				>
					<div class="h-12 w-12 overflow-hidden rounded-full bg-white/5 p-1">
						<img src="/logo.png" alt="Hominio Logo" class="h-full w-full object-cover" />
					</div>
				</button>
			{/if}
		</div>

		<!-- Call Interface - When Call is Active -->
		{#if isCallActive}
			<CallInterface {callStatus} {transcripts} onEndCall={handleEndCall} />
		{/if}
	</div>
</div>

<style lang="postcss">
	:global(body) {
		margin: 0;
		padding: 0;
		font-family:
			'Inter',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			sans-serif;
		color-scheme: dark;
	}

	/* Custom scrollbar styling */
	:global(*::-webkit-scrollbar) {
		width: 6px;
	}

	:global(*::-webkit-scrollbar-track) {
		background: rgba(255, 255, 255, 0.05);
	}

	:global(*::-webkit-scrollbar-thumb) {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 10px;
	}

	:global(*::-webkit-scrollbar-thumb:hover) {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
