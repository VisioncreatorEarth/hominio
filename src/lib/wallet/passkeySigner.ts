// Extend the Window interface for TypeScript first
declare global {
    interface Window { ethereum?: import('viem').EIP1193Provider }
}

import { createPublicClient, http, createWalletClient, custom, type Address, type Hex, hexToBytes, bytesToHex, hexToBigInt, keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';
import { gnosis } from 'viem/chains';

// --- Constants ---
const RP_NAME = 'Hominio Passkey Signer'; // Changed RP name
const USER_DISPLAY_NAME = 'Hominio User';
const STORAGE_KEY = 'hominio_passkey_data'; // Renamed storage key
const RPC_URL = 'https://rpc.gnosischain.com';

// Deployed Contract Addresses on Gnosis Chain (from Contracts.md and previous context)
const FACTORY_ADDRESS = '0x1d31F259eE307358a26dFb23EB365939E8641195' as Address;
const DAIMO_VERIFIER_ADDRESS = '0xc2b78104907F722DABAc4C69f826a522B2754De4' as Address; // Removed - Unused --> Re-enabled
const FCL_VERIFIER_ADDRESS = '0xA86e0054C51E4894D88762a017ECc5E5235f5DBA' as Address;

// EIP-1271 Magic Value
const EIP1271_MAGIC_VALUE = '0x1626ba7e';

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

// EXPORT Stored format includes coordinates
export type StoredPasskeyData = {
    rawId: string; // hex format
    pubkeyCoordinates: {
        x: string; // hex format (prefixed 0x)
        y: string; // hex format (prefixed 0x)
    };
    username: string;
    signerContractAddress?: string; // Optional: Store deployed address
};

type AuthenticatorAssertionResponse = {
    authenticatorData: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
    signature: ArrayBuffer;
    userHandle?: ArrayBuffer;
}
// Make Assertion type globally available
type Assertion = {
    response: AuthenticatorAssertionResponse;
}

// --- Viem Clients ---
const publicClient = createPublicClient({
    chain: gnosis,
    transport: http(RPC_URL)
});

// Lazy init wallet client when needed for transactions
let walletClient: ReturnType<typeof createWalletClient> | null = null;
let walletAccount: Address | null = null;

function getWalletClient() {
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

async function getWalletAccount(): Promise<Address> {
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
 * Creates a passkey, extracts coordinates, and stores relevant data.
 */
export async function createAndStorePasskeyData(username: string): Promise<StoredPasskeyData | null> {
    try {
        const result = await createPasskeyCredential(username);
        if (!result) return null;

        const { credential, coordinates } = result;

        const storedData: StoredPasskeyData = {
            rawId: bytesToHex(new Uint8Array(credential.rawId)), // Store rawId as hex
            pubkeyCoordinates: coordinates,
            username: username,
            // signerContractAddress will be added after deployment
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
        console.log('Stored Passkey Data:', storedData);
        return storedData;
    } catch (error) {
        console.error('Error creating and storing passkey data:', error);
        // Propagate error message
        throw error;
    }
}

/**
 * Retrieves the passkey data from localStorage.
 */
export function getStoredPasskeyData(): StoredPasskeyData | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        return null;
    }
    try {
        return JSON.parse(stored) as StoredPasskeyData;
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
 */
function formatSignatureForEIP1271(assertionResponse: AuthenticatorAssertionResponse): Hex {
    const [r, s] = extractSignatureRS(assertionResponse.signature);
    // The snippet used `extractClientDataFields` which took everything *but* type/challenge.
    // Let's try encoding the full clientDataJSON first, as verification might handle parsing.
    // Revisit if verification fails.
    // const clientDataFields = extractClientDataFields(assertionResponse.clientDataJSON); // Alternative based on snippet
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
 * Requires a connected & funded EOA wallet.
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

        const x = hexToBigInt(storedData.pubkeyCoordinates.x as Hex);
        const y = hexToBigInt(storedData.pubkeyCoordinates.y as Hex);
        const verifiersValue = BigInt(FCL_VERIFIER_ADDRESS); // Use FCL

        console.log(`Attempting to deploy signer for passkey ${storedData.rawId}`);

        console.log('Sending deployment transaction...');
        const txHash = await wallet.writeContract({
            address: FACTORY_ADDRESS,
            abi: FactoryABI,
            functionName: 'createSigner',
            args: [x, y, verifiersValue], // Pass calculated value (using FCL)
            account: account,
            chain: gnosis
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
 * Verifies a passkey signature for a message hash using the factory.
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
        console.log(`Requesting passkey signature for message: "${message}" (hash: ${messageHash})`);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: hexToBytes(messageHash),
                allowCredentials: [{ type: 'public-key', id: hexToBytes(storedData.rawId as Hex) }],
                userVerification: 'required',
            },
        }) as Assertion | null;

        if (!assertion) {
            return { isCorrect: false, error: 'Failed to get signature from passkey (assertion is null).' };
        }
        console.log("Got assertion:", assertion);

        // 2. Format the signature for the contract
        const formattedSignature = formatSignatureForEIP1271(assertion.response);
        console.log("Formatted Signature for Contract:", formattedSignature);

        // 3. Call the verification function on the factory contract
        const x = hexToBigInt(storedData.pubkeyCoordinates.x as Hex);
        const y = hexToBigInt(storedData.pubkeyCoordinates.y as Hex);
        // Switch back to DAIMO verifier for the check
        const verifiersValue = BigInt(DAIMO_VERIFIER_ADDRESS); // Use DAIMO

        console.log("Verifying signature via factory...");
        const result = await publicClient.readContract({
            address: FACTORY_ADDRESS,
            abi: FactoryABI,
            functionName: 'isValidSignatureForSigner',
            args: [messageHash, formattedSignature, x, y, verifiersValue] // Pass calculated value (using FCL)
        });
        console.log("Verification Result (bytes4):", result);

        // 4. Check result against EIP-1271 magic value
        const isValid = result.toLowerCase() === EIP1271_MAGIC_VALUE.toLowerCase();
        return { isCorrect: isValid };

    } catch (error) {
        console.error("Error verifying signature:", error);
        const message = error instanceof Error ? error.message : 'Unknown verification error.';
        // Handle specific errors like user cancellation during .get()
        if (error instanceof Error && (error.name === 'NotAllowedError' || message.includes('cancelled'))) {
            return { isCorrect: false, error: 'User cancelled signing operation.' };
        }
        return { isCorrect: false, error: message };
    }
}
