<script lang="ts">
	import { hominioSync } from '$lib/KERNEL/hominio-sync';
	import { getContext } from 'svelte';
	import type { getCurrentEffectiveUser as getCurrentEffectiveUserType } from '$lib/KERNEL/hominio-auth';
	import { browser } from '$app/environment';
	import { hominioDB, triggerDocChangeNotification } from '$lib/KERNEL/hominio-db';
	import { closeStorage } from '$lib/KERNEL/hominio-storage';

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getCurrentEffectiveUserType;
	const getCurrentEffectiveUser = getContext<GetCurrentUserFn>('getCurrentEffectiveUser');

	// --- Sync Status ---
	const syncStatus = hominioSync.status;

	function handlePull() {
		if (!$syncStatus.isSyncing) {
			hominioSync.pullFromServer();
		}
	}

	function handlePush() {
		if (!$syncStatus.isSyncing && $syncStatus.pendingLocalChanges > 0) {
			const currentUser = getCurrentEffectiveUser();
			hominioSync.pushToServer(currentUser);
		}
	}

	// --- Clear Storage Function (Direct Attempt with Cleanup) ---
	function handleClearStorage() {
		if (!browser) return; // Only run in browser

		const confirmation = confirm(
			"🚨 Are you sure you want to delete the entire local 'hominio-docs' database? " +
				'All unsynced local data will be lost!'
		);

		if (confirmation) {
			console.warn('Attempting to close connections and delete IndexedDB: hominio-docs');

			// --- Attempt cleanup first ---
			try {
				console.log('Attempting cleanup...');
				hominioDB.destroy(); // Close active Loro docs
				console.log('Called hominioDB.destroy()');
				closeStorage(); // Explicitly close storage connections
				console.log('Called closeStorage()');
			} catch (e) {
				console.error('Error during cleanup:', e);
			}
			// ---------------------------

			// Wait briefly for connections to hopefully close
			setTimeout(() => {
				const deleteRequest = indexedDB.deleteDatabase('hominio-docs');

				deleteRequest.onsuccess = () => {
					console.log("✅ IndexedDB 'hominio-docs' deleted successfully.");
					// Trigger reactivity *before* reloading
					triggerDocChangeNotification();
					// Reload the page to reflect the changes and ensure clean state
					window.location.reload();
				};

				deleteRequest.onerror = (event) => {
					console.error("❌ Error deleting IndexedDB 'hominio-docs':", event);
					alert('Error deleting local database. See console for details.');
				};

				deleteRequest.onblocked = () => {
					// Don't alert, just log a warning. Reload on success will handle it.
					console.warn(
						'IndexedDB deletion was initially blocked. This might resolve after reload.'
					);
				};
			}, 300); // Keep a delay (e.g., 300ms)
		} else {
			console.log('Clear storage cancelled by user.');
		}
	}
</script>

<!-- Sync Status Display & Buttons -->
<div class="mt-auto border-t border-gray-300 p-4">
	<h3 class="mb-2 text-sm font-medium text-gray-600">Sync Status</h3>
	<!-- Online/Offline Indicator -->
	<p class="mb-1 text-xs">
		Status:
		{#if $syncStatus.isOnline}
			<span class="font-semibold text-green-600">Online</span>
		{:else}
			<span class="font-semibold text-red-600">Offline</span>
		{/if}
	</p>
	<!-- Display Sync Status Details -->
	<p class="mb-3 text-xs text-gray-500">
		{#if $syncStatus.isSyncing}
			Syncing...
		{:else if $syncStatus.syncError}
			<span class="text-red-600">Error: {$syncStatus.syncError}</span>
		{:else if $syncStatus.lastSynced}
			Last synced: {new Date($syncStatus.lastSynced).toLocaleTimeString()}
		{:else}
			Ready to sync.
		{/if}
		{#if $syncStatus.pendingLocalChanges > 0}
			<span class="ml-1 text-orange-600">({$syncStatus.pendingLocalChanges} pending)</span>
		{/if}
	</p>
	<div class="space-y-2">
		<button
			class="w-full rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
			on:click={handlePull}
			disabled={$syncStatus.isSyncing}
		>
			{$syncStatus.isSyncing ? 'Pulling...' : 'Pull from Server'}
		</button>
		<button
			class="w-full rounded-md bg-green-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
			on:click={handlePush}
			disabled={$syncStatus.isSyncing || $syncStatus.pendingLocalChanges === 0}
		>
			{$syncStatus.isSyncing ? 'Pushing...' : `Push to Server (${$syncStatus.pendingLocalChanges})`}
		</button>
		<button
			class="w-full rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
			on:click={handleClearStorage}
			disabled={$syncStatus.isSyncing}
		>
			Clear Local DB
		</button>
	</div>
</div>
