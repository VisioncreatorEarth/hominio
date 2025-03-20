import { writable } from 'svelte/store';

// Create a store for the current filter
export const currentFilter = writable('all');

// Define types for Ultravox session and tool parameters
type UltravoxSession = {
    registerTool: (name: string, callback: (params: unknown) => Promise<ToolResponse>) => void;
};

type FilterParams = {
    tag?: string;
};

type ToolResponse = {
    success: boolean;
    message?: string;
    error?: string;
};

// Function to register all Hominio tools with Ultravox
export function registerHominionTools(session: UltravoxSession): void {
    if (!session) {
        console.error('No Ultravox session provided to registerHominionTools');
        return;
    }

    console.log('Registering Hominio tools with Ultravox session');

    // Register the filterTodos tool
    session.registerTool('filterTodos', async (params: unknown) => {
        try {
            const { tag = 'all' } = (params as FilterParams) || {};
            console.log(`Filtering todos by tag: ${tag}`);

            // Update the current filter in the store
            currentFilter.set(tag);

            // Return success response
            return { success: true, message: `Filtered todos by tag: ${tag}` };
        } catch (error) {
            console.error('Error filtering todos:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error filtering todos'
            };
        }
    });

    // TODO: Implement other tools (createTodo, toggleTodo, etc.)
    // These should connect to your Loro storage implementation

    console.log('Hominio tools registered successfully');
} 