import { writable } from 'svelte/store';

// Define types for Ultravox tools and agents
export type ToolResponse = {
    success?: boolean;
    message?: string;
    error?: string;
    responseType?: string;
    systemPrompt?: string;
    voice?: string;
    toolResultText?: string;
    result?: string;
};

export type FilterParams = {
    tag?: string;
};

export type CreateTodoParams = {
    todoText: string;
    tags?: string;
};

export type ToggleTodoParams = {
    todoText: string;
};

export type UpdateTodoParams = {
    todoText: string;
    newText: string;
    tags?: string;
};

export type RemoveTodoParams = {
    todoText: string;
};

export type SwitchAgentParams = {
    agentName?: string;
};

// Define agent config type
export type AgentConfig = {
    personality: string;
    voiceId: string;
    tools: string[];
    description: string;
};

// Define valid agent names
export type AgentName = 'Oliver' | 'Hominio';

// Create stores for state management
export const currentFilter = writable('all');
export const currentAgent = writable<AgentName>('Hominio');

// Centralized agent configurations
export const agentConfigs: Record<AgentName, AgentConfig> = {
    'Oliver': {
        personality: 'professional and efficient',
        voiceId: 'dcb65d6e-9a56-459e-bf6f-d97572e2fe64',
        tools: [
            'createTodo',
            'toggleTodo',
            'updateTodo',
            'removeTodo',
            'filterTodos',
            'switchAgent'
        ],
        description: 'specialized in todo creation and management'
    },
    'Hominio': {
        personality: 'helpful and attentive',
        voiceId: 'b0e6b5c1-3100-44d5-8578-9015aa3023ae',
        tools: ['switchAgent'],
        description: 'central orchestrator'
    }
};

// Base tool definitions that are always available
export const baseTools = [
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
                        description: 'The name of the agent to switch to (e.g. "Oliver", "Hominio")'
                    },
                    required: true
                }
            ],
            client: {}
        }
    }
];

// Agent-specific tool definitions
export const agentTools = {
    Oliver: [
        {
            temporaryTool: {
                modelToolName: 'createTodo',
                description: 'Create a new todo item. Use this tool when a todo needs to be created. NEVER emit text when doing this tool call.',
                dynamicParameters: [
                    {
                        name: 'todoText',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'The text content of the todo task to create'
                        },
                        required: true
                    },
                    {
                        name: 'tags',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'Optional comma-separated list of tags (e.g. "work,urgent,home")'
                        },
                        required: false
                    }
                ],
                client: {}
            }
        },
        {
            temporaryTool: {
                modelToolName: 'toggleTodo',
                description: 'Toggle the completion status of a todo. Use this tool when a todo needs to be marked as complete or incomplete. NEVER emit text when doing this tool call.',
                dynamicParameters: [
                    {
                        name: 'todoText',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'Text content to search for in todo items'
                        },
                        required: true
                    }
                ],
                client: {}
            }
        },
        {
            temporaryTool: {
                modelToolName: 'updateTodo',
                description: 'Update an existing todo. Use this tool when a todo needs to be modified. NEVER emit text when doing this tool call.',
                dynamicParameters: [
                    {
                        name: 'todoText',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'Current text content to search for'
                        },
                        required: true
                    },
                    {
                        name: 'newText',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'New text content for the todo'
                        },
                        required: true
                    },
                    {
                        name: 'tags',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'Optional comma-separated list of new tags'
                        },
                        required: false
                    }
                ],
                client: {}
            }
        },
        {
            temporaryTool: {
                modelToolName: 'removeTodo',
                description: 'Delete a todo from the list. Use this tool when a todo needs to be removed. NEVER emit text when doing this tool call.',
                dynamicParameters: [
                    {
                        name: 'todoText',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'Text content to search for in todo items'
                        },
                        required: true
                    }
                ],
                client: {}
            }
        },
        {
            temporaryTool: {
                modelToolName: 'filterTodos',
                description: 'Filter todos by tag. Use this tool when a user wants to view todos with specific tags. NEVER emit text when doing this tool call.',
                dynamicParameters: [
                    {
                        name: 'tag',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'The tag to filter by, or "all" to show all todos'
                        },
                        required: true
                    }
                ],
                client: {}
            }
        }
    ],
    Hominio: []
};

// Define tool interfaces for better typing
export interface ToolDefinition {
    toolName: string;
}

export interface TemporaryToolDefinition {
    temporaryTool: {
        modelToolName: string;
        description: string;
        dynamicParameters: {
            name: string;
            location: string;
            schema: {
                type: string;
                description: string;
            };
            required: boolean;
        }[];
        client: Record<string, unknown>;
    };
}

export type ToolConfig = ToolDefinition | TemporaryToolDefinition;

// Helper function to create stage change data for an agent
export function createAgentStageChangeData(agentName: AgentName): {
    systemPrompt: string;
    voice: string;
    toolResultText: string;
    selectedTools: ToolConfig[];
} {
    // Normalize agent name
    const normalizedName = agentName in agentConfigs ? agentName : 'Hominio';

    // Get agent configuration
    const agent = agentConfigs[normalizedName];

    // Get the specialized tools for this agent
    const toolsDescription = agent.tools.filter(t => t !== 'switchAgent').join(', ');

    // Create personalized system prompt for the agent
    const systemPrompt = `You are now ${normalizedName}, a friendly assistant for the Hominio todo app. 
Your personality is more ${agent.personality}. 
You are ${agent.description}.

Your specialized tools are: ${toolsDescription || 'None'}. 
You should always use the switchAgent tool to redirect users to the appropriate specialist when they need help outside your expertise.

Guidelines based on your role:
- Oliver: Handles all todo operations including creation, updating, deletion, and filtering
- Hominio: Central orchestrator who directs users to Oliver for todo management tasks

Continue helping the user with their todo management tasks using your available tools.

Remember: You are ${normalizedName} now. Respond in a ${agent.personality} manner consistent with your character.`;

    return {
        systemPrompt,
        voice: agent.voiceId,
        toolResultText: `I'm now switching you to ${normalizedName}...`,
        selectedTools: [
            { toolName: 'hangUp' },
            {
                temporaryTool: {
                    modelToolName: 'switchAgent',
                    description:
                        'Switch to a different agent personality. Use this tool when a user asks to speak to a different agent.',
                    dynamicParameters: [
                        {
                            name: 'agentName',
                            location: 'PARAMETER_LOCATION_BODY',
                            schema: {
                                type: 'string',
                                description: 'The name of the agent to switch to'
                            },
                            required: true
                        }
                    ],
                    client: {}
                }
            },
            // Add agent-specific tools
            ...(normalizedName in agentTools ? agentTools[normalizedName] : [])
        ]
    };
} 