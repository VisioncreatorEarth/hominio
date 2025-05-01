import { type LoroDoc, LoroMap, LoroList } from 'loro-crdt';
import {
    hominioDB,
    /* docChangeNotifier, */ type Docs,
    type IndexingBacklogItem
} from './hominio-db';
import { hashService } from './hash-service';
import { getIndexLeafPubKey, isIndexLeafDocument, type IndexLeafType } from './index-registry';
import { getDataFromDoc, getLeafDoc } from './loro-engine';
import type { CompositeRecord } from '../../db/seeding/composite.data';
import type { PlaceKey } from './hominio-query';

// Define other constants
// const INDEXING_DEBOUNCE_MS = 1000; // Remove unused constant
const MAX_BACKLOG_RETRIES = 5;     // Max times to retry a failed item from backlog
const BATCH_SIZE = 10; // Process backlog in batches

// Keep track of active indexing jobs to prevent duplicates (simple in-memory set)
const activeIndexingJobs = new Set<string>();

/**
 * HominioIndexing Service
 * Manages the creation and updating of local query indices based on document changes.
 */
class HominioIndexing {
    private isIndexing = false; // Prevent concurrent cycles
    // private debounceTimer: NodeJS.Timeout | null = null; // Removed debounce logic
    private unsubscribeNotifier: (() => void) | null = null;


    /** Starts the indexing process if not already running. */
    public async startIndexingCycle(/* isInitialRun = false */): Promise<void> { // Remove unused parameter
        console.log(`[HominioIndexing] startIndexingCycle called. isIndexing: ${this.isIndexing}`); // DEBUG
        if (this.isIndexing) {
            console.warn('[HominioIndexing] Cycle already in progress, skipping manual trigger.'); // Keep warning
            return;
        }
        this.isIndexing = true;
        let notificationNeeded = false; // Flag to track if notification should be sent

        let indexKeys: Record<IndexLeafType, string> | null = null; // Store keys here
        try {
            // --- Check if Index Leaf Registry is Ready ---
            const leavesKey = await getIndexLeafPubKey('leaves');
            const schemasKey = await getIndexLeafPubKey('schemas');
            const compositesKey = await getIndexLeafPubKey('composites');
            const compositesCompKey = await getIndexLeafPubKey('composites-by-component');

            if (!leavesKey || !schemasKey || !compositesKey || !compositesCompKey) {
                console.error('[HominioIndexing] Index Leaf registry not yet fully populated. Cannot run indexing cycle.'); // Keep error
                this.isIndexing = false; // Release lock
                return; // Wait for sync to populate the registry
            }
            // Store keys for passing down
            indexKeys = {
                leaves: leavesKey,
                schemas: schemasKey,
                composites: compositesKey,
                'composites-by-component': compositesCompKey
            };
            // ---------------------------------------------

            // 1. Fetch all document metadata
            const allDocs = await hominioDB.loadAllDocsReturn();
            // REMOVED: console.log(`[HominioIndexing] Fetched ${allDocs.length} doc metadata entries.`);

            // 2. Identify documents needing indexing
            const docsToIndex: string[] = [];
            for (const doc of allDocs) {
                if (await this.needsIndexing(doc)) {
                    // Avoid adding if already being processed in this cycle or actively
                    if (!activeIndexingJobs.has(doc.pubKey)) {
                        docsToIndex.push(doc.pubKey);
                        activeIndexingJobs.add(doc.pubKey); // Add to active set
                    }
                }
            }
            // 3. Process identified documents (concurrently?)
            for (const pubKey of docsToIndex) {
                const result = await this.processDocumentForIndexing(pubKey, indexKeys);
                if (result.success) {
                    notificationNeeded = true; // Mark notification needed if successful
                }
            }

            // 4. Process backlog queue
            const backlogProcessed = await this.processBacklogQueue(indexKeys);
            if (backlogProcessed) {
                notificationNeeded = true; // Mark notification needed if backlog items were processed
            }

        } catch (error) {
            console.error('[HominioIndexing] Error during indexing cycle:', error); // Keep critical error
        } finally {
            this.isIndexing = false;
            // Trigger notification ONLY if needed, AFTER the lock is released
            if (notificationNeeded) {
                console.log('[HominioIndexing] Indexing cycle complete, changes detected. Relying on caller (e.g., mutation) for final notification.'); // DEBUG - REMOVED trigger
            } else {
                console.log('[HominioIndexing] Indexing cycle complete, no changes detected, skipping notification.'); // DEBUG
            }
        }
    }

