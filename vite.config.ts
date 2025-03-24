import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import tauriShimPlugin from "./src/lib/utils/vite-plugin-tauri-shim";
import pgliteAssetsPlugin from "./src/lib/utils/vite-plugin-pglite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		wasm(),
		topLevelAwait(),
		tauriShimPlugin(),
		pgliteAssetsPlugin()
	],
	resolve: {
		// Handle Tauri API as external module to avoid dev-time errors
		conditions: ['browser']
	},
	server: {
		host: '0.0.0.0',  // Listen on all network interfaces
		port: 5173,       // Same port as in package.json
		strictPort: true, // Fail if port is already in use
		// Enable HTTPS for iOS if needed (comment out if not using HTTPS)
		// https: true,
		watch: {
			ignored: [
				'**/node_modules/**',
				'**/.git/**'
			]
		}
	},
	optimizeDeps: {
		exclude: ['loro-crdt', '@electric-sql/pglite', '@tauri-apps/api']
	},
	build: {
		// Make sure Rollup correctly handles WASM files for PGlite
		rollupOptions: {
			// Mark Tauri imports as external during build
			external: [
				'@tauri-apps/api',
				'@tauri-apps/api/path',
				'@tauri-apps/api/fs',
				'@tauri-apps/api/core'
			]
		},
		// Ensure assets are copied
		copyPublicDir: true
	},
	// Properly handle WASM files for PGlite
	assetsInclude: ['**/*.wasm', '**/*.data'],
	// Configure public directory for static assets
	publicDir: 'static'
});
