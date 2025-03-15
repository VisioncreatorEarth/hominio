<!-- 
  Todos page - Creates, manages and syncs todo lists
  using Loro CRDT with server sync
-->
<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { LoroDoc, type Container, type LoroList } from 'loro-crdt';
	import { generateUUID } from '$lib/utils/uuid';
	import type { Writable } from 'svelte/store';
	import { hominio } from '$lib/client/hominio';

	// Constants for document IDs - GENESIS_UUID is now defined on the server
	// just hardcode for client use
	const GENESIS_UUID = '00000000-0000-0000-0000-000000000000';
	const ROOT_REGISTRY_DOC_ID = GENESIS_UUID;
	const ROOT_REGISTRY_TITLE = 'o.homin.io';
	const TODO_DOC_UUID = generateUUID(); // Generate a UUID for the todos document
	const TODO_DOC_TITLE = 'My Todos';
	const TODO_DOC_TYPE = 'todos';

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

	// Registry document entry type
	interface RegistryDocEntry {
		uuid: string;
		docType: string;
		title: string;
		createdAt: number;
		currentSnapshotId: string;
		meta?: Record<string, unknown>;
	}

	// Get services from context
	const loroStorage = getContext<StorageService>('loro-storage');
	const loroDocsRegistry = getContext<LoroDocsRegistry>('loro-docs');
	const storageInfo = getContext<Writable<StorageInfo>>('storage-info');

	// State variables
	let todos: Todo[] = [];
	let newTodoText = '';
	let loroDoc: LoroDoc | null = null;
	let registryDoc: LoroDoc | null = null;
	let todoList: LoroList<Todo> | null = null;
	let status = 'Initializing...';
	let isLoroReady = false;
	let isRegistryReady = false;
	let todoDocId = TODO_DOC_UUID; // Default to the generated UUID

	// Function to save Loro state to storage
	async function saveToStorage(docId: string, doc: LoroDoc, docType: string, meta?: any) {
		try {
			await loroStorage.saveSnapshot(docId, doc, docType, meta);
		} catch (err) {
			console.error(`Error saving doc ${docId} to storage:`, err);
		}
	}

	// Function to load Loro document from storage
	async function loadFromStorage(docId: string, doc: LoroDoc): Promise<boolean> {
		try {
			const success = await loroStorage.loadSnapshot(docId, doc);
			return success;
		} catch (err) {
			console.error(`Error loading doc ${docId} from storage:`, err);
			return false;
		}
	}

	// Get or create the registry document
	async function getOrCreateRegistry(): Promise<LoroDoc> {
		// First check if the server has registry documents
		try {
			// @ts-expect-error - Eden type mismatch but this works
			const serverResponse = await hominio.agent.resources.docs.get();
			if (serverResponse.data && serverResponse.data.status === 'success') {
				console.log('Server registry:', serverResponse.data.registry);
				// We just need to confirm the server has the registry initialized
			}
		} catch (error) {
			console.warn('Could not fetch server registry, using local only', error);
		}

		// Check if we already have this loro doc in registry
		let existingRegistryDoc = false;
		let registry: LoroDoc = new LoroDoc();

		loroDocsRegistry.update((docs) => {
			if (docs[ROOT_REGISTRY_DOC_ID]) {
				registry = docs[ROOT_REGISTRY_DOC_ID].doc;
				existingRegistryDoc = true;
			}
			return docs;
		});

		// If not in registry, create a new one
		if (!existingRegistryDoc) {
			// Try to load saved state from storage
			const loaded = await loadFromStorage(ROOT_REGISTRY_DOC_ID, registry);

			// If nothing was loaded, initialize the registry
			if (!loaded) {
				// Create documents map
				registry.getMap('documents');

				// Save initial state with special metadata for the registry
				await saveToStorage(ROOT_REGISTRY_DOC_ID, registry, 'dao', {
					title: ROOT_REGISTRY_TITLE
				});
			}

			// Register the doc in our global registry
			loroDocsRegistry.update((docs) => {
				docs[ROOT_REGISTRY_DOC_ID] = { doc: registry };
				return docs;
			});
		}

		return registry;
	}

	// Get or create a document through the registry
	async function getOrCreateDocument(
		uuid: string,
		docType: string,
		title: string
	): Promise<LoroDoc> {
		// Ensure registry is initialized
		if (!registryDoc) {
			throw new Error('Registry document not initialized');
		}

		// Get documents map from registry
		const docsMap = registryDoc.getMap('documents');

		// Check if document entry exists in registry
		let docEntry = docsMap.get(uuid) as RegistryDocEntry | undefined;

		// Create a new Loro document
		const doc = new LoroDoc();

		if (docEntry) {
			// Document exists in registry, try to load it
			const loaded = await loadFromStorage(uuid, doc);
			if (!loaded) {
				console.warn(`Document ${uuid} found in registry but could not be loaded`);
			}

			// Use the existing todoDocId from the registry
			todoDocId = docEntry.uuid;
		} else {
			// Document doesn't exist in registry, create a new one

			// Save initial empty document with metadata
			await saveToStorage(uuid, doc, docType, { title });

			// Create a new entry in the registry
			docEntry = {
				uuid,
				docType,
				title,
				createdAt: Date.now(),
				currentSnapshotId: generateUUID() // This is just a placeholder
			};

			// Update registry
			docsMap.set(uuid, docEntry);

			// Save updated registry
			await saveToStorage(ROOT_REGISTRY_DOC_ID, registryDoc, 'dao');
		}

		// Register in our in-memory registry
		loroDocsRegistry.update((docs) => {
			docs[uuid] = { doc };
			return docs;
		});

		return doc;
	}

	// Function to update the local todos array from Loro
	function updateTodosFromLoro() {
		if (!todoList) return;

		try {
			// Get the length of the list
			const len = todoList.length;

			if (typeof len !== 'number') {
				console.error('todoList.length is not a number, it is:', typeof len);
				return;
			}

			// Create a new array from the Loro List
			const updatedTodos = [];
			for (let i = 0; i < len; i++) {
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

		todoList?.push(todo);
		newTodoText = '';

		// Update UI immediately
		updateTodosFromLoro();

		// Save state
		if (loroDoc) {
			await saveToStorage(todoDocId, loroDoc, TODO_DOC_TYPE, { title: TODO_DOC_TITLE });
		}
	}

	// Toggle todo completion status
	async function toggleTodo(id: string) {
		if (!isLoroReady || !todoList) return;

		const len = todoList.length;
		if (typeof len !== 'number') return;

		for (let i = 0; i < len; i++) {
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
				if (loroDoc) {
					await saveToStorage(todoDocId, loroDoc, TODO_DOC_TYPE, { title: TODO_DOC_TITLE });
				}
				break;
			}
		}
	}

	// Delete a todo
	async function deleteTodo(id: string) {
		if (!isLoroReady || !todoList) return;

		// Find the todo in the Loro list by iterating through it
		const len = todoList.length;
		if (typeof len !== 'number') return;

		for (let i = 0; i < len; i++) {
			const todo = todoList.get(i);
			if (todo && todo.id === id) {
				// Delete the todo at this index
				todoList.delete(i, 1);

				// Update UI immediately
				updateTodosFromLoro();

				// Save state
				if (loroDoc) {
					await saveToStorage(todoDocId, loroDoc, TODO_DOC_TYPE, { title: TODO_DOC_TITLE });
				}
				break;
			}
		}
	}

	// Find existing todo doc in registry
	async function findExistingTodoDoc(): Promise<string | null> {
		if (!registryDoc) return null;

		const docsMap = registryDoc.getMap('documents');
		const keys = docsMap.keys();

		for (const key of keys) {
			const entry = docsMap.get(key) as RegistryDocEntry | undefined;
			if (entry && entry.docType === 'todos') {
				return entry.uuid;
			}
		}

		return null;
	}

	// Initialize Loro on mount
	onMount(async () => {
		try {
			// First, initialize the registry document
			status = 'Initializing registry...';
			registryDoc = await getOrCreateRegistry();
			isRegistryReady = true;

			// Try to find an existing todo document in the registry
			const existingTodoDoc = await findExistingTodoDoc();
			if (existingTodoDoc) {
				todoDocId = existingTodoDoc;
			}

			// Now get or create the todos document through the registry
			status = 'Loading todos document...';
			loroDoc = await getOrCreateDocument(todoDocId, TODO_DOC_TYPE, TODO_DOC_TITLE);

			// Get the todos list from the document
			todoList = loroDoc.getList('todos') as LoroList<Todo>;

			// Update UI
			updateTodosFromLoro();
			isLoroReady = true;
			status = 'Ready!';

			// Make available for debugging
			(window as any).registryDoc = registryDoc;
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
	$: ({ isInitialized: storageInitialized, clientId } = $storageInfo);
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
				<p>Registry status: {isRegistryReady ? 'Loaded' : 'Not loaded'}</p>
				<p>Document UUID: {todoDocId}</p>
				<p>Client ID: {clientId}</p>
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
