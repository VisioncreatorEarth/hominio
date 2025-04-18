import { hominioDB, type Docs, docChangeNotifier, triggerDocChangeNotification } from './hominio-db';
import { canRead, canDelete } from './hominio-caps';
import { readable, get, type Readable } from 'svelte/store';
import { LoroMap } from 'loro-crdt';
import { browser } from '$app/environment';
import { authClient, getCurrentEffectiveUser as getCurrentEffectiveUserType } from '$lib/KERNEL/hominio-auth';
import type { CapabilityUser } from './hominio-caps';
import { validateEntityJsonAgainstSchema } from './hominio-validate';

type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

// --- Helper Function for Default Name Generation (Moved here) ---
function generateDefaultEntityName(places: Record<string, LoroJsonValue> | null | undefined): string {
    if (!places) {
        return 'Unnamed Entity';
    }
    const nameParts: string[] = [];
    const sortedKeys = Object.keys(places).sort();

    for (const key of sortedKeys) {
        const value = places[key];
        if (typeof value === 'string') {
            if (value.startsWith('@')) {
                nameParts.push(`@${value.substring(1, 9)}`);
            } else if (value.trim() !== '') {
                nameParts.push(value);
            }
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            nameParts.push(String(value));
        }
    }
    if (nameParts.length === 0) {
        return 'Unnamed Entity';
    }
    return nameParts.join(' ');
}
// --- End Helper Function ---

type HqlValue = LoroJsonValue;
type HqlOperator = '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' | '$in' | '$nin' | '$exists' | '$regex' | '$contains' | '$refSchema';
type HqlCondition = { [key in HqlOperator]?: HqlValue | HqlValue[] };
type HqlPlaceFilterValue = HqlValue | HqlCondition | string; // Allow direct @ref string
type HqlMetaFilterValue = HqlValue | HqlCondition;

// Export HQL interfaces used by the UI
export interface HqlFilterObject {
    meta?: {
        [key: string]: HqlMetaFilterValue;
    };
    places?: {
        [key: string]: HqlPlaceFilterValue; // Key is x1, x2 etc.
    };
    $or?: HqlFilterObject[];
    $and?: HqlFilterObject[];
    $not?: HqlFilterObject;
    // Internal marker, not part of public API
    $fromSchema?: string;
}

export interface HqlFromClause {
    pubKey?: string | string[];
    schema?: string; // Name or @pubKey
    owner?: string;
}

export interface HqlQueryRequest {
    operation: 'query';
    from?: HqlFromClause;
    filter?: HqlFilterObject;
}

export interface HqlMutationRequest {
    operation: 'mutate';
    action: 'create' | 'update' | 'delete';
    pubKey?: string; // Required for update/delete
    schema?: string; // Required for create (Name or @pubKey)
    places?: Record<string, LoroJsonValue | string>; // Place data for create/update (@pubKey strings allowed)
}

export type HqlRequest = HqlQueryRequest | HqlMutationRequest;

// Result Types (More specific)

// Export result types used by the UI
export type ResolvedHqlDocument = Record<string, unknown> & { pubKey: string };
export type HqlQueryResult = ResolvedHqlDocument[];
export type HqlMutationResult = Docs | { success: boolean };
export type HqlResult = HqlQueryResult | HqlMutationResult;

// --- HQL Service ---

class HominioQLService {

    private schemaJsonCache: Map<string, Record<string, unknown> | null>;

    constructor() {
        this.schemaJsonCache = new Map();
    }

    /**
     * Main entry point to process an HQL request (non-reactive).
     */
    async process(user: CapabilityUser | null, request: HqlRequest): Promise<HqlResult> {
        this.schemaJsonCache.clear(); // Clear JSON cache
        try {
            if (request.operation === 'query') {
                return await this._handleQuery(user, request);
            } else if (request.operation === 'mutate') {
                return await this._handleMutate(user, request);
            } else {
                throw new Error(`Invalid HQL operation: ${(request as { operation: string }).operation}`);
            }
        } catch (error) {
            console.error("HQL Processing Error:", error);
            throw error instanceof Error ? error : new Error("An unknown error occurred during HQL processing.");
        }
    }

    // --- Query Handling ---

