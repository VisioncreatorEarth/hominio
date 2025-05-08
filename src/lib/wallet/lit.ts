import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { createSiweMessageWithRecaps, LitActionResource, LitPKPResource } from '@lit-protocol/auth-helpers';
import { hashMessage, hexToBytes, keccak256, toBytes, createPublicClient, http, serializeTransaction } from 'viem';
import type { Address, Hex, WalletClient, PublicClient, Signature } from 'viem';
import type { SessionSigs, AuthCallbackParams, GetSessionSigsProps, AuthSig, SigResponse, ExecuteJsResponse } from '@lit-protocol/types';
import {
    AUTH_METHOD_TYPE_PASSKEY,
    formatSignatureForEIP1271,
    EIP1271_MAGIC_VALUE,
    type StoredPasskeyData,
    type AuthenticatorAssertionResponse
} from './passkeySigner';
import { utils as ethersUtils } from 'ethers';
import * as ipfsOnlyHash from 'ipfs-only-hash';
// Import constants from config
import {
    currentChain,
    currentLitEnvironment,
    PKP_PERMISSIONS_CONTRACT_ADDRESS,
    PKP_PERMISSIONS_ABI,
    PKP_NFT_CONTRACT_ADDRESS,
    PKP_HELPER_CONTRACT_ADDRESS,
    PKP_HELPER_ABI,
    RATE_LIMIT_NFT_CONTRACT_ADDRESS,
    RATE_LIMIT_NFT_ABI
} from './config/index';
// import { 준비된쿼리StringToBytes, uint8arrayToString } from '@lit-protocol/uint8arrays'; // This line is removed/commented out
import type { TransactionSerializable } from 'viem';

type LitNodeClientNetworkKey = 'datil-dev' | 'datil-test' | 'datil';

// Map our environment names to Lit SDK network strings
const litSdkNetworkMap: Record<typeof currentLitEnvironment, LitNodeClientNetworkKey> = {
    'datil-dev': 'datil-dev',
    'datil-test': 'datil-test',
    'datil': 'datil'
};

