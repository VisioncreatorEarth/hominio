// This file configures behavior for the root layout

// Disable Server-Side Rendering for the entire application
// Necessary for Tauri builds as they are client-side only
export const ssr = false;

// Disable prerendering temporarily to see if it resolves the initialization error
// This forces a purely client-side approach
export const prerender = false;