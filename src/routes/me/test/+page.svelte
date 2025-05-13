<script lang="ts">
	import { authClient } from '$lib/KERNEL/hominio-auth';
	import { onMount } from 'svelte';

	let userId: string | null = null;
	let passkeyRawId: string | null = null;
	let pkpPubKey: string | null = null;
	let message = '';
	let newRawId = '';
	let newPkpKey = '';

	// Type assertion for the plugin structure if needed, based on actual console.log(authClient)
	// For now, we assume methods are directly on authClient.pkpPasskeyPlugin
	// e.g., const pkpPlugin = authClient.pkpPasskeyPlugin as any;

	onMount(async () => {
		const session = authClient.useSession();
		session.subscribe((value) => {
			userId = value?.data?.user?.id ?? null;
		});
		await fetchInfo();
	});

	async function fetchInfo() {
		message = 'Fetching...';
		// Access directly via authClient.pluginId.methodName as per inferred types
		if (!(authClient as any).pkpPasskeyPlugin?.getUserPasskeyInfo) {
			message =
				'Client plugin or getUserPasskeyInfo method not available on authClient.pkpPasskeyPlugin.';
			console.error(
				'Client plugin or method not found on authClient.pkpPasskeyPlugin:',
				(authClient as any).pkpPasskeyPlugin
			);
			return;
		}
		try {
			const result = await (authClient as any).pkpPasskeyPlugin.getUserPasskeyInfo();
			console.log('Get result:', result);
			if (result?.error) {
				message = `Error fetching: ${result.error.message || JSON.stringify(result.error)}`;
				passkeyRawId = null;
				pkpPubKey = null;
			} else if (result?.data) {
				passkeyRawId = result.data.passkey_rawId ?? 'Not set';
				pkpPubKey = result.data.PKP_pubKey ?? 'Not set';
				message = 'Fetched successfully.';
			} else if (result && !result.data && !result.error) {
				message = 'Fetched, but no specific data returned.';
				passkeyRawId = 'Not set';
				pkpPubKey = 'Not set';
			} else {
				message = 'Fetched, but no data or error returned in the expected structure.';
				passkeyRawId = 'Format error';
				pkpPubKey = 'Format error';
			}
		} catch (e: any) {
			message = `Error fetching: ${e.message}`;
			console.error(e);
		}
	}

	async function updateInfo() {
		if (!userId) {
			message = 'Not logged in. Cannot update.';
			return;
		}
		message = 'Updating...';
		if (!(authClient as any).pkpPasskeyPlugin?.updateUserPasskeyInfo) {
			message =
				'Client plugin or updateUserPasskeyInfo method not available on authClient.pkpPasskeyPlugin.';
			console.error(
				'Client plugin or method not found on authClient.pkpPasskeyPlugin:',
				(authClient as any).pkpPasskeyPlugin
			);
			return;
		}

		const dataToUpdate: { passkey_rawId?: string; PKP_pubKey?: string } = {};
		if (newRawId) dataToUpdate.passkey_rawId = newRawId;
		if (newPkpKey) dataToUpdate.PKP_pubKey = newPkpKey;

		if (Object.keys(dataToUpdate).length === 0) {
			message = 'No new data entered to update.';
			return;
		}

		try {
			const result = await (authClient as any).pkpPasskeyPlugin.updateUserPasskeyInfo(dataToUpdate);
			console.log('Update result:', result);
			if (result?.error) {
				message = `Error updating: ${result.error.message || JSON.stringify(result.error)}`;
			} else if (result?.user) {
				message = `Updated successfully for user ${result.user.id}. New rawId: ${result.user.passkey_rawId}, New PKP: ${result.user.PKP_pubKey}`;
				passkeyRawId = result.user.passkey_rawId ?? 'Not set';
				pkpPubKey = result.user.PKP_pubKey ?? 'Not set';
				newRawId = '';
				newPkpKey = '';
			} else if (result?.message) {
				message = `Update info: ${result.message}`;
			} else {
				message = 'Updated, but no data or error returned in expected format.';
			}
		} catch (e: any) {
			message = `Error updating: ${e.message}`;
			console.error(e);
		}
	}
</script>

<h1 class="h1">PKP Passkey Info Test</h1>

{#if userId}
	<p>Current User ID: {userId}</p>
	<p>Stored Passkey RawID: <strong>{passkeyRawId ?? 'Loading...'}</strong></p>
	<p>Stored PKP Public Key: <strong>{pkpPubKey ?? 'Loading...'}</strong></p>

	<hr />

	<h2>Update Info</h2>
	<div class="mb-2">
		<label for="rawIdInput" class="mb-1 block">New Passkey RawID:</label>
		<input
			id="rawIdInput"
			type="text"
			bind:value={newRawId}
			placeholder="0x123..."
			class="w-full rounded border p-2"
		/>
	</div>
	<div class="mb-4">
		<label for="pkpKeyInput" class="mb-1 block">New PKP Public Key:</label>
		<input
			id="pkpKeyInput"
			type="text"
			bind:value={newPkpKey}
			placeholder="0xabc..."
			class="w-full rounded border p-2"
		/>
	</div>
	<button
		on:click={updateInfo}
		class="mr-2 rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
		>Update Stored Info</button
	>
	<button
		on:click={fetchInfo}
		class="rounded bg-gray-500 px-4 py-2 font-bold text-white hover:bg-gray-700"
		>Refresh Current Info</button
	>
{:else}
	<p>Please log in to test.</p>
{/if}

<p class="mt-5 text-sm italic">Status: {message}</p>

<!-- No <style> block needed if using Tailwind utility classes directly -->