    private async _handleQuery(user: CapabilityUser | null, request: HqlQueryRequest): Promise<HqlQueryResult> {
        // 1. Fetch ALL document metadata
        const allDbDocsMetadata = await hominioDB.loadAllDocsReturn();

        // 2. Filter by Read Capability (Now handled centrally by `canRead`)
        const accessibleDocsMetadata = allDbDocsMetadata.filter(docMeta => canRead(user, docMeta));

        // 3. Build Combined Filter Criteria
        const combinedFilter: HqlFilterObject = { ...(request.filter || {}) };
        if (request.from?.schema) {
            // Add schema from 'from' clause as an implicit filter condition
            // The actual matching logic is handled within _applyFilter based on $fromSchema marker
            combinedFilter.$fromSchema = request.from.schema;
        }
        if (request.from?.owner) {
            // Add owner from 'from' clause as an implicit meta filter
            combinedFilter.meta = { ...(combinedFilter.meta || {}), owner: request.from.owner };
        }
        if (request.from?.pubKey) {
            // Add pubKey from 'from' clause as an implicit meta filter
            // Note: This simplistic merge assumes pubKey isn't already complexly filtered in request.filter.meta
            // A more robust merge might be needed for complex cases.
            const keys = Array.isArray(request.from.pubKey) ? request.from.pubKey : [request.from.pubKey];
            combinedFilter.meta = { ...(combinedFilter.meta || {}), pubKey: { $in: keys } };
        }

        // 4. Apply Combined Filter
        // Pass the metadata list and the combined filter object.
        // _applyFilter will fetch JSON data internally only for docs that need content inspection.
        const filteredDocsMetadata = await this._applyFilter(accessibleDocsMetadata, combinedFilter);

        // 5. Resolve References (if needed) and Format Results
        // Pass the metadata of the filtered docs.
        const resolvedResults = await this._resolveReferencesAndFormat(filteredDocsMetadata);
        return resolvedResults;
    }

    // Removed _filterInitialSet as its logic is merged into _handleQuery/combinedFilter

    // Renamed and refactored _applyFilter
    private async _applyFilter(docsMetadata: Docs[], filter: HqlFilterObject): Promise<Docs[]> {
        const results: Docs[] = [];
        const fromSchemaFilter = filter.$fromSchema;
        const actualContentFilter = { ...filter };
        delete actualContentFilter.$fromSchema;
        const hasContentFilter = Object.keys(actualContentFilter).length > 0;
        // Cache fetched JSON data within this filter operation to avoid redundant fetches
        const jsonDataCache = new Map<string, Record<string, unknown> | null>();

        // Helper to get JSON data, using cache
        const getJsonData = async (pubKey: string): Promise<Record<string, unknown> | null> => {
            if (jsonDataCache.has(pubKey)) {
                return jsonDataCache.get(pubKey)!;
            }
            // Use getLoroDoc().then(doc => doc?.toJSON())
            const loroDoc = await hominioDB.getLoroDoc(pubKey);
            const jsonData = loroDoc ? (loroDoc.toJSON() as Record<string, unknown>) : null;
            if (jsonData && loroDoc) { // Add pubKey if data exists
                jsonData.pubKey = pubKey;
            }
            jsonDataCache.set(pubKey, jsonData);
            return jsonData;
        };


        for (const docMeta of docsMetadata) {
            let matches = true;

            // --- Check Schema Match (using $fromSchema marker) --- Needs JSON meta.schema
            if (fromSchemaFilter) {
                // Fetch JSON using helper
                const jsonData = await getJsonData(docMeta.pubKey);
                if (!jsonData) {
                    console.warn(`[HQL ApplyFilter] Could not load JSON for schema check on ${docMeta.pubKey}. Skipping.`);
                    matches = false;
                } else {
                    const meta = jsonData?.meta as Record<string, unknown> | undefined;
                    const schemaRef = meta?.schema as string | null | undefined;

                    // Handle potential name vs @pubkey
                    const schemaFilterPubKey = fromSchemaFilter.startsWith('@') ? fromSchemaFilter.substring(1) : null;
                    const schemaFilterName = !fromSchemaFilter.startsWith('@') ? fromSchemaFilter : null;

                    if (schemaFilterPubKey) {
                        // Compare based on PubKey reference (e.g., meta.schema = "@0x123")
                        const entitySchemaPubKeyRef = typeof schemaRef === 'string' && schemaRef.startsWith('@') ? schemaRef.substring(1) : null;
                        matches = entitySchemaPubKeyRef === schemaFilterPubKey;
                    } else if (schemaFilterName) {
                        // Filtering by schema *name* - requires fetching schema doc itself to compare names (NOT IMPLEMENTED - ASSUME MISMATCH)
                        console.warn(`[HQL ApplyFilter] Filtering by schema name ('${schemaFilterName}') is not robustly implemented. Assuming mismatch for doc ${docMeta.pubKey}.`);
                        matches = false;
                    } else {
                        matches = false;
                    }
                }
            }

            // --- Check Content Filter (if schema matched and content filter exists) ---
            if (matches && hasContentFilter) {
                // Fetch JSON using helper (will hit cache if already fetched)
                const jsonData = await getJsonData(docMeta.pubKey);
                if (!jsonData) {
                    console.warn(`[HQL ApplyFilter] Could not load JSON data for content filter on ${docMeta.pubKey}. Skipping.`);
                    matches = false;
                } else {
                    // Evaluate the rest of the filter against the JSON content
                    matches = this._evaluateFilter(jsonData, actualContentFilter);
                }
            }

            if (matches) {
                results.push(docMeta); // Add the *metadata* object
            }
        }
        return results;
    }

