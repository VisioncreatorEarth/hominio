import type {
    ToolImplementation,
    ResolvedTool,
    ResolvedAgent,
    ResolvedVibe
} from '../types';

/**
 * Vibe Loader - Dynamically loads vibe configurations and their tools
 */
import { loadTool } from './toolLoader';
import { GLOBAL_CALL_TOOLS, isGlobalCallTool } from '../globalTools';
import { registerToolsWithUltravox } from '../registries/toolRegistry';

/**
 * In-memory cache for loaded vibes to avoid reloading
 */
const vibeCache = new Map<string, ResolvedVibe>();

/**
 * Loads a vibe configuration from its manifest
 * @param vibeName The name of the vibe to load
 * @returns The resolved vibe with all tools and agents loaded
 */
export async function loadVibe(vibeName: string): Promise<ResolvedVibe> {

    // First check if we have it in cache
    if (vibeCache.has(vibeName)) {
        return vibeCache.get(vibeName)!;
    }

    try {
        // Load the manifest
        const manifest = await import(`../../vibes/${vibeName}/manifest.json`);

        // Extract vibe-specific tools from manifest
        const vibeToolNames = manifest.default.vibeTools || [];

        // Load global tools first - these are always included
        const resolvedGlobalTools: ResolvedTool[] = [];
        for (const toolName of GLOBAL_CALL_TOOLS) {
            try {
                const tool = await loadTool(toolName) as ResolvedTool;
                resolvedGlobalTools.push(tool);
            } catch (error) {
                console.error(`❌ Failed to load global tool "${toolName}":`, error);
            }
        }

        // Load vibe-specific call tools
        const resolvedVibeTools: ResolvedTool[] = [];
        for (const toolName of vibeToolNames) {
            // Skip if it's already loaded as a global tool
            if (isGlobalCallTool(toolName)) {
                continue;
            }

            try {
                const tool = await loadTool(toolName) as ResolvedTool;
                resolvedVibeTools.push(tool);
            } catch (error) {
                console.error(`❌ Failed to load vibe call tool "${toolName}":`, error);
            }
        }

        // Combine global and vibe-specific call tools
        const allCallTools = [...resolvedGlobalTools, ...resolvedVibeTools];

        // Load tools for each agent and attach them to agent configs
        const resolvedAgents: ResolvedAgent[] = [];
        for (const agent of manifest.default.agents) {
            try {
                // Deep clone the agent config
                const agentConfig: ResolvedAgent = {
                    ...agent,
                    resolvedTools: []
                };


                // Load agent tools
                if (Array.isArray(agent.tools)) {
                    for (const toolName of agent.tools) {
                        // Skip tools that are already loaded as call or global tools
                        if (vibeToolNames.includes(toolName) || isGlobalCallTool(toolName)) {
                            continue;
                        }

                        try {
                            const tool = await loadTool(toolName) as ResolvedTool;
                            agentConfig.resolvedTools.push(tool);
                        } catch (error) {
                            console.error(`❌ Failed to load agent tool "${toolName}":`, error);
                        }
                    }
                }

                // Add the agent to the resolved agents
                resolvedAgents.push(agentConfig);
            } catch (error) {
                console.error(`❌ Failed to resolve agent "${agent.name}":`, error);
            }
        }

        // Find the default agent
        const defaultAgent = resolvedAgents.find(a => a.name === manifest.default.defaultAgent);
        if (!defaultAgent) {
            throw new Error(`Default agent "${manifest.default.defaultAgent}" not found in vibe "${vibeName}"`);
        }

        // Create the resolved vibe
        const resolvedVibe: ResolvedVibe = {
            manifest: manifest.default,
            resolvedCallTools: allCallTools,
            resolvedAgents,
            defaultAgent
        };

        // Cache the resolved vibe
        vibeCache.set(vibeName, resolvedVibe);

        return resolvedVibe;
    } catch (error) {
        console.error(`❌ Failed to load vibe "${vibeName}":`, error);
        throw new Error(`Failed to load vibe "${vibeName}": ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Clear the vibe cache
 */
export function clearVibeCache(): void {
    vibeCache.clear();
}

/**
 * Register all tools from a vibe with the Ultravox session
 * @param vibe The resolved vibe containing tools to register
 */
export function registerVibeTools(vibe: ResolvedVibe): void {
    if (typeof window === 'undefined') {
        console.warn('⚠️ Not in browser environment, skipping tool registration');
        return;
    }

    // Store tools for registration when session is available
    const toolsToRegister: { name: string, implementation: ToolImplementation }[] = [];

    // Add call tools
    for (const tool of vibe.resolvedCallTools) {
        if (tool.implementation) {
            toolsToRegister.push({
                name: tool.name,
                implementation: tool.implementation
            });
        }
    }

    // Add agent tools
    for (const agent of vibe.resolvedAgents) {
        if (agent.resolvedTools) {
            for (const tool of agent.resolvedTools) {
                // Check if tool is already in the list
                if (!toolsToRegister.some(t => t.name === tool.name) && tool.implementation) {
                    toolsToRegister.push({
                        name: tool.name,
                        implementation: tool.implementation
                    });
                }
            }
        }
    }

    // Use the centralized registry to register tools with Ultravox
    if (window.__hominio_tools) {
        // Add our tools to the existing registry
        for (const tool of toolsToRegister) {
            window.__hominio_tools[tool.name] = tool.implementation;
        }
    } else {
        // Create a new registry
        window.__hominio_tools = {};
        for (const tool of toolsToRegister) {
            window.__hominio_tools[tool.name] = tool.implementation;
        }
    }


    // If Ultravox session exists, register tools immediately
    if (window.__ULTRAVOX_SESSION) {
        registerToolsWithUltravox();
    } else {
        // Add event listener to register tools when Ultravox is ready
        window.addEventListener('ultravox-ready', () => {
            registerToolsWithUltravox();
        }, { once: true });
    }
} 