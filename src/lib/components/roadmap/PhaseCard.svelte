<script lang="ts">
	export let phase: { name: string; description: string; tokenSupply: number; [key: string]: any };
</script>

<div class="group mb-6 overflow-hidden rounded-xl border border-timberwolf-2 bg-linen shadow-lg transition-all hover:shadow-xl">
	<div class="p-6 md:p-8">
		<h2 class="font-playfair-display text-prussian-blue mb-3 text-3xl font-bold transition-colors duration-300 group-hover:text-persian-orange md:text-4xl">
			{phase.name}
		</h2>
		<p class="font-ibm-plex-sans text-prussian-blue/80 mb-5 text-base leading-relaxed md:text-lg">
			{phase.description}
		</p>
		<div class="font-ibm-plex-sans text-prussian-blue/90 text-md">
			<span class="font-semibold">Token Supply:</span>
			<span class="ml-2 rounded-full bg-timberwolf-1 px-3 py-1 text-sm font-medium text-persian-orange">
				{phase.tokenSupply.toLocaleString()}
			</span>
		</div>
	</div>
	<!-- Optional: Add a subtle bottom border or accent if desired -->
	<!-- <div class="bg-persian-orange h-1 group-hover:h-2 transition-all duration-300"></div> -->
</div> 