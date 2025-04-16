<script lang="ts">
	import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
	import type { JournalEntry } from '$lib/docs/schemas/journalEntry';
	import { onMount } from 'svelte';
	import { writable, type Writable } from 'svelte/store';

	// Create a store to hold our journal entries
	const entries: Writable<[string, JournalEntry][]> = writable([]);

	// Initialize LoroAPI and set up subscriptions
	async function initJournal() {
		try {
			// Get the LoroAPI instance
			const loroAPI = getLoroAPIInstance();

			// Get operations for journal entry schema
			const ops = await loroAPI.getOperations<JournalEntry>('journalEntry');

			// Subscribe to the entries store
			ops.store.subscribe((value) => {
				entries.set(value);
			});
		} catch (error) {
			console.error('Error initializing journal:', error);
		}
	}

	// Sort entries by date (newest first)
	$: sortedEntries = [...$entries].sort(([, a], [, b]) => b.createdAt - a.createdAt);

	// Format date for display
	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Mood colors map
	function getMoodColor(mood?: string): string {
		if (!mood) return 'bg-gray-200 text-gray-700';

		const colorMap: Record<string, string> = {
			happy: 'bg-yellow-100 text-yellow-800',
			sad: 'bg-blue-100 text-blue-800',
			excited: 'bg-pink-100 text-pink-800',
			angry: 'bg-red-100 text-red-800',
			neutral: 'bg-gray-200 text-gray-700',
			relaxed: 'bg-green-100 text-green-800',
			anxious: 'bg-purple-100 text-purple-800',
			thoughtful: 'bg-cyan-100 text-cyan-800'
		};

		return colorMap[mood.toLowerCase()] || 'bg-gray-200 text-gray-700';
	}

	// Get capitalized mood text
	function getMoodText(mood?: string): string {
		if (!mood) return '';
		return mood.charAt(0).toUpperCase() + mood.slice(1);
	}

	// Currently selected entry for detail view
	let selectedEntry: [string, JournalEntry] | null = null;

	// Flag to control detail view display
	let showDetail = false;

	// Select an entry to view in detail
	function viewEntry(entry: [string, JournalEntry]) {
		selectedEntry = entry;
		showDetail = true;
	}

	// Close detail view
	function closeDetail() {
		showDetail = false;
	}

	// Initialize when component mounts
	onMount(() => {
		initJournal();
	});
</script>

<div class="mx-auto max-w-7xl p-4 sm:p-6">
	<!-- Header Section -->
	<div class="mb-8 text-center">
		<h1 class="text-3xl font-bold tracking-tight text-gray-800">Journal</h1>
		<p class="mt-2 text-lg text-gray-600">Reflect on your thoughts and experiences</p>
	</div>

	<!-- Entry Detail Modal -->
	{#if showDetail && selectedEntry}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm"
		>
			<div
				class="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-gray-300 bg-white p-6 shadow-xl"
			>
				<button
					on:click={closeDetail}
					class="absolute top-4 right-4 rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-gray-200 hover:text-gray-800"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>

				<div class="mt-2">
					<div class="mb-4 flex items-center">
						<h2 class="text-2xl font-semibold text-gray-800">{selectedEntry[1].title}</h2>
						{#if selectedEntry[1].mood}
							<span
								class={`ml-3 rounded-lg px-3 py-1 text-base font-medium ${getMoodColor(selectedEntry[1].mood)}`}
							>
								{getMoodText(selectedEntry[1].mood)}
							</span>
						{/if}
					</div>

					<div class="mb-6 text-sm text-gray-500">
						{formatDate(selectedEntry[1].createdAt)}
					</div>

					{#if selectedEntry[1].tags && selectedEntry[1].tags.length > 0}
						<div class="mb-4 flex flex-wrap gap-1.5">
							{#each selectedEntry[1].tags as tag}
								<span class="rounded-md bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
									{tag}
								</span>
							{/each}
						</div>
					{/if}

					<div class="prose prose-gray mt-6 max-w-none whitespace-pre-wrap">
						{selectedEntry[1].content}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Journal Entries List -->
	<div class="space-y-4">
		{#if sortedEntries.length === 0}
			<div
				class="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-12 text-gray-500"
			>
				No journal entries yet. Start by saying "Add a journal entry about..."
			</div>
		{:else}
			{#each sortedEntries as entry (entry[0])}
				<div
					class="cursor-pointer rounded-xl border border-gray-200 bg-white backdrop-blur-sm transition-colors hover:bg-gray-50 hover:shadow-md"
					on:click={() => viewEntry(entry)}
				>
					<div class="p-5">
						<div class="mb-3 flex items-center justify-between">
							<div class="flex items-center">
								<h3 class="text-xl font-medium text-gray-800">{entry[1].title}</h3>
								{#if entry[1].mood}
									<span
										class={`ml-3 rounded-lg px-3 py-1 text-base font-medium ${getMoodColor(entry[1].mood)}`}
									>
										{getMoodText(entry[1].mood)}
									</span>
								{/if}
							</div>
							<span class="text-xs text-gray-400">
								{formatDate(entry[1].createdAt)}
							</span>
						</div>

						{#if entry[1].tags && entry[1].tags.length > 0}
							<div class="mb-3 flex flex-wrap gap-1.5">
								{#each entry[1].tags as tag}
									<span class="rounded-md bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
										{tag}
									</span>
								{/each}
							</div>
						{/if}

						<p class="whitespace-pre-wrap text-gray-700">
							{entry[1].content}
						</p>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	/* Add subtle transitions */
	.rounded-xl {
		transition: all 0.2s ease-in-out;
	}
	.rounded-xl:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); /* Lighter shadow for light theme */
	}
</style>
