<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { LoroDoc, type Value } from 'loro-crdt';
	import type { ClientToolImplementation } from 'ultravox-client';
	import { fade } from 'svelte/transition';

	// Define Todo interface
	interface TodoItem {
		id: string;
		text: string;
		completed: boolean;
		createdAt: number;
	}

	// Initialize LoroDoc for todos
	const todoDoc = new LoroDoc();
	const todos = todoDoc.getMap('todos');

	// State variables
	let todoEntries = $state<[string, TodoItem][]>([]);
	let newTodoText = $state('');
	let recentToolActivity = $state<{ action: string; message: string; timestamp: number } | null>(
		null
	);

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
	function addTodo(text: string): string {
		if (!text.trim()) return '';

		const todoId = crypto.randomUUID();
		const todoItem: TodoItem = {
			id: todoId,
			text: text.trim(),
			completed: false,
			createdAt: Date.now()
		};

		todos.set(todoId, todoItem as unknown as Value);
		newTodoText = '';
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
	}

	// Toggle todo completion by clicking
	function toggleTodo(id: string) {
		toggleTodoById(id);
	}

	// Delete a todo
	function deleteTodo(id: string) {
		todos.delete(id);
		updateTodoEntries();
	}

	// Format date for display
	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}

	// Handle form submission
	function handleSubmit(event: Event) {
		event.preventDefault();
		if (newTodoText.trim()) {
			const todoId = addTodo(newTodoText);
			logToolActivity('create', `Todo "${newTodoText}" created successfully`);
		}
	}

	// Tool implementations based on AskHominio.svelte pattern
	// Ultravox client tool implementation for creating a todo
	const createTodoTool = (parameters: any) => {
		console.log('Called createTodo tool with parameters:', parameters);
		try {
			const { todoText } = parameters;
			toolState.pendingAction = 'create';

			if (typeof todoText === 'string' && todoText.trim()) {
				const newTodoId = addTodo(todoText.trim());

				const result = {
					success: true,
					message: `Created todo: "${todoText}"`
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
		} catch (error) {
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

	// Following the pattern in askHominio.ts, register tools with window
	onMount(() => {
		// Define Hominio tools in the global scope
		if (typeof window !== 'undefined') {
			// Expose the tool implementations directly on window
			(window as any).__hominio_tools = {
				createTodo: createTodoTool,
				toggleTodo: toggleTodoTool
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

						console.log('Hominio todo tools registered successfully');
					} catch (error) {
						console.error('Error registering tools:', error);
					}
				} else {
					console.error('Invalid Ultravox session or missing registerToolImplementation method');
				}
			};

			console.log('Hominio tools ready for registration');
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

<div class="container mx-auto max-w-4xl p-6">
	<!-- Header -->
	<div class="mb-8 text-center">
		<h1 class="text-3xl font-bold text-white/95">Hominio Voice Todos</h1>
		<p class="mt-2 text-white/70">
			Manage your tasks using voice commands or type below. Try saying "Create a todo to..."
		</p>
	</div>

	<!-- Add Todo Form -->
	<form on:submit={handleSubmit} class="mb-8">
		<div class="flex gap-3">
			<input
				type="text"
				bind:value={newTodoText}
				placeholder="What needs to be done?"
				class="flex-grow rounded-xl border border-white/10 bg-white/5 p-4 text-white placeholder-white/50 backdrop-blur-sm focus:border-blue-500 focus:outline-none"
			/>
			<button
				type="submit"
				class="rounded-xl bg-blue-500/30 px-6 py-4 font-medium text-white backdrop-blur-sm transition-all hover:bg-blue-500/40"
			>
				Add Todo
			</button>
		</div>
	</form>

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
						{/if}
					</div>
					<div>
						<div class="text-sm font-medium text-indigo-200">
							{recentToolActivity.action === 'create' ? 'Task Created' : 'Task Updated'}
						</div>
						<div class="text-xs text-indigo-300/80">
							{recentToolActivity.message}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Instructions Card -->
	<div class="mb-8 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
		<h2 class="mb-3 text-xl font-semibold text-white/90">Voice Commands</h2>
		<div class="space-y-2 text-white/80">
			<p class="flex items-center gap-2">
				<span class="rounded-full bg-blue-500/20 p-1">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
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
				</span>
				"Create a todo to buy groceries"
			</p>
			<p class="flex items-center gap-2">
				<span class="rounded-full bg-green-500/20 p-1">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
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
				</span>
				"Mark the todo about groceries as complete"
			</p>
		</div>
	</div>

	<!-- Todo List -->
	<div class="space-y-3">
		{#if todoEntries.length === 0}
			<div
				class="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-12 text-white/60 backdrop-blur-sm"
			>
				No todos yet. Add one to get started!
			</div>
		{:else}
			{#each todoEntries as [id, todo] (id)}
				<div
					class="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-colors hover:bg-white/10"
				>
					<div class="flex min-w-0 flex-1 items-center gap-4">
						<button
							on:click={() => toggleTodo(id)}
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
						</button>
						<span
							class={todo.completed
								? 'truncate text-white/50 line-through'
								: 'truncate text-white/90'}
						>
							{todo.text}
						</span>
					</div>
					<div class="flex items-center gap-3">
						<span class="text-xs text-white/40">
							{formatDate(todo.createdAt)}
						</span>
						<button
							on:click={() => deleteTodo(id)}
							class="ml-2 rounded-full p-1.5 text-white/60 hover:bg-red-500/20 hover:text-white/90"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
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
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Tool Status Area -->
	{#if toolState.history.length > 0}
		<div class="mt-8 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
			<h3 class="mb-3 text-lg font-semibold text-white/80">Recent Activity</h3>
			<div class="max-h-40 overflow-y-auto">
				<table class="w-full text-sm text-white/70">
					<thead class="text-xs text-white/50 uppercase">
						<tr>
							<th class="px-2 py-1 text-left">Time</th>
							<th class="px-2 py-1 text-left">Action</th>
							<th class="px-2 py-1 text-left">Status</th>
						</tr>
					</thead>
					<tbody>
						{#each toolState.history as entry, i}
							<tr class="border-t border-white/5">
								<td class="px-2 py-1 text-xs">
									{new Date(entry.timestamp).toLocaleTimeString()}
								</td>
								<td class="px-2 py-1 capitalize">{entry.action}</td>
								<td class="px-2 py-1">
									<span class={entry.success ? 'text-green-400' : 'text-red-400'}>
										{entry.success ? '✓' : '✕'}
										{entry.message}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<div class="mt-8 text-center text-sm text-white/50">
		<p>Powered by Loro CRDT and Ultravox Voice AI</p>
	</div>
</div>

<style lang="postcss">
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
	}
</style>
