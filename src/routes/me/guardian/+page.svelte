<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import { initializeGuardianEoaClient, connectGuardianEoaAccount } from '$lib/wallet/guardian-eoa';
	import { roadmapConfig } from '../../../roadmap/config';
	import { formatUnits, type Address, type WalletClient, createPublicClient, http } from 'viem';
	import { gnosis } from 'viem/chains'; // Import Gnosis chain definition

	// Define an interface for the 'o' object from context, similar to StatusUI.svelte
	// This should ideally be a shared type if used in multiple places.
	interface HominioFacadeWithGuardian {
		// Define other properties of 'o' if accessed, for now focus on guardian stores
		guardianEoaClientStore: Writable<WalletClient | null>;
		guardianEoaAddressStore: Writable<Address | null>;
		guardianEoaChainIdStore: Writable<number | null>;
		guardianEoaErrorStore: Writable<string | null>;
		// Add other stores from 'o' if needed by this component
	}

	// --- Configuration ---
	const sahelPhaseConfig = roadmapConfig.phases.find((p) => p.name === 'Sahelanthropus');
	if (!sahelPhaseConfig) {
		console.error('[SahelPage] Sahelanthropus phase configuration not found!');
		// Potentially set an error state here to display in UI
	}
	const SAHEL_TOKEN_ADDRESS = sahelPhaseConfig?.protocolTokenAddress as Address | undefined;
	const SAHEL_CHAIN_ID_FROM_CONFIG = sahelPhaseConfig?.chainId;
	const SAHEL_TOKEN_SYMBOL = sahelPhaseConfig?.shortTokenName || 'SAHEL';
	const GNOSIS_RPC_URL = sahelPhaseConfig?.rpcUrls?.default?.http?.[0]; // Optional chaining
	const EXPECTED_CHAIN_ID = gnosis.id; // From viem/chains

	// --- ERC20 ABI for balanceOf & decimals ---
	const erc20Abi = [
		{
			constant: true,
			inputs: [{ name: '_owner', type: 'address' }],
			name: 'balanceOf',
			outputs: [{ name: 'balance', type: 'uint256' }],
			type: 'function'
		},
		{
			constant: true,
			inputs: [],
			name: 'decimals',
			outputs: [{ name: '', type: 'uint8' }],
			type: 'function'
		}
	] as const; // Use 'as const' for better type inference with viem

	// --- Reactive State (Svelte 5) ---
	let tokenBalance = $state<bigint | null>(null);
	let tokenDecimals = $state<number>(18); // Default to 18, will try to fetch
	let isLoading = $state<boolean>(false);
	let pageErrorMessage = $state<string | null>(null);
	let formattedBalanceValue = $state<string | null>(null); // New state variable

	// Get 'o' from context
	const o = getContext<HominioFacadeWithGuardian>('o');

	// Destructure the specific store instances from 'o'
	const {
		guardianEoaAddressStore,
		guardianEoaChainIdStore,
		guardianEoaErrorStore,
		guardianEoaClientStore
	} = o;

	// --- Initialize EOA Client (if not already done by layout) ---
	onMount(() => {
		// initializeGuardianEoaClient is typically called in +layout.svelte
		// Call it here as a fallback or if this page can be accessed without the full layout running first.
		// Check the reactive value of the directly imported client store.
		if (!$guardianEoaClientStore) {
			console.warn('[SahelPage] EOA client not found from context, attempting initialization.');
			initializeGuardianEoaClient();
		}
	});

	// --- Fetch Balance Logic (Svelte 5 effect) ---
	$effect(() => {
		async function fetchBalanceAndDecimals() {
			if (!$guardianEoaAddressStore || !SAHEL_TOKEN_ADDRESS) {
				tokenBalance = null;
				// errorMessage = 'Wallet not connected or token address missing.'; // Avoid setting error if just not connected yet
				return;
			}

			if ($guardianEoaChainIdStore !== EXPECTED_CHAIN_ID) {
				pageErrorMessage = `Please switch to Gnosis Chain (ID: ${EXPECTED_CHAIN_ID}). You are currently on chain ID: ${$guardianEoaChainIdStore}.`;
				tokenBalance = null;
				return;
			}

			if (!GNOSIS_RPC_URL) {
				pageErrorMessage = 'Gnosis RPC URL not configured. Cannot fetch balance.';
				tokenBalance = null;
				isLoading = false;
				return;
			}

			isLoading = true;
			pageErrorMessage = null; // Clear previous errors
			tokenBalance = null; // Clear previous balance

			try {
				const publicClient = createPublicClient({
					chain: gnosis,
					transport: http(GNOSIS_RPC_URL)
				});

				console.log(
					'[SahelPage] Fetching balance for:',
					$guardianEoaAddressStore,
					'on token:',
					SAHEL_TOKEN_ADDRESS
				);

				// Fetch decimals first or concurrently
				try {
					const decimalsResult = await publicClient.readContract({
						address: SAHEL_TOKEN_ADDRESS,
						abi: erc20Abi,
						functionName: 'decimals'
					});
					tokenDecimals = decimalsResult as number; // Explicit cast
					console.log('[SahelPage] Token decimals:', tokenDecimals);
				} catch (decError) {
					console.warn('[SahelPage] Could not fetch token decimals, defaulting to 18:', decError);
					tokenDecimals = 18; // Default if decimals call fails
				}

				const balanceResult = await publicClient.readContract({
					address: SAHEL_TOKEN_ADDRESS,
					abi: erc20Abi,
					functionName: 'balanceOf',
					args: [$guardianEoaAddressStore]
				});
				tokenBalance = balanceResult as bigint; // Explicit cast
				console.log('[SahelPage] Raw balance:', tokenBalance);

				// --- Manually calculate formatted balance AFTER state updates ---
				if (tokenBalance !== null && tokenDecimals !== null) {
					try {
						formattedBalanceValue = formatUnits(tokenBalance, tokenDecimals);
					} catch (formatError) {
						console.error('[SahelPage] Error formatting balance:', formatError);
						formattedBalanceValue = 'Error';
					}
				} else {
					formattedBalanceValue = null; // Reset if dependencies are null
				}
				// --- End manual calculation ---
			} catch (err) {
				console.error('[SahelPage] Error fetching token balance:', err);
				if (err instanceof Error) {
					pageErrorMessage = `Failed to fetch balance: ${err.message}`;
				} else {
					pageErrorMessage = 'An unknown error occurred while fetching balance.';
				}
				tokenBalance = null;
				formattedBalanceValue = null; // Reset on error
			} finally {
				isLoading = false;
			}
		}

		fetchBalanceAndDecimals();

		// Cleanup function for the effect
		return () => {
			// Optional: Reset state if dependencies change to avoid stale data
			// formattedBalanceValue = null;
			// tokenBalance = null;
		};
	});

	function handleConnectWallet() {
		connectGuardianEoaAccount().catch((err) => {
			console.error('[SahelPage] Error in handleConnectWallet:', err);
			// guardianEoaErrorStore will be set by connectGuardianEoaAccount itself.
			// If a page-specific error message for the button action is needed, use pageErrorMessage:
			// pageErrorMessage = err instanceof Error ? `Connection failed: ${err.message}` : 'Failed to initiate connection.';
		});
	}
