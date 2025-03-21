import type { ToolImplementation, ToolParameters } from '../../ultravox/types';

declare global {
    interface Window {
        __ULTRAVOX_SESSION?: {
            changeStage: (stageId: string) => Promise<void>;
            getStages: () => { id: string; name: string; prompt: string }[];
            currentStage?: { id: string; name: string };
        };
    }
}

// Map from friendly names to stage IDs
const agentMap: Record<string, string> = {
    'oliver': 'oliver',
    'oliver assistant': 'oliver',
    'assistant': 'oliver',
    'assistant oliver': 'oliver',
    'sophie': 'sophie',
    'sophie assistant': 'sophie',
    'assistant sophie': 'sophie',
    'default': 'oliver'
};

export const implementation: ToolImplementation = async (params: ToolParameters) => {
    try {
        const { agentName } = params;

        if (!agentName) {
            return {
                success: false,
                error: 'Agent name is required',
                toolResultText: 'I need to know which agent you want to switch to.'
            };
        }

        // Log the action
        console.log(`👤 Switching to agent: "${agentName}"`);

        // Normalize the agent name
        const normalizedName = agentName.toLowerCase().trim();

        // Check for Ultravox session
        if (typeof window !== 'undefined' && window.__ULTRAVOX_SESSION) {
            // Get available stages
            const stages = window.__ULTRAVOX_SESSION.getStages();

            // Get the target stage ID from the map or try to find it in available stages
            let targetStageId = agentMap[normalizedName] || '';

            // If not found in the map, try to find by name in available stages
            if (!targetStageId) {
                const matchingStage = stages.find(stage =>
                    stage.name.toLowerCase() === normalizedName
                );

                if (matchingStage) {
                    targetStageId = matchingStage.id;
                } else {
                    // Default to oliver if no match found
                    targetStageId = 'oliver';
                    console.warn(`No stage found for "${agentName}", defaulting to Oliver`);
                }
            }

            // Check if we're already on this stage
            if (window.__ULTRAVOX_SESSION.currentStage?.id === targetStageId) {
                return {
                    success: true,
                    message: `Already talking to agent: "${agentName}"`,
                    toolResultText: `You're already talking to me, ${agentName}.`
                };
            }

            // Change to the target stage
            try {
                await window.__ULTRAVOX_SESSION.changeStage(targetStageId);

                return {
                    success: true,
                    message: `Switched to agent: "${agentName}"`,
                    toolResultText: `I'll connect you with ${agentName} right away.`
                };
            } catch (error) {
                console.error('Error changing stage:', error);
                return {
                    success: false,
                    error: 'Failed to change agent',
                    toolResultText: 'Sorry, I was unable to connect you with that agent.'
                };
            }
        } else {
            // Fallback for when Ultravox session is not available
            console.warn('No Ultravox session available, cannot switch agent');

            return {
                success: false,
                error: 'Ultravox session not available',
                toolResultText: 'Sorry, I was unable to switch agents due to a technical issue.'
            };
        }
    } catch (error) {
        console.error('❌ Error switching agent:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error switching agent',
            toolResultText: 'Sorry, I was unable to connect you with that agent.'
        };
    }
}; 