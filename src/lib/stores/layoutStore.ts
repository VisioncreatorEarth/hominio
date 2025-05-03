import { writable } from 'svelte/store';

interface PageMetadata {
    title: string;
    description: string;
}

export const pageMetadataStore = writable<PageMetadata>({ title: 'My Hominio', description: '' }); 