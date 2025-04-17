<script lang="ts">
	import { authClient } from '$lib/KERNEL/hominio-auth';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { browser } from '$app/environment';
	import VibeRenderer from '$lib/components/VibeRenderer.svelte';

	export let data: PageData;

	// Client-side check: If the session is null after initial load, redirect.
	// This handles cases where the session might expire or be invalidated client-side.
	if (browser && !data.session) {
		goto('/');
	}

	let loading = false;

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
</script>

<main class="relative min-h-screen">
	<!-- Content on top -->
	<div class="relative z-10 min-h-screen w-full">
		<VibeRenderer vibeId="home" />
	</div>

	<!-- Logout button in bottom right corner -->
	<button
		onclick={handleSignOut}
		disabled={loading}
		class="fixed right-4 bottom-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-700 disabled:opacity-50"
		title="Sign out"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-6 w-6"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
			/>
		</svg>
	</button>
</main>
