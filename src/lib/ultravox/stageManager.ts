import { loadVibe } from './loaders/vibeLoader';
import { buildSystemPrompt } from './loaders/agentLoader';
import type { AgentName, ResolvedTool } from './types';
import { GLOBAL_CALL_TOOLS } from './globalTools';
import { loadTool } from './loaders/toolLoader';

// Cache the currently active vibe
let activeVibe: Awaited<ReturnType<typeof loadVibe>> | null = null;
let _activeVibeName: string | null = null;

// Export the active vibe name as a getter
export const activeVibeName = (): string | null => _activeVibeName;

// Cache for global tools to avoid reloading
let globalToolsCache: ResolvedTool[] = [];

/**
 * Load global tools that should be available in all stages
 * @returns Array of resolved global tool definitions
 */
async function loadGlobalTools(): Promise<ResolvedTool[]> {
    // Use cache if available
    if (globalToolsCache.length > 0) {
        return globalToolsCache;
    }

    // Load all global tools
    const resolvedGlobalTools: ResolvedTool[] = [];
    for (const toolName of GLOBAL_CALL_TOOLS) {
        try {
            const tool = await loadTool(toolName) as ResolvedTool;
            if (tool && tool.implementation) {
                resolvedGlobalTools.push(tool);
                console.log(`✅ Loaded global tool: ${toolName}`);
            }
        } catch (error) {
            console.error(`❌ Failed to load global tool "${toolName}":`, error);
        }
    }

    // Cache for future use
    globalToolsCache = resolvedGlobalTools;
    return resolvedGlobalTools;
}

/**
 * Load or get a vibe by name
 * @param vibeName The name of the vibe to load (defaults to 'home')
 */
export async function getActiveVibe(vibeName = 'home') {
    // If no vibe is loaded yet or if requesting a different vibe than the active one
    if (!activeVibe || !_activeVibeName || _activeVibeName !== vibeName) {
        console.log(`🔄 Loading vibe "${vibeName}" (was: ${_activeVibeName || 'none'})`);
        try {
            activeVibe = await loadVibe(vibeName);
            _activeVibeName = vibeName;
            console.log(`✅ Active vibe set to: ${vibeName}`);
        } catch (error) {
            console.error(`❌ Failed to load vibe "${vibeName}":`, error);

            // If the requested vibe fails and it's not already the home vibe, 
            // try to fall back to the home vibe
            if (vibeName !== 'home') {
                console.log(`⚠️ Falling back to home vibe`);
                try {
                    activeVibe = await loadVibe('home');
                    _activeVibeName = 'home';
                    console.log(`✅ Fallback to home vibe successful`);
                } catch (fallbackError) {
                    console.error(`❌ Failed to load fallback home vibe:`, fallbackError);
                    throw new Error(`Failed to load vibe "${vibeName}" and fallback home vibe`);
                }
            } else {
                throw new Error(`Failed to load home vibe: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    } else {
        console.log(`📦 Using cached vibe: ${_activeVibeName}`);
    }
    return activeVibe;
}

/**
 * Reset the active vibe cache
 */
export function resetActiveVibe() {
    activeVibe = null;
    _activeVibeName = null;
    console.log(`🧹 Active vibe cache cleared`);
}

/**
 * Creates stage change data for agent transitions
 * 
 * @param agentName The name of the agent to switch to
 * @param vibeId Optional vibe ID to load (defaults to current active vibe)
 * @returns The stage change data object compatible with Ultravox
 */
export async function createAgentStageChangeData(agentName: AgentName, vibeId?: string) {
    // Get the active vibe configuration or load specific vibe if provided
    const vibe = vibeId ? await getActiveVibe(vibeId) : await getActiveVibe();

    // Normalize agent name (fallback to default if not found)
    const normalizedName = vibe.resolvedAgents.some(a => a.name === agentName)
        ? agentName
        : vibe.defaultAgent.name;

    console.log(`🔄 Creating stage change data for agent: ${normalizedName}`);

    // Find the agent configuration
    const agent = vibe.resolvedAgents.find(a => a.name === normalizedName) || vibe.defaultAgent;

    // Collect all tools available to this agent
    const agentTools = agent.resolvedTools || [];

    // Common tools from call config (vibe tools)
    const callTools = vibe.resolvedCallTools || [];

    // Combine all tools the agent should have access to
    // Starting with call-level tools which include globals
    const selectedTools: ResolvedTool[] = [
        ...callTools,        // Call-level tools (includes globals)
        ...agentTools        // Agent-specific tools
    ];

    console.log(`🔧 Selected tools: ${selectedTools.map(t => t.name).join(', ')}`);

    // Build the system prompt using the agent's system prompt
    const systemPrompt = agent.systemPrompt;

    // Return the stage change data in the format expected by Ultravox
    return {
        systemPrompt,
        voice: agent.voiceId,
        toolResultText: `I'm now switching you to ${agent.name}...`,
        selectedTools
    };
} 