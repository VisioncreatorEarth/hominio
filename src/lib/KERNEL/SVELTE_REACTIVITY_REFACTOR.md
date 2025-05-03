# Svelte Reactivity Refactoring Plan

This document outlines the plan to refactor Svelte-specific reactivity out of core Hominio Kernel modules (`hominio-db.ts`, `hominio-query.ts`) to improve their reusability in non-Svelte environments (isomorphism), while maintaining `hominio-db` as the central change notification coordinator using a framework-agnostic approach.

## 1. Problem Statement & Status Quo

Currently, the Hominio Kernel modules mix core data persistence/query logic with frontend reactivity management and notification mechanisms, primarily using Svelte stores and direct calls between modules. This tight coupling prevents easy reuse of the DB and query logic on the server-side and makes the dependency graph complex.

**Affected Files & Issues:**

*   **`src/lib/KERNEL/hominio-db.ts`:**
    *   Defines and exports `docChangeNotifier`, a Svelte `writable` store.
    *   Calls `docChangeNotifier.update()` within its internal `_triggerNotification` method.
    *   `_triggerNotification` also directly calls `hominioIndexing.startIndexingCycle()`.
    *   Imports `writable` from `svelte/store` and `hominioIndexing`.

*   **`src/lib/KERNEL/hominio-query.ts`:**
    *   Defines and exports `processReactiveQuery`, a function specifically designed for Svelte reactivity.
    *   `processReactiveQuery` relies on Svelte stores (`readable`, `writable`, `get`) and potentially `browser` environment.
    *   Imports `readable`, `writable`, `get` from `svelte/store` and `docChangeNotifier` from `hominio-db.ts`.

*   **`src/lib/KERNEL/hominio-sync.ts`:**
    *   Imports and subscribes to `docChangeNotifier` from `hominio-db.ts` to trigger syncs.

*   **Consuming Components (e.g., `src/lib/components/Todos.svelte`):**
    *   Import reactive functions (`processReactiveQuery`) from `hominio-query.ts`.
    *   Import mutation functions (`executeMutation`) from `hominio-mutate.ts`.
    *   Pass user state (e.g., from `getMe` or context) to query/mutation functions.

This architecture makes `hominio-db`, `hominio-query`, and `hominio-sync` dependent on Svelte or specific cross-module triggers.

## 2. Desired Future Architecture

The goal is to isolate Svelte-specific concerns into a dedicated module, `src/lib/KERNEL/hominio-svelte.ts` (acting as a facade), while making core modules isomorphic and establishing `hominio-db` as the central, framework-agnostic notification hub.

*   **`hominio-db.ts`:**
    *   Pure data persistence logic.
    *   **No** Svelte imports.
    *   Implements an internal, framework-agnostic **Pub/Sub** mechanism.
    *   Exports `subscribeToDbChanges(callbackFunction)`.
    *   Internal `_triggerNotification` method calls `hominioIndexing.startIndexingCycle()` **and** notifies internal subscribers via the Pub/Sub mechanism.

*   **`hominio-query.ts`, `hominio-mutate.ts`:**
    *   Pure query execution and mutation logic modules.
    *   **No** Svelte imports.
    *   Core functions (`executeQuery`, `executeMutation`) accept `user` object directly.

*   **`hominio-svelte.ts` (New File - Svelte Facade):**
    *   The single interaction point for Svelte components.
    *   Imports core functions (`executeQuery`, `executeMutation`, etc.) and `subscribeToDbChanges` from `hominio-db`.
    *   Imports Svelte tools (`writable`, `readable`, `get`, `browser`) and Auth tools (`authClient`/`getMe`).
    *   Defines an **internal (not exported)** Svelte `writable` store (`svelteNotifier`).
    *   Calls `subscribeToDbChanges` on initialization to link the generic DB notification to the internal `svelteNotifier`.
    *   Manages the current user session state internally.
    *   **Exports** `processReactiveQuery`: Handles Svelte query reactivity, subscribes to internal `svelteNotifier`, gets user state internally, calls core `executeQuery`.
    *   **Exports** facade functions (e.g., `executeMutation`): Get user state internally, call core `executeMutation`. *(Note: Facade no longer needs to trigger notifier, as `hominio-db` handles it)*.

