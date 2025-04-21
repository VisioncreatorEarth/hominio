import { hominioDB, type Docs, docChangeNotifier, triggerDocChangeNotification } from './hominio-db';
import { canRead, canDelete } from './hominio-caps';
import { readable, get, type Readable } from 'svelte/store';
import { LoroMap, LoroList, LoroText } from 'loro-crdt';
import { browser } from '$app/environment';
import { authClient, getCurrentEffectiveUser as getCurrentEffectiveUserType } from '$lib/KERNEL/hominio-auth';
import type { CapabilityUser } from './hominio-caps';
import { validateBridiDocAgainstSelbri, type ValidationRuleStructure } from './hominio-validate';

type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];

// Define LoroDocJson type locally
type LoroDocJson = Record<string, unknown> & {
    meta?: Record<string, unknown>;
    data?: Record<string, unknown>;
    pubKey?: string;
}

// Renamed helper function to generateDefaultDocCmene
function generateDefaultDocCmene(sumti: Record<string, LoroJsonValue> | null | undefined): string {
    if (!sumti) {
        return 'Unnamed Document';
    }
    const cmeneParts: string[] = []; // Renamed from nameParts
    const sortedKeys = Object.keys(sumti).sort();

    for (const key of sortedKeys) {
        const value = sumti[key]; // Use sumti here
        if (typeof value === 'string') {
            if (value.startsWith('@')) {
                cmeneParts.push(`@${value.substring(1, 9)}`); // Add to cmeneParts
            } else if (value.trim() !== '') {
                cmeneParts.push(value); // Add to cmeneParts
            }
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            cmeneParts.push(String(value)); // Add to cmeneParts
        }
    }
    if (cmeneParts.length === 0) { // Check cmeneParts
        return 'Unnamed Document';
    }
    return cmeneParts.join(' '); // Join cmeneParts
}
// --- End Helper Function ---

type HqlValue = LoroJsonValue;
// Removed $refSchema operator
type HqlOperator = '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' | '$in' | '$nin' | '$exists' | '$regex' | '$contains';
type HqlCondition = { [key in HqlOperator]?: HqlValue | HqlValue[] };
// Renamed HqlPlaceFilterValue to HqlSumtiFilterValue
type HqlSumtiFilterValue = HqlValue | HqlCondition | string; // Allow direct @ref string
type HqlMetaFilterValue = HqlValue | HqlCondition;
// Added HqlDataFilterValue for filtering on data fields like data.selbri
type HqlDataFilterValue = HqlValue | HqlCondition | string;

// Export HQL interfaces used by the UI
export interface HqlFilterObject {
    meta?: {
        [key: string]: HqlMetaFilterValue;
        // cmene?: HqlMetaFilterValue; // REMOVED specific definition to avoid index signature conflict
        // description removed
    };
    // Renamed places to sumti
    sumti?: {
        [key: string]: HqlSumtiFilterValue; // Key is x1, x2 etc.
    };
    // Added data field for filtering data.selbri etc.
    data?: {
        [key: string]: HqlDataFilterValue;
        // Add specific filters for javni/skicu if needed later?
    };
    $or?: HqlFilterObject[];
    $and?: HqlFilterObject[];
    $not?: HqlFilterObject;
    // Removed $fromSchema internal marker
}

// Updated HqlFromClause - remove schema field, maybe add gismu/selbri later if needed
export interface HqlFromClause {
    pubKey?: string | string[];
    // schema?: string; // REMOVED - Use direct filters on meta.gismu / data.selbri
    owner?: string;
    // Potential future additions:
    // gismu?: 'selbri' | 'bridi';
    // selbri?: string; // @pubkey of the defining selbri
}

export interface HqlQueryRequest {
    operation: 'query';
    from?: HqlFromClause; // Keep for owner/pubKey filtering
    filter?: HqlFilterObject; // Filters now handle type/selbri linking
}

// Updated HqlMutationRequest
export interface HqlMutationRequest {
    operation: 'mutate';
    action: 'create' | 'update' | 'delete';
    pubKey?: string; // Required for update/delete
    selbri?: string; // Renamed from schema - Required for create (Pubkey or @pubkey ref of the selbri)
    sumti?: Record<string, LoroJsonValue | string>; // Renamed from places - Data for create/update
}

export type HqlRequest = HqlQueryRequest | HqlMutationRequest;

// Result Types (More specific)

// Export result types used by the UI
export type ResolvedHqlDocument = Record<string, unknown> & { pubKey: string };
export type HqlQueryResult = ResolvedHqlDocument[];
export type HqlMutationResult = Docs | { success: boolean }; // Create/Update return Docs, Delete returns success
export type HqlResult = HqlQueryResult | HqlMutationResult;

// --- HQL Service ---

class HominioQLService {

