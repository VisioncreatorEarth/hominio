<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { LoroDoc } from 'loro-crdt';
	import { loroStorage } from '$lib/stores/loroStorage';
	import { loroPGLiteStorage } from '$lib/stores/loroPGLiteStorage';
	import {
		createLoroSyncService,
		type LoroSyncService,
		type SyncEvent,
		type SyncStatus
	} from '$lib/services/loroSyncService';

	// Define Todo type
	interface Todo {
		id: string;
		text: string;
		completed: boolean;
		createdAt: number;
	}

	// Constants
	const TODO_DOC_ID = 'hominio-todos';
	const TODO_DOC_TYPE = 'todos';
	const BROADCAST_CHANNEL = 'loro-todos-sync';

	let todos: Todo[] = [];
	let newTodoText = '';
	let loroDoc: any = null;
	let todoList: any = null;
	let status = 'Initializing...';
	let isLoroReady = false;
	let broadcastChannel: BroadcastChannel | null = null;
	let lastUpdateId: string | null = null;
	let syncService: LoroSyncService | null = null;
	let clientId = crypto.randomUUID().slice(0, 8); // Short client ID for display
	let syncStatus: SyncStatus = 'idle'; // 'idle', 'syncing', 'success', 'error'
	let lastSyncTime = '';
	let lastUpdateReceived: number | null = null;
	let connectedClients: string[] = [];
	let storageMode: 'native' | 'indexeddb' | 'not-initialized' = 'not-initialized';
	let dbPath: string | null = null;

	// Function to save Loro state using PGlite
	async function saveToStorage() {
		try {
			await loroStorage.saveSnapshot(TODO_DOC_ID, loroDoc, TODO_DOC_TYPE);
			console.log('Todo state saved to storage');
		} catch (err) {
			console.error('Error saving Loro state:', err);
		}
	}

	// Function to load Loro state from storage
	async function loadFromStorage() {
		try {
			const success = await loroStorage.loadSnapshot(TODO_DOC_ID, loroDoc);
			if (success) {
				console.log('Todo state loaded from storage');
				return true;
			}
		} catch (err) {
			console.error('Error loading Loro state:', err);
		}
		return false;
	}

	// Function to broadcast updates to other tabs
	function broadcastUpdate() {
		if (!broadcastChannel || !loroDoc) return;

		try {
			// Export updates instead of a full snapshot for efficiency
			const updates = loroDoc.export({ mode: 'update' });

			// Create a unique ID for this update to prevent applying our own updates
			const updateId = crypto.randomUUID();
			lastUpdateId = updateId;

			// Broadcast the updates to other tabs
			broadcastChannel.postMessage({
				type: 'loro-update',
				updates: Array.from(updates),
				updateId
			});

			console.log('Updates broadcast to other tabs');
		} catch (err) {
			console.error('Error broadcasting updates:', err);
		}
	}

	// Function to handle updates from other tabs
	function handleReceivedUpdate(event: MessageEvent) {
		if (!loroDoc || !isLoroReady) return;

		const { type, updates, updateId } = event.data;

		// Skip if this is our own update
		if (updateId === lastUpdateId) {
			console.log('Skipping own update');
			return;
		}

		if (type === 'loro-update' && updates) {
			try {
				console.log('Received updates from another tab');

				// Apply the updates
				const updatesArray = new Uint8Array(updates);
				loroDoc.import(updatesArray);

				// Update UI to reflect changes
				updateTodosFromLoro();

				console.log('Applied updates from another tab');
			} catch (err) {
				console.error('Error applying updates from another tab:', err);
			}
		}
	}

	// Function to update the local todos array from Loro
	function updateTodosFromLoro() {
		if (!todoList) return;

		try {
			// Get the length of the list
			const length = todoList.length;
			console.log(`Updating UI from Loro, list length: ${length}`);

			// Create a new array from the Loro List
			const updatedTodos = [];
			for (let i = 0; i < length; i++) {
				const todo = todoList.get(i);
				if (todo) {
					// Make sure we properly handle all properties
					updatedTodos.push({
						id: todo.id,
						text: todo.text,
						completed: !!todo.completed,
						createdAt: todo.createdAt
					});
				}
			}

			// Sort and update
			todos = updatedTodos.sort((a, b) => b.createdAt - a.createdAt);

			// Debug todo states
			console.log('Updated todos:', todos);
		} catch (error) {
			console.error('Error updating todos from Loro:', error);
		}
	}

	// Add a new todo
	async function addTodo() {
		if (!newTodoText.trim() || !isLoroReady) return;

		const todo: Todo = {
			id: crypto.randomUUID(),
			text: newTodoText,
			completed: false,
			createdAt: Date.now()
		};

		todoList.push(todo);
		newTodoText = '';

		// Update UI immediately
		updateTodosFromLoro();

		// Save state and broadcast update
		await saveToStorage();
		broadcastUpdate();

		// Trigger server sync automatically with high priority
		if (syncService) {
			syncService.syncWithServer(true);
			updateLastSyncTime();
		}
	}

	// Toggle todo completion status
	async function toggleTodo(id: string) {
		if (!isLoroReady) return;

		// Debug before toggle
		console.log('Before toggle - todos:', [...todos]);

		// Per Loro docs, we need to:
		// 1. Find the item by index
		// 2. Delete it
		// 3. Insert the updated version

		const length = todoList.length;

		for (let i = 0; i < length; i++) {
			const todo = todoList.get(i);
			if (todo && todo.id === id) {
				// Create updated todo with toggled completed status
				const updatedTodo = {
					id: todo.id,
					text: todo.text,
					completed: !todo.completed,
					createdAt: todo.createdAt
				};

				console.log('Found todo at index', i, ':', todo);
				console.log('Will update to:', updatedTodo);

				// Delete the todo at this index
				todoList.delete(i, 1);

				// Insert the updated todo at the same position
				todoList.insert(i, updatedTodo);

				// Update UI immediately
				updateTodosFromLoro();

				// Save state and broadcast update
				await saveToStorage();
				broadcastUpdate();

				// Trigger server sync automatically with high priority
				if (syncService) {
					syncService.syncWithServer(true);
					updateLastSyncTime();
				}

				// Debug after toggle
				console.log('After toggle - todos:', [...todos]);
				break;
			}
		}
	}

	// Delete a todo
	async function deleteTodo(id: string) {
		if (!isLoroReady) return;

		// Find the todo in the Loro list by iterating through it
		const length = todoList.length;
		for (let i = 0; i < length; i++) {
			const todo = todoList.get(i);
			if (todo && todo.id === id) {
				// Delete the todo at this index
				todoList.delete(i, 1); // Delete 1 element at index i

				// Update UI immediately
				updateTodosFromLoro();

				// Save state and broadcast update
				await saveToStorage();
				broadcastUpdate();

				// Trigger server sync automatically with high priority
				if (syncService) {
					syncService.syncWithServer(true);
					updateLastSyncTime();
				}
				break;
			}
		}
	}

	// Setup BroadcastChannel for cross-tab communication
	function setupBroadcastChannel() {
		try {
			// Close any existing channel
			if (broadcastChannel) {
				broadcastChannel.close();
			}

			// Create a new channel
			broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL);

			// Set up listener for updates from other tabs
			broadcastChannel.addEventListener('message', handleReceivedUpdate);

			console.log('BroadcastChannel set up for real-time tab synchronization');
		} catch (err) {
			console.error('Error setting up BroadcastChannel:', err);
			status = 'Error: Could not set up cross-tab communication';
		}
	}

	// Handle sync service events
	function handleSyncEvent(event: SyncEvent) {
		console.log('Sync event:', event);

		if (event.type === 'status-change' && event.status) {
			syncStatus = event.status;

			// Only update the sync time when we get a success status
			if (event.status === 'success') {
				updateLastSyncTime();
				// Force UI update on successful sync
				updateTodosFromLoro();
			}
		}

		if (event.type === 'updates-received') {
			lastUpdateReceived = event.timestamp;

			// Check if this is an immediate update
			const details = event.details as Record<string, unknown> | undefined;
			const isImmediate = details?.immediate === true;

			if (isImmediate) {
				// Update UI immediately for high-priority updates
				updateTodosFromLoro();
				updateLastSyncTime();
			} else {
				// For regular updates, add a small delay to ensure Loro has processed the update
				setTimeout(() => {
					updateTodosFromLoro();
				}, 20); // Reduced delay for faster response
			}

			// If this was a forced update, also update the sync time
			if (details?.forceUpdate) {
				updateLastSyncTime();
			}
		}

		if (event.type === 'sync-complete') {
			// Update the UI immediately after sync completes
			updateTodosFromLoro();
			updateLastSyncTime();
		}
	}

	// Initialize Loro Sync Service
	function setupSyncService() {
		if (!loroDoc || !isLoroReady) return;

		try {
			// Create a sync service with auto-start
			syncService = createLoroSyncService(TODO_DOC_ID, loroDoc, {
				clientId,
				autoStart: true, // Always auto-start
				syncIntervalMs: 1000 // Exactly 1 second sync interval
			});

			// Add event listener for sync events
			syncService.addEventListener(handleSyncEvent);

			console.log('Loro sync service initialized with client ID:', clientId);
			updateLastSyncTime();

			// Force an initial sync immediately
			setTimeout(() => {
				if (syncService) {
					console.log('Forcing initial sync');
					syncService.syncWithServer(true); // Use high priority for initial sync
				}
			}, 100);
		} catch (err) {
			console.error('Error setting up sync service:', err);
			status = 'Error: Could not set up sync service';
		}
	}

	// Helper function to format time
	function formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString();
	}

	// Update last sync time
	function updateLastSyncTime() {
		lastSyncTime = formatTime(Date.now());
	}

	// Initialize Loro on mount
	onMount(async () => {
		try {
			// Create a new Loro document
			loroDoc = new LoroDoc();

			// Create a list for todos
			todoList = loroDoc.getList('todos');

			// Debug available methods
			console.log(
				'Available methods on todoList:',
				Object.getOwnPropertyNames(Object.getPrototypeOf(todoList))
			);

			// Try to load saved state from storage
			const loaded = await loadFromStorage();

			if (!loaded && todoList.length === 0) {
				// Add a welcome todo if empty
				todoList.push({
					id: crypto.randomUUID(),
					text: 'Welcome to Loro Todo! This is a local-first app with SQL-based storage.',
					completed: false,
					createdAt: Date.now()
				});

				// Save the initial state
				await saveToStorage();
			}

			// Get storage mode for display
			storageMode = loroPGLiteStorage.getStorageMode();
			dbPath = loroPGLiteStorage.getDbPath();

			// Set up BroadcastChannel for real-time sync between tabs
			setupBroadcastChannel();

			// Update UI
			updateTodosFromLoro();
			isLoroReady = true;
			status = 'Ready!';

			// Set up sync service for cross-device synchronization
			setupSyncService();

			// Make available for debugging
			(window as any).loroDoc = loroDoc;
			(window as any).loroStorage = loroStorage;
			(window as any).syncService = syncService;

			// List the snapshot history for debugging
			const snapshots = await loroStorage.listSnapshots(TODO_DOC_ID);
			console.log('Snapshot history:', snapshots);

			// Log initial state
			console.log('Initial todos:', todos);
			console.log('Loro list length:', todoList.length);
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			status = `Error: ${errorMessage}`;
			console.error('Loro initialization error:', error);
		}
	});

	// Clean up on component destruction
	onDestroy(() => {
		if (broadcastChannel) {
			broadcastChannel.close();
			console.log('BroadcastChannel closed');
		}

		if (syncService) {
			syncService.removeEventListener(handleSyncEvent);
			syncService.stopSync();
			console.log('Sync service stopped');
		}
	});

	// Handle form submission
	function handleSubmit() {
		addTodo();
	}
