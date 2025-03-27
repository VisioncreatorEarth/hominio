// Implementation extracted from hominio/+page.svelte
import { loroAPI } from '$lib/docs/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';

/**
 * Updates a todo item with new properties
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    todoId?: string;
    text?: string;
    newText?: string;
    completed?: boolean;
    tags?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        // Prepare update data
        const updateData: Partial<TodoItem> = {};

        if (inputs.newText) {
            updateData.text = inputs.newText.trim();
        }

        if (inputs.completed !== undefined) {
            updateData.completed = inputs.completed;
        }

        if (inputs.tags) {
            updateData.tags = inputs.tags
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            return logToolActivity('updateTodo', 'No updates specified', false);
        }

        // Find the todo using the search criteria with the LoroAPI
        const result = await loroAPI.findItem<TodoItem>('todo', {
            id: inputs.todoId,
            searchField: 'text',
            searchValue: inputs.text
        });

        if (!result) {
            return logToolActivity('updateTodo', 'No matching todo found', false);
        }

        const [id, todo] = result;

        // Use the updateItem helper from loroAPI for consistency
        const success = loroAPI.updateItem<TodoItem>('todo', id, (currentItem) => {
            return { ...currentItem, ...updateData };
        });

        if (success) {
            return logToolActivity('updateTodo', `Todo "${todo.text}" updated successfully`);
        } else {
            return logToolActivity('updateTodo', `Failed to update todo with ID ${id}`, false);
        }
    } catch (error) {
        console.error('Error updating todo:', error);
        const message = error instanceof Error ? error.message : String(error);
        return logToolActivity('updateTodo', message, false);
    }
}

/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function updateTodoImplementation(parameters: ToolParameters): string {
    console.log('Called updateTodo tool with parameters:', parameters);

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
        const originalText = parsedParams.originalText as string | undefined;
        const newText = parsedParams.newText as string | undefined;
        const completedStr = parsedParams.completed as string | boolean | undefined;
        const tags = parsedParams.tags as string | undefined;

        // Handle the completed parameter which might be a string "true"/"false"
        let completed: boolean | undefined = undefined;
        if (typeof completedStr === 'boolean') {
            completed = completedStr;
        } else if (typeof completedStr === 'string') {
            completed = completedStr.toLowerCase() === 'true';
        }

        // Call the new implementation with appropriate parameters
        execute({
            todoId,
            text: originalText,
            newText,
            completed,
            tags
        }).then(result => {
            console.log('Todo updated with result:', result);
        }).catch(err => {
            console.error('Error in updateTodo execution:', err);
        });

        // Return a preliminary success message
        // The actual result will be displayed through the notification system
        const result = {
            success: true,
            message: `Updated todo`
        };

        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in updateTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error updating todo: ${errorMessage}`
        };

        return JSON.stringify(result);
    }
} 