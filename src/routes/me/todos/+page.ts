import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
    // Ensure parent layout load runs
    await parent();

    return {
        title: 'Todos',
        description: 'Manage your tasks.'
    };
}; 