    private _evaluateFilter(data: Record<string, unknown>, filter: HqlFilterObject): boolean {
        if (!filter || Object.keys(filter).length === 0) return true;

        for (const key in filter) {
            const filterKey = key as keyof HqlFilterObject;
            const filterValue = filter[filterKey];
            let match = true;

            if (filterKey === '$or' && Array.isArray(filterValue)) {
                match = filterValue.some(subFilter => this._evaluateFilter(data, subFilter));
            } else if (filterKey === '$and' && Array.isArray(filterValue)) {
                match = filterValue.every(subFilter => this._evaluateFilter(data, subFilter));
            } else if (filterKey === '$not' && typeof filterValue === 'object' && filterValue !== null) {
                match = !this._evaluateFilter(data, filterValue as HqlFilterObject);
            } else if (filterKey === 'meta' && typeof filterValue === 'object' && filterValue !== null) {
                match = this._checkFields(data?.meta, filterValue as Record<string, HqlMetaFilterValue>);
            } else if (filterKey === 'places' && typeof filterValue === 'object' && filterValue !== null) {
                const dataField = data?.data as Record<string, unknown> | undefined;
                match = this._checkFields(dataField?.places, filterValue as Record<string, HqlPlaceFilterValue>);
            }

            if (!match) return false;
        }
        return true;
    }

    private _checkFields(dataObject: unknown, conditions: Record<string, unknown>): boolean {
        if (typeof dataObject !== 'object' || dataObject === null) return false;
        const obj = dataObject as Record<string, unknown>; // Cast for access

        for (const field in conditions) {
            const condition = conditions[field];
            const actualValue = obj[field];
            let fieldMatch = false;

            if (typeof condition === 'object' && condition !== null && Object.keys(condition).length > 0 && Object.keys(condition)[0].startsWith('$')) {
                const operator = Object.keys(condition)[0] as HqlOperator;
                const operand = (condition as HqlCondition)[operator];
                fieldMatch = this._applyOperator(actualValue, operator, operand);
            } else {
                // Enhanced check for @ references, primarily for $eq
                fieldMatch = this._checkEqualityOrReference(actualValue, condition);
            }
            if (!fieldMatch) return false;
        }
        return true;
    }

    // Helper specifically for equality comparison, handling @ references
    private _checkEqualityOrReference(actualValue: unknown, expectedValue: unknown): boolean {
        if (typeof actualValue === 'string' && actualValue.startsWith('@') && typeof expectedValue === 'string' && expectedValue.startsWith('@')) {
            // Both are references, compare them (allow comparing with or without @)
            return actualValue === expectedValue || actualValue.substring(1) === expectedValue.substring(1);
        } else if (typeof actualValue === 'string' && actualValue.startsWith('@')) {
            // Actual is ref, expected is not - compare pubKey to expected value
            return actualValue.substring(1) === expectedValue;
        } else if (typeof expectedValue === 'string' && expectedValue.startsWith('@')) {
            // Expected is ref, actual is not - compare actual value to pubKey
            return actualValue === expectedValue.substring(1);
        }
        // Standard equality check
        return this._applyOperator(actualValue, '$eq', expectedValue);
    }

    // Modify _applyOperator to handle $refSchema
    private _applyOperator(value: unknown, operator: HqlOperator, operand: unknown): boolean {
        // Need more robust type checks here potentially
        switch (operator) {
            case '$eq': return value === operand;
            case '$ne': return value !== operand;
            case '$gt': return typeof value === 'number' && typeof operand === 'number' && value > operand;
            case '$gte': return typeof value === 'number' && typeof operand === 'number' && value >= operand;
            case '$lt': return typeof value === 'number' && typeof operand === 'number' && value < operand;
            case '$lte': return typeof value === 'number' && typeof operand === 'number' && value <= operand;
            case '$in': return Array.isArray(operand) && operand.includes(value);
            case '$nin': return Array.isArray(operand) && !operand.includes(value);
            case '$exists': return operand ? value !== undefined : value === undefined;
            case '$contains': return typeof value === 'string' && typeof operand === 'string' && value.includes(operand);
            case '$regex':
                try {
                    return typeof value === 'string' && typeof operand === 'string' && new RegExp(operand).test(value);
                } catch { return false; }
            case '$refSchema':
                {
                    // operand should be the expected schema ref (e.g., '@0x...')
                    if (typeof value !== 'string' || !value.startsWith('@') || typeof operand !== 'string' || !operand.startsWith('@')) {
                        return false; // Value must be a @ reference, operand must be a schema @ reference
                    }
                    const refPubKey = value.substring(1);
                    const expectedSchemaRef = operand;

                    // Silence unused variable warnings for now
                    void refPubKey;
                    void expectedSchemaRef;

                    // --- ASYNCHRONOUS OPERATION NEEDED HERE --- 
                    // This cannot be done synchronously within the current filter structure.
                    // We need to refactor _applyFilter or _evaluateFilter to be async
                    // or pre-fetch referenced schemas.
                    console.warn("[HQL] $refSchema operator is NOT YET IMPLEMENTED due to async requirements within sync filter evaluation.");
                    return false; // Placeholder: return false until implemented
                    // TODO: Implement async fetching and comparison of referenced schema
                }
            default: return false;
        }
    }


