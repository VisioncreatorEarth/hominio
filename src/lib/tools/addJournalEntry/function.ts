import { getLoroAPIInstance } from '$lib/docs/loroAPI';
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

        // Create a unique transition ID for tracking this operation
        const transitionId = crypto.randomUUID();
        console.log(`Starting journal entry creation with transition ID: ${transitionId}`);

        // Store the promise for later checking if needed
        const operationPromise = execute({
            title: title.trim(),
            content: content.trim(),
            mood,
            tags
        });

        // Set immediate timeout to start checking for completion
        setTimeout(() => {
            operationPromise.then(result => {
                console.log(`Journal entry creation completed (ID: ${transitionId}):`, result);
                // Here you could potentially trigger a custom event or update a "completed operations" store
                // to notify the UI that this specific operation is complete
                window.dispatchEvent(new CustomEvent('journal-entry-added', {
                    detail: { transitionId, result, title }
                }));
            }).catch(err => {
                console.error(`Journal entry creation failed (ID: ${transitionId}):`, err);
                window.dispatchEvent(new CustomEvent('journal-entry-error', {
                    detail: { transitionId, error: err }
                }));
            });
        }, 0);

        // Return initial state with the transition ID for tracking
        const result = {
            success: true,
            transitionId,
            message: `Adding journal entry: "${title}"...`,
            status: "pending"
        };
        return JSON.stringify(result);

    } catch {
        return JSON.stringify({ success: false, message: `Error creating journal entry` });
    }
} 