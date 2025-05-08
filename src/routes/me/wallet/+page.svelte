<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { browser } from '$app/environment';
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
		signWithPKP,
		executeLitAction,
		getSessionSigsWithGnosisPasskeyVerification,
		getPermittedAuthMethodsForPkp,
		gnosisPasskeyVerifyActionCode,
		mintPKPWithPasskeyAndAction,
		getOwnedCapacityCredits
	} from '$lib/wallet/lit';
	import type { LitNodeClient } from '@lit-protocol/lit-node-client';
	import type { SessionSigs, ExecuteJsResponse } from '@lit-protocol/types';
	import type { Hex, Address, WalletClient } from 'viem';
	import { keccak256, hexToBytes } from 'viem';

	// --- Get Hominio Facade (including Lit Client Store) from Context ---
	// Type assertion includes the dynamically added 'lit' store
	const o = getContext<
		typeof import('$lib/KERNEL/hominio-svelte').o & {
			lit: import('svelte/store').Writable<LitNodeClient | null>;
		}
	>('o');
	const litClientStore = o.lit; // Get the store
	// --- End Context Setup ---

	// --- UI State for Tabbed Navigation ---
	let currentStepIndex = 0;
	const steps = [
		'Connections', // 0 - Simplified
		'Passkey', // 1
		'Deploy Signer', // 2
		'Mint PKP', // 3
		'Auth Methods', // 4
		'Session Sigs', // 5
		'PKP Operations', // 6
		'Profile', // 7
		'My Capacity Credits' // 8
	];

	function goToStep(index: number) {
		currentStepIndex = index;
		resetMainMessages();
	}
	// --- END: UI State for Tabbed Navigation ---

	// --- Unified State ---
	// Passkey & EIP-1271 Signer State
	let username = '';
	let storedPasskey: StoredPasskeyData | null = null;
	let deploymentTxHash = '';
	let deployedSignerAddress: Address | null = null;
	let proxyVerificationResult: { isCorrect: boolean; error?: string } | null = null;
	let isLoadingProxyVerify = false;

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

	// --- State for displaying owned Capacity Credits (NEW) ---
	type OwnedCapacityCredit = {
		tokenId: string;
		requestsPerKilosecond: bigint;
		expiresAt: bigint;
	};
	let ownedCapacityCredits: Array<OwnedCapacityCredit> = [];
	let isLoadingCapacityCredits = false;
	// --- END: State for displaying owned Capacity Credits ---

	// General UI State
	let generalIsLoading = false;
	let mainError = '';
	let mainSuccess = '';

	// --- Profile State - NEW
	let profileName = '';
	const PROFILE_STORAGE_KEY = 'hominio_profile_data_encrypted';
	let encryptedProfileDataString: string | null = null;
	let isEncryptingProfile = false;
	let isDecryptingProfile = false;
	// --- END: Profile State ---

	onMount(async () => {
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
						storedPKPData.pkpTokenId &&
						storedPKPData.pkpPublicKey &&
						storedPKPData.pkpEthAddress
					) {
						mintedPkpTokenId = storedPKPData.pkpTokenId;
						mintedPkpPublicKey = storedPKPData.pkpPublicKey;
						mintedPkpEthAddress = storedPKPData.pkpEthAddress;
						console.log('Loaded PKP details from localStorage:', storedPKPData);
					} else {
						console.warn('Found invalid PKP data in localStorage.');
						localStorage.removeItem('mintedPKPData');
					}
				} catch (error) {
					console.error('Error parsing PKP data from localStorage:', error);
					localStorage.removeItem('mintedPKPData');
				}
			}

			// Load Profile Name from localStorage
			encryptedProfileDataString = localStorage.getItem(PROFILE_STORAGE_KEY);
			if (encryptedProfileDataString) {
				console.log('Found encrypted profile data in localStorage.');
			} else {
				console.log('No encrypted profile data found in localStorage.');
			}

			// Auto-connect EOA Wallet (Lit is connected globally in layout)
			await handleConnectEoaWallet();

			// Auto-fetch auth methods if PKP ID is loaded
			// Check if Lit client is ready before fetching (relying on global client)
			const currentLitClient = $litClientStore;
			if (mintedPkpTokenId && currentLitClient && currentLitClient.ready) {
				// Note: getPermittedAuthMethodsForPkp doesn't require Lit Client anymore
				await handleFetchPermittedAuthMethods(mintedPkpTokenId);
			} else if (mintedPkpTokenId) {
				console.log(
					'PKP ID loaded, but Lit client not ready yet. Auth methods will be fetched when Lit connects or manually triggered.'
				);
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
				goToStep(2);
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
		sessionSigs = null;
		sessionAuthMethod = null;
		signatureResult = null;
		litActionResult = null;

		if (browser) {
			localStorage.removeItem('mintedPKPData');
			localStorage.removeItem(PROFILE_STORAGE_KEY); // Clear encrypted profile too
			encryptedProfileDataString = null;
			profileName = '';
		}
		mainSuccess = 'Passkey and associated PKP data cleared.';
		goToStep(1);
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
					goToStep(3);
				} else {
					mainSuccess = `Deployment transaction sent (${result.txHash}), but couldn't extract address from logs. Check Gnosisscan.`;
				}
				storedPasskey = getStoredPasskeyData();
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

	// --- EOA Wallet Connection Function ---
	async function handleConnectEoaWallet() {
		if (eoaWalletClient && eoaAddress) return;
		isEoaConnecting = true;
		resetMainMessages();
		try {
			eoaWalletClient = getWalletClient();
			if (eoaWalletClient) {
				const account = await getWalletAccount();
				if (account) {
					eoaAddress = account;
					mainSuccess = `EOA Wallet connected: ${eoaAddress}`;
				} else {
					mainError =
						'Could not get EOA account. Is your wallet connected and an account selected?';
					eoaWalletClient = null;
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

			mintedPkpTokenId = pkpDetails.pkpTokenId;
			mintedPkpPublicKey = pkpDetails.pkpPublicKey;
			mintedPkpEthAddress = pkpDetails.pkpEthAddress;

			if (browser) {
				try {
					localStorage.setItem('mintedPKPData', JSON.stringify(pkpDetails));
					console.log('Saved PKP details to localStorage.');
				} catch (error) {
					console.error('CRITICAL: Error saving PKP details to localStorage:', error);
				}
			}

			mainSuccess = `PKP Minted Successfully! Token ID: ${mintedPkpTokenId}`;

			// Fetch auth methods AFTER minting
			if (mintedPkpTokenId) {
				await handleFetchPermittedAuthMethods(mintedPkpTokenId);
			}
			goToStep(4);
		} catch (error: any) {
			mainError = `PKP minting error: ${error.message}`;
			console.error('PKP minting error:', error);
		} finally {
			isMintingPkp = false;
		}
	}

	// --- Session Signature Generation ---
	async function handleGetSessionSigsGnosisPasskey() {
		// Use the global Lit client from the store
		const currentLitClient = $litClientStore;

		if (!currentLitClient || !currentLitClient.ready) {
			mainError = 'Lit client not available or not ready. Check connection status.';
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

			if (!storedPasskey || !storedPasskey.signerContractAddress) {
				throw new Error('Stored passkey data or signer address missing.');
			}

			sessionSigs = await getSessionSigsWithGnosisPasskeyVerification(
				currentLitClient, // Pass the ready client instance
				pkpKeyToUse,
				challengeMessage,
				assertionResponse,
				storedPasskey,
				'ethereum'
			);

			sessionAuthMethod = 'gnosis-passkey';
			mainSuccess = 'Successfully obtained session signatures via Passkey (Gnosis)!_';
			goToStep(6);
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
		const currentLitClient = $litClientStore;

		if (!currentLitClient || !currentLitClient.ready || !sessionSigs) {
			mainError = 'Lit client must be ready and session signatures obtained first (Step 5).';
			return;
		}
		if (!messageToSign.trim()) {
			mainError = 'Please enter a message to sign with PKP.';
			return;
		}
		const pkpKeyToUseForSigning = mintedPkpPublicKey;
		if (!pkpKeyToUseForSigning) {
			mainError = 'No PKP Public Key available for signing (Step 3).';
			return;
		}

		isSigningMessage = true;
		resetMainMessages();
		signatureResult = null;

		try {
			signatureResult = await signWithPKP(
				currentLitClient, // Pass ready client
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
		const currentLitClient = $litClientStore;

		if (!currentLitClient || !currentLitClient.ready || !sessionSigs) {
			mainError = 'Lit client must be ready and session signatures obtained first (Step 5).';
			return;
		}
		isExecutingAction = true;
		resetMainMessages();
		litActionResult = null;

		try {
			litActionResult = await executeLitAction(
				currentLitClient, // Pass ready client
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

	// --- Handler to fetch and display owned Capacity Credits (NEW) ---
	async function handleFetchOwnedCapacityCredits() {
		if (!mintedPkpEthAddress) {
			mainError =
				'PKP not minted or its ETH address is not available. Cannot fetch its capacity credits.';
			return;
		}

		isLoadingCapacityCredits = true;
		resetMainMessages();
		ownedCapacityCredits = [];
		try {
			const credits = await getOwnedCapacityCredits(mintedPkpEthAddress);
			ownedCapacityCredits = credits;
			if (credits.length > 0) {
				mainSuccess = `Found ${credits.length} Capacity Credit NFT(s) for your PKP (${mintedPkpEthAddress.slice(0, 6)}...).`;
			} else {
				mainSuccess = `No Capacity Credit NFTs found for your PKP (${mintedPkpEthAddress.slice(0, 6)}...).`;
			}
		} catch (err: any) {
			mainError = err.message || 'Error fetching owned capacity credits.';
			console.error('Error in handleFetchOwnedCapacityCredits:', err);
		} finally {
			isLoadingCapacityCredits = false;
		}
	}

	// --- Profile Functions - NEW ---
	async function handleSaveProfile() {
		const currentLitClient = $litClientStore;
		if (!profileName.trim()) {
			mainError = 'Please enter a name for your profile.';
			return;
		}
		// Check for Lit client ready state
		if (!currentLitClient || !currentLitClient.ready || !sessionSigs || !mintedPkpEthAddress) {
			mainError =
				'Cannot save profile: Lit connection (ready), session signatures, and minted PKP details are required.';
			return;
		}

		resetMainMessages();
		try {
			isEncryptingProfile = true;
			console.log('Attempting to encrypt profile name...');

			const accessControlConditions = [
				{
					contractAddress: '',
					standardContractType: '',
					chain: 'ethereum',
					method: '',
					parameters: [':userAddress'],
					returnValueTest: {
						comparator: '=',
						value: mintedPkpEthAddress
					}
				}
			];

			const { encryptString } = await import('@lit-protocol/encryption');

			const { ciphertext, dataToEncryptHash } = await encryptString(
				{
					accessControlConditions,
					dataToEncrypt: profileName.trim()
				},
				currentLitClient // Pass ready client
			);

			const dataToStore = {
				ciphertext,
				dataToEncryptHash,
				accessControlConditions,
				chain: 'ethereum'
			};

			encryptedProfileDataString = JSON.stringify(dataToStore);
			localStorage.setItem(PROFILE_STORAGE_KEY, encryptedProfileDataString);
			mainSuccess = 'Profile name encrypted and saved successfully!';
			console.log('Profile encrypted and stored. Data:', dataToStore);
		} catch (error: any) {
			mainError = `Error saving profile: ${error.message}`;
			console.error('Error saving profile to localStorage:', error);
		} finally {
			isEncryptingProfile = false;
		}
	}

	// Reactive statement for decryption - NEW
	$: if (
		browser &&
		$litClientStore?.ready && // Check Lit client readiness here
		sessionSigs &&
		encryptedProfileDataString &&
		!profileName &&
		!isDecryptingProfile
	) {
		(async () => {
			const currentLitClient = $litClientStore; // Client is guaranteed ready here
			isDecryptingProfile = true;
			resetMainMessages();
			console.log('Attempting to decrypt profile name...');
			try {
				const storedEncryptedData = JSON.parse(encryptedProfileDataString!);
				if (
					!storedEncryptedData.ciphertext ||
					!storedEncryptedData.dataToEncryptHash ||
					!storedEncryptedData.accessControlConditions ||
					!storedEncryptedData.chain
				) {
					throw new Error('Stored encrypted data is missing required fields.');
				}

				const { decryptToString } = await import('@lit-protocol/encryption');

				const decryptedNameStr = await decryptToString(
					{
						accessControlConditions: storedEncryptedData.accessControlConditions,
						chain: storedEncryptedData.chain,
						ciphertext: storedEncryptedData.ciphertext,
						dataToEncryptHash: storedEncryptedData.dataToEncryptHash,
						sessionSigs: sessionSigs!
					},
					currentLitClient! // Pass ready client (non-null asserted)
				);
				profileName = decryptedNameStr;
				mainSuccess = 'Profile name decrypted and loaded.';
				console.log('Profile decrypted:', profileName);
			} catch (err: any) {
				mainError = `Failed to decrypt profile: ${err.message}. You might need to re-save it or check PKP/Lit connection.`;
				console.error('Error decrypting profile name:', err);
				localStorage.removeItem(PROFILE_STORAGE_KEY);
				encryptedProfileDataString = null;
			} finally {
				isDecryptingProfile = false;
			}
		})();
	}
	// --- END: Profile Functions ---
</script>

<!-- HTML Template - Step 0 simplified -->
<div class="min-h-screen bg-stone-50 font-sans text-slate-800">
	<!-- Header Title -->
	<header class="px-4 py-8 text-center sm:py-10">
		<h1 class="text-3xl font-bold text-slate-800 sm:text-4xl md:text-5xl">
			{#if profileName}
				{profileName}'s PKP Control Center
			{:else}
				Hominio PKP Wallet
			{/if}
		</h1>
		<p class="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
			Manage your Passkey-controlled Programmable Key Pairs on the Lit Protocol network.
		</p>
	</header>

	<!-- Sticky Tab Bar -->
	<div class="sticky top-0 z-50 bg-stone-100/80 shadow-md backdrop-blur-md">
		<nav
			class="mx-auto flex max-w-5xl items-center justify-center space-x-1 overflow-x-auto p-2 sm:space-x-1"
		>
			{#each steps as step, i}
				<button
					on:click={() => goToStep(i)}
					class="rounded-md px-2 py-2 text-xs font-medium whitespace-nowrap transition-colors duration-150 sm:px-3 sm:text-sm
                           {currentStepIndex === i
						? 'bg-slate-700 text-white shadow-sm'
						: 'text-slate-600 hover:bg-stone-200 hover:text-slate-800'}"
				>
					<span class="hidden sm:inline">{i}. </span>{step}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Main Content Area -->
	<main class="px-4 py-8">
		<div class="mx-auto max-w-3xl">
			<!-- Global Messages -->
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
					<span class="font-bold">Success:</span>
					{mainSuccess}
				</div>
			{/if}

			<!-- Step 0: Connections (Simplified) -->
			{#if currentStepIndex === 0}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 0: Connections
					</h2>
					<div class="space-y-4">
						<div>
							<h3 class="mb-2 text-lg font-medium text-slate-600">Controller EOA Wallet</h3>
							{#if isEoaConnecting}
								<p class="flex items-center text-sm text-yellow-600">
									<span class="spinner mr-2"></span>Connecting EOA Wallet...
								</p>
							{:else if eoaAddress}
								<div class="rounded-md bg-green-50 p-3 text-sm text-green-700">
									<p class="font-semibold">✅ EOA Connected:</p>
									<p class="font-mono text-xs break-all">{eoaAddress}</p>
								</div>
							{:else if mainError && mainError.toLowerCase().includes('eoa')}
								<div class="rounded-md bg-red-50 p-3 text-sm text-red-700">
									<p class="font-semibold">EOA Connection Failed:</p>
									<p>{mainError.replace('Error connecting EOA wallet: ', '')}</p>
								</div>
							{:else}
								<p class="text-sm text-stone-500">EOA Wallet not connected.</p>
								<button
									on:click={handleConnectEoaWallet}
									class="mt-2 rounded-lg bg-slate-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-700 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50"
									disabled={isEoaConnecting}
								>
									Connect EOA Wallet
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Step 1: Passkey Management (Unchanged) -->
			{#if currentStepIndex === 1}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 1: Passkey Management (User-specific)
					</h2>
					{#if !storedPasskey}
						<form on:submit|preventDefault={handleCreatePasskey} class="space-y-4">
							<p class="mb-4 text-sm text-slate-500">
								Create a passkey credential. This will be stored locally in your browser.
							</p>
							<div>
								<label for="username" class="mb-1 block text-sm font-medium text-slate-600"
									>Username for Passkey</label
								><input
									type="text"
									id="username"
									bind:value={username}
									class="block w-full rounded-lg border-stone-300 bg-stone-50 p-2 text-slate-800 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
									placeholder="e.g., my-device-passkey"
									required
								/>
							</div>
							<button
								type="submit"
								class="w-full justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50"
								disabled={generalIsLoading}
							>
								{#if generalIsLoading}<span class="spinner mr-2"></span>Processing...{:else}Create
									Passkey{/if}
							</button>
						</form>
					{:else}
						<h3 class="mb-3 text-lg font-medium">
							Passkey Created for:
							<span class="font-bold text-slate-700">{storedPasskey.username}</span>
						</h3>
						<div
							class="space-y-2 rounded-md border border-stone-200 bg-stone-50 p-4 text-xs text-slate-600"
						>
							<div class="break-all">
								<span class="font-semibold text-slate-500">Raw ID (Hex):</span>
								<code class="ml-1 rounded bg-stone-200 p-1">{storedPasskey.rawId}</code>
							</div>
							<div class="break-all">
								<span class="font-semibold text-slate-500">AuthMethod ID (for PKP):</span>
								<code class="ml-1 rounded bg-stone-200 p-1">{storedPasskey.authMethodId}</code>
							</div>
							<div class="break-all">
								<span class="font-semibold text-slate-500">Public Key X:</span>
								<code class="ml-1 rounded bg-stone-200 p-1"
									>{storedPasskey.pubkeyCoordinates.x}</code
								>
							</div>
							<div class="break-all">
								<span class="font-semibold text-slate-500">Public Key Y:</span>
								<code class="ml-1 rounded bg-stone-200 p-1"
									>{storedPasskey.pubkeyCoordinates.y}</code
								>
							</div>
							{#if storedPasskey.signerContractAddress}
								<div class="break-all">
									<span class="font-semibold text-slate-500">Deployed EIP-1271 Signer:</span><a
										href={`https://gnosisscan.io/address/${storedPasskey.signerContractAddress}`}
										target="_blank"
										rel="noopener noreferrer"
										class="ml-1 text-blue-600 hover:text-blue-500 hover:underline"
										><code class="rounded bg-stone-200 p-1"
											>{storedPasskey.signerContractAddress}</code
										></a
									>
								</div>
							{/if}
						</div>
						<div class="mt-6 flex justify-end">
							<button
								on:click={handleClearPasskey}
								class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
								>Clear Passkey Data</button
							>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Step 2: Deploy Signer (Unchanged) -->
			{#if currentStepIndex === 2}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 2: Deploy & Verify EIP-1271 Signer
					</h2>
					<p class="mb-4 text-sm text-slate-500">
						Deploy an EIP-1271 signer proxy contract for the passkey (Step 1). This allows on-chain
						verification of signatures and is <strong>required</strong> before minting a PKP (Step
						3) that uses this passkey for Lit Action authentication.
						<strong class="text-orange-600">Requires Gnosis connection & funds.</strong>
					</p>

					{#if !storedPasskey}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-center text-sm text-orange-700"
						>
							Create a Passkey (Step 1) first.
						</div>
					{:else if !storedPasskey.signerContractAddress}
						<button
							on:click={handleDeployContract}
							class="w-full justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50"
							disabled={generalIsLoading}
						>
							{#if generalIsLoading}<span class="spinner mr-2"></span>Deploying...{:else}Deploy
								EIP-1271 Signer{/if}
						</button>
						{#if deploymentTxHash && deploymentTxHash !== '0x'}
							<p class="mt-3 text-center text-xs text-slate-500">
								Tx Hash:
								<a
									href={`https://gnosisscan.io/tx/${deploymentTxHash}`}
									target="_blank"
									rel="noopener noreferrer"
									class="text-blue-600 hover:underline">{deploymentTxHash}</a
								>
							</p>
						{/if}
					{:else}
						<div
							class="mb-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700"
						>
							EIP-1271 Signer already deployed at:
							<a
								href={`https://gnosisscan.io/address/${storedPasskey.signerContractAddress}`}
								target="_blank"
								rel="noopener noreferrer"
								class="font-mono text-xs hover:underline"
								><code class="rounded bg-green-100 p-0.5"
									>{storedPasskey.signerContractAddress}</code
								></a
							>
						</div>
						<h3 class="mb-3 text-lg font-medium text-slate-600">Verify Signer Functionality</h3>
						<div class="mb-4">
							<label
								for="messageToSignEIP1271"
								class="mb-1 block text-sm font-medium text-slate-600"
								>Message to Sign & Verify</label
							>
							<input
								id="messageToSignEIP1271"
								bind:value={messageToSign}
								class="block w-full rounded-lg border-stone-300 bg-stone-50 p-2 text-slate-800 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
								placeholder="Enter a message"
							/>
						</div>
						<button
							on:click={handleSignAndVerifyEIP1271Proxy}
							class="w-full justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 focus:outline-none disabled:opacity-50"
							disabled={isLoadingProxyVerify || !storedPasskey?.signerContractAddress}
						>
							{#if isLoadingProxyVerify}<span class="spinner mr-2"></span>Verifying...{:else}Sign &
								Verify (Deployed Proxy){/if}</button
						>
						{#if proxyVerificationResult !== null}
							<div
								class="mt-4 rounded-md p-3 text-center text-sm {proxyVerificationResult.isCorrect
									? 'border border-green-300 bg-green-100 text-green-700'
									: 'border border-red-300 bg-red-100 text-red-700'}"
							>
								<p class="font-semibold">
									{proxyVerificationResult.isCorrect
										? '✅ Proxy Verification Successful!'
										: '❌ Proxy Verification Failed'}
								</p>
								{#if proxyVerificationResult.error}
									<p class="mt-1 text-xs">{proxyVerificationResult.error}</p>
								{/if}
							</div>
						{/if}
					{/if}
				</div>
			{/if}

			<!-- Step 3: Mint PKP (Unchanged) -->
			{#if currentStepIndex === 3}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 3: Mint PKP for Passkey
					</h2>

					{#if !storedPasskey}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							Please create and store a passkey first (Step 1) to enable PKP minting.
						</div>
					{:else if !storedPasskey.signerContractAddress}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							Please deploy the EIP-1271 Signer (Step 2) first to enable PKP minting.
						</div>
					{:else if !eoaAddress}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							EOA Wallet not connected. Please ensure your wallet is connected to enable PKP
							minting.
						</div>
					{:else if !mintedPkpTokenId}
						<p class="mb-4 text-sm text-slate-500">
							Mint a new PKP on the Chronicle testnet. This PKP will be configured to allow
							authentication using your passkey (via the Gnosis verification Lit Action) and will be
							transferred to its own address.
						</p>
						<button
							class="flex w-full items-center justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
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
						<div class="mt-4 rounded-lg border border-green-300 bg-green-50 p-4 text-slate-700">
							<h4 class="mb-2 font-semibold text-green-700">PKP Details (Minted / Loaded):</h4>
							<p class="mb-1 text-sm">
								Token ID:
								<code class="ml-1 rounded bg-stone-200 p-1 text-xs">{mintedPkpTokenId}</code>
							</p>
							<p class="mb-1 text-sm break-all">
								Public Key:
								<code class="ml-1 rounded bg-stone-200 p-1 text-xs">{mintedPkpPublicKey}</code>
							</p>
							<p class="text-sm break-all">
								ETH Address:
								<code class="ml-1 rounded bg-stone-200 p-1 text-xs">{mintedPkpEthAddress}</code>
							</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Step 4: View Auth Methods -->
			{#if currentStepIndex === 4}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 4: View PKP Auth Methods
					</h2>
					{#if !mintedPkpTokenId}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							Mint a PKP (Step 3) first to view its auth methods.
						</div>
					{:else}
						<p class="mb-4 text-sm text-slate-500">
							Fetch and display auth methods for PKP Token ID
							<code class="rounded bg-stone-200 p-0.5 text-xs">{mintedPkpTokenId}</code>
							from the Chronicle testnet. (Requires network connection, not Lit client).
						</p>
						<button
							on:click={() => mintedPkpTokenId && handleFetchPermittedAuthMethods(mintedPkpTokenId)}
							class="mb-4 w-full justify-center rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-600 disabled:opacity-50"
							disabled={isLoadingPermittedAuthMethods || !mintedPkpTokenId}
						>
							{#if isLoadingPermittedAuthMethods}<span class="spinner mr-2"></span>Fetching
								Methods...{:else}Fetch Permitted Auth Methods{/if}
						</button>

						{#if permittedAuthMethods.length > 0}
							<div class="mt-4 space-y-3">
								{#each permittedAuthMethods as method, i}
									<div
										class="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-slate-600"
									>
										<p class="mb-1">
											<span class="font-semibold text-slate-500">Method {i + 1}</span>
										</p>
										<p>
											<span class="font-semibold text-slate-500">Type:</span>
											{method.authMethodType.toString()}
											{#if method.authMethodType === 2n}
												<span class="ml-1 text-cyan-600">(Lit Action)</span>
											{:else}
												<span class="ml-1 text-stone-500">(WebAuthn/Passkey)</span>
											{/if}
										</p>
										<p class="break-all">
											<span class="font-semibold text-slate-500">ID (Hex):</span>
											<code class="ml-1 rounded bg-stone-200 p-0.5">{method.id}</code>
										</p>
										<p class="break-all">
											<span class="font-semibold text-slate-500">User Pubkey (Hex):</span>
											<code class="ml-1 rounded bg-stone-200 p-0.5">{method.userPubkey}</code>
										</p>
									</div>
								{/each}
							</div>
						{:else if !isLoadingPermittedAuthMethods && (mainSuccess.includes('No permitted auth methods') || mainSuccess.includes('permitted auth method(s)'))}
							<p class="mt-3 text-center text-sm text-slate-400">
								No methods found or fetch completed.
							</p>
						{/if}
					{/if}
				</div>
			{/if}

			<!-- Step 5: Generate Session Signatures for PKP -->
			{#if currentStepIndex === 5}
				{#if $litClientStore?.ready && mintedPkpTokenId}
					<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							Step 5: Generate Session Signatures for PKP
						</h2>
						<p class="mb-4 text-sm text-slate-500">
							Use your passkey (authenticated via the Gnosis verification Lit Action) to obtain
							temporary session keys to use the PKP (<code
								class="rounded bg-stone-200 p-0.5 text-xs">{mintedPkpTokenId}</code
							>).
						</p>

						<div class="space-y-4">
							<!-- Method: Gnosis Verified Passkey -->
							<div class="rounded-lg border border-stone-200 p-4">
								<h3 class="mb-2 font-medium text-slate-600">
									Authenticate with Passkey (Gnosis On-Chain Verification)
								</h3>
								{#if storedPasskey?.rawId && storedPasskey?.pubkeyCoordinates && storedPasskey?.signerContractAddress}
									<p class="mb-3 text-xs text-slate-500">
										Uses a Lit Action to verify your passkey signature directly against your
										deployed EIP-1271 Gnosis Chain contract (Step 2).
									</p>
									<button
										on:click={handleGetSessionSigsGnosisPasskey}
										class="w-full justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
										disabled={isLoadingSessionSigsGnosisPasskey ||
											(!!sessionSigs && sessionAuthMethod !== 'gnosis-passkey') ||
											!mintedPkpPublicKey}
									>
										{#if isLoadingSessionSigsGnosisPasskey}<span class="spinner mr-2"
											></span>Generating Sigs...{:else if sessionSigs && sessionAuthMethod === 'gnosis-passkey'}✅
											Sigs Obtained{:else}Get Session Sigs (Gnosis Passkey){/if}
									</button>
								{:else}
									<p
										class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-600"
									>
										{#if !storedPasskey?.rawId || !storedPasskey?.pubkeyCoordinates}
											Create a passkey (Step 1) first.
										{:else if !storedPasskey?.signerContractAddress}
											Deploy EIP-1271 Signer (Step 2) first.
										{/if}
									</p>
								{/if}
							</div>
						</div>

						{#if sessionSigs}
							<div class="mt-6 rounded-lg border border-stone-200 bg-stone-100 p-4">
								<h3 class="mb-2 font-semibold text-slate-700">
									Active Session Signatures (Authenticated via: {sessionAuthMethod?.toUpperCase()})
								</h3>
								<pre
									class="overflow-x-auto rounded-md bg-white p-3 text-xs whitespace-pre-wrap shadow-sm">{JSON.stringify(
										sessionSigs,
										null,
										2
									)}</pre>
							</div>
						{/if}
					</div>
				{:else}
					<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							Step 5: Generate Session Signatures
						</h2>
						<p
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							{#if !sessionSigs}Please generate session signatures (Step 5) first.{/if}
							{#if sessionSigs && !$litClientStore?.ready}Lit client is not ready. Please ensure
								it's connected (check header).{/if}
						</p>
					</div>
				{/if}
			{/if}

			<!-- Step 6: PKP Operations -->
			{#if currentStepIndex === 6}
				{#if sessionSigs && $litClientStore?.ready}
					<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							Step 6: PKP Operations (Requires Session Sigs)
						</h2>
						<p class="mb-4 text-xs text-slate-500">
							Current session authenticated via:
							<span class="font-medium text-slate-700"
								>{sessionAuthMethod?.toUpperCase() ?? 'N/A'}</span
							>
						</p>

						<!-- Sign Message with PKP -->
						<div class="mb-6 rounded-lg border border-stone-200 p-4">
							<h3 class="mb-3 text-lg font-medium text-slate-600">6A. Sign Message with PKP</h3>
							<div class="mb-4">
								<label for="messageToSignPkp" class="mb-1 block text-sm font-medium text-slate-600"
									>Message to Sign</label
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

						<!-- Execute Lit Action -->
						<div class="rounded-lg border border-stone-200 p-4">
							<h3 class="mb-3 text-lg font-medium text-slate-600">6B. Execute Inline Lit Action</h3>
							<p class="mb-3 text-xs text-slate-500">
								This action checks if a number is >= 42. Code is defined below.
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
								disabled={isExecutingAction}
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
									{#if litActionResult.logs}
										<div>
											<p class="font-medium text-slate-500">Logs:</p>
											<pre
												class="block rounded bg-white p-2 break-all whitespace-pre-wrap text-slate-700 shadow-sm">{litActionResult.logs}</pre>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							Step 6: PKP Operations
						</h2>
						<p
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							{#if !sessionSigs}Please generate session signatures (Step 5) first.{/if}
							{#if sessionSigs && !$litClientStore?.ready}Lit client is not ready. Please ensure
								it's connected (check header).{/if}
						</p>
					</div>
				{/if}
			{/if}

			<!-- Step 7: Profile Management -->
			{#if currentStepIndex === 7}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 7: Your Profile
					</h2>
					<p class="mb-4 text-sm text-slate-500">
						Set your profile name. This will be encrypted using Lit Protocol and stored locally.
					</p>
					<div class="space-y-4">
						<div>
							<label for="profileNameInput" class="mb-1 block text-sm font-medium text-slate-600"
								>Profile Name</label
							>
							<input
								type="text"
								id="profileNameInput"
								bind:value={profileName}
								class="block w-full rounded-lg border-stone-300 bg-stone-50 p-2 text-slate-800 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
								placeholder={isDecryptingProfile ? 'Decrypting...' : 'Enter your preferred name'}
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
							{#if isEncryptingProfile}
								<span class="spinner mr-2"></span>Encrypting & Saving...
							{:else if isDecryptingProfile}
								<span class="spinner mr-2"></span>Decrypting...
							{:else}
								Save Encrypted Profile
							{/if}
						</button>
						{#if !sessionSigs || !mintedPkpEthAddress || !$litClientStore?.ready}
							<p class="mt-2 text-xs text-orange-600">
								Note: Requires Lit Connection (Ready), Session Sigs (Step 5), and minted PKP (Step
								3).
							</p>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Step 8: My Capacity Credits (Unchanged) -->
			{#if currentStepIndex === 8}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 8: PKP Capacity Credits (for PKP: {mintedPkpEthAddress
							? mintedPkpEthAddress.slice(0, 6) + '...' + mintedPkpEthAddress.slice(-4)
							: 'N/A'})
					</h2>
					<p class="mb-4 text-sm text-slate-500">
						View Capacity Credit NFTs owned by your minted PKP on the Chronicle testnet.
					</p>

					{#if !mintedPkpEthAddress}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							Please mint a PKP (Step 3) first to view its capacity credits.
						</div>
					{:else}
						<button
							on:click={handleFetchOwnedCapacityCredits}
							class="mb-6 w-full justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
							disabled={isLoadingCapacityCredits || !mintedPkpEthAddress}
						>
							{#if isLoadingCapacityCredits}<span class="spinner mr-2"></span>Fetching PKP Capacity
								Credits...{:else}Refresh PKP Capacity Credits{/if}
						</button>

						{#if isLoadingCapacityCredits}
							<p class="text-center text-sm text-slate-500">Loading your PKP's NFTs...</p>
						{:else if ownedCapacityCredits.length > 0}
							<div class="space-y-4">
								<h3 class="text-lg font-medium text-slate-600">Your PKP's Capacity Credit NFTs:</h3>
								{#each ownedCapacityCredits as credit (credit.tokenId)}
									<div class="rounded-lg border border-stone-200 bg-stone-50 p-4">
										<p class="font-semibold text-slate-700">
											Token ID: <code class="rounded bg-stone-200 px-1 py-0.5 font-mono text-sm"
												>{credit.tokenId}</code
											>
										</p>
										<p class="text-xs text-slate-500">
											Requests/Kilosecond: <span class="font-medium text-slate-600"
												>{credit.requestsPerKilosecond.toString()}</span
											>
										</p>
										<p class="text-xs text-slate-500">
											Expires At (UTC Timestamp): <span class="font-medium text-slate-600"
												>{credit.expiresAt.toString()}</span
											>
											<span class="ml-2 text-stone-400"
												>({new Date(Number(credit.expiresAt) * 1000).toLocaleString()})</span
											>
										</p>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-center text-sm text-slate-500">
								This PKP does not own any Capacity Credit NFTs.
							</p>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</main>
</div>

<style>
	/* Styles remain unchanged */
	.spinner {
		/* ... */
	}
	@keyframes spin {
		/* ... */
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
