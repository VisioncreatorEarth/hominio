import type { PageLoad } from './$types';

export const load: PageLoad = () => {
    return {
        title: 'PKP Settings',
        description: 'Configure Passkey, EIP-1271 Signer, PKP, auth methods, and capacity credits.'
    };
}; 