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
		if (!mood) return 'bg-gray-500/30 text-gray-300';

		const colorMap: Record<string, string> = {
			happy: 'bg-yellow-500/30 text-yellow-200',
			sad: 'bg-blue-500/30 text-blue-200',
			excited: 'bg-pink-500/30 text-pink-200',
			angry: 'bg-red-500/30 text-red-200',
			neutral: 'bg-gray-500/30 text-gray-200',
			relaxed: 'bg-green-500/30 text-green-200',
			anxious: 'bg-purple-500/30 text-purple-200',
			thoughtful: 'bg-cyan-500/30 text-cyan-200'
		};

		return colorMap[mood.toLowerCase()] || 'bg-gray-500/30 text-gray-300';
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
		<h1 class="text-3xl font-bold tracking-tight text-white">Journal</h1>
		<p class="mt-2 text-lg text-white/70">Reflect on your thoughts and experiences</p>
	</div>

	<!-- Entry Detail Modal -->
	{#if showDetail && selectedEntry}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		>
			<div
				class="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-gray-900 p-6 shadow-xl"
			>
				<button
					on:click={closeDetail}
					class="absolute top-4 right-4 rounded-full bg-gray-800 p-2 text-white/70 hover:bg-gray-700 hover:text-white"
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
						<h2 class="text-2xl font-semibold text-white">{selectedEntry[1].title}</h2>
						{#if selectedEntry[1].mood}
							<span
								class={`ml-3 rounded-lg px-3 py-1 text-base font-medium ${getMoodColor(selectedEntry[1].mood)}`}
							>
								{getMoodText(selectedEntry[1].mood)}
							</span>
						{/if}
					</div>

					<div class="mb-6 text-sm text-white/60">
						{formatDate(selectedEntry[1].createdAt)}
					</div>

					{#if selectedEntry[1].tags && selectedEntry[1].tags.length > 0}
						<div class="mb-4 flex flex-wrap gap-1.5">
							{#each selectedEntry[1].tags as tag}
								<span class="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
									{tag}
								</span>
							{/each}
						</div>
					{/if}

					<div class="prose prose-invert mt-6 max-w-none whitespace-pre-wrap">
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
				class="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-12 text-white/60 backdrop-blur-sm"
			>
				No journal entries yet. Start by saying "Add a journal entry about..."
			</div>
		{:else}
			{#each sortedEntries as entry (entry[0])}
				<div
					class="cursor-pointer rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors hover:bg-white/10"
					on:click={() => viewEntry(entry)}
				>
					<div class="p-5">
						<div class="mb-3 flex items-center justify-between">
							<div class="flex items-center">
								<h3 class="text-xl font-medium text-white/90">{entry[1].title}</h3>
								{#if entry[1].mood}
									<span
										class={`ml-3 rounded-lg px-3 py-1 text-base font-medium ${getMoodColor(entry[1].mood)}`}
									>
										{getMoodText(entry[1].mood)}
									</span>
								{/if}
							</div>
							<span class="text-xs text-white/40">
								{formatDate(entry[1].createdAt)}
							</span>
						</div>

						{#if entry[1].tags && entry[1].tags.length > 0}
							<div class="mb-3 flex flex-wrap gap-1.5">
								{#each entry[1].tags as tag}
									<span class="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
										{tag}
									</span>
								{/each}
							</div>
						{/if}

						<p class="whitespace-pre-wrap text-white/70">
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
		box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
	}
</style>
