# Full-Stack Reactivity Plan (REACTIVITY.md)

## 1. Goal

Achieve seamless, end-to-end reactivity for Hominio data. Changes made to any Loro document (local edits, sync updates) should automatically propagate through the system (`hominio-db.ts`, `hominio-ql.ts` results) and reflect in the Svelte UI (`docs/+page.svelte`, `hominio-ql/+page.svelte`) without requiring manual data refetching triggers in the UI components.

## 2. Core Principle

Utilize Loro CRDT's built-in change subscription mechanism (`LoroDoc.subscribe`) as the **single source of truth** for detecting data changes and triggering updates throughout the stack.

## 3. Refactor `hominio-db.ts` (Foundation)

This layer needs to bridge Loro's reactivity with Svelte's reactivity.

-   **Centralize Loro Instances:**
    -   Reinforce `hominio-db.ts` as the exclusive manager of active `LoroDoc` instances via the `activeLoroDocuments` map.
    -   Ensure `getOrCreateLoroDoc` (or a renamed equivalent like `getActiveLoroDoc`) is the sole entry point for accessing managed `LoroDoc` instances.
-   **Subscribe to Loro Changes:**
    -   In `getOrCreateLoroDoc`, immediately after creating or loading a `LoroDoc` instance, subscribe to its root changes:
        ```typescript
        loroDoc.subscribe((event) => {
            // Ignore local events triggered by this client's own changes if possible
            // Loro's event object might provide info about the origin (local vs remote)
            // if (event.local) return; 

            console.log(`[Loro Event] Detected change in doc: ${pubKey}`);
            this._handleLoroChange(pubKey, loroDoc); 
        });
        ```
-   **Handle Loro Change Events (`_handleLoroChange`):**
    -   Create a new private method `_handleLoroChange(pubKey, changedLoroDoc)`.
    -   **Update Svelte Stores:** Inside this handler, update the relevant Svelte stores based on the *current state* of `changedLoroDoc`:
        -   Update the specific document's entry in the `docs` store (potentially just its `updatedAt` timestamp if full metadata isn't easily derived from the event).
        -   If the changed document is the `selectedDoc`, update the `selectedDoc` store.
        -   If the changed document is the `selectedDoc`, regenerate its content view by calling `loadDocumentContent(docMetadata)` (which reads from the *updated* LoroDoc instance).
    -   **Trigger Persistence (Decoupled):** The Loro event signifies a state change that *may* need persisting (especially if it originated locally). Queue or trigger a separate, asynchronous task to export the *latest update* (`loroDoc.export({ mode: 'update' })`) and persist it via `hominio-storage` and update the `Docs` metadata (appending the update CID). *Crucially, UI reactivity should not wait for persistence.*
    -   **Notify HQL Layer:** Emit a generic "document changed" event or update a simple store that the HQL UI can listen to (see Step 4).
-   **Modify Update Methods:**
    -   Refactor methods like `updateDocument`, `addRandomPropertyToDocument`, `createDocument`, `createEntity`, `updateEntityPlaces`.
    -   These methods should *only* perform the necessary modifications on the target `LoroDoc` instance obtained via `getOrCreateLoroDoc`.
    -   Remove all *manual* calls to Svelte store updates (`docs.set`, `selectedDoc.set`, `docContent.set`) and direct persistence logic from these methods. The Loro subscription handler (`_handleLoroChange`) will now manage this automatically.

## 4. Refactor `hominio-ql.ts` & UI (Reactive Query Service)

Refactor `hominio-ql.ts` to provide a reactive query interface, hiding the underlying change detection mechanism from the UI.

-   **Reactive Query Function:**
    -   Introduce a new method in `hominioQLService`, potentially named `processReactive(request, user)`. (Alternatively, the existing `process` could be adapted, but a new method might be clearer).
    -   This function will accept the HQL query request and user details.
    -   It will **return a Svelte readable store** (or a similar reactive primitive) that emits the query results.
-   **Internal Implementation (`processReactive`):**
    -   Performs the initial query execution (similar to the current `_handleQuery`).
    -   Creates an internal Svelte **writable** store initialized with the first result set.
    -   Subscribes to the `hominioDB.docChangeNotifier` (which needs to be exposed by `hominio-db.ts`, see updated Step 3).
    -   When `docChangeNotifier` updates, it **re-runs the original query** using the stored request parameters.
    -   It then **updates the internal writable store** with the fresh results. This automatically notifies any UI components subscribed to the *readable* store returned initially.
    -   Implement cleanup logic: When the UI unsubscribes from the returned readable store, `hominio-ql.ts` must unsubscribe from the `docChangeNotifier` to prevent memory leaks.
-   **`hominio-db.ts` Notifier:**
    -   Ensure `hominio-db.ts` (from Step 3) exports the `docChangeNotifier` store (`writable(0)` or similar) so `hominio-ql.ts` can subscribe to it.

## 5. Refactor Svelte UI Components (Simplified)

UI components become direct consumers of the reactive data streams provided by `hominio-ql.ts`.

-   **`docs/+page.svelte`:** Still primarily relies on `hominioDB` stores, which are reactive due to Step 3. Should require minimal changes.
-   **`hominio-ql/+page.svelte`:**
    -   **Remove manual refresh logic:** Eliminate `$effect` hooks or other mechanisms previously planned to manually re-run queries on change.
    -   **Call reactive HQL function:** Instead of calling `hominioQLService.process()`, call the new `hominioQLService.processReactive()` (or the adapted `process`) to get *readable stores* for schemas and entities.
    -   **Subscribe reactively:** Use Svelte's auto-subscription (`$:` prefix) or `$derived` runes to bind UI elements directly to the data emitted by the reactive stores returned from `hominio-ql.ts`.
    -   The component's role simplifies significantly: request the reactive data stream, display the data it provides. No need to manage *when* to refresh.

## 6. `hominio-storage.ts`

-   No fundamental changes required for reactivity. It remains the passive persistence layer. Ensure methods are robust.

## 7. Testing

-   Test local edits reflecting immediately in `docs` and `hominio-ql` pages.
-   Test document creation/deletion updating lists automatically.
-   Simulate remote changes (e.g., via sync logic if implemented) and verify UI updates.
-   Verify HQL results refresh correctly after underlying data changes.
-   Check for performance issues with many documents or frequent changes. 