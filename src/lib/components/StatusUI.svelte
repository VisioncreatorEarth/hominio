<script lang="ts">
	import { hominioSync } from '$lib/KERNEL/hominio-sync';
	import { getContext } from 'svelte';
	import { browser } from '$app/environment';
	import { hominioDB } from '$lib/KERNEL/hominio-db';
	import { closeStorage } from '$lib/KERNEL/hominio-storage';
	import { hominioIndexing } from '$lib/KERNEL/hominio-indexing';
	import { initializeLitClient } from '$lib/wallet/lit-connect';
	import type { LitNodeClient } from '@lit-protocol/lit-node-client';
	import { get, type Writable } from 'svelte/store';
	import type { WalletClient, Address } from 'viem';

	// Import the actual 'o' object to use typeof on it for extending its type
	// import { o as baseHominioFacade } from '$lib/KERNEL/hominio-svelte'; // No longer needed for local type extension
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte'; // Import the new central facade type

	// EOA Guardian Imports
	import {
		connectGuardianEoaAccount,
		disconnectGuardianEoaAccount
	} from '$lib/wallet/guardian-eoa';

	// Create a type alias for the base Hominio facade
	// type BaseHominioFacadeType = typeof baseHominioFacade; // Removed

	// --- Get Hominio Facade from Context (includes Lit and new EOA stores) ---
	// interface HominioFacadeWithWallets extends BaseHominioFacadeType { // Removed old interface
	// 	lit: Writable<LitNodeClient | null>;
	// 	guardianEoaClientStore: Writable<WalletClient | null>;
	// 	guardianEoaAddressStore: Writable<Address | null>;
	// 	guardianEoaChainIdStore: Writable<number | null>;
	// 	guardianEoaErrorStore: Writable<string | null>;
	// }
	const o = getContext<HominioFacade>('o'); // Use the new HominioFacade type

	// Destructure stores for easier access, matching the new structure in HominioFacade
	const litClientStore = o.lit.client; // o.lit is now an object with a 'client' store
	const {
		address: guardianEoaAddressStore, // o.guardian is an object with an 'address' store
		chainId: guardianEoaChainIdStore, // o.guardian is an object with a 'chainId' store
		error: guardianEoaErrorStore // o.guardian is an object with an 'error' store
		// client: guardianEoaClientStore // Not used directly in this component, but available as o.guardian.client
	} = o.guardian;

	// --- Sync Status ---
	const syncStatus = hominioSync.status;

	// --- Lit Connection State ---
	let isReconnectingLit = false;
	let litConnectionError: string | null = null;

	// --- EOA Guardian State ---
	let isConnectingEoa = false; // For EOA connection button loading state

	async function handleReconnectLit() {
		isReconnectingLit = true;
		litConnectionError = null;
		let currentClient = get(litClientStore);
		try {
			if (currentClient && currentClient.ready) {
				// console.log('Lit Protocol already connected and ready.');
			} else if (currentClient && !currentClient.ready) {
				// console.log('Attempting to connect existing Lit client instance...');
				await currentClient.connect();
				// console.log('Lit Protocol reconnected successfully.');
				litClientStore.set(currentClient);
			} else {
				// console.log('No existing Lit client or not ready, initializing new one...');
				const newClient = await initializeLitClient();
				litClientStore.set(newClient);
				// console.log('Lit Protocol initialized and connected successfully.');
			}
		} catch (err: unknown) {
			console.error('Error during Lit Protocol connection attempt:', err);
			litConnectionError =
				err instanceof Error ? err.message : 'Failed to connect to Lit Protocol.';
			if (!currentClient) {
				litClientStore.set(null);
			}
		} finally {
			isReconnectingLit = false;
		}
	}

	async function handleEoaConnectDisconnect() {
		isConnectingEoa = true;
		guardianEoaErrorStore.set(null); // Clear previous errors before attempting action
		try {
			if (get(guardianEoaAddressStore)) {
				// If address exists, user wants to disconnect
				disconnectGuardianEoaAccount();
			} else {
				// If no address, user wants to connect
				await connectGuardianEoaAccount();
			}
		} catch (err: unknown) {
			// connectGuardianEoaAccount itself handles setting its error store
			console.error('Error during EOA connect/disconnect in StatusUI:', err);
			// Error store is set within connectGuardianEoaAccount, but we catch here for local loading state
		} finally {
			isConnectingEoa = false;
		}
	}

	function handlePull() {
		if (!$syncStatus.isSyncing) {
			hominioSync.pullFromServer();
		}
	}

	function handlePush() {
		if (!$syncStatus.isSyncing && $syncStatus.pendingLocalChanges > 0) {
			const currentUser = o.me();
			hominioSync.pushToServer(currentUser);
		}
	}

	function handleIndexing() {
		hominioIndexing.startIndexingCycle();
	}

	function handleClearStorage() {
		if (!browser) return;
		const confirmation = confirm(
			"🚨 Are you sure you want to delete the entire local 'hominio-docs' database? " +
				'All unsynced local data will be lost!'
		);
		if (confirmation) {
			console.warn('Attempting to close connections and delete IndexedDB: hominio-docs');
			try {
				console.log('Attempting cleanup...');
				hominioDB.destroy();
				console.log('Called hominioDB.destroy()');
				closeStorage();
				console.log('Called closeStorage()');
			} catch (e) {
				console.error('Error during cleanup:', e);
			}
			setTimeout(() => {
				const deleteRequest = indexedDB.deleteDatabase('hominio-docs');
				deleteRequest.onsuccess = () => {
					console.log("✅ IndexedDB 'hominio-docs' deleted successfully.");
					window.location.reload();
				};
				deleteRequest.onerror = (event) => {
					console.error("❌ Error deleting IndexedDB 'hominio-docs':", event);
					alert('Error deleting local database. See console for details.');
				};
				deleteRequest.onblocked = () => {
					console.warn(
						'IndexedDB deletion was initially blocked. This might resolve after reload.'
					);
				};
			}, 300);
		} else {
			console.log('Clear storage cancelled by user.');
		}
	}
