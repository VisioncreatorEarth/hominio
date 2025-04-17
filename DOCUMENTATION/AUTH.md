# Hominio Authentication and Authorization Flows

This document outlines the current state of user authentication and authorization (capability checks) within the Hominio application.

## 1. Authentication (Login/Session Management)

-   **Provider:** BetterAuth (`$lib/auth/auth.ts`, `getAuthClient()`).
-   **Mechanism:** Handles user login, logout, and session management, typically using secure cookies/headers.
-   **Server-Side:**
    -   The `auth.api.getSession({ headers })` method is used in server-load functions (`+layout.server.ts`) and API middleware (`+server.ts`) to validate the session associated with an incoming request.
-   **Client-Side:**
    -   The `authClient.useSession()` Svelte store (`$lib/KERNEL/hominio-auth.ts`) provides reactive access to the current user session state within Svelte components (`+layout.svelte`, etc.).
    -   `authClient.signOut()` is used for client-initiated logout (`me/+page.svelte`).

## 2. Server-Side API Authorization

-   **Middleware:** Most API groups (`/api/call`, `/api/me`, `/api/docs`, `/api/content`) defined in `src/routes/api/[...slugs]/+server.ts` are protected by the `requireAuth` middleware.
-   **Middleware Logic:**
    1.  Calls `auth.api.getSession({ headers: request.headers })`.
    2.  If the session is invalid or validation fails, it returns a `401 Unauthorized` (or `503 Service Unavailable` for auth service issues).
    3.  If the session is valid, it extracts the `session` object (containing `session.user`) and passes it down to the specific route handler via Elysia's context derivation.
-   **Route Handler Logic (e.g., `src/lib/server/routes/docs.ts`):**
    1.  Receives the validated `session` object from the `requireAuth` middleware.
    2.  Performs specific actions (e.g., fetching a document from the database).
    3.  Calls capability functions (`canRead`, `canWrite`, `canDelete` from `$lib/KERNEL/hominio-caps.ts`).
    4.  **Crucially**, it passes the `session.user` object as the *first* argument and the relevant `document` object as the *second* argument to these capability functions, matching the current signature in `hominio-caps.ts`.
    5.  Returns `403 Forbidden` if the capability check fails.

## 3. Client-Side Capability Checks

Capability checks also occur in client-side Kernel modules before certain operations:

-   **`hominio-sync.ts` (`pushToServer`):**
    -   Calls `canWrite(doc)` *before* attempting to push a document's changes.
    -   **Issue:** This call uses the `canWrite` function from `hominio-caps.ts`. However, `hominio-caps.ts` **no longer fetches the user session internally**. This client-side call in `hominio-sync.ts` is likely broken because it's only passing the `doc` and not the required `user` object.
-   **`hominio-db.ts` (e.g., `getDocument`, `deleteDocument`, `updateDocument`, `createConsolidatedSnapshot`, `exportContent`):**
    -   Internal methods now attempt to call `canRead`, `canWrite`, or `canDelete`.
    -   These methods now correctly expect the `user` object as the first argument.
    -   **Issue:** These methods rely on a **placeholder `_getCurrentUser()`** function which currently returns `null`. This means all capability checks *within* `hominio-db.ts` are currently non-functional or will deny access unless the document is owned by `GENESIS_HOMINIO` (for read checks).
-   **`hominio-ql.ts` (`_handleQuery`, `_handleDelete`):**
    -   `_handleQuery`: Calls `canRead(docMeta)` within a filter loop.
    -   `_handleDelete`: Calls `canDelete(docToDelete)`.
    -   **Issue:** Similar to `hominio-sync.ts`, these calls only pass the `doc` object and are **not** passing the required `user` object, making them incompatible with the current signature in `hominio-caps.ts`.

## 4. Offline Capability Handling

-   The core `can()` function in `hominio-caps.ts` includes a check: `if (browser && !navigator.onLine) { return true; }`.
-   **Implication:** This bypass allows all actions *only* when a capability check is performed client-side (e.g., theoretically in `hominio-sync.ts` or `hominio-db.ts` once `_getCurrentUser` works client-side) while the browser is offline. Server-side checks are unaffected by this.

## 5. Identified Issues & Recommendations

