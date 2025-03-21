import type { ToolImplementation, ToolParameters } from '../../../ultravox/types';

// Todo item interface
interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    createdAt: number;
    tags: string[];
    docId: string;
}

// Access the global window object for todo management
declare global {
    interface Window {
        __hominio_todos?: Map<string, TodoItem>;
    }
}

export const implementation: ToolImplementation = async (params: ToolParameters) => {
    try {
        const { todoText } = params;

        if (!todoText) {
            return {
                success: false,
                error: 'Todo text is required',
                toolResultText: 'I need to know which todo you want to remove.'
            };
        }

        // Log the action
        console.log(`🗑️ Removing todo with text: "${todoText}"`);

        // Check for window and todos
        if (typeof window !== 'undefined' && window.__hominio_todos) {
            // Find all matching todos
            const entries = [...window.__hominio_todos.entries()];
            const matchingTodos = entries.filter(([, todo]) =>
                todo.text.toLowerCase().includes(todoText.toLowerCase())
            );

            console.log(`Found ${matchingTodos.length} matching todos`);

            // If we found exactly one match, remove it
            if (matchingTodos.length === 1) {
                const [id, todo] = matchingTodos[0];
                window.__hominio_todos.delete(id);

                // Trigger custom event for UI update
                window.dispatchEvent(new CustomEvent('hominio:todos-updated'));

                return {
                    success: true,
                    message: `Removed todo: "${todo.text}"`,
                    toolResultText: `I've removed "${todo.text}" from your list.`
                };
            }
            // If multiple matches, return info about them
            else if (matchingTodos.length > 1) {
                const todoNames = matchingTodos.map(([, todo]) => `"${todo.text}"`).join(', ');

                return {
                    success: false,
                    error: `Found multiple matching todos: ${todoNames}`,
                    toolResultText: `I found multiple todos that match: ${todoNames}. Please be more specific about which one you want to remove.`
                };
            }
            // No matches
            else {
                return {
                    success: false,
                    error: 'No matching todos found',
                    toolResultText: 'I couldn\'t find a todo matching that description. Please try a different description or check if it exists.'
                };
            }
        } else {
            return {
                success: false,
                error: 'Todo storage not available',
                toolResultText: 'Sorry, I was unable to access your todos due to a technical issue.'
            };
        }
    } catch (error) {
        console.error('❌ Error removing todo:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error removing todo',
            toolResultText: 'Sorry, I was unable to remove that todo.'
        };
    }
}; 