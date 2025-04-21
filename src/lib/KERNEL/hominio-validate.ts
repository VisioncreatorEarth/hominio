import { GENESIS_PUBKEY } from '../../db/constants'; // Import from new constants file

// Define the genesis pubkey constant with 0x prefix - REMOVED, now imported
// export const GENESIS_PUBKEY = `0x${'0'.repeat(64)}`;
const GISMU_SELBRI_REF = `@${GENESIS_PUBKEY}`; // Reference to the gismu selbri uses the imported constant

// --- Utility Types ---
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

// --- Interfaces for expected Selbri Document Structure (For Validation) ---
// Reflecting the NEW structure with separated javni and skicu

interface SumtiDescriptionStructure {
    description: string;
}

// New interface for validation rules per sumti place
// Export this interface (Simplified)
export interface ValidationRuleStructure {
    required: boolean;
    type: string; // e.g., 'text', 'list', 'map', '@selbri_name' (references are stored as name in seed, resolved to @pubkey later)
}

interface TranslationContentStructure { // Renamed from TranslationStructure
    cmene: string; // Renamed from name
    // description: string; // REMOVED
    sumti: Record<string, string>; // Placeholders (e.g., x1) to translated names
}

/**
 * Validates the basic structure of a Selbri Definition *represented as JSON*.
 *
 * Checks for:
 * - Presence and type of required meta fields (cmene, gismu = 'selbri').
 * - Correct selbri reference (@GENESIS_PUBKEY (0x...)) ONLY for the 'gismu' selbri.
 * - Presence and type of required data fields (sumti, javni). skicu is optional.
 * - Basic structure of sumti (x1-x5 keys, description field).
 * - Basic structure of javni (x1-x5 keys matching sumti, required flag, validation rules).
 * - Basic structure of skicu (if present - lang codes as keys, cmene/sumti map).
 * - Ensures data.selbri is NOT present.
 *
 * @param selbriJson The selbri definition as a JSON object.
 * @returns An object containing `isValid` (boolean) and an array of `errors` (string[]).
 */
