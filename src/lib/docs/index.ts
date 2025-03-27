/**
 * Loro Docs Module
 * 
 * This module provides a unified API for working with Loro documents and collections.
 */

import { loroAPI } from './loroAPI';

// Re-export the API
export { loroAPI };
export * from './loroAPI';

// Re-export schema types
export type { TodoItem } from './schemas/todo';
export type { TodoList } from './schemas/todoList';

/**
 * Initialize the docs system and discover schemas
 */
export async function initDocs() {
    return loroAPI.discoverSchemas();
}

/**
 * Export a document to binary format
 * @param docName Name of the document
 * @param options Export options
 * @returns Uint8Array of the exported document
 */
export function exportDoc(docName: string, options?: { mode: 'snapshot' | 'update' }) {
    return loroAPI.exportDoc(docName, options);
}

/**
 * Import data into a document
 * @param docName Name of the document
 * @param data Data to import
 */
export function importDoc(docName: string, data: Uint8Array) {
    loroAPI.importDoc(docName, data);
}

// Export default initialization function
export default initDocs; 