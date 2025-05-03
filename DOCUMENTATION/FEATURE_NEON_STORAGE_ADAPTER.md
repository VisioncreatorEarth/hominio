# Feature: Neon Postgres Storage Adapter for Hominio Kernel

This document outlines the plan to make the Hominio Kernel fully isomorphic by adding a server-side storage adapter that uses Neon Postgres, coexisting with the current client-side IndexedDB adapter.

## 1. Status Quo Analysis: Isomorphism & Dependencies

Let's analyze the current kernel modules (`hominio-db.ts`, `hominio-caps.ts`, `hominio-query.ts`, `hominio-auth.ts`, `hominio-storage.ts`) for environment-specific code or dependencies that hinder isomorphic operation.

**`hominio-storage.ts` (Soon `storage-index-db.ts`)**

*   **Environment:** Strictly **Client-Side**.
*   **Dependencies:**
    *   `import { browser } from '$app/environment';`: Explicit check for browser environment.
    *   `import { openDB, type IDBPDatabase } from 'idb';`: IndexedDB library, browser-only.
*   **Conclusion:** This module is inherently browser-based due to IndexedDB. It needs to be renamed and potentially have the `browser` check removed if its usage is confined to client-side initialization logic.

**`hominio-db.ts`**

*   **Environment:** **Mixed (Problematic)**. Aims for core logic but has client-side leakage.
*   **Dependencies:**
    *   `import { browser } from '$app/environment';`: Used in constructor, `_readLocalPeerInfo`, `_triggerNotification`, `updateDocStateAfterSync`, `startBatchOperation`, `endBatchOperation`, `initStorage`. This prevents server-side instantiation and use.
    *   `localStorage.getItem/setItem/removeItem` (via `_readLocalPeerInfo`): Browser-specific storage. This needs abstraction.
    *   `hominio-storage` (IndexedDB Adapter): Hardcoded dependency via `getContentStorage`, `getDocsStorage`, `initStorage`. This is the core issue preventing adapter switching.
    *   `listeners`, `subscribeToDbChanges`, `notifyListeners`: A simple in-memory pub/sub. This is isomorphic *but* stateful. A server instance would have its own listeners, separate from any client instance.
    *   `hominioIndexing.startIndexingCycle()`: Called within `_triggerNotification`. Assumes `hominio-indexing` is available and potentially browser-specific (needs separate analysis).
    *   Svelte Stores (`writable`): Previously removed, good.
*   **Conclusion:** Requires significant refactoring. Needs to:
    *   Remove direct `browser` checks.
    *   Abstract `localStorage` access.
    *   Inject the `StorageAdapter` instead of hardcoding `hominio-storage`.
    *   Make notification/indexing triggering conditional or environment-aware.

**`hominio-caps.ts`**

*   **Environment:** Mostly **Isomorphic**.
*   **Dependencies:**
    *   `hominioDB`: Used in `canCreatePersonConcept` to fetch schema info. This creates an indirect dependency on the storage layer and its client-side limitations via `hominio-db`.
    *   `LoroMap`: Isomorphic CRDT type.
    *   `executeQuery` from `hominio-query`: Assumed isomorphic, but needs verification.
    *   `getIndexLeafPubKey`: Assumed isomorphic, but needs verification.
*   **Conclusion:** The core `can` logic is isomorphic. `canCreatePersonConcept` is problematic due to its dependency on `hominioDB` and the query execution path, which might rely on the client-side DB state. This check might need to become server-only or accept a DB instance.

**`hominio-query.ts`**

*   **Environment:** Mostly **Isomorphic**.
*   **Dependencies:**
    *   `LoroDoc`, `LoroMap`: Isomorphic CRDT types.
    *   Loro-Engine functions (`getLeafDoc`, etc.): Need verification, but likely depend on `hominioDB`'s storage access, making them indirectly environment-dependent.
    *   `hominioDB.getDocument`: Used in `processGetStep` for permission checks. Creates dependency.
    *   `canRead`: Isomorphic capability check.
    *   `getIndexLeafPubKey`: Assumed isomorphic.
