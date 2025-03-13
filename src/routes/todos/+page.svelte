<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { LoroDoc } from 'loro-crdt';
	import type { SyncEvent, SyncStatus } from '$lib/services/loroSyncService';
	import type { Writable } from 'svelte/store';
	import { generateUUID, generateShortUUID } from '$lib/utils/uuid';

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

	// Get services from context
	const loroStorage = getContext('loro-storage');
	const loroDocsRegistry = getContext('loro-docs') as Writable<
		Record<
			string,
			{
				doc: LoroDoc;
				syncService: any;
			}
		>
	>;
	const syncServices = getContext('loro-sync-services') as {
		createSyncService: (docId: string, loroDoc: LoroDoc) => any;
	};
	const storageInfo = getContext('storage-info') as Writable<{
		mode: 'native' | 'indexeddb' | 'not-initialized';
		path: string | null;
		debugInfo: string[];
		isInitialized: boolean;
		error?: string;
	}>;

	let todos: Todo[] = [];
	let newTodoText = '';
	let loroDoc: LoroDoc | null = null;
	let todoList: any = null;
	let status = 'Initializing...';
	let isLoroReady = false;
	let broadcastChannel: BroadcastChannel | null = null;
	let lastUpdateId: string | null = null;
	let syncService: any = null;
	let clientId = generateShortUUID(); // Short client ID for display
	let syncStatus: SyncStatus = 'idle'; // 'idle', 'syncing', 'success', 'error'
	let lastSyncTime = '';
	let lastUpdateReceived: number | null = null;
	let connectedClients: string[] = [];
	let showDebugInfo = false;
	let debugInfo: string[] = [];

	// Function to save Loro state using PGlite
	async function saveToStorage() {
		try {
			if (loroDoc) {
				await loroStorage.saveSnapshot(TODO_DOC_ID, loroDoc, TODO_DOC_TYPE);
				console.log('Todo state saved to storage');
			}
		} catch (err) {
			console.error('Error saving Loro state:', err);
		}
	}

	// Function to load Loro state from storage
	async function loadFromStorage() {
		try {
			if (loroDoc) {
				const success = await loroStorage.loadSnapshot(TODO_DOC_ID, loroDoc);
				if (success) {
					console.log('Todo state loaded from storage');
					return true;
				}
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
			const updateId = generateUUID();
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
			id: generateUUID(),
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
			// Check if we already have this loro doc in registry
			let existingDoc = false;
			loroDocsRegistry.update((docs) => {
				if (docs[TODO_DOC_ID]) {
					loroDoc = docs[TODO_DOC_ID].doc;
					syncService = docs[TODO_DOC_ID].syncService;
					existingDoc = true;
				}
				return docs;
			});

			// If not in registry, create a new one
			if (!existingDoc) {
				// Create a new Loro document
				loroDoc = new LoroDoc();

				// Try to load saved state from storage
				const loaded = await loadFromStorage();

				// If nothing was loaded, save the initial empty state
				if (!loaded) {
					await saveToStorage();
				}

				// Register the doc in our global registry
				loroDocsRegistry.update((docs) => {
					docs[TODO_DOC_ID] = { doc: loroDoc, syncService: null };
					return docs;
				});

				// Set up sync service
				syncService = syncServices.createSyncService(TODO_DOC_ID, loroDoc);

				// Add event listener for sync events
				syncService.addEventListener(handleSyncEvent);
			} else {
				// If reusing an existing service, still add our event listener
				if (syncService && !syncService._hasOurListener) {
					syncService.addEventListener(handleSyncEvent);
					syncService._hasOurListener = true;
				}
			}

			// Create a list for todos
			todoList = loroDoc.getList('todos');

			// Set up BroadcastChannel for real-time sync between tabs
			setupBroadcastChannel();

			// Update UI
			updateTodosFromLoro();
			isLoroReady = true;
			status = 'Ready!';

			// Make available for debugging
			(window as any).loroDoc = loroDoc;
			(window as any).todoList = todoList;
			(window as any).syncService = syncService;

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

		// We don't stop the sync service here as it's managed at the layout level
		if (syncService && syncService._hasOurListener) {
			syncService.removeEventListener(handleSyncEvent);
			delete syncService._hasOurListener;
			console.log('Removed sync event listener');
		}
	});

	// Handle form submission
	function handleSubmit() {
		addTodo();
	}

	// Get reactive values from the storage info store
	$: ({ mode: storageMode, path: dbPath, debugInfo } = $storageInfo);
</script>

<div class="min-h-full bg-blue-950 text-emerald-100">
	<div class="mx-auto max-w-4xl">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Todos</h1>

		{#if !isLoroReady}
			<!-- Loading State -->
			<div class="p-8 text-center">
				<div
					class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-800 border-t-emerald-500"
				></div>
				<p class="mt-4 text-emerald-200">{status}</p>
			</div>
		{:else}
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
	</div>
</div>
