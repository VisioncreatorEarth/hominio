import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
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
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();

        // Find the todo using the search criteria with the LoroAPI
        const result = await loroAPI.findItem<TodoItem>('todo', {
            id: inputs.todoId,
            searchField: 'text',
            searchValue: inputs.text
        });

        if (!result) {
            return logToolActivity('deleteTodo', 'No matching todo found', false);
        }

        const [id, todo] = result;

        // Use the deleteItem helper from loroAPI for consistency
        const success = await loroAPI.deleteItem('todo', id);

        if (success) {
            return logToolActivity('deleteTodo', `Todo "${todo.text}" deleted successfully`);
        } else {
            return logToolActivity('deleteTodo', `Todo with ID ${id} not found in map`, false);
        }
    } catch (error) {
        console.error('Error deleting todo:', error);
        const message = error instanceof Error ? error.message : String(error);
        return logToolActivity('deleteTodo', message, false);
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