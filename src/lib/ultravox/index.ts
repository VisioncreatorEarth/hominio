/**
 * Ultravox integration for Hominio
 * 
 * This file provides the main entry point for working with the Ultravox 
 * voice calling system. It handles vibe loading, tool registration,
 * and call management.
 */

// Import core functionality
import { getActiveVibe, resetActiveVibe, createAgentStageChangeData, activeVibeName } from './stageManager';
import { clearVibeCache } from './loaders/vibeLoader';
import { setupToolRegistrationListeners } from './loaders/toolLoader';
import { DEFAULT_CALL_CONFIG } from './callConfig';
import { startCall, endCall } from './callFunctions';
import { errorStore } from './stores';
import {
    loadAllTools,
    getAllToolsMetadata,
    getToolMetadata,
    callTool,
    getToolRegistry,
    registerToolsWithUltravox
} from './registries/toolRegistry';
import {
    loadView,
    getAllViews,
    discoverViews,
    hasView,
    clearViewCache
} from './registries/viewRegistry';

// Re-export essential types
export type { AgentName } from './types';
export type { Transcript, CallConfig } from './types';
export type { ToolInfo } from './registries/toolRegistry';
export type { ViewInfo } from './registries/viewRegistry';

/**
 * Initialize a vibe and its tools
 * @param vibeId The ID of the vibe to initialize (defaults to 'home')
 */
export async function initializeVibe(vibeId = 'home'): Promise<void> {
    console.log(`🔮 Initializing vibe: ${vibeId}`);

    try {
        // Setup tool registration listeners
        setupToolRegistrationListeners();

        // Load the vibe - this also loads and prepares tools
        await getActiveVibe(vibeId);

        console.log(`✅ Vibe "${vibeId}" initialization complete`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error initializing vibe: ${errorMessage}`);

        // Set the error in the error store
        errorStore.set({
            message: `Failed to initialize vibe: ${errorMessage}`,
            source: 'initializeVibe',
            timestamp: Date.now(),
            error: error instanceof Error ? error : new Error(String(error))
        });
    }
}

/**
 * Switch the active vibe
 * @param vibeId The ID of the vibe to switch to
 */
export async function switchVibe(vibeId: string): Promise<void> {
    // Reset the vibe cache to ensure fresh loading
    resetActiveVibe();

    // Load the new vibe
    await getActiveVibe(vibeId);

    // Dispatch a custom event to notify UI components about vibe change
    if (typeof window !== 'undefined') {
        console.log(`🔔 Dispatching vibe-changed event for: ${vibeId}`);
        window.dispatchEvent(new CustomEvent('ultravox-vibe-changed', {
            detail: { vibeId }
        }));
    }

    console.log(`🔄 Switched to vibe: ${vibeId}`);
}

/**
 * Refresh the UI based on current vibe
 * Call this after a tool has changed the vibe to force UI updates
 * @param vibeId The ID of the vibe to refresh (optional, uses active vibe if not provided)
 */
export async function refreshVibeUI(vibeId?: string): Promise<void> {
    // Get the active vibe name if vibeId not provided
    const currentVibe = activeVibeName();
    const activeId = vibeId || currentVibe || 'home';

    console.log(`🔄 Refreshing UI for vibe: ${activeId}`);

    // Dispatch a custom event to notify UI components to refresh
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ultravox-vibe-changed', {
            detail: { vibeId: activeId }
        }));
    }
}

/**
 * Reset the Ultravox system
 * Clears all caches and resets state
 */
export function resetUltravox(): void {
    // Clear caches
    resetActiveVibe();
    clearVibeCache();
    clearViewCache();

    console.log('🧹 Ultravox system reset');
}

// Re-export key functions
export {
    getActiveVibe,
    startCall,
    endCall,
    createAgentStageChangeData,
    DEFAULT_CALL_CONFIG,
    // Tool registry exports
    loadAllTools,
    getAllToolsMetadata,
    getToolMetadata,
    callTool,
    getToolRegistry,
    registerToolsWithUltravox,
    // View registry exports
    loadView,
    getAllViews,
    discoverViews,
    hasView,
    clearViewCache
}; 