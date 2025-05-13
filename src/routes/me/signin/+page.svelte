<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { browser } from '$app/environment';
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte';
	import { authClient } from '$lib/KERNEL/hominio-auth';
	import type { StoredPasskeyData } from '$lib/wallet/passkeySigner';
	import { generatePasskeyMaterial, deployPasskeySignerContract } from '$lib/wallet/passkeySigner';
	import { mintPKPWithPasskeyAndAction, gnosisPasskeyVerifyActionCode } from '$lib/wallet/lit';
	import { publicKeyToEthAddress } from '$lib/wallet/addressTokenUtils';
	import type { Hex, Address } from 'viem';
	import { keccak256, hexToBytes } from 'viem'; // Added keccak256, toBytes, hexToBytes
	import type { SessionSigs } from '@lit-protocol/types'; // Added type import
	import { currentUserPkpProfileStore } from '$lib/stores/pkpSessionStore'; // Import the profile store
	import type {
		CheckRawIdExistsClientArgs,
		UpdatePasskeyInfoClientArgs
	} from '$lib/auth/pkp-passkey-plugin';
	import { requestPKPSignature } from '$lib/wallet/modalStore';
	import type { PKPAuthenticateSessionRequest } from '$lib/wallet/modalTypes';

	const o = getContext<HominioFacade>('o');
	const { client: guardianEoaClientStore, address: guardianEoaAddressStore } = o.guardian;

	type FlowState =
		| 'initial'
		| 'checkingUserPasskey' // Checking backend for user's existing passkey info
		| 'promptSignIn' // User has a passkey rawId in DB, prompt to sign in
		| 'signInAuthenticating' // Passkey authentication in progress for sign-in
		| 'generatingPasskey' // New passkey generation locally
		| 'checkingGlobalRawId' // Checking if new rawId exists globally (should not for new ones)
		| 'deployingSigner' // Deploying EIP-1271 signer contract
		| 'mintingPkp' // Minting the PKP NFT
		| 'updatingBackend' // Linking passkey and PKP info in our database
		| 'complete'
		| 'error';

	let isLoading = $state(false);
	let flowState = $state<FlowState>('initial');
	let flowMessage = $state<string | null>(null);
	let pkpEthAddress = $state<Address | null>(null);
	let currentError = $state<string | null>(null);

	// Temporary state for the setup flow
	let tempPasskeyMaterial = $state<StoredPasskeyData | null>(null);
	let tempPasskeyVerifierContract = $state<string | null>(null); // Hex Address
	let tempPkpDetails: { pkpPublicKey: Hex; pkpEthAddress: Address; pkpTokenId: string } | null =
		$state(null);

	// For sign-in flow with existing passkey
	let existingUserPasskeyRawId = $state<string | null>(null);
	let existingUserPkpPublicKey = $state<Hex | null>(null);
	let existingUserPasskeyUsername = $state<string | null>(null); // Added
	let existingUserPasskeyCoordinates = $state<{ x: string; y: string } | null>(null); // Added
	let existingUserPasskeyVerifierContract = $state<string | null>(null); // Added
	let existingUserPkpTokenId = $state<string | null>(null); // Added for PKP Token ID

	function mapFlowStateToMessage(state: FlowState): string {
		switch (state) {
			case 'initial':
				return 'Initializing...';
			case 'checkingUserPasskey':
				return 'Checking your existing Hominio Wallet status...';
			case 'promptSignIn':
				return 'Existing Hominio Wallet found. Click "Sign In with Passkey" to continue.';
			case 'signInAuthenticating':
				return 'Authenticating with your passkey... Please follow browser prompts.';
			case 'generatingPasskey':
				return 'Step 1 of 5: Creating a new secure passkey locally...';
			case 'checkingGlobalRawId':
				return 'Step 2 of 5: Verifying passkey uniqueness...';
			case 'deployingSigner':
				return 'Step 3 of 5: Deploying your secure signer contract (requires EOA wallet confirmation)...';
			case 'mintingPkp':
				return 'Step 4 of 5: Minting your Hominio PKP Wallet (requires EOA wallet confirmation)...';
			case 'updatingBackend':
				return 'Step 5 of 5: Linking your new wallet to your Hominio account...';
			case 'complete':
				return pkpEthAddress
					? `Setup complete! Your Hominio Wallet Address: ${pkpEthAddress}`
					: 'Process complete!';
			case 'error':
				return 'An error occurred.';
			default:
				return 'Please wait...';
		}
	}

	$effect(() => {
		flowMessage = mapFlowStateToMessage(flowState);
		if (flowState === 'error' && currentError) {
			flowMessage = `Error: ${currentError}`;
		}
	});

	onMount(async () => {
		if (!browser) return;
		handleInitialCheck();
	});

	async function handleInitialCheck() {
		isLoading = true;
		currentError = null;
		flowState = 'checkingUserPasskey';

		try {
			const userInfo = await authClient.pkpPasskeyPlugin.getUserPasskeyInfo();
			console.log('[PasskeyPage] UserInfo from backend:', userInfo);

			// Reset existing user data fields before repopulating
			existingUserPasskeyRawId = null;
			existingUserPkpPublicKey = null;
			existingUserPasskeyUsername = null;
			existingUserPasskeyCoordinates = null;
			existingUserPasskeyVerifierContract = null;
			existingUserPkpTokenId = null; // Reset PKP Token ID
			pkpEthAddress = null; // Clear any old address

			if (userInfo.data?.pkp_passkey?.rawId) {
				const passkey = userInfo.data.pkp_passkey;
				existingUserPasskeyRawId = passkey.rawId;
				existingUserPkpPublicKey = passkey.pubKey as Hex;
				existingUserPasskeyUsername = passkey.username || null;
				existingUserPasskeyCoordinates = passkey.pubkeyCoordinates || null;
				existingUserPasskeyVerifierContract = passkey.passkeyVerifierContract || null;
				existingUserPkpTokenId = passkey.pkpTokenId || null; // Populate PKP Token ID

				// Basic check for essential data for sign-in flow
				if (
					existingUserPasskeyRawId &&
					existingUserPkpPublicKey &&
					existingUserPasskeyUsername &&
					existingUserPasskeyCoordinates &&
					existingUserPasskeyVerifierContract &&
					existingUserPkpTokenId // Check for PKP Token ID
				) {
					flowState = 'promptSignIn';
				} else {
					console.warn(
						'[PasskeyPage] Backend returned incomplete passkey data for sign-in flow:',
						passkey
					);
					currentError =
						'Your existing wallet information is incomplete. Please try the full setup.';
					// Fallback to initial to allow full setup if data is critically missing
					flowState = 'initial';
					flowMessage =
						'Your existing wallet information is incomplete. Try setting up a new Hominio Wallet.';
				}
			} else {
				// No existing passkey linked to this user, start full setup by prompting
				flowState = 'initial'; // Ready to start setup or user can click a button
				flowMessage = 'Welcome! Set up your Hominio Wallet with a secure passkey.';
			}
		} catch (err: any) {
			console.error('[PasskeyPage] Error fetching user passkey info:', err);
			currentError = `Failed to check your account status: ${err.message || 'Unknown error'}`;
			flowState = 'error';
		} finally {
			isLoading = false;
		}
	}

	async function handleSignInWithPasskey() {
		if (
			!existingUserPasskeyRawId ||
			!existingUserPkpPublicKey ||
			!existingUserPasskeyUsername ||
			!existingUserPasskeyCoordinates ||
			!existingUserPasskeyVerifierContract ||
			!existingUserPkpTokenId
		) {
			currentError =
				'Incomplete passkey information for sign-in. Please try full setup or contact support.';
			flowState = 'error';
			return;
		}

		isLoading = true;
		currentError = null;
		flowState = 'signInAuthenticating'; // Indicate modal will now handle authentication

		try {
			// Construct request without PKP details
			const authSessionRequest: PKPAuthenticateSessionRequest = {
				type: 'authenticateSession'
			};

			console.log(
				'[SignInPage] Requesting session authentication via SignerModal...',
				authSessionRequest
			);

			// Call the modal. The modal will handle navigator.credentials.get() and getSessionSigs
			// The result here will be the SessionSigs if successful
			const sessionSigsResult = (await requestPKPSignature(authSessionRequest)) as SessionSigs;

			console.log('[SignInPage] Successfully obtained session sigs via modal:', sessionSigsResult);
			// Optional: Store sessionSigsResult in a global Svelte store if needed by other parts of the app
			// activePkpSessionSigs.set(sessionSigsResult);

			const derivedAddress = publicKeyToEthAddress(existingUserPkpPublicKey as Hex);
			pkpEthAddress = derivedAddress;

			// Populate the currentUserPkpProfileStore
			if (
				derivedAddress &&
				existingUserPkpPublicKey &&
				existingUserPasskeyRawId &&
				existingUserPasskeyCoordinates &&
				existingUserPasskeyUsername &&
				existingUserPasskeyVerifierContract &&
				existingUserPkpTokenId
			) {
				currentUserPkpProfileStore.set({
					pkpEthAddress: derivedAddress,
					pkpPublicKey: existingUserPkpPublicKey as Hex,
					passkeyData: {
						// Reconstruct StoredPasskeyData for the store from existingUser... fields
						rawId: existingUserPasskeyRawId,
						pubkeyCoordinates: existingUserPasskeyCoordinates,
						username: existingUserPasskeyUsername,
						passkeyVerifierContractAddress: existingUserPasskeyVerifierContract
					},
					pkpTokenId: existingUserPkpTokenId as string
				});
			} else {
				console.warn(
					'[SignInPage] Could not set currentUserPkpProfileStore due to missing details after sign-in.'
				);
			}

			flowMessage = `Successfully signed in! Your Hominio Wallet Address: ${pkpEthAddress}`;
			flowState = 'complete';
		} catch (err: any) {
			console.error('[SignInPage] Error during modal passkey sign-in:', err);
			currentError = `Sign-in failed: ${err.message || 'Unknown error'}`;
			if (currentError.toLowerCase().includes('cancelled by user')) {
				// If user cancelled in modal, reset to prompt state rather than hard error
				flowState = 'promptSignIn';
				currentError = 'Sign-in process cancelled.'; // User-friendly message
				flowMessage = mapFlowStateToMessage('promptSignIn');
			} else {
				flowState = 'error';
			}
		} finally {
			isLoading = false;
		}
	}

	async function handleFullSetupFlow() {
		const guardianEoaClient = $guardianEoaClientStore;
		const guardianEoaAddress = $guardianEoaAddressStore;

		if (!guardianEoaClient || !guardianEoaAddress) {
			currentError = 'EOA Wallet (e.g., MetaMask) not connected. Please connect it to proceed.';
			flowState = 'error';
			return;
		}

		isLoading = true;
		currentError = null;
		pkpEthAddress = null;
		tempPasskeyMaterial = null;
		tempPasskeyVerifierContract = null;
		tempPkpDetails = null;

		try {
			// 1. Generate Passkey Material Locally
			flowState = 'generatingPasskey';

			const sessionStore = authClient.useSession(); // This is the store
			let sessionData: any = null; // To hold the value from the store

			if (sessionStore && typeof sessionStore.subscribe === 'function') {
				const unsubscribe = sessionStore.subscribe((value) => {
					sessionData = value;
				});
				unsubscribe(); // Immediately unsubscribe
			} else {
				console.warn(
					'[PasskeyPage] sessionStore or sessionStore.subscribe not available. Falling back for username.'
				);
			}

			const currentUser = sessionData?.data?.user;
			const userEmail = currentUser?.email;
			const userId = currentUser?.id;
			const usernameForPasskey = userEmail || userId || 'hominio-user';

			tempPasskeyMaterial = await generatePasskeyMaterial(usernameForPasskey);
			if (
				!tempPasskeyMaterial ||
				!tempPasskeyMaterial.rawId ||
				!tempPasskeyMaterial.pubkeyCoordinates
			) {
				throw new Error('Failed to generate passkey material locally, or material is incomplete.');
			}
			console.log('[PasskeyPage] Generated passkey material:', tempPasskeyMaterial);

			// 2. Check rawId Uniqueness Globally
			flowState = 'checkingGlobalRawId';
			const rawIdCheck = await authClient.pkpPasskeyPlugin.checkRawidExists({
				rawId: tempPasskeyMaterial.rawId
			} as CheckRawIdExistsClientArgs);
			console.log('[PasskeyPage] RawID check result:', rawIdCheck);
			if (rawIdCheck.data?.exists) {
				// Adjusted to check rawIdCheck.data.exists based on typical Eden treaty responses
				throw new Error(
					'This newly generated passkey (or its rawId) seems to be already registered. This is unexpected and indicates a potential issue. Please try again or contact support.'
				);
			}

			// 3. Deploy Signer Contract
			flowState = 'deployingSigner';
			const prefixedCoords = {
				x: tempPasskeyMaterial.pubkeyCoordinates.x.startsWith('0x')
					? (tempPasskeyMaterial.pubkeyCoordinates.x as Hex)
					: (`0x${tempPasskeyMaterial.pubkeyCoordinates.x}` as Hex),
				y: tempPasskeyMaterial.pubkeyCoordinates.y.startsWith('0x')
					? (tempPasskeyMaterial.pubkeyCoordinates.y as Hex)
					: (`0x${tempPasskeyMaterial.pubkeyCoordinates.y}` as Hex)
			};
			const deployResult = await deployPasskeySignerContract(
				guardianEoaClient,
				guardianEoaAddress,
				prefixedCoords // Use prefixed coordinates
			);
			if (!deployResult?.signerAddress) {
				throw new Error(
					`Failed to deploy signer contract. Transaction hash: ${deployResult?.txHash || 'N/A'}`
				);
			}
			tempPasskeyVerifierContract = deployResult.signerAddress;
			console.log(
				'[PasskeyPage] Deployed signer contract:',
				tempPasskeyVerifierContract,
				'Tx:',
				deployResult.txHash
			);

			// 4. Mint PKP (Lit Action Auth Only)
			flowState = 'mintingPkp';
			// Generate passkeyAuthMethodId on the fly for the minting process
			const passkeyAuthMethodIdForMint = keccak256(hexToBytes(tempPasskeyMaterial.rawId as Hex));

			const mintResult = await mintPKPWithPasskeyAndAction(
				guardianEoaClient,
				guardianEoaAddress,
				passkeyAuthMethodIdForMint, // Used by Lit Action registration
				tempPasskeyVerifierContract as Address, // For Lit Action jsParams
				gnosisPasskeyVerifyActionCode
			);
			if (
				!mintResult ||
				!mintResult.pkpTokenId ||
				!mintResult.pkpPublicKey ||
				!mintResult.pkpEthAddress
			) {
				throw new Error('Failed to mint PKP or mint result incomplete.');
			}
			tempPkpDetails = {
				pkpPublicKey: mintResult.pkpPublicKey,
				pkpEthAddress: mintResult.pkpEthAddress,
				pkpTokenId: mintResult.pkpTokenId
			};
			console.log('[PasskeyPage] PKP Minted:', tempPkpDetails);

			// Step 5: Update Backend
			flowState = 'updatingBackend';
			// This object should match the structure expected by the backend PkpPasskey interface
			const pkpPasskeyDataForBackend = {
				// This effectively becomes ClientPkpPasskey
				rawId: tempPasskeyMaterial.rawId,
				pubKey: tempPkpDetails.pkpPublicKey,
				passkeyVerifierContract: tempPasskeyVerifierContract as Address,
				username: tempPasskeyMaterial.username,
				pubkeyCoordinates: tempPasskeyMaterial.pubkeyCoordinates,
				pkpTokenId: tempPkpDetails.pkpTokenId
			};

			console.log(
				'[PasskeyPage] Updating backend with pkp_passkey data:',
				JSON.stringify(pkpPasskeyDataForBackend, null, 2)
			);

			// Pass it correctly nested under 'pkp_passkey'
			await authClient.pkpPasskeyPlugin.updateUserPasskeyInfo({
				pkp_passkey: pkpPasskeyDataForBackend
			} as UpdatePasskeyInfoClientArgs);

			console.log('[PasskeyPage] Backend updated successfully.');

			// Update local state to reflect completion and show PKP address
			pkpEthAddress = tempPkpDetails.pkpEthAddress;

			// Populate the currentUserPkpProfileStore after successful setup
			currentUserPkpProfileStore.set({
				pkpEthAddress: tempPkpDetails.pkpEthAddress,
				pkpPublicKey: tempPkpDetails.pkpPublicKey,
				passkeyData: {
					// This is StoredPasskeyData (which no longer includes authMethodId)
					rawId: tempPasskeyMaterial.rawId,
					pubkeyCoordinates: tempPasskeyMaterial.pubkeyCoordinates,
					username: tempPasskeyMaterial.username,
					passkeyVerifierContractAddress: tempPasskeyVerifierContract as Address
					// authMethodId: tempPasskeyMaterial.authMethodId // Removed from here
				},
				pkpTokenId: tempPkpDetails.pkpTokenId // Add pkpTokenId to the store
			});

			flowMessage = `Setup complete! Your Hominio Wallet Address: ${pkpEthAddress}`;
			flowState = 'complete';
			console.log('[PasskeyPage] Full setup complete!');
		} catch (err: any) {
			console.error('[PasskeyPage] Error during full setup flow:', err);
			currentError = `Setup failed: ${err.message || 'Unknown error'}. Check console for details.`;
			flowState = 'error';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-linen text-prussian-blue flex min-h-screen flex-col items-center justify-center p-4">
	<div class="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
		<h1 class="mb-6 text-center text-3xl font-bold text-emerald-600">Hominio Wallet</h1>

		{#if isLoading}
			<div class="my-8 flex flex-col items-center justify-center space-y-3">
				<div class="spinner h-12 w-12 text-emerald-600"></div>
				<p class="text-lg text-slate-700">{flowMessage || 'Processing...'}</p>
			</div>
		{:else if flowState === 'error'}
			<div class="my-8 rounded-lg border border-red-300 bg-red-100 p-6 text-center">
				<p class="mb-3 text-xl font-semibold text-red-600">Oops! Something went wrong.</p>
				<p class="text-sm text-red-700">{currentError || 'An unknown error occurred.'}</p>
				<button
					on:click={handleInitialCheck}
					class="focus:ring-opacity-50 mt-6 rounded-lg bg-red-500 px-6 py-2 font-semibold text-white hover:bg-red-600 focus:ring-2 focus:ring-red-400 focus:outline-none"
				>
					Try Again
				</button>
			</div>
		{:else if flowState === 'complete'}
			<div class="my-8 text-center">
				<p class="mb-2 text-2xl text-emerald-600">🎉</p>
				<p class="mb-4 text-xl font-semibold text-slate-800">
					{pkpEthAddress ? 'Your Hominio Wallet is Ready!' : 'Process Complete!'}
				</p>
				{#if pkpEthAddress}
					<p class="mb-1 text-sm text-slate-500">Your Wallet Address:</p>
					<p
						class="rounded-md bg-slate-100 p-3 font-mono text-lg break-all text-emerald-700 select-all"
					>
						{pkpEthAddress}
					</p>
				{:else if existingUserPkpPublicKey}
					<p class="mb-1 text-sm text-slate-500">Your PKP Public Key:</p>
					<p
						class="rounded-md bg-slate-100 p-3 font-mono text-sm break-all text-emerald-700 select-all"
					>
						{existingUserPkpPublicKey}
					</p>
					<p class="mt-3 text-xs text-slate-500">
						(Address derivation simulation was used for display)
					</p>
				{/if}
				<p class="mt-6 text-sm text-slate-500">
					You can now close this page or manage your wallet in Settings.
				</p>
				<!-- Optionally, a button to go to settings or dashboard -->
			</div>
		{:else if flowState === 'promptSignIn'}
			<div class="my-8 text-center">
				<p class="mb-4 text-lg text-slate-700">{flowMessage}</p>
				<button
					on:click={handleSignInWithPasskey}
					class="focus:ring-opacity-50 w-full rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
				>
					Sign In with Passkey
				</button>
			</div>
		{:else}
			<!-- initial, or any setup step that doesn't require a button -->
			<div class="my-8 text-center">
				<p class="mb-6 text-lg text-slate-700">{flowMessage || 'Ready to start.'}</p>
				{#if flowState === 'initial'}
					<button
						on:click={handleFullSetupFlow}
						class="focus:ring-opacity-50 w-full rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-70"
						disabled={!$guardianEoaAddressStore}
					>
						{#if !$guardianEoaAddressStore}
							Connect EOA Wallet to Start
						{:else}
							Setup New Hominio Wallet
						{/if}
					</button>
				{/if}
				{#if !$guardianEoaAddressStore && flowState === 'initial'}
					<p class="mt-3 text-xs text-orange-600">
						An EOA wallet (like MetaMask) connected on Gnosis or Chronicle chain is required for
						setup.
					</p>
				{/if}
			</div>
		{/if}
	</div>

	<footer class="mt-8 text-center text-xs text-slate-500">
		<p>&copy; {new Date().getFullYear()} Hominio. All rights reserved.</p>
		<p>This is a secure wallet management interface.</p>
	</footer>
</div>

<style>
	.spinner {
		display: inline-block;
		border: 3px solid currentColor;
		border-right-color: transparent;
		width: 1em;
		height: 1em;
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
