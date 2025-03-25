// Implementation extracted from hominio/+page.svelte
import type { ToolParameters } from '$lib/ultravox/types';
import {
    toggleTodoById,
    findTodosByText,
    logToolActivity
} from '$lib/stores/todoStore';

export function toggleTodoImplementation(parameters: ToolParameters): string {
    console.log('Called toggleTodo tool with parameters:', parameters);
    try {
        const { todoId, todoText } = parameters as { todoId?: string, todoText?: string };

        // Try by ID first
        if (todoId && typeof todoId === 'string') {
            console.log(`Attempting to toggle todo by ID: ${todoId}`);
            const success = toggleTodoById(todoId);
            if (success) {
                const result = {
                    success: true,
                    message: `Toggled todo completion status`
                };

                logToolActivity('toggle', result.message, true);
                return JSON.stringify(result);
            }
        }

        // Try by text content
        if (todoText && typeof todoText === 'string') {
            console.log(`Attempting to toggle todo by text: ${todoText}`);

            // Find all matching todos using the helper function
            const matchingTodos = findTodosByText(todoText);

            console.log(`Found ${matchingTodos.length} matching todos`);

            // If we found exactly one match, toggle it
            if (matchingTodos.length === 1) {
                const [id, todo] = matchingTodos[0];
                toggleTodoById(id);

                const result = {
                    success: true,
                    message: `Toggled "${todo.text}" to ${!todo.completed ? 'complete' : 'incomplete'}`
                };

                logToolActivity('toggle', result.message, true);
                return JSON.stringify(result);
            }
            // If multiple matches, return info about them
            else if (matchingTodos.length > 1) {
                const todoNames = matchingTodos.map(([, todo]) => `"${todo.text}"`).join(', ');

                const result = {
                    success: false,
                    message: `Found multiple matching todos: ${todoNames}. Please be more specific.`
                };

                logToolActivity('toggle', result.message, false);
                return JSON.stringify(result);
            }
        }

        // If we got here, we couldn't find a matching todo
        const result = {
            success: false,
            message: 'Could not find a matching todo. Try a different description or create a new todo.'
        };

        logToolActivity('toggle', result.message, false);
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in toggleTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error toggling todo: ${errorMessage}`
        };

        logToolActivity('toggle', result.message, false);
        return JSON.stringify(result);
    }
} 