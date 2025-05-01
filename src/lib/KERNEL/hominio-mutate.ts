import { LoroDoc, LoroMap, LoroText, LoroList } from 'loro-crdt';
import { hominioDB /*, triggerDocChangeNotification */ } from './hominio-db';
import { canWrite, canDelete, type CapabilityUser, canCreate } from './hominio-caps';
import type { LeafRecord, LeafValue } from '$db/seeding/leaf.data'; // Use only LeafValue union type
import type { SchemaRecord } from '$db/seeding/schema.data';
import type { CompositeRecord } from '$db/seeding/composite.data'; // Removed CompositeId
import { docIdService } from './docid-service'; // Needed for key generation
import { hominioIndexing } from './hominio-indexing'; // Import the indexing service

// --- MUTATE_HQL Types --- 

export type MutationOperationType = 'create' | 'update' | 'delete';
export type MutationTargetType = 'Leaf' | 'Schema' | 'Composite';

// Base interface for mutation operations
interface BaseMutationOperation {
    operation: MutationOperationType;
    type: MutationTargetType;
    placeholder?: string; // Optional temporary ID (e.g., "$$newLeaf") for intra-mutation refs
}

// Create Operation
export interface CreateMutationOperation extends BaseMutationOperation {
    operation: 'create';
    // Data structure depends on 'type'
    data: LeafRecord['data'] | SchemaRecord['data'] | CompositeRecord['data'];
    owner?: string; // Optional: defaults to the acting user
}

// Update Operation
export interface UpdateMutationOperation extends BaseMutationOperation {
    operation: 'update';
    targetPubKey: string; // PubKey of the document to update
    // Partial data to update. Structure depends on 'type'
    data: Partial<LeafRecord['data']> | Partial<SchemaRecord['data']> | Partial<CompositeRecord['data']>;
    placeholder?: undefined; // Cannot assign placeholder to an update
}

// Delete Operation
export interface DeleteMutationOperation extends BaseMutationOperation {
    operation: 'delete';
    targetPubKey: string; // PubKey of the document to delete
    placeholder?: undefined; // Cannot assign placeholder to a delete
    // Optional: Specify dependency handling strategy?
    // cascade?: boolean; // Example: true to attempt deleting referencing composites (requires careful permission checks)
}

// Union type for any mutation operation
export type MutationOperation = CreateMutationOperation | UpdateMutationOperation | DeleteMutationOperation;

// Top-level Mutation Request Structure
export interface MutateHqlRequest {
    mutations: MutationOperation[];
}

// Result of a successful mutation, mapping placeholders to actual pubkeys
export interface MutationSuccessResult {
    status: 'success';
    generatedPubKeys: Record<string, string>; // Maps placeholder -> actual pubKey
}

// Result of a failed mutation
export interface MutationErrorResult {
    status: 'error';
    message: string;
    errorDetails?: unknown;
}

export type MutationResult = MutationSuccessResult | MutationErrorResult;


// --- Mutation Engine Logic --- 

/**
 * Executes a batch of mutation operations atomically using a conceptual two-phase commit.
 */
