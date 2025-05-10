<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onMount } from 'svelte';
	import { signTransactionWithPKP, signWithPKP } from '$lib/wallet/lit';
	import { decodeFunctionData, formatUnits, keccak256, hexToBytes } from 'viem';
	import { roadmapConfig } from '$lib/roadmap/config';
	import { createPublicClient, http } from 'viem';
	import { gnosis } from 'viem/chains';
	import { shortAddress, resolveTokenMeta, getKnownTokenMeta } from '$lib/wallet/addressTokenUtils';

	// Props: requestData (object), onSign (function), onCancel (function)
	export let requestData: any = null;
	export let onSign: ((result: any) => void) | null = null;
	export let onCancel: (() => void) | null = null;

	if (!requestData?.pkpEthAddress) {
		throw new Error('PKP signing modal: pkpEthAddress is required in requestData.');
	}

	const dispatch = createEventDispatcher();

	let isSigning = false;
	let error: string | null = null;
	let activeTab: 'summary' | 'details' = 'summary';
	let signResult: { success: boolean; message: string } | null = null;
	let signTimeout: ReturnType<typeof setTimeout> | null = null;

	// Tab navigation style variables
	const tabBase =
		'px-4 py-2 text-sm font-semibold focus:outline-none border-b-2 transition-colors duration-150';
	const tabActive = 'border-emerald-500 text-emerald-700 bg-emerald-50';
	const tabInactive = 'border-transparent text-slate-500 hover:text-emerald-700';

	$: displayData = (() => {
		if (!requestData || typeof requestData !== 'object') return requestData;
		const { litNodeClient, sessionSigs, ...rest } = requestData;
		return rest;
	})();

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

	$: decodedErc20Transfer = (() => {
		if (!requestData || requestData.type !== 'transaction' || !requestData.transaction?.data)
			return null;
		try {
			const decoded = decodeFunctionData({
				abi: erc20Abi,
				data: requestData.transaction.data
			});
			if (decoded.functionName === 'transfer') {
				const [to, amount] = decoded.args as [string, bigint];
				// Try to get decimals from requestData if present, else default to 18
				const decimals = requestData.transaction.tokenDecimals ?? 18;
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
	})();

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

	let tokenName: string | null = null;
	let tokenSymbol: string | null = null;
	let isLoadingTokenMeta = false;

	$: if (decodedErc20Transfer && requestData.transaction?.to) {
		isLoadingTokenMeta = true;
		resolveTokenMeta(requestData.transaction.to).then((meta) => {
			tokenName = meta.name;
			tokenSymbol = meta.symbol;
			isLoadingTokenMeta = false;
		});
	}

	function showSuccess(message: string) {
		signResult = { success: true, message };
		if (signTimeout) clearTimeout(signTimeout);
		signTimeout = setTimeout(() => {
			signResult = null;
			if (onCancel) onCancel(); // Close modal after success
		}, 2500);
	}
	function showError(message: string) {
		signResult = { success: false, message };
		if (signTimeout) clearTimeout(signTimeout);
	}

	async function handleSign() {
		isSigning = true;
		error = null;
		try {
			if (!requestData || !requestData.type) {
				showError('Invalid or missing signing request data.');
				throw new Error('Invalid or missing signing request data.');
			}
			if (requestData.type === 'transaction') {
				const { litNodeClient, sessionSigs, pkpPublicKey, transaction } = requestData;
				if (!litNodeClient || !sessionSigs || !pkpPublicKey || !transaction) {
					showError('Missing required signing parameters.');
					throw new Error('Missing required signing parameters.');
				}
				const signature = await signTransactionWithPKP(
					litNodeClient,
					sessionSigs,
					pkpPublicKey,
					transaction
				);
				if (onSign) {
					onSign(signature);
					dispatch('signed', { result: signature });
					showSuccess('Transaction signed and submitted!');
				}
			} else if (requestData.type === 'message') {
				const { litNodeClient, sessionSigs, pkpPublicKey, message } = requestData;
				if (!litNodeClient || !sessionSigs || !pkpPublicKey || !message) {
					showError('Missing required signing parameters for message.');
					throw new Error('Missing required signing parameters for message.');
				}
				const signatureResult = await signWithPKP(
					litNodeClient,
					sessionSigs,
					pkpPublicKey,
					message
				);
				if (onSign) {
					onSign(signatureResult);
					dispatch('signed', { result: signatureResult });
					showSuccess('Message signed successfully!');
				}
			} else {
				showError('Unsupported signing request type.');
				throw new Error('Unsupported signing request type.');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			showError(error);
		} finally {
			isSigning = false;
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
	<h2 class="mb-4 text-2xl font-extrabold tracking-tight text-slate-800">PKP Signature Request</h2>
	<p class="mb-6 text-base text-slate-600">Please review and approve the data to be signed:</p>
	<!-- Tab Navigation -->
	<div class="mb-6 flex w-full max-w-xl border-b border-stone-300">
		<button
			class={`${tabBase} ${activeTab === 'summary' ? tabActive : tabInactive}`}
			on:click={() => (activeTab = 'summary')}
			aria-selected={activeTab === 'summary'}>Summary</button
		>
		<button
			class={`${tabBase} ${activeTab === 'details' ? tabActive : tabInactive}`}
			on:click={() => (activeTab = 'details')}
			aria-selected={activeTab === 'details'}>Details</button
		>
	</div>
	<!-- Tab Content -->
	{#if signResult}
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
	{:else if activeTab === 'summary'}
		{#if decodedErc20Transfer}
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
					<div class="font-mono text-green-800">{decodedErc20Transfer.functionName}</div>
					<div class="font-semibold text-green-900">Asset:</div>
					<div>
						{isLoadingTokenMeta
							? 'Loading...'
							: tokenName
								? `${tokenName} (${tokenSymbol})`
								: requestData.transaction?.to}
					</div>
					<div class="font-semibold text-green-900">From:</div>
					<div class="font-mono font-bold text-green-800">
						{shortAddress(requestData.pkpEthAddress)}
					</div>
					<div class="font-semibold text-green-900">To:</div>
					<div class="font-mono font-bold text-green-800">
						{shortAddress(decodedErc20Transfer.to)}
					</div>
					<div class="font-semibold text-green-900">Amount:</div>
					<div>
						<span class="font-mono text-lg font-bold text-green-900"
							>{decodedErc20Transfer.amountFormatted}</span
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
					{shortAddress(requestData.pkpEthAddress)}
				</div>
			</div>
		{:else}
			<div
				class="mb-6 w-full max-w-xl rounded-xl border border-stone-300 bg-white p-6 text-base text-slate-700 shadow-sm"
			>
				No ABI-decoded summary available for this transaction.
			</div>
		{/if}
	{:else if activeTab === 'details'}
		<pre
			class="mb-6 w-full max-w-xl overflow-x-auto rounded-xl border border-stone-200 bg-white p-6 text-xs whitespace-pre-wrap text-slate-700 shadow-sm">{JSON.stringify(
				displayData,
				(key, value) => (typeof value === 'bigint' ? value.toString() : value),
				2
			)}</pre>
	{/if}
	{#if error}
		<div class="mb-2 rounded border border-red-300 bg-red-100 p-2 text-xs text-red-700">
			{error}
		</div>
	{/if}
	<div class="mt-4 flex w-full max-w-xl justify-between gap-2">
		<button
			class="rounded bg-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-300"
			on:click={handleCancel}
			disabled={isSigning}>Cancel</button
		>
		<button
			class="rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
			on:click={handleSign}
			disabled={isSigning}
		>
			{#if isSigning}<span class="spinner mr-2"></span>Signing...{:else}Sign{/if}
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
