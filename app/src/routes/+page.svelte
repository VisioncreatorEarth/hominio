<script>
	// Seeds for data examples
	const features = [
		'Smart Home Automation',
		'Energy Management',
		'Family Coordination',
		'Security & Privacy',
		'Voice Control'
	];
</script>

<!-- Hero -->
<section class="flex min-h-screen flex-col items-center justify-center bg-blue-950 p-8 pt-32">
	<div class="space-y-16 text-center">
		<h1
			class="bg-gradient-to-r from-emerald-400 via-green-500 to-teal-600 bg-clip-text text-8xl leading-none font-bold tracking-tight text-transparent"
		>
			HOMINIO
		</h1>
		<div class="space-y-16">
			<p class="text-4xl font-light text-emerald-100/90">Your Home. Your Rules. Your Data.</p>

			<div class="text-xl text-emerald-100/80">
				The open-source home automation platform that puts privacy first
			</div>

			<!-- Stats Section -->
			<div class="mt-24 flex flex-col items-center space-y-6">
				<div class="flex space-x-8">
					<div
						class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 backdrop-blur-sm"
					>
						<p class="text-2xl font-bold text-emerald-400">100%</p>
						<p class="text-emerald-100/80">Open Source</p>
					</div>
					<div class="rounded-xl border border-green-400/20 bg-green-400/10 p-4 backdrop-blur-sm">
						<p class="text-2xl font-bold text-green-400">0</p>
						<p class="text-emerald-100/80">Data Tracking</p>
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
<section class="flex min-h-screen items-center py-32">
	<div class="mx-auto max-w-7xl px-8">
		<div class="space-y-24">
			<div class="flex flex-col items-center space-y-8 text-center">
				<div class="flex items-center space-x-3 text-3xl font-light tracking-wide text-emerald-100">
					<span class="relative">
						Smart
						<div
							class="absolute right-0 -bottom-2 left-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
						></div>
					</span>
					<span class="relative">
						Living
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
								>Your Home,</span
							>
							<div
								class="absolute right-0 -bottom-2 left-0 h-1 bg-gradient-to-r from-emerald-400 to-transparent"
							></div>
						</span>
						<span class="mt-4 block">
							<span class="relative ml-4 inline-block">
								<span
									class="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent"
									>Enhanced</span
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
							class="relative flex h-full flex-col rounded-3xl border border-emerald-500/20 bg-blue-950/50 p-8 backdrop-blur-xl transition-all duration-500 hover:border-emerald-400/40"
						>
							<div
								class="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-green-500 text-2xl"
							>
								{i === 0 ? '🏠' : i === 1 ? '⚡' : i === 2 ? '👨‍👩‍👧‍👦' : i === 3 ? '🔒' : '🎤'}
							</div>
							<h3 class="mb-4 text-2xl font-bold text-emerald-400">{feature}</h3>
							<p class="flex-grow text-emerald-100/80">
								{i === 0
									? 'Control your home devices from anywhere with intuitive interfaces.'
									: i === 1
										? 'Monitor and optimize your energy usage for a greener home.'
										: i === 2
											? 'Keep your family coordinated with shared calendars and tasks.'
											: i === 3
												? 'Your data never leaves your home network without your consent.'
												: 'Control everything with natural voice commands in multiple languages.'}
							</p>
							<button
								class="mt-6 rounded-full bg-emerald-400/10 px-6 py-2 text-emerald-400 transition-colors duration-300 hover:bg-emerald-400/20"
							>
								Learn more
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>

<!-- How It Works -->
<section class="relative min-h-screen overflow-hidden py-32">
	<div class="mx-auto max-w-6xl px-8">
		<div class="mb-24 text-center">
			<h2
				class="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-7xl font-bold text-transparent"
			>
				How It Works
			</h2>
		</div>

		<!-- Steps -->
		<div class="relative">
			<!-- Center Line -->
			<div
				class="absolute left-1/2 h-full w-px bg-gradient-to-b from-emerald-400/50 via-green-400/50 to-transparent"
			></div>

			<div class="space-y-40">
				<!-- Step 1 -->
				<div class="relative">
					<div
						class="absolute top-0 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-green-500 text-xl font-bold text-black"
					>
						1
					</div>
					<div class="grid grid-cols-1 gap-16 md:grid-cols-2">
						<div class="flex items-center justify-end">
							<div class="text-right">
								<h3 class="mb-4 text-2xl font-bold text-emerald-400">Install on Your Hardware</h3>
								<p class="text-emerald-100/80">
									Run Hominio on a Raspberry Pi, NUC, or any home server. It's designed to be
									lightweight yet powerful.
								</p>
							</div>
						</div>
						<div
							class="rounded-3xl border border-emerald-500/20 bg-blue-950/50 p-8 backdrop-blur-xl"
						>
							<div class="flex h-48 items-center justify-center rounded-xl bg-blue-900/50">
								<div class="text-5xl">🖥️</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Step 2 -->
				<div class="relative">
					<div
						class="absolute top-0 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-green-500 text-xl font-bold text-black"
					>
						2
					</div>
					<div class="grid grid-cols-1 gap-16 md:grid-cols-2">
						<div
							class="order-last rounded-3xl border border-emerald-500/20 bg-blue-950/50 p-8 backdrop-blur-xl md:order-first"
						>
							<div class="flex h-48 items-center justify-center rounded-xl bg-blue-900/50">
								<div class="text-5xl">🔌</div>
							</div>
						</div>
						<div class="flex items-center">
							<div>
								<h3 class="mb-4 text-2xl font-bold text-emerald-400">Connect Your Devices</h3>
								<p class="text-emerald-100/80">
									Easily integrate with hundreds of smart home devices. Our open API supports most
									major brands and protocols.
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Step 3 -->
				<div class="relative">
					<div
						class="absolute top-0 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-green-500 text-xl font-bold text-black"
					>
						3
					</div>
					<div class="grid grid-cols-1 gap-16 md:grid-cols-2">
						<div class="flex items-center justify-end">
							<div class="text-right">
								<h3 class="mb-4 text-2xl font-bold text-emerald-400">Create Automations</h3>
								<p class="text-emerald-100/80">
									Build powerful automations with our intuitive interface. No coding required, but
									developers can access advanced features.
								</p>
							</div>
						</div>
						<div
							class="rounded-3xl border border-emerald-500/20 bg-blue-950/50 p-8 backdrop-blur-xl"
						>
							<div class="flex h-48 items-center justify-center rounded-xl bg-blue-900/50">
								<div class="text-5xl">⚙️</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Decorative Elements -->
	<div class="absolute top-1/4 -left-48 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl"></div>
	<div class="absolute -right-48 bottom-1/4 h-96 w-96 rounded-full bg-green-400/10 blur-3xl"></div>