</script>

<!-- Main Container: Adjusted padding p-1 -->
<div
	class="flex flex-row items-start justify-end gap-2 rounded-lg border border-gray-200 bg-[#f5f1e8] p-1 text-[#0a2a4e] shadow-sm"
>
	<!-- Sync Status Column: flex-initial, pr-2 removed -->
	<div class="flex flex-initial flex-col gap-0.5 border-r border-gray-300 last:border-r-0">
		<!-- Header and Buttons on one line -->
		<div class="flex items-center justify-between gap-2 pr-2">
			<h3 class="text-sm font-medium whitespace-nowrap">Sync Status</h3>
			<div class="flex flex-shrink-0 items-center gap-1">
				<button
					class="rounded-md bg-[#0a2a4e] px-2 py-0.5 text-xs font-medium whitespace-nowrap text-[#f8f4ed] shadow-sm hover:bg-[#1e3a5e] disabled:cursor-not-allowed disabled:opacity-50"
					on:click={handlePull}
					disabled={$syncStatus.isSyncing}>Pull</button
				>
				<button
					class="rounded-md bg-[#0a2a4e] px-2 py-0.5 text-xs font-medium whitespace-nowrap text-[#f8f4ed] shadow-sm hover:bg-[#1e3a5e] disabled:cursor-not-allowed disabled:opacity-50"
					on:click={handlePush}
					disabled={$syncStatus.isSyncing || $syncStatus.pendingLocalChanges === 0}
					>Push ({$syncStatus.pendingLocalChanges})</button
				>
				<button
					class="rounded-md bg-[#0a2a4e] px-2 py-0.5 text-xs font-medium whitespace-nowrap text-[#f8f4ed] shadow-sm hover:bg-[#1e3a5e] disabled:cursor-not-allowed disabled:opacity-50"
					on:click={handleIndexing}
					disabled={$syncStatus.isSyncing}>Index</button
				>
				<button
					class="rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
					on:click={handleClearStorage}
					disabled={$syncStatus.isSyncing}>ClearDB</button
				>
			</div>
		</div>
		<!-- Status Text below header/buttons -->
		<div class="flex items-center justify-between gap-2 pr-2">
			<span class="text-xs text-gray-600">
				{#if $syncStatus.isOnline}<span class="font-semibold text-green-700">Online</span
					>{:else}<span class="font-semibold text-red-700">Offline</span>{/if} -
				{#if $syncStatus.isSyncing}Syncing...{:else if $syncStatus.syncError}<span
						class="text-red-700">Error</span
					>{:else if $syncStatus.lastSynced}Synced {new Date(
						$syncStatus.lastSynced
					).toLocaleTimeString()}{:else}Ready{/if}
				{#if $syncStatus.pendingLocalChanges > 0}<span class="ml-1 text-orange-700"
						>({$syncStatus.pendingLocalChanges} pending)</span
					>{/if}
			</span>
		</div>
		{#if $syncStatus.syncError}<span class="truncate pr-2 text-xs text-red-600"
				>Error: {$syncStatus.syncError}</span
			>{/if}
	</div>

	<!-- Lit Protocol Status Column: flex-initial, pr-2 removed -->
	<div class="flex flex-initial flex-col gap-0.5 border-r border-gray-300 last:border-r-0">
		<!-- Header and Button on one line -->
		<div class="flex items-center justify-between gap-2 pr-2">
			<h3 class="text-sm font-medium whitespace-nowrap">Lit Protocol</h3>
			<div class="flex-shrink-0">
				<button
					class="rounded-md bg-sky-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
					on:click={handleReconnectLit}
					disabled={isReconnectingLit || ($litClientStore?.ready ?? false)}
				>
					{isReconnectingLit ? 'Working...' : $litClientStore?.ready ? 'OK' : 'Connect'}
				</button>
			</div>
		</div>
		<!-- Status Text below header/button -->
		<div class="flex items-center justify-between gap-2 pr-2">
			<span class="text-xs">
				{#if $litClientStore?.ready}
					<span class="font-semibold text-green-700">Connected</span>
					<span class="ml-1 truncate text-gray-600">(Net: {$litClientStore.config.litNetwork})</span
					>
				{:else if $litClientStore && !isReconnectingLit}
					<span class="font-semibold text-orange-600">Disconnected</span>
				{:else if isReconnectingLit}
					<span class="font-semibold text-yellow-600">Connecting...</span>
				{:else}
					<span class="font-semibold text-red-700">Unavailable</span>
				{/if}
				{#if litConnectionError && !$litClientStore?.ready}<span class="ml-1 truncate text-red-600"
						>Error: {litConnectionError}</span
					>{/if}
			</span>
		</div>
	</div>

	<!-- EOA Guardian Status Column: flex-initial -->
	<div class="flex flex-initial flex-col gap-0.5">
		<!-- Header and Button on one line -->
		<div class="flex items-center justify-between gap-2">
			<h3 class="text-sm font-medium whitespace-nowrap">Guardian EOA</h3>
			<div class="flex-shrink-0">
				<button
					class="rounded-md bg-sky-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
					on:click={handleEoaConnectDisconnect}
					disabled={isConnectingEoa}
				>
					{isConnectingEoa ? 'Working...' : $guardianEoaAddressStore ? 'Disconnect' : 'Connect EOA'}
				</button>
			</div>
		</div>
		<!-- Status Text below header/button -->
		<div class="flex items-center justify-between gap-2">
			<span class="text-xs">
				{#if $guardianEoaAddressStore}
					<span class="font-semibold text-green-700">Connected</span>
					<span class="ml-1 truncate text-gray-600">
						({$guardianEoaAddressStore.slice(0, 6)}...{$guardianEoaAddressStore.slice(-4)} / Chain: {$guardianEoaChainIdStore ??
							'N/A'})
					</span>
				{:else if isConnectingEoa}
					<span class="font-semibold text-yellow-600">Connecting...</span>
				{:else}
					<span class="font-semibold text-orange-600">Disconnected</span>
				{/if}
				{#if $guardianEoaErrorStore && !$guardianEoaAddressStore}
					<span class="ml-1 truncate text-red-600">Error: {$guardianEoaErrorStore}</span>
				{/if}
			</span>
		</div>
	</div>
</div>