    // Renamed _resolveReferences to reflect its new role
    private async _resolveReferencesAndFormat(docsMetadata: Docs[]): Promise<HqlQueryResult> {
        const resolvedDocs: ResolvedHqlDocument[] = [];
        const visited = new Set<string>();

        // Helper function to fetch and cache schema JSON
        const schemaFetcher = async (schemaRef: string): Promise<Record<string, unknown> | null> => {
            if (!schemaRef.startsWith('@')) {
                console.warn(`[HQL Schema Fetcher] Invalid schema ref: ${schemaRef}`);
                return null;
            }
            const schemaPubKey = schemaRef.substring(1);

            if (this.schemaJsonCache.has(schemaPubKey)) {
                return this.schemaJsonCache.get(schemaPubKey)!;
            }

            // Use getLoroDoc -> toJSON pattern
            const schemaLoroDoc = await hominioDB.getLoroDoc(schemaPubKey);
            const schemaJson = schemaLoroDoc ? (schemaLoroDoc.toJSON() as Record<string, unknown>) : null;
            if (schemaJson) {
                schemaJson.pubKey = schemaPubKey; // Add pubKey
            }

            this.schemaJsonCache.set(schemaPubKey, schemaJson);
            return schemaJson;
        };

        for (const docMeta of docsMetadata) {
            visited.clear();
            // Use getLoroDoc -> toJSON pattern
            const loroDoc = await hominioDB.getLoroDoc(docMeta.pubKey);
            const currentJson = loroDoc ? (loroDoc.toJSON() as Record<string, unknown>) : null;

            if (currentJson) {
                currentJson.pubKey = docMeta.pubKey; // Ensure pubKey is present
                const resolved = await this._resolveNode(currentJson, new Set(), schemaFetcher);
                resolvedDocs.push(resolved);
            } else {
                console.warn(`[HQL Resolve] Could not load LoroDoc/JSON for ${docMeta.pubKey}. Skipping.`);
            }
        }
        return resolvedDocs;
    }

    private async _resolveNode(
        currentNodeJson: Record<string, unknown>,
        visited: Set<string>,
        schemaFetcher: (schemaRef: string) => Promise<Record<string, unknown> | null>
    ): Promise<ResolvedHqlDocument> {

        const pubKey = currentNodeJson.pubKey as string;
        if (!pubKey || visited.has(pubKey)) {
            // Return node as is if no pubKey or already visited (cycle detection)
            return currentNodeJson as ResolvedHqlDocument;
        }
        visited.add(pubKey);

        const resolvedNode: Record<string, unknown> = { ...currentNodeJson }; // Shallow copy

        // --- Resolve Schema --- (If meta.schema exists)
        const meta = resolvedNode.meta as Record<string, unknown> | undefined;
        const schemaRef = typeof meta?.schema === 'string' && meta.schema.startsWith('@') ? meta.schema : null;
        if (schemaRef) {
            // Use the passed schemaFetcher (which uses getLoroDoc -> toJSON)
            const schemaData = await schemaFetcher(schemaRef);
            if (schemaData) {
                // Embed schema directly (consider if this should be nested or flattened)
                resolvedNode.$schema = schemaData; // Using $schema to avoid collision
            }
        }

        // --- Resolve References in Places --- (If data.places exists)
        const data = resolvedNode.data as Record<string, unknown> | undefined;
        const places = data?.places as Record<string, unknown> | undefined;
        if (places) {
            const resolvedPlaces: Record<string, unknown> = {};
            for (const key in places) {
                const value = places[key];
                if (typeof value === 'string' && value.startsWith('@')) {
                    const refPubKey = value.substring(1);
                    // Fetch referenced doc LoroDoc to get its name, but don't recurse resolution
                    const refLoroDoc = await hominioDB.getLoroDoc(refPubKey);
                    if (refLoroDoc) {
                        const refMeta = refLoroDoc.getMap('meta');
                        const refName = refMeta?.get('name') as string | undefined;
                        // Store a marker object with essential info, not the full resolved node
                        resolvedPlaces[key] = {
                            $ref: true,
                            pubKey: refPubKey,
                            name: refName ?? refPubKey // Use pubKey as fallback name 
                        };
                    } else {
                        // Keep original reference string or mark as not found
                        resolvedPlaces[key] = {
                            $ref: true,
                            pubKey: refPubKey,
                            $error: 'Not found'
                        };
                    }
                } else {
                    // Copy non-reference values directly
                    resolvedPlaces[key] = value;
                }
            }
            // Replace original places with resolved places
            if (!resolvedNode.data) resolvedNode.data = {};
            (resolvedNode.data as Record<string, unknown>).places = resolvedPlaces;
        }

        return resolvedNode as ResolvedHqlDocument;
    }


