import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Use adapter-static with fallback for SPA mode
		adapter: adapter({
			// Revert to app.html as fallback, as index.html caused build issues
			fallback: 'app.html',
			// Don't use strict mode to allow dynamic routes
			strict: false
		}),
		// Add alias configuration
		alias: {
			$db: './src/db'
		}
	}
};

export default config;
