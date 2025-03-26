/**
 * Main entry point for the Ultravox vibe-based architecture
 */

// Export types
export * from './types';

// Export loaders
export { loadVibe, registerVibeTools } from './loaders/vibeLoader';
export { loadTool, registerTools, registerToolsFromRegistry, clearToolCache } from './loaders/toolLoader';
export { getAgentConfig, buildSystemPrompt, clearAgentCache } from './loaders/agentLoader';

// Export stage manager
export { getActiveVibe, resetActiveVibe, createAgentStageChangeData } from './stageManager';

// Export call configuration
export { DEFAULT_CALL_CONFIG, TODO_CALL_CONFIG, getBaseCallConfig } from './callConfig';

// Export global tools configuration
export { GLOBAL_CALL_TOOLS, isGlobalCallTool } from './globalTools';

/**
 * Initialize the vibe system with a specific vibe
 * @param vibeName The name of the vibe to load
 */
export async function initializeVibe(vibeName: string = 'todos') {
    const { loadVibe, registerVibeTools } = await import('./loaders/vibeLoader');
    const { resetActiveVibe } = await import('./stageManager');

    // Reset any active vibe
    resetActiveVibe();

    // Load the specified vibe
    const vibe = await loadVibe(vibeName);

    // Register all tools in the vibe
    registerVibeTools(vibe);

    console.log(`✅ Initialized vibe: ${vibe.manifest.name}`);

    return vibe;
} 