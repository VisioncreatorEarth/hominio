import { browser } from '$app/environment';
import type { UltravoxSession as UVSession, ClientToolImplementation } from 'ultravox-client';
import { currentAgent } from './agents';
import { createCall } from './createCall';
import { Role } from './types';
import type {
    CallCallbacks,
    CallConfig,
} from './types';

// Type for AgentName used locally
type AgentName = string;

// Re-export types from ultravox-client
export { UltravoxSessionStatus } from 'ultravox-client';

// Re-export our Role enum
export { Role };

// Ultravox session
let uvSession: UVSession | null = null;

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

// Start a call
export async function startCall(callbacks: CallCallbacks, callConfig: CallConfig, vibeId = 'home'): Promise<void> {
    if (!browser) {
        console.error('Not in browser environment');
        return;
    }

    try {
        // Detect platform and environment
        const isRunningInTauri = typeof window !== 'undefined' &&
            ('__TAURI__' in window || navigator.userAgent.includes('Tauri'));

        // Try to detect operating system
        const isLinux = typeof navigator !== 'undefined' &&
            navigator.userAgent.toLowerCase().includes('linux');
        const isMacOS = typeof navigator !== 'undefined' &&
            (navigator.userAgent.toLowerCase().includes('mac os') ||
                navigator.platform.toLowerCase().includes('mac'));

        console.log('Environment check:', {
            isRunningInTauri,
            isLinux,
            isMacOS,
            platform: navigator?.platform || 'unknown',
            userAgent: navigator?.userAgent || 'unknown'
        });

        // Special handling for Tauri WebView environments
        if (isRunningInTauri) {
            console.warn('⚠️ Running in Tauri environment - applying special configuration');

            if (isLinux) {
                // Linux has known issues with mediaDevices in Tauri
                console.warn('⚠️ Linux + Tauri detected - microphone access is problematic on this platform');
                console.warn('⚠️ See: https://github.com/tauri-apps/tauri/issues/12547');
            }

            if (isMacOS) {
                console.log('🍎 macOS + Tauri detected - microphone should work with proper permissions');
                console.log('🔍 Checking if Info.plist is properly configured with NSMicrophoneUsageDescription');
            }

            // Create mock implementation only if mediaDevices is undefined
            if (!navigator.mediaDevices) {
                console.warn('⚠️ MediaDevices API not available - creating controlled fallback');
                // @ts-expect-error - intentionally creating a mock object
                navigator.mediaDevices = {
                    getUserMedia: async () => {
                        console.warn('⚠️ Mocked getUserMedia called - this is expected behavior in Tauri');
                        console.warn('⚠️ Make sure core:webview:allow-user-media permission is enabled in capabilities');
                        throw new Error('MEDIA_DEVICES_NOT_SUPPORTED_IN_TAURI');
                    },
                    // Add empty addEventListener to prevent errors
                    addEventListener: function (type: string) {
                        console.warn(`⚠️ Mocked mediaDevices.addEventListener called for event: ${type}`);
                        // No-op implementation
                    },
                    // Add empty removeEventListener to prevent "not a function" errors
                    removeEventListener: function (type: string) {
                        console.warn(`⚠️ Mocked mediaDevices.removeEventListener called for event: ${type}`);
                        // No-op implementation
                    }
                };
            }
        }

        // Check if media devices are available (after potential mocking)
        const hasMediaDevices = typeof navigator !== 'undefined' &&
            navigator.mediaDevices !== undefined &&
            typeof navigator.mediaDevices.getUserMedia === 'function';

        console.log('Media devices availability check:', { hasMediaDevices });

        let microphoneAvailable = false;

        // If media devices API is available, try to request microphone access
        if (hasMediaDevices) {
            console.log('Media devices API is available - attempting microphone access');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Release the stream immediately after testing
                stream.getTracks().forEach(track => track.stop());
                console.log('✅ Microphone access granted successfully');
                microphoneAvailable = true;
            } catch (micError) {
                console.warn('⚠️ Microphone access error:', micError);
                console.warn('⚠️ Continuing with text-only input mode');

                if (isRunningInTauri && isLinux) {
                    console.warn('⚠️ This is a known issue with Tauri on Linux - microphone access is not properly supported');
                }
            }
        } else {
            console.warn('⚠️ Media devices API not available - microphone input will be disabled');

            if (isRunningInTauri) {
                console.warn('⚠️ This is expected in Tauri WebView environment');
                console.warn('⚠️ See: https://github.com/tauri-apps/tauri/issues/5370');
                callbacks.onStatusChange('warning');
            }
        }

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
        console.log('Importing Ultravox client...');
        let UltravoxSession;
        try {
            const ultravoxModule = await import('ultravox-client');
            UltravoxSession = ultravoxModule.UltravoxSession;
            console.log('✅ Ultravox client imported successfully');
        } catch (importError) {
            console.error('❌ Failed to import Ultravox client:', importError);
            callbacks.onStatusChange('error');
            throw new Error('Failed to import Ultravox client');
        }

        // Configure Ultravox Session with appropriate options
        const sessionConfig = {
            experimentalMessages: new Set<string>(["debug"]),
            microphoneEnabled: isRunningInTauri || !microphoneAvailable ? false : true,
            enableTextMode: isRunningInTauri || !microphoneAvailable ? true : false
        };

        console.log('Creating Ultravox session with config:', sessionConfig);

        try {
            uvSession = new UltravoxSession(sessionConfig);
            console.log('✅ Ultravox session created successfully');
        } catch (sessionError) {
            console.error('❌ Failed to create Ultravox session:', sessionError);
            callbacks.onStatusChange('error');
            throw new Error('Failed to create Ultravox session');
        }

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
            callbacks.onStatusChange(uvSession?.status);

            // Ensure speaker is unmuted after status change, especially when speaking
            if (uvSession?.status === 'speaking' && uvSession.isSpeakerMuted) {
                console.log('🔊 Unmuting speaker for speaking state');
                uvSession.unmuteSpeaker();
            }
        });

        // Expose the session globally for client tools
        if (typeof window !== 'undefined') {
            console.log('💾 Exposing Ultravox session globally for tool access');
            // Use a more specific type for the window extension
            (window as unknown as { __ULTRAVOX_SESSION: typeof uvSession }).__ULTRAVOX_SESSION = uvSession;

            // Add this line to the window for debugging
            console.log('🔍 Setting up debug flag for stage changes');
            (window as unknown as { __DEBUG_STAGE_CHANGES: boolean }).__DEBUG_STAGE_CHANGES = true;
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