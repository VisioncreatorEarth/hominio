// HQL Types for Hominio Query Language
// Based on Lojban semantic structure with places

// Types of values that a place can hold
export type PlaceType = 'entity' | 'string' | 'number' | 'boolean' | 'any';

// Definition of a place in a schema
export interface PlaceDefinition {
    description: string;
    type: PlaceType | PlaceType[];
    required: boolean;
    entitySchemas?: string[]; // References to schemas that are valid for this place when type includes 'entity'
    validation?: {
        pattern?: string;   // Regex pattern for string validation
        min?: number;       // Min value for number validation
        max?: number;       // Max value for number validation
        options?: ValidationOptionValue[]; // List of valid options
    };
}

// Valid values for validation options
export type ValidationOptionValue = string | number | boolean;

// Translation of a schema into a specific language
export interface SchemaTranslation {
    lang: SupportedLanguage;
    name: string;
    description: string;
    places: Record<string, string>; // Mapping of place keys (x1, x2, etc.) to translated descriptions
}

// Languages supported by the HQL system
export type SupportedLanguage = 'loj' | 'en' | 'de';

// Definition of a schema
export interface SchemaDefinition {
    pubkey: string;        // Unique identifier for this schema
    schema: string | null; // Reference to gismu metaschema (null for gismu itself)
    name: string;          // Primary name (Lojban gismu)
    places: Record<string, PlaceDefinition>; // Definition of schema places in Lojban (x1, x2, x3, etc.)
    translations: SchemaTranslation[]; // Translations for non-Lojban languages (en, de, etc.)
}

// Values that can be stored in a place
export type PlaceValue = string | number | boolean | string[] | null;

// Definition of an entity
export interface Entity {
    pubkey: string;        // Unique identifier for this entity
    schema: string;        // Reference to the schema this entity follows
    name?: string;         // Optional display name
    places: Record<string, PlaceValue>; // Values for each place defined in the schema
    translations?: Translation; // Made optional since some entities don't have translations
}

// Combined document type for both schemas and entities
export interface HQLDocument {
    pubkey: string;
    type: 'schema' | 'entity';
    document: SchemaDefinition | Entity;
}

// Schema type categories for conceptual organization
export enum SchemaCategory {
    GISMU = 'gismu',       // Fundamental Lojban root word (meta-schema)
    SCHEMA = 'schema',     // Regular schema (derived from gismu)
    ENTITY = 'entity'      // Instance of a schema
}

export type Translation = {
    jbo: string;
    en: string;
    de: string;
};

export type Place = {
    position: string;
    type: 'leaf' | 'reference';
    description: Translation;
    value?: PlaceValue;
};

export type Document = SchemaDefinition | Entity; 