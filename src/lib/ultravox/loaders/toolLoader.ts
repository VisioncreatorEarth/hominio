/**
 * Tool Loader - Dynamically loads tools and their implementations
 */
import type { ToolDefinition } from '../types';
import { toolRegistry } from '$lib/ultravox/todoActions';

// Common types for Ultravox tool functions
type ToolParams = Record<string, unknown>;
type ToolImplementation = (params: ToolParams) => Promise<unknown> | unknown;

// Define Ultravox session interface
interface UltravoxSession {
    registerToolImplementation: (name: string, impl: ToolImplementation) => void;
}

// Declare global window interface
declare global {
    interface Window {
        __ULTRAVOX_SESSION?: UltravoxSession;
        __hominio_tools?: Record<string, ToolImplementation>;
        __hominio_tools_registered?: boolean;
    }
}

/**
 * In-memory cache for tool definitions to avoid reloading
 */
const toolCache = new Map<string, ToolDefinition>();

/**
 * Registry of all loaded tools and their implementations
 * This is the single source of truth for tools
 */
const globalToolRegistry: Record<string, ToolImplementation> = {};

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

                // Store implementation in our global registry
                globalToolRegistry[toolName] = module[implementationName];
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
 * This prepares the global tool registry but doesn't register with Ultravox yet
 */
export function prepareToolRegistry(): void {
    if (typeof window === 'undefined') return;

    // Create or update the tools registry
    if (!window.__hominio_tools) {
        window.__hominio_tools = { ...globalToolRegistry };
    } else {
        // Add our tools to the existing registry
        Object.entries(globalToolRegistry).forEach(([name, implementation]) => {
            window.__hominio_tools![name] = implementation;
        });
    }

    // Combine with toolRegistry from todoActions
    Object.entries(toolRegistry).forEach(([name, implementation]) => {
        window.__hominio_tools![name] = implementation;
        globalToolRegistry[name] = implementation;
    });

    console.log('🔗 Tool registry prepared with tools:', Object.keys(window.__hominio_tools).join(', '));
}

/**
 * Register tools with the Ultravox session
 * Only register when Ultravox is ready
 */
export function registerToolsWithUltravox(): void {
    if (typeof window === 'undefined' || !window.__ULTRAVOX_SESSION || !window.__hominio_tools) {
        console.warn('⚠️ Cannot register tools - Ultravox session or tool registry not available');
        return;
    }

    const session = window.__ULTRAVOX_SESSION;
    const registeredTools: string[] = [];

    // Register each tool with the session
    for (const [toolName, implementation] of Object.entries(window.__hominio_tools)) {
        try {
            session.registerToolImplementation(toolName, implementation);
            registeredTools.push(toolName);
            console.log(`✅ Registered tool with Ultravox: ${toolName}`);
        } catch (error) {
            console.error(`❌ Failed to register tool "${toolName}":`, error);
        }
    }

    console.log('📋 Tool registration complete, registered tools:', registeredTools.join(', '));
    window.__hominio_tools_registered = true;
}

/**
 * Setup event listeners for tool registration
 */
export function setupToolRegistrationListeners(): void {
    if (typeof window === 'undefined' || window.__hominio_tools_registered) return;

    // Prepare the tool registry first
    prepareToolRegistry();

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

/**
 * Clear the tool cache
 */
export function clearToolCache(): void {
    toolCache.clear();
} 