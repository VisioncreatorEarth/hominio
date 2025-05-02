<script lang="ts">
	// import { openModal } from '$lib/KERNEL/modalStore'; // Removed
	// import HelloEarth from '$lib/components/HelloEarth.svelte'; // Removed

	// import { authClient } from '$lib/KERNEL/hominio-auth'; // No longer needed here
	// import { goto } from '$app/navigation'; // No longer needed here

	// State variables removed (moved to layout)
	// let loading = $state(false);
	// let error = $state<string | null>(null);

	// Session store is accessed in layout
	// const session = authClient.useSession();

	// Redirect logic removed (handled by button display in layout)
	/*
	$effect(() => {
		if ($session.data) {
			// goto('/me');
		}
	});
	*/

	// handleGoogleSignIn function removed (moved to layout)

	// showModal function removed (moved to layout)
	/*
	function showModal() {
		openModal(HelloEarth, { message: 'World (from +page)' });
		}
	*/
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

		<!-- Google Sign In Button removed (handled in layout) -->

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
