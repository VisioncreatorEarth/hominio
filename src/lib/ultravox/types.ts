export type ToolParameters = Record<string, any>;

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

export type ToolImplementation = (params: ToolParameters) => Promise<ToolResponse>;

export interface UltravoxSession {
    registerTool: (name: string, callback: ToolImplementation) => void;
    registerToolImplementation: (name: string, callback: ToolImplementation) => void;
    isMicMuted: boolean;
    isSpeakerMuted: boolean;
    muteMic: () => void;
    unmuteMic: () => void;
    muteSpeaker: () => void;
    unmuteSpeaker: () => void;
    joinCall: (joinUrl: string) => void;
    leaveCall: () => void;
    status?: string;
    transcripts?: any[];
    addEventListener: (event: string, callback: (event: any) => void) => void;
}

export type CallCallbacks = {
    onStatusChange: (status: string | undefined) => void;
    onTranscriptChange: (transcripts: any[] | undefined) => void;
    onDebugMessage?: (message: any) => void;
};

export type Transcript = {
    speaker: 'agent' | 'user';
    text: string;
};

export type AgentConfig = {
    id: string;
    name: string;
    personality: string;
    voiceId: string;
    description: string;
    tools: string[];
    systemPromptTemplate: string;
};

export type ToolConfig = {
    id: string;
    name: string;
    description: string;
    modelToolName: string;
    parameters: ToolParameter[];
};

export type ToolParameter = {
    name: string;
    location: string;
    schema: {
        type: string;
        description: string;
    };
    required: boolean;
};

export type Tool = {
    config: ToolConfig;
    implementation: ToolImplementation;
};

export type VibeManifest = {
    id: string;
    name: string;
    description: string;
    defaultAgent: string;
    agents: string[];
    coreTools: string[];
    appTools: string[];
};

export type Vibe = {
    manifest: VibeManifest;
    agents: AgentConfig[];
    tools: Tool[];
    defaultAgent: AgentConfig;
}; 