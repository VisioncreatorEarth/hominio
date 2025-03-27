/**
 * View Loader - Dynamically loads UI components for vibes
 * This is now a thin adapter to the centralized view registry
 */
import type { VibeComponent } from '../types';
import { loadView, clearViewCache as clearRegistryCache } from '../registries/viewRegistry';

/**
 * Dynamically loads a component from the components directory
 * Now uses the centralized view registry
 * @param componentName The name of the component to load
 * @returns The loaded component
 */
export async function loadVibeComponent(componentName: string): Promise<VibeComponent> {
    console.log(`🔎 Calling loadVibeComponent for: ${componentName}`);

    try {
        // Use the centralized registry to load the component
        return await loadView(componentName);
    } catch (error) {
        console.error(`❌ Error in loadVibeComponent for "${componentName}":`, error);
        throw new Error(`Failed to load component: ${componentName}`);
    }
}

/**
 * Clears the component cache
 */
export function clearComponentCache(): void {
    // Delegate to the registry's cache clearing function
    clearRegistryCache();
} 