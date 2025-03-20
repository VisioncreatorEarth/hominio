<script lang="ts">
	import { onMount } from 'svelte';

	// State variables
	let ready = $state(false);

	// Hero features
	let features = $state([
		{
			title: 'Local-First',
			description: 'Your data lives on your device first',
			icon: '💾'
		},
		{
			title: 'Real-Time Collaboration',
			description: 'Work together seamlessly',
			icon: '👥'
		},
		{
			title: 'Conflict-Free',
			description: 'No merge conflicts with Loro CRDT',
			icon: '🔄'
		}
	]);

	onMount(() => {
		setTimeout(() => {
			ready = true;
		}, 500);
	});
</script>

<div class="min-h-screen bg-blue-950 text-emerald-100 dark:bg-blue-950">
	<div class="container mx-auto px-4 py-16">
		<!-- Hero Section -->
		<div class="mb-16 flex flex-col items-center justify-between gap-8 md:flex-row">
			<div class="flex-1">
				<h1 class="mb-4 text-5xl font-bold text-emerald-400">homin.io</h1>
				<p class="mb-6 text-xl text-emerald-200">
					A local-first collaborative platform powered by Loro CRDT technology.
				</p>
				<div class="flex gap-4">
					<a
						href="/hominio"
						class="rounded-lg bg-emerald-500 px-6 py-3 font-bold text-blue-950 transition-colors hover:bg-emerald-600"
					>
						Explore Hominio
					</a>
					<a
						href="/todos"
						class="rounded-lg border border-emerald-500 bg-transparent px-6 py-3 font-bold text-emerald-400 transition-colors hover:bg-emerald-500/10"
					>
						Try Demo
					</a>
				</div>
			</div>
			<div class="flex flex-1 justify-center">
				<div
					class="flex h-72 w-72 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 shadow-lg"
				>
					<div class="flex h-64 w-64 items-center justify-center rounded-full bg-blue-950">
						<img src="/logo.png" alt="Hominio Logo" class="h-56 w-56 object-contain" />
					</div>
				</div>
			</div>
		</div>

		<!-- Features -->
		<div class="mb-16 grid grid-cols-1 gap-8 md:grid-cols-3">
			{#each features as feature}
				<div
					class="rounded-lg border border-blue-800/30 bg-blue-900/20 p-6 transition-colors duration-300 hover:bg-blue-800/30 dark:bg-blue-900/10"
				>
					<div class="mb-4 text-4xl">{feature.icon}</div>
					<h3 class="mb-2 text-xl font-semibold text-emerald-300">{feature.title}</h3>
					<p class="text-emerald-100/80">{feature.description}</p>
				</div>
			{/each}
		</div>

		<!-- CTA -->
		<div class="text-center">
			<h2 class="mb-4 text-3xl font-bold text-emerald-400">Ready to Get Started?</h2>
			<p class="mx-auto mb-6 max-w-2xl text-xl text-emerald-200">
				Experience the future of collaborative software with local-first data ownership.
			</p>
			<a
				href="/hominio"
				class="inline-block rounded-lg bg-gradient-to-r from-emerald-500 to-blue-600 px-8 py-3 font-bold text-white transition-all hover:scale-105"
			>
				Launch Hominio
			</a>
		</div>
	</div>
</div>
