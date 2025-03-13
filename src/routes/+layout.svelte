<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy, setContext } from 'svelte';
	import { loroStorage } from '$lib/stores/loroStorage';
	import { loroPGLiteStorage } from '$lib/stores/loroPGLiteStorage';
	import { createLoroSyncService, type LoroSyncService } from '$lib/services/loroSyncService';
	import { LoroDoc } from 'loro-crdt';

	export const prerender = true;

	// Context keys
	const LORO_STORAGE_KEY = 'loro-storage';
	const LORO_DOCS_KEY = 'loro-docs';
	const LORO_SYNC_SERVICES_KEY = 'loro-sync-services';
	const STORAGE_INFO_KEY = 'storage-info';

	// Constants
	const MAX_INIT_ATTEMPTS = 5;

	// Global state - use let for variables we need to update
	let storageMode = $state('not-initialized' as 'native' | 'indexeddb' | 'not-initialized');
	let dbPath = $state<string | null>(null);
	let debugInfo = $state<string[]>([]);
	let isInitializing = $state(false);
	let initAttempts = $state(0);
	let activeDocumentsCount = $state(0);
	let clientId = $state(crypto.randomUUID().slice(0, 8));
	let lastSyncTime = $state('');
	let isStorageInitialized = $state(false);
	let isDetailsExpanded = $state(false);

	// Loro document registry
	let loroDocsRegistry = $state<
		Record<string, { doc: LoroDoc; syncService: LoroSyncService | null }>
	>({});

	// Helper function to format time
	function formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString();
	}

	// Update last sync time
	function updateLastSyncTime() {
		lastSyncTime = formatTime(Date.now());
	}

	// Toggle details panel
	function toggleDetails() {
		isDetailsExpanded = !isDetailsExpanded;
	}

	// Directly check current storage state from PGLite
	function updateStorageState() {
		const currentMode = loroPGLiteStorage.getStorageMode();
		const currentPath = loroPGLiteStorage.getDbPath();
		const currentDebugInfo = loroPGLiteStorage.getDebugInfo();

		console.log('Current storage mode directly from loroPGLiteStorage:', currentMode);

		// Only update if there's a change to prevent infinite loops
		if (currentMode !== storageMode || currentPath !== dbPath) {
			storageMode = currentMode;
			dbPath = currentPath;
			debugInfo = currentDebugInfo;
			isStorageInitialized = currentMode !== 'not-initialized';
		}
	}

	// Initialize storage before setting context
	async function initializeStorage() {
		if (isInitializing) {
			console.log('Storage initialization already in progress, skipping duplicate call');
			return false;
		}

		isInitializing = true;
		initAttempts++;

		try {
			console.log(`Starting storage initialization (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS})`);

			// Direct call to initialize the storage system
			await loroPGLiteStorage.initialize();

			// Update storage state after initialization
			updateStorageState();

			console.log('Storage initialization complete with mode:', storageMode);
			isInitializing = false;
			return storageMode !== 'not-initialized';
		} catch (error) {
			console.error('Failed to initialize storage:', error);

			// Update state with error information
			storageMode = 'not-initialized';
			dbPath = null;
			debugInfo = [`Error: ${error instanceof Error ? error.message : String(error)}`];
			isStorageInitialized = false;

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

	// Initialize a sync service for a Loro document
	function initSyncService(docId: string, loroDoc: LoroDoc): LoroSyncService {
		const syncClientId = crypto.randomUUID();
		console.log(`Creating sync service for ${docId} with client ${syncClientId}`);

		// Create the sync service with auto-start
		const syncService = createLoroSyncService(docId, loroDoc, {
			clientId: syncClientId,
			autoStart: true,
			syncIntervalMs: 1000
		});

		// Set up event handler for sync status updates
		syncService.addEventListener((event) => {
			console.log('Layout received sync event:', event);

			if (event.type === 'status-change' && event.status === 'success') {
				updateLastSyncTime();
			}
			if (event.type === 'sync-complete') {
				updateLastSyncTime();
			}
		});

		// Update the loro docs registry
		loroDocsRegistry = {
			...loroDocsRegistry,
			[docId]: {
				doc: loroDoc,
				syncService
			}
		};

		return syncService;
	}

	// Set up effects for reactivity
	$effect(() => {
		// Update active documents count when the registry changes
		activeDocumentsCount = Object.keys(loroDocsRegistry).length;

		// Debug logging
		console.log('Active documents updated:', activeDocumentsCount);
		console.log('Document registry currently contains:', Object.keys(loroDocsRegistry));
	});

	// Create the storage info object for context
	function getStorageInfo() {
		return {
			mode: storageMode,
			path: dbPath,
			debugInfo,
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
	setContext(LORO_SYNC_SERVICES_KEY, {
		createSyncService: initSyncService
	});
	setContext(STORAGE_INFO_KEY, storageInfoStore);

	// Perform immediate initialization before mounting
	// This helps ensure storage is ready before child components need it
	if (typeof window !== 'undefined') {
		console.log('Running immediate initialization');
		initializeStorage().then((success) => {
			console.log('Immediate initialization result:', success);
			// Force a UI update after initialization
			updateStorageState();
		});
	}

	// Initialize on mount
	onMount(async () => {
		try {
			// First, check if storage is already initialized
			updateStorageState();

			// Try initialization again if it hasn't succeeded yet
			if (storageMode === 'not-initialized') {
				console.log('Storage not initialized during mount, retrying');
				await initializeStorage();
			}

			// Initial sync time
			updateLastSyncTime();

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
					console.log(
						`Retrying storage initialization (attempt ${initAttempts + 1}/${MAX_INIT_ATTEMPTS})`
					);
					initializeStorage();
				}
			};

			// Poll for storage state changes
			const interval = setInterval(checkStorage, 500);

			return () => {
				clearInterval(interval);
			};
		} catch (error) {
			console.error('Failed to initialize Loro storage:', error);
		}
	});

	// Clean up on component destruction
	onDestroy(() => {
		// Clean up any sync services
		for (const { syncService } of Object.values(loroDocsRegistry)) {
			if (syncService) {
				syncService.stopSync();
			}
		}
		loroDocsRegistry = {};
	});

	let { children } = $props();
</script>

<div class="flex h-screen flex-col bg-blue-950 text-white">
	<!-- Header with Navigation and Status Bar -->
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
							href="/"
							class="rounded-md px-3 py-2 text-sm font-medium text-emerald-100 transition-colors hover:bg-blue-950 hover:text-emerald-50"
						>
							Home
						</a>
						<a
							href="/todos"
							class="rounded-md px-3 py-2 text-sm font-medium text-emerald-100 transition-colors hover:bg-blue-950 hover:text-emerald-50"
						>
							Todos
						</a>
					</nav>
				</div>

				<!-- Status Bar: Right Side Info -->
				<div class="flex items-center space-x-4">
					<!-- Storage Status Indicator -->
					<div class="flex items-center gap-2">
						<span
							class="inline-block h-2 w-2 rounded-full"
							class:bg-emerald-400={isStorageInitialized}
							class:bg-red-400={!isStorageInitialized}
						></span>
						<span class="text-xs text-emerald-300">
							{activeDocumentsCount} active docs
						</span>
					</div>

					<!-- Collapsible Status Indicator -->
					<button
						class="flex items-center gap-1 rounded px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-blue-950 hover:text-emerald-300"
						on:click={toggleDetails}
					>
						<span>{isDetailsExpanded ? 'Hide' : 'Show'} Details</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 transition-transform duration-300"
							class:rotate-180={isDetailsExpanded}
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
				</div>
			</div>
		</div>
	</header>

	<!-- Collapsible Details Panel -->
	{#if isDetailsExpanded}
		<div
			class="w-full overflow-hidden border-b border-emerald-500/20 backdrop-blur-md transition-all duration-300"
			style="background-color: rgba(11, 49, 86, 0.8);"
		>
			<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
					<!-- Storage Information Column -->
					<div
						class="rounded-lg border border-emerald-500/20 p-4"
						style="background-color: #184169;"
					>
						<h3 class="mb-3 text-lg font-medium text-emerald-400">Storage Details</h3>

						<div class="space-y-3">
							<!-- Storage Mode -->
							<div class="flex items-start gap-2">
								<div class="mt-1">
									<span
										class="inline-block h-2 w-2 rounded-full"
										class:bg-emerald-400={isStorageInitialized}
										class:bg-red-400={!isStorageInitialized}
									></span>
								</div>
								<div>
									<div class="font-medium text-emerald-300">
										{isStorageInitialized ? `${storageMode} Storage` : 'Storage Not Ready'}
									</div>
									{#if dbPath}
										<div class="mt-1 font-mono text-xs break-all text-emerald-100/60">{dbPath}</div>
									{:else if storageMode === 'indexeddb'}
										<div class="mt-1 text-xs text-emerald-100/60">Browser IndexedDB Storage</div>
									{:else if !isStorageInitialized}
										<div class="mt-1 text-xs text-red-300/60">
											Storage initialization failed or in progress
										</div>
									{/if}
								</div>
							</div>

							<!-- Init attempts -->
							<div class="text-xs text-emerald-100/60">
								Initialization attempts: {initAttempts}/{MAX_INIT_ATTEMPTS}
							</div>
						</div>
					</div>

					<!-- Synchronization Information Column -->
					<div
						class="rounded-lg border border-emerald-500/20 p-4"
						style="background-color: #184169;"
					>
						<h3 class="mb-3 text-lg font-medium text-emerald-400">Sync Details</h3>

						<div class="space-y-3">
							<!-- Client ID -->
							<div class="flex items-start gap-2">
								<div class="mt-1">
									<span class="inline-block h-2 w-2 rounded-full bg-blue-400"></span>
								</div>
								<div>
									<div class="font-medium text-emerald-300">Client ID</div>
									<div class="mt-1 font-mono text-sm text-emerald-100/80">{clientId}</div>
								</div>
							</div>

							<!-- Active Documents -->
							<div class="flex items-start gap-2">
								<div class="mt-1">
									<span class="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
								</div>
								<div>
									<div class="font-medium text-emerald-300">Active Documents</div>
									<div class="mt-1 text-sm text-emerald-100/80">
										{activeDocumentsCount} document(s) in memory
									</div>
									{#if Object.keys(loroDocsRegistry).length > 0}
										<div class="mt-1 text-xs text-emerald-100/60">
											Documents: {Object.keys(loroDocsRegistry).join(', ')}
										</div>
									{/if}
								</div>
							</div>

							<!-- Last Sync Time -->
							<div class="flex items-start gap-2">
								<div class="mt-1">
									<span class="inline-block h-2 w-2 rounded-full bg-green-400"></span>
								</div>
								<div>
									<div class="font-medium text-emerald-300">Last Synchronized</div>
									<div class="mt-1 text-sm text-emerald-100/80">
										{lastSyncTime ? lastSyncTime : 'Not synced yet'}
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Debug Information Column -->
					<div
						class="rounded-lg border border-emerald-500/20 p-4"
						style="background-color: #184169;"
					>
						<h3 class="mb-3 text-lg font-medium text-emerald-400">Debug Information</h3>

						{#if debugInfo.length > 0}
							<div class="max-h-40 overflow-y-auto rounded border border-blue-800 bg-blue-950 p-2">
								<pre class="font-mono text-xs whitespace-pre-wrap text-emerald-100/80">
									<code>
										{debugInfo.join('\n')}
									</code>
								</pre>
							</div>
						{:else}
							<p class="text-sm text-emerald-100/60">No debug information available</p>
						{/if}

						<div class="mt-4 text-xs text-emerald-100/60">
							<p>
								System running in {typeof window !== 'undefined' ? 'browser' : 'server'} environment
							</p>
							<p class="mt-1">
								JavaScript CRDT using Loro-CRDT for conflict-free data synchronization
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Main Content -->
	<main class="flex-1 overflow-auto bg-blue-950">
		<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
			<!-- Slot for page content -->
			{@render children()}
		</div>
	</main>
</div>
