import { hominioDB, type Docs } from './hominio-db';
import { validateEntityJsonAgainstSchema } from './hominio-validate'; // Re-add import
import { canRead, canDelete, type CapabilityUser, canWrite } from './hominio-caps';
// --- Add Svelte store imports for reactive queries ---
import { readable, type Readable, get } from 'svelte/store';
import { docChangeNotifier } from './hominio-db'; // Import the notifier
import { authClient } from '$lib/KERNEL/hominio-auth'; // Import authClient
// ---------------------------------------------------
import { LoroMap } from 'loro-crdt'; // <-- ADDED LoroMap import

type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

type HqlValue = LoroJsonValue;
type HqlOperator = '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' | '$in' | '$nin' | '$exists' | '$regex' | '$contains';
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
    async process(request: HqlRequest): Promise<HqlResult> {
        this.schemaJsonCache.clear(); // Clear JSON cache
        try {
            // Fetch user internally for this specific operation
            const user = get(authClient.useSession()).data?.user as CapabilityUser | null;

            if (request.operation === 'query') {
                return await this._handleQuery(request, user);
            } else if (request.operation === 'mutate') {
                return await this._handleMutate(request, user);
            } else {
                throw new Error(`Invalid HQL operation: ${(request as { operation: string }).operation}`);
            }
        } catch (error) {
            console.error("HQL Processing Error:", error);
            throw error instanceof Error ? error : new Error("An unknown error occurred during HQL processing.");
        }
    }

    // --- Query Handling ---

    private async _handleQuery(request: HqlQueryRequest, user: CapabilityUser | null): Promise<HqlQueryResult> {
        // 1. Fetch ALL document metadata
        const allDbDocsMetadata = await hominioDB.loadAllDocsReturn();

        // 2. Filter by Read Capability
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
        const resolvedResults = await this._resolveReferencesAndFormat(filteredDocsMetadata, user);
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
                if (typeof condition === 'string' && condition.startsWith('@') && typeof actualValue === 'string' && actualValue.startsWith('@')) {
                    fieldMatch = condition === actualValue || condition.substring(1) === actualValue.substring(1);
                } else if (typeof condition === 'string' && condition.startsWith('@')) {
                    fieldMatch = actualValue === condition.substring(1);
                } else if (typeof actualValue === 'string' && actualValue.startsWith('@')) {
                    fieldMatch = condition === actualValue.substring(1);
                } else {
                    fieldMatch = this._applyOperator(actualValue, '$eq', condition);
                }
            }
            if (!fieldMatch) return false;
        }
        return true;
    }


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
            default: return false;
        }
    }


    // Renamed _resolveReferences to reflect its new role
    private async _resolveReferencesAndFormat(docsMetadata: Docs[], user: CapabilityUser | null): Promise<HqlQueryResult> {
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
                const resolved = await this._resolveNode(currentJson, user, new Set(), schemaFetcher);
                resolvedDocs.push(resolved);
            } else {
                console.warn(`[HQL Resolve] Could not load LoroDoc/JSON for ${docMeta.pubKey}. Skipping.`);
            }
        }
        return resolvedDocs;
    }

    private async _resolveNode(
        currentNodeJson: Record<string, unknown>,
        user: CapabilityUser | null,
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
                    // Fetch referenced doc JSON using getLoroDoc -> toJSON
                    const refLoroDoc = await hominioDB.getLoroDoc(refPubKey);
                    const referencedJson = refLoroDoc ? (refLoroDoc.toJSON() as Record<string, unknown>) : null;

                    if (referencedJson) {
                        referencedJson.pubKey = refPubKey; // Ensure pubKey
                        // Check read capability for referenced doc
                        // Construct a minimal Docs object for capability check
                        const owner = typeof meta?.owner === 'string' ? meta.owner : '';
                        const updatedAt = typeof meta?.updatedAt === 'string' ? meta.updatedAt : '';
                        const referencedDocMeta: Docs = {
                            pubKey: refPubKey,
                            owner: owner,
                            updatedAt: updatedAt
                        };
                        if (canRead(user, referencedDocMeta)) {
                            // Recursively resolve the referenced node
                            resolvedPlaces[key] = await this._resolveNode(referencedJson, user, new Set(visited), schemaFetcher);
                        } else {
                            resolvedPlaces[key] = { $error: 'Permission denied', pubKey: refPubKey };
                        }
                    } else {
                        resolvedPlaces[key] = { $error: 'Not found', pubKey: refPubKey };
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


    // --- Mutation Handling (To be refactored next) ---

    private async _handleMutate(request: HqlMutationRequest, user: CapabilityUser | null): Promise<HqlMutationResult> {
        if (!user) {
            throw new Error("Authentication required for mutations.");
        }
        let result: HqlMutationResult;
        switch (request.action) {
            case 'create':
                result = await this._handleCreate(request, user);
                break;
            case 'update':
                result = await this._handleUpdate(request, user);
                break;
            case 'delete':
                result = await this._handleDelete(request, user);
                break;
            default:
                throw new Error(`Invalid mutation action: ${request.action}`);
        }

        // Notify AFTER the mutation logic completes, but yield first
        setTimeout(() => {
            docChangeNotifier.update(n => n + 1);
        }, 0); // Delay of 0ms yields to the event loop

        return result;
    }

    private async _handleCreate(request: HqlMutationRequest, user: CapabilityUser): Promise<Docs> {
        if (!request.schema) {
            throw new Error("Schema reference ('schema') is required for create action.");
        }

        let schemaPubKey: string;
        if (request.schema.startsWith('@')) {
            schemaPubKey = request.schema.substring(1);
        } else {
            throw new Error("Schema creation via name resolution is not implemented. Use @pubKey format.");
            // ... (schema name lookup logic commented out) ...
        }

        // --- Derive entity name from x1 --- 
        let derivedName: string | undefined = undefined;
        const x1Value = request.places?.x1;
        if (typeof x1Value === 'string') {
            if (x1Value.startsWith('@')) {
                const refPubKey = x1Value.substring(1);
                try {
                    const refLoroDoc = await hominioDB.getLoroDoc(refPubKey);
                    if (refLoroDoc) {
                        derivedName = refLoroDoc.getMap('meta').get('name') as string | undefined;
                    } else {
                        console.warn(`[HQL Create] Referenced doc ${refPubKey} for name not found.`);
                    }
                } catch (err) {
                    console.error(`[HQL Create] Error fetching referenced doc ${refPubKey} for name:`, err);
                }
            } else {
                derivedName = x1Value; // Use direct string value
            }
        }
        // -----------------------------------

        // --- Get schema definition ---
        const schemaLoroDoc = await hominioDB.getLoroDoc(schemaPubKey);
        const schemaJson = schemaLoroDoc ? schemaLoroDoc.toJSON() as Record<string, unknown> : null;
        if (!schemaJson) {
            throw new Error(`Schema document with pubKey ${schemaPubKey} not found or failed to load.`);
        }
        // ----------------------------------

        // --- Prepare entity data for validation ---
        const finalName = derivedName || 'Unnamed Entity'; // Keep this calculation
        const entityJsonToValidate: LoroJsonObject = {
            meta: {
                schema: `@${schemaPubKey}`,
                owner: user.id, // Set owner immediately
                name: finalName // <-- Add the final name here for validation
                // Consider adding other meta fields if validation needs them
            },
            data: {
                places: request.places ?? {}
            }
        };
        // --------------------------------------------------

        // Ensure data is an object before validation
        if (typeof entityJsonToValidate.data !== 'object' || entityJsonToValidate.data === null || Array.isArray(entityJsonToValidate.data)) {
            throw new Error("Internal HQL Error: Constructed entity data is not a valid object for validation.");
        }

        // --- Validate against schema ---
        const validationResult = validateEntityJsonAgainstSchema(entityJsonToValidate, schemaJson);
        if (!validationResult.isValid) {
            console.error("HQL Create Validation Failed:", validationResult.errors);
            throw new Error(`Validation failed for new entity: ${validationResult.errors.join(', ')}`);
        }
        // -------------------------------------

        // Perform actual creation via hominioDB
        const newDocMetadata = await hominioDB.createEntity(schemaPubKey, request.places || {}, user.id, { name: finalName }); // Pass final name

        return newDocMetadata;
    }

    private async _handleUpdate(request: HqlMutationRequest, user: CapabilityUser): Promise<Docs> {
        if (!request.pubKey) {
            throw new Error("Document PubKey ('pubKey') is required for update action.");
        }
        if (!request.places) {
            throw new Error("Place data ('places') is required for update action.");
        }

        const pubKey = request.pubKey;

        // 1. Fetch the document metadata for capability check and schema retrieval
        const docMeta = await hominioDB.getDocument(pubKey);
        if (!docMeta) {
            throw new Error(`Document ${pubKey} not found for update.`);
        }

        // 2. Capability Check (using fetched metadata)
        if (!canWrite(user, docMeta)) {
            throw new Error(`Permission denied: Cannot write to document ${pubKey}`);
        }

        // 3. Get Schema Reference from Existing Document
        // Need the current LoroDoc to get meta.schema
        const currentLoroDoc = await hominioDB.getLoroDoc(pubKey);
        if (!currentLoroDoc) {
            throw new Error(`Could not load current document state for update: ${pubKey}`);
        }
        const currentMeta = currentLoroDoc.getMap('meta');
        const schemaRef = currentMeta.get('schema') as string | undefined;
        if (!schemaRef || !schemaRef.startsWith('@')) {
            throw new Error(`Document ${pubKey} does not have a valid schema reference in its metadata.`);
        }
        const schemaPubKey = schemaRef.substring(1);

        // 4. Fetch Schema for Validation
        const schemaLoroDoc = await hominioDB.getLoroDoc(schemaPubKey);
        const schemaJson = schemaLoroDoc ? schemaLoroDoc.toJSON() : null;
        if (!schemaJson) {
            throw new Error(`Schema document ${schemaRef} not found for validation.`);
        }

        // 5. Prepare Update Data (Resolving @ references like in create)
        const placesUpdate: Record<string, LoroJsonValue> = {};
        for (const key in request.places) {
            const value = request.places[key];
            if (typeof value === 'string' && value.startsWith('@')) {
                placesUpdate[key] = value; // Keep reference string
            } else {
                placesUpdate[key] = value as LoroJsonValue;
            }
        }

        // 6. Validation (Validate the *intended state* after update)
        // This requires merging `placesUpdate` with the current places, which is complex.
        // Simpler approach: Validate just the `placesUpdate` structure against the schema's place definitions.
        // Even simpler: Skip pre-validation and rely on Loro/DB layer errors if structure is wrong.
        // Let's skip pre-validation for now to avoid complexity.
        // const validationResult = validateEntityJsonAgainstSchema({ data: { places: placesUpdate } }, schemaJson);
        // if (!validationResult.valid) {
        //     throw new Error(`Validation failed for update: ${validationResult.errors.join(', ')}`);
        // }

        // 7. Perform Update using generic updateDocument
        await hominioDB.updateDocument(pubKey, (loroDoc) => {
            const dataMap = loroDoc.getMap('data');
            const currentPlacesContainer = dataMap.get('places'); // Get the container/value
            let currentPlacesData: Record<string, LoroJsonValue> = {};

            // Check if it's a LoroMap and convert to plain object if so
            if (currentPlacesContainer instanceof LoroMap) {
                try {
                    // Use toJSON() for a reliable plain JS representation
                    currentPlacesData = currentPlacesContainer.toJSON() as Record<string, LoroJsonValue>;
                } catch (e) {
                    console.error(`[HQL Update mutationFn] Error converting current places LoroMap to JSON for ${pubKey}:`, e);
                    // Leave currentPlacesData as empty {} on error
                }
            } else {
                console.warn(`[HQL Update mutationFn] Current data.places for ${pubKey} is not a LoroMap or doesn't exist. Starting fresh.`);
                // currentPlacesData remains empty {}
            }

            // Merge updates into the plain JS object
            const newPlacesData = { ...currentPlacesData, ...placesUpdate };

            // Create a new LoroMap and populate it from the merged plain object
            const newPlacesLoroMap = new LoroMap();
            for (const key in newPlacesData) {
                if (Object.prototype.hasOwnProperty.call(newPlacesData, key)) {
                    newPlacesLoroMap.set(key, newPlacesData[key]);
                }
            }

            // Replace the entire 'places' container - This should trigger subscription
            dataMap.setContainer('places', newPlacesLoroMap);
        });

        // 8. Return updated document metadata
        const updatedDocMeta = await hominioDB.getDocument(pubKey);
        if (!updatedDocMeta) {
            // This shouldn't happen if the update didn't throw
            throw new Error(`Failed to retrieve document metadata for ${pubKey} after update.`);
        }
        return updatedDocMeta;
    }

    private async _handleDelete(request: HqlMutationRequest, user: CapabilityUser): Promise<{ success: boolean }> {
        const pubKey = request.pubKey;
        if (!pubKey) throw new Error("HQL Delete: pubKey is required.");

        const docToDelete = await hominioDB.getDocument(pubKey);
        if (!docToDelete) {
            // Allow delete requests for non-existent docs? Return success? For now, error.
            throw new Error(`HQL Delete: Document ${pubKey} not found.`);
        }
        if (!canDelete(user, docToDelete)) {
            throw new Error(`HQL Delete: Permission denied to delete document ${pubKey}.`);
        }

        await hominioDB.deleteDocument(pubKey);
        return { success: true };
    }

    // --- Reactive Query Handling ---
    processReactive(
        request: HqlQueryRequest
    ): Readable<HqlQueryResult | null | undefined> {
        // Define the actual query execution function
        const executeQuery = async (): Promise<HqlQueryResult | null> => {
            try {
                // Fetch user internally EACH time query runs for capability checks
                const user = get(authClient.useSession()).data?.user as CapabilityUser | null;
                const result = await this._handleQuery(request, user); // Pass user to internal handler
                return result;
            } catch (error) {
                console.error('[HQL Requery] Query failed:', error);
                return null; // Return null on error
            }
        };

        // Create the readable store
        const store = readable<HqlQueryResult | null | undefined>(undefined, (set) => { // Start as undefined
            let isMounted = true;
            let initialLoadComplete = false;

            // Initial fetch
            executeQuery().then(initialResult => {
                if (isMounted) {
                    set(initialResult); // Set initial result (or null if error)
                    initialLoadComplete = true;
                }
            });

            // Subscribe to changes - *after* initial load starts
            const unsubscribeNotifier = docChangeNotifier.subscribe(async () => {
                // Avoid requery if initial load hasn't finished or component unmounted
                if (!isMounted || !initialLoadComplete) return;

                const newResult = await executeQuery();
                if (isMounted) { // Check again after await
                    set(newResult); // Set new result (or null if error)
                }
            });

            // Cleanup
            return () => {
                isMounted = false;
                unsubscribeNotifier();
            };
        });

        return store; // Return the readable store SYNCHRONOUSLY
    }
} // End of HominioQLService class

// Export singleton instance
export const hominioQLService = new HominioQLService();
