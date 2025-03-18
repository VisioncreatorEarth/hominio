<!-- 
  Loro CRDT Todo App with History Replay
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { LoroDoc, type Container, type Value } from 'loro-crdt';

	interface TodoItem {
		id: string;
		text: string;
		completed: boolean;
		createdAt: number;
	}

	interface UpdateInfo {
		counter: number;
		timestamp: number;
		type: 'add' | 'toggle' | 'delete';
		data: string;
	}

	// MetaTodoDoc interface
	interface MetaTodoDoc {
		id: string;
		currentVersion: {
			counter: number;
			timestamp: number;
			peerId: string;
			frontiers: any; // Loro's version vector
			stateSize: number;
			docState: any;
		};
		snapshots: {
			id: string;
			type: 'full' | 'shallow';
			timestamp: number;
			counter: number;
			frontiers: any; // Loro's version vector
			size: number;
		}[];
		updates: {
			id: string;
			type: 'add' | 'toggle' | 'delete';
			timestamp: number;
			counter: number;
			data: string;
			size: number;
			frontiers: any; // Loro's version vector
		}[];
		stats: {
			totalOperations: number;
			totalSnapshots: number;
			totalSize: number;
			lastCompaction: number;
			activeUsers: string[];
			stateVersion: any; // Current version vector
		};
	}

	// Initialize Loro document and container
	const mainDoc = new LoroDoc();
	const replayDoc = new LoroDoc();
	const todos = mainDoc.getMap('todos');
	const replayTodos = replayDoc.getMap('todos');

	// State variables
	let newTodoText = '';
	let todoEntries = $state<[string, TodoItem][]>([]);
	let replayEntries = $state<[string, TodoItem][]>([]);
	let updates = $state<UpdateInfo[]>([]);
	let selectedUpdate = $state<UpdateInfo | null>(null);
	let isReplaying = $state(false);
	let metaDoc = $state<MetaTodoDoc>({
		id: crypto.randomUUID(),
		currentVersion: {
			counter: 0,
			timestamp: Date.now(),
			peerId: '',
			frontiers: {},
			stateSize: 0,
			docState: {}
		},
		snapshots: [],
		updates: [],
		stats: {
			totalOperations: 0,
			totalSnapshots: 0,
			totalSize: 0,
			lastCompaction: Date.now(),
			activeUsers: [],
			stateVersion: {}
		}
	});

	let headerText = $derived(
		isReplaying
			? `Replaying history - Update ${Math.min(selectedUpdate?.counter ?? 0, updates.length - 1) + 1} of ${updates.length}`
			: 'In-memory Loro CRDT todos with history replay'
	);

	// Update todo entries
	function updateTodoEntries() {
		const entries = [...todos.entries()];
		todoEntries = entries.map(([id, value]) => {
			const todoItem = value as unknown as TodoItem;
			return [id, todoItem];
		});
	}

	// Update replay entries
	function updateReplayEntries() {
		const entries = [...replayTodos.entries()];
		replayEntries = entries.map(([id, value]) => {
			const todoItem = value as unknown as TodoItem;
			return [id, todoItem];
		});
	}

	// Track update with Loro's state
	function trackUpdate(type: UpdateInfo['type'], data: string) {
		const update: UpdateInfo = {
			counter: mainDoc.opCount(), // Use Loro's operation count
			timestamp: Date.now(),
			type,
			data
		};
		updates = [...updates, update];
	}

	// Update MetaDoc when operations happen
	function updateMetaDoc(type: 'add' | 'toggle' | 'delete', data: string) {
		// Get Loro's internal state
		const frontiers = mainDoc.frontiers();
		const opCount = mainDoc.opCount();
		const binarySize = mainDoc.export({ mode: 'snapshot' }).byteLength;
		const docState = mainDoc.toJSON();

		const update = {
			id: crypto.randomUUID(),
			type,
			timestamp: Date.now(),
			counter: opCount,
			data,
			size: mainDoc.export({ mode: 'update' }).byteLength, // Use Loro's update size
			frontiers,
			docState // Track full state at this point
		};

		// Update our tracking with Loro's internal state
		metaDoc.updates = [...metaDoc.updates, update];
		metaDoc.currentVersion = {
			counter: opCount,
			timestamp: Date.now(),
			peerId: String(mainDoc.peerId || ''),
			frontiers,
			stateSize: binarySize,
			docState
		};

		// Update stats using Loro's counters
		metaDoc.stats = {
			...metaDoc.stats,
			totalOperations: opCount,
			totalSnapshots: metaDoc.snapshots.length,
			totalSize: binarySize, // Use full state size from Loro
			lastCompaction: Date.now(),
			activeUsers: [...new Set([...metaDoc.stats.activeUsers, String(mainDoc.peerId || '')])],
			stateVersion: frontiers
		};

		// Take alternating snapshots every 3 operations using Loro's opCount
		if (opCount > 0 && opCount % 3 === 0) {
			const isFullSnapshot = Math.floor(opCount / 3) % 2 === 0;
			const snapshotType = isFullSnapshot ? 'full' : 'shallow';
			console.log(`Taking ${snapshotType} snapshot at operation:`, opCount);
			takeSnapshot(snapshotType);
		}
	}

	// Take snapshot using Loro's capabilities
	function takeSnapshot(type: 'full' | 'shallow' = 'full') {
		console.log(`Creating ${type} snapshot...`);

		// Get Loro's state for the snapshot
		const frontiers = mainDoc.frontiers();
		const opCount = mainDoc.opCount();

		// Create snapshot with proper mode
		const snapshotData =
			type === 'full'
				? mainDoc.export({ mode: 'snapshot' })
				: mainDoc.export({
						mode: 'shallow-snapshot',
						frontiers
					});

		const snapshot = {
			id: crypto.randomUUID(),
			type,
			timestamp: Date.now(),
			counter: opCount,
			frontiers,
			size: snapshotData.byteLength,
			docState: mainDoc.toJSON(), // Include full state at snapshot time
			binaryData: snapshotData // Store the actual snapshot data
		};

		// Keep only the latest snapshot unless it's for archiving
		if (type === 'full') {
			// Replace the previous full snapshot
			metaDoc.snapshots = [...metaDoc.snapshots.filter((s) => s.type === 'shallow'), snapshot];
		} else {
			metaDoc.snapshots = [...metaDoc.snapshots, snapshot];
		}

		// Update stats
		metaDoc.stats.totalSnapshots = metaDoc.snapshots.length;
		metaDoc.stats.totalSize = mainDoc.export({ mode: 'snapshot' }).byteLength;
		metaDoc.stats.lastCompaction = snapshot.timestamp;

		// If this is a full snapshot, we can safely clear old updates
		// as they're now captured in the snapshot
		if (type === 'full') {
			const oldUpdates = metaDoc.updates;
			metaDoc.updates = oldUpdates.filter((u) => u.counter > opCount - 10); // Keep last 10 for UI
			console.log(`Cleared ${oldUpdates.length - metaDoc.updates.length} old updates`);
		}
	}

	// Compact the document (should be called periodically)
	function compactDocument() {
		console.log('Compacting document...');

		// Create a new full snapshot with Loro's current state
		const snapshotData = mainDoc.export({ mode: 'snapshot' });
		const opCount = mainDoc.opCount();

		const snapshot = {
			id: crypto.randomUUID(),
			type: 'full' as const,
			timestamp: Date.now(),
			counter: opCount,
			frontiers: mainDoc.frontiers(),
			size: snapshotData.byteLength,
			docState: mainDoc.toJSON(),
			binaryData: snapshotData
		};

		// Aggressively clean storage:
		// 1. Keep only the latest full snapshot
		// 2. Clear ALL previous snapshots (both full and shallow)
		// 3. Keep only the last 5 updates for UI purposes
		metaDoc.snapshots = [snapshot];
		metaDoc.updates = metaDoc.updates.slice(-5);

		// Update stats
		metaDoc.stats.totalSnapshots = 1;
		metaDoc.stats.totalSize = snapshotData.byteLength;
		metaDoc.stats.lastCompaction = snapshot.timestamp;

		console.log('Document compacted successfully - cleared all old snapshots and updates');
	}

	// Set up periodic compaction using runes
	$effect(() => {
		if (metaDoc.stats.totalOperations > 0 && metaDoc.stats.totalOperations % 50 === 0) {
			compactDocument();
		}
	});

	// Initialize app
	onMount(() => {
		// Add welcome todo
		addTodo('Welcome to your Loro-powered todo list!');
		updateTodoEntries();

		// Set up change listener for main doc
		const unsubscribe = mainDoc.subscribe(() => {
			updateTodoEntries();
		});

		// Set up change listener for replay doc
		const unsubscribeReplay = replayDoc.subscribe(() => {
			updateReplayEntries();
		});

		return () => {
			unsubscribe();
			unsubscribeReplay();
		};
	});

	// Add a new todo
	function addTodo(text: string) {
		if (!text.trim()) return;

		const todoId = crypto.randomUUID();
		const todoItem: TodoItem = {
			id: todoId,
			text,
			completed: false,
			createdAt: Date.now()
		};

		todos.set(todoId, todoItem as unknown as Value);
		trackUpdate('add', text);
		updateMetaDoc('add', text);
		newTodoText = '';
		updateTodoEntries();
	}

	// Toggle todo completion (update to handle both main and replay state)
	function toggleTodo(text: string) {
		const entries = [...todos.entries()];
		const todoEntry = entries.find(([_, value]) => {
			const todo = value as unknown as TodoItem;
			return todo.text === text;
		});

		if (todoEntry) {
			const [id, value] = todoEntry;
			const todo = value as unknown as TodoItem;
			todos.set(id, { ...todo, completed: !todo.completed } as unknown as Value);
			trackUpdate('toggle', text);
			updateMetaDoc('toggle', text);
			updateTodoEntries();
		}
	}

	// Delete a todo
	function deleteTodo(text: string) {
		const entries = [...todos.entries()];
		const todoEntry = entries.find(([_, value]) => {
			const todo = value as unknown as TodoItem;
			return todo.text === text;
		});

		if (todoEntry) {
			const [id, value] = todoEntry;
			const todo = value as unknown as TodoItem;
			todos.delete(id);
			trackUpdate('delete', text);
			updateMetaDoc('delete', text);
			updateTodoEntries();
		}
	}

	// Start replaying history
	function startReplay(update: UpdateInfo) {
		isReplaying = true;
		selectedUpdate = update;
		replayTodos.clear();

		// Track all todos that have ever existed
		const allTodos = new Map<string, TodoItem>();
		const deletedTodos = new Set<string>();
		const todosByText = new Map<string, string>(); // text -> id mapping

		// First pass: collect all todos that were ever added
		for (let i = 0; i <= update.counter; i++) {
			const u = updates[i];
			if (u.type === 'add') {
				const addedItem = [...todos.entries()].find(([_, todo]) => {
					const t = todo as unknown as TodoItem;
					return t.text === u.data;
				});
				if (addedItem) {
					const [id, todo] = addedItem;
					const todoItem = todo as unknown as TodoItem;
					allTodos.set(id, {
						...todoItem,
						completed: false
					});
					todosByText.set(u.data, id);
				}
			}
		}

		// Second pass: apply toggles and deletes
		for (let i = 0; i <= update.counter; i++) {
			const u = updates[i];
			if (u.type === 'toggle') {
				const id = todosByText.get(u.data);
				if (id && !deletedTodos.has(id)) {
					const todo = allTodos.get(id);
					if (todo) {
						allTodos.set(id, {
							...todo,
							completed: !todo.completed
						});
					}
				}
			} else if (u.type === 'delete') {
				const id = todosByText.get(u.data);
				if (id) {
					deletedTodos.add(id);
				}
			}
		}

		// Apply state at this point (show all todos that haven't been deleted yet)
		const activeTodos = Array.from(allTodos.entries())
			.filter(([id]) => !deletedTodos.has(id))
			.sort((a, b) => a[1].createdAt - b[1].createdAt);

		for (const [id, todo] of activeTodos) {
			replayTodos.set(id, todo as unknown as Value);
		}

		// Force update with sorted entries
		replayEntries = activeTodos as [string, TodoItem][];
	}

	// Stop replaying and show current state
	function stopReplay() {
		isReplaying = false;
		selectedUpdate = null;
		replayTodos.clear();

		// Force update with sorted entries
		replayEntries = [];
		const currentTodos = [...todos.entries()]
			.map(([id, value]) => {
				const todoItem = value as unknown as TodoItem;
				return [id, todoItem] as [string, TodoItem];
			})
			.sort((a, b) => a[1].createdAt - b[1].createdAt);

		todoEntries = currentTodos;
	}

	// Format date for display
	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}

	// Handle form submission
	function handleSubmit(event: Event) {
		event.preventDefault();
		addTodo(newTodoText);
	}

	// Get update type icon
	function getUpdateIcon(type: UpdateInfo['type']): string {
		switch (type) {
			case 'add':
				return '➕';
			case 'toggle':
				return '✓';
			case 'delete':
				return '🗑';
		}
	}
