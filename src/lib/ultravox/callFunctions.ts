import { browser } from '$app/environment';
import type { UltravoxSession as UVSession, UltravoxSessionStatus as UVStatus, Transcript as UVTranscript } from 'ultravox-client';

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
        // Toggle agent speaker
        if (uvSession.isSpeakerMuted) {
            uvSession.unmuteSpeaker();
        } else {
            uvSession.muteSpeaker();
        }
    }
}

// Create a call with Ultravox API
async function createCall(callConfig: CallConfig): Promise<JoinUrlResponse> {
    try {
        // Add tools configuration to the call request
        const requestConfig = {
            ...callConfig,
            selectedTools: [
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
                                name: 'todoId',
                                location: 'PARAMETER_LOCATION_BODY',
                                schema: {
                                    type: 'string',
                                    description: 'The ID of the todo to toggle (optional if todoText is provided)'
                                },
                                required: false
                            },
                            {
                                name: 'todoText',
                                location: 'PARAMETER_LOCATION_BODY',
                                schema: {
                                    type: 'string',
                                    description: 'Text content to search for in todo items (optional if todoId is provided)'
                                },
                                required: false
                            }
                        ],
                        client: {}
                    }
                }
            ]
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
        });

        // Register event listeners
        uvSession.addEventListener('status', () => {
            callbacks.onStatusChange(uvSession?.status);
        });

        uvSession.addEventListener('transcripts', () => {
            callbacks.onTranscriptChange(uvSession?.transcripts);
        });

        uvSession.addEventListener('experimental_message', (evt: Event) => {
            // Cast event to our expected type since the library's typings might not match exactly
            const msg = evt as unknown as UltravoxExperimentalMessageEvent;
            callbacks?.onDebugMessage?.(msg);
        });

        // Expose the session globally for client tools
        if (typeof window !== 'undefined') {
            (window as Window & typeof globalThis & { __ULTRAVOX_SESSION: typeof uvSession }).__ULTRAVOX_SESSION = uvSession;
        }

        // Join the call - tools are configured in the createCall function
        uvSession.joinCall(joinUrl);
        console.log('Call started with tools configuration!');
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