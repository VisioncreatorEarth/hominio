<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { LoroDoc, type Value } from 'loro-crdt';
	import type { ClientToolImplementation } from 'ultravox-client';
	import { fade } from 'svelte/transition';

	// Initialize callStatus with the provided prop or default to 'off'
	// Since we don't have access to parent callStatus directly, we'll use a local state
	let callStatus = $state('off');

	// Define Todo interface
	interface TodoItem {
		id: string;
		text: string;
		completed: boolean;
		createdAt: number;
		tags: string[];
	}

	// Initialize LoroDoc for todos
	const todoDoc = new LoroDoc();
	const todos = todoDoc.getMap('todos');

	// State variables
	let todoEntries = $state<[string, TodoItem][]>([]);
	let newTodoText = $state('');
	let newTodoTags = $state('');
	let recentToolActivity = $state<{ action: string; message: string; timestamp: number } | null>(
		null
	);

	// Add state variable for editing
	let editingTodoId = $state<string | null>(null);
	let editingTodoText = $state('');
	let editingTodoTags = $state('');

	// Create a simple store pattern for tool state
	interface ToolState {
		pendingAction: string | null;
		lastActionTimestamp: number;
		history: { action: string; success: boolean; message: string; timestamp: number }[];
		activeItem: TodoItem | null;
	}

	// Create a tool state store with reactive properties
	const toolState = $state<ToolState>({
		pendingAction: null,
		lastActionTimestamp: 0,
		history: [],
		activeItem: null
	});

	// Add helper for tracking tool usage for UI feedback
	function logToolActivity(action: string, message: string, success = true) {
		// Update tool state
		toolState.pendingAction = null;
		toolState.lastActionTimestamp = Date.now();
		toolState.history = [
			{ action, success, message, timestamp: Date.now() },
			...toolState.history.slice(0, 9) // Keep last 10 entries
		];

		// Show recent activity indicator
		recentToolActivity = {
			action,
			message,
			timestamp: Date.now()
		};

		// Clear the notification after 3 seconds
		setTimeout(() => {
			recentToolActivity = null;
		}, 3000);

		console.log(`Tool activity: ${action} - ${message}`);
		return { success, message };
	}

	// Add a new todo to the Loro document
	function addTodo(text: string, tagsStr: string = ''): string {
		if (!text.trim()) return '';

		const todoId = crypto.randomUUID();
		const tags = tagsStr
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0);

		const todoItem: TodoItem = {
			id: todoId,
			text: text.trim(),
			completed: false,
			createdAt: Date.now(),
			tags
		};

		todos.set(todoId, todoItem as unknown as Value);
		newTodoText = '';
		newTodoTags = '';
		updateTodoEntries();
		return todoId;
	}

	// Toggle todo completion by ID
	function toggleTodoById(id: string): boolean {
		// Use proper Loro map entries method to check if id exists
		const entries = [...todos.entries()];
		const todoEntry = entries.find((entry) => entry[0] === id);

		if (todoEntry) {
			const value = todoEntry[1] as unknown as TodoItem;
			todos.set(id, {
				...value,
				completed: !value.completed
			} as unknown as Value);

			updateTodoEntries();
			return true;
		}

		return false;
	}

	// Find all todos matching text content
	function findTodosByText(text: string): [string, TodoItem][] {
		const entries = [...todos.entries()];
		return entries
			.filter((entry) => {
				const todo = entry[1] as unknown as TodoItem;
				return todo.text.toLowerCase().includes(text.toLowerCase());
			})
			.map((entry) => [entry[0] as string, entry[1] as unknown as TodoItem]);
	}

	// Update todo entries from Loro document
	function updateTodoEntries() {
		// Use entries() method to get the entries from the Loro map
		const rawEntries = [...todos.entries()];

		// Create properly typed entries with explicit casting
		const typedEntries: [string, TodoItem][] = rawEntries.map((entry) => {
			const key = entry[0] as string;
			const value = entry[1] as unknown as TodoItem;
			return [key, value];
		});

		// Sort by creation date (newest first)
		todoEntries = typedEntries.sort((a, b) => b[1].createdAt - a[1].createdAt);

		// Update document list
		updateLoroDocuments();
	}

	// Toggle todo completion by clicking
	function toggleTodo(id: string) {
		toggleTodoById(id);
	}

	// Edit a todo function
	function startEditTodo(id: string, todo: TodoItem) {
		editingTodoId = id;
		editingTodoText = todo.text;
		editingTodoTags = todo.tags.join(', ');
	}

	// Save edit function
	function saveEditTodo() {
		if (editingTodoId && editingTodoText.trim()) {
			const entries = [...todos.entries()];
			const todoEntry = entries.find((entry) => entry[0] === editingTodoId);

			if (todoEntry) {
				const value = todoEntry[1] as unknown as TodoItem;

				// Parse tags from comma-separated string
				const tags = editingTodoTags
					.split(',')
					.map((tag) => tag.trim())
					.filter((tag) => tag.length > 0);

				todos.set(editingTodoId, {
					...value,
					text: editingTodoText.trim(),
					tags
				} as unknown as Value);

				logToolActivity('edit', `Todo updated to "${editingTodoText.trim()}"`);
				updateTodoEntries();
			}
		}

		// Reset editing state
		editingTodoId = null;
		editingTodoText = '';
		editingTodoTags = '';
	}

	// Cancel edit function
	function cancelEditTodo() {
		editingTodoId = null;
		editingTodoText = '';
		editingTodoTags = '';
	}

	// Improved delete todo function with logging
	function deleteTodo(id: string) {
		// Find the todo text before deleting for the log message
		const entries = [...todos.entries()];
		const todoEntry = entries.find((entry) => entry[0] === id);

		if (todoEntry) {
			const todo = todoEntry[1] as unknown as TodoItem;
			todos.delete(id);
			updateTodoEntries();
			logToolActivity('delete', `Todo "${todo.text}" was removed`);
		}
	}

	// Format date for display
	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}

	// Handle form submission
	function handleSubmit(event: Event) {
		event.preventDefault();
		if (newTodoText.trim()) {
			const todoId = addTodo(newTodoText, newTodoTags);
			logToolActivity('create', `Todo "${newTodoText}" created successfully`);
		}
	}

	// Function to get unique tags from all todos
	function getAllUniqueTags(): string[] {
		const uniqueTags = new Set<string>();

		todoEntries.forEach(([_, todo]) => {
			todo.tags.forEach((tag) => {
				if (tag) uniqueTags.add(tag);
			});
		});

		return Array.from(uniqueTags).sort();
	}

	// Function to filter todos by tag
	let selectedTag = $state<string | null>(null);

	function filterTodosByTag(tag: string | null) {
		selectedTag = tag;
	}

	// Tool implementations based on AskHominio.svelte pattern
	// Ultravox client tool implementation for creating a todo
	const createTodoTool = (parameters: any) => {
		console.log('Called createTodo tool with parameters:', parameters);
		try {
			const { todoText, tags } = parameters;
			toolState.pendingAction = 'create';

			if (typeof todoText === 'string' && todoText.trim()) {
				const tagsStr = tags || '';
				const newTodoId = addTodo(todoText.trim(), tagsStr);

				const result = {
					success: true,
					message: `Created todo: "${todoText}"${tagsStr ? ' with tags: ' + tagsStr : ''}`
				};

				logToolActivity('create', result.message, true);
				return JSON.stringify(result);
			}

			const result = {
				success: false,
				message: 'Invalid todo text provided'
			};

			logToolActivity('create', result.message, false);
			return JSON.stringify(result);
		} catch (error: unknown) {
			console.error('Error in createTodo tool:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			const result = {
				success: false,
				message: `Error creating todo: ${errorMessage}`
			};

			logToolActivity('create', result.message, false);
			return JSON.stringify(result);
		}
	};

	// Ultravox client tool implementation for toggling a todo
	const toggleTodoTool = (parameters: any) => {
		console.log('Called toggleTodo tool with parameters:', parameters);
		try {
			const { todoId, todoText } = parameters;
			toolState.pendingAction = 'toggle';

			// Try by ID first
			if (todoId && typeof todoId === 'string') {
				console.log(`Attempting to toggle todo by ID: ${todoId}`);
				const success = toggleTodoById(todoId);
				if (success) {
					const result = {
						success: true,
						message: `Toggled todo completion status`
					};

					logToolActivity('toggle', result.message, true);
					return JSON.stringify(result);
				}
			}

			// Try by text content
			if (todoText && typeof todoText === 'string') {
				console.log(`Attempting to toggle todo by text: ${todoText}`);

				// Find all matching todos using the helper function
				const matchingTodos = findTodosByText(todoText);

				console.log(`Found ${matchingTodos.length} matching todos`);

				// If we found exactly one match, toggle it
				if (matchingTodos.length === 1) {
					const [id, todo] = matchingTodos[0];
					toggleTodoById(id);

					const result = {
						success: true,
						message: `Toggled "${todo.text}" to ${!todo.completed ? 'complete' : 'incomplete'}`
					};

					logToolActivity('toggle', result.message, true);
					return JSON.stringify(result);
				}
				// If multiple matches, return info about them
				else if (matchingTodos.length > 1) {
					const todoNames = matchingTodos.map(([_, todo]) => `"${todo.text}"`).join(', ');

					const result = {
						success: false,
						message: `Found multiple matching todos: ${todoNames}. Please be more specific.`
					};

					logToolActivity('toggle', result.message, false);
					return JSON.stringify(result);
				}
			}

			// If we got here, we couldn't find a matching todo
			const result = {
				success: false,
				message: 'Could not find a matching todo. Try a different description or create a new todo.'
			};

			logToolActivity('toggle', result.message, false);
			return JSON.stringify(result);
		} catch (error) {
			console.error('Error in toggleTodo tool:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			const result = {
				success: false,
				message: `Error toggling todo: ${errorMessage}`
			};

			logToolActivity('toggle', result.message, false);
			return JSON.stringify(result);
		}
	};

	// Add a tool implementation for removing todos
	const removeTodoTool = (parameters: any) => {
		console.log('Called removeTodo tool with parameters:', parameters);
		try {
			const { todoId, todoText } = parameters;
			toolState.pendingAction = 'delete';

			// Try by ID first
			if (todoId && typeof todoId === 'string') {
				const entries = [...todos.entries()];
				const todoEntry = entries.find((entry) => entry[0] === todoId);

				if (todoEntry) {
					const todo = todoEntry[1] as unknown as TodoItem;
					todos.delete(todoId);
					updateTodoEntries();

					const result = {
						success: true,
						message: `Deleted todo: "${todo.text}"`
					};

					logToolActivity('delete', result.message, true);
					return JSON.stringify(result);
				}
			}

			// Try by text content
			if (todoText && typeof todoText === 'string') {
				// Find all matching todos
				const matchingTodos = findTodosByText(todoText);

				// If we found exactly one match, delete it
				if (matchingTodos.length === 1) {
					const [id, todo] = matchingTodos[0];
					todos.delete(id);
					updateTodoEntries();

					const result = {
						success: true,
						message: `Deleted todo: "${todo.text}"`
					};

					logToolActivity('delete', result.message, true);
					return JSON.stringify(result);
				}
				// If multiple matches, return info about them
				else if (matchingTodos.length > 1) {
					const todoNames = matchingTodos.map(([_, todo]) => `"${todo.text}"`).join(', ');

					const result = {
						success: false,
						message: `Found multiple matching todos: ${todoNames}. Please be more specific.`
					};

					logToolActivity('delete', result.message, false);
					return JSON.stringify(result);
				}
			}

			// If we got here, we couldn't find a matching todo
			const result = {
				success: false,
				message: 'Could not find a matching todo to delete. Try a different description.'
			};

			logToolActivity('delete', result.message, false);
			return JSON.stringify(result);
		} catch (error) {
			console.error('Error in removeTodo tool:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			const result = {
				success: false,
				message: `Error deleting todo: ${errorMessage}`
			};

			logToolActivity('delete', result.message, false);
			return JSON.stringify(result);
		}
	};

	// Add a tool implementation for updating todos
	const updateTodoTool = (parameters: any) => {
		console.log('Called updateTodo tool with parameters:', parameters);
		try {
			const { todoId, todoText, newText, tags } = parameters;
			toolState.pendingAction = 'edit';

			// Try to find todo by ID first
			if (todoId && typeof todoId === 'string') {
				const entries = [...todos.entries()];
				const todoEntry = entries.find((entry) => entry[0] === todoId);

				if (todoEntry) {
					const todo = todoEntry[1] as unknown as TodoItem;
					todos.set(todoId, {
						...todo,
						text: newText || todo.text,
						tags: tags
							? tags
									.split(',')
									.map((t: string) => t.trim())
									.filter((t: string) => t.length > 0)
							: todo.tags
					} as unknown as Value);

					updateTodoEntries();

					const result = {
						success: true,
						message: `Updated todo: "${newText || todo.text}"`
					};

					logToolActivity('edit', result.message, true);
					return JSON.stringify(result);
				}
			}

			// Try by text content
			if (todoText && typeof todoText === 'string' && newText) {
				// Find all matching todos
				const matchingTodos = findTodosByText(todoText);

				// If we found exactly one match, update it
				if (matchingTodos.length === 1) {
					const [id, todo] = matchingTodos[0];

					// Parse tags if provided
					const updatedTags = tags
						? tags
								.split(',')
								.map((t: string) => t.trim())
								.filter((t: string) => t.length > 0)
						: todo.tags;

					todos.set(id, {
						...todo,
						text: newText,
						tags: updatedTags
					} as unknown as Value);

					updateTodoEntries();

					const result = {
						success: true,
						message: `Updated todo from "${todo.text}" to "${newText}"`
					};

					logToolActivity('edit', result.message, true);
					return JSON.stringify(result);
				}
				// If multiple matches, return info about them
				else if (matchingTodos.length > 1) {
					const todoNames = matchingTodos.map(([_, todo]) => `"${todo.text}"`).join(', ');

					const result = {
						success: false,
						message: `Found multiple matching todos: ${todoNames}. Please be more specific.`
					};

					logToolActivity('edit', result.message, false);
					return JSON.stringify(result);
				}
			}

			// If we got here, we couldn't find a matching todo
			const result = {
				success: false,
				message: 'Could not find a matching todo to update. Try a different description.'
			};

			logToolActivity('edit', result.message, false);
			return JSON.stringify(result);
		} catch (error: unknown) {
			console.error('Error in updateTodo tool:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			const result = {
				success: false,
				message: `Error updating todo: ${errorMessage}`
			};

			logToolActivity('edit', result.message, false);
			return JSON.stringify(result);
		}
	};

	// Add a tool implementation for filtering todos by tag
	const filterTodosTool = (parameters: any) => {
		console.log('Called filterTodos tool with parameters:', parameters);
		try {
			const { tag } = parameters;
			toolState.pendingAction = 'filter';

			if (tag === 'all' || tag === 'clear') {
				// Reset filter to show all todos
				selectedTag = null;
				const result = {
					success: true,
					message: 'Showing all todos'
				};
				logToolActivity('filter', result.message, true);
				return JSON.stringify(result);
			}

			// Check if tag exists
			const allTags = getAllUniqueTags();

			if (tag && typeof tag === 'string') {
				// Try to find a matching tag (case insensitive)
				const matchingTag = allTags.find((t) => t.toLowerCase() === tag.toLowerCase());

				if (matchingTag) {
					selectedTag = matchingTag;
					const result = {
						success: true,
						message: `Filtered todos by tag: "${matchingTag}"`
					};
					logToolActivity('filter', result.message, true);
					return JSON.stringify(result);
				} else {
					const result = {
						success: false,
						message: `Tag "${tag}" not found. Available tags: ${allTags.join(', ')}`
					};
					logToolActivity('filter', result.message, false);
					return JSON.stringify(result);
				}
			}

			// If no tag provided, list available tags
			if (allTags.length > 0) {
				const result = {
					success: false,
					message: `Available tags: ${allTags.join(', ')}`
				};
				logToolActivity('filter', result.message, false);
				return JSON.stringify(result);
			} else {
				const result = {
					success: false,
					message: 'No tags available yet'
				};
				logToolActivity('filter', result.message, false);
				return JSON.stringify(result);
			}
		} catch (error: unknown) {
			console.error('Error in filterTodos tool:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			const result = {
				success: false,
				message: `Error filtering todos: ${errorMessage}`
			};

			logToolActivity('filter', result.message, false);
			return JSON.stringify(result);
		}
	};

	// Initialize the list of Loro documents
	let loroDocuments = $state<{ id: string; name: string; createdAt: number; numTodos: number }[]>([
		{
			id: 'todos',
			name: 'Default Todo List',
			createdAt: Date.now(),
			numTodos: 0
		}
	]);

	// Update document list with count
	function updateLoroDocuments() {
		// Update the todo count in the documents list
		loroDocuments = loroDocuments.map((doc) => {
			if (doc.id === 'todos') {
				return {
					...doc,
					numTodos: todoEntries.length
				};
			}
			return doc;
		});
	}

	// Following the pattern in askHominio.ts, register tools with window
	onMount(() => {
		// Define Hominio tools in the global scope
		if (typeof window !== 'undefined') {
			// Expose the tool implementations directly on window
			(window as any).__hominio_tools = {
				createTodo: createTodoTool,
				toggleTodo: toggleTodoTool,
				removeTodo: removeTodoTool,
				updateTodo: updateTodoTool,
				filterTodos: filterTodosTool
			};

			// Create the registration function that Ultravox will call
			(window as any).registerHominionTools = (session: any) => {
				console.log('Registering Hominio todo tools with Ultravox session...');

				if (session && typeof session.registerToolImplementation === 'function') {
					try {
						console.log('Registering createTodo tool...');
						session.registerToolImplementation('createTodo', createTodoTool);

						console.log('Registering toggleTodo tool...');
						session.registerToolImplementation('toggleTodo', toggleTodoTool);

						console.log('Registering removeTodo tool...');
						session.registerToolImplementation('removeTodo', removeTodoTool);

						console.log('Registering updateTodo tool...');
						session.registerToolImplementation('updateTodo', updateTodoTool);

						console.log('Registering filterTodos tool...');
						session.registerToolImplementation('filterTodos', filterTodosTool);

						console.log('Hominio todo tools registered successfully');
					} catch (error) {
						console.error('Error registering tools:', error);
					}
				} else {
					console.error('Invalid Ultravox session or missing registerToolImplementation method');
				}
			};

			console.log('Hominio tools ready for registration');

			// Try to get the call status from the parent context
			const checkCallStatus = () => {
				// Access Ultravox session from window if available
				if ((window as any).__ULTRAVOX_SESSION) {
					const uvSession = (window as any).__ULTRAVOX_SESSION;
					if (uvSession.status) {
						callStatus = uvSession.status;
					}
				}
			};

			// Initial check
			checkCallStatus();

			// Set up interval to periodically check call status
			const statusInterval = setInterval(checkCallStatus, 1000);

			return () => {
				clearInterval(statusInterval);
			};
		}

		// Set up Loro change listener
		const unsubscribe = todoDoc.subscribe(() => {
			updateTodoEntries();
		});

		// Add a welcome todo if none exist
		const entries = [...todos.entries()];
		if (entries.length === 0) {
			addTodo('Welcome to Hominio Voice Todos! Ask the assistant to create or toggle tasks.');
		}

		updateTodoEntries();

		return () => {
			unsubscribe();
		};
	});

	// Clean up
	onDestroy(() => {
		// Clean up window references when component is destroyed
		if (typeof window !== 'undefined') {
			delete (window as any).__hominio_tools;
			delete (window as any).registerHominionTools;
		}
	});