    // --- Mutation Handling ---

    private async _handleMutate(user: CapabilityUser | null, request: HqlMutationRequest): Promise<HqlMutationResult> {
        let result: HqlMutationResult; // Declare result variable
        try {
            switch (request.action) {
                case 'create':
                    result = await this._handleCreate(user, request); // Assign result
                    break; // Add break
                case 'update':
                    result = await this._handleUpdate(user, request); // Assign result
                    break; // Add break
                case 'delete':
                    result = await this._handleDelete(user, request); // Assign result
                    break; // Add break
                default:
                    throw new Error(`Invalid mutation action: ${request.action}`);
            }

            // Notify AFTER the mutation logic completes successfully, but yield first
            setTimeout(() => {
                triggerDocChangeNotification();
            }, 0); // Delay of 0ms yields to the event loop

            return result; // Return the stored result

        } catch (error) {
            console.error(`HQL Mutation Error (Action: ${request.action}):`, error);
            throw error instanceof Error ? error : new Error(`An unknown error occurred during HQL mutation: ${request.action}.`);
        }
    }

    private async _handleCreate(user: CapabilityUser | null, request: HqlMutationRequest): Promise<Docs> {
        if (!request.schema) throw new Error("HQL Create: 'schema' is required.");
        if (!request.places) throw new Error("HQL Create: 'places' data is required.");
        const ownerId = user?.id;
        if (!ownerId && !(browser && !navigator.onLine)) throw new Error("HQL Create: User must be authenticated or offline.");
        const effectiveOwnerId = ownerId ?? 'offline_owner';
        const schemaPubKey = request.schema.startsWith('@') ? request.schema.substring(1) : null;
        if (!schemaPubKey) throw new Error(`HQL Create: Schema must be @pubKey reference.`);

        // --- Determine Final Name ---
        // Try deriving from x1 first
        let derivedName: string | undefined = undefined;
        const x1Value = request.places?.x1;
        if (typeof x1Value === 'string') {
            if (x1Value.startsWith('@')) {
                // If x1 is a reference, we cannot easily get the name synchronously here.
                // We'll rely on the generateDefaultEntityName fallback for now.
                // TODO: Consider fetching the referenced doc name if this derivation is crucial.
            } else {
                derivedName = x1Value; // Use direct string value
            }
        }
        // If no name derived from x1, generate default from all places
        const finalName = derivedName && derivedName.trim() !== ''
            ? derivedName
            : generateDefaultEntityName(request.places);
        // ------------------------

        // --- Fetch Schema for Validation ---
        const schemaJson = await this._fetchReferencedDocJson(schemaPubKey, new Map());
        if (!schemaJson) {
            throw new Error(`HQL Create: Schema document ${schemaPubKey} not found.`);
        }
        // ----------------------------------

        // --- Prepare and Validate Entity Data --- 
        const entityJsonToValidate: LoroJsonObject = {
            meta: {
                schema: `@${schemaPubKey}`,
                owner: effectiveOwnerId,
                name: finalName // Use the final determined name
            },
            data: {
                places: request.places ?? {}
            }
        };

        // Perform Validation
        const validationResult = validateEntityJsonAgainstSchema(entityJsonToValidate, schemaJson);
        if (!validationResult.isValid) {
            console.error("HQL Create Validation Failed:", validationResult.errors);
            throw new Error(`Validation failed for new entity: ${validationResult.errors.join(', ')}`);
        }
        // -------------------------------------

        // Perform actual creation via hominioDB, passing the final name
        try {
            const newDocMetadata = await hominioDB.createEntity(
                user,
                schemaPubKey,
                request.places || {},
                effectiveOwnerId,
                { name: finalName } // Pass final name in options
            );
            return newDocMetadata;
        } catch (dbError) {
            console.error("HQL Create: Error calling hominioDB.createEntity:", dbError);
            throw new Error(`Failed to create document in database: ${dbError instanceof Error ? dbError.message : 'Unknown DB error'}`);
        }
    }

