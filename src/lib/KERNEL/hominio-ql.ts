import { hominioDB, type Docs } from './hominio-db';
import { validateEntityJsonAgainstSchema } from './hominio-validate';
import { canRead, canDelete, type CapabilityUser, canWrite } from './hominio-capabilities';

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
     * Main entry point to process an HQL request.
     */
    async process(request: HqlRequest, user: CapabilityUser | null): Promise<HqlResult> {
        this.schemaJsonCache.clear(); // Clear JSON cache
        try {
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
        // Extract schema filter early if present
        const fromSchemaFilter = filter.$fromSchema;
        const actualContentFilter = { ...filter };
        delete actualContentFilter.$fromSchema; // Don't evaluate the marker directly in _evaluateFilter
        const hasContentFilter = Object.keys(actualContentFilter).length > 0;

        for (const docMeta of docsMetadata) {
            let matches = true;

            // --- Pre-filter based on metadata available in docMeta (optimization) ---
            // Example: If filter has { meta: { owner: '...' } }, check docMeta.owner first
            // For simplicity, this pre-filtering is omitted here, but could be added.
            // We currently check owner/pubKey via combinedFilter logic before calling _applyFilter,
            // but deeper meta checks could happen here before fetching JSON.

            // --- Check Schema Match (using $fromSchema marker) --- Needs JSON meta.schema
            if (fromSchemaFilter) {
                // Fetch JSON only if schema filtering is needed
                const jsonData = await hominioDB.getDocumentDataAsJson(docMeta.pubKey);
                if (!jsonData) {
                    console.warn(`[HQL ApplyFilter] Could not load JSON for schema check on ${docMeta.pubKey}. Skipping.`);
                    matches = false;
                } else {
                    const meta = jsonData?.meta as Record<string, unknown> | undefined;
                    const schemaRef = meta?.schema as string | null | undefined; // Schema can be null for gismu

                    // Handle potential name vs @pubkey (crude implementation)
                    const schemaFilterPubKey = fromSchemaFilter.startsWith('@') ? fromSchemaFilter.substring(1) : null;
                    const schemaFilterName = !fromSchemaFilter.startsWith('@') ? fromSchemaFilter : null;

                    if (schemaFilterPubKey) {
                        // Compare based on PubKey
                        const entitySchemaPubKey = typeof schemaRef === 'string' && schemaRef.startsWith('@') ? schemaRef.substring(1) : schemaRef;
                        matches = entitySchemaPubKey === schemaFilterPubKey;
                    } else if (schemaFilterName === 'gismu') {
                        // Special case for gismu (null schema)
                        matches = schemaRef === null;
                    } else if (schemaFilterName) {
                        // Filtering by schema *name* - requires fetching schema doc itself to compare names (NOT IMPLEMENTED - ASSUME MISMATCH)
                        console.warn(`[HQL ApplyFilter] Filtering by schema name ('${schemaFilterName}') is not robustly implemented. Assuming mismatch for doc ${docMeta.pubKey}.`);
                        matches = false;
                    } else {
                        // Invalid fromSchemaFilter format?
                        matches = false;
                    }
                }
            }

            // --- Check Content Filter (if schema matched and content filter exists) ---
            if (matches && hasContentFilter) {
                // Fetch JSON only if needed (if not already fetched for schema check)
                // This assumes getDocumentDataAsJson is efficient enough or cached by hominioDB layer.
                const jsonData = await hominioDB.getDocumentDataAsJson(docMeta.pubKey);
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

        // Keep schema cache within the request lifecycle
        const schemaFetcher = async (schemaRef: string) => {
            if (this.schemaJsonCache.has(schemaRef)) {
                return this.schemaJsonCache.get(schemaRef) || null;
            }
            const schemaJson = await hominioDB.getSchemaDataAsJson(schemaRef);
            this.schemaJsonCache.set(schemaRef, schemaJson);
            return schemaJson;
        };

        for (const docMeta of docsMetadata) {
            visited.clear();
            // Get the current JSON state (includes local updates)
            const jsonData = await hominioDB.getDocumentDataAsJson(docMeta.pubKey);

            if (!jsonData) {
                console.warn(`[HQL ResolveRefs] Could not load JSON data for final result ${docMeta.pubKey}.`);
                // Include basic info even if content fails
                resolvedDocs.push({
                    pubKey: docMeta.pubKey,
                    $error: "Failed to load document content",
                    $localState: { // Add local state info from metadata
                        isUnsynced: !!docMeta.localState,
                        hasLocalSnapshot: !!docMeta.localState?.snapshotCid,
                        localUpdateCount: docMeta.localState?.updateCids?.length ?? 0
                    }
                } as unknown as ResolvedHqlDocument);
                continue;
            }

            // Resolve references within the JSON data
            const resolvedJson = await this._resolveNode(jsonData, user, visited, schemaFetcher);

            // Add local state information to the final resolved document
            resolvedJson.$localState = {
                isUnsynced: !!docMeta.localState,
                hasLocalSnapshot: !!docMeta.localState?.snapshotCid,
                localUpdateCount: docMeta.localState?.updateCids?.length ?? 0
            };

            resolvedDocs.push(resolvedJson);
        }
        return resolvedDocs;
    }

    // _resolveNode remains largely the same, operating on JSON
    private async _resolveNode(
        currentNodeJson: Record<string, unknown>,
        user: CapabilityUser | null,
        visited: Set<string>,
        schemaFetcher: (schemaRef: string) => Promise<Record<string, unknown> | null>
    ): Promise<ResolvedHqlDocument> {
        const pubKey = currentNodeJson.pubKey as string;
        if (!pubKey) {
            // Attempt to find pubKey if missing (e.g., from nested resolution)
            // This part might need review based on how data is structured.
            console.warn("[HQL ResolveNode] Node JSON missing pubKey.");
            // Add placeholder if truly missing
            return { ...currentNodeJson, $error: "Missing pubKey during resolution" } as unknown as ResolvedHqlDocument;
        }

        if (visited.has(pubKey)) {
            return { pubKey, $ref: pubKey, $error: "Cycle detected" } as ResolvedHqlDocument;
        }
        visited.add(pubKey);

        const resolvedJson = { ...currentNodeJson };
        const meta = resolvedJson.meta as Record<string, unknown> | undefined;
        const data = resolvedJson.data as Record<string, unknown> | undefined;
        const metaSchemaRef = meta?.schema as string | undefined;

        let schemaJson: Record<string, unknown> | null = null;
        if (metaSchemaRef) {
            schemaJson = await schemaFetcher(metaSchemaRef);
        }

        if (schemaJson && data?.places && typeof data.places === 'object') {
            const schemaData = schemaJson.data as Record<string, unknown> | undefined;
            const schemaPlacesDef = schemaData?.places as Record<string, unknown> | undefined;

            if (schemaPlacesDef) {
                const resolvedPlaces: Record<string, unknown> = {};
                const currentPlaces = data.places as Record<string, unknown>;

                for (const placeKey in currentPlaces) {
                    const placeValue = currentPlaces[placeKey];

                    if (typeof placeValue === 'string' && placeValue.startsWith('@')) {
                        const refPubKey = placeValue.substring(1);
                        const refDocMeta = await hominioDB.getDocument(refPubKey);

                        if (refDocMeta && canRead(user, refDocMeta)) {
                            const refJsonData = await hominioDB.getDocumentDataAsJson(refPubKey);
                            if (refJsonData) {
                                resolvedPlaces[placeKey] = await this._resolveNode(refJsonData, user, visited, schemaFetcher);
                            } else {
                                resolvedPlaces[placeKey] = { pubKey: refPubKey, $ref: placeValue, $error: "Referenced document data could not be loaded" };
                            }
                        } else {
                            resolvedPlaces[placeKey] = { pubKey: refPubKey, $ref: placeValue, $error: "Permission denied or referenced document not found" };
                        }
                    } else {
                        resolvedPlaces[placeKey] = placeValue;
                    }
                }
                data.places = resolvedPlaces;
            }
        }

        visited.delete(pubKey);
        return resolvedJson as ResolvedHqlDocument;
    }


    // --- Mutation Handling (To be refactored next) ---

    private async _handleMutate(request: HqlMutationRequest, user: CapabilityUser | null): Promise<HqlMutationResult> {
        if (!user) {
            throw new Error("Authentication required for mutations.");
        }

        if (request.action === 'create') {
            return this._handleCreate(request, user);
        } else if (request.action === 'update') {
            return this._handleUpdate(request, user);
        } else if (request.action === 'delete') {
            return this._handleDelete(request, user);
        } else {
            throw new Error(`Invalid mutation action: ${request.action}`);
        }
    }

    private async _handleCreate(request: HqlMutationRequest, user: CapabilityUser): Promise<Docs> {
        if (!request.schema) throw new Error("HQL Create: Schema reference (@pubKey) is required.");
        if (!request.places) throw new Error("HQL Create: Places data is required.");

        // 1. Fetch Schema JSON
        const schemaJson = await hominioDB.getSchemaDataAsJson(request.schema);
        if (!schemaJson) {
            throw new Error(`HQL Create: Schema ${request.schema} not found or not accessible.`);
        }

        // 2. Construct Temporary Entity JSON for Validation
        const tempEntityJson = {
            meta: {
                schema: request.schema,
                name: `New ${(schemaJson.meta as Record<string, unknown>)?.name ?? 'Entity'}`
            },
            data: {
                places: request.places
            }
        };

        // 3. Validate the proposed entity data against the schema JSON
        const validationResult = validateEntityJsonAgainstSchema(tempEntityJson, schemaJson);
        if (!validationResult.isValid) {
            throw new Error(`HQL Create: Validation failed: ${validationResult.errors.join(', ')}`);
        }

        // 4. Extract schema pubKey (without @)
        const schemaPubKey = request.schema.substring(1);

        // 5. Call hominioDB to perform the actual creation
        console.log(`[HQL Create] Validation passed for schema ${request.schema}. Calling hominioDB.createEntity...`);
        const newDbDoc = await hominioDB.createEntity(
            schemaPubKey,
            request.places as Record<string, LoroJsonValue>, // Cast needed
            user.id
        );
        return newDbDoc;
    }

    private async _handleUpdate(request: HqlMutationRequest, user: CapabilityUser): Promise<Docs> {
        const pubKey = request.pubKey;
        if (!pubKey) throw new Error("HQL Update: pubKey is required.");
        if (!request.places || Object.keys(request.places).length === 0) {
            console.log("[HQL Update] No places data provided, returning current doc metadata.");
            const currentDocMeta = await hominioDB.getDocument(pubKey);
            if (!currentDocMeta) throw new Error(`HQL Update: Document ${pubKey} not found.`);
            return currentDocMeta;
        }

        // 1. Fetch Current Entity JSON and Metadata
        const currentEntityJson = await hominioDB.getDocumentDataAsJson(pubKey);
        if (!currentEntityJson) {
            throw new Error(`HQL Update: Failed to load current data for document ${pubKey}.`);
        }
        const currentDocMeta = await hominioDB.getDocument(pubKey);
        if (!currentDocMeta) {
            // Should not happen if getDocumentDataAsJson succeeded, but check defensively
            throw new Error(`HQL Update: Failed to load metadata for document ${pubKey}.`);
        }

        // 2. Capability Check
        if (!canWrite(user, currentDocMeta)) {
            throw new Error(`HQL Update: Permission denied to update document ${pubKey}.`);
        }

        // 3. Fetch Schema JSON
        const schemaRef = (currentEntityJson.meta as Record<string, unknown>)?.schema as string | undefined;
        if (!schemaRef) {
            throw new Error(`HQL Update: Document ${pubKey} is missing schema reference in meta.`);
        }
        const schemaJson = await hominioDB.getSchemaDataAsJson(schemaRef);
        if (!schemaJson) {
            throw new Error(`HQL Update: Schema ${schemaRef} not found or not accessible for validation.`);
        }

        // 4. Construct Merged Entity JSON for Validation
        const currentPlaces = ((currentEntityJson.data as Record<string, unknown>)?.places as Record<string, LoroJsonValue>) || {};
        const mergedPlaces = { ...currentPlaces, ...(request.places as Record<string, LoroJsonValue>) };

        // Create the new data object separately
        const existingData = (typeof currentEntityJson.data === 'object' && currentEntityJson.data !== null)
            ? currentEntityJson.data as Record<string, unknown>
            : {};
        const newData = {
            ...existingData,
            places: mergedPlaces
        };

        // Construct the final merged JSON
        const mergedEntityJson = {
            ...currentEntityJson, // Spread the original entity
            data: newData        // Assign the separately created data object
        };

        // 5. Validate the merged entity data against the schema JSON
        const validationResult = validateEntityJsonAgainstSchema(mergedEntityJson, schemaJson);
        if (!validationResult.isValid) {
            throw new Error(`HQL Update: Validation failed: ${validationResult.errors.join(', ')}`);
        }

        // 6. Call hominioDB to perform the actual update
        console.log(`[HQL Update] Validation passed for doc ${pubKey}. Calling hominioDB.updateEntityPlaces...`);
        const updatedDbDoc = await hominioDB.updateEntityPlaces(
            pubKey,
            request.places as Record<string, LoroJsonValue> // Pass only the changes
        );
        return updatedDbDoc;
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
        console.log(`[HQL Delete] Successfully deleted document ${pubKey}`);
        return { success: true };
    }
}

// Export singleton instance
export const hominioQLService = new HominioQLService();
