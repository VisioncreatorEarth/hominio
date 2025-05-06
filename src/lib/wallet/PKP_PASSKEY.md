# PKP Passkey and Lit Action Integration Plan

This document outlines the current status, desired final solution, and step-by-step implementation tasks for integrating passkeys and Lit Actions with Programmable Key Pairs (PKPs) for enhanced authentication and authorization.

## 1. Status Quo

*   **Unified UI**: All functionality (Passkey, EIP-1271, PKP Auth Mgmt, PKP Ops) is now consolidated in `src/routes/wallet/+page.svelte`.
*   **Auto-Connect**: The UI attempts to connect to the Lit Network automatically on load.
*   **PKP Minting & Basic Control**: PKPs are minted and controlled by an External Owned Account (EOA).
*   **EOA-based Session Signatures**: Implemented via `getSessionSigsViaEOA` using an `authNeededCallback` that prompts the EOA (e.g., MetaMask) to sign a SIWE message.
*   **Passkey Registration as Auth Method**:
    *   The `registerPasskeyAuthMethod` function in `lit.ts` allows registering a passkey as a custom authentication method (our unique `AUTH_METHOD_TYPE_PASSKEY`) for a specific PKP on the Chronicle testnet.
    *   This involves the EOA signing a transaction to `addPermittedAuthMethod` on the `PKPPermissions` contract.
    *   This grants the passkey (identified by its `authMethodId`) permanent permission with "SignAnything" scope by default.
*   **Session Signatures with Registered Passkey**:
    *   The `getSessionSigsWithRegisteredPasskey` function in `lit.ts` generates session signatures.
    *   It uses a Lit Action (`simplifiedCheckPermissionActionCode`) as a gatekeeper.
    *   This Lit Action performs **authorization** by verifying *on-chain* if the provided passkey is already a permitted auth method.
    *   The **authentication** relies on providing the correct `pkpPublicKey` and the trusted `litActionCode` with expected `jsParams`.
    *   If the on-chain check passes, `litNodeClient.getLitActionSessionSigs` issues session sigs.
*   **PKP Operations**: The UI allows signing messages (`signWithPKP`) and executing a simple inline Lit Action (`executeLitAction`) using obtained `sessionSigs`.
*   **Dummy Auth**: Functionality related to registering and using a dummy auth method has been removed.
*   **Focus**: Current implementation uses Lit Actions primarily to *verify existing permissions* for passkeys to grant *session* sigs.

## 2. Wanted Final Solution

*   **Streamlined Passkey Authentication**: Users can authenticate and authorize PKP operations seamlessly using their registered passkeys.
*   **Lit Action as a First-Class Permanent Auth Method**:
    *   Ability to register a specific Lit Action (identified by its IPFS CID) as a permanent permitted authentication method (Auth Method Type `2`) for a PKP, triggered via UI.
    *   This Lit Action would have defined scopes and could encapsulate complex logic.
*   **Clear Separation of Concerns**: Passkey for authentication, Lit Action for policy/gatekeeping.
*   **Flexible Permission Management (via EOA Controller)**:
    *   UI for the EOA controller to manage permitted auth methods (passkeys, Lit Actions) and their scopes.
    *   **Note on PKP Self-Custody**: Current plan assumes the EOA retains administrative control. PKP self-custody (removing EOA control) is a potential future step.
*   **Enhanced Security**: Lit Actions can enforce granular policies.

## 3. Step-by-Step Implementation & Execution Tasks

### Phase 1: Implement Lit Action Registration & Verification

*   [x] **Task 1.1: Implement `addPermittedLitAction` Function in `lit.ts`**
    *   [x] Create the `addPermittedLitAction` function.
    *   [x] Parameters: `walletClient`, `eoaAddress`, `pkpTokenId`, `litActionCode` (string), `scopes` (default `[1n]`).
    *   [x] Use `ipfsOnlyHash.of(litActionCode)` to get the base58 IPFS CID.
    *   [x] Use `ethers.utils.base58.decode` and `Buffer.from().toString('hex')` (or equivalent) to convert the base58 CID to a `0x`-prefixed hex string (`idForContract`).
    *   [x] Define the `authMethodPayload = { authMethodType: 2n, id: idForContract }`.
    *   [x] Call `walletClient.writeContract` targeting the `PKPPermissions` contract (`addPermittedAuthMethod` function) with `pkpTokenId`, `authMethodPayload`, and `scopes`.
    *   [x] Ensure correct chain (`chronicle`) and gas settings.
    *   [x] Return the transaction hash.
    *   [x] Include robust error handling (e.g., for wallet connection, contract interaction, CID processing).
    *   [x] Add console logs for debugging (e.g., computed CID, hex ID, payload).
