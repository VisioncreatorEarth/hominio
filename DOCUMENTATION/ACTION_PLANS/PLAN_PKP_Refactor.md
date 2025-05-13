# PKP & Passkey Refactor Plan

**Goal:** Refactor PKP and passkey management to use the backend as the single source of truth, remove `localStorage` dependencies for persistent data, and create a unified, automated setup/sign-in flow for the user's PKP wallet via a new dedicated page.

---

## Milestone 1: Backend Enhancements (`pkp-passkey-plugin.ts`)

**Objective:** Solidify the backend as the authoritative store for the user-passkey-PKP link and related critical data.

*   [X] **Task 1.1: Analyze current `pkp_passkey` field.**
    *   Currently stores `{ rawId: string, pubKey: string }` (PKP Public Key).
    *   Determined that `passkeyVerifierContract` (renamed from `signerContractAddress`) will also be stored here.
*   [X] **Task 1.2: Modify `PasskeyInfoBody` and `PkpPasskey` interfaces.**
    *   `PkpPasskey` interface in `pkp-passkey-plugin.ts` is now:
        ```typescript
        interface PkpPasskey {
            rawId: string;       // Passkey rawId
            pubKey: string;      // PKP Public Key
            passkeyVerifierContract?: string; // Address of the deployed EIP-1271 signer (renamed)
        }
        ```
*   [X] **Task 1.3: Update `updateUserPasskeyInfo` endpoint.**
    *   Accepts the expanded `PkpPasskey` object.
    *   Stores `rawId`, `pubKey` (PKP_pubKey), and `passkeyVerifierContract` in the `pkp_passkey` JSONB column.
    *   Ensures the update is for the currently authenticated `userId`.
    *   Operation is idempotent.
    *   Includes logging.
*   [X] **Task 1.4: Update `getUserPasskeyInfo` endpoint.**
    *   Retrieves and returns the full `PkpPasskey` object (including `rawId`, `pubKey`, `passkeyVerifierContract`) for the authenticated `userId`.
    *   If no record exists, returns `null` for the `pkp_passkey` field.
*   [X] **Task 1.5: Create new endpoint: `checkRawIdExists`.**
    *   **Purpose:** Called *before* PKP minting during a new setup flow to check if the given `passkeyRawId` has already been registered by *any* user.
    *   **Input:** `{ rawId: string }`
    *   **Output:** `{ exists: boolean, pkpPublicKey?: string, userId?: string, passkeyVerifierContract?: string }`
    *   Implemented; currently requires auth.
*   [X] **Task 1.6: Update Client Plugin Definition.**
    *   Reflected changes to `UpdatePasskeyInfoArgs` and the return types of `getUserPasskeyInfo` and `updateUserPasskeyInfo`.
    *   Added definition for `checkRawIdExists` and updated field names to `passkeyVerifierContract`.

---

## Milestone 2: `passkeySigner.ts` Refactoring

**Objective:** Decouple passkey utility functions from `localStorage` and prepare them for the new flow.

*   [X] **Task 2.1: Refactor `createAndStorePasskeyData` function.**
    *   Renamed to `generatePasskeyMaterial`.
    *   It **returns** the `StoredPasskeyData`-like object (which includes `rawId`, `pubkeyCoordinates`, `username`, `authMethodId`, `passkeyVerifierContractAddress`).
    *   It **does not** write to `localStorage`.
*   [X] **Task 2.2: Analyze `getStoredPasskeyData` usages.**
    *   This function will be largely deprecated for the main PKP flow.
    *   Call sites (`SignerModal.svelte`, `settings/+page.svelte`) identified for update in M3/M4.
    *   Function itself is now removed from `passkeySigner.ts`.
*   [X] **Task 2.3: Refactor `deployPasskeySignerContract` function.**
    *   It now accepts `walletClient`, `eoaAddress`, and `pubkeyCoordinates`.
    *   After successful deployment and extraction of `signerAddress` (which is `passkeyVerifierContractAddress`), it **returns** this `passkeyVerifierContractAddress` along with the `txHash`.
    *   It **does not** write to `localStorage`.
