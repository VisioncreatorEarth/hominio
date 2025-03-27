import type {
    ToolImplementation,
    ResolvedTool,
    ResolvedAgent,
    ResolvedVibe,
    ClientToolReturnType
} from '../types';

/**
 * Vibe Loader - Dynamically loads vibe configurations and their tools
 */
import { loadTool } from './toolLoader';
import { GLOBAL_CALL_TOOLS, isGlobalCallTool } from '../globalTools';

/**
 * In-memory cache for loaded vibes to avoid reloading
 */
const vibeCache = new Map<string, ResolvedVibe>();

/**
 * In-memory cache for tools to register with Ultravox
 */
let cachedTools: { name: string, implementation: ToolImplementation }[] = [];

/**
 * Loads a vibe configuration from its manifest
 * @param vibeName The name of the vibe to load
 * @returns The resolved vibe with all tools and agents loaded
 */
export async function loadVibe(vibeName: string): Promise<ResolvedVibe> {
    console.log(`🔍 loadVibe called for vibe: ${vibeName}`);

    // First check if we have it in cache
    if (vibeCache.has(vibeName)) {
        console.log(`📦 Using cached vibe: ${vibeName}`);
        return vibeCache.get(vibeName)!;
    }

    try {
        // Load the manifest
        console.log(`📄 Loading manifest for vibe: ${vibeName}`);
        const manifest = await import(`../../vibes/${vibeName}/manifest.json`);
        console.log(`✅ Loaded manifest for vibe: ${vibeName}`, manifest.default);

        // Extract vibe-specific tools from manifest
        const vibeToolNames = manifest.default.vibeTools || [];
        console.log(`🔧 Vibe tools from manifest: ${vibeToolNames.join(', ')}`);

        // Load global tools first - these are always included
        const resolvedGlobalTools: ResolvedTool[] = [];
        for (const toolName of GLOBAL_CALL_TOOLS) {
            try {
                const tool = await loadTool(toolName) as ResolvedTool;
                if (tool.implementation) {
                    resolvedGlobalTools.push(tool);
                    console.log(`✅ Loaded global tool: ${toolName}`);
                }
            } catch (error) {
                console.error(`❌ Failed to load global tool "${toolName}":`, error);
            }
        }

        // Load vibe-specific call tools
        const resolvedVibeTools: ResolvedTool[] = [];
        for (const toolName of vibeToolNames) {
            // Skip if it's already loaded as a global tool
            if (isGlobalCallTool(toolName)) {
                console.log(`ℹ️ Skipping vibe tool "${toolName}" as it's already loaded as global tool`);
                continue;
            }

            try {
                const tool = await loadTool(toolName) as ResolvedTool;
                if (tool.implementation) {
                    resolvedVibeTools.push(tool);
                    console.log(`✅ Loaded vibe call tool: ${toolName}`);
                }
            } catch (error) {
                console.error(`❌ Failed to load vibe call tool "${toolName}":`, error);
            }
        }

        // Combine global and vibe-specific call tools
        const allCallTools = [...resolvedGlobalTools, ...resolvedVibeTools];
        console.log(`📋 Total call tools: ${allCallTools.length} (${allCallTools.map(t => t.name).join(', ')})`);

        // Load tools for each agent and attach them to agent configs
        const resolvedAgents: ResolvedAgent[] = [];
        for (const agent of manifest.default.agents) {
            try {
                // Deep clone the agent config
                const agentConfig: ResolvedAgent = {
                    ...agent,
                    resolvedTools: []
                };

                console.log(`👤 Processing agent ${agent.name} with tools: ${agent.tools.join(', ')}`);

                // Load agent tools
                if (Array.isArray(agent.tools)) {
                    for (const toolName of agent.tools) {
                        // Skip tools that are already loaded as call or global tools
                        if (vibeToolNames.includes(toolName) || isGlobalCallTool(toolName)) {
                            console.log(`ℹ️ Skipping agent tool "${toolName}" as it's already available at call level`);
                            continue;
                        }

                        try {
                            const tool = await loadTool(toolName) as ResolvedTool;
                            if (tool.implementation) {
                                agentConfig.resolvedTools.push(tool);
                                console.log(`✅ Loaded agent tool: ${toolName}`);
                            }
                        } catch (error) {
                            console.error(`❌ Failed to load agent tool "${toolName}":`, error);
                        }
                    }
                }

                // Add the agent to the resolved agents
                resolvedAgents.push(agentConfig);
                console.log(`👤 Completed agent: ${agent.name} with ${agentConfig.resolvedTools.length} tools`);
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

        console.log(`✅ Vibe "${vibeName}" fully loaded and cached`);
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
    console.log('🧹 Vibe cache cleared');
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

    // Store in global cache for later use
    cachedTools = toolsToRegister;

    // Register with session if available, otherwise create/update tool registry
    if (window.__ULTRAVOX_SESSION) {
        const session = window.__ULTRAVOX_SESSION;
        const registeredTools: string[] = [];

        for (const tool of toolsToRegister) {
            try {
                session.registerToolImplementation(tool.name, tool.implementation as (params: unknown) => ClientToolReturnType | Promise<ClientToolReturnType>);
                registeredTools.push(tool.name);
                console.log(`✅ Registered tool with Ultravox: ${tool.name}`);
            } catch (error) {
                console.error(`❌ Failed to register tool "${tool.name}" with Ultravox:`, error);
            }
        }

        console.log('📋 Registered vibe tools with Ultravox:', registeredTools.join(', '));
    } else {
        // Create or update the tool registry
        if (!window.__hominio_tools) {
            window.__hominio_tools = {};
        }

        // Add tools to registry
        for (const tool of toolsToRegister) {
            window.__hominio_tools[tool.name] = tool.implementation;
            console.log(`✅ Added tool to registry: ${tool.name}`);
        }

        console.log('📋 Stored tools in registry:', Object.keys(window.__hominio_tools).join(', '));
        console.warn('⚠️ No Ultravox session available. Tools stored in registry for later registration.');

        // Add event listener to register tools when Ultravox is ready
        window.addEventListener('ultravox-ready', () => {
            console.log('🔄 Ultravox ready event received, registering cached tools');

            if (window.__ULTRAVOX_SESSION && cachedTools.length > 0) {
                const session = window.__ULTRAVOX_SESSION;
                const registeredTools: string[] = [];

                for (const tool of cachedTools) {
                    try {
                        session.registerToolImplementation(tool.name, tool.implementation as (params: unknown) => ClientToolReturnType | Promise<ClientToolReturnType>);
                        registeredTools.push(tool.name);
                        console.log(`✅ Registered cached tool: ${tool.name}`);
                    } catch (error) {
                        console.error(`❌ Failed to register cached tool "${tool.name}":`, error);
                    }
                }

                console.log('📋 Registered cached tools:', registeredTools.join(', '));
            } else {
                console.warn('⚠️ Ultravox session still not available or no cached tools to register');
            }
        });
    }
} 