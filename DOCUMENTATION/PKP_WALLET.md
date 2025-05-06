# PKP Wallet with Passkey Authentication

This document outlines the architecture and user flows for the system enabling users to control Lit Protocol Programmable Key Pairs (PKPs) using W3C Passkeys as an authentication method, verified via Gnosis Chain contracts.

## Overview

The primary goal is to allow a user to:
1.  Create a device-bound Passkey.
2.  Deploy an associated EIP-1271 signer contract on Gnosis Chain.
3.  Register this Passkey as a permitted authentication method for a specific PKP on the Lit Protocol network (Yellowstone Chronicle testnet - Datil Dev net lit procotol).
4.  Register a specific Lit Action (which verifies passkey signatures against Gnosis contracts) as a permitted authentication method for the PKP.
5.  Obtain Lit Protocol `SessionSigs` for the PKP by authenticating with the registered Passkey, verified by the registered Lit Action.
6.  Use the obtained `SessionSigs` to perform operations with the PKP, such as signing messages or executing arbitrary Lit Actions.

This effectively allows the user's passkey, anchored to their device, to control a blockchain-agnostic PKP wallet.

## Tech Stack

*   **Frontend:** SvelteKit (using Svelte 5 syntax) & Tailwind CSS (inline classes)
*   **Blockchain Interaction (Client-side):** Viem (for EOA wallet interactions, contract calls on Chronicle/Gnosis)
*   **Lit Protocol:**
    *   `@lit-protocol/lit-node-client`: Core SDK for connecting to Lit nodes, generating session sigs, PKP operations.
    *   `@lit-protocol/auth-helpers`: For SIWE message generation (EOA auth).
    *   Lit Actions: Serverless functions running on Lit nodes, used here for passkey signature verification.
    *   Chronicle Testnet: Where PKP permissions are managed via the `PKPPermissions` contract.
*   **Passkeys:** W3C WebAuthn API (`navigator.credentials`) via browser.
*   **EIP-1271 / Passkey Contracts (Gnosis Chain):**
    *   Safe{Wallet} `SafeWebAuthnSignerFactory`: Used to deploy signer contracts.
    *   Deployed Signer Proxy Contract: An EIP-1271 compliant contract specific to the user's passkey.
*   **Server Environment:** SvelteKit Adapter (Node/Cloudflare etc.) - Lit Actions run serverlessly on Lit nodes.
*   **Build Tool:** Vite
*   **Package Manager:** bun
*   **Helper Libraries:**
    *   `ethers`: Used *inside* the Lit Action for interacting with the Ethers.js v5.7 provider made available globally. Also used client-side via `ethersUtils` for Base58 decoding.
    *   `ipfs-only-hash`: Used client-side to calculate the IPFS CID of Lit Action code before registration.

## Core Components

1.  **Frontend UI (`src/routes/wallet/+page.svelte`)**
    *   Provides UI sections for each step: connecting wallets, managing passkeys, deploying contracts, registering auth methods, fetching auth methods, generating session sigs, and performing PKP operations.
    *   Holds the application state (connection status, passkey data, session sigs, PKP details, etc.).
    *   Orchestrates calls to the logic modules (`passkeySigner.ts`, `lit.ts`).

2.  **Passkey & EIP-1271 Logic (`src/lib/wallet/passkeySigner.ts`)**
    *   `createAndStorePasskeyData`: Handles `navigator.credentials.create`, extracts public key coordinates, calculates a unique `authMethodId` (keccak256 of rawId), and stores data (rawId, coords, username, authMethodId) in `localStorage`.
    *   `getStoredPasskeyData`, `clearStoredPasskeyData`: Local storage management.
    *   `deployPasskeySignerContract`: Uses Viem and the connected EOA wallet to call `createSigner` on the `FACTORY_ADDRESS` on Gnosis Chain, deploying the EIP-1271 proxy. Stores the deployed address back into `localStorage`.
    *   `checkSignature`, `verifySignatureWithProxy`: Functions to verify a passkey signature against the Gnosis Factory or the deployed Proxy, respectively (used for testing EIP-1271 locally, not directly by the Lit Action auth flow).
    *   `formatSignatureForEIP1271`: Parses the raw passkey signature (`assertionResponse`) and formats it into the packed `bytes` structure expected by the Safe WebAuthn contracts.
    *   Exports constants like `FACTORY_ADDRESS`, `FCL_VERIFIER_ADDRESS`, `EIP1271_MAGIC_VALUE`, and `AUTH_METHOD_TYPE_PASSKEY`.

