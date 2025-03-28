// This file is needed for the /hominio route to work properly
// We're turning off SSR since we're using client-side features
export const ssr = false;

export function load() {
    return {
        // Any data to be loaded server-side would go here
    };
} 