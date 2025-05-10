import type { Hex, Address, TransactionSerializable } from 'viem';
// import type { AccessControlConditions } from '@lit-protocol/types'; // Placeholder

export type PKPSigningRequestData = {
    pkpPublicKey: Hex; // REQUIRED: Public key of the PKP performing the action
    pkpEthAddress: Address; // REQUIRED: ETH address of the PKP
    type: 'transaction' | 'message' | 'executeAction' | 'encrypt' | 'decrypt';
    // Transaction specific
    transaction?: TransactionSerializable;
    tokenDecimals?: number; // For ERC20 transfer display
    // Message specific
    message?: string;
    // Lit Action specific
    actionCode?: string;
    actionJsParams?: Record<string, unknown>;
    // Encryption specific
    dataToEncrypt?: string;
    // TODO: Replace 'any' with the actual Lit SDK type for AccessControlConditions
    // e.g., import { AccessControlConditions } from '@lit-protocol/types';
    accessControlConditions?: any; // Replace 'any' with actual Lit SDK type e.g. AccessControlConditions[] 
    // Decryption specific
    ciphertext?: string;
    dataToEncryptHash?: string; // For decryption
    // accessControlConditions?: any; // Re-used from encryption if needed, or specific for decryption. Already defined above.
    chain?: string; // For decryption if ACCs are chain-specific
}; 