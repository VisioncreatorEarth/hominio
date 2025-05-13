import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { authClient } from '$lib/KERNEL/hominio-auth';
import { publicKeyToEthAddress } from '$lib/wallet/addressTokenUtils';
import type { Hex, Address } from 'viem';
import type { StoredPasskeyData } from '$lib/wallet/passkeySigner';

export interface CurrentUserPkpProfile {
    pkpEthAddress: Address;
    pkpPublicKey: Hex;
    passkeyData: StoredPasskeyData; // This will hold rawId, coordinates, verifier contract, etc.
    pkpTokenId: string; // Added to store the PKP's own NFT token ID
    // Potentially add pkpTokenId if readily available and useful globally
}

export const currentUserPkpProfileStore = writable<CurrentUserPkpProfile | null>(null);

let loadProfilePromise: Promise<CurrentUserPkpProfile | null> | null = null;

export async function ensurePkpProfileLoaded(): Promise<CurrentUserPkpProfile | null> {
    if (!browser) {
        return get(currentUserPkpProfileStore); // SSR: return current state
    }

    // If a load attempt is already in progress or has completed, return its promise/result
    if (loadProfilePromise) {
        return loadProfilePromise;
    }

    // Start a new load process
    loadProfilePromise = (async () => {
        console.log('[pkpSessionStore] Initiating PKP Profile load...');
        try {
            // Explicitly type the expected structure of pkp_passkey from the backend
            type BackendPkpPasskey = {
                rawId: string;
                pubKey: string;
                username: string;
                pubkeyCoordinates: { x: string; y: string }; // Explicitly defined inline
                pkpTokenId: string;
                passkeyVerifierContract?: string;
            };

            const userInfo = await authClient.pkpPasskeyPlugin.getUserPasskeyInfo();
            console.log('[pkpSessionStore] Fetched user passkey info:', userInfo);

            const pkpPasskeyData = userInfo.data?.pkp_passkey as BackendPkpPasskey | null | undefined;

            if (
                pkpPasskeyData &&
                pkpPasskeyData.rawId &&
                pkpPasskeyData.pubKey &&
                pkpPasskeyData.username &&
                pkpPasskeyData.pubkeyCoordinates &&
                pkpPasskeyData.pkpTokenId
            ) {
                const pkpEthAddress = publicKeyToEthAddress(pkpPasskeyData.pubKey as Hex);

                if (pkpEthAddress) {
                    const passkeyDataForStore: StoredPasskeyData = {
                        rawId: pkpPasskeyData.rawId,
                        pubkeyCoordinates: pkpPasskeyData.pubkeyCoordinates,
                        username: pkpPasskeyData.username,
                        passkeyVerifierContractAddress: pkpPasskeyData.passkeyVerifierContract
                    };

                    const profile: CurrentUserPkpProfile = {
                        pkpEthAddress: pkpEthAddress,
                        pkpPublicKey: pkpPasskeyData.pubKey as Hex,
                        passkeyData: passkeyDataForStore,
                        pkpTokenId: pkpPasskeyData.pkpTokenId
                    };
                    currentUserPkpProfileStore.set(profile);
                    console.log('[pkpSessionStore] PKP Profile populated in store.');
                    return profile;
                } else {
                    console.error('[pkpSessionStore] Could not derive PKP ETH address from public key.');
                    currentUserPkpProfileStore.set(null);
                    return null;
                }
            } else if (userInfo.data && userInfo.data.pkp_passkey === null) {
                // Explicitly null means no passkey setup for this user
                console.log('[pkpSessionStore] No PKP passkey data found for user in backend.');
                currentUserPkpProfileStore.set(null);
                return null;
            } else {
                // Data present but incomplete or undefined
                console.warn(
                    '[pkpSessionStore] Fetched PKP passkey data is incomplete or missing:',
                    pkpPasskeyData
                );
                currentUserPkpProfileStore.set(null);
                return null;
            }
        } catch (err: unknown) {
            if (err instanceof Error) {
                console.error('[pkpSessionStore] Error fetching PKP profile:', err.message);
            } else {
                console.error('[pkpSessionStore] Error fetching PKP profile (unknown type):', err);
            }
            currentUserPkpProfileStore.set(null);
            loadProfilePromise = null; // Reset here to allow retries on next call to ensurePkpProfileLoaded
            return null;
        }
    })();

    return loadProfilePromise;
}

// Optional: Function to reset the loading state, allowing a fresh fetch.
// Useful for scenarios like user logout/login or explicit refresh action.
export function resetPkpProfileStore() {
    currentUserPkpProfileStore.set(null);
    loadProfilePromise = null;
    console.log('[pkpSessionStore] PKP Profile store reset.');
} 