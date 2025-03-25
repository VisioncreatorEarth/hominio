import type { AgentConfig, AgentName, ResolvedVibe } from '../types';

/**
 * In-memory cache for agent configurations to avoid reloading
 */
const agentCache = new Map<AgentName, AgentConfig>();

/**
 * Loads an agent configuration from a vibe
 * @param agentName The name of the agent to load
 * @param vibe The resolved vibe containing agent configurations
 * @returns The agent configuration
 */
export function getAgentConfig(agentName: AgentName, vibe: ResolvedVibe): AgentConfig {
    // First check if we have it in cache
    if (agentCache.has(agentName)) {
        return agentCache.get(agentName)!;
    }

    // Find the agent in the vibe's resolved agents
    const agent = vibe.resolvedAgents.find((a: AgentConfig) => a.name === agentName);

    if (!agent) {
        throw new Error(`Agent "${agentName}" not found in vibe "${vibe.manifest.name}"`);
    }

    // Cache the agent config
    agentCache.set(agentName, agent);

    return agent;
}

/**
 * Builds a system prompt for the given agent
 * @param agentName The name of the agent to build a prompt for
 * @param vibe The resolved vibe containing agent configurations
 * @returns The fully constructed system prompt
 */
export function buildSystemPrompt(agentName: AgentName, vibe: ResolvedVibe): string {
    const agent = getAgentConfig(agentName, vibe);

    // Get the agent-specific system prompt
    const baseSystemPrompt = agent.systemPrompt;

    // Get the call-level system prompt
    const callSystemPrompt = vibe.manifest.callSystemPrompt;

    // Build tool descriptions
    const tools = [...(vibe.resolvedCallTools || []), ...(agent.resolvedTools || [])];

    let toolsDescription = "No tools are available.";

    if (tools.length > 0) {
        toolsDescription = tools.map(tool => {
            return `${tool.temporaryTool.modelToolName}: ${tool.temporaryTool.description}`;
        }).join('\n\n');
    }

    // Combine all parts
    return `${baseSystemPrompt}

You have access to the following tools that you MUST use when relevant:
${toolsDescription}

${callSystemPrompt}`;
}

/**
 * Clears the agent cache
 */
export function clearAgentCache(): void {
    agentCache.clear();
} 