    private selbriJsonCache: Map<string, Record<string, unknown> | null>; // Renamed from schemaJsonCache

    constructor() {
        this.selbriJsonCache = new Map(); // Renamed from schemaJsonCache
    }

    /**
     * Main entry point to process an HQL request (non-reactive).
     */
    async process(user: CapabilityUser | null, request: HqlRequest): Promise<HqlResult> {
        this.selbriJsonCache.clear(); // Clear selbri JSON cache
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

        // 2. Filter by Read Capability
        const accessibleDocsMetadata = allDbDocsMetadata.filter(docMeta => canRead(user, docMeta));

        // 3. Build Combined Filter Criteria from request.filter and request.from
        const combinedFilter: HqlFilterObject = { ...(request.filter || {}) };
        // Add filters from 'from' clause (if any) - primarily owner/pubKey now
        if (request.from?.owner) {
            combinedFilter.meta = { ...(combinedFilter.meta || {}), owner: request.from.owner };
        }
        if (request.from?.pubKey) {
            const keys = Array.isArray(request.from.pubKey) ? request.from.pubKey : [request.from.pubKey];
            combinedFilter.meta = { ...(combinedFilter.meta || {}), pubKey: { $in: keys } };
        }
        // Note: Filtering by selbri/gismu is now handled directly within request.filter
        // e.g., filter: { meta: { gismu: 'bridi' }, data: { selbri: '@selbri_pubkey' } }

        // 4. Apply Combined Filter
        const filteredDocsMetadata = await this._applyFilter(accessibleDocsMetadata, combinedFilter);

        // 5. Resolve References and Format Results
        const resolvedResults = await this._resolveReferencesAndFormat(filteredDocsMetadata);
        return resolvedResults;
    }

    // Updated _applyFilter - Removed $fromSchema logic
    private async _applyFilter(docsMetadata: Docs[], filter: HqlFilterObject): Promise<Docs[]> {
        if (!filter || Object.keys(filter).length === 0) {
            return docsMetadata; // No filter, return all accessible docs
        }

        const results: Docs[] = [];
        // Cache fetched JSON data within this filter operation
        const jsonDataCache = new Map<string, Record<string, unknown> | null>();

        // Helper to get JSON data, using cache
        const getJsonData = async (pubKey: string): Promise<Record<string, unknown> | null> => {
            if (jsonDataCache.has(pubKey)) {
                return jsonDataCache.get(pubKey)!;
            }
            const loroDoc = await hominioDB.getLoroDoc(pubKey);
            if (!loroDoc) {
                jsonDataCache.set(pubKey, null);
                return null;
            }

            let jsonData: Record<string, unknown> | null = null;
            try {
                jsonData = loroDoc.toJSON() as Record<string, unknown>;
            } catch {
                jsonData = null; // Ensure null on error
            }

            if (!jsonData) {
                return null;
            } else {
                jsonData.pubKey = pubKey; // Add pubKey if data exists
            }

            jsonDataCache.set(pubKey, jsonData);
            return jsonData;
        };

        for (const docMeta of docsMetadata) {
            // Fetch JSON only if there are content filters (meta, data, sumti)
            let jsonData: Record<string, unknown> | null = null;
            const needsContentCheck = filter.meta || filter.data || filter.sumti || filter.$or || filter.$and || filter.$not;

            if (needsContentCheck) {
                jsonData = await getJsonData(docMeta.pubKey);
                if (!jsonData) {
                    continue; // Skip this doc if JSON needed but unavailable
                }
            }

            // Always evaluate the filter. If no content check was needed, jsonData is null,
            // but _evaluateFilter handles checks for meta/data/sumti fields being present.
            // If a filter *requires* JSON (e.g., { meta: { name: 'X' } }) but JSON failed to load,
            // the evaluation will correctly fail.
            if (this._evaluateFilter(jsonData ?? { pubKey: docMeta.pubKey }, filter)) {
                results.push(docMeta); // Add the *metadata* object
            }
        }
        return results;
    }

