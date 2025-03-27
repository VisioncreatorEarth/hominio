/**
 * Vibe Registry - Dynamically loads and manages all available vibes
 * Provides centralized access to vibe information for components
 */

import { getActiveVibe } from '../stageManager';

// Define an interface for vibe metadata
export interface VibeInfo {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    defaultAgent: string;
    agents: string[];
}

// Default icon and color for fallback
const DEFAULT_ICON = 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
const DEFAULT_COLOR = 'purple';

// Get list of all available vibes (excluding home)
export async function getAllVibes(): Promise<VibeInfo[]> {
    try {
        // Get all vibe folders
        const availableVibeIds = Object.keys(import.meta.glob('../../vibes/*/manifest.json', { eager: false }))
            .map(path => {
                // Extract vibe ID from path (../../vibes/VIBE_ID/manifest.json)
                const matches = path.match(/\.\.\/\.\.\/vibes\/(.+)\/manifest\.json/);
                return matches ? matches[1] : null;
            })
            .filter(id => id && id !== 'home') as string[];

        console.log('📋 Available vibes:', availableVibeIds);

        // Load each vibe's data
        const vibes = await Promise.all(
            availableVibeIds.map(async (vibeId) => {
                try {
                    const vibe = await getActiveVibe(vibeId);

                    // Get all agent names from vibe
                    const agentNames = vibe.resolvedAgents.map((agent) => agent.name);

                    return {
                        id: vibeId,
                        name: vibe.manifest.name.charAt(0).toUpperCase() + vibe.manifest.name.slice(1),
                        description: vibe.manifest.description,
                        icon: vibe.manifest.icon || DEFAULT_ICON,
                        color: vibe.manifest.color || DEFAULT_COLOR,
                        defaultAgent: vibe.defaultAgent.name,
                        agents: agentNames
                    };
                } catch (error) {
                    console.error(`Error loading vibe ${vibeId}:`, error);
                    return null;
                }
            })
        );

        // Filter out any failed loads
        return vibes.filter((vibe): vibe is VibeInfo => vibe !== null);
    } catch (error) {
        console.error('Error loading vibes:', error);
        return [];
    }
}

// Get a specific vibe by ID
export async function getVibeById(vibeId: string): Promise<VibeInfo | null> {
    if (vibeId === 'home') {
        console.warn('Home vibe is not included in registry');
        return null;
    }

    try {
        const vibe = await getActiveVibe(vibeId);

        // Get all agent names from vibe
        const agentNames = vibe.resolvedAgents.map((agent) => agent.name);

        return {
            id: vibeId,
            name: vibe.manifest.name.charAt(0).toUpperCase() + vibe.manifest.name.slice(1),
            description: vibe.manifest.description,
            icon: vibe.manifest.icon || DEFAULT_ICON,
            color: vibe.manifest.color || DEFAULT_COLOR,
            defaultAgent: vibe.defaultAgent.name,
            agents: agentNames
        };
    } catch (error) {
        console.error(`Error loading vibe ${vibeId}:`, error);
        return null;
    }
} 