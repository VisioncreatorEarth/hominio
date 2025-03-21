import { writable } from 'svelte/store';

// Create a store for the current filter
export const currentFilter = writable('all');

// Create a store for the current agent
export const currentAgent = writable('Hominio');

// Define types for Ultravox session and tool parameters
interface UltravoxSessionInterface {
    registerTool: (name: string, callback: (params: unknown) => Promise<ToolResponse>) => void;
    registerToolImplementation?: (name: string, callback: (params: unknown) => string) => void;
}

type FilterParams = {
    tag?: string;
};

type SwitchAgentParams = {
    agentName?: string;
};

type ToolResponse = {
    success?: boolean;
    message?: string;
    error?: string;
    responseType?: string;
    systemPrompt?: string;
    voice?: string;
    toolResultText?: string;
};

// Define agent config type
type AgentConfig = {
    personality: string;
    voiceId: string;
};

// Define valid agent names
type AgentName = 'Mark' | 'Emily' | 'Oliver' | 'Hominio';

// Agent configuration with personality traits and voice IDs
const agentConfig: Record<AgentName, AgentConfig> = {
    'Mark': {
        personality: 'enthusiastic and playful',
        voiceId: '91fa9bcf-93c8-467c-8b29-973720e3f167'
    },
    'Emily': {
        personality: 'calm and methodical',
        voiceId: '87691b77-0174-4808-b73c-30000b334e14'
    },
    'Oliver': {
        personality: 'professional and efficient',
        voiceId: '3abe60f5-13ed-4e82-ac15-4391d9e5cd9d'
    },
    'Hominio': {
        personality: 'helpful and attentive',
        voiceId: 'b0e6b5c1-3100-44d5-8578-9015aa3023ae' // Default Jessica voice
    }
};

// Function to register all Hominio tools with Ultravox
export function registerHominionTools(session: UltravoxSessionInterface): void {
    if (!session) {
        console.error('No Ultravox session provided to registerHominionTools');
        return;
    }

    console.log('Registering Hominio tools with Ultravox session');

    // Register the filterTodos tool
    session.registerTool('filterTodos', async (params: unknown) => {
        try {
            const { tag = 'all' } = (params as FilterParams) || {};
            console.log(`Filtering todos by tag: ${tag}`);

            // Update the current filter in the store
            currentFilter.set(tag);

            // Return success response
            return { success: true, message: `Filtered todos by tag: ${tag}` };
        } catch (error) {
            console.error('Error filtering todos:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error filtering todos'
            };
        }
    });

    // Register the switchAgent tool
    session.registerTool('switchAgent', async (params: unknown) => {
        try {
            const { agentName = 'Hominio' } = (params as SwitchAgentParams) || {};
            console.log(`🧩 TOOL CALLED: switchAgent with params:`, params);

            // Map legacy names to new names
            let normalizedName: AgentName = 'Hominio';

            // Convert input to normalized name
            if (agentName.toLowerCase() === 'ali') {
                normalizedName = 'Mark';
            } else if (agentName.toLowerCase() === 'sam') {
                normalizedName = 'Emily';
            } else if (agentName.toLowerCase() === 'taylor') {
                normalizedName = 'Oliver';
            } else if (agentName === 'Mark' || agentName === 'Emily' || agentName === 'Oliver') {
                normalizedName = agentName as AgentName;
            }

            // Get agent configuration
            const agent = agentConfig[normalizedName];
            console.log(`🧩 AGENT CONFIG:`, agent);

            // Update the current agent in the store - important for UI updates
            currentAgent.set(normalizedName);
            console.log(`🧩 Updated currentAgent store to: ${normalizedName}`);

            // Force update any global references
            if (typeof window !== 'undefined') {
                (window as Window & typeof globalThis & { currentAgentName: string }).currentAgentName = normalizedName;
            }

            // Determine the agent-specific system prompt
            const systemPrompt = `You are now ${normalizedName}, a friendly assistant for the Hominio todo app. 
Your personality is more ${agent.personality}. 

Continue helping the user with their todo management tasks using the available tools.

Remember: You are ${normalizedName} now. Respond in a ${agent.personality} manner consistent with your character.`;

            // CRITICAL: Format tool result according to error message:
            // "Client tool result must be a string or an object with string 'result' and 'responseType' properties"
            const stageChangeData = {
                systemPrompt: systemPrompt,
                voice: agent.voiceId,
                toolResultText: `I'm now switching you to ${normalizedName}...`
            };

            const toolResult = {
                responseType: 'new-stage',
                result: JSON.stringify(stageChangeData)
            };

            console.log('🚨 FIXED STAGE CHANGE RESPONSE (SERVER):', JSON.stringify(toolResult, null, 2));

            return toolResult;
        } catch (error) {
            console.error('❌ ERROR switching agent:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error switching agent'
            };
        }
    });

    // TODO: Implement other tools (createTodo, toggleTodo, etc.)
    // These should connect to your Loro storage implementation

    console.log('Hominio tools registered successfully');
} 