*   **Conclusion:** The query *logic* seems isomorphic, but its *execution* relies heavily on fetching documents via Loro-Engine/`hominioDB`, which currently uses the client-side storage adapter. Needs to accept a DB/storage instance or have Loro-Engine made isomorphic.

**`hominio-auth.ts`**

*   **Environment:** **Mixed (Problematic)**.
*   **Dependencies:**
    *   `createAuthClient` from "better-auth/svelte": Svelte-specific client.
    *   `browser`, `localStorage`, `navigator.onLine`: Heavy browser-specific APIs.
    *   `get` from `svelte/store`: Used to read session data.
*   **Conclusion:** This module is heavily tied to the Svelte client and browser APIs. The `getMe` function's logic needs to be separated. Core user ID retrieval might need different implementations for client and server (e.g., reading cookie/header on server vs. Svelte store on client). The concept of a persistent `peer` ID is likely client-specific.

**`hominio-mutate.ts`**

*   **Environment:** Mostly **Isomorphic**. The core mutation logic (applying changes to LoroDocs in memory) is environment-agnostic.
*   **Dependencies:**
    *   `LoroDoc`, `LoroMap`, etc.: Isomorphic CRDT types.
    *   `hominioDB`: **Heavy dependency.** Used for:
        *   Permission checks (`hominioDB.getDocument` within `executeMutation`).
        *   Loading documents (`hominioDB.getLoroDoc`).
        *   Persisting all changes (`hominioDB.deleteDocument`, `hominioDB.updateDocument`, `hominioDB._persistNewDocument`).
        *   Managing batch operations (`hominioDB.startBatchOperation`, `hominioDB.endBatchOperation`).
    *   `canWrite`, `canDelete`, `canCreate`: Isomorphic capability checks.
    *   `docIdService`: Assumed isomorphic (likely generates IDs).
    *   Types (`LeafValue`, etc.): Isomorphic.
*   **Conclusion:** The mutation logic itself is sound for isomorphic use. However, its execution is **tightly coupled to `hominioDB`**. It doesn't contain direct browser/server checks, but inherits the environment limitations from `hominioDB`. Once `hominioDB` is refactored to be truly isomorphic (accepting storage/auth adapters), `hominio-mutate.ts` should function correctly in both environments without significant changes, as it operates through the `hominioDB` abstraction.

**Overall Summary:**

The kernel is **not currently isomorphic**. Major dependencies on browser APIs (`browser`, `localStorage`, `navigator`, IndexedDB) and Svelte (`createAuthClient`, `get`) exist, primarily within `hominio-storage.ts`, `hominio-db.ts`, and `hominio-auth.ts`. `hominio-query.ts`, `hominio-caps.ts`, and **`hominio-mutate.ts`** are indirectly affected through their use of `hominio-db`.

## 2. Desired Architecture

The goal is an isomorphic Hominio Kernel that can run seamlessly on both the SvelteKit client and the Elysia server, using the appropriate storage backend.

