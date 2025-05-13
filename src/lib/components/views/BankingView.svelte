<script lang="ts">
	import { onMount, getContext } from 'svelte';
	// import { browser } from '$app/environment'; // To be removed if not used elsewhere
	import type { Address } from 'viem';
	import { createPublicClient, http, formatUnits } from 'viem';
	import { gnosis } from 'viem/chains';
	import { roadmapConfig } from '$lib/roadmap/config';
	// import {
	// 	currentUserPkpProfileStore,
	// 	type CurrentUserPkpProfile
	// } from '$lib/stores/pkpSessionStore'; // REMOVED
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte'; // Added

	// Get Hominio facade from context
	const o = getContext<HominioFacade>('o'); // Added
	const pkpProfileStore = o.pkp.profile; // Added

	// let mintedPkpEthAddress = $state<Address | null>(null); // REMOVED - will use derived from $pkpProfileStore
	// let currentProfile = $state<CurrentUserPkpProfile | null>(null); // REMOVED - will use $pkpProfileStore

	// --- Sahel Token Balance State & Config ---
	const sahelPhaseConfig = roadmapConfig.phases.find((p) => p.name === 'Sahelanthropus');
	const SAHEL_TOKEN_ADDRESS = sahelPhaseConfig?.protocolTokenAddress as Address | undefined;
	const SAHEL_TOKEN_SYMBOL = sahelPhaseConfig?.shortTokenName || 'SAHEL';
	const GNOSIS_RPC_URL = sahelPhaseConfig?.rpcUrls?.default?.http?.[0];

	const erc20Abi = [
		{
			stateMutability: 'view' as const,
			inputs: [{ name: '_owner', type: 'address' }],
			name: 'balanceOf',
			outputs: [{ name: 'balance', type: 'uint256' }],
			type: 'function'
		},
		{
			stateMutability: 'view' as const,
			inputs: [],
			name: 'decimals',
			outputs: [{ name: '', type: 'uint8' }],
			type: 'function'
		}
		// Transfer function not needed for balance view
	] as const;

	let pkpSahelTokenBalance = $state<bigint | null>(null);
	let pkpSahelTokenDecimals = $state<number>(18); // Default, will be fetched
	let isLoadingPkpSahelBalance = $state<boolean>(true);
	let pkpSahelBalanceError = $state<string | null>(null);
	let formattedPkpSahelBalance = $state<string | null>(null);

	// Subscribe to the PKP profile store - REMOVED direct subscription effect
	// $effect(() => {
	// 	const unsubscribe = currentUserPkpProfileStore.subscribe((profile) => {
	// 		currentProfile = profile;
	// 		mintedPkpEthAddress = profile?.pkpEthAddress || null;
	// 		if (!profile?.pkpEthAddress) {
	// 			// console.warn('[BankingView] PKP ETH Address not found in profile store.');
	// 		}
	// 	});
	// 	return unsubscribe; // Cleanup subscription when component unmounts or effect re-runs
	// });

	async function fetchPkpSahelTokenBalance() {
		const currentPkpEthAddress = $pkpProfileStore?.pkpEthAddress; // Use facade store
		if (!currentPkpEthAddress) {
			pkpSahelBalanceError = 'PKP ETH address not available to fetch balance.';
			isLoadingPkpSahelBalance = false;
			return;
		}
		if (!SAHEL_TOKEN_ADDRESS) {
			pkpSahelBalanceError = 'Sahel token address not configured.';
			isLoadingPkpSahelBalance = false;
			return;
		}
		if (!GNOSIS_RPC_URL) {
			pkpSahelBalanceError = 'Gnosis RPC URL not configured.';
			isLoadingPkpSahelBalance = false;
			return;
		}

		isLoadingPkpSahelBalance = true;
		pkpSahelBalanceError = null;
		pkpSahelTokenBalance = null;
		formattedPkpSahelBalance = null;

		try {
			const publicClient = createPublicClient({
				chain: gnosis,
				transport: http(GNOSIS_RPC_URL)
			});

			try {
				const decimalsResult = await publicClient.readContract({
					address: SAHEL_TOKEN_ADDRESS,
					abi: erc20Abi,
					functionName: 'decimals'
				});
				pkpSahelTokenDecimals = decimalsResult as number;
			} catch (decError) {
				console.warn(
					'[BankingView] Could not fetch Sahel token decimals, defaulting to 18:',
					decError
				);
				pkpSahelTokenDecimals = 18;
			}

			const balanceResult = await publicClient.readContract({
				address: SAHEL_TOKEN_ADDRESS,
				abi: erc20Abi,
				functionName: 'balanceOf',
				args: [currentPkpEthAddress]
			});
			pkpSahelTokenBalance = balanceResult as bigint;

			if (pkpSahelTokenBalance !== null) {
				formattedPkpSahelBalance = formatUnits(pkpSahelTokenBalance, pkpSahelTokenDecimals);
			}
		} catch (err) {
			console.error('[BankingView] Error fetching Sahel token balance for PKP:', err);
			if (err instanceof Error) {
				pkpSahelBalanceError = `Failed to fetch Sahel balance: ${err.message}`;
			} else {
				pkpSahelBalanceError = 'An unknown error occurred while fetching Sahel balance.';
			}
		} finally {
			isLoadingPkpSahelBalance = false;
		}
	}

	// Effect to fetch balance when pkpEthAddress from facade changes
	$effect(() => {
		const currentPkpEthAddress = $pkpProfileStore?.pkpEthAddress; // Use facade store
		if (currentPkpEthAddress) {
			fetchPkpSahelTokenBalance();
		} else {
			pkpSahelTokenBalance = null;
			formattedPkpSahelBalance = null;
			pkpSahelBalanceError = 'PKP ETH Address not available. Cannot display balance.';
			isLoadingPkpSahelBalance = false; // Ensure loading is false if no address
		}
	});

	// Check if 'browser' import is still needed, remove if not.
	// For example, if onMount or other browser-specific APIs are not used elsewhere in this file.
	// As of now, onMount is imported but not used. If it remains unused, both onMount and browser can be removed.
	// However, getContext is used, which is fine.
