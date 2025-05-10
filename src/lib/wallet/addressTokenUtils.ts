import { roadmapConfig } from '$lib/roadmap/config';
import { createPublicClient, http } from 'viem';
import { gnosis } from 'viem/chains';

export function shortAddress(addr: string | undefined | null): string {
    if (!addr || typeof addr !== 'string') return '-';
    return addr.length > 12 ? addr.slice(0, 12) + '...' : addr;
}

const erc20NameSymbolAbi = [
    { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
    { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }
];

export function getKnownTokenMeta(address: string): { name: string | null, symbol: string | null } {
    const local = roadmapConfig.phases
        .flatMap(p => p.protocolTokenAddress ? [{
            address: p.protocolTokenAddress.toLowerCase(),
            name: p.longTokenName || p.name,
            symbol: p.shortTokenName || p.name
        }] : [])
        .find(t => t.address === address.toLowerCase());
    if (local) {
        return { name: local.name, symbol: local.symbol };
    }
    return { name: null, symbol: null };
}

export async function resolveTokenMeta(address: string): Promise<{ name: string | null, symbol: string | null }> {
    // 1. Try local config
    const known = getKnownTokenMeta(address);
    if (known.name && known.symbol) return known;
    // 2. Fallback to on-chain fetch
    try {
        const publicClient = createPublicClient({ chain: gnosis, transport: http() });
        const name = await publicClient.readContract({ address: address as `0x${string}`, abi: erc20NameSymbolAbi, functionName: 'name' }) as string;
        const symbol = await publicClient.readContract({ address: address as `0x${string}`, abi: erc20NameSymbolAbi, functionName: 'symbol' }) as string;
        return { name, symbol };
    } catch {
        return { name: null, symbol: null };
    }
} 