<script lang="ts">
	import { getContext } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { authClient } from '$lib/KERNEL/hominio-auth';
	import {
		currentUserPkpProfileStore,
		type CurrentUserPkpProfile,
		ensurePkpProfileLoaded
	} from '$lib/stores/pkpSessionStore';
	import type { Hex, Address } from 'viem';
	import { pageMetadataStore } from '$lib/stores/layoutStore';
	import type { PageData } from './$types';
	import type { HominioFacade } from '$lib/KERNEL/hominio-svelte';
	import {
		getOwnedCapacityCredits,
		getPermittedAuthMethodsForPkp,
		type PermittedAuthMethod,
		type CapacityCredit
	} from '$lib/wallet/lit';

	// Use $props() for runes mode
	let { data } = $props<{ data: PageData }>();

	// Use $effect to update the page metadata store when data changes
	$effect(() => {
		if (data.title && data.description) {
			$pageMetadataStore = { title: data.title, description: data.description };
		}
	});

	const o = getContext<HominioFacade>('o');

	// Reactive user session data using $state and $effect for subscription
	const sessionStore = authClient.useSession();
	let sessionState = $state(get(sessionStore)); // Initialize with current sync value

	$effect(() => {
		const unsubscribe = sessionStore.subscribe((value) => {
			sessionState = value; // Update $state when store emits new values
		});
		return unsubscribe; // Cleanup subscription
	});

	// Derive dependent states from the reactive sessionState rune
	const isSessionPending = $derived(sessionState?.isPending ?? true);
	const sessionUser = $derived(sessionState?.data?.user);

	let userEmailDisplay = $derived(sessionUser?.email || 'N/A');
	let userIdDisplay = $derived(sessionUser?.id || 'N/A');
	let userCreatedAtDisplay = $derived(
		sessionUser?.createdAt ? new Date(sessionUser.createdAt).toLocaleDateString() : 'N/A'
	);

	let currentPkpProfile = $state<CurrentUserPkpProfile | null>(null);

	// State for wallet details (capacity credits and auth methods)
	let ownedCapacityCredits = $state<CapacityCredit[] | null>(null);
	let permittedAuthMethods = $state<PermittedAuthMethod[] | null>(null);
	let isLoadingWalletDetails = $state(false);
	let walletDetailsError = $state<string | null>(null);

	let generalIsLoading = $state(true); // For ensurePkpProfileLoaded and initial UI state
	let mainError = $state<string | null>(null);
	let mainSuccess = $state<string | null>(null);

	const settingsSections = [
		{ id: 'account', title: 'Account' },
		{ id: 'wallet', title: 'Wallet Info' },
		{ id: 'credits', title: 'Capacity Credits' }
	];
	let selectedSettingsSectionId = $state('account');

	const unsubscribePkpProfile = currentUserPkpProfileStore.subscribe((value) => {
		currentPkpProfile = value;
	});

	$effect(() => {
		async function setupPage() {
			generalIsLoading = true;
			console.log('[SettingsPage] Initializing page, ensuring PKP profile is loaded...');
			await ensurePkpProfileLoaded();
			console.log('[SettingsPage] PKP profile loading process complete.');
			generalIsLoading = false;
		}

		setupPage();
	});

	$effect(() => {
		async function fetchWalletDetails() {
			if (currentPkpProfile?.pkpEthAddress && currentPkpProfile?.pkpTokenId) {
				isLoadingWalletDetails = true;
				walletDetailsError = null;
				ownedCapacityCredits = null;
				permittedAuthMethods = null;
				try {
					console.log(
						`[SettingsPage] Fetching wallet details for PKP ETH Address: ${currentPkpProfile.pkpEthAddress} and Token ID: ${currentPkpProfile.pkpTokenId}`
					);
					const [credits, methods] = await Promise.all([
						getOwnedCapacityCredits(currentPkpProfile.pkpEthAddress),
						getPermittedAuthMethodsForPkp(currentPkpProfile.pkpTokenId)
					]);
					ownedCapacityCredits = credits;
					permittedAuthMethods = methods;
					console.log('[SettingsPage] Fetched Capacity Credits:', credits);
					console.log('[SettingsPage] Fetched Permitted Auth Methods:', methods);
				} catch (err: any) {
					console.error('[SettingsPage] Error fetching wallet details (credits/methods):', err);
					walletDetailsError = `Failed to fetch wallet details: ${err.message || 'Unknown error'}`;
				} finally {
					isLoadingWalletDetails = false;
				}
			} else {
				ownedCapacityCredits = null;
				permittedAuthMethods = null;
			}
		}

		if (browser && currentPkpProfile) {
			fetchWalletDetails();
		}
	});

	function formatAuthMethodType(type: bigint): string {
		switch (type) {
			case 1n:
				return 'EOA Wallet';
			case 2n:
				return 'Lit Action';
			case 3n:
				return 'WebAuthn (Legacy)';
			case 4n:
				return 'Passkey (WebAuthn)';
			case 5n:
				return 'Discord';
			case 6n:
				return 'Google';
			case 7n:
				return 'Custom JWT';
			default:
				return `Unknown Type (${type})`;
		}
	}

	function formatIpfsCid(hexId: Hex): string {
		if (hexId.toLowerCase() === '0x0000000000000000000000000000000000000000') {
			return 'N/A (Standard Passkey/EOA)';
		}
		return hexId;
	}

	function formatTimestamp(timestamp: bigint): string {
		if (timestamp === 0n) return 'Never';
		return new Date(Number(timestamp) * 1000).toLocaleString();
	}
