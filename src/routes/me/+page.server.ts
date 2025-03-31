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
            console.error("Error getting session in /me page load:", error);
            // Fallback: Redirect to home if auth fails during runtime
            throw redirect(303, '/');
        }
    }

    // If user is not authenticated (or if building), redirect to home
    if (!session) {
        throw redirect(303, '/');
    }

    // Return the session data for the page
    return {
        session
    };
}; 