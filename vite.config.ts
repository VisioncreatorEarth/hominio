import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		wasm(),
		topLevelAwait()
	],
	optimizeDeps: {
		exclude: ['loro-crdt', '@electric-sql/pglite']
	},
	build: {
		// Make sure Rollup correctly handles WASM files for PGlite
		rollupOptions: {
			output: {
				manualChunks: {
					pglite: ['@electric-sql/pglite']
				}
			}
		}
	},
	// Properly handle WASM files for PGlite
	assetsInclude: ['**/*.wasm', '**/*.data']
});
