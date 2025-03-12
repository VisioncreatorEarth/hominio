/**
 * A Vite plugin that provides shims for @tauri-apps/api imports during development
 * 
 * This helps prevent errors when developing in browser mode where Tauri APIs are not available.
 * The shims return appropriate fallback values depending on the API.
 */

import type { Plugin } from 'vite';

export default function tauriShimPlugin(): Plugin {
    // Pattern to match Tauri API imports
    const tauriPattern = /^@tauri-apps\/api\/([^/]+)$/;

    return {
        name: 'vite-plugin-tauri-shim',
        resolveId(id) {
            // Check if this is a Tauri API import
            const match = id.match(tauriPattern);
            if (match) {
                // Return a special virtual module ID that we'll handle in load()
                return `virtual:tauri-shim/${match[1]}`;
            }
            return null;
        },
        load(id) {
            // Handle our virtual module IDs
            if (id.startsWith('virtual:tauri-shim/')) {
                const module = id.substring('virtual:tauri-shim/'.length);

                // Generate appropriate shim based on the module
                switch (module) {
                    case 'fs':
                        return `
              export const exists = async () => false;
              export const createDir = async () => {};
              export const readTextFile = async () => '';
              export const writeTextFile = async () => {};
              export const readDir = async () => [];
              export const removeFile = async () => {};
              export const removeDir = async () => {};
            `;
                    case 'path':
                        return `
              export const appDataDir = async () => '/';
              export const appDir = async () => '/';
              export const homeDir = async () => '/';
              export const join = (...paths) => paths.join('/');
              export const resolve = (path) => path;
            `;
                    case 'dialog':
                        return `
              export const open = async () => null;
              export const save = async () => null;
            `;
                    case 'core':
                        return `
              export const invoke = async () => null;
            `;
                    default:
                        // Generic shim for unknown modules
                        return 'export default {};';
                }
            }
            return null;
        }
    };
} 