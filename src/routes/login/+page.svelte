<script lang="ts">
	import { authClient } from '$lib/client/auth-hominio';

	const session = authClient.useSession();
	let loading = false;
	let error: string | null = null;
	let email = '';
	let password = '';
	let name = '';
	let isRegistering = false;

	async function handleSignOut() {
		loading = true;
		try {
			await authClient.signOut();
		} catch (error) {
			console.error('Sign out error:', error);
		} finally {
			loading = false;
		}
	}

	async function handleSubmit() {
		loading = true;
		error = null;
		try {
			if (isRegistering) {
				const result = await authClient.signUp.email({
					email,
					password,
					name
				});
				if (result.error) {
					throw new Error(result.error.message || 'Registration failed');
				}
				console.log('Registration successful');
			} else {
				const result = await authClient.signIn.email({
					email,
					password
				});
				if (result.error) {
					throw new Error(result.error.message || 'Sign in failed');
				}
				console.log('Sign in successful');
			}
		} catch (err) {
			console.error(isRegistering ? 'Registration error:' : 'Sign in error:', err);
			error = err instanceof Error ? err.message : 'Authentication failed';
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
					<h2 class="mt-6 text-3xl font-bold text-white">
						{isRegistering ? 'Create an account' : 'Sign in to your account'}
					</h2>
					<p class="mt-2 text-sm text-gray-400">
						{isRegistering ? 'Already have an account?' : "Don't have an account?"}
						<button
							on:click={() => {
								isRegistering = !isRegistering;
								error = null;
							}}
							class="font-medium text-indigo-400 hover:text-indigo-300"
						>
							{isRegistering ? 'Sign in' : 'Create one'}
						</button>
					</p>
				</div>

				{#if error}
					<div class="rounded-lg bg-red-900/50 p-3 text-sm text-red-200">
						{error}
					</div>
				{/if}

				<form class="space-y-4" on:submit|preventDefault={handleSubmit}>
					{#if isRegistering}
						<div>
							<label for="name" class="sr-only">Name</label>
							<input
								id="name"
								type="text"
								bind:value={name}
								required
								class="w-full rounded-lg bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
								placeholder="Full name"
							/>
						</div>
					{/if}
					<div>
						<label for="email" class="sr-only">Email address</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							required
							class="w-full rounded-lg bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
							placeholder="Email address"
						/>
					</div>
					<div>
						<label for="password" class="sr-only">Password</label>
						<input
							id="password"
							type="password"
							bind:value={password}
							required
							class="w-full rounded-lg bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
							placeholder="Password"
						/>
					</div>
					<button
						type="submit"
						class="flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
						disabled={loading}
					>
						{#if loading}
							<span class="flex items-center">
								<svg
									class="mr-3 -ml-1 h-5 w-5 animate-spin text-white"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path>
								</svg>
								Processing...
							</span>
						{:else}
							{isRegistering ? 'Create Account' : 'Sign In'}
						{/if}
					</button>
				</form>
			</div>
		{/if}
	</div>
</div>
