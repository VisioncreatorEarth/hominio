import type { ToolImplementation, ToolParameters } from '../../../ultravox/types';

// Access the global window object for filter state
declare global {
    interface Window {
        __hominio_current_filter?: string;
    }
}

export const implementation: ToolImplementation = async (params: ToolParameters) => {
    try {
        const { tag } = params;

        if (!tag) {
            return {
                success: false,
                error: 'Tag is required',
                toolResultText: 'I need to know which tag you want to filter by.'
            };
        }

        // Log the action
        console.log(`🏷️ Filtering todos by tag: "${tag}"`);

        // Set the current filter
        if (typeof window !== 'undefined') {
            // Store filter in global state
            window.__hominio_current_filter = tag;

            // Trigger custom event for UI update
            window.dispatchEvent(new CustomEvent('hominio:filter-changed', {
                detail: { filter: tag }
            }));

            return {
                success: true,
                message: `Filtered todos by tag: ${tag}`,
                toolResultText: tag === 'all'
                    ? 'I\'ve reset the filter to show all todos.'
                    : `I've filtered your todos to show only items with the "${tag}" tag.`
            };
        } else {
            return {
                success: false,
                error: 'Window object not available',
                toolResultText: 'Sorry, I was unable to filter your todos due to a technical issue.'
            };
        }
    } catch (error) {
        console.error('❌ Error filtering todos:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error filtering todos',
            toolResultText: 'Sorry, I was unable to filter your todos.'
        };
    }
};