import { writable } from 'svelte/store';
import { agentTools } from './callFunctions';

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
type AgentName = 'Mark' | 'Emily' | 'Oliver' | 'Hominio' | 'Rajesh';

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
        voiceId: 'dcb65d6e-9a56-459e-bf6f-d97572e2fe64'
    },
    'Hominio': {
        personality: 'helpful and attentive',
        voiceId: 'b0e6b5c1-3100-44d5-8578-9015aa3023ae' // Default Jessica voice
    },
    'Rajesh': {
        personality: 'patient and detail-oriented',
        voiceId: 'a0df06e1-d90a-444a-906a-b9c873796f4e' // Indian voice
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

            // Get agent-specific tools
            const agentSpecificTools = agentTools[normalizedName as keyof typeof agentTools] || [];
            console.log(`🧩 Agent-specific tools:`, agentSpecificTools);

            // CRITICAL: Format tool result according to error message:
            // "Client tool result must be a string or an object with string 'result' and 'responseType' properties"
            const stageChangeData = {
                systemPrompt: systemPrompt,
                voice: agent.voiceId,
                toolResultText: `I'm now switching you to ${normalizedName}...`,
                selectedTools: [
                    {
                        toolName: "hangUp"
                    },
                    {
                        temporaryTool: {
                            modelToolName: 'switchAgent',
                            description: 'Switch to a different agent personality. Use this tool when a user asks to speak to a different agent. NEVER emit text when doing this tool call.',
                            dynamicParameters: [
                                {
                                    name: 'agentName',
                                    location: 'PARAMETER_LOCATION_BODY',
                                    schema: {
                                        type: 'string',
                                        description: 'The name of the agent to switch to (e.g. "Mark", "Oliver", "Rajesh", "Hominio")'
                                    },
                                    required: true
                                }
                            ],
                            client: {}
                        }
                    },
                    ...agentSpecificTools
                ]
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

export async function switchAgent(params: { agentName?: string }): Promise<Response> {
    console.log('🔄 SERVER: switchAgent called with params:', params);

    try {
        // Normalize agent name
        let normalizedName = (params.agentName || 'Hominio') as AgentName;

        // Convert aliases/variations to standard names
        if (normalizedName.toLowerCase() === 'ali') {
            normalizedName = 'Mark';
        } else if (normalizedName.toLowerCase() === 'sam') {
            normalizedName = 'Oliver';
        } else if (normalizedName.toLowerCase().includes('tech') || normalizedName.toLowerCase().includes('support')) {
            normalizedName = 'Rajesh';
        }

        // Make sure we have a valid enum value
        if (!(normalizedName in agentConfig)) {
            normalizedName = 'Hominio';
        }

        // Update the current agent in the store
        currentAgent.set(normalizedName);

        // Get agent config
        const agent = agentConfig[normalizedName];

        // Create agent-specific descriptions
        const agentDescriptions = {
            'Mark': 'specialized in deletion, filtering, and list management',
            'Oliver': 'specialized in todo creation and management',
            'Rajesh': 'technical support specialist who helps with app-related issues',
            'Hominio': 'central orchestrator'
        };

        // Create specialized tool descriptions
        const toolDescriptions = {
            'Mark': 'removeTodo, filterTodos, createList, switchList',
            'Oliver': 'createTodo, toggleTodo, updateTodo',
            'Rajesh': '',
            'Hominio': ''
        };

        // Create a system prompt for the new agent
        const systemPrompt = `You are now ${normalizedName}, a friendly assistant for the Hominio todo app. 
Your personality is more ${agent.personality}. 
You are ${agentDescriptions[normalizedName as keyof typeof agentDescriptions]}.

Your specialized tools are: ${toolDescriptions[normalizedName as keyof typeof toolDescriptions] || 'None'}. 
You should always use the switchAgent tool to redirect users to the appropriate specialist when they need help outside your expertise.

Guidelines based on your role:
- Mark: Handles deletion tasks, filtering todos, and managing todo lists
- Oliver: Handles creating, toggling, and updating todos
- Rajesh: Technical support specialist who helps with app-related issues
- Hominio: Central orchestrator who directs users to the appropriate specialist

Continue helping the user with their todo management tasks using your available tools.

Remember: You are ${normalizedName} now. Respond in a ${agent.personality} manner consistent with your character.`;

        // Get agent-specific tools
        const agentSpecificTools = agentTools[normalizedName as keyof typeof agentTools] || [];

        const stageChangeData = {
            systemPrompt,
            voice: agent.voiceId,
            toolResultText: `I'm now switching you to ${normalizedName}...`,
            selectedTools: [
                {
                    toolName: "hangUp"
                },
                {
                    temporaryTool: {
                        modelToolName: 'switchAgent',
                        description: 'Switch to a different agent personality. Use this tool when a user asks to speak to a different agent.',
                        dynamicParameters: [
                            {
                                name: 'agentName',
                                location: 'PARAMETER_LOCATION_BODY',
                                schema: {
                                    type: 'string',
                                    description: 'The name of the agent to switch to (e.g. "Mark", "Oliver", "Rajesh", "Hominio")'
                                },
                                required: true
                            }
                        ],
                        client: {}
                    }
                },
                ...agentSpecificTools
            ]
        };

        return new Response(JSON.stringify(stageChangeData), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('❌ SERVER ERROR in switchAgent:', error);
        return new Response(
            JSON.stringify({
                success: false,
                message: 'Failed to switch agent',
                error: error instanceof Error ? error.message : 'Unknown error'
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
} 