    /**
     * Determines if a document needs to be processed by the indexer based on its metadata and indexingState.
     */
    private async needsIndexing(doc: Docs): Promise<boolean> {
        // --- Add Check for valid doc and pubKey ---
        if (!doc || !doc.pubKey) {
            console.warn('[HominioIndexing] needsIndexing: Encountered invalid/incomplete document metadata.', doc); // Keep warning
            return false; // Skip processing this invalid entry
        }
        // -------------------------------------------

        // FIX: Use renamed helper function
        // Ignore Index Leaf docs themselves
        if (isIndexLeafDocument(doc.pubKey)) {
            return false;
        }

        // Check 3: Does indexingState exist?
        // REMOVED: console.log(`[HominioIndexing needsIndexing] Checking doc ${doc.pubKey.substring(0, 10)}... Value of doc.indexingState:`, doc.indexingState);
        if (!doc.indexingState) {
            // REMOVED: console.log(`[HominioIndexing] Needs indexing (no state): ${doc.pubKey}`);
            return true;
        }

        // If there's an error or manual reindex flag, it needs indexing.
        if (doc.indexingState.indexingError || doc.indexingState.needsReindex) {
            // REMOVED: console.log(`[HominioIndexing] Needs indexing (error/reindex flag): ${doc.pubKey}`);
            return true;
        }

        // Calculate the hash of the current update CIDs
        const sortedUpdateCids = [...(doc.updateCids || [])].sort();
        const currentUpdateHash = await hashService.hashString(JSON.stringify(sortedUpdateCids));

        // Compare snapshot CID and update CIDs hash
        const snapshotChanged = doc.snapshotCid !== doc.indexingState.lastIndexedSnapshotCid;
        const updatesChanged = currentUpdateHash !== doc.indexingState.lastIndexedUpdateCidsHash;

        if (snapshotChanged || updatesChanged) {
            // REMOVED: console.log(`[HominioIndexing] Needs indexing (CID mismatch): ${doc.pubKey}`);
            return true;
        }

        // If none of the above conditions are met, it doesn't need indexing.
        return false;
    }

    /** Helper to get the LoroMap container for an index leaf's value */
    private async getIndexValueMap(indexPubKey: string): Promise<LoroMap | null> {
        const indexDoc = await getLeafDoc(indexPubKey); // Index is a Leaf
        if (!indexDoc) {
            console.error(`[HominioIndexing] Failed to load index document: ${indexPubKey}`);
            return null;
        }
        const dataMap = indexDoc.getMap('data');
        if (!dataMap) {
            console.error(`[HominioIndexing] Index document ${indexPubKey} has no 'data' map.`);
            return null;
        }
        const valueContainer = dataMap.get('value');
        if (!(valueContainer instanceof LoroMap)) {
            console.error(`[HominioIndexing] Index document ${indexPubKey} 'data.value' is not a LoroMap.`);
            return null;
        }
        return valueContainer;
    }

