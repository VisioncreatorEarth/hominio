import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/auth/auth';

export const load = async ({ request }) => {
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    // If user is not authenticated, redirect to home
    if (!session) {
        throw redirect(303, '/');
    }

    // Return the session data for the page
    return {
        session
    };
}; 