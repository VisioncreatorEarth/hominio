/**
 * View Loader - Dynamically loads UI components for vibes
 */
import type { VibeComponent } from '../types';

// Cache for loaded components to avoid reloading
const componentCache = new Map<string, VibeComponent>();

/**
 * Dynamically loads a component from the components directory
 * @param componentName The name of the component to load
 * @returns The loaded component
 */
export async function loadVibeComponent(componentName: string): Promise<VibeComponent> {
    console.log(`🔎 Attempting to load component: ${componentName}`);

    // Check if component is already in cache
    if (componentCache.has(componentName)) {
        console.log(`🔄 Using cached component: ${componentName}`);
        return componentCache.get(componentName)!;
    }

    // Force different components based on name
    const actualComponent = componentName;

    try {
        // Try to dynamically import the component using $lib path
        console.log(`🔍 Loading component: ${actualComponent}`);

        // Use different import paths based on the component name
        let component: VibeComponent;

        if (actualComponent === 'CounterView') {
            // Use dynamic import and get the default export
            const module = await import('$lib/components/CounterView.svelte');
            component = module.default as VibeComponent;
            console.log('📦 Loaded CounterView specifically');
        } else {
            // Default to TodoView
            const module = await import('$lib/components/TodoView.svelte');
            component = module.default as VibeComponent;
            console.log('📦 Loaded TodoView');
        }

        // Cache the component for future use
        componentCache.set(actualComponent, component);
        console.log(`✅ Component loaded and cached: ${actualComponent}`);

        return component;
    } catch (error) {
        console.error(`❌ Failed to load component "${actualComponent}":`, error);

        // If CounterView fails, try loading TodoView as fallback
        if (actualComponent === 'CounterView') {
            console.log('⚠️ Falling back to TodoView component');
            try {
                const fallbackModule = await import('$lib/components/TodoView.svelte');
                const fallbackComponent = fallbackModule.default as VibeComponent;

                // Cache the fallback component
                componentCache.set('TodoView', fallbackComponent);
                return fallbackComponent;
            } catch (fallbackError) {
                console.error('❌ Fallback also failed:', fallbackError);
            }
        }

        throw new Error(`Failed to load component: ${actualComponent}`);
    }
}

/**
 * Clears the component cache
 */
export function clearComponentCache(): void {
    componentCache.clear();
    console.log('🧹 Component cache cleared');
} 