# PKP Wallet & Settings UI Refactor Execution Plan

**Objective:** Refactor the monolithic `src/routes/me/wallet/+page.svelte` into two distinct pages (`me/settings` and `me/wallet`) with improved UI/UX, separating setup/configuration from active wallet usage.

**Date:** 2024-05-08

## 1. Analysis of Current State & Problems:

*   **Current State:** The file `src/routes/me/wallet/+page.svelte` currently handles the entire lifecycle of PKP management: passkey creation, EIP-1271 signer deployment, PKP minting, viewing auth methods, authenticating the PKP session via passkey, performing PKP operations (signing, actions), managing an encrypted profile, and viewing capacity credits.
*   **Problems:**
    *   **Single Responsibility Principle:** The page does too much, mixing one-time setup (passkey, deploy, mint) with ongoing usage (operations, profile).
    *   **User Experience:** A user primarily interested in *using* their PKP wallet (signing, actions, profile) has to navigate through setup steps they've already completed. The stepper UI isn't ideal once setup is done.
    *   **Maintainability:** A large single file handling disparate concerns is harder to manage and update.

## 2. Desired Final State:

*   **`src/routes/me/settings/+page.svelte`:**
    *   **Purpose:** Handles the initial setup ("registration") and ongoing configuration/viewing of the underlying PKP setup.
    *   **Content:** Sections for Passkey Management (Step 0), Deploy Signer (Step 1), Mint PKP (Step 2), View Auth Methods (Step 3), View Capacity Credits (Step 7).
    *   **Authentication:** Includes session resumption logic and an optional explicit "Login" / "Refresh Session" button to display the *status* of the PKP session relevant to the settings view.
    *   **UI:** Structured clearly into logical sections. Less emphasis on a strict step-by-step flow after initial setup. Design consistent with the application's theme (`Todos.svelte`, `HomeView.svelte`, etc.).
*   **`src/routes/me/wallet/+page.svelte`:**
    *   **Purpose:** Focuses purely on *using* the authenticated PKP. Acts as a gated page.
    *   **Content:**
        *   **If `!sessionSigs`:** Shows a "Login" section with the "Login with Passkey" button and status messages (checking session, requires login, etc.). No other wallet content is visible.
        *   **If `sessionSigs`:** Shows the PKP Operations section (Signing, Actions - former Step 5) and Profile Management section (former Step 6).
    *   **Authentication:** Runs session resumption logic (`tryResumePkpSession`) on load. The Login section is the *only* content shown initially if resumption fails. Successful login (resumption or explicit button click) reveals the wallet content.
    *   **UI:** A conditional view: either the Login prompt *or* the Wallet Operations/Profile sections. Design consistent.
*   **Navigation:** Updated `/me` layout/navigation with distinct links for "Wallet" (`/me/wallet`) and "Settings" (`/me/settings`).

## 3. Execution Plan:

**Milestone 1: Setup New `settings` Page and Navigation**

*   - [ ] **Create File:** Create the directory `src/routes/me/settings/`.
*   - [ ] **Create Page:** Create `src/routes/me/settings/+page.svelte`. Copy the entire content of the current `src/routes/me/wallet/+page.svelte` into it as a starting point.
*   - [ ] **Create Load Function:** Create `src/routes/me/settings/+page.ts`. Add a basic `load` function to return title/description (e.g., `title: 'PKP Settings'`, `description: 'Manage your PKP passkey, signer, and configuration.'`).
*   - [ ] **Update Navigation:** Modify the relevant layout file (likely `src/routes/me/+layout.svelte` or a shared component) to add a navigation link pointing to `/me/settings` (labeled "Settings"). Ensure the existing "Wallet" link still points to `/me/wallet`.
*   - [ ] **Update Wallet Page Load:** Modify `src/routes/me/wallet/+page.ts` (or add it) to update the title/description (e.g., `title: 'PKP Wallet'`, `description: 'Use your PKP for signing and profile management.'`).
*   - [ ] **Initial Cleanup `wallet/+page.svelte`:** Remove the `steps` array and the stepper navigation UI (`<nav>...</nav>`) from `src/routes/me/wallet/+page.svelte`. Keep the main content structure for now.
*   **Test:**
    *   Run the app. Verify the new "Settings" link appears in the `/me` section navigation.
    *   Verify clicking "Settings" goes to `/me/settings` and shows the (currently duplicated) content.
    *   Verify clicking "Wallet" goes to `/me/wallet` and shows the content *without* the stepper navigation bar.

**Milestone 2: Migrate Setup/Config Logic to `settings/+page.svelte`**

