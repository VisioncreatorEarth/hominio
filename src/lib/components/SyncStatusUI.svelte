<script lang="ts">
	import { hominioSync } from '$lib/KERNEL/hominio-sync';
	import { getContext } from 'svelte';
	import type { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import { browser } from '$app/environment';
	import { hominioDB } from '$lib/KERNEL/hominio-db';
	import { closeStorage } from '$lib/KERNEL/hominio-storage';
	import { hominioIndexing } from '$lib/KERNEL/hominio-indexing';

	// --- Get Effective User Function from Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// --- Sync Status ---
	const syncStatus = hominioSync.status;

	function handlePull() {
		if (!$syncStatus.isSyncing) {
			hominioSync.pullFromServer();
		}
	}

	function handlePush() {
		if (!$syncStatus.isSyncing && $syncStatus.pendingLocalChanges > 0) {
			const currentUser = getMe();
			hominioSync.pushToServer(currentUser);
		}
	}

	function handleIndexing() {
		hominioIndexing.startIndexingCycle();
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
<div
	class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-[#f5f1e8] p-2 text-[#0a2a4e] shadow-sm"
>
	<!-- Status Information -->
	<div class="flex flex-col">
		<h3 class="text-sm font-medium">Sync Status</h3>
		<div class="flex items-center gap-1">
			<span class="text-xs">
				{#if $syncStatus.isOnline}
					<span class="font-semibold text-green-700">Online</span>
				{:else}
					<span class="font-semibold text-red-700">Offline</span>
				{/if}
			</span>
			<span class="text-xs text-gray-600">
				{#if $syncStatus.isSyncing}
					Syncing...
				{:else if $syncStatus.syncError}
					<span class="text-red-700">Error: {$syncStatus.syncError}</span>
				{:else if $syncStatus.lastSynced}
					Last synced: {new Date($syncStatus.lastSynced).toLocaleTimeString()}
				{:else}
					Ready to sync.
				{/if}
				{#if $syncStatus.pendingLocalChanges > 0}
					<span class="text-orange-700">({$syncStatus.pendingLocalChanges} pending)</span>
				{/if}
			</span>
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="flex items-center gap-2">
		<button
			class="rounded-md bg-[#0a2a4e] px-3 py-1 text-xs font-medium text-[#f8f4ed] shadow-sm hover:bg-[#1e3a5e] disabled:cursor-not-allowed disabled:opacity-50"
			on:click={handlePull}
			disabled={$syncStatus.isSyncing}
		>
			Pull from Server
		</button>
		<button
			class="rounded-md bg-[#0a2a4e] px-3 py-1 text-xs font-medium text-[#f8f4ed] shadow-sm hover:bg-[#1e3a5e] disabled:cursor-not-allowed disabled:opacity-50"
			on:click={handlePush}
			disabled={$syncStatus.isSyncing || $syncStatus.pendingLocalChanges === 0}
		>
			Push ({$syncStatus.pendingLocalChanges})
		</button>
		<button
			class="rounded-md bg-[#0a2a4e] px-3 py-1 text-xs font-medium text-[#f8f4ed] shadow-sm hover:bg-[#1e3a5e] disabled:cursor-not-allowed disabled:opacity-50"
			on:click={handleIndexing}
			disabled={$syncStatus.isSyncing}
		>
			Index Now
		</button>
		<button
			class="rounded-md bg-red-700 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
			on:click={handleClearStorage}
			disabled={$syncStatus.isSyncing}
		>
			Clear Local DB
		</button>
	</div>
</div>
