<script lang="ts">
	import { onMount, getContext, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import {
		createAndStorePasskeyData,
		getStoredPasskeyData,
		clearStoredPasskeyData,
		deployPasskeySignerContract,
		verifySignatureWithProxy,
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
	import type { SessionSigs, ExecuteJsResponse, AuthCallbackParams } from '@lit-protocol/types';
	import { LitPKPResource, LitActionResource } from '@lit-protocol/auth-helpers';
	import type { Hex, Address, WalletClient } from 'viem';
	import { keccak256, hexToBytes } from 'viem';
	import type { Writable } from 'svelte/store';
	import { o as baseHominioFacade } from '$lib/KERNEL/hominio-svelte';

	type BaseHominioFacadeType = typeof baseHominioFacade;

	interface HominioFacadeWithAllWallets extends BaseHominioFacadeType {
		lit: Writable<LitNodeClient | null>;
		guardianEoaClientStore: Writable<WalletClient | null>;
		guardianEoaAddressStore: Writable<Address | null>;
		guardianEoaChainIdStore: Writable<number | null>;
		guardianEoaErrorStore: Writable<string | null>;
	}
	const o = getContext<HominioFacadeWithAllWallets>('o');

	const litClientStore = o.lit;
	const {
		guardianEoaClientStore,
		guardianEoaAddressStore,
		guardianEoaChainIdStore,
		guardianEoaErrorStore
	} = o;

	let currentStepIndex = 0;
	const steps = [
		'Passkey',
		'Deploy Signer',
		'Mint PKP',
		'Auth Methods',
		'Authenticate PKP (Passkey)',
		'PKP Operations',
		'Profile',
		'My Capacity Credits'
	];

	function goToStep(index: number) {
		currentStepIndex = index;
		resetMainMessages();
	}

	let username = '';
	let storedPasskey: StoredPasskeyData | null = null;
	let deploymentTxHash = '';
	let deployedSignerAddress: Address | null = null;
	let proxyVerificationResult: { isCorrect: boolean; error?: string } | null = null;
	let isLoadingProxyVerify = false;

	let mintedPkpTokenId: string | null = null;
	let mintedPkpPublicKey: Hex | null = null;
	let mintedPkpEthAddress: Address | null = null;
	let isMintingPkp = false;

	let sessionSigs: SessionSigs | null = null;
	let sessionAuthMethod: 'gnosis-passkey' | 'resumed-from-cache' | null = null;
	let isLoadingSessionSigsGnosisPasskey = false;
	let isLoadingPkpSessionResume = false;

	let messageToSign = 'Hello from Lit PKP!';
	let signatureResult: { signature: Hex; dataSigned: Hex } | null = null;
	let isSigningMessage = false;

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

	let permittedAuthMethods: Array<{ authMethodType: bigint; id: Hex; userPubkey: Hex }> = [];
	let isLoadingPermittedAuthMethods = false;

	type OwnedCapacityCredit = {
		tokenId: string;
		requestsPerKilosecond: bigint;
		expiresAt: bigint;
	};
	let ownedCapacityCredits: Array<OwnedCapacityCredit> = [];
	let isLoadingCapacityCredits = false;

	let generalIsLoading = false;
	let mainError = '';
	let mainSuccess = '';

	let profileName = '';
	const PROFILE_STORAGE_KEY = 'hominio_profile_data_encrypted';
	let encryptedProfileDataString: string | null = null;
	let isEncryptingProfile = false;
	let isDecryptingProfile = false;

	let unsubscribeLitClient: () => void = () => {};

	onMount(async () => {
		if (browser) {
			storedPasskey = getStoredPasskeyData();
			if (storedPasskey?.signerContractAddress) {
				deployedSignerAddress = storedPasskey.signerContractAddress as Address;
			}

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

			encryptedProfileDataString = localStorage.getItem(PROFILE_STORAGE_KEY);
			if (encryptedProfileDataString) {
				console.log('Found encrypted profile data in localStorage.');
			} else {
				console.log('No encrypted profile data found in localStorage.');
			}

			unsubscribeLitClient = litClientStore.subscribe(async (client) => {
				if (client && client.ready && browser) {
					console.log('Lit client is ready. Checking for PKP session resumption...');
					if (
						mintedPkpPublicKey &&
						!sessionSigs &&
						!isLoadingPkpSessionResume &&
						!generalIsLoading &&
						!isLoadingSessionSigsGnosisPasskey
					) {
						await tryResumePkpSession(client, mintedPkpPublicKey);
					}
					if (
						mintedPkpTokenId &&
						permittedAuthMethods.length === 0 &&
						!isLoadingPermittedAuthMethods
					) {
						await handleFetchPermittedAuthMethods(mintedPkpTokenId);
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
		if (sessionSigs) {
			console.log(
				'PKP session already active in this component instance (tryResumePkpSession check).'
			);
			if (currentStepIndex < 4) {
				goToStep(5);
			}
			return;
		}

		isLoadingPkpSessionResume = true;
		resetMainMessages();
		const initialMessage = 'Attempting to resume PKP session from device storage...';
		mainSuccess = initialMessage;

		try {
			console.log(
				`Attempting litNodeClient.getSessionSigs for PKP: ${pkpKeyToResume} for session resumption...`
			);

			const resumedSessionSigs = await currentLitClient.getSessionSigs({
				pkpPublicKey: pkpKeyToResume,
				chain: 'ethereum',
				resourceAbilityRequests: [
					{ resource: new LitPKPResource('*'), ability: 'pkp-signing' as const },
					{ resource: new LitActionResource('*'), ability: 'lit-action-execution' as const }
				],
				authNeededCallback: async (params: AuthCallbackParams) => {
					console.warn(
						'authNeededCallback triggered during PKP session resumption. Cached AuthSig insufficient, expired, or not found for the PKP.',
						params
					);
					throw new Error('Authentication required; cached Lit session not viable for this PKP.');
				}
			});

			sessionSigs = resumedSessionSigs;
			sessionAuthMethod = 'resumed-from-cache';
			mainSuccess = 'PKP session resumed successfully from device storage!';
			console.log('PKP Session Resumed from Lit SDK cache:', sessionSigs);
			if (currentStepIndex < 4) {
				goToStep(5);
			}
		} catch (error: any) {
			console.warn('Failed to resume PKP session automatically:', error.message);
			if (error.message && error.message.includes('Authentication required')) {
				mainSuccess =
					'No active PKP session found in device storage. Please authenticate (Step 4).';
			} else {
				if (!mainSuccess.includes('No active PKP session found')) {
					mainSuccess = 'Could not resume PKP session. Ready to authenticate (Step 4).';
					// mainError = `Error resuming PKP session: ${error.message || 'Unknown error'}`; // Optionally set error
				}
			}
			sessionSigs = null;
			sessionAuthMethod = null;
		} finally {
			isLoadingPkpSessionResume = false;
			if (mainSuccess === initialMessage && !sessionSigs) {
				mainSuccess = '';
			}
		}
	}

	function resetMainMessages() {
		mainError = '';
		mainSuccess = '';
		// generalIsLoading = false; // generalIsLoading is usually set by specific handlers
	}

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
				goToStep(1);
			} else {
				mainError = 'Failed to create and store passkey.';
			}
		} catch (error: unknown) {
			mainError =
				error instanceof Error
					? error.message
					: 'An unknown error occurred during passkey creation.';
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
			localStorage.removeItem(PROFILE_STORAGE_KEY);
			encryptedProfileDataString = null;
			profileName = '';
			// Also clear Lit's own storage for a full reset demonstration if desired
			// localStorage.removeItem('lit-session-key');
			// localStorage.removeItem('lit-wallet-sig');
			// console.log("Cleared lit-session-key and lit-wallet-sig for full reset test.");
		}
		mainSuccess = 'Passkey and associated PKP data cleared.';
		goToStep(0);
	}

	async function handleDeployContract() {
		const currentEoaClient = $guardianEoaClientStore;
		const currentEoaAddress = $guardianEoaAddressStore;

		if (!currentEoaClient || !currentEoaAddress) {
			mainError = 'Cannot deploy: EOA Wallet not connected. Please connect via Status Bar.';
			return;
		}

		generalIsLoading = true;
		resetMainMessages();
		deploymentTxHash = '';
		proxyVerificationResult = null;

		try {
			const result = await deployPasskeySignerContract(currentEoaClient, currentEoaAddress);
			if (result) {
				deploymentTxHash = result.txHash;
				if (result.signerAddress) {
					deployedSignerAddress = result.signerAddress;
					mainSuccess = `Signer contract deployment transaction sent: ${result.txHash}. Address: ${result.signerAddress}`;
					goToStep(2);
				} else {
					mainSuccess = `Deployment transaction sent (${result.txHash}), but couldn't extract address from logs. Check Gnosisscan.`;
				}
				storedPasskey = getStoredPasskeyData(); // Re-fetch in case signerAddress was added
			} else {
				mainError = 'Deployment failed. Check console and wallet connection.';
			}
		} catch (error: unknown) {
			mainError =
				error instanceof Error ? error.message : 'An unknown error occurred during deployment.';
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
			mainError = 'EIP-1271 Signer contract must be deployed first (Step 1).';
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
		} catch (error: unknown) {
			mainError =
				error instanceof Error
					? `Error during EIP-1271 proxy signature verification: ${error.message}`
					: 'Unknown error during EIP-1271 proxy verification.';
			console.error(error);
		} finally {
			isLoadingProxyVerify = false;
		}
	}

	async function handleMintPkp() {
		const currentEoaClient = $guardianEoaClientStore;
		const currentEoaAddress = $guardianEoaAddressStore;

		if (!storedPasskey?.authMethodId) {
			mainError = 'Cannot mint: Passkey not created or authMethodId missing (Step 0).';
			return;
		}
		if (!storedPasskey?.signerContractAddress) {
			mainError = 'Cannot mint: EIP-1271 Signer contract must be deployed first (Step 1).';
			return;
		}
		if (!currentEoaClient || !currentEoaAddress) {
			mainError = 'Cannot mint: EOA Wallet not connected. Please connect via Status Bar.';
			return;
		}

		isMintingPkp = true;
		resetMainMessages();

		try {
			const pkpDetails = await mintPKPWithPasskeyAndAction(
				currentEoaClient,
				currentEoaAddress,
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

			if (mintedPkpTokenId) {
				await handleFetchPermittedAuthMethods(mintedPkpTokenId);
			}
			goToStep(3);
		} catch (error: unknown) {
			mainError =
				error instanceof Error
					? `PKP minting error: ${error.message}`
					: 'Unknown PKP minting error.';
			console.error('PKP minting error:', error);
		} finally {
			isMintingPkp = false;
		}
	}

	async function handleGetSessionSigsGnosisPasskey() {
		const currentLitClient = $litClientStore;

		if (!currentLitClient || !currentLitClient.ready) {
			mainError = 'Lit client not available or not ready. Check connection status.';
			return;
		}
		if (!storedPasskey?.rawId || !storedPasskey.pubkeyCoordinates) {
			mainError = 'Stored passkey with rawId and coordinates is required (Step 0).';
			return;
		}
		if (!storedPasskey?.signerContractAddress) {
			mainError =
				'EIP-1271 Signer contract must be deployed first (Step 1) to authenticate PKP session.';
			return;
		}

		const pkpKeyToUse = mintedPkpPublicKey;
		if (!pkpKeyToUse) {
			mainError = 'No PKP Public Key available. Mint a PKP first (Step 2).';
			return;
		}

		isLoadingSessionSigsGnosisPasskey = true;
		generalIsLoading = true;
		resetMainMessages();
		sessionSigs = null;
		sessionAuthMethod = null;

		try {
			const challengeMessage = 'Authenticate to use Hominio PKP with Passkey';
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
				throw new Error('Stored passkey data or signer address missing for authentication.');
			}

			sessionSigs = await getSessionSigsWithGnosisPasskeyVerification(
				currentLitClient!,
				pkpKeyToUse,
				challengeMessage,
				assertionResponse,
				storedPasskey,
				'ethereum'
			);

			sessionAuthMethod = 'gnosis-passkey';
			mainSuccess =
				'Successfully authenticated PKP session via Passkey (Gnosis)! Session Sigs obtained.';
			goToStep(5);
		} catch (err: unknown) {
			mainError =
				err instanceof Error
					? `PKP Authentication Failed: ${err.message}`
					: 'Unknown error during PKP authentication via Gnosis Passkey.';
			sessionSigs = null;
			sessionAuthMethod = null;
			console.error('Error in handleGetSessionSigsGnosisPasskey (Authenticate PKP):', err);
		} finally {
			isLoadingSessionSigsGnosisPasskey = false;
			generalIsLoading = false;
		}
	}

	async function handleSignMessageWithPkp() {
		const currentLitClient = $litClientStore;

		if (!currentLitClient || !currentLitClient.ready || !sessionSigs) {
			mainError = 'Lit client must be ready and PKP session authenticated first (Step 4).';
			return;
		}
		if (!messageToSign.trim()) {
			mainError = 'Please enter a message to sign with PKP.';
			return;
		}
		const pkpKeyToUseForSigning = mintedPkpPublicKey;
		if (!pkpKeyToUseForSigning) {
			mainError = 'No PKP Public Key available for signing (Step 2).';
			return;
		}

		isSigningMessage = true;
		resetMainMessages();
		signatureResult = null;

		try {
			signatureResult = await signWithPKP(
				currentLitClient!,
				sessionSigs!,
				pkpKeyToUseForSigning,
				messageToSign
			);
			mainSuccess = 'Message signed successfully with PKP!';
		} catch (err: unknown) {
			mainError = err instanceof Error ? err.message : 'Unknown error signing message with PKP';
			signatureResult = null;
		} finally {
			isSigningMessage = false;
		}
	}

	async function handleExecuteLitAction() {
		const currentLitClient = $litClientStore;

		if (!currentLitClient || !currentLitClient.ready || !sessionSigs) {
			mainError = 'Lit client must be ready and PKP session authenticated first (Step 4).';
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
				{
					magicNumber: magicNumber
				}
			);
			mainSuccess = 'Lit Action executed successfully!';
			console.log('Full Lit Action Result:', litActionResult);
		} catch (err: unknown) {
			mainError = err instanceof Error ? err.message : 'Unknown error executing Lit Action';
			litActionResult = null;
		} finally {
			isExecutingAction = false;
		}
	}

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
		} catch (err: unknown) {
			mainError = err instanceof Error ? err.message : 'Error fetching permitted auth methods.';
			console.error('Error in handleFetchPermittedAuthMethods:', err);
		} finally {
			isLoadingPermittedAuthMethods = false;
		}
	}

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
		} catch (err: unknown) {
			mainError = err instanceof Error ? err.message : 'Error fetching owned capacity credits.';
			console.error('Error in handleFetchOwnedCapacityCredits:', err);
		} finally {
			isLoadingCapacityCredits = false;
		}
	}

	async function handleSaveProfile() {
		const currentLitClient = $litClientStore;
		if (!profileName.trim()) {
			mainError = 'Please enter a name for your profile.';
			return;
		}
		if (!currentLitClient || !currentLitClient.ready || !sessionSigs || !mintedPkpEthAddress) {
			mainError =
				'Cannot save profile: Lit connection (ready), PKP session authenticated (Step 4), and minted PKP details (Step 2) are required.';
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
			mainSuccess = 'Profile name encrypted and saved successfully!';
			console.log('Profile encrypted and stored. Data:', dataToStore);
		} catch (error: unknown) {
			mainError =
				error instanceof Error
					? `Error saving profile: ${error.message}`
					: 'Unknown error saving profile.';
			console.error('Error saving profile to localStorage:', error);
		} finally {
			isEncryptingProfile = false;
		}
	}

	$: if (
		browser &&
		$litClientStore?.ready &&
		sessionSigs &&
		encryptedProfileDataString &&
		!profileName &&
		!isDecryptingProfile &&
		!isEncryptingProfile
	) {
		(async () => {
			const currentLitClient = $litClientStore;
			isDecryptingProfile = true;
			resetMainMessages();
			console.log('Attempting to decrypt profile name with active sessionSigs...');
			try {
				const storedEncryptedData = JSON.parse(encryptedProfileDataString!);
				if (
					!storedEncryptedData.ciphertext ||
					!storedEncryptedData.dataToEncryptHash ||
					!storedEncryptedData.accessControlConditions ||
					!storedEncryptedData.chain
				) {
					throw new Error('Stored encrypted data is missing required fields for decryption.');
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
					currentLitClient!
				);
				profileName = decryptedNameStr;
				mainSuccess = 'Profile name decrypted and loaded.';
				console.log('Profile decrypted:', profileName);
			} catch (err: unknown) {
				mainError =
					err instanceof Error
						? `Failed to decrypt profile: ${err.message}`
						: 'Failed to decrypt profile: Unknown error.';
				console.error('Error decrypting profile name:', err);
				// Do not clear localStorage on decryption failure if sessionSigs might have been the issue.
				// Let user re-authenticate if needed.
				// localStorage.removeItem(PROFILE_STORAGE_KEY);
				// encryptedProfileDataString = null;
			} finally {
				isDecryptingProfile = false;
			}
		})();
	}
