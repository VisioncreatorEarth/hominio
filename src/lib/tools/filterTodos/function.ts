import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import { writable } from 'svelte/store';

// Create a store to track the current filter state
export const filterState = writable<{ tag: string | null; docId: string }>({
    tag: null,
    docId: 'personal' // Default list
});

/**
 * Filters todos by tag
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    tag?: string;
    docId?: string;
}): Promise<{ success: boolean; message: string; tag?: string | null }> {
    try {
        // If tag is 'all' or empty, set to null to show all
        const tag = (!inputs.tag || inputs.tag.toLowerCase() === 'all') ? null : inputs.tag;
        const docId = inputs.docId || 'personal';

        // Update the filter state
        filterState.update(state => ({ ...state, tag, docId }));

        return {
            success: true,
            message: tag ? `Filtering todos by tag: ${tag}` : 'Showing all todos',
            tag
        };
    } catch (error) {
        console.error('Error filtering todos:', error);
        return {
            success: false,
            message: `Error: ${error}`
        };
    }
}

/**
 * Get all unique tags from todos
 * @returns Array of unique tag strings
 */
export async function getAllUniqueTags(): Promise<string[]> {
    try {
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();

        // Get operations for todo schema
        const { query } = await loroAPI.getOperations<TodoItem>('todo');

        // Get all todos and extract tags
        const todos = query(() => true);

        // Build a set of unique tags
        const tagSet = new Set<string>();
        todos.forEach(([, todo]) => {
            if (todo.tags && Array.isArray(todo.tags)) {
                todo.tags.forEach(tag => tagSet.add(tag));
            }
        });

        // Convert set to array
        return Array.from(tagSet);
    } catch (error) {
        console.error('Error getting tags:', error);
        return [];
    }
}

/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function filterTodosImplementation(parameters: ToolParameters): string {
    console.log('Called filterTodos tool with parameters:', parameters);

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
        const tag = parsedParams.tag as string | undefined;
        const docId = parsedParams.docId as string | undefined;

        // Call the new implementation with appropriate parameters
        execute({
            tag,
            docId
        }).then(result => {
            console.log('Todos filtered with result:', result);
        }).catch(err => {
            console.error('Error in filterTodos execution:', err);
        });

        // Get tags for immediate return
        getAllUniqueTags().then(allTags => {
            console.log('Available tags:', allTags);
        }).catch(err => {
            console.error('Error getting tags:', err);
        });

        // Return a result with placeholder for tags
        const result = {
            success: true,
            message: tag ? `Filtering todos by tag: ${tag}` : 'Showing all todos',
            availableTags: [] // Will be updated client-side when async operation completes
        };

        // Log activity
        logToolActivity('filterTodos', result.message);

        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in filterTodos tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error filtering todos: ${errorMessage}`,
            availableTags: []
        };

        // Log error
        logToolActivity('filterTodos', result.message, false);

        return JSON.stringify(result);
    }
}
