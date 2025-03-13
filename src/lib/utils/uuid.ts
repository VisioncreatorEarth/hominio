/**
 * Generate a RFC4122 v4 compliant UUID
 * Works in all browsers including iOS Safari that doesn't support crypto.randomUUID
 */
export function generateUUID(): string {
    // Check if native implementation exists
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }

    // Fallback implementation
    const getRandomHex = (c: string) => {
        const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    };

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, getRandomHex);
}

/**
 * Generate a short UUID (first 8 characters)
 * Useful for display purposes
 */
export function generateShortUUID(): string {
    return generateUUID().slice(0, 8);
} 