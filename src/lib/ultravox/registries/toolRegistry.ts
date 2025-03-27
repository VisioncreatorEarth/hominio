/**
 * Tool Registry - Dynamically loads and manages all available tools
 * Provides centralized access to tool implementations for the application
 */

import type { ToolImplementation, ToolParameters, ToolResponse, ClientToolReturnType } from '../types';

// Define an interface for tool metadata
export interface ToolInfo {
    id: string;
    name: string;
    skill: string;
    icon: string;
    color: string;
    implementation?: ToolImplementation;
}

// Interface for tool manifest structure
interface ToolManifest {
    name: string;
    skill: string;
    icon: string;
    color: string;
    temporaryTool: unknown;
    implementationType: string;
}

// Default icon and color for fallback
const DEFAULT_ICON = 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
const DEFAULT_COLOR = 'amber';

// Registry of all loaded tools and their implementations
const toolRegistry: Record<string, ToolImplementation> = {};
const toolsMetadata: Record<string, ToolInfo> = {};

/**
 * Dynamically discovers and loads all tools from the tools directory
 * Returns a registry of all available tools
 */
export async function loadAllTools(): Promise<Record<string, ToolImplementation>> {
    const toolModules = import.meta.glob('../../tools/*/function.ts', { eager: false });
    const toolManifests = import.meta.glob<ToolManifest>('../../tools/*/manifest.json', { eager: true });

    // Create a map of tool IDs based on directory names
    const toolIds = Object.keys(toolModules).map(path => {
        const matches = path.match(/\.\.\/\.\.\/tools\/(.+)\/function\.ts/);
        return matches ? matches[1] : null;
    }).filter(id => id !== null) as string[];

    console.log('📋 Discovered tools:', toolIds);

    // Load each tool's implementation and metadata
    await Promise.all(
        toolIds.map(async (toolId) => {
            try {
                // Load the implementation
                const module = await import(`../../tools/${toolId}/function.ts`);
                const implementationName = `${toolId}Implementation`;

                if (typeof module[implementationName] === 'function') {
                    // The implementation function name pattern is {toolId}Implementation
                    toolRegistry[toolId] = module[implementationName];

                    // Get the manifest data (already loaded eagerly)
                    const manifestPath = `../../tools/${toolId}/manifest.json`;
                    const manifest = toolManifests[manifestPath];

                    // Store metadata
                    toolsMetadata[toolId] = {
                        id: toolId,
                        name: manifest?.name || toolId,
                        skill: manifest?.skill || `Use ${toolId}`,
                        icon: manifest?.icon || DEFAULT_ICON,
                        color: manifest?.color || DEFAULT_COLOR,
                        implementation: module[implementationName]
                    };

                    console.log(`✅ Loaded tool: ${toolId}`);
                } else {
                    console.error(`❌ Tool implementation ${implementationName} not found in module`);
                }
            } catch (error) {
                console.error(`❌ Failed to load tool ${toolId}:`, error);
            }
        })
    );

    console.log(`📊 Loaded ${Object.keys(toolRegistry).length} tools`);
    return { ...toolRegistry };
}

/**
 * Gets all tool metadata (names, descriptions, icons, etc.)
 */
export async function getAllToolsMetadata(): Promise<ToolInfo[]> {
    // If tools aren't loaded yet, load them
    if (Object.keys(toolsMetadata).length === 0) {
        await loadAllTools();
    }

    return Object.values(toolsMetadata);
}

/**
 * Get a specific tool's metadata by ID
 */
export function getToolMetadata(toolId: string): ToolInfo | null {
    return toolsMetadata[toolId] || null;
}

/**
 * Expose a method to call a tool by ID with parameters
 */
export function callTool(toolId: string, params: ToolParameters): Promise<ToolResponse> {
    if (!toolRegistry[toolId]) {
        return Promise.reject(new Error(`Tool ${toolId} not found`));
    }

    try {
        return Promise.resolve(toolRegistry[toolId](params) as Promise<ToolResponse>);
    } catch (error) {
        return Promise.reject(error);
    }
}

/**
 * Get the raw tool implementation registry
 */
export function getToolRegistry(): Record<string, ToolImplementation> {
    return { ...toolRegistry };
}

/**
 * Register all tools with the Ultravox session
 * This attempts to register tools with the global Ultravox session
 */
export function registerToolsWithUltravox(): void {
    if (typeof window === 'undefined' || !window.__ULTRAVOX_SESSION) {
        console.warn('⚠️ Cannot register tools - Ultravox session not available');
        return;
    }

    const session = window.__ULTRAVOX_SESSION;
    const registeredTools: string[] = [];

    // Register each tool with the session
    for (const [toolName, implementation] of Object.entries(toolRegistry)) {
        try {
            // Cast to the expected type for Ultravox client
            const typedImplementation = implementation as (params: unknown) => ClientToolReturnType | Promise<ClientToolReturnType>;
            session.registerToolImplementation(toolName, typedImplementation);
            registeredTools.push(toolName);
            console.log(`✅ Registered tool with Ultravox: ${toolName}`);
        } catch (error) {
            console.error(`❌ Failed to register tool "${toolName}":`, error);
        }
    }

    console.log('📋 Tool registration complete, registered tools:', registeredTools.join(', '));

    // Mark as registered
    if (typeof window !== 'undefined') {
        window.__hominio_tools_registered = true;
    }
}

/**
 * Setup tools for use with Ultravox
 * This prepares the global registry and sets up event listeners
 */
export async function setupToolsForUltravox(): Promise<void> {
    if (typeof window === 'undefined') return;

    // Load all tools
    await loadAllTools();

    // Create or update the tools registry
    window.__hominio_tools = { ...toolRegistry };
    console.log('🔗 Tool registry prepared with tools:', Object.keys(window.__hominio_tools).join(', '));

    // Set up listener for Ultravox readiness
    window.addEventListener('ultravox-ready', () => {
        console.log('🔄 Ultravox ready event received, registering tools');
        registerToolsWithUltravox();
    });

    // Also set up a listener for when Ultravox client is created
    window.addEventListener('ultravox-client-ready', () => {
        console.log('🔄 Ultravox client is ready, dispatching ultravox-ready event');
        const event = new Event('ultravox-ready');
        window.dispatchEvent(event);
    });

    console.log('🎧 Tool registration listeners setup completed');
} 