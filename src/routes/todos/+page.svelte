<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { LoroDoc } from 'loro-crdt';
	import { generateUUID } from '$lib/utils/uuid';
	import type { Writable } from 'svelte/store';

	// Define Todo type
	interface Todo {
		id: string;
		text: string;
		completed: boolean;
		createdAt: number;
	}

	// Type definitions for context values
	interface StorageService {
		saveSnapshot: (docId: string, loroDoc: LoroDoc, docType: string, meta?: any) => Promise<void>;
		loadSnapshot: (docId: string, loroDoc: LoroDoc) => Promise<boolean>;
	}

	interface LoroDocsRegistry {
		update: (
			fn: (docs: Record<string, { doc: LoroDoc }>) => Record<string, { doc: LoroDoc }>
		) => void;
	}

	interface StorageInfo {
		mode: 'native' | 'indexeddb' | 'not-initialized';
		path: string | null;
		isInitialized: boolean;
		clientId: string;
	}

	// Constants
	const TODO_DOC_ID = 'hominio-todos';
	const TODO_DOC_TYPE = 'todos';

	// Get services from context
	const loroStorage = getContext<StorageService>('loro-storage');
	const loroDocsRegistry = getContext<LoroDocsRegistry>('loro-docs');
	const storageInfo = getContext<Writable<StorageInfo>>('storage-info');

	// State variables
	let todos: Todo[] = [];
	let newTodoText = '';
	let loroDoc: LoroDoc | null = null;
	let todoList: any = null;
	let status = 'Initializing...';
	let isLoroReady = false;

	// Function to save Loro state to storage
	async function saveToStorage() {
		try {
			if (loroDoc) {
				await loroStorage.saveSnapshot(TODO_DOC_ID, loroDoc, TODO_DOC_TYPE);
				// Note: Thanks to the syncservice hook, this snapshot will automatically
				// be synchronized to the server via the /agent/resources/docs/snapshots endpoint
			}
		} catch (err) {
			console.error('Error saving to storage:', err);
		}
	}

	// Function to load Loro state from storage
	async function loadFromStorage() {
		try {
			if (loroDoc) {
				const success = await loroStorage.loadSnapshot(TODO_DOC_ID, loroDoc);
				if (success) {
					return true;
				}
			}
		} catch (err) {
			console.error('Error loading from storage:', err);
		}
		return false;
	}

	// Function to update the local todos array from Loro
	function updateTodosFromLoro() {
		if (!todoList) return;

		try {
			// Get the length of the list
			const length = todoList.length;

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

		// Save state
		await saveToStorage();
	}

	// Toggle todo completion status
	async function toggleTodo(id: string) {
		if (!isLoroReady) return;

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

				// Delete the todo at this index
				todoList.delete(i, 1);

				// Insert the updated todo at the same position
				todoList.insert(i, updatedTodo);

				// Update UI immediately
				updateTodosFromLoro();

				// Save state
				await saveToStorage();
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
				todoList.delete(i, 1);

				// Update UI immediately
				updateTodosFromLoro();

				// Save state
				await saveToStorage();
				break;
			}
		}
	}

	// Initialize Loro on mount
	onMount(async () => {
		try {
			// Check if we already have this loro doc in registry
			let existingDoc = false;
			loroDocsRegistry.update((docs) => {
				if (docs[TODO_DOC_ID]) {
					loroDoc = docs[TODO_DOC_ID].doc;
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
					if (loroDoc) {
						docs[TODO_DOC_ID] = { doc: loroDoc };
					}
					return docs;
				});
			}

			// Create a list for todos
			if (loroDoc) {
				todoList = loroDoc.getList('todos');
			}

			// Update UI
			updateTodosFromLoro();
			isLoroReady = true;
			status = 'Ready!';

			// Make available for debugging
			(window as any).loroDoc = loroDoc;
			(window as any).todoList = todoList;
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			status = `Error: ${errorMessage}`;
			console.error('Loro initialization error:', error);
		}
	});

	// Handle form submission
	function handleSubmit() {
		addTodo();
	}

	// Get reactive values from the storage info store
	$: ({ mode: storageMode, path: dbPath } = $storageInfo);
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
