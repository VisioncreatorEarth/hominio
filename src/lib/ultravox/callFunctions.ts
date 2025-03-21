import { browser } from '$app/environment';
import type { UltravoxSession as UVSession, UltravoxSessionStatus as UVStatus, Transcript as UVTranscript, ClientToolImplementation } from 'ultravox-client';

// Define types for our Ultravox integration
export type CallConfig = {
    systemPrompt: string;
    model?: string;
    languageHint?: string;
    voice?: string;
    temperature?: number;
    maxDuration?: string;
    timeExceededMessage?: string;
};

export type JoinUrlResponse = {
    callId: string;
    joinUrl: string;
    created: string;
    ended: string | null;
    model: string;
};

// Re-export types from ultravox-client
export { UltravoxSessionStatus } from 'ultravox-client';

export enum Role {
    USER = 'user',
    AGENT = 'agent'
}

export type Transcript = {
    speaker: 'agent' | 'user';
    text: string;
};

export type UltravoxExperimentalMessageEvent = {
    message: {
        message: string;
        timestamp: number;
    };
};

// Ultravox session
let uvSession: UVSession | null = null;
const debugMessages: Set<string> = new Set(["debug"]);

// Call callbacks interface
export interface CallCallbacks {
    onStatusChange: (status: UVStatus | string | undefined) => void;
    onTranscriptChange: (transcripts: UVTranscript[] | undefined) => void;
    onDebugMessage?: (message: UltravoxExperimentalMessageEvent) => void;
}

// Toggle mic/speaker mute state
export function toggleMute(role: Role): void {
    if (!browser || !uvSession) {
        console.error('uvSession is not initialized or not in browser environment');
        return;
    }

    if (role === Role.USER) {
        // Toggle user microphone
        if (uvSession.isMicMuted) {
            uvSession.unmuteMic();
        } else {
            uvSession.muteMic();
        }
    } else {
        // For agent, always ensure speaker is unmuted
        if (uvSession.isSpeakerMuted) {
            console.log('🔊 Unmuting speaker (speaker should never be muted)');
            uvSession.unmuteSpeaker();
        }
        // We never mute the speaker - just unmute if it somehow got muted
    }
}

// Force unmute speaker and microphone
export function forceUnmuteSpeaker(): void {
    if (!browser || !uvSession) {
        console.error('uvSession is not initialized or not in browser environment');
        return;
    }

    // Make sure speaker is unmuted
    if (uvSession.isSpeakerMuted) {
        console.log('🔊 Force unmuting speaker');
        uvSession.unmuteSpeaker();
    }

    // Also make sure microphone is unmuted
    if (uvSession.isMicMuted) {
        console.log('🎤 Force unmuting microphone');
        uvSession.unmuteMic();
    }
}

// Define tools configuration following askHominio.ts pattern
const tools = [
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
    }
];

// Define the agent-specific tools that will be added during stage changes
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
                description: 'Update a todo\'s text or tags. Use this tool when a todo needs to be edited. NEVER emit text when doing this tool call.',
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
                            description: 'The new text content for the todo'
                        },
                        required: true
                    },
                    {
                        name: 'tags',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'Optional comma-separated list of tags'
                        },
                        required: false
                    }
                ],
                client: {}
            }
        }
    ],
    Mark: [
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
    Rajesh: [
        {
            temporaryTool: {
                modelToolName: 'createList',
                description: 'Create a new todo list. Use this tool when a user wants to create a new list. NEVER emit text when doing this tool call.',
                dynamicParameters: [
                    {
                        name: 'listName',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'The name to give to the new list'
                        },
                        required: true
                    }
                ],
                client: {}
            }
        },
        {
            temporaryTool: {
                modelToolName: 'switchList',
                description: 'Switch to a different todo list. Use this tool when a user wants to change lists. NEVER emit text when doing this tool call.',
                dynamicParameters: [
                    {
                        name: 'listName',
                        location: 'PARAMETER_LOCATION_BODY',
                        schema: {
                            type: 'string',
                            description: 'The name of the list to switch to'
                        },
                        required: true
                    }
                ],
                client: {}
            }
        }
    ]
};

