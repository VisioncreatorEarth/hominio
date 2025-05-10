# Action Plan: Centralize PKP Operations in SignerModal.svelte

**Objective:** Refactor the application to centralize all PKP-related operations (signing, Lit Action execution, encryption/decryption) and their associated session management (passkey login, session resumption) into `SignerModal.svelte`.

**Author:** Gemini Assistant
**Date:** {{YYYY-MM-DD}} (Tool will fill this)
**Status:** Proposed

## 1. Background

Currently, PKP session management and cryptographic operations are distributed across `me/wallet/+page.svelte`, `me/settings/+page.svelte`, and `SignerModal.svelte`. This leads to duplicated logic, increased security surface, and maintenance challenges. This plan outlines steps to consolidate these responsibilities into `SignerModal.svelte`.

## 2. Goals

*   `SignerModal.svelte` becomes the sole, secure gateway for all PKP operations.
*   Internalize `LitNodeClient` and `SessionSigs` management within `SignerModal.svelte`.
*   Pages like `me/wallet/+page.svelte` will only prepare `requestData` and invoke the modal.
*   Improve security by having a single, auditable component for sensitive operations.
*   Enhance maintainability and user experience consistency.

## 3. Scope

**In Scope:**
*   Refactoring `SignerModal.svelte` to handle:
    *   Passkey login for PKP session acquisition (via Lit SDK's `authNeededCallback`).
    *   PKP session resumption (leveraging Lit SDK's internal caching).
    *   Message signing.
    *   Transaction signing.
    *   Lit Action execution.
    *   Data encryption/decryption using Lit Protocol.
*   Refactoring `me/wallet/+page.svelte` to delegate these operations to `SignerModal.svelte`.
*   Refactoring `me/settings/+page.svelte` to remove any PKP session login logic and delegate if necessary.
*   Updating `modalStore.ts` (or equivalent) and relevant type definitions.

**Out of Scope:**
*   Changes to PKP minting, passkey creation (raw credential), EIP-1271 signer deployment (these are primarily EOA operations handled in `me/settings/+page.svelte` and `passkeySigner.ts`).
*   Fundamental changes to the Lit Protocol interaction functions in `lit.ts` unless strictly necessary for the modal's new responsibilities.

## 4. Proposed `requestData` Structure for `SignerModal.svelte`

The `SignerModal` will be invoked with a `requestData` object. `litNodeClient` and `sessionSigs` will NOT be part of this.

```typescript
// Suggested location: src/lib/KERNEL/modalTypes.ts or similar
import type { Hex, Address, TransactionSerializable } from 'viem';
// import type { AccessControlConditions } from '@lit-protocol/types'; // Assuming this type exists or similar

export type PKPSigningRequestData = {
  pkpPublicKey: Hex; // REQUIRED: Public key of the PKP performing the action
  pkpEthAddress: Address; // REQUIRED: ETH address of the PKP
  type: 'transaction' | 'message' | 'executeAction' | 'encrypt' | 'decrypt';
  // Transaction specific
  transaction?: TransactionSerializable;
  tokenDecimals?: number; // For ERC20 transfer display
  // Message specific
  message?: string;
  // Lit Action specific
  actionCode?: string;
  actionJsParams?: Record<string, unknown>;
  // Encryption specific
  dataToEncrypt?: string;
  accessControlConditions?: any; // Replace 'any' with actual Lit SDK type e.g. AccessControlConditions[]
  // Decryption specific
  ciphertext?: string;
  dataToEncryptHash?: string; // For decryption
  // accessControlConditions?: any; // Re-used from encryption if needed, or specific for decryption
  chain?: string; // For decryption if ACCs are chain-specific
};
```

## 5. Execution Plan & Milestones

### Milestone 1: Enhance `SignerModal.svelte` Core Logic

*   **Task 1.1:** Initialize Internal State & Props
    *   `SignerModal.svelte`:
        *   Props: `requestData: PKPSigningRequestData`, `onSign: (result: any) => void`, `onCancel: () => void`.
        *   Internal state: `internalSessionSigs: SessionSigs | null = $state(null)`, `isSessionLoading: boolean = $state(false)`, `passkeyLoginUIVisible: boolean = $state(false)`, `currentError: string | null = $state(null)`.
        *   Get `LitNodeClient` instance from Svelte context: `const o = getContext<HominioFacade>('o'); const litNodeClientStore = o.lit.client; let internalLitNodeClient = $state(get(litNodeClientStore)); $effect(() => internalLitNodeClient = get(litNodeClientStore));`
        *   Load `storedPasskey: StoredPasskeyData | null = $state(null); onMount(() => storedPasskey = getStoredPasskeyData());`
    *   **Test:** Modal initializes, reactive `internalLitNodeClient` is available, `storedPasskey` loads.
*   **Task 1.2:** Implement Session Acquisition and Operation Orchestration
    *   `SignerModal.svelte`: The main "Approve" button's `on:click` handler will call a new async function, e.g., `handleApproveOperation()`.
    *   `handleApproveOperation()`:
        1.  Set `isSessionLoading = true`, `currentError = null`.
        2.  Get `pkpPublicKey` from `requestData`.
        3.  Call `internalLitNodeClient.getSessionSigs({ pkpPublicKey, chain: 'ethereum', resourceAbilityRequests: [...], authNeededCallback: internalPasskeyAuthCallback })`.
            *   Store the resulting `SessionSigs` in `internalSessionSigs`.
        4.  If successful, call the appropriate operation-specific handler (e.g., `await executeRequestedOperation(internalSessionSigs)`).
        5.  Handle errors from `getSessionSigs` or `executeRequestedOperation`.
        6.  Set `isSessionLoading = false`.
    *   **Test:** Approval flow correctly attempts session acquisition then proceeds.
*   **Task 1.3:** Implement `internalPasskeyAuthCallback`
    *   `SignerModal.svelte`: Create `async function internalPasskeyAuthCallback(params: AuthCallbackParams): Promise<AuthSig>`.
    *   This function will:
        1.  Set `passkeyLoginUIVisible = true` to show a UI prompt within the modal.
        2.  Wait for the user to confirm/trigger the passkey interaction. This part is tricky; the callback needs to *pause* and resume. This might involve a promise that resolves when the user clicks a "Confirm Passkey" button in the `passkeyLoginUIVisible` UI.
        3.  Once user confirms: call `navigator.credentials.get(...)` using `params.challenge` (or `messageHashAsChallenge` from `getSessionSigsWithGnosisPasskeyVerification`).
        4.  Use `storedPasskey` and the assertion to get an `AuthSig` (potentially by adapting parts of `getSessionSigsWithGnosisPasskeyVerification` from `lit.ts` or creating a helper in `lit.ts` that *just* returns the `AuthSig` for a given passkey assertion and challenge).
        5.  Set `passkeyLoginUIVisible = false`.
        6.  Return the `AuthSig`.
        7.  Handle user cancellation or errors during passkey interaction (throw an error to reject the `getSessionSigs` promise).
    *   **Test:** When Lit SDK requires auth, the modal shows a passkey prompt, and user interaction leads to `AuthSig` generation.
*   **Task 1.4:** Implement `executeRequestedOperation(sessionSigs: SessionSigs)`
    *   `SignerModal.svelte`: Create `async function executeRequestedOperation(sessionSigs: SessionSigs)`.
    *   Based on `requestData.type`, call the respective internal handler (e.g., `handleSignMessageInternal(sessionSigs)`, etc.), passing the obtained `sessionSigs`.
    *   Call `onSign` with the result or `showError` / `onCancel` on failure.
    *   **Test:** Correct internal operation handler is called after session is ready.

### Milestone 2: Implement Specific Operation Handlers in `SignerModal.svelte`

*   **Task 2.1:** Message & Transaction Signing (Refactor Existing)
    *   `SignerModal.svelte`: Create `async handleSignMessageInternal(sessionSigs: SessionSigs)` and `async handleSignTransactionInternal(sessionSigs: SessionSigs)`.
    *   These will use `internalLitNodeClient` and the passed `sessionSigs`.
    *   They will call `signWithPKP` and `signTransactionWithPKP` from `lit.ts` respectively.
    *   **Test:** Message and transaction signing work through the modal.
*   **Task 2.2:** Lit Action Execution Handler
    *   `SignerModal.svelte`: Create `async handleExecuteActionInternal(sessionSigs: SessionSigs)`.
    *   Calls `executeLitAction` (from `lit.ts`) using `internalLitNodeClient`, passed `sessionSigs`, `requestData.pkpPublicKey`, `requestData.actionCode`, and `requestData.actionJsParams`.
    *   **Test:** Lit Actions can be executed.
*   **Task 2.3:** Encryption Handler
    *   `SignerModal.svelte`: Create `async handleEncryptInternal(sessionSigs: SessionSigs)`.
    *   Uses `encryptString` from `@lit-protocol/encryption` with `internalLitNodeClient`, passed `sessionSigs`, `requestData.dataToEncrypt`, `requestData.accessControlConditions`.
    *   **Test:** Data can be encrypted.
*   **Task 2.4:** Decryption Handler
    *   `SignerModal.svelte`: Create `async handleDecryptInternal(sessionSigs: SessionSigs)`.
    *   Uses `decryptToString` from `@lit-protocol/encryption` with `internalLitNodeClient`, passed `sessionSigs`, `requestData.ciphertext`, `requestData.dataToEncryptHash`, `requestData.accessControlConditions`, `requestData.chain`.
    *   **Test:** Data can be decrypted.
*   **Task 2.5:** Update UI & Display Logic
    *   `SignerModal.svelte`:
        *   Adapt `displayData`, summary, and details tabs for all request types.
        *   Add UI elements for the passkey login step when `passkeyLoginUIVisible` is true (e.g., a message "Passkey authentication required" and a button "Authenticate with Passkey").
        *   The main "Sign/Approve" button might initially be disabled until `internalLitNodeClient` and `storedPasskey` are loaded.
    *   **Test:** UI is comprehensive and responsive to state.

### Milestone 3: Refactor Calling Pages

*   **Task 3.1:** Refactor `me/wallet/+page.svelte`
    *   Remove local state: `sessionSigs`, `sessionAuthMethod`, `isLoadingSessionSigsGnosisPasskey`, `isLoadingPkpSessionResume`.
    *   Remove functions: `tryResumePkpSession`, `handleLoginWithPasskey`.
    *   Update `handleSignMessageWithPkp`, `handleExecuteLitAction`, `handleSaveProfile` (for encryption), `attemptProfileDecryption` (for decryption), and `handleSendSahelToken` (for transaction signing):
        *   Prepare `PKPSigningRequestData` (using `mintedPkpPublicKey`, `mintedPkpEthAddress` from page state).
        *   Call `requestPKPSignature` (from `modalStore`) with this data.
    *   **Test:** Wallet page operations use the modal.
*   **Task 3.2:** Refactor `me/settings/+page.svelte`
    *   Remove `sessionSigs`, `sessionAuthMethod`, `isLoadingSessionSigsGnosisPasskey`, `isLoadingPkpSessionResume`, `hasAttemptedInitialSessionResumption`.
    *   Remove functions: `tryResumePkpSession`, `handleRefreshSessionStatus`. PKP session status is now implicitly managed by the modal when an operation is requested. If a settings page needs to *verify* a PKP is usable with a passkey, it might trigger the modal with a very simple, non-state-changing "sign test message" request for that PKP.
    *   **Test:** Settings page is cleaned of PKP session logic.
*   **Task 3.3:** Update `modalStore.ts` (or equivalent)
    *   Ensure `requestPKPSignature` (or the function opening `SignerModal`) accepts `PKPSigningRequestData` and correctly passes props. Consider renaming `requestPKPSignature` to something more generic like `requestPKPOperation`.
    *   **Test:** Modal is correctly invoked.

### Milestone 4: Testing and Security Review

*   **Task 4.1:** Comprehensive End-to-End Testing
    *   All flows: No session (triggers passkey UI), resumable session, active session.
    *   All operation types.
    *   User cancelling passkey UI.
    *   Error handling.
*   **Task 4.2:** Security Audit Points for `SignerModal.svelte`
    *   **Clarity of Action & Data Display:** User must clearly understand what they are approving.
    *   **Session Scope:** Use appropriate `resourceAbilityRequests` for `getSessionSigs`.
    *   **Error Handling:** No sensitive leaks.
    *   **`authNeededCallback` Security:** Ensure the implementation of `internalPasskeyAuthCallback` is robust, correctly uses `navigator.credentials.get`, and securely derives `AuthSig`.
*   **Task 4.3:** Code Review of `SignerModal.svelte`.

## 6. Rollback Plan

*   Revert to the previous commit if major issues are found.

## 7. Dependencies

*   Relies on `o.lit.client` Svelte store being correctly populated.
*   Assumes `passkeySigner.ts` and `lit.ts` provide necessary low-level helpers (like `getSessionSigsWithGnosisPasskeyVerification` potentially refactored to aid `authNeededCallback`).

## 8. Documentation Updates

*   Update comments in `SignerModal.svelte`.
