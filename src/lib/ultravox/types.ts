// Type definitions for Ultravox integration

// Tool parameter and response types
export type ToolParameters = Record<string, unknown>;

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
type ClientToolReturnType = string | Record<string, unknown>;

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
export type AgentName = 'Hominio' | 'Oliver';

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

// Vibe configuration
export interface VibeManifest {
    name: string;
    description: string;
    systemPrompt: string;
    temperature?: number;
    voice?: string;
    languageHint?: string;
    initialMessages?: string[];
    vibeTools: string[];
    defaultAgent: string;
    agents: AgentConfig[];
}

export interface ResolvedVibe {
    manifest: VibeManifest;
    resolvedCallTools: ToolDefinition[];
    resolvedAgents: AgentConfig[];
    defaultAgent: AgentConfig;
}

// Global window augmentation for consistent TypeScript across files
declare global {
    interface Window {
        __hominio_tools?: Record<string, ToolImplementation>;
        __ULTRAVOX_SESSION?: UltravoxSession;
    }
} 