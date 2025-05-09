<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import { initializeGuardianEoaClient, connectGuardianEoaAccount } from '$lib/wallet/guardian-eoa';
	import { roadmapConfig } from '$lib/roadmap/config';
	import {
		formatUnits,
		type Address,
		type WalletClient,
		createPublicClient,
		http,
		encodeFunctionData,
		parseUnits,
		isAddress
	} from 'viem';
	import { gnosis } from 'viem/chains'; // Import Gnosis chain definition

	import { pageMetadataStore } from '$lib/stores/layoutStore';
	import type { PageData } from './$types';
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte'; // Import the new central facade type

	// Use $props() for runes mode
	let { data } = $props<{ data: PageData }>();

	// Use $effect to update the store when data changes
	$effect(() => {
		if (data.title && data.description) {
			$pageMetadataStore = { title: data.title, description: data.description };
		}
	});
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

	// --- Superfluid Config (from roadmapConfig) ---
	const typedSahelPhaseConfig = roadmapConfig.phases.find((p) => p.name === 'Sahelanthropus') as
		| (typeof roadmapConfig.phases)[0]
		| undefined;
	const contractsForGnosis =
		typedSahelPhaseConfig?.contracts?.[EXPECTED_CHAIN_ID.toString() as '100'];

	const SAHELX_TOKEN_ADDRESS = contractsForGnosis?.SAHELX_TOKEN_ADDRESS as Address | undefined;
	const CFA_V1_FORWARDER_ADDRESS = contractsForGnosis?.CFA_V1_FORWARDER as Address | undefined;
	// const SUPERFLUID_HOST_ADDRESS = contractsForChain?.SUPERFLUID_HOST as Address | undefined; // May not be needed if using forwarder
	// const CFA_V1_ADDRESS = contractsForChain?.CFA_V1 as Address | undefined; // May not be needed if using forwarder

	// --- ABI Imports ---
	// The erc20Abi is already defined
	// We will use the CFAv1Forwarder ABI for creating flows, and ISuperToken for SAHELx balance
	import { abi as CFAv1ForwarderAbi } from '$lib/roadmap/abis/CFAv1Forwarder.abi';
	import { abi as ISuperTokenAbi } from '$lib/roadmap/abis/ISuperToken.abi';

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
		},
		{
			name: 'transfer',
			type: 'function' as const,
			stateMutability: 'nonpayable' as const,
			inputs: [
				{ name: 'to', type: 'address' },
				{ name: 'amount', type: 'uint256' }
			],
			outputs: [{ name: 'success', type: 'bool' }]
		}
	] as const; // Use 'as const' for better type inference with viem

	// --- Reactive State (Svelte 5) ---
	let tokenBalance = $state<bigint | null>(null);
	let tokenDecimals = $state<number>(18); // Default to 18, will try to fetch
	let isLoading = $state<boolean>(false);
	let pageErrorMessage = $state<string | null>(null);
	let formattedBalanceValue = $state<string | null>(null); // New state variable

	// Get 'o' from context using the new HominioFacade type
	const o = getContext<HominioFacade>('o');

	// Destructure the specific store instances from 'o.guardian'
	const {
		address: guardianEoaAddressStore,
		chainId: guardianEoaChainIdStore,
		error: guardianEoaErrorStore,
		client: guardianEoaClientStore
	} = o.guardian;

	// --- State for Sending Sahel (ERC20) ---
	let targetAddressSend = $state<Address | ''>('');
	let amountToSendString = $state<string>('');
	let isSendingSahel = $state<boolean>(false);
	let sendSahelTxHash = $state<string | null>(null);
	let sendSahelError = $state<string | null>(null);
	// --- End State for Sending Sahel ---

	// --- State for Superfluid Streaming (SAHELx) ---
	let targetAddressStream = $state<Address | ''>('');
	let flowRateString = $state<string>(''); // e.g., "10" for 10 SAHELx per month, will be converted to per second
	let isCreatingStream = $state<boolean>(false);
	let createStreamTxHash = $state<string | null>(null);
	let createStreamError = $state<string | null>(null);

	let autoSwitchAttempted = $state<boolean>(false); // Flag to prevent repeated auto-switch attempts

	// --- Attempt to switch to Gnosis Chain ---
	async function attemptAutoSwitchToGnosis(client: WalletClient) {
		if (autoSwitchAttempted) return;
		autoSwitchAttempted = true; // Mark that an attempt is being made for this load/client connection

		console.log(
			'[SahelPage] Attempting to auto-switch to Gnosis Chain (ID:',
			EXPECTED_CHAIN_ID,
			')'
		);
		pageErrorMessage = null; // Clear previous page errors related to chain

		try {
			await client.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: '0x' + EXPECTED_CHAIN_ID.toString(16) }]
			});
			console.log('[SahelPage] Successfully requested chain switch.');
			// The chainIdStore should update reactively, triggering other effects.
		} catch (switchError: any) {
			// Check if the error is because the chain is not added to the wallet (common error code)
			if (switchError.code === 4902 || switchError.data?.originalError?.code === 4902) {
				console.warn('[SahelPage] Gnosis Chain not found in wallet. Attempting to add it.');
				try {
					await client.request({
						method: 'wallet_addEthereumChain',
						params: [
							{
								chainId: '0x' + EXPECTED_CHAIN_ID.toString(16),
								chainName: 'Gnosis',
								nativeCurrency: {
									name: 'xDAI',
									symbol: 'xDAI',
									decimals: 18
								},
								rpcUrls: [GNOSIS_RPC_URL || 'https://rpc.gnosischain.com'], // Fallback RPC
								blockExplorerUrls: [
									sahelPhaseConfig?.blockExplorers?.default?.url || 'https://gnosisscan.io'
								] // Fallback explorer
							}
						]
					});
					console.log(
						'[SahelPage] Successfully requested to add Gnosis Chain. Now attempting to switch again.'
					);
					// Try switching again after adding
					await client.request({
						method: 'wallet_switchEthereumChain',
						params: [{ chainId: '0x' + EXPECTED_CHAIN_ID.toString(16) }]
					});
					console.log('[SahelPage] Successfully requested chain switch after adding.');
				} catch (addError: any) {
					console.error('[SahelPage] Error adding or switching to Gnosis Chain:', addError);
					pageErrorMessage = `Failed to add/switch to Gnosis: ${addError.message || 'Unknown error'}`;
				}
			} else {
				// Handle other switch errors (e.g., user rejected)
				console.error('[SahelPage] Error switching to Gnosis Chain:', switchError);
				if (switchError.message && !switchError.message.includes('User rejected')) {
					pageErrorMessage = `Could not switch to Gnosis: ${switchError.message}`;
				}
				// If user rejected, we don't necessarily show a page error, the existing UI hints are enough
			}
		}
	}

	// --- Fetch Balance Logic (Svelte 5 effect) ---
	$effect(() => {
		async function fetchBalanceAndDecimals() {
			const currentClient = $guardianEoaClientStore; // Capture for consistent use in this effect run
			const currentChainId = $guardianEoaChainIdStore;

			// Attempt auto-switch if client is available, on wrong chain, and not yet attempted
			if (
				currentClient &&
				currentChainId !== null &&
				currentChainId !== EXPECTED_CHAIN_ID &&
				!autoSwitchAttempted
			) {
				attemptAutoSwitchToGnosis(currentClient);
				// Note: attemptAutoSwitchToGnosis is async. The rest of this effect will run
				// before the switch is complete. The chainIdStore update will then re-trigger this effect.
			}

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

		// Ensure all reactive dependencies of this $effect are accessed correctly
		// e.g., $guardianEoaAddressStore, $guardianEoaChainIdStore, $guardianEoaClientStore
		// should trigger this effect if they change.
		const _addr = $guardianEoaAddressStore;
		const _chain = $guardianEoaChainIdStore;
		const _client = $guardianEoaClientStore;

		fetchBalanceAndDecimals();

		// Cleanup function for the effect
		return () => {
			// Optional: Reset state if dependencies change to avoid stale data
			// formattedBalanceValue = null;
			// tokenBalance = null;
		};
	});

	// --- Handle Send Sahel Token ---
	async function handleSendSahel() {
		isSendingSahel = true;
		sendSahelTxHash = null;
		sendSahelError = null;

		try {
			// 1. Validate inputs
			if (!targetAddressSend || !isAddress(targetAddressSend)) {
				throw new Error('Invalid recipient address.');
			}
			if (
				!amountToSendString ||
				isNaN(parseFloat(amountToSendString)) ||
				parseFloat(amountToSendString) <= 0
			) {
				throw new Error('Invalid amount. Must be a positive number.');
			}

			// 2. Check wallet connection & network
			const client = $guardianEoaClientStore;
			const senderAddress = $guardianEoaAddressStore;
			const chainId = $guardianEoaChainIdStore;

			if (!client || !senderAddress) {
				throw new Error('Guardian EOA wallet not connected.');
			}
			if (chainId !== EXPECTED_CHAIN_ID) {
				throw new Error(
					`Please switch to Gnosis Chain (ID: ${EXPECTED_CHAIN_ID}). Currently on chain ID: ${chainId}.`
				);
			}
			if (!SAHEL_TOKEN_ADDRESS) {
				throw new Error('SAHEL token address is not configured.');
			}

			// 3. Parse amount to bigint
			const amountToSendBigInt = parseUnits(amountToSendString, tokenDecimals);

			// 4. Construct and send transaction
			console.log('[SahelPage] Sending SAHEL:', {
				to: SAHEL_TOKEN_ADDRESS,
				args: [targetAddressSend, amountToSendBigInt],
				account: senderAddress
			});

			const hash = await client.writeContract({
				address: SAHEL_TOKEN_ADDRESS,
				abi: erc20Abi,
				functionName: 'transfer',
				args: [targetAddressSend, amountToSendBigInt],
				account: senderAddress, // Make sure client has the account set or it's passed correctly
				chain: gnosis // ensure chain is passed if client is not pre-configured with it
			});

			sendSahelTxHash = hash;
			console.log('[SahelPage] SAHEL sent successfully. Tx Hash:', hash);

			// 5. Refresh balance (optional: wait for tx confirmation for more accuracy)
			// For now, optimistic refresh. Consider adding a delay or checking tx receipt.
			setTimeout(() => {
				// Re-trigger the $effect that fetches balance by making a dependency change
				// or by directly calling a refactored fetch balance function.
				// For simplicity, if $effect watches $guardianEoaAddressStore and it hasn't changed,
				// we might need a more direct way to ask for a refresh.
				// A simple way: temporarily set $guardianEoaAddressStore to null then back, but it's hacky.
				// Better: refactor fetchBalanceAndDecimals to be callable directly.
				// Let's assume fetchBalanceAndDecimals can be called again.
				// $effect will re-run if $guardianEoaAddressStore changes. If not, we might need
				// to call a standalone fetch function.
				// For now, the existing $effect structure will re-fetch if `isLoading` is toggled
				// or if pageErrorMessage is cleared, which it is at the start of fetchBalanceAndDecimals.
				// To ensure it runs again if everything was fine before:
				isLoading = true; // This will trigger the effect to run fetchBalanceAndDecimals again.
			}, 1000); // Small delay to allow state to update and RPC to potentially see change
		} catch (err: any) {
			console.error('[SahelPage] Error sending SAHEL:', err);
			sendSahelError = err.message || 'An unknown error occurred.';
		} finally {
			isSendingSahel = false;
		}
	}
	// --- End Handle Send Sahel Token ---

	function handleConnectWallet() {
		connectGuardianEoaAccount().catch((err) => {
			console.error('[SahelPage] Error in handleConnectWallet:', err);
			// guardianEoaErrorStore will be set by connectGuardianEoaAccount itself.
			// If a page-specific error message for the button action is needed, use pageErrorMessage:
			// pageErrorMessage = err instanceof Error ? `Connection failed: ${err.message}` : 'Failed to initiate connection.';
		});
	}

	// --- Handle Create Superfluid Stream (SAHELx) ---
	async function handleCreateStream() {
		isCreatingStream = true;
		createStreamTxHash = null;
		createStreamError = null;

		try {
			// 1. Validate inputs
			if (!targetAddressStream || !isAddress(targetAddressStream)) {
				throw new Error('Invalid recipient address for streaming.');
			}
			const flowRateNum = parseFloat(flowRateString);
			if (isNaN(flowRateNum) || flowRateNum <= 0) {
				throw new Error('Invalid flow rate. Must be a positive number.');
			}

			// 2. Check wallet connection & network & config
			const client = $guardianEoaClientStore;
			const senderAddress = $guardianEoaAddressStore;
			const chainId = $guardianEoaChainIdStore;

			if (!client || !senderAddress) {
				throw new Error('Guardian EOA wallet not connected.');
			}
			if (chainId !== EXPECTED_CHAIN_ID) {
				throw new Error(`Please switch to Gnosis Chain (ID: ${EXPECTED_CHAIN_ID}).`);
			}
			if (!SAHELX_TOKEN_ADDRESS) {
				throw new Error('SAHEL SuperToken address is not configured.');
			}
			if (!CFA_V1_FORWARDER_ADDRESS) {
				throw new Error('CFAv1 Forwarder address is not configured.');
			}

			// 3. Parse flow rate to wei per second
			// Assuming flowRateString is SAHELx per second for now. Convert to wei.
			const flowRateWeiPerSecond = parseUnits(flowRateString, tokenDecimals); // Use main tokenDecimals

			// 4. Construct and send transaction via CFAv1Forwarder
			console.log('[SahelPage] Creating SAHELx stream:', {
				forwarder: CFA_V1_FORWARDER_ADDRESS,
				token: SAHELX_TOKEN_ADDRESS, // This is the SAHEL SuperToken address
				sender: senderAddress,
				receiver: targetAddressStream,
				flowRate: flowRateWeiPerSecond.toString()
			});

			const hash = await client.writeContract({
				address: CFA_V1_FORWARDER_ADDRESS,
				abi: CFAv1ForwarderAbi,
				functionName: 'createFlow',
				args: [
					SAHELX_TOKEN_ADDRESS, // superToken (SAHEL SuperToken address)
					senderAddress,
					targetAddressStream,
					flowRateWeiPerSecond,
					'0x'
				],
				account: senderAddress,
				chain: gnosis
			});

			createStreamTxHash = hash;
			console.log('[SahelPage] SAHELx stream creation initiated. Tx Hash:', hash);

			// 5. Refresh main SAHEL balance (optimistic)
			setTimeout(() => {
				// Trigger the main balance fetch effect
				isLoading = true; // This will trigger the $effect for fetchBalanceAndDecimals
			}, 1000);
		} catch (err: any) {
			console.error('[SahelPage] Error creating SAHELx stream:', err);
			createStreamError = err.message || 'An unknown error occurred during stream creation.';
		} finally {
			isCreatingStream = false;
		}
	}
	// --- End Handle Create Superfluid Stream ---
</script>

<div class="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
	<h1 class="text-3xl font-bold text-sky-600">
		Guardian EOA Wallet - {SAHEL_TOKEN_SYMBOL || 'Token'} Management
	</h1>

	{#if !sahelPhaseConfig}
		<div class="rounded border border-red-400 bg-red-100 p-4 text-red-700">
			Configuration error: Sahelanthropus phase data is not defined in `roadmap/config.ts`.
		</div>
	{:else if !SAHEL_TOKEN_ADDRESS}
		<div class="rounded border border-red-400 bg-red-100 p-4 text-red-700">
			Configuration error: SAHEL token address is not defined for the Sahelanthropus phase. Please
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
		<!-- Main layout grid -->
		<div class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
			<!-- Left Column: Actions (Send & Stream) -->
			<div class="space-y-8 lg:col-span-2">
				<!-- Send Sahel Token Section -->
				{#if $guardianEoaAddressStore && $guardianEoaChainIdStore === EXPECTED_CHAIN_ID && SAHEL_TOKEN_ADDRESS}
					<div class="rounded-lg bg-white p-6 shadow-lg">
						<h2 class="mb-4 text-xl font-semibold text-gray-800">Send {SAHEL_TOKEN_SYMBOL}</h2>

						<div class="space-y-4">
							<div>
								<label for="recipientAddress" class="block text-sm font-medium text-gray-700"
									>Recipient Address</label
								>
								<input
									type="text"
									id="recipientAddress"
									bind:value={targetAddressSend}
									class="mt-1 block w-full rounded-md border-gray-300 text-slate-800 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm"
									placeholder="0x..."
								/>
							</div>

							<div>
								<label for="amountToSend" class="block text-sm font-medium text-gray-700"
									>Amount to Send</label
								>
								<input
									type="text"
									id="amountToSend"
									bind:value={amountToSendString}
									class="mt-1 block w-full rounded-md border-gray-300 text-slate-800 shadow-sm focus:border-sky-500 focus:ring-sky-500 sm:text-sm"
									placeholder="e.g., 10.5"
								/>
							</div>

							<button
								on:click={handleSendSahel}
								disabled={isSendingSahel || !$guardianEoaClientStore}
								class="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-50"
							>
								{#if isSendingSahel}
									<span class="spinner mr-2"></span>Sending {SAHEL_TOKEN_SYMBOL}...
								{:else}
									Send {SAHEL_TOKEN_SYMBOL}
								{/if}
							</button>
						</div>

						{#if sendSahelTxHash}
							<div class="mt-4 rounded-md bg-green-50 p-3">
								<p class="text-sm font-medium text-green-700">Transaction Submitted!</p>
								<p class="mt-1 text-xs text-green-600">
									Tx Hash:
									{#if sahelPhaseConfig?.blockExplorers?.default?.url}
										<a
											href={`${sahelPhaseConfig.blockExplorers.default.url.endsWith('/') ? sahelPhaseConfig.blockExplorers.default.url : sahelPhaseConfig.blockExplorers.default.url + '/'}tx/${sendSahelTxHash}`}
											target="_blank"
											rel="noopener noreferrer"
											class="font-mono break-all text-green-700 underline hover:text-green-800"
										>
											{sendSahelTxHash}
										</a>
									{:else}
										<span class="font-mono break-all">{sendSahelTxHash}</span>
									{/if}
								</p>
							</div>
						{/if}

						{#if sendSahelError}
							<div class="mt-4 rounded-md bg-red-50 p-3">
								<p class="text-sm font-medium text-red-700">Error Sending Token:</p>
								<p class="mt-1 text-xs text-red-600">{sendSahelError}</p>
							</div>
						{/if}
					</div>
				{/if}
				<!-- End Send Sahel Token Section -->

				<!-- Create SAHEL Stream Section -->
				{#if $guardianEoaAddressStore && $guardianEoaChainIdStore === EXPECTED_CHAIN_ID && SAHELX_TOKEN_ADDRESS && CFA_V1_FORWARDER_ADDRESS}
					<div class="rounded-lg bg-white p-6 shadow-lg">
						<h2 class="mb-4 text-xl font-semibold text-gray-800">
							Create {SAHEL_TOKEN_SYMBOL} Stream
						</h2>

						<div class="space-y-4">
							<div>
								<label for="recipientAddressStream" class="block text-sm font-medium text-gray-700"
									>Recipient Address (for Stream)</label
								>
								<input
									type="text"
									id="recipientAddressStream"
									bind:value={targetAddressStream}
									class="mt-1 block w-full rounded-md border-gray-300 text-slate-800 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
									placeholder="0x..."
								/>
							</div>

							<div>
								<label for="flowRate" class="block text-sm font-medium text-gray-700"
									>Flow Rate ({SAHEL_TOKEN_SYMBOL} per second)</label
								>
								<input
									type="text"
									id="flowRate"
									bind:value={flowRateString}
									class="mt-1 block w-full rounded-md border-gray-300 text-slate-800 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
									placeholder="e.g., 0.00001 for a small stream"
								/>
								<p class="mt-1 text-xs text-gray-500">
									Enter the amount of {SAHEL_TOKEN_SYMBOL} to stream per second (e.g., 1
									{SAHEL_TOKEN_SYMBOL}/month ≈ 0.0000003858 {SAHEL_TOKEN_SYMBOL}/second).
								</p>
							</div>

							<button
								on:click={handleCreateStream}
								disabled={isCreatingStream || !$guardianEoaClientStore}
								class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
							>
								{#if isCreatingStream}
									<span class="spinner mr-2"></span>Starting Stream...
								{:else}
									Start {SAHEL_TOKEN_SYMBOL} Stream
								{/if}
							</button>
						</div>

						{#if createStreamTxHash}
							<div class="mt-4 rounded-md bg-green-50 p-3">
								<p class="text-sm font-medium text-green-700">Stream Creation Submitted!</p>
								<p class="mt-1 text-xs text-green-600">
									Tx Hash:
									{#if sahelPhaseConfig?.blockExplorers?.default?.url}
										<a
											href={`${sahelPhaseConfig.blockExplorers.default.url.endsWith('/') ? sahelPhaseConfig.blockExplorers.default.url : sahelPhaseConfig.blockExplorers.default.url + '/'}tx/${createStreamTxHash}`}
											target="_blank"
											rel="noopener noreferrer"
											class="font-mono break-all text-green-700 underline hover:text-green-800"
										>
											{createStreamTxHash}
										</a>
									{:else}
										<span class="font-mono break-all">{createStreamTxHash}</span>
									{/if}
								</p>
							</div>
						{/if}

						{#if createStreamError}
							<div class="mt-4 rounded-md bg-red-50 p-3">
								<p class="text-sm font-medium text-red-700">Error Creating Stream:</p>
								<p class="mt-1 text-xs text-red-600">{createStreamError}</p>
							</div>
						{/if}
					</div>
				{/if}
				<!-- End Create SAHEL Stream Section -->
			</div>

			<!-- Right Column: Balances & Wallet Info -->
			<div class="space-y-8 lg:col-span-1">
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
							Warning: Please switch your wallet to Gnosis Chain (ID: {EXPECTED_CHAIN_ID}) to see
							your {SAHEL_TOKEN_SYMBOL}
							balance. You are currently on chain ID: {$guardianEoaChainIdStore}.
						</div>
					{/if}

					<div class="mt-6">
						<h3 class="text-lg font-semibold text-gray-800">
							Your {SAHEL_TOKEN_SYMBOL} Balance
						</h3>
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
								Could not retrieve balance. You might not have any {SAHEL_TOKEN_SYMBOL} tokens, or the
								token is not yet deployed on Gnosis.
							</p>
						{:else}
							<p class="py-2 text-gray-500">Switch to Gnosis chain to view your balance.</p>
						{/if}
					</div>
				</div>
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
	.spinner {
		display: inline-block;
		border: 2px solid currentColor;
		border-right-color: transparent;
		width: 0.75em;
		height: 0.75em;
		border-radius: 50%;
		animation: spin 0.75s linear infinite;
		vertical-align: text-bottom;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