```mermaid
graph TD
    subgraph Client (Browser)
        AppCodeClient[SvelteKit App Code] --> HominioKernelClient[Hominio Kernel (Client Instance)]
        HominioKernelClient -- Uses --> StorageIndexDB[storage-index-db.ts (IndexedDBAdapter)]
        HominioKernelClient -- Uses --> AuthClient[hominio-auth.ts (Client Logic)]
        StorageIndexDB -- Stores/Retrieves --> IndexedDB[(IndexedDB)]
        AuthClient -- Uses --> BetterAuthSvelte[BetterAuth Svelte Client]
        AuthClient -- Uses --> LocalStorage[(LocalStorage)]
    end

    subgraph Server (Node/Bun)
        AppCodeServer[Elysia API Code] --> HominioKernelServer[Hominio Kernel (Server Instance)]
        HominioKernelServer -- Uses --> StoragePgNeon[storage-pg-neon.ts (StorageAdapter)]
        HominioKernelServer -- Uses --> AuthServer[hominio-auth.ts (Server Logic)]
        StoragePgNeon -- Stores/Retrieves --> NeonDB[(Neon Postgres)]
        AuthServer -- Reads --> RequestContext[Request Context (Cookies/Headers)]
    end

    subgraph SharedKernelCore [Isomorphic Hominio Kernel Core]
        HominioDB[hominio-db.ts] -- Injects --> StorageAdapterInterface{StorageAdapter Interface}
        HominioQuery[hominio-query.ts] -- Uses --> HominioDB
        HominioCaps[hominio-caps.ts] -- Uses --> HominioDB & HominioQuery
        AuthInterface[hominio-auth.ts (Interface + Core Logic)]

        HominioKernelClient -- Instantiates/Uses --> HominioDB
        HominioKernelServer -- Instantiates/Uses --> HominioDB
        HominioKernelClient -- Instantiates/Uses --> HominioQuery
        HominioKernelServer -- Instantiates/Uses --> HominioQuery
        HominioKernelClient -- Instantiates/Uses --> HominioCaps
        HominioKernelServer -- Instantiates/Uses --> HominioCaps
        HominioKernelClient -- Instantiates/Uses --> AuthInterface
        HominioKernelServer -- Instantiates/Uses --> AuthInterface

        StorageIndexDB -- Implements --> StorageAdapterInterface
        StoragePgNeon -- Implements --> StorageAdapterInterface
    end

    HominioDB -.-> |Needs| AuthInterface
    HominioCaps -.-> |Needs| AuthInterface
    HominioQuery -.-> |Needs| AuthInterface

```

**Key Components:**

1.  **`StorageAdapter` Interface:** Defined in a shared location (e.g., `storage.types.ts`), specifying the contract for `get`, `put`, `delete`, `getAll`, `batchExists`, etc.
2.  **`storage-index-db.ts`:** The refactored current `hominio-storage.ts`, implementing `StorageAdapter` using IndexedDB. Used only on the client.
3.  **`storage-pg-neon.ts`:** A *new* module implementing `StorageAdapter` using Neon Postgres (likely via a Node Postgres client like `pg` or `node-postgres`). Used only on the server.
4.  **`hominio-db.ts` (Refactored):**
    *   Accepts an instance of `StorageAdapter` during initialization (Dependency Injection).
    *   Removes all direct `browser`, `localStorage`, Svelte store dependencies.
    *   Environment-specific actions (like triggering client-side notifications or indexing) are handled conditionally or moved out.
5.  **`hominio-auth.ts` (Refactored):**
    *   Splits into:
        *   **Core Logic:** Isomorphic functions if any.
        *   **Client Logic:** Uses Svelte stores, `localStorage`, `navigator`, BetterAuth Svelte Client. Provides a `getMe(): CapabilityUser | null` for the client.
        *   **Server Logic:** Reads user ID from request context (cookies, headers). Provides a `getMe(request: Request): CapabilityUser | null` (or similar) for the server.
    *   Kernel modules (`hominio-db`, `hominio-caps`, `hominio-query`) depend on the *concept* of getting the current user (`CapabilityUser | null`), which is provided by the environment-specific auth logic.
6.  **Initialization Logic:**
    *   **Client-side (e.g., `+layout.ts`):** Initializes `hominio-db` with `storage-index-db.ts`.
    *   **Server-side (e.g., Elysia setup):** Initializes `hominio-db` with `storage-pg-neon.ts`.

## 3. Execution Plan

