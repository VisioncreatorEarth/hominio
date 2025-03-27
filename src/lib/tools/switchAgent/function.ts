// Implementation for the switchAgent tool
import type { ToolParameters } from '$lib/ultravox/types';
import { currentAgent } from '$lib/ultravox/agents';
import { createAgentStageChangeData, getActiveVibe } from '$lib/ultravox/stageManager';
import type { AgentName } from '$lib/ultravox/types';

export async function switchAgentImplementation(parameters: ToolParameters): Promise<Record<string, unknown>> {
    console.log('🔄 switchAgent tool called with parameters:', parameters);
    try {
        // Extract the requested agent name
        const { agentName = 'Hominio' } = parameters as { agentName?: string };

        // Normalize the agent name
        let normalizedName = agentName;

        // Map legacy names to new names if needed
        if (agentName.toLowerCase() === 'sam') {
            normalizedName = 'Oliver';
        }

        console.log(`🔄 Attempting to switch to agent: ${normalizedName}`);

        // Get the current vibe configuration
        const activeVibe = await getActiveVibe();

        // Get the list of available agents in this vibe
        const availableAgents = activeVibe.resolvedAgents.map(agent => agent.name);

        console.log(`🔍 Available agents in current vibe: ${availableAgents.join(', ')}`);

        // Check if the requested agent exists in the current vibe
        const validAgent = activeVibe.resolvedAgents.find(agent =>
            agent.name.toLowerCase() === normalizedName.toLowerCase()
        );

        // If agent not found, fallback to default agent
        const targetAgentName = validAgent ? validAgent.name : activeVibe.defaultAgent.name;

        console.log(`👤 ${validAgent ? 'Found' : 'Could not find'} agent "${normalizedName}", using: ${targetAgentName}`);

        // Update the current agent in the store
        currentAgent.set(targetAgentName as AgentName);

        // Create stage change data from the active vibe's agent
        const stageChangeData = await createAgentStageChangeData(targetAgentName as AgentName);

        // Add a message indicating the agent change
        stageChangeData.toolResultText = `I'm now switching you to ${targetAgentName}...`;

        // Make sure selected tools are properly formatted for the Ultravox API
        const sanitizedTools = stageChangeData.selectedTools.map(tool => {
            return {
                temporaryTool: {
                    modelToolName: tool.name,
                    description: tool.temporaryTool.description,
                    dynamicParameters: tool.temporaryTool.dynamicParameters,
                    client: {}
                }
            };
        });

        // Replace the tools with properly formatted ones
        stageChangeData.selectedTools = sanitizedTools;

        console.log(`✅ Agent switch prepared for: ${targetAgentName}`);

        // Return the stage change data to trigger a stage change in Ultravox
        return {
            responseType: 'new-stage',
            result: JSON.stringify(stageChangeData)
        };
    } catch (error) {
        console.error('❌ ERROR in switchAgent tool:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            message: `Error switching agent: ${errorMessage}`
        };
    }
} 