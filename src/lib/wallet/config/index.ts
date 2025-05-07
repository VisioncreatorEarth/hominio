// import * as abis from './abis'; // This namespace import is not needed due to re-export
import { currentLitChain, CURRENT_LIT_NETWORK_ENVIRONMENT } from './chains';
import type { LitNetworkEnvironment } from './chains';
import { currentNetworkContractAddresses } from './contracts';

// Export all ABIs directly
export * from './abis';

// Export the currently selected chain definition
export const currentChain = currentLitChain;

// Export the currently selected network environment string (e.g., 'datil-dev')
export const currentLitEnvironment: LitNetworkEnvironment = CURRENT_LIT_NETWORK_ENVIRONMENT;

// Export the contract addresses for the current network
export const {
    PKP_PERMISSIONS_CONTRACT_ADDRESS,
    PKP_NFT_CONTRACT_ADDRESS,
    PKP_HELPER_CONTRACT_ADDRESS,
    RATE_LIMIT_NFT_CONTRACT_ADDRESS
} = currentNetworkContractAddresses; 