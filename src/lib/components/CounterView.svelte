<script lang="ts">
	let count = $state(0);

	function increment() {
		count++;
	}

	function decrement() {
		count--;
	}
</script>

<div class="mx-auto max-w-7xl p-4 sm:p-6">
	<!-- Header -->
	<div class="mb-8 text-center">
		<h1 class="text-3xl font-bold text-white/95">Hominio Counter Vibe</h1>
		<p class="mt-2 text-white/70">
			A simple counter example to demonstrate dynamic component loading
		</p>
	</div>

	<!-- Counter Card -->
	<div class="mx-auto max-w-md">
		<div class="rounded-xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm">
			<span class="text-6xl font-bold text-white/90">{count}</span>

			<div class="mt-6 flex justify-center gap-4">
				<button
					on:click={decrement}
					class="rounded-lg bg-pink-500/30 px-6 py-2 font-medium text-white/90 transition-all hover:bg-pink-500/50"
				>
					Decrement
				</button>

				<button
					on:click={increment}
					class="rounded-lg bg-blue-500/30 px-6 py-2 font-medium text-white/90 transition-all hover:bg-blue-500/50"
				>
					Increment
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
	}
</style>
