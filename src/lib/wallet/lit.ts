import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { createSiweMessageWithRecaps, LitActionResource, LitPKPResource } from '@lit-protocol/auth-helpers';
import { hashMessage, hexToBytes, keccak256, toBytes, createPublicClient, http } from 'viem';
import type { Address, Hex, WalletClient, PublicClient } from 'viem';
import type { SessionSigs, AuthCallbackParams, GetSessionSigsProps, AuthSig, SigResponse, ExecuteJsResponse } from '@lit-protocol/types';
import {
    AUTH_METHOD_TYPE_PASSKEY,
    formatSignatureForEIP1271,
    FACTORY_ADDRESS,
    FCL_VERIFIER_ADDRESS,
    EIP1271_MAGIC_VALUE,
    type StoredPasskeyData,
    type AuthenticatorAssertionResponse
} from './passkeySigner';
import { utils as ethersUtils } from 'ethers';
import * as ipfsOnlyHash from 'ipfs-only-hash'; // Import ipfs-only-hash
// Import constants from config
import {
    chronicle,
    PKP_PERMISSIONS_CONTRACT_ADDRESS_DATIL_DEV,
    PKP_PERMISSIONS_ABI
} from './config';

// --- Contract Details for datil-dev ---
// const PKP_PERMISSIONS_CONTRACT_ADDRESS_DATIL_DEV = ...; // Removed
// const PKP_PERMISSIONS_ABI = [ ... ]; // Removed
// --- END Contract Details ---

// --- Custom Auth Type Constants ---
// export const AUTH_METHOD_TYPE_PASSKEY = ... // This is in passkeySigner.ts

// --- NEW: Dummy Auth Type Constants ---
// Make AUTH_METHOD_TYPE_DUMMY a hash for uniqueness, similar to AUTH_METHOD_TYPE_PASSKEY
export const AUTH_METHOD_TYPE_DUMMY = keccak256(toBytes("hominio_dummy_auth_type_v1"));
export const DUMMY_AUTH_METHOD_ID = keccak256(toBytes("hominio_dummy_auth_id_v1")); // Ensure ID is also distinct if type changes meaning
console.log("AUTH_METHOD_TYPE_DUMMY (hashed):", AUTH_METHOD_TYPE_DUMMY);
console.log("DUMMY_AUTH_METHOD_ID:", DUMMY_AUTH_METHOD_ID);

export const connectToLit = async (): Promise<LitNodeClient> => {
    try {
        // More information about the available Lit Networks: https://developer.litprotocol.com/category/networks
        const litNodeClient = new LitNodeClient({
            litNetwork: 'datil-dev', // Use string literal for network
            debug: false
        });

        await litNodeClient.connect();
        console.log('Connected to Lit Network');
        return litNodeClient;
    } catch (error) {
        console.error('Failed to connect to Lit Network:', error);
        throw error;
    }
};

/**
 * Helper to create the authNeededCallback for getSessionSigs.
 */
export const createAuthNeededCallback = (
    litNodeClient: LitNodeClient,
    walletClient: WalletClient,
    eoaAddress: Address,
    chainId: number
) => {
    return async (params: AuthCallbackParams): Promise<AuthSig> => {
        console.log('Auth Callback triggered', params);
        let nonce = params.nonce;
        if (!nonce) {
            nonce = await litNodeClient.getLatestBlockhash();
        }

        // Ensure required params are present for SIWE message
        if (!params.uri || !params.expiration || !params.resourceAbilityRequests) {
            throw new Error('Missing required parameters for SIWE message generation in auth callback.');
        }

        const toSign = await createSiweMessageWithRecaps({
            uri: params.uri,
            expiration: params.expiration,
            resources: params.resourceAbilityRequests,
            walletAddress: eoaAddress,
            nonce: nonce,
            litNodeClient,
            chainId // Pass chainId for SIWE message
        });

        const signature = await walletClient.signMessage({
            account: eoaAddress,
            message: toSign
        });

        // Construct the AuthSig object correctly
        const authSig: AuthSig = {
            sig: signature,
            derivedVia: 'web3.eth.personal.sign',
            signedMessage: toSign,
            address: eoaAddress,
        };

        console.log('Generated AuthSig:', authSig);
        return authSig;
    };
};

/**
 * Generates session signatures for interacting with Lit Protocol.
 */
