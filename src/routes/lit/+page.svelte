<script lang="ts">
	import { connectToLit } from '$lib/wallet/lit';

	let connected = false;
	let error = '';

	async function handleConnect() {
		try {
			await connectToLit();
			connected = true;
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			connected = false;
		}
	}
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
	<h1 class="text-2xl font-bold">Lit Protocol Connection Demo</h1>

	<button
		on:click={handleConnect}
		class="rounded bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
	>
		Connect to Lit Network
	</button>

	{#if connected}
		<div class="rounded bg-green-100 p-3 text-green-800">
			Successfully connected to Lit Network!
		</div>
	{/if}

	{#if error}
		<div class="rounded bg-red-100 p-3 text-red-800">
			Error: {error}
		</div>
	{/if}
</div>