    // Updated _evaluateFilter to handle meta, data, and sumti fields
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
            } else if (filterKey === 'data' && typeof filterValue === 'object' && filterValue !== null) {
                // Check fields directly within the top-level data object (e.g., data.selbri)
                match = this._checkFields(data?.data, filterValue as Record<string, HqlDataFilterValue>);
            } else if (filterKey === 'sumti' && typeof filterValue === 'object' && filterValue !== null) {
                // Check fields within data.sumti
                const dataField = data?.data as Record<string, unknown> | undefined;
                match = this._checkFields(dataField?.sumti, filterValue as Record<string, HqlSumtiFilterValue>);
            }

            if (!match) {
                return false;
            }
        }
        return true;
    }

    // _checkFields remains largely the same, operating on generic objects
    private _checkFields(dataObject: unknown, conditions: Record<string, unknown>): boolean {
        if (typeof dataObject !== 'object' || dataObject === null) {
            return false;
        }
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
                fieldMatch = this._checkEqualityOrReference(actualValue, condition);
            }
            if (!fieldMatch) {
                return false;
            }
        }
        return true;
    }

    // _checkEqualityOrReference remains the same
    private _checkEqualityOrReference(actualValue: unknown, expectedValue: unknown): boolean {
        if (typeof actualValue === 'string' && actualValue.startsWith('@') && typeof expectedValue === 'string' && expectedValue.startsWith('@')) {
            return actualValue === expectedValue || actualValue.substring(1) === expectedValue.substring(1);
        } else if (typeof actualValue === 'string' && actualValue.startsWith('@')) {
            return actualValue.substring(1) === expectedValue;
        } else if (typeof expectedValue === 'string' && expectedValue.startsWith('@')) {
            return actualValue === expectedValue.substring(1);
        }
        return this._applyOperator(actualValue, '$eq', expectedValue);
    }

    // Updated _applyOperator - Removed $refSchema case
    private _applyOperator(value: unknown, operator: HqlOperator, operand: unknown): boolean {
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
            // Removed $refSchema case
            default: return false;
        }
    }


    // Updated _resolveReferencesAndFormat
    private async _resolveReferencesAndFormat(docsMetadata: Docs[]): Promise<HqlQueryResult> {
        const resolvedDocs: ResolvedHqlDocument[] = [];
        const visited = new Set<string>(); // Keep for potential self-references within sumti

        // Updated helper function to fetch and cache selbri JSON
        const selbriFetcher = async (selbriRef: string): Promise<Record<string, unknown> | null> => {
            if (!selbriRef.startsWith('@')) {
                return null;
            }
            const selbriPubKey = selbriRef.substring(1);

            if (this.selbriJsonCache.has(selbriPubKey)) {
                return this.selbriJsonCache.get(selbriPubKey)!;
            }

            const selbriLoroDoc = await hominioDB.getLoroDoc(selbriPubKey);
            const selbriJson = selbriLoroDoc ? (selbriLoroDoc.toJSON() as Record<string, unknown>) : null;
            if (selbriJson) {
                selbriJson.pubKey = selbriPubKey; // Add pubKey
                // Optional: Add gismu type for clarity in resolved data?
                // selbriJson.meta = { ...(selbriJson.meta as object), gismu: 'selbri' };
            }

            this.selbriJsonCache.set(selbriPubKey, selbriJson);
            return selbriJson;
        };

        for (const docMeta of docsMetadata) {
            visited.clear();
            const loroDoc = await hominioDB.getLoroDoc(docMeta.pubKey);
            const currentJson = loroDoc ? (loroDoc.toJSON() as Record<string, unknown>) : null;

            if (currentJson) {
                currentJson.pubKey = docMeta.pubKey; // Ensure pubKey is present
                // Pass selbriFetcher instead of schemaFetcher
                const resolved = await this._resolveNode(currentJson, new Set(), selbriFetcher);
                resolvedDocs.push(resolved);
            } else {
                console.warn(`[HQL Resolve] Could not load LoroDoc/JSON for ${docMeta.pubKey}. Skipping.`);
            }
        }
        return resolvedDocs;
    }

    // Updated _resolveNode
    private async _resolveNode(
        currentNodeJson: Record<string, unknown>,
        visited: Set<string>,
        selbriFetcher: (selbriRef: string) => Promise<Record<string, unknown> | null> // Renamed param
    ): Promise<ResolvedHqlDocument> {

        const pubKey = currentNodeJson.pubKey as string;
        if (!pubKey || visited.has(pubKey)) {
            return currentNodeJson as ResolvedHqlDocument;
        }
        visited.add(pubKey);

        const resolvedNode: Record<string, unknown> = { ...currentNodeJson }; // Shallow copy
        const meta = resolvedNode.meta as Record<string, unknown> | undefined;
        const data = resolvedNode.data as Record<string, unknown> | undefined;

        // --- Resolve Defining Selbri (if bridi) --- Check meta.gismu and data.selbri
        if (meta?.gismu === 'bridi' && typeof data?.selbri === 'string' && data.selbri.startsWith('@')) {
            const selbriRef = data.selbri;
            const selbriData = await selbriFetcher(selbriRef);
            if (selbriData) {
                resolvedNode.$schema = selbriData; // Embed defining selbri as $schema
            }
        }

        // --- Resolve References in Sumti --- (If data.sumti exists)
        const sumti = data?.sumti as Record<string, unknown> | undefined; // Renamed from places
        if (sumti) {
            const resolvedSumti: Record<string, unknown> = {}; // Renamed from resolvedPlaces
            for (const key in sumti) {
                const value = sumti[key];
                if (typeof value === 'string' && value.startsWith('@')) {
                    const refPubKey = value.substring(1);
                    const refLoroDoc = await hominioDB.getLoroDoc(refPubKey);
                    if (refLoroDoc) {
                        const refMeta = refLoroDoc.getMap('meta');
                        const refData = refLoroDoc.getMap('data'); // Needed for potential selbri ref
                        const refGismu = refMeta?.get('gismu') as string | undefined;
                        const refCmene = refMeta?.get('cmene') as string | undefined;
                        const refSelbriRef = refData?.get('selbri') as string | undefined; // Check bridi's selbri ref

                        const marker: Record<string, unknown> = {
                            $ref: true,
                            pubKey: refPubKey,
                            cmene: refCmene ?? refPubKey,
                            gismu: refGismu // Include gismu type of referenced doc
                        };

                        // --- Specific handling for tcini status --- (Using hardcoded selbri pubkey)
                        // Check if the *referenced document* is a bridi of the tcini selbri
                        const TCINI_SELBRI_PUBKEY = '0x6b0f40bcb19564eb2607ba56fb977f67c459c46f199d80576490defccf41cc6a';
                        if (refGismu === 'bridi' && refSelbriRef === `@${TCINI_SELBRI_PUBKEY}`) {
                            try {
                                const referencedDocDataMap = refLoroDoc.getMap('data');
                                const referencedDocSumtiMap = referencedDocDataMap?.get('sumti');
                                if (referencedDocSumtiMap instanceof LoroMap) {
                                    marker.statusText = referencedDocSumtiMap.get('x1') ?? null; // Get status from sumti.x1
                                }
                            } catch {
                                // Error fetching status is intentionally ignored; marker.statusText will remain undefined
                            }
                        }
                        // --- End tcini handling ---

                        resolvedSumti[key] = marker;
                    } else {
                        resolvedSumti[key] = {
                            $ref: true,
                            pubKey: refPubKey,
                            $error: 'Not found'
                        };
                    }
                } else {
                    resolvedSumti[key] = value;
                }
            }
            // Replace original sumti with resolved sumti
            if (!resolvedNode.data) resolvedNode.data = {};
            (resolvedNode.data as Record<string, unknown>).sumti = resolvedSumti; // Renamed from places
        }

        return resolvedNode as ResolvedHqlDocument;
    }


    // --- Mutation Handling ---

    private async _handleMutate(user: CapabilityUser | null, request: HqlMutationRequest): Promise<HqlMutationResult> {
        let result: HqlMutationResult;
        try {
            switch (request.action) {
                case 'create':
                    result = await this._handleCreate(user, request);
                    break;
                case 'update':
                    result = await this._handleUpdate(user, request);
                    break;
                case 'delete':
                    result = await this._handleDelete(user, request);
                    break;
                default:
                    throw new Error(`Invalid mutation action: ${request.action}`);
            }

            // Notify AFTER the mutation logic completes successfully
            setTimeout(() => {
                triggerDocChangeNotification();
            }, 0);

            return result;

        } catch (error) {
            console.error(`HQL Mutation Error (Action: ${request.action}):`, error);
            throw error instanceof Error ? error : new Error(`An unknown error occurred during HQL mutation: ${request.action}.`);
        }
    }

    // Updated _handleCreate - Now always creates a bridi
    private async _handleCreate(user: CapabilityUser | null, request: HqlMutationRequest): Promise<Docs> {
        // Validate required fields for bridi creation
        if (!request.selbri) throw new Error("HQL Create: 'selbri' reference is required.");
        if (!request.sumti) throw new Error("HQL Create: 'sumti' data is required."); // Renamed from places

        const ownerId = user?.id;
        if (!ownerId && !(browser && !navigator.onLine)) throw new Error("HQL Create: User must be authenticated or offline.");
        const effectiveOwnerId = ownerId ?? 'offline_owner';

        const selbriRef = request.selbri.startsWith('@') ? request.selbri : `@${request.selbri}`;
        if (!/^@0x[0-9a-f]{64}$/i.test(selbriRef)) {
            throw new Error(`HQL Create: Invalid selbri reference format: ${request.selbri}`);
        }
        const selbriPubKey = selbriRef.substring(1);

        // --- Determine Final Name --- (Using updated helper)
        const finalCmene = generateDefaultDocCmene(request.sumti);

        // --- Fetch Selbri Document for Validation ---
        const selbriJson = await this._fetchReferencedDocJson(selbriPubKey, new Map()); // Use renamed helper
        if (!selbriJson) {
            throw new Error(`HQL Create: Referenced selbri document ${selbriPubKey} not found.`);
        }
        if ((selbriJson.meta as Record<string, unknown>)?.gismu !== 'selbri') {
            throw new Error(`HQL Create: Referenced document ${selbriPubKey} is not a selbri (meta.gismu !== 'selbri').`);
        }
        if (!selbriJson.pubKey) selbriJson.pubKey = selbriPubKey;

        const selbriData = selbriJson.data as Record<string, unknown> | undefined;
        const selbriJavni = selbriData?.javni as Record<string, ValidationRuleStructure> | undefined;

        // --- Prepare Bridi Document JSON for Validation ---
        const bridiJsonToValidate: LoroJsonObject = {
            meta: {
                gismu: 'bridi',
                owner: effectiveOwnerId,
                cmene: finalCmene
            },
            data: {
                selbri: selbriRef,
                sumti: request.sumti ?? {}
            }
        };

        // Perform Validation using updated function
        const validationResult = validateBridiDocAgainstSelbri(bridiJsonToValidate, selbriJson);
        if (!validationResult.isValid) {
            console.error("HQL Create Bridi Validation Failed:", validationResult.errors);
            throw new Error(`Validation failed for new bridi document: ${validationResult.errors.join(', ')}`);
        }
        // -------------------------------------

        // --- Prepare Initial Data for hominioDB.createDocument ---
        const initialBridiData = {
            gismu: 'bridi' as const, // Explicitly type as literal
            selbriRef: selbriRef,
            sumtiData: request.sumti || {},
            selbriJavni: selbriJavni // Pass the extracted javni rules
        };

        // --- Perform actual creation via MODIFIED hominioDB.createDocument ---
        try {
            // Create the document entry WITH initial bridi data
            const newDocPubKey = await hominioDB.createDocument(
                user,
                { owner: effectiveOwnerId, name: finalCmene }, // Basic options
                initialBridiData // <<< PASS prepared initial data
            );

            // Return the metadata of the newly created document
            const newDocMetadata = await hominioDB.getDocument(newDocPubKey);
            if (!newDocMetadata) {
                throw new Error(`Failed to retrieve metadata for newly created document ${newDocPubKey}`);
            }
            return newDocMetadata;

        } catch (dbError) {
            console.error("HQL Create: Error during document creation:", dbError);
            throw new Error(`Failed to create bridi document in database: ${dbError instanceof Error ? dbError.message : 'Unknown DB error'}`);
        }
    }

    // Updated _handleUpdate
    private async _handleUpdate(user: CapabilityUser | null, request: HqlMutationRequest): Promise<Docs> {
        if (!request.pubKey) throw new Error("HQL Update: 'pubKey' is required.");
        if (!request.sumti) throw new Error("HQL Update: 'sumti' data is required."); // Renamed from places
        const pubKey = request.pubKey;

        // Fetch metadata first (for capability check)
        const docMeta = await hominioDB.getDocument(pubKey);
        if (!docMeta) throw new Error(`HQL Update: Document ${pubKey} not found.`);

        // --- Fetch Document LoroDoc Instance ---
        const loroDocInstance = await hominioDB.getLoroDoc(pubKey);
        if (!loroDocInstance) throw new Error(`HQL Update: Could not load LoroDoc instance for ${pubKey}.`);

        // --- Fetch Selbri Definition (for javni rules) ---
        const gismuType = loroDocInstance.getMap('meta')?.get('gismu') as string | undefined;
        let selbriJavni: Record<string, ValidationRuleStructure> | undefined = undefined;
        let selbriJsonForValidation: Record<string, unknown> | null = null;
        if (gismuType === 'bridi') {
            const selbriRef = loroDocInstance.getMap('data')?.get('selbri') as string | undefined;
            if (selbriRef && selbriRef.startsWith('@')) {
                const selbriPubKey = selbriRef.substring(1);
                selbriJsonForValidation = await this._fetchReferencedDocJson(selbriPubKey, new Map());
                if (selbriJsonForValidation) {
                    if (!selbriJsonForValidation.pubKey) selbriJsonForValidation.pubKey = selbriPubKey; // Add pubKey for validation
                    const selbriData = selbriJsonForValidation.data as Record<string, unknown> | undefined;
                    selbriJavni = selbriData?.javni as Record<string, ValidationRuleStructure> | undefined;
                } else {
                    console.warn(`[HQL Update] Could not fetch selbri document ${selbriPubKey} for javni rules.`);
                }
            } else {
                console.warn(`[HQL Update] Bridi ${pubKey} is missing a valid data.selbri reference.`);
            }
        }
        // TODO: Fetch javni rules if gismuType === 'selbri'? Currently not supported.

        // --- Pre-update Reference Resolution & Capability Checks (for @refs in request.sumti) ---
        const updatesToApply: Record<string, LoroJsonValue> = {};
        const refsToResolve = new Map<string, string>();
        for (const key in request.sumti) {
            const value = request.sumti[key];
            if (typeof value === 'string' && value.startsWith('@')) refsToResolve.set(key, value.substring(1));
            else updatesToApply[key] = value;
        }
        for (const [key, refPubKey] of refsToResolve) {
            const refDocMeta = await hominioDB.getDocument(refPubKey);
            if (!refDocMeta) throw new Error(`HQL Update: Referenced document ${refPubKey} for sumti '${key}' not found.`);
            if (!canRead(user, refDocMeta)) throw new Error(`HQL Update: Permission denied to read referenced document ${refPubKey}.`);
            updatesToApply[key] = `@${refPubKey}`; // Add the resolved ref string back
        }
        // ----------------------------------------------------------

        // --- Perform Update and Name Check within Mutation Callback ---
        // Use the already fetched LoroDoc instance
        await hominioDB.updateDocument(user, pubKey, (loroDoc) => {
            const metaMap = loroDoc.getMap('meta');
            const dataMap = loroDoc.getMap('data');
            // Get or create the sumti map container
            let sumtiMapInstance: LoroMap | undefined;
            const rawSumtiMap = dataMap.get('sumti');
            let currentSumtiData: Record<string, LoroJsonValue> = {}; // Initialize for name generation

            if (!(rawSumtiMap instanceof LoroMap)) {
                console.warn(`[HQL Update mutationFn] data.sumti for ${pubKey} is not a LoroMap. Replacing.`);
                sumtiMapInstance = dataMap.setContainer('sumti', new LoroMap());
            } else {
                sumtiMapInstance = rawSumtiMap; // Assign the LoroMap instance
                // Get current data only if it was already a LoroMap
                try { currentSumtiData = sumtiMapInstance.toJSON() as Record<string, LoroJsonValue>; }
                catch { /* Error converting sumti LoroMap to JSON, handled by fallback below */ }
            }

            // Apply updates to the sumti map - **Handle Loro Containers based on type**
            if (sumtiMapInstance instanceof LoroMap) {
                for (const key in updatesToApply) {
                    if (Object.prototype.hasOwnProperty.call(updatesToApply, key)) {
                        const newValue = updatesToApply[key] ?? null;
                        const rule = selbriJavni?.[key];
                        const ruleType = rule?.type; // Read simplified type field

                        try {
                            // *** ADD LOGGING HERE ***
                            console.log(`[HQL Update mutationFn] Applying update for ${pubKey}. Key: "${key}", NewValue:`, newValue, `RuleType: ${ruleType}`);

                            if (ruleType) { // Check if a type rule exists
                                const existingValueOrContainer = sumtiMapInstance.get(key);

                                if (ruleType.startsWith('@')) {
                                    // Reference Type: Just set the primitive value
                                    if (typeof newValue === 'string' && newValue.startsWith('@')) {
                                        sumtiMapInstance.set(key, newValue);
                                    } else {
                                        sumtiMapInstance.set(key, null); // Set null on mismatch
                                    }
                                } else if (ruleType === 'text') {
                                    // LoroText Type
                                    if (typeof newValue === 'string') {
                                        if (existingValueOrContainer instanceof LoroText) {
                                            existingValueOrContainer.delete(0, existingValueOrContainer.toString().length);
                                            existingValueOrContainer.insert(0, newValue);
                                        } else {
                                            console.warn(`[HQL Update] Expected LoroText for sumti "${key}" but found different/no container. Replacing.`);
                                            const textContainer = sumtiMapInstance.setContainer(key, new LoroText());
                                            textContainer.insert(0, newValue);
                                        }
                                    } else {
                                        console.warn(`[HQL Update] Expected string value for LoroText update on sumti "${key}" but got:`, newValue);
                                        // Optionally clear existing container or set to empty?
                                    }
                                } else if (ruleType === 'list') {
                                    // LoroList Type
                                    if (Array.isArray(newValue)) {
                                        if (existingValueOrContainer instanceof LoroList) {
                                            existingValueOrContainer.delete(0, existingValueOrContainer.length);
                                            newValue.forEach((item, index) => existingValueOrContainer.insert(index, item));
                                        } else {
                                            console.warn(`[HQL Update] Expected LoroList for sumti "${key}" but found different/no container. Replacing.`);
                                            const listContainer = sumtiMapInstance.setContainer(key, new LoroList());
                                            newValue.forEach((item, index) => listContainer.insert(index, item));
                                        }
                                    } else {
                                        console.warn(`[HQL Update] Expected array value for LoroList update on sumti "${key}" but got:`, newValue);
                                    }
                                } else if (ruleType === 'map') {
                                    // LoroMap Type
                                    if (typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue)) {
                                        if (existingValueOrContainer instanceof LoroMap) {
                                            const currentMapKeys = Object.keys(existingValueOrContainer.toJSON());
                                            currentMapKeys.forEach(mapKey => existingValueOrContainer.delete(mapKey));
                                            for (const mapKey in newValue as Record<string, unknown>) {
                                                existingValueOrContainer.set(mapKey, (newValue as Record<string, unknown>)[mapKey]);
                                            }
                                        } else {
                                            console.warn(`[HQL Update] Expected LoroMap for sumti "${key}" but found different/no container. Replacing.`);
                                            const mapContainer = sumtiMapInstance.setContainer(key, new LoroMap());
                                            for (const mapKey in newValue as Record<string, unknown>) {
                                                mapContainer.set(mapKey, (newValue as Record<string, unknown>)[mapKey]);
                                            }
                                        }
                                    } else {
                                        console.warn(`[HQL Update] Expected object value for LoroMap update on sumti "${key}" but got:`, newValue);
                                    }
                                } else {
                                    // Unknown type specified in rule - treat as primitive?
                                    console.warn(`[HQL Update] Unknown validation type "${ruleType}" for sumti "${key}". Updating value as primitive.`);
                                    sumtiMapInstance.set(key, newValue);
                                }
                            } else {
                                // No specific rule type - Update primitive value or reference
                                sumtiMapInstance.set(key, newValue);
                            }
                            // *** ADD LOGGING HERE ***
                            console.log(`[HQL Update mutationFn] Successfully applied update for key "${key}" in ${pubKey}`);
                        } catch (containerError) {
                            console.error(`[HQL Update] Error updating container for sumti "${key}" with type "${ruleType}":`, containerError);
                            console.error(`[HQL Update] Skipping update for sumti "${key}" due to container error.`);
                        }
                    }
                }
            } else {
                // This case should technically not happen due to the creation logic above,
                // but adding a safeguard.
                console.error(`[HQL Update mutationFn] Failed to get or create a valid LoroMap instance for sumti.`);
                return; // Abort the mutation callback if sumtiMap is not valid
            }

            // Check and Fix Name AFTER sumti update
            const currentCmene = metaMap.get('cmene');
            // Get current sumti data *after* update to generate name
            // Use try-catch for safety as toJSON might fail in edge cases
            let updatedSumtiData: Record<string, LoroJsonValue> = {};
            // Ensure sumtiMapInstance is still a LoroMap before calling toJSON
            if (sumtiMapInstance instanceof LoroMap) {
                try {
                    updatedSumtiData = sumtiMapInstance.toJSON() as Record<string, LoroJsonValue>;
                } catch {
                    // Error converting updated sumti LoroMap to JSON
                    updatedSumtiData = { ...currentSumtiData, ...updatesToApply }; // Fallback using applied updates
                }
            } else {
                // If sumtiMapInstance is somehow invalid here, use fallback data.
                console.error(`[HQL Update mutationFn] sumtiMapInstance became invalid before name generation.`);
                updatedSumtiData = { ...currentSumtiData, ...updatesToApply }; // Fallback using applied updates
            }

            if (currentCmene === null || currentCmene === undefined || String(currentCmene).trim() === '') {
                const generatedCmene = generateDefaultDocCmene(updatedSumtiData); // Use updated helper
                console.warn(`[HQL Update mutationFn] Setting default cmene for ${pubKey}: "${generatedCmene}"`);
                metaMap.set('cmene', generatedCmene);
            }
        });
        // --- End Update Call ---

        // --- Re-fetch and Validate AFTER update ---
        const updatedLoroDoc = await hominioDB.getLoroDoc(pubKey); // Re-fetch needed to get latest state after potential async ops within updateDocument
        if (!updatedLoroDoc) throw new Error(`HQL Update: Failed to re-fetch LoroDoc ${pubKey} after update.`);
        const updatedJson = updatedLoroDoc.toJSON() as LoroDocJson;
        updatedJson.pubKey = pubKey; // Ensure pubKey is present for validation

        // Perform validation only if it's a bridi document (using pre-fetched selbri JSON)
        if (gismuType === 'bridi' && selbriJsonForValidation) {
            const validationResult = validateBridiDocAgainstSelbri(updatedJson, selbriJsonForValidation);
            if (!validationResult.isValid) {
                console.error(`Validation failed after update for ${pubKey}: ${validationResult.errors.join(', ')}`);
            }
        } else if (gismuType === 'bridi' && !selbriJsonForValidation) {
            console.warn(`[HQL Update] Skipping validation for ${pubKey} as selbri definition could not be fetched.`);
        } else {
            // TODO: Add validation call for selbri documents if needed?
            // const selbriValidationResult = validateSelbriDocStructure(updatedJson);
            // if (!selbriValidationResult.isValid) { ... }
        }
        // --- End Validation ---

        // Return latest metadata
        const updatedDocMeta = await hominioDB.getDocument(pubKey);
        if (!updatedDocMeta) throw new Error(`HQL Update: Failed to re-fetch final metadata for ${pubKey}.`);
        return updatedDocMeta;
    }

    // _handleDelete remains the same - operates only on pubKey and checks generic capabilities
    private async _handleDelete(user: CapabilityUser | null, request: HqlMutationRequest): Promise<{ success: boolean }> {
        if (!request.pubKey) {
            throw new Error("HQL Delete: 'pubKey' is required.");
        }
        const pubKey = request.pubKey;

        // Fetch metadata first for capability check
        const docToDelete = await hominioDB.getDocument(pubKey);
        if (!docToDelete) {
            return { success: true };
        }

        // Capability Check
        if (!canDelete(user, docToDelete)) {
            throw new Error(`HQL Delete: Permission denied to delete document ${pubKey}.`);
        }

        // Call hominioDB to perform the actual deletion
        try {
            const deleted = await hominioDB.deleteDocument(user, pubKey);
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
            const ssrUser = getCurrentUserFn();
            return readable<HqlQueryResult | null>(undefined, (set) => {
                this._handleQuery(ssrUser, request)
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
            const DEBOUNCE_MS = 50;
            let lastSessionState: unknown = undefined;
            let currentResults: HqlQueryResult | null = null;

            const triggerDebouncedQuery = () => {
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }

                if (!currentResults) {
                    set(undefined);
                }

                debounceTimer = setTimeout(async () => {
                    const currentUser = getCurrentUserFn();
                    try {
                        const result = await this._handleQuery(currentUser, request);
                        currentResults = result;
                        set(result);
                    } catch (error) {
                        console.error("Reactive Query Error:", error);
                        if (!currentResults) {
                            set(null);
                        }
                    }
                }, DEBOUNCE_MS);
            };

            const unsubscribeNotifier = docChangeNotifier.subscribe(() => {
                triggerDebouncedQuery();
            });

            const sessionStore = authClient.useSession();
            const unsubscribeSession = sessionStore.subscribe(session => {
                const currentSessionState = JSON.stringify(session.data);
                if (lastSessionState !== undefined && lastSessionState !== currentSessionState) {
                    triggerDebouncedQuery();
                }
                lastSessionState = currentSessionState;
            });

            (async () => {
                const initialUser = getCurrentUserFn();
                try {
                    const initialResult = await this._handleQuery(initialUser, request);
                    currentResults = initialResult;
                    set(initialResult);
                    lastSessionState = JSON.stringify(get(sessionStore).data);
                } catch (error) {
                    console.error("Initial Reactive Query Error:", error);
                    set(null);
                    lastSessionState = JSON.stringify(get(sessionStore).data);
                }
            })();

            return () => {
                unsubscribeNotifier();
                unsubscribeSession();
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
            };
        });
    }

    // Updated helper method name
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
export const hql = new HominioQLService();

