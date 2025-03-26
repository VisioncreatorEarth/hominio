import { loadVibe } from './loaders/vibeLoader';
import { buildSystemPrompt } from './loaders/agentLoader';
import type { AgentName, ToolDefinition } from './types';
import { GLOBAL_CALL_TOOLS } from './globalTools';
import { loadTool } from './loaders/toolLoader';

// Cache the currently active vibe
let activeVibe: Awaited<ReturnType<typeof loadVibe>> | null = null;

// Cache for global tools to avoid reloading
let globalToolsCache: ToolDefinition[] = [];

/**
 * Load global tools that should be available in all stages
 * @returns Array of resolved global tool definitions
 */
async function loadGlobalTools(): Promise<ToolDefinition[]> {
    // Use cache if available
    if (globalToolsCache.length > 0) {
        return globalToolsCache;
    }

    // Load all global tools
    const resolvedGlobalTools: ToolDefinition[] = [];
    for (const toolName of GLOBAL_CALL_TOOLS) {
        try {
            const tool = await loadTool(toolName);
            resolvedGlobalTools.push(tool);
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
 * @param vibeName The name of the vibe to load
 */
export async function getActiveVibe(vibeName = 'todos') {
    if (!activeVibe) {
        activeVibe = await loadVibe(vibeName);
    }
    return activeVibe;
}

/**
 * Reset the active vibe cache
 */
export function resetActiveVibe() {
    activeVibe = null;
}

/**
 * Creates stage change data for agent transitions
 * IMPORTANT: Preserves the exact interface of the current implementation
 * to ensure backwards compatibility
 * 
 * @param agentName The name of the agent to switch to
 * @returns The stage change data object compatible with Ultravox
 */
export async function createAgentStageChangeData(agentName: AgentName) {
    // Get the active vibe configuration
    const vibe = await getActiveVibe();

    // Normalize agent name (fallback to default if not found)
    const normalizedName = vibe.resolvedAgents.some(a => a.name === agentName)
        ? agentName
        : vibe.defaultAgent.name;

    // Find the agent configuration
    const agent = vibe.resolvedAgents.find(a => a.name === normalizedName) || vibe.defaultAgent;

    // Collect all tools available to this agent
    const agentTools = agent.resolvedTools || [];

    // Common tools from call config (vibe tools)
    const callTools = vibe.resolvedCallTools || [];

    // Load global tools that should always be available
    const globalTools = await loadGlobalTools();

    // Combine all tools the agent should have access to
    // Put global tools first for priority
    const selectedTools: ToolDefinition[] = [
        ...globalTools,      // Global tools always available
        ...callTools,        // Vibe-specific call tools 
        ...agentTools        // Agent-specific tools
    ];

    // Build the system prompt using the agentLoader
    const systemPrompt = buildSystemPrompt(normalizedName as AgentName, vibe);

    // Return the stage change data in the format expected by the current implementation
    return {
        systemPrompt,
        voice: agent.voiceId,
        toolResultText: `I'm now switching you to ${agent.name}...`,
        selectedTools
    };
} 