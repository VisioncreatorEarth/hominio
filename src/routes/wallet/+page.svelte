<script lang="ts">
	import { onMount } from 'svelte';
	import {
		createAndStorePasskeyData,
		getStoredPasskeyData,
		clearStoredPasskeyData,
		deployPasskeySignerContract,
		checkSignature
	} from '$lib/wallet/passkeySigner';
	import type { StoredPasskeyData } from '$lib/wallet/passkeySigner';

	let username = '';
	let storedPasskey: StoredPasskeyData | null = null;
	let isLoading = false;
	let errorMessage = '';
	let successMessage = '';
	let deploymentTxHash = '';
	let deployedSignerAddress: string | null = null;
	let verificationResult: { isCorrect: boolean; error?: string } | null = null;
	let messageToSign = 'Hello Passkey!';

	onMount(() => {
		storedPasskey = getStoredPasskeyData();
		if (storedPasskey?.signerContractAddress) {
			deployedSignerAddress = storedPasskey.signerContractAddress;
		}
	});

	async function handleCreatePasskey() {
		if (!username.trim()) {
			errorMessage = 'Please enter a username.';
			return;
		}
		isLoading = true;
		errorMessage = '';
		successMessage = '';
		deploymentTxHash = '';
		verificationResult = null;

		try {
			const newData = await createAndStorePasskeyData(username);
			if (newData) {
				storedPasskey = newData;
				successMessage = `Passkey created and stored for ${username}.`;
			} else {
				errorMessage = 'Failed to create and store passkey.';
			}
		} catch (error: any) {
			errorMessage = error.message || 'An unknown error occurred during passkey creation.';
			console.error(error);
		} finally {
			isLoading = false;
		}
	}

	function handleClearPasskey() {
		clearStoredPasskeyData();
		storedPasskey = null;
		username = '';
		successMessage = 'Passkey data cleared.';
		errorMessage = '';
		deploymentTxHash = '';
		verificationResult = null;
	}

	async function handleDeployContract() {
		isLoading = true;
		errorMessage = '';
		successMessage = '';
		deploymentTxHash = '';
		verificationResult = null;

		try {
			const result = await deployPasskeySignerContract();
			if (result) {
				deploymentTxHash = result.txHash;
				if (result.signerAddress) {
					deployedSignerAddress = result.signerAddress;
					successMessage = `Signer contract deployment transaction sent: ${result.txHash}. Waiting for confirmation... (Address: ${result.signerAddress})`;
				} else {
					successMessage = `Deployment transaction sent (${result.txHash}), but couldn't extract address from logs.`;
				}
				storedPasskey = getStoredPasskeyData();
			} else {
				errorMessage = 'Deployment failed. Check console and wallet connection.';
			}
		} catch (error: any) {
			errorMessage = error.message || 'An unknown error occurred during deployment.';
			console.error(error);
		} finally {
			isLoading = false;
		}
	}

	async function handleSignAndVerify() {
		if (!messageToSign.trim()) {
			errorMessage = 'Please enter a message to sign.';
			return;
		}
		isLoading = true;
		errorMessage = '';
		successMessage = '';
		verificationResult = null;

		try {
			verificationResult = await checkSignature(messageToSign);
			if (verificationResult.isCorrect) {
				successMessage = 'Signature verified successfully on-chain!';
			} else {
				errorMessage = `Signature Verification Failed: ${verificationResult.error || 'Contract returned invalid magic value.'}`;
			}
		} catch (error: any) {
			errorMessage = `Error during signature verification: ${error.message}`;
			console.error(error);
		} finally {
			isLoading = false;
		}
	}
</script>

<div
	class="flex min-h-screen flex-col items-center bg-gradient-to-b from-slate-900 to-slate-800 p-8 text-white"
