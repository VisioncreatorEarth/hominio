<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy, setContext } from 'svelte';
	import { startCall, endCall } from '$lib/ultravox/callFunctions';
	import CallInterface from '$lib/components/CallInterface.svelte';
	import { authClient, getMe } from '$lib/KERNEL/hominio-auth';
	import { initializeVibe } from '$lib/ultravox';
	import { DEFAULT_CALL_CONFIG } from '$lib/ultravox/callConfig';
	import { initDocs } from '$lib/docs';
	import type { LayoutData } from './$types';
	import { type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { hominioIndexing } from '$lib/KERNEL/hominio-indexing';

	// Get the session store from the auth client
	const sessionStore = authClient.useSession();

	// Provide the session store to child components via context
	setContext('sessionStore', sessionStore);

	// Provide the effective user utility via context
	setContext('getMe', getMe);

	const DEFAULT_VIBE = 'home';

	let isCallActive = $state(false);
	let callStatus = $state<string>('off');
	let isVibeInitialized = $state(false);
	let signOutLoading = $state(false);

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
				// Ensure we're initializing the correct vibe that exists in the system
				await initializeVibe(DEFAULT_VIBE);
				isVibeInitialized = true;
				console.log(`✅ Vibe "${DEFAULT_VIBE}" initialization complete`);
			}
		} catch (error) {
			console.error(`❌ Failed to initialize vibe "${DEFAULT_VIBE}":`, error);
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
			isCallActive = true;
			callStatus = 'starting';
			console.log('🟢 Starting call...');

			// Define callbacks for the call
			const callbacks = {
				onStatusChange: (status: string | undefined) => {
					callStatus = status || 'unknown';
				}
			};

			// Call with the required parameters
			await startCall(callbacks, DEFAULT_CALL_CONFIG, DEFAULT_VIBE);
		} catch (error) {
			console.error('❌ Call start error:', error);
			callStatus = 'error';
		}
	}

	// Handle ending a call
	async function handleEndCall() {
		try {
			callStatus = 'ending';
			console.log('🔴 Ending call...');
			await endCall();
			isCallActive = false;
			callStatus = 'off';
		} catch (error) {
			console.error('❌ Call end error:', error);
			callStatus = 'error';
		}
	}

	// --- Sign Out Logic ---
	async function handleSignOut() {
		signOutLoading = true;
		try {
			await authClient.signOut();
			goto('/');
		} catch (error) {
			console.error('Sign out error:', error);
		} finally {
			signOutLoading = false;
		}
	}
	// --- End Sign Out Logic ---

	onMount(async () => {
		await initDocs();
		await initVibe();
		console.log(
			'[Layout] Mounted. HominioDB and HominioIndexing singletons initialized via import.'
		);
	});

	onDestroy(async () => {
		if (isCallActive) {
			await handleEndCall();
		}
		// Optionally destroy indexing service if needed?
		// hominioIndexing.destroy();
	});

	// --- Props ---
	// Receive data from +layout.server.ts (contains initial session)
	let { children, data } = $props<{ children: Snippet; data: LayoutData }>();
</script>

<div class="relative min-h-screen w-full overflow-hidden bg-cover bg-center text-white">
	<div
		class="absolute inset-0 bg-gradient-to-b from-blue-950/70 to-indigo-950/70 backdrop-blur-[2px]"
	></div>

	<div class="absolute top-20 right-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl"></div>
	<div class="absolute bottom-40 left-20 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl"></div>

	<div class="relative z-10 flex h-screen flex-col">
		<main class="flex-1 overflow-auto">
			<div class="mx-auto w-full">
				{@render children()}
			</div>
		</main>

		<div class="fixed bottom-0 left-1/2 z-50 mb-4 -translate-x-1/2">
			{#if !isCallActive}
				<button
					class="flex h-12 w-12 transform items-center justify-center rounded-full bg-white/20 shadow-2xl shadow-black/50 transition-all duration-300 hover:scale-105 hover:bg-white/30 focus:outline-none"
					onclick={toggleCall}
				>
					<img src="logo-button.png" alt="o" />
				</button>
			{/if}
		</div>

		{#if $sessionStore.data?.user}
			<button
				onclick={handleSignOut}
				disabled={signOutLoading}
				class="fixed right-4 bottom-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-700 disabled:opacity-50"
				title="Sign out"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
					/>
				</svg>
			</button>
		{/if}

		{#if isCallActive}
			<CallInterface {callStatus} onEndCall={handleEndCall} />
		{/if}
	</div>
</div>
