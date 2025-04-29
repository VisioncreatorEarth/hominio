<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	// FIX: Define the structure according to the new Schema/Composite model
	// Corresponds roughly to SchemaPlaceTranslation
	interface CompositePlaceInfo {
		title?: string; // From SchemaRecord.data.translations.en.places[place].title
		description?: string; // From SchemaRecord.data.translations.en.places[place].description (optional here)
	}

	// FIX: Renamed type and updated structure
	type CompositeNodeData = {
		label: string; // schema name (e.g., 'cneme', 'zukte')
		translations?: {
			en?: {
				places?: {
					x1?: CompositePlaceInfo;
					x2?: CompositePlaceInfo;
					x3?: CompositePlaceInfo;
					x4?: CompositePlaceInfo;
					x5?: CompositePlaceInfo;
				};
			};
			// ... other languages if needed
		};
		// Optional inline literals for places (keep this structure)
		x1_literal?: string | number | boolean | null;
		x2_literal?: string | number | boolean | null;
		x3_literal?: string | number | boolean | null;
		x4_literal?: string | number | boolean | null;
		x5_literal?: string | number | boolean | null;
	};

	// Explicitly type the props passed by SvelteFlow using runes
	// FIX: Use renamed type
	let { data }: { data: CompositeNodeData } = $props();

	const places: ('x1' | 'x2' | 'x3' | 'x4' | 'x5')[] = ['x1', 'x2', 'x3', 'x4', 'x5'];

	// FIX: Helper to get title from translations, defaulting to placeholder
	function getPlaceTitle(place: 'x1' | 'x2' | 'x3' | 'x4' | 'x5'): string {
		// Accessing the title from the new translations structure
		return data?.translations?.en?.places?.[place]?.title ?? 'No definition';
	}

	// Helper to get literal value for a place (no change needed)
	function getLiteral(place: 'x1' | 'x2' | 'x3' | 'x4' | 'x5'): string | number | boolean | null {
		return data?.[`${place}_literal`] ?? null;
	}

	// Calculate handle positions (no change needed)
	function getHandleStyle(index: number): string {
		const totalPlaces = places.length;
		const percentage = ((index + 0.5) / totalPlaces) * 100;
		return `left: ${percentage}%; top: 100%; transform: translate(-50%, -50%);`; // Position handles along the bottom edge
	}
</script>

<div
	class="composite-node w-auto max-w-lg min-w-[320px] rounded-md border-2 border-gray-700 bg-gray-100 shadow-md"
>
	<!-- Top Section: Schema Name -->
	<div class="rounded-t-md bg-gray-300 p-2 text-center font-semibold text-gray-800">
		{data.label || 'Unnamed Composite'}
	</div>

	<!-- Bottom Section: Places -->
	<div class="flex min-h-[4em] items-stretch justify-around border-t border-gray-400 p-1 text-xs">
		{#each places as place, i (place)}
			{@const placeTitle = getPlaceTitle(place)}
			{@const literal = getLiteral(place)}

			<!-- Only render place if it has title OR literal -->
			{#if placeTitle !== 'No definition' || literal !== null}
				<div
					class={`relative flex-1 px-1 py-2 text-center ${literal !== null ? 'bg-blue-100' : ''}`}
				>
					<div class="font-bold text-gray-600">{place.toUpperCase()}</div>
					{#if placeTitle !== 'No definition'}
						<div class="mt-1 min-h-[2em] text-gray-500">{placeTitle}</div>
					{/if}
					{#if literal !== null}
						<div class="mt-1 rounded bg-blue-200 p-1 font-semibold break-words text-blue-800">
							{String(literal)}
						</div>
					{/if}

					<!-- Render Handle only if NO literal value -->
					{#if literal === null}
						<Handle
							type="source"
							id={`handle-${place}`}
							position={Position.Bottom}
							style={getHandleStyle(i)}
							class="!h-3 !w-3 !border-2 !border-blue-500 !bg-white hover:!bg-blue-200"
						/>
						<Handle
							type="target"
							id={`handle-${place}`}
							position={Position.Bottom}
							style={getHandleStyle(i)}
							class="!h-3 !w-3 !border-2 !border-blue-500 !bg-white hover:!bg-blue-200"
						/>
					{/if}
				</div>
				{#if i < places.filter((p) => getPlaceTitle(p) !== 'No definition' || getLiteral(p) !== null).length - 1}
					<div class="w-px self-stretch bg-gray-300"></div>
					<!-- Vertical separator only between rendered places -->
				{/if}
			{/if}
		{/each}
	</div>
</div>

<style>
	/* FIX: Update selector */
	.composite-node {
		font-size: 10px;
	}
</style>
