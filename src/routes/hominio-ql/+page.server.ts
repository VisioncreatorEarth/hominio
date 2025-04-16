import { redirect } from '@sveltejs/kit';
import { getAuthClient } from '$lib/auth/auth';
import { building } from '$app/environment';

export const load = async ({ request }) => {
    let session = null;

    // Only check session if not building/prerendering
    if (!building) {
        try {
            const auth = getAuthClient();
            session = await auth.api.getSession({
                headers: request.headers,
            });
        } catch (error) {
            console.error("Error getting session in /hominio-ql page load:", error);
            // Redirect to home if auth check fails during runtime
            throw redirect(303, '/');
        }
    }

    // If user is not authenticated (or if building and session is null), redirect
    if (!session) {
        // Redirect to login or home page
        throw redirect(303, '/');
    }

    // User is authenticated, allow page load.
    // We can return the session if needed by the page, but for now just return empty object
    // as the client-side store handles the user object.
    return {
        // session // Optionally pass session data
    };
}; 