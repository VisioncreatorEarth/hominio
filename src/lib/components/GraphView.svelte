<script lang="ts">
	import { writable, type Writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import { getContext, type SvelteComponent } from 'svelte';
	import { getMe as getMeType } from '$lib/KERNEL/hominio-auth';
	import {
		executeQuery,
		type LoroHqlQuery,
		type QueryResult,
		type PlaceKey
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
		type NodeTypes,
		MarkerType
	} from '@xyflow/svelte';

	import CompositeNodes from './CompositeNodes.svelte';

	import '@xyflow/svelte/dist/style.css';

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
			| null;
		value?: unknown | null;
	}

	interface ResolvedSchema extends QueryResult {
		id: string | null;
		name?: string | null;
		translations?: {
			en?: {
				title?: string;
				places?: Record<PlaceKey, { title?: string; description?: string }>;
			};
		} | null;
	}

	interface CompositeInstanceData extends QueryResult {
		compositeId: string;
		schemaId: string;
		schema_resolved: ResolvedSchema | null;
		x1_leaf_resolved: ResolvedLeaf | null;
		x2_leaf_resolved: ResolvedLeaf | null;
		x3_leaf_resolved: ResolvedLeaf | null;
		x4_leaf_resolved: ResolvedLeaf | null;
		x5_leaf_resolved: ResolvedLeaf | null;
	}

	interface LeafQueryResult extends QueryResult {
		id: string;
		all_composites_involved_in: CompositeInstanceData[];
	}

	const nodes: Writable<Node[]> = writable([]);
	const edges: Writable<Edge[]> = writable([]);

	const nodeTypes: NodeTypes = {
		compositeNode: CompositeNodes as any
	};

	let selectedLeafId: string | null =
		'0x33cc642063bf6bb00259f9480edb9374151072050f8cd8578483b1b9c1478905';
	let compositeResults: CompositeInstanceData[] | null = [];
	let isLoadingComposites: boolean = false;

	type GetCurrentUserFn = typeof getMeType;
	const getMe = getContext<GetCurrentUserFn>('getMe');

	function getCompositeQuery(leafId: string): LoroHqlQuery {
		return {
			from: {
				leaf: [leafId]
			},
			map: {
				id: { field: 'doc.pubkey' },
				all_composites_involved_in: {
					traverse: {
						composite_where: {
							schemaId: '*',
							place: '*'
						},
						return: 'array',
						map: {
							compositeId: { field: 'doc.pubkey' },
							schemaId: { field: 'self.data.schemaId' },
							schema_resolved: {
								resolve: {
									fromField: 'self.data.schemaId',
									targetType: 'gismu',
									map: {
										id: { field: 'doc.pubkey' },
										name: { field: 'self.data.name' },
										translations: { field: 'self.data.translations' }
									}
								}
							},
							x1_leaf_resolved: {
								resolve: {
									fromField: 'self.data.places.x1',
									targetType: 'leaf',
									map: {
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

	async function fetchData() {
		if (!selectedLeafId) return;

		isLoadingComposites = true;
		compositeResults = [];
		nodes.set([]);
		edges.set([]);

		const query = getCompositeQuery(selectedLeafId);
		const currentUser = getMe();

		try {
			console.log('[GraphView] Executing query for selected Leaf ID:', selectedLeafId);
			const results = await executeQuery(query, currentUser);
			console.log('[GraphView] Query results:', results);

			if (results && results.length > 0) {
				compositeResults = (results[0] as LeafQueryResult).all_composites_involved_in ?? [];
			} else {
				compositeResults = [];
			}
		} catch (error) {
			console.error('[GraphView] Error executing composite query:', error);
			compositeResults = null;
		} finally {
			isLoadingComposites = false;
		}
	}

	onMount(() => {
		fetchData();
	});

	function truncate(str: string | null | undefined, length = 15): string {
		if (!str) return '';
		const prefix = str.startsWith('0x') ? '0x' : '';
		const content = str.startsWith('0x') ? str.substring(2) : str;
		const truncatedContent =
			content.length > length ? content.substring(0, length) + '...' : content;
		return prefix + truncatedContent;
	}

	function isLiteralLeaf(leaf: ResolvedLeaf | null): boolean {
		if (!leaf) return false;
		const type = leaf.type;
		const value = leaf.value;

		if (
			(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
			(!type || ['LoroText', 'LoroInteger', 'LoroBoolean'].includes(type))
		) {
			return true;
		}
		return false;
	}

	$: {
		console.log('[GraphView] Reactivity triggered', { selectedLeafId, compositeResults });
		const newNodes: Node[] = [];
		const newEdges: Edge[] = [];
		const nodeMap = new Map<string, Node>();
		const compositePositions: { [place: string]: { angle: number; count: number } } = {
			x1: { angle: -Math.PI / 2, count: 0 },
			x2: { angle: -Math.PI / 2 + (1 * 2 * Math.PI) / 5, count: 0 },
			x3: { angle: -Math.PI / 2 + (2 * 2 * Math.PI) / 5, count: 0 },
			x4: { angle: -Math.PI / 2 + (3 * 2 * Math.PI) / 5, count: 0 },
			x5: { angle: -Math.PI / 2 + (4 * 2 * Math.PI) / 5, count: 0 }
		};
		const centerPos: XYPosition = { x: 600, y: 400 };
		const compositeRadius = 250;
		const neighborRadius = 450;
		const compositeOffsetAmount = 50;
		const inlineLiterals = new Map<
			string,
			{ [place in PlaceKey]?: string | number | boolean | null }
		>();

		if (!selectedLeafId) {
			nodes.set([]);
			edges.set([]);
		} else if (compositeResults === null) {
			nodes.set([]);
			edges.set([]);
		} else {
			if (!nodeMap.has(selectedLeafId)) {
				const centerNode: Node = {
					id: selectedLeafId,
					type: 'default',
					position: centerPos,
					data: { label: `${truncate(selectedLeafId)}` },
					draggable: true,
					style: 'background-color: #eef; border-color: #aac; color: #335;'
				};
				newNodes.push(centerNode);
				nodeMap.set(selectedLeafId, centerNode);
			}

			if (compositeResults.length > 0) {
				(compositeResults as CompositeInstanceData[]).forEach((composite, compositeIndex) => {
					const compositeId = composite.compositeId;
					const schemaId = composite.schemaId;
					const schemaResolved = composite.schema_resolved;
					const schemaName = schemaResolved?.name || 'Unknown Schema';

					let compositeNode: Node;
					if (nodeMap.has(compositeId)) {
						compositeNode = nodeMap.get(compositeId)!;
					} else {
						if (compositeResults) {
							const angleIncrement = (2 * Math.PI) / compositeResults.length;
							const angle = compositeIndex * angleIncrement - Math.PI / 2;
							const position: XYPosition = {
								x: centerPos.x + compositeRadius * Math.cos(angle),
								y: centerPos.y + compositeRadius * Math.sin(angle)
							};

							const compositeNodeData = {
								label: schemaName,
								translations: schemaResolved?.translations ?? undefined,
								x1_literal: null,
								x2_literal: null,
								x3_literal: null,
								x4_literal: null,
								x5_literal: null
							};
							inlineLiterals.set(compositeId, {});

							compositeNode = {
								id: compositeId,
								type: 'compositeNode',
								position,
								data: compositeNodeData,
								draggable: true
							};
							newNodes.push(compositeNode);
							nodeMap.set(compositeId, compositeNode);
						} else {
							console.warn(`[GraphView] compositeResults became null unexpectedly during loop.`);
							return;
						}
					}

					const places: PlaceKey[] = ['x1', 'x2', 'x3', 'x4', 'x5'];
					places.forEach((place) => {
						const resolvedLeaf = composite[`${place}_leaf_resolved`];
						if (!resolvedLeaf || !resolvedLeaf.id) return;

						const leafId = resolvedLeaf.id;

						if (isLiteralLeaf(resolvedLeaf)) {
							const literals = inlineLiterals.get(compositeId);
							if (literals) {
								literals[place] = resolvedLeaf.value as string | number | boolean | null;
							}
							return;
						}

						if (leafId === selectedLeafId) {
							newEdges.push({
								id: `edge-${leafId}-${compositeId}-${place}`,
								source: leafId,
								target: compositeId,
								targetHandle: `handle-${place}`,
								label: place,
								type: 'smoothstep',
								markerEnd: { type: MarkerType.ArrowClosed }
							});
						} else {
							let neighborNode: Node;
							if (nodeMap.has(leafId)) {
								neighborNode = nodeMap.get(leafId)!;
							} else {
								const posData = compositePositions[place];
								posData.count++;
								const angle = posData.angle;
								const offsetRadius = neighborRadius + posData.count * compositeOffsetAmount;
								const neighborPosition: XYPosition = {
									x: centerPos.x + offsetRadius * Math.cos(angle),
									y: centerPos.y + offsetRadius * Math.sin(angle)
								};

								neighborNode = {
									id: leafId,
									type: 'default',
									position: neighborPosition,
									data: { label: `${truncate(leafId)}` },
									draggable: true,
									style: 'background-color: #eef; border-color: #aac; color: #335;'
								};
								newNodes.push(neighborNode);
								nodeMap.set(leafId, neighborNode);
							}

							newEdges.push({
								id: `edge-${compositeId}-${place}-${leafId}`,
								source: compositeId,
								sourceHandle: `handle-${place}`,
								target: leafId,
								label: place,
								type: 'smoothstep',
								markerEnd: { type: MarkerType.ArrowClosed }
							});
						}
					});

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
				});
			}
		}

		nodes.set(newNodes);
		edges.set(newEdges);
		console.log(`[GraphView] Updated graph: ${newNodes.length} nodes, ${newEdges.length} edges`);
	}
</script>

<svelte:head>
	<title>Hominio - Graph View</title>
</svelte:head>

<div class="h-full w-full">
	<div class="absolute top-4 left-4 z-10 rounded bg-white p-2 shadow">
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

	{#if isLoadingComposites}
		<div class="bg-opacity-50 absolute inset-0 z-20 flex items-center justify-center bg-gray-500">
			<div class="rounded bg-white p-4 shadow">Loading Composites...</div>
		</div>
	{:else if compositeResults === null}
		<div class="absolute inset-0 z-20 flex items-center justify-center bg-red-100">
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
	:global(.svelte-flow__edge-text) {
		fill: #555;
		font-size: 10px;
		font-weight: 500;
		pointer-events: none;
		transition:
			fill 0.2s ease,
			font-weight 0.2s ease;
	}

	:global(.svelte-flow__edge-textbg) {
		fill: rgba(255, 255, 255, 0.7);
		stroke: none;
		stroke-width: 0;
	}

	:global(.svelte-flow__edge:hover .svelte-flow__edge-text) {
		fill: #0b77cc;
		font-weight: 700;
	}

	:global(.svelte-flow__edge:hover .svelte-flow__edge-textbg) {
		fill: rgba(230, 245, 255, 0.8);
	}

	:global(.svelte-flow__node-default) {
		background-color: #eef;
		border-color: #aac;
		color: #335;
		padding: 5px 10px;
		font-size: 12px;
		border-radius: 4px;
	}
</style>
