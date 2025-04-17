import { building } from '$app/environment';
import { getAuthClient } from '$lib/auth/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => {
    let session = null;

    // Only attempt to get session if not building/prerendering
    // Avoids errors during build process where auth context might not be available
    if (!building) {
        try {
            const auth = getAuthClient(); // Assuming this works server-side
            // Use getSession which works based on cookies/headers server-side
            session = await auth.api.getSession({
                headers: request.headers,
            });
        } catch (error) {
            console.error("Error getting session in root layout load:", error);
            // Do not redirect here, just return null session
            session = null;
        }
    }

    // Return the session (or null) to be available in all layouts/pages
    return {
        session
    };
}; 