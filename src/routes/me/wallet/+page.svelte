<script lang="ts">
	import { onMount, getContext, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { ExecuteJsResponse } from '@lit-protocol/types';
	import type { Hex, Address, TransactionSerializableEIP1559, Signature } from 'viem';
	import {
		formatUnits,
		createPublicClient,
		http,
		parseUnits,
		encodeFunctionData,
		serializeTransaction
	} from 'viem';
	import { gnosis } from 'viem/chains';
	import { pageMetadataStore } from '$lib/stores/layoutStore';
	import type { PageData } from './$types';
	import { roadmapConfig } from '$lib/roadmap/config';
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte';
	import { requestPKPSignature } from '$lib/wallet/modalStore';
	import type { PKPSigningRequestData } from '$lib/wallet/modalTypes';
	import {
		currentUserPkpProfileStore,
		type CurrentUserPkpProfile
	} from '$lib/stores/pkpSessionStore';

	// Use $props() for runes mode
	let { data } = $props<{ data: PageData }>();

	// Use $effect to update the store when data changes
	$effect(() => {
		if (data.title && data.description) {
			$pageMetadataStore = { title: data.title, description: data.description };
		}
	});

	// Access the Hominio facade from context, now using the HominioFacade type
	const o = getContext<HominioFacade>('o');

	// Destructure stores from the facade
	const litClientStore = o.lit.client;
	const {
		client: guardianEoaClientStore,
		address: guardianEoaAddressStore,
		chainId: guardianEoaChainIdStore,
		error: guardianEoaErrorStore
	} = o.guardian;

	let currentPkpProfile = $state<CurrentUserPkpProfile | null>(null);

	// Reactive derivations from currentPkpProfile
	let passkeyDataForModal = $derived(currentPkpProfile?.passkeyData);
	let pkpTokenId = $derived(currentPkpProfile?.pkpTokenId);
	let pkpPublicKey = $derived(currentPkpProfile?.pkpPublicKey);
	let pkpEthAddress = $derived(currentPkpProfile?.pkpEthAddress);

	// Use $effect for currentUserPkpProfileStore subscription
	$effect(() => {
		const unsubscribe = currentUserPkpProfileStore.subscribe((profile) => {
			currentPkpProfile = profile;
			console.log('[WalletPage] currentUserPkpProfileStore updated:', profile);
		});
		return () => unsubscribe();
	});

	let messageToSign = $state('Hello from Hominio PKP Wallet!');
	let signatureResult = $state<{ signature: Hex; dataSigned: Hex } | null>(null);
	let isSigningMessage = $state(false);
	let magicNumber = $state(43);
	let litActionResult = $state<ExecuteJsResponse | null>(null);
	let isExecutingAction = $state(false);
	let litActionCodeForExecution = $state(`// Basic Lit Action for direct execution
const go = async () => {
  // jsParams (like magicNumber) are available globally in the Lit Action
  if (typeof magicNumber === 'number') {
    if (magicNumber >= 42) {
      Lit.Actions.setResponse({ response: JSON.stringify({ result: 'The number is greater than or equal to 42!', yourInput: magicNumber }) });
    } else {
      Lit.Actions.setResponse({ response: JSON.stringify({ result: 'The number is less than 42!', yourInput: magicNumber }) });
    }
  } else {
    Lit.Actions.setResponse({ response: JSON.stringify({ result: 'magicNumber was not provided or not a number.', yourInput: magicNumber }) });
  }
};
go();`);
	let mainError = $state('');
	let mainSuccess = $state('');
	let profileName = $state('');
	const PROFILE_STORAGE_KEY = 'hominio_profile_data_encrypted';
	let encryptedProfileDataString = $state<string | null>(null);
	let isEncryptingProfile = $state(false);
	let isDecryptingProfile = $state(false);
	let selectedWalletSection = $state<'sign' | 'action' | 'profile' | 'transfer'>('sign'); // Added transfer
	let unsubscribeLitClient: () => void = () => {};

	// --- Sahel Token Balance State & Config ---
	const sahelPhaseConfig = roadmapConfig.phases.find((p) => p.name === 'Sahelanthropus');
	const SAHEL_TOKEN_ADDRESS = sahelPhaseConfig?.protocolTokenAddress as Address | undefined;
	const EXPECTED_CHAIN_ID_SAHEL = gnosis.id;
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
	] as const;

	let pkpSahelTokenBalance = $state<bigint | null>(null);
	let pkpSahelTokenDecimals = $state<number>(18);
	let isLoadingPkpSahelBalance = $state<boolean>(false);
	let pkpSahelBalanceError = $state<string | null>(null);
	let formattedPkpSahelBalance = $state<string | null>(null);
	// --- End Sahel Token Balance State & Config ---

	// --- Send Sahel Token State ---
	let isSendingSahel = $state<boolean>(false);
	let sendSahelTxHash = $state<string | null>(null);
	let sendSahelError = $state<string | null>(null);
	// --- End Send Sahel Token State ---

	// --- Config Access for Explorer Link ---
	const sahelExplorerBaseUrl = sahelPhaseConfig?.blockExplorers?.default?.url;
	// --- End Config Access ---

	onMount(async () => {
		if (browser) {
			// storedPasskey = getStoredPasskeyData(); // REMOVED

			// const storedPKPDataString = localStorage.getItem('mintedPKPData'); // REMOVED
			// if (storedPKPDataString) { // REMOVED
			// 	try { // REMOVED
			// 		const storedPKPData = JSON.parse(storedPKPDataString); // REMOVED
			// 		if ( // REMOVED
			// 			storedPKPData && // REMOVED
			// 			storedPKPData.pkpTokenId && // REMOVED
			// 			storedPKPData.pkpPublicKey && // REMOVED
			// 			storedPKPData.pkpEthAddress // REMOVED
			// 		) { // REMOVED
			// 			mintedPkpTokenId = storedPKPData.pkpTokenId; // REMOVED
			// 			mintedPkpPublicKey = storedPKPData.pkpPublicKey; // REMOVED
			// 			mintedPkpEthAddress = storedPKPData.pkpEthAddress; // REMOVED
			// 		} else { // REMOVED
			// 			localStorage.removeItem('mintedPKPData'); // REMOVED
			// 		} // REMOVED
			// 	} catch (error) { // REMOVED
			// 		localStorage.removeItem('mintedPKPData'); // REMOVED
			// 	} // REMOVED
			// } // REMOVED

			// encryptedProfileDataString is still managed by localStorage for now
			encryptedProfileDataString = localStorage.getItem(PROFILE_STORAGE_KEY);

			// Removed session resumption logic from here
			// unsubscribeLitClient = litClientStore.subscribe(async (client) => {
			// 	if (client && client.ready && browser) {
			// 		// PKP Session is now handled by the modal when an operation is requested.
			// 	}
			// });
		}
	});

	onDestroy(() => {
		// if (unsubscribeLitClient) { // No longer needed for this specific purpose
		// 	unsubscribeLitClient();
		// }
	});

	// REMOVED tryResumePkpSession
	// REMOVED handleLoginWithPasskey

	function resetMainMessages() {
		mainError = '';
		mainSuccess = '';
	}

	async function handleSignMessageWithPkp() {
		const currentLitClient = $litClientStore; // Still needed to pass to modal if modal doesn't get from context itself
		if (!currentLitClient || !currentLitClient.ready) {
			mainError = 'Lit client not available or not ready.';
			return;
		}
		if (!messageToSign.trim()) {
			mainError = 'Enter a message to sign.';
			return;
		}
		if (!pkpPublicKey || !pkpEthAddress || !passkeyDataForModal) {
			mainError =
				'PKP details or passkey data missing. Ensure wallet is set up and profile loaded.';
			return;
		}

		isSigningMessage = true;
		resetMainMessages();
		signatureResult = null;

		const request: PKPSigningRequestData = {
			pkpPublicKey: pkpPublicKey!,
			pkpEthAddress: pkpEthAddress!,
			passkeyData: passkeyDataForModal!,
			type: 'message',
			message: messageToSign
			// litNodeClient and sessionSigs are handled by the modal
		};

		try {
			// requestPKPSignature now returns a promise that resolves with the result or rejects
			const result = (await requestPKPSignature(request)) as { signature: Hex; dataSigned: Hex };
			signatureResult = result;
			mainSuccess = 'Message signed successfully via modal!';
		} catch (err: unknown) {
			mainError =
				err instanceof Error
					? `Modal signing error: ${err.message}`
					: 'Unknown error during modal signing.';
			if (
				mainError.toLowerCase().includes('cancelled') ||
				mainError.toLowerCase().includes('user rejected')
			) {
				mainSuccess = 'Signing operation cancelled by user.';
				mainError = ''; // Clear error if it was just a cancellation
			}
			signatureResult = null;
		} finally {
			isSigningMessage = false;
		}
	}

	async function handleExecuteLitAction() {
		const currentLitClient = $litClientStore;
		if (!currentLitClient || !currentLitClient.ready) {
			mainError = 'Lit client not available or not ready.';
			return;
		}
		if (!pkpPublicKey || !pkpEthAddress || !passkeyDataForModal) {
			mainError =
				'PKP details or passkey data missing for Lit Action. Ensure wallet is set up and profile loaded.';
			return;
		}

		isExecutingAction = true;
		resetMainMessages();
		litActionResult = null;

		const request: PKPSigningRequestData = {
			pkpPublicKey: pkpPublicKey!,
			pkpEthAddress: pkpEthAddress!,
			passkeyData: passkeyDataForModal!,
			type: 'executeAction',
			actionCode: litActionCodeForExecution,
			actionJsParams: { magicNumber: magicNumber }
		};

		try {
			const result = (await requestPKPSignature(request)) as ExecuteJsResponse;
			litActionResult = result;
			mainSuccess = 'Lit Action executed successfully via modal!';
			console.log('Lit Action Result from Modal:', litActionResult);
		} catch (err: unknown) {
			mainError =
				err instanceof Error
					? `Modal Lit Action error: ${err.message}`
					: 'Unknown error during modal Lit Action.';
			if (
				mainError.toLowerCase().includes('cancelled') ||
				mainError.toLowerCase().includes('user rejected')
			) {
				mainSuccess = 'Lit Action execution cancelled by user.';
				mainError = '';
			}
			litActionResult = null;
		} finally {
			isExecutingAction = false;
		}
	}

	async function handleSaveProfile() {
		const currentLitClient = $litClientStore;
		if (!profileName.trim()) {
			mainError = 'Enter a profile name.';
			return;
		}
		if (
			!currentLitClient ||
			!currentLitClient.ready ||
			!pkpPublicKey ||
			!pkpEthAddress ||
			!passkeyDataForModal
		) {
			mainError = 'Lit client/PKP details/passkey data needed to save profile.';
			return;
		}

		resetMainMessages();
		isEncryptingProfile = true;

		// Define ACCs based on PKP's ETH address
		const accessControlConditions = [
			{
				contractAddress: '', // No specific contract, just PKP ownership
				standardContractType: '',
				chain: 'ethereum', // Or the chain your PKP is associated with for ACCs
				method: '',
				parameters: [':userAddress'],
				returnValueTest: { comparator: '=', value: pkpEthAddress! }
			}
		];

		const request: PKPSigningRequestData = {
			pkpPublicKey: pkpPublicKey!,
			pkpEthAddress: pkpEthAddress!,
			passkeyData: passkeyDataForModal!,
			type: 'encrypt',
			dataToEncrypt: profileName.trim(),
			accessControlConditions: accessControlConditions,
			chain: 'ethereum' // Specify chain for ACCs if necessary
		};

		try {
			const encryptionResult = (await requestPKPSignature(request)) as {
				ciphertext: string;
				dataToEncryptHash: string;
			};
			const dataToStore = {
				ciphertext: encryptionResult.ciphertext,
				dataToEncryptHash: encryptionResult.dataToEncryptHash,
				accessControlConditions, // Storing ACCs used for encryption
				chain: 'ethereum' // Storing chain used for ACCs
			};
			encryptedProfileDataString = JSON.stringify(dataToStore);
			localStorage.setItem(PROFILE_STORAGE_KEY, encryptedProfileDataString);
			mainSuccess = 'Profile encrypted and saved via modal!';
		} catch (error: unknown) {
			mainError =
				error instanceof Error
					? `Modal encryption error: ${error.message}`
					: 'Unknown error saving profile via modal.';
			if (
				mainError.toLowerCase().includes('cancelled') ||
				mainError.toLowerCase().includes('user rejected')
			) {
				mainSuccess = 'Profile encryption cancelled by user.';
				mainError = '';
			}
			console.error('Error saving profile via modal:', error);
		} finally {
			isEncryptingProfile = false;
		}
	}

	// --- Reactive Profile Decryption ---
	async function attemptProfileDecryption() {
		if (
			!browser ||
			!$litClientStore?.ready ||
			!encryptedProfileDataString || // SessionSigs removed from this check
			profileName || // If already decrypted, skip
			isDecryptingProfile ||
			isEncryptingProfile ||
			!pkpPublicKey || // Need PKP details for the request
			!pkpEthAddress ||
			!passkeyDataForModal // Need passkey data for the request
		) {
			return;
		}

		const currentLitClient = $litClientStore;
		isDecryptingProfile = true;
		resetMainMessages();

		try {
			const storedEncryptedData = JSON.parse(encryptedProfileDataString!);
			if (
				!storedEncryptedData.accessControlConditions ||
				!storedEncryptedData.ciphertext ||
				!storedEncryptedData.dataToEncryptHash
			) {
				throw new Error('Stored encrypted data is missing required fields for decryption.');
			}

			const request: PKPSigningRequestData = {
				pkpPublicKey: pkpPublicKey!,
				pkpEthAddress: pkpEthAddress!,
				passkeyData: passkeyDataForModal!,
				type: 'decrypt',
				ciphertext: storedEncryptedData.ciphertext,
				dataToEncryptHash: storedEncryptedData.dataToEncryptHash,
				accessControlConditions: storedEncryptedData.accessControlConditions,
				chain: storedEncryptedData.chain || 'ethereum'
			};

			const decryptedNameStr = (await requestPKPSignature(request)) as string; // Assuming decrypt returns string
			profileName = decryptedNameStr;
			mainSuccess = 'Profile name decrypted and loaded via modal.';
		} catch (err: unknown) {
			const message =
				err instanceof Error
					? `Modal decryption error: ${err.message}`
					: 'Unknown modal decryption error.';
			if (
				message.toLowerCase().includes('cancelled') ||
				message.toLowerCase().includes('user rejected')
			) {
				mainSuccess = 'Profile decryption cancelled by user.';
				mainError = '';
			} else {
				mainError = `Failed to automatically decrypt profile via modal: ${message}`;
			}
			console.error('Error decrypting profile name reactively via modal:', err);
		} finally {
			isDecryptingProfile = false;
		}
	}

	// Trigger decryption attempt when relevant reactive dependencies change
	$effect(() => {
		attemptProfileDecryption();
	});

	// --- Fetch PKP Sahel Token Balance Logic (Remains largely the same) ---
	async function fetchPkpSahelTokenBalance() {
		if (!pkpEthAddress) {
			pkpSahelBalanceError = 'PKP ETH address not available to fetch balance.';
			return;
		}
		if (!SAHEL_TOKEN_ADDRESS) {
			pkpSahelBalanceError = 'Sahel token address not configured.';
			return;
		}
		if (!GNOSIS_RPC_URL) {
			pkpSahelBalanceError = 'Gnosis RPC URL not configured.';
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
					'[WalletPage] Could not fetch Sahel token decimals, defaulting to 18:',
					decError
				);
				pkpSahelTokenDecimals = 18;
			}

			const balanceResult = await publicClient.readContract({
				address: SAHEL_TOKEN_ADDRESS,
				abi: erc20Abi,
				functionName: 'balanceOf',
				args: [pkpEthAddress]
			});
			pkpSahelTokenBalance = balanceResult as bigint;

			if (pkpSahelTokenBalance !== null) {
				formattedPkpSahelBalance = formatUnits(pkpSahelTokenBalance, pkpSahelTokenDecimals);
			}
		} catch (err) {
			console.error('[WalletPage] Error fetching Sahel token balance for PKP:', err);
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
		if (pkpEthAddress && SAHEL_TOKEN_ADDRESS && GNOSIS_RPC_URL) {
			fetchPkpSahelTokenBalance();
		} else {
			pkpSahelTokenBalance = null;
			formattedPkpSahelBalance = null;
			if (pkpEthAddress && (!SAHEL_TOKEN_ADDRESS || !GNOSIS_RPC_URL)) {
				pkpSahelBalanceError = 'Sahel token configuration missing. Cannot display balance.';
			}
		}
	});
	// --- End Fetch PKP Sahel Token Balance Logic ---

	// --- Handle Send Sahel Token ---
	async function handleSendSahelToken() {
		isSendingSahel = true;
		sendSahelTxHash = null;
		sendSahelError = null;
		resetMainMessages();
		console.log('[WalletPage] Initiating Send Sahel Token process via modal...');

		const currentLitClient = $litClientStore; // For modal, if it needs it explicitly

		// 1. Prerequisite Checks
		if (!currentLitClient?.ready) {
			sendSahelError = 'Lit client not ready.';
		} else if (!pkpPublicKey || !pkpEthAddress || !passkeyDataForModal) {
			// Session check removed
			sendSahelError = 'PKP details or passkey data not available.';
		} else if (!$guardianEoaAddressStore) {
			sendSahelError = 'Guardian EOA address not available.';
		} else if (!SAHEL_TOKEN_ADDRESS) {
			sendSahelError = 'SAHEL Token address not configured.';
		} else if (!GNOSIS_RPC_URL) {
			sendSahelError = 'Gnosis RPC URL not configured.';
		} else if (pkpSahelTokenDecimals === null || pkpSahelTokenDecimals === undefined) {
			sendSahelError = 'SAHEL token decimals not available. Cannot determine amount.';
		}

		if (sendSahelError) {
			isSendingSahel = false;
			mainError = sendSahelError; // Use mainError for UI consistency
			console.error('[WalletPage] Send Sahel prerequisite error:', sendSahelError);
			return;
		}

		try {
			// 2. Define Constants
			const recipientAddress = $guardianEoaAddressStore!;
			const amountToSend = parseUnits('0.1', pkpSahelTokenDecimals);

			// 3. Create Public Client
			const publicClient = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPC_URL!) });

			// 4. Transaction Parameters
			const nonce = await publicClient.getTransactionCount({
				address: pkpEthAddress!,
				blockTag: 'pending'
			});
			const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

			if (!maxFeePerGas || !maxPriorityFeePerGas) {
				throw new Error('Could not estimate EIP-1559 gas fees.');
			}

			const encodedTransferData = encodeFunctionData({
				abi: erc20Abi,
				functionName: 'transfer',
				args: [recipientAddress, amountToSend]
			});

			const estimatedGas = await publicClient.estimateGas({
				account: pkpEthAddress!,
				to: SAHEL_TOKEN_ADDRESS!,
				data: encodedTransferData,
				value: 0n
			});

			// 5. Construct Unsigned Transaction Object (EIP-1559)
			const unsignedTx: TransactionSerializableEIP1559 = {
				to: SAHEL_TOKEN_ADDRESS!,
				value: 0n,
				data: encodedTransferData,
				nonce: nonce,
				gas: estimatedGas,
				maxFeePerGas: maxFeePerGas,
				maxPriorityFeePerGas: maxPriorityFeePerGas,
				chainId: EXPECTED_CHAIN_ID_SAHEL,
				type: 'eip1559'
			};

			// 6. Sign Transaction via Central Modal
			const request: PKPSigningRequestData = {
				pkpPublicKey: pkpPublicKey!,
				pkpEthAddress: pkpEthAddress!,
				passkeyData: passkeyDataForModal!,
				type: 'transaction',
				transaction: unsignedTx,
				tokenDecimals: pkpSahelTokenDecimals // For display in modal
			};

			const signature = (await requestPKPSignature(request)) as Signature;

			// 7. Serialize Signed Transaction
			const signedRawTx = serializeTransaction(unsignedTx, signature);
			console.log('[WalletPage] Broadcasting signed transaction:', signedRawTx);

			// 8. Broadcast Transaction
			const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedRawTx });
			sendSahelTxHash = txHash;
			mainSuccess = 'Sahel Token transfer initiated via modal!';
			console.log('[WalletPage] Transaction broadcasted. Hash:', txHash);
		} catch (err: any) {
			const message = err.message || 'An unknown error occurred during sending.';
			if (
				message.toLowerCase().includes('cancelled') ||
				message.toLowerCase().includes('user rejected')
			) {
				mainSuccess = 'Token transfer cancelled by user.';
				mainError = '';
			} else {
				mainError = `Modal send error: ${message}`;
			}
			console.error('[WalletPage] Send Sahel Token error via modal:', err);
		} finally {
			isSendingSahel = false;
		}
	}
	// --- End Handle Send Sahel Token ---