    private async _handleUpdate(user: CapabilityUser | null, request: HqlMutationRequest): Promise<Docs> {
        if (!request.pubKey) throw new Error("HQL Update: 'pubKey' is required.");
        if (!request.places) throw new Error("HQL Update: 'places' data is required.");
        const pubKey = request.pubKey;

        // Fetch metadata (needed for potential later validation steps)
        const docMeta = await hominioDB.getDocument(pubKey);
        if (!docMeta) throw new Error(`HQL Update: Document ${pubKey} not found.`);

        // Fetch schema if needed for validation later
        const initialLoroDoc = await hominioDB.getLoroDoc(pubKey);
        if (!initialLoroDoc) throw new Error(`HQL Update: Could not load LoroDoc instance for ${pubKey}.`);
        const initialMetaMap = initialLoroDoc.getMap('meta');
        const schemaRef = initialMetaMap.get('schema') as string | undefined;
        const schemaPubKey = schemaRef?.startsWith('@') ? schemaRef.substring(1) : null;
        let schemaJson: Record<string, unknown> | null = null;
        if (schemaPubKey) {
            schemaJson = await this._fetchReferencedDocJson(schemaPubKey, new Map());
            if (!schemaJson) throw new Error(`HQL Update: Schema document ${schemaPubKey} not found.`);
        }

        // --- Resolve references *before* the update callback --- 
        const updatesToApply: Record<string, LoroJsonValue> = {};
        const placeRefsToResolve = new Map<string, string>();
        for (const key in request.places) {
            const value = request.places[key];
            if (typeof value === 'string' && value.startsWith('@')) placeRefsToResolve.set(key, value.substring(1));
            else updatesToApply[key] = value;
        }
        for (const [key, refPubKey] of placeRefsToResolve) {
            const refDocMeta = await hominioDB.getDocument(refPubKey);
            if (!refDocMeta) throw new Error(`HQL Update: Referenced document ${refPubKey} for place '${key}' not found.`);
            if (!canRead(user, refDocMeta)) throw new Error(`HQL Update: Permission denied to read referenced document ${refPubKey}.`);
            updatesToApply[key] = `@${refPubKey}`; // Add the resolved ref string back
        }
        // ----------------------------------------------------------

        // --- Perform Update and Name Check within Mutation Callback --- 
        // updatesToApply is now accessible here from the outer scope
        await hominioDB.updateDocument(user, pubKey, (loroDoc) => {
            const metaMap = loroDoc.getMap('meta');
            const dataMap = loroDoc.getMap('data');
            const currentPlacesContainer = dataMap.get('places');
            let currentPlacesData: Record<string, LoroJsonValue> = {};

            if (currentPlacesContainer instanceof LoroMap) {
                try { currentPlacesData = currentPlacesContainer.toJSON() as Record<string, LoroJsonValue>; }
                catch (e) { console.error(`[HQL Update mutationFn] Error converting places LoroMap to JSON:`, e); }
            } else if (currentPlacesContainer !== undefined && currentPlacesContainer !== null) {
                console.warn(`[HQL Update mutationFn] Current data.places is not a LoroMap.`);
            }

            // Use updatesToApply from the outer scope
            const newPlacesData = { ...currentPlacesData, ...updatesToApply };
            const newPlacesLoroMap = new LoroMap();
            for (const key in newPlacesData) {
                if (Object.prototype.hasOwnProperty.call(newPlacesData, key)) {
                    newPlacesLoroMap.set(key, newPlacesData[key] ?? null);
                }
            }
            dataMap.setContainer('places', newPlacesLoroMap);

            // Check and Fix Name AFTER places update
            const currentName = metaMap.get('name');
            if (currentName === null || currentName === undefined || String(currentName).trim() === '') {
                const generatedName = generateDefaultEntityName(newPlacesData);
                console.warn(`[HQL Update mutationFn] Setting default name for ${pubKey}: "${generatedName}"`);
                metaMap.set('name', generatedName);
            }
        });
        // --- End Update Call --- 

        // --- Re-fetch and Validate AFTER update --- 
        const updatedLoroDoc = await hominioDB.getLoroDoc(pubKey);
        if (!updatedLoroDoc) throw new Error(`HQL Update: Failed to re-fetch LoroDoc ${pubKey} after update.`);
        const updatedMetaMap = updatedLoroDoc.getMap('meta');

        const finalStatePlacesContainer = updatedLoroDoc.getMap('data').get('places');
        let finalStatePlacesJson: Record<string, LoroJsonValue> = {};
        if (finalStatePlacesContainer instanceof LoroMap) {
            try { finalStatePlacesJson = finalStatePlacesContainer.toJSON() as Record<string, LoroJsonValue>; }
            catch (e) { console.error(`[HQL Update Validation] Error converting final places LoroMap to JSON:`, e); }
        }
        const metaForValidation: LoroJsonObject = {
            name: updatedMetaMap.get('name') as string,
            schema: updatedMetaMap.get('schema') as string,
            pubKey: pubKey
        };
        const entityJsonToValidate: LoroJsonObject = { meta: metaForValidation, data: { places: finalStatePlacesJson } };

        if (schemaJson) {
            const validationResult = validateEntityJsonAgainstSchema(entityJsonToValidate, schemaJson);
            if (!validationResult.isValid) {
                console.error("HQL Update Validation Failed:", validationResult.errors);
                throw new Error(`Validation failed for update: ${validationResult.errors.join(', ')}`);
            }
        } else if (schemaPubKey) {
            console.warn(`[HQL Update] Skipping validation: schema ${schemaPubKey} could not be loaded.`);
        }
        // --- End Validation ---

        // Return latest metadata
        const updatedDocMeta = await hominioDB.getDocument(pubKey);
        if (!updatedDocMeta) throw new Error(`HQL Update: Failed to re-fetch final metadata for ${pubKey}.`);
        return updatedDocMeta;
    }

