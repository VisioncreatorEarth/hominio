

## Core Concepts

1.  **Client-Side Responsibility:** Each client application instance is responsible for building and maintaining its own local indices based on the documents it has access to.
2.  **Indexing State Metadata:** Document metadata (`Docs` interface in `hominio-db.ts`) will be extended to track the indexing status *of that specific document* locally.
3.  **Dedicated Indexing Service:** A new `src/lib/KERNEL/hominio-indexing.ts` service will orchestrate the indexing process.
4.  **Reactive Updates:** The system leverages the `docChangeNotifier` from `hominio-db.ts` to trigger indexing cycles when relevant data changes (including during initial sync).
5.  **Shared Index Documents:** Dedicated Loro documents (e.g., `@facki_bridi_by_component`, `@facki_sumti`), will continue to store the actual index data. These index documents *are* synced between peers like any other LoroDoc, sharing the *results* of indexing.

## Proposed `Docs` Metadata Extension

```typescript
// In hominio-db.ts (Conceptual - this state lives in the local DB registry, NOT inside the LoroDoc)
export interface Docs {
    // --- Existing Fields ---
    pubKey: string;
    owner: string;
    updatedAt: string;
    snapshotCid?: string;
    updateCids?: string[];
    localState?: { /* ...sync state... */ };

    // --- NEW LOCAL Indexing State ---
    // This state is specific to the local client's indexing progress for this document.
    // It is stored in the local database registry alongside other metadata,
    // NOT within the synced LoroDoc content itself.
    indexingState?: {
        // Tracks the state of THIS document regarding its contribution TO *local* indices
        lastIndexedSnapshotCid?: string; // Base snapshot processed by local indexer
        lastIndexedUpdateCidsHash?: string; // Hash of sorted updateCids processed by local indexer
        needsReindex?: boolean; // Manual flag for forced re-indexing locally
        lastIndexedTimestamp?: string; // Timestamp of last local processing
        indexingError?: string; // Record last local indexing error for this doc
    }
}
```

## `hominio-indexing.ts` Service Flow

**Trigger:** The service listens to the `docChangeNotifier` exported by `hominio-db.ts`. This notifier fires when document metadata or content linkage is potentially updated locally.

```mermaid
flowchart TD
    A[Data Change Occurs (Mutation/Sync)] --> B(hominioDB updates Doc Metadata/Content);
    B --> C(hominioDB triggers docChangeNotifier);
    C --> D{hominio-indexing.ts Service Listener};
    D -- Debounced Trigger --> E[Indexing Cycle Starts];
    E --> F[Fetch All Relevant Docs Metadata via hominioDB];
    F --> G{Identify Docs Needing Local Indexing};
    G -- For Each Doc --> H[Process Doc for Local Indexing];
    H -- Success --> M[Update Source Doc Local indexingState];
    H -- Failure --> P[Log Error & Add to Backlog Queue];
    M --> G; // Process next doc
    P --> G; // Process next doc
    G -- No More Docs --> Q[Process Backlog Queue? (Optional within cycle)];
    Q --> N[Indexing Cycle Ends];
    N --> D; // Wait for next trigger

    subgraph Process Doc (H)
        H1[Load Source Doc Content via hominioDB];
        H2[Extract Indexable Data];
        H3[Load Target Index LoroDoc via hominioDB];
        H4[Update Target Index LoroDoc Map/List];
        H5[Persist Index Doc Changes via hominioDB];
        H1 --> H2 --> H3 --> H4 --> H5;
    end

    subgraph hominioDB Interaction
        F; H1; H3; H5; M;
    end

    subgraph Indexing Service Logic
        D; E; G; H; I[Backlog Queue Mgmt]; P; Q; N;
    end
```

**Flow Description:**

