# Action Plan: Laptop Vibe Editor Section

## 1. Deconstruct Problem

*   **Current Status:** The Hominio landing page (`src/routes/+page.svelte`) consists of several informational sections. There is no section showcasing the "vibe editor" or a laptop UI mockup.
*   **Problematic Weak Points:** Lack of visual representation for the upcoming "vibe editor" feature.
*   **Goal:** Introduce a new section displaying a laptop-style mockup with a representation of the "VIBE CREATOR mac app" and a "soon" button, to be placed after the `GameChanger` section.
*   **Assumptions Challenged:**
    *   The "VIBE CREATOR" is a static mockup, not functional. (Confirmed by "soon" button)
    *   "Rose color" can be interpreted from the existing palette (e.g., `rosy-brown`).
*   **Core Variables & Dependencies:** New Svelte component, Tailwind CSS, modification of `+page.svelte`, existing color palette.
*   **Smallest Actionable Units:**
    *   Define color for "rose color" (using `rosy-brown`).
    *   Create `VibeEditorSection.svelte`.
    *   Implement laptop-style visual structure using Tailwind CSS.
    *   Implement static "VIBE CREATOR mac app" mockup inside the screen using Hominio colors.
    *   Implement "soon" button.
    *   Integrate `VibeEditorSection.svelte` into `+page.svelte`.
    *   Update scroll navigation in `+page.svelte`.

## 2. Solution Engineering

*   **Wanted Final Product:** A visually appealing and responsive section on the landing page that hints at the upcoming "vibe editor" feature, fitting the existing design language, using a custom Tailwind CSS laptop-style mockup.
*   **Strategic Intervention Points:**
    *   `src/lib/components/sections/hominio/VibeEditorSection.svelte` (modification)
    *   `src/routes/+page.svelte` (no change from previous integration)
*   **Prioritization (Impact/Effort):**
    1.  Component structure and basic styling (already exists).
    2.  Custom Tailwind Laptop frame.
    3.  "VIBE CREATOR mac app" content mockup.
    4.  "Soon" button (already exists, may need position adjustment).
    5.  Integration and navigation update (already done).
    6.  Responsive refinements.
*   **Success Metrics:**
    *   New section renders correctly after `GameChanger`.
    *   Laptop-style UI is visually convincing using Tailwind CSS.
    *   "VIBE CREATOR mac app" mockup is clear and uses Hominio colors.
    *   "Soon" button is present and styled with `rosy-brown`.
    *   Section is responsive.
    *   Scroll navigation works for the new section.

## 3. Execution Plan

### Milestone 1: Create the `VibeEditorSection.svelte` Component (Largely complete, adapted)
    *   [x] Create file: `src/lib/components/sections/hominio/VibeEditorSection.svelte`.
    *   [x] Define a `sectionRef` prop for potential scroll navigation integration: `export let sectionRef: HTMLElement | null = null;`.
    *   [x] Set up the basic section structure with Tailwind CSS (e.g., padding, background `bg-linen`, text `text-prussian-blue` similar to other sections).
    *   [x] Add a title for the section, e.g., "Craft Your Unique Vibes".

### Milestone 2: Implement the Laptop-style Mockup UI with Tailwind CSS
    *   [x] Remove previous iMac/DeviceMockup code.
    *   [x] Create the outer laptop-style frame (screen, base) using `div`s and Tailwind CSS.
    *   [x] Style the mockup to be centered and visually appealing, resembling a laptop.

### Milestone 3: Implement the "VIBE CREATOR mac app" Mockup within the Screen
    *   [x] Create a static representation of a mac app window (title bar with 3 dots) within the laptop screen.
    *   [x] Use Hominio color palette: `bg-prussian-blue` for app background, `text-linen`, `text-persian-orange`.
    *   [x] Display a microphone icon.
    *   [x] Add text: "Create a Vibe with just your voice on our VIBE CREATOR mac app."
    *   [x] Add subtle abstract UI elements for a fuller look.

### Milestone 4: Add the "Soon" Button (Largely complete, position reviewed)
    *   [x] Create a button element.
    *   [x] Style the button with Tailwind CSS:
        *   [x] Position: To the right of the laptop mockup.
        *   [x] Background color: `bg-rosy-brown` (our "rose color").
        *   [x] Text color: `text-linen` or similar contrasting color.
        *   [x] Padding, rounded corners, "soon" text.
        *   [x] Maybe a subtle hover effect.

### Milestone 5: Integrate `VibeEditorSection.svelte` into `+page.svelte` (Complete)
    *   [x] Open `src/routes/+page.svelte`.
    *   [x] Import `VibeEditorSection.svelte`.
    *   [x] Declare a new state variable for its ref: `let vibeEditorSection: HTMLElement | null = $state(null);`.
    *   [x] Instantiate the component after `GameChangerSection` and before `MarketplaceSection`: `<VibeEditorSection bind:sectionRef={vibeEditorSection} />`.
    *   [x] Add `vibeEditorSection` to the `sectionsToObserve` array in the correct order.
    *   [x] Ensure the side-dot navigation updates correctly to include the new section.

### Milestone 6: Testing and Refinement
    *   [x] Test the page on different screen sizes (desktop, tablet, mobile).
    *   [x] Adjust Tailwind classes for responsiveness of the laptop mockup, app content, and button.
    *   [x] Ensure consistent styling with the rest of the Hominio page.
    *   [x] Verify scroll navigation.

## 4. Further Documentation/References Needed
*   Confirmation on the exact "rose color" if `rosy-brown` (e.g. `bg-rosy-brown`) is not the intended one. (Used `bg-rosy-brown`).
*   The current laptop-style mockup is built with Tailwind CSS as requested. Further refinements might be needed based on visual feedback. 