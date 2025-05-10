/**
 * Ultravox Store Management
 * 
 * This file contains Svelte stores used by the Ultravox system
 */

import { writable } from 'svelte/store';

// Store for handling system errors
export const errorStore = writable<{ message: string; stack?: string } | null>(null);

export function setError(error: Error) {
    errorStore.set({ message: error.message, stack: error.stack });
}

export function clearError() {
    errorStore.set(null);
}

// Activity tracking
export const recentToolActivity = writable<{ action: string; message: string; timestamp: number; id?: string } | null>(null);

/**
 * Log a tool activity and show a notification
 * @param action The action performed
 * @param message The result message
 * @param success Whether the action was successful
 * @returns The result object
 */
export function logToolActivity(
    action: string,
    message: string,
    success = true
): { success: boolean; message: string } {
    const timestamp = Date.now();
    const activityId = crypto.randomUUID();

    // Show recent activity indicator in global state
    const activity = {
        id: activityId,
        action,
        message,
        timestamp
    };

    recentToolActivity.set(activity);

    // Clear the notification after 5 seconds
    setTimeout(() => {
        // Only clear if this is still the current notification
        recentToolActivity.update(current => {
            if (current?.id === activityId) {
                return null;
            }
            return current;
        });
    }, 5000);

    return { success, message };
} 