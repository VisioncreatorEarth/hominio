import { browser } from '$app/environment';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import { roadmapConfig } from '$lib/roadmap/config';
import {
    createPublicClient,
    http,
    formatUnits,
    isAddress,
    type Address,
    type PublicClient
} from 'viem';
import { gnosis } from 'viem/chains';

const DEFAULT_CHAIN_ID = gnosis.id; // Gnosis mainnet

// ABI subset for ERC20 balanceOf and decimals
const erc20Abi = [
    {
        stateMutability: 'view' as const,
        inputs: [{ name: '_owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: 'balance', type: 'uint256' }],
        type: 'function'
    },
    {
        stateMutability: 'view' as const,
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        type: 'function'
    }
] as const;

async function getPkpEthAddressFromStorage(): Promise<Address | null> {
    if (!browser) return null;
    const storedPKPDataString = localStorage.getItem('mintedPKPData');
    if (storedPKPDataString) {
        try {
            const storedPKPData = JSON.parse(storedPKPDataString);
            if (storedPKPData && storedPKPData.pkpEthAddress && isAddress(storedPKPData.pkpEthAddress)) {
                return storedPKPData.pkpEthAddress as Address;
            }
        } catch (error) {
            console.warn('[getPKPBalanceTool] Error parsing mintedPKPData from localStorage:', error);
            return null;
        }
    }
    return null;
}

export async function getPKPBalanceImplementation(parameters: ToolParameters): Promise<string> {
    console.log('[getPKPBalanceTool] Called with parameters:', parameters);
    let pkpEthAddress: Address | null = null;
    let chainId: number = DEFAULT_CHAIN_ID;

    try {
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try { parsedParams = JSON.parse(parameters); } catch (parseError) {
                console.warn('[getPKPBalanceTool] Failed to parse parameters string:', parameters, parseError);
            }
        }

        if (parsedParams.pkpEthAddress && typeof parsedParams.pkpEthAddress === 'string' && isAddress(parsedParams.pkpEthAddress)) {
            pkpEthAddress = parsedParams.pkpEthAddress as Address;
        } else {
            pkpEthAddress = await getPkpEthAddressFromStorage();
        }

        if (!pkpEthAddress) {
            throw new Error('PKP Ethereum address not provided and could not be retrieved from user session/storage.');
        }

        if (parsedParams.chainId && typeof parsedParams.chainId === 'number') {
            chainId = parsedParams.chainId;
        }
        // For now, we are hardcoding to Gnosis from roadmap config, but a parameter could override this.
        // This tool specifically targets SAHEL on Gnosis as per initial request.
        const targetChainId = DEFAULT_CHAIN_ID;
        if (chainId !== targetChainId) {
            console.warn(`[getPKPBalanceTool] Requested chainId ${chainId} is different from target ${targetChainId}. Proceeding with ${targetChainId} for Sahel token.`);
            chainId = targetChainId;
        }

        const sahelPhaseConfig = roadmapConfig.phases.find((p) => p.name === 'Sahelanthropus');
        const SAHEL_TOKEN_ADDRESS = sahelPhaseConfig?.protocolTokenAddress as Address | undefined;
        const GNOSIS_RPC_URL = sahelPhaseConfig?.rpcUrls?.default?.http?.[0];

        if (!SAHEL_TOKEN_ADDRESS) {
            throw new Error('Sahel token address not configured in roadmapConfig.');
        }
        if (!GNOSIS_RPC_URL) {
            throw new Error('Gnosis RPC URL not configured in roadmapConfig.');
        }

        const publicClient: PublicClient = createPublicClient({
            chain: gnosis, // Assuming Gnosis for Sahel token
            transport: http(GNOSIS_RPC_URL)
        });

        let tokenDecimals = 18;
        try {
            const decimalsResult = await publicClient.readContract({
                address: SAHEL_TOKEN_ADDRESS,
                abi: erc20Abi,
                functionName: 'decimals'
            });
            tokenDecimals = decimalsResult as number;
        } catch (decError) {
            console.warn(`[getPKPBalanceTool] Could not fetch Sahel token decimals for ${SAHEL_TOKEN_ADDRESS}, defaulting to 18:`, decError);
        }

        const rawBalance = await publicClient.readContract({
            address: SAHEL_TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [pkpEthAddress]
        }) as bigint;

        const formattedBalance = formatUnits(rawBalance, tokenDecimals);
        const tokenSymbol = sahelPhaseConfig?.shortTokenName || 'SAHEL';

        const successMessage = `Balance for ${pkpEthAddress} on chain ${chainId} (${tokenSymbol}): ${formattedBalance}`;
        logToolActivity('getPKPBalance', successMessage);
        return JSON.stringify({
            success: true,
            pkpAddress: pkpEthAddress,
            chainId: chainId,
            balance: `${formattedBalance} ${tokenSymbol}`,
            rawBalance: rawBalance.toString(),
            decimals: tokenDecimals,
            tokenAddress: SAHEL_TOKEN_ADDRESS,
            message: successMessage
        });

    } catch (error) {
        console.error('[getPKPBalanceTool] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logToolActivity('getPKPBalance', `Error: ${errorMessage}`, false);
        return JSON.stringify({
            success: false,
            message: `Error fetching PKP balance: ${errorMessage}`,
            pkpAddress: pkpEthAddress,
            chainId: chainId
        });
    }
} 