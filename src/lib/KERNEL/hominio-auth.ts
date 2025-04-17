import { createAuthClient } from "better-auth/svelte"
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import type { CapabilityUser } from './hominio-caps';

// Local storage key
const LAST_USER_ID_KEY = 'hominio_last_user_id';

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
 * Gets the current effective user, considering online/offline status.
 * When online, reads from the live session and updates local storage.
 * When offline, reads the last known user ID from local storage.
 * @returns The CapabilityUser object or null.
 */
export function getCurrentEffectiveUser(): CapabilityUser | null {
    if (!browser) {
        // Server-side context or environment without browser APIs, cannot determine effectively
        console.warn('[getCurrentEffectiveUser] Called outside browser context. Returning null.');
        return null;
    }

    if (navigator.onLine) {
        // Online: Use live session data and update local storage
        try {
            const sessionStore = authClient.useSession();
            const session = get(sessionStore); // Get current value
            const user = session.data?.user as CapabilityUser | null; // Adjust cast if needed

            if (user?.id) {
                localStorage.setItem(LAST_USER_ID_KEY, user.id);
            } else {
                // No user in session, clear local storage too
                localStorage.removeItem(LAST_USER_ID_KEY);
            }
            return user;
        } catch (error) {
            console.error('[getCurrentEffectiveUser] Error reading live session:', error);
            // Fallback: Try reading from local storage even if online fetch failed?
            // Or just return null? Returning null seems safer.
            localStorage.removeItem(LAST_USER_ID_KEY); // Clear storage on error
            return null;
        }
    } else {
        // Offline: Read from local storage
        const storedUserId = localStorage.getItem(LAST_USER_ID_KEY);
        if (storedUserId) {
            return { id: storedUserId }; // Return minimal user object
        } else {
            return null; // No user stored offline
        }
    }
}