export async function executeMutation(
    request: MutateHqlRequest,
    user: CapabilityUser | null
): Promise<MutationResult> {

    const finalGeneratedPubKeys: Record<string, string> = {}; // Map placeholder -> FINAL pubKey
    const placeholderToTempKey: Record<string, string> = {}; // Map placeholder -> TEMP key
    const preparedDocs: Map<string, LoroDoc> = new Map(); // Map temp_key/targetPubKey -> prepared LoroDoc
    const updatesToPersist: Map<string, { doc: LoroDoc, isNew: boolean, owner?: string, placeholder?: string }> = new Map(); // temp_key/targetPubKey -> {doc, isNew, owner, placeholder}
    const deletesToPersist: Set<string> = new Set(); // targetPubKey

    // --- Phase 1: Prepare & Validate (In Memory) --- 
    try {

        for (const op of request.mutations) {
            const placeholder = op.placeholder;

            // Resolve placeholders using TEMP keys stored in placeholderToTempKey
            if ('data' in op && typeof op.data === 'object' && op.data !== null) {
                if (op.type === 'Composite' && 'places' in op.data && op.data.places) {
                    for (const place in op.data.places) {
                        const value = op.data.places[place as keyof typeof op.data.places];
                        if (typeof value === 'string' && value.startsWith('$$')) {
                            if (!placeholderToTempKey[value]) { // Check temp map
                                throw new Error(`Unresolved placeholder "${value}" used before definition in operation targeting ${placeholder ?? ('targetPubKey' in op ? op.targetPubKey : 'unknown')}`);
                            }
                            op.data.places[place as keyof typeof op.data.places] = placeholderToTempKey[value]; // Use temp key
                        }
                    }
                }
                if (op.type === 'Composite' && 'schemaId' in op.data && typeof op.data.schemaId === 'string' && op.data.schemaId.startsWith('$$')) {
                    const placeholderSchema = op.data.schemaId;
                    if (!placeholderToTempKey[placeholderSchema]) {
                        throw new Error(`Unresolved placeholder schema "${placeholderSchema}" used in operation targeting ${placeholder ?? ('targetPubKey' in op ? op.targetPubKey : 'unknown')}`);
                    }
                    op.data.schemaId = placeholderToTempKey[placeholderSchema]; // Use temp key
                }
            }

            switch (op.operation) {
                case 'create': {
                    // Permission Check
                    if (!canCreate(user)) throw new Error('Permission denied: User cannot create documents.');

                    // 1. Generate Temporary Key for placeholder resolution
                    // Final key generated in Phase 2
                    const tempKey = placeholder ? placeholder + '_temp_' + Date.now() : 'random_temp_' + Date.now();
                    if (placeholder) {
                        if (placeholderToTempKey[placeholder]) throw new Error(`Duplicate placeholder: ${placeholder}`);
                        placeholderToTempKey[placeholder] = tempKey; // Map placeholder to temp key
                    }

                    // 2. Create LoroDoc in Memory & Populate
                    const newDoc = new LoroDoc();
                    newDoc.setPeerId(1); // Use default numeric ID

                    const metadataMap = newDoc.getMap('metadata');
                    metadataMap.set('type', op.type);

                    const dataMap = newDoc.getMap('data');

                    // --- Fully Populate based on op.type and op.data --- 
                    switch (op.type) {
                        case 'Leaf': {
                            const leafData = op.data as LeafValue;
                            dataMap.set('type', leafData.type);
                            switch (leafData.type) {
                                case 'LoroText': {
                                    dataMap.setContainer('value', new LoroText()).insert(0, leafData.value || '');
                                    break;
                                }
                                case 'LoroMap': {
                                    const nestedMap = dataMap.setContainer('value', new LoroMap());
                                    for (const key in leafData.value) {
                                        nestedMap.set(key, leafData.value[key]);
                                    }
                                    break;
                                }
                                case 'LoroList':
                                case 'LoroMovableList': {
                                    const nestedList = dataMap.setContainer('value', new LoroList());
                                    if (Array.isArray(leafData.value)) {
                                        leafData.value.forEach((item: unknown) => {
                                            nestedList.push(item);
                                        });
                                    }
                                    break;
                                }
                                case 'Concept':
                                    // No 'value' container needed
                                    break;
                                case 'Index':
                                    // Index starts empty
                                    dataMap.setContainer('value', new LoroMap());
                                    break;
                                // case 'LoroTree':
                                //     // TODO: Add LoroTree handling if needed
                                //     break;
                                default:
                                    console.warn(`[Mutation Create Leaf] Unsupported leaf data type: ${leafData.type}`);
                            }
                            break;
                        }
                        case 'Schema': {
                            const schemaData = op.data as SchemaRecord['data'];
                            dataMap.set('schemaId', tempKey); // Use TEMP key for self-reference
                            dataMap.set('name', schemaData.name || '');
                            const placesMap = dataMap.setContainer('places', new LoroMap());
                            if (schemaData.places) {
                                for (const place of ['x1', 'x2', 'x3', 'x4', 'x5'] as const) {
                                    if (schemaData.places[place]) {
                                        placesMap.set(place, schemaData.places[place]);
                                    }
                                }
                            }
                            if (schemaData.translations) {
                                // Store as plain JSON - conversion to Loro types would happen if needed on read/update?
                                dataMap.set('translations', schemaData.translations);
                            }
                            break;
                        }
                        case 'Composite': {
                            const compositeData = op.data as CompositeRecord['data'];
                            // schemaId and places[key] should already be resolved (to temp keys if needed)
                            dataMap.set('schemaId', compositeData.schemaId || ''); // Ensure non-null
                            const placesMap = dataMap.setContainer('places', new LoroMap());
                            if (compositeData.places) {
                                for (const place of ['x1', 'x2', 'x3', 'x4', 'x5'] as const) {
                                    if (compositeData.places[place]) {
                                        placesMap.set(place, compositeData.places[place]);
                                    }
                                }
                            }
                            break;
                        }
                        default: {
                            // Should be caught by TS, but handles potential JS calls
                            const exhaustiveCheck: never = op.type;
                            throw new Error(`Unsupported type for create operation: ${exhaustiveCheck}`);
                        }
                    }
                    // ------------------------------------------------

                    // 3. Store for Phase 2
                    const owner = op.owner ?? user?.id;
                    if (!owner) throw new Error(`Cannot determine owner for create operation: ${placeholder}`);
                    updatesToPersist.set(tempKey, { doc: newDoc, isNew: true, owner: owner, placeholder: placeholder });
                    preparedDocs.set(tempKey, newDoc);
                    break;
                }
                case 'update': {
                    const targetPubKey = op.targetPubKey;

                    // 1. Permission Check
                    const docMeta = await hominioDB.getDocument(targetPubKey);
                    if (!docMeta) throw new Error(`Document not found for update: ${targetPubKey}`);
                    if (!canWrite(user, docMeta)) throw new Error(`Permission denied to write to ${targetPubKey}`);

                    // 2. Get or Load LoroDoc
                    let docToUpdate: LoroDoc | null | undefined = preparedDocs.get(targetPubKey);
                    if (!docToUpdate) {
                        docToUpdate = await hominioDB.getLoroDoc(targetPubKey);
                        if (!docToUpdate) throw new Error(`Failed to load LoroDoc for update: ${targetPubKey}`);
                        preparedDocs.set(targetPubKey, docToUpdate); // Store loaded doc
                    }

                    // 3. Apply Changes to In-Memory Doc
                    if (op.type === 'Composite' && 'places' in op.data && op.data.places) {
                        const dataMap = docToUpdate.getMap('data');
                        const placesMap = dataMap.get('places');
                        if (placesMap instanceof LoroMap) {
                            for (const place in op.data.places) {
                                let value = op.data.places[place as keyof typeof op.data.places];
                                // Resolve placeholder using TEMP map if present in update data
                                if (typeof value === 'string' && value.startsWith('$$')) {
                                    value = placeholderToTempKey[value] ?? value; // Use temp key if found
                                }
                                placesMap.set(place, value ?? null);
                            }
                        } else {
                            console.warn(`[Mutation Update] Target doc ${targetPubKey} data.places is not a LoroMap or is missing.`);
                        }
                    } // Add logic for other types (Leaf value, Schema fields)
                    console.warn("[Mutation Engine] TODO: Implement FULL LoroDoc update logic for UPDATE");

                    // 4. Mark for Phase 2 Persistence
                    if (!updatesToPersist.has(targetPubKey)) {
                        updatesToPersist.set(targetPubKey, { doc: docToUpdate, isNew: false });
                    }
                    break;
                }
                case 'delete': {
                    const targetPubKey = op.targetPubKey;

                    // 1. Permission Check
                    const docMeta = await hominioDB.getDocument(targetPubKey);
                    if (!docMeta) {
                        console.warn(`Document not found for delete, skipping: ${targetPubKey}`);
                        continue; // Or throw error? Decide on behavior for deleting non-existent docs.
                    }
                    if (!canDelete(user, docMeta)) throw new Error(`Permission denied to delete ${targetPubKey}`);

                    // 2. Dependency Check (Crucial!)
                    // TODO: Implement dependency checking. E.g., query for Composites referencing this Leaf.
                    // If dependencies exist and cascade is not enabled/allowed, throw error.
                    console.warn("[Mutation Engine] TODO: Implement dependency checking for DELETE");
                    // if (dependenciesFound && !op.cascade) throw new Error(...);

                    // 3. Mark for Deletion in Phase 2
                    deletesToPersist.add(targetPubKey);
                    // If cascade, find and mark dependencies for deletion too.

                    // Remove from prepared docs if it was created/updated earlier in this transaction
                    updatesToPersist.delete(targetPubKey);
                    preparedDocs.delete(targetPubKey);
                    break;
                }
                default: {
                    // This should be caught by TypeScript, but good practice for JS consumers
                    const exhaustiveCheck: never = op;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    throw new Error(`Unsupported operation type: ${(exhaustiveCheck as any)?.operation}`);
                }
            }
        }


    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[Mutation Engine] Phase 1 Failed:", message);
        return { status: 'error', message: `Preparation failed: ${message}`, errorDetails: error };
    }

    // --- Phase 2: Commit (Persistent Storage) --- 
    try {
        // let requiresNotification = false; // REMOVE UNUSED FLAG

        // <<< Start Batch Operation >>>
        hominioDB.startBatchOperation();

        // 1. Process Deletes first
        for (const pubKeyToDelete of deletesToPersist) {
            await hominioDB.deleteDocument(user, pubKeyToDelete);
            // Internal notification is suppressed, requiresNotification flag used later
        }

        // 2. Generate Final Keys for ALL Creations
        const tempToFinalKeyMap: Record<string, string> = {}; // Map tempKey -> finalPubKey
        for (const [tempKey, { isNew, placeholder }] of updatesToPersist.entries()) {
            // Generate final key ONLY for new documents
            if (isNew) {
                const finalPubKey = await docIdService.generateDocId();
                tempToFinalKeyMap[tempKey] = finalPubKey;
                // If there was an original placeholder, update the map for the return value
                if (placeholder && placeholderToTempKey[placeholder] === tempKey) {
                    finalGeneratedPubKeys[placeholder] = finalPubKey;
                }
            }
        }

        // 3. Update LoroDocs with Final Keys BEFORE Persistence
        for (const [key, { doc, isNew }] of updatesToPersist.entries()) { // Iterate using tempKey/targetKey `key`
            if (deletesToPersist.has(key) || !isNew) continue; // Only update newly created docs internal refs

            const finalKeyForUpdate = tempToFinalKeyMap[key]; // Get the final key for the doc being updated
            if (!finalKeyForUpdate) continue; // Should not happen if logic above is correct

            const metadataMap = doc.getMap('metadata');
            const dataMap = doc.getMap('data');
            const docType = metadataMap.get('type');

            // Update self-referencing schemaId
            if (docType === 'Schema') {
                dataMap.set('schemaId', finalKeyForUpdate);
            }

            // Update references within Composite places
            if (docType === 'Composite') {
                const placesMap = dataMap.get('places');
                if (placesMap instanceof LoroMap) {
                    const currentPlaces = placesMap.toJSON();
                    for (const place in currentPlaces) {
                        const currentVal = currentPlaces[place];
                        // Check if the current value is a temp key we generated
                        if (typeof currentVal === 'string' && tempToFinalKeyMap[currentVal]) {
                            const finalRefKey = tempToFinalKeyMap[currentVal];
                            placesMap.set(place, finalRefKey);
                        }
                    }
                }
            }
        }

        // 4. Persist Creates/Updates
        for (const [key, { doc, isNew, owner }] of updatesToPersist.entries()) {
            if (deletesToPersist.has(key)) continue;

            if (isNew) {
                // Use the final key generated in step 2
                const finalPubKey = tempToFinalKeyMap[key];
                if (!finalPubKey) {
                    // This check ensures we generated a key for every new item
                    throw new Error(`Consistency Error: Final key not generated for temp key ${key}`);
                }
                if (!owner) {
                    // This should have been caught in Phase 1, but double-check
                    throw new Error(`Consistency Error: Owner missing for new document with temp key ${key}`);
                }
                // FIX: Get maps from the *current doc* being processed
                const currentMetadataMap = doc.getMap('metadata');
                const currentDataMap = doc.getMap('data');

                // If it's a self-referencing schema, update the schemaId in the LoroDoc now
                if (currentMetadataMap.get('type') === 'Schema') {
                    currentDataMap.set('schemaId', finalPubKey);
                }

                // Persist using the internal method
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (hominioDB as any)._persistNewDocument(user, finalPubKey, owner, doc);
                // requiresNotification = true; // REMOVE UNUSED FLAG ASSIGNMENT
            } else {
                // Update existing doc (key is the actual targetPubKey)
                // Ensure refs in updated docs are also using final keys if needed
                // (The update logic in step 3 handles this)
                await hominioDB.updateDocument(user, key, doc);
                // requiresNotification = true; // REMOVE UNUSED FLAG ASSIGNMENT
            }
        }


        // --- Post-Commit --- 

        // === Trigger Indexing BEFORE ending batch ===
        console.log('[Mutation Engine] Awaiting indexing cycle before final notification...'); // DEBUG
        try {
            await hominioIndexing.startIndexingCycle();
            console.log('[Mutation Engine] Indexing cycle completed.'); // DEBUG
        } catch (indexingError) {
            console.error('[Mutation Engine] Error during post-mutation indexing cycle:', indexingError);
        }
        // ==============================================

        // <<< End Batch Operation >>>
        hominioDB.endBatchOperation();

        // <<< Trigger ONE Notification AFTER batch and indexing >>>
        // REMOVE explicit call - endBatchOperation handles notification if needed
        /*
        // REMOVE Check using unused flag
        // if (requiresNotification || deletesToPersist.size > 0) { 
        //     console.log('[Mutation Engine] Triggering final notification after batch commit and indexing.'); // DEBUG
        //     triggerDocChangeNotification(); 
        // }
        */

        return { status: 'success', generatedPubKeys: finalGeneratedPubKeys };

    } catch (error: unknown) {
        // <<< Ensure batch ends even on error >>>
        hominioDB.endBatchOperation();

        const message = error instanceof Error ? error.message : String(error);
        console.error("[Mutation Engine] Phase 2 Failed (Persistence/Commit):", message);
        return { status: 'error', message: `Commit failed: ${message}`, errorDetails: error };
    }
}
