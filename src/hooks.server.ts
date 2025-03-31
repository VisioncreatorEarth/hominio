import { getAuthClient } from "$lib/auth/auth";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from '$app/environment'; // Import building flag

export async function handle({ event, resolve }) {
    // IMPORTANT: Only run auth handler during runtime, not during build/prerender
    if (!building) {
        const auth = getAuthClient();
        // Use try-catch as a safety net in case getAuthClient throws due to missing env vars
        try {
            return svelteKitHandler({ event, resolve, auth });
        } catch (error) {
            console.error("Error initializing/using auth handler in hooks:", error);
            // Fallback to default resolve if auth fails
            return resolve(event);
        }
    }

    // During build/prerender, just resolve the request without auth
    return resolve(event);
}