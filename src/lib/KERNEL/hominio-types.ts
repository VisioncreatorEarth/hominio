/**
 * Centralized type definitions for the Hominio Kernel.
 */

// Import necessary external types first
import type { LoroDoc, LoroMap, LoroText, LoroList } from 'loro-crdt';
// Import and re-export CapabilityUser
import type { CapabilityUser as CapsCapabilityUser } from './hominio-caps'; // Assuming hominio-caps is in the same KERNEL folder
export type { CapsCapabilityUser as CapabilityUser }; // Re-export CapabilityUser
import type { ValidationRuleStructure } from './hominio-validate'; // Assuming hominio-validate exists

// --- Seeding Types ---

// From: src/db/seeding/leaf.data.ts
export type LeafId = string;
export type Pubkey = string;
export type LeafValueType = 'Concept' | 'LoroMap' | 'LoroText' | 'LoroList' | 'LoroMovableList' | 'LoroTree' | 'Index';
type LeafValueMap = { type: 'LoroMap'; value: Record<string, unknown> };
type LeafValueText = { type: 'LoroText'; value: string };
type LeafValueList = { type: 'LoroList' | 'LoroMovableList'; value: unknown[] };
type LeafValueTree = { type: 'LoroTree'; value: unknown };
type LeafValueConcept = { type: 'Concept' }; // Capitalized
export type LeafValueIndex = { type: 'Index'; value: Record<Pubkey, true> }; // New Index type
export type LeafValue = LeafValueMap | LeafValueText | LeafValueList | LeafValueTree | LeafValueConcept | LeafValueIndex;
export interface LeafRecord {
    pubkey: Pubkey;
    metadata: {
        type: 'Leaf' | 'Index'; // Allow both Leaf and Index types
    };
    data: LeafValue;
}

// From: src/db/seeding/schema.data.ts
export type SchemaId = string;
export interface SchemaPlaceTranslation {
    title: string;
    description: string;
}
export interface SchemaLanguageTranslation {
    purpose?: string;
    prompt?: string;
    places: {
        x1?: SchemaPlaceTranslation;
        x2?: SchemaPlaceTranslation;
        x3?: SchemaPlaceTranslation;
        x4?: SchemaPlaceTranslation;
        x5?: SchemaPlaceTranslation;
    };
}
export interface SchemaRecord {
    pubkey: SchemaId;
    metadata: {
        type: 'Schema';
    };
    data: {
        schemaId: SchemaId;
        name: string;
        places: {
            x1?: string;
            x2?: string;
            x3?: string;
            x4?: string;
            x5?: string;
        };
        translations: {
            en?: SchemaLanguageTranslation;
            de?: SchemaLanguageTranslation;
        };
    }
}

// From: src/db/seeding/composite.data.ts
export type CompositeId = string;
export interface CompositeRecord {
    pubkey: CompositeId;
    metadata: {
        type: 'Composite';
    };
    data: {
        schemaId: SchemaId;
        places: {
            x1?: LeafId;
            x2?: LeafId;
            x3?: LeafId;
            x4?: LeafId;
            x5?: LeafId;
        };
    };
}

// --- Kernel Types ---

// From: src/lib/KERNEL/types.ts
export interface ContentMetadata {
    type: string;
    documentPubKey?: string;
    created: string;
    [key: string]: unknown;
}

// From: src/lib/KERNEL/index-registry.ts
export type IndexLeafType = 'leaves' | 'schemas' | 'composites' | 'composites-by-component';

// From: src/lib/KERNEL/hominio-db.ts
// Loro JSON types (needed by Docs)
export type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
export interface LoroJsonObject { [key: string]: LoroJsonValue }
export type LoroJsonArray = LoroJsonValue[];

// Main DB interface types
export interface Docs {
    pubKey: string;
    owner: string;
    updatedAt: string;
    snapshotCid?: string;
    updateCids?: string[];

    // Local state tracking for sync
    localState?: {
        snapshotCid?: string;
        updateCids?: string[];
    };

    // --- Indexing State (referencing IndexingState below) ---
    indexingState?: IndexingState;
}

export interface Content {
    cid: string;
    type: string;
    raw: Uint8Array;
    metadata: Record<string, unknown>; // Replaces specific ContentMetadata for now
    createdAt: string;
}

