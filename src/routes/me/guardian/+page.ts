import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
    // Ensure parent layout load runs
    await parent();

    return {
        title: 'Guardian EAO',
        description: 'Manage the admin guardian eoa'
    };
}; 