export const connectToLit = async (): Promise<LitNodeClient> => {
    try {
        const sdkNetworkString: LitNodeClientNetworkKey = litSdkNetworkMap[currentLitEnvironment];
        console.log(`Connecting to Lit Network using SDK string: "${sdkNetworkString}" for environment: "${currentLitEnvironment}"`);

        const litNodeClient = new LitNodeClient({
            litNetwork: sdkNetworkString, // Now correctly typed
            debug: false,
            // alertWhenUnauthorized: false, // Consider adding if not default
        });

        await litNodeClient.connect();
        console.log(`Successfully connected to Lit Network: ${currentLitEnvironment}`);
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
 * ACCEPTS walletClient and eoaAddress as arguments.
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
    console.log(`Attempting to register passkey auth method for PKP ${pkpTokenId} on ${currentChain.name}...`);

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
        const currentWalletChainId = await walletClient.getChainId();
        if (currentWalletChainId !== currentChain.id) {
            console.log(`Requesting wallet switch to Chronicle (${currentChain.id}) via provided client...`);
            try {
                await walletClient.switchChain({ id: currentChain.id });
                const newChainId = await walletClient.getChainId();
                if (newChainId !== currentChain.id) {
                    throw new Error(`Wallet switch failed. Please manually switch to Chronicle (ID: ${currentChain.id}).`);
                }
                console.log(`Wallet switched to Chronicle.`);
            } catch (switchError: unknown) {
                let message = 'Unknown switch error';
                type ErrorWithCode = { code?: number | string } & Partial<Error>;

                if (switchError instanceof Error) {
                    message = switchError.message;
                }
                let code: number | string | undefined = undefined;
                if (typeof switchError === 'object' && switchError !== null && 'code' in switchError) {
                    code = (switchError as ErrorWithCode).code;
                }

                if (message.includes('rejected') || code === 4001) {
                    throw new Error('User rejected the network switch request.');
                }
                throw new Error(`Failed to switch wallet to Chronicle: ${message}`);
            }
        }

        const authMethod = {
            authMethodType: BigInt(AUTH_METHOD_TYPE_PASSKEY),
            id: authMethodId,
            userPubkey: '0x' as Hex
        };
        const scopesToGrant = [1n];

        console.log(`Sending transaction to PKPPermissions contract (${PKP_PERMISSIONS_CONTRACT_ADDRESS}) on chain ${currentChain.id} with explicit gas limit...`);

        const txHash = await walletClient.writeContract({
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS,
            abi: PKP_PERMISSIONS_ABI,
            functionName: 'addPermittedAuthMethod',
            args: [
                BigInt(pkpTokenId),
                authMethod,
                scopesToGrant
            ],
            account: eoaAddress,
            chain: currentChain,
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

/**
 * Fetches all permitted authentication methods for a given PKP Token ID using direct Viem read.
 * @param pkpTokenId The Token ID of the PKP to query.
 * @returns A promise that resolves to an array of permitted auth methods.
 */
export const getPermittedAuthMethodsForPkp = async (
    pkpTokenId: string
    // No litNodeClient or sessionSigs needed for direct read
): Promise<Array<{ authMethodType: bigint; id: Hex; userPubkey: Hex }>> => {
    if (!pkpTokenId || typeof pkpTokenId !== 'string' || !pkpTokenId.trim()) {
        console.error("PKP Token ID is invalid or empty.", pkpTokenId);
        throw new Error("PKP Token ID cannot be empty or invalid.");
    }

    console.log(`Fetching permitted auth methods for PKP Token ID: ${pkpTokenId} via direct Viem read on chain ${currentChain.id}`);

    try {
        // Create a Viem Public Client for the Chronicle network
        const chroniclePublicClient: PublicClient = createPublicClient({
            chain: currentChain,
            transport: http() // Uses default RPC defined in currentChain object
        });

        // Call the contract read function
        const permittedMethodsRaw = await chroniclePublicClient.readContract({
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS,
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
 * ACCEPTS walletClient and eoaAddress as arguments.
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
        if (currentChainId !== currentChain.id) {
            console.log(`Requesting wallet switch to Chronicle (${currentChain.id}) via provided client...`);
            try {
                await walletClient.switchChain({ id: currentChain.id });
                const newChainId = await walletClient.getChainId();
                if (newChainId !== currentChain.id) {
                    throw new Error(
                        `Wallet switch failed. Please manually switch to Chronicle (ID: ${currentChain.id}).`
                    );
                }
                console.log(`Wallet switched to Chronicle.`);
            } catch (switchError: unknown) {
                let message = 'Unknown switch error';
                type ErrorWithCode = { code?: number | string } & Partial<Error>;

                if (switchError instanceof Error) message = switchError.message;
                else if (typeof switchError === 'string') message = switchError;

                let code: number | string | undefined = undefined;
                if (typeof switchError === 'object' && switchError !== null && 'code' in switchError) {
                    code = (switchError as ErrorWithCode).code;
                }

                if (message.includes('rejected') || code === 4001) {
                    throw new Error('User rejected the network switch request.');
                }
                throw new Error(
                    `Failed to switch wallet to Chronicle: ${message}`
                );
            }
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
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS,
            abi: PKP_PERMISSIONS_ABI,
            functionName: 'addPermittedAuthMethod',
            args: [BigInt(pkpTokenId), authMethodPayload, scopes],
            account: eoaAddress,
            chain: currentChain,
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

// Define a default external RPC URL for Gnosis Chain
const DEFAULT_GNOSIS_RPC_URL = 'https://rpc.gnosischain.com';

/**
 * Lit Action code for verifying a passkey signature against Gnosis Chain contracts.
 */
export const gnosisPasskeyVerifyActionCode = `
const go = async () => {
  if (typeof ethers === 'undefined') { throw new Error("ethers.js unavailable"); }
  if (typeof Lit === 'undefined' || !Lit.Actions || !Lit.Actions.getRpcUrl || !Lit.Actions.setResponse) { throw new Error("Lit.Actions unavailable"); }

  const nullAddress = '0x0000000000000000000000000000000000000000';
  // Check for jsParams strictly used in THIS action. External RPC URL is now mandatory if internal fails.
  if (!messageHash || !formattedSignature || !JS_EIP1271_MAGIC_VALUE || !passkeySignerContractAddress || passkeySignerContractAddress.toLowerCase() === nullAddress || !externalGnosisRpcUrl) {
    throw new Error("Missing required jsParams (messageHash, formattedSignature, JS_EIP1271_MAGIC_VALUE, valid passkeySignerContractAddress, or externalGnosisRpcUrl).");
  }

  let verified = false;
  let rpcUrlToUse = null;

  try {
    const potentialInternalRpcUrl = await Lit.Actions.getRpcUrl({ chain: 'xdai' });
    if (potentialInternalRpcUrl && typeof potentialInternalRpcUrl === 'string' && potentialInternalRpcUrl.startsWith('http')) {
      rpcUrlToUse = potentialInternalRpcUrl;
    }
  } catch (e) { /* Internal RPC fetch failed or returned invalid, will try external */ }

  if (!rpcUrlToUse) {
    if (typeof externalGnosisRpcUrl === 'string' && externalGnosisRpcUrl.startsWith('http')) {
        rpcUrlToUse = externalGnosisRpcUrl;
    } else {
        throw new Error("Invalid or missing externalGnosisRpcUrl jsParam, and internal Lit RPC for 'xdai' failed or was invalid.");
    }
  }
  
  const provider = new ethers.providers.JsonRpcProvider(rpcUrlToUse);
  const magicValueLower = JS_EIP1271_MAGIC_VALUE.toLowerCase();
  let contractCallResult;

  try {
    const proxyAbi = [{"inputs":[{"internalType":"bytes32","name":"_hash","type":"bytes32"},{"internalType":"bytes","name":"_signature","type":"bytes"}],"name":"isValidSignature","outputs":[{"internalType":"bytes4","name":"magicValue","type":"bytes4"}],"stateMutability":"view","type":"function"}];
    const iface = new ethers.utils.Interface(proxyAbi);
    const calldata = iface.encodeFunctionData("isValidSignature", [messageHash, formattedSignature]);
    
    contractCallResult = await provider.call({ to: passkeySignerContractAddress, data: calldata });

    if (contractCallResult && typeof contractCallResult === 'string' && contractCallResult.toLowerCase().startsWith(magicValueLower)) {
      verified = true;
    }
  } catch (e) { /* Verification failed */ }
  
  if (verified) {
    Lit.Actions.setResponse({ response: JSON.stringify({ verified: true }) });
  } else {
    let errMsg = "Gnosis proxy verification failed. Proxy: " + passkeySignerContractAddress + ". RPC: " + rpcUrlToUse;
    if (contractCallResult !== undefined) { 
        errMsg += ". Call result: " + contractCallResult;
    }
    throw new Error(errMsg); 
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

        // 3. Prepare jsParams for the Lit Action (minimized set)
        const jsParams = {
            messageHash: messageHash,
            formattedSignature: formattedSignature,
            passkeySignerContractAddress: passkeyData.signerContractAddress || '0x0000000000000000000000000000000000000000',
            JS_EIP1271_MAGIC_VALUE: EIP1271_MAGIC_VALUE,
            externalGnosisRpcUrl: DEFAULT_GNOSIS_RPC_URL // Pass the default external RPC URL
        };
        console.log('jsParams for Gnosis Passkey Verification Lit Action (minimized):', jsParams);

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

// --- NEW: Dynamic PKP Minting Function ---
/**
 * Mints a new PKP and assigns the passkey and verification Lit Action as auth methods.
 * Transfers the PKP NFT to the PKP's own address.
 * ACCEPTS walletClient and eoaAddress as arguments.
 * 
 * @param walletClient Viem Wallet Client connected to the EOA (for signing the mint tx).
 * @param eoaAddress Address of the EOA paying for gas.
 * @param passkeyAuthMethodId The unique ID for the passkey auth method (keccak256 of rawId).
 * @param gnosisVerifyActionCode The JS code string of the verification Lit Action.
 * @param capacityRequestsPerKilosecond The number of requests per kilosecond for the Capacity Credit NFT.
 * @param capacityDaysUntilUTCMidnightExpiration The number of days until the Capacity Credit NFT expires at UTC midnight.
 * @returns Promise resolving to the new PKP's details.
 */
export const mintPKPWithPasskeyAndAction = async (
    walletClient: WalletClient,
    eoaAddress: Address,
    passkeyAuthMethodId: Hex,
    gnosisVerifyActionCode: string,
    capacityRequestsPerKilosecond: bigint = 80n,
    capacityDaysUntilUTCMidnightExpiration: number = 1
): Promise<{ pkpTokenId: string; pkpPublicKey: Hex; pkpEthAddress: Address; capacityTokenId: string; capacityMintTxHash: Hex; capacityTransferTxHash: Hex; }> => {
    console.log(
        `Attempting mint via direct walletClient.writeContract on Chronicle (${currentChain.id})...`
    );

    // --- Argument Checks --- 
    if (!walletClient || !eoaAddress) {
        throw new Error('Wallet client and EOA address are required for minting.');
    }
    if (!passkeyAuthMethodId || !passkeyAuthMethodId.startsWith('0x')) {
        throw new Error('Passkey Auth Method ID cannot be empty and must be a hex string.');
    }
    if (!gnosisVerifyActionCode.trim()) {
        throw new Error('Gnosis Verify Action Code cannot be empty.');
    }

    // --- Ensure EOA Wallet is on Chronicle Chain (using provided client) --- 
    let currentChainId = await walletClient.getChainId();
    if (currentChainId !== currentChain.id) {
        console.log(`Requesting wallet switch to Chronicle (${currentChain.id}) via provided client...`);
        try {
            await walletClient.switchChain({ id: currentChain.id });
            currentChainId = await walletClient.getChainId();
            if (currentChainId !== currentChain.id) {
                throw new Error(`Wallet switch failed. Please manually switch to Chronicle (ID: ${currentChain.id}).`);
            }
            console.log(`Wallet switched to Chronicle.`);
        } catch (switchError: unknown) {
            let message = 'Unknown switch error';
            type ErrorWithCode = { code?: number | string } & Partial<Error>;

            if (switchError instanceof Error) message = switchError.message;
            else if (typeof switchError === 'string') message = switchError;

            let code: number | string | undefined = undefined;
            if (typeof switchError === 'object' && switchError !== null && 'code' in switchError) {
                code = (switchError as ErrorWithCode).code;
            }

            if (message.includes('rejected') || code === 4001) {
                throw new Error('User rejected the network switch request.');
            }
            throw new Error(`Failed to switch wallet to Chronicle: ${message}`);
        }
    }
    // --- End Chain Check --- 

    try {
        // 1. Calculate IPFS CID for the Lit Action code
        console.log('Computing Action IPFS CID...');
        const ipfsCidBase58 = await ipfsOnlyHash.of(gnosisVerifyActionCode);
        const ipfsCidBytes = ethersUtils.base58.decode(ipfsCidBase58);
        console.log('Action CID Bytes:', ipfsCidBytes);
        // Convert CID bytes to Hex string for the contract call
        const ipfsCidHex = `0x${Buffer.from(ipfsCidBytes).toString('hex')}` as Hex;

        // 2. Prepare Arguments for PKPHelper.mintNextAndAddAuthMethodsWithTypes
        //    Pass bytes arguments as Hex strings ('0x...') for Viem's writeContract
        const args = [
            2n, // keyType = ECDSA k256
            [ipfsCidHex], // permittedIpfsCIDs (bytes[] -> Hex[]) 
            [[1n]], // permittedIpfsCIDScopes (Action: SignAnything)
            [] as Address[], // permittedAddresses
            [] as bigint[][], // permittedAddressScopes
            [] as bigint[], // permittedAuthMethodTypes (Was: [BigInt(AUTH_METHOD_TYPE_PASSKEY)])
            [] as Hex[], // permittedAuthMethodIds (Was: [passkeyAuthMethodId])
            [] as Hex[], // permittedAuthMethodPubkeys (Was: ['0x'])
            [] as bigint[][], // permittedAuthMethodScopes (Was: [[]])
            false, // addPkpEthAddressAsPermittedAddress
            true // sendPkpToItself
        ] as const;

        console.log("Arguments prepared for PKPHelper (bytes as Hex) - NATIVE PASSKEY REGISTRATION REMOVED:");
        console.log({ // Log args individually for clarity
            keyType: args[0],
            permittedIpfsCIDs: args[1],
            permittedIpfsCIDScopes: args[2],
            permittedAddresses: args[3],
            permittedAddressScopes: args[4],
            permittedAuthMethodTypes: args[5],
            permittedAuthMethodIds: args[6],
            permittedAuthMethodPubkeys: args[7],
            permittedAuthMethodScopes: args[8],
            addPkpEthAddressAsPermittedAddress: args[9],
            sendPkpToItself: args[10],
        });

        // 3. Call mint function using direct walletClient.writeContract
        console.log(`Sending transaction to PKPHelper (${PKP_HELPER_CONTRACT_ADDRESS})...`);
        const explicitGasLimit = 15000000n; // Ensure this is defined only ONCE here.
        console.log(`Setting explicit gas limit to ${explicitGasLimit}`);

        const mintTxHash = await walletClient.writeContract({
            address: PKP_HELPER_CONTRACT_ADDRESS,
            abi: PKP_HELPER_ABI,
            functionName: 'mintNextAndAddAuthMethodsWithTypes',
            args: args,
            account: eoaAddress,
            chain: currentChain,
            value: 1n, // Send 1 wei of tstLPX (assuming 18 decimals)
            gas: explicitGasLimit
        });
        console.log('Mint transaction sent, hash:', mintTxHash);

        // 4. Wait for transaction receipt
        const publicClient = createPublicClient({ chain: currentChain, transport: http() });
        console.log("Waiting for transaction receipt...");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: mintTxHash });
        console.log('Transaction receipt:', receipt);

        if (receipt.status !== 'success') {
            throw new Error(`Minting transaction failed. Receipt status: ${receipt.status}`);
        }

        // 5. Extract Token ID from logs
        let tokenId: string | null = null;
        const transferEventSignature = keccak256(toBytes("Transfer(address,address,uint256)"));
        const zeroAddressPadded = ethersUtils.hexZeroPad('0x0', 32).toLowerCase();

        console.log("Searching for PKPNFT Transfer event in logs...");
        console.log(`Expected PKPNFT Address: ${PKP_NFT_CONTRACT_ADDRESS}`);
        console.log(`Expected Transfer Signature: ${transferEventSignature}`);
        console.log(`Expected From Address (padded): ${zeroAddressPadded}`);

        for (const [index, log] of receipt.logs.entries()) {
            console.log(`Log[${index}]: Address: ${log.address}, Topics: ${JSON.stringify(log.topics)}`);
            // The Transfer event for minting might be emitted by the PKPPermissions contract (proxy for PKPPermissionsLogic)
            // or directly by the PKPPermissionsLogic contract in some flows.
            const logAddressLower = log.address.toLowerCase();
            if ((logAddressLower === PKP_NFT_CONTRACT_ADDRESS.toLowerCase() ||
                logAddressLower === PKP_PERMISSIONS_CONTRACT_ADDRESS.toLowerCase() ||
                logAddressLower === '0x02c4242f72d62c8fef2b2db088a35a9f4ec741c7') && // Explicitly check PKPPermissionsLogic address
                log.topics[0]?.toLowerCase() === transferEventSignature.toLowerCase() &&
                log.topics[1]?.toLowerCase() === zeroAddressPadded && // from address(0)
                log.topics.length > 3
            ) {
                try {
                    tokenId = BigInt(log.topics[3] as Hex).toString();
                    console.log("MATCH FOUND! Extracted PKP Token ID:", tokenId, "from log index:", index);
                    break;
                } catch (e: unknown) {
                    console.warn("Error converting tokenId topic from a matching log:", log.topics[3], e);
                }
            }
        }

        if (!tokenId) {
            console.error("PKPNFT Transfer event log not found in receipt:", receipt.logs);
            throw new Error('Could not extract PKP tokenId from mint transaction logs.');
        }

        // 6. Fetch PKP details using publicClient.readContract
        console.log("Fetching PKP details for tokenId:", tokenId);
        const pkpPublicKey = await publicClient.readContract({
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS,
            abi: PKP_PERMISSIONS_ABI,
            functionName: 'getPubkey',
            args: [BigInt(tokenId)]
        }) as Hex;

        const pkpEthAddress = await publicClient.readContract({
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS,
            abi: PKP_PERMISSIONS_ABI,
            functionName: 'getEthAddress',
            args: [BigInt(tokenId)]
        }) as Address;

        console.log("PKP Minted & Fetched Successfully:", { pkpTokenId: tokenId, pkpPublicKey, pkpEthAddress });

        // --- Mint Capacity Credit NFT ---    
        console.log("\n--- Starting Capacity Credit NFT Minting ---");

        // 1. Calculate expiresAt timestamp for Capacity Credit
        const expiresAtDate = new Date();
        expiresAtDate.setUTCHours(0, 0, 0, 0); // Set to start of today UTC
        expiresAtDate.setUTCDate(expiresAtDate.getUTCDate() + capacityDaysUntilUTCMidnightExpiration);
        const capacityExpiresAtTimestamp = BigInt(Math.floor(expiresAtDate.getTime() / 1000));
        console.log(`Calculated Capacity NFT expiresAt: ${capacityExpiresAtTimestamp} (UTC Epoch seconds)`);

        // 2. Calculate mint cost for Capacity Credit
        console.log(`Calculating cost for ${capacityRequestsPerKilosecond} req/ks, expiring at ${capacityExpiresAtTimestamp}...`);
        const capacityMintCost = await publicClient.readContract({
            address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
            abi: RATE_LIMIT_NFT_ABI,
            functionName: 'calculateCost',
            args: [capacityRequestsPerKilosecond, capacityExpiresAtTimestamp]
        }) as bigint;
        console.log("Calculated Capacity NFT mint cost:", capacityMintCost.toString(), "wei tstLPX");

        // 3. Mint the Capacity Credit NFT (mints to eoaAddress)
        console.log("Sending transaction to mint Capacity Credit NFT...");
        const capacityMintTxHash = await walletClient.writeContract({
            address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
            abi: RATE_LIMIT_NFT_ABI,
            functionName: 'mint',
            args: [capacityExpiresAtTimestamp],
            account: eoaAddress,
            chain: currentChain,
            value: capacityMintCost
        });
        console.log('Capacity Credit NFT mint transaction sent, hash:', capacityMintTxHash);

        // 4. Wait for Capacity Credit mint transaction receipt
        console.log("Waiting for Capacity Credit NFT mint transaction receipt...");
        const capacityMintReceipt = await publicClient.waitForTransactionReceipt({ hash: capacityMintTxHash });
        console.log('Capacity Credit NFT mint transaction receipt:', capacityMintReceipt);

        if (capacityMintReceipt.status !== 'success') {
            throw new Error(`Capacity Credit NFT minting transaction failed. Receipt status: ${capacityMintReceipt.status}`);
        }

        // 5. Extract Capacity Credit Token ID from logs
        let capacityTokenId: string | null = null;
        const capacityTransferEventSignature = keccak256(toBytes("Transfer(address,address,uint256)"));
        // For mint, 'from' is address(0)
        const zeroAddressPaddedForCapacity = ethersUtils.hexZeroPad('0x0', 32).toLowerCase();
        // 'to' is the eoaAddress (minter)
        const eoaAddressPadded = ethersUtils.hexZeroPad(eoaAddress, 32).toLowerCase();

        console.log("Searching for Capacity Credit NFT Transfer event in logs...");
        console.log(`Expected Capacity NFT Contract: ${RATE_LIMIT_NFT_CONTRACT_ADDRESS}`);
        console.log(`Expected Transfer Signature: ${capacityTransferEventSignature}`);
        console.log(`Expected From Address (padded): ${zeroAddressPaddedForCapacity}`);
        console.log(`Expected To Address (padded): ${eoaAddressPadded}`);

        for (const log of capacityMintReceipt.logs) {
            const logAddressLower = log.address.toLowerCase();
            if (logAddressLower === RATE_LIMIT_NFT_CONTRACT_ADDRESS.toLowerCase() &&
                log.topics[0]?.toLowerCase() === capacityTransferEventSignature.toLowerCase() &&
                log.topics[1]?.toLowerCase() === zeroAddressPaddedForCapacity && // from address(0)
                log.topics[2]?.toLowerCase() === eoaAddressPadded && // to eoaAddress
                log.topics.length > 3 && log.topics[3] // tokenId exists
            ) {
                try {
                    capacityTokenId = BigInt(log.topics[3] as Hex).toString();
                    console.log("MATCH FOUND! Extracted Capacity Credit NFT Token ID:", capacityTokenId);
                    break;
                } catch (e: unknown) {
                    console.warn("Error converting Capacity NFT tokenId from a matching log:", log.topics[3], e);
                }
            }
        }

        if (!capacityTokenId) {
            console.error("Capacity Credit NFT Transfer event log not found in mint receipt:", capacityMintReceipt.logs);
            throw new Error('Could not extract Capacity Credit NFT tokenId from mint transaction logs.');
        }

        // 6. Transfer Capacity Credit NFT to PKP's ETH Address
        console.log(`Transferring Capacity Credit NFT ${capacityTokenId} from ${eoaAddress} to ${pkpEthAddress}...`);
        const capacityTransferTxHash = await walletClient.writeContract({
            address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
            abi: RATE_LIMIT_NFT_ABI,
            functionName: 'safeTransferFrom',
            args: [eoaAddress, pkpEthAddress, BigInt(capacityTokenId)],
            account: eoaAddress,
            chain: currentChain
        });
        console.log('Capacity Credit NFT transfer transaction sent, hash:', capacityTransferTxHash);

        // 7. Wait for Capacity Credit transfer transaction receipt
        console.log("Waiting for Capacity Credit NFT transfer transaction receipt...");
        const capacityTransferReceipt = await publicClient.waitForTransactionReceipt({ hash: capacityTransferTxHash });
        console.log('Capacity Credit NFT transfer transaction receipt:', capacityTransferReceipt);

        if (capacityTransferReceipt.status !== 'success') {
            throw new Error(`Capacity Credit NFT transfer transaction failed. Receipt status: ${capacityTransferReceipt.status}`);
        }
        console.log(`Capacity Credit NFT ${capacityTokenId} successfully transferred to PKP ${pkpEthAddress}.`);
        // --- End Capacity Credit NFT --- 

        return { pkpTokenId: tokenId, pkpPublicKey, pkpEthAddress, capacityTokenId, capacityMintTxHash, capacityTransferTxHash };

    } catch (error: unknown) {
        console.error('Error during PKP minting and Capacity Credit provisioning process:', error);

        let errorMessage = 'An unknown error occurred during PKP minting and Capacity Credit provisioning.';
        let errorCode: number | string | undefined = undefined;

        if (error instanceof Error) {
            errorMessage = error.message;
            // Attempt to get code if it exists (common in RPC errors like from MetaMask)
            if ('code' in error && error.code !== undefined && (typeof error.code === 'number' || typeof error.code === 'string')) {
                errorCode = error.code;
            }
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
            // Handle cases where error is an object with a message property (e.g. some RPC errors)
            errorMessage = error.message;
            if ('code' in error && error.code !== undefined && (typeof error.code === 'number' || typeof error.code === 'string')) {
                errorCode = error.code;
            }
        }

        if (errorMessage?.includes('rejected') || errorCode === 4001) {
            throw new Error('User rejected the request (chain switch or transaction signature).');
        }
        if (errorMessage && (errorMessage.includes('insufficient funds') || errorMessage.includes('gas required exceeds allowance'))) {
            throw new Error(`Insufficient funds for minting transaction on Chronicle. Error: ${errorMessage}`);
        }
        // Let specific chain switch errors pass through (already handled by the specific catch or will be part of generic message)
        if (errorMessage?.includes('Failed to switch wallet') || errorMessage?.includes('Wallet switch failed')) {
            // This specific message is already thrown earlier, but good to keep the check if it could bubble up differently
            throw new Error(errorMessage);
        }
        if (errorMessage?.includes('You must pay exactly mint cost')) {
            throw new Error(`Mint cost error: The contract requires an exact mint cost. Check Chronicle testnet requirements. Error: ${errorMessage}`);
        }

        // Construct a comprehensive error message
        let finalErrorMessage = `PKP Minting and Capacity Credit Provisioning Failed: ${errorMessage}`;
        if (errorCode !== undefined) {
            finalErrorMessage += ` (Code: ${errorCode})`;
        }
        // Add original error structure if it's not just a string message, for more debug info
        if (!(error instanceof Error) && typeof error !== 'string') {
            try {
                finalErrorMessage += ` | Raw error: ${JSON.stringify(error)}`;
            } catch { /* ignore stringify errors */ }
        }
        throw new Error(finalErrorMessage);
    }
};

// --- NEW: Fetch Owned Capacity Credits --- 
/**
 * Fetches all Capacity Credit NFTs owned by a specific address on Chronicle.
 * 
 * @param ownerAddress The address of the owner.
 * @param publicClient A Viem PublicClient configured for the Chronicle chain.
 * @returns A promise that resolves to an array of owned capacity credits with their details.
 */
export const getOwnedCapacityCredits = async (
    ownerAddress: Address,
    // Allow publicClient to be passed or created if not provided, though passing is cleaner from Svelte
    publicClientInput?: PublicClient
): Promise<Array<{ tokenId: string; requestsPerKilosecond: bigint; expiresAt: bigint }>> => {
    if (!ownerAddress) {
        throw new Error("Owner address cannot be empty.");
    }

    const client = publicClientInput || createPublicClient({ chain: currentChain, transport: http() });

    console.log(`Fetching Capacity Credit NFTs for owner: ${ownerAddress} on chain ${currentChain.id} (${currentChain.name})`);

    try {
        const balance = await client.readContract({
            address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
            abi: RATE_LIMIT_NFT_ABI,
            functionName: 'balanceOf',
            args: [ownerAddress]
        }) as bigint;

        console.log(`Owner ${ownerAddress} has ${balance} Capacity Credit NFT(s).`);

        if (balance === 0n) {
            return [];
        }

        const ownedCredits: Array<{ tokenId: string; requestsPerKilosecond: bigint; expiresAt: bigint }> = [];
        for (let i = 0n; i < balance; i++) {
            try {
                const tokenIdBigInt = await client.readContract({
                    address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
                    abi: RATE_LIMIT_NFT_ABI,
                    functionName: 'tokenOfOwnerByIndex',
                    args: [ownerAddress, i]
                }) as bigint;
                const tokenId = tokenIdBigInt.toString();

                const capacityDetails = await client.readContract({
                    address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
                    abi: RATE_LIMIT_NFT_ABI,
                    functionName: 'capacity',
                    args: [tokenIdBigInt]
                }) as { requestsPerKilosecond: bigint; expiresAt: bigint }; // Viem should return tuple as an object

                ownedCredits.push({
                    tokenId,
                    requestsPerKilosecond: capacityDetails.requestsPerKilosecond,
                    expiresAt: capacityDetails.expiresAt
                });
                console.log(`Fetched details for token ID: ${tokenId}`, capacityDetails);
            } catch (loopError) {
                console.error(`Error fetching details for token at index ${i}:`, loopError);
                // Optionally, decide if one error should stop all, or just skip this token
            }
        }
        return ownedCredits;

    } catch (error: unknown) {
        console.error('Error fetching owned Capacity Credits:', error);
        let message = 'Unknown error fetching owned Capacity Credits';
        if (error instanceof Error) {
            message = error.message;
        }
        throw new Error(`Failed to fetch owned Capacity Credits: ${message}`);
    }
};

/**
 * Signs a raw Ethereum transaction object using a PKP with existing SessionSigs.
 *
 * @param {LitNodeClient} litNodeClient - The initialized Lit Node client.
 * @param {SessionSigs} sessionSigs - The active session signatures authorizing PKP operations.
 * @param {Hex} pkpPublicKey - The public key of the PKP to use for signing.
 * @param {TransactionSerializable} unsignedTxObject - The Viem-compatible unsigned transaction object (e.g., EIP1559).
 * @returns {Promise<Signature>} The structured signature object for viem.
 * @throws {Error} If signing fails or any prerequisite is missing.
 */
export async function signTransactionWithPKP(
    litNodeClient: LitNodeClient,
    sessionSigs: SessionSigs,
    pkpPublicKey: Hex,
    unsignedTxObject: TransactionSerializable
    // chainId is part of unsignedTxObject in viem for EIP-155 and later,
    // so not needed as separate param for signing hash, it's implicitly part of the hash.
): Promise<Signature> {
    if (!litNodeClient || !litNodeClient.ready) {
        throw new Error('Lit Node Client not ready or not provided.');
    }
    if (!sessionSigs) {
        throw new Error('SessionSigs are required for signing.');
    }
    if (!pkpPublicKey) {
        throw new Error('PKP Public Key is required.');
    }
    if (!unsignedTxObject) {
        throw new Error('Unsigned transaction object is required.');
    }

    // 1. Serialize the transaction to RLP-encoded bytes.
    // For EIP-155 transactions and later, the chainId is part of the serialized payload if present in unsignedTxObject.
    // Viem's serializeTransaction handles this correctly based on the transaction type and properties.
    const serializedTx = serializeTransaction(unsignedTxObject);

    // 2. Hash the serialized transaction bytes.
    // This is the hash that needs to be signed for an Ethereum transaction.
    const txHash = keccak256(serializedTx); // keccak256 returns a Hex string

    // 3. Convert the hex string hash to Uint8Array for litNodeClient.pkpSign.
    const hashToSignBytes = toBytes(txHash); // viem.toBytes converts hex to Uint8Array

    // 4. Call litNodeClient.pkpSign.
    // The sigAlgorithm: 'ETH_SIGN' might imply specific hashing or prefixing (e.g. Ethereum signed message prefix).
    // However, for signing a transaction hash, we've already prepared the exact 32-byte hash.
    // It's safer to ensure pkpSign is signing this raw hash without further modification.
    // If 'ETH_SIGN' is for personal_sign, it adds the prefix. For raw hash, often no sigAlgorithm or a specific one is needed.
    // Let's assume for now that by providing the direct hash, it will be signed as is.
    // The Lit SDK examples for direct signing usually show signing a Uint8Array hash.
    const result: SigResponse = await litNodeClient.pkpSign({
        toSign: hashToSignBytes,
        pubKey: pkpPublicKey,
        sessionSigs: sessionSigs
        // No explicit sigAlgorithm mentioned for raw hash signing in some PKP examples, relying on toSign being the final hash.
    });

    if (!result || !result.signature) {
        throw new Error('Failed to sign transaction with PKP. No signature returned.');
    }

    // 5. Construct and return the Signature object for viem
    // For EIP-1559 transactions, viem expects yParity (0 or 1), which corresponds to result.recid
    // and v can be derived or is sometimes expected as recid + 27 + (chainId * 2 + 35) for legacy replay protected, 
    // but for EIP-1559, just yParity is often enough for serializeTransaction when passing the signature object.
    // Viem's `Signature` type includes `r`, `s`, and `v` (or `yParity`).
    // Let's use v = result.recid + 27 for broader compatibility if needed, though for EIP1559, yParity is more direct.
    // However, pkpSign provides r, s, recid (0 or 1). `v` for EIP-1559 should be `recid` (0 or 1).
    // Let's return yParity and let viem handle it.
    return {
        r: result.r as Hex,
        s: result.s as Hex,
        yParity: result.recid as 0 | 1, // recid is 0 or 1, matching yParity
        // v: BigInt(result.recid + 27) // Not strictly needed if yParity is provided for EIP-1559
    };
    // Old: return result.signature as Hex;
}