</script>

<div class="min-h-screen bg-stone-50 font-sans text-slate-800">
	<main class="px-4 py-8">
		<div class="mx-auto max-w-3xl">
			<!-- Sahel Token Balance Card -->
			{#if pkpEthAddress}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-4 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						{SAHEL_TOKEN_SYMBOL} Balance
					</h2>
					<div class="mb-2">
						<p class="text-sm text-slate-500">For PKP Address:</p>
						<p class="font-mono text-sm break-all text-sky-700">{pkpEthAddress}</p>
					</div>

					{#if !sahelPhaseConfig}
						<div class="rounded border border-red-400 bg-red-100 p-4 text-red-700">
							Configuration error: Sahelanthropus phase data is not defined in `roadmap/config.ts`.
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
				</div>
			{/if}
			<!-- End Sahel Token Balance Card -->

			<!-- Send Sahel Token Card -->
			{#if pkpEthAddress && $guardianEoaAddressStore && SAHEL_TOKEN_ADDRESS}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-4 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Send {SAHEL_TOKEN_SYMBOL}
					</h2>
					<p class="mb-2 text-sm text-slate-600">
						This will send <strong>0.1 {SAHEL_TOKEN_SYMBOL}</strong> from your PKP Address ({pkpEthAddress
							? `${pkpEthAddress.slice(0, 6)}...${pkpEthAddress.slice(-4)}`
							: 'N/A'}) to your Guardian EOA Address ({$guardianEoaAddressStore
							? `${$guardianEoaAddressStore.slice(0, 6)}...${$guardianEoaAddressStore.slice(-4)}`
							: 'N/A'}).
					</p>

					<button
						on:click={handleSendSahelToken}
						disabled={isSendingSahel ||
							!$litClientStore?.ready ||
							!pkpPublicKey ||
							!pkpEthAddress ||
							!passkeyDataForModal}
						class="w-full justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
					>
						{#if isSendingSahel}
							<span class="spinner mr-2"></span>Sending...
						{:else}
							Send 0.1 {SAHEL_TOKEN_SYMBOL} to Guardian EOA
						{/if}
					</button>

					{#if sendSahelTxHash}
						<div
							class="mt-4 space-y-2 rounded-lg border border-green-300 bg-green-100 p-3 text-xs text-green-700"
						>
							<p class="font-semibold">Send initiated successfully!</p>
							<div>
								<p class="font-medium">Transaction Hash:</p>
								{#if sahelExplorerBaseUrl}
									<a
										href={`${sahelExplorerBaseUrl.endsWith('/') ? sahelExplorerBaseUrl : sahelExplorerBaseUrl + '/'}tx/${sendSahelTxHash}`}
										target="_blank"
										rel="noopener noreferrer"
										class="block rounded bg-green-200 p-1 break-all text-green-800 hover:underline"
									>
										{sendSahelTxHash}
									</a>
								{:else}
									<code class="block rounded bg-green-200 p-1 break-all text-green-800"
										>{sendSahelTxHash}</code
									>
								{/if}
							</div>
						</div>
					{/if}
					{#if sendSahelError && mainError.includes('Modal send error')}
						<!-- Only show if related to this operation -->
						<div
							class="mt-4 space-y-2 rounded-lg border border-red-300 bg-red-100 p-3 text-xs text-red-700"
						>
							<p class="font-semibold">Error Sending Token:</p>
							<p>{sendSahelError}</p>
						</div>
					{/if}
				</div>
			{/if}
			<!-- End Send Sahel Token Card -->

			{#if mainError}
				<div
					class="mb-6 w-full rounded-lg border border-red-300 bg-red-100 p-4 text-red-700 shadow-md"
				>
					<span class="font-bold">Error:</span>
					{mainError}
				</div>
			{/if}
			{#if mainSuccess}
				<div
					class="mb-6 w-full rounded-lg border border-green-300 bg-green-100 p-4 text-green-700 shadow-md"
				>
					<span class="font-bold">Status:</span>
					{mainSuccess}
				</div>
			{/if}

			<!-- Wallet Operations Section (Keep this structure) -->
			{#if pkpPublicKey && pkpEthAddress && passkeyDataForModal}
				<!-- Only show if PKP is available and passkeyData exists -->
				<div class="rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						{profileName ? `${profileName}'s Wallet` : 'PKP Wallet'}
					</h2>
					<!-- REMOVED Session Auth Method display -->
					<!-- <p class="mb-4 text-xs text-slate-500">...</p> -->

					<div class="flex flex-col md:flex-row md:space-x-6">
						<aside class="mb-6 w-full shrink-0 md:mb-0 md:w-48">
							<nav
								class="flex flex-row space-x-2 overflow-x-auto md:flex-col md:space-y-1 md:space-x-0"
							>
								<button
									on:click={() => (selectedWalletSection = 'sign')}
									class="w-full rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors duration-150 {selectedWalletSection ===
									'sign'
										? 'bg-sky-100 text-sky-700'
										: 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'}"
								>
									Sign Message
								</button>
								<button
									on:click={() => (selectedWalletSection = 'action')}
									class="w-full rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors duration-150 {selectedWalletSection ===
									'action'
										? 'bg-indigo-100 text-indigo-700'
										: 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'}"
								>
									Execute Action
								</button>
								<button
									on:click={() => (selectedWalletSection = 'profile')}
									class="w-full rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors duration-150 {selectedWalletSection ===
									'profile'
										? 'bg-slate-200 text-slate-800'
										: 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'}"
								>
									Manage Profile
								</button>
								<!-- <button
									on:click={() => (selectedWalletSection = 'transfer')}
									class="w-full rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors duration-150 {selectedWalletSection ===
									'transfer'
										? 'bg-emerald-100 text-emerald-700'
										: 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'}"
								>
									Transfer Tokens
								</button> -->
							</nav>
						</aside>

						<div class="flex-grow">
							{#if selectedWalletSection === 'sign'}
								<div class="rounded-lg border border-stone-200 p-4">
									<h3 class="mb-3 text-lg font-medium text-slate-600">Sign Message with PKP</h3>
									<div class="mb-4">
										<label
											for="messageToSignPkp"
											class="mb-1 block text-sm font-medium text-slate-600">Message to Sign</label
										>
										<input
											id="messageToSignPkp"
											bind:value={messageToSign}
											class="block w-full rounded-lg border-stone-300 bg-stone-50 p-2 text-slate-800 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
										/>
									</div>
									<button
										on:click={handleSignMessageWithPkp}
										class="w-full justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
										disabled={isSigningMessage ||
											!$litClientStore?.ready ||
											!pkpPublicKey ||
											!passkeyDataForModal}
									>
										{#if isSigningMessage}<span class="spinner mr-2"></span>Signing...{:else}Sign
											Message with PKP{/if}
									</button>
									{#if signatureResult}
										<div
											class="mt-4 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs"
										>
											<p class="font-semibold text-green-600">PKP Signature Successful!</p>
											<div>
												<p class="font-medium text-slate-500">Data Signed (Hashed Message):</p>
												<code class="block rounded bg-stone-200 p-1 break-all text-slate-700"
													>{signatureResult.dataSigned}</code
												>
											</div>
											<div>
												<p class="font-medium text-slate-500">Signature:</p>
												<code class="block rounded bg-stone-200 p-1 break-all text-slate-700"
													>{signatureResult.signature}</code
												>
											</div>
										</div>
									{/if}
								</div>
							{:else if selectedWalletSection === 'action'}
								<div class="rounded-lg border border-stone-200 p-4">
									<h3 class="mb-3 text-lg font-medium text-slate-600">Execute Inline Lit Action</h3>
									<p class="mb-3 text-xs text-slate-500">
										This action checks if a number is >= 42.
									</p>
									<div class="mb-4">
										<label for="magicNumber" class="mb-1 block text-sm font-medium text-slate-600"
											>Number to Check (magicNumber)</label
										>
										<input
											id="magicNumber"
											type="number"
											bind:value={magicNumber}
											class="block w-full rounded-lg border-stone-300 bg-stone-50 p-2 text-slate-800 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
										/>
									</div>
									<button
										on:click={handleExecuteLitAction}
										class="w-full justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
										disabled={isExecutingAction ||
											!$litClientStore?.ready ||
											!pkpPublicKey ||
											!passkeyDataForModal}
									>
										{#if isExecutingAction}<span class="spinner mr-2"></span>Executing Action...{:else}Execute
											Lit Action{/if}
									</button>
									{#if litActionResult}
										<div
											class="mt-4 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs"
										>
											<p class="font-semibold text-green-600">Lit Action Executed!</p>
											<div>
												<p class="font-medium text-slate-500">Response:</p>
												<pre
													class="block rounded bg-white p-2 break-all whitespace-pre-wrap text-slate-700 shadow-sm">{JSON.stringify(
														litActionResult.response,
														null,
														2
													)}</pre>
											</div>
											{#if litActionResult.logs}<div>
													<p class="font-medium text-slate-500">Logs:</p>
													<pre
														class="block rounded bg-white p-2 break-all whitespace-pre-wrap text-slate-700 shadow-sm">{litActionResult.logs}</pre>
												</div>{/if}
										</div>
									{/if}
								</div>
							{:else if selectedWalletSection === 'profile'}
								<div class="rounded-lg border border-stone-200 p-4">
									<h3 class="mb-3 text-lg font-medium text-slate-600">Manage Profile</h3>
									<p class="mb-4 text-sm text-slate-500">
										Set your profile name. This will be encrypted using Lit Protocol and stored
										locally.
									</p>
									<div class="space-y-4">
										<div>
											<label
												for="profileNameInput"
												class="mb-1 block text-sm font-medium text-slate-600">Profile Name</label
											>
											<input
												type="text"
												id="profileNameInput"
												bind:value={profileName}
												class="block w-full rounded-lg border-stone-300 bg-stone-50 p-2 text-slate-800 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
												placeholder={isDecryptingProfile
													? 'Decrypting...'
													: 'Enter your preferred name'}
												readonly={isEncryptingProfile || isDecryptingProfile}
											/>
										</div>
										<button
											on:click={handleSaveProfile}
											class="w-full justify-center rounded-lg bg-slate-700 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 sm:w-auto"
											disabled={isEncryptingProfile ||
												isDecryptingProfile ||
												!$litClientStore?.ready ||
												!pkpPublicKey ||
												!pkpEthAddress ||
												!passkeyDataForModal}
										>
											{#if isEncryptingProfile}<span class="spinner mr-2"></span>Encrypting &
												Saving...{:else if isDecryptingProfile}<span class="spinner mr-2"
												></span>Decrypting...{:else}Save Encrypted Profile{/if}
										</button>
										{#if !$litClientStore?.ready || !pkpPublicKey || !pkpEthAddress || !passkeyDataForModal}
											<p class="mt-2 text-xs text-orange-600">
												Note: Requires Lit Client Ready, PKP details & Passkey data.
											</p>{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<div class="rounded-xl bg-white p-6 text-center shadow-lg md:p-8">
					<h2 class="mb-4 text-xl font-semibold text-slate-600">PKP Wallet Not Initialized</h2>
					<p class="text-sm text-slate-500">
						Please complete the wallet setup via the <a
							href="/me/signin"
							class="font-medium text-emerald-600 hover:underline">Passkey Wallet Setup</a
						> page.
					</p>
					<a
						href="/me/signin"
						class="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-300 focus:outline-none"
					>
						Go to Wallet Setup
					</a>
				</div>
			{/if}
		</div>
	</main>
</div>

<style>
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
	button {
		flex-shrink: 0;
	}
	code {
		word-break: break-all;
	}
	pre code {
		display: block;
		padding: 0.5rem;
		border-radius: 0.25rem;
	}
</style>
