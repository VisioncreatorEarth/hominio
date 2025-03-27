/**
 * Ultravox Store Management
 * 
 * This file contains Svelte stores used by the Ultravox system
 */

import { writable } from 'svelte/store';

// Store for handling system errors
export const errorStore = writable<{
    message: string;
    source?: string;
    timestamp?: number;
    error?: Error;
} | null>(null);

// Helper to set a new error
export function setError(message: string, source?: string, error?: Error) {
    errorStore.set({
        message,
        source,
        error,
        timestamp: Date.now()
    });
    console.error(`Error [${source || 'unknown'}]: ${message}`, error);
}

// Helper to clear the error
export function clearError() {
    errorStore.set(null);
} 