export function validateSelbriDocStructure(selbriJson: Record<string, unknown>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    let isValid = true;

    // Access data directly from JSON object
    const meta = selbriJson.meta as Record<string, unknown> | undefined;
    const data = selbriJson.data as Record<string, unknown> | undefined;

    // --- Meta Validation ---
    if (!meta) {
        errors.push("Missing 'meta' map.");
        isValid = false;
    } else {
        const cmene = meta.cmene; // Use cmene
        const gismuType = meta.gismu;
        const selbriRef = meta.selbri; // Check for the (now disallowed) selbri field
        // const description = meta.description; // REMOVED check for description

        if (gismuType !== 'selbri') {
            errors.push(`Invalid 'meta.gismu' value: "${gismuType}". Expected "selbri".`);
            isValid = false;
        }

        if (typeof cmene !== 'string' || cmene.trim() === '') { // Validate cmene
            errors.push("Invalid or missing 'meta.cmene' (must be a non-empty string).");
            isValid = false;
        }
        // Removed check for meta.description

        if (cmene === 'gismu') { // Use cmene
            // Gismu selbri MUST reference itself in meta.selbri (special case for validator)
            if (selbriRef !== GISMU_SELBRI_REF) {
                errors.push(`Invalid 'meta.selbri' for gismu selbri (must be "${GISMU_SELBRI_REF}"). Found: ${selbriRef}`);
                isValid = false;
            }
        } else {
            // Other selbri MUST NOT have meta.selbri defined
            if (selbriRef !== undefined && selbriRef !== null) {
                errors.push(`Invalid 'meta.selbri' found on non-gismu selbri "${cmene}". It should not be present.`); // Use cmene in error
                isValid = false;
            }
        }
    }

    // --- Data Validation ---
    if (!data) {
        errors.push("Missing 'data' map.");
        isValid = false;
    } else {
        const selbriDataRef = data.selbri; // Check for disallowed selbri field
        const sumti = data.sumti as Record<string, SumtiDescriptionStructure> | undefined; // Descriptions
        const javni = data.javni as Record<string, ValidationRuleStructure> | undefined; // Validation rules
        const skicu = data.skicu as Record<string, TranslationContentStructure> | undefined; // Translations/Representations

        // Ensure data.selbri is not present on selbri docs
        if (selbriDataRef !== undefined && selbriDataRef !== null) {
            errors.push("Invalid 'data.selbri' found on selbri document. It should only be present on bridi documents.");
            isValid = false;
        }

        // --- Sumti (Descriptions) Validation ---
        if (typeof sumti !== 'object' || sumti === null || Array.isArray(sumti)) {
            errors.push("Invalid or missing 'data.sumti' (must be an object).");
            isValid = false;
        } else {
            const allowedSumtiKeys = new Set(['x1', 'x2', 'x3', 'x4', 'x5']);
            const actualSumtiKeys = Object.keys(sumti);

            if (actualSumtiKeys.length === 0) {
                errors.push("'data.sumti' cannot be empty.");
                isValid = false;
            }

            for (const key of actualSumtiKeys) {
                if (!allowedSumtiKeys.has(key)) {
                    errors.push(`Invalid key "${key}" in 'data.sumti'. Only x1-x5 are allowed.`);
                    isValid = false;
                }

                const sumtiDesc = sumti[key];
                if (typeof sumtiDesc !== 'object' || sumtiDesc === null) {
                    errors.push(`Invalid description structure for sumti "${key}" (must be an object).`);
                    isValid = false;
                    continue;
                }
                if (typeof sumtiDesc.description !== 'string' || sumtiDesc.description.trim() === '') {
                    errors.push(`Missing or invalid 'description' for sumti "${key}".`);
                    isValid = false;
                }
            }
        }

        // --- Javni (Validation Rules) Validation ---
        if (typeof javni !== 'object' || javni === null || Array.isArray(javni)) {
            errors.push("Invalid or missing 'data.javni' (must be an object).");
            isValid = false;
        } else {
            const sumtiKeys = Object.keys(sumti || {});
            const javniKeys = Object.keys(javni);

            // Ensure javni keys match sumti keys
            if (JSON.stringify(sumtiKeys.sort()) !== JSON.stringify(javniKeys.sort())) {
                errors.push("Keys in 'data.javni' must exactly match keys in 'data.sumti'.");
                isValid = false;
            }

            for (const key of javniKeys) {
                const rule = javni[key];
                if (typeof rule !== 'object' || rule === null) {
                    errors.push(`Invalid validation rule structure for javni "${key}" (must be an object).`);
                    isValid = false;
                    continue;
                }
                if (typeof rule.required !== 'boolean') {
                    errors.push(`Missing or invalid 'required' flag for javni "${key}".`);
                    isValid = false;
                }

            }
        }

        // --- Skicu (Translations) Validation ---
        if (skicu !== undefined) { // Optional
            if (typeof skicu !== 'object' || skicu === null || Array.isArray(skicu)) {
                errors.push("Invalid 'data.skicu' (must be an object keyed by language code).");
                isValid = false;
            } else {
                const sumtiKeysInData = new Set(sumti ? Object.keys(sumti) : []);
                for (const langCode in skicu) {
                    if (typeof langCode !== 'string' || langCode.trim().length !== 2) { // Basic lang code check
                        errors.push(`Invalid language code key "${langCode}" in 'data.skicu'.`);
                        isValid = false;
                    }
                    const transContent = skicu[langCode];
                    if (typeof transContent !== 'object' || transContent === null) {
                        errors.push(`Invalid translation content for lang "${langCode}" (must be an object).`);
                        isValid = false;
                        continue;
                    }
                    if (typeof transContent.cmene !== 'string' || transContent.cmene.trim() === '') { // Check cmene
                        errors.push(`Invalid or missing 'cmene' for lang "${langCode}".`);
                        isValid = false;
                    }
                    // Removed check for description
                    if (typeof transContent.sumti !== 'object' || transContent.sumti === null || Array.isArray(transContent.sumti)) {
                        errors.push(`Invalid or missing 'sumti' object for lang "${langCode}".`);
                        isValid = false;
                    } else {
                        // Check translation sumti keys match main sumti keys
                        for (const transSumtiKey in transContent.sumti) {
                            if (!sumtiKeysInData.has(transSumtiKey)) {
                                errors.push(`Skicu sumti key "${transSumtiKey}" for lang "${langCode}" does not exist in main data.sumti.`);
                                isValid = false;
                            }
                            if (typeof transContent.sumti[transSumtiKey] !== 'string') {
                                errors.push(`Skicu sumti value for "${transSumtiKey}" in lang "${langCode}" must be a string.`);
                                isValid = false;
                            }
                        }
                        // Check all main sumti keys exist in translation
                        for (const mainSumtiKey of sumtiKeysInData) {
                            if (!(mainSumtiKey in transContent.sumti)) {
                                errors.push(`Main sumti key "${mainSumtiKey}" is missing in skicu sumti for lang "${langCode}".`);
                                isValid = false;
                            }
                        }
                    }
                }
            }
        }
    }

    return { isValid, errors };
}

