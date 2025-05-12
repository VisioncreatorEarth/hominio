import type { AccessControlConditions } from '@lit-protocol/types'; // Use the general ACC type
import type { Hex, Address, TransactionSerializable } from 'viem';
// import type { AccessControlConditions } from '@lit-protocol/types'; // Placeholder

// Base request structure
interface PKPSigningRequestBase {
    pkpPublicKey: Hex;
    pkpEthAddress: Address;
    // litNodeClient and sessionSigs are handled by the modal internally or via pkpSessionStore
    // and should not be passed by the calling page anymore.
    // litNodeClient?: LitNodeClient; 
    // sessionSigs?: SessionSigs;
}

// Specific request types
export interface PKPSignMessageRequest extends PKPSigningRequestBase {
    type: 'message';
    message: string;
}

export interface PKPSignTransactionRequest extends PKPSigningRequestBase {
    type: 'transaction';
    transaction: TransactionSerializable; // From viem
    tokenDecimals?: number; // For modal display purposes
}

export interface PKPExecuteActionRequest extends PKPSigningRequestBase {
    type: 'executeAction';
    actionCode: string;
    actionJsParams?: Record<string, unknown>; // Changed any to unknown
}

export interface PKPEncryptRequest extends PKPSigningRequestBase {
    type: 'encrypt';
    dataToEncrypt: string;
    accessControlConditions: AccessControlConditions; // Use the imported general type
    chain: string; // Chain for ACCs
}

export interface PKPDecryptRequest extends PKPSigningRequestBase {
    type: 'decrypt';
    ciphertext: string;
    dataToEncryptHash: string;
    accessControlConditions: AccessControlConditions; // Use the imported general type
    chain: string;
}

export interface PKPAuthenticateSessionRequest extends PKPSigningRequestBase {
    type: 'authenticateSession';
    // No additional specific params needed for just authenticating a session for the PKP
}

// Union type for all possible requests
export type PKPSigningRequestData =
    | PKPSignMessageRequest
    | PKPSignTransactionRequest
    | PKPExecuteActionRequest
    | PKPEncryptRequest
    | PKPDecryptRequest
    | PKPAuthenticateSessionRequest; 