<script lang="ts">
	import { hominio } from '$lib/client/hominio';

	let response: any = $state(null);
	let loading = $state(false);
	let error: any = $state(null);
	let debugInfo: any = $state(null);

	async function fetchAgentData() {
		try {
			loading = true;
			error = null;
			debugInfo = null;
			response = null;

			// Log the request for debugging
			console.log('Fetching agent data from:', '/agent');

			// Use direct agent.get() thanks to our custom wrapper
			const res = await hominio.agent.get();

			console.log('Response:', res);

			// Store debug info without trying to spread headers
			debugInfo = {
				status: res.status,
				raw: JSON.parse(JSON.stringify(res))
			};

			// Always set response data if available
			if (res.data) {
				response = res.data;
			}

			// Only set error if needed
			if (res.status !== 200) {
				throw new Error(`API error! status: ${res.status}`);
			}
		} catch (err) {
			console.error('Error fetching data:', err);

			if (err instanceof Error) {
				error = err.message;
			} else {
				error = String(err);
			}
		} finally {
			loading = false;
		}
	}

	async function fetchHealthCheck() {
		try {
			loading = true;
			error = null;
			debugInfo = null;
			response = null;

			// Log the request for debugging
			console.log('Fetching health check from:', '/agent/health');

			// Access pattern for the health endpoint
			const res = await hominio.agent.health.get();

			console.log('Response:', res);

			// Store debug info without trying to spread headers
			debugInfo = {
				status: res.status,
				raw: JSON.parse(JSON.stringify(res))
			};

			// Always set response data if available
			if (res.data) {
				response = res.data;
			}

			// Only set error if needed
			if (res.status !== 200) {
				throw new Error(`API error! status: ${res.status}`);
			}
		} catch (err) {
			console.error('Error fetching health data:', err);

			if (err instanceof Error) {
				error = err.message;
			} else {
				error = String(err);
			}
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen bg-gray-950 p-8 text-white">
	<div class="mx-auto max-w-2xl">
		<h1 class="mb-6 text-3xl font-bold text-emerald-400">Elysia Agent Test</h1>
		<p class="mb-4 text-emerald-200">Using type-safe Eden client</p>

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

				{#if debugInfo}
					<div class="mt-2 text-sm text-red-300">
						<p>Status: {debugInfo.status}</p>
					</div>
				{/if}
			</div>
		{/if}

		{#if response}
			<div class="rounded border border-gray-700 bg-gray-800/50 p-4">
				<h3 class="mb-2 font-bold text-emerald-400">Response:</h3>
				<pre class="overflow-auto rounded bg-gray-900 p-4">{JSON.stringify(response, null, 2)}</pre>
			</div>
		{/if}

		{#if debugInfo && !error}
			<div class="mt-4 rounded border border-gray-700 bg-gray-800/30 p-4">
				<h3 class="mb-2 font-bold text-blue-400">Debug Info:</h3>
				<div class="text-sm text-gray-300">
					<p>Status: {debugInfo.status}</p>
				</div>
			</div>
		{/if}
	</div>
</div>