3.  **Lit Interaction Logic (`src/lib/wallet/lit.ts`)**
    *   `connectToLit`: Connects to the `datil-dev` Lit network.
    *   `createAuthNeededCallback`: Creates the callback function for EOA-based session signature generation, handling SIWE signing.
    *   `getSessionSigs`: Generates session sigs using the EOA flow (Method A).
    *   `registerPasskeyAuthMethod`: Uses Viem and the EOA wallet to call `addPermittedAuthMethod` on the `PKPPermissions` contract (Chronicle), registering the passkey (`AUTH_METHOD_TYPE_PASSKEY`, `authMethodId`).
    *   `addPermittedLitAction`: Calculates the IPFS CID of the provided Lit Action code string using `ipfs-only-hash`, converts CID to bytes, and uses Viem/EOA to call `addPermittedAuthMethod` on `PKPPermissions` (Chronicle) to register the action (Type 2, CID bytes).
    *   `getPermittedAuthMethodsForPkp`: Uses a direct Viem `publicClient.readContract` call to the Chronicle RPC to fetch registered auth methods for a PKP Token ID.
    *   `gnosisPasskeyVerifyActionCode` (string constant): Contains the JavaScript code for the Lit Action responsible for verifying passkey signatures.
    *   `getSessionSigsWithGnosisPasskeyVerification`:
        *   Takes the passkey assertion response.
        *   Formats the signature using `formatSignatureForEIP1271`.
        *   Prepares `jsParams` containing the signature, message hash, pubkey coords, contract addresses, and critically, the passkey's `authMethodType` and `authMethodId`.
        *   Calls `litNodeClient.getLitActionSessionSigs`. This method implicitly tells the Lit nodes to authenticate using a registered Lit Action (Type 2). The nodes identify the correct action using the IPFS CID of the `gnosisPasskeyVerifyActionCode` string (which must match a CID registered via `addPermittedLitAction`). The `jsParams` are passed securely to the executing action.
    *   `signWithPKP`: Uses `SessionSigs` and `litNodeClient.pkpSign` to sign a message hash with the PKP.
    *   `executeLitAction`: Uses `SessionSigs` and `litNodeClient.executeJs` to execute arbitrary JS code using the PKP context.

4.  **Configuration (`src/lib/wallet/config.ts`)**
    *   Defines the `chronicle` chain object for Viem.
    *   Exports `PKP_PERMISSIONS_CONTRACT_ADDRESS_DATIL_DEV`.
    *   Exports `PKP_PERMISSIONS_ABI`.

5.  **Lit Action Code (`gnosisPasskeyVerifyActionCode` in `lit.ts`)**
    *   Runs on the Lit nodes when triggered by `getLitActionSessionSigs`.
    *   Receives parameters via global `jsParams` injected by the Lit SDK.
    *   Checks for the global `ethers` object (v5.7).
    *   Attempts to get a Gnosis RPC URL using `Lit.Actions.getRpcUrl({ chain: 'xdai' })`.
    *   Falls back to a public Gnosis RPC URL (`https://rpc.gnosischain.com`) if `getRpcUrl` fails.
    *   Creates an `ethers.providers.JsonRpcProvider` using the determined RPC URL.
    *   Uses `ethers.utils.Interface` to encode `calldata` for the Gnosis contract calls.
    *   Performs `provider.call({ to: proxyAddress, data: calldata })` to call `isValidSignature` on the user's deployed proxy contract.
    *   Checks if the returned value `startsWith` the EIP-1271 magic value (`0x1626ba7e`).
    *   If the proxy isn't available or fails verification, it attempts the same process with the Gnosis `SafeWebAuthnSignerFactory` contract (`isValidSignatureForSigner`).
    *   If either verification succeeds, it calls `Lit.Actions.setResponse({ response: JSON.stringify({ verified: true, ... }) })`.
    *   If verification fails, it throws an error.