*   [x] **Task 1.2: Add UI for Adding a Permitted Lit Action in `wallet/+page.svelte`**
    *   [x] Create a new UI section (e.g., Step 4B) within the "Register Auth Methods" block, visible when EOA is connected.
    *   [x] Add a `<textarea>` input for the user to paste Lit Action JavaScript code. Bind this to a new state variable (e.g., `litActionCodeInput`).
    *   [x] Add a button: "Register Lit Action Auth Method".
    *   [x] Create a handler function (e.g., `handleRegisterLitActionAuth`) triggered by the button.
    *   [x] Inside the handler:
        *   Perform necessary checks (Lit connected, EOA connected, `pkpTokenIdInput` provided, `litActionCodeInput` provided).
        *   Set a loading state (e.g., `isRegisteringLitActionAuth`).
        *   Call the `addPermittedLitAction` function from `lit.ts`, passing the required parameters.
        *   Store the resulting transaction hash (e.g., `litActionRegistrationTxHash`).
        *   Display success/error messages using `mainSuccess`/`mainError`.
        *   Clear loading state.
    *   [x] Display the transaction hash with a link to the explorer if successful.
*   [ ] **Task 1.3: Refine Passkey Registration UI & Logic (Remaining)**
    *   [ ] Ensure robust error handling in `registerPasskeyAuthMethod` and UI calls (Task 1.1 from previous plan - partially done, review needed).
    *   [ ] Provide clear feedback during passkey registration (Task 1.1 - partially done).
    *   [ ] Add UI to *verify* and display if the current `storedPasskey.authMethodId` is actually registered on-chain for the `pkpTokenIdInput` (requires fetching permitted methods - deferring slightly to Task 3.1 structure but could be done sooner).
*   [ ] **Task 1.4: Implement Lit Action Permission Verification**
    *   [ ] Deferring UI for verification until Task 3.1 (Viewing All Methods), but the core logic for checking will be part of implementing `getPermittedAuthMethodsForPkp` and potentially `isPermittedAction` lookups.

### Phase 2: Using a Permitted Lit Action for Session Sigs / Direct Execution

*   [ ] **Task 2.1: Session Sigs via a Permitted Lit Action**
    *   [ ] Function `getSessionSigsWithPermittedLitAction` in `lit.ts`.
    *   Takes `litNodeClient`, `pkpPublicKey`, `chain`, `litActionIpfsCid`, `jsParams`.
    *   Calls `litNodeClient.getLitActionSessionSigs` passing the *IPFS CID* (or base64 of code if preferred, but CID makes more sense for *permitted* actions) and `jsParams`.
*   [ ] **Task 2.2: UI for Getting Session Sigs via Permitted Lit Action**
    *   [ ] UI section/button in `wallet/+page.svelte` allowing user to input an IPFS CID of a permitted action and trigger `getSessionSigsWithPermittedLitAction`.
*   [x] **Task 2.3: Implement Gnosis Passkey Verification Lit Action & Session Sigs**
    *   [x] Export `FACTORY_ADDRESS`, `FCL_VERIFIER_ADDRESS`, `EIP1271_MAGIC_VALUE` from `passkeySigner.ts`.
    *   [x] Define `gnosisPasskeyVerifyActionCode` string in `lit.ts`.
        *   Action uses `Lit.Actions.ethCall` to call `isValidSignature` on deployed Gnosis proxy.
        *   Falls back to `isValidSignatureForSigner` on Gnosis factory.
        *   Uses `JS_EIP1271_MAGIC_VALUE` for verification.
    *   [x] Implement `getSessionSigsWithGnosisPasskeyVerification` in `lit.ts` (direct execution model).
        *   Takes `messageToSign`, `assertionResponse`, `passkeyData`.
        *   Prepares `jsParams` (including `formattedSignature`, pubkey coordinates, contract addresses).
        *   Calls `litNodeClient.getLitActionSessionSigs` with the full `gnosisPasskeyVerifyActionCode`.
    *   [x] Add UI in `wallet/+page.svelte` for this direct execution flow (Method C).

### Phase 3: Advanced Features & Refinements

*   [ ] **Task 3.1: Viewing All Permitted Auth Methods & Actions**
    *   [ ] Implement `getPermittedAuthMethodsForPkp` in `lit.ts` (requires fixing ABI/read method - *see previous attempt*).
    *   [ ] Implement `getPermittedActionsForPkp` in `lit.ts` (using similar contract read pattern for the relevant function).
    *   [ ] UI in `wallet/+page.svelte` to fetch and display lists of permitted auth methods (type, ID) and permitted actions (IPFS CID) for the `pkpTokenIdInput`.
*   [ ] **Task 3.2: Removing Permitted Auth Methods / Actions**
    *   [ ] Functions in `lit.ts` for `removePermittedAuthMethod` and `removePermittedAction` (using `walletClient.writeContract`).
    *   [ ] UI elements for removal.
*   [ ] **Task 3.3: Gas Estimation**
    *   [ ] Implement gas estimation for permission management functions.
*   [ ] **Task 3.4: Multi-Factor Lit Actions**
    *   [ ] Design/implement advanced Lit Actions.

### Documentation & Testing

*   [ ] **Task D.1: Update all relevant code comments.**
*   [ ] **Task D.2: Write comprehensive tests for all new functionalities.**
*   [ ] **Task D.3: Update this `PKP_PASSKEY.md` document as implementation progresses.**

This plan provides a structured approach. Tasks can be parallelized where appropriate.
Make sure to handle errors gracefully and provide informative feedback to the user at each step. 