</section>

<!-- Privacy First -->
<section class="relative min-h-screen overflow-hidden px-8 py-32">
	<div class="mx-auto max-w-7xl">
		<div class="mb-24 text-center">
			<h2
				class="bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-7xl font-bold text-transparent"
			>
				Privacy First
			</h2>
			<p class="mt-4 text-2xl text-emerald-100">Your home should be yours alone</p>
		</div>

		<div class="group relative mb-24">
			<div
				class="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-400/5 to-green-400/5 blur-xl transition-all duration-700"
			></div>
			<div
				class="relative rounded-3xl border border-emerald-500/20 bg-blue-950/50 p-12 backdrop-blur-xl transition-all duration-500 hover:border-emerald-400/40"
			>
				<div class="grid grid-cols-1 gap-12 md:grid-cols-2">
					<div>
						<h3 class="mb-6 text-3xl font-bold text-emerald-400">No Cloud Dependency</h3>
						<ul class="space-y-4 text-emerald-100/80">
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>Works without internet connection</span>
							</li>
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>Your data stays in your home</span>
							</li>
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>No subscription fees ever</span>
							</li>
						</ul>
					</div>
					<div>
						<h3 class="mb-6 text-3xl font-bold text-emerald-400">End-to-End Encryption</h3>
						<ul class="space-y-4 text-emerald-100/80">
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>Strong security protocols</span>
							</li>
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>Optional remote access with encryption</span>
							</li>
							<li class="flex items-start space-x-3">
								<span class="mt-1 text-emerald-400">✓</span>
								<span>Regular security audits</span>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>

		<!-- Compare Table -->
		<div class="rounded-3xl border border-emerald-500/20 bg-blue-950/50 p-12 backdrop-blur-xl">
			<h3 class="mb-12 text-center text-3xl font-bold text-emerald-400">Why Choose Hominio?</h3>

			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr>
							<th class="pb-6 text-left text-emerald-100">Features</th>
							<th class="pb-6 text-center font-bold text-emerald-400">Hominio</th>
							<th class="pb-6 text-center text-emerald-100/60">Others</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-emerald-500/10">
						<tr>
							<td class="py-4 text-emerald-100">Privacy-focused</td>
							<td class="py-4 text-center text-emerald-400">✓</td>
							<td class="py-4 text-center text-red-400">✕</td>
						</tr>
						<tr>
							<td class="py-4 text-emerald-100">Offline operation</td>
							<td class="py-4 text-center text-emerald-400">✓</td>
							<td class="py-4 text-center text-red-400">✕</td>
						</tr>
						<tr>
							<td class="py-4 text-emerald-100">No subscription fees</td>
							<td class="py-4 text-center text-emerald-400">✓</td>
							<td class="py-4 text-center text-red-400">✕</td>
						</tr>
						<tr>
							<td class="py-4 text-emerald-100">Open-source</td>
							<td class="py-4 text-center text-emerald-400">✓</td>
							<td class="py-4 text-center text-red-400">✕</td>
						</tr>
						<tr>
							<td class="py-4 text-emerald-100">Custom extensions</td>
							<td class="py-4 text-center text-emerald-400">✓</td>
							<td class="py-4 text-center text-red-400">Limited</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>
</section>

<!-- CTA -->
<section class="flex min-h-screen flex-col items-center justify-center">
	<div class="max-w-4xl space-y-16 text-center">
		<h2 class="text-7xl font-bold">
			Make Your Home
			<br />
			<span class="text-emerald-400">Truly Smart</span>
		</h2>
		<div class="flex flex-col justify-center gap-6 md:flex-row">
			<button
				class="rounded-full bg-gradient-to-r from-emerald-400 to-green-500 px-12 py-6 text-2xl font-bold text-black transition-transform duration-300 hover:scale-105"
			>
				Download Now
			</button>
			<button
				class="rounded-full border border-emerald-500/30 bg-blue-900 px-12 py-6 text-2xl font-bold text-emerald-400 transition-colors duration-300 hover:bg-blue-800"
			>
				View Documentation
			</button>
		</div>
	</div>
</section>

<div class="min-h-screen bg-blue-950 text-white">
	<slot />
</div>