</script>

<div class="space-y-6 p-4 md:p-8">
	<h1 class="text-3xl font-bold text-sky-600">
		Sahelanthropus Token ({SAHEL_TOKEN_SYMBOL || 'Token'})
	</h1>

	{#if !sahelPhaseConfig}
		<div class="rounded border border-red-400 bg-red-100 p-4 text-red-700">
			Configuration error: Sahelanthropus phase data is not defined in `roadmap/config.ts`.
		</div>
	{:else if !SAHEL_TOKEN_ADDRESS}
		<div class="rounded border border-red-400 bg-red-100 p-4 text-red-700">
			Configuration error: Sahel token address is not defined for the Sahelanthropus phase. Please
			check `roadmap/config.ts`.
		</div>
	{:else if !$guardianEoaAddressStore}
		<div class="rounded border border-orange-400 bg-orange-100 p-4 text-orange-700">
			<p>Your EOA Guardian Wallet is not connected.</p>
			<button
				on:click={handleConnectWallet}
				class="focus:ring-opacity-50 mt-2 rounded bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500 focus:outline-none"
			>
				Connect Wallet
			</button>
			{#if $guardianEoaErrorStore}
				<p class="mt-2 text-sm text-red-600">Error: {$guardianEoaErrorStore}</p>
			{/if}
		</div>
	{:else}
		<div class="rounded-lg bg-white p-6 shadow-lg">
			<div class="mb-4">
				<h2 class="text-xl font-semibold text-gray-800">Wallet Information</h2>
				<p class="mt-1 text-sm text-gray-600">
					Connected EOA: <span class="font-mono break-all text-sky-700"
						>{$guardianEoaAddressStore}</span
					>
				</p>
				<p class="text-sm text-gray-600">
					Chain ID: <span class="font-mono text-sky-700"
						>{$guardianEoaChainIdStore ?? 'Loading...'}</span
					>
					{#if $guardianEoaChainIdStore && $guardianEoaChainIdStore !== EXPECTED_CHAIN_ID}
						<span class="ml-2 text-orange-600">(Expected: {EXPECTED_CHAIN_ID} for Gnosis)</span>
					{/if}
				</p>
			</div>

			{#if $guardianEoaChainIdStore !== EXPECTED_CHAIN_ID && $guardianEoaChainIdStore !== null}
				<div class="mt-3 rounded border border-orange-400 bg-orange-100 p-3 text-orange-700">
					Warning: Please switch your wallet to Gnosis Chain (ID: {EXPECTED_CHAIN_ID}) to see your {SAHEL_TOKEN_SYMBOL}
					balance. You are currently on chain ID: {$guardianEoaChainIdStore}.
				</div>
			{/if}

			<div class="mt-6">
				<h3 class="text-lg font-semibold text-gray-800">Your {SAHEL_TOKEN_SYMBOL} Balance</h3>
				{#if isLoading}
					<p class="animate-pulse py-2 text-gray-500">Loading balance...</p>
				{:else if pageErrorMessage}
					<p class="py-2 text-red-600">{pageErrorMessage}</p>
				{:else if $guardianEoaChainIdStore === EXPECTED_CHAIN_ID && formattedBalanceValue !== null}
					<p class="py-2 text-2xl font-bold text-sky-600">
						{formattedBalanceValue}
						<span class="text-lg font-medium">{SAHEL_TOKEN_SYMBOL}</span>
					</p>
				{:else if $guardianEoaChainIdStore === EXPECTED_CHAIN_ID}
					<p class="py-2 text-gray-500">
						Could not retrieve balance. You might not have any {SAHEL_TOKEN_SYMBOL} tokens, or the token
						is not yet deployed on Gnosis.
					</p>
				{:else}
					<!-- Message for wrong chain is handled above, this is a fallback if balance couldn't be determined due to chain mismatch prior to fetch logic -->
					<p class="py-2 text-gray-500">Switch to Gnosis chain to view your balance.</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if sahelPhaseConfig && !GNOSIS_RPC_URL}
		<div class="mt-4 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-700">
			Note: The RPC URL for Gnosis is not defined in the configuration for the "Sahelanthropus"
			phase. Balance display may fail.
		</div>
	{/if}
</div>

<!-- Minimal global style for background, assuming Tailwind is set up globally -->
<style>
	:global(body) {
		/* Tailwind's gray-100 is a common choice for a light background */
		/* background-color: #f3f4f6; */
		/* Ensure this doesn't conflict with layout's global styles */
	}
</style>
