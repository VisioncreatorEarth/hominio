import type { ToolImplementation, UltravoxSession } from '../../../ultravox/types';

export const implementation: ToolImplementation = async () => {
    console.log('🔴 HangUp tool called - ending call');

    // End the call if we have an active session
    if (typeof window !== 'undefined' &&
        (window as Window & typeof globalThis & { __ULTRAVOX_SESSION?: UltravoxSession }).__ULTRAVOX_SESSION) {
        try {
            const session = (window as Window & typeof globalThis & { __ULTRAVOX_SESSION: UltravoxSession }).__ULTRAVOX_SESSION;
            session.leaveCall();
            console.log('✅ Call ended successfully');
            return { success: true, message: 'Call ended' };
        } catch (error) {
            console.error('❌ Error ending call:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error ending call'
            };
        }
    } else {
        console.warn('⚠️ No active Ultravox session found');
        return { success: false, error: 'No active call to end' };
    }
}; 