1.  **Inconsistent Capability Function Usage:** The most significant issue is the mismatch between how server-side code (`docs.ts`) calls capability functions (`canX(user, doc)`) and how client-side code (`hominio-sync.ts`, `hominio-ql.ts`, `hominio-db.ts`) calls or attempts to call them (often just `canX(doc)` or relying on a non-functional `_getCurrentUser`).
2.  **Broken Client-Side Checks:** Due to the inconsistency above and the placeholder `_getCurrentUser`, most client-side capability checks are likely broken or bypassed.
3.  **`_getCurrentUser` Placeholder:** The `hominio-db.ts` module needs a proper implementation for `_getCurrentUser` that can access the current user session, likely using `get(authClient.useSession())` when running client-side.
4.  **Scattered Logic:** While modular, the need for capability checks on both client and server for different reasons (UI feedback vs. actual enforcement) contributes to the feeling of scattered logic.

**Recommendations:**

1.  **Standardize Capability Calls:** Enforce that *all* calls to `canRead`, `canWrite`, `canDelete` follow the `canX(user, doc)` signature defined in `hominio-caps.ts`.
2.  **Fix Client-Side Callers:**
    *   Modify `hominio-sync.ts`, `hominio-ql.ts`, and `hominio-db.ts` (specifically the implementation of `_getCurrentUser`) to correctly fetch the user session state (e.g., using `get(authClient.useSession())`) *before* calling the capability functions.
3.  **Implement `_getCurrentUser`:** Provide a robust implementation for `_getCurrentUser` in `hominio-db.ts`.
4.  **Review Necessity of Client Checks:** Evaluate if all client-side checks are strictly necessary. Some might be primarily for early UI feedback and could potentially be simplified or rely more heavily on server enforcement, although checks before expensive operations like `pushToServer` are still valuable. 



# Hominio Authentication and Authorization Flows (Refactored Plan v2)

This document outlines the planned refactoring of user authentication and authorization within Hominio, aiming for a centralized, consistent, and offline-capable system.

## 1. Authentication & Session Context

-   **Provider:** BetterAuth, configured via `$lib/KERNEL/hominio-auth.ts` (`authClient`).
-   **Server-Side Context:**
    -   The `auth.api.getSession({ headers })` method (using the BetterAuth instance likely configured in `$lib/auth/auth.ts`) continues to be used in server-load functions (`+layout.server.ts`) and API middleware (`+server.ts`) to validate the session and obtain the `session.user` object for a given request.
-   **Client-Side Context & Offline Handling (`$lib/KERNEL/hominio-auth.ts` / Effective User Utility):**
    -   A new utility function/store, likely integrated into `$lib/KERNEL/hominio-auth.ts`, named `getCurrentEffectiveUser` (or similar), will be introduced.
    -   **`getCurrentEffectiveUser()` Logic:**
        *   Checks browser online status (`navigator.onLine`).
        *   **If Online:** Reads the live user session from the reactive `authClient.useSession()` store. It simultaneously stores the `userId` from this live session into local storage. Returns the `CapabilityUser` object from the store (or `null`).
        *   **If Offline:** Attempts to read the `userId` previously stored in local storage. If found, returns a minimal `{ id: storedUserId }` object. If not found (e.g., never logged in or cleared), returns `null`.
        *   **On Sign Out:** The `authClient.signOut()` process will be augmented to clear the stored `userId` from local storage.
    -   This utility becomes the **single source** for client-side code to determine the current user context for authorization checks, regardless of online status.

## 2. Centralized Capability Logic (`$lib/KERNEL/hominio-caps.ts`)

-   **Single Source of Truth:** `hominio-caps.ts` will exclusively define the permission logic.
-   **Pure Functions:** Functions (`can`, `canRead`, `canWrite`, `canDelete`) will be pure, accepting the `user: CapabilityUser | null` and the `doc: Pick<Docs, 'owner'>` as arguments.
-   **No Internal State:** These functions will **not** fetch the session internally or contain any special offline bypass logic. Their outcome depends solely on the provided user and document owner information.

## 3. Server-Side Authorization Flow

-   **Middleware:** The `requireAuth` middleware in `src/routes/api/[...slugs]/+server.ts` validates the request and extracts the `session.user`.
-   **API Handlers (e.g., `$lib/server/routes/docs.ts`):**
    1.  Receive the validated `session.user` from the middleware.
    2.  Call appropriate methods on Kernel service **singletons** (`hominioDB`, `hominioQLService`, etc.).
    3.  Pass the `session.user` object explicitly as the `user` argument to these Kernel methods.
