import { LoroDoc, LoroMap } from 'loro-crdt';
import { GENESIS_PUBKEY } from '../../db/constants'; // Import from new constants file

// Define the genesis pubkey constant with 0x prefix - REMOVED, now imported
// export const GENESIS_PUBKEY = `0x${'0'.repeat(64)}`;
const GISMU_SCHEMA_REF = `@${GENESIS_PUBKEY}`; // Reference uses the imported constant

// --- Utility Types ---
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

// --- Interfaces for expected Schema Document Structure (Simplified) ---
// These are for validation logic, not exhaustive type definitions
interface PlaceDefinitionStructure {
    description: string;
    required: boolean;
    validation?: Record<string, unknown> | null;
}

interface TranslationPlaceStructure {
    [key: string]: string;
}

interface TranslationStructure {
    lang: string;
    name: string;
    description: string;
    places: TranslationPlaceStructure;
}

/**
 * Validates the basic structure of a LoroDoc intended to represent a Hominio Schema Definition.
 *
 * Checks for:
 * - Presence and type of required meta fields (name, schema).
 * - Correct schema reference (@GENESIS_PUBKEY (0x...) for non-gismu, null for gismu).
 * - Presence and type of required data fields (places, translations).
 * - Basic structure of places (x1-x5 keys, required fields within each place).
 * - Basic structure of translations (lang, name, description, places).
 *
 * @param doc The LoroDoc instance to validate.
 * @returns An object containing `isValid` (boolean) and an array of `errors` (string[]).
 */
export function validateSchemaDocumentStructure(doc: LoroDoc): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    let isValid = true;

    const meta = doc.getMap('meta');
    const data = doc.getMap('data');

    // --- Meta Validation ---
    if (!meta) {
        errors.push("Missing 'meta' map.");
        isValid = false;
    } else {
        const metaContent = meta.toJSON(); // Get a snapshot for validation
        const name = metaContent.name;
        const schemaRef = metaContent.schema;

        if (typeof name !== 'string' || name.trim() === '') {
            errors.push("Invalid or missing 'meta.name' (must be a non-empty string).");
            isValid = false;
        }

        if (name === 'gismu') {
            if (schemaRef !== null) {
                errors.push("Invalid 'meta.schema' for gismu (must be null).");
                isValid = false;
            }
        } else {
            if (typeof schemaRef !== 'string' || schemaRef !== GISMU_SCHEMA_REF) {
                errors.push(`Invalid or missing 'meta.schema' (must be "${GISMU_SCHEMA_REF}"). Found: ${schemaRef}`);
                isValid = false;
            }
        }
    }

    // --- Data Validation ---
    if (!data) {
        errors.push("Missing 'data' map.");
        isValid = false;
    } else {
        const dataContent = data.toJSON(); // Get a snapshot for validation
        const places = dataContent.places as Record<string, PlaceDefinitionStructure> | undefined;
        const translations = dataContent.translations as TranslationStructure[] | undefined;

        // --- Places Validation ---
        if (typeof places !== 'object' || places === null || Array.isArray(places)) {
            errors.push("Invalid or missing 'data.places' (must be an object).");
            isValid = false;
        } else {
            const allowedPlaceKeys = new Set(['x1', 'x2', 'x3', 'x4', 'x5']);
            const actualPlaceKeys = Object.keys(places);

            if (actualPlaceKeys.length === 0) {
                errors.push("'data.places' cannot be empty.");
                isValid = false;
            }

            for (const key of actualPlaceKeys) {
                if (!allowedPlaceKeys.has(key)) {
                    errors.push(`Invalid key "${key}" in 'data.places'. Only x1-x5 are allowed.`);
                    isValid = false;
                }

                const placeDef = places[key];
                if (typeof placeDef !== 'object' || placeDef === null) {
                    errors.push(`Invalid definition for place "${key}" (must be an object).`);
                    isValid = false;
                    continue; // Skip further checks for this invalid place
                }

                if (typeof placeDef.description !== 'string' || placeDef.description.trim() === '') {
                    errors.push(`Missing or invalid 'description' for place "${key}".`);
                    isValid = false;
                }
                if (typeof placeDef.required !== 'boolean') {
                    errors.push(`Missing or invalid 'required' flag for place "${key}".`);
                    isValid = false;
                }
                if (typeof placeDef.validation !== 'object' || placeDef.validation === null) {
                    // Basic check for now, deeper validation later
                    errors.push(`Missing or invalid 'validation' object for place "${key}".`);
                    isValid = false;
                }
            }
        }

        // --- Translations Validation ---
        if (translations !== undefined) { // Translations are optional
            if (!Array.isArray(translations)) {
                errors.push("Invalid 'data.translations' (must be an array).");
                isValid = false;
            } else {
                const placeKeysInData = new Set(places ? Object.keys(places) : []);
                translations.forEach((trans, index) => {
                    if (typeof trans !== 'object' || trans === null) {
                        errors.push(`Invalid translation entry at index ${index} (must be an object).`);
                        isValid = false;
                        return; // Skip further checks for this invalid translation
                    }
                    if (typeof trans.lang !== 'string' || trans.lang.trim().length !== 2) { // Basic lang code check
                        errors.push(`Invalid or missing 'lang' at translations index ${index}.`);
                        isValid = false;
                    }
                    if (typeof trans.name !== 'string' || trans.name.trim() === '') {
                        errors.push(`Invalid or missing 'name' at translations index ${index}.`);
                        isValid = false;
                    }
                    if (typeof trans.description !== 'string' || trans.description.trim() === '') {
                        errors.push(`Invalid or missing 'description' at translations index ${index}.`);
                        isValid = false;
                    }
                    if (typeof trans.places !== 'object' || trans.places === null || Array.isArray(trans.places)) {
                        errors.push(`Invalid or missing 'places' object at translations index ${index}.`);
                        isValid = false;
                    } else {
                        // Check if translation place keys match the main place keys
                        for (const transPlaceKey in trans.places) {
                            if (!placeKeysInData.has(transPlaceKey)) {
                                errors.push(`Translation place key "${transPlaceKey}" at index ${index} does not exist in main data.places.`);
                                isValid = false;
                            }
                            if (typeof trans.places[transPlaceKey] !== 'string') {
                                errors.push(`Translation place value for "${transPlaceKey}" at index ${index} must be a string.`);
                                isValid = false;
                            }
                        }
                        // Check if all main place keys exist in translation
                        for (const mainPlaceKey of placeKeysInData) {
                            if (!(mainPlaceKey in trans.places)) {
                                errors.push(`Main place key "${mainPlaceKey}" is missing in translation places at index ${index}.`);
                                isValid = false;
                            }
                        }
                    }
                });
            }
        }
    }

    return { isValid, errors };
}

