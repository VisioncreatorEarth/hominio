import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from "vite-plugin-wasm";
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		wasm(),
		nodePolyfills({
			include: ['buffer', 'process', 'util']
		}),
	],
	resolve: {
		// Handle Tauri API as external module to avoid dev-time errors
		conditions: ['browser']
	},
	define: {
		'process.env': {},
		global: 'globalThis',
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
		exclude: ['loro-crdt'],
		esbuildOptions: {
			define: {
				global: 'globalThis',
			},
		},
	},
	build: {
		// Ensure assets are copied
		copyPublicDir: true,
		// Make it compatible with Tauri
		target: 'esnext',
		// Smaller chunks for better loading
		chunkSizeWarningLimit: 1000
	},
	// Properly handle WASM files
	assetsInclude: ['**/*.wasm', '**/*.data'],
	// Configure public directory for static assets
	publicDir: 'static'
});
