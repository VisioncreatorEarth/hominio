// Implementation extracted from hominio/+page.svelte
import type { ToolParameters } from '$lib/ultravox/types';
import {
    filterTodosByTag,
    getAllUniqueTags,
    logToolActivity
} from '$lib/stores/todoStore';

export function filterTodosImplementation(parameters: ToolParameters): string {
    console.log('Called filterTodos tool with parameters:', parameters);
    try {
        const { tag } = parameters as { tag?: string };

        if (tag === 'all' || tag === 'clear') {
            // Reset filter to show all todos
            console.log('Clearing filter to show all todos');
            filterTodosByTag(null);
            const result = {
                success: true,
                message: 'Showing all todos'
            };
            logToolActivity('filter', result.message, true);
            return JSON.stringify(result);
        }

        // Check if tag exists
        const allTags = getAllUniqueTags();
        console.log('Available tags:', allTags);

        if (tag && typeof tag === 'string') {
            // Try to find a matching tag (case insensitive)
            const matchingTag = allTags.find((t) => t.toLowerCase() === tag.toLowerCase());

            if (matchingTag) {
                console.log(`Filtering by tag: ${matchingTag}`);
                // Explicitly call the filterTodosByTag function with the matching tag
                filterTodosByTag(matchingTag);

                const result = {
                    success: true,
                    message: `Filtered todos by tag: "${matchingTag}"`
                };
                logToolActivity('filter', result.message, true);
                return JSON.stringify(result);
            } else {
                console.log(`Tag not found: ${tag}`);
                const result = {
                    success: false,
                    message: `Tag "${tag}" not found. Available tags: ${allTags.length > 0 ? allTags.join(', ') : 'None'}`
                };
                logToolActivity('filter', result.message, false);
                return JSON.stringify(result);
            }
        }

        // If no tag provided, list available tags
        if (allTags.length > 0) {
            const result = {
                success: false,
                message: `Available tags: ${allTags.join(', ')}`
            };
            logToolActivity('filter', result.message, false);
            return JSON.stringify(result);
        } else {
            const result = {
                success: false,
                message: 'No tags available yet'
            };
            logToolActivity('filter', result.message, false);
            return JSON.stringify(result);
        }
    } catch (error: unknown) {
        console.error('Error in filterTodos tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error filtering todos: ${errorMessage}`
        };

        logToolActivity('filter', result.message, false);
        return JSON.stringify(result);
    }
} 