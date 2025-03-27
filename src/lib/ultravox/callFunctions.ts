import { browser } from '$app/environment';
import type { UltravoxSession as UVSession, ClientToolImplementation } from 'ultravox-client';
import { currentAgent, type AgentName } from './agents';
import { createCall } from './createCall';
import { Role } from './types';
import type {
    CallCallbacks,
    UltravoxExperimentalMessageEvent,
    CallConfig,
} from './types';

// Re-export types from ultravox-client
export { UltravoxSessionStatus } from 'ultravox-client';

// Re-export our Role enum
export { Role };

// Ultravox session
let uvSession: UVSession | null = null;
const debugMessages: Set<string> = new Set(["debug"]);

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

// Track last processed transcript to prevent loops
let lastProcessedTranscriptCount = 0;

// Start a call
export async function startCall(callbacks: CallCallbacks, callConfig: CallConfig, vibeId = 'home'): Promise<void> {
    if (!browser) {
        console.error('Not in browser environment');
        return;
    }

    try {
        // Call our API to get a join URL using the imported createCall function
        console.log(`🚀 Starting call using vibe: ${vibeId}`);
        const callData = await createCall(callConfig, vibeId);
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
                    // Try to extract agent name from system prompt
                    const systemPrompt = stageChangeEvent.detail.systemPrompt;
                    const agentMatch = systemPrompt.match(/You are now ([A-Za-z]+),/i);

                    if (agentMatch && agentMatch[1]) {
                        const newAgentName = agentMatch[1];
                        console.log(`🌟 Updating current agent to: ${newAgentName}`);

                        // Only update if it's changed
                        if (browser) {
                            // Using the imported currentAgent store
                            const { get } = await import('svelte/store');
                            if (get(currentAgent) !== newAgentName) {
                                // Cast to AgentName type for type safety
                                const validAgentName = newAgentName as AgentName;
                                currentAgent.set(validAgentName);
                                console.log(`🌟 Current agent updated to: ${newAgentName}`);

                                // No need to re-register tools - they are now provided directly in the stage change data
                                console.log('🌟 Tools provided directly in stage change data, no manual re-registration needed');
                            }
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
            const transcripts = uvSession?.transcripts;
            const currentCount = transcripts?.length || 0;

            // Only process if we have new transcripts and not in a feedback loop
            if (currentCount > lastProcessedTranscriptCount) {
                console.log('📝 NEW TRANSCRIPTS, count:', currentCount - lastProcessedTranscriptCount);

                // Update the processed count
                lastProcessedTranscriptCount = currentCount;

                // Only send the new transcripts to the callback
                callbacks.onTranscriptChange(transcripts);

                // Ensure speaker is unmuted when transcripts update (agent likely about to speak)
                if (uvSession && uvSession.isSpeakerMuted) {
                    console.log('🔊 Unmuting speaker after transcript update');
                    uvSession.unmuteSpeaker();
                }
            } else {
                console.log('🔄 Skipping duplicate transcript update');
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
            // Use 'any' to bypass the type checking issues between different UltravoxSession types
            (window as any).__ULTRAVOX_SESSION = uvSession;

            // Add this line to the window for debugging
            console.log('🔍 Setting up debug flag for stage changes');
            (window as any).__DEBUG_STAGE_CHANGES = true;
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