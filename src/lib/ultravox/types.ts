// Type definitions for Ultravox integration
import type { ComponentType, SvelteComponent } from 'svelte';

// Tool parameter and response types
export type ToolParameters = Record<string, unknown>;
export type ToolParams = ToolParameters; // Alias for compatibility with existing code

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

// Function signature for tool implementations
export type ToolImplementation = (params: ToolParameters) => Promise<ToolResponse> | string | unknown;

// Create a more flexible type for the actual client library's implementation
export type ClientToolReturnType = string | Record<string, unknown>;

// Call Medium types from callFunctions.ts
export type WebRtcMedium = { webRtc: Record<string, never> };
export type TwilioMedium = { twilio: Record<string, unknown> };
export type CallMedium = WebRtcMedium | TwilioMedium;

// Call configuration types
export interface CallConfig {
    systemPrompt: string;
    model?: string;
    languageHint?: string;
    voice?: string;
    temperature?: number;
    maxDuration?: string;
    timeExceededMessage?: string;
    firstSpeaker?: string;
    joinTimeout?: string;
    inactivityMessages?: string[];
    medium?: CallMedium | string;
    recordingEnabled?: boolean;
    initialMessages?: string[];
};

// API response types
export type JoinUrlResponse = {
    callId: string;
    joinUrl: string;
    created: string;
    ended: string | null;
    model: string;
};

// Role enum for UI state
export enum Role {
    USER = 'user',
    AGENT = 'agent'
}

// Event types
export type UltravoxExperimentalMessageEvent = {
    message: {
        message: string;
        timestamp: number;
    };
};

// Tool parameter types from agents.ts
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

// Ultravox session interface that matches the actual library implementation
export interface UltravoxSession {
    registerTool?: (name: string, callback: ToolImplementation) => void;
    registerToolImplementation: (name: string, implementation: (params: unknown) => ClientToolReturnType | Promise<ClientToolReturnType>) => void;
    isMicMuted: boolean;
    isSpeakerMuted: boolean;
    muteMic: () => void;
    unmuteMic: () => void;
    muteSpeaker: () => void;
    unmuteSpeaker: () => void;
    joinCall: (joinUrl: string) => void;
    leaveCall: () => void;
    status?: string;
    transcripts?: unknown[];
    addEventListener: (event: string, callback: (event: unknown) => void) => void;
}

// Call handling types
export type CallCallbacks = {
    onStatusChange: (status: string | undefined) => void;
    onTranscriptChange: (transcripts: unknown[] | undefined) => void;
    onDebugMessage?: (message: unknown) => void;
};

export type Transcript = {
    speaker: 'agent' | 'user';
    text: string;
};

// Agent configuration
export type AgentName = string; // Any valid agent name from any vibe manifest

export interface AgentConfig {
    name: string;
    personality: string;
    voiceId: string;
    description: string;
    temperature: number;
    systemPrompt: string;
    tools: string[];
    resolvedTools?: ToolDefinition[];
}

// VibeAgent type (for backward compatibility)
export type VibeAgent = AgentConfig;

// Call configuration
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

// Tool definitions
export interface ToolParameter {
    name: string;
    location: string;
    schema: {
        type: string;
        description: string;
    };
    required: boolean;
}

export interface ToolDefinition {
    name: string;
    temporaryTool: {
        modelToolName: string;
        description: string;
        dynamicParameters: ToolParameter[];
        client: Record<string, unknown>;
    };
    implementationType: string;
    implementation?: ToolImplementation;
}

// TemporaryToolDefinition from agents.ts
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

// Resolved tool with guaranteed implementation
export interface ResolvedTool extends ToolDefinition {
    implementation: ToolImplementation;
}

// Resolved agent with tools
export interface ResolvedAgent extends AgentConfig {
    resolvedTools: ResolvedTool[];
}

// Vibe configuration
export interface VibeManifest {
    name: string;
    description: string;
    systemPrompt: string;
    // Top-level call properties
    temperature?: number;
    languageHint?: string;
    model?: string;
    maxDuration?: string;
    firstSpeaker?: string;
    voice?: string;
    initialMessages?: string[];
    // UI properties
    view: string;
    vibeTools: string[];
    // Agent configuration
    defaultAgent: string;
    agents: AgentConfig[];
    // Additional properties found in vibeLoader
    callSystemPrompt?: string;
    // Legacy nested configuration (deprecated)
    rootCallConfig?: {
        model: string;
        firstSpeaker: string;
        maxDuration: string;
        languageHint: string;
        temperature: number;
    };
}

export interface ResolvedVibe {
    manifest: VibeManifest;
    resolvedCallTools: ResolvedTool[];
    resolvedAgents: ResolvedAgent[];
    defaultAgent: ResolvedAgent;
}

// Stage change data type for agent transitions
export interface StageChangeData {
    systemPrompt: string;
    voice: string;
    toolResultText: string;
    selectedTools: ResolvedTool[];
}

// View component types
// Make it more compatible with actual Svelte component types
export type VibeComponent = ComponentType | SvelteComponent | unknown;

// Global window augmentation for consistent TypeScript across files
declare global {
    interface Window {
        __hominio_tools?: Record<string, ToolImplementation>;
        __hominio_tools_registered?: boolean;
        __ULTRAVOX_SESSION?: UltravoxSession;
        __DEBUG_STAGE_CHANGES?: boolean;
    }
} 