</script>

<div class="p-4 md:p-6">
	<!-- Page Title removed as it's usually handled by layout -->
	<!-- <h1 class="mb-6 text-2xl font-semibold text-slate-800">Banking</h1> -->

	<!-- Sahel Token Balance Card -->
	{#if $pkpProfileStore?.pkpEthAddress}
		<div class="mb-8 max-w-2xl rounded-xl bg-white p-6 shadow-lg md:p-8">
			<h2 class="mb-4 border-b border-slate-200 pb-3 text-xl font-semibold text-slate-700">
				{SAHEL_TOKEN_SYMBOL} Token Balance
			</h2>
			<div class="mb-3">
				<p class="text-xs text-slate-500">For Hominio Wallet (PKP Address):</p>
				<p class="font-mono text-sm break-all text-sky-700">
					{$pkpProfileStore.pkpEthAddress}
				</p>
			</div>

			{#if isLoadingPkpSahelBalance}
				<div class="py-4">
					<div class="flex items-center text-slate-500">
						<div class="spinner-sm mr-2"></div>
						Fetching balance...
					</div>
				</div>
			{:else if pkpSahelBalanceError}
				<div class="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
					{pkpSahelBalanceError}
				</div>
			{:else if formattedPkpSahelBalance !== null}
				<p class="py-2 text-3xl font-bold text-sky-600">
					{formattedPkpSahelBalance}
					<span class="text-xl font-medium">{SAHEL_TOKEN_SYMBOL}</span>
				</p>
			{:else}
				<p class="py-2 text-slate-500">
					Could not retrieve balance or no {SAHEL_TOKEN_SYMBOL} tokens found for this PKP.
				</p>
			{/if}
		</div>
	{:else if $pkpProfileStore === undefined}
		<!-- Initial state before facade store resolves -->
		<div class="mb-8 max-w-2xl rounded-xl bg-white p-6 text-center shadow-lg md:p-8">
			<div class="flex items-center justify-center text-slate-500">
				<div class="spinner-sm mr-2"></div>
				Loading wallet information...
			</div>
		</div>
	{:else}
		<!-- $pkpProfileStore is null (no profile) -->
		<div class="mb-8 max-w-2xl rounded-xl bg-white p-6 text-center shadow-lg md:p-8">
			<h2 class="text-prussian-blue mb-3 text-lg font-medium">Hominio Wallet Not Found</h2>
			<p class="text-prussian-blue/80 mb-4 text-sm">
				No PKP wallet is associated with your account. Please set one up to view balances.
			</p>
			<a
				href="/me/signin"
				class="focus:ring-opacity-50 bg-prussian-blue text-linen hover:bg-prussian-blue/90 focus:ring-prussian-blue/50 inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold focus:ring-2 focus:outline-none"
			>
				Set Up Hominio Wallet
			</a>
		</div>
	{/if}
	<!-- Placeholder for more banking features -->
</div>

<style>
	.spinner-sm {
		display: inline-block;
		border: 2px solid currentColor;
		border-right-color: transparent;
		width: 1em;
		height: 1em;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		vertical-align: -0.125em; /* Adjust to align better with text */
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