</script>

<div class="min-h-screen bg-stone-50 font-sans text-slate-800">
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

	<main class="px-4 py-8">
		<div class="mx-auto max-w-3xl">
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

			{#if currentStepIndex === 0}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 0: Passkey Management (User-specific)
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

			{#if currentStepIndex === 1}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 1: Deploy & Verify EIP-1271 Signer
					</h2>
					<p class="mb-4 text-sm text-slate-500">
						Deploy an EIP-1271 signer proxy contract for the passkey (Step 0). This allows on-chain
						verification of signatures and is <strong>required</strong> before minting a PKP (Step
						2) that uses this passkey for Lit Action authentication.
						<strong class="text-orange-600">Requires Gnosis connection & funds.</strong>
					</p>

					{#if !storedPasskey}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-center text-sm text-orange-700"
						>
							Create a Passkey (Step 0) first.
						</div>
					{:else if !storedPasskey.signerContractAddress}
						{#if !$guardianEoaAddressStore}
							<div
								class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-center text-sm text-orange-700"
							>
								Connect EOA Wallet (via Status Bar) first.
							</div>
						{:else}
							<button
								on:click={handleDeployContract}
								class="w-full justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50"
								disabled={generalIsLoading || !$guardianEoaAddressStore}
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

			{#if currentStepIndex === 2}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 2: Mint PKP for Passkey
					</h2>

					{#if !storedPasskey}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							Please create and store a passkey first (Step 0) to enable PKP minting.
						</div>
					{:else if !storedPasskey.signerContractAddress}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							Please deploy the EIP-1271 Signer (Step 1) first to enable PKP minting.
						</div>
					{:else if !$guardianEoaAddressStore}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							EOA Wallet not connected. Please connect via Status Bar to enable PKP minting.
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
								!$guardianEoaAddressStore ||
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

			{#if currentStepIndex === 3}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 3: View PKP Auth Methods
					</h2>
					{#if !mintedPkpTokenId}
						<div
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							Mint a PKP (Step 2) first to view its auth methods.
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

			{#if currentStepIndex === 4}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 4: Authenticate PKP Session via Passkey
					</h2>
					<p class="mb-4 text-sm text-slate-500">
						Authenticate with your hardware passkey to create a session for using your PKP (<code
							class="rounded bg-stone-200 p-0.5 text-xs">{mintedPkpTokenId || 'N/A'}</code
						>). This session allows you to perform operations like signing and Lit Action execution.
						The Lit Action used for this authentication verifies your passkey against the Gnosis
						Chain.
					</p>

					<div class="space-y-4">
						<div class="rounded-lg border border-stone-200 p-4">
							<h3 class="mb-2 font-medium text-slate-600">
								Authenticate with Passkey (Gnosis On-Chain Verification)
							</h3>
							{#if storedPasskey?.rawId && storedPasskey?.pubkeyCoordinates && storedPasskey?.signerContractAddress && mintedPkpPublicKey}
								<p class="mb-3 text-xs text-slate-500">
									This will prompt for your passkey. The Lit Action verifies this against your
									deployed EIP-1271 Gnosis Chain contract (Step 1).
								</p>
								<button
									on:click={handleGetSessionSigsGnosisPasskey}
									class="w-full justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
									disabled={isLoadingSessionSigsGnosisPasskey ||
										isLoadingPkpSessionResume ||
										!mintedPkpPublicKey}
								>
									{#if isLoadingSessionSigsGnosisPasskey}
										<span class="spinner mr-2"></span>Authenticating...
									{:else if isLoadingPkpSessionResume}
										<span class="spinner mr-2"></span>Checking device session...
									{:else if sessionSigs && (sessionAuthMethod === 'gnosis-passkey' || sessionAuthMethod === 'resumed-from-cache')}
										✅ Authenticated (Session Active)
									{:else}
										Authenticate PKP with Passkey
									{/if}
								</button>
							{:else}
								<p
									class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-600"
								>
									{#if !storedPasskey?.rawId || !storedPasskey?.pubkeyCoordinates}
										Create a passkey (Step 0) first.
									{:else if !mintedPkpPublicKey}
										Mint a PKP (Step 2) first.
									{:else if !storedPasskey?.signerContractAddress}
										Deploy EIP-1271 Signer (Step 1) first.
									{/if}
								</p>
							{/if}
						</div>
					</div>

					{#if sessionSigs && (sessionAuthMethod === 'gnosis-passkey' || sessionAuthMethod === 'resumed-from-cache')}
						<div class="mt-6 rounded-lg border border-stone-200 bg-stone-100 p-4">
							<h3 class="mb-2 font-semibold text-slate-700">
								Active PKP Session (Authenticated via: {sessionAuthMethod === 'resumed-from-cache'
									? 'DEVICE CACHE'
									: sessionAuthMethod?.toUpperCase()})
							</h3>
							<p class="mb-2 text-xs text-slate-500">
								Session Signatures below are active for this browser session. Operations in the next
								steps will use these.
							</p>
							<pre
								class="overflow-x-auto rounded-md bg-white p-3 text-xs whitespace-pre-wrap shadow-sm">{JSON.stringify(
									sessionSigs,
									null,
									2
								)}</pre>
						</div>
					{/if}
				</div>
			{/if}

			{#if currentStepIndex === 5}
				{#if sessionSigs && $litClientStore?.ready}
					<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							Step 5: PKP Operations (Requires Authenticated Session)
						</h2>
						<p class="mb-4 text-xs text-slate-500">
							Current session authenticated via:
							<span class="font-medium text-slate-700"
								>{sessionAuthMethod === 'resumed-from-cache'
									? 'DEVICE CACHE'
									: (sessionAuthMethod?.toUpperCase() ?? 'N/A')}</span
							>
						</p>

						<div class="mb-6 rounded-lg border border-stone-200 p-4">
							<h3 class="mb-3 text-lg font-medium text-slate-600">5A. Sign Message with PKP</h3>
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

						<div class="rounded-lg border border-stone-200 p-4">
							<h3 class="mb-3 text-lg font-medium text-slate-600">5B. Execute Inline Lit Action</h3>
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
							Step 5: PKP Operations
						</h2>
						<p
							class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
						>
							{#if !$litClientStore?.ready}Lit client is not ready. Please ensure it's connected
								(check Status Bar).{:else if !sessionSigs}Please authenticate PKP session (Step 4)
								first.{/if}
						</p>
					</div>
				{/if}
			{/if}

			{#if currentStepIndex === 6}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 6: Your Profile
					</h2>
					<p class="mb-4 text-sm text-slate-500">
						Set your profile name. This will be encrypted using Lit Protocol and stored locally.
						Requires an authenticated PKP session.
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
								Note: Requires Lit Connection (Ready), Authenticated PKP Session (Step 4), and
								minted PKP (Step 2).
							</p>
						{/if}
					</div>
				</div>
			{/if}

			{#if currentStepIndex === 7}
				<div class="mb-8 rounded-xl bg-white p-6 shadow-lg md:p-8">
					<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
						Step 7: PKP Capacity Credits (for PKP: {mintedPkpEthAddress
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
							Please mint a PKP (Step 2) first to view its capacity credits.
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
