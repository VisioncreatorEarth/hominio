import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
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
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();

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

        // Create the journal entry object (without ID)
        const journalEntry: Omit<JournalEntry, 'id'> = {
            title: inputs.title.trim(),
            content: inputs.content.trim(),
            mood: inputs.mood?.trim(),
            createdAt: Date.now(),
            tags
        };

        // Call the async createItem method
        const id = await loroAPI.createItem<JournalEntry>('journalEntry', journalEntry as JournalEntry);

        if (!id) {
            return logToolActivity('addJournalEntry', 'Failed to create journal entry using LoroAPI', false);
        }

        console.log(`Journal entry created with ID: ${id}`);
        return logToolActivity('addJournalEntry', `Added journal entry: "${inputs.title}"`);
    } catch (error) {
        console.error('Error creating journal entry:', error);
        // Ensure error is stringified properly
        const errorMessage = error instanceof Error ? error.message : String(error);
        return logToolActivity('addJournalEntry', `Error: ${errorMessage}`, false);
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
        let parsedParams: Record<string, unknown> = {};

        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try { parsedParams = JSON.parse(parameters); } catch { /* Handle error if needed, e.g., log it */ }
        }

        const title = parsedParams.title as string | undefined;
        const content = parsedParams.content as string | undefined;
        const mood = parsedParams.mood as string | undefined;
        const tags = parsedParams.tags as string | undefined;

        if (!title || typeof title !== 'string' || !title.trim()) {
            return JSON.stringify({ success: false, message: 'Invalid or missing title' });
        }
        if (!content || typeof content !== 'string' || !content.trim()) {
            return JSON.stringify({ success: false, message: 'Invalid or missing content' });
        }

        // Execute the async function but return sync response for legacy Ultravox
        execute({
            title: title.trim(),
            content: content.trim(),
            mood,
            tags
        }).then(result => {
            // Log async result, but don't wait for it
            console.log('Async journal entry creation result:', result);
        }).catch(err => {
            console.error('Async error in addJournalEntry execution:', err);
        });

        // Return success immediately (fire-and-forget)
        const result = {
            success: true,
            message: `Attempting to add journal entry: "${title}"` // Indicate action started
        };
        return JSON.stringify(result);

    } catch (error) {
        console.error('Error in addJournalEntry tool wrapper:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, message: `Error: ${errorMessage}` });
    }
} 