export const getSessionSigs = async (
    litNodeClient: LitNodeClient,
    chain: string,
    authNeededCallback: GetSessionSigsProps['authNeededCallback']
): Promise<SessionSigs> => {
    console.log('Generating session sigs...');
    try {
        const sessionSigs = await litNodeClient.getSessionSigs({
            chain,
            expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
            resourceAbilityRequests: [
                {
                    resource: new LitPKPResource('*'),
                    ability: 'pkp-signing' // Use string literal for ability
                },
                {
                    resource: new LitActionResource('*'),
                    ability: 'lit-action-execution' // Use string literal for ability
                }
            ],
            authNeededCallback
        });
        console.log('Session Sigs generated:', sessionSigs);
        return sessionSigs;
    } catch (error) {
        console.error('Error generating session sigs:', error);
        throw error;
    }
};

/**
 * Signs a message using the PKP.
 */
export const signWithPKP = async (
    litNodeClient: LitNodeClient,
    sessionSigs: SessionSigs,
    pkpPublicKey: Hex,
    message: string
): Promise<{ signature: Hex; dataSigned: Hex }> => {
    console.log('Signing message with PKP...');
    try {
        // Hash the message according to EIP-191
        const messageHash = hashMessage(message);

        // Call pkpSign directly with parameters
        const result = await litNodeClient.pkpSign({
            pubKey: pkpPublicKey,
            sessionSigs,
            toSign: hexToBytes(messageHash)
        }) as SigResponse; // Use SigResponse type

        // Combine r, s, v/recid from the result with runtime checks
        if (typeof result?.r !== 'string' || typeof result?.s !== 'string' || typeof result?.recid !== 'number') {
            console.error('Invalid signature structure returned from pkpSign:', result);
            throw new Error('Invalid signature structure returned from pkpSign');
        }
        const combinedSig = "0x" + result.r + result.s + result.recid.toString(16).padStart(2, '0');

        console.log('PKP Signing Result:', result);
        console.log('Combined Signature:', combinedSig);

        return {
            signature: combinedSig as Hex,
            dataSigned: messageHash
        };
    } catch (error) {
        console.error('Error signing with PKP:', error);
        throw error;
    }
};

/**
 * Executes a Lit Action (JS code).
 */
export const executeLitAction = async (
    litNodeClient: LitNodeClient,
    sessionSigs: SessionSigs,
    code: string,
    jsParams: Record<string, unknown> = {} // Optional JS params
): Promise<ExecuteJsResponse> => {
    console.log('Executing Lit Action...');
    try {
        const result = await litNodeClient.executeJs({
            code,
            sessionSigs,
            jsParams
        });
        console.log('Lit Action Execution Result:', result);
        return result as ExecuteJsResponse; // Cast to the specific type
    } catch (error) {
        console.error('Error executing Lit Action:', error);
        throw error;
    }
};

/**
 * Registers a passkey as a custom authentication method for a PKP.
 * GRANTS SignAnything scope by default.
 * TARGETS Chronicle Testnet.
 * 
 * @param walletClient The Viem WalletClient connected to the EOA.
 * @param eoaAddress The address of the EOA controller.
 * @param pkpTokenId The Token ID of the PKP to modify permissions for.
 * @param authMethodId The unique ID representing this passkey (e.g. hash of rawId).
 * @returns The transaction hash.
 */