    private async _handleDelete(user: CapabilityUser | null, request: HqlMutationRequest): Promise<{ success: boolean }> {
        if (!request.pubKey) {
            throw new Error("HQL Delete: 'pubKey' is required.");
        }
        const pubKey = request.pubKey;

        // --- Fetch metadata first for capability check ---
        const docToDelete = await hominioDB.getDocument(pubKey);
        if (!docToDelete) {
            // Already deleted or never existed, return success
            console.warn(`HQL Delete: Document ${pubKey} not found. Assuming already deleted.`);
            return { success: true };
        }

        // --- Capability Check ---
        if (!canDelete(user, docToDelete)) { // Pass user to canDelete
            throw new Error(`HQL Delete: Permission denied to delete document ${pubKey}.`);
        }
        // --- End Capability Check ---

        // Call hominioDB to perform the actual deletion
        try {
            const deleted = await hominioDB.deleteDocument(user, pubKey); // Pass user
            return { success: deleted };
        } catch (dbError) {
            console.error(`HQL Delete: Error calling hominioDB.deleteDocument for ${pubKey}:`, dbError);
            throw new Error(`Failed to delete document in database: ${dbError instanceof Error ? dbError.message : 'Unknown DB error'}`);
        }
    }

    // --- Reactive Query Handling ---
    processReactive(
        getCurrentUserFn: typeof getCurrentEffectiveUserType,
        request: HqlQueryRequest
    ): Readable<HqlQueryResult | null | undefined> {
        if (!browser) {
            // Return a store that resolves once with the non-reactive result server-side
            // Need to get user for SSR call
            const ssrUser = getCurrentUserFn();
            return readable<HqlQueryResult | null>(undefined, (set) => {
                this._handleQuery(ssrUser, request) // Pass user for SSR
                    .then(set)
                    .catch(err => {
                        console.error("SSR Reactive Query Error:", err);
                        set(null); // Set to null on error
                    });
            });
        }

        // Client-side reactive logic
        return readable<HqlQueryResult | null | undefined>(undefined, (set) => {
            let debounceTimer: NodeJS.Timeout | null = null;
            const DEBOUNCE_MS = 50; // REDUCED from 200ms
            let lastSessionState: unknown = undefined; // Track session state
            let currentResults: HqlQueryResult | null = null; // Track current results

            const triggerDebouncedQuery = () => {
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }

                // If we have existing results, don't show loading state
                if (!currentResults) {
                    set(undefined); // Only show loading on initial load
                }

                debounceTimer = setTimeout(async () => {
                    const currentUser = getCurrentUserFn(); // Get FRESH user context
                    try {
                        const result = await this._handleQuery(currentUser, request);
                        currentResults = result; // Store current results
                        set(result);
                    } catch (error) {
                        console.error("Reactive Query Error:", error);
                        // Don't set null if we have previous results to avoid UI flashing
                        if (!currentResults) {
                            set(null);
                        }
                    }
                }, DEBOUNCE_MS);
            };

            // Subscribe to the central document change notifier
            const unsubscribeNotifier = docChangeNotifier.subscribe(() => {
                triggerDebouncedQuery(); // Trigger on data change
            });

            // Subscribe to session changes
            const sessionStore = authClient.useSession();
            const unsubscribeSession = sessionStore.subscribe(session => {
                // Trigger only if session state actually changes
                const currentSessionState = JSON.stringify(session.data); // Simple comparison key
                // Only trigger *after* initial load is complete (lastSessionState is defined)
                if (lastSessionState !== undefined && lastSessionState !== currentSessionState) {
                    triggerDebouncedQuery(); // Trigger on auth change
                }
                lastSessionState = currentSessionState;
            });

            // Initial query execution (no debounce needed)
            (async () => {
                const initialUser = getCurrentUserFn();
                try {
                    const initialResult = await this._handleQuery(initialUser, request);
                    currentResults = initialResult; // Store initial results
                    set(initialResult);
                    // Set initial session state *after* first query completes successfully
                    lastSessionState = JSON.stringify(get(sessionStore).data);
                } catch (error) {
                    console.error("Initial Reactive Query Error:", error);
                    set(null);
                    // Set initial session state even on error to prevent immediate re-trigger
                    lastSessionState = JSON.stringify(get(sessionStore).data);
                }
            })();

            // Cleanup function
            return () => {
                unsubscribeNotifier();
                unsubscribeSession(); // Unsubscribe from session
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
            };
        });
    }

    // --- Helper Methods (No user context needed directly here) ---

    private async _fetchReferencedDocJson(pubKey: string, cache: Map<string, Record<string, unknown> | null>): Promise<Record<string, unknown> | null> {
        if (cache.has(pubKey)) {
            return cache.get(pubKey)!;
        }
        try {
            const loroDoc = await hominioDB.getLoroDoc(pubKey);
            const jsonData = loroDoc ? (loroDoc.toJSON() as Record<string, unknown>) : null;
            cache.set(pubKey, jsonData);
            return jsonData;
        } catch (error) {
            console.warn(`[HQL Helper] Failed to fetch referenced doc ${pubKey}:`, error);
            cache.set(pubKey, null);
            return null;
        }
    }

}


