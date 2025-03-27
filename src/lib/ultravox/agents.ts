/**
 * Ultravox Agents - Store and Types
 * 
 * This file contains only essential agent types and stores.
 * All agent configurations are now dynamically loaded from vibe manifests.
 */
import { writable } from 'svelte/store';
import type {
    AgentName,
    CallConfiguration,
    ToolDefinition,
    TemporaryToolDefinition
} from './types';

// Create stores for state management
export const currentFilter = writable('all');
export const currentAgent = writable<AgentName>('Hominio');

// Basic tool definition interfaces - using types from types.ts
export type ToolConfig = ToolDefinition | TemporaryToolDefinition;

// Default call configuration (minimal, will be overridden by vibe config)
export const defaultCallConfig: CallConfiguration = {
    systemPrompt: "Initializing...",
    model: 'fixie-ai/ultravox-70B',
    voice: '', // Will be set by vibe
    languageHint: 'en',
    temperature: 0.7,
    firstSpeaker: 'FIRST_SPEAKER_USER'
}; 