// Create a call with Ultravox API
async function createCall(callConfig: CallConfig): Promise<JoinUrlResponse> {
    try {
        // Add tools configuration to the call request
        const requestConfig = {
            ...callConfig,
            selectedTools: tools
        };

        const response = await fetch('/callHominio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestConfig),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data: JoinUrlResponse = await response.json();
        console.log(`Call created. Join URL: ${data.joinUrl}`);

        return data;
    } catch (error) {
        console.error('Error creating call:', error);
        throw error;
    }
}

// Start a call
export async function startCall(callbacks: CallCallbacks, callConfig: CallConfig): Promise<void> {
    if (!browser) {
        console.error('Not in browser environment');
        return;
    }

    try {
        // Call our API to get a join URL
        const callData = await createCall(callConfig);
        const joinUrl = callData.joinUrl;

        if (!joinUrl) {
            console.error('Join URL is required');
            return;
        }

        console.log('Joining call:', joinUrl);

        // Import the Ultravox client dynamically (browser-only)
        const { UltravoxSession } = await import('ultravox-client');

        // Start up our Ultravox Session
        uvSession = new UltravoxSession({
            experimentalMessages: debugMessages
            // Stages are supported by default in newer versions of Ultravox
        });

        // Register client tools if they are exposed on window.__hominio_tools
        if (typeof window !== 'undefined' && (window as Window & typeof globalThis & { __hominio_tools?: Record<string, ClientToolImplementation> }).__hominio_tools) {
            console.log('🔧 Registering client tool implementations with Ultravox session');
            const toolImpls = (window as Window & typeof globalThis & { __hominio_tools: Record<string, ClientToolImplementation> }).__hominio_tools;

            // Track registered tools to ensure they are all properly set up
            const registeredToolNames: string[] = [];

            // Register each tool with the Ultravox session
            for (const [toolName, toolImpl] of Object.entries(toolImpls)) {
                console.log(`🔧 Registering tool: ${toolName}`);
                try {
                    uvSession.registerToolImplementation(toolName, toolImpl);
                    console.log(`✅ Successfully registered tool: ${toolName}`);
                    registeredToolNames.push(toolName);
                } catch (error) {
                    console.error(`❌ Failed to register tool ${toolName}:`, error instanceof Error ? error.message : String(error));
                }
            }

            // Log all registered tools
            console.log('🔍 Registered tools:', registeredToolNames.join(', '));

            // Double-check critical tools are registered
            const expectedTools = Object.keys(toolImpls);
            console.log('🔧 Expected tools:', expectedTools.join(', '));

            // Try registering any missing tools again
            for (const toolName of expectedTools) {
                if (!registeredToolNames.includes(toolName)) {
                    console.log(`⚠️ Re-attempting to register missing tool: ${toolName}`);
                    try {
                        const toolImpl = toolImpls[toolName];
                        uvSession.registerToolImplementation(toolName, toolImpl);
                        console.log(`✅ Successfully registered tool on retry: ${toolName}`);
                    } catch (unknownError) {
                        const errorMessage =
                            unknownError instanceof Error
                                ? unknownError.message
                                : 'Unknown error during tool registration';
                        console.error(`❌ Failed to register tool ${toolName} on retry:`, errorMessage);
                    }
                }
            }
        } else {
            console.warn('❌ No window.__hominio_tools found. Client tools will not work!');
        }

        // Register event listeners
        console.log('🌟 Attempting to register stage_change event listener');
        uvSession.addEventListener('stage_change', async (evt: Event) => {
            console.log('🌟 STAGE CHANGE EVENT RECEIVED', evt);

            // Log detailed information about the event
            const stageChangeEvent = evt as unknown as {
                detail?: {
                    stageId?: string;
                    voiceId?: string;
                    systemPrompt?: string;
                }
            };

            if (stageChangeEvent?.detail) {
                console.log('🌟 STAGE CHANGE DETAILS:', {
                    stageId: stageChangeEvent.detail.stageId,
                    voiceId: stageChangeEvent.detail.voiceId,
                    systemPromptExcerpt: stageChangeEvent.detail.systemPrompt?.substring(0, 50) + '...'
                });

                // Update current agent if there's a system prompt change
                if (stageChangeEvent.detail.systemPrompt) {
                    // Import dynamically to avoid circular dependencies
                    const { currentAgent } = await import('./toolImplementation');
                    const { get } = await import('svelte/store');

                    // Try to extract agent name from system prompt
                    const systemPrompt = stageChangeEvent.detail.systemPrompt;
                    const agentMatch = systemPrompt.match(/You are now ([A-Za-z]+),/i);

                    if (agentMatch && agentMatch[1]) {
                        const newAgentName = agentMatch[1];
                        console.log(`🌟 Updating current agent to: ${newAgentName}`);

                        // Only update if it's changed
                        if (browser && get(currentAgent) !== newAgentName) {
                            currentAgent.set(newAgentName);
                            console.log(`🌟 Current agent updated to: ${newAgentName}`);

                            // No need to re-register tools - they are now provided directly in the stage change data
                            console.log('🌟 Tools provided directly in stage change data, no manual re-registration needed');
                        }
                    }
                }
            } else {
                console.log('🌟 STAGE CHANGE EVENT HAS NO DETAIL PROPERTY', JSON.stringify(evt));
            }

            // Ensure speaker is unmuted after stage change
            if (uvSession && uvSession.isSpeakerMuted) {
                console.log('🔊 Unmuting speaker after stage change');
                uvSession.unmuteSpeaker();
            }
        });

        // Add more logging for main events
        uvSession.addEventListener('status', () => {
            console.log('📡 ULTRAVOX STATUS CHANGE:', uvSession?.status);
            callbacks.onStatusChange(uvSession?.status);

            // Ensure speaker is unmuted after status change, especially when speaking
            if (uvSession?.status === 'speaking' && uvSession.isSpeakerMuted) {
                console.log('🔊 Unmuting speaker for speaking state');
                uvSession.unmuteSpeaker();
            }
        });

        uvSession.addEventListener('transcripts', () => {
            console.log('📝 TRANSCRIPTS UPDATED, count:', uvSession?.transcripts?.length);
            callbacks.onTranscriptChange(uvSession?.transcripts);

            // Ensure speaker is unmuted when transcripts update (agent likely about to speak)
            if (uvSession && uvSession.isSpeakerMuted) {
                console.log('🔊 Unmuting speaker after transcript update');
                uvSession.unmuteSpeaker();
            }
        });

        uvSession.addEventListener('experimental_message', (evt: Event) => {
            // Cast event to our expected type since the library's typings might not match exactly
            const msg = evt as unknown as UltravoxExperimentalMessageEvent;
            console.log('🧪 EXPERIMENTAL MESSAGE:', msg);
            callbacks?.onDebugMessage?.(msg);
        });

        // Expose the session globally for client tools
        if (typeof window !== 'undefined') {
            console.log('💾 Exposing Ultravox session globally for tool access');
            (window as Window & typeof globalThis & { __ULTRAVOX_SESSION: typeof uvSession }).__ULTRAVOX_SESSION = uvSession;

            // Add this line to the window for debugging
            console.log('🔍 Setting up debug flag for stage changes');
            (window as Window & typeof globalThis & { __DEBUG_STAGE_CHANGES: boolean }).__DEBUG_STAGE_CHANGES = true;
        }

        // Join the call - tools are configured in the createCall function
        uvSession.joinCall(joinUrl);
        console.log('Call started with tools configuration!');

        // Ensure mic and speaker are in the correct state after joining
        setTimeout(() => {
            if (uvSession) {
                // Always unmute the speaker to ensure we can hear the agent
                if (uvSession.isSpeakerMuted) {
                    console.log('🔊 Initial speaker unmute after joining call');
                    uvSession.unmuteSpeaker();
                }

                // Unmute the mic to ensure we can be heard
                if (uvSession.isMicMuted) {
                    console.log('🎤 Initial mic unmute after joining call');
                    uvSession.unmuteMic();
                }
            }
        }, 1000); // Wait a second after joining to ensure all is set up
    } catch (error) {
        console.error('Error starting call:', error);
        callbacks.onStatusChange('error');
        throw error;
    }
}

// End a call
export async function endCall(): Promise<void> {
    if (!browser || !uvSession) {
        console.error('uvSession is not initialized or not in browser environment');
        return;
    }

    console.log('Ending call...');
    try {
        uvSession.leaveCall();
        uvSession = null;
        console.log('Call ended.');
    } catch (error) {
        console.error('Error ending call:', error);
        throw error;
    }
} 