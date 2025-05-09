<script lang="ts">
	import { onMount, getContext, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { getStoredPasskeyData, type StoredPasskeyData } from '$lib/wallet/passkeySigner';
	import {
		signWithPKP,
		executeLitAction,
		getSessionSigsWithGnosisPasskeyVerification,
		signTransactionWithPKP
	} from '$lib/wallet/lit';
	import type { LitNodeClient } from '@lit-protocol/lit-node-client';
	import type { SessionSigs, ExecuteJsResponse, AuthCallbackParams } from '@lit-protocol/types';
	import { LitPKPResource, LitActionResource } from '@lit-protocol/auth-helpers';
	import type { Hex, Address, WalletClient } from 'viem';
	import {
		keccak256,
		hexToBytes,
		formatUnits,
		createPublicClient,
		http,
		parseUnits,
		encodeFunctionData,
		serializeTransaction,
		type TransactionSerializableEIP1559
	} from 'viem';
	import { gnosis } from 'viem/chains';
	import type { Writable } from 'svelte/store';
	import { pageMetadataStore } from '$lib/stores/layoutStore';
	import type { PageData } from './$types';
	import { roadmapConfig } from '$lib/roadmap/config';
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte';

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

	let storedPasskey = $state<StoredPasskeyData | null>(null);
	let mintedPkpTokenId = $state<string | null>(null);
	let mintedPkpPublicKey = $state<Hex | null>(null);
	let mintedPkpEthAddress = $state<Address | null>(null);
	let sessionSigs = $state<SessionSigs | null>(null);
	let sessionAuthMethod = $state<'gnosis-passkey' | 'resumed-from-cache' | null>(null);
	let isLoadingSessionSigsGnosisPasskey = $state(false);
	let isLoadingPkpSessionResume = $state(false);
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
	let generalIsLoading = $state(false);
	let mainError = $state('');
	let mainSuccess = $state('');
	let profileName = $state('');
	const PROFILE_STORAGE_KEY = 'hominio_profile_data_encrypted';
	let encryptedProfileDataString = $state<string | null>(null);
	let isEncryptingProfile = $state(false);
	let isDecryptingProfile = $state(false);
	let selectedWalletSection = $state<'sign' | 'action' | 'profile'>('sign');
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
			storedPasskey = getStoredPasskeyData();

			const storedPKPDataString = localStorage.getItem('mintedPKPData');
			if (storedPKPDataString) {
				try {
					const storedPKPData = JSON.parse(storedPKPDataString);
					if (
						storedPKPData &&
						storedPKPData.pkpTokenId &&
						storedPKPData.pkpPublicKey &&
						storedPKPData.pkpEthAddress
					) {
						mintedPkpTokenId = storedPKPData.pkpTokenId;
						mintedPkpPublicKey = storedPKPData.pkpPublicKey;
						mintedPkpEthAddress = storedPKPData.pkpEthAddress;
					} else {
						localStorage.removeItem('mintedPKPData');
					}
				} catch (error) {
					localStorage.removeItem('mintedPKPData');
				}
			}

			encryptedProfileDataString = localStorage.getItem(PROFILE_STORAGE_KEY);

			unsubscribeLitClient = litClientStore.subscribe(async (client) => {
				if (client && client.ready && browser) {
					if (
						mintedPkpPublicKey &&
						!sessionSigs &&
						!isLoadingPkpSessionResume &&
						!isLoadingSessionSigsGnosisPasskey
					) {
						await tryResumePkpSession(client, mintedPkpPublicKey);
					}
				}
			});
		}
	});

	onDestroy(() => {
		if (unsubscribeLitClient) {
			unsubscribeLitClient();
		}
	});

	async function tryResumePkpSession(currentLitClient: LitNodeClient, pkpKeyToResume: Hex) {
		if (sessionSigs) return;

		isLoadingPkpSessionResume = true;
		resetMainMessages();
		const initialMessage = 'Attempting to resume PKP session...';
		mainSuccess = initialMessage;

		try {
			const resumedSessionSigs = await currentLitClient.getSessionSigs({
				pkpPublicKey: pkpKeyToResume,
				chain: 'ethereum',
				resourceAbilityRequests: [
					{ resource: new LitPKPResource('*'), ability: 'pkp-signing' as const },
					{ resource: new LitActionResource('*'), ability: 'lit-action-execution' as const }
				],
				authNeededCallback: async (params: AuthCallbackParams) => {
					throw new Error('Authentication required; cached session not viable.');
				}
			});

			sessionSigs = resumedSessionSigs;
			sessionAuthMethod = 'resumed-from-cache';
			mainSuccess = 'PKP session resumed successfully!';
		} catch (error: any) {
			if (error.message && error.message.includes('Authentication required')) {
				mainSuccess = 'No active PKP session found. Please login.';
			} else {
				if (!mainSuccess.includes('No active PKP session found')) {
					mainSuccess = '';
					mainError = `Could not resume session: ${error.message || 'Unknown error'}`;
				}
			}
			sessionSigs = null;
			sessionAuthMethod = null;
		} finally {
			isLoadingPkpSessionResume = false;
			if (mainSuccess === initialMessage && !sessionSigs) {
				mainSuccess = 'Ready to login.';
			}
		}
	}

	function resetMainMessages() {
		mainError = '';
		mainSuccess = '';
	}

	async function handleLoginWithPasskey() {
		const currentLitClient = $litClientStore;

		if (!currentLitClient || !currentLitClient.ready) {
			mainError = 'Lit client not available or not ready.';
			return;
		}
		if (!storedPasskey?.rawId || !storedPasskey.pubkeyCoordinates) {
			mainError = 'Passkey data not found. Please setup via Settings page.';
			return;
		}
		if (!storedPasskey?.signerContractAddress) {
			mainError = 'Passkey EIP-1271 signer address missing. Please check Settings page.';
			return;
		}
		if (!mintedPkpPublicKey) {
			mainError = 'PKP Public Key not found. Please check Settings page.';
			return;
		}

		isLoadingSessionSigsGnosisPasskey = true;
		resetMainMessages();
		sessionSigs = null;
		sessionAuthMethod = null;

		try {
			const challengeMessage = 'Login to Hominio PKP Wallet with Passkey';
			const messageHashAsChallenge = keccak256(new TextEncoder().encode(challengeMessage));

			const assertion = (await navigator.credentials.get({
				publicKey: {
					challenge: hexToBytes(messageHashAsChallenge),
					allowCredentials: [{ type: 'public-key', id: hexToBytes(storedPasskey.rawId as Hex) }],
					userVerification: 'required'
				}
			})) as PublicKeyCredential | null;

			if (
				!assertion ||
				!assertion.response ||
				!(assertion.response instanceof AuthenticatorAssertionResponse) ||
				!assertion.response.authenticatorData ||
				!assertion.response.signature
			) {
				throw new Error('Failed to get valid signature assertion from passkey.');
			}
			const assertionResponse = assertion.response;

			sessionSigs = await getSessionSigsWithGnosisPasskeyVerification(
				currentLitClient!,
				mintedPkpPublicKey,
				challengeMessage,
				assertionResponse,
				storedPasskey,
				'ethereum'
			);

			sessionAuthMethod = 'gnosis-passkey';
			mainSuccess = 'Login successful! Session active.';
		} catch (err: unknown) {
			mainError = err instanceof Error ? `Login Failed: ${err.message}` : 'Unknown login error.';
			sessionSigs = null;
			sessionAuthMethod = null;
			console.error('Error in handleLoginWithPasskey:', err);
		} finally {
			isLoadingSessionSigsGnosisPasskey = false;
		}
	}

	async function handleSignMessageWithPkp() {
		const currentLitClient = $litClientStore;
		if (!currentLitClient || !currentLitClient.ready || !sessionSigs) {
			mainError = 'Lit client/session not ready.';
			return;
		}
		if (!messageToSign.trim()) {
			mainError = 'Enter a message to sign.';
			return;
		}
		if (!mintedPkpPublicKey) {
			mainError = 'PKP Public Key missing.';
			return;
		}

		isSigningMessage = true;
		resetMainMessages();
		signatureResult = null;

		try {
			signatureResult = await signWithPKP(
				currentLitClient!,
				sessionSigs!,
				mintedPkpPublicKey,
				messageToSign
			);
			mainSuccess = 'Message signed successfully!';
		} catch (err: unknown) {
			mainError = err instanceof Error ? err.message : 'Error signing message.';
			signatureResult = null;
		} finally {
			isSigningMessage = false;
		}
	}

	async function handleExecuteLitAction() {
		const currentLitClient = $litClientStore;
		if (!currentLitClient || !currentLitClient.ready || !sessionSigs) {
			mainError = 'Lit client/session not ready.';
			return;
		}

		isExecutingAction = true;
		resetMainMessages();
		litActionResult = null;

		try {
			litActionResult = await executeLitAction(
				currentLitClient!,
				sessionSigs!,
				litActionCodeForExecution,
				{ magicNumber: magicNumber }
			);
			mainSuccess = 'Lit Action executed!';
			console.log('Lit Action Result:', litActionResult);
		} catch (err: unknown) {
			mainError = err instanceof Error ? err.message : 'Error executing Lit Action.';
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
		if (!currentLitClient || !currentLitClient.ready || !sessionSigs || !mintedPkpEthAddress) {
			mainError = 'Lit client/session/PKP details needed to save profile.';
			return;
		}

		resetMainMessages();
		isEncryptingProfile = true;

		try {
			const accessControlConditions = [
				{
					contractAddress: '',
					standardContractType: '',
					chain: 'ethereum',
					method: '',
					parameters: [':userAddress'],
					returnValueTest: { comparator: '=', value: mintedPkpEthAddress }
				}
			];
			const { encryptString } = await import('@lit-protocol/encryption');
			const { ciphertext, dataToEncryptHash } = await encryptString(
				{ accessControlConditions, dataToEncrypt: profileName.trim() },
				currentLitClient
			);
			const dataToStore = {
				ciphertext,
				dataToEncryptHash,
				accessControlConditions,
				chain: 'ethereum'
			};
			encryptedProfileDataString = JSON.stringify(dataToStore);
			localStorage.setItem(PROFILE_STORAGE_KEY, encryptedProfileDataString);
			mainSuccess = 'Profile encrypted and saved!';
		} catch (error: unknown) {
			mainError =
				error instanceof Error
					? `Error saving profile: ${error.message}`
					: 'Unknown error saving profile.';
			console.error('Error saving profile:', error);
		} finally {
			isEncryptingProfile = false;
		}
	}

	// --- Reactive Profile Decryption ---
	async function attemptProfileDecryption() {
		// Ensure conditions are met before attempting decryption
		if (
			!browser ||
			!$litClientStore?.ready ||
			!sessionSigs ||
			!encryptedProfileDataString ||
			profileName ||
			isDecryptingProfile ||
			isEncryptingProfile
		) {
			return;
		}

		const currentLitClient = $litClientStore;
		isDecryptingProfile = true;
		resetMainMessages(); // Clear messages before attempting
		try {
			const storedEncryptedData = JSON.parse(encryptedProfileDataString!);
			const { decryptToString } = await import('@lit-protocol/encryption');
			const decryptOptions = {
				accessControlConditions: storedEncryptedData.accessControlConditions,
				chain: storedEncryptedData.chain,
				ciphertext: storedEncryptedData.ciphertext,
				dataToEncryptHash: storedEncryptedData.dataToEncryptHash,
				sessionSigs: sessionSigs!
			};
			const decryptedNameStr = await decryptToString(decryptOptions, currentLitClient!);
			profileName = decryptedNameStr;
			mainSuccess = 'Profile name decrypted and loaded.'; // Provide clearer success message
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Unknown error.';
			mainError = `Failed to automatically decrypt profile: ${message}`;
			console.error('Error decrypting profile name reactively:', err);
			// Consider if clearing encryptedProfileDataString from localStorage is desired on failure
		} finally {
			isDecryptingProfile = false;
		}
	}

	// Trigger decryption attempt when relevant reactive dependencies change
	$effect(() => {
		attemptProfileDecryption();
	});

	// --- Fetch PKP Sahel Token Balance Logic ---
	async function fetchPkpSahelTokenBalance() {
		if (!mintedPkpEthAddress) {
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

			// Fetch decimals
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
				pkpSahelTokenDecimals = 18; // Default if decimals call fails
			}

			// Fetch balance
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
		if (mintedPkpEthAddress && SAHEL_TOKEN_ADDRESS && GNOSIS_RPC_URL) {
			fetchPkpSahelTokenBalance();
		} else {
			// Clear balance if PKP address is lost or config is missing
			pkpSahelTokenBalance = null;
			formattedPkpSahelBalance = null;
			// Optionally set an error or informational message if config is missing and pkp address is present
			if (mintedPkpEthAddress && (!SAHEL_TOKEN_ADDRESS || !GNOSIS_RPC_URL)) {
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
		console.log('[WalletPage] Initiating Send Sahel Token process...');

		// 1. Prerequisite Checks
		if (!$litClientStore?.ready) {
			sendSahelError = 'Lit client not ready.';
		} else if (!sessionSigs) {
			sendSahelError = 'User session not active. Please login.';
		} else if (!mintedPkpPublicKey || !mintedPkpEthAddress) {
			sendSahelError = 'PKP details not available.';
		} else if (!$guardianEoaAddressStore) {
			sendSahelError = 'Guardian EOA address not available.';
		} else if (!SAHEL_TOKEN_ADDRESS) {
			sendSahelError = 'SAHEL Token address not configured.';
		} else if (!GNOSIS_RPC_URL) {
			sendSahelError = 'Gnosis RPC URL not configured.';
		} else if (pkpSahelTokenDecimals === null || pkpSahelTokenDecimals === undefined) {
			// Fetch decimals if not already available from the balance check section
			// This is a fallback, ideally they are fetched by the balance display logic
			sendSahelError = 'SAHEL token decimals not available. Cannot determine amount.';
		}

		if (sendSahelError) {
			isSendingSahel = false;
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
				address: mintedPkpEthAddress!,
				blockTag: 'pending'
			});
			const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

			if (!maxFeePerGas || !maxPriorityFeePerGas) {
				throw new Error('Could not estimate EIP-1559 gas fees.');
			}

			const encodedTransferData = encodeFunctionData({
				abi: erc20Abi, // Assumes erc20Abi is defined in the component scope
				functionName: 'transfer',
				args: [recipientAddress, amountToSend]
			});

			const estimatedGas = await publicClient.estimateGas({
				account: mintedPkpEthAddress!,
				to: SAHEL_TOKEN_ADDRESS!,
				data: encodedTransferData,
				value: 0n
			});

			// 5. Construct Unsigned Transaction Object (EIP-1559)
			const transaction: TransactionSerializableEIP1559 = {
				to: SAHEL_TOKEN_ADDRESS!,
				value: 0n,
				data: encodedTransferData,
				nonce: nonce,
				gas: estimatedGas,
				maxFeePerGas: maxFeePerGas,
				maxPriorityFeePerGas: maxPriorityFeePerGas,
				chainId: EXPECTED_CHAIN_ID_SAHEL, // Assumes EXPECTED_CHAIN_ID_SAHEL is defined
				type: 'eip1559'
			};

			// 6. Sign Transaction
			console.log('[WalletPage] Signing transaction with PKP...', transaction);
			const signature = await signTransactionWithPKP(
				$litClientStore!,
				sessionSigs!,
				mintedPkpPublicKey!,
				transaction
			);
			console.log('[WalletPage] Signature received:', signature);

			// 7. Serialize Signed Transaction
			const signedRawTx = serializeTransaction(transaction, signature);
			console.log('[WalletPage] Broadcasting signed transaction:', signedRawTx);

			// 8. Broadcast Transaction
			const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedRawTx });
			sendSahelTxHash = txHash;
			console.log('[WalletPage] Transaction broadcasted. Hash:', txHash);
		} catch (err: any) {
			sendSahelError = err.message || 'An unknown error occurred during sending.';
			console.error('[WalletPage] Send Sahel Token error:', err);
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
			{#if mintedPkpEthAddress}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-4 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						{SAHEL_TOKEN_SYMBOL} Balance
					</h2>
					<div class="mb-2">
						<p class="text-sm text-slate-500">For PKP Address:</p>
						<p class="font-mono text-sm break-all text-sky-700">{mintedPkpEthAddress}</p>
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
			{#if mintedPkpEthAddress && $guardianEoaAddressStore && SAHEL_TOKEN_ADDRESS}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-4 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Send {SAHEL_TOKEN_SYMBOL}
					</h2>
					<p class="mb-2 text-sm text-slate-600">
						This will send <strong>0.1 {SAHEL_TOKEN_SYMBOL}</strong> from your PKP Address ({mintedPkpEthAddress
							? `${mintedPkpEthAddress.slice(0, 6)}...${mintedPkpEthAddress.slice(-4)}`
							: 'N/A'}) to your Guardian EOA Address ({$guardianEoaAddressStore
							? `${$guardianEoaAddressStore.slice(0, 6)}...${$guardianEoaAddressStore.slice(-4)}`
							: 'N/A'}).
					</p>

					<button
						on:click={handleSendSahelToken}
						disabled={isSendingSahel ||
							!$litClientStore?.ready ||
							!sessionSigs ||
							!mintedPkpPublicKey}
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
					{#if sendSahelError}
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
			{#if mainSuccess && !(isLoadingPkpSessionResume && mainSuccess.includes('Attempting'))}
				<div
					class="mb-6 w-full rounded-lg border border-green-300 bg-green-100 p-4 text-green-700 shadow-md"
				>
					<span class="font-bold">Status:</span>
					{mainSuccess}
				</div>
			{/if}

			{#if !sessionSigs}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Login Required
					</h2>
					{#if isLoadingPkpSessionResume}
						<p class="mb-4 animate-pulse text-sm text-slate-500">Attempting to resume session...</p>
					{:else}
						<p class="mb-4 text-sm text-slate-500">
							Please login with your passkey to access wallet functions. Ensure you have completed
							the setup on the Settings page.
						</p>
						<div class="space-y-4">
							<div class="rounded-lg border border-stone-200 p-4">
								<h3 class="mb-2 font-medium text-slate-600">Login with Passkey</h3>
								{#if storedPasskey?.rawId && storedPasskey?.pubkeyCoordinates && storedPasskey?.signerContractAddress && mintedPkpPublicKey}
									<p class="mb-3 text-xs text-slate-500">
										This will prompt for your passkey. Requires setup via Settings.
									</p>
									<button
										on:click={handleLoginWithPasskey}
										class="w-full justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
										disabled={isLoadingSessionSigsGnosisPasskey ||
											isLoadingPkpSessionResume ||
											!mintedPkpPublicKey}
									>
										{#if isLoadingSessionSigsGnosisPasskey}
											<span class="spinner mr-2"></span>Logging in...
										{:else if isLoadingPkpSessionResume}
											<span class="spinner mr-2"></span>Checking session...
										{:else}
											Login with Passkey
										{/if}
									</button>
								{:else}
									<p
										class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-600"
									>
										Cannot login: Missing Passkey, PKP details, or deployed Signer address. Please
										check the Settings page.
									</p>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						{profileName}'s Wallet
					</h2>
					<p class="mb-4 text-xs text-slate-500">
						Session authenticated via:
						<span class="font-medium text-slate-700">
							{sessionAuthMethod === 'resumed-from-cache'
								? 'DEVICE CACHE'
								: (sessionAuthMethod?.toUpperCase() ?? 'N/A')}
						</span>
					</p>

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
										disabled={isSigningMessage || !sessionSigs || !mintedPkpPublicKey}
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
										disabled={isExecutingAction || !sessionSigs}
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
												!sessionSigs ||
												!mintedPkpEthAddress ||
												!$litClientStore?.ready}
										>
											{#if isEncryptingProfile}<span class="spinner mr-2"></span>Encrypting &
												Saving...{:else if isDecryptingProfile}<span class="spinner mr-2"
												></span>Decrypting...{:else}Save Encrypted Profile{/if}
										</button>
										{#if !sessionSigs || !mintedPkpEthAddress || !$litClientStore?.ready}<p
												class="mt-2 text-xs text-orange-600"
											>
												Note: Requires Lit Connection (Ready), Authenticated PKP Session, and minted
												PKP.
											</p>{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>
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
