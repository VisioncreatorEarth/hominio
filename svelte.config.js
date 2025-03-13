import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Use adapter-static with a fallback page for SPAs
		adapter: adapter({
			// Configure fallback for client-side routing
			fallback: 'index.html',
			// Don't use strict mode to allow dynamic routes
			strict: false
		})
	}
};

export default config;
