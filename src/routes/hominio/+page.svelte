<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		todos,
		todoState,
		todoDocuments,
		toolState,
		recentToolActivity,
		initTodoStore,
		cleanupTodoStore,
		getActiveDocName,
		getAllUniqueTags,
		switchToDocument,
		filterTodosByTag
	} from '$lib/stores/todoStore';
	import { currentAgent } from '$lib/ultravox/agents';
	import { registerToolsFromRegistry } from '$lib/ultravox/loaders/toolLoader';

	// Initialize the todo store and get the unsubscribe function
	let unsubscribeTodo: () => void;

	onMount(() => {
		// Set the default agent to Hominio (the orchestrator)
		currentAgent.set('Hominio');

		// Initialize the todo store
		unsubscribeTodo = initTodoStore();

		// Register tools with Ultravox immediately
		// This is important for voice commands to work
		registerToolsFromRegistry();

		// Also register tools when Ultravox is loaded/reloaded
		window.addEventListener('ultravox-ready', () => {
			console.log('🔄 Ultravox ready event detected, registering tools...');
			registerToolsFromRegistry();
		});
	});

	// Clean up on component destroy
	onDestroy(() => {
		if (unsubscribeTodo) {
			unsubscribeTodo();
		}
		cleanupTodoStore();

		// Remove the event listener
		window.removeEventListener('ultravox-ready', () => {
			registerToolsFromRegistry();
		});
	});

	// Format date for display
	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}
</script>

<div class="mx-auto grid max-w-full grid-cols-1 gap-6 lg:grid-cols-6 lg:px-4">
	<!-- Left sidebar for Loro document list -->
	<div class="lg:col-span-1">
		<div class="sticky top-6 p-4">
			<!-- Loro Documents Section -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Todo Lists</h3>
				<div class="space-y-3">
					{#each $todoDocuments as doc}
						<button
							on:click={() => switchToDocument(doc.id)}
							class={`w-full rounded-lg border ${
								$todoState.activeDocId === doc.id
									? 'border-blue-500/30 bg-blue-500/10 text-blue-100'
									: 'border-white/5 bg-white/5 hover:bg-white/10'
							} p-3 text-left transition-colors`}
						>
							<div class="flex items-center gap-2">
								<div
									class={`rounded-full ${
										$todoState.activeDocId === doc.id ? 'bg-blue-500/30' : 'bg-blue-500/20'
									} p-1.5`}
								>
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
						</button>
					{/each}
				</div>
			</div>

			<!-- Tags Section -->
			{#if getAllUniqueTags().length > 0}
				<div class="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
					<h3 class="mb-3 text-lg font-semibold text-white/80">Available Tags</h3>
					<div class="flex flex-wrap gap-2">
						{#key getAllUniqueTags().join(',')}
							{#each getAllUniqueTags() as tag}
								<button
									on:click={() => filterTodosByTag(tag)}
									class={`rounded-lg border ${
										$todoState.selectedTag === tag
											? 'border-purple-500/30 bg-purple-500/10 text-purple-100'
											: 'border-white/5 bg-white/5 hover:bg-white/10'
									} px-3 py-1 text-xs transition-colors`}
								>
									{tag}
								</button>
							{/each}
						{/key}
						{#if $todoState.selectedTag}
							<button
								on:click={() => filterTodosByTag(null)}
								class="rounded-lg border border-white/5 bg-white/5 px-3 py-1 text-xs text-white/60 hover:bg-white/10"
							>
								Clear Filter
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Main content area (centered, takes 4/6 of space on larger screens) -->
	<div class="lg:col-span-4">
		<div class="mx-auto max-w-7xl p-4 sm:p-6">
			<!-- Header -->
			<div class="mb-8 text-center">
				<h1 class="text-3xl font-bold text-white/95">Hominio Voice Todos</h1>
				<p class="mt-2 text-white/70">
					Currently viewing <span class="font-semibold text-blue-300">{getActiveDocName()}</span>
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
								$todoState.selectedTag === null
									? 'bg-blue-500/30 text-white'
									: 'bg-white/10 text-white/70 hover:bg-white/20'
							}`}
						>
							All
						</button>
						{#key getAllUniqueTags().join(',')}
							{#each getAllUniqueTags() as tag}
								<button
									on:click={() => filterTodosByTag(tag)}
									class={`rounded-lg px-3 py-1 text-sm transition-colors ${
										$todoState.selectedTag === tag
											? 'bg-blue-500/30 text-white'
											: 'bg-white/10 text-white/70 hover:bg-white/20'
									}`}
								>
									{tag}
								</button>
							{/each}
						{/key}
					</div>
				</div>
			{/if}

			<!-- Todo List -->
			<div class="space-y-3">
				{#if $todos.length === 0}
					<div
						class="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-12 text-white/60 backdrop-blur-sm"
					>
						No todos yet. Start by saying "Create a todo to..."
					</div>
				{:else}
					{#key [$todos.length, $todoState.selectedTag, $todoState.activeDocId]}
						{#each $todos.filter(([_, todo]) => $todoState.selectedTag === null || todo.tags.includes($todoState.selectedTag)) as [id, todo] (id)}
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
												<span
													class="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200"
												>
													{tag}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						{:else}
							<div
								class="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-12 text-white/60 backdrop-blur-sm"
							>
								No todos match the selected filter
							</div>
						{/each}
					{/key}
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
					<div class="rounded-lg border border-white/5 bg-white/5 p-3">
						<div class="flex items-center gap-2">
							<div class="rounded-full bg-amber-500/20 p-1.5">
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
										d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
							</div>
							<div class="text-xs font-medium text-white/80">Create List</div>
						</div>
						<div class="mt-1 text-xs text-white/70">Add new todo list</div>
					</div>
					<div class="rounded-lg border border-white/5 bg-white/5 p-3">
						<div class="flex items-center gap-2">
							<div class="rounded-full bg-cyan-500/20 p-1.5">
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
										d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
									/>
								</svg>
							</div>
							<div class="text-xs font-medium text-white/80">Switch List</div>
						</div>
						<div class="mt-1 text-xs text-white/70">Change current todo list</div>
					</div>
					<div class="rounded-lg border border-white/5 bg-white/5 p-3">
						<div class="flex items-center gap-2">
							<div class="rounded-full bg-teal-500/20 p-1.5">
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
										d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
									/>
								</svg>
							</div>
							<div class="text-xs font-medium text-white/80">Switch Agent</div>
						</div>
						<div class="mt-1 text-xs text-white/70">Change who you're speaking with</div>
					</div>
				</div>
			</div>

			<!-- Tool Status Area -->
			<div class="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Recent Activity</h3>
				{#if $toolState.history.length > 0}
					<div class="max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
						<div class="space-y-3">
							{#each $toolState.history as entry, i}
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
																	: entry.action === 'filter'
																		? 'bg-purple-500/20'
																		: entry.action === 'createList'
																			? 'bg-amber-500/20'
																			: entry.action === 'switchList'
																				? 'bg-cyan-500/20'
																				: 'bg-teal-500/20'
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
											{:else if entry.action === 'filter'}
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
											{:else if entry.action === 'createList'}
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
														d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
													/>
												</svg>
											{:else if entry.action === 'switchList'}
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
														d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
													/>
												</svg>
											{:else if entry.action === 'switchAgent'}
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
														d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
													/>
												</svg>
											{/if}
										</div>
										<div class="text-xs font-medium text-white/80 capitalize">
											{entry.action === 'createList'
												? 'create list'
												: entry.action === 'switchList'
													? 'switch list'
													: entry.action === 'switchAgent'
														? 'switch agent'
														: entry.action}
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
