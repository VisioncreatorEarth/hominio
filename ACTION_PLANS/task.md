# Action Plan: Roadmap Phases Display

## 1. Current Status Quo Analysis

*   **`src/routes/roadmap/+page.svelte`:** Currently a placeholder file with the text "roadmap view". It needs to be implemented to display the roadmap content.
*   **`src/roadmap/config.ts`:** Contains a `roadmapConfig` object with an array of `phases`. Each phase object has `name`, `description`, and `tokenSupply` which are required for display. Other properties like `chainId`, `contracts`, etc., are not immediately relevant for this initial display task but might be for future enhancements.
*   **Styling:** The project has an established color palette (`prussian-blue`, `timberwolf-1`, `linen`, etc.) and font families (`ibm-plex-sans`, `playfair-display`) defined in `src/app.css` via an `@theme` block. These should be leveraged for a consistent look and feel. The main landing page (`src/routes/+page.svelte`) serves as a style reference.
*   **Component Structure:** The user requests that each phase be displayed using a new Svelte component. This promotes reusability and modularity.

**Problematic Week Points:**
*   The roadmap page is not implemented.
*   No dedicated component exists for displaying phase information.
*   Clarity on the exact visual layout of each phase card/section is needed, but we can start with a basic structure and refine.

## 2. Wanted Final Product / Architecture / Solution

**Wanted Final Product:**
A visually distinct and informative `/roadmap` page. This page will:
1.  Display a clear title for the roadmap.
2.  Iterate through the 7 phases defined in `src/roadmap/config.ts`.
3.  For each phase, display:
    *   Phase Name (Title)
    *   Phase Description
    *   Token Supply
4.  The layout should be clean, readable, and utilize the project's existing color palette and typography. Inspiration will be drawn from `src/routes/+page.svelte` for styling.
5.  Each phase's information should be presented in a card-like or section-based format.

**Proposed Architecture:**
1.  **`src/routes/roadmap/+page.svelte`:**
    *   Imports `roadmapConfig` from `../../../roadmap/config.ts` (note the path difference from within `src/lib`).
    *   Contains the main layout structure for the roadmap page (e.g., a title, a grid or flex container for the phase cards).
    *   Loops through `roadmapConfig.phases`.
    *   For each phase, it instantiates a `PhaseCard.svelte` component, passing the phase data as a prop.
2.  **`src/lib/components/roadmap/PhaseCard.svelte`:**
    *   A new Svelte component.
    *   Accepts a `phase` object (matching the structure in `roadmapConfig.phases`) as a prop.
    *   Displays the `phase.name`, `phase.description`, and `phase.tokenSupply` in a well-formatted manner.
    *   Styled using Tailwind CSS classes, consistent with the project's theme.
3.  **Directory Structure:**
    *   New components related to the roadmap page will reside in `src/lib/components/roadmap/`.

**Clarifications/Questions for User (Optional - will proceed with assumptions if not answered):**
*   Is there a preference for a horizontal (timeline-like) or vertical (stacked cards/sections) layout for the phases? (Will assume vertical stacking for now).
*   Are there any specific icons or visual elements desired for each phase card beyond text? (Will assume text-only for now).

## 3. Execution Plan

### Milestone 1: Basic Structure and Data Display

*   **Task 1.1:** Create the directory `src/lib/components/roadmap/`.
    *   [ ] Create directory.
*   **Task 1.2:** Create `src/lib/components/roadmap/PhaseCard.svelte`.
    *   [ ] Define props: `export let phase: any;` (will type more strictly based on `roadmapConfig` structure).
    *   [ ] Basic HTML structure within `PhaseCard.svelte` to display `phase.name`, `phase.description`, and `phase.tokenSupply`.
    *   [ ] Apply initial Tailwind classes for basic styling (e.g., padding, border, background from the theme like `bg-timberwolf-1`, text colors like `text-prussian-blue`).
*   **Task 1.3:** Modify `src/routes/roadmap/+page.svelte`.
    *   [ ] Import `roadmapConfig` from `../../../roadmap/config.ts`.
    *   [ ] Import the new `PhaseCard.svelte` component from `$lib/components/roadmap/PhaseCard.svelte`.
    *   [ ] Add a main title for the roadmap page (e.g., "Hominio Roadmap").
    *   [ ] Create a loop (`{#each roadmapConfig.phases as phase}`) to iterate through the phases.
    *   [ ] Inside the loop, render `<PhaseCard {phase} />`.
    *   [ ] Add a container (e.g., a `div` with `grid` or `flex flex-col` and `gap`) to arrange the `PhaseCard` components.
*   **Task 1.4:** Initial Testing.
    *   [ ] User verifies that the roadmap page displays all 7 phases with their correct name, description, and token supply.
    *   [ ] User verifies basic styling is applied and readable.

### Milestone 2: Styling and Refinement

*   **Task 2.1:** Refine styling for `PhaseCard.svelte`.
    *   [ ] Apply more sophisticated Tailwind classes inspired by `src/routes/+page.svelte` for a polished look (e.g., typography for titles (`font-playfair-display`), body text (`font-ibm-plex-sans`), card shadows, rounded corners, spacing).
    *   [ ] Ensure good visual hierarchy within each card.
*   **Task 2.2:** Refine layout styling in `src/routes/roadmap/+page.svelte`.
    *   [ ] Adjust grid/flex container properties for optimal spacing and responsiveness.
    *   [ ] Ensure the page title is well-styled.
*   **Task 2.3:** Responsive Design Check.
    *   [ ] User tests the roadmap page on different screen sizes (mobile, tablet, desktop) to ensure readability and good layout.
    *   [ ] Make necessary Tailwind responsive adjustments (e.g., `md:`, `lg:` prefixes).
*   **Task 2.4:** Final Testing.
    *   [ ] User confirms all styling and layout requirements are met.
    *   [ ] User confirms responsiveness.

### Documentation References Needed:

*   `src/roadmap/config.ts` (already provided and analyzed)
*   `src/routes/+page.svelte` (for styling inspiration - already provided and analyzed)
*   `src/app.css` (for theme variable names - already available)

This plan focuses on delivering a functional and visually aligned roadmap page. Future enhancements (like interactivity, detailed contract views per phase, etc.) can be separate milestones.
