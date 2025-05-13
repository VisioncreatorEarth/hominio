import type { AccessControlConditions } from '@lit-protocol/types'; // Use the general ACC type
import type { Hex, Address, TransactionSerializable } from 'viem';
// import type { StoredPasskeyData } from './passkeySigner'; // No longer needed in base request

// Base interface for all PKP signing/operation requests to the modal
// PKP-specific details are now handled internally by the modal using currentUserPkpProfileStore.
export interface PKPSigningRequestBase {
    // pkpPublicKey: Hex; // Removed
    // pkpEthAddress: Address; // Removed
    // pkpTokenId: string; // Removed
    // passkeyData: StoredPasskeyData; // Removed

    // Operation-specific fields remain, identified by 'type' and other properties.
    // For example, 'transaction' for transaction type, 'message' for message type, etc.
}

// Specific request types now only contain operation-specific data + their 'type' discriminator.
export interface PKPSignMessageRequest {
    type: 'message';
    message: string;
}

export interface PKPSignTransactionRequest {
    type: 'transaction';
    transaction: TransactionSerializable;
    tokenDecimals?: number; // For modal display purposes
}

export interface PKPExecuteActionRequest {
    type: 'executeAction';
    actionCode: string;
    actionJsParams?: Record<string, unknown>;
}

export interface PKPEncryptRequest {
    type: 'encrypt';
    dataToEncrypt: string;
    accessControlConditions: AccessControlConditions;
    chain: string;
}

export interface PKPDecryptRequest {
    type: 'decrypt';
    ciphertext: string;
    dataToEncryptHash: string;
    accessControlConditions: AccessControlConditions;
    chain: string;
}

// New request type for authenticating a PKP session
export interface PKPAuthenticateSessionRequest {
    type: 'authenticateSession';
    // No additional specific params needed.
    // The modal will use the internally loaded currentUserPkpProfile for authentication.
}

// Union type for all possible requests
export type PKPSigningRequestData =
    | PKPSignMessageRequest
    | PKPSignTransactionRequest
    | PKPExecuteActionRequest
    | PKPEncryptRequest
    | PKPDecryptRequest
    | PKPAuthenticateSessionRequest; 