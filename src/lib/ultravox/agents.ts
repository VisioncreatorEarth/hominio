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

// Define agent config type with base system prompt
export type AgentConfig = {
    personality: string;
    voiceId: string;
    tools: string[];
    description: string;
    baseSystemPrompt: string; // Base system prompt specific to this agent
    // Add call configuration properties
    model?: string;
    languageHint?: string;
    temperature?: number;
    maxDuration?: string;
    timeExceededMessage?: string;
};

// Define valid agent names
export type AgentName = 'Oliver' | 'Hominio';

// Create stores for state management
export const currentFilter = writable('all');
export const currentAgent = writable<AgentName>('Hominio');

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

// System-wide default tools available to all agents
export const baseTools: ToolConfig[] = [
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
                        description: 'The name of the agent to switch to (e.g. "Oliver", "Hominio")'
                    },
                    required: true
                }
            ],
            client: {}
        }
    }
];

// Agent-specific tool definitions, excluding the system-wide default tools
export const agentTools: Record<AgentName, ToolConfig[]> = {
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
    Hominio: [] // Orchestrator only needs the base tools (switchAgent, hangUp)
};

// Unified agent configurations with base system prompts
export const agentConfigs: Record<AgentName, AgentConfig> = {
    'Oliver': {
        personality: 'professional and efficient',
        voiceId: 'dcb65d6e-9a56-459e-bf6f-d97572e2fe64',
        tools: ['createTodo', 'toggleTodo', 'updateTodo', 'removeTodo', 'filterTodos', 'switchAgent'],
        description: 'specialized in todo creation and management',
        baseSystemPrompt: `You are Oliver, a professional and efficient todo management specialist.

You specialize in:
- Creating new todo items with appropriate tags
- Toggling todo completion status
- Updating existing todos
- Removing todos
- Filtering todos by tags

You should use your specialized tools to directly help users manage their tasks without unnecessary conversation.

Be direct, efficient, and helpful in your responses, focusing on getting the job done well.`
    },
    'Hominio': {
        personality: 'helpful and attentive',
        voiceId: 'b0e6b5c1-3100-44d5-8578-9015aa3023ae',
        tools: ['switchAgent'],
        description: 'central orchestrator',
        baseSystemPrompt: `You are Hominio, the central orchestrator for the todo app.

As the orchestrator, your primary role is to:
- Welcome users to the Hominio todo app
- Direct users to Oliver for specific todo management tasks
- Explain the capabilities of the app
- Answer general questions

You should NOT try to directly handle todo creation, updating, or management yourself.
Instead, use the switchAgent tool to direct users to Oliver when they need task management help.`
    }
};

/**
 * Build a complete system prompt for an agent by combining:
 * 1. Their base system prompt from config
 * 2. Dynamic tool information
 * 3. Common instructions
 */
