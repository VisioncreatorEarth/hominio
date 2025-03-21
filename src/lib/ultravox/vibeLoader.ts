import type { Vibe, VibeManifest, AgentConfig, Tool, ToolConfig } from './types';
import { browser } from '$app/environment';

/**
 * Loads a vibe and all its dependencies (agents and tools)
 */
export async function loadVibe(vibeName: string): Promise<Vibe> {
    if (!browser) {
        throw new Error('Vibe loader can only be used in browser environment');
    }

    try {
        console.log(`🌈 Loading vibe: ${vibeName}`);

        // 1. Load the vibe manifest
        const vibeManifest = await import(`../VIBES/${vibeName}/manifest.json`) as { default: VibeManifest };
        console.log(`📚 Loaded manifest for vibe: ${vibeManifest.default.name}`);

        // 2. Load all required agents
        const agents = await Promise.all(
            vibeManifest.default.agents.map(async (agentId: string) => {
                const agentModule = await import(`../AGENTS/${agentId}/config.json`);
                return agentModule.default as AgentConfig;
            })
        );
        console.log(`👤 Loaded ${agents.length} agents: ${agents.map(a => a.name).join(', ')}`);

        // 3. Load all required tools
        const allToolIds = [...vibeManifest.default.coreTools, ...vibeManifest.default.appTools];
        const tools = await Promise.all(
            allToolIds.map(async (toolId: string) => {
                // Determine if it's a core tool or app tool
                const toolCategory = vibeManifest.default.coreTools.includes(toolId) ? 'core' : 'todos';
                const toolPath = `../TOOLS/${toolCategory}/${toolId}`;

                // Load config and function
                const configModule = await import(`${toolPath}/config.json`);
                const functionModule = await import(`${toolPath}/function.ts`);

                return {
                    config: configModule.default as ToolConfig,
                    implementation: functionModule.implementation
                } as Tool;
            })
        );
        console.log(`🔧 Loaded ${tools.length} tools`);

        // 4. Find the default agent
        const defaultAgent = agents.find(a => a.id === vibeManifest.default.defaultAgent);
        if (!defaultAgent) {
            throw new Error(`Default agent "${vibeManifest.default.defaultAgent}" not found`);
        }

        // 5. Return the assembled vibe
        return {
            manifest: vibeManifest.default,
            agents,
            tools,
            defaultAgent
        };
    } catch (error) {
        console.error(`❌ Failed to load vibe ${vibeName}:`, error);
        throw error;
    }
} 