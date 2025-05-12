<script lang="ts">
	import { getContext } from 'svelte';
	import { readable } from 'svelte/store';
	import type { LoroHqlQueryExtended, QueryResult } from '$lib/KERNEL/hominio-types';

	const o = getContext<typeof import('$lib/KERNEL/hominio-svelte').o>('o');

	type PrenuResult = {
		prenuPubkey: string;
		name?: string;
		walletAddress?: string;
	};

	const prenuSchemaId = '0xc6025f573842e81ac505d29f4a77ac822a3e4db4f227c319ba6c54f927e1b663';
	const cnemeSchemaId = '0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96';
	const ponseSchemaId = '0xff494b92bc1a534343fe5182f3f4c0c7c825a99eee6e909496614fa422ca94ec';

	const prenuQueryObject: LoroHqlQueryExtended = {
		steps: [
			{
				action: 'find',
				target: { schema: prenuSchemaId },
				variables: { prenuPubkey: { source: 'link.x1' } },
				resultVariable: 'prenuLinks',
				return: 'array'
			},
			{
				action: 'find',
				target: { schema: cnemeSchemaId },
				variables: {
					prenuForName: { source: 'link.x1' },
					nameLeaf: { source: 'link.x2' }
				},
				resultVariable: 'cnemeLinks',
				return: 'array'
			},
			{
				action: 'find',
				target: { schema: ponseSchemaId },
				variables: {
					prenuOwner: { source: 'link.x1' },
					walletConcept: { source: 'link.x2' }
				},
				resultVariable: 'ponseWalletLinks',
				return: 'array'
			},
			{
				action: 'find',
				target: { schema: cnemeSchemaId },
				variables: {
					walletForAddress: { source: 'link.x1' },
					walletAddressLeaf: { source: 'link.x2' }
				},
				resultVariable: 'cnemeWalletAddressLinks',
				return: 'array'
			},
			{
				action: 'join',
				left: { variable: 'prenuLinks', key: 'prenuPubkey' },
				right: { variable: 'cnemeLinks', key: 'prenuForName' },
				type: 'left',
				select: {
					prenuPubkey: { source: 'left.prenuPubkey' },
					nameLeafId: { source: 'right.nameLeaf' }
				},
				resultVariable: 'prenusWithNameLeaf'
			},
			{
				action: 'join',
				left: { variable: 'prenusWithNameLeaf', key: 'prenuPubkey' },
				right: { variable: 'ponseWalletLinks', key: 'prenuOwner' },
				type: 'left',
				select: {
					prenuPubkey: { source: 'left.prenuPubkey' },
					nameLeafId: { source: 'left.nameLeafId' },
					walletConceptId: { source: 'right.walletConcept' }
				},
				resultVariable: 'prenusWithWalletConcept'
			},
			{
				action: 'join',
				left: { variable: 'prenusWithWalletConcept', key: 'walletConceptId' },
				right: { variable: 'cnemeWalletAddressLinks', key: 'walletForAddress' },
				type: 'left',
				select: {
					prenuPubkey: { source: 'left.prenuPubkey' },
					nameLeafId: { source: 'left.nameLeafId' },
					walletAddressLeafId: { source: 'right.walletAddressLeaf' }
				},
				resultVariable: 'prenusWithWalletAddressLeaf'
			},
			{
				action: 'resolve',
				fromVariable: 'prenusWithWalletAddressLeaf',
				resolveFields: {
					name: {
						type: 'resolveLeafValue',
						pubkeyVar: 'nameLeafId',
						fallbackVar: 'prenuPubkey',
						valueField: 'value'
					},
					walletAddress: {
						type: 'resolveLeafValue',
						pubkeyVar: 'walletAddressLeafId',
						fallbackVar: 'walletAddressLeafId',
						valueField: 'value'
					}
				},
				resultVariable: 'resolvedPrenusWithWallet'
			}
		]
	};

	const queryStore = readable<LoroHqlQueryExtended | null>(prenuQueryObject);

	const prenusStore = o.subscribe(queryStore);

	function isPrenuResultArray(data: unknown): data is PrenuResult[] {
		return (
			Array.isArray(data) &&
			data.every((item) => typeof item === 'object' && item !== null && 'prenuPubkey' in item)
		);
	}
</script>

<div class="mx-auto max-w-7xl bg-[#f8f4ed] p-4 sm:p-6">
	<div class="mx-auto max-w-2xl">
		{#if $prenusStore === undefined}
			<div class="py-8 text-center">
				<div class="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[#0a2a4e]"></div>
				<p class="mt-4 text-gray-600">Loading friends...</p>
			</div>
		{:else if $prenusStore === null}
			<div class="py-8 text-center text-red-600">Error loading friends.</div>
		{:else if isPrenuResultArray($prenusStore) && $prenusStore.length === 0}
			<div class="py-8 text-center text-gray-600">No friends found</div>
		{:else if isPrenuResultArray($prenusStore)}
			<div class="space-y-4">
				{#each $prenusStore as prenu (prenu.prenuPubkey)}
					<div
						class="rounded-xl border border-[#d6c7b1] bg-[#f5f1e8] p-4 transition-all hover:shadow-md"
					>
						<div class="flex items-center gap-4">
							<div class="text-4xl">👤</div>
							<div class="flex-1">
								<h2 class="text-xl font-semibold text-[#0a2a4e]">{prenu.name ?? 'Unnamed'}</h2>
								<div class="mt-1 text-sm text-gray-600">
									<p class="truncate">ID: {prenu.prenuPubkey.slice(0, 8)}...</p>
									{#if prenu.walletAddress}
										<p class="mt-1 text-xs break-all">Wallet: {prenu.walletAddress}</p>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="py-8 text-center text-gray-600">Invalid data received.</div>
		{/if}
	</div>
</div>
