import { blake3 } from '@noble/hashes/blake3';
import { LoroDoc } from 'loro-crdt';

export class HashService {
    /**
     * Generate Blake3 hash for a Loro document
     */
    async hash(doc: LoroDoc): Promise<string> {
        const docState = doc.toJSON();
        const stateBytes = new TextEncoder().encode(JSON.stringify(docState));
        const hashBytes = blake3(stateBytes);
        return Array.from(hashBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Verify document matches its hash
     */
    async verify(doc: LoroDoc, hash: string): Promise<boolean> {
        const computedHash = await this.hash(doc);
        return computedHash === hash;
    }
}

// Export singleton instance
export const hashService = new HashService(); 