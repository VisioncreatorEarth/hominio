/**
 * Create Call Implementation
 * This file contains the logic for creating calls with the Ultravox API using the
 * centralized call configuration.
 */
import type { JoinUrlResponse, CallConfig } from './callFunctions';
import { getActiveVibe } from './index';

/**
 * Create a call with Ultravox API using our configured settings
 * @param callConfig The call configuration to use (immutable properties)
 * @returns Promise containing the join URL response
 */
export async function createCall(callConfig: CallConfig): Promise<JoinUrlResponse> {
    try {
        // Get active vibe configuration with mutable properties
        const activeVibe = await getActiveVibe();
        // Need to use any because the VibeManifest type might not be updated everywhere yet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const manifest = activeVibe.manifest as any;

        // Transform tools to the format expected by Ultravox API
        // Only use temporaryTool field to avoid multiple "base_tool" oneof fields error
        const formattedTools = activeVibe.resolvedCallTools.map(tool => {
            // The API expects only one of: toolId, toolName, temporaryTool 
            // (these are part of a oneof group in the protobuf)
            return {
                temporaryTool: tool.temporaryTool
            };
        });

        // Combine immutable properties from callConfig with mutable properties from vibe
        const combinedConfig = {
            ...callConfig,
            // Override with mutable properties from the vibe
            systemPrompt: manifest.systemPrompt || callConfig.systemPrompt,
            temperature: manifest.temperature || callConfig.temperature,
            languageHint: manifest.languageHint || callConfig.languageHint,
            // Add any other mutable properties here
            selectedTools: formattedTools
        };

        // Ensure API compatibility
        const apiRequest = {
            ...combinedConfig,
            // Make sure inactivityMessages is an array
            inactivityMessages: combinedConfig.inactivityMessages || [],
            // Ensure medium is a valid value with proper casing
            medium: { webRtc: {} } // Set to WebRTC object format as expected by the API
        };

        // Log detailed request for debugging
        console.log('Making API call with config:', JSON.stringify(apiRequest, null, 2));

        const response = await fetch('/callHominio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(apiRequest),
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