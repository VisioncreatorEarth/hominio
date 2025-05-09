<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { browser } from '$app/environment';
	import type { Address, Hex } from 'viem';
	import { createPublicClient, http, formatUnits } from 'viem';
	import { gnosis } from 'viem/chains';
	import { roadmapConfig } from '$lib/roadmap/config';
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte'; // Assuming HominioFacade type is available

	// Get Hominio facade from context if needed, though not directly used in this reduced version
	// const o = getContext<HominioFacade>('o');

	let mintedPkpEthAddress = $state<Address | null>(null);

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

	onMount(() => {
		if (browser) {
			const storedPKPDataString = localStorage.getItem('mintedPKPData');
			if (storedPKPDataString) {
				try {
					const storedPKPData = JSON.parse(storedPKPDataString);
					if (storedPKPData && storedPKPData.pkpEthAddress) {
						mintedPkpEthAddress = storedPKPData.pkpEthAddress;
					} else {
						// console.warn('[BankingView] PKP ETH Address not found in localStorage.');
						mintedPkpEthAddress = null; // Explicitly set to null if not found
					}
				} catch (error) {
					console.error('[BankingView] Error parsing PKP data from localStorage:', error);
					mintedPkpEthAddress = null;
				}
			} else {
				// console.warn('[BankingView] No PKP data found in localStorage.');
				mintedPkpEthAddress = null;
			}
		}
	});

	async function fetchPkpSahelTokenBalance() {
		if (!mintedPkpEthAddress) {
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
				args: [mintedPkpEthAddress]
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

	$effect(() => {
		if (mintedPkpEthAddress && SAHEL_TOKEN_ADDRESS && GNOSIS_RPC_URL) {
			fetchPkpSahelTokenBalance();
		} else {
			pkpSahelTokenBalance = null;
			formattedPkpSahelBalance = null;
			isLoadingPkpSahelBalance = false; // Ensure loading stops if pre-reqs aren't met
			if (!mintedPkpEthAddress && browser) {
				// Only set this error if we expect an address
				pkpSahelBalanceError = 'PKP Address not found in local storage.';
			} else if (mintedPkpEthAddress && (!SAHEL_TOKEN_ADDRESS || !GNOSIS_RPC_URL)) {
				pkpSahelBalanceError = 'Sahel token configuration missing. Cannot display balance.';
			}
		}
	});
</script>

<div class="rounded-xl bg-white p-6 shadow-lg md:p-8">
	<h2 class="mb-4 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
		{SAHEL_TOKEN_SYMBOL} Balance
	</h2>

	{#if !mintedPkpEthAddress && !isLoadingPkpSahelBalance}
		<div class="rounded border border-amber-400 bg-amber-100 p-4 text-amber-700">
			PKP ETH Address not found. Please ensure your PKP is minted and data is available.
		</div>
	{:else if mintedPkpEthAddress}
		<div class="mb-2">
			<p class="text-sm text-slate-500">For PKP Address:</p>
			<p class="font-mono text-sm break-all text-sky-700">{mintedPkpEthAddress}</p>
		</div>

		{#if !sahelPhaseConfig}
			<div class="rounded border border-red-400 bg-red-100 p-4 text-red-700">
				Configuration error: Sahelanthropus phase data is not defined.
			</div>
		{:else if !SAHEL_TOKEN_ADDRESS}
			<div class="rounded border border-red-400 bg-red-100 p-4 text-red-700">
				Configuration error: Sahel token address is not defined.
			</div>
		{:else if !GNOSIS_RPC_URL}
			<div class="rounded border border-red-400 bg-red-100 p-4 text-red-700">
				Configuration error: Gnosis RPC URL is not defined.
			</div>
		{:else if isLoadingPkpSahelBalance}
			<p class="animate-pulse py-2 text-slate-500">Loading {SAHEL_TOKEN_SYMBOL} balance...</p>
		{:else if pkpSahelBalanceError}
			<p class="py-2 text-red-600">{pkpSahelBalanceError}</p>
		{:else if formattedPkpSahelBalance !== null}
			<p class="py-2 text-2xl font-bold text-sky-600">
				{formattedPkpSahelBalance}
				<span class="text-lg font-medium">{SAHEL_TOKEN_SYMBOL}</span>
			</p>
		{:else}
			<p class="py-2 text-slate-500">
				Could not retrieve balance or no {SAHEL_TOKEN_SYMBOL} tokens found for this PKP.
			</p>
		{/if}
	{/if}
</div>
