import { blake3 } from '@noble/hashes/blake3';
import { LoroDoc } from 'loro-crdt';
import b4a from 'b4a';

export class HashService {
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

    // --- Kept for potential other uses, but snapshot methods are primary for Hypercore ---

    /**
     * Generate Blake3 hash for a full Loro document object.
     * Note: Generally prefer hashSnapshot for Hypercore blocks.
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