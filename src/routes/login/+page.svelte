<script lang="ts">
	import { authClient } from '$lib/client/auth-hominio';
	import { goto } from '$app/navigation';

	const session = authClient.useSession();
	let loading = false;
	let error: string | null = null;

	// Redirect to /me if already logged in
	$effect(() => {
		if ($session.data) {
			goto('/me');
		}
	});

	async function handleSignOut() {
		loading = true;
		try {
			await authClient.signOut();
			goto('/');
		} catch (error) {
			console.error('Sign out error:', error);
		} finally {
			loading = false;
		}
	}

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

<div class="flex min-h-screen items-center justify-center bg-gray-900 px-4">
	<div class="w-full max-w-md space-y-8 rounded-xl bg-gray-800 p-8 shadow-2xl">
		{#if $session.data}
			<div class="space-y-6">
				<div class="flex items-center justify-between">
					<h2 class="text-2xl font-bold text-white">Welcome Back!</h2>
					<button
						on:click={handleSignOut}
						class="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors duration-200 hover:bg-red-700 disabled:opacity-50"
						disabled={loading}
					>
						{loading ? 'Signing out...' : 'Sign Out'}
					</button>
				</div>
				<div class="rounded-lg bg-gray-700 p-4">
					<h3 class="mb-2 text-lg font-semibold text-white">Session Data</h3>
					<pre class="font-mono text-sm break-all whitespace-pre-wrap text-gray-300">
						{JSON.stringify($session.data, null, 2)}
					</pre>
				</div>
			</div>
		{:else}
			<div class="space-y-6">
				<div class="text-center">
					<h2 class="mt-6 text-3xl font-bold text-white">Welcome to Hominio</h2>
					<p class="mt-2 text-sm text-gray-400">Sign in to get started</p>
				</div>

				{#if error}
					<div class="rounded-lg bg-red-900/50 p-3 text-sm text-red-200">
						{error}
					</div>
				{/if}

				<button
					on:click={handleGoogleSignIn}
					class="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-900 transition-colors duration-200 hover:bg-gray-100 focus:ring-2 focus:ring-gray-200 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
					disabled={loading}
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
		{/if}
	</div>
</div>
