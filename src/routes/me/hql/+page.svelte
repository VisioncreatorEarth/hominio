<script lang="ts">
	// REMOVED: import SyncStatusUI from '$lib/components/SyncStatusUI.svelte';
	import SchemaQueries from '$lib/components/SchemaQueries.svelte';
	import LeafQueries from '$lib/components/LeafQueries.svelte';
	import QueryEditor from '$lib/components/QueryEditor.svelte';
	import IndexQueries from '$lib/components/IndexQueries.svelte';
	import DocStatusViewer from '$lib/components/DocStatusViewer.svelte';
	import { pageMetadataStore } from '$lib/stores/layoutStore';
	import type { PageData } from './$types';

	// Use $props() for runes mode
	let { data } = $props<{ data: PageData }>();

	// Use $effect to update the store when data changes
	$effect(() => {
		if (data.title && data.description) {
			$pageMetadataStore = { title: data.title, description: data.description };
		}
	});

	// Tab state
	let activeTab = $state('schema');

	// Function to change active tab
	function setActiveTab(tab: string) {
		activeTab = tab;
	}
</script>

<!-- REMOVED: Outer div and header section -->
<!-- The parent layout now provides the overall structure and header -->

<!-- Navigation Tabs -->
<nav class="flex border-b border-gray-300 bg-[#f8f4ed] px-4">
	<button
		class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'schema'
			? 'border-[#0a2a4e] text-[#0a2a4e]'
			: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
		on:click={() => setActiveTab('schema')}
	>
		Schemata
	</button>
	<button
		class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'leaf'
			? 'border-[#0a2a4e] text-[#0a2a4e]'
			: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
		on:click={() => setActiveTab('leaf')}
	>
		Leafs
	</button>
	<button
		class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'query-editor'
			? 'border-[#0a2a4e] text-[#0a2a4e]'
			: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
		on:click={() => setActiveTab('query-editor')}
	>
		Query Editor
	</button>
	<button
		class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'indices'
			? 'border-[#0a2a4e] text-[#0a2a4e]'
			: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
		on:click={() => setActiveTab('indices')}
	>
		Indices
	</button>
	<button
		class="border-b-2 px-4 py-2 font-medium transition-colors {activeTab === 'doc-status'
			? 'border-[#0a2a4e] text-[#0a2a4e]'
			: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#0a2a4e]'}"
		on:click={() => setActiveTab('doc-status')}
	>
		Docs Status
	</button>
</nav>

<!-- Main Content Area for Tabs -->
<!-- Removed wrapping div, assuming parent layout handles scrolling -->
{#if activeTab === 'schema'}
	<div class="h-full">
		<SchemaQueries />
	</div>
{:else if activeTab === 'leaf'}
	<div class="h-full">
		<LeafQueries />
	</div>
{:else if activeTab === 'query-editor'}
	<div class="h-full">
		<QueryEditor />
	</div>
{:else if activeTab === 'indices'}
	<div class="h-full">
		<IndexQueries />
	</div>
{:else if activeTab === 'doc-status'}
	<div class="h-full">
		<DocStatusViewer />
	</div>
{/if}
