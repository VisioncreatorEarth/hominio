# Project Execution Plan: EOA Wallet Refactoring

## 1. Current Status Quo & Problematic Week Points:

*   **Scattered Logic:** EOA wallet connection functions (`getWalletClient`, `getWalletAccount`) and connection handling (`handleConnectEoaWallet`) are spread across `src/routes/me/wallet/+page.svelte` and `src/lib/wallet/passkeySigner.ts`.
*   **Local State Management:** `src/routes/me/wallet/+page.svelte` manages its own EOA client and address state, which isn't globally available or synced.
*   **Redundant Client Creation:** Utility functions in `src/lib/wallet/lit.ts` and `src/lib/wallet/passkeySigner.ts` might implicitly expect or create their own wallet client instances if not carefully managed.
*   **UI Inconsistency:** EOA connection status isn't globally visible in a consistent way (e.g., in `StatusUI`).

## 2. Desired Final Product / Architecture:

*   **Centralized EOA Logic:** A new file, `src/lib/wallet/guardian-eoa.ts`, will encapsulate EOA wallet initialization, connection, and state management.
*   **Global State via Context:**
    *   Svelte writable stores for `guardianEoaClient: WalletClient | null`, `guardianEoaAddress: Address | null`, `guardianEoaChainId: number | null`, and `guardianEoaError: string | null` will reside in `guardian-eoa.ts`.
    *   These stores will be added to the `o` Svelte context object (e.g., as `o.guardianEoaClientStore`, etc.) in `src/routes/+layout.svelte`.
*   **Refactored Components & Utilities:**
    *   `src/lib/components/StatusUI.svelte` will display the global EOA status and provide a connection button.
    *   `src/routes/me/wallet/+page.svelte` will use the global EOA state from the context, removing its local EOA logic and potentially the entire "Step 0" section.
    *   Utility functions in `src/lib/wallet/passkeySigner.ts` and `src/lib/wallet/lit.ts` will be updated to accept the EOA `WalletClient` instance and `Address` as parameters.
*   **UI Consolidation in `StatusUI.svelte`**: The status for Sync, Lit, and EOA will each be displayed on a single, more compact row.

## 3. Detailed Execution Plan (Testable Milestones):

**Milestone 1: Create `guardian-eoa.ts` and Establish Global EOA State**

*   [ ] **Create File:**
    *   Create `src/lib/wallet/guardian-eoa.ts`.
*   [ ] **Implement Core Logic in `guardian-eoa.ts`:**
    *   Define writable stores:
        *   `export const guardianEoaClientStore = writable<WalletClient | null>(null);`
        *   `export const guardianEoaAddressStore = writable<Address | null>(null);`
        *   `export const guardianEoaChainIdStore = writable<number | null>(null);`
        *   `export const guardianEoaErrorStore = writable<string | null>(null);`
    *   Implement `initializeGuardianEoaClient()`:
        *   Checks for `window.ethereum`.
        *   Creates `walletClient` using `createWalletClient({ chain: currentChain, transport: custom(window.ethereum) })` (import `currentChain` from `../config`).
        *   Sets `guardianEoaClientStore`.
        *   Sets up listeners for `accountsChanged` and `chainChanged` on `window.ethereum` to update stores (`guardianEoaAddressStore`, `guardianEoaChainIdStore`, and re-fetch account with new chain).
    *   Implement `connectGuardianEoaAccount()`:
        *   Ensures client is initialized (calls `initializeGuardianEoaClient` if store is null).
        *   Calls `client.requestAddresses()` to get accounts.
        *   Updates `guardianEoaAddressStore` with the first account.
        *   Calls `client.getChainId()` and updates `guardianEoaChainIdStore`.
        *   Clears `guardianEoaErrorStore` on success.
        *   Handles potential errors and updates `guardianEoaErrorStore`.
    *   Implement `disconnectGuardianEoaAccount()`:
        *   Resets `guardianEoaAddressStore`, `guardianEoaChainIdStore`, `guardianEoaErrorStore` to `null`.
    *   Export all stores and functions.

**Milestone 2: Integrate EOA State into Root Layout (`+layout.svelte`)**

*   [ ] **Import and Expose via Context:**
    *   In `src/routes/+layout.svelte`, import EOA stores and `initializeGuardianEoaClient` from `guardian-eoa.ts`.
    *   Add the EOA stores to the `o` object:
        ```typescript
        (o as any).guardianEoaClientStore = guardianEoaClientStore;
        (o as any).guardianEoaAddressStore = guardianEoaAddressStore;
        (o as any).guardianEoaChainIdStore = guardianEoaChainIdStore;
        (o as any).guardianEoaErrorStore = guardianEoaErrorStore;
        ```
    *   Ensure `setContext('o', o)` is called *after* these additions.