*   [X] **Task 2.4: Refactor `getPasskeySignerContractAddress` (Predict Signer Address).**
    *   This function now accepts `pubkeyCoordinates`.
    *   It **does not** rely on `getStoredPasskeyData()`.
*   [X] **Task 2.5: Refactor `checkSignature` and `verifySignatureWithProxy`.**
    *   These now accept `rawId`, and `pubkeyCoordinates` or `passkeyVerifierContract` as arguments.
    *   They **do not** call `getStoredPasskeyData()`.
*   [X] **Task 2.6: Deprecate/Remove `clearStoredPasskeyData`.**
    *   No longer needed as `localStorage` won't be the primary store for this data.
    *   Function itself is now removed from `passkeySigner.ts`. The `STORAGE_KEY` constant was also removed.

---

## Milestone 3: Unified Passkey Sign-up/Sign-in Flow (`src/routes/me/passkey/+page.svelte`)

**Objective:** Create a new, streamlined page for users to either sign in with an existing passkey or go through a full automated setup for a new PKP wallet. This page will be the primary interface for wallet initialization.

*   [X] **Task 3.1: Define Page Structure and State Variables.**
    *   `isLoading: boolean`
    *   `flowState: 'initial' | 'checkingUserPasskey' | 'promptSignIn' | 'generatingPasskey' | 'checkingGlobalRawId' | 'deployingSigner' | 'mintingPkp' | 'updatingBackend' | 'mintingCapacityCredits' | 'complete' | 'error'`
    *   `flowMessage: string | null`
    *   `pkpEthAddress: Address | null` (to display at the end)
    *   `currentError: string | null`
    *   `tempPasskeyMaterial: StoredPasskeyData | null` (from `generatePasskeyMaterial`)
    *   `tempPasskeyVerifierContract: string | null` (from `deployPasskeySignerContract`)
    *   `tempPkpDetails: { pkpPublicKey: Hex, pkpEthAddress: Address, pkpTokenId: string } | null`
*   [X] **Task 3.2: `onMount` Logic - Entry Point.**
    *   Set `isLoading = true`, `flowState = 'checkingUserPasskey'`.
    *   Call `authClient.pkpPasskeyPlugin.getUserPasskeyInfo()` to check if the current BetterAuth user already has a `pkp_passkey` (especially `rawId`) registered.
    *   **If `data.pkp_passkey.rawId` exists:**
        *   `flowState = 'promptSignIn'`.
        *   Store `rawId` and `pkpPublicKey` (if available) from backend.
        *   Prompt user to authenticate with their existing passkey (using `navigator.credentials.get` with the known `rawId`).
        *   On successful passkey authentication, use the `pkpPublicKey` (fetched from backend or obtained after `checkRawIdExists` if only `rawId` was known) to initialize session sigs for `SignerModal` (e.g., by updating a Svelte store).
        *   Display PKP address and "Sign-in successful" message. `flowState = 'complete'`.
    *   **If no `data.pkp_passkey.rawId` exists (New User / New Setup Flow):**
        *   `flowState = 'generatingPasskey'`. Initiate `handleFullSetupFlow()`.
    *   Set `isLoading = false` after initial check.
