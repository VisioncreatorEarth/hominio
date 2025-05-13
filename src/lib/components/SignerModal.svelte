<script lang="ts">
	import { createEventDispatcher, onMount, getContext } from 'svelte';
	import { get } from 'svelte/store';
	import { signTransactionWithPKP, signWithPKP } from '$lib/wallet/lit';
	import { decodeFunctionData, formatUnits, keccak256, hexToBytes } from 'viem';
	import { roadmapConfig } from '$lib/roadmap/config';
	import { shortAddress, resolveTokenMeta } from '$lib/wallet/addressTokenUtils';
	import type { PKPSigningRequestData } from '$lib/wallet/modalTypes';
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte';
	import type { LitNodeClient } from '@lit-protocol/lit-node-client';
	import type {
		AuthSig,
		SessionSigs,
		AuthCallbackParams,
		LitResourceAbilityRequest
	} from '@lit-protocol/types';
	import {
		type StoredPasskeyData,
		type AuthenticatorAssertionResponse
	} from '$lib/wallet/passkeySigner';
	import { LitPKPResource, LitActionResource } from '@lit-protocol/auth-helpers';
	import { getSessionSigsWithGnosisPasskeyVerification, executeLitAction } from '$lib/wallet/lit';
	import type { Hex, Address } from 'viem';
	import { encryptString, decryptToString } from '@lit-protocol/encryption';
	import { createPublicClient, http, serializeTransaction } from 'viem';
	import { gnosis } from 'viem/chains';
	import { LitAbility } from '@lit-protocol/constants';
	import { browser } from '$app/environment';
	import {
		ensurePkpProfileLoaded,
		currentUserPkpProfileStore,
		type CurrentUserPkpProfile
	} from '$lib/stores/pkpSessionStore';

	const sahelPhaseConfig = roadmapConfig.phases.find((p) => p.name === 'Sahelanthropus');
	const GNOSIS_RPC_URL = sahelPhaseConfig?.rpcUrls?.default?.http?.[0];

	// Props: requestData (object), onSign (function), onCancel (function)
	// PKP-specific fields (pkpPublicKey, pkpEthAddress, passkeyData, pkpTokenId) will be removed from requestData prop.
	// The type definition for PKPSigningRequestData in modalTypes.ts will be updated accordingly.
	type OperationSpecificRequestData = Omit<
		PKPSigningRequestData,
		'pkpPublicKey' | 'pkpEthAddress' | 'passkeyData' | 'pkpTokenId'
	>;

	let { requestData, onSign, onCancel } = $props<{
		requestData: OperationSpecificRequestData | null;
		onSign: ((result: any) => void) | null;
		onCancel: (() => void) | null;
	}>();

	const dispatch = createEventDispatcher();

	// Internal State for PKP Profile
	let internalPkpProfile = $state<CurrentUserPkpProfile | null>(null);
	let isPkpProfileLoading = $state<boolean>(false);
	let pkpProfileError = $state<string | null>(null);

	// Internal State for session and passkey management
	let internalSessionSigs: SessionSigs | null = $state(null);
	let isSessionLoading: boolean = $state(false);
	let passkeyLoginUIVisible: boolean = $state(false);
	let internalLitNodeClient: LitNodeClient | null = $state(null);
	let sessionDurationMessage = $derived(
		(requestData as PKPSigningRequestData)?.type === 'authenticateSession'
			? 'This session will be valid for 1 minute.'
			: null
	);

	// Existing state
	let isSigning = $state(false);
	let currentErrorInternal: string | null = $state(null);
	let activeTab: 'summary' | 'details' = $state('summary');
	let signResult: { success: boolean; message: string } | null = $state(null);
	let signTimeout: ReturnType<typeof setTimeout> | null = null;
	let lastTxHash: string | null = $state(null);
	let explorerBaseUrl: string | null = $state(null);

	// Get LitNodeClient from Svelte context
	const o = getContext<HominioFacade>('o');
	const litNodeClientStore = o.lit.client;

	$effect(() => {
		internalLitNodeClient = get(litNodeClientStore);
		console.log('[SignerModal] LitNodeClient updated:', internalLitNodeClient?.ready);
	});

	// Effect 1: Keep internalPkpProfile synced with the store
	$effect(() => {
		const unsubscribe = currentUserPkpProfileStore.subscribe((profile) => {
			// Update internalPkpProfile only if the new profile is different.
			// This simple check works if 'profile' is null or if the object reference changes.
			// For more complex scenarios, a deep equality check or immutable patterns in the store might be needed.
			if (internalPkpProfile !== profile) {
				internalPkpProfile = profile;
			}

			if (profile) {
				console.log(
					'[SignerModal] Store subscription updated internalPkpProfile. Profile is now available.'
				);
				// If a profile is successfully loaded/retrieved, clear any loading-specific error.
				if (pkpProfileError && pkpProfileError.startsWith('Failed to load PKP profile:')) {
					pkpProfileError = null;
				}
			} else {
				// This branch is hit if the store provides a null profile.
				// Warn only if a request is active and we aren't in the middle of a load.
				if (requestData && !isPkpProfileLoading) {
					console.warn(
						'[SignerModal] Store subscription: PKP profile became null from store when not actively loading. This might be an issue if an operation was pending.'
					);
				}
			}
		});
		return unsubscribe; // Cleanup subscription
	});

	// Effect 2: Trigger loading of PKP profile if needed
	$effect(() => {
		// This effect runs if requestData, internalPkpProfile, or isPkpProfileLoading changes.
		if (requestData && internalPkpProfile === null && !isPkpProfileLoading) {
			// Attempt to load if:
			// 1. There's requestData (modal is active).
			// 2. internalPkpProfile is null (not loaded yet).
			// 3. We are not already loading (isPkpProfileLoading is false).
			console.log('[SignerModal] Load Trigger Effect: Conditions met. Initiating profile load.');
			isPkpProfileLoading = true;
			pkpProfileError = null; // Clear previous profile loading errors.

			ensurePkpProfileLoaded()
				.then(() => {
					console.log('[SignerModal] ensurePkpProfileLoaded() promise resolved successfully.');
					// Effect 1 (store sync) should handle updating `internalPkpProfile` based on the store change.
					// If `internalPkpProfile` becomes non-null, this effect (Effect 2) will re-run,
					// but the condition `internalPkpProfile === null` will then be false, preventing another load.
				})
				.catch((err) => {
					const msg = err instanceof Error ? err.message : String(err);
					console.error('[SignerModal] Error during ensurePkpProfileLoaded():', msg);
					pkpProfileError = `Failed to load PKP profile: ${msg}`;
					showError(pkpProfileError); // Update UI with the error
				})
				.finally(() => {
					isPkpProfileLoading = false;
					console.log('[SignerModal] Load Trigger Effect: isPkpProfileLoading set to false.');
				});
		}
	});

	onMount(() => {
		return () => {
			if (signTimeout) clearTimeout(signTimeout);
		};
	});

	// Tab navigation style variables
	const tabBase =
		'px-4 py-2 text-sm font-semibold focus:outline-none border-b-2 transition-colors duration-150';
	const tabActive = 'border-emerald-500 text-emerald-700 bg-emerald-50';
	const tabInactive = 'border-transparent text-slate-500 hover:text-emerald-700';

	const displayData = $derived(() => {
		if (!requestData || typeof requestData !== 'object') return requestData;

		// Cast requestData to full PKPSigningRequestData temporarily to access operation-specific fields.
		// This will be cleaned up when modalTypes.ts is updated.
		const opSpecificData = requestData as PKPSigningRequestData;

		return {
			// PKP data from internal profile for display
			pkpPublicKey: internalPkpProfile?.pkpPublicKey,
			pkpEthAddress: internalPkpProfile?.pkpEthAddress,
			// Operation-specific data from requestData
			type: opSpecificData.type,
			transaction: opSpecificData.type === 'transaction' ? opSpecificData.transaction : undefined,
			message: opSpecificData.type === 'message' ? opSpecificData.message : undefined,
			actionCode: opSpecificData.type === 'executeAction' ? opSpecificData.actionCode : undefined,
			actionJsParams:
				opSpecificData.type === 'executeAction' ? opSpecificData.actionJsParams : undefined,
			dataToEncrypt: opSpecificData.type === 'encrypt' ? opSpecificData.dataToEncrypt : undefined,
			accessControlConditions:
				opSpecificData.type === 'encrypt' || opSpecificData.type === 'decrypt'
					? opSpecificData.accessControlConditions
					: undefined,
			ciphertext: opSpecificData.type === 'decrypt' ? opSpecificData.ciphertext : undefined,
			dataToEncryptHash:
				opSpecificData.type === 'decrypt' ? opSpecificData.dataToEncryptHash : undefined,
			chain: opSpecificData.type === 'decrypt' ? opSpecificData.chain : undefined,
			tokenDecimals:
				opSpecificData.type === 'transaction' ? opSpecificData.tokenDecimals : undefined
		};
	});

	// Minimal ERC-20 ABI for transfer decoding
	const erc20Abi = [
		{
			name: 'transfer',
			type: 'function',
			stateMutability: 'nonpayable',
			inputs: [
				{ name: 'to', type: 'address' },
				{ name: 'amount', type: 'uint256' }
			],
			outputs: [{ name: 'success', type: 'bool' }]
		}
	];

	const decodedErc20Transfer = $derived(() => {
		const currentRequestData = requestData as PKPSigningRequestData;
		if (
			!currentRequestData ||
			currentRequestData.type !== 'transaction' ||
			!currentRequestData.transaction?.data
		)
			return null;
		try {
			const decoded = decodeFunctionData({
				abi: erc20Abi,
				data: currentRequestData.transaction.data
			});
			if (decoded.functionName === 'transfer') {
				const [to, amount] = decoded.args as [string, bigint];
				const decimals = currentRequestData.tokenDecimals ?? 18;
				return {
					functionName: decoded.functionName,
					to,
					amountRaw: amount,
					amountFormatted: formatUnits(amount, decimals)
				};
			}
		} catch (e) {
			// Ignore decoding errors
		}
		return null;
	});

	const erc20NameSymbolAbi = [
		{
			name: 'name',
			type: 'function',
			stateMutability: 'view',
			inputs: [],
			outputs: [{ type: 'string' }]
		},
		{
			name: 'symbol',
			type: 'function',
			stateMutability: 'view',
			inputs: [],
			outputs: [{ type: 'string' }]
		}
	];

	let tokenName = $state<string | null>(null);
	let tokenSymbol = $state<string | null>(null);
	let isLoadingTokenMeta = $state(false);

	$effect(() => {
		const currentDecodedTransferValue = decodedErc20Transfer();
		const currentRequestData = requestData as PKPSigningRequestData;

		if (currentRequestData && currentDecodedTransferValue && currentRequestData.transaction?.to) {
			isLoadingTokenMeta = true;
			resolveTokenMeta(currentRequestData.transaction.to)
				.then((meta) => {
					tokenName = meta.name;
					tokenSymbol = meta.symbol;
					isLoadingTokenMeta = false;
				})
				.catch((err) => {
					console.error('Error fetching token meta:', err);
					isLoadingTokenMeta = false;
				});
		} else {
			tokenName = null;
			tokenSymbol = null;
		}
	});

	const displayOperationType = $derived(() => {
		const currentRequestData = requestData as PKPSigningRequestData;
		if (!currentRequestData) return 'Unknown Operation';
		switch (currentRequestData.type) {
			case 'message':
				return 'Sign Message';
			case 'transaction':
				return 'Sign Transaction';
			case 'executeAction':
				return 'Execute Lit Action';
			case 'encrypt':
				return 'Encrypt Data';
			case 'decrypt':
				return 'Decrypt Data';
			case 'authenticateSession':
				return 'Authenticate Hominio Wallet Session';
			default:
				return 'Unknown PKP Operation';
		}
	});

	const derivedRequestedCapabilities = $derived(() => {
		const currentRequestData = requestData as PKPSigningRequestData;
		if (!currentRequestData) return [];
		const capabilities: string[] = [];
		switch (currentRequestData.type) {
			case 'message':
			case 'transaction':
			case 'encrypt':
			case 'decrypt':
				capabilities.push(
					'Sign with your PKP (for messages, transactions, or cryptographic operations).'
				);
				break;
			case 'authenticateSession':
				capabilities.push('Authenticate a secure session for your Hominio Wallet.');
				capabilities.push(
					'This will allow Hominio to perform actions on your behalf, such as signing messages, transactions, and managing your encrypted data using this PKP wallet.'
				);
				break;
			case 'executeAction':
				capabilities.push('Sign with your PKP.');
				capabilities.push('Execute Lit Actions (currently any action, scoped to this PKP).');
				break;
			default:
				capabilities.push('Perform the requested PKP operation.');
		}
		return capabilities;
	});

	function showSuccess(message: string) {
		signResult = { success: true, message };
		if (signTimeout) clearTimeout(signTimeout);
		signTimeout = setTimeout(() => {
			signResult = null;
			if (onCancel) onCancel();
		}, 2500);
	}
	function showError(message: string) {
		currentErrorInternal = message;
		signResult = { success: false, message };
		if (signTimeout) clearTimeout(signTimeout);
	}

	async function internalPasskeyAuthCallback(params: AuthCallbackParams): Promise<AuthSig> {
		console.warn(
			'[SignerModal] internalPasskeyAuthCallback triggered, but flow should be managed by new getSessionSigsForOperation with inline Gnosis passkey auth.',
			params
		);
		throw new Error(
			'internalPasskeyAuthCallback not fully wired for the new Gnosis passkey session flow via getSessionSigs. Should be handled within authNeededCallback of getSessionSigsForOperation.'
		);
	}

	async function executeRequestedOperation(sessionSigs: SessionSigs) {
		const currentRequestData = requestData as PKPSigningRequestData;

		if (
			!currentRequestData ||
			!internalLitNodeClient ||
			!internalPkpProfile ||
			!internalPkpProfile.pkpPublicKey
		) {
			showError(
				'Missing request data, Lit client, PKP profile, or PKP public key for operation execution.'
			);
			return;
		}
		isSigning = true;
		currentErrorInternal = null;
		lastTxHash = null;
		explorerBaseUrl = null;

		try {
			let result: any;
			switch (currentRequestData.type) {
				case 'message':
					if (!currentRequestData.message) throw new Error('Message not provided for signing.');
					result = await signWithPKP(
						internalLitNodeClient,
						sessionSigs,
						internalPkpProfile.pkpPublicKey,
						currentRequestData.message
					);
					showSuccess('Message signed successfully!');
					break;
				case 'transaction':
					if (!currentRequestData.transaction)
						throw new Error('Transaction not provided for signing.');
					result = await signTransactionWithPKP(
						internalLitNodeClient,
						sessionSigs,
						internalPkpProfile.pkpPublicKey,
						currentRequestData.transaction
					);
					const publicClient = createPublicClient({
						chain: gnosis,
						transport: http(GNOSIS_RPC_URL)
					});
					const signedRawTx = serializeTransaction(currentRequestData.transaction, result);
					const txHash = await publicClient.sendRawTransaction({
						serializedTransaction: signedRawTx
					});
					lastTxHash = txHash;
					explorerBaseUrl = sahelPhaseConfig?.blockExplorers?.default?.url || null;
					showSuccess('Transaction signed and broadcasted successfully!');
					break;
				case 'executeAction':
					if (!currentRequestData.actionCode) throw new Error('Lit Action code not provided.');
					result = await executeLitAction(
						internalLitNodeClient,
						sessionSigs,
						currentRequestData.actionCode,
						currentRequestData.actionJsParams || {}
					);
					showSuccess('Lit Action executed successfully!');
					break;
				case 'encrypt':
					if (!currentRequestData.dataToEncrypt) throw new Error('Data to encrypt not provided.');
					if (!currentRequestData.accessControlConditions)
						throw new Error('Access control conditions not provided for encryption.');

					result = await encryptString(
						{
							accessControlConditions: currentRequestData.accessControlConditions,
							dataToEncrypt: currentRequestData.dataToEncrypt
						},
						internalLitNodeClient
					);
					showSuccess('Data encrypted successfully!');
					break;
				case 'decrypt':
					if (!currentRequestData.ciphertext)
						throw new Error('Ciphertext not provided for decryption.');
					if (!currentRequestData.dataToEncryptHash)
						throw new Error('DataToEncryptHash not provided for decryption.');
					if (!currentRequestData.accessControlConditions)
						throw new Error('Access control conditions not provided for decryption.');

					result = await decryptToString(
						{
							accessControlConditions: currentRequestData.accessControlConditions,
							ciphertext: currentRequestData.ciphertext,
							dataToEncryptHash: currentRequestData.dataToEncryptHash,
							chain: currentRequestData.chain,
							sessionSigs: sessionSigs
						},
						internalLitNodeClient
					);
					showSuccess('Data decrypted successfully!');
					break;
				case 'authenticateSession':
					result = sessionSigs;
					showSuccess('Hominio Wallet session authenticated successfully!');
					break;
				default:
					throw new Error('Unsupported operation type.');
			}
			if (onSign && result) {
				onSign(result);
				dispatch('signed', { result });
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			showError(`Operation failed: ${msg}`);
		} finally {
			isSigning = false;
		}
	}

	async function initiatePasskeyAuthenticationAndGetSigs() {
		const currentRequestData = requestData as PKPSigningRequestData;

		if (
			!internalLitNodeClient ||
			!currentRequestData ||
			!internalPkpProfile ||
			!internalPkpProfile.passkeyData ||
			!internalPkpProfile.pkpPublicKey ||
			!internalPkpProfile.pkpTokenId
		) {
			const errorDetail = !internalPkpProfile
				? 'PKP Profile not loaded. '
				: !internalPkpProfile.passkeyData
					? 'Passkey data missing in profile. '
					: !internalPkpProfile.pkpPublicKey
						? 'PKP public key missing in profile. '
						: !internalPkpProfile.pkpTokenId
							? 'PKP token ID missing in profile. '
							: '';
			const errorMessage =
				`Cannot initiate passkey auth: Lit client, request data, or crucial PKP details from profile missing. ${errorDetail}`.trim();

			showError(errorMessage);
			passkeyLoginUIVisible = false;
			isSessionLoading = false;
			throw new Error(errorMessage);
		}

		const { passkeyData: currentPasskeyData, pkpPublicKey: currentPkpPublicKey } =
			internalPkpProfile;

		const pkpResourceForAuthSig = new LitPKPResource('*');
		console.log(
			`[SignerModal-initiatePasskeyAuth] Using LitPKPResource("*") to generate a general AuthSig for PKP ${currentPkpPublicKey}, regardless of operation type "${currentRequestData.type}".`
		);
		const resourceAbilityRequestsForAuthSig: Array<LitResourceAbilityRequest> = [
			{ resource: pkpResourceForAuthSig, ability: LitAbility.PKPSigning }
		];

		if (currentRequestData.type === 'executeAction') {
			resourceAbilityRequestsForAuthSig.push({
				resource: new LitActionResource('*'),
				ability: LitAbility.LitActionExecution
			});
			console.log(
				'[SignerModal-initiatePasskeyAuth] Added wildcard LitActionResource for executeAction type.'
			);
		}

		const { rawId, pubkeyCoordinates, passkeyVerifierContractAddress } = currentPasskeyData;

		if (!rawId || !pubkeyCoordinates || !passkeyVerifierContractAddress) {
			throw new Error('Invalid passkey data format in profile.');
		}

		currentErrorInternal = null;

		try {
			console.log('[SignerModal] Initiating passkey authentication for PKP:', currentPkpPublicKey);

			const sessionChallengeMessage = `Sign in to Hominio PKP Wallet via Passkey at ${new Date().toISOString()}`;
			const messageHashAsChallenge = keccak256(new TextEncoder().encode(sessionChallengeMessage));
			const rawIdBytes = hexToBytes(currentPasskeyData.rawId as Hex);

			console.log(
				'[SignerModal] resourceAbilityRequestsForAuthSig (for Gnosis direct - ALWAYS USE WILDCARD HERE):',
				JSON.stringify(
					resourceAbilityRequestsForAuthSig.map((rar) => ({
						resourceKey: rar.resource.getResourceKey(),
						ability: rar.ability
					})),
					null,
					2
				)
			);

			const assertion = (await navigator.credentials.get({
				publicKey: {
					challenge: hexToBytes(messageHashAsChallenge),
					allowCredentials: [{ type: 'public-key', id: rawIdBytes }],
					userVerification: 'required'
				}
			})) as PublicKeyCredential | null;

			if (
				!assertion ||
				!assertion.response ||
				!(assertion.response instanceof AuthenticatorAssertionResponse)
			) {
				throw new Error('Failed to get valid signature assertion from passkey.');
			}
			const sessionExpiration = new Date(Date.now() + 1 * 60 * 1000).toISOString();

			const newSessionSigs = await getSessionSigsWithGnosisPasskeyVerification(
				internalLitNodeClient,
				currentPkpPublicKey as Hex,
				sessionChallengeMessage,
				assertion.response as AuthenticatorAssertionResponse,
				currentPasskeyData,
				'ethereum',
				resourceAbilityRequestsForAuthSig,
				sessionExpiration
			);

			console.log(
				'[SignerModal-initiatePasskeyAuth] Successfully obtained new sessionSigs with Gnosis direct method.'
			);

			if (!newSessionSigs) {
				throw new Error(
					'Failed to obtain PKP session after passkey (Gnosis direct). Cannot proceed.'
				);
			}
			return newSessionSigs;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(
				'[SignerModal-initiatePasskeyAuth] Error during Gnosis direct passkey auth:',
				msg,
				err
			);
			throw err;
		}
	}

	async function handleApproveOperation() {
		console.log('[SignerModal] handleApproveOperation called.');
		if (pkpProfileError) {
			showError(`Cannot proceed: ${pkpProfileError}`);
			return;
		}
		if (
			!internalLitNodeClient ||
			!internalLitNodeClient.ready ||
			!requestData ||
			!internalPkpProfile ||
			!internalPkpProfile.passkeyData ||
			!internalPkpProfile.pkpPublicKey ||
			!internalPkpProfile.pkpEthAddress ||
			!internalPkpProfile.pkpTokenId
		) {
			const errorDetail = !internalPkpProfile
				? 'PKP Profile not loaded. '
				: !internalPkpProfile.passkeyData
					? 'Passkey data missing in profile. '
					: !internalPkpProfile.pkpPublicKey
						? 'PKP Public Key missing in profile. '
						: !internalPkpProfile.pkpEthAddress
							? 'PKP ETH Address missing in profile. '
							: !internalPkpProfile.pkpTokenId
								? 'PKP Token ID missing in profile. '
								: '';
			const errorMsg =
				`Lit client not ready, request data missing, or crucial PKP details from profile unavailable. ${errorDetail}`.trim();

			console.error('[SignerModal handleApproveOperation] Pre-check failed:', errorMsg, {
				clientReady: internalLitNodeClient?.ready,
				hasRequestData: !!requestData,
				hasInternalPkpProfile: !!internalPkpProfile,
				isProfileLoading: isPkpProfileLoading,
				hasPasskeyDataInProfile: !!internalPkpProfile?.passkeyData,
				hasPkpPublicKeyInProfile: !!internalPkpProfile?.pkpPublicKey,
				hasPkpEthAddressInProfile: !!internalPkpProfile?.pkpEthAddress,
				hasPkpTokenIdInProfile: !!internalPkpProfile?.pkpTokenId
			});
			showError(errorMsg);
			return;
		}
		currentErrorInternal = null;
		signResult = null;

		passkeyLoginUIVisible = true;
		isSessionLoading = true;
		isSigning = true;

		try {
			console.log(
				'[SignerModal handleApproveOperation] Calling initiatePasskeyAuthenticationAndGetSigs directly.'
			);
			const newSessionSigs = await initiatePasskeyAuthenticationAndGetSigs();
			internalSessionSigs = newSessionSigs;
			console.log(
				'[SignerModal handleApproveOperation] Successfully obtained sessionSigs directly, proceeding to execute.',
				newSessionSigs
			);
			passkeyLoginUIVisible = false;
			console.log('[SignerModal handleApproveOperation] Calling executeRequestedOperation.');
			await executeRequestedOperation(newSessionSigs);
			console.log('[SignerModal handleApproveOperation] executeRequestedOperation completed.');
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error('[SignerModal handleApproveOperation] Error in main try block:', msg, err);
			if (
				msg.toLowerCase().includes('user cancelled') ||
				msg.includes('Authentication declined') ||
				msg.includes('The operation was aborted') ||
				msg.includes('declined by user') ||
				msg.includes('The request is not allowed by the user agent or the platform')
			) {
				showError('Operation cancelled or rejected by user.');
			} else {
				showError(`Approval Failed: ${msg}`);
			}
		} finally {
			isSigning = false;
			isSessionLoading = false;
			passkeyLoginUIVisible = false;
			console.log('[SignerModal handleApproveOperation] Exiting finally block.');
		}
	}

	function handleCancel() {
		if (onCancel) onCancel();
		dispatch('cancelled');
	}
</script>

<div
	class="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-[#fdf6ee] p-8 shadow-2xl"
>
	<h2 class="mb-4 text-2xl font-extrabold tracking-tight text-slate-800">PKP Action Request</h2>
	<p class="mb-6 text-base text-slate-600">Please review and approve the details below:</p>

	<div class="mb-6 flex w-full max-w-xl border-b border-stone-300">
		<button
			class={`${tabBase} ${activeTab === 'summary' ? tabActive : tabInactive}`}
			on:click={() => (activeTab = 'summary')}
			aria-selected={activeTab === 'summary'}>Summary</button
		>
		{#if (requestData as PKPSigningRequestData)?.type !== 'authenticateSession'}
			<button
				class={`${tabBase} ${activeTab === 'details' ? tabActive : tabInactive}`}
				on:click={() => (activeTab = 'details')}
				aria-selected={activeTab === 'details'}>Details</button
			>
		{/if}
	</div>

	{#if signResult && !passkeyLoginUIVisible}
		<div
			class="mb-6 w-full max-w-xl rounded-xl border-2 {signResult.success
				? 'border-prussian-blue/60 bg-prussian-blue/10'
				: 'border-red-400 bg-red-50'} flex items-center gap-3 p-6 text-base shadow-md"
		>
			{#if signResult.success}
				<svg
					class="text-prussian-blue h-8 w-8"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					viewBox="0 0 24 24"
					><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg
				>
				<span class="text-prussian-blue text-lg font-semibold">{signResult.message}</span>
				{#if lastTxHash}
					<div class="mt-2 w-full">
						<p class="text-prussian-blue/80 text-xs">Transaction Hash:</p>
						{#if explorerBaseUrl}
							<a
								href={`${explorerBaseUrl.endsWith('/') ? explorerBaseUrl : explorerBaseUrl + '/'}tx/${lastTxHash}`}
								target="_blank"
								rel="noopener noreferrer"
								class="bg-prussian-blue/20 text-prussian-blue block rounded p-1 break-all hover:underline"
								>{lastTxHash}</a
							>
						{:else}
							<code class="bg-prussian-blue/20 text-prussian-blue block rounded p-1 break-all"
								>{lastTxHash}</code
							>
						{/if}
					</div>
				{/if}
			{:else}
				<svg
					class="h-8 w-8 text-red-500"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					viewBox="0 0 24 24"
					><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg
				>
				<span class="text-lg font-semibold text-red-700">{signResult.message}</span>
			{/if}
		</div>
	{:else if passkeyLoginUIVisible}
		<div
			class="mb-6 w-full max-w-xl rounded-xl border-2 border-yellow-400 bg-yellow-50 p-8 text-base shadow-lg"
		>
			<h3 class="mb-4 text-xl font-bold text-yellow-700">Passkey Authentication Needed</h3>
			<p class="mb-4 text-yellow-600">Your approval requires authentication with your passkey.</p>
			<p class="mb-2 text-sm text-yellow-500">
				PKP: {internalPkpProfile?.pkpEthAddress
					? shortAddress(internalPkpProfile.pkpEthAddress)
					: isPkpProfileLoading
						? 'Loading PKP info...'
						: 'N/A'}
			</p>
			{#if isSessionLoading}
				<div class="flex items-center justify-center py-4 text-yellow-700">
					<span class="spinner mr-3"></span> Authenticating with passkey device...
				</div>
			{:else}
				<p class="py-4 text-center text-sm text-yellow-600">
					Follow prompts from your browser or security key.
				</p>
			{/if}
			{#if currentErrorInternal && passkeyLoginUIVisible}
				<div class="mt-4 rounded border border-red-300 bg-red-100 p-2 text-xs text-red-700">
					Passkey Error: {currentErrorInternal}
				</div>
			{/if}
		</div>
	{:else if activeTab === 'summary'}
		{@const currentDecodedTransfer = decodedErc20Transfer()}
		{@const currentRequestData = requestData as PKPSigningRequestData}
		{#if currentDecodedTransfer}
			<div
				class="mb-6 flex w-full max-w-xl flex-col gap-4 rounded-2xl border-2 border-green-400 bg-gradient-to-br from-green-50 to-[#fdf6ee] p-8 text-base shadow-lg"
			>
				<div class="mb-2 flex items-center gap-3">
					<svg
						class="h-9 w-9 text-green-500"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M17 9V7a5 5 0 00-10 0v2a5 5 0 00-1 9.9V21a1 1 0 001 1h10a1 1 0 001-1v-2.1A5 5 0 0017 9z"
						/></svg
					>
					<span class="text-2xl font-extrabold tracking-tight text-green-700">ERC-20 Transfer</span>
				</div>
				<div class="grid grid-cols-2 gap-x-6 gap-y-2">
					<div class="font-semibold text-green-900">Action:</div>
					<div class="font-mono text-green-800">{currentDecodedTransfer.functionName}</div>
					<div class="font-semibold text-green-900">Asset:</div>
					<div>
						{isLoadingTokenMeta
							? 'Loading...'
							: tokenName
								? `${tokenName} (${tokenSymbol})`
								: currentRequestData?.transaction?.to}
					</div>
					<div class="font-semibold text-green-900">From:</div>
					<div class="font-mono font-bold text-green-800">
						{internalPkpProfile?.pkpEthAddress
							? shortAddress(internalPkpProfile.pkpEthAddress)
							: 'N/A'}
					</div>
					<div class="font-semibold text-green-900">To:</div>
					<div class="font-mono font-bold text-green-800">
						{currentDecodedTransfer.to ? shortAddress(currentDecodedTransfer.to) : 'N/A'}
					</div>
					<div class="font-semibold text-green-900">Amount:</div>
					<div>
						<span class="font-mono text-lg font-bold text-green-900"
							>{currentDecodedTransfer.amountFormatted}</span
						>
					</div>
				</div>
			</div>
		{:else if currentRequestData?.type === 'message'}
			<div
				class="mb-6 flex w-full max-w-xl flex-col gap-4 rounded-2xl border-2 border-blue-400 bg-gradient-to-br from-blue-50 to-[#fdf6ee] p-8 text-base shadow-lg"
			>
				<div class="mb-2 flex items-center gap-3">
					<svg
						class="h-9 w-9 text-blue-500"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
						><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h8m-4-4v8" /></svg
					>
					<span class="text-2xl font-extrabold tracking-tight text-blue-700">Sign Message</span>
				</div>
				<div class="mb-1 font-semibold text-blue-900">Message:</div>
				<pre
					class="mb-3 rounded bg-blue-100 p-4 font-mono text-base whitespace-pre-wrap text-blue-800">{currentRequestData.message}</pre>
				<div class="font-semibold text-blue-900">From:</div>
				<div class="font-mono font-bold text-blue-800">
					{internalPkpProfile?.pkpEthAddress
						? shortAddress(internalPkpProfile.pkpEthAddress)
						: 'N/A'}
				</div>
			</div>
		{:else if currentRequestData?.type === 'executeAction'}
			<div
				class="mb-6 flex w-full max-w-xl flex-col gap-4 rounded-2xl border-2 border-purple-400 bg-gradient-to-br from-purple-50 to-[#fdf6ee] p-8 text-base shadow-lg"
			>
				<div class="mb-2 flex items-center gap-3">
					<svg
						class="h-9 w-9 text-purple-500"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
						/></svg
					>
					<span class="text-2xl font-extrabold tracking-tight text-purple-700"
						>Execute Lit Action</span
					>
				</div>
				<div class="font-semibold text-purple-900">Action Origin:</div>
				<div class="font-mono text-sm text-purple-800">Inline Code Snippet (see details)</div>
				<div class="font-semibold text-purple-900">Signer PKP:</div>
				<div class="font-mono font-bold text-purple-800">
					{internalPkpProfile?.pkpEthAddress
						? shortAddress(internalPkpProfile.pkpEthAddress)
						: 'N/A'}
				</div>
				<div class="font-semibold text-purple-900">Action JS Params:</div>
				<pre
					class="mb-3 rounded bg-purple-100 p-2 font-mono text-xs whitespace-pre-wrap text-purple-800">{JSON.stringify(
						currentRequestData?.actionJsParams || {},
						null,
						2
					)}</pre>
			</div>
		{:else if currentRequestData?.type === 'authenticateSession'}
			<div
				class="mb-6 flex w-full max-w-xl flex-col gap-4 rounded-2xl border-2 border-teal-400 bg-gradient-to-br from-teal-50 to-[#fdf6ee] p-8 text-base shadow-lg"
			>
				<div class="mb-2 flex items-center gap-3">
					<svg
						class="h-9 w-9 text-teal-500"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8zM5 10V7a7 7 0 0114 0v3M9 21a2 2 0 01-2-2V10a2 2 0 012-2h6a2 2 0 012 2v9a2 2 0 01-2 2H9z"
						/>
					</svg>
					<span class="text-2xl font-extrabold tracking-tight text-teal-700"
						>Authenticate Session</span
					>
				</div>
				<div class="font-semibold text-teal-900">Wallet to Authenticate:</div>
				<div class="font-mono font-bold text-teal-800">
					{internalPkpProfile?.pkpEthAddress
						? shortAddress(internalPkpProfile.pkpEthAddress)
						: isPkpProfileLoading
							? 'Loading PKP info...'
							: 'N/A'}
				</div>
				<div class="font-semibold text-teal-900">Requested Session Capabilities:</div>
				<ul class="list-disc pl-5 text-sm text-teal-800">
					{#each derivedRequestedCapabilities() as capability}
						<li>{capability}</li>
					{/each}
				</ul>
				{#if sessionDurationMessage && currentRequestData?.type === 'authenticateSession'}
					<p class="mt-2 text-sm font-semibold text-teal-700">{sessionDurationMessage}</p>
				{/if}
				<p class="mt-2 text-xs text-teal-600">
					This session will allow Hominio to use this wallet on your behalf until the session
					expires.
				</p>
			</div>
		{:else if currentRequestData?.type === 'encrypt'}
			<div
				class="mb-6 flex w-full max-w-xl flex-col gap-4 rounded-2xl border-2 border-cyan-400 bg-gradient-to-br from-cyan-50 to-[#fdf6ee] p-8 text-base shadow-lg"
			>
				<div class="mb-2 flex items-center gap-3">
					<svg
						class="h-9 w-9 text-cyan-500"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
					<span class="text-2xl font-extrabold tracking-tight text-cyan-700">Encrypt Data</span>
				</div>
				<div class="font-semibold text-cyan-900">Data to Encrypt:</div>
				<pre
					class="mb-3 rounded bg-cyan-100 p-2 font-mono text-xs whitespace-pre-wrap text-cyan-800">{currentRequestData?.dataToEncrypt
						? currentRequestData.dataToEncrypt.length > 100
							? currentRequestData.dataToEncrypt.substring(0, 97) + '...'
							: currentRequestData.dataToEncrypt
						: 'N/A'}</pre>
				<div class="font-semibold text-cyan-900">Signer PKP:</div>
				<div class="font-mono font-bold text-cyan-800">
					{internalPkpProfile?.pkpEthAddress
						? shortAddress(internalPkpProfile.pkpEthAddress)
						: 'N/A'}
				</div>
				<div class="font-semibold text-cyan-900">Access Conditions:</div>
				<div class="font-mono text-xs text-cyan-800">See details tab.</div>
			</div>
		{:else if currentRequestData?.type === 'decrypt'}
			<div
				class="mb-6 flex w-full max-w-xl flex-col gap-4 rounded-2xl border-2 border-orange-400 bg-gradient-to-br from-orange-50 to-[#fdf6ee] p-8 text-base shadow-lg"
			>
				<div class="mb-2 flex items-center gap-3">
					<svg
						class="h-9 w-9 text-orange-500"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.628 5.905M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/></svg
					>
					<span class="text-2xl font-extrabold tracking-tight text-orange-700">Decrypt Data</span>
				</div>
				<div class="font-semibold text-orange-900">Ciphertext Hash:</div>
				<pre
					class="mb-3 rounded bg-orange-100 p-2 font-mono text-xs whitespace-pre-wrap text-orange-800">{currentRequestData?.dataToEncryptHash ||
						'N/A'}</pre>
				<div class="font-semibold text-orange-900">Signer PKP:</div>
				<div class="font-mono font-bold text-orange-800">
					{internalPkpProfile?.pkpEthAddress
						? shortAddress(internalPkpProfile.pkpEthAddress)
						: 'N/A'}
				</div>
				<div class="font-semibold text-orange-900">Access Conditions:</div>
				<div class="font-mono text-xs text-orange-800">See details tab.</div>
			</div>
		{:else}
			<div
				class="mb-6 w-full max-w-xl rounded-xl border border-stone-300 bg-white p-6 text-base text-slate-700 shadow-sm"
			>
				{#if currentRequestData?.type === 'transaction'}
					No ABI-decoded summary available for this transaction. View raw details in the "Details"
					tab.
				{:else}
					Review details in the "Details" tab.
				{/if}
			</div>
		{/if}
	{:else if activeTab === 'details'}
		<pre
			class="mb-6 w-full max-w-xl overflow-x-auto rounded-xl border border-stone-200 bg-white p-6 text-xs whitespace-pre-wrap text-slate-700 shadow-sm">{JSON.stringify(
				displayData(),
				(key, value) => (typeof value === 'bigint' ? value.toString() : value),
				2
			)}</pre>
	{/if}

	{#if (pkpProfileError && !passkeyLoginUIVisible && !signResult) || (currentErrorInternal && !passkeyLoginUIVisible && !signResult && !pkpProfileError)}
		<div class="mb-2 rounded border border-red-300 bg-red-100 p-2 text-xs text-red-700">
			{pkpProfileError || currentErrorInternal}
		</div>
	{/if}

	<div class="mt-4 flex w-full max-w-xl justify-between gap-3">
		<button
			class="rounded-md border border-red-500 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-50/50 focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
			on:click={handleCancel}
			disabled={isSigning || (passkeyLoginUIVisible && isSessionLoading)}
		>
			Decline
		</button>
		<button
			class="bg-prussian-blue text-linen hover:bg-prussian-blue/90 focus:ring-prussian-blue focus:ring-opacity-50 rounded-md px-4 py-2 text-sm font-semibold focus:ring-2 focus:outline-none disabled:opacity-50"
			on:click={handleApproveOperation}
			disabled={isPkpProfileLoading ||
				!!pkpProfileError ||
				isSigning ||
				(passkeyLoginUIVisible && isSessionLoading) ||
				!internalLitNodeClient?.ready ||
				!internalPkpProfile ||
				!internalPkpProfile.passkeyData ||
				!internalPkpProfile.pkpTokenId}
		>
			{#if isPkpProfileLoading}
				<span class="spinner mr-2"></span>Loading Profile...
			{:else if isSessionLoading && passkeyLoginUIVisible}
				<span class="spinner mr-2"></span>Authenticating Passkey...
			{:else if isSigning}
				<span class="spinner mr-2"></span>Processing...
			{:else if isSessionLoading}
				<span class="spinner mr-2"></span>Preparing Session...
			{:else}Approve{/if}
		</button>
	</div>
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
</style>