export interface DocContentState {
    content: unknown;
    loading: boolean;
    error: string | null;
    sourceCid: string | null;
    isLocalSnapshot: boolean;
    appliedUpdates?: number;
}

export interface InitialBridiData {
    gismu: 'bridi';
    selbriRef: string;
    sumtiData: Record<string, LoroJsonValue | string>;
    selbriJavni: Record<string, ValidationRuleStructure> | undefined; // Uses external ValidationRuleStructure
}

export interface IndexingState {
    lastIndexedTimestamp?: string;
    lastIndexedSnapshotCid?: string;
    lastIndexedUpdateCidsHash?: string;
    needsReindex?: boolean;
    indexingError?: string | null;
}

export interface IndexingBacklogItem {
    pubKey: string;
    addedTimestamp: string;
    errorCount: number;
    lastError: string;
}

// Type for internal Pub/Sub
export type ListenerCallback = () => void;

// From: src/lib/KERNEL/hominio-mutate.ts
export type MutationOperationType = 'create' | 'update' | 'delete';
export type MutationTargetType = 'Leaf' | 'Schema' | 'Composite';
export interface BaseMutationOperation {
    operation: MutationOperationType;
    type: MutationTargetType;
    placeholder?: string;
}
export interface CreateMutationOperation extends BaseMutationOperation {
    operation: 'create';
    data: LeafValue | SchemaRecord['data'] | CompositeRecord['data']; // Use LeafValue directly
    owner?: string;
}
export interface UpdateMutationOperation extends BaseMutationOperation {
    operation: 'update';
    targetPubKey: string;
    data: Partial<LeafValue> | Partial<SchemaRecord['data']> | Partial<CompositeRecord['data']>;
    placeholder?: undefined;
}
export interface DeleteMutationOperation extends BaseMutationOperation {
    operation: 'delete';
    targetPubKey: string;
    placeholder?: undefined;
}
export type MutationOperation = CreateMutationOperation | UpdateMutationOperation | DeleteMutationOperation;
export interface MutateHqlRequest {
    mutations: MutationOperation[];
}
export interface MutationSuccessResult {
    status: 'success';
    generatedPubKeys: Record<string, string>;
}
export interface MutationErrorResult {
    status: 'error';
    message: string;
    errorDetails?: unknown;
}
export type MutationResult = MutationSuccessResult | MutationErrorResult;

