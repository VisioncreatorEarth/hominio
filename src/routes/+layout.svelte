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
	let storageMode = $state('not-initialized' as 'native' | 'indexeddb' | 'not-initialized');
	let dbPath = $state<string | null>(null);
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
			updateStorageState();

			isInitializing = false;
			return storageMode !== 'not-initialized';
		} catch (error) {
			// Update state with error information
			storageMode = 'not-initialized';
			dbPath = null;
			isStorageInitialized = false;

			isInitializing = false;
			return false;
		}
	}

	// Directly check current storage state from PGLite
	function updateStorageState() {
		const currentMode = loroPGLiteStorage.getStorageMode();
		const currentPath = loroPGLiteStorage.getDbPath();

		// Only update if there's a change to prevent infinite loops
		if (currentMode !== storageMode || currentPath !== dbPath) {
			storageMode = currentMode;
			dbPath = currentPath;
			isStorageInitialized = currentMode !== 'not-initialized';
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
			mode: storageMode,
			path: dbPath,
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
		initializeStorage().then((success) => {
			// Force a UI update after initialization
			updateStorageState();
		});
	}

	// Initialize on mount
	onMount(() => {
		// First, check if storage is already initialized
		updateStorageState();

		// Try initialization again if it hasn't succeeded yet
		if (storageMode === 'not-initialized') {
			initializeStorage().catch((error) => {
				console.error('Failed to initialize Loro storage:', error);
			});
		}

		// Make available for debugging
		(window as any).loroStorage = loroStorage;
		(window as any).loroDocsRegistry = loroDocsRegistry;

		// Setup polling for storage state
		const checkStorage = () => {
			updateStorageState();

			// Retry initialization if needed
			if (
				storageMode === 'not-initialized' &&
				initAttempts < MAX_INIT_ATTEMPTS &&
				!isInitializing
			) {
				initializeStorage();
			}
		};

		// Poll for storage state changes
		const interval = setInterval(checkStorage, 3000);

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
							{storageMode !== 'not-initialized' ? `${storageMode} Storage` : 'Storage Not Ready'}
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
