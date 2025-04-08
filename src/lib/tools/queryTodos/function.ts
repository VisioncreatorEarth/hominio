import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';

/**
 * Queries and retrieves todo items, with optional filtering
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs?: {
    tag?: string;
    completed?: boolean;
}): Promise<{ success: boolean; message: string; todos: TodoItem[] }> {
    try {
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();

        // Get operations for todo schema
        const { query } = await loroAPI.getOperations<TodoItem>('todo');

        // Build the query predicate based on input filters
        let todos;
        if (!inputs || (inputs.tag === undefined && inputs.completed === undefined)) {
            // No filters, get all todos
            todos = query(() => true);
        } else {
            // Apply filters
            todos = query(todo => {
                // Check the tag filter if provided
                if (inputs.tag !== undefined) {
                    if (inputs.tag === null) {
                        // null tag means todos with no tags
                        return (!todo.tags || todo.tags.length === 0);
                    } else if (!todo.tags || !todo.tags.includes(inputs.tag)) {
                        return false;
                    }
                }

                // Check the completed filter if provided
                if (inputs.completed !== undefined && todo.completed !== inputs.completed) {
                    return false;
                }

                return true;
            });
        }

        const result = {
            success: true,
            message: `Retrieved ${todos.length} todo items`,
            todos: todos.map(([, todo]) => todo)
        };

        // Log the activity
        logToolActivity('queryTodos', result.message);

        return result;
    } catch (error) {
        console.error('Error querying todos:', error);

        const errorResult = {
            success: false,
            message: `Error: ${error}`,
            todos: []
        };

        // Log the error
        logToolActivity('queryTodos', errorResult.message, false);

        return errorResult;
    }
}

/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function queryTodosImplementation(parameters: ToolParameters): string {
    console.log('Called queryTodos tool with parameters:', parameters);

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

        // Extract parameters
        const tag = parsedParams.tag as string | undefined;
        const completed = typeof parsedParams.completed === 'boolean' ? parsedParams.completed : undefined;

        // Call the new implementation
        const resultPromise = execute({ tag, completed });

        // Handle the promise results
        resultPromise.then(result => {
            console.log('Todos queried with result:', result);
        }).catch(err => {
            console.error('Error in queryTodos execution:', err);
        });

        // For immediate response, return a placeholder
        const result = {
            success: true,
            message: 'Querying todos (results will be processed asynchronously)',
            todos: [] // Empty placeholder - UI should update when async query completes
        };

        // Log activity
        logToolActivity('queryTodos', 'Started todo query operation');

        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in queryTodos tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const result = {
            success: false,
            message: `Error querying todos: ${errorMessage}`,
            todos: []
        };

        // Log error
        logToolActivity('queryTodos', result.message, false);

        return JSON.stringify(result);
    }
}

/**
 * Legacy implementation for backward compatibility with getTodos
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function getTodosImplementation(parameters: ToolParameters): string {
    console.log('Called getTodos tool with parameters (redirecting to queryTodos):', parameters);
    return queryTodosImplementation(parameters);
} 