import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { createWalletClient, custom } from 'viem';
import type { WalletClient, Address, EIP1193Provider } from 'viem';
import { currentChain } from './config'; // For default chain

// Declare window.ethereum for TypeScript, using Viem's EIP1193Provider
declare global {
    interface Window {
        ethereum?: EIP1193Provider;
    }
}

// --- Svelte Stores for EOA Guardian Wallet State ---
export const guardianEoaClientStore = writable<WalletClient | null>(null);
export const guardianEoaAddressStore = writable<Address | null>(null);
export const guardianEoaChainIdStore = writable<number | null>(null);
export const guardianEoaErrorStore = writable<string | null>(null);

/**
 * Initializes the EOA Guardian Wallet client and sets up event listeners.
 * This function should be called once, typically on application startup (e.g., in root layout's onMount).
 */
export function initializeGuardianEoaClient(): void {
    if (!browser || !window.ethereum) {
        const errorMsg = 'Ethereum provider (e.g., MetaMask) not found. EOA Wallet cannot be initialized.';
        console.warn(`[GuardianEOA] ${errorMsg}`);
        return;
    }

    if (get(guardianEoaClientStore)) {
        console.log('[GuardianEOA] Client already initialized.');
        return;
    }

    try {
        // window.ethereum is now typed as EIP1193Provider | undefined
        // The `custom` transport expects an EIP1193Provider.
        // The check `!window.ethereum` above ensures it's defined here.
        const client = createWalletClient({
            chain: currentChain, // Default chain from config
            transport: custom(window.ethereum!)
        });
        guardianEoaClientStore.set(client);
        console.log('[GuardianEOA] Wallet client initialized with default chain:', currentChain.name);

        // --- Event Listeners ---
        // We can safely call .on as EIP1193Provider defines it.
        window.ethereum.on('accountsChanged', async (accounts: string[]) => {
            console.log('[GuardianEOA] accountsChanged event:', accounts);
            if (accounts.length === 0) {
                guardianEoaAddressStore.set(null);
                guardianEoaChainIdStore.set(null);
                guardianEoaErrorStore.set('Wallet disconnected or locked.');
            } else {
                const newAddress = accounts[0] as Address;
                guardianEoaAddressStore.set(newAddress);
                guardianEoaErrorStore.set(null);
                try {
                    const currentClient = get(guardianEoaClientStore);
                    if (currentClient) {
                        const chainId = await currentClient.getChainId();
                        guardianEoaChainIdStore.set(chainId);
                    }
                } catch (err) {
                    console.error('[GuardianEOA] Error fetching chainId after accountsChanged:', err);
                    guardianEoaChainIdStore.set(null);
                    guardianEoaErrorStore.set('Failed to get chain ID after account switch.');
                }
            }
        });

        window.ethereum.on('chainChanged', (newChainIdHex: string) => {
            console.log('[GuardianEOA] chainChanged event:', newChainIdHex);
            const newChainId = parseInt(newChainIdHex, 16);
            guardianEoaChainIdStore.set(newChainId);
            guardianEoaErrorStore.set(null);
        });

        // --- Auto-connect attempt --- 
        // Wrap in async IIFE to use await
        (async () => {
            try {
                const accounts = await client.getAddresses();
                if (accounts && accounts.length > 0) {
                    const autoConnectedAddress = accounts[0];
                    guardianEoaAddressStore.set(autoConnectedAddress);
                    const chainId = await client.getChainId();
                    guardianEoaChainIdStore.set(chainId);
                    guardianEoaErrorStore.set(null); // Clear any potential init error
                    console.log('[GuardianEOA] Auto-connected existing EOA:', autoConnectedAddress, 'on chain ID:', chainId);
                } else {
                    console.log('[GuardianEOA] No previously connected accounts found for auto-connect.');
                }
            } catch (autoConnectError) {
                // Don't set main error store here, as manual connection is still possible.
                console.warn('[GuardianEOA] Error during auto-connect attempt:', autoConnectError);
            }
        })(); // Immediately invoke the async function
        // --- End Auto-connect attempt ---

    } catch (error: unknown) {
        console.error('[GuardianEOA] Error initializing wallet client:', error);
        if (error instanceof Error) {
            guardianEoaErrorStore.set(`Initialization failed: ${error.message}`);
        } else {
            guardianEoaErrorStore.set('Initialization failed: Unknown error');
        }
        guardianEoaClientStore.set(null); // Ensure client is null on error
    }
}

/**
 * Connects to the EOA Guardian Wallet account.
 * Initializes the client if it hasn't been already.
 * Prompts the user to connect their wallet if not already connected.
 */
export async function connectGuardianEoaAccount(): Promise<void> {
    if (!browser) return;

    if (!get(guardianEoaClientStore) && window.ethereum) {
        initializeGuardianEoaClient();
    }

    const client = get(guardianEoaClientStore);
    if (!client) {
        const errorMsg = 'EOA Wallet client not initialized. Cannot connect.';
        console.error(`[GuardianEOA] ${errorMsg}`);
        guardianEoaErrorStore.set(errorMsg);
        if (!window.ethereum) {
            guardianEoaErrorStore.set('Ethereum provider (e.g., MetaMask) not found.');
        } else {
            initializeGuardianEoaClient();
            if (!get(guardianEoaClientStore)) {
                guardianEoaErrorStore.set('Client initialization failed. Check console.');
            } else {
                guardianEoaErrorStore.set('Client initialized, please try connecting again.');
            }
        }
        return;
    }

    try {
        guardianEoaErrorStore.set(null);
        // requestAddresses is available on the client, which was created from EIP1193Provider
        const [addressRequested] = await client.requestAddresses();

        if (addressRequested) {
            guardianEoaAddressStore.set(addressRequested);
            const chainId = await client.getChainId();
            guardianEoaChainIdStore.set(chainId);
            console.log('[GuardianEOA] Account connected:', addressRequested, 'on chain ID:', chainId);
        } else {
            guardianEoaAddressStore.set(null);
            guardianEoaChainIdStore.set(null);
            guardianEoaErrorStore.set('Connection denied or no account selected.');
        }
    } catch (error: unknown) {
        console.error('[GuardianEOA] Error connecting account:', error);
        guardianEoaAddressStore.set(null);
        guardianEoaChainIdStore.set(null);
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 4001) {
            guardianEoaErrorStore.set('Connection request rejected by user.');
        } else if (error instanceof Error) {
            guardianEoaErrorStore.set(`Connection failed: ${error.message}`);
        } else {
            guardianEoaErrorStore.set('Connection failed: Unknown error');
        }
    }
}

/**
 * Disconnects the EOA Guardian Wallet account by clearing the stored address and chain ID.
 * Note: This does not truly "disconnect" from the wallet provider (e.g., MetaMask),
 * but rather clears the application's state of the connected account.
 */
export function disconnectGuardianEoaAccount(): void {
    if (!browser) return;
    guardianEoaAddressStore.set(null);
    guardianEoaChainIdStore.set(null);
    guardianEoaErrorStore.set(null);
    console.log('[GuardianEOA] Account disconnected (application state cleared).');
}

// Helper to get the current chain name, if needed, though not strictly part of connection logic
// export function getCurrentGuardianEoaChainName(): string | null {
//     const chainId = get(guardianEoaChainIdStore);
//     if (!chainId) return null;
//     // This would require a mapping from chainId to chainName, or fetching from a config
//     // For now, this is out of scope for the basic connection logic.
//     return `Chain ID: ${chainId}`;
// } 