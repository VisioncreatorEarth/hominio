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
	<!-- Counter Card -->
	<div class="mx-auto max-w-md">
		<div class="rounded-xl border border-gray-200 bg-white p-6 text-center">
			<span class="text-6xl font-bold text-gray-800">{count}</span>

			<div class="mt-6 flex justify-center gap-4">
				<button
					on:click={decrement}
					class="rounded-lg border border-pink-300 bg-pink-100 px-6 py-2 font-medium text-pink-700 transition-all hover:bg-pink-200"
				>
					Decrement
				</button>

				<button
					on:click={increment}
					class="rounded-lg border border-blue-300 bg-blue-100 px-6 py-2 font-medium text-blue-700 transition-all hover:bg-blue-200"
				>
					Increment
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	/* Removed custom hover style */
</style>
