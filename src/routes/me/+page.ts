import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
    // Ensure parent layout load runs
    await parent();

    return {
        title: 'My Hominio',
        description: 'Your main dashboard.' // Add description
    };
}; 