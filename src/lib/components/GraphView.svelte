<script lang="ts">
	import { writable, type Writable } from 'svelte/store';
	// Removed store import
	// Keep types local for now
	import { onMount } from 'svelte'; // Import onMount for initial fetch
	import { getContext, type SvelteComponent } from 'svelte'; // Import SvelteComponent
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import {
		executeQuery, // Use executeQuery for direct fetch
		type LoroHqlQuery,
		type QueryResult,
		type PlaceKey // Import PlaceKey
	} from '$lib/KERNEL/hominio-query';
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		type Node,
		type Edge,
		type XYPosition,
		type NodeTypes, // Import NodeTypes type
		MarkerType // Import MarkerType
	} from '@xyflow/svelte';

	// Import Custom Node - Updated
	import CompositeNodes from './CompositeNodes.svelte';

	// Import Svelte Flow styles
	import '@xyflow/svelte/dist/style.css';

	// --- Local Type Definitions ---
	// Define structure for resolved leaf data (replaces ResolvedSumti)
	// FIX: Renamed type and updated properties based on assumed Leaf structure
	interface ResolvedLeaf extends QueryResult {
		id: string | null;
		type?:
			| 'LoroText'
			| 'LoroInteger'
			| 'LoroBoolean'
			| 'LoroJSON'
			| 'LoroMap'
			| 'LoroList'
			| string
			| null; // Based on LeafValue.type
		value?: unknown | null; // Based on LeafValue.value
		// Removed klesi, content, fanva
	}

	// Define structure for resolved Schema data (used within CompositeInstanceData)
	// FIX: New type for resolved schema
	interface ResolvedSchema extends QueryResult {
		id: string | null;
		name?: string | null; // e.g., from data.name
		translations?: {
			// e.g., from data.translations
			en?: {
				title?: string;
				places?: Record<PlaceKey, { title?: string; description?: string }>;
			};
		} | null;
	}

	// Define structure for a Composite instance (replaces Relationship)
	// FIX: Renamed type and updated properties
	interface CompositeInstanceData extends QueryResult {
		compositeId: string; // Renamed from bridi_id
		schemaId: string; // Renamed from selbri_id
		schema_resolved: ResolvedSchema | null; // Renamed from selbri_resolved, uses new type
		x1_leaf_resolved: ResolvedLeaf | null; // Renamed from x1_resolved, uses new type
		x2_leaf_resolved: ResolvedLeaf | null; // Renamed from x2_resolved, uses new type
		x3_leaf_resolved: ResolvedLeaf | null; // Renamed from x3_resolved, uses new type
		x4_leaf_resolved: ResolvedLeaf | null; // Renamed from x4_resolved, uses new type
		x5_leaf_resolved: ResolvedLeaf | null; // Renamed from x5_resolved, uses new type
	}

	// Type for the overall query result structure (replaces RelationshipQueryResult)
	// FIX: Renamed type and properties
	interface LeafQueryResult extends QueryResult {
		id: string; // The starting Leaf ID
		all_composites_involved_in: CompositeInstanceData[]; // Renamed from all_relationships_involved_in
	}

	// --- Svelte Flow Stores ---
	const nodes: Writable<Node[]> = writable([]);
	const edges: Writable<Edge[]> = writable([]);

	// --- Define Custom Node Types ---
	// FIX: Updated node type key and component
	const nodeTypes: NodeTypes = {
		compositeNode: CompositeNodes as any // FIX: Use `as any` to bypass TS error
	};

	// --- Local State ---
	// FIX: Updated variable name
	let selectedLeafId: string | null =
		'0x33cc642063bf6bb00259f9480edb9374151072050f8cd8578483b1b9c1478905'; // Hardcoded ID
	// FIX: Updated variable name and type
	let compositeResults: CompositeInstanceData[] | null = [];
	// FIX: Updated variable name
	let isLoadingComposites: boolean = false;

	// --- Get User Context ---
	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	// --- Composite Query Definition ---
	// FIX: Renamed function and updated query structure
	function getCompositeQuery(leafId: string): LoroHqlQuery {
		return {
			from: {
				// FIX: Use leaf_pubkeys
				leaf: [leafId]
			},
			map: {
				id: { field: 'doc.pubkey' },
				// FIX: Renamed output key and updated traverse/map
				all_composites_involved_in: {
					traverse: {
						composite_where: {
							// FIX: Use schemaId instead of selbri
							schemaId: '*',
							place: '*'
						},
						return: 'array',
						map: {
							// FIX: Renamed output keys and updated field/resolve paths
							compositeId: { field: 'doc.pubkey' },
							schemaId: { field: 'self.data.schemaId' },
							schema_resolved: {
								resolve: {
									fromField: 'self.data.schemaId',
									// FIX: Target type is 'gismu' (internal Schema type)
									targetType: 'gismu',
									map: {
										id: { field: 'doc.pubkey' },
										// FIX: Map Schema fields
										name: { field: 'self.data.name' },
										translations: { field: 'self.data.translations' }
									}
								}
							},
							x1_leaf_resolved: {
								resolve: {
									fromField: 'self.data.places.x1',
									// FIX: Target type is 'leaf'
									targetType: 'leaf',
									map: {
										// FIX: Map Leaf fields
										id: { field: 'doc.pubkey' },
										type: { field: 'self.data.type' },
										value: { field: 'self.data.value' }
									}
								}
							},
							x2_leaf_resolved: {
								resolve: {
									fromField: 'self.data.places.x2',
									targetType: 'leaf',
									map: {
										id: { field: 'doc.pubkey' },
										type: { field: 'self.data.type' },
										value: { field: 'self.data.value' }
									}
								}
							},
							x3_leaf_resolved: {
								resolve: {
									fromField: 'self.data.places.x3',
									targetType: 'leaf',
									map: {
										id: { field: 'doc.pubkey' },
										type: { field: 'self.data.type' },
										value: { field: 'self.data.value' }
									}
								}
							},
							x4_leaf_resolved: {
								resolve: {
									fromField: 'self.data.places.x4',
									targetType: 'leaf',
									map: {
										id: { field: 'doc.pubkey' },
										type: { field: 'self.data.type' },
										value: { field: 'self.data.value' }
									}
								}
							},
							x5_leaf_resolved: {
								resolve: {
									fromField: 'self.data.places.x5',
									targetType: 'leaf',
									map: {
										id: { field: 'doc.pubkey' },
										type: { field: 'self.data.type' },
										value: { field: 'self.data.value' }
									}
								}
							}
						}
					}
				}
			}
		};
	}

	// --- Function to fetch data ---
	async function fetchData() {
		// FIX: Use updated variable name
		if (!selectedLeafId) return;

		// FIX: Use updated variable names
		isLoadingComposites = true;
		// FIX: Reset to empty array, not undefined
		compositeResults = []; // Clear previous results
		nodes.set([]); // Clear graph
		edges.set([]); // Clear graph

		// FIX: Use updated function and variable name
		const query = getCompositeQuery(selectedLeafId);
		const currentUser = getMe();

		try {
			// FIX: Update log message
			console.log('[GraphView] Executing query for selected Leaf ID:', selectedLeafId);
			const results = await executeQuery(query, currentUser);
			console.log('[GraphView] Query results:', results);

			if (results && results.length > 0) {
				// Set local state for processing
				// FIX: Use updated type and property name
				compositeResults = (results[0] as LeafQueryResult).all_composites_involved_in ?? [];
			} else {
				compositeResults = []; // No composites found (already default, but explicit)
			}
		} catch (error) {
			// FIX: Update log message
			console.error('[GraphView] Error executing composite query:', error);
			// FIX: Set to null on error
			compositeResults = null; // Set error state
		} finally {
			// FIX: Use updated variable name
			isLoadingComposites = false;
		}
	}

	// --- Fetch data on component mount ---
	onMount(() => {
		fetchData();
	});

	// --- Helper: Truncate string ---
	// FIX: Re-added truncate function
	function truncate(str: string | null | undefined, length = 10): string {
		if (!str) return '';
		return str.length > length ? str.substring(0, length) + '...' : str;
	}

	// --- Helper to check if a Leaf is a simple literal ---
	// FIX: Renamed function and updated logic for Leaf structure
	function isLiteralLeaf(leaf: ResolvedLeaf | null): boolean {
		if (!leaf) return false;
		const type = leaf.type;
		const value = leaf.value;

		// Simple check: value is primitive or type is known literal type
		// TODO: Refine this based on actual Leaf types used for literals
		if (
			(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
			(!type || ['LoroText', 'LoroInteger', 'LoroBoolean'].includes(type))
		) {
			return true;
		}
		// Could also check for specific LoroJSON types if needed
		return false;
	}

	// --- Reactive block for graph updates ---
	$: {
		// FIX: Update log message and variable names
		console.log('[GraphView] Reactivity triggered', { selectedLeafId, compositeResults });
		const newNodes: Node[] = [];
		const newEdges: Edge[] = [];
		const nodeMap = new Map<string, Node>();
		// FIX: Use updated variable name and type
		const compositePositions: { [place: string]: { angle: number; count: number } } = {
			x1: { angle: -Math.PI / 2, count: 0 },
			x2: { angle: -Math.PI / 2 + (1 * 2 * Math.PI) / 5, count: 0 },
			x3: { angle: -Math.PI / 2 + (2 * 2 * Math.PI) / 5, count: 0 },
			x4: { angle: -Math.PI / 2 + (3 * 2 * Math.PI) / 5, count: 0 },
			x5: { angle: -Math.PI / 2 + (4 * 2 * Math.PI) / 5, count: 0 }
		};
		const centerPos: XYPosition = { x: 600, y: 400 }; // Adjusted center for potentially wider nodes
		// FIX: Use updated variable name
		const compositeRadius = 250; // Increased radius
		const neighborRadius = 450; // Increased radius
		const compositeOffsetAmount = 50;
		// FIX: Use updated variable name
		const inlineLiterals = new Map<
			string,
			{ [place in PlaceKey]?: string | number | boolean | null }
		>(); // Map<compositeId, {place: literalValue}>

		// FIX: Use nested checks for clarity and type safety
		if (!selectedLeafId) {
			// No leaf selected, clear graph
			nodes.set([]);
			edges.set([]);
		} else if (compositeResults === null) {
			// Error state, clear graph (error message handled in template)
			nodes.set([]);
			edges.set([]);
		} else if (compositeResults.length === 0) {
			// No composites found, clear graph
			nodes.set([]);
			edges.set([]);
		} else {
			// --- Graph Generation Logic (compositeResults is guaranteed to be CompositeInstanceData[] here) ---

			// 1. Create or Get Center Node (Default type)
			// FIX: Use updated variable name
			if (!nodeMap.has(selectedLeafId)) {
				// FIX: Use updated variable name
				const centerNode: Node = {
					id: selectedLeafId,
					type: 'default', // Keep default for the center Leaf node
					position: centerPos,
					// FIX: Use updated variable name
					data: { label: `Leaf: ${truncate(selectedLeafId, 15)}` },
					draggable: true
				};
				newNodes.push(centerNode);
				nodeMap.set(selectedLeafId, centerNode);
			}

			// 2. Process Composites
			// FIX: Use updated variable name
			// FIX: No longer possibly null here due to nested checks
			// FIX: Explicit type assertion to satisfy linter
			(compositeResults as CompositeInstanceData[]).forEach((composite, compositeIndex) => {
				// FIX: Use updated property names
				const compositeId = composite.compositeId;
				const schemaId = composite.schemaId;
				const schemaResolved = composite.schema_resolved;
				const schemaName = schemaResolved?.name || 'Unknown Schema';

				// Get or create Composite node
				let compositeNode: Node;
				if (nodeMap.has(compositeId)) {
					compositeNode = nodeMap.get(compositeId)!;
				} else {
					// Calculate Composite node position (circular layout around center)
					const angleIncrement = (2 * Math.PI) / compositeResults.length;
					const angle = compositeIndex * angleIncrement - Math.PI / 2; // Start from top
					const position: XYPosition = {
						x: centerPos.x + compositeRadius * Math.cos(angle),
						y: centerPos.y + compositeRadius * Math.sin(angle)
					};

					// Prepare data for CompositeNode component
					const compositeNodeData = {
						label: schemaName,
						// FIX: Pass translations from resolved schema
						translations: schemaResolved?.translations ?? undefined,
						// Inline literals will be populated below
						x1_literal: null,
						x2_literal: null,
						x3_literal: null,
						x4_literal: null,
						x5_literal: null
					};
					inlineLiterals.set(compositeId, {}); // Initialize literal map for this composite

					// FIX: Use updated node type key
					compositeNode = {
						id: compositeId,
						type: 'compositeNode', // Use the new custom node type
						position,
						data: compositeNodeData,
						draggable: true
					};
					newNodes.push(compositeNode);
					nodeMap.set(compositeId, compositeNode);
				}

				// 3. Process Places within the Composite
				const places: PlaceKey[] = ['x1', 'x2', 'x3', 'x4', 'x5'];
				places.forEach((place) => {
					// FIX: Use updated property name and type
					const resolvedLeaf = composite[`${place}_leaf_resolved`];
					if (!resolvedLeaf || !resolvedLeaf.id) return; // Skip if place is empty or not resolved

					const leafId = resolvedLeaf.id;

					// Check if this leaf is a literal
					// FIX: Use updated helper function
					if (isLiteralLeaf(resolvedLeaf)) {
						// Store literal for the Composite node's data
						const literals = inlineLiterals.get(compositeId);
						if (literals) {
							literals[place] = resolvedLeaf.value as string | number | boolean | null;
						}
						// Don't create a node or edge for literals
						return;
					}

					// Check if this leaf is the center node
					// FIX: Use updated variable name
					if (leafId === selectedLeafId) {
						// Create edge from Center Node (source) to Composite Node (target)
						newEdges.push({
							id: `edge-${leafId}-${compositeId}-${place}`,
							source: leafId,
							target: compositeId,
							// FIX: Use handle ID based on place
							targetHandle: `handle-${place}`,
							label: place, // Label the edge with the place name
							type: 'smoothstep',
							// FIX: Use imported MarkerType
							markerEnd: { type: MarkerType.ArrowClosed }
						});
					} else {
						// This is a neighbor Leaf node
						let neighborNode: Node;
						if (nodeMap.has(leafId)) {
							neighborNode = nodeMap.get(leafId)!;
						} else {
							// Calculate neighbor node position
							const posData = compositePositions[place];
							posData.count++;
							const angle = posData.angle;
							const offsetRadius = neighborRadius + posData.count * compositeOffsetAmount; // Stagger neighbors
							const neighborPosition: XYPosition = {
								x: centerPos.x + offsetRadius * Math.cos(angle),
								y: centerPos.y + offsetRadius * Math.sin(angle)
							};

							// FIX: Use updated variable name
							neighborNode = {
								id: leafId,
								type: 'default',
								position: neighborPosition,
								// FIX: Use updated variable name
								data: { label: `Leaf: ${truncate(leafId, 15)}` },
								draggable: true
							};
							newNodes.push(neighborNode);
							nodeMap.set(leafId, neighborNode);
						}

						// Create edge from Composite Node (source) to Neighbor Leaf Node (target)
						newEdges.push({
							id: `edge-${compositeId}-${place}-${leafId}`,
							source: compositeId,
							// FIX: Use handle ID based on place
							sourceHandle: `handle-${place}`,
							target: leafId,
							label: place, // Label the edge with the place name
							type: 'smoothstep',
							// FIX: Use imported MarkerType
							markerEnd: { type: MarkerType.ArrowClosed }
						});
					}
				}); // End place loop

				// Update the Composite node's data with collected literals
				const nodeToUpdate = newNodes.find((n) => n.id === compositeId);
				if (nodeToUpdate && nodeToUpdate.type === 'compositeNode') {
					const literalsForNode = inlineLiterals.get(compositeId) || {};
					nodeToUpdate.data = {
						...nodeToUpdate.data,
						x1_literal: literalsForNode.x1 ?? null,
						x2_literal: literalsForNode.x2 ?? null,
						x3_literal: literalsForNode.x3 ?? null,
						x4_literal: literalsForNode.x4 ?? null,
						x5_literal: literalsForNode.x5 ?? null
					};
				}
			}); // End composite loop
		}

		nodes.set(newNodes);
		edges.set(newEdges);
		// FIX: Update log message
		console.log(`[GraphView] Updated graph: ${newNodes.length} nodes, ${newEdges.length} edges`);
	}
</script>

<svelte:head>
	<title>Hominio - Graph View</title>
</svelte:head>

<div class="h-full w-full">
	<div class="absolute top-4 left-4 z-10 rounded bg-white p-2 shadow">
		<!-- TODO: Replace with a proper Leaf selector -->
		<!-- FIX: Use updated variable name -->
		<label for="leaf-select">Selected Leaf ID:</label>
		<input
			id="leaf-select"
			type="text"
			bind:value={selectedLeafId}
			class="ml-2 border p-1"
			placeholder="Enter Leaf ID"
		/>
		<button on:click={fetchData} class="ml-2 rounded bg-blue-500 px-2 py-1 text-white"
			>Load Graph</button
		>
	</div>

	<!-- Loading / Error Indicator -->
	<!-- FIX: Use updated variable name -->
	{#if isLoadingComposites}
		<div class="bg-opacity-50 absolute inset-0 z-20 flex items-center justify-center bg-gray-500">
			<div class="rounded bg-white p-4 shadow">Loading Composites...</div>
		</div>
		<!-- FIX: Use updated variable name and check for null -->
	{:else if compositeResults === null}
		<div class="absolute inset-0 z-20 flex items-center justify-center bg-red-100">
			<!-- FIX: Update error message -->
			<div class="rounded border border-red-500 bg-white p-4 text-red-700 shadow">
				Error loading Composites. Check console for details.
			</div>
		</div>
	{/if}

	<SvelteFlow {nodes} {edges} {nodeTypes} fitView>
		<Background variant={BackgroundVariant.Dots} gap={15} size={1} />
		<Controls />
		<MiniMap />
	</SvelteFlow>
</div>

<style>
	/* Add specific styles for edge labels if needed */
	:global(.svelte-flow__edge-text) {
		fill: #555; /* Default text color */
		font-size: 10px;
		font-weight: 500;
		pointer-events: none; /* Allow clicking through text */
		transition:
			fill 0.2s ease,
			font-weight 0.2s ease;
	}

	:global(.svelte-flow__edge-textbg) {
		fill: rgba(255, 255, 255, 0.7); /* Semi-transparent white background */
		stroke: none;
		stroke-width: 0;
	}

	:global(.svelte-flow__edge:hover .svelte-flow__edge-text) {
		fill: #0b77cc; /* Blue on hover */
		font-weight: 700;
	}

	:global(.svelte-flow__edge:hover .svelte-flow__edge-textbg) {
		fill: rgba(230, 245, 255, 0.8); /* Lighter background on hover */
	}
</style>