</script>

<!-- 
  Outermost container: flex, full viewport height, overflow hidden.
  Background colors set for overall page and left aside.
-->
<div class="bg-linen text-prussian-blue flex h-full overflow-hidden">
	<!-- Left Navigation Pane -->
	<div class="w-64 flex-shrink-0 overflow-y-auto bg-stone-50 p-6">
		<!-- Added pt-10 to give some space at the top for nav items -->
		<nav class="flex flex-col space-y-1">
			{#each settingsSections as section}
				<button
					on:click={() => (selectedSettingsSectionId = section.id)}
					class="rounded-md px-3 py-2 text-left text-sm font-medium transition-colors
                    {selectedSettingsSectionId === section.id
						? 'bg-prussian-blue text-linen'
						: 'text-prussian-blue/80 hover:bg-prussian-blue/10'}"
				>
					{section.title}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Right Content Pane -->
	<div class="flex-1 overflow-y-auto p-6 md:p-8">
		<!-- Settings H1 title is removed -->
		<!-- Overall container pt-20, mx-auto, max-w-5xl are removed from this level -->

		<!-- General loading/error/success messages, centered within a max-width container -->
		<div class="mx-auto mb-6 max-w-3xl">
			{#if generalIsLoading && !currentPkpProfile}
				<div class="flex items-center justify-center rounded-lg bg-stone-50/50 p-8">
					<div class="spinner text-prussian-blue/80 mr-3 h-8 w-8"></div>
					<p class="text-prussian-blue/80 text-lg">Loading account settings...</p>
				</div>
			{:else if mainError}
				<div
					class="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700"
					role="alert"
				>
					<span class="font-medium">Error:</span>
					{mainError}
				</div>
			{/if}

			{#if mainSuccess}
				<div
					class="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-700"
					role="alert"
				>
					<span class="font-medium">Success:</span>
					{mainSuccess}
				</div>
			{/if}
		</div>

		<!-- Main content area for selected section, centered and styled -->
		<div class="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-xl md:p-8">
			{#if selectedSettingsSectionId === 'account'}
				<h2
					class="border-prussian-blue/20 text-prussian-blue mb-6 border-b pb-4 text-2xl font-semibold"
				>
					Account
				</h2>
				{#if isSessionPending}
					<div class="flex items-center justify-start p-4">
						<div class="spinner text-prussian-blue/80 mr-3 h-5 w-5"></div>
						<p class="text-prussian-blue/80 text-sm">Loading account details...</p>
					</div>
				{:else if sessionUser}
					<div class="space-y-4">
						<div>
							<label class="text-prussian-blue/70 block text-sm font-medium">User ID</label>
							<p class="text-prussian-blue mt-1 text-sm">{userIdDisplay}</p>
						</div>
						<div>
							<label class="text-prussian-blue/70 block text-sm font-medium">Email</label>
							<p class="text-prussian-blue mt-1 text-sm">{userEmailDisplay}</p>
						</div>
						<div>
							<label class="text-prussian-blue/70 block text-sm font-medium">Joined On</label>
							<p class="text-prussian-blue mt-1 text-sm">{userCreatedAtDisplay}</p>
						</div>
					</div>
				{:else}
					<p class="text-prussian-blue/70 p-4 text-sm">
						Account details are not available. You may need to log in again.
					</p>
				{/if}
			{:else if selectedSettingsSectionId === 'wallet'}
				<h2
					class="border-prussian-blue/20 text-prussian-blue mb-6 border-b pb-4 text-2xl font-semibold"
				>
					Wallet Info
				</h2>
				{#if currentPkpProfile}
					<div class="space-y-6">
						<div class="border-prussian-blue/20 space-y-3 rounded-md border p-4">
							<h3 class="text-prussian-blue text-lg font-medium">Core Wallet Info</h3>
							<div>
								<label class="text-prussian-blue/70 block text-xs font-medium"
									>Wallet Address (PKP)</label
								>
								<p class="text-prussian-blue mt-1 font-mono text-sm break-all">
									{currentPkpProfile.pkpEthAddress}
								</p>
							</div>
							<div>
								<label class="text-prussian-blue/70 block text-xs font-medium">PKP Public Key</label
								>
								<p class="text-prussian-blue/90 mt-1 font-mono text-xs break-all">
									{currentPkpProfile.pkpPublicKey}
								</p>
							</div>
							<div>
								<label class="text-prussian-blue/70 block text-xs font-medium">PKP Token ID</label>
								<p class="text-prussian-blue/90 mt-1 font-mono text-xs break-all">
									{currentPkpProfile.pkpTokenId}
								</p>
							</div>
						</div>

						{#if currentPkpProfile.passkeyData}
							<div class="border-prussian-blue/20 space-y-3 rounded-md border p-4">
								<h3 class="text-prussian-blue text-lg font-medium">Linked Passkey</h3>
								<div>
									<label class="text-prussian-blue/70 block text-xs font-medium"
										>Passkey Raw ID</label
									>
									<p class="text-prussian-blue/90 mt-1 font-mono text-xs break-all">
										{currentPkpProfile.passkeyData.rawId}
									</p>
								</div>
								<div>
									<label class="text-prussian-blue/70 block text-xs font-medium"
										>Passkey Username</label
									>
									<p class="text-prussian-blue mt-1 text-sm">
										{currentPkpProfile.passkeyData.username}
									</p>
								</div>
								{#if currentPkpProfile.passkeyData.passkeyVerifierContractAddress}
									<div>
										<label class="text-prussian-blue/70 block text-xs font-medium"
											>Passkey Verifier Contract</label
										>
										<p class="text-prussian-blue/90 mt-1 font-mono text-xs break-all">
											{currentPkpProfile.passkeyData.passkeyVerifierContractAddress}
										</p>
									</div>
								{/if}
							</div>
						{/if}

						{#if isLoadingWalletDetails}
							<div class="flex items-center justify-center rounded-lg bg-stone-50/50 p-6">
								<div class="spinner text-prussian-blue/80 mr-3 h-6 w-6"></div>
								<p class="text-md text-prussian-blue/80">Loading wallet details...</p>
							</div>
						{:else if walletDetailsError}
							<div class="rounded-md bg-red-50 p-4">
								<p class="text-sm text-red-700">
									<span class="font-medium">Could not load additional wallet details:</span>
									{walletDetailsError}
								</p>
							</div>
						{/if}

						<div class="border-prussian-blue/20 space-y-3 rounded-md border p-4">
							<h3 class="text-prussian-blue text-lg font-medium">Authorized Methods</h3>
							{#if !isLoadingWalletDetails && permittedAuthMethods && permittedAuthMethods.length > 0}
								<ul class="divide-prussian-blue/20 divide-y">
									{#each permittedAuthMethods as method (method.id + method.authMethodType.toString())}
										<li class="py-3">
											<p class="text-prussian-blue/80 text-sm font-medium">
												Type: <span class="text-prussian-blue"
													>{formatAuthMethodType(method.authMethodType)}</span
												>
											</p>
											{#if method.authMethodType === 2n}
												<p class="text-prussian-blue/70 text-xs">
													Action CID: <span class="font-mono break-all"
														>{formatIpfsCid(method.id)}</span
													>
												</p>
											{:else if method.authMethodType === 4n}
												<p class="text-prussian-blue/70 text-xs">
													Passkey Identifier (User PubKey on Contract): <span
														class="font-mono break-all">{method.userPubkey}</span
													>
												</p>
											{:else}
												<p class="text-prussian-blue/70 text-xs">
													Method ID: <span class="font-mono break-all">{method.id}</span>
												</p>
												<p class="text-prussian-blue/70 text-xs">
													User PubKey on Contract: <span class="font-mono break-all"
														>{method.userPubkey}</span
													>
												</p>
											{/if}
										</li>
									{/each}
								</ul>
							{:else if !isLoadingWalletDetails && (!permittedAuthMethods || permittedAuthMethods.length === 0)}
								<p class="text-prussian-blue/70 text-sm">
									No specific permitted auth methods found (or some types are not displayed here).
								</p>
							{:else if !isLoadingWalletDetails && walletDetailsError}{/if}
						</div>
					</div>
				{:else}
					<div class="bg-timberwolf-2 rounded-xl p-6 text-center shadow-lg md:p-8">
						<p class="text-prussian-blue mb-3 text-lg font-medium">
							No Hominio Wallet (PKP) found for your account.
						</p>
						<p class="text-prussian-blue/80 mb-4 text-sm">
							You can set up a new Hominio Wallet to enable advanced features.
						</p>
						<a
							href="/me/signin"
							class="focus:ring-opacity-50 bg-prussian-blue text-linen hover:bg-prussian-blue/90 focus:ring-prussian-blue/50 inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold focus:ring-2 focus:outline-none"
						>
							Set Up Hominio Wallet
						</a>
					</div>
				{/if}
			{:else if selectedSettingsSectionId === 'credits'}
				<h2
					class="border-prussian-blue/20 text-prussian-blue mb-6 border-b pb-4 text-2xl font-semibold"
				>
					Capacity Credits
				</h2>
				{#if currentPkpProfile}
					{#if isLoadingWalletDetails}
						<div class="flex items-center justify-center rounded-lg bg-stone-50/50 p-6">
							<div class="spinner text-prussian-blue/80 mr-3 h-6 w-6"></div>
							<p class="text-md text-prussian-blue/80">Loading capacity credits...</p>
						</div>
					{:else if walletDetailsError}
						<div class="rounded-md bg-red-50 p-4">
							<p class="text-sm text-red-700">
								<span class="font-medium">Could not load capacity credits:</span>
								{walletDetailsError}
							</p>
						</div>
					{/if}

					<div class="border-prussian-blue/20 space-y-3 rounded-md border p-4">
						{#if !isLoadingWalletDetails && ownedCapacityCredits && ownedCapacityCredits.length > 0}
							<ul class="divide-prussian-blue/20 divide-y">
								{#each ownedCapacityCredits as credit (credit.tokenId)}
									<li class="py-3">
										<p class="text-prussian-blue/80 text-sm font-medium">
											Token ID: <span class="text-prussian-blue font-mono text-xs"
												>{credit.tokenId}</span
											>
										</p>
										<p class="text-prussian-blue/70 text-xs">
											Requests/KiloSec: {credit.requestsPerKilosecond.toString()}
										</p>
										<p class="text-prussian-blue/70 text-xs">
											Expires: {formatTimestamp(credit.expiresAt)}
										</p>
									</li>
								{/each}
							</ul>
						{:else if !isLoadingWalletDetails && (!ownedCapacityCredits || ownedCapacityCredits.length === 0)}
							<p class="text-prussian-blue/70 text-sm">No capacity credits found for this PKP.</p>
						{:else if !isLoadingWalletDetails && walletDetailsError}{/if}
					</div>
				{:else}
					<div class="bg-timberwolf-2 rounded-xl p-6 text-center shadow-lg md:p-8">
						<p class="text-prussian-blue mb-3 text-lg font-medium">
							Wallet information is required to view capacity credits.
						</p>
						{#if !currentPkpProfile && generalIsLoading}
							<p class="text-prussian-blue/80 mb-4 text-sm">Loading account details...</p>
						{:else if !currentPkpProfile}
							<p class="text-prussian-blue/80 mb-4 text-sm">
								Please set up your Hominio Wallet first.
							</p>
							<a
								href="/me/signin"
								class="focus:ring-opacity-50 bg-prussian-blue text-linen hover:bg-prussian-blue/90 focus:ring-prussian-blue/50 inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold focus:ring-2 focus:outline-none"
							>
								Go to Wallet Setup
							</a>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</div>
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
