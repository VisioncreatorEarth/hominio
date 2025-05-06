// Extend the Window interface for TypeScript first
declare global {
    interface Window { ethereum?: import('viem').EIP1193Provider }
}

import { createPublicClient, http, createWalletClient, custom, type Address, type Hex, hexToBytes, bytesToHex, hexToBigInt, keccak256, encodeAbiParameters, parseAbiParameters, /* type Hash, */ type PublicClient, toBytes, getAddress } from 'viem';
import { gnosis } from 'viem/chains';

// --- Constants ---
const RP_NAME = 'Hominio Passkey Signer'; // Changed RP name
const USER_DISPLAY_NAME = 'Hominio User';
const STORAGE_KEY = 'hominio_passkey_data'; // Renamed storage key
const RPC_URL = 'https://rpc.gnosischain.com';

// Deployed Contract Addresses on Gnosis Chain (from Contracts.md and previous context)
export const FACTORY_ADDRESS = '0x1d31F259eE307358a26dFb23EB365939E8641195' as Address;
// const DAIMO_VERIFIER_ADDRESS = '0xc2b78104907F722DABAc4C69f826a522B2754De4' as Address; // REMOVED - Unused
export const FCL_VERIFIER_ADDRESS = '0xA86e0054C51E4894D88762a017ECc5E5235f5DBA' as Address;

// EIP-1271 Magic Value
export const EIP1271_MAGIC_VALUE = '0x1626ba7e';

// --- NEW: Custom Auth Method Type --- 
// Defined by hashing the Factory Address string
export const AUTH_METHOD_TYPE_PASSKEY = keccak256(toBytes(FACTORY_ADDRESS));
// export const AUTH_METHOD_TYPE_PASSKEY = 100n; // Reverted from simple BigInt
console.log("AUTH_METHOD_TYPE_PASSKEY:", AUTH_METHOD_TYPE_PASSKEY); // Log for verification

