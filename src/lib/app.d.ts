/// <reference types="@sveltejs/kit" />

// Import the docs initialization function
import { initDocs } from './docs';

// Initialize docs system during app startup
initDocs().catch(error => {
    console.error('Failed to initialize docs system:', error);
});

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        // interface Platform {}
    }
}

export { }; 