import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { createWalletClient, custom } from 'viem';
import type { Address, EIP1193Provider } from 'viem';
import { currentChain } from './config'; // For default chain
import { o } from '$lib/KERNEL/hominio-svelte'; // Import the centralized facade

// Declare window.ethereum for TypeScript, using Viem's EIP1193Provider
declare global {
    interface Window {
        ethereum?: EIP1193Provider;
    }
}

// --- Svelte Stores for EOA Guardian Wallet State ---
// Removed local store definitions. We will use o.guardian stores directly.
// export const guardianEoaClientStore = writable<WalletClient | null>(null);
// export const guardianEoaAddressStore = writable<Address | null>(null);
// export const guardianEoaChainIdStore = writable<number | null>(null);
// export const guardianEoaErrorStore = writable<string | null>(null);

/**
 * Initializes the EOA Guardian Wallet client and sets up event listeners.
 * This function should be called once, typically on application startup (e.g., in root layout's onMount).
 */
export function initializeGuardianEoaClient(): void {
    if (!browser || !window.ethereum) {
        const errorMsg = 'Ethereum provider (e.g., MetaMask) not found. EOA Wallet cannot be initialized.';
        console.warn(`[GuardianEOA] ${errorMsg}`);
        // o.guardian.error.set(errorMsg); // Optionally set central error store if provider missing early
        return;
    }

    if (get(o.guardian.client)) { // Check central store
        console.log('[GuardianEOA] Client already initialized.');
        return;
    }

    try {
        const client = createWalletClient({
            chain: currentChain, // Default chain from config
            transport: custom(window.ethereum!)
        });
        o.guardian.client.set(client); // Update central store
        console.log('[GuardianEOA] Wallet client initialized with default chain:', currentChain.name);

        // --- Event Listeners ---
        window.ethereum.on('accountsChanged', async (accounts: string[]) => {
            console.log('[GuardianEOA] accountsChanged event:', accounts);
            if (accounts.length === 0) {
                o.guardian.address.set(null); // Update central store
                o.guardian.chainId.set(null);  // Update central store
                o.guardian.error.set('Wallet disconnected or locked.'); // Update central store
            } else {
                const newAddress = accounts[0] as Address;
                o.guardian.address.set(newAddress); // Update central store
                o.guardian.error.set(null);        // Update central store
                try {
                    const currentClient = get(o.guardian.client); // Get from central store
                    if (currentClient) {
                        const chainId = await currentClient.getChainId();
                        o.guardian.chainId.set(chainId); // Update central store
                    }
                } catch (err) {
                    console.error('[GuardianEOA] Error fetching chainId after accountsChanged:', err);
                    o.guardian.chainId.set(null); // Update central store
                    o.guardian.error.set('Failed to get chain ID after account switch.'); // Update central store
                }
            }
        });

        window.ethereum.on('chainChanged', (newChainIdHex: string) => {
            console.log('[GuardianEOA] chainChanged event:', newChainIdHex);
            const newChainId = parseInt(newChainIdHex, 16);
            o.guardian.chainId.set(newChainId); // Update central store
            o.guardian.error.set(null);       // Update central store
        });

        // --- Auto-connect attempt --- 
        (async () => {
            try {
                const accounts = await client.getAddresses();
                if (accounts && accounts.length > 0) {
                    const autoConnectedAddress = accounts[0];
                    o.guardian.address.set(autoConnectedAddress); // Update central store
                    const chainId = await client.getChainId();
                    o.guardian.chainId.set(chainId);           // Update central store
                    o.guardian.error.set(null);                // Update central store
                    console.log('[GuardianEOA] Auto-connected existing EOA:', autoConnectedAddress, 'on chain ID:', chainId);
                } else {
                    console.log('[GuardianEOA] No previously connected accounts found for auto-connect.');
                }
            } catch (autoConnectError) {
                console.warn('[GuardianEOA] Error during auto-connect attempt:', autoConnectError);
            }
        })();

    } catch (error: unknown) {
        console.error('[GuardianEOA] Error initializing wallet client:', error);
        const errorMsg = error instanceof Error ? `Initialization failed: ${error.message}` : 'Initialization failed: Unknown error';
        o.guardian.error.set(errorMsg); // Update central store
        o.guardian.client.set(null);    // Update central store
    }
}

/**
 * Connects to the EOA Guardian Wallet account.
 * Initializes the client if it hasn't been already.
 * Prompts the user to connect their wallet if not already connected.
 */
export async function connectGuardianEoaAccount(): Promise<void> {
    if (!browser) return;

    if (!get(o.guardian.client) && window.ethereum) { // Check central store
        initializeGuardianEoaClient(); // This will now use central stores
    }

    const client = get(o.guardian.client); // Get from central store
    if (!client) {
        let errorMsg = 'EOA Wallet client not initialized. Cannot connect.';
        if (!window.ethereum) {
            errorMsg = 'Ethereum provider (e.g., MetaMask) not found.';
        } else {
            // Re-attempt initialization if somehow failed or provider appeared late
            if (!get(o.guardian.client)) { // Double check after init attempt in this flow
                errorMsg = 'Client initialization failed. Check console.';
            } else {
                errorMsg = 'Client initialized, please try connecting again.';
            }
        }
        console.error(`[GuardianEOA] ${errorMsg}`);
        o.guardian.error.set(errorMsg); // Update central store
        return;
    }

    try {
        o.guardian.error.set(null); // Update central store
        const [addressRequested] = await client.requestAddresses();

        if (addressRequested) {
            o.guardian.address.set(addressRequested); // Update central store
            const chainId = await client.getChainId();
            o.guardian.chainId.set(chainId);       // Update central store
            console.log('[GuardianEOA] Account connected:', addressRequested, 'on chain ID:', chainId);
        } else {
            o.guardian.address.set(null); // Update central store
            o.guardian.chainId.set(null);  // Update central store
            o.guardian.error.set('Connection denied or no account selected.'); // Update central store
        }
    } catch (error: unknown) {
        console.error('[GuardianEOA] Error connecting account:', error);
        o.guardian.address.set(null); // Update central store
        o.guardian.chainId.set(null);  // Update central store
        let errorMsg = 'Connection failed: Unknown error';
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 4001) {
            errorMsg = 'Connection request rejected by user.';
        } else if (error instanceof Error) {
            errorMsg = `Connection failed: ${error.message}`;
        }
        o.guardian.error.set(errorMsg); // Update central store
    }
}

/**
 * Disconnects the EOA Guardian Wallet account by clearing the stored address and chain ID.
 * Note: This does not truly "disconnect" from the wallet provider (e.g., MetaMask),
 * but rather clears the application's state of the connected account.
 */
export function disconnectGuardianEoaAccount(): void {
    if (!browser) return;
    o.guardian.address.set(null); // Update central store
    o.guardian.chainId.set(null);  // Update central store
    o.guardian.error.set(null);   // Update central store
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