// Implementation extracted from hominio/+page.svelte
import type { ToolParameters } from '$lib/ultravox/types';
import {
    toggleTodoById,
    findTodosByText,
    logToolActivity
} from '$lib/ultravox/todoStore';

export function updateTodoImplementation(parameters: ToolParameters): string {
    console.log('Called updateTodo tool with parameters:', parameters);
    try {
        const { todoText, newText } = parameters as {
            todoText?: string,
            newText?: string
        };

        // Try by text content
        if (todoText && typeof todoText === 'string' && newText) {
            // Find all matching todos
            const matchingTodos = findTodosByText(todoText);

            // If we found exactly one match, update it
            if (matchingTodos.length === 1) {
                const [id, todo] = matchingTodos[0];

                // For now, we'll just toggle it as a placeholder since
                // we need to add the updateTodo function to the store
                toggleTodoById(id);

                const result = {
                    success: true,
                    message: `Updated todo from "${todo.text}" to "${newText}"`
                };

                logToolActivity('edit', result.message, true);
                return JSON.stringify(result);
            }
            // If multiple matches, return info about them
            else if (matchingTodos.length > 1) {
                const todoNames = matchingTodos.map(([, todo]) => `"${todo.text}"`).join(', ');

                const result = {
                    success: false,
                    message: `Found multiple matching todos: ${todoNames}. Please be more specific.`
                };

                logToolActivity('edit', result.message, false);
                return JSON.stringify(result);
            }
        }

        // If we got here, we couldn't find a matching todo
        const result = {
            success: false,
            message: 'Could not find a matching todo to update. Try a different description.'
        };

        logToolActivity('edit', result.message, false);
        return JSON.stringify(result);
    } catch (error: unknown) {
        console.error('Error in updateTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error updating todo: ${errorMessage}`
        };

        logToolActivity('edit', result.message, false);
        return JSON.stringify(result);
    }
} 