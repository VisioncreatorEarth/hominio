/**
 * View Registry - Dynamically loads and manages all available view components
 * Provides centralized access to Svelte components for vibes
 */

import type { VibeComponent } from '../types';
import type { SvelteComponent } from 'svelte';

// Define an interface for view metadata
export interface ViewInfo {
    id: string;
    name: string;
    component?: VibeComponent;
}

// Registry of all discovered views
const viewRegistry: Record<string, ViewInfo> = {};

// Cache for loaded components to avoid reloading
const componentCache = new Map<string, VibeComponent>();

/**
 * Dynamically discovers available view components
 * Returns a registry of all available views
 */
export async function discoverViews(): Promise<Record<string, ViewInfo>> {
    // If registry is already populated, return it
    if (Object.keys(viewRegistry).length > 0) {
        return { ...viewRegistry };
    }

    try {
        // Use glob imports to discover all view components
        const viewModules = import.meta.glob('../../components/views/*View.svelte', { eager: false });

        // Extract view IDs from the file paths
        const viewIds = Object.keys(viewModules).map(path => {
            const matches = path.match(/\.\.\/\.\.\/components\/views\/(.+)\.svelte$/);
            return matches ? matches[1] : null;
        }).filter(id => id !== null) as string[];

        console.log('🔍 Discovered views:', viewIds);

        // Create metadata for each view
        for (const viewId of viewIds) {
            viewRegistry[viewId] = {
                id: viewId,
                name: viewId.replace('View', '')
            };
        }

        console.log(`📊 Registered ${Object.keys(viewRegistry).length} views`);
    } catch (error) {
        console.error('❌ Error discovering views:', error);
    }

    return { ...viewRegistry };
}

/**
 * Get all available views metadata
 */
export async function getAllViews(): Promise<ViewInfo[]> {
    // Make sure views are discovered
    await discoverViews();
    return Object.values(viewRegistry);
}

/**
 * Dynamically loads a component by name
 * @param viewName The name of the view to load (e.g., 'TodoView')
 * @returns The loaded component
 */
export async function loadView(viewName: string): Promise<VibeComponent> {
    console.log(`🔎 Attempting to load view: ${viewName}`);

    // Normalize view name (ensure it ends with "View")
    const normalizedName = viewName.endsWith('View') ? viewName : `${viewName}View`;

    // Check if component is already in cache
    if (componentCache.has(normalizedName)) {
        console.log(`📦 Using cached view: ${normalizedName}`);
        return componentCache.get(normalizedName)!;
    }

    // Make sure views are discovered
    await discoverViews();

    try {
        // Import the component module
        const module = await import(`../../components/views/${normalizedName}.svelte`);
        const component = module.default as SvelteComponent;

        // Cache the component
        componentCache.set(normalizedName, component);

        // Update the registry with the loaded component
        if (viewRegistry[normalizedName]) {
            viewRegistry[normalizedName].component = component;
        }

        console.log(`✅ View loaded and cached: ${normalizedName}`);
        return component;
    } catch (error) {
        console.error(`❌ Failed to load view "${normalizedName}":`, error);

        // Try to load HomeView as fallback
        if (normalizedName !== 'HomeView') {
            console.log('⚠️ Falling back to HomeView');
            try {
                return await loadView('HomeView');
            } catch (fallbackError) {
                console.error('❌ Fallback to HomeView failed:', fallbackError);
            }
        }

        throw new Error(`Failed to load view: ${normalizedName}`);
    }
}

/**
 * Check if a view exists
 * @param viewName The name of the view to check
 */
export async function hasView(viewName: string): Promise<boolean> {
    // Normalize view name
    const normalizedName = viewName.endsWith('View') ? viewName : `${viewName}View`;

    // Make sure views are discovered
    await discoverViews();

    return !!viewRegistry[normalizedName];
}

/**
 * Clear the component cache
 */
export function clearViewCache(): void {
    componentCache.clear();
    console.log('🧹 View cache cleared');
} 