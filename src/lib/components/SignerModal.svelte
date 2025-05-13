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
	import type { AuthSig, SessionSigs, AuthCallbackParams } from '@lit-protocol/types';
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

	const sahelPhaseConfig = roadmapConfig.phases.find((p) => p.name === 'Sahelanthropus');
	const GNOSIS_RPC_URL = sahelPhaseConfig?.rpcUrls?.default?.http?.[0];

	// Props: requestData (object), onSign (function), onCancel (function)
	let { requestData, onSign, onCancel } = $props<{
		requestData: PKPSigningRequestData | null;
		onSign: ((result: any) => void) | null;
		onCancel: (() => void) | null;
	}>();

	if (!requestData?.pkpEthAddress || !requestData?.pkpPublicKey) {
		throw new Error(
			'PKP signing modal: pkpEthAddress and pkpPublicKey are required in requestData.'
		);
	}

	const dispatch = createEventDispatcher();

	// Internal State for session and passkey management
	let internalSessionSigs: SessionSigs | null = $state(null);
	let isSessionLoading: boolean = $state(false);
	let passkeyLoginUIVisible: boolean = $state(false);
	let internalLitNodeClient: LitNodeClient | null = $state(null);
	let sessionDurationMessage = $derived(
		requestData?.type === 'authenticateSession' ? 'This session will be valid for 1 minute.' : null
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
		const {
			pkpPublicKey,
			pkpEthAddress,
			type,
			transaction,
			message,
			actionCode,
			actionJsParams,
			dataToEncrypt,
			accessControlConditions,
			ciphertext,
			dataToEncryptHash,
			chain,
			tokenDecimals
		} = requestData;
		return {
			pkpPublicKey,
			pkpEthAddress,
			type,
			transaction: type === 'transaction' ? transaction : undefined,
			message: type === 'message' ? message : undefined,
			actionCode: type === 'executeAction' ? actionCode : undefined,
			actionJsParams: type === 'executeAction' ? actionJsParams : undefined,
			dataToEncrypt: type === 'encrypt' ? dataToEncrypt : undefined,
			accessControlConditions:
				type === 'encrypt' || type === 'decrypt' ? accessControlConditions : undefined,
			ciphertext: type === 'decrypt' ? ciphertext : undefined,
			dataToEncryptHash: type === 'decrypt' ? dataToEncryptHash : undefined,
			chain: type === 'decrypt' ? chain : undefined,
			tokenDecimals: transaction ? tokenDecimals : undefined
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
		if (!requestData || requestData.type !== 'transaction' || !requestData.transaction?.data)
			return null;
		try {
			const decoded = decodeFunctionData({
				abi: erc20Abi,
				data: requestData.transaction.data
			});
			if (decoded.functionName === 'transfer') {
				const [to, amount] = decoded.args as [string, bigint];
				const decimals = requestData.tokenDecimals ?? 18;
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
		const currentRequestData = requestData;

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
			// Reset if not applicable
			tokenName = null;
			tokenSymbol = null;
		}
	});

	const displayOperationType = $derived(() => {
		if (!requestData) return 'Unknown Operation';
		switch (requestData.type) {
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
		if (!requestData) return [];
		const capabilities: string[] = [];
		switch (requestData.type) {
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

	// Task 1.3: Define internalPasskeyAuthCallback (shell initially, then more complete)
	// This function is currently not directly used by the primary flow after Gnosis passkey integration.
	// The Gnosis-specific passkey flow is handled by getSessionSigsWithGnosisPasskeyVerification.
	// For the new authNeededCallback, we will inline similar logic or call a helper.
	async function internalPasskeyAuthCallback(params: AuthCallbackParams): Promise<AuthSig> {
		console.warn(
			'[SignerModal] internalPasskeyAuthCallback triggered, but flow should be managed by new getSessionSigsForOperation with inline Gnosis passkey auth.',
			params
		);
		// This specific implementation might need to be revisited if Lit SDK's generic getSessionSigs
		// requires this exact callback structure for Gnosis passkeys AND if getSessionSigsWithGnosisPasskeyVerification
		// isn't suitable for direct use within it. For now, the primary path will be the new helper.
		throw new Error(
			'internalPasskeyAuthCallback not fully wired for the new Gnosis passkey session flow via getSessionSigs. Should be handled within authNeededCallback of getSessionSigsForOperation.'
		);
	}

	// Task 1.4 (and 2.x stubs)
	async function executeRequestedOperation(sessionSigs: SessionSigs) {
		if (!requestData || !internalLitNodeClient) {
			showError('Missing request data or Lit client for operation execution.');
			return;
		}
		isSigning = true;
		currentErrorInternal = null;
		lastTxHash = null;
		explorerBaseUrl = null;

		try {
			let result: any;
			switch (requestData.type) {
				case 'message':
					if (!requestData.message) throw new Error('Message not provided for signing.');
					result = await signWithPKP(
						internalLitNodeClient,
						sessionSigs,
						requestData.pkpPublicKey,
						requestData.message
					);
					showSuccess('Message signed successfully!');
					break;
				case 'transaction':
					if (!requestData.transaction) throw new Error('Transaction not provided for signing.');
					result = await signTransactionWithPKP(
						internalLitNodeClient,
						sessionSigs,
						requestData.pkpPublicKey,
						requestData.transaction
					);
					const publicClient = createPublicClient({
						chain: gnosis,
						transport: http(GNOSIS_RPC_URL)
					});
					const signedRawTx = serializeTransaction(requestData.transaction, result);
					const txHash = await publicClient.sendRawTransaction({
						serializedTransaction: signedRawTx
					});
					lastTxHash = txHash;
					explorerBaseUrl = sahelPhaseConfig?.blockExplorers?.default?.url || null;
					showSuccess('Transaction signed and broadcasted successfully!');
					break;
				case 'executeAction':
					if (!requestData.actionCode) throw new Error('Lit Action code not provided.');
					// The pkpPublicKey is implicitly used by the sessionSigs for executeLitAction
					result = await executeLitAction(
						internalLitNodeClient,
						sessionSigs,
						requestData.actionCode,
						requestData.actionJsParams || {} // Ensure jsParams is at least an empty object
					);
					showSuccess('Lit Action executed successfully!');
					break;
				case 'encrypt':
					if (!requestData.dataToEncrypt) throw new Error('Data to encrypt not provided.');
					if (!requestData.accessControlConditions)
						throw new Error('Access control conditions not provided for encryption.');

					result = await encryptString(
						{
							accessControlConditions: requestData.accessControlConditions,
							dataToEncrypt: requestData.dataToEncrypt
						},
						internalLitNodeClient
					);
					showSuccess('Data encrypted successfully!');
					break;
				case 'decrypt':
					if (!requestData.ciphertext) throw new Error('Ciphertext not provided for decryption.');
					if (!requestData.dataToEncryptHash)
						throw new Error('DataToEncryptHash not provided for decryption.');
					if (!requestData.accessControlConditions)
						throw new Error('Access control conditions not provided for decryption.');

					result = await decryptToString(
						{
							accessControlConditions: requestData.accessControlConditions,
							ciphertext: requestData.ciphertext,
							dataToEncryptHash: requestData.dataToEncryptHash,
							chain: requestData.chain,
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
			// Do not call onCancel here, let user decide or timeout handle it.
		} finally {
			isSigning = false;
		}
	}

	// New function to encapsulate passkey interaction and session fetching
	async function initiatePasskeyAuthenticationAndGetSigs() {
		// Ensure requestData and its nested properties are checked before use
		if (
			!internalLitNodeClient ||
			!requestData || // Check requestData itself
			!requestData.passkeyData ||
			!requestData.pkpPublicKey // pkpPublicKey is used for logging/context
		) {
			showError(
				'Cannot initiate passkey auth: Lit client, request data, PKP public key, or passkey details missing.'
			);
			passkeyLoginUIVisible = false;
			isSessionLoading = false;
			// For the direct flow, throwing might be better so handleApproveOperation catches it.
			throw new Error(
				'Lit client, request data, PKP public key, or passkey details missing for initiatePasskeyAuthenticationAndGetSigs'
			);
		}

		// For generating the AuthSig via passkey authentication, we should always request
		// a signature for the wildcard PKP resource. This provides a general AuthSig
		// for the PKP, which the Lit SDK can then use to derive more specific SessionSigs
		// for the actual operation if needed.
		const pkpResourceForAuthSig = new LitPKPResource('*');
		console.log(
			`[SignerModal-initiatePasskeyAuth] Using LitPKPResource("*") to generate a general AuthSig for PKP ${requestData.pkpPublicKey}, regardless of operation type "${requestData.type}".`
		);
		const resourceAbilityRequestsForAuthSig = [
			{ resource: pkpResourceForAuthSig, ability: LitAbility.PKPSigning }
		];

		// If the operation is to execute a Lit Action, we also need to request permission
		// for LitActionExecution. For now, use a wildcard action resource.
		// Ideally, this would be scoped to the specific action's IPFS CID if available.
		if (requestData.type === 'executeAction') {
			resourceAbilityRequestsForAuthSig.push({
				resource: new LitActionResource('*'), // Wildcard for now
				ability: LitAbility.LitActionExecution
			});
			console.log(
				'[SignerModal-initiatePasskeyAuth] Added wildcard LitActionResource for executeAction type.'
			);
		}

		const { passkeyData, pkpPublicKey } = requestData; // pkpPublicKey for logging
		const { rawId, pubkeyCoordinates, passkeyVerifierContractAddress } = passkeyData;

		if (!rawId || !pubkeyCoordinates || !passkeyVerifierContractAddress) {
			throw new Error('Invalid passkey data format.');
		}

		// The pkpTokenId check for non-'authenticateSession' types might still be relevant
		// if other parts of the system rely on it being present in requestData, but it's not used
		// for constructing the LitPKPResource in THIS function anymore for AuthSig generation.
		if (requestData.type !== 'authenticateSession' && !requestData.pkpTokenId) {
			showError(
				`Cannot initiate passkey auth: pkpTokenId is missing in requestData for operation type '${requestData.type}'. This might be needed by other parts of the flow.`
			);
			passkeyLoginUIVisible = false;
			isSessionLoading = false;
			throw new Error(`pkpTokenId is missing for ${requestData.type}`);
		}

		// passkeyLoginUIVisible should be true already, set by the confirmation step in handleApproveOperation
		// isSessionLoading should be true already, set by the confirmation step in handleApproveOperation
		currentErrorInternal = null;

		try {
			console.log(
				'[SignerModal] Initiating passkey authentication for PKP:',
				requestData.pkpPublicKey
			);

			// Simplify the sessionChallengeMessage to avoid potential length issues if it's parsed as a resource ID.
			// The pkpPublicKey is already an explicit parameter to getSessionSigsWithGnosisPasskeyVerification.
			const sessionChallengeMessage = `Sign in to Hominio PKP Wallet via Passkey at ${new Date().toISOString()}`;
			// const sessionChallengeMessage = `Login to Hominio Signer Modal for PKP: ${requestData.pkpPublicKey} at ${new Date().toISOString()}`;
			const messageHashAsChallenge = keccak256(new TextEncoder().encode(sessionChallengeMessage));
			const rawIdBytes = hexToBytes(requestData.passkeyData.rawId as Hex);

			// REMOVED the switch statement that was incorrectly redefining pkpResource and resourceAbilityRequests
			// using requestData.pkpTokenId, which caused the length error.
			// We will ALWAYS use resourceAbilityRequestsForAuthSig (with LitPKPResource('*'))
			// for the getSessionSigsWithGnosisPasskeyVerification call in this function.

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

			// For the AuthSig generated here, it should be longer lived.
			// The SessionSigs derived from it will have shorter, operation-specific expiries.
			// Lit SDK defaults usually handle AuthSig expiry unless overridden.
			// The sessionExpiration here is for the SessionSigs being generated by getSessionSigsWithGnosisPasskeyVerification.
			const sessionExpiration = new Date(Date.now() + 1 * 60 * 1000).toISOString(); // 1 minute for this specific session sig

			const newSessionSigs = await getSessionSigsWithGnosisPasskeyVerification(
				internalLitNodeClient,
				requestData.pkpPublicKey as Hex,
				sessionChallengeMessage,
				assertion.response as AuthenticatorAssertionResponse,
				requestData.passkeyData,
				'ethereum', // Or requestData.chain if applicable for the session context
				resourceAbilityRequestsForAuthSig, // ALWAYS use the wildcard resource for AuthSig generation
				sessionExpiration // This expiration is for the SessionSigs
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
			// showError will be called by the calling function (handleApproveOperation)
			throw err; // Rethrow for the caller to handle UI error display
		} finally {
			// UI state like passkeyLoginUIVisible and isSessionLoading will be managed by handleApproveOperation
		}
	}

	// Task 1.2: Implement Session Acquisition and Operation Orchestration
	async function handleApproveOperation() {
		console.log('[SignerModal] handleApproveOperation called.');
		if (
			!internalLitNodeClient ||
			!internalLitNodeClient.ready ||
			!requestData ||
			!requestData.passkeyData || // passkeyData is crucial
			!requestData.pkpPublicKey ||
			!requestData.pkpEthAddress
		) {
			const errorMsg =
				'Lit client not ready, request data missing, or crucial PKP/passkey details unavailable.';
			console.error('[SignerModal handleApproveOperation] Pre-check failed:', errorMsg, {
				clientReady: internalLitNodeClient?.ready,
				hasRequestData: !!requestData,
				hasPasskeyData: !!requestData?.passkeyData,
				hasPkpPublicKey: !!requestData?.pkpPublicKey,
				hasPkpEthAddress: !!requestData?.pkpEthAddress
			});
			showError(errorMsg);
			return;
		}
		currentErrorInternal = null;
		signResult = null;

		// Show passkey UI and set loading states before calling initiatePasskeyAuthenticationAndGetSigs
		passkeyLoginUIVisible = true;
		isSessionLoading = true;
		isSigning = true; // Indicates overall operation processing, including passkey auth

		try {
			console.log(
				'[SignerModal handleApproveOperation] Calling initiatePasskeyAuthenticationAndGetSigs directly.'
			);
			const newSessionSigs = await initiatePasskeyAuthenticationAndGetSigs();

			// If initiatePasskeyAuthenticationAndGetSigs was successful, newSessionSigs is populated.
			// It would have thrown an error if it failed, which would be caught below.

			internalSessionSigs = newSessionSigs;
			console.log(
				'[SignerModal handleApproveOperation] Successfully obtained sessionSigs directly, proceeding to execute.',
				newSessionSigs
			);

			// Hide passkey UI as authentication is done
			passkeyLoginUIVisible = false;
			// isSessionLoading might be set false here or in executeRequestedOperation's finally block
			// isSigning remains true until executeRequestedOperation finishes

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
			// Reset all loading/UI states here to ensure consistency
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
	<!-- Tab Navigation -->
	<div class="mb-6 flex w-full max-w-xl border-b border-stone-300">
		<button
			class={`${tabBase} ${activeTab === 'summary' ? tabActive : tabInactive}`}
			on:click={() => (activeTab = 'summary')}
			aria-selected={activeTab === 'summary'}>Summary</button
		>
		{#if requestData?.type !== 'authenticateSession'}
			<button
				class={`${tabBase} ${activeTab === 'details' ? tabActive : tabInactive}`}
				on:click={() => (activeTab = 'details')}
				aria-selected={activeTab === 'details'}>Details</button
			>
		{/if}
	</div>
	<!-- Tab Content -->
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
				PKP: {requestData?.pkpEthAddress ? shortAddress(requestData.pkpEthAddress) : 'N/A'}
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
								: requestData?.transaction?.to}
					</div>
					<div class="font-semibold text-green-900">From:</div>
					<div class="font-mono font-bold text-green-800">
						{requestData?.pkpEthAddress ? shortAddress(requestData.pkpEthAddress) : 'N/A'}
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
		{:else if requestData?.type === 'message'}
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
					class="mb-3 rounded bg-blue-100 p-4 font-mono text-base whitespace-pre-wrap text-blue-800">{requestData.message}</pre>
				<div class="font-semibold text-blue-900">From:</div>
				<div class="font-mono font-bold text-blue-800">
					{requestData?.pkpEthAddress ? shortAddress(requestData.pkpEthAddress) : 'N/A'}
				</div>
			</div>
		{:else if requestData?.type === 'executeAction'}
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
					{requestData?.pkpEthAddress ? shortAddress(requestData.pkpEthAddress) : 'N/A'}
				</div>
				<div class="font-semibold text-purple-900">Action JS Params:</div>
				<pre
					class="mb-3 rounded bg-purple-100 p-2 font-mono text-xs whitespace-pre-wrap text-purple-800">{JSON.stringify(
						requestData?.actionJsParams || {},
						null,
						2
					)}</pre>
			</div>
		{:else if requestData?.type === 'authenticateSession'}
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
					{requestData?.pkpEthAddress ? shortAddress(requestData.pkpEthAddress) : 'N/A'}
				</div>
				<div class="font-semibold text-teal-900">Requested Session Capabilities:</div>
				<ul class="list-disc pl-5 text-sm text-teal-800">
					{#each derivedRequestedCapabilities() as capability}
						<li>{capability}</li>
					{/each}
				</ul>
				{#if sessionDurationMessage && requestData?.type === 'authenticateSession'}
					<p class="mt-2 text-sm font-semibold text-teal-700">{sessionDurationMessage}</p>
				{/if}
				<p class="mt-2 text-xs text-teal-600">
					This session will allow Hominio to use this wallet on your behalf until the session
					expires.
				</p>
			</div>
		{:else if requestData?.type === 'encrypt'}
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
					class="mb-3 rounded bg-cyan-100 p-2 font-mono text-xs whitespace-pre-wrap text-cyan-800">{requestData?.dataToEncrypt
						? requestData.dataToEncrypt.length > 100
							? requestData.dataToEncrypt.substring(0, 97) + '...'
							: requestData.dataToEncrypt
						: 'N/A'}</pre>
				<div class="font-semibold text-cyan-900">Signer PKP:</div>
				<div class="font-mono font-bold text-cyan-800">
					{requestData?.pkpEthAddress ? shortAddress(requestData.pkpEthAddress) : 'N/A'}
				</div>
				<div class="font-semibold text-cyan-900">Access Conditions:</div>
				<div class="font-mono text-xs text-cyan-800">See details tab.</div>
			</div>
		{:else if requestData?.type === 'decrypt'}
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
					class="mb-3 rounded bg-orange-100 p-2 font-mono text-xs whitespace-pre-wrap text-orange-800">{requestData?.dataToEncryptHash ||
						'N/A'}</pre>
				<div class="font-semibold text-orange-900">Signer PKP:</div>
				<div class="font-mono font-bold text-orange-800">
					{requestData?.pkpEthAddress ? shortAddress(requestData.pkpEthAddress) : 'N/A'}
				</div>
				<div class="font-semibold text-orange-900">Access Conditions:</div>
				<div class="font-mono text-xs text-orange-800">See details tab.</div>
			</div>
		{:else}
			<div
				class="mb-6 w-full max-w-xl rounded-xl border border-stone-300 bg-white p-6 text-base text-slate-700 shadow-sm"
			>
				{#if requestData?.type === 'transaction'}
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

	{#if currentErrorInternal && !passkeyLoginUIVisible}
		<div class="mb-2 rounded border border-red-300 bg-red-100 p-2 text-xs text-red-700">
			{currentErrorInternal}
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
			disabled={isSigning ||
				(passkeyLoginUIVisible && isSessionLoading) ||
				!internalLitNodeClient?.ready ||
				!requestData?.passkeyData}
		>
			{#if isSessionLoading && passkeyLoginUIVisible}
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
