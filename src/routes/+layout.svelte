<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy, setContext, type ComponentType } from 'svelte';
	import { get } from 'svelte/store';
	import { initializeLitClient } from '$lib/wallet/lit-connect';
	import { initializeGuardianEoaClient } from '$lib/wallet/guardian-eoa';
	import { startCall, endCall } from '$lib/ultravox/callFunctions';
	import CallInterface from '$lib/components/CallInterface.svelte';
	import { o } from '$lib/KERNEL/hominio-svelte';
	import { initializeVibe } from '$lib/ultravox';
	import { DEFAULT_CALL_CONFIG } from '$lib/ultravox/callConfig';
	import { initDocs } from '$lib/docs';
	import type { LayoutData } from './$types';
	import { type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import Modal from '$lib/components/Modal.svelte';
	import { openModal } from '$lib/wallet/modalStore';
	import Prenu from '$lib/components/PrenuModal.svelte';
	import Navbar from '$lib/components/Navbar.svelte';

	// Get the session store using o.authClient
	const sessionStore = o.authClient.useSession();

	// Provide the session store to child components via context
	setContext('sessionStore', sessionStore);

	// Provide the entire 'o' object (now including .lit and .guardianEoa stores) via context
	setContext('o', o);

	const DEFAULT_VIBE = 'home';

	let isCallActive = $state(false);
	let callStatus = $state<string>('off');
	let isVibeInitialized = $state(false);
	let signOutLoading = $state(false);

	// State for Google Sign In (moved from +page.svelte)
	let loading = $state(false);
	let error = $state<string | null>(null);

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

	// Handle Google Sign In (moved from +page.svelte)
	async function handleGoogleSignIn() {
		loading = true;
		error = null;
		try {
			const result = await o.authClient.signIn.social({
				provider: 'google'
			});
			if (result.error) {
				throw new Error(result.error.message || 'Failed to sign in with Google');
			}
			// Successful sign-in will update the sessionStore, triggering UI change
		} catch (err) {
			console.error('Google sign in error:', err);
			error = err instanceof Error ? err.message : 'Failed to sign in with Google';
		} finally {
			loading = false;
		}
	}

	// Function to open the person creation modal
	function showModal() {
		// Open Prenu.svelte - it fetches its own schema IDs
		openModal(Prenu as unknown as ComponentType, {}); // Cast via unknown
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
			await o.authClient.signOut();
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

		// Initialize Lit Client
		try {
			console.log('[Layout] Initializing Lit Client...');
			const client = await initializeLitClient();
			o.lit.client.set(client);
			console.log('[Layout] Lit Client initialized and set in store.');
		} catch (err: unknown) {
			console.error('[Layout] Failed to initialize Lit Client:', err);
			o.lit.client.set(null); // Ensure store is null on error
			if (err instanceof Error) {
				// Example: o.notifyGlobalError(`Lit Client Error: ${err.message}`);
			} else {
				// Example: o.notifyGlobalError('An unknown error occurred initializing Lit Client.');
			}
		}

		// Initialize EOA Guardian Wallet Client
		try {
			console.log('[Layout] Initializing EOA Guardian Wallet Client...');
			initializeGuardianEoaClient(); // This function sets up the client and listeners
			console.log('[Layout] EOA Guardian Wallet Client initialization process started.');
		} catch (err: unknown) {
			console.error('[Layout] Failed to initialize EOA Guardian Wallet Client:', err);
			if (err instanceof Error) {
				// Example: o.notifyGlobalError(`EOA Wallet Init Error: ${err.message}`);
			} else {
				// Example: o.notifyGlobalError('An unknown error occurred initializing EOA Wallet.');
			}
		}
	});

	onDestroy(async () => {
		if (isCallActive) {
			await handleEndCall();
		}

		// Disconnect Lit Client
		// Use get(litClientStore) to get the current value non-reactively for cleanup
		const currentLitClient = get(o.lit.client);
		if (currentLitClient && currentLitClient.ready) {
			try {
				await currentLitClient.disconnect();
				console.log('[Layout] Disconnected from Lit Network.');
			} catch (error) {
				console.error('[Layout] Error disconnecting from Lit Network:', error);
			}
		}
	});

	// --- Props ---
	// Receive data from +layout.server.ts (contains initial session)
	let { children } = $props<{ children: Snippet; data: LayoutData }>();
</script>

<svelte:head>
	<title>Hominio</title>
	<meta
		name="description"
		content="Create, manage, and monetize your AI twin with Hominio. Explore vibes, data pots, and a revolutionary marketplace."
	/>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div
	class="font-ibm-plex-sans bg-linen text-prussian-blue relative min-h-screen w-full overflow-hidden"
>
	<Navbar />

	<div class="relative z-10 flex h-screen flex-col">
		<main class="flex-1 overflow-auto">
			<div class="mx-auto w-full">
				{@render children()}
			</div>
		</main>

		<div class="fixed bottom-0 left-1/2 z-50 mb-4 -translate-x-1/2">
			{#if $sessionStore.data?.user}
				<!-- Logged In: Show Hominio Logo Button (only if call not active) -->
				{#if !isCallActive}
					<button
						class="flex h-12 w-12 transform items-center justify-center rounded-full bg-white/20 shadow-2xl shadow-black/50 transition-all duration-300 hover:scale-105 hover:bg-white/30 focus:outline-none"
						onclick={toggleCall}
					>
						<img src="/logo-button.png" alt="o" />
					</button>
				{/if}
			{:else}
				<!-- Logged Out: Show Google Sign In Button -->
				<div class="flex flex-col items-center">
					<button
						onclick={handleGoogleSignIn}
						disabled={loading}
						class="inline-flex items-center justify-center gap-2 rounded-full border border-transparent bg-[#1a365d] px-5 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-[#174C6B] hover:text-white disabled:opacity-50"
					>
						<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
								fill="#4285F4"
							/>
							<path
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
								fill="#34A853"
							/>
							<path
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
								fill="#FBBC05"
							/>
							<path
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
								fill="#EA4335"
							/>
						</svg>
						{loading ? 'Processing...' : 'Continue with Google'}
					</button>
					{#if error}
						<p class="mt-2 text-xs text-red-400">Error: {error}</p>
					{/if}
				</div>
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

			<!-- Example Modal Trigger Button (Bottom Left) -->
			<!-- REMOVED the button that manually opened Prenu modal -->
			<!-- 
            <button
                onclick={showModal}
                class="fixed bottom-4 left-4 z-50 rounded-full border border-gray-300 bg-white/80 px-4 py-2 text-xs text-gray-700 shadow-lg backdrop-blur-sm transition-colors hover:bg-gray-100"
                title="Open Example Modal"
            >
                Modal
            </button> 
            -->
		{/if}

		{#if isCallActive}
			<CallInterface {callStatus} onEndCall={handleEndCall} />
		{/if}

		<!-- Render the Modal component here -->
		<Modal />
	</div>
</div>
