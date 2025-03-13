<script>
	import { onMount } from 'svelte';

	// Seeds for data examples
	const features = [
		'Personal Data Pod',
		'AI-Driven Organization',
		'Privacy Preservation',
		'Cross-Device Sync',
		'Custom Life Views'
	];

	onMount(async () => {
		// Clean onMount with no filesystem testing
	});
</script>

<!-- Main content starts here -->
<section class="flex min-h-screen flex-col items-center justify-center bg-blue-950 p-8 pt-32">
	<div class="space-y-16 text-center">
		<h1
			class="bg-gradient-to-r from-emerald-400 via-green-500 to-teal-600 bg-clip-text text-8xl leading-none font-bold tracking-tight text-transparent"
		>
			HOMINIO
		</h1>
		<div class="space-y-16">
			<p class="text-4xl font-light text-emerald-100/90">Your Data. Your Privacy. Your Life.</p>

			<div class="text-xl text-emerald-100/80">
				A privacy-preserving data pod and AI organizer for your digital life
			</div>

			<!-- Stats Section -->
			<div class="mt-24 flex flex-col items-center space-y-6">
				<div class="flex space-x-8">
					<div
						class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 backdrop-blur-sm"
					>
						<p class="text-2xl font-bold text-emerald-400">100%</p>
						<p class="text-emerald-100/80">Private</p>
					</div>
					<div class="rounded-xl border border-green-400/20 bg-green-400/10 p-4 backdrop-blur-sm">
						<p class="text-2xl font-bold text-green-400">0</p>
						<p class="text-emerald-100/80">Data Sharing</p>
					</div>
					<div class="rounded-xl border border-teal-400/20 bg-teal-400/10 p-4 backdrop-blur-sm">
						<p class="text-2xl font-bold text-teal-400">∞</p>
						<p class="text-emerald-100/80">Possibilities</p>
					</div>
				</div>
				<div
					class="h-px w-24 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50"
				></div>
			</div>
		</div>
	</div>
</section>

<!-- Features Section -->
<section class="flex min-h-screen items-center bg-blue-950 py-32">
	<div class="mx-auto max-w-7xl px-8">
		<div class="space-y-24">
			<div class="flex flex-col items-center space-y-8 text-center">
				<div class="flex items-center space-x-3 text-3xl font-light tracking-wide text-emerald-100">
					<span class="relative">
						Private
						<div
							class="absolute right-0 -bottom-2 left-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
						></div>
					</span>
					<span class="relative">
						Organization
						<div
							class="absolute right-0 -bottom-2 left-0 h-px bg-gradient-to-r from-transparent via-green-500 to-transparent"
						></div>
					</span>
				</div>

				<div class="text-center">
					<h2 class="text-7xl leading-tight font-bold">
						<span class="relative inline-block">
							<span
								class="bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent"
								>Your Life,</span
							>
							<div
								class="absolute right-0 -bottom-2 left-0 h-1 bg-gradient-to-r from-emerald-400 to-transparent"
							></div>
						</span>
						<span class="mt-4 block">
							<span class="relative ml-4 inline-block">
								<span
									class="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent"
									>Organized</span
								>
								<div
									class="absolute right-0 -bottom-2 left-0 h-1 bg-gradient-to-r from-green-400 to-transparent"
								></div>
							</span>
						</span>
					</h2>
				</div>
			</div>

			<!-- Features Cards -->
			<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
				{#each features as feature, i}
					<div class="group relative">
						<div
							class="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-400/5 to-teal-400/5 blur-xl transition-all duration-700 group-hover:from-emerald-400/10 group-hover:to-teal-400/10"
						></div>
						<div
							class="relative flex h-full flex-col rounded-3xl border border-emerald-500/20 bg-blue-900/50 p-8 backdrop-blur-xl transition-all duration-500 hover:border-emerald-400/40"
						>
							<div
								class="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-green-500 text-2xl"
							>
								{i === 0 ? '🔒' : i === 1 ? '🧠' : i === 2 ? '🛡️' : i === 3 ? '🔄' : '📱'}
							</div>
							<h3 class="mb-4 text-2xl font-bold text-emerald-400">{feature}</h3>
							<p class="flex-grow text-emerald-100/80">
								{i === 0
									? 'Store your personal data securely in your own private data pod.'
									: i === 1
										? 'Leverage AI to organize your digital life without compromising privacy.'
										: i === 2
											? 'Your data never leaves your control without explicit permission.'
											: i === 3
												? 'Seamlessly sync your information across all your devices.'
												: 'Create custom views into your digital life with powerful AI insights.'}
							</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>

<!-- Core Benefits -->
<section class="relative min-h-screen overflow-hidden bg-blue-950 py-32">
	<div class="mx-auto max-w-7xl px-8">
		<div class="mb-24 text-center">
			<h2
				class="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-7xl font-bold text-transparent"
			>
				Your Privacy Matters
			</h2>
			<p class="mt-4 text-2xl text-emerald-100">Keep your digital life private and organized</p>
		</div>

		<div class="group relative mb-24">
			<div
				class="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-400/5 to-green-400/5 blur-xl transition-all duration-700"
			></div>
			<div
				class="relative rounded-3xl border border-emerald-500/20 bg-blue-900/50 p-12 backdrop-blur-xl transition-all duration-500 hover:border-emerald-400/40"
			>
				<div class="grid grid-cols-1 gap-12 md:grid-cols-2">
					<div>
						<h3 class="mb-6 text-3xl font-bold text-emerald-400">True Data Ownership</h3>
						<ul class="space-y-4 text-emerald-100/80">
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>Your data stays in your control</span>
							</li>
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>Zero third-party data sharing</span>
							</li>
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>No subscription fees or data monetization</span>
							</li>
						</ul>
					</div>
					<div>
						<h3 class="mb-6 text-3xl font-bold text-emerald-400">AI that Respects You</h3>
						<ul class="space-y-4 text-emerald-100/80">
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>On-device AI processing</span>
							</li>
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>Personalized without privacy compromise</span>
							</li>
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>Full transparency in data usage</span>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Decorative Elements -->
	<div class="absolute top-1/4 -left-48 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl"></div>
	<div class="absolute -right-48 bottom-1/4 h-96 w-96 rounded-full bg-green-400/10 blur-3xl"></div>
</section>

<!-- CTA -->
<section class="flex min-h-screen flex-col items-center justify-center bg-blue-950">
	<div class="max-w-4xl space-y-16 text-center">
		<h2 class="text-7xl font-bold">
			Your Life
			<br />
			<span class="text-emerald-400">Your Privacy</span>
		</h2>
		<div class="flex flex-col justify-center gap-6 md:flex-row">
			<button
				class="rounded-full bg-gradient-to-r from-emerald-400 to-green-500 px-12 py-6 text-2xl font-bold text-black transition-transform duration-300 hover:scale-105"
			>
				Get Started
			</button>
			<button
				class="rounded-full border border-emerald-500/30 bg-blue-900 px-12 py-6 text-2xl font-bold text-emerald-400 transition-colors duration-300 hover:bg-blue-800"
			>
				Learn More
			</button>
		</div>
	</div>
</section>

<div class="min-h-screen bg-blue-950 text-white">
	<slot />
</div>
