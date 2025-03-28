import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/auth/auth';

export const load = async ({ request }) => {
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    // If user is authenticated, redirect to /me
    if (session) {
        throw redirect(303, '/me');
    }

    // Otherwise, allow access to the home page
    return {
        session
    };
}; 