export const registerPasskeyAuthMethod = async (
    walletClient: WalletClient,
    eoaAddress: Address,
    pkpTokenId: string,
    authMethodId: Hex
): Promise<Hex> => {
    console.log(`Attempting to register passkey auth method for PKP ${pkpTokenId} on Chronicle testnet...`);

    if (!authMethodId || !authMethodId.startsWith('0x')) {
        throw new Error("Auth method ID cannot be empty and must be a hex string.");
    }
    if (!pkpTokenId) {
        throw new Error("PKP Token ID cannot be empty.");
    }
    if (!walletClient || !eoaAddress) {
        throw new Error("Wallet client and EOA address are required.");
    }

    try {
        const currentChainId = await walletClient.getChainId();
        if (currentChainId !== chronicle.id) {
            throw new Error(`Wallet is connected to chain ${currentChainId}, but Chronicle (Chain ID: ${chronicle.id}) is required.`);
        }

        const authMethod = {
            authMethodType: BigInt(AUTH_METHOD_TYPE_PASSKEY),
            id: authMethodId,
            userPubkey: '0x' as Hex // Add empty userPubkey for PASSKEY type (as userPubkey is associated elsewhere)
        };
        const scopesToGrant = [1n];

        console.log(`Sending transaction to PKPPermissions contract (${PKP_PERMISSIONS_CONTRACT_ADDRESS_DATIL_DEV}) on chain ${chronicle.id} with explicit gas limit...`);

        const txHash = await walletClient.writeContract({
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS_DATIL_DEV,
            abi: PKP_PERMISSIONS_ABI,
            functionName: 'addPermittedAuthMethod',
            args: [
                BigInt(pkpTokenId),
                authMethod,
                scopesToGrant
            ],
            account: eoaAddress,
            chain: chronicle,
            gas: 500000n // Explicitly set gas limit
        });

        console.log('Register passkey auth method transaction sent to Chronicle:', txHash);
        return txHash;

    } catch (error) {
        console.error('Error registering passkey auth method on Chronicle:', error);
        if (error instanceof Error && error.message.includes('User rejected the request')) {
            throw new Error('Transaction rejected by user.');
        }
        throw new Error(`Failed to send transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// --- NEW: Dummy Auth Method Registration ---
/**
 * Registers the DUMMY auth method.
 */
export const registerDummyAuthMethod = async (
    walletClient: WalletClient,
    eoaAddress: Address,
    pkpTokenId: string
): Promise<Hex> => {
    console.log(`Attempting to register DUMMY auth method for PKP ${pkpTokenId} on Chronicle...`);
    try {
        const currentChainId = await walletClient.getChainId();
        if (currentChainId !== chronicle.id) {
            throw new Error(`Wallet is connected to chain ${currentChainId}, but Chronicle (Chain ID: ${chronicle.id}) is required.`);
        }

        const authMethod = {
            authMethodType: BigInt(AUTH_METHOD_TYPE_DUMMY), // Use new hashed dummy type
            id: DUMMY_AUTH_METHOD_ID,
            userPubkey: '0x' as Hex // Add empty userPubkey for DUMMY type
        };
        const scopesToGrant = [1n, 2n]; // Grant SignAnything and ExecuteJs

        console.log(`Sending transaction for DUMMY auth method: Type=${authMethod.authMethodType.toString(16)}, ID=${authMethod.id}, Scopes=${scopesToGrant.join(',')}`);

        const txHash = await walletClient.writeContract({
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS_DATIL_DEV,
            abi: PKP_PERMISSIONS_ABI,
            functionName: 'addPermittedAuthMethod',
            args: [BigInt(pkpTokenId), authMethod, scopesToGrant],
            account: eoaAddress,
            chain: chronicle,
            gas: 500000n // Keep explicit gas limit for now
        });

        console.log('Register DUMMY auth method transaction sent:', txHash);
        return txHash;

    } catch (error) {
        console.error('Error registering DUMMY auth method:', error);
        if (error instanceof Error && error.message.includes('User rejected the request')) {
            throw new Error('Transaction rejected by user.');
        }
        throw new Error(`Failed to send DUMMY auth transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// --- NEW: Dummy Lit Action & Session Sig Function ---

/**
 * DUMMY Lit Action: Does nothing but log and return success.
 * Expects jsParams: { dummyType: number | string | bigint, dummyId: Hex }
 */
export const dummyAuthActionCode = `
  const go = async () => {
    // Minimal action: only set a response.
    // This tests if Lit.Actions.setResponse is available.
    Lit.Actions.setResponse({ response: JSON.stringify({ verified: true, note: "Dummy verification minimal" }) });
  };
  go();
`;

/**
 * Generates session sigs using the DUMMY auth method and DUMMY Lit Action.
 */
export const getSessionSigsWithDummyAuth = async (
    litNodeClient: LitNodeClient,
    pkpPublicKey: Hex,
    chain: string
): Promise<SessionSigs> => {
    console.log('Attempting session sigs with DUMMY auth method...');
    try {
        const jsParams = {
            dummyType: AUTH_METHOD_TYPE_DUMMY,
            dummyId: DUMMY_AUTH_METHOD_ID
        };
        console.log('jsParams for DUMMY getLitActionSessionSigs:', jsParams);

        const resourceAbilityRequests = [
            { resource: new LitPKPResource('*'), ability: 'pkp-signing' as const },
            { resource: new LitActionResource('*'), ability: 'lit-action-execution' as const },
        ];

        let encodedLitActionCode;
        try {
            encodedLitActionCode = btoa(dummyAuthActionCode);
            console.log("Base64 Encoded DUMMY Lit Action Code sent.");
        } catch {
            throw new Error("Failed to Base64 encode dummy action code.");
        }

        const sessionSigs = await litNodeClient.getLitActionSessionSigs({
            pkpPublicKey,
            litActionCode: encodedLitActionCode,
            jsParams,
            chain,
            resourceAbilityRequests,
        });

        console.log('Session Sigs generated with DUMMY auth method:', sessionSigs);
        return sessionSigs;

    } catch (error) {
        console.error('Error getting session sigs with DUMMY auth method:', error);
        throw error; // Rethrow
    }
};

/**
 * Fetches all permitted authentication methods for a given PKP Token ID using direct Viem read.
 * @param pkpTokenId The Token ID of the PKP to query.
 * @returns A promise that resolves to an array of permitted auth methods.
 */
export const getPermittedAuthMethodsForPkp = async (
    pkpTokenId: string
    // No litNodeClient or sessionSigs needed for direct read
): Promise<Array<{ authMethodType: bigint; id: Hex; userPubkey: Hex }>> => {
    if (!pkpTokenId) {
        throw new Error("PKP Token ID cannot be empty.");
    }

    console.log(`Fetching permitted auth methods for PKP Token ID: ${pkpTokenId} via direct Viem read on chain ${chronicle.id}`);

    try {
        // Create a Viem Public Client for the Chronicle network
        const chroniclePublicClient: PublicClient = createPublicClient({
            chain: chronicle,
            transport: http() // Uses default RPC defined in chronicle object
        });

        // Call the contract read function
        const permittedMethodsRaw = await chroniclePublicClient.readContract({
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS_DATIL_DEV,
            abi: PKP_PERMISSIONS_ABI, // Use the full ABI imported from config
            functionName: 'getPermittedAuthMethods',
            args: [BigInt(pkpTokenId)] // Convert string token ID to BigInt for the contract call
        });

        console.log("Raw result from readContract:", permittedMethodsRaw);

        // Ensure the result is an array before mapping
        if (!Array.isArray(permittedMethodsRaw)) {
            console.error("Unexpected result format from readContract:", permittedMethodsRaw);
            throw new Error('Contract read returned unexpected format.');
        }

        // Map the result (Viem handles BigInts correctly in reads)
        return permittedMethodsRaw.map(method => ({
            authMethodType: method.authMethodType, // Should already be BigInt
            id: method.id,                     // Should already be Hex
            userPubkey: method.userPubkey          // Should already be Hex
        }));

    } catch (error: unknown) {
        console.error('Error fetching permitted auth methods via Viem read:', error);
        let message = 'Unknown error fetching permitted auth methods';
        if (error instanceof Error) {
            message = error.message;
            // Check for contract-specific errors if needed
            // E.g., if (error.message.includes('Invalid token ID')) { ... }
        }
        throw new Error(`Failed to fetch permitted auth methods: ${message}`);
    }
};

// --- NEW: Add Permitted Lit Action ---
/**
 * Registers a Lit Action as a permitted authentication method for a PKP.
 * Requires the EOA controller's wallet client to sign the transaction.
 *
 * @param walletClient The Viem WalletClient connected to the EOA controller.
 * @param eoaAddress The address of the EOA controller.
 * @param pkpTokenId The Token ID of the PKP to modify permissions for.
 * @param litActionCode The JavaScript code string of the Lit Action.
 * @param scopes An array of scope numbers (as bigints) to grant. Defaults to [1n] (SignAnything).
 * @returns The transaction hash.
 */
export const addPermittedLitAction = async (
    walletClient: WalletClient,
    eoaAddress: Address,
    pkpTokenId: string,
    litActionCode: string,
    scopes: bigint[] = [1n] // Default to SignAnything
): Promise<Hex> => {
    console.log(`Attempting to add Lit Action as permitted auth method for PKP ${pkpTokenId}...`);

    if (!litActionCode.trim()) {
        throw new Error('Lit Action code cannot be empty.');
    }
    if (!pkpTokenId) {
        throw new Error('PKP Token ID cannot be empty.');
    }
    if (!walletClient || !eoaAddress) {
        throw new Error('Wallet client and EOA address are required.');
    }

    try {
        const currentChainId = await walletClient.getChainId();
        if (currentChainId !== chronicle.id) {
            throw new Error(
                `Wallet is connected to chain ${currentChainId}, but Chronicle (Chain ID: ${chronicle.id}) is required.`
            );
        }

        // 1. Get IPFS CID of the Lit Action code using ipfs-only-hash
        console.log('Computing IPFS CID for Lit Action using ipfs-only-hash...');
        const ipfsCidBase58 = await ipfsOnlyHash.of(litActionCode);
        console.log('Computed Lit Action IPFS CID (Base58):', ipfsCidBase58);

        // 2. Process CID for contract (Base58 -> Bytes -> Hex)
        let idForContract: Hex;
        try {
            const cidBytes = ethersUtils.base58.decode(ipfsCidBase58);
            idForContract = `0x${Buffer.from(cidBytes).toString('hex')}`; // Corrected line ending
            console.log('Processed Action ID for contract (Hex): ', idForContract);
        } catch (decodeError) {
            console.error('Error processing IPFS CID:', decodeError);
            throw new Error(`Failed to process IPFS CID ${ipfsCidBase58}: ${decodeError}`);
        }

        const authMethodPayload = {
            authMethodType: 2n, // Type 2 for ACTION
            id: idForContract,
            userPubkey: '0x' as Hex // Add empty userPubkey for ACTION type
        };

        console.log(
            `Sending transaction to add permitted action: Type=${authMethodPayload.authMethodType}, ID=${authMethodPayload.id}, Scopes=${scopes.join(',')}`
        );

        const txHash = await walletClient.writeContract({
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS_DATIL_DEV,
            abi: PKP_PERMISSIONS_ABI,
            functionName: 'addPermittedAuthMethod',
            args: [BigInt(pkpTokenId), authMethodPayload, scopes],
            account: eoaAddress,
            chain: chronicle,
            gas: 500000n // Consider estimating gas later (Task 3.3)
        });

        console.log('Add permitted Lit Action transaction sent:', txHash);
        return txHash; // Ensure the function returns the transaction hash

    } catch (error) {
        console.error('Error adding permitted Lit Action:', error);
        if (error instanceof Error && error.message.includes('User rejected the request')) {
            throw new Error('Transaction rejected by user.');
        }
        throw new Error(
            `Failed to send transaction for permitted action: ${error instanceof Error ? error.message : String(error)}`
        );
    }
};

// --- NEW: Gnosis Passkey Verification Lit Action & Session Sig Function ---

/**
 * Lit Action code for verifying a passkey signature against Gnosis Chain contracts.
 * This action attempts to verify against a deployed EIP-1271 proxy first,
 * then falls back to the SafeWebAuthnSignerFactory if needed.
 */
export const gnosisPasskeyVerifyActionCode = `
  const go = async () => {
    console.log("[LitAction_GnosisVerify] Starting. Using provider.call via getRpcUrl('xdai'). Checking result with startsWith.");
    
    if (typeof ethers === 'undefined') {
      throw new Error("[LitAction_GnosisVerify] ethers.js is not available globally!");
    }
    if (typeof Lit === 'undefined' || typeof Lit.Actions === 'undefined' || typeof Lit.Actions.getRpcUrl === 'undefined' || typeof Lit.Actions.setResponse === 'undefined') {
      throw new Error("[LitAction_GnosisVerify] Lit.Actions or required functions not available.");
    }

    if (!messageHash || !formattedSignature || !publicKeyX || !publicKeyY || !JS_EIP1271_MAGIC_VALUE || typeof authMethodType === 'undefined' || !authMethodId || !passkeySignerContractAddress || !JS_FACTORY_ADDRESS || !JS_FCL_VERIFIER_ADDRESS) {
        throw new Error("[LitAction_GnosisVerify] A required jsParam is missing.");
    }

    let verificationResult;
    let verified = false;
    const chainIdentifiersToTry = ['xdai', 'gnosis'];
    const publicGnosisRpcUrl = 'https://rpc.gnosischain.com';
    const nullAddress = '0x0000000000000000000000000000000000000000';
    let rpcUrl = null;

    // Logic to get RPC URL (try 'xdai', 'gnosis', then fallback)
    for (const chainName of chainIdentifiersToTry) {
        try {
            const potentialRpcUrl = await Lit.Actions.getRpcUrl({ chain: chainName });
            if (potentialRpcUrl && typeof potentialRpcUrl === 'string' && potentialRpcUrl.startsWith('http')) {
                rpcUrl = potentialRpcUrl;
                console.log("[LitAction_GnosisVerify] Successfully obtained RPC URL from Lit.Actions.getRpcUrl('" + chainName + "'):", rpcUrl);
                break; 
            }
        } catch (e) { /* ignore errors and try next or fallback */ }
    }
    if (!rpcUrl) {
        rpcUrl = publicGnosisRpcUrl;
        console.log("[LitAction_GnosisVerify] Using public fallback RPC URL:", rpcUrl);
    }
    
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const magicValueLower = JS_EIP1271_MAGIC_VALUE.toLowerCase();

    // --- Proxy Check --- 
    if (passkeySignerContractAddress && passkeySignerContractAddress.toLowerCase() !== nullAddress) {
        console.log("[LitAction_GnosisVerify] Attempting PROXY verification:", passkeySignerContractAddress);
        try {
            const proxyAbi = [ { "inputs": [{ "internalType": "bytes32", "name": "_hash", "type": "bytes32" }, { "internalType": "bytes", "name": "_signature", "type": "bytes" }], "name": "isValidSignature", "outputs": [{ "internalType": "bytes4", "name": "magicValue", "type": "bytes4" }], "stateMutability": "view", "type": "function" } ];
            const iface = new ethers.utils.Interface(proxyAbi);
            const calldata = iface.encodeFunctionData("isValidSignature", [messageHash, formattedSignature]);
            
            verificationResult = await provider.call({ to: passkeySignerContractAddress, data: calldata });
            console.log("[LitAction_GnosisVerify] Proxy provider.call result:", verificationResult);

            // ***** USE startsWith *****
            if (verificationResult && typeof verificationResult === 'string' && verificationResult.toLowerCase().startsWith(magicValueLower)) {
                verified = true;
                console.log("[LitAction_GnosisVerify] Proxy verification successful (startsWith).");
            }
        } catch (e) {
            console.error("[LitAction_GnosisVerify] Error during proxy provider.call:", e.message || JSON.stringify(e));
        }
    }

    // --- Factory Check (Only if Proxy was not available or failed) ---
    if (!verified) { 
        console.log("[LitAction_GnosisVerify] Proxy not verified or not available. Attempting FACTORY verification:", JS_FACTORY_ADDRESS);
        try {
            const factoryAbi = [ { "inputs": [ { "internalType": "bytes32", "name": "message", "type": "bytes32" }, { "internalType": "bytes", "name": "signature", "type": "bytes" }, { "internalType": "uint256", "name": "x", "type": "uint256" }, { "internalType": "uint256", "name": "y", "type": "uint256" }, { "internalType": "uint176", "name": "verifiers", "type": "uint176" } ], "name": "isValidSignatureForSigner", "outputs": [{ "internalType": "bytes4", "name": "magicValue", "type": "bytes4" }], "stateMutability": "view", "type": "function" } ];
            const factoryIface = new ethers.utils.Interface(factoryAbi);
            const factoryCalldata = factoryIface.encodeFunctionData("isValidSignatureForSigner", [
                messageHash,
                formattedSignature,
                publicKeyX,
                publicKeyY,
                JS_FCL_VERIFIER_ADDRESS
            ]);

            verificationResult = await provider.call({ to: JS_FACTORY_ADDRESS, data: factoryCalldata });
            console.log("[LitAction_GnosisVerify] Factory provider.call result:", verificationResult);

            // ***** USE startsWith *****
            if (verificationResult && typeof verificationResult === 'string' && verificationResult.toLowerCase().startsWith(magicValueLower)) {
                verified = true;
                 console.log("[LitAction_GnosisVerify] Factory verification successful (startsWith).");
           }
        } catch (e) {
            console.error("[LitAction_GnosisVerify] Error during factory provider.call:", e.message || JSON.stringify(e));
        }
    }

    if (verified) {
        console.log("[LitAction_GnosisVerify] Verification complete: SUCCESS. RPC Used: " + rpcUrl);
        Lit.Actions.setResponse({ response: JSON.stringify({ verified: true, finalResultFromAction: verificationResult, rpcUsed: rpcUrl }) });
    } else {
        console.error("[LitAction_GnosisVerify] Verification complete: FAILED. RPC Used: " + rpcUrl);
        // Include last verificationResult for debugging failed comparisons
        throw new Error("Passkey sig verify failed. RPC: " + rpcUrl + ". Last verification result: " + verificationResult + ". Error logged above if call failed."); 
    }
  };
  go(); 
`;

/**
 * Generates session signatures using a passkey, with verification performed by a Lit Action 
 * that calls Gnosis Chain contracts.
 *
 * @param litNodeClient Initialized LitNodeClient.
 * @param pkpPublicKey The public key of the PKP to authenticate for.
 * @param messageToSign The original message string that was signed by the passkey.
 * @param assertionResponse The response from `navigator.credentials.get()` after passkey signing.
 * @param passkeyData Stored passkey data including coordinates and optional signer address.
 * @param chain The chain for which the session sigs are being requested (e.g., 'ethereum').
 * @returns A promise that resolves to SessionSigs.
 */
export const getSessionSigsWithGnosisPasskeyVerification = async (
    litNodeClient: LitNodeClient,
    pkpPublicKey: Hex,
    messageToSign: string,
    assertionResponse: AuthenticatorAssertionResponse,
    passkeyData: StoredPasskeyData,
    chain: string
): Promise<SessionSigs> => {
    console.log('Attempting session sigs with Gnosis passkey verification Lit Action...');

    if (!litNodeClient) throw new Error('LitNodeClient not available.');
    if (!pkpPublicKey) throw new Error('PKP Public Key is required.');
    if (!messageToSign) throw new Error('Message to sign is required.');
    if (!assertionResponse) throw new Error('Valid assertionResponse is required.');
    if (!passkeyData?.pubkeyCoordinates?.x || !passkeyData?.pubkeyCoordinates?.y) {
        throw new Error('Passkey public key coordinates are missing.');
    }

    try {
        // 1. Prepare message hash
        const messageHash = keccak256(toBytes(messageToSign));
        console.log('Message to sign:', messageToSign, 'Hashed:', messageHash);

        // 2. Format signature for EIP-1271
        const formattedSignature = formatSignatureForEIP1271(assertionResponse);
        console.log('Formatted signature for EIP-1271:', formattedSignature);

        // 3. Prepare jsParams for the Lit Action
        const jsParams = {
            messageHash: messageHash,
            formattedSignature: formattedSignature,
            passkeySignerContractAddress: passkeyData.signerContractAddress || '0x0000000000000000000000000000000000000000',
            publicKeyX: passkeyData.pubkeyCoordinates.x,
            publicKeyY: passkeyData.pubkeyCoordinates.y,
            gnosisRpcUrl: 'https://rpc.gnosischain.com',
            JS_FCL_VERIFIER_ADDRESS: FCL_VERIFIER_ADDRESS,
            JS_FACTORY_ADDRESS: FACTORY_ADDRESS,
            JS_EIP1271_MAGIC_VALUE: EIP1271_MAGIC_VALUE,
            // ADD authMethodType and authMethodId from passkeyData
            authMethodType: AUTH_METHOD_TYPE_PASSKEY, // Exported constant from passkeySigner
            authMethodId: passkeyData.authMethodId // From stored passkey data
        };
        console.log('jsParams for Gnosis Passkey Verification Lit Action:', jsParams);

        // 4. Encode Lit Action code
        let encodedLitActionCode;
        try {
            encodedLitActionCode = btoa(gnosisPasskeyVerifyActionCode);
        } catch (e) {
            console.error("Error Base64 encoding Gnosis passkey Lit Action code:", e);
            throw new Error("Failed to Base64 encode Gnosis passkey action code.");
        }

        // 5. Define resource ability requests for the session
        const resourceAbilityRequests = [
            { resource: new LitPKPResource('*'), ability: 'pkp-signing' as const },
            { resource: new LitActionResource('*'), ability: 'lit-action-execution' as const },
        ];

        // 6. Get session sigs
        const sessionSigs = await litNodeClient.getLitActionSessionSigs({
            pkpPublicKey,
            litActionCode: encodedLitActionCode,
            jsParams,
            chain, // This 'chain' is for the session signatures, not the ethCalls in the action
            resourceAbilityRequests,
            // No authNeededCallback here as the Lit Action IS the auth method
        });

        console.log('Session Sigs generated with Gnosis Passkey Verification Lit Action:', sessionSigs);
        return sessionSigs;

    } catch (error: unknown) {
        console.error('Error getting session sigs with Gnosis passkey verification:', error);
        if (error instanceof Error) {
            throw new Error(`Failed during Gnosis passkey session sig generation: ${error.message}`);
        } else {
            throw new Error(`Failed during Gnosis passkey session sig generation: ${String(error)}`);
        }
    }
};