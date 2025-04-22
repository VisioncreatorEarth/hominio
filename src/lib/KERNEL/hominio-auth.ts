import { createAuthClient } from "better-auth/svelte"
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import type { CapabilityUser } from './hominio-caps';

// Local storage key for user ID and peer ID
const ME_STORAGE_KEY = 'hominio_me';

// Interface for the stored data
interface MeData {
    id: string;
    peer: string;
}

// Function to generate a short random peer ID (alphanumeric)
function generateShortPeerId(length = 10): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(array[i] % chars.length);
    }
    return result;
}

export const authClient = createAuthClient({
    baseURL: "http://localhost:5173",
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 24 * 60 * 60 // 1 day in seconds
        }
    }
})

/**
 * Gets the current effective user ID, considering online/offline status.
 * Manages persistent user ID and a unique peer ID in localStorage.
 * When online, reads from the live session and updates local storage.
 * When offline, reads the last known user ID from local storage.
 * @returns The CapabilityUser object ({ id: string }) or null.
 */
export function getMe(): CapabilityUser | null {
    if (!browser) {
        // Server-side context or environment without browser APIs
        console.warn('[getMe] Called outside browser context. Returning null.');
        return null;
    }

    let storedMeData: MeData | null = null;
    try {
        const storedString = localStorage.getItem(ME_STORAGE_KEY);
        if (storedString) {
            storedMeData = JSON.parse(storedString);
        }
    } catch (e) {
        console.error('[getMe] Error parsing stored MeData:', e);
        // Clear potentially corrupted data
        try { localStorage.removeItem(ME_STORAGE_KEY); } catch { /* ignore */ }
    }

    if (navigator.onLine) {
        // --- ONLINE --- 
        try {
            const sessionStore = authClient.useSession();
            const session = get(sessionStore); // Get current value
            const sessionUser = session.data?.user as CapabilityUser | undefined | null; // User from live session

            if (sessionUser?.id) {
                // --- User is logged in (according to live session) ---
                let currentPeerId = storedMeData?.peer;

                // Generate a new peer ID if:
                // 1. No peer ID was stored
                // 2. The stored user ID doesn't match the current session user ID
                if (!currentPeerId || storedMeData?.id !== sessionUser.id) {
                    currentPeerId = generateShortPeerId();
                    console.log(`[getMe] Generated new peer ID: ${currentPeerId} for user ${sessionUser.id}`);
                }

                // Prepare new data to store
                const newMeData: MeData = { id: sessionUser.id, peer: currentPeerId };

                // Store updated data only if it changed or wasn't there
                if (JSON.stringify(storedMeData) !== JSON.stringify(newMeData)) {
                    try {
                        localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(newMeData));
                    } catch (storageError) {
                        console.error('[getMe] Error saving MeData to localStorage:', storageError);
                        // Continue, but peer ID might not persist
                    }
                }
                return { id: sessionUser.id }; // Return only the user ID part

            } else {
                // --- No user in live session (logged out) ---
                // Clear local storage if it exists
                if (storedMeData) {
                    try { localStorage.removeItem(ME_STORAGE_KEY); } catch { /* ignore */ }
                }
                return null; // Return null as user is not logged in
            }
        } catch (error) {
            // --- Error fetching live session --- 
            console.error('[getMe] Error reading live session:', error);
            // Clear local storage on error to avoid inconsistent state
            try { localStorage.removeItem(ME_STORAGE_KEY); } catch { /* ignore */ }
            return null; // Return null as we couldn't verify the session
        }
    } else {
        // --- OFFLINE --- 
        // Return the user ID from storage if available
        if (storedMeData?.id) {
            return { id: storedMeData.id };
        } else {
            return null; // No user stored offline
        }
    }
}