/**
 * Call configuration for Ultravox.
 * This file contains immutable root call configurations that don't change with agent stages.
 */

import type { CallConfig } from './callFunctions';

/**
 * Default root call configuration
 * 
 * IMMUTABLE PROPERTIES
 * These settings are used for all calls and cannot be changed during a call:
 * - model
 * - firstSpeaker
 * - maxDuration
 * - joinTimeout
 * - timeExceededMessage
 * - inactivityMessages
 * - medium
 * - recordingEnabled
 * 
 * MUTABLE PROPERTIES
 * These properties can be changed with a new stage and should come from vibe manifests:
 * - systemPrompt
 * - temperature
 * - voice
 * - languageHint
 * - initialMessages
 * - selectedTools
 */
export const DEFAULT_CALL_CONFIG: CallConfig = {
    // Immutable properties (cannot change with new stage)
    model: 'fixie-ai/ultravox-70B',
    firstSpeaker: 'FIRST_SPEAKER_USER',
    maxDuration: '600s',
    joinTimeout: '30s',
    timeExceededMessage: 'The maximum call duration has been reached.',
    inactivityMessages: [],
    // medium is set in createCall.ts as a complex object { webRtc: {} }
    recordingEnabled: false,

    // Default values for mutable properties
    // These will be overridden by the vibe manifest
    systemPrompt: '',
    temperature: 0.7,
    languageHint: 'en'
};

/**
 * Get the base call configuration that should be used for all calls
 * @returns The base call configuration
 */
export function getBaseCallConfig(): CallConfig {
    return { ...DEFAULT_CALL_CONFIG };
}

/**
 * Todo vibe specific call configuration
 * This only contains the immutable properties
 */
export const TODO_CALL_CONFIG: CallConfig = {
    ...DEFAULT_CALL_CONFIG
}; 