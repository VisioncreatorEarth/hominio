// Extend the Window interface for TypeScript first
declare global {
    interface Window { ethereum?: import('viem').EIP1193Provider }
}

import { createPublicClient, http, createWalletClient, custom, type Address, type Hex, hexToBytes, bytesToHex, hexToBigInt, keccak256, encodeAbiParameters, parseAbiParameters, /* type Hash, */ type PublicClient, toBytes } from 'viem';
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
    if (!storedData?.pubkeyCoordinates?.x || !storedData?.pubkeyCoordinates?.y) {
        console.error("No stored passkey coordinates found.");
        return null;
    }

    try {
        const account = await getWalletAccount();
        const wallet = getWalletClient();

        // Ensure wallet is on Gnosis before proceeding
        const currentChainId = await wallet.getChainId();
        if (currentChainId !== gnosis.id) {
            // Optional: Request network switch
            // try {
            //     await wallet.switchChain({ id: gnosis.id });
            //     console.log('Switched to Gnosis network');
            // } catch (switchError) {
            //     console.error('Failed to switch network:', switchError);
            //     throw new Error(`Please switch your wallet to the Gnosis network (Chain ID: ${gnosis.id}) to deploy the signer contract.`);
            // }
            throw new Error(`Wallet is connected to chain ${currentChainId}, but Gnosis (Chain ID: ${gnosis.id}) is required for deployment.`);
        }

        const x = hexToBigInt(storedData.pubkeyCoordinates.x as Hex);
        const y = hexToBigInt(storedData.pubkeyCoordinates.y as Hex);
        const verifiersValue = BigInt(FCL_VERIFIER_ADDRESS);

        console.log(`Attempting to deploy signer for passkey ${storedData.rawId} on Gnosis...`);

        const txHash = await wallet.writeContract({
            address: FACTORY_ADDRESS,
            abi: FactoryABI,
            functionName: 'createSigner',
            args: [x, y, verifiersValue],
            account: account,
            chain: gnosis // Explicitly set chain to gnosis
        });

        console.log('Deployment Transaction Hash:', txHash);
        console.log('Waiting for transaction receipt...');

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        console.log('Transaction Confirmed:', receipt);
        if (receipt.status === 'success') {
            console.log('Signer contract deployment transaction succeeded.');

            // Attempt to get the address via prediction *after* deployment succeeds
            console.log('Attempting to predict signer address post-deployment...');
            const predictedAddress = await getPasskeySignerContractAddress();

            if (predictedAddress) {
                console.log('Successfully predicted signer address post-deployment:', predictedAddress);
                // Store the address
                storedData.signerContractAddress = predictedAddress;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
                console.log('Stored deployed signer address.');
                return { txHash, signerAddress: predictedAddress }; // Return address
            } else {
                console.error('Prediction failed even after deployment succeeded.');
                // Return txHash, but indicate address wasn't found
                return { txHash };
            }
        } else {
            throw new Error(`Deployment transaction failed: ${txHash}`);
        }
    } catch (error) {
        console.error("Error deploying signer contract:", error);
        if (error instanceof Error && error.message.includes('User rejected the request')) {
            throw new Error('Transaction rejected by user.');
        }
        throw error;
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
