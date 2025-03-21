import type { AgentConfig, Tool, ToolResponse } from './types';
import { writable } from 'svelte/store';

// Create a store for the current agent
export const currentAgent = writable<string>('Hominio');

/**
 * Prepares a stage change to switch to a different agent
 */
export function switchToAgent(
    agentId: string,
    allAgents: AgentConfig[],
    allTools: Tool[]
): ToolResponse {
    console.log(`🧩 Preparing switch to agent: ${agentId}`);

    // Find the requested agent
    const agent = allAgents.find(a => a.id === agentId);
    if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
    }

    // Update the current agent in the store - important for UI updates
    currentAgent.set(agent.id);
    console.log(`🧩 Updated currentAgent store to: ${agent.id}`);

    // 1. Find all tool configs needed by this agent
    const agentTools = allTools.filter(t =>
        agent.tools.includes(t.config.id)
    );

    // 2. Add core tools (always available)
    const coreTools = allTools.filter(t =>
        t.config.id === 'switchAgent' || t.config.id === 'hangUp'
    );

    // 3. Format tools for stage change
    const formattedTools = [...coreTools, ...agentTools].map(tool => {
        if (tool.config.id === 'hangUp') {
            return { toolName: "hangUp" };
        } else {
            return {
                temporaryTool: {
                    modelToolName: tool.config.id,
                    description: tool.config.description,
                    dynamicParameters: tool.config.parameters,
                    client: {}
                }
            };
        }
    });

    // 4. Create stage change data
    const stageChangeData = {
        systemPrompt: agent.systemPromptTemplate,
        voice: agent.voiceId,
        toolResultText: `I'm now switching you to ${agent.name}...`,
        selectedTools: formattedTools
    };

    console.log(`🚀 Created stage change data with ${formattedTools.length} tools`);

    // Format response for Ultravox
    return {
        responseType: 'new-stage',
        result: JSON.stringify(stageChangeData)
    };
} 