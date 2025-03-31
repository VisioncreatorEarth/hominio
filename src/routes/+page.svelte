<script lang="ts">
	import { onMount } from 'svelte';
	import { authClient } from '$lib/client/auth-hominio';
	import { goto } from '$app/navigation';

	// State variables
	let ready = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const session = authClient.useSession();

	// Redirect to /me if already logged in
	$effect(() => {
		if ($session.data) {
			goto('/me');
		}
	});

	// Updated features for the AI-Agent economy
	let features = $state([
		{
			title: 'AI-First',
			description: 'Let intelligent agents handle your tasks while you focus on what matters',
			icon: '🤖'
		},
		{
			title: 'Get Paid',
			description: 'Monetize your vibes in the new agent economy',
			icon: '💰'
		},
		{
			title: 'Own Your Data',
			description: 'Your vibes, your rules - with local-first technology',
			icon: '🔐'
		}
	]);

	onMount(() => {
		setTimeout(() => {
			ready = true;
		}, 500);
	});

	async function handleGoogleSignIn() {
		loading = true;
		error = null;
		try {
			const result = await authClient.signIn.social({
				provider: 'google'
			});
			if (result.error) {
				throw new Error(result.error.message || 'Failed to sign in with Google');
			}
			// Successful sign-in will trigger the $effect above
		} catch (err) {
			console.error('Google sign in error:', err);
			error = err instanceof Error ? err.message : 'Failed to sign in with Google';
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen bg-blue-950 text-emerald-100 dark:bg-blue-950">
	<div class="container mx-auto px-4 py-16">
		<!-- Hero Section -->
		<div class="mb-16 flex flex-col items-center justify-between gap-8 md:flex-row">
			<div class="flex-1">
				<h1 class="mb-4 text-5xl font-bold text-emerald-400">homin.io</h1>
				<p class="mb-6 text-xl text-emerald-200">
					Welcome to the AI-Agent Economy. Your time to vibe, get paid, and let agents do the work.
				</p>
				<p class="mb-8 text-lg text-emerald-200/80">
					Humanity is entering a new era where AI agents amplify your creativity and productivity.
					Be part of the revolution.
				</p>
				<div class="flex gap-4">
					<a
						href="/hominio"
						class="rounded-lg bg-emerald-500 px-6 py-3 font-bold text-blue-950 transition-colors hover:bg-emerald-600"
					>
						Start Vibing
					</a>
					<a
						href="/todos"
						class="rounded-lg border border-emerald-500 bg-transparent px-6 py-3 font-bold text-emerald-400 transition-colors hover:bg-emerald-500/10"
					>
						See Agents in Action
					</a>
				</div>
			</div>
			<div class="flex flex-1 justify-center">
				<div
					class="flex h-72 w-72 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 shadow-lg"
				>
					<div class="flex h-64 w-64 items-center justify-center rounded-full bg-blue-950">
						<img src="/logo.png" alt="Hominio Logo" class="h-56 w-56 object-contain" />
					</div>
				</div>
			</div>
		</div>

		<!-- Features -->
		<div class="mb-16 grid grid-cols-1 gap-8 md:grid-cols-3">
			{#each features as feature}
				<div
					class="rounded-lg border border-blue-800/30 bg-blue-900/20 p-6 transition-colors duration-300 hover:bg-blue-800/30 dark:bg-blue-900/10"
				>
					<div class="mb-4 text-4xl">{feature.icon}</div>
					<h3 class="mb-2 text-xl font-semibold text-emerald-300">{feature.title}</h3>
					<p class="text-emerald-100/80">{feature.description}</p>
				</div>
			{/each}
		</div>

		<!-- CTA -->
		<div class="text-center">
			<h2 class="mb-4 text-3xl font-bold text-emerald-400">Join the AI Revolution</h2>
			<p class="mx-auto mb-6 max-w-2xl text-xl text-emerald-200">
				The future belongs to those who collaborate with AI. Start your journey in the agent economy
				today.
			</p>

			{#if error}
				<div class="mx-auto mb-4 max-w-md rounded-lg bg-red-900/50 p-3 text-sm text-red-200">
					{error}
				</div>
			{/if}

			<button
				onclick={handleGoogleSignIn}
				disabled={loading}
				class="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 disabled:opacity-50"
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24">
					<path
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						fill="#4285F4"
					/>
					<path
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						fill="#34A853"
					/>
					<path
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						fill="#FBBC05"
					/>
					<path
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						fill="#EA4335"
					/>
				</svg>
				{loading ? 'Processing...' : 'Continue with Google'}
			</button>
		</div>
	</div>
</div>
