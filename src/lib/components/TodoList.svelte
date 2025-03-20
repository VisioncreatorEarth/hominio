<script lang="ts">
	import { currentFilter } from '$lib/ultravox/toolImplementation';
	import { loroStorage } from '$lib/stores/loroStorage';
	import { onMount } from 'svelte';

	// Todo item type
	type Todo = {
		id: string;
		text: string;
		completed: boolean;
		tags: string[];
	};

	// Local state
	let todos: Todo[] = $state([]);
	let filteredTodos: Todo[] = $state([]);
	let currentTag = $state('all');

	// Update filtered todos when the filter changes
	$effect(() => {
		const filter = $currentFilter;
		currentTag = filter;

		if (filter === 'all') {
			filteredTodos = todos;
		} else {
			filteredTodos = todos.filter((todo) => todo.tags.includes(filter));
		}
	});

	// Fetch todos on mount
	onMount(async () => {
		// Example implementation - replace with your actual Loro data fetch
		try {
			// This is a placeholder - implement your actual Loro data fetching here
			todos = [
				{ id: '1', text: 'Buy groceries', completed: false, tags: ['shopping', 'personal'] },
				{ id: '2', text: 'Finish report', completed: true, tags: ['work', 'urgent'] },
				{ id: '3', text: 'Call doctor', completed: false, tags: ['health', 'personal'] }
			];
		} catch (error) {
			console.error('Error fetching todos:', error);
		}
	});
</script>

<div class="rounded-lg border border-white/10 bg-slate-800/50 p-4 backdrop-blur-sm">
	<h2 class="mb-4 text-2xl font-bold text-white">My Todos</h2>

	<!-- Current Filter Display -->
	<div class="mb-4 flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="text-white/70">Filter:</span>
			<span class="rounded-full bg-indigo-500/20 px-3 py-1 text-sm text-white">{currentTag}</span>
		</div>

		<!-- Manual Filter Buttons -->
		<div class="flex gap-2">
			<button
				class="rounded-md bg-white/5 px-3 py-1 text-sm text-white/90 transition-colors hover:bg-white/10"
				on:click={() => currentFilter.set('all')}
			>
				All
			</button>
			<button
				class="rounded-md bg-white/5 px-3 py-1 text-sm text-white/90 transition-colors hover:bg-white/10"
				on:click={() => currentFilter.set('work')}
			>
				Work
			</button>
			<button
				class="rounded-md bg-white/5 px-3 py-1 text-sm text-white/90 transition-colors hover:bg-white/10"
				on:click={() => currentFilter.set('personal')}
			>
				Personal
			</button>
		</div>
	</div>

	<!-- Todo List -->
	<ul class="space-y-2">
		{#each filteredTodos as todo}
			<li
				class="flex items-center justify-between rounded-md bg-white/5 p-3 transition-colors hover:bg-white/10"
			>
				<div class="flex items-center gap-3">
					<input
						type="checkbox"
						checked={todo.completed}
						class="h-5 w-5 rounded-md border-white/20 bg-white/5 checked:bg-indigo-500"
					/>
					<span class={todo.completed ? 'text-white/60 line-through' : 'text-white/90'}>
						{todo.text}
					</span>
				</div>

				<!-- Tags -->
				<div class="flex gap-1">
					{#each todo.tags as tag}
						<span
							class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-white/80"
							on:click={() => currentFilter.set(tag)}>{tag}</span
						>
					{/each}
				</div>
			</li>
		{/each}

		{#if filteredTodos.length === 0}
			<li class="py-10 text-center text-white/50">
				{currentTag === 'all'
					? 'No todos found. Add one to get started!'
					: `No todos with the tag "${currentTag}" found.`}
			</li>
		{/if}
	</ul>
</div>
