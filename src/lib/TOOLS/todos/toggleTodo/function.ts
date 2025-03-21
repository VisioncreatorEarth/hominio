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
                toolResultText: 'I need to know which todo you want to toggle.'
            };
        }

        // Log the action
        console.log(`✓ Toggling todo with text: "${todoText}"`);

        // Check for window and todos
        if (typeof window !== 'undefined' && window.__hominio_todos) {
            // Find all matching todos
            const entries = [...window.__hominio_todos.entries()];
            const matchingTodos = entries.filter(([, todo]) =>
                todo.text.toLowerCase().includes(todoText.toLowerCase())
            );

            console.log(`Found ${matchingTodos.length} matching todos`);

            // If we found exactly one match, toggle it
            if (matchingTodos.length === 1) {
                const [id, todo] = matchingTodos[0];

                // Toggle the completed status
                const updatedTodo = {
                    ...todo,
                    completed: !todo.completed
                };

                // Update in the map
                window.__hominio_todos.set(id, updatedTodo);

                // Trigger custom event for UI update
                window.dispatchEvent(new CustomEvent('hominio:todos-updated'));

                return {
                    success: true,
                    message: `Toggled todo: "${todo.text}"`,
                    toolResultText: `I've marked "${todo.text}" as ${updatedTodo.completed ? 'completed' : 'incomplete'}.`
                };
            }
            // If multiple matches, return info about them
            else if (matchingTodos.length > 1) {
                const todoNames = matchingTodos.map(([, todo]) => `"${todo.text}"`).join(', ');

                return {
                    success: false,
                    error: `Found multiple matching todos: ${todoNames}`,
                    toolResultText: `I found multiple todos that match: ${todoNames}. Please be more specific about which one you want to toggle.`
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
        console.error('❌ Error toggling todo:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error toggling todo',
            toolResultText: 'Sorry, I was unable to toggle that todo.'
        };
    }
}; 