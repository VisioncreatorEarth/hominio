<script lang="ts">
	import { hominioSync } from '$lib/KERNEL/hominio-sync';
	import { getContext } from 'svelte';
	import type { getCurrentEffectiveUser as getCurrentEffectiveUserType } from '$lib/KERNEL/hominio-auth';

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
	</div>
</div>
