<script lang="ts">
	import '../app.css';
	export const prerender = true;

	let { children } = $props();
</script>

<div class="min-h-screen bg-indigo-950 text-white">
	<!-- Global Navigation Bar -->
	<nav
		class="fixed left-0 right-0 top-0 z-50 border-b border-green-900/10 bg-blue-950/80 backdrop-blur-md"
	>
		<div class="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
			<div class="flex items-center gap-8">
				<a
					href="/"
					class="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-2xl font-bold text-transparent"
				>
					Hominio
				</a>
				<div class="flex items-center gap-6">
					<a href="/" class="text-emerald-100 transition-colors hover:text-emerald-400">Home</a>
					<a href="/todos" class="text-emerald-100 transition-colors hover:text-emerald-400"
						>Todos</a
					>
				</div>
			</div>
			<button
				class="rounded-full bg-gradient-to-r from-emerald-400 to-green-500 px-8 py-3 font-bold text-black transition-all duration-300 hover:scale-105"
			>
				Get Started
			</button>
		</div>
	</nav>

	<!-- Main Content Area with padding for the fixed navbar -->
	<div class="pt-20">
		{@render children()}
	</div>
</div>
