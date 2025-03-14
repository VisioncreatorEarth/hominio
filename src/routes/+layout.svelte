<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy, setContext } from 'svelte';
	import { loroStorage } from '$lib/stores/loroStorage';
	import { loroPGLiteStorage } from '$lib/stores/loroPGLiteStorage';
	import { createLoroSyncService, type LoroSyncService } from '$lib/services/loroSyncService';
	import { LoroDoc } from 'loro-crdt';
	import { generateUUID, generateShortUUID } from '$lib/utils/uuid';

	// Disable Server-Side Rendering since Tauri is client-only
	export const ssr = false;
	// Context keys
	const LORO_STORAGE_KEY = 'loro-storage';
	const LORO_DOCS_KEY = 'loro-docs';
	const LORO_SYNC_SERVICES_KEY = 'loro-sync-services';
	const STORAGE_INFO_KEY = 'storage-info';

	// Constants
	const MAX_INIT_ATTEMPTS = 5;
	const MAX_DEBUG_LOGS = 100; // Maximum number of logs to keep in memory

	// Global state - use let for variables we need to update
	let storageMode = $state('not-initialized' as 'native' | 'indexeddb' | 'not-initialized');
	let dbPath = $state<string | null>(null);
	let debugInfo = $state<string[]>([]);
	let isInitializing = $state(false);
	let initAttempts = $state(0);
	let activeDocumentsCount = $state(0);
	let clientId = $state(generateShortUUID());
	let lastSyncTime = $state('');
	let isStorageInitialized = $state(false);
	let isDetailsExpanded = $state(false);

	// Utility function to add logs to debug info
	function addDebugLog(source: string, message: string) {
		const timestamp = new Date().toISOString();
		const formattedMessage = `${timestamp} [${source}] ${message}`;

		// Update with a new array to ensure reactivity
		debugInfo = [...debugInfo, formattedMessage].slice(-MAX_DEBUG_LOGS);
	}

	// Override console methods to capture logs
	const originalConsoleLog = console.log;
	const originalConsoleInfo = console.info;
	const originalConsoleWarn = console.warn;
	const originalConsoleError = console.error;

	// Intercept specific console logs related to sync and storage
	console.log = (...args) => {
		originalConsoleLog(...args);
		const message = args
			.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
			.join(' ');

		// Only capture logs relevant to Loro or storage, but filter out the frequent sync status messages
		if (
			(message.includes('loro') ||
				message.includes('sync') ||
				message.includes('storage') ||
				message.includes('PGLite')) &&
			// Skip the frequent sync status changes and long poll messages
			!message.includes('Status changing from success to syncing') &&
			!message.includes('Status changing from syncing to success') &&
			!message.includes('Long poll URL:') &&
			!message.includes('Sync status for hominio-todos: syncing') &&
			!message.includes('Sync status for hominio-todos: success') &&
			!message.includes('Sync completed for hominio-todos')
		) {
			addDebugLog('Log', message);
		}
	};

	console.info = (...args) => {
		originalConsoleInfo(...args);
		const message = args
			.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
			.join(' ');

		if (
			(message.includes('loro') ||
				message.includes('sync') ||
				message.includes('storage') ||
				message.includes('PGLite')) &&
			// Skip the frequent sync status messages
			!message.includes('Status changing from success to syncing') &&
			!message.includes('Status changing from syncing to success') &&
			!message.includes('Long poll URL:') &&
			!message.includes('Sync status for hominio-todos: syncing') &&
			!message.includes('Sync status for hominio-todos: success') &&
			!message.includes('Sync completed for hominio-todos')
		) {
			addDebugLog('Info', message);
		}
	};

	console.warn = (...args) => {
		originalConsoleWarn(...args);
		const message = args
			.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
			.join(' ');

		if (
			(message.includes('loro') ||
				message.includes('sync') ||
				message.includes('storage') ||
				message.includes('PGLite')) &&
			// Skip the frequent sync status messages
			!message.includes('Status changing from success to syncing') &&
			!message.includes('Status changing from syncing to success') &&
			!message.includes('Long poll URL:') &&
			!message.includes('Sync status for hominio-todos: syncing') &&
			!message.includes('Sync status for hominio-todos: success') &&
			!message.includes('Sync completed for hominio-todos')
		) {
			addDebugLog('Warn', message);
		}
	};

	console.error = (...args) => {
		originalConsoleError(...args);
		const message = args
			.map((arg) =>
				arg instanceof Error
					? `${arg.name}: ${arg.message}`
					: typeof arg === 'object'
						? JSON.stringify(arg, null, 2)
						: String(arg)
			)
			.join(' ');

		if (
			message.includes('loro') ||
			message.includes('sync') ||
			message.includes('storage') ||
			message.includes('PGLite')
		) {
			addDebugLog('Error', message);
		}
	};

	// Loro document registry
	let loroDocsRegistry = $state<
		Record<string, { doc: LoroDoc; syncService: LoroSyncService | null }>
	>({});

	// Initialize sync service
	let syncService: LoroSyncService | null = $state(null);

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

		// Only update if there's a change to prevent infinite loops
		if (currentMode !== storageMode || currentPath !== dbPath) {
			// Only log when the state actually changes
			if (currentMode !== storageMode) {
				addDebugLog('Storage', `Storage mode changed: ${storageMode} → ${currentMode}`);
			}
			if (currentPath !== dbPath) {
				addDebugLog(
					'Storage',
					`Storage path changed: ${dbPath || 'none'} → ${currentPath || 'none'}`
				);
			}

			storageMode = currentMode;
			dbPath = currentPath;

			// Merge the PGLite debug info with our debug logs
			if (currentDebugInfo && currentDebugInfo.length > 0) {
				const uniqueNewLogs = currentDebugInfo.filter((log) => !debugInfo.includes(log));
				if (uniqueNewLogs.length > 0) {
					addDebugLog('Storage', `Adding ${uniqueNewLogs.length} new logs from PGLite`);
					debugInfo = [...debugInfo, ...uniqueNewLogs].slice(-MAX_DEBUG_LOGS);
				}
			}

			isStorageInitialized = currentMode !== 'not-initialized';

			// Log initialization status changes
			if (isStorageInitialized && currentMode !== 'not-initialized') {
				addDebugLog('Storage', `Storage is now initialized using ${currentMode} mode`);
			}
		}
	}

	// Initialize storage before setting context
	async function initializeStorage() {
		if (isInitializing) {
			return false;
		}

		isInitializing = true;
		initAttempts++;
		addDebugLog('Layout', `Initializing storage (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS})`);

		try {
			// Direct call to initialize the storage system
			await loroPGLiteStorage.initialize();
			addDebugLog('Layout', 'Storage initialization complete');

			// Update storage state after initialization
			updateStorageState();

			isInitializing = false;
			return storageMode !== 'not-initialized';
		} catch (error) {
			console.error('Failed to initialize storage:', error);

			// Update state with error information
			storageMode = 'not-initialized';
			dbPath = null;
			addDebugLog(
				'Layout',
				`Storage initialization failed: ${error instanceof Error ? error.message : String(error)}`
			);
			debugInfo = [
				...debugInfo,
				`Error: ${error instanceof Error ? error.message : String(error)}`
			];
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
		const syncClientId = generateUUID();
		addDebugLog(
			'Sync',
			`Initializing sync service for document ${docId} with client ID ${syncClientId.substring(0, 8)}...`
		);

		// Create the sync service with auto-start and longer sync interval
		const syncService = createLoroSyncService(docId, loroDoc, {
			clientId: syncClientId,
			autoStart: true,
			syncIntervalMs: 5000 // Less frequent sync attempts (5 seconds)
		});

		// Set up event handler for sync status updates
		syncService.addEventListener((event) => {
			// Only log error events and updates-received events
			// Skip the frequent success/syncing status changes and sync-complete events
			if (event.type === 'status-change') {
				// Only log errors, not the routine success/syncing status changes
				if (event.status === 'error') {
					addDebugLog('Sync', `Sync error for ${docId}: ${event.status}`);
				} else {
					// Just update the UI without logging for success status
					if (event.status === 'success') {
						updateLastSyncTime();
					}
				}
			}
			// Only log when actual updates are received, not routine sync completions
			if (event.type === 'updates-received') {
				addDebugLog('Sync', `Updates received for ${docId}`);
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
				initializeStorage();
			}
		};

		// Poll for storage state changes - reduce frequency to avoid log clutter
		const interval = setInterval(checkStorage, 3000); // Changed from 500ms to 3000ms (3 seconds)

		// Return a cleanup function
		return () => {
			clearInterval(interval);
		};
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

		// Restore original console methods
		console.log = originalConsoleLog;
		console.info = originalConsoleInfo;
		console.warn = originalConsoleWarn;
		console.error = originalConsoleError;
	});

	let { children } = $props();
</script>

<div class="flex h-screen bg-blue-950 text-white">
	<!-- Main Content Area -->
	<div class="flex flex-1 flex-col overflow-hidden">
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
								class={`inline-block h-2 w-2 rounded-full ${isStorageInitialized ? 'bg-emerald-400' : 'bg-red-400'}`}
							></span>
							<span class="text-xs text-emerald-300">
								{activeDocumentsCount} active docs
							</span>
						</div>

						<!-- Details Toggle Button -->
						<button
							type="button"
							onclick={toggleDetails}
							class="flex items-center justify-center rounded-md p-1 text-emerald-300 hover:bg-blue-950 hover:text-emerald-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
						>
							<span class="sr-only">{isDetailsExpanded ? 'Hide' : 'Show'} details</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class={`h-5 w-5 ${isDetailsExpanded ? 'rotate-180' : ''}`}
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19.5 8.25l-7.5 7.5-7.5-7.5"
								/>
							</svg>
						</button>
					</div>
				</div>
			</div>

			<!-- Collapsible Details Panel -->
			{#if isDetailsExpanded}
				<div class="border-t border-emerald-500/20 bg-[#0B3156]">
					<div class="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
						<div class="rounded-lg border border-emerald-500/30 bg-blue-900/20 p-4 shadow-lg">
							<div class="grid grid-cols-2 gap-6">
								<!-- Storage Details -->
								<div class="rounded-md bg-blue-900/30 p-4">
									<h3 class="mb-3 flex items-center text-sm font-medium text-emerald-400">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="mr-2 h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
											/>
										</svg>
										Storage Details
									</h3>
									<div class="space-y-3">
										<!-- Storage Mode -->
										<div class="flex items-start gap-3">
											<div class="mt-0.5">
												<span
													class={`shadow-glow inline-block h-3 w-3 rounded-full ${
														isStorageInitialized
															? 'bg-emerald-400 shadow-emerald-400/50'
															: 'bg-red-400 shadow-red-400/50'
													}`}
												></span>
											</div>
											<div>
												<div class="text-xs font-medium text-emerald-300">
													{isStorageInitialized ? `${storageMode} Storage` : 'Storage Not Ready'}
												</div>
												{#if dbPath}
													<div
														class="mt-1 rounded bg-blue-950/50 p-1 font-mono text-xs break-all text-emerald-100/70"
													>
														{dbPath}
													</div>
												{:else if storageMode === 'indexeddb'}
													<div class="mt-1 text-xs text-emerald-100/70">
														Browser IndexedDB Storage
													</div>
												{:else if !isStorageInitialized}
													<div class="mt-1 text-xs text-red-300/70">
														Storage initialization failed or in progress
													</div>
												{/if}
											</div>
										</div>
										<div
											class="flex items-center rounded bg-blue-950/50 p-2 text-xs text-emerald-100/70"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="mr-1 h-3 w-3"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M13 10V3L4 14h7v7l9-11h-7z"
												/>
											</svg>
											Init attempts: {initAttempts}/{MAX_INIT_ATTEMPTS}
										</div>
									</div>
								</div>

								<!-- Sync Details -->
								<div class="rounded-md bg-blue-900/30 p-4">
									<h3 class="mb-3 flex items-center text-sm font-medium text-emerald-400">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="mr-2 h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
											/>
										</svg>
										Sync Details
									</h3>
									<div class="space-y-3">
										<!-- Client ID -->
										<div class="flex items-start gap-3">
											<div class="mt-0.5">
												<span
													class="shadow-glow inline-block h-3 w-3 rounded-full bg-blue-400"
													style="box-shadow: 0 0 5px rgba(96, 165, 250, 0.5)"
												></span>
											</div>
											<div>
												<div class="text-xs font-medium text-emerald-300">Client ID</div>
												<div
													class="mt-1 rounded bg-blue-950/50 p-1 font-mono text-xs break-all text-emerald-100/80"
												>
													{clientId}
												</div>
											</div>
										</div>

										<!-- Active Documents -->
										<div class="flex items-start gap-3">
											<div class="mt-0.5">
												<span
													class="shadow-glow inline-block h-3 w-3 rounded-full bg-emerald-400"
													style="box-shadow: 0 0 5px rgba(52, 211, 153, 0.5)"
												></span>
											</div>
											<div>
												<div class="text-xs font-medium text-emerald-300">Active Documents</div>
												<div class="mt-1 rounded bg-blue-950/50 p-1 text-xs text-emerald-100/80">
													{activeDocumentsCount} document(s) in memory
												</div>
												{#if Object.keys(loroDocsRegistry).length > 0}
													<div class="mt-1 font-mono text-xs text-emerald-100/70">
														Docs: {Object.keys(loroDocsRegistry).join(', ')}
													</div>
												{/if}
											</div>
										</div>

										<!-- Last Sync Time -->
										<div class="flex items-start gap-3">
											<div class="mt-0.5">
												<span
													class="shadow-glow inline-block h-3 w-3 rounded-full bg-green-400"
													style="box-shadow: 0 0 5px rgba(74, 222, 128, 0.5)"
												></span>
											</div>
											<div>
												<div class="text-xs font-medium text-emerald-300">Last Synchronized</div>
												<div class="mt-1 rounded bg-blue-950/50 p-1 text-xs text-emerald-100/80">
													{lastSyncTime ? lastSyncTime : 'Not synced yet'}
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</header>

		<!-- Main Content -->
		<main class="flex-1 overflow-auto bg-blue-950">
			<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				<!-- Slot for page content -->
				{@render children()}
			</div>
		</main>
	</div>

	<!-- Debug Logs Aside - Always Visible -->
	<aside class="w-90 flex-shrink-0 overflow-y-auto border-l border-emerald-500/20 bg-[#0B3156]">
		<div class="flex h-full flex-col">
			<h2
				class="flex items-center justify-between border-b border-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-400"
			>
				<div class="flex items-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-2 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					Debug Logs
				</div>
				<button
					type="button"
					onclick={() => {
						// Copy all logs to clipboard
						if (debugInfo.length > 0) {
							navigator.clipboard
								.writeText(debugInfo.join('\n'))
								.then(() => {
									addDebugLog('System', 'Logs copied to clipboard');
								})
								.catch((err) => {
									addDebugLog('System', `Failed to copy logs: ${err}`);
								});
						}
					}}
					class="flex items-center rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/30"
					title="Copy logs to clipboard"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-1 h-3 w-3"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
						/>
					</svg>
					Copy
				</button>
			</h2>

			<!-- Debug Logs -->
			<div class="flex flex-grow flex-col overflow-hidden p-3">
				{#if debugInfo.length > 0}
					<div
						class="flex-grow overflow-y-auto rounded-md border border-blue-800 bg-blue-950 p-3 shadow-inner"
					>
						<pre class="font-mono text-xs whitespace-pre-wrap text-emerald-100/80">
							<code>
								{debugInfo.slice(-20).join('\n')}
							</code>
						</pre>
					</div>
				{:else}
					<div class="flex h-full items-center justify-center">
						<p class="text-xs text-emerald-100/60 italic">No logs available</p>
					</div>
				{/if}
			</div>
		</div>
	</aside>
</div>

<style>
	.shadow-glow {
		box-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
	}
</style>