*   [X] **Task 3.3: Implement `handleFullSetupFlow()` orchestrator function.**
    This function manages the multi-step setup for a new user or new passkey. Update `flowState` and `flowMessage` at each stage.
    1.  **Generate Passkey Material Locally:** `flowState = 'generatingPasskey'`. Call `generatePasskeyMaterial()`. Store result in `tempPasskeyMaterial`. Handle errors.
    2.  **Check `rawId` Uniqueness Globally:** `flowState = 'checkingGlobalRawId'`. Call `authClient.pkpPasskeyPlugin.checkRawIdExists({ rawId: tempPasskeyMaterial.rawId })`.
        *   If `result.exists`: Critical error. This `rawId` (from a newly generated passkey) is somehow already registered globally, possibly to another user. This is unexpected for a *newly generated* passkey but check is a safeguard. Halt flow with error. `flowState = 'error'`.
        *   If not `result.exists`: Proceed.
    3.  **Deploy Signer Contract:** `flowState = 'deployingSigner'`. Check EOA wallet. Call `deployPasskeySignerContract(guardianClient, guardianAddress, tempPasskeyMaterial.pubkeyCoordinates)`. Store returned `passkeyVerifierContractAddress` in `tempPasskeyVerifierContract`. Handle EOA errors/rejections.
    4.  **Mint PKP (Lit Action Auth Only):** `flowState = 'mintingPkp'`. Call `mintPKPWithPasskeyAndAction(guardianClient, guardianAddress, tempPasskeyMaterial.authMethodId, tempPasskeyVerifierContract, gnosisPasskeyVerifyActionCode)`.
        *   `mintPKPWithPasskeyAndAction` should be updated/confirmed to *only* set up the Lit Action based auth method (using `passkeyVerifierContract`). No direct passkey auth method type should be added to the PKP permissions.
        *   Store PKP details in `tempPkpDetails`. Handle EOA errors.
    5.  **Link Passkey & PKP in Backend:** `flowState = 'updatingBackend'`. Call `authClient.pkpPasskeyPlugin.updateUserPasskeyInfo({ pkp_passkey: { rawId: tempPasskeyMaterial.rawId, pubKey: tempPkpDetails.pkpPublicKey, passkeyVerifierContract: tempPasskeyVerifierContract } })`.
    6.  **Mint Capacity Credits:** `flowState = 'mintingCapacityCredits'`. Call `mintPKPWithPasskeyAndAction` also handles this, or call a separate utility if refactored.
    7.  **Finish:** `flowState = 'complete'`, `pkpEthAddress = tempPkpDetails.pkpEthAddress`. Display success and the PKP ETH Address. Clear temporary state.
*   [X] **Task 3.4: Implement UI.**
    *   Minimal UI, driven by `flowState` and `flowMessage`.
    *   Display current step, loading indicators, error messages.
    *   Final success state shows the user's PKP ETH Address.
    *   Button to initiate sign-in/sign-up flow.
*   [X] **Task 3.5: Ensure `mintPKPWithPasskeyAndAction` in `lit.ts` correctly handles Lit Action only auth.**
    *   Verify it does not attempt to add `AUTH_METHOD_TYPE_PASSKEY` directly to PKP permissions. The `passkeyAuthMethodId` (derived from `rawId`) is used by the Lit Action itself, which references the `passkeyVerifierContract`.

---

## Milestone 4: Refactor Legacy Settings Page (`src/routes/me/settings/+page.svelte`)

**Objective:** Clean up the existing settings page, removing wallet creation/initialization logic, and transforming it into a display and management interface for an already configured PKP wallet.

*   [X] **Task 4.1: Remove Wallet Setup UI and Logic.**
    *   Delete sections and code related to:
        *   Passkey creation (`handleCreatePasskey`, username input).
        *   EIP-1271 signer deployment (`handleDeployContract`).
        *   PKP minting (`handleMintPkp`).
        *   Hominio wallet concept linking (`handleCreateHominioWalletConcept`).
    *   Remove associated state variables like `storedPasskey`, `deploymentTxHash`, `mintedPkpTokenId`, etc., if they are purely for the setup flow.
*   [X] **Task 4.2: `onMount` Data Fetching.**
    *   Set `isLoading = true`.
    *   Call `authClient.pkpPasskeyPlugin.getUserPasskeyInfo()` to get all PKP-related data for the logged-in user (e.g., `rawId`, `pkpPublicKey`, `passkeyVerifierContract`). Store this in a reactive variable (e.g., `currentUserPkpData: ClientPkpPasskey | null`).
    *   Set `isLoading = false`.
