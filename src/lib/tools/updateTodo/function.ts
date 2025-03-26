// Implementation extracted from hominio/+page.svelte
import type { ToolParameters } from '$lib/ultravox/types';
import {
    findTodoForUpdate,
    updateTodo,
    findTodosByText,
    logToolActivity
} from '$lib/ultravox/todoStore';

export function updateTodoImplementation(parameters: ToolParameters): string {
    console.log('Called updateTodo tool with parameters:', parameters);
    try {
        // Handle both object and string parameter formats
        let parsedParams: Record<string, unknown> = typeof parameters === 'object' ? parameters : {};

        // If parameters is a string, try to parse it as JSON
        if (typeof parameters === 'string') {
            try {
                parsedParams = JSON.parse(parameters);
                console.log('Parsed string parameters:', parsedParams);
            } catch (e) {
                console.error('Failed to parse string parameters:', e);
            }
        }

        // Support both old and new parameter naming conventions
        // Also handle different casing of property names which can happen with LLMs
        const originalText =
            (parsedParams.originalText as string) ||
            (parsedParams.todoText as string) ||
            (parsedParams.OriginalText as string) ||
            (parsedParams.TodoText as string) ||
            '';

        const newText =
            (parsedParams.newText as string) ||
            (parsedParams.NewText as string) ||
            '';

        const tags =
            (parsedParams.tags as string) ||
            (parsedParams.Tags as string);

        // Log the parameter values to help debug
        console.log('Extracted parameters:', { originalText, newText, tags });

        // Validate required parameters
        if (!originalText || typeof originalText !== 'string' || !newText || typeof newText !== 'string') {
            const result = {
                success: false,
                message: `Missing required parameters: originalText and newText must be provided. Received: ${JSON.stringify(parsedParams)}`
            };
            logToolActivity('edit', result.message, false);
            return JSON.stringify(result);
        }

        // Debug: List all todos to check what we're looking for
        const allTodos = findTodosByText('');
        console.log('All todos:', allTodos.map(([, todo]) => todo.text));

        // Try to find the todo with our improved matching function
        const todoMatch = findTodoForUpdate(originalText);
        console.log('Todo match result:', todoMatch);

        if (todoMatch) {
            const [id, todo] = todoMatch;
            console.log(`Found matching todo: "${todo.text}"`);

            // Update the todo with the new text and tags
            const success = updateTodo(id, newText, tags);

            if (success) {
                const result = {
                    success: true,
                    message: `Updated todo from "${todo.text}" to "${newText}"`
                };
                logToolActivity('edit', result.message, true);
                return JSON.stringify(result);
            }
        }

        // If we got here, we couldn't find a matching todo
        const result = {
            success: false,
            message: `Could not find a matching todo for "${originalText}". Try a different description.`
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