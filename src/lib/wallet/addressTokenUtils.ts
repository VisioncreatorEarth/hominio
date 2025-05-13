import { roadmapConfig } from '$lib/roadmap/config';
import { createPublicClient, http, type Hex, getAddress } from 'viem';
import { publicKeyToAddress } from 'viem/utils';
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

/**
 * Converts a given public key (hex string, typically uncompressed) to its corresponding Ethereum address.
 * @param publicKey The public key as a hex string (e.g., "0x04...").
 * @returns The Ethereum address (checksummed) or null if conversion fails.
 */
export function publicKeyToEthAddress(publicKey: Hex | string | undefined | null): `0x${string}` | null {
    if (!publicKey || typeof publicKey !== 'string' || !publicKey.startsWith('0x')) {
        console.error('[publicKeyToEthAddress] Invalid public key input. Must be a hex string starting with 0x.');
        return null;
    }
    try {
        // Ensure publicKey is Hex type for publicKeyToAddress
        const address = publicKeyToAddress(publicKey as Hex);
        return getAddress(address); // Return checksummed address
    } catch (error) {
        console.error('[publicKeyToEthAddress] Error converting public key to address:', error);
        return null;
    }
} 