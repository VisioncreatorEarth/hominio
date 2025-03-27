import { loroAPI } from '$lib/docs/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';

/**
 * Deletes a todo item
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    todoId?: string;
    text?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        // Get operations for todo schema
        const { query, get } = loroAPI.getOperations<TodoItem>('todo');

        // If we have an ID, use it directly
        if (inputs.todoId) {
            // First check if the todo exists
            const todo = get(inputs.todoId);
            if (!todo) {
                return logToolActivity('deleteTodo', 'Todo not found', false);
            }

            // Get direct access to the document and map using the new generic helper
            const { map } = loroAPI.getSchemaDetails('todo');

            // Get all keys and check if our ID is among them
            const keys = Array.from(map.keys());
            if (keys.includes(inputs.todoId)) {
                // Delete the item
                map.delete(inputs.todoId);

                // Force update the store manually
                loroAPI.updateStoreForSchema('todo');

                return logToolActivity('deleteTodo', `Todo deleted successfully`);
            } else {
                return logToolActivity('deleteTodo', `Todo with ID ${inputs.todoId} not found in map`, false);
            }
        }

        // Try by text content if provided
        if (inputs.text) {
            // Find matching todos
            const matchingTodos = query(todo => todo.text.toLowerCase().includes(inputs.text!.toLowerCase()));

            if (matchingTodos.length === 0) {
                return logToolActivity('deleteTodo', 'No matching todos found', false);
            }

            if (matchingTodos.length > 1) {
                const todoNames = matchingTodos.map(([, todo]) => `"${todo.text}"`).join(', ');
                return logToolActivity('deleteTodo', `Found multiple matching todos: ${todoNames}. Please be more specific.`, false);
            }

            // We have exactly one match
            const [id, todo] = matchingTodos[0];

            // Get direct access to the document and map using the new generic helper
            const { map } = loroAPI.getSchemaDetails('todo');

            // Get all keys and check if our ID is among them
            const keys = Array.from(map.keys());
            if (keys.includes(id)) {
                // Delete the item
                map.delete(id);

                // Force update the store manually
                loroAPI.updateStoreForSchema('todo');

                return logToolActivity('deleteTodo', `Todo "${todo.text}" deleted successfully`);
            } else {
                return logToolActivity('deleteTodo', `Todo with ID ${id} not found in map`, false);
            }
        }

        // No ID or text provided
        return logToolActivity('deleteTodo', 'No todo ID or text provided', false);
    } catch (error) {
        console.error('Error deleting todo:', error);
        return logToolActivity('deleteTodo', `Error: ${error}`, false);
    }
}

/**
 * Legacy implementation for Ultravox compatibility with deleteTodo
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function deleteTodoImplementation(parameters: ToolParameters): string {
    console.log('Called deleteTodo tool with parameters:', parameters);

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
        const todoId = parsedParams.todoId as string | undefined;
        const todoText = parsedParams.todoText as string | undefined;

        // Call the new implementation with appropriate parameters
        execute({
            todoId,
            text: todoText
        }).then(result => {
            console.log('Todo deleted with result:', result);
        }).catch(err => {
            console.error('Error in deleteTodo execution:', err);
        });

        // Return a preliminary success message
        // The actual result will be displayed through the notification system
        const result = {
            success: true,
            message: `Deleted todo`
        };

        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in deleteTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error deleting todo: ${errorMessage}`
        };

        return JSON.stringify(result);
    }
}

/**
 * Legacy implementation for Ultravox compatibility with removeTodo
 * This is an alias to the deleteTodo implementation
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function removeTodoImplementation(parameters: ToolParameters): string {
    console.log('Called removeTodo tool with parameters (redirecting to deleteTodo):', parameters);
    return deleteTodoImplementation(parameters);
} 