// From: src/lib/KERNEL/hominio-query.ts
export type PlaceKey = 'x1' | 'x2' | 'x3' | 'x4' | 'x5';
export interface LoroHqlMapValue {
    field?: string;
    variable?: string;
    literal?: unknown;
}
export type QueryContext = Record<string, unknown>;
export interface StepResultItem {
    _sourceKey?: unknown;
    variables: Record<string, unknown>;
}
export type JoinInputItem = StepResultItem | QueryResult; // QueryResult defined below
export type HqlStepAction = 'find' | 'get' | 'select' | 'setVar' | 'iterateIndex' | 'resolve' | 'join' | 'aggregate';
export interface LoroHqlStepBase {
    action: HqlStepAction;
    resultVariable?: string;
}
export interface LoroHqlSetVarStep extends LoroHqlStepBase {
    action: 'setVar';
    variables: {
        [varName: string]: { literal: unknown };
    };
    resultVariable?: undefined;
}
export interface LoroHqlFindStep extends LoroHqlStepBase {
    action: 'find';
    target: {
        schema: string | { variable: string };
        x1?: string | { variable: string };
        x2?: string | { variable: string };
        x3?: string | { variable: string };
        x4?: string | { variable: string };
        x5?: string | { variable: string };
        place?: '*'
        value?: string | { variable: string };
    };
    variables?: {
        [varName: string]: { source: 'link.x1' | 'link.x2' | 'link.x3' | 'link.x4' | 'link.x5' | 'link.pubkey' | 'link.schemaId' };
    };
    return?: 'first' | 'array';
}
export interface LoroHqlGetStep extends LoroHqlStepBase {
    action: 'get';
    from: { variable: string, sourceKey?: string, targetDocType?: 'Leaf' | 'Schema' | 'Composite' }
    | { pubkey: string | string[], targetDocType?: 'Leaf' | 'Schema' | 'Composite' }
    | { type: 'Leaf' | 'Schema' | 'Composite' };
    fields: {
        [outputName: string]: { field: string };
    };
    variables?: {
        [varName: string]: { source: string };
    };
    return?: 'first' | 'array';
}
export interface LoroHqlSelectStep extends LoroHqlStepBase {
    action: 'select';
    select: {
        [outputKey: string]: LoroHqlMapValue;
    };
    groupBy?: string;
    resultVariable?: string;
}
export interface LoroHqlIterateIndexStep extends LoroHqlStepBase {
    action: 'iterateIndex';
    indexName: IndexLeafType; // Uses IndexLeafType
    variables: {
        key: string;
        value: string;
    };
    resultVariable: string;
}
export interface ResolveLeafValueRule {
    type: 'resolveLeafValue';
    pubkeyVar: string;
    fallbackVar: string;
    valueField?: string;
    typeField?: string;
    excludeType?: string;
}
export type ResolveRule = ResolveLeafValueRule;
export interface LoroHqlResolveStep extends LoroHqlStepBase {
    action: 'resolve';
    fromVariable: string;
    resolveFields: {
        [outputFieldName: string]: ResolveRule;
    };
    resultVariable: string;
}
export interface LoroHqlJoinSource {
    variable: string;
    key: string;
}
export interface LoroHqlJoinStep extends LoroHqlStepBase {
    action: 'join';
    left: LoroHqlJoinSource;
    right: LoroHqlJoinSource;
    type?: 'inner' | 'left';
    select: {
        [outputKey: string]: { source: string };
    };
    resultVariable: string;
}
export interface AggregateFieldRule {
    sourceField: string;
    operation: 'collect' | 'first';
}
export interface LoroHqlAggregateStep extends LoroHqlStepBase {
    action: 'aggregate';
    fromVariable: string;
    groupByKey: string;
    aggregateFields: {
        [outputFieldName: string]: AggregateFieldRule;
    };
    resultVariable: string;
}
export type LoroHqlStep =
    | LoroHqlSetVarStep
    | LoroHqlFindStep
    | LoroHqlGetStep
    | LoroHqlSelectStep
    | LoroHqlIterateIndexStep
    | LoroHqlResolveStep
    | LoroHqlJoinStep
    | LoroHqlAggregateStep;
export interface LoroHqlQueryExtended {
    steps: LoroHqlStep[];
}
export type QueryResult = Record<string, unknown>;

// From: src/lib/KERNEL/hominio-storage.ts
export interface StorageItem {
    key: string;
    value: Uint8Array;
    metadata: Record<string, unknown>;
    createdAt: string;
}
export interface StorageAdapter {
    init(): Promise<void>;
    get(key: string): Promise<Uint8Array | null>;
    put(key: string, value: Uint8Array, metadata?: Record<string, unknown>): Promise<void>;
    delete(key: string): Promise<boolean>;
    getAll(prefix?: string): Promise<Array<StorageItem>>;
    getMetadata(key: string): Promise<Record<string, unknown> | null>;
    query(filter: (metadata: Record<string, unknown>) => boolean): Promise<string[]>;
    batchExists(keys: string[]): Promise<Set<string>>;
    batchPut(items: Array<{ key: string, value: Uint8Array, meta?: Record<string, unknown> }>): Promise<void>;
    createTransaction(): StorageTransaction; // Uses StorageTransaction below
    close(): void;
}
export interface StorageTransaction {
    get(key: string): Promise<Uint8Array | null>;
    put(key: string, value: Uint8Array, metadata?: Record<string, unknown>): Promise<void>;
    delete(key: string): Promise<boolean>;
    complete(): Promise<void>;
    abort(): void;
}

// From: src/lib/KERNEL/hominio-sync.ts
export type ApiResponse<T> = {
    data: T;
    error: null | { status: number; value?: { message?: string;[key: string]: unknown }; };
};
export interface ServerDocData {
    pubKey: string;
    owner: string;
    updatedAt: Date | string;
    snapshotCid?: string | null;
    updateCids?: string[] | null;
}
export interface SyncStatus {
    isSyncing: boolean;
    lastSynced: Date | null;
    syncError: string | null;
    pendingLocalChanges: number;
    isOnline: boolean;
}

// Other types will be added below... 