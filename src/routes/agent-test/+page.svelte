<script lang="ts">
	let response: any = $state(null);
	let loading = $state(false);
	let error: any = $state(null);

	async function fetchAgentData() {
		try {
			loading = true;
			error = null;

			const res = await fetch('/agent');
			if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

			response = await res.json();
		} catch (err) {
			if (err instanceof Error) {
				error = err.message;
			} else {
				error = String(err);
			}
			console.error('Error fetching data:', err);
		} finally {
			loading = false;
		}
	}

	async function fetchHealthCheck() {
		try {
			loading = true;
			error = null;

			const res = await fetch('/agent/health');
			if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

			response = await res.json();
		} catch (err) {
			if (err instanceof Error) {
				error = err.message;
			} else {
				error = String(err);
			}
			console.error('Error fetching health data:', err);
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen bg-gray-950 p-8 text-white">
	<div class="mx-auto max-w-2xl">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Elysia Agent Test</h1>

		<div class="mb-8 flex gap-4">
			<button
				on:click={fetchAgentData}
				class="rounded bg-emerald-600 px-4 py-2 transition-colors hover:bg-emerald-700"
				disabled={loading}
			>
				Fetch Agent Data
			</button>

			<button
				on:click={fetchHealthCheck}
				class="rounded bg-blue-600 px-4 py-2 transition-colors hover:bg-blue-700"
				disabled={loading}
			>
				Check Health
			</button>
		</div>

		{#if loading}
			<div class="mb-4 animate-pulse text-emerald-300">Loading...</div>
		{/if}

		{#if error}
			<div class="mb-4 rounded border border-red-700 bg-red-900/50 p-4">
				<h3 class="font-bold text-red-400">Error</h3>
				<p>{error}</p>
			</div>
		{/if}

		{#if response}
			<div class="rounded border border-gray-700 bg-gray-800/50 p-4">
				<h3 class="mb-2 font-bold text-emerald-400">Response:</h3>
				<pre class="overflow-auto rounded bg-gray-900 p-4">{JSON.stringify(response, null, 2)}</pre>
			</div>
		{/if}
	</div>
</div>
