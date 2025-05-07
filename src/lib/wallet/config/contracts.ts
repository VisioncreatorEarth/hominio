import type { Address } from 'viem';
import { CURRENT_LIT_NETWORK_ENVIRONMENT } from './chains';
import type { LitNetworkEnvironment } from './chains';

interface ContractAddresses {
    PKP_PERMISSIONS_CONTRACT_ADDRESS: Address;
    PKP_NFT_CONTRACT_ADDRESS: Address;
    PKP_HELPER_CONTRACT_ADDRESS: Address;
    RATE_LIMIT_NFT_CONTRACT_ADDRESS: Address;
}

const addresses: Record<LitNetworkEnvironment, ContractAddresses> = {
    'datil-dev': {
        PKP_PERMISSIONS_CONTRACT_ADDRESS: '0xf64638F1eb3b064f5443F7c9e2Dc050ed535D891',
        PKP_NFT_CONTRACT_ADDRESS: '0x8F75CCe7Ce6052844114815463660a1dC1476A1A',
        PKP_HELPER_CONTRACT_ADDRESS: '0xCa9C62fB4ceA8831eBb6fD9fE747Cc372515CF7f',
        RATE_LIMIT_NFT_CONTRACT_ADDRESS: '0x1A12D5B3D6A52B3bDe0468900795D35ce994ac2b',
    },
    'datil-test': {
        PKP_PERMISSIONS_CONTRACT_ADDRESS: '0x60C1ddC8b9e38F730F0e7B70A2F84C1A98A69167',
        PKP_NFT_CONTRACT_ADDRESS: '0x6a0f439f064B7167A8Ea6B22AcC07ae5360ee0d1',
        PKP_HELPER_CONTRACT_ADDRESS: '0x341E5273E2E2ea3c4aDa4101F008b1261E58510D' as Address,
        RATE_LIMIT_NFT_CONTRACT_ADDRESS: '0xa17f11B7f828EEc97926E56D98D5AB63A0231b77',
    },
    'datil': {
        // Placeholders - replace with actual datil (production) addresses
        PKP_PERMISSIONS_CONTRACT_ADDRESS: '0xYourDatilProdPkpPermissionsAddress' as Address,
        PKP_NFT_CONTRACT_ADDRESS: '0xYourDatilProdPkpNftAddress' as Address,
        PKP_HELPER_CONTRACT_ADDRESS: '0xYourDatilProdPkpHelperAddress' as Address,
        RATE_LIMIT_NFT_CONTRACT_ADDRESS: '0xYourDatilProdRateLimitNftAddress' as Address,
    },
};

export const currentNetworkContractAddresses = addresses[CURRENT_LIT_NETWORK_ENVIRONMENT]; 