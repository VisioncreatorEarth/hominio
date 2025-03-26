/**
 * Tool Loader - Dynamically loads tools and their implementations
 */
import type { ToolDefinition } from '../types';
import { toolRegistry } from '$lib/services/todoActions';

// Common types for Ultravox tool functions
type ToolParams = Record<string, unknown>;
type ToolImplementation = (params: ToolParams) => Promise<unknown> | unknown;

// Define Ultravox session interface
interface UltravoxSession {
    registerTool: (name: string, impl: ToolImplementation) => void;
}

// Declare global window interface
declare global {
    interface Window {
        __ULTRAVOX_SESSION?: UltravoxSession;
        __hominio_tools?: Record<string, ToolImplementation>;
    }
}

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
 * Ensure tools are available globally for Ultravox
 */
function exposeToolsGlobally(): void {
    if (typeof window === 'undefined') return;

    // Create tools object with implementations
    const tools = Object.entries(toolRegistry).reduce((acc, [name, implementation]) => {
        acc[name] = implementation;
        return acc;
    }, {} as Record<string, ToolImplementation>);

    // Define the tools property
    Object.defineProperty(window, '__hominio_tools', {
        value: tools,
        writable: true,
        enumerable: true,
        configurable: true
    });

    console.log('🔗 Tools exposed globally:', Object.keys(tools).join(', '));
}

/**
 * Register tools with the Ultravox session
 */
function registerToolsWithUltravox(session: { registerTool: (name: string, impl: ToolImplementation) => void }): void {
    const registeredTools: string[] = [];

    for (const [toolName, implementation] of Object.entries(toolRegistry)) {
        try {
            // Register the tool with proper error handling
            session.registerTool(toolName, async (params: ToolParams) => {
                try {
                    console.log(`🔧 Running tool: ${toolName}`, params);
                    const result = await Promise.resolve(implementation(params));

                    // Handle string results (usually JSON)
                    if (typeof result === 'string') {
                        try {
                            return JSON.parse(result);
                        } catch {
                            return {
                                success: false,
                                message: `Failed to parse result from ${toolName}`
                            };
                        }
                    }

                    return result;
                } catch (error) {
                    console.error(`❌ Error executing ${toolName}:`, error);
                    return {
                        success: false,
                        message: `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            });
            registeredTools.push(toolName);
            console.log(`✅ Registered tool with Ultravox: ${toolName}`);
        } catch (error) {
            console.error(`❌ Failed to register tool "${toolName}":`, error);
        }
    }

    if (registeredTools.length > 0) {
        console.log('📋 Registered tools:', registeredTools.join(', '));
    }
}

/**
 * Register tools with the Ultravox session
 * @param tools Array of loaded tool definitions
 */
export function registerTools(tools: ToolDefinition[]): void {
    if (typeof window === 'undefined' || !window.__ULTRAVOX_SESSION?.registerTool) {
        console.warn('⚠️ No Ultravox session available to register tools');
        return;
    }

    const session = window.__ULTRAVOX_SESSION;
    const registeredTools: string[] = [];

    // Register each tool with the session
    for (const tool of tools) {
        if (tool.implementation) {
            try {
                // Wrap the implementation to ensure it returns a Promise
                const wrappedImpl = async (params: ToolParams) => {
                    const result = await Promise.resolve(tool.implementation!(params));
                    return result;
                };
                session.registerTool(tool.name, wrappedImpl);
                registeredTools.push(tool.name);
                console.log(`✅ Registered tool with Ultravox session: ${tool.name}`);
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

    // First expose tools globally
    exposeToolsGlobally();

    // Function to attempt registration
    const attemptRegistration = () => {
        const session = window.__ULTRAVOX_SESSION;
        if (session?.registerTool) {
            console.log('🧩 Found Ultravox session, registering tools...');
            registerToolsWithUltravox(session);
            console.log('🎉 Tool registration complete');
            return true;
        }
        console.log('⏳ Waiting for Ultravox session...');
        return false;
    };

    // Try registration immediately
    if (!attemptRegistration()) {
        // If failed, retry every second for up to 10 seconds
        let attempts = 0;
        const maxAttempts = 10;

        const retryInterval = setInterval(() => {
            attempts++;
            if (attemptRegistration() || attempts >= maxAttempts) {
                clearInterval(retryInterval);
                if (attempts >= maxAttempts) {
                    console.warn('⚠️ Failed to register tools after maximum attempts');
                }
            }
        }, 1000);
    }
}

/**
 * Clear the tool cache
 */
export function clearToolCache(): void {
    toolCache.clear();
} 