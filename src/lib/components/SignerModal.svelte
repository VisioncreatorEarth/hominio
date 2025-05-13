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
	import { browser } from '$app/environment';
	import { getSessionSigsWithGnosisPasskeyVerification, executeLitAction } from '$lib/wallet/lit';
	import type { Hex } from 'viem';
	import { encryptString, decryptToString } from '@lit-protocol/encryption';
	import { createPublicClient, http, serializeTransaction } from 'viem';
	import { gnosis } from 'viem/chains';

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
	async function internalPasskeyAuthCallback(params: AuthCallbackParams): Promise<AuthSig> {
		console.log('[SignerModal] internalPasskeyAuthCallback triggered', params);
		if (
			!browser ||
			!requestData?.passkeyData ||
			!requestData?.pkpPublicKey ||
			!internalLitNodeClient
		) {
			throw new Error(
				'Passkey auth callback: Missing browser, stored passkey, PKP public key, or Lit client.'
			);
		}

		passkeyLoginUIVisible = true;
		isSessionLoading = true; // Indicate passkey interaction is a form of session loading
		currentErrorInternal = null;

		try {
			console.error(
				'internalPasskeyAuthCallback: This path might be incorrect for Gnosis EIP-1271 passkeys. Expecting direct call to getSessionSigsWithGnosisPasskeyVerification.'
			);
			throw new Error(
				'Passkey authentication via generic authNeededCallback not fully implemented for this EIP-1271 setup. Use dedicated Gnosis passkey session function.'
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			currentErrorInternal = `Passkey Auth Error: ${msg}`;
			showError(currentErrorInternal);
			throw err; // Rethrow to fail the getSessionSigs call
		} finally {
			passkeyLoginUIVisible = false; // Hide prompt once done or failed
			isSessionLoading = false;
		}
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
		if (!internalLitNodeClient || !requestData || !requestData.passkeyData) {
			showError(
				'Cannot initiate passkey auth: Lit client, request data, or passkey details missing from request.'
			);
			passkeyLoginUIVisible = false;
			isSessionLoading = false;
			return;
		}

		// passkeyLoginUIVisible should be true already, set by the confirmation step
		// isSessionLoading should be true already, set by the confirmation step
		currentErrorInternal = null;

		try {
			console.log(
				'[SignerModal] Initiating passkey authentication for PKP:',
				requestData.pkpPublicKey
			);

			const sessionChallengeMessage = `Login to Hominio Signer Modal for PKP: ${requestData.pkpPublicKey} at ${new Date().toISOString()}`;
			const messageHashAsChallenge = keccak256(new TextEncoder().encode(sessionChallengeMessage));
			const rawIdBytes = hexToBytes(requestData.passkeyData.rawId as Hex);

			let pkpResource = new LitPKPResource('*');
			let actionResource = new LitActionResource('*');
			let resourceAbilityRequests;
			switch (requestData.type) {
				case 'message':
				case 'transaction':
				case 'encrypt':
				case 'decrypt':
					resourceAbilityRequests = [
						{
							resource: pkpResource,
							ability: 'pkp-signing' as const
						}
					];
					break;
				case 'executeAction':
					resourceAbilityRequests = [
						{
							resource: pkpResource,
							ability: 'pkp-signing' as const
						},
						{
							resource: actionResource,
							ability: 'lit-action-execution' as const
						}
					];
					break;
				case 'authenticateSession':
					resourceAbilityRequests = [
						{
							resource: pkpResource,
							ability: 'pkp-signing' as const
						},
						{
							resource: actionResource,
							ability: 'lit-action-execution' as const
						}
					];
					break;
				default:
					throw new Error('Unsupported operation type for resource capabilities.');
			}

			console.log(
				'[SignerModal] Effective Resource Keys for Session Sigs:',
				JSON.stringify(
					resourceAbilityRequests.map((rar) => ({
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

			const sessionExpiration = new Date(Date.now() + 1 * 60 * 1000).toISOString(); // 1 minute expiration

			const newSessionSigs = await getSessionSigsWithGnosisPasskeyVerification(
				internalLitNodeClient,
				requestData.pkpPublicKey,
				sessionChallengeMessage,
				assertion.response as AuthenticatorAssertionResponse,
				requestData.passkeyData,
				'ethereum', // Or requestData.chain if applicable for the session context
				resourceAbilityRequests,
				sessionExpiration // Pass the 1-minute expiration
			);
			internalSessionSigs = newSessionSigs;
			passkeyLoginUIVisible = false; // Hide passkey prompt, back to main modal view
			console.log('[SignerModal] Successfully obtained new sessionSigs with 1-min expiration.');

			if (!internalSessionSigs) {
				throw new Error('Failed to obtain PKP session after passkey. Cannot proceed.');
			}

			await executeRequestedOperation(internalSessionSigs);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			showError(`Passkey Auth/Session Error: ${msg}`);
			passkeyLoginUIVisible = false; // Ensure UI is reset on error
		} finally {
			isSessionLoading = false;
		}
	}

	// Task 1.2: Implement Session Acquisition and Operation Orchestration
	async function handleApproveOperation() {
		if (
			!internalLitNodeClient ||
			!internalLitNodeClient.ready ||
			!requestData ||
			!requestData.passkeyData
		) {
			showError(
				'Lit client not ready, request data missing, or no passkey details available in request.'
			);
			return;
		}
		currentErrorInternal = null;
		signResult = null;
		passkeyLoginUIVisible = true;
		isSessionLoading = true;
		await initiatePasskeyAuthenticationAndGetSigs();
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
				? 'border-green-400 bg-green-50'
				: 'border-red-400 bg-red-50'} flex items-center gap-3 p-6 text-base shadow-md"
		>
			{#if signResult.success}
				<svg
					class="h-8 w-8 text-green-500"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					viewBox="0 0 24 24"
					><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg
				>
				<span class="text-lg font-semibold text-green-700">{signResult.message}</span>
				{#if lastTxHash}
					<div class="mt-2 w-full">
						<p class="text-xs text-green-700">Transaction Hash:</p>
						{#if explorerBaseUrl}
							<a
								href={`${explorerBaseUrl.endsWith('/') ? explorerBaseUrl : explorerBaseUrl + '/'}tx/${lastTxHash}`}
								target="_blank"
								rel="noopener noreferrer"
								class="block rounded bg-green-200 p-1 break-all text-green-800 hover:underline"
								>{lastTxHash}</a
							>
						{:else}
							<code class="block rounded bg-green-200 p-1 break-all text-green-800"
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

	<div class="mt-4 flex w-full max-w-xl justify-between gap-2">
		<button
			class="rounded bg-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-300"
			on:click={handleCancel}
			disabled={isSigning || isSessionLoading}>Cancel</button
		>
		<button
			class="rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
			on:click={handleApproveOperation}
			disabled={isSigning ||
				isSessionLoading ||
				!internalLitNodeClient?.ready ||
				!requestData?.passkeyData ||
				passkeyLoginUIVisible}
		>
			{#if isSessionLoading && !passkeyLoginUIVisible}<span class="spinner mr-2"></span>Checking
				Session...{:else if isSigning}<span class="spinner mr-2"
				></span>Processing...{:else}Approve{/if}
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
