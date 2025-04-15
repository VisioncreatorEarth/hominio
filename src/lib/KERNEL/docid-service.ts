import { browser } from '$app/environment'; // Import browser for environment check

/**
 * Service for generating and managing document IDs
 * Uses pubKey-style IDs (hex format prefixed with 0x)
 */
export class DocIdService {
    /**
     * Generate a document ID using random bytes, prefixed with 0x
     * @returns A 0x-prefixed pubKey format document ID (e.g., 0xabc...def)
     */
    generateDocId(): string {
        // Generate a random ID of 32 bytes
        let randomBytes: Uint8Array;

        if (browser && window.crypto) {
            // Use browser's crypto API
            randomBytes = new Uint8Array(32);
            window.crypto.getRandomValues(randomBytes);
        } else {
            // Use Node.js crypto module (or fallback)
            try {
                // Attempt dynamic import for Node environments (might need adjustment based on build process)
                // For now, using Math.random as a simple cross-env fallback if window.crypto is absent
                console.warn('window.crypto not available. Using Math.random fallback for key generation.');
                randomBytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    randomBytes[i] = Math.floor(Math.random() * 256);
                }
            } catch (err) {
                console.error('Error during random byte generation fallback:', err);
                // Fallback to Math.random if any error occurs
                randomBytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    randomBytes[i] = Math.floor(Math.random() * 256);
                }
            }
        }

        // Convert to hex string and prepend 0x
        const hexString = Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return `0x${hexString}`;
    }

    /**
     * Check if a string appears to be a 0x-prefixed pubKey-format ID
     * @param id The ID to check
     * @returns True if the ID matches 0x-prefixed pubKey format
     */
    isPubKeyFormat(id: string): boolean {
        // pubKeys are 0x followed by 64 hex characters
        return /^0x[0-9a-f]{64}$/i.test(id);
    }
}

// Export a singleton instance
export const docIdService = new DocIdService();