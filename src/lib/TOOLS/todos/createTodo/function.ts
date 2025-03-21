import type { ToolImplementation, ToolParameters } from '../../../ultravox/types';
import { v4 as uuid } from 'uuid';

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
        __hominio_active_docId?: string;
    }
}

export const implementation: ToolImplementation = async (params: ToolParameters) => {
    try {
        const { todoText, tags = '' } = params;

        if (!todoText) {
            return {
                success: false,
                error: 'Todo text is required',
                toolResultText: 'I need to know what task you want to add to your list.'
            };
        }

        // Log the action
        console.log(`📝 Creating todo: "${todoText}" with tags: ${tags || 'none'}`);

        // Initialize global todo map if needed
        if (typeof window !== 'undefined') {
            if (!window.__hominio_todos) {
                window.__hominio_todos = new Map();
            }

            const todoId = uuid();
            const tagsArray = tags
                ? tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0)
                : [];

            // Create todo item
            const todoItem: TodoItem = {
                id: todoId,
                text: todoText.trim(),
                completed: false,
                createdAt: Date.now(),
                tags: tagsArray,
                docId: window.__hominio_active_docId || 'personal'
            };

            // Add to global todos map
            window.__hominio_todos.set(todoId, todoItem);

            // Trigger custom event for UI update
            window.dispatchEvent(new CustomEvent('hominio:todos-updated'));

            return {
                success: true,
                message: `Created todo: "${todoText}"`,
                toolResultText: `I've added "${todoText}" to your todo list${tags ? ' with tags: ' + tags : ''}.`
            };
        } else {
            return {
                success: false,
                error: 'Window object not available',
                toolResultText: 'Sorry, I was unable to create that todo due to a technical issue.'
            };
        }
    } catch (error) {
        console.error('❌ Error creating todo:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error creating todo',
            toolResultText: 'Sorry, I was unable to create that todo.'
        };
    }
}; 