*   [ ] **Initialize in `onMount`:**
    *   In `onMount` within `+layout.svelte`, call `initializeGuardianEoaClient()`.

**Milestone 3: Refactor `StatusUI.svelte` for EOA Status and Compact Layout**

*   [ ] **Access Global EOA State:**
    *   In `src/lib/components/StatusUI.svelte`, get `o` from context.
    *   Access EOA stores (e.g., `const { guardianEoaAddressStore, guardianEoaChainIdStore, guardianEoaErrorStore } = o;`).
*   [ ] **Display EOA Status:**
    *   Reactively display connection status (`$guardianEoaAddressStore`, `$guardianEoaChainIdStore`).
    *   Show errors from `$guardianEoaErrorStore`.
*   [ ] **Implement Connect/Disconnect Button:**
    *   Add button calling `connectGuardianEoaAccount` (from `guardian-eoa.ts`).
    *   Button text/state changes based on `$guardianEoaAddressStore`.
*   [ ] **Compact Layout:**
    *   Restyle `StatusUI.svelte` for each service (Sync, Lit, EOA) to be more compact, ideally on a single row per service.

**Milestone 4: Refactor `me/wallet/+page.svelte` to Use Global EOA State**

*   [ ] **Remove Local EOA Logic:**
    *   Delete local state: `eoaWalletClient`, `eoaAddress`, `isEoaConnecting`.
    *   Delete `handleConnectEoaWallet` function.
*   [ ] **Use Global EOA State from Context:**
    *   Get `o` from context. Access EOA stores.
*   [ ] **Update UI (Step 0):**
    *   The "Controller EOA Wallet" section in Step 0 should now derive its status from `$guardianEoaAddressStore` and `$guardianEoaChainIdStore`.
    *   The connect button in Step 0 can be removed if `StatusUI.svelte` effectively handles the global EOA connection.
    *   **Consider removing the "Step 0: Connections" section entirely** if the `StatusUI.svelte` provides sufficient global EOA status and connection management. If removed, subsequent step numbering in the UI might need adjustment.
*   [ ] **Update EOA-Dependent Functions:**
    *   Modify functions (e.g., `handleMintPkp`) to use client from `$guardianEoaClientStore` and address from `$guardianEoaAddressStore`.
    *   Pass these global values to utility functions from `lit.ts`, `passkeySigner.ts`.

**Milestone 5: Refactor Utility Files (`passkeySigner.ts`, `lit.ts`)**

*   [ ] **`src/lib/wallet/passkeySigner.ts`:**
    *   Remove local `getWalletClient`, `getWalletAccount`, `walletClient`, `walletAccount`.
    *   Modify `deployPasskeySignerContract` to accept `walletClient: WalletClient` and `eoaAddress: Address`. Chain switching logic remains within this function but uses the passed client.
*   [ ] **`src/lib/wallet/lit.ts`:**
    *   Modify transaction-performing functions (e.g., `mintPKPWithPasskeyAndAction`) to accept `walletClient: WalletClient`, `eoaAddress: Address`. Chain switching logic remains within these functions.
*   [ ] **Update Callers in `me/wallet/+page.svelte`:**
    *   Ensure `WalletClient` from `$guardianEoaClientStore` and `Address` from `$guardianEoaAddressStore` are passed.

**Milestone 6: Testing and Cleanup**

*   [ ] **Thorough Testing:**
    *   EOA connect/disconnect via `StatusUI`.
    *   Status display in `StatusUI` and `me/wallet/+page.svelte`.
    *   Passkey signer deployment.
    *   PKP minting.
    *   Chain switching prompts.
*   [ ] **Code Cleanup:**
    *   Remove unused imports/variables.
    *   Consistent error handling.
*   [ ] **Update `EXECUTION_TASK.md`:**
    *   Check off all completed tasks.

## Referenced Files for Changes/Creation:

*   `src/lib/wallet/guardian-eoa.ts` (New)
*   `src/routes/+layout.svelte` (Modify)
*   `src/lib/components/StatusUI.svelte` (Modify)
*   `src/routes/me/wallet/+page.svelte` (Modify)
*   `src/lib/wallet/passkeySigner.ts` (Modify)
*   `src/lib/wallet/lit.ts` (Modify)
*   `src/lib/wallet/config/index.ts` (Reference for default chain)
*   `src/lib/wallet/config/chains.ts` (Reference for chain details) 