-   **Kernel Services (Server-Side Execution):**
    1.  Receive the `user` object as an argument in their public methods.
    2.  When needing to perform a permission check, call the relevant function from `hominio-caps.ts`, passing the received `user` object and the target `doc`.

## 4. Client-Side Authorization Flow (Revised Clarification)

-   **Root Layout (`+layout.svelte`):**
    -   Manages the reactive `authClient.useSession()` store.
    -   Initializes and provides access (via `setContext`) to the `getCurrentEffectiveUser` utility/store. **It does not create session-specific instances of Kernel services.**
-   **Components / Pages (e.g., `/hql/+page.svelte`):**
    1.  Uses `getContext` to get access to the `getCurrentEffectiveUser` utility/store.
    2.  When triggering an action (e.g., button click):
        *   Calls `getCurrentEffectiveUser()` (or reads the store value) to get the `currentUser` object.
        *   Calls the required method on the **standard singleton instance** of the Kernel service (e.g., `hominioQLService`, `hominioSync`).
        *   Passes the `currentUser` object explicitly as an argument to the service method (e.g., `hominioQLService.process(request, currentUser)`).
-   **Kernel Services (Client-Side Execution - e.g., `$lib/KERNEL/hominio-ql.ts`):**
    1.  Their public methods (e.g., `process`, `pushToServer`) are modified to accept the `user: CapabilityUser | null` object as an argument.
    2.  They use this passed-in `user` object when they need to call functions in `hominio-caps.ts`. They **do not** hold their own session state.

## 5. Refactored Architecture Summary

This refactored approach provides:

-   **Centralized Rules:** Capability logic lives *only* in `hominio-caps.ts`.
-   **Clear Data Flow:** User context is explicitly passed down the call stack (Middleware -> Handler -> Service -> Caps on server; EffectiveUserUtil -> Component/Initiator -> Service -> Caps on client).
-   **Consistency:** The core `canX(user, doc)` checks are identical regardless of environment.
-   **Testability:** Modules are less coupled; mock users can be injected for testing.
-   **Robust Offline Checks:** Client-side checks work consistently offline using the last known authenticated user ID, preventing simplistic bypasses while still allowing relevant local checks (e.g., checking ownership). Server remains the ultimate authority upon sync.
-   **Clean Svelte Integration:** Uses singleton services globally and Svelte context effectively to manage access to the *effective user state/utility* without prop drilling or complex service instantiation.

---

## 6. Implementation Plan

This plan outlines the steps to refactor the authentication and authorization flow across the application.

**Phase 1: Refactor Core Capability Logic (`hominio-caps.ts`)**

*   **Goal:** Update capability functions to be pure and accept user context externally.
*   **Tasks:**
    1.  Modify `can`, `canRead`, `canWrite`, `canDelete` in `src/lib/KERNEL/hominio-caps.ts` to accept `user: CapabilityUser | null` as the first argument.
    2.  Remove the internal session fetching logic (`get(authClient.useSession())`) from `can()`.
    3.  Remove the offline bypass check (`if (browser && !navigator.onLine) ...`) from `can()`.
    4.  Import `CapabilityUser` type if not already present.
    5.  Remove unused imports (`get`, `authClient`) resulting from the changes.
*   **Outcome:** `hominio-caps.ts` adheres to the new standard. **Breaking Change:** All existing callers will have type errors.

**Phase 2: Adapt Server-Side Logic**

*   **Goal:** Make the server-side API use the refactored capability checks correctly.
*   **Tasks:**
    1.  **API Handlers (`src/lib/server/routes/docs.ts`, potentially others):**
        *   Ensure handlers receiving `session` from `requireAuth` middleware are correctly defined.
        *   Modify calls to Kernel service methods (that require auth) to pass `session.user` as the `user` argument.
    2.  **Kernel Services (Server-Side Execution Context - e.g., `hominioDB`):**
        *   Modify relevant public methods (e.g., `getDocument`, `deleteDocument`, `updateDocument` in `hominio-db.ts` if called directly by server handlers) to accept `user: CapabilityUser | null` as an argument.
        *   Update internal calls to `canRead`, `canWrite`, `canDelete` within these server-executed services to pass the received `user` object.
    3.  **Fix Linter Errors:** Address the existing linter errors in `src/lib/server/routes/docs.ts` regarding incorrect argument counts for `canX` functions by ensuring `session.user` is passed correctly.