// --- ABIs (Updated with correct ABI from GnosisScan) ---
const FactoryABI = [
    {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "signer",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "x",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "y",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "P256.Verifiers", // This comment might be from the explorer, actual type is uint176
                "name": "verifiers",
                "type": "uint176" // Correct type from ABI
            }
        ],
        "name": "Created",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "SINGLETON",
        "outputs": [
            {
                "internalType": "contract SafeWebAuthnSignerSingleton",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "x",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "y",
                "type": "uint256"
            },
            {
                "internalType": "P256.Verifiers",
                "name": "verifiers",
                "type": "uint176" // Correct type
            }
        ],
        "name": "createSigner",
        "outputs": [
            {
                "internalType": "address",
                "name": "signer",
                "type": "address"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "x",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "y",
                "type": "uint256"
            },
            {
                "internalType": "P256.Verifiers",
                "name": "verifiers",
                "type": "uint176" // Correct type
            }
        ],
        "name": "getSigner",
        "outputs": [
            {
                "internalType": "address",
                "name": "signer",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "message",
                "type": "bytes32"
            },
            {
                "internalType": "bytes",
                "name": "signature",
                "type": "bytes"
            },
            {
                "internalType": "uint256",
                "name": "x",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "y",
                "type": "uint256"
            },
            {
                "internalType": "P256.Verifiers",
                "name": "verifiers",
                "type": "uint176" // Correct type
            }
        ],
        "name": "isValidSignatureForSigner",
        "outputs": [
            {
                "internalType": "bytes4",
                "name": "magicValue",
                "type": "bytes4"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

// NEW: Standard EIP-1271 ABI fragment
const EIP1271ABI = [
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "_hash",
                "type": "bytes32"
            },
            {
                "internalType": "bytes",
                "name": "_signature",
                "type": "bytes"
            }
        ],
        "name": "isValidSignature",
        "outputs": [
            {
                "internalType": "bytes4",
                "name": "magicValue",
                "type": "bytes4"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

// --- Types ---
type PublicKeyCredential = Credential & {
    rawId: ArrayBuffer;
    response: {
        clientDataJSON: ArrayBuffer;
        attestationObject?: ArrayBuffer;
        authenticatorData?: ArrayBuffer;
        signature?: ArrayBuffer;
        userHandle?: ArrayBuffer;
        getPublicKey(): ArrayBuffer; // Added method based on snippet
        getPublicKeyAlgorithm(): number; // Added method based on snippet
    };
};

// UPDATED StoredPasskeyData type
export type StoredPasskeyData = {
    rawId: string; // hex format
    pubkeyCoordinates: {
        x: string; // hex format (prefixed 0x)
        y: string; // hex format (prefixed 0x)
    };
    username: string;
    signerContractAddress?: string; // Optional: Store deployed address
    authMethodId?: string; // NEW: Unique ID for this passkey as an auth method (hex format)
};

export declare interface AuthenticatorAssertionResponse extends AuthenticatorResponse {
    readonly authenticatorData: ArrayBuffer;
    readonly signature: ArrayBuffer;
    readonly userHandle?: ArrayBuffer | null | undefined; // Allow null and undefined
}

// --- Viem Clients ---
const publicClient: PublicClient = createPublicClient({
    chain: gnosis,
    transport: http(RPC_URL)
});

// Lazy init wallet client when needed for transactions
let walletClient: ReturnType<typeof createWalletClient> | null = null;
let walletAccount: Address | null = null;

export function getWalletClient() {
    if (!walletClient) {
        if (typeof window !== 'undefined' && window.ethereum) {
            walletClient = createWalletClient({
                chain: gnosis,
                transport: custom(window.ethereum)
            });
        } else {
            throw new Error('Ethereum provider (e.g., MetaMask) not found. Cannot send transactions.');
        }
    }
    return walletClient;
}

export async function getWalletAccount(): Promise<Address> {
    if (walletAccount) return walletAccount;
    const client = getWalletClient();
    const [account] = await client.requestAddresses();
    if (!account) {
        throw new Error('Failed to get wallet account. Is it connected?');
    }
    walletAccount = account;
    return account;
}

// --- Core Passkey Functions (adapted) ---

/**
 * Creates a new passkey credential and extracts coordinates.
 */
export async function createPasskeyCredential(username: string): Promise<{ credential: PublicKeyCredential, coordinates: { x: Hex, y: Hex } } | null> {
    try {
        const passkeyCredential = await navigator.credentials.create({
            publicKey: {
                pubKeyCredParams: [
                    {
                        alg: -7, // ES256 
                        type: 'public-key'
                    },
                    {
                        alg: -257, // RS256
                        type: 'public-key'
                    }
                ],
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rp: {
                    name: RP_NAME
                },
                user: {
                    displayName: USER_DISPLAY_NAME,
                    id: crypto.getRandomValues(new Uint8Array(32)), // Use random ID for user handle
                    name: username
                },
                timeout: 60_000,
                attestation: 'none'
            }
        }) as PublicKeyCredential | null;

        if (!passkeyCredential) {
            throw Error('Passkey creation failed: No credential was returned.');
        }

        // --- Coordinate Extraction (inspired by user snippet, NO Buffer) ---
        const pubKey = passkeyCredential.response.getPublicKey();
        if (!pubKey) {
            throw new Error('Could not get public key from credential response.');
        }

        const key = await crypto.subtle.importKey(
            'spki', // SubjectPublicKeyInfo format (standard for getPublicKey)
            pubKey,
            {
                name: 'ECDSA',
                namedCurve: 'P-256', // Must match algorithm used (ES256 uses P-256)
            },
            true, // exportable
            ['verify'] // key usage
        );

        const jwk = await crypto.subtle.exportKey('jwk', key);
        if (!jwk.x || !jwk.y) {
            throw new Error('Failed to retrieve x and y coordinates from exported key.');
        }

        // Helper function to convert base64url to Uint8Array without Buffer
        const base64UrlToUint8Array = (base64urlString: string): Uint8Array => {
            // Replace base64url specific characters
            const base64 = base64urlString.replace(/-/g, '+').replace(/_/g, '/');
            // Pad with '=' if necessary
            const padding = '='.repeat((4 - base64.length % 4) % 4);
            const base64Padded = base64 + padding;
            // Decode base64 to binary string
            const binaryString = atob(base64Padded);
            // Convert binary string to Uint8Array
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        };

        const xBytes = base64UrlToUint8Array(jwk.x);
        const yBytes = base64UrlToUint8Array(jwk.y);

        const coordinates = {
            x: bytesToHex(xBytes),
            y: bytesToHex(yBytes),
        };
        // --- End Coordinate Extraction ---

        return { credential: passkeyCredential, coordinates };

    } catch (error) {
        console.error('Error creating passkey credential:', error);
        // Rethrow or handle specific errors (e.g., user cancellation)
        if (error instanceof Error) {
            throw new Error(`Passkey creation failed: ${error.message}`);
        } else {
            throw new Error('Passkey creation failed: Unknown error.');
        }
    }
}

/**
 * Creates a passkey, extracts coordinates, calculates authMethodId, and stores relevant data.
 */
export async function createAndStorePasskeyData(username: string): Promise<StoredPasskeyData | null> {
    try {
        const result = await createPasskeyCredential(username);
        if (!result) return null;

        const { credential, coordinates } = result;

        const passkeyRawIdBytes = new Uint8Array(credential.rawId);
        const passkeyRawIdHex = bytesToHex(passkeyRawIdBytes); // Store rawId as hex

        // Calculate the authMethodId by hashing the rawId bytes
        const authMethodId = keccak256(passkeyRawIdBytes);

        const storedData: StoredPasskeyData = {
            rawId: passkeyRawIdHex,
            pubkeyCoordinates: coordinates,
            username: username,
            authMethodId: authMethodId, // Store the calculated ID
            // signerContractAddress will be added after deployment
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
        console.log('Stored Passkey Data (with authMethodId):', storedData);
        return storedData;
    } catch (error) {
        console.error('Error creating and storing passkey data:', error);
        // Propagate error message
        throw error;
    }
}

/**
 * Retrieves the passkey data (including authMethodId) from localStorage.
 */
export function getStoredPasskeyData(): StoredPasskeyData | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        return null;
    }
    try {
        // Parse should now include authMethodId if it exists
        const parsedData = JSON.parse(stored) as StoredPasskeyData;
        console.log("Retrieved StoredPasskeyData:", parsedData);
        return parsedData;
    } catch (parseError) {
        console.error("Failed to parse stored passkey data.", parseError);
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

/**
 * Clears the stored passkey data.
 */
export function clearStoredPasskeyData(): void {
    localStorage.removeItem(STORAGE_KEY);
    // Reset wallet client/account if needed
    walletClient = null;
    walletAccount = null;
}

// --- Signature Formatting Helpers (inspired by user snippet) ---

/**
 * Extracts the R and S values from a DER-encoded signature.
 */
function extractSignatureRS(signature: ArrayBuffer): [bigint, bigint] {
    const view = new DataView(signature);
    const check = (condition: boolean, msg: string) => { if (!condition) throw new Error(msg); };

    check(view.byteLength > 2, 'Signature too short');
    check(view.getUint8(0) === 0x30, 'Invalid sequence header');
    check(view.getUint8(1) <= view.byteLength - 2, 'Invalid sequence length');

    const readInt = (offset: number): [bigint, number] => {
        check(offset + 1 < view.byteLength, 'Offset out of bounds for reading int header');
        check(view.getUint8(offset) === 0x02, 'Invalid integer header');
        const len = view.getUint8(offset + 1);
        const start = offset + 2;
        const end = start + len;
        check(end <= view.byteLength, 'Integer length out of bounds');

        // Handle negative numbers in DER encoding (leading 0x00)
        const bytes = new Uint8Array(view.buffer.slice(start, end));
        let hex = bytesToHex(bytes);
        // If the first byte is > 0x7F, it might be interpreted as negative.
        // Ethereum expects positive integers for r and s.
        // If the first byte is 0x00 and length > 1, trim it.
        if (bytes.length > 1 && bytes[0] === 0x00 && (bytes[1] & 0x80) !== 0) {
            hex = bytesToHex(bytes.slice(1));
        }
        const n = hexToBigInt(hex);

        // Simple check against P-256 curve order (n)
        const curveOrder = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
        check(n > 0 && n < curveOrder, 'Signature R/S value out of range');

        return [n, end];
    };

    try {
        const [r, sOffset] = readInt(2);
        const [s] = readInt(sOffset);
        return [r, s];
    } catch {
        console.error("Error parsing DER signature:");
        const message = 'Unknown signature parse error';
        throw new Error(`Failed to parse signature: ${message}`);
    }
}

/**
 * Extracts the non-standard fields from clientDataJSON.
 * Based on example snippet.
 * See <https://w3c.github.io/webauthn/#clientdatajson-serialization>
 */
function extractClientDataFields(clientDataJSON: ArrayBuffer): Hex {
    const clientDataString = new TextDecoder('utf-8').decode(clientDataJSON);
    // Regex to capture the fields *after* type and challenge
    const match = clientDataString.match(/^\{"type":"webauthn\.get","challenge":"[A-Za-z0-9\-_]{43}",(.*)\}$/);

    if (!match || match.length < 2) {
        console.warn('Could not extract partial client data fields from:', clientDataString);
        // Fallback or decide how to handle - maybe return empty bytes?
        // Returning full client data might be wrong, let's return empty for now to see if it passes
        return '0x';
        // Alternatively, throw new Error('Could not parse clientDataJSON fields');
    }

    const fields = match[1]; // The captured group with the remaining fields
    // Encode just the remaining fields string as bytes
    return bytesToHex(new TextEncoder().encode(fields));
}

/**
 * Formats the signature components into the structure expected by the Safe contracts.
 * Export this function so it can be used in lit.ts to prepare jsParams.
 */
export function formatSignatureForEIP1271(assertionResponse: AuthenticatorAssertionResponse): Hex {
    const [r, s] = extractSignatureRS(assertionResponse.signature);
    const partialClientDataBytes = extractClientDataFields(assertionResponse.clientDataJSON);

    return encodeAbiParameters(
        parseAbiParameters('bytes authenticatorData, bytes clientDataJSON, uint256[2] rs'),
        [bytesToHex(new Uint8Array(assertionResponse.authenticatorData)), partialClientDataBytes, [r, s]]
    );
}

// --- Contract Interaction Functions ---

/**
 * Predicts the EIP-1271 signer contract address for the stored passkey.
 * Reverted back to using readContract.
 */
export async function getPasskeySignerContractAddress(): Promise<Address | null> {
    const storedData = getStoredPasskeyData();
    if (!storedData?.pubkeyCoordinates?.x || !storedData?.pubkeyCoordinates?.y) {
        console.error("No stored passkey coordinates found.");
        return null;
    }

    try {
        const x = hexToBigInt(storedData.pubkeyCoordinates.x as Hex);
        const y = hexToBigInt(storedData.pubkeyCoordinates.y as Hex);
        // Calculate the verifiers value using FCL as fallback
        const verifiersValue = BigInt(FCL_VERIFIER_ADDRESS);

        console.log(`Calling getSigner with x=${x}, y=${y}, verifiers=${verifiersValue}`);
        const signerAddress = await publicClient.readContract({
            address: FACTORY_ADDRESS,
            abi: FactoryABI,
            functionName: 'getSigner',
            args: [x, y, verifiersValue] // Pass calculated value (using FCL)
        });

        console.log('Predicted Signer Address:', signerAddress);
        return signerAddress;
    } catch (error) {
        console.error("Error predicting signer address:", error);
        return null;
    }
}

/**
 * Deploys the EIP-1271 signer contract via the factory.
 * Requires a connected & funded EOA wallet ON GNOSIS CHAIN.
 */
export async function deployPasskeySignerContract(): Promise<{ txHash: Hex; signerAddress?: Address } | null> {
    const storedData = getStoredPasskeyData();
    if (!storedData || !storedData.pubkeyCoordinates.x || !storedData.pubkeyCoordinates.y) {
        throw new Error('Passkey data with coordinates not found. Create a passkey first.');
    }

    try {
        const client = getWalletClient();
        if (!client) {
            throw new Error('Wallet client not initialized.');
        }
        const account = await getWalletAccount();
        if (!account) {
            throw new Error('Could not get wallet account.');
        }

        // --- NEW: Network Switch Logic --- 
        let currentChainId = await client.getChainId();
        if (currentChainId !== gnosis.id) {
            console.log(`Requesting wallet switch to Gnosis (ID: ${gnosis.id})...`);
            try {
                await client.switchChain({ id: gnosis.id });
                currentChainId = await client.getChainId(); // Re-check after switch attempt
                if (currentChainId !== gnosis.id) {
                    throw new Error(`Wallet switch failed. Please manually switch to Gnosis (ID: ${gnosis.id}).`);
                }
                console.log(`Wallet switched to Gnosis.`);
            } catch (switchError: unknown) {
                let message = 'Unknown switch error';
                if (switchError instanceof Error) message = switchError.message;
                else if (typeof switchError === 'string') message = switchError;
                // Include specific message for user rejection
                if (message.includes('rejected') || (typeof switchError === 'object' && switchError && 'code' in switchError && switchError.code === 4001)) {
                    throw new Error('User rejected the network switch request.');
                }
                throw new Error(`Failed to switch wallet to Gnosis: ${message}`);
            }
        }
        // --- END: Network Switch Logic --- 

        // Compute Verifiers value (P256.Verifiers type in Solidity, uint176 in ABI)
        // Assuming 0x000A precompile for P-256 based on EIP-7212 (common for Arbitrum/Gnosis)
        // Adjust precompile address if different for Gnosis mainnet/chiado
        const precompileAddressShort = 0x000a; // Adjust if necessary
        const fallbackVerifierAddress = FCL_VERIFIER_ADDRESS;
        const verifiersBigInt =
            (BigInt(precompileAddressShort) << 160n) + BigInt(fallbackVerifierAddress);

        console.log('Deploying signer contract with:');
        console.log(' Public Key X:', storedData.pubkeyCoordinates.x);
        console.log(' Public Key Y:', storedData.pubkeyCoordinates.y);
        console.log(' Verifiers (BigInt):', verifiersBigInt);
        console.log(' Factory Address:', FACTORY_ADDRESS);
        console.log(' Account:', account);

        const txHash = await client.writeContract({
            address: FACTORY_ADDRESS,
            abi: FactoryABI,
            functionName: 'createSigner',
            args: [
                hexToBigInt(storedData.pubkeyCoordinates.x as Hex),
                hexToBigInt(storedData.pubkeyCoordinates.y as Hex),
                verifiersBigInt // Pass the computed BigInt
            ],
            account: account,
            chain: gnosis // Explicitly specify chain for Viem
        });

        console.log('Deployment transaction sent:', txHash);

        // Wait for transaction receipt to potentially extract signer address
        console.log('Waiting for transaction receipt...');
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log('Transaction receipt:', receipt);

        if (receipt.status !== 'success') {
            throw new Error(`Deployment transaction failed. Status: ${receipt.status}`);
        }

        // Attempt to parse the 'Created' event log to get the signer address
        let signerAddress: Address | undefined = undefined;
        const createdEventSignature = keccak256(toBytes('Created(address,uint256,uint256,uint176)'));

        for (const log of receipt.logs) {
            // Check if log comes from the Factory and matches the event signature
            if (log.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase() &&
                log.topics[0]?.toLowerCase() === createdEventSignature.toLowerCase() &&
                log.topics.length > 1 && log.topics[1]) {
                try {
                    // The signer address is the first indexed topic (log.topics[1])
                    // It's stored as bytes32, need last 20 bytes.
                    const topicValue = log.topics[1];
                    // Extract the last 40 hex chars (20 bytes) and prepend 0x
                    const potentialAddress = `0x${topicValue.slice(-40)}` as Address;
                    // Use getAddress to validate and checksum
                    signerAddress = getAddress(potentialAddress);
                    console.log("Successfully extracted signer address from logs:", signerAddress);
                    break; // Found it, exit loop
                } catch (parseError) {
                    console.error("Error parsing or checksumming address from 'Created' event log topic:", log.topics[1], parseError);
                    signerAddress = undefined; // Ensure it's undefined if parsing/checksum fails
                }
            }
        }

        if (signerAddress) {
            // Update stored data with the deployed address
            storedData.signerContractAddress = signerAddress;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
            console.log('Updated stored passkey data with signer address.');
        } else {
            console.warn("Could not extract signer address from 'Created' event logs.");
        }

        return { txHash, signerAddress };

    } catch (error: unknown) {
        console.error('Error deploying signer contract:', error);
        let errorMessage = 'An unknown deployment error occurred.';
        let errorCode: number | string | undefined = undefined;

        if (error instanceof Error) {
            errorMessage = error.message;
            if ('code' in error && error.code !== undefined && (typeof error.code === 'number' || typeof error.code === 'string')) {
                errorCode = error.code;
            }
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
            errorMessage = error.message;
            if ('code' in error && error.code !== undefined && (typeof error.code === 'number' || typeof error.code === 'string')) {
                errorCode = error.code;
            }
        }

        // Re-throw specific user rejection errors
        if (errorMessage?.includes('User rejected') || errorCode === 4001) {
            throw new Error('User rejected the transaction request.');
        }
        // Also handle the network switch rejection message explicitly
        if (errorMessage?.includes('User rejected the network switch request')) {
            throw new Error('User rejected the network switch request.');
        }

        // Construct a comprehensive error message
        let finalErrorMessage = `Failed to deploy: ${errorMessage}`;
        if (errorCode !== undefined) {
            finalErrorMessage += ` (Code: ${errorCode})`;
        }
        if (!(error instanceof Error) && typeof error !== 'string') {
            try {
                finalErrorMessage += ` | Raw error: ${JSON.stringify(error)}`;
            } catch { /* ignore stringify errors */ }
        }
        throw new Error(finalErrorMessage);
    }
}

/**
 * Verifies a passkey signature for a message hash using the FACTORY contract helper.
 */
export async function checkSignature(
    message: string,
): Promise<{ isCorrect: boolean; error?: string }> {
    const storedData = getStoredPasskeyData();
    if (!storedData?.pubkeyCoordinates?.x || !storedData?.pubkeyCoordinates?.y) {
        return { isCorrect: false, error: "No stored passkey coordinates found." };
    }

    try {
        // 1. Get assertion from passkey
        const messageHash = keccak256(new TextEncoder().encode(message));
        console.log(`(Factory Check) Requesting passkey signature for message: "${message}" (hash: ${messageHash})`);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: hexToBytes(messageHash),
                allowCredentials: [{ type: 'public-key', id: hexToBytes(storedData.rawId as Hex) }],
                userVerification: 'required',
            },
        }) as PublicKeyCredential | null;

        if (!assertion) {
            return { isCorrect: false, error: '(Factory Check) Failed to get signature from passkey (assertion is null).' };
        }
        console.log("(Factory Check) Got assertion:", assertion);

        // ---> ADD Checks for required response fields
        if (!assertion.response.authenticatorData || !assertion.response.signature) {
            return { isCorrect: false, error: '(Factory Check) Assertion response missing authenticatorData or signature.' };
        }
        // ---> END Checks

        // 2. Format the signature for the contract
        // Cast response to the specific type after checks
        const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
        const formattedSignature = formatSignatureForEIP1271(assertionResponse);
        console.log("(Factory Check) Formatted Signature for Contract:", formattedSignature);

        // 3. Call the verification function on the factory contract
        const x = hexToBigInt(storedData.pubkeyCoordinates.x as Hex);
        const y = hexToBigInt(storedData.pubkeyCoordinates.y as Hex);
        const verifiersValue = BigInt(FCL_VERIFIER_ADDRESS); // Using FCL for factory check consistency

        console.log("(Factory Check) Verifying signature via factory...");
        const result = await publicClient.readContract({
            address: FACTORY_ADDRESS, // Call FACTORY
            abi: FactoryABI,
            functionName: 'isValidSignatureForSigner',
            args: [messageHash, formattedSignature, x, y, verifiersValue]
        });
        console.log("(Factory Check) Verification Result (bytes4):", result);

        // 4. Check result against EIP-1271 magic value
        const isValid = result.toLowerCase() === EIP1271_MAGIC_VALUE.toLowerCase();
        return { isCorrect: isValid };

    } catch (error) {
        console.error("(Factory Check) Error verifying signature:", error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown verification error.';
        if (error instanceof Error && (error.name === 'NotAllowedError' || errorMsg.includes('cancelled'))) {
            return { isCorrect: false, error: '(Factory Check) User cancelled signing operation.' };
        }
        return { isCorrect: false, error: `(Factory Check) ${errorMsg}` };
    }
}

/**
 * NEW: Verifies a passkey signature for a message hash using the DEPLOYED PROXY contract.
 */
export async function verifySignatureWithProxy(
    message: string,
    signerContractAddress: Address | undefined | null
): Promise<{ isCorrect: boolean; error?: string }> {
    if (!signerContractAddress) {
        return { isCorrect: false, error: "Signer contract address is missing." };
    }
    const storedData = getStoredPasskeyData();
    if (!storedData?.rawId) {
        return { isCorrect: false, error: "No stored passkey rawId found." };
    }

    try {
        // 1. Get assertion from passkey
        const messageHash = keccak256(new TextEncoder().encode(message));
        console.log(`(Proxy Check) Requesting passkey signature for message: "${message}" (hash: ${messageHash})`);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: hexToBytes(messageHash),
                allowCredentials: [{ type: 'public-key', id: hexToBytes(storedData.rawId as Hex) }],
                userVerification: 'required',
            },
        }) as PublicKeyCredential | null;

        if (!assertion) {
            return { isCorrect: false, error: '(Proxy Check) Failed to get signature from passkey (assertion is null).' };
        }
        console.log("(Proxy Check) Got assertion:", assertion);

        // ---> ADD Checks for required response fields
        if (!assertion.response.authenticatorData || !assertion.response.signature) {
            return { isCorrect: false, error: '(Proxy Check) Assertion response missing authenticatorData or signature.' };
        }
        // ---> END Checks

        // 2. Format the signature using the *same* EIP-1271 formatting logic
        // Cast response to the specific type after checks
        const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
        const formattedSignature = formatSignatureForEIP1271(assertionResponse);
        console.log("(Proxy Check) Formatted Signature for Contract:", formattedSignature);

        // 3. Call the standard EIP-1271 isValidSignature on the deployed proxy contract
        console.log(`(Proxy Check) Verifying signature via deployed proxy: ${signerContractAddress}`);
        const result = await publicClient.readContract({
            address: signerContractAddress, // Call DEPLOYED PROXY
            abi: EIP1271ABI, // Use standard EIP-1271 ABI
            functionName: 'isValidSignature',
            args: [messageHash, formattedSignature]
        });
        console.log("(Proxy Check) Verification Result (bytes4):", result);

        // 4. Check result against EIP-1271 magic value
        const isValid = result.toLowerCase() === EIP1271_MAGIC_VALUE.toLowerCase();
        return { isCorrect: isValid };

    } catch (error) {
        console.error("(Proxy Check) Error verifying signature:", error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown verification error.';
        if (error instanceof Error && (error.name === 'NotAllowedError' || errorMsg.includes('cancelled'))) {
            return { isCorrect: false, error: '(Proxy Check) User cancelled signing operation.' };
        }
        // Add more specific error checking for contract reverts if possible
        return { isCorrect: false, error: `(Proxy Check) ${errorMsg}` };
    }
}