</script>

<div class="mx-auto grid max-w-full grid-cols-1 gap-6 lg:grid-cols-6 lg:px-4">
	<!-- Left sidebar for Loro document list -->
	<div class="lg:col-span-1">
		<div class="sticky top-6 p-4">
			<!-- Loro Documents Section -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Loro Documents</h3>
				<div class="space-y-3">
					{#each loroDocuments as doc}
						<div class="rounded-lg border border-white/5 bg-white/5 p-3">
							<div class="flex items-center gap-2">
								<div class="rounded-full bg-blue-500/20 p-1.5">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3.5 w-3.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
										/>
									</svg>
								</div>
								<div class="text-xs font-medium text-white/80">{doc.name}</div>
							</div>
							<div class="mt-2 flex items-center justify-between">
								<div class="text-xs text-white/60">
									{doc.numTodos}
									{doc.numTodos === 1 ? 'todo' : 'todos'}
								</div>
								<div class="text-xs text-white/40">
									{new Date(doc.createdAt).toLocaleDateString()}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Main content area (centered, takes 4/6 of space on larger screens) -->
	<div class="lg:col-span-4">
		<div class="mx-auto max-w-7xl p-4 sm:p-6">
			<!-- Header -->
			<div class="mb-8 text-center">
				<h1 class="text-3xl font-bold text-white/95">Hominio Voice Todos</h1>
				<p class="mt-2 text-white/70">
					Manage your tasks using voice commands. Try saying "Create a todo to..."
				</p>
			</div>

			<!-- Tags Filter -->
			{#if getAllUniqueTags().length > 0}
				<div class="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
					<h3 class="mb-2 text-sm font-medium text-white/70">Filter by tag:</h3>
					<div class="flex flex-wrap gap-2">
						<button
							on:click={() => filterTodosByTag(null)}
							class={`rounded-lg px-3 py-1 text-sm transition-colors ${
								selectedTag === null
									? 'bg-blue-500/30 text-white'
									: 'bg-white/10 text-white/70 hover:bg-white/20'
							}`}
						>
							All
						</button>
						{#each getAllUniqueTags() as tag}
							<button
								on:click={() => filterTodosByTag(tag)}
								class={`rounded-lg px-3 py-1 text-sm transition-colors ${
									selectedTag === tag
										? 'bg-blue-500/30 text-white'
										: 'bg-white/10 text-white/70 hover:bg-white/20'
								}`}
							>
								{tag}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Tool Activity Notification -->
			{#if recentToolActivity}
				<div class="mb-6" transition:fade={{ duration: 300 }}>
					<div class="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 backdrop-blur-sm">
						<div class="flex items-center gap-3">
							<div class="rounded-full bg-indigo-500/20 p-2">
								{#if recentToolActivity.action === 'create'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 text-indigo-300"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 6v6m0 0v6m0-6h6m-6 0H6"
										/>
									</svg>
								{:else if recentToolActivity.action === 'toggle'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 text-indigo-300"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{:else if recentToolActivity.action === 'edit'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 text-indigo-300"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
										/>
									</svg>
								{:else if recentToolActivity.action === 'delete'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 text-indigo-300"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
								{/if}
							</div>
							<div>
								<div class="text-sm font-medium text-indigo-200">
									{#if recentToolActivity.action === 'create'}
										Task Created
									{:else if recentToolActivity.action === 'toggle'}
										Task Updated
									{:else if recentToolActivity.action === 'edit'}
										Task Edited
									{:else if recentToolActivity.action === 'delete'}
										Task Deleted
									{/if}
								</div>
								<div class="text-xs text-indigo-300/80">
									{recentToolActivity.message}
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Todo List -->
			<div class="space-y-3">
				{#if todoEntries.length === 0}
					<div
						class="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-12 text-white/60 backdrop-blur-sm"
					>
						No todos yet. Start by saying "Create a todo to..."
					</div>
				{:else}
					{#each todoEntries.filter(([_, todo]) => selectedTag === null || todo.tags.includes(selectedTag)) as [id, todo] (id)}
						<div
							class="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors hover:bg-white/10"
						>
							<div class="flex flex-col p-4">
								<div class="flex items-center justify-between">
									<div class="flex min-w-0 flex-1 items-center gap-4">
										<div
											class={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
												todo.completed
													? 'border-green-500 bg-green-500/20 text-green-400'
													: 'border-white/20 bg-white/5 text-transparent'
											}`}
										>
											{#if todo.completed}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-4 w-4"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2.5"
														d="M5 13l4 4L19 7"
													/>
												</svg>
											{/if}
										</div>
										<span
											class={todo.completed
												? 'truncate text-white/50 line-through'
												: 'truncate text-white/90'}
										>
											{todo.text}
										</span>
									</div>
									<span class="text-xs text-white/40">
										{formatDate(todo.createdAt)}
									</span>
								</div>

								{#if todo.tags && todo.tags.length > 0}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each todo.tags as tag}
											<span class="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
												{tag}
											</span>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>

	<!-- Right sidebar for activity log -->
	<div class="lg:col-span-1">
		<div class="sticky top-6 p-4">
			<!-- Skills Section -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Skills</h3>
				<div class="space-y-3">
					<div class="rounded-lg border border-white/5 bg-white/5 p-3">
						<div class="flex items-center gap-2">
							<div class="rounded-full bg-blue-500/20 p-1.5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3.5 w-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 6v6m0 0v6m0-6h6m-6 0H6"
									/>
								</svg>
							</div>
							<div class="text-xs font-medium text-white/80">Create Todo</div>
						</div>
						<div class="mt-1 text-xs text-white/70">Add new task with tags</div>
					</div>
					<div class="rounded-lg border border-white/5 bg-white/5 p-3">
						<div class="flex items-center gap-2">
							<div class="rounded-full bg-green-500/20 p-1.5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3.5 w-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							</div>
							<div class="text-xs font-medium text-white/80">Toggle Todo</div>
						</div>
						<div class="mt-1 text-xs text-white/70">Mark task complete/incomplete</div>
					</div>
					<div class="rounded-lg border border-white/5 bg-white/5 p-3">
						<div class="flex items-center gap-2">
							<div class="rounded-full bg-indigo-500/20 p-1.5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3.5 w-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
									/>
								</svg>
							</div>
							<div class="text-xs font-medium text-white/80">Update Todo</div>
						</div>
						<div class="mt-1 text-xs text-white/70">Edit task text and tags</div>
					</div>
					<div class="rounded-lg border border-white/5 bg-white/5 p-3">
						<div class="flex items-center gap-2">
							<div class="rounded-full bg-red-500/20 p-1.5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3.5 w-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
									/>
								</svg>
							</div>
							<div class="text-xs font-medium text-white/80">Remove Todo</div>
						</div>
						<div class="mt-1 text-xs text-white/70">Delete task from list</div>
					</div>
					<div class="rounded-lg border border-white/5 bg-white/5 p-3">
						<div class="flex items-center gap-2">
							<div class="rounded-full bg-purple-500/20 p-1.5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3.5 w-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
									/>
								</svg>
							</div>
							<div class="text-xs font-medium text-white/80">Filter Todos</div>
						</div>
						<div class="mt-1 text-xs text-white/70">Show tasks by tag</div>
					</div>
				</div>
			</div>

			<!-- Tool Status Area -->
			<div class="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Recent Activity</h3>
				{#if toolState.history.length > 0}
					<div class="max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
						<div class="space-y-3">
							{#each toolState.history as entry, i}
								<div class="rounded-lg border border-white/5 bg-white/5 p-3">
									<div class="flex items-center gap-2">
										<div
											class={`rounded-full p-1.5 ${
												entry.success
													? entry.action === 'create'
														? 'bg-blue-500/20'
														: entry.action === 'toggle'
															? 'bg-green-500/20'
															: entry.action === 'edit'
																? 'bg-indigo-500/20'
																: entry.action === 'delete'
																	? 'bg-red-500/20'
																	: 'bg-gray-500/20'
													: 'bg-orange-500/20'
											}`}
										>
											{#if entry.action === 'create'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M12 6v6m0 0v6m0-6h6m-6 0H6"
													/>
												</svg>
											{:else if entry.action === 'toggle'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M5 13l4 4L19 7"
													/>
												</svg>
											{:else if entry.action === 'edit'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
													/>
												</svg>
											{:else if entry.action === 'delete'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
													/>
												</svg>
											{/if}
										</div>
										<div class="text-xs font-medium text-white/80 capitalize">
											{entry.action}
										</div>
										<div class="ml-auto text-[10px] text-white/50">
											{new Date(entry.timestamp).toLocaleTimeString()}
										</div>
									</div>
									<div class="mt-1.5 text-xs text-white/70">
										{entry.message}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<p class="text-sm text-white/60">
						Activity will appear here as you create and update tasks with voice commands.
					</p>
				{/if}
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
	}
</style>