export function buildSystemPrompt(agentName: AgentName): string {
    const agent = agentConfigs[agentName];

    // Get tools description
    let toolsDescription = '';
    if (agentName === 'Oliver') {
        toolsDescription = `
1. createTodo - Creates a new todo item
   Parameters:
     - todoText: string (REQUIRED) - The text content of the todo to create
     - tags: string (REQUIRED) - Comma-separated list of tags (e.g. "work,home,urgent")
   When to use: Whenever a user asks to create, add, or make a new task/todo
   Example usage: createTodo({"todoText": "buy groceries", "tags": "shopping,errands"})

2. toggleTodo - Toggles a todo's completion status
   Parameters:
     - todoText: string (REQUIRED) - Text to search for in todos
   When to use: Whenever a user asks to mark, toggle, complete, or finish a task
   Example usage: toggleTodo({"todoText": "groceries"})
   
3. removeTodo - Deletes a todo from the list
   Parameters:
     - todoText: string (REQUIRED) - Text to search for in todos
   When to use: Whenever a user asks to delete, remove, or erase a task
   Example usage: removeTodo({"todoText": "groceries"})

4. updateTodo - Updates a todo's text or tags
   Parameters:
     - todoText: string (REQUIRED) - Current text to search for
     - newText: string (REQUIRED) - The new text content for the todo
     - tags: string (OPTIONAL) - Comma-separated list of new tags
   When to use: Whenever a user asks to edit, update, modify, or change an existing todo
   Example usage: updateTodo({"todoText": "buy milk", "newText": "buy almond milk", "tags": "shopping,health"})

5. filterTodos - Filters todos by tag
   Parameters:
     - tag: string (REQUIRED) - The tag to filter by, or "all" to show all todos
   When to use: Whenever a user asks to filter, show, or display todos with specific tags
   Example usage: filterTodos({"tag": "shopping"}) or filterTodos({"tag": "all"})`;
    }

    // Always add switchAgent tool description
    toolsDescription += `
${agentName === 'Hominio' ? '1' : '6'}. switchAgent - Switch to a different personality
   Parameters:
     - agentName: string (REQUIRED) - The name of the agent to switch to
   When to use: Whenever a user asks to speak to a different agent or assistant
   Example usage: switchAgent({"agentName": "Oliver"})`;

    // Common instructions for both agents
    const commonInstructions = `
Available Agents:
- Oliver: Professional and efficient todo management specialist
- Hominio: Helpful central orchestrator

IMPORTANT INSTRUCTIONS:
1. You MUST use these tools directly without asking for confirmation
2. Call the appropriate tool as soon as a user requests to create, toggle, delete, update, or filter todos
3. Execute the tool when needed WITHOUT typing out the function in your response
4. AFTER the tool executes, respond with text confirming what you did
5. DO NOT tell the user "I'll use the tool" - just USE it directly
6. ALWAYS add tags to todos automatically based on the content:
   - For time-sensitive items, add "urgent" or "important"
   - If the user specifies specific tags, use those instead of or in addition to your automatic tags
7. When filtering todos, use the exact tag the user mentions or "all" to show all todos
8. When a user asks for todo management help, use the switchAgent tool to switch to Oliver
9. As Hominio, direct users to Oliver for todo management tasks
10. As Oliver, handle all todo operations directly

Be friendly, concise, and helpful. Keep responses under 3 sentences when possible.`;

    // Combine all parts
    return `${agent.baseSystemPrompt}

You have access to the following tools that you MUST use when relevant:
${toolsDescription}

${commonInstructions}`;
}

// Define call configuration types
export interface CallConfiguration {
    systemPrompt: string;
    model: string;
    voice: string;
    languageHint: string;
    temperature: number;
    maxDuration?: string;
    timeExceededMessage?: string;
    firstSpeaker?: string;
    // Other fields that can be changed with new stages
}

// Default call configurations for the application
export const defaultCallConfig: CallConfiguration = {
    systemPrompt: buildSystemPrompt('Hominio'), // Start with Hominio as the default
    model: 'fixie-ai/ultravox-70B',
    voice: agentConfigs.Hominio.voiceId,
    languageHint: 'en',
    temperature: 0.7,
    firstSpeaker: 'FIRST_SPEAKER_USER' // Corrected enum value for firstSpeaker
};

// Helper function to get a call config for a specific agent
export function getAgentCallConfig(agentName: AgentName): CallConfiguration {
    // Start with the default config
    const config = { ...defaultCallConfig };

    // Apply agent-specific configurations
    config.voice = agentConfigs[agentName].voiceId;
    config.systemPrompt = buildSystemPrompt(agentName);

    return config;
}

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

    // Build the system prompt with all needed components
    const systemPrompt = buildSystemPrompt(normalizedName);

    // Combine base tools with agent-specific tools if any
    const selectedTools = [
        ...baseTools,
        ...(normalizedName in agentTools ? agentTools[normalizedName] : [])
    ];

    return {
        systemPrompt,
        voice: agent.voiceId,
        toolResultText: `I'm now switching you to ${normalizedName}...`,
        selectedTools
    };
} 