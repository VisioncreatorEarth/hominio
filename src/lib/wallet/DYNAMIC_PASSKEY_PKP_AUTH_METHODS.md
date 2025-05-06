# Dynamic PKP Minting with Passkey & Action Auth

This document outlines an approach to dynamically mint Lit Protocol Programmable Key Pairs (PKPs) where the primary control mechanism is a user's Passkey, verified by a specific Lit Action, rather than relying on an initial EOA owner.

## Goal

Instead of manually adding permissions to a pre-existing PKP, the aim is to:
1.  Allow a user to create a standard W3C Passkey.
2.  Upon user request (after passkey creation), mint a *new* PKP NFT on the Lit network (Chronicle testnet).
3.  During the minting process, configure the PKP's permissions such that:
    *   The **Passkey** itself is added as a permitted authentication method (using a custom type derived from its `rawId`). This method should likely have **no signing scopes** (`scopes: []`), meaning it only serves to authenticate the user to the Lit Action.
    *   A specific **Lit Action** (e.g., `gnosisPasskeyVerifyActionCode`, identified by its IPFS CID) is added as a permitted authentication method with **signing/execution scopes** (`scopes: [1n]`). This action will be responsible for verifying the passkey signature and gating access.
    *   Critically, the ownership of the newly minted PKP NFT is transferred to the **PKP's own derived Ethereum address** (`sendPkpToItself: true`). This removes the minting EOA as the default controller.
4.  The user can then obtain `SessionSigs` for this PKP solely by authenticating with their Passkey, which is verified by the registered Lit Action.
5.  The EOA wallet is only required to pay the gas fees for the initial minting transaction.

This creates a PKP wallet controlled directly by the user's device-bound passkey, mediated by a trusted Lit Action, without a separate EOA controller dependency.

## Implementation Plan

- [x] 1.  **Use `@lit-protocol/contracts-sdk`:** Leverage the `LitContracts` class to interact with the Lit Protocol contracts on Chronicle.
- [x] 2.  **Identify Minting Function:** Utilize the `PKPHelper` contract's `mintNextAndAddAuthMethodsWithTypes` function. This allows setting auth methods atomically during minting and supports the `sendPkpToItself` flag.
- [x] 3.  **Create `mintPKPWithPasskeyAndAction` Function (in `lit.ts`):**
    - [x] Accepts Viem `walletClient` (for EOA signer), `eoaAddress`, `passkeyAuthMethodId`, and the `gnosisVerifyActionCode` string.
    - [x] Instantiates `LitContracts` using the EOA `walletClient` as the `signer`.
    - [x] Calculates the IPFS CID (bytes) of the `gnosisVerifyActionCode`.
    - [x] Prepares parameters for `mintNextAndAddAuthMethodsWithTypes`:
        - [x] `keyType`: 2 (ECDSA k256)
        - [x] Passkey Auth Method: `type = AUTH_METHOD_TYPE_PASSKEY`, `id = passkeyAuthMethodId`, `pubkey = '0x'`, `scopes = []`
        - [x] Action Auth Method: `type = 2`, `id = actionCidBytes`, `scopes = [[1n]]` (SignAnything)
        - [x] `addPkpEthAddressAsPermittedAddress = false`
        - [x] `sendPkpToItself = true`
    - [x] Calls `contractClient.pkpHelperContract.write.mintNextAndAddAuthMethodsWithTypes(...)`.
    - [x] Waits for the transaction receipt.
    - [x] **Extracts the `tokenId`:** Parses the receipt logs to find the `Transfer` event from the PKPNFT contract (topic[0] = event signature, topic[1] = from (address(0)), topic[2] = to (PKP address), topic[3] = tokenId). Use Viem's `decodeEventLog`.
    - [x] **Fetches PKP Details:** Uses the extracted `tokenId` to call `pkpPermissionsContract.read.getPubkey(tokenId)` and `pkpPermissionsContract.read.getEthAddress(tokenId)`.
    - [x] Returns the `tokenId`, `pkpPublicKey`, and `pkpEthAddress`.
- [ ] 4.  **Refactor UI (`+page.svelte`):**
    - [ ] Remove static PKP constant definitions.
    - [ ] Add Svelte state variables (`mintedPkpTokenId`, `mintedPkpPublicKey`, `mintedPkpEthAddress`, `isMintingPkp`, etc.).
    - [ ] Add a "Mint PKP for Passkey" button/section triggered after passkey creation.
    - [ ] Implement `handleMintPkp` handler to call the new `mintPKPWithPasskeyAndAction` function and update state.
    - [ ] Remove the old "Register Auth Methods" UI section.
    - [ ] Update "Fetch Auth Methods", "Get Session Sigs", and "PKP Operations" sections to use the dynamic `mintedPkp...` state variables and disable them until a PKP is minted.
- [ ] 5.  **Clean up `lit.ts`:** Remove unused dummy auth code.

## Considerations

- [ ] *   **Minting Cost:** Ensure the EOA has enough funds on Chronicle to pay for the `mintNextAndAddAuthMethodsWithTypes` transaction.
- [ ] *   **Error Handling:** Robust error handling is needed for the minting process, log parsing, and subsequent contract reads.
- [ ] *   **Viem Signer Compatibility:** Double-check how `@lit-protocol/contracts-sdk` handles a Viem `walletClient` passed as a `signer` (it likely expects an Ethers v5 signer; adaptation might be needed, e.g., using `viemAdapters` or if the SDK handles it internally via `window.ethereum`).
- [ ] *   **Log Parsing:** Ensure the correct `Transfer` event signature and ABI are used for parsing the `tokenId` from the mint transaction logs.
- [ ] *   **Alternative: `mintWithAuth`:** Explore if the simpler `contractClient.mintWithAuth` helper function *can* be used with custom auth method types (like our passkey type) and the `sendPkpToItself` option. If so, it might simplify the minting call and avoid manual log parsing. This requires further investigation of the `contracts-sdk` source or examples. 