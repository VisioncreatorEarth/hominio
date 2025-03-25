import { loadVibe } from './loaders/vibeLoader';
import { buildSystemPrompt } from './loaders/agentLoader';
import type { AgentName, ToolDefinition } from './types';

// Cache the currently active vibe
let activeVibe: Awaited<ReturnType<typeof loadVibe>> | null = null;

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

    // Common tools from call config
    const callTools = vibe.resolvedCallTools || [];

    // Combine all tools the agent should have access to
    const selectedTools: ToolDefinition[] = [
        ...callTools,
        ...agentTools
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