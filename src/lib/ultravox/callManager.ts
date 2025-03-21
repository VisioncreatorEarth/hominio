import { browser } from '$app/environment';
import type { UltravoxSession, Vibe, CallCallbacks, Tool } from './types';
import { loadVibe } from './vibeLoader';
import { registerToolImplementations } from './toolRegistry';
import { currentAgent } from './agentManager';

// Track current session for direct access
let uvSession: UltravoxSession | null = null;

// Track current vibe
let currentVibe: Vibe | null = null;

/**
 * Format tools for the Ultravox API
 */
function formatToolsForUltravox(tools: Tool[], agentToolIds: string[] = []) {
    return tools.map(tool => {
        if (tool.config.id === 'hangUp') {
            return { toolName: "hangUp" };
        } else if (agentToolIds.includes(tool.config.id) ||
            tool.config.id === 'switchAgent') {
            return {
                temporaryTool: {
                    modelToolName: tool.config.id,
                    description: tool.config.description,
                    dynamicParameters: tool.config.parameters,
                    client: {}
                }
            };
        }
        return null;
    }).filter(Boolean);
}

/**
 * Create a call with the Ultravox API
 */
async function createCall(callConfig: any) {
    try {
        const response = await fetch('/callHominio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(callConfig),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data = await response.json();
        console.log(`📞 Call created. Join URL: ${data.joinUrl}`);

        return data;
    } catch (error) {
        console.error('❌ Error creating call:', error);
        throw error;
    }
}

/**
 * Join a call with the given URL
 */
async function joinCall(joinUrl: string, vibe: Vibe, callbacks: CallCallbacks) {
    if (!browser) {
        throw new Error('Can only join calls in browser environment');
    }

    console.log('🔗 Joining call:', joinUrl);

    try {
        // Import the Ultravox client dynamically (browser-only)
        const { UltravoxSession } = await import('ultravox-client');

        // Start up our Ultravox Session
        uvSession = new UltravoxSession({
            experimentalMessages: new Set(["debug"])
        });

        // Register all tools with Ultravox
        registerToolImplementations(uvSession, vibe.tools);

        // Set the current vibe
        currentVibe = vibe;

        // Update the current agent to match the default
        currentAgent.set(vibe.defaultAgent.id);

        // Register event listeners
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
                            currentAgent.set(newAgentName);
                            console.log(`🌟 Current agent updated to: ${newAgentName}`);
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
            console.log('🧪 EXPERIMENTAL MESSAGE:', evt);
            callbacks?.onDebugMessage?.(evt);
        });

        // Expose the session globally for client tools
        if (typeof window !== 'undefined') {
            console.log('💾 Exposing Ultravox session globally for tool access');
            (window as Window & typeof globalThis & { __ULTRAVOX_SESSION: typeof uvSession }).__ULTRAVOX_SESSION = uvSession;
        }

        // Join the call - tools are configured in the createCall function
        uvSession.joinCall(joinUrl);
        console.log('📞 Call started with tools configuration!');

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
        console.error('❌ Error joining call:', error);
        throw error;
    }
}

/**
 * Start a call with a specific vibe
 */
export async function startCall(
    vibeName: string,
    callbacks: CallCallbacks
): Promise<boolean> {
    if (!browser) {
        throw new Error('Can only start calls in browser environment');
    }

    try {
        console.log(`🚀 Starting call with vibe: ${vibeName}`);

        // 1. Load the vibe (agents and tools)
        const vibe = await loadVibe(vibeName);

        // 2. Configure initial call settings
        const callConfig = {
            systemPrompt: vibe.defaultAgent.systemPromptTemplate,
            model: 'fixie-ai/ultravox-70B',
            voice: vibe.defaultAgent.voiceId,
            languageHint: 'en',
            temperature: 0.7,
            selectedTools: formatToolsForUltravox(vibe.tools, vibe.defaultAgent.tools)
        };

        // 3. Create API call to get join URL
        const callData = await createCall(callConfig);

        // 4. Join the call
        await joinCall(callData.joinUrl, vibe, callbacks);

        return true;
    } catch (error) {
        console.error('❌ Failed to start call:', error);
        callbacks.onStatusChange('error');
        return false;
    }
}

/**
 * End the current call
 */
export async function endCall(): Promise<void> {
    if (!browser || !uvSession) {
        console.error('❌ No active session to end');
        return;
    }

    console.log('📞 Ending call...');
    try {
        uvSession.leaveCall();
        uvSession = null;
        currentVibe = null;
        console.log('✅ Call ended.');
    } catch (error) {
        console.error('❌ Error ending call:', error);
        throw error;
    }
}

/**
 * Toggle the microphone mute state
 */
export function toggleMic(): void {
    if (!browser || !uvSession) {
        console.error('❌ No active session');
        return;
    }

    if (uvSession.isMicMuted) {
        uvSession.unmuteMic();
        console.log('🎤 Microphone unmuted');
    } else {
        uvSession.muteMic();
        console.log('🎤 Microphone muted');
    }
}

/**
 * Get the currently active vibe
 */
export function getCurrentVibe(): Vibe | null {
    return currentVibe;
} 