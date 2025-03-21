import type { ToolImplementation, ToolParameters } from '../../../ultravox/types';

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
                toolResultText: 'I need to know which list you want to switch to.'
            };
        }

        // Log the action
        console.log(`🔄 Switching to todo list: "${listName}"`);

        // Check for window and documents
        if (typeof window !== 'undefined' && window.__hominio_documents) {
            // Find the document by name
            const document = window.__hominio_documents.find(
                doc => doc.name.toLowerCase() === listName.toLowerCase()
            );

            if (!document) {
                return {
                    success: false,
                    error: 'List not found',
                    toolResultText: `I couldn't find a list called "${listName}". Please check the name or create a new list.`
                };
            }

            // Set as active document
            window.__hominio_active_docId = document.id;

            // Trigger custom event for UI update
            window.dispatchEvent(new CustomEvent('hominio:document-switched', {
                detail: { docId: document.id }
            }));

            return {
                success: true,
                message: `Switched to todo list: "${listName}"`,
                toolResultText: `I've switched to the "${listName}" todo list.`
            };
        } else {
            return {
                success: false,
                error: 'Document storage not available',
                toolResultText: 'Sorry, I was unable to switch todo lists due to a technical issue.'
            };
        }
    } catch (error) {
        console.error('❌ Error switching todo list:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error switching todo list',
            toolResultText: 'Sorry, I was unable to switch to that todo list.'
        };
    }
};