6.  **Smart Contracts (Gnosis - `passkeySigner.ts` constants)**
    *   `SafeWebAuthnSignerFactory`: Contract deployed by Safe team to create EIP-1271 signer proxies for passkeys.
    *   Signer Proxy: An individual contract deployed *per passkey* via the factory. Implements `isValidSignature` to verify signatures made by that specific passkey.

7.  **Smart Contracts (Chronicle - `config.ts` constants)**
    *   `PKPPermissions`: Lit Protocol contract managing which authentication methods (EOAs, Lit Actions, custom types like our passkey) are permitted to use which PKP Token IDs, and with which scopes (e.g., signing, execution).

## User Flows

*(Flows generally proceed through sections in `+page.svelte`)*

**1. Initial Setup:**
   - **Connect Lit:** `onMount` triggers `handleConnectLit` -> `connectToLit`. Establishes connection to Lit nodes.
   - **Connect Controller EOA:** User clicks button -> `handleConnectEoaWallet` -> uses Viem `createWalletClient` with `window.ethereum` (MetaMask) -> `requestAddresses`. Needed for on-chain permissioning transactions.

**2. Passkey Creation & Proxy Deployment:**
   - **Create Passkey:** User enters username -> clicks button -> `handleCreatePasskey` -> `createAndStorePasskeyData` -> `navigator.credentials.create` -> stores rawId (hex), pubkey coords, username, authMethodId (hash of rawId) in local storage.
   - **Deploy Proxy (Optional):** User clicks button -> `handleDeployContract` -> `deployPasskeySignerContract` -> EOA sends tx to Gnosis Factory -> `waitForTransactionReceipt` -> `getPasskeySignerContractAddress` predicts address -> address stored with passkey data in local storage.

**3. PKP Auth Method Registration (Requires EOA Connection):**
   - **Input PKP Token ID:** User enters the target PKP Token ID they want to control.
   - **Register Passkey:** User clicks button -> `handleRegisterPasskeyAuth` -> retrieves passkey `authMethodId` from local storage -> calls `registerPasskeyAuthMethod` -> EOA sends tx to `PKPPermissions` on Chronicle, adding an entry: `{ authMethodType: AUTH_METHOD_TYPE_PASSKEY (BigInt), id: authMethodId (Hex), userPubkey: '0x' }` with scope `[1n]` (SignAnything).
   - **Register Lit Action:** User confirms action code (defaults to `gnosisPasskeyVerifyActionCode`) -> clicks button -> `handleRegisterLitActionAuth` -> `addPermittedLitAction` -> calculates IPFS CID of the code -> EOA sends tx to `PKPPermissions` on Chronicle, adding an entry: `{ authMethodType: 2n, id: <IPFS_CID_Bytes> (Hex), userPubkey: '0x' }` with scope `[1n]` (SignAnything). **Note:** This step MUST be performed anytime the `gnosisPasskeyVerifyActionCode` string is modified.

**4. Fetching Permitted Auth Methods:**
   - User ensures PKP Token ID is entered -> clicks button -> `handleFetchPermittedAuthMethods` -> `getPermittedAuthMethodsForPkp` -> performs direct `readContract` call via Viem public client to Chronicle RPC -> displays returned methods.

