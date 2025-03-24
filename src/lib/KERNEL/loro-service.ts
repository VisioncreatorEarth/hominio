import { LoroDoc } from 'loro-crdt';
import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';

// Create a content hash from a Loro-doc
export function createContentHash(doc: LoroDoc): string {
    const state = doc.toJSON();
    const stateBytes = new TextEncoder().encode(JSON.stringify(state));
    const hash = blake3(stateBytes);
    return bytesToHex(hash);
}

// Generate a standardized contract-like registry ID
export function createRegistryId(): string {
    // Generate a full 20-byte (40 hex chars) address-like ID
    return '0x' + '0'.repeat(40);
}

// Create a hello earth Loro-doc
export function createHelloEarthDoc(): { doc: LoroDoc; hash: string } {
    const doc = new LoroDoc();

    // Add metadata
    const meta = doc.getMap('meta');
    meta.set('@type', 'hello-earth');
    meta.set('@version', '1.0.0');
    meta.set('@created', new Date().toISOString());

    // Add content
    const content = doc.getMap('content');
    content.set('message', 'Hello Earth!');
    content.set('description', 'This is the first Loro-doc in the Hominio kernel.');

    // Generate content hash
    const hash = createContentHash(doc);

    return { doc, hash };
}

// Store for our Loro-docs (in-memory for now)
export const docStore = new Map<string, LoroDoc>();

// KERNEL registry - just stores the content hash of the current root document
export const KERNEL_REGISTRY = {
    id: createRegistryId(),
    contentHash: ''
};

// Initialize the kernel with hello earth doc
export function initializeKernel() {
    // Create and store hello earth doc
    const { doc, hash } = createHelloEarthDoc();
    docStore.set(hash, doc);

    // Set the kernel registry to point to this doc
    KERNEL_REGISTRY.contentHash = hash;

    return {
        registryId: KERNEL_REGISTRY.id,
        contentHash: hash,
        doc
    };
}

// Helper function to validate registry ID format
export function isValidRegistryId(id: string): boolean {
    return /^0x[0-9a-f]{4}\.[0-9a-f]{6}$/i.test(id);
}

// Helper function to parse registry ID components
export function parseRegistryId(id: string): { prefix: number; suffix: string } | null {
    if (!isValidRegistryId(id)) return null;

    const [prefix, suffix] = id.slice(2).split('.');
    return {
        prefix: parseInt(prefix, 16),
        suffix
    };
} 