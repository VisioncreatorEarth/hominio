**Project Execution Plan**

**1. Current Status Quo Analysis:**

*   **Lit Connection Logic Scattered:** Lit Protocol client initialization and connection logic is present in `src/lib/wallet/lit.ts` and directly invoked in `src/routes/me/wallet/+page.svelte`.
*   **Manual Connection Trigger:** Connection to Lit is primarily handled within the wallet page.
*   **No Global Lit Client on `o`:** The Lit client isn't consistently available as `o.lit` globally.
*   **Configuration:** Lit network configuration (`datil-dev`, `datil-test`, `datil`) is managed in `src/lib/wallet/config/index.ts` and used by `connectToLit`. The user wants to use `LIT_NETWORK.Datil` from `@lit-protocol/constants`.

**2. Wanted Final Product/Architecture/Solution:**

*   **Centralized Lit Connection Module:** All Lit client initialization logic will reside in a new file, `src/lib/wallet/lit-connect.ts`.
*   **Global Lit Initialization in Root Layout:** The Lit client will be initialized when the root layout (`src/routes/+layout.svelte`) loads.
*   **Lit Client on `o` Object:** The Lit client instance will be accessible globally as `o.lit`. The `o` object is provided via Svelte context from the root layout. `o.lit` will likely be a Svelte store to ensure reactivity.
*   **`StatusUI.svelte` Manages Global Lit Connection Display:**
    *   `src/lib/components/StatusUI.svelte` will consume `o` from context and use `o.lit` to display connection status and potentially offer reconnection.
*   **Simplified Wallet UI:** `src/routes/me/wallet/+page.svelte` (Step 0) will be simplified, removing its direct Lit connection logic and relying on the global `$litClientStore` (derived from `o.lit`).
*   **Refactored `lit.ts`:** Functions in `src/lib/wallet/lit.ts` that require a `LitNodeClient` instance will accept it as an argument.
*   **SDK Usage:** Use `import * as LitJsSdk from "@lit-protocol/lit-node-client";` and `new LitJsSdk.LitNodeClient(...)` with `LIT_NETWORK.Datil`.

**3. Execution Plan (Testable Milestones & Subtasks):**

**Milestone 1: Create Centralized Lit Connection Module & Update `lit.ts`**

*   [X] **Task 1.1:** Create `src/lib/wallet/lit-connect.ts`.
    *   [X] Define a function, e.g., `initializeLitClient`, that:
        *   [X] Imports `* as LitJsSdk from "@lit-protocol/lit-node-client";`
        *   [X] Imports `LIT_NETWORK` from `@lit-protocol/constants`.
        *   [X] Creates a new `LitJsSdk.LitNodeClient` instance with `litNetwork: LIT_NETWORK.Datil` and `debug: false`.
        *   [X] Calls `await client.connect()`.
        *   [X] Returns the connected client instance.
*   [X] **Task 1.2:** Update `src/lib/wallet/lit.ts`.
    *   [X] Remove the `connectToLit` function.
    *   [X] Modify functions (`createAuthNeededCallback`, `getSessionSigs`, `signWithPKP`, `executeLitAction`, `getSessionSigsWithGnosisPasskeyVerification`) to accept `litNodeClient: LitNodeClient` as an argument.

**Milestone 2: Integrate Global Lit Client into Root Layout and `o` Object**

*   [X] **Task 2.1:** Modify `src/routes/+layout.svelte`.
    *   [X] Import `initializeLitClient` from `src/lib/wallet/lit-connect.ts`.
    *   [X] Import `writable` from `svelte/store`.
    *   [X] Before `setContext('o', o)`, create a Svelte store for the Lit client: `const litClientStore = writable<LitJsSdk.LitNodeClient | null>(null);`
    *   [X] Extend the `o` object: `(o as any).lit = litClientStore;` (Consider updating the type of `o` in `$lib/KERNEL/hominio-svelte.ts` later to formally include `lit`).
    *   [X] The existing `setContext('o', o)` will now provide `o` with the `lit` store attached.
    *   [X] In an `onMount` block, call `initializeLitClient` and set the result to `litClientStore.set(client)`.
    *   [X] Handle connection status (loading/error) for the initialization, potentially updating a local state in the layout or a global notification store.
*   [ ] **Task 2.2 (Potential):** If `o` in `$lib/KERNEL/hominio-svelte.ts` needs structural changes to formally accommodate `o.lit` as a store or if `o` itself needs to become a store for broader reactivity, address this. For now, dynamic extension in layout is the primary approach.
*   [X] **Task 2.3:** Verify `$o.lit` store is available and updates in context in a child component (e.g., temporarily in `+page.svelte` by logging `$o.lit?.ready`). (Verified during Milestone 3)

**Milestone 3: Refactor `StatusUI.svelte` to Use Global `o.lit`**

*   [X] **Task 3.1:** Modify `src/lib/components/StatusUI.svelte`.
    *   [X] It already gets `o` from context.
    *   [X] Access the Lit client store via `$litClientStore` (derived from `o.lit`).
    *   [X] Subscribe to `$litClientStore` (or use its reactive value) to get the client instance and its connection status (e.g., `$litClientStore?.ready`, `$litClientStore?.config.litNetwork`).
    *   [X] Display the connection status (connected to `LIT_NETWORK.Datil`, disconnected, connecting, error based on `$litClientStore` state).
    *   [X] Update the "Connect/Reconnect Lit" button logic to call `connect()` on the `$litClientStore` instance if it exists and is not ready, or re-initialize if `$litClientStore` is null.

**Milestone 4: Update `+page.svelte` (Wallet UI) to Use Global `o.lit`**

*   [X] **Task 4.1:** Modify `src/routes/me/wallet/+page.svelte`.
    *   [X] Remove its local `litNodeClient` state variable, `isLitConnecting`, and `litConnected` state.
    *   [X] Remove `handleConnectLit` function.
    *   [X] Remove direct Lit connection logic from `onMount`.
    *   [X] Step 0 ("Initial Connections") should now reflect the status from `$litClientStore` (derived from `o.lit`) (possibly via `StatusUI.svelte` or by directly observing it).
    *   [X] Access the Lit client instance reactively via `$litClientStore` when needed.
    *   [X] Pass the `$litClientStore` instance to functions from `src/lib/wallet/lit.ts` that require it. Ensure operations wait for `$litClientStore` to be non-null and ready.
*   [X] **Task 4.2:** Ensure functions in `src/lib/wallet/lit.ts` correctly use the passed `LitNodeClient` instance. (Handled in Task 1.2)

**Milestone 5: Testing and Cleanup**

*   [ ] **Task 5.1:** Thoroughly test all Lit-dependent functionalities across the app, especially focusing on the wallet page and any other areas that might use `o.lit`.
*   [ ] **Task 5.2:** Remove any old/unused Lit connection code or context keys.
*   [ ] **Task 5.3:** Ensure consistent error handling for Lit connection issues, with clear feedback to the user.
*   [ ] **Task 5.4:** Check console for errors/warnings.
*   [ ] **Task 5.5:** Update the `EXECUTION_TASK.md` with checked-off tasks. 