1.  **Data Change:** A document is created, updated, or synced.
2.  **DB Update:** `hominio-db.ts` handles the local storage update.
3.  **Notification:** `hominio-db.ts` triggers `docChangeNotifier`.
4.  **Listener:** `hominio-indexing.ts` receives the notification.
5.  **Indexing Trigger:** After a debounce period, the service starts a local indexing cycle.
6.  **Identify Work:** Fetches relevant `Docs` metadata from the **local DB registry**. Compares the current `snapshotCid`/`updateCids` of source documents against the **locally stored** `indexingState` to find documents needing processing for the *local* indices.
7.  **Process Document:** Attempts to perform the indexing steps. All interactions with the shared index documents (loading via `hominioDB.getLoroDoc`, updating maps/lists) use the stable, shared Facki pubkeys (e.g., `@facki_bridi_by_component`). Updates made here will sync to other peers via Loro.
8.  **Success:** Updates the source document's **local** `indexingState` in the DB registry (tracking the *local* indexer's progress) via `hominioDB`.
9.  **Failure:** Logs the error, updates the source document's **local** `indexingState.indexingError`, and adds the `pubKey` to the persistent **local** Backlog Queue.
10. **Continue Cycle:** Proceeds to the next document identified in step 6.
11. **Process Backlog (Optional):** At the end of a cycle (or periodically), attempts to process items from the Backlog Queue.
12. **Cycle End:** Waits for the next trigger.

## Resilience: Backlog Queue

To handle transient errors (e.g., network issues loading content, temporary processing failures), a persistent backlog queue will be maintained by the indexing service.

*   **Storage:** The queue can be stored using a dedicated key in the `@veramo/kv-store` (managed via `hominio-storage` / `hominio-db`).
*   **Adding Items:** When processing a document for indexing fails, its `pubKey` (potentially with a timestamp and retry count) is added to the queue.
*   **Processing Items:** The indexing service should attempt to process items from the queue periodically:
    *   On application startup.
    *   Potentially at the end of each regular indexing cycle.
    *   On a separate timer (e.g., every few minutes).
*   **Removing Items:** When an item from the backlog queue is processed *successfully*, it is removed from the queue.
*   **Error Handling:** Repeated failures for an item in the backlog should be handled (e.g., maximum retry count, flagging the document permanently).

## Open Questions & Considerations

*   **Initial Indexing Strategy:** How does the system build the index the very first time the user opens the app or after clearing local data? (Will be triggered by initial sync via `docChangeNotifier`, runs asynchronously in the background). How to handle queries before initial indexing is complete?
*   **Debouncing/Throttling:** Needs careful tuning.
*   **Error Handling:** Backlog queue helps, but need max retry logic / permanent failure handling.
*   **Schema Changes:** May require setting a `needsReindex` flag on all relevant documents in the local DB registry.
*   **Index Document Size:** Monitor size; potential need for more granular indices or different storage later.
*   **Deletion Handling:** `hominio-db.ts`'s `deleteDocument` should likely trigger `docChangeNotifier`. The indexing service needs to detect this and remove the deleted document's contributions from the relevant index documents.
*   **Ignoring Index Doc Notifications:** The indexing service needs to be careful not to react to changes *it* makes to the index documents (`@facki_...`) to avoid loops.

## Execution Plan

1.  **Modify `hominio-db.ts` (`src/lib/KERNEL/hominio-db.ts`):**
    *   Add the `indexingState` field (as optional) to the `Docs` interface definition.
    *   Modify `saveSyncedDocument` and potentially other relevant functions (`createDocument`, `updateDocStateAfterSync`?) to initialize `indexingState` (e.g., setting `needsReindex: true` or leaving it undefined initially) when new documents or significant changes are saved.
    *   Add a new method like `updateDocIndexingState(pubKey: string, state: Partial<Docs['indexingState']>)` to allow the indexing service to update only the `indexingState` portion of the local metadata.
    *   Ensure `deleteDocument` triggers `docChangeNotifier` (it likely already does). Consider adding the deleted `pubKey` to the notifier payload if possible, otherwise the indexer needs to detect deletions by comparing metadata lists.
    *   Add helper functions for managing the persistent backlog queue using the underlying KV store (e.g., `addToIndexingBacklog`, `getNextFromIndexingBacklog`, `removeFromIndexingBacklog`).

