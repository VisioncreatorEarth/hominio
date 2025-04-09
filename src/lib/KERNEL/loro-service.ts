import { browser } from '$app/environment'; // Import browser check
import { LoroDoc } from 'loro-crdt';
import { hashService } from './hash-service';

// Re-add dynamic import for randomBytes on server-side
let randomBytes: ((size: number) => Buffer) | undefined;
if (!browser) {
    import('crypto').then(crypto => {
        randomBytes = crypto.randomBytes;
    }).catch(err => console.error('Failed to load crypto module on server:', err));
}

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
        // Assign a random peer ID by default
        doc.setPeerId(Math.floor(Math.random() * 1000000));
        return doc;
    }

    /**
     * Generate a public key in the style of hypercore/IPNS
     * @returns A z-prefixed base64url-encoded public key
     */
    generatePublicKey(): string {
        let bytes: Uint8Array;
        if (browser) {
            // Use browser's crypto API
            bytes = new Uint8Array(32);
            window.crypto.getRandomValues(bytes);
        } else {
            // Use Node's crypto API (dynamically imported)
            if (!randomBytes) {
                // Handle case where dynamic import might not be ready or failed
                console.error('Node crypto.randomBytes not available when called.');
                // Fallback strategy: Generate less secure random bytes as a last resort
                // Or throw an error if strict security is required.
                bytes = new Uint8Array(32).map(() => Math.floor(Math.random() * 256));
                // Alternatively: throw new Error('Node crypto.randomBytes failed to load.');
            }
            else {
                bytes = randomBytes(32);
            }
        }
        // Format: z + base64url encoding of 32 bytes
        // Use Buffer.from for consistent base64url encoding
        // btoa is browser-native for Base64, but Buffer handles Base64URL
        // We need a cross-compatible way. Using Buffer might require polyfills in browser.
        // Let's try a manual base64url conversion:
        const base64 = btoa(String.fromCharCode(...bytes));
        const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return 'z' + base64url;
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
        // Export the document as a snapshot
        const snapshot = doc.exportSnapshot();

        // Generate content ID using hash-service
        const cid = await hashService.hashSnapshot(snapshot);

        // Get JSON representation for easier debugging
        const jsonState = doc.toJSON() as LoroJsonObject;

        return { snapshot, cid, jsonState };
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
        // Export the document as an update
        const update = doc.export({ mode: 'update' });

        // Generate content ID using hash-service
        const cid = await hashService.hashSnapshot(update);

        return { update, cid };
    }

    /**
     * Apply an update to a document
     * @param doc The document to update
     * @param update The update to apply
     */
    applyUpdate(doc: LoroDoc, update: Uint8Array): void {
        doc.import(update);
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
        meta.set('createdAt', new Date().toISOString());

        // Generate public key
        const pubKey = this.generatePublicKey();

        // Create snapshot
        const { snapshot, cid, jsonState } = await this.createSnapshot(doc);

        return { doc, snapshot, cid, pubKey, jsonState };
    }
}

// Export a singleton instance
export const loroService = new LoroService(); 