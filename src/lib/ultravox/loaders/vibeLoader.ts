import type { ToolImplementation } from '../types';

// Define types for the vibe configuration
interface VibeAgent {
    name: string;
    personality: string;
    voiceId: string;
    description: string;
    temperature: number;
    systemPrompt: string;
    tools: string[];
}

interface VibeManifest {
    name: string;
    description: string;
    rootCallConfig: {
        model: string;
        firstSpeaker: string;
        maxDuration: string;
        languageHint: string;
        temperature: number;
    };
    callSystemPrompt: string;
    callTools: string[];
    defaultAgent: string;
    agents: VibeAgent[];
}

interface ToolDefinition {
    name: string;
    temporaryTool: {
        modelToolName: string;
        description: string;
        dynamicParameters: {
            name: string;
            location: string;
            schema: {
                type: string;
                description: string;
            };
            required: boolean;
        }[];
        client: Record<string, unknown>;
    };
    implementationType: string;
}

interface ResolvedTool extends ToolDefinition {
    implementation: ToolImplementation;
}

interface ResolvedAgent extends VibeAgent {
    resolvedTools: ResolvedTool[];
}

interface ResolvedVibe {
    manifest: VibeManifest;
    resolvedCallTools: ResolvedTool[];
    resolvedAgents: ResolvedAgent[];
    defaultAgent: ResolvedAgent;
}

interface UltravoxSession {
    registerToolImplementation: (name: string, implementation: ToolImplementation) => void;
}

// Define window augmentation
declare global {
    interface Window {
        __hominio_tools?: Record<string, ToolImplementation>;
        __ULTRAVOX_SESSION?: UltravoxSession;
    }
}

/**
 * Vibe Loader - Dynamically loads vibe configurations and their tools
 */
import type { AgentConfig, ResolvedVibe, ToolDefinition, VibeManifest } from '../types';
import { loadTool } from './toolLoader';

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
        const manifest = await import(`../../vibes/${vibeName}/manifest.json`) as { default: VibeManifest };

        // Load all call tools
        const resolvedCallTools: ToolDefinition[] = [];
        for (const toolName of manifest.default.callTools) {
            try {
                const tool = await loadTool(toolName);
                resolvedCallTools.push(tool);
            } catch (error) {
                console.error(`❌ Failed to load call tool "${toolName}":`, error);
            }
        }

        // Load tools for each agent and attach them to agent configs
        const resolvedAgents: AgentConfig[] = [];
        for (const agent of manifest.default.agents) {
            try {
                // Deep clone the agent config
                const agentConfig: AgentConfig = { ...agent };

                // Load agent tools
                agentConfig.resolvedTools = [];
                if (Array.isArray(agent.tools)) {
                    for (const toolName of agent.tools) {
                        try {
                            // Skip tools that are already loaded as call tools
                            if (manifest.default.callTools.includes(toolName)) {
                                continue;
                            }

                            const tool = await loadTool(toolName);
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
            resolvedCallTools,
            resolvedAgents,
            defaultAgent
        };

        // Cache the resolved vibe
        vibeCache.set(vibeName, resolvedVibe);

        console.log(`✅ Loaded vibe: ${vibeName}`);
        console.log(`📋 Call tools: ${resolvedCallTools.map(t => t.name).join(', ')}`);
        console.log(`👤 Agents: ${resolvedAgents.map(a => a.name).join(', ')}`);
        console.log(`🎯 Default agent: ${defaultAgent.name}`);

        return resolvedVibe;
    } catch (error) {
        console.error(`❌ Failed to load vibe "${vibeName}":`, error);
        throw new Error(`Failed to load vibe "${vibeName}": ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Register all tools from a vibe with the Ultravox session
 * @param vibe The resolved vibe containing tools to register
 */
export function registerVibeTools(vibe: ResolvedVibe): void {
    if (typeof window === 'undefined' || !window.__ULTRAVOX_SESSION) {
        console.warn('⚠️ No Ultravox session available to register vibe tools');
        return;
    }

    const session = window.__ULTRAVOX_SESSION;
    const registeredTools: string[] = [];

    // Register call tools first
    for (const tool of vibe.resolvedCallTools) {
        if (tool.implementation) {
            try {
                session.registerToolImplementation(tool.name, tool.implementation);
                registeredTools.push(tool.name);
                console.log(`✅ Registered call tool: ${tool.name}`);
            } catch (error) {
                console.error(`❌ Failed to register call tool "${tool.name}":`, error);
            }
        }
    }

    // Then register agent-specific tools
    for (const agent of vibe.resolvedAgents) {
        if (agent.resolvedTools) {
            for (const tool of agent.resolvedTools) {
                // Skip tools that are already registered
                if (registeredTools.includes(tool.name)) {
                    continue;
                }

                if (tool.implementation) {
                    try {
                        session.registerToolImplementation(tool.name, tool.implementation);
                        registeredTools.push(tool.name);
                        console.log(`✅ Registered agent tool: ${tool.name}`);
                    } catch (error) {
                        console.error(`❌ Failed to register agent tool "${tool.name}":`, error);
                    }
                }
            }
        }
    }

    console.log('📋 Registered vibe tools:', registeredTools.join(', '));
} 