*   **Outcome:** Server-side API calls correctly perform authorization using the new `hominio-caps.ts`. Client-side is still broken.

**Phase 3: Implement Effective User Utility (`hominio-auth.ts`)**

*   **Goal:** Create the client-side mechanism for determining the current user (online/offline).
*   **Tasks:**
    1.  Define and implement `getCurrentEffectiveUser()` (or a reactive store alternative) in `src/lib/KERNEL/hominio-auth.ts`.
    2.  Implement online check (`navigator.onLine`).
    3.  Implement logic to read from `authClient.useSession()` when online.
    4.  Implement local storage logic (`setItem`, `getItem`, `removeItem`) for the `userId`. Use a clear key (e.g., `hominio_last_user_id`).
    5.  Integrate local storage update when online user is fetched.
    6.  Integrate local storage reading when offline.
    7.  Modify the `authClient.signOut` logic (or add a wrapper) to clear the `userId` from local storage upon sign-out.
    8.  Ensure `CapabilityUser` type is imported/used correctly.
*   **Outcome:** The utility for getting the effective client-side user is functional.

**Phase 4: Adapt Client-Side Kernel Services**

*   **Goal:** Make Kernel services usable from the client with the new explicit user context passing.
*   **Tasks:**
    1.  **`hominio-db.ts`:**
        *   Modify public methods used by client-side logic (e.g., potentially `createDocument`, `updateDocument`, `deleteDocument`, `importContent`, `exportContent`, `getDocumentsWithLocalChanges`, `createConsolidatedSnapshot`, `loadAllDocsReturn`, `getDocument` *if* called client-side) to accept `user: CapabilityUser | null` as an argument.
        *   Replace the placeholder `_getCurrentUser()` implementation with a call to the new `getCurrentEffectiveUser()` utility from Phase 3. (Alternatively, remove `_getCurrentUser` and require the `user` to be passed into methods like `getDocument` even when called internally by other `hominio-db` methods, ensuring the user context is always passed down).
        *   Update all internal calls to `canRead`, `canWrite`, `canDelete` to use the passed-in `user` object.
        *   Remove unused `get` import if still present.
    2.  **`hominio-ql.ts`:**
        *   Modify `process` and `processReactive` (or their internal handlers like `_handleQuery`, `_handleMutate`, `_handleDelete`) to accept `user: CapabilityUser | null` as an argument.
        *   Update internal calls to `canRead`, `canDelete` to pass the received `user` object.
    3.  **`hominio-sync.ts`:**
        *   Modify `pushToServer` and potentially `deleteDocument` to accept `user: CapabilityUser | null` as an argument.
        *   Update internal calls to `canWrite` (in `pushToServer`) to pass the received `user` object.
*   **Outcome:** Kernel services (`db`, `ql`, `sync`) correctly handle authorization based on the explicitly passed `user` context when called from the client.

**Phase 5: Integrate UI Layer**

*   **Goal:** Connect the Svelte UI to the refactored Kernel services, providing the correct user context.
*   **Tasks:**
    1.  **`+layout.svelte`:**
        *   Use `setContext` to provide the `getCurrentEffectiveUser` utility function or a reactive store derived from it.
    2.  **Components (e.g., `/hql/+page.svelte`, others interacting with Kernel):**
        *   Use `getContext` to retrieve the effective user utility/store.
        *   When calling Kernel service methods (e.g., `hominioQLService.process`, `hominioSync.pushToServer`):
            *   Call `getCurrentEffectiveUser()` (or get store value) to get the `currentUser`.
            *   Pass `currentUser` as an argument to the service method.
*   **Outcome:** The UI correctly interacts with the Kernel, providing the necessary user context for authorization checks. The application should be fully functional with the new auth flow.

**Phase 6: Cleanup and Verification**

*   **Goal:** Ensure code quality and verify functionality.
*   **Tasks:**
    1.  Review all modified files for TODOs, commented-out code, or inconsistencies.
    2.  Perform thorough manual testing:
        *   Login/Logout flows.
        *   API interactions (CRUD operations on docs).
        *   Syncing (online/offline transitions).
        *   HQL queries/mutations.
        *   Permission scenarios (accessing owned vs. non-owned docs).
    3.  Update `AUTH.md` with any final adjustments or notes from the implementation process. 