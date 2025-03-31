import { redirect } from '@sveltejs/kit';
import { getAuthClient } from '$lib/auth/auth';
import { building } from '$app/environment'; // Import building flag

export const load = async ({ request }) => {
    let session = null;

    // Only get session if not building/prerendering
    if (!building) {
        try {
            const auth = getAuthClient();
            session = await auth.api.getSession({
                headers: request.headers,
            });
        } catch (error) {
            console.error("Error getting session in root page load:", error);
            // Proceed without session if auth fails
        }
    }

    // If user is authenticated, redirect to /me
    // This check should still happen, but relies on the session fetched above (or null)
    if (session) {
        throw redirect(303, '/me');
    }

    // Otherwise, allow access to the home page
    // Return null session if building or if auth failed
    return {
        session
    };
}; 