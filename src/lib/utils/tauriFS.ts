/**
 * Tauri filesystem utilities that work in both Tauri and browser environments
 * 
 * This module uses dynamic imports and runtime checks to ensure it doesn't
 * break in browser environments while still providing native filesystem
 * access in Tauri desktop environments.
 */

/**
 * Helper function to check if running in Tauri
 */
export function isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Get app data directory path
 * Returns '/' in browser environments
 */
export async function getAppDataDir(): Promise<string> {
    if (!isTauri()) return '/';

    try {
        // Dynamically import Tauri API only when needed and in Tauri environment
        const { appDataDir } = await import('@tauri-apps/api/path');
        return await appDataDir();
    } catch (err) {
        console.error('Failed to get app data directory:', err);
        return '/';
    }
}

/**
 * Check if a path exists in the filesystem
 * Always returns false in browser environments
 */
export async function exists(path: string): Promise<boolean> {
    if (!isTauri()) return false;

    try {
        const fs = await import('@tauri-apps/api/fs');
        return await fs.exists(path);
    } catch (err) {
        console.error('Failed to check if path exists:', err);
        return false;
    }
}

/**
 * Create a directory on the filesystem
 * No-op in browser environments
 */
export async function createDir(path: string, options?: { recursive: boolean }): Promise<void> {
    if (!isTauri()) return;

    try {
        const fs = await import('@tauri-apps/api/fs');
        await fs.createDir(path, options);
    } catch (err) {
        console.error('Failed to create directory:', err);
    }
} 