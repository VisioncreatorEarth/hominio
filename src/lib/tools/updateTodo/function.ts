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
        // Get operations for todo schema
        const { get, query } = loroAPI.getOperations<TodoItem>('todo');

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

        // If we have an ID, use it directly
        if (inputs.todoId) {
            const todo = get(inputs.todoId);
            if (!todo) {
                return logToolActivity('updateTodo', 'Todo not found', false);
            }

            // Get direct access to the document and map using the new generic helper
            const { map } = loroAPI.getSchemaDetails('todo');

            // Get all keys and check if our ID is among them
            const keys = Array.from(map.keys());
            if (keys.includes(inputs.todoId)) {
                // Get the current item and merge with updates
                const currentItem = map.get(inputs.todoId) as Record<string, unknown>;
                const updatedItem = { ...currentItem, ...updateData };

                // Update the item
                map.set(inputs.todoId, updatedItem);

                // Force update the store manually
                loroAPI.updateStoreForSchema('todo');

                return logToolActivity('updateTodo', `Todo updated successfully`);
            } else {
                return logToolActivity('updateTodo', `Todo with ID ${inputs.todoId} not found in map`, false);
            }
        }

        // Try by text content if provided
        if (inputs.text) {
            // Find matching todos
            const matchingTodos = query(todo => todo.text.toLowerCase().includes(inputs.text!.toLowerCase()));

            if (matchingTodos.length === 0) {
                return logToolActivity('updateTodo', 'No matching todos found', false);
            }

            if (matchingTodos.length > 1) {
                const todoNames = matchingTodos.map(([, todo]) => `"${todo.text}"`).join(', ');
                return logToolActivity('updateTodo', `Found multiple matching todos: ${todoNames}. Please be more specific.`, false);
            }

            // We have exactly one match
            const [id, todo] = matchingTodos[0];

            // Get direct access to the document and map using the new generic helper
            const { map } = loroAPI.getSchemaDetails('todo');

            // Get all keys and check if our ID is among them
            const keys = Array.from(map.keys());
            if (keys.includes(id)) {
                // Get the current item and merge with updates
                const currentItem = map.get(id) as Record<string, unknown>;
                const updatedItem = { ...currentItem, ...updateData };

                // Update the item
                map.set(id, updatedItem);

                // Force update the store manually
                loroAPI.updateStoreForSchema('todo');

                return logToolActivity('updateTodo', `Todo "${todo.text}" updated successfully`);
            } else {
                return logToolActivity('updateTodo', `Todo with ID ${id} not found in map`, false);
            }
        }

        // No ID or text provided
        return logToolActivity('updateTodo', 'No todo ID or text provided', false);
    } catch (error) {
        console.error('Error updating todo:', error);
        return logToolActivity('updateTodo', `Error: ${error}`, false);
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