**5. Generating Session Sigs (Passkey - Method C):**
   - User clicks "Get Session Sigs (Gnosis Passkey)" button.
   - `handleGetSessionSigsGnosisPasskey`:
     - Retrieves stored passkey data (rawId, coords, authMethodId, signerAddress).
     - Creates a challenge message (`Sign in...`) and hashes it (`keccak256`).
     - Prompts user for passkey signature via `navigator.credentials.get`, using the hashed message as the `challenge` and the stored `rawId`.
     - Formats the signature from the `assertionResponse` using `formatSignatureForEIP1271`.
     - Calls `getSessionSigsWithGnosisPasskeyVerification`, passing the PKP public key, original message, formatted signature, passkey data (including `authMethodId`, `AUTH_METHOD_TYPE_PASSKEY`, coords, proxy address), and chain ('xdai/gnosis').
     - `getSessionSigsWithGnosisPasskeyVerification` calls `litNodeClient.getLitActionSessionSigs({ pkpPublicKey, litActionCode: btoa(gnosisPasskeyVerifyActionCode), jsParams: {...} })`. **Crucially, this relies on the IPFS CID of the provided code having been previously registered as a Type 2 auth method.** The `jsParams` securely pass all necessary data for verification *inside* the action.
     - The Lit Nodes execute the `gnosisPasskeyVerifyActionCode` (details in Component #5 above).
     - If the action calls `Lit.Actions.setResponse({ verified: true, ...})`, the nodes generate and return `SessionSigs`.
     - Frontend stores `SessionSigs` and sets `sessionAuthMethod = 'gnosis-passkey'`.

**6. Generating Session Sigs (EOA - Method A):**
   - User clicks "Get Session Sigs (EOA)" button.
   - `handleGetSessionSigsEOA`:
     - Ensures Lit and EOA are connected.
     - Creates the `authNeededCallback` using `createAuthNeededCallback`.
     - Calls `litNodeClient.getSessionSigs({ ..., authNeededCallback })`.
     - Lit SDK triggers the callback.
     - Callback generates SIWE message via `createSiweMessageWithRecaps`.
     - EOA wallet signs the SIWE message.
     - `AuthSig` is returned to Lit SDK.
     - Lit nodes verify `AuthSig` against registered EOA (Type 1) auth method and return `SessionSigs`.
     - Frontend stores `SessionSigs` and sets `sessionAuthMethod = 'eoa'`.

**7. Using PKP with SessionSigs:**
   - **Sign Message:** User provides message -> clicks button -> `handleSignMessageWithPkp` -> `signWithPKP` -> hashes message -> calls `litNodeClient.pkpSign({ sessionSigs, pubKey, toSign: messageHash })` -> displays signature.
   - **Execute Action:** User provides parameters -> clicks button -> `handleExecuteLitAction` -> `executeLitAction` -> calls `litNodeClient.executeJs({ sessionSigs, code, jsParams })` -> displays result/logs.

## Key Concepts Summary

*   **PKP as Wallet:** The Lit PKP acts as the core wallet, capable of signing and interacting across blockchains.
*   **Controller EOA:** Used only for *permissioning* the PKP (registering auth methods via transactions on Chronicle). Not needed for generating session sigs via passkey/action or for using the PKP once session sigs are obtained.
*   **Passkey as Root Credential:** The user's device-bound passkey is the ultimate credential proving identity for this flow.
*   **Auth Method Types:** Different ways to prove permission to use a PKP (EOA=1, Action=2, Passkey=Custom Hash).
*   **Lit Action for Verification:** The action acts as a serverless function executed by Lit nodes to perform the complex Gnosis contract calls needed for passkey signature verification, bridging the gap between WebAuthn and on-chain EIP-1271.
*   **SessionSigs:** Short-lived capabilities granted by Lit nodes after successful authentication, used to authorize PKP operations.
*   **EIP-1271:** The standard allowing smart contracts (like the passkey signer proxy) to verify signatures.
*   **IPFS CID:** The content address of the Lit Action code, used as its unique identifier when registering it as a Type 2 auth method. 