import { loadVibe } from './loaders/vibeLoader';
import type { AgentName, ResolvedTool, StageChangeData } from './types';

// Cache the currently active vibe
let activeVibe: Awaited<ReturnType<typeof loadVibe>> | null = null;
let _activeVibeName: string | null = null;

// Export the active vibe name as a getter
export const activeVibeName = (): string | null => _activeVibeName;

/**
 * Load or get a vibe by name
 * @param vibeName The name of the vibe to load (defaults to 'home')
 */
export async function getActiveVibe(vibeName = 'home') {
    // If no vibe is loaded yet or if requesting a different vibe than the active one
    if (!activeVibe || !_activeVibeName || _activeVibeName !== vibeName) {
        try {
            activeVibe = await loadVibe(vibeName);
            _activeVibeName = vibeName;
        } catch (error) {
            console.error(`❌ Failed to load vibe "${vibeName}":`, error);

            // If the requested vibe fails and it's not already the home vibe, 
            // try to fall back to the home vibe
            if (vibeName !== 'home') {
                try {
                    activeVibe = await loadVibe('home');
                    _activeVibeName = 'home';
                } catch (fallbackError) {
                    console.error(`❌ Failed to load fallback home vibe:`, fallbackError);
                    throw new Error(`Failed to load vibe "${vibeName}" and fallback home vibe`);
                }
            } else {
                throw new Error(`Failed to load home vibe: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return activeVibe;
}

/**
 * Reset the active vibe cache
 */
export function resetActiveVibe() {
    activeVibe = null;
    _activeVibeName = null;
}

/**
 * Creates stage change data for agent transitions
 * 
 * @param agentName The name of the agent to switch to
 * @param vibeId Optional vibe ID to load (defaults to current active vibe)
 * @returns The stage change data object compatible with Ultravox
 */
export async function createAgentStageChangeData(agentName: AgentName, vibeId?: string): Promise<StageChangeData> {
    // Get the active vibe configuration or load specific vibe if provided
    const vibe = vibeId ? await getActiveVibe(vibeId) : await getActiveVibe();

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

    // Combine all tools the agent should have access to
    // Starting with call-level tools which include globals
    const selectedTools: ResolvedTool[] = [
        ...callTools,        // Call-level tools (includes globals)
        ...agentTools        // Agent-specific tools
    ];


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