// --- Entity Validation ---

/**
 * Placeholder type for a function that fetches a schema LoroDoc based on its @pubKey reference.
 * Replace with actual implementation later.
 */
type SchemaFetcher = (schemaRef: string) => Promise<LoroDoc | null>;

/**
 * Validates the structure and basic content of a LoroDoc intended to represent a Hominio Entity
 * against its referenced schema definition.
 *
 * Checks for:
 * - Presence and type of required meta fields (name, schema).
 * - Validity of the schema reference format (@0x...).
 * - Presence and type of required data fields (places).
 * - Existence and basic type validation of entity place values against the schema definition.
 *
 * @param entityDoc The entity LoroDoc instance to validate.
 * @param fetchSchema A function to retrieve the schema LoroDoc based on its @pubKey reference.
 * @returns An object containing `isValid` (boolean) and an array of `errors` (string[]).
 */
export async function validateEntityDocument(
    entityDoc: LoroDoc,
    fetchSchema: SchemaFetcher
): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    let isValid = true;

    const entityMetaMap = entityDoc.getMap('meta');
    const entityDataMap = entityDoc.getMap('data');

    // --- Entity Meta Validation ---
    let schemaRef: string | null = null;
    if (!entityMetaMap) {
        errors.push("Missing entity 'meta' map.");
        isValid = false;
    } else {
        // Use .toJSON() on the map
        const metaContent = entityMetaMap.toJSON();
        schemaRef = typeof metaContent.schema === 'string' ? metaContent.schema : null;
        const name = metaContent.name;

        if (typeof name !== 'string' || name.trim() === '') {
            errors.push("Invalid or missing entity 'meta.name' (must be a non-empty string).");
            isValid = false;
        }
        if (!schemaRef || !/^@0x[0-9a-f]{64}$/i.test(schemaRef)) {
            errors.push(`Invalid or missing entity 'meta.schema' (must be in @0x... format). Found: ${schemaRef}`);
            isValid = false;
            schemaRef = null;
        }
    }

    // --- Entity Data Validation ---
    if (!entityDataMap) {
        errors.push("Missing entity 'data' map.");
        isValid = false;
    } else if (!schemaRef) {
        if (isValid) {
            errors.push("Cannot validate entity data without a valid schema reference in meta.schema.");
            isValid = false;
        }
    } else {
        const schemaDoc = await fetchSchema(schemaRef);
        if (!schemaDoc) {
            errors.push(`Schema document not found for reference: ${schemaRef}`);
            isValid = false;
        } else {
            const schemaDataMap = schemaDoc.getMap('data');

            // Get places from Schema Doc
            const schemaPlacesValue = schemaDataMap?.get('places');
            let schemaPlaces: Record<string, PlaceDefinitionStructure> | undefined;
            if (schemaPlacesValue instanceof LoroMap) {
                schemaPlaces = schemaPlacesValue.toJSON() as Record<string, PlaceDefinitionStructure>;
            } else if (schemaPlacesValue !== undefined) {
                errors.push(`Schema document ${schemaRef} 'data.places' is not a Map.`);
                isValid = false;
            }

            // Get places from Entity Doc
            const entityPlacesValue = entityDataMap?.get('places');
            let entityPlaces: Record<string, LoroJsonValue> | undefined;
            if (entityPlacesValue instanceof LoroMap) {
                entityPlaces = entityPlacesValue.toJSON() as Record<string, LoroJsonValue>;
            } else if (entityPlacesValue !== undefined) {
                errors.push(`Entity document 'data.places' is not a Map.`);
                isValid = false;
            } // If undefined, checks below will handle it


            if (!schemaPlaces) {
                if (isValid) { // Avoid duplicate errors if already invalid
                    errors.push(`Schema document ${schemaRef} is missing the 'data.places' definition or it's not a Map.`);
                    isValid = false;
                }
            }
            // Check if entityPlaces is an object (it could be null/undefined if get/toJSON failed or wasn't a map)
            if (typeof entityPlaces !== 'object' || entityPlaces === null) {
                if (isValid) {
                    // Only add error if schemaPlaces *was* valid, otherwise the core issue is the schema
                    if (schemaPlaces) {
                        errors.push("Invalid or missing entity 'data.places' (must be an object/Map).");
                        isValid = false;
                    }
                }
            }

            // Proceed with validation only if both schema and entity places seem structurally correct so far
            if (isValid && schemaPlaces && entityPlaces) {
                const schemaPlaceKeys = Object.keys(schemaPlaces);
                const entityPlaceKeys = Object.keys(entityPlaces);

                // 1. Check required fields
                for (const schemaKey of schemaPlaceKeys) {
                    const schemaPlaceDef = schemaPlaces[schemaKey];
                    if (schemaPlaceDef.required && !(schemaKey in entityPlaces)) {
                        errors.push(`Missing required place "${schemaKey}" in entity.`);
                        isValid = false;
                    }
                }

                // 2. Check entity keys validity
                for (const entityKey of entityPlaceKeys) {
                    if (!(entityKey in schemaPlaces)) {
                        errors.push(`Entity place "${entityKey}" is not defined in schema ${schemaRef}.`);
                        isValid = false;
                    }
                }

                // 3. Validate entity place values
                for (const entityKey in entityPlaces) {
                    if (!(entityKey in schemaPlaces)) continue;

                    const entityValue = entityPlaces[entityKey];
                    const schemaPlaceDef = schemaPlaces[entityKey];
                    const schemaValidation = schemaPlaceDef?.validation;

                    if (!schemaValidation) {
                        errors.push(`Schema place definition for "${entityKey}" in ${schemaRef} is missing the 'validation' object.`);
                        isValid = false;
                        continue;
                    }

                    // Basic Type/Reference Validation
                    const expectedValueType = schemaValidation.value;
                    const expectedSchemaRef = schemaValidation.schema;

                    if (expectedSchemaRef && Array.isArray(expectedSchemaRef)) {
                        if (entityValue === null && expectedSchemaRef.includes(null)) {
                            continue; // Allow null ref
                        }
                        if (typeof entityValue !== 'string' || !/^@0x[0-9a-f]{64}$/i.test(entityValue)) {
                            errors.push(`Place "${entityKey}" value "${entityValue}" is not a valid schema reference (@0x...).`);
                            isValid = false;
                        } else {
                            // TODO: Verify referenced entity's schema matches expectedSchemaRef
                        }
                    } else if (expectedValueType) {
                        if (expectedValueType === 'string' && typeof entityValue !== 'string') {
                            errors.push(`Place "${entityKey}": Expected string, got ${typeof entityValue}.`);
                            isValid = false;
                        } else if (expectedValueType === 'number' && typeof entityValue !== 'number') {
                            errors.push(`Place "${entityKey}": Expected number, got ${typeof entityValue}.`);
                            isValid = false;
                        } else if (expectedValueType === 'boolean' && typeof entityValue !== 'boolean') {
                            errors.push(`Place "${entityKey}": Expected boolean, got ${typeof entityValue}.`);
                            isValid = false;
                        }
                    }
                    // TODO: Complex rule validation (enum, min/max, regex)
                }
            }
        }
    }

    return { isValid, errors };
}

// Add more validation functions later (e.g., for entities, specific validation rules)