// --- Export Singleton Instance ---
export const hominioQLService = new HominioQLService();

// Add this section for query optimization
interface QueryCacheEntry<T> {
    result: T;
    timestamp: number;
}

const queryCache = new Map<string, QueryCacheEntry<unknown>>();
const CACHE_TTL_MS = 1000; // 1 second cache TTL

export function makeReactiveQuery<T>(
    queryFn: () => Promise<T>,
    opts: { key?: string; skipCache?: boolean } = {}
): { subscribe: (cb: (val: T | undefined) => void) => () => void } {
    const queryKey = opts.key || crypto.randomUUID();
    const skipCache = opts.skipCache || false;

    // Create a readable store that manages subscriptions
    let unsubscribeFromChangeNotifier: (() => void) | undefined;
    let lastValue: T | undefined = undefined;
    let isFirstQuery = true;
    let isQueryInProgress = false;
    let pendingSubscribers: ((val: T | undefined) => void)[] = [];

    // Function to run the query and notify subscribers
    const runQuery = async (subscribers: ((val: T | undefined) => void)[]) => {
        if (isQueryInProgress) return;
        isQueryInProgress = true;

        try {
            // Check cache first if caching is enabled
            if (!skipCache && !isFirstQuery) {
                const cached = queryCache.get(queryKey);
                if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
                    lastValue = cached.result as T;
                    subscribers.forEach(cb => cb(lastValue));
                    isQueryInProgress = false;
                    return;
                }
            }

            // Only set undefined on first query to avoid flickering during updates
            if (isFirstQuery) {
                subscribers.forEach(cb => cb(undefined)); // initial loading state
            }

            const result = await queryFn();
            lastValue = result;

            // Cache the result if not skipping cache
            if (!skipCache) {
                queryCache.set(queryKey, {
                    result,
                    timestamp: Date.now()
                });
            }

            subscribers.forEach(cb => cb(lastValue));
            isFirstQuery = false;
        } catch (error) {
            console.error('Error in reactive query:', error);
            subscribers.forEach(cb => cb(undefined));
        } finally {
            isQueryInProgress = false;

            // Process any subscribers that came in during query execution
            if (pendingSubscribers.length > 0) {
                const currentPending = [...pendingSubscribers];
                pendingSubscribers = [];
                currentPending.forEach(cb => cb(lastValue));
            }
        }
    };

    return {
        subscribe: (cb: (val: T | undefined) => void) => {
            let subscribers: ((val: T | undefined) => void)[] = [cb];

            // Setup document change listener if this is the first subscriber
            if (!unsubscribeFromChangeNotifier) {
                let lastNotificationCount = 0;
                unsubscribeFromChangeNotifier = docChangeNotifier.subscribe(count => {
                    if (count !== lastNotificationCount) {
                        lastNotificationCount = count;
                        runQuery(subscribers);
                    }
                });

                // Initial query
                runQuery(subscribers);
            } else {
                // New subscriber to existing query
                if (isQueryInProgress) {
                    pendingSubscribers.push(cb);
                } else {
                    // Immediately notify with the last value if available
                    cb(lastValue);
                }
                subscribers.push(cb);
            }

            // Return unsubscribe function
            return () => {
                subscribers = subscribers.filter(s => s !== cb);

                // Clean up change listener if no more subscribers
                if (subscribers.length === 0 && unsubscribeFromChangeNotifier) {
                    unsubscribeFromChangeNotifier();
                    unsubscribeFromChangeNotifier = undefined;
                    isFirstQuery = true;
                }
            };
        }
    };
}

