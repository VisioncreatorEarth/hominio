import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
    return {
        title: 'Document Explorer',
        description: 'Browse and explore documents in the homin.io ecosystem'
    };
}; 