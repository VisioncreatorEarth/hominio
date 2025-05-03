import { LoroDoc } from 'loro-crdt';
import { getDataFromDoc } from '../loro-engine'; // Added import for getDataFromDoc
import type { QueryContext } from '../hominio-types'; // Added import for QueryContext

/**
 * Selects a field value from a LoroDoc or a plain JS object based on a path string.
 * Paths like "doc.pubkey" require the pubkey to be passed explicitly.
 * Paths like "self.data..." or "self.metadata..." operate on the doc/object.
 * Paths like "link.x1" operate on a composite link object.
 * Paths like "result.fieldName" operate on an intermediate result object.
 */
export function selectFieldValue( // Added export
    source: LoroDoc | Record<string, unknown> | null | undefined,
    fieldPath: string,
    docPubKey?: string // Optional: Needed for "doc.pubkey"
): unknown {
    if (!source) return undefined;

    if (fieldPath === 'doc.pubkey') return docPubKey;

    // Handle direct access on non-LoroDoc objects (like intermediate results or composite links)
    if (!(source instanceof LoroDoc)) {
        const pathParts = fieldPath.split('.');
        let currentValue: unknown = source;
        for (const part of pathParts) {
            if (currentValue === undefined || currentValue === null) return undefined;
            if (typeof currentValue === 'object' && currentValue !== null) {
                currentValue = (currentValue as Record<string, unknown>)[part];
            } else {
                return undefined; // Cannot access property on non-object
            }
        }
        return currentValue;
    }

    // Handle LoroDoc access
    if (!fieldPath.startsWith('self.')) {
        console.warn(`[selectFieldValue] Invalid field path for LoroDoc: "${fieldPath}". Must start with "self." or be "doc.pubkey".`);
        return undefined;
    }

    const path = fieldPath.substring(5);
    let baseObject: unknown;
    let relativePath: string;

    if (path.startsWith('metadata.')) {
        baseObject = source.getMap('metadata')?.toJSON();
        relativePath = path.substring(9);
    } else if (path.startsWith('data.')) {
        baseObject = getDataFromDoc(source); // Assumes getDataFromDoc handles Loro types correctly
        relativePath = path.substring(5);
    } else if (path === 'metadata') {
        baseObject = source.getMap('metadata')?.toJSON();
        relativePath = '';
    } else if (path === 'data') {
        baseObject = getDataFromDoc(source);
        relativePath = '';
    } else {
        // Default to accessing metadata if no prefix?
        console.warn(`[selectFieldValue] Ambiguous path for LoroDoc: "${fieldPath}". Assuming metadata access.`);
        baseObject = source.getMap('metadata')?.toJSON();
        relativePath = path;
    }

    if (baseObject === undefined || baseObject === null) return undefined;

    if (!relativePath) { // Path was just 'self.metadata' or 'self.data'
        return baseObject;
    }

    const pathParts = relativePath.split('.');
    let currentValue: unknown = baseObject;

    for (const part of pathParts) {
        if (currentValue === undefined || currentValue === null) return undefined;

        // Handle nested access within plain JS objects returned by toJSON() or getDataFromDoc()
        if (typeof currentValue === 'object' && currentValue !== null) {
            currentValue = (currentValue as Record<string, unknown>)[part];
        } else {
            return undefined; // Cannot access property on primitive
        }
    }

    return currentValue;
}

/**
 * Helper to resolve a variable reference or return a literal.
 * Returns undefined if the value is not found or not a string.
 */
export function resolveValue(value: string | { variable: string } | undefined, context: QueryContext): string | undefined { // Added export
    if (typeof value === 'object' && value !== null && 'variable' in value && value.variable) {
        const resolved = context[value.variable];
        return typeof resolved === 'string' ? resolved : undefined;
    } else if (typeof value === 'string') {
        return value;
    }
    return undefined; // Return undefined if value is undefined or invalid format
} 