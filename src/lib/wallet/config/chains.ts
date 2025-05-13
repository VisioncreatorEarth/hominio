import type { Chain } from 'viem';

// Define Lit Network Environments
export type LitNetworkEnvironment = 'datil-dev' | 'datil-test' | 'datil';

// --- Chain Definitions ---

// datil-dev (Chronicle Yellowstone - current)
export const datilDevChain: Chain = {
    id: 175188,
    name: 'Datil DevNet',
    nativeCurrency: { name: 'tstLPX', symbol: 'tstLPX', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://yellowstone-rpc.litprotocol.com/'] },
        public: { http: ['https://yellowstone-rpc.litprotocol.com/'] }
    },
    blockExplorers: {
        default: { name: 'Yellowstone Explorer', url: 'https://yellowstone-explorer.litprotocol.com' }
    },
    testnet: true
};

// datil-test (Using yellowstone RPC/Explorer as per screenshot, please verify/update)
export const datilTestChain: Chain = {
    id: 175188, // Keeping a distinct ID for now, verify if it shares ID with datil-dev
    name: 'Datil Test Network',
    nativeCurrency: { name: 'Test LIT', symbol: 'tstLPX', decimals: 18 }, // Assuming same as datil-dev, please verify
    rpcUrls: {
        default: { http: ['https://yellowstone-rpc.litprotocol.com/'] },
        public: { http: ['https://yellowstone-rpc.litprotocol.com/'] }
    },
    blockExplorers: {
        default: { name: 'Yellowstone Explorer', url: 'https://yellowstone-explorer.litprotocol.com' }
    },
    testnet: true
};

// datil (Production - Placeholder - please update with actual values)
export const datilChain: Chain = {
    id: 175188,
    name: 'Datil Mainnet',
    nativeCurrency: { name: 'tstLPX', symbol: 'tstLPX', decimals: 18 }, // Assuming this is still correct for mainnet, verify if LPX is used.
    rpcUrls: {
        default: { http: ['https://yellowstone-rpc.litprotocol.com/'] },
        public: { http: ['https://yellowstone-rpc.litprotocol.com/'] }
    },
    blockExplorers: {
        default: { name: 'Yellowstone Explorer', url: 'https://yellowstone-explorer.litprotocol.com' }
    },
    testnet: false // Mainnet should not be marked as testnet
};

// --- Network Selection ---
// Change this value to switch between environments
export const CURRENT_LIT_NETWORK_ENVIRONMENT: LitNetworkEnvironment = 'datil' as LitNetworkEnvironment;

// Resolved current chain based on the selected environment
let resolvedCurrentChain: Chain;
switch (CURRENT_LIT_NETWORK_ENVIRONMENT) {
    case 'datil-test':
        resolvedCurrentChain = datilTestChain;
        break;
    case 'datil':
        resolvedCurrentChain = datilChain;
        break;
    case 'datil-dev':
    default:
        resolvedCurrentChain = datilDevChain;
        break;
}

export const currentLitChain = resolvedCurrentChain; 