>
	<h1
		class="mb-8 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-4xl font-bold text-transparent"
	>
		Direct Passkey EIP-1271 Signer
	</h1>

	{#if errorMessage}
		<div class="mb-6 w-full max-w-2xl rounded-md bg-red-500 p-4 text-white shadow-lg">
			{errorMessage}
		</div>
	{/if}

	{#if successMessage}
		<div class="mb-6 w-full max-w-2xl rounded-md bg-green-600 p-4 text-white shadow-lg">
			{successMessage}
		</div>
	{/if}

	<!-- Section 1: Create Passkey -->
	<div
		class="mb-8 w-full max-w-2xl rounded-lg bg-white/10 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
	>
		<h2 class="mb-4 text-2xl font-semibold">1. Passkey Management</h2>
		{#if !storedPasskey}
			<form on:submit|preventDefault={handleCreatePasskey} class="space-y-4">
				<p class="mb-4 text-slate-300">
					Create a passkey credential to associate with an on-chain signer contract.
				</p>
				<div>
					<label for="username" class="mb-1 block text-sm font-medium text-slate-300"
						>Username</label
					><input
						type="text"
						id="username"
						bind:value={username}
						class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500 focus:outline-none"
						placeholder="Enter a name for this passkey"
						required
					/>
				</div>
				<button
					type="submit"
					class="flex w-full justify-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-800 focus:outline-none disabled:opacity-50"
					disabled={isLoading}>{isLoading ? 'Creating...' : 'Create Passkey'}</button
				>
			</form>
		{:else}
			<h3 class="mb-2 text-lg font-medium">
				Passkey Created for: <span class="font-bold text-purple-400">{storedPasskey.username}</span>
			</h3>
			<div class="space-y-3 rounded-md bg-slate-800/50 p-4 text-sm">
				<div class="break-all">
					<span class="font-semibold text-slate-400">Raw ID (Hex):</span>
					{storedPasskey.rawId}
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
						<span class="font-semibold text-slate-400">Deployed Signer:</span><a
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

	<!-- Section 2: Deploy Signer Contract (No Prediction Step) -->
	{#if storedPasskey && !deployedSignerAddress}
		<div
			class="mb-8 w-full max-w-2xl rounded-lg bg-white/10 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
		>
			<h2 class="mb-4 text-2xl font-semibold">2. Deploy EIP-1271 Signer Contract</h2>

			<p class="mb-4 text-slate-300">
				Attempt to deploy the signer contract for the current passkey. Prediction failed due to
				potential on-chain issues.
			</p>

			<button
				on:click={handleDeployContract}
				class="flex w-full justify-center rounded-md border border-transparent bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:ring-offset-slate-800 focus:outline-none disabled:opacity-50"
				disabled={isLoading}
			>
				{isLoading
					? 'Deploying...'
					: deployedSignerAddress
						? 'Deployed / Deploying'
						: 'Deploy Signer Contract'}
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

	<!-- Section 3: Sign & Verify -->
	{#if deployedSignerAddress}
		<div
			class="w-full max-w-2xl rounded-lg bg-white/10 p-6 text-slate-100 shadow-xl backdrop-blur-sm"
		>
			<h2 class="mb-4 text-2xl font-semibold">3. Sign & Verify Message</h2>
			<div class="mb-4">
				<label for="messageToSign" class="mb-1 block text-sm font-medium text-slate-300"
					>Message to Sign</label
				><input
					id="messageToSign"
					bind:value={messageToSign}
					class="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500 focus:outline-none"
					placeholder="Enter a message"
				/>
			</div>
			<button
				on:click={handleSignAndVerify}
				class="flex w-full justify-center rounded-md border border-transparent bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-800 focus:outline-none disabled:opacity-50"
				disabled={isLoading}
				>{isLoading ? 'Verifying...' : 'Sign with Passkey & Verify On-Chain'}</button
			>

			{#if verificationResult !== null}
				<div
					class="mt-4 rounded-md p-4 {verificationResult.isCorrect
						? 'bg-green-800/50'
						: 'bg-red-800/50'}"
				>
					<p class="text-center font-semibold">
						{verificationResult.isCorrect
							? '✅ Signature Verified Successfully!'
							: '❌ Signature Verification Failed'}
					</p>
					{#if verificationResult.error}
						<p class="mt-1 text-center text-sm text-red-300">{verificationResult.error}</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
