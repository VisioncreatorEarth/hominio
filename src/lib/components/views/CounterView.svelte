<script lang="ts">
	let count = $state(0);

	function increment() {
		count++;
	}

	function decrement() {
		count--;
	}
</script>

<div class="mx-auto max-w-7xl bg-[#f8f4ed] p-4 sm:p-6">
	<!-- Counter Card -->
	<div class="mx-auto max-w-md">
		<div class="rounded-xl border border-[#d6c7b1] bg-[#f5f1e8] p-6 text-center">
			<span class="text-6xl font-bold text-[#0a2a4e]">{count}</span>

			<div class="mt-6 flex justify-center gap-4">
				<button
					on:click={decrement}
					class="rounded-lg border border-[#c5d4e8] bg-[#e0d8cb] px-6 py-2 font-medium text-[#0a2a4e] transition-all hover:bg-[#c5d4e8]"
				>
					Decrement
				</button>

				<button
					on:click={increment}
					class="rounded-lg border border-[#c5d4e8] bg-[#e0d8cb] px-6 py-2 font-medium text-[#0a2a4e] transition-all hover:bg-[#c5d4e8]"
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
