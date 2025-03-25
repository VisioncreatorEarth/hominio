import { LoroDoc } from 'loro-crdt';
import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';
import { syncService, CLIENT_PEER_ID, SERVER_PEER_ID } from './sync-service';

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
    doc.getMap('meta').set('@type', 'hello-earth');
    doc.getMap('meta').set('@created', new Date().toISOString());

    // Add content
    const content = doc.getMap('content');
    content.set('message', 'Hello Earth!');
    content.set('description', 'This is the first Loro-doc in the Hominio kernel.');

    // Initialize sync state
    const docWithSync = syncService.initDocWithSyncState(doc);

    // Generate content hash
    const hash = createContentHash(docWithSync);

    // Update sync state for both peers
    syncService.updateSyncState(docWithSync, hash, CLIENT_PEER_ID);
    syncService.updateSyncState(docWithSync, hash, SERVER_PEER_ID);

    return { doc: docWithSync, hash };
}

// Store for our Loro-docs (in-memory for now)
export const docStore = new Map<string, LoroDoc>();

// KERNEL registry - just stores the content hash of the current root document
export const KERNEL_REGISTRY = {
    id: '0x0000',  // Simplified ID for example
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