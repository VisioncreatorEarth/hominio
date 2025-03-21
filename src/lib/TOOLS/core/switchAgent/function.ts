import type { ToolImplementation, ToolParameters } from '../../../ultravox/types';
import { currentAgent } from '../../../ultravox/agentManager';

interface SwitchAgentParams extends ToolParameters {
    agentName?: string;
}

export const implementation: ToolImplementation = async (params: SwitchAgentParams) => {
    try {
        console.log('🧩 TOOL CALLED: switchAgent with params:', params);

        if (!params.agentName) {
            return {
                success: false,
                error: 'Agent name is required'
            };
        }

        // Get the current vibe
        const { getCurrentVibe } = await import('../../../ultravox/callManager');
        const { switchToAgent } = await import('../../../ultravox/agentManager');

        const vibe = getCurrentVibe();
        if (!vibe) {
            return {
                success: false,
                error: 'No active vibe found'
            };
        }

        // Map legacy names to new names if needed
        let normalizedName = params.agentName;
        if (normalizedName.toLowerCase() === 'ali' || normalizedName.toLowerCase() === 'mark') {
            normalizedName = 'Oliver'; // We now use Oliver instead of Ali/Mark
        } else if (normalizedName.toLowerCase() === 'sam' || normalizedName.toLowerCase() === 'emily') {
            normalizedName = 'Hominio'; // We now use Hominio instead of Sam/Emily
        } else if (normalizedName.toLowerCase() === 'taylor') {
            normalizedName = 'Oliver'; // We now use Oliver instead of Taylor
        }

        // Find the agent in our current vibe
        const agent = vibe.agents.find(a =>
            a.id.toLowerCase() === normalizedName.toLowerCase() ||
            a.name.toLowerCase() === normalizedName.toLowerCase()
        );

        if (!agent) {
            return {
                success: false,
                error: `Agent "${params.agentName}" not found in the current vibe`
            };
        }

        // Update the current agent store for UI
        currentAgent.set(agent.id);
        console.log(`🧩 Updated currentAgent store to: ${agent.id}`);

        // Force update any global references
        if (typeof window !== 'undefined') {
            (window as Window & typeof globalThis & { currentAgentName: string }).currentAgentName = agent.id;
        }

        // Generate the stage change data using the agent manager
        return switchToAgent(agent.id, vibe.agents, vibe.tools);
    } catch (error) {
        console.error('❌ ERROR in switchAgent tool:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error switching agent'
        };
    }
}; 