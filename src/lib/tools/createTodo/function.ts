import { loroAPI } from '$lib/docs/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';

/**
 * Creates a new todo item
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    text: string;
    tags?: string;
    docId?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        // Get operations for todo schema
        const { create, query } = loroAPI.getOperations<TodoItem>('todo');

        // Check for duplicate
        const existing = query(todo => todo.text === inputs.text.trim());
        if (existing.length > 0) {
            return logToolActivity('createTodo', 'Todo already exists', false);
        }

        // Parse tags
        const tags = inputs.tags
            ? inputs.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [];

        // Create the todo
        const id = create({
            text: inputs.text.trim(),
            completed: false,
            createdAt: Date.now(),
            tags,
            docId: inputs.docId || 'personal' // Default list
        });

        console.log(`Todo created with ID: ${id}`);
        return logToolActivity('createTodo', `Todo created: ${inputs.text}`);
    } catch (error) {
        console.error('Error creating todo:', error);
        return logToolActivity('createTodo', `Error: ${error}`, false);
    }
}

/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function createTodoImplementation(parameters: ToolParameters): string {
    console.log('Called createTodo tool with parameters:', parameters);

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
        const todoText = parsedParams.todoText as string | undefined;
        const tags = parsedParams.tags as string | undefined;
        const listName = parsedParams.listName as string | undefined;

        if (!todoText || typeof todoText !== 'string' || !todoText.trim()) {
            const result = {
                success: false,
                message: 'Invalid todo text provided'
            };
            return JSON.stringify(result);
        }

        // Convert to the format expected by our new implementation
        execute({
            text: todoText.trim(),
            tags,
            docId: listName
        }).then(result => {
            console.log('Todo created with result:', result);
        }).catch(err => {
            console.error('Error in createTodo execution:', err);
        });

        // Return success immediately (the actual operation happens async)
        const result = {
            success: true,
            message: `Created todo: "${todoText}"${tags ? ' with tags: ' + tags : ''}`
        };

        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in createTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error creating todo: ${errorMessage}`
        };

        return JSON.stringify(result);
    }
} 