</script>

<div class="min-h-screen bg-blue-950 text-emerald-100">
	<div class="container mx-auto p-6">
		<div class="flex gap-6">
			<!-- Left Sidebar - MetaDoc Info -->
			<div class="w-80 overflow-y-auto border-r border-blue-800/30 bg-blue-950/30 p-4">
				<div class="space-y-4">
					<!-- Current Version -->
					<div class="rounded-lg bg-blue-900/20 p-3">
						<h3 class="mb-2 text-sm font-medium text-emerald-300">Current Version</h3>
						<div class="space-y-1 text-xs text-emerald-100/70">
							<div>Counter: {metaDoc.currentVersion.counter}</div>
							<div>State Size: {(metaDoc.currentVersion.stateSize / 1024).toFixed(2)} KB</div>
							<div>Last Update: {new Date(metaDoc.currentVersion.timestamp).toLocaleString()}</div>
							<div>Peer ID: {metaDoc.currentVersion.peerId || 'Not set'}</div>
							<div class="font-mono break-all">
								Frontiers: {JSON.stringify(metaDoc.currentVersion.frontiers)}
							</div>
						</div>
					</div>

					<!-- Stats -->
					<div class="rounded-lg bg-blue-900/20 p-3">
						<h3 class="mb-2 text-sm font-medium text-emerald-300">Statistics</h3>
						<div class="space-y-1 text-xs text-emerald-100/70">
							<div>Total Operations: {metaDoc.stats.totalOperations}</div>
							<div>Total Snapshots: {metaDoc.stats.totalSnapshots}</div>
							<div>Total Size: {(metaDoc.stats.totalSize / 1024).toFixed(2)} KB</div>
							<div>Last Compaction: {new Date(metaDoc.stats.lastCompaction).toLocaleString()}</div>
							<div>Active Users: {metaDoc.stats.activeUsers.length}</div>
							<div class="font-mono break-all">
								State Version: {JSON.stringify(metaDoc.stats.stateVersion)}
							</div>
						</div>
					</div>

					<!-- Snapshots -->
					<div class="rounded-lg bg-blue-900/20 p-3">
						<h3 class="mb-2 text-sm font-medium text-emerald-300">Snapshots</h3>
						<div class="space-y-2">
							{#each metaDoc.snapshots as snapshot}
								<div class="rounded bg-blue-950/50 p-2 text-xs">
									<div class="text-emerald-200">{snapshot.type} Snapshot</div>
									<div class="text-emerald-100/70">Counter: {snapshot.counter}</div>
									<div class="text-emerald-100/70">
										Size: {(snapshot.size / 1024).toFixed(2)} KB
									</div>
									<div class="text-emerald-100/70">
										{new Date(snapshot.timestamp).toLocaleString()}
									</div>
									<div class="font-mono break-all text-emerald-100/50">
										Frontiers: {JSON.stringify(snapshot.frontiers)}
									</div>
								</div>
							{/each}
						</div>
					</div>

					<!-- Updates -->
					<div class="rounded-lg bg-blue-900/20 p-3">
						<h3 class="mb-2 text-sm font-medium text-emerald-300">Updates</h3>
						<div class="space-y-2">
							{#each metaDoc.updates as update}
								<div class="rounded bg-blue-950/50 p-2 text-xs">
									<div class="text-emerald-200">{update.type} Operation</div>
									<div class="text-emerald-100/70">Data: {update.data}</div>
									<div class="text-emerald-100/70">Counter: {update.counter}</div>
									<div class="text-emerald-100/70">Size: {(update.size / 1024).toFixed(2)} KB</div>
									<div class="text-emerald-100/70">
										{new Date(update.timestamp).toLocaleString()}
									</div>
									<div class="font-mono break-all text-emerald-100/50">
										Frontiers: {JSON.stringify(update.frontiers)}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<!-- Main Content -->
			<div class="flex-1">
				<div class="mb-6">
					<h1 class="text-3xl font-bold text-emerald-400">Loro Todos</h1>
					<p class="mt-1 text-sm text-emerald-200">
						{headerText}
					</p>
				</div>

				<!-- Add Todo Form -->
				{#if !isReplaying}
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
				{/if}

				<!-- Debug Info -->
				<div class="mb-4 text-xs text-emerald-100/40">
					<p>Total updates: {updates.length}</p>
				</div>

				<!-- Todo List -->
				<div class="space-y-3">
					{#each isReplaying ? replayEntries : todoEntries as [id, todo] (id)}
						<div
							class="flex items-center justify-between rounded border border-emerald-500/10 bg-blue-900/40 p-4 transition-colors hover:bg-blue-900/60"
						>
							<div class="flex min-w-0 flex-1 items-center gap-3">
								<input
									type="checkbox"
									checked={todo.completed}
									on:change={() => toggleTodo(todo.text)}
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
								<span class="mr-2 text-xs text-emerald-100/30">
									{formatDate(todo.createdAt)}
								</span>
								{#if !isReplaying}
									<button
										on:click={() => deleteTodo(todo.text)}
										class="ml-2 rounded px-3 py-1 text-red-400 hover:bg-red-400/10 hover:text-red-300"
									>
										Delete
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Update History Sidebar -->
			<div class="w-80 shrink-0">
				<div class="sticky top-6 rounded-lg border border-blue-700/30 bg-blue-900/10 p-4">
					<div class="mb-4 flex items-center justify-between">
						<h2 class="text-lg font-semibold text-emerald-300">Update History</h2>
						{#if isReplaying}
							<button
								on:click={stopReplay}
								class="rounded bg-emerald-500/20 px-3 py-1.5 text-sm hover:bg-emerald-500/30"
							>
								Return to Current
							</button>
						{/if}
					</div>
					<div class="max-h-[calc(100vh-8rem)] space-y-2 overflow-y-auto">
						{#each updates as update}
							<button
								class="w-full rounded border border-blue-700/10 bg-blue-900/10 p-2 text-left text-sm transition-colors hover:bg-blue-900/20"
								class:border-emerald-500={selectedUpdate?.counter === update.counter}
								on:click={() => startReplay(update)}
							>
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<span class="text-base">{getUpdateIcon(update.type)}</span>
										<span class="font-medium text-emerald-200">
											{update.type === 'add'
												? `Added "${update.data}"`
												: update.type === 'toggle'
													? `Toggled "${update.data}"`
													: `Deleted "${update.data}"`}
										</span>
									</div>
									<span class="text-xs text-emerald-100/40">{formatDate(update.timestamp)}</span>
								</div>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