2.  **Create `hominio-indexing.ts` (`src/lib/KERNEL/hominio-indexing.ts`):**
    *   Implement the core indexing service class/singleton.
    *   Import necessary types and functions from `hominio-db.ts`, `loro-crdt`. Define index pubkeys (e.g., `FACKI_BRIDI_BY_COMPONENT_PUBKEY`).
    *   **Initialization:** Constructor subscribes to `docChangeNotifier` (debounced).
    *   **`startIndexingCycle()`:** (Called by debounced listener)
        *   Fetches all `Docs` metadata using `hominioDB.loadAllDocsReturn()`.
        *   Identifies documents needing indexing based on `snapshotCid`, `updateCids`, `needsReindex`, and `indexingState` comparison (requires hashing updateCids list).
        *   Calls `processDocumentForIndexing()` for each identified doc.
        *   Optionally calls `processBacklogQueue()`.
    *   **`processDocumentForIndexing(pubKey: string)`:**
        *   Loads the source LoroDoc using `hominioDB.getLoroDoc()`. Handles errors.
        *   Determines document type (Sumti, Selbri, Bridi) based on `ckaji.klesi`.
        *   Extracts relevant data (e.g., selbri/sumti from Bridi).
        *   Determines which index(es) need updating.
        *   **Loads Target Index Doc(s):** Loads the correct `@facki_...` LoroDoc(s) using `hominioDB.getLoroDoc()`. Handles errors.
        *   **Updates Target Index Doc(s):** Modifies the LoroMap/LoroList within the index doc(s). Handles errors.
        *   **(Implicit Persist):** Relies on `hominioDB`'s internal Loro subscriptions or explicit calls (`persistLoroUpdate`) to save index doc changes.
        *   **Updates Local State:** On success, calls `hominioDB.updateDocIndexingState()` to update the source doc's *local* state.
        *   **Error Handling:** On failure, calls `hominioDB.updateDocIndexingState()` to set error and `hominioDB.addToIndexingBacklog()`.
    *   **`processBacklogQueue()`:**
        *   Fetches items from the backlog via `hominioDB`.
        *   Attempts `processDocumentForIndexing()` for each.
        *   Removes successfully processed items via `hominioDB.removeFromIndexingBacklog()`.
        *   Handles retry limits/permanent failures.
    *   **Deletion Handling Logic:** Needs logic (triggered by notifier or metadata diff) to load relevant index docs and *remove* contributions from deleted source documents.
    *   **Utility Functions:** Hash function for `updateCids`, logic to parse different document types.

3.  **Integrate into Application (e.g., `+layout.svelte` or main init):**
    *   Ensure the `HominioIndexing` service is initialized *after* `HominioDB` is ready.
    *   Potentially trigger an initial backlog check on startup.

4.  **Refactor `seed.ts` (`src/db/seed.ts`):**
    *   **Remove** all index population logic (`populateSumtiIndex`, `populateSelbriIndex`, `populateBridiIndexSimple`, `updateBridiIndexInMemory`, Bridi Component Index loop).
    *   **Keep** document creation logic (seeding Sumti, Selbri, Bridi, Facki) but ensure it only creates the *initial* LoroDoc snapshots and the `Docs` metadata entries (without `indexingState` or with it set to trigger initial indexing).
    *   The Facki documents (`@facki_...`) should still be created with *empty* initial `datni` maps/lists, ready to be populated by the client-side indexer.

5.  **Update Query Logic (`src/lib/NEXT/query.ts`, `src/lib/NEXT/loro-engine.ts`):**
    *   No major changes expected here initially, as it should still query the same `@facki_...` documents via `hominioDB`. Queries will just start reflecting dynamically indexed data.
    *   Remove any lingering debug/verification code added previously.

6.  **Testing:**
    *   Thoroughly test initial sync and indexing.
    *   Test updates and deletions, ensuring indices reflect changes.
    *   Test offline scenarios.
    *   Test error handling and the backlog queue.

This plan shifts the complexity from seeding to a reactive client-side service, aiming for more dynamic and robust indexing. The core index document structures and pubkeys remain the same and are shared/synced.
