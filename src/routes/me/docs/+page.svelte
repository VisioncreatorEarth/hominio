<script lang="ts">
	import { onMount } from 'svelte';
	import { hominio } from '$lib/client/hominio';
	import { PGlite } from '@electric-sql/pglite';
	import { drizzle } from 'drizzle-orm/pglite';
	import { docs, type Doc } from '$db/schema';
	import { sql } from 'drizzle-orm';

	interface DocContent {
		title: string;
		body: string;
		blocks: any[];
	}

	interface DocMetadata {
		tags: string[];
		author: string;
		status: string;
		createdBy: string;
	}

	interface DocWithContent extends Doc {
		content: DocContent;
		metadata: DocMetadata;
	}

	let remoteDocs: DocWithContent[] = [];
	let localDocs: DocWithContent[] = [];
	let error: string | null = null;
	let db: ReturnType<typeof drizzle>;

	onMount(async () => {
		try {
			// Initialize PGLite with in-memory storage
			const client = new PGlite();
			db = drizzle(client);

			// Create table schema
			await db.execute(sql`
				CREATE TABLE IF NOT EXISTS docs (
					id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
					content JSONB NOT NULL,
					metadata JSONB NOT NULL,
					created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
				);
			`);

			// Fetch remote docs
			const { data: response } = await hominio.api.docs.get();
			remoteDocs = (response || []) as DocWithContent[];

			// Query local docs
			const result = await db.select().from(docs);
			localDocs = result as DocWithContent[];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch docs';
			console.error('Error:', e);
		}
	});

	async function addLocalDoc() {
		if (!db) return;
		try {
			const newDoc = {
				content: {
					title: 'New Local Document',
					body: 'This document exists only in PGLite',
					blocks: []
				} as DocContent,
				metadata: {
					tags: ['local'],
					author: 'Local User',
					status: 'draft',
					createdBy: 'user'
				} as DocMetadata
			};

			await db.insert(docs).values(newDoc);
			const result = await db.select().from(docs);
			localDocs = result as DocWithContent[];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add local doc';
			console.error('Error adding local doc:', e);
		}
	}
</script>

<div class="min-h-screen bg-gray-900">
	<!-- Header -->
	<header class="border-b border-gray-800 bg-gray-900/50 px-6 py-4">
		<div class="flex items-center justify-between">
			<h1 class="text-3xl font-bold text-white">My Documents</h1>
			<div class="flex gap-4">
				<button
					on:click={addLocalDoc}
					class="rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
				>
					Add Local Doc
				</button>
				<a
					href="/me"
					class="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
				>
					Back to Dashboard
				</a>
			</div>
		</div>
	</header>

	{#if error}
		<div class="mx-6 my-4 rounded-lg border border-red-500 bg-red-500/10 p-4">
			<p class="text-red-400">{error}</p>
		</div>
	{/if}

	<!-- Main Content -->
	<div class="grid h-[calc(100vh-5rem)] grid-cols-2">
		<!-- Remote Docs -->
		<div class="border-r border-gray-800 p-6">
			<h2 class="mb-6 text-2xl font-semibold text-white">Remote Docs</h2>
			{#if remoteDocs.length === 0 && !error}
				<div class="rounded-lg border border-blue-500 bg-blue-500/10 p-4">
					<p class="text-blue-400">Loading remote documents...</p>
				</div>
			{:else}
				<div class="grid max-h-[calc(100vh-12rem)] gap-6 overflow-y-auto">
					{#each remoteDocs as doc}
						<div
							class="rounded-lg border border-gray-700 bg-gray-800/50 p-6 transition-colors hover:border-blue-500"
						>
							<div class="mb-4 flex items-start justify-between">
								<div>
									<h3 class="mb-2 text-xl font-semibold text-white">{doc.content.title}</h3>
									<div class="flex flex-wrap gap-2">
										{#each doc.metadata.tags as tag}
											<span class="rounded-full bg-gray-700 px-3 py-1 text-sm text-gray-200">
												{tag}
											</span>
										{/each}
									</div>
								</div>
								<div class="text-sm text-gray-400">
									<p>Author: {doc.metadata.author}</p>
									<p>Status: {doc.metadata.status}</p>
								</div>
							</div>
							<pre class="overflow-x-auto rounded-lg bg-gray-950 p-4 text-sm text-gray-300">
								<code>{JSON.stringify(doc, null, 2)}</code>
							</pre>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Local Docs -->
		<div class="p-6">
			<h2 class="mb-6 text-2xl font-semibold text-white">Local Docs (PGLite)</h2>
			{#if localDocs.length === 0 && !error}
				<div class="rounded-lg border border-yellow-500 bg-yellow-500/10 p-6">
					<p class="text-yellow-400">
						No local documents yet. Click "Add Local Doc" to create one.
					</p>
				</div>
			{:else}
				<div class="grid max-h-[calc(100vh-12rem)] gap-6 overflow-y-auto">
					{#each localDocs as doc}
						<div
							class="rounded-lg border border-gray-700 bg-gray-800/50 p-6 transition-colors hover:border-blue-500"
						>
							<div class="mb-4 flex items-start justify-between">
								<div>
									<h3 class="mb-2 text-xl font-semibold text-white">{doc.content.title}</h3>
									<div class="flex flex-wrap gap-2">
										{#each doc.metadata.tags as tag}
											<span class="rounded-full bg-gray-700 px-3 py-1 text-sm text-gray-200">
												{tag}
											</span>
										{/each}
									</div>
								</div>
								<div class="text-sm text-gray-400">
									<p>Author: {doc.metadata.author}</p>
									<p>Status: {doc.metadata.status}</p>
								</div>
							</div>
							<pre class="overflow-x-auto rounded-lg bg-gray-950 p-4 text-sm text-gray-300">
								<code>{JSON.stringify(doc, null, 2)}</code>
							</pre>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
