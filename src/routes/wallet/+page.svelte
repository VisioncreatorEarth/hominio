<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment'; // Import browser helper
	import {
		createAndStorePasskeyData,
		getStoredPasskeyData,
		clearStoredPasskeyData,
		deployPasskeySignerContract,
		verifySignatureWithProxy,
		getWalletClient,
		getWalletAccount,
		type StoredPasskeyData
	} from '$lib/wallet/passkeySigner';
	import {
		connectToLit,
		signWithPKP,
		executeLitAction,
		getSessionSigsWithGnosisPasskeyVerification,
		getPermittedAuthMethodsForPkp,
		gnosisPasskeyVerifyActionCode,
		mintPKPWithPasskeyAndAction
	} from '$lib/wallet/lit';
	import type { LitNodeClient } from '@lit-protocol/lit-node-client';
	import type { SessionSigs, ExecuteJsResponse } from '@lit-protocol/types';
	import type { Hex, Address, WalletClient } from 'viem';
	import { keccak256, hexToBytes } from 'viem';

	// --- Unified State ---
	// Passkey & EIP-1271 Signer State
	let username = '';
	let storedPasskey: StoredPasskeyData | null = null;
	let deploymentTxHash = '';
	let deployedSignerAddress: Address | null = null;
	let proxyVerificationResult: { isCorrect: boolean; error?: string } | null = null;
	let isLoadingProxyVerify = false;

	// Lit Connection State
	let litNodeClient: LitNodeClient | null = null;
	let isLitConnecting = false;
	let litConnected = false;

	// Wallet (EOA) Connection State
	let eoaWalletClient: WalletClient | null = null;
	let eoaAddress: Address | null = null;
	let isEoaConnecting = false;

	// --- Minted PKP State ---
	let mintedPkpTokenId: string | null = null;
	let mintedPkpPublicKey: Hex | null = null;
	let mintedPkpEthAddress: Address | null = null;
	let isMintingPkp = false;
	// --- END: Minted PKP State ---

	// Session Signatures State (Unified)
	let sessionSigs: SessionSigs | null = null;
	let sessionAuthMethod: 'gnosis-passkey' | null = null;
	let isLoadingSessionSigsGnosisPasskey = false;

	// PKP Interaction State
	let messageToSign = 'Hello from Lit PKP!';
	let signatureResult: { signature: Hex; dataSigned: Hex } | null = null;
	let isSigningMessage = false;

	// Lit Action State
	let magicNumber = 43;
	let litActionResult: ExecuteJsResponse | null = null;
	let isExecutingAction = false;
	let litActionCodeForExecution = `// Basic Lit Action for direct execution
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
go();`;

	// --- State for displaying auth methods ---
	let permittedAuthMethods: Array<{ authMethodType: bigint; id: Hex; userPubkey: Hex }> = [];
	let isLoadingPermittedAuthMethods = false;
	// --- END: State for displaying auth methods ---
	// General UI State
	let generalIsLoading = false; // For general page loads or multiple step operations
	let mainError = '';
	let mainSuccess = '';

	onMount(async () => {
		// localStorage operations must be client-side only
		if (browser) {
			// Load stored passkey data
			storedPasskey = getStoredPasskeyData();
			if (storedPasskey?.signerContractAddress) {
				deployedSignerAddress = storedPasskey.signerContractAddress as Address;
			}

			// Load minted PKP data from localStorage
			const storedPKPDataString = localStorage.getItem('mintedPKPData');
			if (storedPKPDataString) {
				try {
					const storedPKPData = JSON.parse(storedPKPDataString);
					if (
						storedPKPData &&
						storedPKPData.tokenId &&
						storedPKPData.pkpPublicKey &&
						storedPKPData.pkpEthAddress
					) {
						mintedPkpTokenId = storedPKPData.tokenId;
						mintedPkpPublicKey = storedPKPData.pkpPublicKey;
						mintedPkpEthAddress = storedPKPData.pkpEthAddress;
						console.log('Loaded PKP details from localStorage:', storedPKPData);
					} else {
						console.warn('Found invalid PKP data in localStorage.');
						localStorage.removeItem('mintedPKPData'); // Clear invalid data
					}
				} catch (error) {
					console.error('Error parsing PKP data from localStorage:', error);
					localStorage.removeItem('mintedPKPData'); // Clear corrupted data
				}
			}

			// Auto-connect Lit and EOA
			await handleConnectLit();
			await handleConnectEoaWallet();

			// Auto-fetch auth methods if PKP ID is loaded
			if (mintedPkpTokenId) {
				await handleFetchPermittedAuthMethods(mintedPkpTokenId);
			}
		}
	});

	function resetMainMessages() {
		mainError = '';
		mainSuccess = '';
		generalIsLoading = false;
	}

	// --- Passkey & EIP-1271 Functions ---
	async function handleCreatePasskey() {
		if (!username.trim()) {
			mainError = 'Please enter a username.';
			return;
		}
		generalIsLoading = true;
		resetMainMessages();
		deploymentTxHash = '';
		proxyVerificationResult = null;

		try {
			const newData = await createAndStorePasskeyData(username);
			if (newData) {
				storedPasskey = newData;
				mainSuccess = `Passkey created and stored for ${username}. AuthMethodID: ${newData.authMethodId}`;
			} else {
				mainError = 'Failed to create and store passkey.';
			}
		} catch (error: any) {
			mainError = error.message || 'An unknown error occurred during passkey creation.';
			console.error(error);
		} finally {
			generalIsLoading = false;
		}
	}

	function handleClearPasskey() {
		clearStoredPasskeyData();
		storedPasskey = null;
		username = '';
		resetMainMessages();
		deploymentTxHash = '';
		proxyVerificationResult = null;
		deployedSignerAddress = null;
		mintedPkpTokenId = null;
		mintedPkpPublicKey = null;
		mintedPkpEthAddress = null;
		permittedAuthMethods = [];
		if (browser) {
			localStorage.removeItem('mintedPKPData');
		}
		mainSuccess = 'Passkey and associated PKP data cleared.';
	}

	async function handleDeployContract() {
		generalIsLoading = true;
		resetMainMessages();
		deploymentTxHash = '';
		proxyVerificationResult = null;

		try {
			const result = await deployPasskeySignerContract();
			if (result) {
				deploymentTxHash = result.txHash;
				if (result.signerAddress) {
					deployedSignerAddress = result.signerAddress;
					mainSuccess = `Signer contract deployment transaction sent: ${result.txHash}. Address: ${result.signerAddress}`;
				} else {
					mainSuccess = `Deployment transaction sent (${result.txHash}), but couldn't extract address from logs.`;
				}
				storedPasskey = getStoredPasskeyData(); // Refresh to get updated signer address in storedPasskey
			} else {
				mainError = 'Deployment failed. Check console and wallet connection.';
			}
		} catch (error: any) {
			mainError = error.message || 'An unknown error occurred during deployment.';
			console.error(error);
		} finally {
			generalIsLoading = false;
		}
	}

	async function handleSignAndVerifyEIP1271Proxy() {
		if (!messageToSign.trim()) {
			mainError = 'Please enter a message to sign for EIP-1271 verification.';
			return;
		}
		if (!deployedSignerAddress) {
			mainError = 'EIP-1271 Signer contract must be deployed first (Step 2).';
			return;
		}
		isLoadingProxyVerify = true;
		resetMainMessages();
		proxyVerificationResult = null;

		try {
			proxyVerificationResult = await verifySignatureWithProxy(
				messageToSign,
				deployedSignerAddress
			);
			if (proxyVerificationResult.isCorrect) {
				mainSuccess = 'EIP-1271 Signature verified successfully via DEPLOYED PROXY!';
			} else {
				mainError = `EIP-1271 Proxy Verification Failed: ${proxyVerificationResult.error || 'Contract returned invalid magic value.'}`;
			}
		} catch (error: any) {
			mainError = `Error during EIP-1271 proxy signature verification: ${error.message}`;
			console.error(error);
		} finally {
			isLoadingProxyVerify = false;
		}
	}

	// --- Lit Connection & EOA Wallet Connection ---
	async function handleConnectLit() {
		if (litNodeClient && litConnected) return;
		isLitConnecting = true;
		resetMainMessages();
		sessionSigs = null; // Clear previous sigs
		sessionAuthMethod = null;
		try {
			litNodeClient = await connectToLit();
			litConnected = true;
			mainSuccess = 'Successfully connected to Lit Network.';
		} catch (error: any) {
			mainError = `Error connecting to Lit: ${error.message}`;
			console.error('Lit connection error:', error);
		} finally {
			isLitConnecting = false;
		}
	}

	async function handleConnectEoaWallet() {
		if (eoaWalletClient && eoaAddress) return;
		isEoaConnecting = true;
		resetMainMessages();
		try {
			eoaWalletClient = getWalletClient(); // Assumes this doesn't need await or can be synchronous setup
			if (eoaWalletClient) {
				const account = await getWalletAccount();
				if (account) {
					eoaAddress = account;
					mainSuccess = `EOA Wallet connected: ${eoaAddress}`;
				} else {
					mainError =
						'Could not get EOA account. Is your wallet connected and an account selected?';
					eoaWalletClient = null; // Reset if account couldn't be fetched
				}
			} else {
				mainError = 'Could not initialize EOA wallet client.';
			}
		} catch (error: any) {
			mainError = `Error connecting EOA wallet: ${error.message}`;
			console.error('EOA connection error:', error);
			eoaWalletClient = null;
			eoaAddress = null;
		} finally {
			isEoaConnecting = false;
		}
	}

	// --- Mint PKP Function ---
	async function handleMintPkp() {
		if (!storedPasskey?.authMethodId) {
			mainError = 'Cannot mint: Passkey not created or authMethodId missing (Step 1).';
			return;
		}
		if (!storedPasskey?.signerContractAddress) {
			mainError = 'Cannot mint: EIP-1271 Signer contract must be deployed first (Step 2).';
			return;
		}
		if (!eoaWalletClient || !eoaAddress) {
			mainError = 'Cannot mint: EOA Wallet not connected (Step 0).';
			return;
		}

		isMintingPkp = true;
		resetMainMessages();

		try {
			const pkpDetails = await mintPKPWithPasskeyAndAction(
				eoaWalletClient,
				eoaAddress,
				storedPasskey.authMethodId as Hex,
				gnosisPasskeyVerifyActionCode
			);

			mintedPkpTokenId = pkpDetails.tokenId;
			mintedPkpPublicKey = pkpDetails.pkpPublicKey;
			mintedPkpEthAddress = pkpDetails.pkpEthAddress;

			if (browser) {
				try {
					localStorage.setItem('mintedPKPData', JSON.stringify(pkpDetails));
					console.log('Saved PKP details to localStorage:', pkpDetails);
				} catch (error) {
					console.error('Error saving PKP details to localStorage:', error);
				}
			}

			mainSuccess = `PKP Minted Successfully! Token ID: ${mintedPkpTokenId}`;

			await handleFetchPermittedAuthMethods(mintedPkpTokenId);
		} catch (error: any) {
			mainError = `PKP minting error: ${error.message}`;
			console.error('PKP minting error:', error);
		} finally {
			isMintingPkp = false;
		}
	}

	// --- Session Signature Generation ---
	async function handleGetSessionSigsGnosisPasskey() {
		if (!litNodeClient) {
			mainError = 'Must connect to Lit first (Step 0).';
			return;
		}
		if (!storedPasskey?.rawId || !storedPasskey.pubkeyCoordinates) {
			mainError = 'Stored passkey with rawId and coordinates is required (Step 1).';
			return;
		}
		if (!storedPasskey?.signerContractAddress) {
			mainError = 'EIP-1271 Signer contract must be deployed first (Step 2) to get session sigs.';
			return;
		}

		const pkpKeyToUse = mintedPkpPublicKey;
		if (!pkpKeyToUse) {
			mainError = 'No PKP Public Key available. Mint a PKP first (Step 3).';
			return;
		}

		isLoadingSessionSigsGnosisPasskey = true;
		resetMainMessages();
		sessionSigs = null;
		sessionAuthMethod = null;

		try {
			const challengeMessage = 'Sign in to Hominio PKP via Passkey';

			const messageHashAsChallenge = keccak256(new TextEncoder().encode(challengeMessage));
			console.log(
				`Requesting passkey signature for challenge (hash of "${challengeMessage}"): ${messageHashAsChallenge}`
			);

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
				throw new Error(
					'Failed to get valid signature assertion (missing fields or wrong type) from passkey.'
				);
			}
			console.log('Got assertion for Gnosis verification:', assertion);

			const assertionResponse = assertion.response;

			if (!storedPasskey || !storedPasskey.signerContractAddress) {
				throw new Error(
					'Stored passkey data or signer contract address missing unexpectedly before session sig call.'
				);
			}
			sessionSigs = await getSessionSigsWithGnosisPasskeyVerification(
				litNodeClient,
				pkpKeyToUse,
				challengeMessage,
				assertionResponse,
				storedPasskey,
				'ethereum'
			);

			sessionAuthMethod = 'gnosis-passkey';
			mainSuccess =
				'Successfully obtained session signatures via Passkey (Gnosis On-Chain Verification)!';
		} catch (err: any) {
			mainError = err.message || 'Unknown error getting session signatures via Gnosis Passkey.';
			sessionSigs = null;
			sessionAuthMethod = null;
			console.error('Error in handleGetSessionSigsGnosisPasskey:', err);
		} finally {
			isLoadingSessionSigsGnosisPasskey = false;
		}
	}

	// --- PKP Operations (Sign Message, Execute Action) ---
	async function handleSignMessageWithPkp() {
		if (!litNodeClient || !sessionSigs) {
			mainError = 'Must connect to Lit and get session signatures first (Step 5).';
			return;
		}
		if (!messageToSign.trim()) {
			mainError = 'Please enter a message to sign with PKP.';
			return;
		}

		const pkpKeyToUseForSigning = mintedPkpPublicKey;
		if (!pkpKeyToUseForSigning) {
			mainError = 'No PKP Public Key available for signing. Mint a PKP first (Step 3).';
			return;
		}

		isSigningMessage = true;
		resetMainMessages();
		signatureResult = null;

		try {
			signatureResult = await signWithPKP(
				litNodeClient,
				sessionSigs,
				pkpKeyToUseForSigning,
				messageToSign
			);
			mainSuccess = 'Message signed successfully with PKP!';
		} catch (err: any) {
			mainError = err.message || 'Unknown error signing message with PKP';
			signatureResult = null;
		} finally {
			isSigningMessage = false;
		}
	}

	async function handleExecuteLitAction() {
		if (!litNodeClient || !sessionSigs) {
			mainError = 'Must connect to Lit and get session signatures first (Step 5).';
			return;
		}
		isExecutingAction = true;
		resetMainMessages();
		litActionResult = null;

		try {
			litActionResult = await executeLitAction(
				litNodeClient,
				sessionSigs,
				litActionCodeForExecution,
				{
					magicNumber: magicNumber
				}
			);
			mainSuccess = 'Lit Action executed successfully!';
			console.log('Full Lit Action Result:', litActionResult);
		} catch (err: any) {
			mainError = err.message || 'Unknown error executing Lit Action';
			litActionResult = null;
		} finally {
			isExecutingAction = false;
		}
	}

	// --- Handler to fetch and display permitted auth methods ---
	async function handleFetchPermittedAuthMethods(tokenId: string) {
		if (!litNodeClient) {
			mainError = 'Lit Network not connected.';
			return;
		}
		if (!tokenId.trim()) {
			mainError = 'PKP Token ID must be provided to fetch auth methods.';
			return;
		}
		isLoadingPermittedAuthMethods = true;
		resetMainMessages();
		permittedAuthMethods = [];
		try {
			const methods = await getPermittedAuthMethodsForPkp(tokenId);
			permittedAuthMethods = methods;
			if (methods.length > 0) {
				mainSuccess = `Found ${methods.length} permitted auth method(s) for PKP ${tokenId}.`;
			} else {
				mainSuccess = `No permitted auth methods found for PKP ${tokenId}.`;
			}
		} catch (err: any) {
			mainError = err.message || 'Error fetching permitted auth methods.';
			console.error('Error in handleFetchPermittedAuthMethods:', err);
		} finally {
			isLoadingPermittedAuthMethods = false;
		}
	}
