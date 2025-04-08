import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';

/**
 * Toggles the completed state of a todo item
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
            return logToolActivity('toggleTodo', 'No matching todo found', false);
        }

        const [id, todo] = result;

        // Use the updateItem helper from loroAPI for consistency
        const success = await loroAPI.updateItem<TodoItem>('todo', id, (currentItem) => {
            return {
                ...currentItem,
                completed: !currentItem.completed
            };
        });

        if (success) {
            return logToolActivity('toggleTodo', `Todo "${todo.text}" ${todo.completed ? 'marked incomplete' : 'marked complete'}`);
        } else {
            return logToolActivity('toggleTodo', `Failed to toggle todo with ID ${id}`, false);
        }
    } catch (error) {
        console.error('Error toggling todo:', error);
        const message = error instanceof Error ? error.message : String(error);
        return logToolActivity('toggleTodo', message, false);
    }
}

/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function toggleTodoImplementation(parameters: ToolParameters): string {
    console.log('Called toggleTodo tool with parameters:', parameters);

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
            console.log('Todo toggled with result:', result);
        }).catch(err => {
            console.error('Error in toggleTodo execution:', err);
        });

        // Return a preliminary success message
        // The actual result will be displayed through the notification system
        const result = {
            success: true,
            message: `Toggled todo completion status`
        };

        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in toggleTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error toggling todo: ${errorMessage}`
        };

        return JSON.stringify(result);
    }
} 