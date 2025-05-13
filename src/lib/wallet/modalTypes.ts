import type { AccessControlConditions } from '@lit-protocol/types'; // Use the general ACC type
import type { TransactionSerializable } from 'viem';
export interface PKPSigningRequestBase {
}

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