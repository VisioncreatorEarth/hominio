import { browser } from '$app/environment'; // Import browser check
import { LoroDoc } from 'loro-crdt';
import { hashService } from './hash-service';

// Define proper types for Loro document JSON state
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

/**
 * Service for managing Loro documents using content-addressable storage patterns.
 * Handles document creation, import/export, and integrates with hash-service.
 */
export class LoroService {
    /**
     * Create a new empty Loro document with basic initialization
     */
    createEmptyDoc(): LoroDoc {
        const doc = new LoroDoc();
        // No longer adding any initial data or metadata
        return doc;
    }

    /**
     * Generate a public key in the style of hypercore/IPNS
     * @returns A z-prefixed base64url-encoded public key
     */
    generatePublicKey(): string {
        // Generate a random ID of 32 bytes
        let randomBytes: Uint8Array;

        if (browser && window.crypto) {
            // Use browser's crypto API
            randomBytes = new Uint8Array(32);
            window.crypto.getRandomValues(randomBytes);
        } else {
            // Use Node.js crypto module in a way that works with SvelteKit
            // Avoid direct require() to make ESM happy
            try {
                // Dynamic import for Node environments
                randomBytes = new Uint8Array(32);
                // Fill with random values as fallback
                for (let i = 0; i < 32; i++) {
                    randomBytes[i] = Math.floor(Math.random() * 256);
                }
                console.warn('Using Math.random fallback for key generation');
            } catch (err) {
                console.error('Error generating random bytes:', err);
                // Fallback to Math.random if crypto is not available
                randomBytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    randomBytes[i] = Math.floor(Math.random() * 256);
                }
            }
        }

        // Convert to hex string for readability
        return Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Create a document snapshot and generate its CID
     * @param doc The Loro document to snapshot
     * @returns The snapshot data and its CID
     */
    async createSnapshot(doc: LoroDoc): Promise<{
        snapshot: Uint8Array;
        cid: string;
        jsonState: LoroJsonObject;
    }> {
        try {
            // Export the document as a snapshot
            const binaryData = doc.export({ mode: 'snapshot' });
            console.log(`Created snapshot, size: ${binaryData.byteLength} bytes`);
            // Log the first few bytes for debugging
            console.log(`Snapshot header: ${Array.from(binaryData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

            // Generate content ID using hash-service
            const cid = await hashService.hashSnapshot(binaryData);

            // Get JSON representation for easier debugging
            const jsonState = doc.toJSON() as LoroJsonObject;

            return { snapshot: binaryData, cid, jsonState };
        } catch (err) {
            console.error('Failed to create snapshot:', err);
            throw new Error(`Failed to create Loro snapshot: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    /**
     * Create a document update and generate its CID
     * @param doc The Loro document to create an update from
     * @returns The update data and its CID
     */
    async createUpdate(doc: LoroDoc): Promise<{
        update: Uint8Array;
        cid: string;
    }> {
        try {
            // Export the document as an update
            const binaryData = doc.export({ mode: 'update' });
            console.log(`Created update, size: ${binaryData.byteLength} bytes`);
            // Log the first few bytes for debugging
            console.log(`Update header: ${Array.from(binaryData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

            // Generate content ID using hash-service
            const cid = await hashService.hashSnapshot(binaryData);

            return { update: binaryData, cid };
        } catch (err) {
            console.error('Failed to create update:', err);
            throw new Error(`Failed to create Loro update: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    /**
     * Apply an update to a document
     * @param doc The document to update
     * @param update The update to apply
     */
    applyUpdate(doc: LoroDoc, update: Uint8Array): void {
        try {
            if (!update || update.byteLength === 0) {
                throw new Error('Invalid update data: empty or null');
            }

            // Log the first few bytes for debugging
            console.log(`Applying update, size: ${update.byteLength} bytes`);
            console.log(`Update header: ${Array.from(update.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

            // Import the update to the document
            doc.import(update);
        } catch (err) {
            console.error('Failed to apply update:', err);
            throw new Error(`Failed to apply Loro update: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    /**
     * Create a demo document with sample content
     * @returns A document with sample content
     */
    async createDemoDoc(): Promise<{
        doc: LoroDoc;
        snapshot: Uint8Array;
        cid: string;
        pubKey: string;
        jsonState: LoroJsonObject;
    }> {
        // Create a new document
        const doc = this.createEmptyDoc();

        // Add some sample content
        doc.getText('title').insert(0, 'Example Loro Document');
        doc.getText('body').insert(0, 'This is a test document created with Loro CRDT library.');

        // Add metadata
        const meta = doc.getMap('metadata');
        meta.set('author', 'LoroService');
        // Removed createdAt field to keep document clean

        // Generate public key
        const pubKey = this.generatePublicKey();

        // Create snapshot
        const { snapshot, cid, jsonState } = await this.createSnapshot(doc);

        return { doc, snapshot, cid, pubKey, jsonState };
    }
}

// Export a singleton instance
export const loroService = new LoroService(); 