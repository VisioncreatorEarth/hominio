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
		getSessionSigsWithGnosisPasskeyVerification,
		getPermittedAuthMethodsForPkp,
		gnosisPasskeyVerifyActionCode,
		mintPKPWithPasskeyAndAction,
		getOwnedCapacityCredits
	} from '$lib/wallet/lit';
	import type { LitNodeClient } from '@lit-protocol/lit-node-client';
	import type { SessionSigs, AuthCallbackParams } from '@lit-protocol/types';
	import { LitPKPResource, LitActionResource } from '@lit-protocol/auth-helpers';
	import type { Hex, Address, WalletClient } from 'viem';
	import { keccak256, hexToBytes } from 'viem';
	import type { Writable } from 'svelte/store';
	import { o as baseHominioFacade } from '$lib/KERNEL/hominio-svelte';
	import { pageMetadataStore } from '$lib/stores/layoutStore';
	import type { PageData } from './$types';
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte';

	// Use $props() for runes mode
	let { data } = $props<{ data: PageData }>();

	// Use $effect to update the store when data changes
	$effect(() => {
		if (data.title && data.description) {
			$pageMetadataStore = { title: data.title, description: data.description };
		}
	});

	const o = getContext<HominioFacade>('o');

	const litClientStore = o.lit.client;
	const {
		client: guardianEoaClientStore,
		address: guardianEoaAddressStore,
		chainId: guardianEoaChainIdStore,
		error: guardianEoaErrorStore
	} = o.guardian;

	let username = $state('');
	let storedPasskey = $state<StoredPasskeyData | null>(null);
	let deploymentTxHash = $state('');
	let deployedSignerAddress = $state<Address | null>(null);
	let proxyVerificationResult = $state<{ isCorrect: boolean; error?: string } | null>(null);
	let isLoadingProxyVerify = $state(false);

	let mintedPkpTokenId = $state<string | null>(null);
	let mintedPkpPublicKey = $state<Hex | null>(null);
	let mintedPkpEthAddress = $state<Address | null>(null);
	let isMintingPkp = $state(false);

	let sessionSigs = $state<SessionSigs | null>(null);
	let sessionAuthMethod = $state<'gnosis-passkey' | 'resumed-from-cache' | null>(null);
	let isLoadingSessionSigsGnosisPasskey = $state(false);
	let isLoadingPkpSessionResume = $state(false);

	let permittedAuthMethods = $state<Array<{ authMethodType: bigint; id: Hex; userPubkey: Hex }>>(
		[]
	);
	let isLoadingPermittedAuthMethods = $state(false);

	type OwnedCapacityCredit = {
		tokenId: string;
		requestsPerKilosecond: bigint;
		expiresAt: bigint;
	};
	let ownedCapacityCredits = $state<Array<OwnedCapacityCredit>>([]);
	let isLoadingCapacityCredits = $state(false);

	let generalIsLoading = $state(false);
	let mainError = $state('');
	let mainSuccess = $state('');

	let hasAttemptedInitialSessionResumption = $state(false);

	// let unsubscribeLitClient: () => void = () => {}; // Will be handled by $effect return

	const settingsSections = [
		{ id: 'passkey', title: 'Passkey Management' },
		{ id: 'signer', title: 'EIP-1271 Signer' },
		{ id: 'mint_pkp', title: 'Mint PKP' },
		{ id: 'auth_methods', title: 'PKP Auth Methods' },
		{ id: 'session_status', title: 'PKP Session Status' },
		{ id: 'capacity_credits', title: 'Capacity Credits' }
	];
	let selectedSettingsSectionId = $state(settingsSections[0].id);

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
			// Subscription logic moved to $effect below
		}
	});

	// onDestroy(() => { // Handled by $effect return
	// 	if (unsubscribeLitClient) {
	// 		unsubscribeLitClient();
	// 	}
	// });

	$effect(() => {
		// Reset the attempt flag if the PKP key context changes.
		// This ensures that if a new key is loaded or the current key is cleared,
		// a new resumption attempt can be made for the new key (if any).
		const currentKey = mintedPkpPublicKey; // Ensure reactivity to mintedPkpPublicKey
		if (browser) {
			console.log(
				'Effect: mintedPkpPublicKey changed to',
				currentKey,
				'. Resetting hasAttemptedInitialSessionResumption.'
			);
			hasAttemptedInitialSessionResumption = false;
		}
	});

	$effect(() => {
		const client = $litClientStore; // Read the store value reactively
		if (client && client.ready && browser) {
			console.log('Lit client is ready (effect). Checking for PKP session resumption...');
			if (
				mintedPkpPublicKey &&
				!sessionSigs &&
				!isLoadingPkpSessionResume &&
				!generalIsLoading &&
				!isLoadingSessionSigsGnosisPasskey &&
				!hasAttemptedInitialSessionResumption
			) {
				hasAttemptedInitialSessionResumption = true;
				tryResumePkpSession(client, mintedPkpPublicKey);
			}
			if (mintedPkpTokenId && permittedAuthMethods.length === 0 && !isLoadingPermittedAuthMethods) {
				handleFetchPermittedAuthMethods(mintedPkpTokenId);
			}
		}

		// The original subscription logic was just calling functions based on client status.
		// If there was an explicit unsubscribe function from litClientStore.subscribe,
		// it would be returned here. Assuming litClientStore is a Svelte store,
		// $effect handles dependency tracking. If litClientStore itself had a more complex
		// subscribe method returning a specific cleanup, that would need to be called.
		// For a standard Svelte store, direct usage of $litClientStore in the effect
		// is usually sufficient for reactivity. If litClientStore.subscribe returned
		// a cleanup function, that should be returned from this $effect.
		// Let's assume standard Svelte store behavior for now.
		// If an explicit unsubscribe was needed from `litClientStore.subscribe()`:
		// const unsubscribe = litClientStore.subscribe(async (clientValue) => { ... });
		// return unsubscribe;
		// However, we are reacting to $litClientStore directly.
	});

	async function tryResumePkpSession(currentLitClient: LitNodeClient, pkpKeyToResume: Hex) {
		if (sessionSigs) {
			console.log(
				'PKP session already active in this component instance (tryResumePkpSession check).'
			);
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
	}

	// Function to handle refreshing/checking PKP session status
	async function handleRefreshSessionStatus() {
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
		sessionSigs = null; // Clear previous session before attempting new one
		sessionAuthMethod = null;

		try {
			const challengeMessage = 'Authenticate to use Hominio PKP with Passkey (Settings Check)';
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
				'ethereum' // Ensure this matches your target chain for the PKP
			);

			sessionAuthMethod = 'gnosis-passkey';
			mainSuccess =
				'Successfully authenticated PKP session via Passkey (Gnosis)! Session Sigs obtained.';
			// Removed goToStep(5) for settings page
		} catch (err: unknown) {
			mainError =
				err instanceof Error
					? `PKP Authentication Failed: ${err.message}`
					: 'Unknown error during PKP authentication via Gnosis Passkey.';
			sessionSigs = null;
			sessionAuthMethod = null;
			console.error('Error in handleRefreshSessionStatus (Authenticate PKP):', err);
		} finally {
			isLoadingSessionSigsGnosisPasskey = false;
			generalIsLoading = false;
		}
	}

	// Add handleFetchPermittedAuthMethods function here
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

	// --- Passkey Management (Step 0) ---
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
				// goToStep(1); // Do not navigate in settings page, user manages flow
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
		// signatureResult = null; // Belongs to Step 5 (Wallet)
		// litActionResult = null; // Belongs to Step 5 (Wallet)

		if (browser) {
			localStorage.removeItem('mintedPKPData');
			// localStorage.removeItem(PROFILE_STORAGE_KEY); // Belongs to Step 6 (Wallet)
			// encryptedProfileDataString = null; // Belongs to Step 6 (Wallet)
			// profileName = ''; // Belongs to Step 6 (Wallet)
		}
		mainSuccess = 'Passkey and associated PKP data cleared.';
		// goToStep(0); // User is already on settings, clearing data here is fine.
	}

	// --- EIP-1271 Signer (Step 1) ---
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
					// goToStep(2); // No auto-navigation
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
		// Note: messageToSign was removed as it was part of Step 5. If settings needs its own verify, add a local var.
		// For now, let's assume a fixed test message or add a simple input for settings page if really needed.
		const settingsTestMessage = 'Test EIP-1271 Signature for Settings';
		if (!deployedSignerAddress) {
			mainError = 'EIP-1271 Signer contract must be deployed first (Step 1).';
			return;
		}
		isLoadingProxyVerify = true;
		resetMainMessages();
		proxyVerificationResult = null;

		try {
			proxyVerificationResult = await verifySignatureWithProxy(
				settingsTestMessage,
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

	// --- PKP Minting (Step 2) ---
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
			// goToStep(3); // No auto-navigation
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

	// --- Capacity Credits (Step 7) ---
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
</script>

<div class="min-h-screen bg-stone-50 font-sans text-slate-800">
	<div class="flex">
		<aside class="w-64 flex-shrink-0 bg-stone-100 p-6 shadow-md">
			<nav class="space-y-2">
				<p class="mb-4 text-xs font-semibold tracking-wider text-stone-500 uppercase">
					Settings Sections
				</p>
				{#each settingsSections as section (section.id)}
					<button
						on:click={() => (selectedSettingsSectionId = section.id)}
						class="w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors duration-150
                        {selectedSettingsSectionId === section.id
							? 'bg-slate-700 text-white shadow-sm'
							: 'text-slate-600 hover:bg-stone-200 hover:text-slate-800'}"
					>
						{section.title}
					</button>
				{/each}
			</nav>
		</aside>

		<main class="flex-1 p-4 md:p-8">
			<div class="mx-auto max-w-3xl space-y-8">
				<!-- Main Error/Success Messages -->
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

				<!-- Step 0: Passkey Management -->
				{#if selectedSettingsSectionId === 'passkey'}
					<div class="rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							Passkey Management
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

				<!-- Step 1: Deploy & Verify EIP-1271 Signer -->
				{#if selectedSettingsSectionId === 'signer'}
					<div class="rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							EIP-1271 Signer Contract
						</h2>
						<p class="mb-4 text-sm text-slate-500">
							Deploy an EIP-1271 signer proxy contract for your passkey. This allows on-chain
							verification of signatures and is <strong>required</strong> before minting a PKP that
							uses this passkey for Lit Action authentication.
							<strong class="text-orange-600">Requires Gnosis connection & funds.</strong>
						</p>
						{#if !storedPasskey}
							<div
								class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-center text-sm text-orange-700"
							>
								Create a Passkey first.
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
							<button
								on:click={handleSignAndVerifyEIP1271Proxy}
								class="w-full justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 focus:outline-none disabled:opacity-50"
								disabled={isLoadingProxyVerify || !storedPasskey?.signerContractAddress}
							>
								{#if isLoadingProxyVerify}<span class="spinner mr-2"
									></span>Verifying...{:else}Verify Deployed Proxy Signature{/if}</button
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

				<!-- Step 2: Mint PKP -->
				{#if selectedSettingsSectionId === 'mint_pkp'}
					<div class="rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							Mint PKP for Passkey
						</h2>
						{#if !storedPasskey}
							<div
								class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
							>
								Please create and store a passkey first to enable PKP minting.
							</div>
						{:else if !storedPasskey.signerContractAddress}
							<div
								class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
							>
								Please deploy the EIP-1271 Signer first to enable PKP minting.
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
								authentication using your passkey (via the Gnosis verification Lit Action) and will
								be transferred to its own address.
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
									Token ID: <code class="ml-1 rounded bg-stone-200 p-1 text-xs"
										>{mintedPkpTokenId}</code
									>
								</p>
								<p class="mb-1 text-sm break-all">
									Public Key: <code class="ml-1 rounded bg-stone-200 p-1 text-xs"
										>{mintedPkpPublicKey}</code
									>
								</p>
								<p class="text-sm break-all">
									ETH Address: <code class="ml-1 rounded bg-stone-200 p-1 text-xs"
										>{mintedPkpEthAddress}</code
									>
								</p>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Step 3: View PKP Auth Methods -->
				{#if selectedSettingsSectionId === 'auth_methods'}
					<div class="rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							View PKP Auth Methods
						</h2>
						{#if !mintedPkpTokenId}
							<div
								class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
							>
								Mint a PKP first to view its auth methods.
							</div>
						{:else}
							<p class="mb-4 text-sm text-slate-500">
								Fetch and display auth methods for PKP Token ID <code
									class="rounded bg-stone-200 p-0.5 text-xs">{mintedPkpTokenId}</code
								>.
							</p>
							<button
								on:click={() =>
									mintedPkpTokenId && handleFetchPermittedAuthMethods(mintedPkpTokenId)}
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
												{#if method.authMethodType === 2n}<span class="ml-1 text-cyan-600"
														>(Lit Action)</span
													>{:else}<span class="ml-1 text-stone-500">(WebAuthn/Passkey)</span>{/if}
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

				<!-- Adapted Step 4: PKP Session Status -->
				{#if selectedSettingsSectionId === 'session_status'}
					<div class="rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							PKP Session Status
						</h2>
						<p class="mb-4 text-sm text-slate-500">
							Check or refresh the authenticated session for your PKP (<code
								class="rounded bg-stone-200 p-0.5 text-xs">{mintedPkpTokenId || 'N/A'}</code
							>). An active session is required by other applications to use your PKP.
						</p>
						<div class="space-y-4">
							<div class="rounded-lg border border-stone-200 p-4">
								<h3 class="mb-2 font-medium text-slate-600">
									PKP Session (Gnosis Passkey Verification)
								</h3>
								{#if storedPasskey?.rawId && storedPasskey?.pubkeyCoordinates && storedPasskey?.signerContractAddress && mintedPkpPublicKey}
									<p class="mb-3 text-xs text-slate-500">
										This will prompt for your passkey to authenticate the PKP session.
									</p>
									<button
										on:click={handleRefreshSessionStatus}
										class="w-full justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
										disabled={isLoadingSessionSigsGnosisPasskey ||
											isLoadingPkpSessionResume ||
											!mintedPkpPublicKey}
									>
										{#if isLoadingSessionSigsGnosisPasskey}
											<span class="spinner mr-2"></span>Authenticating...
										{:else if isLoadingPkpSessionResume}
											<span class="spinner mr-2"></span>Checking session...
										{:else if sessionSigs && (sessionAuthMethod === 'gnosis-passkey' || sessionAuthMethod === 'resumed-from-cache')}
											✅ Session Active (Click to Re-authenticate)
										{:else}
											Authenticate / Refresh Session Status
										{/if}
									</button>
								{:else}
									<p
										class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-600"
									>
										{#if !storedPasskey?.rawId || !storedPasskey?.pubkeyCoordinates}Create a passkey
											first.
										{:else if !mintedPkpPublicKey}Mint a PKP first.
										{:else if !storedPasskey?.signerContractAddress}Deploy EIP-1271 Signer first.{/if}
									</p>
								{/if}
							</div>
						</div>
						{#if sessionSigs && (sessionAuthMethod === 'gnosis-passkey' || sessionAuthMethod === 'resumed-from-cache')}
							<div class="mt-6 rounded-lg border border-stone-200 bg-stone-100 p-4">
								<h3 class="mb-2 font-semibold text-slate-700">
									Active PKP Session (Authenticated via: {sessionAuthMethod === 'resumed-from-cache'
										? 'DEVICE CACHE'
										: (sessionAuthMethod?.toUpperCase() ?? 'N/A')})
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
				{/if}

				<!-- Step 7: PKP Capacity Credits -->
				{#if selectedSettingsSectionId === 'capacity_credits'}
					<div class="rounded-xl bg-white p-6 shadow-lg md:p-8">
						<h2 class="mb-6 border-b border-stone-200 pb-3 text-2xl font-semibold text-slate-700">
							PKP Capacity Credits (PKP: {mintedPkpEthAddress
								? mintedPkpEthAddress.slice(0, 6) + '...' + mintedPkpEthAddress.slice(-4)
								: 'N/A'})
						</h2>
						<p class="mb-4 text-sm text-slate-500">
							View Capacity Credit NFTs owned by your minted PKP.
						</p>
						{#if !mintedPkpEthAddress}
							<div
								class="rounded-lg border border-orange-300 bg-orange-100 p-3 text-sm text-orange-700"
							>
								Please mint a PKP first to view its capacity credits.
							</div>
						{:else}
							<button
								on:click={handleFetchOwnedCapacityCredits}
								class="mb-6 w-full justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
								disabled={isLoadingCapacityCredits || !mintedPkpEthAddress}
							>
								{#if isLoadingCapacityCredits}<span class="spinner mr-2"></span>Fetching Credits...{:else}Refresh
									PKP Capacity Credits{/if}
							</button>
							{#if isLoadingCapacityCredits}
								<p class="text-center text-sm text-slate-500">Loading your PKP's NFTs...</p>
							{:else if ownedCapacityCredits.length > 0}
								<div class="space-y-4">
									<h3 class="text-lg font-medium text-slate-600">
										Your PKP's Capacity Credit NFTs:
									</h3>
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
</div>

<style>
	.spinner {
		/* Basic spinner - replace with your actual spinner styles or component */
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
		flex-shrink: 0; /* Prevent buttons from shrinking in flex containers */
	}
	code {
		word-break: break-all; /* Ensure long code strings wrap */
	}
	pre code {
		display: block;
		padding: 0.5rem;
		border-radius: 0.25rem;
		/* background-color: #f3f4f6; /* Tailwind gray-100 for consistency */
	}
</style>
