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
 * Validates the basic structure of a Schema Definition *represented as JSON*.
 *
 * Checks for:
 * - Presence and type of required meta fields (name, schema).
 * - Correct schema reference (@GENESIS_PUBKEY (0x...) for non-gismu, null for gismu).
 * - Presence and type of required data fields (places, translations).
 * - Basic structure of places (x1-x5 keys, required fields within each place).
 * - Basic structure of translations (lang, name, description, places).
 *
 * @param schemaJson The schema definition as a JSON object.
 * @returns An object containing `isValid` (boolean) and an array of `errors` (string[]).
 */
export function validateSchemaJsonStructure(schemaJson: Record<string, unknown>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    let isValid = true;

    // Access data directly from JSON object
    const meta = schemaJson.meta as Record<string, unknown> | undefined;
    const data = schemaJson.data as Record<string, unknown> | undefined;

    // --- Meta Validation ---
    if (!meta) {
        errors.push("Missing 'meta' map.");
        isValid = false;
    } else {
        // No need for .toJSON()
        const name = meta.name;
        const schemaRef = meta.schema;

        if (typeof name !== 'string' || name.trim() === '') {
            errors.push("Invalid or missing 'meta.name' (must be a non-empty string).");
            isValid = false;
        }

        if (name === 'gismu') {
            // Gismu schema must reference itself
            if (schemaRef !== GISMU_SCHEMA_REF) {
                errors.push(`Invalid 'meta.schema' for gismu (must be "${GISMU_SCHEMA_REF}"). Found: ${schemaRef}`);
                isValid = false;
            }
        } else {
            // Other schemas must reference Gismu
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
        // No need for .toJSON()
        const places = data.places as Record<string, PlaceDefinitionStructure> | undefined;
        const translations = data.translations as TranslationStructure[] | undefined;

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
 * Validates the structure and basic content of Hominio Entity *JSON data*
 * against its referenced *schema JSON data*.
 *
 * Checks for:
 * - Presence and type of required meta fields (name, schema).
 * - Validity of the schema reference format (@0x...).
 * - Presence and type of required data fields (places).
 * - Existence and basic type validation of entity place values against the schema definition.
 *
 * @param entityJson The entity data as a JSON object.
 * @param schemaJson The schema definition as a JSON object.
 * @returns An object containing `isValid` (boolean) and an array of `errors` (string[]).
 */
export function validateEntityJsonAgainstSchema(
    entityJson: Record<string, unknown>,
    schemaJson: Record<string, unknown>
): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    let isValid = true;

    // Access data directly from JSON objects
    const entityMeta = entityJson.meta as Record<string, unknown> | undefined;
    const entityData = entityJson.data as Record<string, unknown> | undefined;

    // --- Entity Meta Validation ---
    let schemaRef: string | null = null;
    if (!entityMeta) {
        errors.push("Missing entity 'meta' map.");
        isValid = false;
    } else {
        // No need for .toJSON()
        schemaRef = typeof entityMeta.schema === 'string' ? entityMeta.schema : null;
        const name = entityMeta.name;

        if (typeof name !== 'string' || name.trim() === '') {
            errors.push("Invalid or missing entity 'meta.name' (must be a non-empty string).");
            isValid = false;
        }
        if (!schemaRef || !/^@0x[0-9a-f]{64}$/i.test(schemaRef)) {
            errors.push(`Invalid or missing entity 'meta.schema' (must be in @0x... format). Found: ${schemaRef}`);
            isValid = false;
            schemaRef = null; // Prevent using invalid ref later
        }
        // Also check if the entity's schema ref matches the provided schema's pubKey
        const schemaPubKey = schemaJson.pubKey as string | undefined;
        if (schemaRef && schemaPubKey && schemaRef !== `@${schemaPubKey}`) {
            errors.push(`Entity schema reference (${schemaRef}) does not match provided schema pubKey (@${schemaPubKey}).`);
            isValid = false;
        }

    }

    // --- Entity Data Validation ---
    if (!entityData) {
        errors.push("Missing entity 'data' map.");
        isValid = false;
    } else if (!schemaRef) {
        if (isValid) {
            errors.push("Cannot validate entity data without a valid schema reference in meta.schema.");
            isValid = false;
        }
    } else {
        // Schema is provided as JSON, no need to fetch
        const schemaData = schemaJson.data as Record<string, unknown> | undefined;

        // Get places from Schema JSON
        const schemaPlaces = schemaData?.places as Record<string, PlaceDefinitionStructure> | undefined;

        // Get places from Entity JSON
        const entityPlaces = entityData?.places as Record<string, LoroJsonValue> | undefined;

        if (!schemaData || !schemaPlaces) {
            if (isValid) {
                errors.push(`Provided schema JSON is missing 'data.places' definition.`);
                isValid = false;
            }
        } else if (typeof entityPlaces !== 'object' || entityPlaces === null) {
            if (isValid) {
                errors.push("Invalid or missing entity 'data.places' (must be an object).");
                isValid = false;
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
                    errors.push(`Entity place "${entityKey}" is not defined in schema.`);
                    isValid = false;
                }
            }

            // 3. Validate entity place values
            for (const entityKey in entityPlaces) {
                if (!(entityKey in schemaPlaces)) continue; // Already caught by check 2

                const entityValue = entityPlaces[entityKey];
                const schemaPlaceDef = schemaPlaces[entityKey];
                const schemaValidation = schemaPlaceDef?.validation as Record<string, unknown> | undefined;

                if (!schemaValidation) {
                    errors.push(`Schema place definition for "${entityKey}" is missing the 'validation' object.`);
                    isValid = false;
                    continue;
                }

                // Basic Type/Reference Validation
                const expectedValueType = schemaValidation.value as string | undefined; // e.g., 'string', 'number', 'boolean'
                const expectedSchemaRef = schemaValidation.schema as (string | null)[] | undefined; // e.g., ['prenu', null]

                if (expectedSchemaRef) { // Check if the value should be a reference
                    if (entityValue === null) {
                        if (!expectedSchemaRef.includes(null)) {
                            errors.push(`Place "${entityKey}": null reference is not allowed by schema.`);
                            isValid = false;
                        }
                        // Null reference is allowed and provided, continue
                    } else if (typeof entityValue !== 'string' || !/^@0x[0-9a-f]{64}$/i.test(entityValue)) {
                        errors.push(`Place "${entityKey}" value "${entityValue}" is not a valid schema reference (@0x...).`);
                        isValid = false;
                    } else {
                        // TODO: Need a way to check the *type* (schema name/pubkey) of the referenced entity.
                        // This requires fetching the referenced entity's schema, which is beyond this function's scope.
                        // For now, we only validate the format.
                        // We could check if expectedSchemaRef contains the referenced entity's schema name if names were reliable.
                    }
                } else if (expectedValueType) { // Check if the value should be a primitive
                    const actualValueType = typeof entityValue;
                    if (expectedValueType === 'string' && actualValueType !== 'string') {
                        errors.push(`Place "${entityKey}": Expected string, got ${actualValueType}.`);
                        isValid = false;
                    } else if (expectedValueType === 'number' && actualValueType !== 'number') {
                        errors.push(`Place "${entityKey}": Expected number, got ${actualValueType}.`);
                        isValid = false;
                    } else if (expectedValueType === 'boolean' && actualValueType !== 'boolean') {
                        errors.push(`Place "${entityKey}": Expected boolean, got ${actualValueType}.`);
                        isValid = false;
                    }
                    // Add check for null if type is defined but value is null
                    else if (entityValue === null) {
                        errors.push(`Place "${entityKey}": Expected ${expectedValueType}, got null.`);
                        isValid = false;
                    }
                } else if (entityValue !== null && typeof entityValue === 'object') {
                    // Handle case where schema expects 'any' (no specific type/ref) but value is complex object/array
                    // This might be okay depending on how 'any' is interpreted
                    // For now, we allow it, but could add stricter checks if needed.
                } else if (!schemaValidation) {
                    // No validation rule defined in schema, allow any basic type (string, number, boolean, null)
                    if (!['string', 'number', 'boolean'].includes(typeof entityValue) && entityValue !== null) {
                        errors.push(`Place "${entityKey}": Invalid type ${typeof entityValue} for place with no specific validation.`);
                        isValid = false;
                    }
                }
                // TODO: Complex rule validation (enum, min/max, regex) - requires parsing schemaValidation.value/rule object
            }
        }
    }

    return { isValid, errors };
}

// Add more validation functions later (e.g., for entities, specific validation rules)
