<!-- 
  Simple in-memory Todos page - No persistence
-->
<script lang="ts">
	import { onMount } from 'svelte';

	// Define Todo type
	interface Todo {
		id: string;
		text: string;
		completed: boolean;
		createdAt: number;
	}

	// State variables
	let todos: Todo[] = [];
	let newTodoText = '';
	let isReady = true;

	// Generate a simple UUID
	function generateId() {
		return (
			Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
		);
	}

	// Add a new todo
	function addTodo() {
		if (!newTodoText.trim()) return;

		const todo: Todo = {
			id: generateId(),
			text: newTodoText,
			completed: false,
			createdAt: Date.now()
		};

		todos = [todo, ...todos];
		newTodoText = '';
	}

	// Toggle todo completion status
	function toggleTodo(id: string) {
		todos = todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo));
	}

	// Delete a todo
	function deleteTodo(id: string) {
		todos = todos.filter((todo) => todo.id !== id);
	}

	// Initialize with sample todo
	onMount(() => {
		todos = [
			{
				id: generateId(),
				text: 'Welcome to your todo list!',
				completed: false,
				createdAt: Date.now()
			}
		];
	});

	// Handle form submission
	function handleSubmit(event: Event) {
		event.preventDefault();
		addTodo();
	}
</script>

<div class="min-h-full bg-blue-950 text-emerald-100">
	<div class="mx-auto max-w-4xl">
		<div class="mb-6">
			<h1 class="text-3xl font-bold text-emerald-400">Todos</h1>
			<p class="mt-1 text-sm text-emerald-200">Simple in-memory todos (no persistence)</p>
		</div>

		{#if !isReady}
			<!-- Loading State -->
			<div class="p-8 text-center">
				<div
					class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-800 border-t-emerald-500"
				></div>
				<p class="mt-4 text-emerald-200">Loading...</p>
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
				<p>In-memory only - no persistence</p>
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
