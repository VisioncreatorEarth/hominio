import { writable, derived, get } from 'svelte/store';
import type { HQLDocument, SchemaDefinition, Entity, SupportedLanguage } from './types';
import { schemas, entities, getAllDocuments } from './data';

// Create stores
const documentsStore = writable<HQLDocument[]>([]);
const selectedDocumentPubkey = writable<string | null>(null);
const selectedLanguage = writable<SupportedLanguage>('loj');

// Initialize stores
function initializeStores() {
    // Load all documents
    const allDocs = getAllDocuments();
    documentsStore.set(allDocs);
}

// Get a schema by its ID
function getSchemaById(schemaId: string): SchemaDefinition | null {
    // Find schema in documents store
    const docs = get(documentsStore);
    const schemaDoc = docs.find(
        (doc) => doc.type === 'schema' && doc.pubkey === schemaId
    );

    if (schemaDoc && schemaDoc.type === 'schema') {
        return schemaDoc.document as SchemaDefinition;
    }

    // Fallback to direct schemas object if not found in documents
    return schemas[schemaId] || null;
}

// Get an entity by its ID
function getEntityById(entityId: string): Entity | null {
    // Find entity in documents store
    const docs = get(documentsStore);
    const entityDoc = docs.find(
        (doc) => doc.type === 'entity' && doc.pubkey === entityId
    );

    if (entityDoc && entityDoc.type === 'entity') {
        return entityDoc.document as Entity;
    }

    // Fallback to direct entities object if not found in documents
    return entities[entityId] || null;
}

// Check if a schema is a gismu (meta-schema)
function isGismuSchema(schemaId: string): boolean {
    const schema = getSchemaById(schemaId);
    return schema ? schema.name === 'gismu' || schema.schema === null : false;
}

// Get translation for a schema based on current language
// This function will get the translation from translations array, 
// or use the root definition if Lojban is selected
function getSchemaTranslation(schema: SchemaDefinition, lang: SupportedLanguage) {
    // If Lojban is requested, return the root definition as the translation
    if (lang === 'loj') {
        let description = '';
        if (schema.name === 'gismu') {
            description = 'lo liste be lo lojbo ke krasi valsi';
        } else {
            description = `lo ka ${schema.name}`;
        }

        return {
            lang: 'loj',
            name: schema.name,
            description: description,
            places: Object.fromEntries(
                Object.entries(schema.places).map(([key, place]) => [key, place.description])
            )
        };
    }

    // Otherwise find in translations array
    return schema.translations.find(t => t.lang === lang);
}

// Get all documents of a specific schema type
function getDocumentsBySchemaType(schemaType: string): HQLDocument[] {
    const docs = get(documentsStore);

    if (schemaType === 'gismu') {
        // For gismu filter, return the gismu schema itself and all schemas derived from it
        return docs.filter(doc => {
            if (doc.type === 'schema') {
                const gismuPubkey = getGismuPubkey();
                // The gismu schema itself or any schema that references it
                return doc.document.name === 'gismu' ||
                    (gismuPubkey && doc.document.schema === gismuPubkey);
            }
            return false;
        });
    }

    return docs.filter(doc => {
        if (doc.type === 'schema') {
            return doc.document.name === schemaType;
        } else if (doc.type === 'entity') {
            // Make sure schema is not null before passing to getSchemaById
            if (!doc.document.schema) return false;
            const schema = getSchemaById(doc.document.schema);
            return schema ? schema.name === schemaType : false;
        }
        return false;
    });
}

// Get the pubkey of the GISMU meta-schema
function getGismuPubkey(): string {
    const docs = get(documentsStore);
    const gismuSchema = docs.find(doc =>
        doc.type === 'schema' && doc.document.name === 'gismu'
    );
    return gismuSchema ? gismuSchema.pubkey : '';
}

// Select a document by its pubkey
function selectDocument(pubkey: string) {
    selectedDocumentPubkey.set(pubkey);
}

// Select a language
function selectLanguage(lang: SupportedLanguage) {
    selectedLanguage.set(lang);
}

// Selected document derived store
const selectedDocument = derived(
    [documentsStore, selectedDocumentPubkey],
    ([$docs, $selectedPubkey]) => {
        if (!$selectedPubkey) return null;
        return $docs.find((doc) => doc.pubkey === $selectedPubkey) || null;
    }
);

// Initialize on module load
initializeStores();

// Export the HQL store
export const hqlStore = {
    documents: documentsStore,
    selectedDocument,
    selectedLanguage,
    selectDocument,
    selectLanguage,
    getSchemaById,
    getEntityById,
    isGismuSchema,
    getDocumentsBySchemaType,
    getGismuPubkey,
    getSchemaTranslation
}; 