</script>

<div class="flex flex-col items-center py-20">
	<div class="w-full max-w-2xl rounded-lg border border-emerald-500/20 bg-blue-950 p-6 shadow-lg">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Loro Todo App</h1>

		{#if !isLoroReady}
			<div class="mb-6 rounded border border-emerald-500/10 bg-blue-900/50 p-4">
				<p class="text-emerald-100">Loading... {status}</p>
			</div>
		{:else}
			<!-- Server Sync Status -->
			<div class="mb-6 rounded-lg border border-emerald-500/20 bg-blue-900/30 p-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="mb-2 text-xl font-semibold text-emerald-400">Cross-Device Sync</h2>
						<p class="text-sm text-emerald-100/70">
							Client ID: <span class="font-mono">{clientId}</span>
						</p>
						<p class="mt-1 text-xs text-emerald-100/50">Auto-syncing enabled</p>
					</div>
				</div>
			</div>

			<!-- Storage Mode Indicator -->
			<div class="mb-6 rounded-lg border border-emerald-500/20 bg-blue-900/30 p-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="mb-2 text-xl font-semibold text-emerald-400">Storage</h2>
						{#if storageMode === 'native'}
							<div class="mb-2 flex items-center">
								<span class="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
								<p class="text-sm font-medium text-emerald-300">Native Filesystem Storage</p>
							</div>
							{#if dbPath}
								<p class="font-mono text-xs text-emerald-100/50">{dbPath}</p>
							{/if}
						{:else if storageMode === 'indexeddb'}
							<div class="mb-2 flex items-center">
								<span class="mr-2 inline-block h-2 w-2 rounded-full bg-amber-400"></span>
								<p class="text-sm font-medium text-amber-300">Browser IndexedDB Storage</p>
							</div>
							<p class="text-xs text-amber-100/50">
								For persistent filesystem storage, run in Tauri desktop app
							</p>
						{:else}
							<div class="mb-2 flex items-center">
								<span class="mr-2 inline-block h-2 w-2 rounded-full bg-gray-400"></span>
								<p class="text-sm font-medium text-gray-300">Storage Not Initialized</p>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Add Todo Form -->
			<form on:submit|preventDefault={handleSubmit} class="mb-6">
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={newTodoText}
						placeholder="What needs to be done?"
						class="flex-grow rounded border border-blue-800 bg-blue-900/70 p-3 text-emerald-100 placeholder-emerald-100/50 focus:border-emerald-500 focus:outline-none"
					/>
					<button
						type="submit"
						class="rounded bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-3 font-bold text-black transition-all hover:scale-105"
					>
						Add
					</button>
				</div>
			</form>

			<!-- Debug information -->
			<div class="mb-4 text-xs text-emerald-100/40">
				<p>Total todos: {todos.length}</p>
			</div>

			<!-- Todo List -->
			<div class="space-y-3">
				{#if todos.length === 0}
					<p class="text-emerald-100/60 italic">No todos yet. Add one above!</p>
				{:else}
					{#each todos as todo (todo.id)}
						<div
							class="flex items-center justify-between rounded border border-emerald-500/10 bg-blue-900/40 p-4 transition-colors hover:bg-blue-900/60"
						>
							<div class="flex min-w-0 flex-1 items-center gap-3">
								<input
									type="checkbox"
									checked={todo.completed}
									on:change={() => toggleTodo(todo.id)}
									class="h-5 w-5 rounded border-blue-700 bg-blue-800 focus:ring-emerald-500"
								/>
								<span
									class={todo.completed
										? 'truncate text-emerald-100/50 line-through'
										: 'truncate text-emerald-100'}
								>
									{todo.text}
								</span>
							</div>
							<div class="flex items-center">
								<!-- Debug completed state -->
								<span class="mr-2 text-xs text-emerald-100/30">
									{todo.completed ? 'Done' : 'Todo'}
								</span>
								<button
									on:click={() => deleteTodo(todo.id)}
									class="ml-2 rounded px-3 py-1 text-red-400 hover:bg-red-400/10 hover:text-red-300"
								>
									Delete
								</button>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{/if}

		<!-- Footer -->
		<div class="mt-8 text-sm text-emerald-100/60">
			<p>This is a local-first app powered by Loro CRDT with SQL-based storage.</p>
			<p class="mt-1">
				Your todos are saved in your browser using PGlite (PostgreSQL in the browser).
			</p>
		</div>
	</div>
</div>
