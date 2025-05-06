<script lang="ts">
	import { onMount } from 'svelte';
	import {
		createAndStorePasskeyData,
		getStoredPasskeyData,
		clearStoredPasskeyData,
		deployPasskeySignerContract,
		checkSignature,
		verifySignatureWithProxy,
		getWalletClient,
		getWalletAccount,
		type StoredPasskeyData,
		type AuthenticatorAssertionResponse
	} from '$lib/wallet/passkeySigner';
	import {
		connectToLit,
		getSessionSigs as getSessionSigsViaEOA, // Renamed for clarity
		createAuthNeededCallback,
		signWithPKP,
		executeLitAction,
		registerPasskeyAuthMethod,
		addPermittedLitAction,
		getSessionSigsWithGnosisPasskeyVerification,
		getPermittedAuthMethodsForPkp,
		gnosisPasskeyVerifyActionCode
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
	let verificationResult: { isCorrect: boolean; error?: string } | null = null;
	let proxyVerificationResult: { isCorrect: boolean; error?: string } | null = null;
	let isLoadingProxyVerify = false;

	// PKP Auth Registration State (for Passkey)
	let pkpTokenIdInput =
		'54904544591499255766150295717592103065825849619250648229571304472718432033530'; // Default from lit page
	let isRegisteringPasskeyAuth = false;
	let passkeyRegistrationTxHash = '';
	let isPasskeyAuthMethodRegistered = false; // This will be updated by checking contract state later

	// Lit Connection State
	let litNodeClient: LitNodeClient | null = null;
	let isLitConnecting = false;
	let litConnected = false;

	// Wallet (EOA) Connection State
	let eoaWalletClient: WalletClient | null = null;
	let eoaAddress: Address | null = null;
	let isEoaConnecting = false;

	// Session Signatures State (Unified)
	let sessionSigs: SessionSigs | null = null;
	let sessionAuthMethod: 'eoa' | 'gnosis-passkey' | null = null;
	let isLoadingSessionSigsEOA = false;
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
	let isRegisteringLitActionAuth = false;
	let litActionRegistrationTxHash = '';

	// --- NEW: State for displaying auth methods ---
	let permittedAuthMethods: Array<{ authMethodType: bigint; id: Hex; userPubkey: Hex }> = [];
	let isLoadingPermittedAuthMethods = false;
	// --- END: State for displaying auth methods ---
	// General UI State
	let generalIsLoading = false; // For general page loads or multiple step operations
	let mainError = '';
	let mainSuccess = '';

	// PKP Details (from lit/+page.svelte, used as primary for PKP operations)
	const PKP_TOKEN_ID =
		'54904544591499255766150295717592103065825849619250648229571304472718432033530';
	const PKP_PUBLIC_KEY =
		'0x04024be2ffbd04173e6a014f0b93e9a4c4f5ea4c1d7409ca0c90ee596f40ed38f9c7faa53b5536a0ac11aa8a315e2705032a282db4ee386644e4d2f5e06964df5e' as Hex;
	const PKP_ETH_ADDRESS = '0x6c4980C788eB10157c19884F581fed1AFd3c3520' as Address;

	// State for registering Lit Action as Auth Method (Section 4B)
	let litActionCodeForRegistration = gnosisPasskeyVerifyActionCode;

	onMount(async () => {
		storedPasskey = getStoredPasskeyData();
		if (storedPasskey?.signerContractAddress) {
			deployedSignerAddress = storedPasskey.signerContractAddress as Address;
		}
		await handleConnectLit(); // Auto-connect to Lit
		// TODO: Later, add check for existing passkey auth method registration if PKP_TOKEN_ID and litNodeClient are available
	});

	function resetMainMessages() {
		mainError = '';
		mainSuccess = '';
	}

	// --- Passkey & EIP-1271 Functions (Section 1-3 from original wallet page) ---
	async function handleCreatePasskey() {
		if (!username.trim()) {
			mainError = 'Please enter a username.';
			return;
		}
		generalIsLoading = true;
		resetMainMessages();
		deploymentTxHash = '';
		verificationResult = null;
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
		mainSuccess = 'Passkey data cleared.';
		resetMainMessages();
		deploymentTxHash = '';
		verificationResult = null;
		proxyVerificationResult = null;
		deployedSignerAddress = null;
		isPasskeyAuthMethodRegistered = false;
		passkeyRegistrationTxHash = '';
	}

	async function handleDeployContract() {
		generalIsLoading = true;
		resetMainMessages();
		deploymentTxHash = '';
		verificationResult = null;
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

	async function handleSignAndVerifyEIP1271Factory() {
		if (!messageToSign.trim()) {
			mainError = 'Please enter a message to sign for EIP-1271 verification.';
			return;
		}
		generalIsLoading = true;
		resetMainMessages();
		verificationResult = null;
		proxyVerificationResult = null;

		try {
			verificationResult = await checkSignature(messageToSign);
			if (verificationResult.isCorrect) {
				mainSuccess = 'EIP-1271 Signature verified successfully via FACTORY!';
			} else {
				mainError = `EIP-1271 Factory Verification Failed: ${verificationResult.error || 'Contract returned invalid magic value.'}`;
			}
		} catch (error: any) {
			mainError = `Error during EIP-1271 factory signature verification: ${error.message}`;
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
			mainError = 'EIP-1271 Signer contract must be deployed first.';
			return;
		}
		isLoadingProxyVerify = true;
		resetMainMessages();
		verificationResult = null;
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
		isLitConnecting = true;
		resetMainMessages();
		sessionSigs = null; // Clear previous sigs
		sessionAuthMethod = null;
		try {
			litNodeClient = await connectToLit();
			litConnected = true;
			mainSuccess = 'Connected to Lit Network.';
		} catch (err: any) {
			mainError = err.message || 'Unknown error connecting to Lit';
			litConnected = false;
		} finally {
			isLitConnecting = false;
		}
	}

	async function handleConnectEoaWallet() {
		isEoaConnecting = true;
		resetMainMessages();
		try {
			eoaWalletClient = getWalletClient();
			eoaAddress = await getWalletAccount();
			mainSuccess = `Connected EOA wallet: ${eoaAddress}`;
		} catch (err: any) {
			mainError = err.message || 'Unknown error connecting EOA wallet';
			eoaAddress = null;
			eoaWalletClient = null;
		} finally {
			isEoaConnecting = false;
		}
	}

	// --- PKP Auth Method Registration ---
	async function handleRegisterPasskeyAuth() {
		const currentAuthMethodId = storedPasskey?.authMethodId;
		if (!currentAuthMethodId) {
			mainError = 'No passkey found with authMethodId. Create a passkey first (Section 1).';
			return;
		}
		if (!eoaWalletClient || !eoaAddress) {
			mainError = 'EOA Wallet (Controller) must be connected to register auth methods.';
			return;
		}
		if (!pkpTokenIdInput.trim()) {
			mainError = 'PKP Token ID must be provided for registration.';
			return;
		}

		isRegisteringPasskeyAuth = true;
		resetMainMessages();
		passkeyRegistrationTxHash = '';

		try {
			// EOA Wallet client is already available via eoaWalletClient
			const txHash = await registerPasskeyAuthMethod(
				eoaWalletClient,
				eoaAddress,
				pkpTokenIdInput, // Use the input field value
				currentAuthMethodId as Hex
			);
			passkeyRegistrationTxHash = txHash;
			isPasskeyAuthMethodRegistered = true; // Assume success for now, real check later
			mainSuccess = `Passkey auth method registration sent for PKP ${pkpTokenIdInput}. Tx: ${txHash}. (Note: On-chain status not yet verified here.)`;
		} catch (error: any) {
			mainError = error.message || 'An unknown error occurred during passkey auth registration.';
			console.error(error);
			isPasskeyAuthMethodRegistered = false;
		} finally {
			isRegisteringPasskeyAuth = false;
		}
	}

	// --- NEW: Lit Action Auth Registration Handler ---
	async function handleRegisterLitActionAuth() {
		if (!eoaWalletClient || !eoaAddress) {
			mainError = 'EOA Wallet (Controller) must be connected to register auth methods.';
			return;
		}
		if (!pkpTokenIdInput.trim()) {
			mainError = 'PKP Token ID must be provided for registration.';
			return;
		}
		if (!litActionCodeForRegistration.trim()) {
			mainError = 'Lit Action code cannot be empty.';
			return;
		}

		isRegisteringLitActionAuth = true;
		resetMainMessages();
		litActionRegistrationTxHash = '';

		try {
			// litNodeClient is not strictly required by addPermittedLitAction anymore
			const txHash = await addPermittedLitAction(
				eoaWalletClient,
				eoaAddress,
				pkpTokenIdInput,
				litActionCodeForRegistration
				// scopes default to [1n] (SignAnything)
			);
			litActionRegistrationTxHash = txHash;
			mainSuccess = `Lit Action auth method registration sent for PKP ${pkpTokenIdInput}. Tx: ${txHash}. (Note: On-chain status not yet verified here.)`;
			// Ideally, we'd have a way to confirm on-chain status here or later
		} catch (error: any) {
			mainError = error.message || 'An unknown error occurred during Lit Action auth registration.';
			console.error(error);
		} finally {
			isRegisteringLitActionAuth = false;
		}
	}

	// --- Session Signature Generation ---
	async function handleGetSessionSigsEOA() {
		if (!litNodeClient || !eoaWalletClient || !eoaAddress) {
			mainError = 'Must connect to Lit and EOA wallet first.';
			return;
		}
		isLoadingSessionSigsEOA = true;
		resetMainMessages();
		sessionSigs = null;
		sessionAuthMethod = null;
		try {
			const chainInfo = await eoaWalletClient.getChainId();
			const authCallback = createAuthNeededCallback(
				litNodeClient,
				eoaWalletClient,
				eoaAddress,
				chainInfo
			);
			sessionSigs = await getSessionSigsViaEOA(litNodeClient, 'ethereum', authCallback);
			sessionAuthMethod = 'eoa';
			mainSuccess = 'Successfully obtained session signatures via EOA!';
		} catch (err: any) {
			mainError = err.message || 'Unknown error getting session signatures via EOA';
			sessionSigs = null;
		} finally {
			isLoadingSessionSigsEOA = false;
		}
	}

	// --- NEW: Session Sigs with Gnosis Passkey Verification ---
	async function handleGetSessionSigsGnosisPasskey() {
		if (!litNodeClient) {
			mainError = 'Must connect to Lit first.';
			return;
		}
		if (!storedPasskey?.rawId || !storedPasskey.pubkeyCoordinates) {
			mainError = 'Stored passkey with rawId and coordinates is required for Gnosis verification.';
			return;
		}

		isLoadingSessionSigsGnosisPasskey = true;
		resetMainMessages();
		sessionSigs = null;
		sessionAuthMethod = null;

		try {
			// Define a standard challenge message
			const challengeMessage = 'Sign in to Hominio PKP via Passkey';

			// 1. Get assertion from passkey using the defined challenge
			const messageHashAsChallenge = keccak256(new TextEncoder().encode(challengeMessage)); // Hash the standard message
			console.log(
				`Requesting passkey signature for challenge (hash of "${challengeMessage}"): ${messageHashAsChallenge}`
			);

			const assertion = (await navigator.credentials.get({
				publicKey: {
					challenge: hexToBytes(messageHashAsChallenge),
					allowCredentials: [{ type: 'public-key', id: hexToBytes(storedPasskey.rawId as Hex) }],
					userVerification: 'required'
				}
			})) as PublicKeyCredential | null; // Correct type assertion

			// Add checks for assertion and required response fields
			if (
				!assertion ||
				!assertion.response ||
				!(assertion.response instanceof AuthenticatorAssertionResponse) || // Check instance type
				!assertion.response.authenticatorData ||
				!assertion.response.signature
			) {
				throw new Error(
					'Failed to get valid signature assertion (missing fields or wrong type) from passkey.'
				);
			}
			console.log('Got assertion for Gnosis verification:', assertion);

			// assertion.response is now guaranteed to be AuthenticatorAssertionResponse
			const assertionResponse = assertion.response;

			// 2. Call the session sig function, passing the assertion RESPONSE
			sessionSigs = await getSessionSigsWithGnosisPasskeyVerification(
				litNodeClient,
				PKP_PUBLIC_KEY,
				challengeMessage,
				assertionResponse, // <-- Pass the checked assertionResponse
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
			mainError = 'Must connect to Lit and get session signatures first.';
			return;
		}
		if (!messageToSign.trim()) {
			mainError = 'Please enter a message to sign with PKP.';
			return;
		}
		isSigningMessage = true;
		resetMainMessages();
		signatureResult = null;
		try {
			signatureResult = await signWithPKP(
				litNodeClient,
				sessionSigs,
				PKP_PUBLIC_KEY,
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
			mainError = 'Must connect to Lit and get session signatures first.';
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

	// --- NEW: Handler to fetch and display permitted auth methods ---
	async function handleFetchPermittedAuthMethods() {
		if (!litNodeClient) {
			mainError = 'Lit Network not connected.';
			return;
		}
		if (!pkpTokenIdInput.trim()) {
			mainError = 'PKP Token ID must be provided to fetch auth methods.';
			return;
		}
		isLoadingPermittedAuthMethods = true;
		resetMainMessages();
		permittedAuthMethods = [];
		try {
			const methods = await getPermittedAuthMethodsForPkp(pkpTokenIdInput);
			permittedAuthMethods = methods;
			if (methods.length > 0) {
				mainSuccess = `Found ${methods.length} permitted auth method(s) for PKP ${pkpTokenIdInput}.`;
			} else {
				mainSuccess = `No permitted auth methods found for PKP ${pkpTokenIdInput}.`;
			}
		} catch (err: any) {
			mainError = err.message || 'Error fetching permitted auth methods.';
			console.error('Error in handleFetchPermittedAuthMethods:', err);
		} finally {
			isLoadingPermittedAuthMethods = false;
		}
	}
	// --- END: Handler to fetch and display permitted auth methods ---
</script>

<div
	class="flex min-h-screen flex-col items-center bg-gradient-to-b from-slate-900 to-slate-800 p-8 text-white"
>
	<h1
		class="mb-8 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-4xl font-bold text-transparent"
	>
		Unified Passkey & PKP Interaction Demo
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

	<!-- Section 0: Initial Connections -->
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
				<button
					on:click={handleConnectEoaWallet}
					class="flex w-full justify-center rounded-md border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					disabled={isEoaConnecting || !!eoaAddress}
				>
					{#if isEoaConnecting}Connecting...{:else if eoaAddress}<span class="truncate"
							>✅ EOA: {eoaAddress}</span
						>{:else}Connect EOA Wallet{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Section 1: Passkey Management -->
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

	<!-- Section 2: Deploy EIP-1271 Signer Contract (Optional, for on-chain passkey sig verification) -->
	{#if storedPasskey && !storedPasskey.signerContractAddress}
		<div
			class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
		>
			<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-pink-300">
				Step 2: Deploy EIP-1271 Signer (Optional)
			</h2>
			<p class="mb-4 text-sm text-slate-300">
				Deploy an EIP-1271 signer proxy contract for the passkey. This allows on-chain verification
				of signatures made by this passkey. <strong>Requires Gnosis connection & funds.</strong>
			</p>
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
		</div>
	{/if}

	<!-- Section 3: Sign & Verify with EIP-1271 (Optional) -->
	{#if storedPasskey}
		<div
			class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
		>
			<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-teal-300">
				Step 3: Sign & Verify with Passkey (EIP-1271 - Optional)
			</h2>
			<div class="mb-4">
				<label for="messageToSignEIP1271" class="mb-1 block text-sm font-medium text-slate-300"
					>Message to Sign (for EIP-1271)</label
				><input
					id="messageToSignEIP1271"
					bind:value={messageToSign}
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500 focus:outline-none"
					placeholder="Enter a message"
				/>
			</div>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<button
					on:click={handleSignAndVerifyEIP1271Factory}
					class="flex w-full justify-center rounded-md border border-transparent bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 focus:outline-none disabled:opacity-50"
					disabled={generalIsLoading}
					>{generalIsLoading ? 'Verifying...' : 'Sign & Verify (Factory)'}</button
				>
				<button
					on:click={handleSignAndVerifyEIP1271Proxy}
					class="flex w-full justify-center rounded-md border border-transparent bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-cyan-700 focus:outline-none disabled:opacity-50"
					disabled={isLoadingProxyVerify || !storedPasskey?.signerContractAddress}
					>{isLoadingProxyVerify ? 'Verifying...' : 'Sign & Verify (Deployed Proxy)'}</button
				>
			</div>
			{#if verificationResult !== null}
				<div
					class="mt-4 rounded-md p-3 text-center {verificationResult.isCorrect
						? 'bg-green-800/50'
						: 'bg-red-800/50'}"
				>
					<p class="font-semibold">
						{verificationResult.isCorrect
							? '✅ Factory Verification Successful!'
							: '❌ Factory Verification Failed'}
					</p>
					{#if verificationResult.error}
						<p class="mt-1 text-xs text-red-300">{verificationResult.error}</p>
					{/if}
				</div>
			{/if}
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
		</div>
	{/if}

	<!-- Section 4: Register Auth Methods for PKP -->
	{#if litConnected && eoaAddress}
		<div
			class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
		>
			<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-lime-300">
				Step 4: Register Auth Methods for PKP (Controller EOA Action)
			</h2>
			<p class="mb-4 text-sm text-slate-300">
				Use your connected Controller EOA (<code class="text-xs">{eoaAddress}</code>) to register
				authentication methods for a PKP on the Chronicle testnet.
			</p>
			<div class="mb-4">
				<label for="pkpTokenIdInput" class="mb-1 block text-sm font-medium text-slate-300"
					>Target PKP Token ID</label
				>
				<input
					type="text"
					id="pkpTokenIdInput"
					bind:value={pkpTokenIdInput}
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500 focus:outline-none"
					placeholder="Enter PKP Token ID to manage"
				/>
			</div>

			<!-- Register Passkey Auth Method -->
			<div class="mb-6 rounded-lg border border-slate-700 p-4">
				<h3 class="mb-3 text-lg font-medium text-purple-300">4A. Register Current Local Passkey</h3>
				{#if storedPasskey?.authMethodId}
					<p class="mb-2 text-xs text-slate-400">
						Using AuthMethodID: <code class="text-purple-400">{storedPasskey.authMethodId}</code>
					</p>
					<button
						on:click={handleRegisterPasskeyAuth}
						class="flex w-full justify-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
						disabled={isRegisteringPasskeyAuth || !pkpTokenIdInput.trim()}
					>
						{isRegisteringPasskeyAuth ? 'Registering Passkey...' : 'Register Passkey Auth'}
					</button>
					{#if passkeyRegistrationTxHash}
						<p class="mt-2 text-center text-xs">
							Tx: <a
								href={`https://explorer.litprotocol.com/datil-dev/tx/${passkeyRegistrationTxHash}`}
								target="_blank"
								rel="noopener noreferrer"
								class="text-pink-400 hover:underline">{passkeyRegistrationTxHash}</a
							>
						</p>
					{/if}
				{:else}
					<p class="text-sm text-amber-400">
						No local passkey with an AuthMethodID found. Please create one in Step 1.
					</p>
				{/if}
			</div>

			<!-- NEW: Register Lit Action Auth Method -->
			<div class="mb-6 rounded-lg border border-slate-700 p-4">
				<h3 class="mb-3 text-lg font-medium text-cyan-300">4B. Register Lit Action</h3>
				<p class="mb-2 text-xs text-slate-400">
					Register the JavaScript code below as a Type 2 authentication method for the PKP above.
					This grants the Lit Action itself (identified by its code's IPFS CID) permission to use
					the PKP with default 'SignAnything' scope.
				</p>
				<div class="mb-4">
					<label
						for="litActionCodeInputForRegistration"
						class="mb-1 block text-sm font-medium text-slate-300">Lit Action JavaScript Code</label
					>
					<textarea
						id="litActionCodeInputForRegistration"
						bind:value={litActionCodeForRegistration}
						rows={10}
						class="w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 font-mono text-sm text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 focus:outline-none"
						placeholder="Enter Lit Action JS code here..."
					></textarea>
				</div>
				<button
					on:click={handleRegisterLitActionAuth}
					class="flex w-full justify-center rounded-md border border-transparent bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50"
					disabled={isRegisteringLitActionAuth ||
						!pkpTokenIdInput.trim() ||
						!litActionCodeForRegistration.trim()}
				>
					{isRegisteringLitActionAuth ? 'Registering Lit Action...' : 'Register Lit Action Auth'}
				</button>
				{#if litActionRegistrationTxHash}
					<p class="mt-2 text-center text-xs">
						Tx: <a
							href={`https://explorer.litprotocol.com/datil-dev/tx/${litActionRegistrationTxHash}`}
							target="_blank"
							rel="noopener noreferrer"
							class="text-pink-400 hover:underline">{litActionRegistrationTxHash}</a
						>
					</p>
				{/if}
			</div>

			<!-- --- Section to Display Permitted Auth Methods --- -->
			{#if eoaAddress && pkpTokenIdInput.trim()}
				<div class="mt-6 rounded-lg border border-slate-700 p-4">
					<h3 class="mb-3 text-lg font-medium text-yellow-300">View Registered Auth Methods</h3>
					<p class="mb-3 text-xs text-slate-400">
						Fetch and display all auth methods registered for the PKP Token ID <code class="text-xs"
							>{pkpTokenIdInput}</code
						> from the Chronicle testnet.
					</p>
					<button
						on:click={handleFetchPermittedAuthMethods}
						class="mb-3 flex w-full justify-center rounded-md border border-transparent bg-yellow-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-yellow-700 disabled:opacity-50"
						disabled={isLoadingPermittedAuthMethods || !pkpTokenIdInput.trim() || !litConnected}
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
					{:else if !isLoadingPermittedAuthMethods && mainSuccess.includes('No permitted auth methods')}
						<p class="mt-3 text-center text-sm text-slate-400">No methods found.</p>
					{/if}
				</div>
			{/if}
			<!-- --- END: Section to Display Permitted Auth Methods --- -->
		</div>
	{/if}

	<!-- Section 5: Generate Session Signatures for PKP -->
	{#if litConnected}
		<div
			class="mb-8 w-full max-w-3xl rounded-lg bg-white/5 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
		>
			<h2 class="mb-4 border-b border-slate-700 pb-3 text-2xl font-semibold text-emerald-300">
				Step 5: Generate Session Signatures for PKP
			</h2>
			<p class="mb-2 text-sm text-slate-300">
				Use a registered authentication method to obtain temporary session keys to use the PKP. The
				following PKP will be used for operations:
			</p>
			<div class="mb-4 rounded-md bg-slate-700/50 p-3 text-xs">
				<p><span class="font-semibold text-slate-400">Using PKP Token ID:</span> {PKP_TOKEN_ID}</p>
				<p>
					<span class="font-semibold text-slate-400">PKP Public Key:</span>
					<code class="block break-all">{PKP_PUBLIC_KEY}</code>
				</p>
				<p>
					<span class="font-semibold text-slate-400">PKP ETH Address:</span>
					<code class="block break-all">{PKP_ETH_ADDRESS}</code>
				</p>
			</div>

			<div class="space-y-4">
				<!-- Method A: EOA Wallet -->
				<div class="rounded-lg border border-slate-700 p-4">
					<h3 class="mb-2 font-medium text-purple-300">Method A: EOA Wallet</h3>
					{#if eoaAddress}
						<button
							on:click={handleGetSessionSigsEOA}
							class="flex w-full justify-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
							disabled={isLoadingSessionSigsEOA || (!!sessionSigs && sessionAuthMethod !== 'eoa')}
						>
							{#if isLoadingSessionSigsEOA}Generating EOA Sigs...{:else if sessionSigs && sessionAuthMethod === 'eoa'}✅
								Sigs Obtained (EOA){:else}Get Session Sigs (EOA){/if}
						</button>
					{:else}
						<p class="text-sm text-amber-400">Connect EOA wallet in Step 0.B first.</p>
					{/if}
				</div>

				<!-- Method C: Gnosis Verified Passkey (NEW) -->
				<div class="rounded-lg border border-slate-700 p-4">
					<h3 class="mb-2 font-medium text-blue-300">
						Method C: Passkey (Gnosis On-Chain Verification)
					</h3>
					{#if storedPasskey?.rawId && storedPasskey?.pubkeyCoordinates}
						<p class="mb-2 text-xs text-slate-400">
							Uses a Lit Action to verify your passkey signature directly against Gnosis Chain
							contracts (Proxy or Factory).
						</p>
						<button
							on:click={handleGetSessionSigsGnosisPasskey}
							class="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
							disabled={isLoadingSessionSigsGnosisPasskey ||
								(!!sessionSigs && sessionAuthMethod !== 'gnosis-passkey')}
						>
							{#if isLoadingSessionSigsGnosisPasskey}Generating Gnosis Passkey Sigs...{:else if sessionSigs && sessionAuthMethod === 'gnosis-passkey'}✅
								Sigs Obtained (Gnosis Passkey){:else}Get Session Sigs (Gnosis Passkey){/if}
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

	<!-- Section 6: PKP Operations -->
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
					disabled={isSigningMessage}
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
					This action checks if a number is &gt;= 42. Code is defined below.
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
</style>
