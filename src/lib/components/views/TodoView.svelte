<script lang="ts">
	import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
	import type { TodoItem } from '$lib/docs/schemas/todo';
	import { filterState } from '$lib/tools/filterTodos/function';
	import { getAllUniqueTags } from '$lib/tools/filterTodos/function';
	import { onMount } from 'svelte';
	import { writable, type Writable } from 'svelte/store';

	// Create a store to hold our todos
	const todos: Writable<[string, TodoItem][]> = writable([]);
	// Create a store for filtered todos
	const filteredTodos: Writable<[string, TodoItem][]> = writable([]);
	// Create a store for tags
	const tagsList: Writable<string[]> = writable([]);

	// Initialize LoroAPI and set up subscriptions
	async function initTodos() {
		try {
			// Get the LoroAPI instance
			const loroAPI = getLoroAPIInstance();

			// Get operations for todo schema
			const ops = await loroAPI.getOperations<TodoItem>('todo');

			// Subscribe to the todos store
			ops.store.subscribe((value) => {
				todos.set(value);
				updateFilteredTodos();
				// Try to update tags when todos change
				refreshTags();
			});

			// Initial load of tags
			await refreshTags();
		} catch (error) {
			console.error('Error initializing todos:', error);
		}
	}

	// Load tags from getAllUniqueTags
	async function refreshTags() {
		try {
			const tags = await getAllUniqueTags();
			tagsList.set(tags);
		} catch (error) {
			console.error('Error loading tags:', error);
			tagsList.set([]);
		}
	}

	// Update filtered todos based on the filter state
	function updateFilteredTodos() {
		let filtered = [];

		// Get current values from stores
		const todosList = $todos;
		const { tag, docId } = $filterState;

		// Apply filters
		filtered = todosList.filter(([, todo]) => {
			if (tag === null) {
				return todo.docId === docId;
			}
			return todo.docId === docId && todo.tags && todo.tags.includes(tag);
		});

		filteredTodos.set(filtered);
	}

	// Format date for display
	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}

	// Filter todos by tag
	function filterByTag(tag: string | null) {
		filterState.update((state) => ({ ...state, tag }));
		updateFilteredTodos();
	}

	// Watch for filter state changes to update filtered todos
	$: {
		if ($filterState) {
			updateFilteredTodos();
		}
	}

	// Initialize when component mounts
	onMount(async () => {
		await initTodos();
	});
</script>

<div class="mx-auto max-w-7xl bg-[#f8f4ed] p-4 sm:p-6">
	<!-- Tags Filter -->
	{#if $tagsList.length > 0}
		<div class="mb-6 rounded-xl border border-[#d6c7b1] bg-[#f5f1e8] p-4">
			<h3 class="mb-2 text-sm font-medium text-gray-600">Filter by tag:</h3>
			<div class="flex flex-wrap gap-2">
				<button
					on:click={() => filterByTag(null)}
					class={`rounded-lg px-3 py-1 text-sm transition-colors ${
						$filterState.tag === null
							? 'bg-[#0a2a4e] text-[#f8f4ed]'
							: 'bg-[#e0d8cb] text-[#0a2a4e] hover:bg-[#c5d4e8]'
					}`}
				>
					All
				</button>
				{#each $tagsList as tag}
					<button
						on:click={() => filterByTag(tag)}
						class={`rounded-lg px-3 py-1 text-sm transition-colors ${
							$filterState.tag === tag
								? 'bg-[#0a2a4e] text-[#f8f4ed]'
								: 'bg-[#e0d8cb] text-[#0a2a4e] hover:bg-[#c5d4e8]'
						}`}
					>
						{tag}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Todo List -->
	<div class="space-y-3">
		{#if $filteredTodos.length === 0}
			<div
				class="flex items-center justify-center rounded-xl border border-[#d6c7b1] bg-[#f5f1e8] p-12 text-gray-500"
			>
				No todos yet. Start by saying "Create a todo to..."
			</div>
		{:else}
			{#each $filteredTodos as [id, todo] (id)}
				<div
					class="rounded-xl border border-[#d6c7b1] bg-[#f5f1e8] transition-colors hover:bg-[#e0d8cb]"
				>
					<div class="flex flex-col p-4">
						<div class="flex items-center justify-between">
							<div class="flex min-w-0 flex-1 items-center gap-4">
								<div
									class={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
										todo.completed
											? 'border-green-500 bg-green-100 text-green-600'
											: 'border-gray-300 bg-gray-100 text-transparent'
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
										? 'truncate text-gray-500 line-through'
										: 'truncate text-[#0a2a4e]'}
								>
									{todo.text}
								</span>
							</div>
							<span class="text-xs text-gray-400">
								{formatDate(todo.createdAt)}
							</span>
						</div>

						{#if todo.tags && todo.tags.length > 0}
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#each todo.tags as tag}
									<span class="rounded-md bg-[#c5d4e8] px-2 py-0.5 text-xs text-[#0a2a4e]">
										{tag}
									</span>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<div
					class="flex items-center justify-center rounded-xl border border-[#d6c7b1] bg-[#f5f1e8] p-12 text-gray-500"
				>
					No todos match the selected filter
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	/* Removed custom hover style */
</style>
