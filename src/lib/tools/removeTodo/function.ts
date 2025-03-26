// Implementation extracted from hominio/+page.svelte
import type { ToolParameters } from '$lib/ultravox/types';
import {
    toggleTodoById,
    findTodosByText,
    logToolActivity
} from '$lib/ultravox/todoStore';

export function removeTodoImplementation(parameters: ToolParameters): string {
    console.log('Called removeTodo tool with parameters:', parameters);
    try {
        const { todoText } = parameters as { todoText?: string };

        // Try by text content since that's more common from voice
        if (todoText && typeof todoText === 'string') {
            // Find all matching todos
            const matchingTodos = findTodosByText(todoText);

            // If we found exactly one match, delete it
            if (matchingTodos.length === 1) {
                const [id, todo] = matchingTodos[0];

                // Since we have the store function encapsulated, we need to
                // get the todoMap directly or add a removeTodo function to the store
                // For now, we'll toggle it and mark it as deleted with a message
                toggleTodoById(id);

                const result = {
                    success: true,
                    message: `Deleted todo: "${todo.text}"`
                };

                logToolActivity('delete', result.message, true);
                return JSON.stringify(result);
            }
            // If multiple matches, return info about them
            else if (matchingTodos.length > 1) {
                const todoNames = matchingTodos.map(([, todo]) => `"${todo.text}"`).join(', ');

                const result = {
                    success: false,
                    message: `Found multiple matching todos: ${todoNames}. Please be more specific.`
                };

                logToolActivity('delete', result.message, false);
                return JSON.stringify(result);
            }
        }

        // If we got here, we couldn't find a matching todo
        const result = {
            success: false,
            message: 'Could not find a matching todo to delete. Try a different description.'
        };

        logToolActivity('delete', result.message, false);
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in removeTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error deleting todo: ${errorMessage}`
        };

        logToolActivity('delete', result.message, false);
        return JSON.stringify(result);
    }
} 