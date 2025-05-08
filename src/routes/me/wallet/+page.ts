import type { PageLoad } from './$types';

export const load: PageLoad = () => {
    return {
        title: 'PKP Wallet',
        description: 'Sign messages, execute Lit Actions, and manage your profile with your PKP.'
    };
}; 