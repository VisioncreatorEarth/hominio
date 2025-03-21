import type { Tool, UltravoxSession } from './types';

/**
 * Registers all tool implementations with the Ultravox session
 */
export function registerToolImplementations(session: UltravoxSession, tools: Tool[]): void {
    if (!session) {
        console.error('❌ No Ultravox session provided for tool registration');
        return;
    }

    console.log(`🔧 Registering ${tools.length} tool implementations with Ultravox`);

    for (const tool of tools) {
        try {
            // Register the client-side implementation function
            session.registerToolImplementation(
                tool.config.id,
                tool.implementation
            );
            console.log(`✅ Registered implementation for: ${tool.config.id}`);
        } catch (error) {
            console.error(`❌ Failed to register tool ${tool.config.id}:`, error);
        }
    }

    // Make tool implementations available globally for legacy components
    if (typeof window !== 'undefined') {
        const toolsObj: Record<string, any> = {};

        for (const tool of tools) {
            toolsObj[tool.config.id] = tool.implementation;
        }

        (window as Window & typeof globalThis & { __hominio_tools: Record<string, any> }).__hominio_tools = toolsObj;
        console.log('🌐 Exposed tools on window.__hominio_tools for legacy support');
    }
} 