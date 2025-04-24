// import { browser } from '$app/environment'; // Removed unused import
import { blake3 } from '@noble/hashes/blake3';
import { LoroDoc } from 'loro-crdt';
import b4a from 'b4a';

/**
 * Provides cryptographic hashing functionality.
 * Uses Blake3 via @noble/hashes.
 */
class HashService {
    /**
     * Calculates the Blake3 hash of a string.
     * @param input The string to hash.
     * @returns A Promise that resolves to the hexadecimal representation of the hash.
     */
    async hashString(input: string): Promise<string> {
        try {
            // Encode the string to Uint8Array
            const data = b4a.from(input, 'utf8'); // Use b4a for string to buffer
            // Calculate Blake3 hash
            const hashBytes = blake3(data);
            // Convert hash bytes to hex string
            return b4a.toString(hashBytes, 'hex');
        } catch (error) {
            console.error('[HashService] Error calculating Blake3 hash for string:', error);
            // Fallback or rethrow depending on desired behavior
            throw new Error('Failed to hash string using Blake3');
        }
    }

    /**
     * Generate Blake3 hash for a raw Loro document snapshot (Uint8Array).
     * Returns the hash as a hex string.
     */
    async hashSnapshot(snapshot: Uint8Array): Promise<string> {
        const hashBytes = blake3(snapshot);
        // Use b4a for efficient buffer-to-hex conversion
        return b4a.toString(hashBytes, 'hex');
    }

    /**
     * Verify a snapshot matches its hash.
     */
    async verifySnapshot(snapshot: Uint8Array, hashHex: string): Promise<boolean> {
        const computedHashHex = await this.hashSnapshot(snapshot);
        return computedHashHex === hashHex;
    }

    /**
     * Generate Blake3 hash for a full Loro document object.
     */
    async hashDoc(doc: LoroDoc): Promise<string> {
        // Exporting snapshot is more direct for hashing the canonical block content
        const snapshot = doc.exportSnapshot();
        return this.hashSnapshot(snapshot);
    }

    /**
     * Verify a Loro document object matches its hash.
     * Note: Generally prefer verifySnapshot.
     */
    async verifyDoc(doc: LoroDoc, hashHex: string): Promise<boolean> {
        const computedHashHex = await this.hashDoc(doc);
        return computedHashHex === hashHex;
    }
}

// Export singleton instance
export const hashService = new HashService(); 