*   **`hominio-indexing.ts`:**
    *   Triggered directly by `hominio-db._triggerNotification`.

*   **`hominio-sync.ts`:**
    *   Imports `subscribeToDbChanges` from `hominio-db.ts`.
    *   Calls `subscribeToDbChanges` to trigger its sync logic (potentially debounced).

*   **Consuming Svelte Components:**
    *   Import reactive functions (`processReactiveQuery`) and facade functions (`executeMutation`) **only** from `hominio-svelte.ts`.
    *   **Do not** need to pass the user object explicitly to facade functions.

This separation allows core modules to be isomorphic, clarifies dependencies (`db` notifies `sync` and `svelte`, `svelte` notifies its reactive queries), and provides a simplified interface for the Svelte frontend.

## 3. Execution Plan

The following tasks need to be completed to achieve the desired architecture:

*   [ ] **1. Create `hominio-svelte.ts`:** Create the initial `src/lib/KERNEL/hominio-svelte.ts` file.
*   [ ] **2. Implement Pub/Sub in `hominio-db.ts`:**
    *   [ ] Remove `docChangeNotifier` definition/export and `writable` import.
    *   [ ] Add an internal `listeners: Array<() => void> = []` array.
    *   [ ] Add an exported `subscribeToDbChanges(callback: () => void): () => void` function (returns an unsubscribe function).
    *   [ ] Add an internal `notifyListeners()` function that iterates and calls listeners.
    *   [ ] Modify `_triggerNotification` to call `hominioIndexing.startIndexingCycle()` and then `notifyListeners()`. Remove the direct `docChangeNotifier.update()` call.
*   [ ] **3. Setup `hominio-svelte.ts`:**
    *   [ ] Import `writable` from `svelte/store`, `subscribeToDbChanges` from `hominio-db`, Auth tools, `executeQuery` from `hominio-query`, `executeMutation` from `hominio-mutate`.
    *   [ ] Define the internal `svelteNotifier = writable(0)`.
    *   [ ] Call `subscribeToDbChanges(() => svelteNotifier.update(n => n + 1))`.
    *   [ ] Set up internal logic to manage user session state.
*   [ ] **4. Move `processReactiveQuery` to `hominio-svelte.ts`:**
    *   [ ] Move the function from `hominio-query.ts` to `hominio-svelte.ts`.
    *   [ ] Export it.
    *   [ ] Update its internal logic:
        *   Subscribe to the internal `svelteNotifier`.
        *   Use the internally managed user state to pass to the imported `executeQuery`.
        *   Keep necessary Svelte imports (`readable`, `get`, `browser`).
    *   [ ] Remove `readable`, `writable`, `get`, `browser`, `docChangeNotifier` imports from `hominio-query.ts`.
*   [ ] **5. Implement Facade Functions in `hominio-svelte.ts`:**
    *   [ ] Create exported `async` facade functions (e.g., `executeMutation`) that accept the request.
    *   [ ] These functions internally get the current user state.
    *   [ ] They `await` the corresponding imported core function (e.g., `coreExecuteMutation(request, user)`).
    *   [ ] They return the result from the core function. *(No need to trigger notifier here)*.
*   [ ] **6. Update `hominio-sync.ts` Subscription:**
    *   [ ] Remove the import of `docChangeNotifier`.
    *   [ ] Import `subscribeToDbChanges` from `hominio-db.ts`.
    *   [ ] Replace the `docChangeNotifier.subscribe(...)` call with `subscribeToDbChanges(...)` containing the appropriate sync trigger logic.
*   [ ] **7. Update Svelte Consumers:**
    *   [ ] Change imports of `processReactiveQuery` from `hominio-query.ts` to `hominio-svelte.ts`.
    *   [ ] Change imports of `executeMutation` from `hominio-mutate.ts` to the *facade* version from `hominio-svelte.ts`.
    *   [ ] Remove code in components that manually gets/passes the user object to facade functions.
    *   [ ] Remove any stray direct imports of `docChangeNotifier`.
*   [ ] **8. Testing:** Thoroughly test reactivity, mutations, sync, and indexing. 