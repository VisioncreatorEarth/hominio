import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import tauriShimPlugin from "./src/lib/utils/vite-plugin-tauri-shim";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		wasm(),
		topLevelAwait(),
		tauriShimPlugin()
	],
	resolve: {
		// Handle Tauri API as external module to avoid dev-time errors
		conditions: ['browser']
	},
	optimizeDeps: {
		exclude: ['loro-crdt', '@electric-sql/pglite', '@tauri-apps/api']
	},
	build: {
		// Make sure Rollup correctly handles WASM files for PGlite
		rollupOptions: {
			output: {
				manualChunks: {
					pglite: ['@electric-sql/pglite']
				}
			},
			// Mark Tauri imports as external during build
			external: [
				'@tauri-apps/api',
				'@tauri-apps/api/path',
				'@tauri-apps/api/fs',
				'@tauri-apps/api/core'
			]
		}
	},
	// Properly handle WASM files for PGlite
	assetsInclude: ['**/*.wasm', '**/*.data']
});
