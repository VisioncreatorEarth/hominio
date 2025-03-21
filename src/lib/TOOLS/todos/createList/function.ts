import type { ToolImplementation, ToolParameters } from '../../../ultravox/types';
import { v4 as uuid } from 'uuid';

// Document interface
interface TodoDocument {
    id: string;
    name: string;
    icon?: string;
    numTodos?: number;
}

// Access the global window object for document management
declare global {
    interface Window {
        __hominio_documents?: TodoDocument[];
        __hominio_active_docId?: string;
    }
}

export const implementation: ToolImplementation = async (params: ToolParameters) => {
    try {
        const { listName } = params;

        if (!listName) {
            return {
                success: false,
                error: 'List name is required',
                toolResultText: 'I need to know what you want to name your new list.'
            };
        }

        // Log the action
        console.log(`📋 Creating new todo list: "${listName}"`);

        // Check for window 
        if (typeof window !== 'undefined') {
            // Initialize documents array if needed
            if (!window.__hominio_documents) {
                window.__hominio_documents = [];
            }

            // Check if list already exists
            const existingList = window.__hominio_documents.find(
                doc => doc.name.toLowerCase() === listName.toLowerCase()
            );

            if (existingList) {
                return {
                    success: false,
                    error: 'List already exists',
                    toolResultText: `You already have a list named "${listName}". You can switch to it or create a list with a different name.`
                };
            }

            // Create new list
            const newListId = uuid();
            const newList: TodoDocument = {
                id: newListId,
                name: listName,
                numTodos: 0
            };

            // Add to documents array
            window.__hominio_documents.push(newList);

            // Set as active document
            window.__hominio_active_docId = newListId;

            // Trigger custom event for UI update
            window.dispatchEvent(new CustomEvent('hominio:documents-updated'));

            return {
                success: true,
                message: `Created new todo list: "${listName}"`,
                toolResultText: `I've created a new todo list called "${listName}" and switched to it.`
            };
        } else {
            return {
                success: false,
                error: 'Window object not available',
                toolResultText: 'Sorry, I was unable to create a new todo list due to a technical issue.'
            };
        }
    } catch (error) {
        console.error('❌ Error creating todo list:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error creating todo list',
            toolResultText: 'Sorry, I was unable to create a new todo list.'
        };
    }
}; 