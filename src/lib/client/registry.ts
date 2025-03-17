import { LoroDoc } from 'loro-crdt';

// The Genesis UUID is the registry ID for HUMAN registry
export const HUMAN_REGISTRY_UUID = '00000000-0000-0000-0000-000000000000';
// The DAO UUID for the DAO registry
export const DAO_REGISTRY_UUID = '11111111-1111-1111-1111-111111111111';

// Domain constants
export const HUMAN_REGISTRY_DOMAIN = 'homin.io';
export const DAO_REGISTRY_DOMAIN = 'o.homin.io';

/**
 * Document registry entry as stored in the registry
 */
export interface RegistryDocEntry {
    uuid: string;
    docType: string;
    title: string;
    domain?: string;
    owner?: string;
    createdAt: number;
    currentSnapshotId: string;
    meta?: Record<string, unknown>;
}

/**
 * Creates a base registry document for server setup
 * This structure initializes with the HUMAN registry and DAO registry entries
 */
export function createBaseRegistry(): LoroDoc {
    const registry = new LoroDoc();
    const docsMap = registry.getMap('documents');

    // Add the HUMAN registry entry
    docsMap.set(HUMAN_REGISTRY_UUID, {
        uuid: HUMAN_REGISTRY_UUID,
        docType: 'registry',
        title: 'HUMAN Registry',
        domain: HUMAN_REGISTRY_DOMAIN,
        owner: HUMAN_REGISTRY_DOMAIN,
        createdAt: Date.now(),
        currentSnapshotId: 'server'
    } as RegistryDocEntry);

    // Add the DAO registry entry
    docsMap.set(DAO_REGISTRY_UUID, {
        uuid: DAO_REGISTRY_UUID,
        docType: 'registry',
        title: 'DAO Registry',
        domain: DAO_REGISTRY_DOMAIN,
        owner: DAO_REGISTRY_DOMAIN,
        createdAt: Date.now(),
        currentSnapshotId: 'server'
    } as RegistryDocEntry);

    return registry;
}

/**
 * Helper function to get a registry document entry from a document
 */
export function getRegistryEntry(doc: LoroDoc, entryUuid: string): RegistryDocEntry | null {
    try {
        const docsMap = doc.getMap('documents');
        if (!docsMap) return null;

        const entry = docsMap.get(entryUuid);
        return entry as RegistryDocEntry || null;
    } catch {
        return null;
    }
}

/**
 * Helper function to list all entries in a registry document
 */
export function listRegistryEntries(doc: LoroDoc): RegistryDocEntry[] {
    try {
        const docsMap = doc.getMap('documents');
        if (!docsMap) return [];

        const keys = docsMap.keys();
        const entries: RegistryDocEntry[] = [];

        for (const key of keys) {
            const entry = docsMap.get(key) as RegistryDocEntry;
            if (entry) {
                entries.push(entry);
            }
        }

        return entries;
    } catch {
        return [];
    }
} 