// --- Bridi Validation --- (Renamed from Entity Validation)

/**
 * Validates the structure and basic content of Hominio Bridi *JSON data*
 * against its referenced *Selbri JSON data*.
 *
 * Checks for:
 * - Presence and type of required meta fields (cmene, gismu = 'bridi').
 * - Presence and validity of the selbri reference format (@0x...) in `data.selbri`.
 * - Presence and type of required data field (sumti).
 * - Existence and basic type validation of bridi sumti values against the selbri `data.javni` definition.
 * - Ensures the pubKey of the provided selbri matches the reference in `data.selbri`.
 *
 * @param bridiJson The bridi data as a JSON object.
 * @param selbriJson The defining selbri definition as a JSON object.
 * @returns An object containing `isValid` (boolean) and an array of `errors` (string[]).
 */
export function validateBridiDocAgainstSelbri(
    bridiJson: Record<string, unknown>,
    selbriJson: Record<string, unknown>
): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    let isValid = true;

    // Access data directly from JSON objects
    const bridiMeta = bridiJson.meta as Record<string, unknown> | undefined;
    const bridiData = bridiJson.data as Record<string, unknown> | undefined;

    // --- Bridi Meta Validation ---
    if (!bridiMeta) {
        errors.push("Missing bridi 'meta' map.");
        isValid = false;
    } else {
        const gismuType = bridiMeta.gismu;
        const cmene = bridiMeta.cmene; // Use cmene

        if (gismuType !== 'bridi') {
            errors.push(`Invalid 'meta.gismu' value: "${gismuType}". Expected "bridi".`);
            isValid = false;
        }

        if (typeof cmene !== 'string' || cmene.trim() === '') { // Validate cmene
            errors.push("Invalid or missing bridi 'meta.cmene' (must be a non-empty string).");
            isValid = false;
        }
    }

    // --- Bridi Data Validation ---
    let selbriRef: string | null = null; // Store valid selbri ref for later checks
    if (!bridiData) {
        errors.push("Missing bridi 'data' map.");
        isValid = false;
    } else {
        selbriRef = typeof bridiData.selbri === 'string' ? bridiData.selbri : null;
        const bridiSumti = bridiData.sumti as Record<string, LoroJsonValue> | undefined;

        // Validate data.selbri reference
        if (!selbriRef || !/^@0x[0-9a-f]{64}$/i.test(selbriRef)) {
            errors.push(`Invalid or missing bridi 'data.selbri' (must be in @0x... format). Found: ${selbriRef}`);
            isValid = false;
            selbriRef = null; // Prevent using invalid ref later
        } else {
            // Check if the bridi's selbri ref matches the provided selbri's pubKey
            const selbriPubKey = selbriJson.pubKey as string | undefined;
            if (!selbriPubKey) {
                errors.push(`Provided selbri JSON is missing 'pubKey' for validation.`);
                isValid = false;
            } else if (selbriRef !== `@${selbriPubKey}`) {
                errors.push(`Bridi data.selbri reference (${selbriRef}) does not match provided selbri pubKey (@${selbriPubKey}).`);
                isValid = false;
            }
        }

        // Validate data.sumti structure (basic check)
        if (typeof bridiSumti !== 'object' || bridiSumti === null) {
            // errors.push("Invalid or missing bridi 'data.sumti' (must be an object).");
            // isValid = false; // Allow empty sumti unless rules require fields
        }

        // Proceed with detailed sumti validation only if selbri ref is valid and structures seem okay
        if (isValid && selbriRef) {
            const selbriData = selbriJson.data as Record<string, unknown> | undefined;
            const selbriJavni = selbriData?.javni as Record<string, ValidationRuleStructure> | undefined; // Use javni

            if (!selbriData || !selbriJavni) {
                errors.push(`Provided selbri JSON (${selbriRef}) is missing 'data.javni' definition.`);
                isValid = false;
            } else { // Only validate if selbriJavni exists
                const javniKeys = Object.keys(selbriJavni);
                const bridiSumtiKeys = bridiSumti ? Object.keys(bridiSumti) : [];

                // 1. Check required fields from javni against bridiSumti
                for (const javniKey of javniKeys) {
                    const rule = selbriJavni[javniKey];
                    if (rule.required && (!bridiSumti || !(javniKey in bridiSumti))) { // Check if required and missing in bridiSumti
                        errors.push(`Missing required sumti "${javniKey}" in bridi (defined in selbri javni).`);
                        isValid = false;
                    }
                }

                // 2. Check bridi keys validity (optional: flag extra keys?)
                if (bridiSumti) { // Only if bridiSumti exists
                    for (const bridiKey of bridiSumtiKeys) {
                        if (!(bridiKey in selbriJavni)) {
                            console.warn(`[Validation] Bridi sumti "${bridiKey}" is not defined in selbri javni for "${selbriRef}".`);
                        }
                    }
                }

                // 3. Validate bridi sumti values against selbri javni rules
                if (bridiSumti) { // Only if bridiSumti exists
                    for (const bridiKey in bridiSumti) {
                        if (!(bridiKey in selbriJavni)) continue; // Skip keys not defined in javni

                        const bridiValue = bridiSumti[bridiKey];
                        const rule = selbriJavni[bridiKey]; // Get the rule from javni
                        const expectedType = rule.type;

                        // Required Check
                        if (rule.required && (bridiValue === null || bridiValue === undefined)) {
                            errors.push(`Sumti "${bridiKey}": Required value is missing or null (expected type: ${expectedType}).`);
                            isValid = false;
                            continue; // Skip further type checks if required value is missing
                        }

                        // Type Validation (only if value is not null/undefined or not required)
                        if (bridiValue !== null && bridiValue !== undefined) {
                            const actualValueType = typeof bridiValue;

                            if (expectedType.startsWith('@')) {
                                // Reference check: Expects @0x... format
                                if (typeof bridiValue !== 'string' || !/^@0x[0-9a-f]{64}$/i.test(bridiValue)) {
                                    errors.push(`Sumti "${bridiKey}": Expected document reference (@0x...) but got: ${JSON.stringify(bridiValue)}`);
                                    isValid = false;
                                }
                                // TODO: Optionally check if the referenced selbri name matches expectedType? (@prenu vs @0x...)
                            } else if (expectedType === 'text') {
                                if (actualValueType !== 'string') {
                                    errors.push(`Sumti "${bridiKey}": Expected text (string in JSON) but got ${actualValueType}.`);
                                    isValid = false;
                                }
                            } else if (expectedType === 'list') {
                                if (!Array.isArray(bridiValue)) {
                                    errors.push(`Sumti "${bridiKey}": Expected list (array in JSON) but got ${actualValueType}.`);
                                    isValid = false;
                                }
                            } else if (expectedType === 'map') {
                                if (actualValueType !== 'object' || Array.isArray(bridiValue) || bridiValue === null) {
                                    errors.push(`Sumti "${bridiKey}": Expected map (object in JSON) but got ${bridiValue === null ? 'null' : Array.isArray(bridiValue) ? 'array' : actualValueType}.`);
                                    isValid = false;
                                }
                            } else {
                                // Allow other string types? Or consider this an error?
                                // For now, assume other string types are basic primitives if not Loro types or refs.
                                if (actualValueType !== expectedType) {
                                    // Optional: Warn or error if type isn't one of the known ones
                                    console.warn(`[Validation] Unknown type "${expectedType}" for sumti "${bridiKey}". Basic typeof check performed.`);
                                    if (typeof bridiValue !== expectedType) { // Basic JS typeof check
                                        errors.push(`Sumti "${bridiKey}": Type mismatch. Expected basic type "${expectedType}" but got ${actualValueType}.`);
                                        isValid = false;
                                    }
                                }
                            }
                        }
                    }
                }
                // Check if bridiSumti is null/missing but javni defines required fields (handled in check 1)
            }
        }
    }

    return { isValid, errors };
}

// Add more validation functions later (e.g., for entities, specific validation rules)