*   - [ ] **Identify Code Blocks:** In `src/routes/me/settings/+page.svelte`, clearly identify the `<script>` logic and HTML sections corresponding to Steps 0, 1, 2, 3, and 7.
*   - [ ] **Remove Irrelevant Logic from `settings`:** Delete the `<script>` logic and HTML sections corresponding *only* to Steps 5 (PKP Operations) and 6 (Profile) from `src/routes/me/settings/+page.svelte`.
*   - [ ] **Keep Authentication Logic in `settings`:** Retain the `tryResumePkpSession` function call in `onMount`, the `handleGetSessionSigsGnosisPasskey` function (potentially rename for clarity, e.g., `handleRefreshSession`), and relevant state variables (`sessionSigs`, `sessionAuthMethod`, `isLoading...`).
*   - [ ] **Adapt Auth UI in `settings`:** Modify the former Step 4 UI block to primarily *display* the authentication status ("Session Active", "Inactive", "Resumed from cache") and optionally retain the explicit authentication button (now labeled e.g., "Login" or "Refresh Session Status"). Ensure it does *not* navigate away on success.
*   - [ ] **Refine `settings` UI Structure:** Remove the `{#if currentStepIndex === X}` blocks. Organize the remaining sections (0, 1, 2, 3, 7, and the adapted auth status display) logically within the page using clear headings and consistent styling.
*   - [ ] **Ensure Context Access:** Verify `getContext('o')` is still correctly used.
*   - [ ] **Verify State:** Double-check component state variables are correctly defined and used.
*   **Test:**
    *   Navigate to `/me/settings`. Verify only sections for Passkey, Signer, Mint PKP, Auth Methods, Capacity Credits, and PKP Auth Status/Button are present.
    *   Test the full setup flow on the `settings` page: Create Passkey -> Deploy Signer -> Mint PKP. Verify data is stored and reflected.
    *   Test fetching Auth Methods and Capacity Credits.
    *   Test that the authentication status display updates correctly after resumption or explicit authentication/refresh on this page.

**Milestone 3: Refine `wallet/+page.svelte` for Gated Operations**

*   - [ ] **Identify Code Blocks:** In `wallet/+page.svelte`, identify logic/HTML for Steps 4 (Login), 5 (Operations), 6 (Profile).
*   - [ ] **Remove Irrelevant Logic from `wallet`:** Delete script logic/HTML *only* for Steps 0, 1, 2, 3, and 7.
*   - [ ] **Implement Gating Logic:**
    *   Keep the session resumption logic (`tryResumePkpSession` on mount) and the explicit authentication logic (`handleGetSessionSigsGnosisPasskey` - rename to `handleLoginWithPasskey`).
    *   Rename the button/section for explicit authentication (former Step 4) clearly to "Login".
    *   Use an `{#if sessionSigs}` block to conditionally render the actual wallet content (PKP Operations - Step 5, Profile - Step 6).
    *   If `!sessionSigs`, the page should display the "Login" section/button as the primary content, along with relevant status messages (e.g., "Checking session...", "Please login to use your wallet.").
*   - [ ] **Refine `wallet` UI Structure:** Remove `{#if currentStepIndex}`. Ensure a clean presentation: either the Login prompt *or* the Operations+Profile sections, based on `sessionSigs` state. Use consistent styling.
*   - [ ] **Ensure Context Access:** Verify `getContext('o')` is used correctly.
*   - [ ] **Verify State:** Check state variables for Login, Operations, Profile are correctly managed.
*   **Test:**
    *   Navigate to `/me/wallet` fresh (no session). Verify *only* the Login prompt/button and related status text is visible.
    *   Click "Login with Passkey". Verify passkey prompt appears, and upon success, the Operations/Profile sections become visible, and the Login prompt disappears.
    *   Reload the page. Verify session resumption works (brief "Checking session..." then Operations/Profile appear automatically).
    *   Test operations/profile functionality *after* successful login (either resumed or explicit).

**Milestone 4: Final Cleanup, Cross-Testing, and Documentation**

*   - [ ] **Code Review:** Examine `settings/+page.svelte` and `wallet/+page.svelte` for unused variables, imports, comments, or console logs. Ensure clean code.
*   - [ ] **Cross-Page Flow Testing:**
    *   Start fresh (clear passkey/PKP data).
    *   Go to `/me/settings`, complete steps 0, 1, 2.
    *   Reload `/me/settings`, verify PKP data persists and session status is shown (likely inactive initially).
    *   Go to `/me/wallet`. Verify automatic login via session resumption works and wallet content is shown.
    *   Perform operations in `/me/wallet` (sign, action, save profile).
    *   Go back to `/me/settings`. Verify auth status is shown as active.
    *   Clear passkey data from `/me/settings`.
    *   Go to `/me/wallet`. Verify Login prompt is shown.
*   - [ ] **Error Handling:** Test edge cases (network errors, contract reverts, user cancellations during setup/login).
*   - [ ] **Update `EXECUTION_PLAN.md`:** Mark completed tasks.
*   - [ ] **Update Other Docs:** If any other project documentation refers to the old wallet structure, update it. 