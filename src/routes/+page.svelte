<script lang="ts">
	import { authClient } from '$lib/KERNEL/hominio-auth';
	import { goto } from '$app/navigation';

	// State variables
	// let ready = $state(false); // Keep if needed for transitions/animations
	let loading = $state(false);
	let error = $state<string | null>(null);

	const session = authClient.useSession();

	// Redirect to /me if already logged in
	$effect(() => {
		if ($session.data) {
			goto('/me');
		}
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

<div class="bg-custom-beige text-custom-blue min-h-screen w-full font-sans">
	<!-- Header -->
	<header class="container mx-auto px-6 py-4">
		<nav class="flex items-center justify-between">
			<div class="flex items-center gap-8">
				<!-- Optional: Add logo here if needed -->
				<!-- <img src="/logo-dark.svg" alt="Hominio Logo" class="h-8"> -->
				<a href="/platform" class="text-sm hover:underline">Platform</a>
				<a href="/developers" class="text-sm hover:underline">Developers</a>
				<a href="/use-cases" class="text-sm hover:underline">Use Cases</a>
			</div>
		</nav>
	</header>

	<!-- Hero Section -->
	<main
		class="network-bg container mx-auto flex min-h-[calc(100vh-150px)] flex-col items-center justify-center px-6 pt-10 pb-20 text-center"
	>
		<h1 class="mb-4 text-6xl font-bold md:text-8xl">Hominio</h1>
		<p class="mb-12 max-w-xl text-lg md:text-xl">
			What if your time and expertise didn't just pay the bills, but earned you a stake in something
			bigger?
		</p>

		{#if error}
			<div class="mb-4 max-w-md rounded-lg bg-red-100 p-3 text-sm text-red-700">
				{error}
			</div>
		{/if}

		<button
			onclick={handleGoogleSignIn}
			disabled={loading}
			class="border-custom-blue text-custom-blue mt-12 inline-flex items-center justify-center gap-2 rounded-full border bg-white px-5 py-2 text-sm font-medium transition-colors hover:bg-gray-100 disabled:opacity-50"
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

		<!-- Footer/Spacing element -->
		<div class="h-24"></div>
	</main>
</div>

<!-- Define custom colors (or configure in tailwind.config.js) -->
<style>
	:root {
		--color-background: #f5f1e8; /* Example light beige */
		--color-text: #1a365d; /* Example dark blue */
		--color-button-border: #1a365d;
	}
	.bg-custom-beige {
		background-color: var(--color-background);
	}
	.text-custom-blue {
		color: var(--color-text);
	}
	.border-custom-blue {
		border-color: var(--color-button-border);
	}
	.hover\:bg-custom-blue:hover {
		background-color: var(--color-text);
	}
	.hover\:text-custom-beige:hover {
		color: var(--color-background);
	}
</style>
