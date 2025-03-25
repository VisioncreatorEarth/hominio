/**
 * Tool Loader - Dynamically loads tools and their implementations
 */
import type { ToolDefinition } from '../types';
import { toolRegistry } from '$lib/services/todoActions';

// Common types for Ultravox tool functions
type ToolParameters = Record<string, unknown>;
type ToolResponse = Record<string, unknown> | string;
type ToolImplementation = (params: ToolParameters) => ToolResponse | Promise<ToolResponse>;

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
                console.log(`✅ Loaded implementation for tool: ${toolName}`);
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
 * Register tools with the Ultravox session
 * @param tools Array of loaded tool definitions
 */
export function registerTools(tools: ToolDefinition[]): void {
    if (typeof window === 'undefined' || !window.__ULTRAVOX_SESSION) {
        console.warn('⚠️ No Ultravox session available to register tools');
        return;
    }

    const session = window.__ULTRAVOX_SESSION;
    const registeredTools: string[] = [];

    // Register each tool with the session
    for (const tool of tools) {
        if (tool.implementation) {
            try {
                if (session.registerToolImplementation) {
                    // Type cast the implementation to match what Ultravox expects
                    const implementationFn = (params: unknown) => tool.implementation?.(params as ToolParameters);
                    session.registerToolImplementation(tool.name, implementationFn);
                    registeredTools.push(tool.name);
                    console.log(`✅ Registered tool with Ultravox session: ${tool.name}`);
                } else {
                    console.warn(`⚠️ registerToolImplementation not available for tool "${tool.name}"`);
                }
            } catch (error) {
                console.error(`❌ Failed to register tool "${tool.name}":`, error);
            }
        } else {
            console.warn(`⚠️ No implementation for tool "${tool.name}"`);
        }
    }

    console.log('📋 Registered tools:', registeredTools.join(', '));
}

/**
 * Register tools using the centralized tool registry
 * This ensures all our tools are properly registered with the Ultravox session
 */
export function registerToolsFromRegistry(): void {
    if (typeof window === 'undefined') {
        console.warn('⚠️ No window object available');
        return;
    }

    console.log('🧩 Registering Hominio tools with Ultravox...');

    // Check if Ultravox exists
    if (!window.__ULTRAVOX_SESSION) {
        console.warn('⚠️ Ultravox session not found yet, will retry in 2 seconds');
        // Try again in 2 seconds
        setTimeout(registerToolsFromRegistry, 2000);
        return;
    }

    const toolNames = Object.keys(toolRegistry);
    console.log(`Found ${toolNames.length} tools in registry: ${toolNames.join(', ')}`);

    // Make each tool available via window.__hominio_tools
    // This is crucial for backward compatibility with Ultravox
    if (typeof window !== 'undefined') {
        (window as any).__hominio_tools = toolRegistry;
        console.log('🔗 Exposed tools via window.__hominio_tools');
    }

    // Directly register tools with Ultravox session
    const session = window.__ULTRAVOX_SESSION;
    for (const [toolName, implementation] of Object.entries(toolRegistry)) {
        try {
            // For all tools, register them using the standard API
            if (session.registerTool) {
                session.registerTool(toolName, async (params: unknown) => {
                    console.log(`Running tool: ${toolName}`, params);
                    // Type cast params to what our implementation expects
                    const result = implementation(params as ToolParameters);

                    if (typeof result === 'string') {
                        try {
                            return JSON.parse(result);
                        } catch {
                            return { success: false, message: "Failed to parse tool result" };
                        }
                    }

                    return result;
                });
                console.log(`✅ Registered tool with Ultravox: ${toolName}`);
            } else {
                console.warn(`❌ Cannot register tool ${toolName}: registerTool method not available`);
            }
        } catch (error) {
            console.error(`❌ Failed to register tool "${toolName}":`, error);
        }
    }

    console.log('🎉 All Hominio tools registered successfully with Ultravox!');
}

/**
 * Clear the tool cache
 */
export function clearToolCache(): void {
    toolCache.clear();
} 