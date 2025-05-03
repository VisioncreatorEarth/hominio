import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
    // Ensure parent layout load runs
    await parent();

    return {
        title: 'HQL Query Explorer',
        description: 'Explore and query your Hominio data using HQL.'
    };
}; 