    /**
    * Processes a single document for indexing: loads it, extracts data, and updates relevant index docs.
    * Accepts pre-fetched index pubkeys for efficiency.
    * Returns an object indicating success and a message.
    */
    private async processDocumentForIndexing(
        pubKey: string,
        indexKeys: Record<IndexLeafType, string> // Pass loaded keys
    ): Promise<{ success: boolean; message: string }> {
        // REMOVED: active job check log

        // REMOVED: console.log(`[HominioIndexing] Processing document: ${pubKey}`);
        let loroDoc: LoroDoc | null = null;
        let success = false; // Track overall success for updating indexing state

        try {
            // 1. Get the LoroDoc instance using hominioDB
            loroDoc = await hominioDB.getLoroDoc(pubKey);
            if (!loroDoc) {
                console.warn(`[HominioIndexing] Could not load LoroDoc for pubKey: ${pubKey}. Adding to backlog.`); // Keep warn
                throw new Error('Failed to load LoroDoc (metadata or content missing)');
            }

            // --- Determine Document Type (using metadata.type) ---
            const metadataMap = loroDoc.getMap('metadata');
            // FIX: Read metadata.type instead of ckaji.klesi
            const docType = (metadataMap instanceof LoroMap) ? metadataMap.get('type') : undefined;

            // --- REMOVED Detailed Logging ---
            // REMOVED: console.log(`[HominioIndexing Debug] Processing ${pubKey} - Determined DocType: ${docType || 'undefined'}`);

            if (!docType || typeof docType !== 'string' || !['Leaf', 'Schema', 'Composite'].includes(docType)) {
                // FIX: Update error message and property name to check for 'Schema'
                console.warn(`[HominioIndexing] Document ${pubKey} metadata.type is invalid or missing (expected Leaf, Schema, or Composite): ${docType}. Skipping indexing.`);
                await hominioDB.updateDocIndexingState(pubKey, {
                    indexingError: 'Invalid or missing metadata.type',
                    needsReindex: false,
                });
                return { success: true, message: 'Skipped indexing due to invalid metadata.type' };
            }

            // --- Load Index LoroMaps --- 
            const indexLeavesMap = await this.getIndexValueMap(indexKeys.leaves);
            const indexSchemasMap = await this.getIndexValueMap(indexKeys.schemas);
            const indexCompositesMap = await this.getIndexValueMap(indexKeys.composites);
            const indexCompByCompMap = await this.getIndexValueMap(indexKeys['composites-by-component']);

            if (!indexLeavesMap || !indexSchemasMap || !indexCompositesMap || !indexCompByCompMap) {
                throw new Error(`Failed to load one or more index document maps.`);
            }

            // --- Extract Data and Update Indices ---
            // REMOVED: console.log(`[HominioIndexing] Extracting data and updating indices for ${pubKey} (${docType})`);

            let indexingLogicSuccess = false;
            let commitRequired = false; // Track if any index doc was modified

            // TODO: Implement removal from old indices if the document type changed? Low priority.

            switch (docType) {
                case 'Leaf': {
                    // Add to leaves index
                    indexLeavesMap.set(pubKey, true);
                    commitRequired = true;
                    indexingLogicSuccess = true;
                    break;
                }
                case 'Schema': { // Represents Schema
                    // <<< CHANGE: Index by Name >>>
                    const schemaData = getDataFromDoc(loroDoc) as { name?: string } | undefined;
                    const schemaName = schemaData?.name;

                    if (schemaName && typeof schemaName === 'string' && schemaName.trim().length > 0) {
                        // TODO: Handle removal of potential old name entry if the name changed.
                        // For now, we just set the new name. Potential for stale entries if names change frequently.
                        indexSchemasMap.set(schemaName, pubKey); // Use name as key, pubKey as value
                        commitRequired = true;
                        indexingLogicSuccess = true;
                        console.log(`[HominioIndexing] Indexed schema: '${schemaName}' -> ${pubKey}`); // DEBUG
                    } else {
                        console.warn(`[HominioIndexing] Schema ${pubKey} has missing or invalid 'name' in data. Cannot add to name-based index.`);
                        // Decide if this should be an error or just skip indexing by name
                        // For now, let's consider it a success for indexing state, but log the warning.
                        indexingLogicSuccess = true; // Allow state update, but it won't be in the name index
                    }
                    // <<< END CHANGE >>>
                    break;
                }
                case 'Composite': {
                    // Add to composites index (simple existence)
                    indexCompositesMap.set(pubKey, true);
                    commitRequired = true; // Mark commit needed for the simple index

                    // --- Update Component Index ---
                    const compositeData = getDataFromDoc(loroDoc) as CompositeRecord['data'] | undefined;

                    if (!compositeData || !compositeData.schemaId || !compositeData.places) {
                        console.warn(`[HominioIndexing] Composite ${pubKey} has invalid or missing data (schemaId/places). Cannot update component index.`);
                        // Mark overall success as true because the simple index was updated, but component index failed.
                        indexingLogicSuccess = true; // Allow state update, but maybe log specific error?
                        // Consider adding specific error to indexingState here?
                        break; // Skip component indexing for this doc
                    }

                    // --- TODO: Handle REMOVAL from old component index keys if this is an UPDATE ---
                    // This requires knowing the *previous* state of compositeData.schemaId and compositeData.places
                    // For now, we only handle ADDING based on the current state.

                    let componentIndexUpdateSuccess = true;
                    for (const place in compositeData.places) {
                        // FIX: Cast place to PlaceKey for indexing
                        const leafId = compositeData.places[place as PlaceKey];
                        if (leafId) {
                            const componentKey = `schema:${compositeData.schemaId}:${place}:${leafId}`;
                            try {
                                // FIX: Change let to const
                                const listContainer = indexCompByCompMap.get(componentKey);
                                let list: LoroList<string>;

                                if (listContainer instanceof LoroList) {
                                    list = listContainer as LoroList<string>;
                                } else {
                                    // Create list if it doesn't exist
                                    // FIX: Check correct container type
                                    const newListContainer = indexCompByCompMap.setContainer(componentKey, new LoroList<string>());
                                    if (!(newListContainer instanceof LoroList)) {
                                        throw new Error(`Failed to create LoroList for key ${componentKey}`);
                                    }
                                    list = newListContainer;
                                    commitRequired = true; // Mark commit needed
                                    // REMOVED: console.log(`[HominioIndexing DEBUG] Created new list for key: ${componentKey}`);
                                }

                                // Add pubKey to list if not present
                                const currentList = list.toArray();
                                if (!currentList.includes(pubKey)) {
                                    list.push(pubKey);
                                    commitRequired = true; // Mark commit needed
                                    // console.log(`[HominioIndexing DEBUG] Added ${pubKey} to list for key: ${componentKey}`);
                                }
                            } catch (listError) {
                                console.error(`[HominioIndexing] Error updating component index list for key ${componentKey} (Composite ${pubKey}):`, listError);
                                componentIndexUpdateSuccess = false; // Mark failure for this specific part
                            }
                        }
                    }
                    // Overall logic success depends on component index success as well
                    indexingLogicSuccess = componentIndexUpdateSuccess;
                    break;
                }
                default: {
                    console.warn(`[HominioIndexing] Unrecognized document type '${docType}' for ${pubKey}. Skipping.`); // Keep warn
                    indexingLogicSuccess = true;
                    break;
                }
            } // --- End Switch ---

            success = indexingLogicSuccess;

            // --- Commit Index Documents ---
            // Only commit if changes were potentially made
            if (commitRequired) {
                try {
                    // It's safer to get the doc instances again before committing
                    const indexLeavesDoc = await getLeafDoc(indexKeys.leaves);
                    const indexSchemasDoc = await getLeafDoc(indexKeys.schemas);
                    const indexCompositesDoc = await getLeafDoc(indexKeys.composites);
                    const indexCompByCompDoc = await getLeafDoc(indexKeys['composites-by-component']);

                    if (indexLeavesDoc) indexLeavesDoc.commit();
                    if (indexSchemasDoc) indexSchemasDoc.commit();
                    if (indexCompositesDoc) indexCompositesDoc.commit();
                    if (indexCompByCompDoc) indexCompByCompDoc.commit();
                    // console.log(`[HominioIndexing DEBUG] Committed index documents for changes related to ${pubKey}`);
                } catch (commitError) {
                    console.error(`[HominioIndexing] Error committing index documents after processing ${pubKey}:`, commitError);
                    indexingLogicSuccess = false; // Mark failure if commit fails
                }
            }

            // --- Finalize: Update Indexing State only on SUCCESS ---
            if (success) {
                // REMOVED: console.log(`[HominioIndexing] Successfully processed ${pubKey}. Updating indexing state.`);
                const docMetadata = await hominioDB.getDocument(pubKey);
                if (docMetadata) {
                    const sortedUpdateCids = [...(docMetadata.updateCids || [])].sort();
                    const currentUpdateHash = await hashService.hashString(JSON.stringify(sortedUpdateCids));
                    await hominioDB.updateDocIndexingState(pubKey, {
                        lastIndexedTimestamp: new Date().toISOString(),
                        lastIndexedSnapshotCid: docMetadata.snapshotCid,
                        lastIndexedUpdateCidsHash: currentUpdateHash,
                        indexingError: null, // Clear any previous error
                        needsReindex: false, // Clear reindex flag
                    });
                    await hominioDB.removeFromIndexingBacklog(pubKey);

                    // <<< Notify AFTER successful indexing and state update >>>
                    // REMOVED: console.log(`[HominioIndexing processDocumentForIndexing] Successfully processed ${pubKey}, triggering notification.`); // DEBUG
                    // REMOVED: triggerDocChangeNotification();
                    // <<< END Notify >>>
                } else {
                    console.error(`[HominioIndexing] CRITICAL: Could not retrieve metadata for ${pubKey} after processing.`); // Keep critical error
                    throw new Error(`Metadata missing for ${pubKey} after successful processing.`);
                }
            } else {
                throw new Error(`Indexing logic failed for document type ${docType}`);
            }

            return { success: true, message: 'Indexing successful' };

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[HominioIndexing] Error processing document ${pubKey}:`, errorMessage);
            // FIX: Use correct DB method addToIndexingBacklog
            // Construct the full item for upsert
            const backlogItem: IndexingBacklogItem = {
                pubKey,
                errorCount: 1, // First error
                lastError: errorMessage || 'Unknown processing error',
                addedTimestamp: new Date().toISOString() // Use ISO string as likely expected by schema
            };
            await hominioDB.addToIndexingBacklog(backlogItem);
            success = false; // Ensure success is false on error
        } finally {
            activeIndexingJobs.delete(pubKey); // Remove from active set regardless of outcome
        }

        // Return success status for backlog handling
        return { success: success, message: success ? 'Indexed successfully' : 'Indexing failed or added to backlog' };
    }


    /** Processes the indexing backlog queue. */
    private async processBacklogQueue(indexKeys: Record<IndexLeafType, string> | null): Promise<boolean> {
        // FIX: Revert to using getNextFromIndexingBacklog in a loop
        if (!indexKeys) {
            console.error("[HominioIndexing] Cannot process backlog: Index keys were not loaded.");
            return false;
        }

        // REMOVED: console.log(`[HominioIndexing] Processing backlog queue in batches...`);
        let itemsProcessedTotal = 0;
        let processedAnySuccessfully = false; // Track if any item was successfully processed for notification

        try {
            while (true) {
                const backlogItems = await hominioDB.getNextFromIndexingBacklog(BATCH_SIZE);
                if (backlogItems.length === 0) {
                    break; // No more items in backlog
                }

                // REMOVED: console.log(`[HominioIndexing] Processing batch of ${backlogItems.length} backlog item(s).`);
                let processedInBatch = 0;

                for (const item of backlogItems) {
                    if (item.errorCount >= MAX_BACKLOG_RETRIES) {
                        console.warn(`[HominioIndexing] Max retries reached for backlog item ${item.pubKey}. Skipping.`);
                        await hominioDB.updateDocIndexingState(item.pubKey, {
                            indexingError: `Max retries reached. Last error: ${item.lastError || 'Unknown'}`,
                            needsReindex: true, // Keep flag, needs manual intervention
                        });
                        await hominioDB.removeFromIndexingBacklog(item.pubKey); // Remove from queue
                        continue;
                    }

                    if (activeIndexingJobs.has(item.pubKey)) {
                        console.log(`[HominioIndexing] Skipping backlog item ${item.pubKey}, already being processed.`);
                        continue;
                    }
                    activeIndexingJobs.add(item.pubKey);

                    console.log(`[HominioIndexing] Retrying backlog item: ${item.pubKey} (Attempt ${item.errorCount + 1})`);
                    const result = await this.processDocumentForIndexing(item.pubKey, indexKeys);
                    processedInBatch++;

                    if (result.success) {
                        await hominioDB.removeFromIndexingBacklog(item.pubKey);
                        console.log(`[HominioIndexing] Successfully processed backlog item ${item.pubKey}. Removed from queue.`);
                        // <<< Notify AFTER successful backlog processing >>>
                        // REMOVED: console.log(`[HominioIndexing processBacklogQueue] Successfully processed ${item.pubKey}, triggering notification.`); // DEBUG
                        // REMOVED: triggerDocChangeNotification();
                        // <<< END Notify >>>
                        processedAnySuccessfully = true; // Mark success for notification
                    } else {
                        // Increment retry count via DB method
                        const updatedBacklogItem: IndexingBacklogItem = {
                            ...item,
                            errorCount: item.errorCount + 1,
                            lastError: result.message,
                            // updatedAt: new Date() // Removed
                        };
                        await hominioDB.addToIndexingBacklog(updatedBacklogItem); // Use add which acts as upsert
                        console.warn(`[HominioIndexing] Failed to process backlog item ${item.pubKey}. Error: ${result.message}`);
                    }
                    // Active job removal handled in processDocumentForIndexing finally block
                } // End for loop
                itemsProcessedTotal += processedInBatch;
                if (processedInBatch < BATCH_SIZE) {
                    // If we processed less than a full batch, we likely cleared the queue
                    break;
                }
            } // End while loop

        } catch (error) {
            console.error('[HominioIndexing] Error processing backlog queue:', error);
        }
        if (itemsProcessedTotal > 0) {
            console.log(`[HominioIndexing] Processed ${itemsProcessedTotal} items from backlog.`);
        }
        return processedAnySuccessfully; // Return whether any item was successfully processed
    }

    /** Cleans up resources, like unsubscribing from notifiers. */
    public destroy(): void {
        if (this.unsubscribeNotifier) {
            this.unsubscribeNotifier();
            this.unsubscribeNotifier = null;
        }
        // REMOVED: debounce timer clear
        activeIndexingJobs.clear();
        console.log('[HominioIndexing] Service destroyed.'); // Keep basic log
    }
}

// Export singleton instance
export const hominioIndexing = new HominioIndexing();
