/**
 * Implementation for the hangUp tool
 * This tool doesn't need parameters since it just ends the call
 */
import type { ToolParameters } from '$lib/ultravox/types';

// This is a special tool handled directly by Ultravox - we just need to provide an implementation
export function hangUpImplementation(parameters: ToolParameters): string {
    console.log('Called hangUp tool with parameters:', parameters);

    return JSON.stringify({
        success: true,
        message: 'Call ended by user'
    });
} 