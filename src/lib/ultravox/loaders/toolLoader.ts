/**
 * Tool Loader - Dynamically loads tools and their implementations
 */
import type { ToolDefinition } from '../types';
import { loadAllTools, setupToolsForUltravox } from '../registries/toolRegistry';

// Common types for Ultravox tool functions
// Note: Using imported types from types.ts

// Declare global window interface
// Note: Now defined in types.ts

/**
 * In-memory cache for tool definitions to avoid reloading
 */
const toolCache = new Map<string, ToolDefinition>();

/**
 * Loads a tool from its manifest
 * @param toolName The name of the tool to load
 * @returns The tool definition with its implementation
 */
export async function loadTool(toolName: string): Promise<ToolDefinition> {
    // First check if we have it in cache
    if (toolCache.has(toolName)) {
        return toolCache.get(toolName)!;
    }

    try {
        // Load the manifest
        const manifest = await import(`../../tools/${toolName}/manifest.json`);

        // Create the tool definition
        const toolDefinition: ToolDefinition = {
            ...manifest,
            implementation: undefined  // Will be loaded separately
        };

        // Dynamically import the implementation
        try {
            const module = await import(`../../tools/${toolName}/function.ts`);
            const implementationName = `${toolName}Implementation`;

            // Get the implementation function from the module
            if (typeof module[implementationName] === 'function') {
                toolDefinition.implementation = module[implementationName];
            } else {
                console.error(`❌ Tool implementation "${implementationName}" not found in module`);
            }
        } catch (error) {
            console.error(`❌ Failed to load implementation for tool "${toolName}":`, error);
        }

        // Cache the tool definition
        toolCache.set(toolName, toolDefinition);

        return toolDefinition;
    } catch (error) {
        console.error(`❌ Failed to load tool "${toolName}":`, error);
        throw new Error(`Failed to load tool "${toolName}": ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Ensure tools are available globally for Ultravox
 * This now uses the centralized registry
 */
export function prepareToolRegistry(): void {
    // Delegate to the centralized registry
    loadAllTools().catch(error => {
        console.error('Failed to load tools:', error);
    });
}

/**
 * Setup event listeners for tool registration
 * This delegates to the centralized registry
 */
export function setupToolRegistrationListeners(): void {
    if (typeof window === 'undefined' || window.__hominio_tools_registered) return;

    // Use the centralized setup function
    setupToolsForUltravox().catch(error => {
        console.error('Failed to set up tools for Ultravox:', error);
    });
}

/**
 * Clear the tool cache
 */
export function clearToolCache(): void {
    toolCache.clear();
} 