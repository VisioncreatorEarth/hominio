import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent }) => {
    // Get data from parent layout (which should have loaded session via locals)
    const parentData = await parent();

    // Return the session data obtained from the parent
    // The redirect logic based on session presence is now handled reactively in +layout.svelte
    return {
        session: parentData.session
    };
};