-   [ ] **Phase 1: Refactor Existing Code for Isomorphism & Abstraction**
    -   [ ] **1.1: Define Storage Interface:** Create `src/lib/KERNEL/storage.types.ts` defining `StorageAdapter` and `StorageItem`.
    -   [ ] **1.2: Rename & Refactor IndexedDB Adapter:**
        -   [ ] Rename `src/lib/KERNEL/hominio-storage.ts` to `src/lib/KERNEL/storage-index-db.ts`.
        -   [ ] Update `storage-index-db.ts` to explicitly implement `StorageAdapter` from `storage.types.ts`.
        -   [ ] Remove `browser` checks *within* the adapter if possible, assuming it's only *initialized* in the browser context. Keep `init()` guarding against non-browser use.
        -   [ ] Update internal references (e.g., in `hominio-db.ts` temporarily) to the new filename.
    -   [ ] **1.3: Refactor `hominio-db.ts`:**
        -   [ ] Modify the constructor or add an `initialize` method to accept instances of `StorageAdapter` for content and docs stores.
        -   [ ] Replace `getContentStorage()` and `getDocsStorage()` calls with the injected adapter instances.
        -   [ ] Remove `import { browser } ...`.
        -   [ ] Remove `_readLocalPeerInfo` and direct `localStorage` usage. Client-specific peer info logic moves to client-side auth.
        -   [ ] Make `_triggerNotification` conditional based on environment or move the notification logic out to be called externally only on the client. Remove the direct call to `hominioIndexing` (indexing should be triggered differently, possibly via the storage adapter event or externally).
        -   [ ] Adapt methods like `updateDocStateAfterSync` to not rely on `browser`. State updates might need context.
    -   [ ] **1.4: Refactor `hominio-auth.ts`:**
        -   [ ] Define a minimal `AuthService` interface (e.g., `{ getMe(context?: unknown): CapabilityUser | null }`).
        -   [ ] Separate current logic into client-specific implementation (`client-auth.ts`?).
        -   [ ] Modify `hominio-db.ts`, `hominio-caps.ts`, `hominio-query.ts` to accept or access an instance of `AuthService` instead of directly calling `getMe`.
        -   [ ] Create a placeholder server-side auth implementation (`server-auth.ts`?).
    -   [ ] **1.5: Update Consumers:** Adjust `hominio-query.ts` and `hominio-caps.ts` to work with the refactored `hominio-db` (potentially accepting DB instance or auth service).

-   [ ] **Phase 2: Implement Neon Postgres Storage Adapter**
    -   [ ] **2.1: Install Dependencies:** Add necessary Postgres client library (e.g., `pg`) to server dependencies.
    -   [ ] **2.2: Define Database Schema:** Design Postgres tables (e.g., `hominio_content`, `hominio_docs`) to store `key`, `value` (as `BYTEA`), `metadata` (as `JSONB`), `createdAt`. Consider necessary indexes (on `key`, potentially GIN index on `metadata`).
    -   [ ] **2.3: Create `storage-pg-neon.ts`:**
        -   [ ] Implement the `StorageAdapter` interface from `storage.types.ts`.
        -   [ ] Use the chosen Postgres client library to connect to Neon DB (connection details likely via environment variables).
        -   [ ] Implement `get`, `put`, `delete`, `getAll`, `getMetadata`, `query`, `batchExists`, `batchPut` using SQL queries against the defined schema. Ensure proper handling of binary data (`BYTEA`).
    -   [ ] **2.4: Implement Server Auth:** Flesh out the server-side `AuthService` implementation (e.g., in `server-auth.ts`) to read user info from Elysia request context (cookies/headers).

-   [ ] **Phase 3: Integration & Testing**
    -   [ ] **3.1: Client-Side Integration:** In SvelteKit (e.g., root `+layout.ts`), instantiate `storage-index-db.ts`, the client-side auth service, and inject them into a singleton instance of `hominio-db` made available to the app (e.g., via context or a store).
    -   [ ] **3.2: Server-Side Integration:** In Elysia setup, instantiate `storage-pg-neon.ts`, the server-side auth service, and inject them into `hominio-db` instances used within API routes (potentially using Elysia's context or dependency injection).
    -   [ ] **3.3: Test Client:** Verify client-side operations continue to work using IndexedDB.
    -   [ ] **3.4: Test Server:** Create API endpoints that use the Hominio Kernel (query, create, update via `hominio-db`) and verify they interact correctly with the Neon Postgres database.
    -   [ ] **3.5: Test Isomorphism:** Ensure core kernel logic used in both environments produces consistent results given the same inputs (where applicable). Test capability checks (`hominio-caps`) on both client and server.

-   [ ] **Phase 4: Documentation & Cleanup**
    -   [ ] **4.1: Update README:** Document the new isomorphic architecture, the two storage adapters, and how to configure the server-side adapter (env vars).
    -   [ ] **4.2: Code Comments:** Ensure refactored code and new modules are adequately commented.
    -   [ ] **4.3: Refine Types:** Tighten up types (`storage.types.ts`, `auth.types.ts`?) as needed. 