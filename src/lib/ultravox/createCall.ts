/**
 * Create Call Implementation
 * This file contains the logic for creating calls with the Ultravox API using the
 * centralized call configuration.
 */
import { browser } from '$app/environment';
import type { JoinUrlResponse, CallConfig } from './types';
import { getActiveVibe } from './stageManager';
import { setupToolRegistrationListeners } from './loaders/toolLoader';

/**
 * Creates a call using the API and returns a join URL
 * @param callConfig Call configuration
 * @param vibeId Optional vibe ID to use for the call (defaults to 'home')
 * @returns Join URL and other call details
 */
export async function createCall(callConfig: CallConfig, vibeId = 'home'): Promise<JoinUrlResponse> {
    if (!browser) {
        throw new Error('createCall must be called from the browser environment');
    }

    try {
        // Setup tool registration listeners to ensure tools are registered
        setupToolRegistrationListeners();

        // Get active vibe configuration with mutable properties
        console.log(`📞 Creating call with vibe: ${vibeId}`);
        const activeVibe = await getActiveVibe(vibeId);

        // Format tools for the API request using the correct structure
        // The Ultravox API expects "temporaryTool" objects, not direct properties
        const formattedTools = activeVibe.resolvedCallTools.map(tool => ({
            // Use the original format which is already correct
            temporaryTool: {
                modelToolName: tool.name,
                description: tool.temporaryTool.description,
                dynamicParameters: tool.temporaryTool.dynamicParameters,
                client: {} // Empty client object is required
            }
        }));

        console.log(`🔧 Formatted tools for API request: ${activeVibe.resolvedCallTools.map(t => t.name).join(', ')}`);

        // Create the API request
        // Base configuration - unchangeable properties from callConfig
        const apiRequest = {
            ...callConfig,

            // Changeable properties from vibe manifest
            systemPrompt: activeVibe.manifest.systemPrompt || '',
            temperature: activeVibe.manifest.temperature || 0.7,
            languageHint: activeVibe.manifest.languageHint || 'en',

            // selectedTools is a special case - always computed from the vibe
            selectedTools: formattedTools,

            // Use WebRTC as the medium for browser-based calls
            medium: {
                webRtc: {}
            }
        };

        console.log('📡 Making API call to create a call session');

        // Use the known working endpoint
        const response = await fetch('/callHominio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(apiRequest)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create call: ${response.status} ${errorText}`);
        }

        const data: JoinUrlResponse = await response.json();
        console.log(`✅ Call created. Join URL: ${data.joinUrl}`);

        return data;
    } catch (error) {
        console.error('❌ Error creating call:', error);
        throw error;
    }
} 