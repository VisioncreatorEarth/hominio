import type { ToolImplementation } from '../../ultravox/types';

// Access Ultravox session for ending call
declare global {
    interface Window {
        __ULTRAVOX_SESSION?: {
            endCall: () => void;
        };
    }
}

export const implementation: ToolImplementation = async () => {
    try {
        // Log the action
        console.log('📞 Hanging up call');

        // Try to access the Ultravox session
        if (typeof window !== 'undefined' && window.__ULTRAVOX_SESSION) {
            // End the call using Ultravox
            window.__ULTRAVOX_SESSION.endCall();

            return {
                success: true,
                message: 'Call ended',
                toolResultText: 'I\'ll end our call now. Have a great day!'
            };
        } else {
            // Fallback for when Ultravox session is not available
            console.warn('No Ultravox session available, cannot hang up');

            // Dispatch a custom event that the UI can listen for
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('hominio:end-call'));
            }

            return {
                success: true,
                message: 'Call end requested',
                toolResultText: 'I\'ll end our call now. Have a great day!'
            };
        }
    } catch (error) {
        console.error('❌ Error hanging up call:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error ending call',
            toolResultText: 'Sorry, I was unable to end the call.'
        };
    }
}; 