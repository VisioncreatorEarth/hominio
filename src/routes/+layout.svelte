<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy, setContext } from 'svelte';
	import { loroStorage } from '$lib/stores/loroStorage';
	import { loroPGLiteStorage } from '$lib/stores/loroPGLiteStorage';
	import { LoroDoc } from 'loro-crdt';
	import { generateUUID, generateShortUUID } from '$lib/utils/uuid';

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

	// Loro document registry
	let loroDocsRegistry = $state<Record<string, { doc: LoroDoc }>>({});

	// Initialize storage before setting context
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

	$effect(() => {
		storageInfoStore.set(getStorageInfo());
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
	});

	let { children } = $props();
</script>

<div class="flex h-screen bg-blue-950 text-white">
	<!-- Main Content Area -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Header with Navigation -->
		<header class="border-b border-emerald-500/20" style="background-color: #0B3156;">
			<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div class="flex h-16 items-center justify-between">
					<!-- Navigation: Left Side Links -->
					<div class="flex items-center">
						<div class="flex-shrink-0">
							<a href="/" class="flex items-center">
								<span class="text-xl font-semibold text-emerald-400">Hominio</span>
							</a>
						</div>
						<nav class="ml-10 flex items-baseline space-x-4">
							<a
								href="/todos"
								class="rounded-md px-3 py-2 text-sm font-medium text-emerald-100 transition-colors hover:bg-blue-950 hover:text-emerald-50"
							>
								Todos
							</a>
						</nav>
					</div>

					<!-- Storage Status Indicator -->
					<div class="flex items-center gap-2">
						<span
							class={`inline-block h-2 w-2 rounded-full ${isStorageInitialized ? 'bg-emerald-400' : 'bg-red-400'}`}
						></span>
						<span class="text-xs text-emerald-300">
							{isStorageInitialized ? 'Storage Ready' : 'Initializing Storage...'}
						</span>
					</div>
				</div>
			</div>
		</header>

		<!-- Main Content -->
		<main class="flex-1 overflow-auto bg-blue-950">
			<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				<!-- Slot for page content -->
				{@render children()}
			</div>
		</main>
	</div>
</div>