</script>

<div
	class="flex min-h-screen flex-col items-center bg-gradient-to-b from-slate-900 to-slate-800 p-8 text-white"
>
	<h1
		class="mb-8 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-4xl font-bold text-transparent"
	>
		Passkey-Controlled PKP Demo
	</h1>

	{#if mainError}
		<div class="mb-6 w-full max-w-3xl rounded-md bg-red-700 p-4 text-white shadow-lg">
			<span class="font-bold">Error:</span>
			{mainError}
		</div>
	{/if}

	{#if mainSuccess}
		<div class="mb-6 w-full max-w-3xl rounded-md bg-green-700 p-4 text-white shadow-lg">
			<span class="font-bold">Success:</span>
			{mainSuccess}
		</div>
	{/if}

	<!-- Step 0: Initial Connections -->
	<div
		class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
	>
		<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-cyan-300">
			Step 0: Initial Connections
		</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div>
				<h3 class="mb-2 text-lg font-medium text-slate-300">A. Lit Network Status</h3>
				{#if isLitConnecting}
					<p class="text-sm text-yellow-400">Connecting to Lit Network...</p>
				{:else if litConnected}
					<p class="text-sm text-green-400">✅ Connected to Lit Network.</p>
				{:else}
					<p class="text-sm text-red-400">Not connected to Lit. Attempting on load...</p>
					<button
						on:click={handleConnectLit}
						class="mt-1 flex w-full justify-center rounded-md border border-transparent bg-cyan-700 px-4 py-1 text-xs font-medium text-white shadow-sm hover:bg-cyan-800 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						disabled={isLitConnecting}
					>
						Retry Lit Connection
					</button>
				{/if}
			</div>
			<div>
				<h3 class="mb-2 text-lg font-medium text-slate-300">B. Connect Controller EOA Wallet</h3>
				{#if isEoaConnecting}
					<p class="text-center"><span class="spinner mr-2"></span>Connecting EOA Wallet...</p>
				{:else if eoaAddress}
					<p class="rounded bg-green-100 p-2 text-center text-green-600">
						✅ EOA Connected: <span class="font-mono text-sm">{eoaAddress}</span>
					</p>
				{:else if mainError && mainError.toLowerCase().includes('eoa')}
					<p class="rounded bg-red-100 p-2 text-center text-red-600">
						EOA Connection Failed. {mainError.replace('Error connecting EOA wallet: ', '')}
					</p>
				{:else}
					<p class="rounded bg-gray-100 p-2 text-center text-gray-500">
						EOA Wallet not connected. Will attempt on load.
					</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Step 1: Passkey Management -->
	<div
		class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
	>
		<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-purple-300">
			Step 1: Passkey Management (User-specific)
		</h2>
		{#if !storedPasskey}
			<form on:submit|preventDefault={handleCreatePasskey} class="space-y-4">
				<p class="mb-4 text-sm text-slate-300">
					Create a passkey credential. This will be stored locally in your browser.
				</p>
				<div>
					<label for="username" class="mb-1 block text-sm font-medium text-slate-300"
						>Username for Passkey</label
					><input
						type="text"
						id="username"
						bind:value={username}
						class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500 focus:outline-none"
						placeholder="e.g., my-device-passkey"
						required
					/>
				</div>
				<button
					type="submit"
					class="flex w-full justify-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-800 focus:outline-none disabled:opacity-50"
					disabled={generalIsLoading}
					>{generalIsLoading ? 'Processing...' : 'Create Passkey'}</button
				>
			</form>
		{:else}
			<h3 class="mb-2 text-lg font-medium">
				Passkey Created for: <span class="font-bold text-purple-400">{storedPasskey.username}</span>
			</h3>
			<div class="space-y-2 rounded-md bg-slate-800/50 p-4 text-xs">
				<div class="break-all">
					<span class="font-semibold text-slate-400">Raw ID (Hex):</span>
					{storedPasskey.rawId}
				</div>
				<div class="break-all">
					<span class="font-semibold text-slate-400">AuthMethod ID (for PKP):</span>
					{storedPasskey.authMethodId}
				</div>
				<div class="break-all">
					<span class="font-semibold text-slate-400">Public Key X:</span>
					{storedPasskey.pubkeyCoordinates.x}
				</div>
				<div class="break-all">
					<span class="font-semibold text-slate-400">Public Key Y:</span>
					{storedPasskey.pubkeyCoordinates.y}
				</div>
				{#if storedPasskey.signerContractAddress}
					<div class="break-all">
						<span class="font-semibold text-slate-400">Deployed EIP-1271 Signer:</span><a
							href={`https://gnosisscan.io/address/${storedPasskey.signerContractAddress}`}
							target="_blank"
							rel="noopener noreferrer"
							class="ml-1 text-pink-400 hover:text-pink-300 hover:underline"
							>{storedPasskey.signerContractAddress}</a
						>
					</div>
				{/if}
			</div>
			<div class="mt-4 flex justify-end">
				<button
					on:click={handleClearPasskey}
					class="ml-2 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-800 focus:outline-none"
					>Clear Passkey Data</button
				>
			</div>
		{/if}
	</div>

	<!-- Step 2: Deploy & Verify EIP-1271 Signer Contract -->
	<div
		class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
	>
		<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-pink-300">
			Step 2: Deploy & Verify EIP-1271 Signer
		</h2>
		<p class="mb-4 text-sm text-slate-300">
			Deploy an EIP-1271 signer proxy contract for the passkey (Step 1). This allows on-chain
			verification of signatures and is **required** before minting a PKP (Step 3) that uses this
			passkey for Lit Action authentication.
			<strong>Requires Gnosis connection & funds.</strong>
		</p>

		{#if !storedPasskey}
			<p class="rounded bg-orange-700/30 p-3 text-center text-orange-400">
				Create a Passkey (Step 1) first.
			</p>
		{:else if !storedPasskey.signerContractAddress}
			<button
				on:click={handleDeployContract}
				class="flex w-full justify-center rounded-md border border-transparent bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:ring-offset-slate-800 focus:outline-none disabled:opacity-50"
				disabled={generalIsLoading}
			>
				{generalIsLoading ? 'Deploying...' : 'Deploy EIP-1271 Signer'}
			</button>
			{#if deploymentTxHash && deploymentTxHash !== '0x'}
				<p class="mt-2 text-center text-xs text-slate-400">
					Tx Hash: <a
						href={`https://gnosisscan.io/tx/${deploymentTxHash}`}
						target="_blank"
						rel="noopener noreferrer"
						class="text-pink-400 hover:underline">{deploymentTxHash}</a
					>
				</p>
			{/if}
		{:else}
			<p class="mb-4 rounded-md bg-green-800/50 p-3 text-center text-green-300">
				EIP-1271 Signer already deployed at: <a
					href={`https://gnosisscan.io/address/${storedPasskey.signerContractAddress}`}
					target="_blank"
					rel="noopener noreferrer"
					class="font-mono text-xs hover:underline">{storedPasskey.signerContractAddress}</a
				>
			</p>
			<h3 class="mb-2 text-lg font-medium text-slate-300">Verify Signer Functionality</h3>
			<div class="mb-4">
				<label for="messageToSignEIP1271" class="mb-1 block text-sm font-medium text-slate-300"
					>Message to Sign & Verify</label
				>
				<input
					id="messageToSignEIP1271"
					bind:value={messageToSign}
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500 focus:outline-none"
					placeholder="Enter a message"
				/>
			</div>
			<button
				on:click={handleSignAndVerifyEIP1271Proxy}
				class="flex w-full justify-center rounded-md border border-transparent bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-cyan-700 focus:outline-none disabled:opacity-50"
				disabled={isLoadingProxyVerify || !storedPasskey?.signerContractAddress}
				>{isLoadingProxyVerify ? 'Verifying...' : 'Sign & Verify (Deployed Proxy)'}</button
			>
			{#if proxyVerificationResult !== null}
				<div
					class="mt-4 rounded-md p-3 text-center {proxyVerificationResult.isCorrect
						? 'bg-green-800/50'
						: 'bg-red-800/50'}"
				>
					<p class="font-semibold">
						{proxyVerificationResult.isCorrect
							? '✅ Proxy Verification Successful!'
							: '❌ Proxy Verification Failed'}
					</p>
					{#if proxyVerificationResult.error}
						<p class="mt-1 text-xs text-red-300">{proxyVerificationResult.error}</p>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Step 3: Mint New PKP -->
	<div
		class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
	>
		<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-teal-300">
			Step 3: Mint PKP for Passkey
		</h2>

		{#if !storedPasskey}
			<p class="rounded-md bg-orange-700/30 p-3 text-orange-400">
				Please create and store a passkey first (Step 1) to enable PKP minting.
			</p>
		{:else if !storedPasskey.signerContractAddress}
			<p class="rounded-md bg-orange-700/30 p-3 text-orange-400">
				Please deploy the EIP-1271 Signer (Step 2) first to enable PKP minting.
			</p>
		{:else if !eoaAddress}
			<p class="rounded-md bg-orange-700/30 p-3 text-orange-400">
				EOA Wallet not connected (Step 0). Please ensure your wallet is connected to enable PKP
				minting.
			</p>
		{:else if !mintedPkpTokenId}
			<p class="mb-4 text-sm text-slate-300">
				Mint a new PKP on the Chronicle testnet. This PKP will be configured to allow authentication
				using your passkey (via the Gnosis verification Lit Action) and will be transferred to its
				own address.
			</p>
			<button
				class="mb-3 flex w-full items-center justify-center rounded bg-purple-600 px-4 py-2 font-bold text-white transition duration-150 ease-in-out hover:bg-purple-700 disabled:opacity-50"
				disabled={isMintingPkp ||
					!storedPasskey?.authMethodId ||
					!eoaAddress ||
					!storedPasskey.signerContractAddress}
				on:click={handleMintPkp}
			>
				{#if isMintingPkp}
					<span class="spinner mr-2"></span>Minting PKP...
				{:else}
					Mint New PKP for Passkey
				{/if}
			</button>
		{/if}

		{#if mintedPkpTokenId}
			<div class="mt-3 rounded-md border border-green-700 bg-green-800/50 p-3 text-slate-100">
				<h4 class="font-semibold text-green-300">PKP Details (Minted / Loaded):</h4>
				<p class="text-sm">
					Token ID: <code class="rounded bg-slate-700 p-1 text-xs">{mintedPkpTokenId}</code>
				</p>
				<p class="text-sm">
					Public Key: <code class="rounded bg-slate-700 p-1 text-xs break-all"
						>{mintedPkpPublicKey}</code
					>
				</p>
				<p class="text-sm">
					ETH Address: <code class="rounded bg-slate-700 p-1 text-xs">{mintedPkpEthAddress}</code>
				</p>
			</div>
		{/if}
	</div>

	<!-- Step 4: View Auth Methods -->
	{#if litConnected && (mintedPkpTokenId || eoaAddress)}
		<div
			class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
		>
			<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-lime-300">
				Step 4: View PKP Auth Methods
			</h2>
			<p class="mb-3 text-sm text-slate-300">
				Fetch and display all auth methods registered for the PKP Token ID <code class="text-xs"
					>{mintedPkpTokenId ?? 'N/A (Using manual input below)'}</code
				> from the Chronicle testnet.
			</p>

			<button
				on:click={() => mintedPkpTokenId && handleFetchPermittedAuthMethods(mintedPkpTokenId)}
				class="mb-3 flex w-full justify-center rounded-md border border-transparent bg-yellow-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-yellow-700 disabled:opacity-50"
				disabled={isLoadingPermittedAuthMethods || !mintedPkpTokenId || !litConnected}
			>
				{isLoadingPermittedAuthMethods ? 'Fetching Methods...' : 'Fetch Permitted Auth Methods'}
			</button>

			{#if permittedAuthMethods.length > 0}
				<div class="mt-4 space-y-3">
					{#each permittedAuthMethods as method, i}
						<div class="rounded-md bg-slate-800/50 p-3 text-xs">
							<p><span class="font-semibold text-slate-400">Method {i + 1}</span></p>
							<p>
								<span class="font-semibold text-slate-400">Type:</span>
								{method.authMethodType.toString()}
								{#if method.authMethodType === 2n}
									<span class="text-cyan-300">(Lit Action)</span>
								{:else}
									(Other)
								{/if}
							</p>
							<p class="break-all">
								<span class="font-semibold text-slate-400">ID (Hex):</span>
								{method.id}
							</p>
							<p class="break-all">
								<span class="font-semibold text-slate-400">User Pubkey (Hex):</span>
								{method.userPubkey}
							</p>
						</div>
					{/each}
				</div>
			{:else if !isLoadingPermittedAuthMethods && (mainSuccess.includes('No permitted auth methods') || mainSuccess.includes('permitted auth method(s)'))}
				<p class="mt-3 text-center text-sm text-slate-400">No methods found or fetch completed.</p>
			{/if}
		</div>
	{/if}

	<!-- Step 5: Generate Session Signatures for PKP -->
	{#if litConnected && mintedPkpTokenId}
		<div
			class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
		>
			<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-emerald-300">
				Step 5: Generate Session Signatures for PKP
			</h2>
			<p class="mb-4 text-sm text-slate-300">
				Use your passkey (authenticated via the Gnosis verification Lit Action) to obtain temporary
				session keys to use the PKP ({mintedPkpTokenId}).
			</p>

			<div class="space-y-4">
				<!-- Method: Gnosis Verified Passkey -->
				<div class="rounded-lg border border-slate-700 p-4">
					<h3 class="mb-2 font-medium text-blue-300">
						Authenticate with Passkey (Gnosis On-Chain Verification)
					</h3>
					{#if storedPasskey?.rawId && storedPasskey?.pubkeyCoordinates}
						<p class="mb-2 text-xs text-slate-400">
							Uses a Lit Action to verify your passkey signature directly against your deployed
							EIP-1271 Gnosis Chain contract (Step 2).
						</p>
						<button
							on:click={handleGetSessionSigsGnosisPasskey}
							class="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
							disabled={isLoadingSessionSigsGnosisPasskey ||
								(!!sessionSigs && sessionAuthMethod !== 'gnosis-passkey') ||
								!storedPasskey?.rawId ||
								!storedPasskey?.pubkeyCoordinates ||
								!storedPasskey?.signerContractAddress ||
								!mintedPkpPublicKey}
						>
							{#if isLoadingSessionSigsGnosisPasskey}Generating Sigs...{:else if sessionSigs && sessionAuthMethod === 'gnosis-passkey'}✅
								Sigs Obtained{:else}Get Session Sigs (Gnosis Passkey){/if}
						</button>
					{:else}
						<p class="text-sm text-amber-400">Create a passkey (Step 1) first.</p>
					{/if}
				</div>
			</div>

			{#if sessionSigs}
				<div class="mt-6 rounded-md bg-slate-700 p-4">
					<h3 class="mb-2 font-semibold text-emerald-400">
						Active Session Signatures (Authenticated via: {sessionAuthMethod?.toUpperCase()})
					</h3>
					<pre class="overflow-x-auto text-xs whitespace-pre-wrap">{JSON.stringify(
							sessionSigs,
							null,
							2
						)}</pre>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Step 6: PKP Operations -->
	{#if sessionSigs}
		<div
			class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
		>
			<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-sky-300">
				Step 6: PKP Operations (Requires Session Sigs)
			</h2>
			<p class="mb-4 text-xs text-slate-400">
				Current session authenticated via: <span class="font-medium text-yellow-300"
					>{sessionAuthMethod?.toUpperCase() ?? 'N/A'}</span
				>
			</p>

			<!-- Sign Message with PKP -->
			<div class="mb-6 rounded-lg border border-slate-700 p-4">
				<h3 class="mb-3 text-lg font-medium text-sky-300">6A. Sign Message with PKP</h3>
				<div class="mb-4">
					<label for="messageToSignPkp" class="mb-1 block text-sm font-medium text-slate-300"
						>Message to Sign</label
					>
					<input
						id="messageToSignPkp"
						bind:value={messageToSign}
						class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white shadow-sm focus:border-sky-500 focus:ring-sky-500 focus:outline-none"
					/>
				</div>
				<button
					on:click={handleSignMessageWithPkp}
					class="flex w-full justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
					disabled={isSigningMessage || !sessionSigs || !mintedPkpPublicKey}
				>
					{isSigningMessage ? 'Signing...' : 'Sign Message with PKP'}
				</button>
				{#if signatureResult}
					<div class="mt-4 space-y-2 rounded-md bg-slate-800/50 p-3 text-xs">
						<p class="font-semibold text-green-400">PKP Signature Successful!</p>
						<div>
							<p class="font-medium text-slate-400">Data Signed (Hashed Message):</p>
							<code class="block break-all text-slate-200">{signatureResult.dataSigned}</code>
						</div>
						<div>
							<p class="font-medium text-slate-400">Signature:</p>
							<code class="block break-all text-slate-200">{signatureResult.signature}</code>
						</div>
					</div>
				{/if}
			</div>

			<!-- Execute Lit Action -->
			<div class="rounded-lg border border-slate-700 p-4">
				<h3 class="mb-3 text-lg font-medium text-indigo-300">6B. Execute Inline Lit Action</h3>
				<p class="mb-3 text-xs text-slate-400">
					This action checks if a number is >= 42. Code is defined below.
				</p>
				<div class="mb-4">
					<label for="magicNumber" class="mb-1 block text-sm font-medium text-slate-300"
						>Number to Check (magicNumber)</label
					>
					<input
						id="magicNumber"
						type="number"
						bind:value={magicNumber}
						class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none"
					/>
				</div>
				<button
					on:click={handleExecuteLitAction}
					class="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
					disabled={isExecutingAction}
				>
					{#if isExecutingAction}Executing Action...{:else}Execute Lit Action{/if}
				</button>
				{#if litActionResult}
					<div class="mt-4 space-y-2 rounded-md bg-slate-800/50 p-3 text-xs">
						<p class="font-semibold text-green-400">Lit Action Executed!</p>
						<div>
							<p class="font-medium text-slate-400">Response:</p>
							<pre class="block break-all whitespace-pre-wrap text-slate-200">{JSON.stringify(
									litActionResult.response,
									null,
									2
								)}</pre>
						</div>
						{#if litActionResult.logs}
							<div>
								<p class="font-medium text-slate-400">Logs:</p>
								<pre
									class="block break-all whitespace-pre-wrap text-slate-200">{litActionResult.logs}</pre>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Keeping previous styles, can be refactored later if needed */
	.spinner {
		display: inline-block;
		width: 1em;
		height: 1em;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.75s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Ensure buttons in flex containers don't shrink unnecessarily */
	button {
		flex-shrink: 0;
	}
</style>
