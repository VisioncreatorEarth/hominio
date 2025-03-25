<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy, setContext } from 'svelte';
	import { loroStorage } from '$lib/stores/loroStorage';
	import { loroPGLiteStorage } from '$lib/stores/loroPGLiteStorage';
	import { LoroDoc } from 'loro-crdt';
	import { generateShortUUID } from '$lib/utils/uuid';
	import { startCall, endCall, type Transcript } from '$lib/ultravox/callFunctions';
	import { defaultCallConfig } from '$lib/ultravox/agents';
	import CallInterface from '$lib/components/CallInterface.svelte';

	// Disable Server-Side Rendering since Tauri is client-only
	export const ssr = false;

	// Context keys
	const LORO_STORAGE_KEY = 'loro-storage';
	const LORO_DOCS_KEY = 'loro-docs';
	const STORAGE_INFO_KEY = 'storage-info';

	// Constants
	const MAX_INIT_ATTEMPTS = 5;

	// Global state - use let for variables we need to update
	let isInitializing = $state(false);
	let initAttempts = $state(0);
	let activeDocumentsCount = $state(0);
	let clientId = $state(generateShortUUID());
	let isStorageInitialized = $state(false);
	let isCallActive = $state(false);
	let callStatus = $state<string>('off');
	let transcripts = $state<Transcript[]>([]);

	// Loro document registry
	let loroDocsRegistry = $state<Record<string, { doc: LoroDoc }>>({});

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
			// Use the centralized configuration with the correct firstSpeaker value
			const callConfig = {
				...defaultCallConfig,
				// Ensure firstSpeaker is properly set, don't remove it
				firstSpeaker: 'FIRST_SPEAKER_USER'
			};

			await startCall(
				{
					onStatusChange: (status) => {
						callStatus = status || 'unknown';
						isCallActive =
							status !== 'disconnected' && status !== 'call_ended' && status !== 'error';

						// Log status changes but don't try to register tools here
						if (isCallActive) {
							console.log('📱 Call is now active with status:', status);
						}
					},
					onTranscriptChange: (newTranscripts) => {
						if (newTranscripts) {
							transcripts = [...newTranscripts];
						}
					}
				},
				callConfig
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

	// Initialize storage
	async function initializeStorage() {
		if (isInitializing) {
			return false;
		}

		isInitializing = true;
		initAttempts++;

		try {
			// Direct call to initialize the storage system
			await loroPGLiteStorage.initialize();

			// Update storage state after initialization
			isStorageInitialized = true;

			// Set the client ID for identification
			if (typeof window !== 'undefined') {
				(window as any).__CLIENT_ID = clientId;
			}

			isInitializing = false;
			return true;
		} catch (error) {
			// Update state with error information
			isStorageInitialized = false;
			console.error('Storage initialization failed:', error);

			isInitializing = false;
			return false;
		}
	}

	// Create a simple store pattern for reactivity
	function createStore<T>(initialValue: T) {
		const subscribers = new Set<(value: T) => void>();
		let value = initialValue;

		return {
			subscribe(callback: (value: T) => void) {
				// Call immediately with current value
				callback(value);

				// Add to subscribers
				subscribers.add(callback);

				// Return unsubscribe function
				return () => {
					subscribers.delete(callback);
				};
			},
			set(newValue: T) {
				if (value === newValue) return;
				value = newValue;

				// Notify all subscribers
				subscribers.forEach((callback) => callback(value));
			},
			update(updater: (value: T) => T) {
				this.set(updater(value));
			}
		};
	}

	// Set up effects for reactivity
	$effect(() => {
		// Update active documents count when the registry changes
		activeDocumentsCount = Object.keys(loroDocsRegistry).length;
	});

	// Create the storage info object for context
	function getStorageInfo() {
		return {
			isInitialized: isStorageInitialized,
			clientId
		};
	}

	// Create stores for context
	const loroDocsStore = createStore(loroDocsRegistry);
	const storageInfoStore = createStore(getStorageInfo());

	// Keep stores in sync with state
	$effect(() => {
		loroDocsStore.set(loroDocsRegistry);
	});

	// Track individual state properties to ensure reactivity
	$effect(() => {
		// Reference the state variables directly so they're tracked
		const info = {
			isInitialized: isStorageInitialized,
			clientId
		};
		storageInfoStore.set(info);
	});

	// Set context for child components
	setContext(LORO_STORAGE_KEY, loroStorage);
	setContext(LORO_DOCS_KEY, loroDocsStore);
	setContext(STORAGE_INFO_KEY, storageInfoStore);

	// Perform immediate initialization before mounting
	// This helps ensure storage is ready before child components need it
	if (typeof window !== 'undefined') {
		initializeStorage();
	}

	// Initialize on mount
	onMount(() => {
		// If storage isn't initialized yet, try again
		if (!isStorageInitialized) {
			initializeStorage().catch((error) => {
				console.error('Failed to initialize Loro storage:', error);
			});
		}

		// Make available for debugging
		(window as any).loroStorage = loroStorage;
		(window as any).loroDocsRegistry = loroDocsRegistry;

		// Setup polling to retry initialization if needed
		const checkStorageStatus = () => {
			// Retry initialization if needed
			if (!isStorageInitialized && initAttempts < MAX_INIT_ATTEMPTS && !isInitializing) {
				initializeStorage();
			}
		};

		// Poll for storage state changes
		const interval = setInterval(checkStorageStatus, 3000);

		// Return a cleanup function
		return () => {
			clearInterval(interval);
		};
	});

	// Clean up on component destruction
	onDestroy(() => {
		// Clean up registry
		loroDocsRegistry = {};

		// End any active call
		if (isCallActive) {
			handleEndCall();
		}
	});

	// Use $effect instead of $: for reactivity in Svelte 5 runes
	$effect(() => {
		if (callStatus === 'active' && typeof window !== 'undefined') {
			console.log(
				'�� Call became active - tools should already be registered in startCall function'
			);
			// No tool registration here - it's already handled in callFunctions.ts:startCall
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
			<CallInterface
				{callStatus}
				{transcripts}
				onEndCall={handleEndCall}
				notification={recentToolActivity}
			/>
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
