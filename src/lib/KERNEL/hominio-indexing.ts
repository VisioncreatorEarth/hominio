import { type LoroDoc, LoroMap, LoroList } from 'loro-crdt';
import { hominioDB, /* docChangeNotifier, */ type Docs, type IndexingBacklogItem } from './hominio-db';
import { hashService } from './hash-service';
import { browser } from '$app/environment';
import { getFackiIndexPubKey, isFackiIndexDocument } from './facki-indices';

// Define other constants
// const INDEXING_DEBOUNCE_MS = 1000; // Remove unused constant
const MAX_BACKLOG_RETRIES = 5;     // Max times to retry a failed item from backlog

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

    constructor() {
        if (browser) {
            // Defer initialization steps that depend on other modules
            // setTimeout(() => {
            //     console.log('[HominioIndexing] Initializing...'); // Keep basic init log
            //     // --- DISABLE AUTO-INDEXING ---
            //     // this.unsubscribeNotifier = docChangeNotifier.subscribe(() => {
            //     //     this.triggerDebouncedCycle();
            //     // });
            //     // --- END DISABLE ---
            //     // Trigger initial check / backlog processing on startup - REMOVED, now manual trigger
            //     // this.startIndexingCycle(true); // Pass flag to indicate initial run
            // }, 500); // Small delay after app start
        }
    }

    // REMOVED: triggerDebouncedCycle method

    /** Starts the indexing process if not already running. */
    public async startIndexingCycle(/* isInitialRun = false */): Promise<void> { // Remove unused parameter
        if (this.isIndexing) {
            console.warn('[HominioIndexing] Cycle already in progress, skipping manual trigger.'); // Keep warning
            return;
        }
        this.isIndexing = true;
        console.log(`[HominioIndexing] Starting manual indexing cycle...`); // Simplified log

        try {
            // --- Check if Facki Index Registry is Ready ---
            const sumtiKey = await getFackiIndexPubKey('sumti');
            const selbriKey = await getFackiIndexPubKey('selbri');
            const bridiKey = await getFackiIndexPubKey('bridi');
            const bridiCompKey = await getFackiIndexPubKey('bridi_by_component');

            if (!sumtiKey || !selbriKey || !bridiKey || !bridiCompKey) {
                console.error('[HominioIndexing] Facki index registry not yet fully populated. Cannot run indexing cycle.'); // Keep error
                this.isIndexing = false; // Release lock
                return; // Wait for sync to populate the registry
            }
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
            console.log(`[HominioIndexing] Identified ${docsToIndex.length} documents requiring indexing.`); // Keep summary log

            // 3. Process identified documents (concurrently?)
            for (const pubKey of docsToIndex) {
                await this.processDocumentForIndexing(pubKey);
            }

            // 4. Process backlog queue
            // REMOVED: console.log('[HominioIndexing] Processing backlog queue...');
            await this.processBacklogQueue();

        } catch (error) {
            console.error('[HominioIndexing] Error during indexing cycle:', error); // Keep critical error
        } finally {
            this.isIndexing = false;
            console.log('[HominioIndexing] Manual indexing cycle finished.'); // Simplified log
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

        // Ignore Facki index docs themselves using the helper function
        if (isFackiIndexDocument(doc.pubKey)) {
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

    /**
    * Processes a single document for indexing: loads it, extracts data, and updates relevant index docs.
    * Returns an object indicating success and a message.
    */
    private async processDocumentForIndexing(pubKey: string): Promise<{ success: boolean; message: string }> {
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

            // --- Determine Document Type (using ckaji.klesi) ---
            const ckajiMap = loroDoc.getMap('ckaji');
            const docType = (ckajiMap instanceof LoroMap) ? ckajiMap.get('klesi') : undefined;

            // --- REMOVED Detailed Logging ---
            // REMOVED: console.log(`[HominioIndexing Debug] Processing ${pubKey} - Determined DocType: ${docType || 'undefined'}`);

            if (!docType || typeof docType !== 'string') {
                console.warn(`[HominioIndexing] Document ${pubKey} ckaji.klesi type is invalid or missing: ${docType}. Skipping indexing.`); // Keep warn
                await hominioDB.updateDocIndexingState(pubKey, {
                    indexingError: 'Invalid or missing ckaji.klesi type',
                    needsReindex: false,
                });
                return { success: true, message: 'Skipped indexing due to invalid ckaji.klesi type' };
            }

            // --- Get the root 'datni' map ---
            const rootMap = loroDoc.getMap('datni');

            // REMOVED: console.log(`[HominioIndexing] Document ${pubKey} identified as type: ${docType}`);

            // --- Load Facki Index Docs ---
            // REMOVED: console.log(`[HominioIndexing] Loading Facki index docs for type ${docType}`);
            const fackiSumtiPubKey = await getFackiIndexPubKey('sumti');
            const fackiSelbriPubKey = await getFackiIndexPubKey('selbri');
            const fackiBridiPubKey = await getFackiIndexPubKey('bridi');
            const fackiBridiByCompPubKey = await getFackiIndexPubKey('bridi_by_component');

            if (!fackiSumtiPubKey || !fackiSelbriPubKey || !fackiBridiPubKey || !fackiBridiByCompPubKey) {
                const missingKeys = [
                    !fackiSumtiPubKey && 'sumti',
                    !fackiSelbriPubKey && 'selbri',
                    !fackiBridiPubKey && 'bridi',
                    !fackiBridiByCompPubKey && 'bridi_by_component'
                ].filter(Boolean).join(', ');
                console.error(`[HominioIndexing] Required Facki index PubKeys not available: ${missingKeys}. Cannot index ${pubKey}.`); // Keep error
                return { success: false, message: `Missing Facki index PubKeys: ${missingKeys}` };
            }

            const fackiSumtiDoc = await hominioDB.getLoroDoc(fackiSumtiPubKey);
            const fackiSelbriDoc = await hominioDB.getLoroDoc(fackiSelbriPubKey);
            const fackiBridiDoc = await hominioDB.getLoroDoc(fackiBridiPubKey);
            const fackiBridiByCompDoc = await hominioDB.getLoroDoc(fackiBridiByCompPubKey);

            if (!fackiSumtiDoc || !fackiSelbriDoc || !fackiBridiDoc || !fackiBridiByCompDoc) {
                const failedToLoad = [
                    !fackiSumtiDoc && 'sumti',
                    !fackiSelbriDoc && 'selbri',
                    !fackiBridiDoc && 'bridi',
                    !fackiBridiByCompDoc && 'bridi_by_component'
                ].filter(Boolean).join(', ');
                console.error(`[HominioIndexing] Required Facki index document(s) failed to load: ${failedToLoad}. Cannot index ${pubKey}.`); // Keep error
                return { success: false, message: `Failed to load Facki index documents: ${failedToLoad}` };
            }

            // --- Extract Data and Update Indices ---
            // REMOVED: console.log(`[HominioIndexing] Extracting data and updating indices for ${pubKey} (${docType})`);

            let indexingLogicSuccess = false;
            switch (docType) {
                case 'Sumti': {
                    fackiSumtiDoc!.getMap('datni').set(pubKey, true);
                    fackiSumtiDoc!.commit();
                    // REMOVED: console.log(`[HominioIndexing] Added ${pubKey} to Sumti index.`);
                    indexingLogicSuccess = true;
                    break;
                }
                case 'Selbri': {
                    // REMOVED: console.log(`[HominioIndexing DEBUG] Adding Selbri ${pubKey} to index doc ${fackiSelbriPubKey}`);
                    fackiSelbriDoc!.getMap('datni').set(pubKey, true);
                    fackiSelbriDoc!.commit();
                    // REMOVED: console.log(`[HominioIndexing] Added ${pubKey} to Selbri index.`);
                    indexingLogicSuccess = true;
                    break;
                }
                case 'Bridi': {
                    let bridiIndexSuccess = true;

                    // Update FACKI_BRIDI_PUBKEY (existence)
                    fackiBridiDoc!.getMap('datni').set(pubKey, true);
                    fackiBridiDoc!.commit();
                    // REMOVED: console.log(`[HominioIndexing] Added ${pubKey} to Bridi existence index.`);

                    // --- Update FACKI_BRIDI_BY_COMPONENT_PUBKEY ---
                    const bridiByComponentMap = fackiBridiByCompDoc!.getMap('datni');

                    type BridiDatniSeeded = {
                        selbri?: string;
                        sumti?: Record<string, string>;
                    };
                    const datniData = rootMap?.toJSON() as BridiDatniSeeded | undefined;

                    if (!datniData) {
                        console.warn(`[HominioIndexing] Could not get datni data for bridi ${pubKey}`); // Keep warn
                        bridiIndexSuccess = false;
                    } else {
                        const selbriRef = datniData?.selbri;
                        if (typeof selbriRef !== 'string') {
                            console.warn(`[HominioIndexing] Invalid or missing selbri string for bridi ${pubKey}:`, selbriRef); // Keep warn
                            bridiIndexSuccess = false;
                        }

                        const sumtiRefsData = datniData?.sumti;
                        if (typeof sumtiRefsData !== 'object' || sumtiRefsData === null) {
                            console.warn(`[HominioIndexing] Invalid or missing sumti map for bridi ${pubKey}:`, sumtiRefsData); // Keep warn
                            bridiIndexSuccess = false;
                        }

                        if (bridiIndexSuccess && typeof selbriRef === 'string' && typeof sumtiRefsData === 'object' && bridiByComponentMap) {
                            // 1. Index by Selbri
                            const selbriKey = `selbri:${selbriRef}`;
                            let selbriListTyped: LoroList<string>;
                            const potentialSelbriList = bridiByComponentMap.get(selbriKey);
                            if (potentialSelbriList instanceof LoroList) {
                                selbriListTyped = potentialSelbriList;
                            } else {
                                if (potentialSelbriList !== undefined) {
                                    // REMOVED: console.warn(`[HominioIndexing] Existing data at ${selbriKey} was not a LoroList. Recreating.`);
                                }
                                selbriListTyped = bridiByComponentMap.setContainer(selbriKey, new LoroList<string>());
                            }
                            if (!selbriListTyped.toArray().includes(pubKey)) {
                                selbriListTyped.push(pubKey);
                                // REMOVED: console.log(`[HominioIndexing] Indexed ${pubKey} by selbri: ${selbriRef}`);
                            }

                            // 2. Index by Sumti
                            for (const [place, sumtiRefVal] of Object.entries(sumtiRefsData)) {
                                if (typeof sumtiRefVal === 'string' && sumtiRefVal) {
                                    const sumtiKey = `sumti:${sumtiRefVal}`;
                                    let sumtiListTyped: LoroList<string>;
                                    const potentialSumtiList = bridiByComponentMap.get(sumtiKey);
                                    if (potentialSumtiList instanceof LoroList) {
                                        sumtiListTyped = potentialSumtiList;
                                    } else {
                                        if (potentialSumtiList !== undefined) {
                                            // REMOVED: console.warn(`[HominioIndexing] Existing data at ${sumtiKey} was not a LoroList. Recreating.`);
                                        }
                                        sumtiListTyped = bridiByComponentMap.setContainer(sumtiKey, new LoroList<string>());
                                    }
                                    if (!sumtiListTyped.toArray().includes(pubKey)) {
                                        sumtiListTyped.push(pubKey);
                                        // REMOVED: console.log(`[HominioIndexing] Indexed ${pubKey} by sumti (${place}): ${sumtiRefVal}`);
                                    }

                                    // 3. NEW: Create composite keys for relationship traversal
                                    const compositeKey = `selbri:${selbriRef}:${place}:${sumtiRefVal}`;
                                    let compositeListTyped: LoroList<string>;
                                    const potentialCompositeList = bridiByComponentMap.get(compositeKey);
                                    if (potentialCompositeList instanceof LoroList) {
                                        compositeListTyped = potentialCompositeList;
                                    } else {
                                        compositeListTyped = bridiByComponentMap.setContainer(compositeKey, new LoroList<string>());
                                    }
                                    if (!compositeListTyped.toArray().includes(pubKey)) {
                                        compositeListTyped.push(pubKey);
                                        console.log(`[HominioIndexing] Indexed ${pubKey} by composite key: ${compositeKey}`);
                                    }
                                } else {
                                    // REMOVED: console.warn(`[HominioIndexing] Sumti data at place ${place} for bridi ${pubKey} is not a non-empty string:`, sumtiRefVal);
                                }
                            }
                        } else {
                            if (bridiIndexSuccess) {
                                // REMOVED: console.warn(`[HominioIndexing] Could not index components for bridi ${pubKey}: Pre-checks failed`);
                            }
                        }
                    } // End of else block for valid datniData

                    // Commit potentially modified component index *after* processing all components
                    if (bridiIndexSuccess) {
                        fackiBridiByCompDoc!.commit(); // Explicit commit for component index
                    }

                    indexingLogicSuccess = bridiIndexSuccess;
                    break;
                }
                default: {
                    console.warn(`[HominioIndexing] Unrecognized document type '${docType}' for ${pubKey}. Skipping.`); // Keep warn
                    indexingLogicSuccess = true;
                    break;
                }
            } // --- End Switch ---

            success = indexingLogicSuccess;

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
            console.error(`[HominioIndexing] Error processing document ${pubKey}:`, errorMessage); // Keep error

            await hominioDB.updateDocIndexingState(pubKey, {
                indexingError: errorMessage,
                needsReindex: true
            });

            // --- Add to backlog on generic error ---
            await hominioDB.addToIndexingBacklog({
                pubKey,
                addedTimestamp: new Date().toISOString(),
                errorCount: 0,
                lastError: errorMessage
            });
            // ---------------------------------------

            return { success: false, message: `Indexing failed: ${errorMessage}` };

        } finally {
            activeIndexingJobs.delete(pubKey);
            // REMOVED: console.log(`[HominioIndexing] Finished processing attempt for ${pubKey}`);
        }
    }


    /**
     * Processes items from the persistent backlog queue.
     */
    private async processBacklogQueue(): Promise<void> {
        let itemsProcessed = 0;
        const BATCH_SIZE = 5;

        try {
            while (true) {
                const backlogItems = await hominioDB.getNextFromIndexingBacklog(BATCH_SIZE);
                if (backlogItems.length === 0) {
                    // REMOVED: console.log('[HominioIndexing] Backlog queue is empty.');
                    break;
                }

                // REMOVED: console.log(`[HominioIndexing] Found ${backlogItems.length} items in backlog batch.`);
                let processedInBatch = 0;

                for (const item of backlogItems) {
                    if (activeIndexingJobs.has(item.pubKey)) {
                        // REMOVED: console.log(`[HominioIndexing] Skipping backlog item ${item.pubKey}, already active.`);
                        continue;
                    }

                    if (item.errorCount >= MAX_BACKLOG_RETRIES) {
                        console.warn(`[HominioIndexing] Max retries (${MAX_BACKLOG_RETRIES}) reached for ${item.pubKey}. Removing from backlog.`); // Keep warn
                        await hominioDB.updateDocIndexingState(item.pubKey, {
                            indexingError: `Max retries reached: ${item.lastError}`,
                            needsReindex: false
                        });
                        await hominioDB.removeFromIndexingBacklog(item.pubKey);
                        continue;
                    }

                    // REMOVED: console.log(`[HominioIndexing] Retrying backlog item: ${item.pubKey} (Attempt ${item.errorCount + 1})`);

                    const result = await this.processDocumentForIndexing(item.pubKey);
                    processedInBatch++;

                    if (result.success) {
                        // REMOVED: console.log(`[HominioIndexing] Successfully processed backlog item ${item.pubKey}. Removing from backlog.`);
                        await hominioDB.removeFromIndexingBacklog(item.pubKey);
                    } else {
                        // REMOVED: console.warn(`[HominioIndexing] Failed to process backlog item ${item.pubKey}. Updating error count.`);
                        const updatedBacklogItem: IndexingBacklogItem = {
                            ...item,
                            errorCount: item.errorCount + 1,
                            lastError: result.message
                        };
                        await hominioDB.addToIndexingBacklog(updatedBacklogItem);
                    }
                } // End for loop

                itemsProcessed += processedInBatch;

                if (processedInBatch === 0) {
                    // REMOVED: console.log("[HominioIndexing] No backlog items processed in this batch (likely active). Breaking loop.");
                    break;
                }

            } // End while loop

        } catch (error) {
            console.error('[HominioIndexing] Error processing backlog queue:', error); // Keep error
        }
        if (itemsProcessed > 0) {
            console.log(`[HominioIndexing] Processed ${itemsProcessed} items from backlog.`); // Keep summary log
        }
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
