/**
 * Global Tools Configuration
 * 
 * This file defines tools that should always be available in any call,
 * regardless of vibe or stage changes.
 */

/**
 * Global call tools that are always available in any stage or vibe
 * These tools are essential for basic call functionality and should always be present
 */
export const GLOBAL_CALL_TOOLS: string[] = [
    'switchVibe'   // Allow switching between vibes from anywhere
    // Add other essential tools here
];

/**
 * Check if a tool is a global call tool
 * @param toolName The name of the tool to check
 * @returns True if the tool is a global call tool, false otherwise
 */
export function isGlobalCallTool(toolName: string): boolean {
    return GLOBAL_CALL_TOOLS.includes(toolName);
} 