*   [X] **Task 4.3: Implement "Wallet Management View".**
    *   If `currentUserPkpData` is available:
        *   Display `currentUserPkpData.pubKey` (PKP Public Key).
    *   Derive/Fetch and display PKP ETH Address from `pkpPublicKey`.
        *   Display `currentUserPkpData.rawId` (associated passkey rawId).
    *   Display `currentUserPkpData.passkeyVerifierContract`.
    *   If no `currentUserPkpData` (user hasn't gone through `src/routes/me/passkey/+page.svelte`):
        *   Display a message guiding the user to the new passkey setup page.
*   [X] **Task 4.4: Retain and Adapt Management Functionality.**
    *   **PKP Auth Methods:**
        *   Button "View Permitted Auth Methods" should fetch methods for the `pkpTokenId` (derived from `currentUserPkpData.pubKey` if necessary, or add `pkpTokenId` to `ClientPkpPasskey` if feasible).
    *   **PKP Session Status:**
        *   Button "Manage/Refresh Session Status" should use `currentUserPkpData.rawId` and `currentUserPkpData.pkpPublicKey` to initiate session authentication via `SignerModal.svelte` (using `requestPKPSignature`).
    *   **Capacity Credits:**
        *   Button "View Capacity Credits" should fetch credits for the PKP ETH address derived from `currentUserPkpData.pubKey`.
*   [X] **Task 4.5: Update State Management.**
    *   Ensure state variables like `sessionSigs`, `permittedAuthMethods`, `ownedCapacityCredits` are populated based on actions taken with `currentUserPkpData`.
*   [X] **Task 4.6: Remove Obsolete `localStorage` Usage.**
    *   Remove any remaining `localStorage.getItem('mintedPKPData')` or similar if they were only for the old setup flow. Data should come from the backend via `getUserPasskeyInfo` (or via `currentUserPkpProfileStore`).

---

## Milestone 5: `SignerModal.svelte` Integration

**Objective:** Ensure the signing modal functions correctly using data passed via props or fetched from a reliable global state (e.g., a Svelte store updated by the new passkey flow or settings page), not `localStorage`.

*   [X] **Task 5.1: Define Data Source for `SignerModal`.**
    *   `SignerModal` needs `rawId` (of the user's active passkey), `passkeyVerifierContractAddress` (from `currentUserPkpData.passkeyVerifierContract`), and `pkpPublicKey` (from `currentUserPkpData.pubKey`).
    *   This data should ideally be available in a Svelte store (e.g., `writable<CurrentUserPkpProfile | null>`) that `src/routes/me/passkey/+page.svelte` (on successful setup/sign-in) and `src/routes/me/settings/+page.svelte` (on data fetch) update.
*   [X] **Task 5.2: Modify `SignerModal.svelte` to use the new data source.**
    *   Remove any direct `getStoredPasskeyData()` calls or reliance on its structure if still present.
    *   Subscribe to the Svelte store or accept data as props. The `storedPasskey` reactive variable within the modal should be populated from this store/props.
*   [X] **Task 5.3: Update `initiatePasskeyAuthenticationAndGetSigs` and dependent functions.**
    *   Ensure they use `rawId`, `passkeyVerifierContractAddress` (mapping from `currentUserPkpData.passkeyVerifierContract` if names differ), and `pkpPublicKey` obtained from the new central data source.
*   [X] **Task 5.4: Update `requestPKPSignature` in `modalStore.ts` if props approach is chosen for `SignerModal`.** (If the modal is to be more self-contained and props are passed directly when calling `requestPKPSignature`).

---

## Milestone 6: Testing and Refinement

**Objective:** Thoroughly test the new unified flow and refactored settings page, ensuring robustness and correct behavior across various scenarios.

*   [] **Task 6.1: Test "New User Setup" flow on `src/routes/me/passkey/+page.svelte` end-to-end.**
*   [] **Task 6.2: Test "Returning User / Existing Passkey Sign-in" flow on `src/routes/me/passkey/+page.svelte`.**
*   [] **Task 6.3: Test Passkey Conflict during new setup on `src/routes/me/passkey/+page.svelte` (if `checkRawIdExists` finds an unexpected collision).**
*   [] **Task 6.4: Test `src/routes/me/settings/+page.svelte` data display and management functions.**
    *   Verify correct data display for a user with a configured PKP.
    *   Verify guidance message for a user without a configured PKP.
    *   Test "View Permitted Auth Methods", "Manage/Refresh Session Status", "View Capacity Credits" buttons.
*   [] **Task 6.5: Test all `SignerModal.svelte` operations with the new data sourcing.**
*   [] **Task 6.6: Comprehensive Error Handling Tests for all flows.**
*   [] **Task 6.7: Code Cleanup, Typing, and Linter Error Resolution.**
    *   Address any remaining linter errors in affected files.
    *   Ensure consistent typing and code style.

---
