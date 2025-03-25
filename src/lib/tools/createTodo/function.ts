// Implementation extracted from hominio/+page.svelte
import type { ToolParameters } from '$lib/ultravox/types';
import {
    addTodo,
    createLoroDocument,
    switchToDocument,
    todoState,
    logToolActivity
} from '$lib/stores/todoStore';
import { get } from 'svelte/store';

export function createTodoImplementation(parameters: ToolParameters): string {
    console.log('Called createTodo tool with parameters:', parameters);
    try {
        const { todoText, tags, listName } = parameters as { todoText?: string, tags?: string, listName?: string };

        // Check if we need to create in a specific list
        let targetDocId = get(todoState).activeDocId;
        if (listName && typeof listName === 'string') {
            // Try to find a matching list (case insensitive)
            const matchingDocId = createLoroDocument(listName.trim());
            if (matchingDocId) {
                targetDocId = matchingDocId;
            }
        }

        if (typeof todoText === 'string' && todoText.trim()) {
            const tagsStr = tags || '';
            addTodo(todoText.trim(), tagsStr, targetDocId);

            // If the todo was added to a different list than the active one, switch to that list
            if (targetDocId !== get(todoState).activeDocId) {
                switchToDocument(targetDocId);
            }

            const result = {
                success: true,
                message: `Created todo: "${todoText}"${tagsStr ? ' with tags: ' + tagsStr : ''}`
            };

            logToolActivity('create', result.message, true);
            return JSON.stringify(result);
        }

        const result = {
            success: false,
            message: 'Invalid todo text provided'
        };

        logToolActivity('create', result.message, false);
        return JSON.stringify(result);
    } catch (error: unknown) {
        console.error('Error in createTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error creating todo: ${errorMessage}`
        };

        logToolActivity('create', result.message, false);
        return JSON.stringify(result);
    }
} 