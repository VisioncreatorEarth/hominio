import { loroAPI } from '$lib/docs/loroAPI';
import type { JournalEntry } from '$lib/docs/schemas/journalEntry';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';

/**
 * Creates a new journal entry
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    title: string;
    content: string;
    mood?: string;
    tags?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        // Validate inputs
        if (!inputs.title.trim()) {
            return logToolActivity('addJournalEntry', 'Title is required', false);
        }

        if (!inputs.content.trim()) {
            return logToolActivity('addJournalEntry', 'Content is required', false);
        }

        // Parse tags
        const tags = inputs.tags
            ? inputs.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [];

        // Create the journal entry using the createItem helper
        const journalEntry: Omit<JournalEntry, 'id'> = {
            title: inputs.title.trim(),
            content: inputs.content.trim(),
            mood: inputs.mood?.trim(),
            createdAt: Date.now(),
            tags
        };

        // The createItem method will generate an ID and handle store updates
        const id = loroAPI.createItem<JournalEntry>('journalEntry', journalEntry as JournalEntry);

        if (!id) {
            return logToolActivity('addJournalEntry', 'Failed to create journal entry', false);
        }

        console.log(`Journal entry created with ID: ${id}`);
        return logToolActivity('addJournalEntry', `Added journal entry: "${inputs.title}"`);
    } catch (error) {
        console.error('Error creating journal entry:', error);
        return logToolActivity('addJournalEntry', `Error: ${error}`, false);
    }
}

/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function addJournalEntryImplementation(parameters: ToolParameters): string {
    console.log('Called addJournalEntry tool with parameters:', parameters);

    try {
        // Handle both object and string parameter formats
        let parsedParams: Record<string, unknown> = {};

        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try {
                parsedParams = JSON.parse(parameters);
            } catch (e) {
                console.error('Failed to parse string parameters:', e);
            }
        }

        // Extract parameters with safer type checking
        const title = parsedParams.title as string | undefined;
        const content = parsedParams.content as string | undefined;
        const mood = parsedParams.mood as string | undefined;
        const tags = parsedParams.tags as string | undefined;

        if (!title || typeof title !== 'string' || !title.trim()) {
            const result = {
                success: false,
                message: 'Invalid or missing title'
            };
            return JSON.stringify(result);
        }

        if (!content || typeof content !== 'string' || !content.trim()) {
            const result = {
                success: false,
                message: 'Invalid or missing content'
            };
            return JSON.stringify(result);
        }

        // Convert to the format expected by our new implementation
        execute({
            title: title.trim(),
            content: content.trim(),
            mood,
            tags
        }).then(result => {
            console.log('Journal entry created with result:', result);
        }).catch(err => {
            console.error('Error in addJournalEntry execution:', err);
        });

        // Return success immediately (the actual operation happens async)
        const result = {
            success: true,
            message: `Added journal entry: "${title}"`
        };

        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in addJournalEntry tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error creating journal entry: ${errorMessage}`
        };

        return JSON.stringify(result);
    }
} 