// --- Reactive Query Wrapper (makeReactiveQuery) ---
// This part remains the same, as it's a generic wrapper around query functions
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

    let unsubscribeFromChangeNotifier: (() => void) | undefined;
    let lastValue: T | undefined = undefined;
    let isFirstQuery = true;
    let isQueryInProgress = false;
    let pendingSubscribers: ((val: T | undefined) => void)[] = [];

    const runQuery = async (subscribers: ((val: T | undefined) => void)[]) => {
        if (isQueryInProgress) return;
        isQueryInProgress = true;

        try {
            if (!skipCache && !isFirstQuery) {
                const cached = queryCache.get(queryKey);
                if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
                    lastValue = cached.result as T;
                    subscribers.forEach(cb => cb(lastValue));
                    isQueryInProgress = false;
                    return;
                }
            }

            if (isFirstQuery) {
                subscribers.forEach(cb => cb(undefined));
            }

            const result = await queryFn();
            lastValue = result;

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

            if (!unsubscribeFromChangeNotifier) {
                let lastNotificationCount = 0;
                unsubscribeFromChangeNotifier = docChangeNotifier.subscribe(count => {
                    if (count !== lastNotificationCount) {
                        lastNotificationCount = count;
                        runQuery(subscribers);
                    }
                });

                runQuery(subscribers);
            } else {
                if (isQueryInProgress) {
                    pendingSubscribers.push(cb);
                } else {
                    cb(lastValue);
                }
                subscribers.push(cb);
            }

            return () => {
                subscribers = subscribers.filter(s => s !== cb);

                if (subscribers.length === 0 && unsubscribeFromChangeNotifier) {
                    unsubscribeFromChangeNotifier();
                    unsubscribeFromChangeNotifier = undefined;
                    isFirstQuery = true;
                }
            };
        }
    };
}

