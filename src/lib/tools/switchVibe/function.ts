// Implementation for the switchVibe tool
import type { ToolParameters } from '$lib/ultravox/types';
import { switchVibe, getActiveVibe } from '$lib/ultravox';
import { createAgentStageChangeData } from '$lib/ultravox/stageManager';
import type { AgentName } from '$lib/ultravox/types';
import { currentAgent } from '$lib/ultravox/agents';
import { getAllVibes } from '$lib/ultravox/registries/vibeRegistry';

/**
 * This tool allows switching to an entirely different vibe
 * It's more comprehensive than switchAgent because it changes:
 * 1. The entire vibe context
 * 2. All available tools
 * 3. The default agent for the new vibe
 */
export async function switchVibeImplementation(parameters: ToolParameters): Promise<Record<string, unknown>> {
    console.log('🔄 switchVibe tool called with parameters:', parameters);

    try {
        // Extract vibeId parameter
        const { vibeId = 'home' } = parameters as { vibeId?: string };

        // Dynamically get available vibes from the registry
        const availableVibes = await getAllVibes();
        const availableVibeIds = availableVibes.map(vibe => vibe.id.toLowerCase());

        // Always include 'home' as it's filtered out by getAllVibes()
        const validVibeIds = ['home', ...availableVibeIds];

        console.log(`🔍 Available vibe IDs: ${validVibeIds.join(', ')}`);

        // Validate and normalize vibeId
        const normalizedVibeId = validVibeIds.includes(vibeId.toLowerCase())
            ? vibeId.toLowerCase()
            : 'home';

        console.log(`🔄 Switching to vibe: ${normalizedVibeId}`);

        // Reset and load the new vibe
        await switchVibe(normalizedVibeId);

        // Get the fully loaded vibe
        const newVibe = await getActiveVibe(normalizedVibeId);

        // Get the default agent for this vibe and ensure it's a valid AgentName
        const defaultAgentName = newVibe.defaultAgent.name as AgentName;

        console.log(`👤 Using default agent for vibe: ${defaultAgentName}`);

        // Update the current agent in the store
        currentAgent.set(defaultAgentName);
        console.log(`🔄 Current agent updated to: ${defaultAgentName}`);

        // Create stage change data for the default agent of the new vibe
        const stageChangeData = await createAgentStageChangeData(defaultAgentName, normalizedVibeId);

        // Add a custom message indicating the vibe change
        stageChangeData.toolResultText = `I'm now switching you to the ${normalizedVibeId} vibe with ${defaultAgentName}...`;

        // Make sure selected tools are properly formatted for the Ultravox API
        // The API expects a specific format with only allowed fields
        const sanitizedTools = stageChangeData.selectedTools.map(tool => {
            // Only include fields expected by the API
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

        console.log('🔧 Stage change data prepared with sanitized tools');

        // Signal to the UI that vibe has changed
        if (typeof window !== 'undefined') {
            console.log(`🔔 Dispatching manual vibe-changed event for: ${normalizedVibeId}`);
            window.dispatchEvent(new CustomEvent('ultravox-vibe-changed', {
                detail: { vibeId: normalizedVibeId }
            }));
        }

        // Return the stage change data to trigger a stage change in Ultravox
        return {
            responseType: 'new-stage',
            result: JSON.stringify(stageChangeData)
        };
    } catch (error) {
        console.error('❌ ERROR in switchVibe tool:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            message: `Error switching vibe: ${errorMessage}`
        };
    }
} 