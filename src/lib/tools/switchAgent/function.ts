// Implementation for the switchAgent tool
import type { ToolParameters } from '$lib/ultravox/types';
import {
    currentAgent,
    agentConfigs,
    createAgentStageChangeData,
    type AgentName
} from '$lib/ultravox/agents';

export function switchAgentImplementation(parameters: ToolParameters): string | Record<string, unknown> {
    console.log('Called switchAgent tool with parameters:', parameters);
    try {
        console.log('🔧 CLIENT: switchAgentTool called with params:', parameters);
        const { agentName = 'Hominio' } = parameters as { agentName?: string };
        let normalizedName = agentName as string;

        // Map legacy names to new names
        if (agentName.toLowerCase() === 'sam') {
            normalizedName = 'Oliver';
        }

        // Update the current agent in the store directly
        console.log(`🔧 CLIENT: Updating currentAgent store to: ${normalizedName}`);

        // Validate the agent name
        const validAgentName =
            normalizedName in agentConfigs ? (normalizedName as AgentName) : ('Hominio' as AgentName);

        currentAgent.set(validAgentName);

        // Use the centralized function to create stage change data
        const stageChangeData = createAgentStageChangeData(validAgentName);

        // This tool is special as it returns a stage change object directly
        // For stage change tools, we need to return the object directly, not serialized
        return {
            responseType: 'new-stage',
            result: JSON.stringify(stageChangeData)
        };
    } catch (error) {
        console.error('❌ CLIENT ERROR in switchAgentTool:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
            success: false,
            message: `Error switching agent: ${errorMessage}`
        });
    }
} 