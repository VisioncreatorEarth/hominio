/**
 * Ultravox Agents - Store and Types
 * 
 * This file contains only essential agent types and stores.
 * All agent configurations are now dynamically loaded from vibe manifests.
 */
import { writable } from 'svelte/store';

// Define types for Ultravox tools and agents
export type ToolResponse = {
    success?: boolean;
    message?: string;
    error?: string;
    responseType?: string;
    systemPrompt?: string;
    voice?: string;
    toolResultText?: string;
    result?: string;
};

// Tool parameter types
export type FilterParams = {
    tag?: string;
};

export type CreateTodoParams = {
    todoText: string;
    tags?: string;
};

export type ToggleTodoParams = {
    todoText: string;
};

export type UpdateTodoParams = {
    todoText: string;
    newText: string;
    tags?: string;
};

export type RemoveTodoParams = {
    todoText: string;
};

export type SwitchAgentParams = {
    agentName?: string;
};

// The AgentName type is now a string rather than an enum 
// since we want to support any agent name from any vibe
export type AgentName = string;

// Create stores for state management
export const currentFilter = writable('all');
export const currentAgent = writable<AgentName>('Hominio');

// Basic tool definition interfaces
export interface ToolDefinition {
    toolName: string;
}

export interface TemporaryToolDefinition {
    temporaryTool: {
        modelToolName: string;
        description: string;
        dynamicParameters: {
            name: string;
            location: string;
            schema: {
                type: string;
                description: string;
            };
            required: boolean;
        }[];
        client: Record<string, unknown>;
    };
}

export type ToolConfig = ToolDefinition | TemporaryToolDefinition;

// Define call configuration types
export interface CallConfiguration {
    systemPrompt: string;
    model: string;
    voice: string;
    languageHint: string;
    temperature: number;
    maxDuration?: string;
    timeExceededMessage?: string;
    firstSpeaker?: string;
}

// Default call configuration (minimal, will be overridden by vibe config)
export const defaultCallConfig: CallConfiguration = {
    systemPrompt: "Initializing...",
    model: 'fixie-ai/ultravox-70B',
    voice: '', // Will be set by vibe
    languageHint: 'en',
    temperature: 0.7,
    firstSpeaker: 'FIRST_SPEAKER_USER'
}; 