# HQL Data Visualization Strategies

## 1. Problem Statement

Hominio utilizes a custom, Lojban-inspired data model consisting of:

*   **Sumti:** Nodes representing entities, concepts, or values (identified by `pubKey`).
*   **Selbri:** Predicate types defining relationship structures (`x1` to `x5` places).
*   **Bridi:** Instances of relationships connecting `Sumti` according to a `Selbri`.

Data is queried using **LORO_HQL**, a JSON-based language for graph traversal and data mapping.

Current visualizations (e.g., in `NodesProps.svelte`, `/hql` page) primarily rely on lists and textual detail views. While functional for displaying specific entity data and basic relationship lists, they lack the ability to effectively convey the overall interconnected structure of the graph data. Understanding complex relationships, discovering patterns, and exploring the data landscape visually is challenging with the current approach.

The goal is to explore and define better visualization strategies that leverage the graph nature of the data model, making it easier to understand and interact with the information stored within Hominio.

## 2. Potential Visualization Strategies

Based on the graph structure and query capabilities, several visualization strategies can be considered:

### 2.1. Interactive Node-Link Graph (Force-Directed Layout)

*   **Concept:** Represent `Sumti` as nodes and `Bridi` as edges. `Selbri` types determine edge appearance/labels. Layout algorithms position nodes based on connections.
*   **Pros:** Intuitive for network structure, exploration of local neighborhoods, identifying clusters/central nodes. Highly interactive.
*   **Cons:** Can suffer from visual clutter ("hairball") with large datasets. Computationally intensive layout. May require focused views (e.g., N-hop neighbors).
*   **Relevance:** Strong fit for visualizing specific `Sumti` contexts and their direct/indirect relationships via various `Bridi`.

### 2.2. Layered/Hierarchical Graph Layout

*   **Concept:** Arrange nodes in layers based on hierarchical relationships (e.g., inferred from `gunka` linking tasks to projects).
*   **Pros:** Clear for showing flow, dependency, or containment if a hierarchy exists.
*   **Cons:** The core model is more graph-like than strictly hierarchical. May only suit specific subsets of data.
*   **Relevance:** Limited general applicability but could be useful for specific views like project breakdowns.

### 2.3. Radial Layouts

*   **Concept:** Place a central node and arrange related nodes in concentric circles.
*   **Pros:** Good focus on a single node's immediate connections.
*   **Cons:** Less effective for showing relationships between peripheral nodes. Potential for wasted space.
*   **Relevance:** Could serve as an alternative focused view when a `Sumti` is selected.

### 2.4. Matrix View (Adjacency Matrix)

*   **Concept:** A grid where rows/columns are `Sumti`. Cells indicate `Bridi` connections between them, potentially colored/symbolized by `Selbri`.
*   **Pros:** Scales better for dense graphs. Clearly shows direct link presence/absence. Good for pattern spotting.
*   **Cons:** Less intuitive for pathfinding or topology. Doesn't easily represent `x1-x5` roles directly. Requires `Sumti` ordering.
*   **Relevance:** Potentially useful for analyzing connectivity within specific groups of `Sumti`.

### 2.5. Enhanced Table/List Views

*   **Concept:** Improve existing lists with interactive features (sorting, filtering) and crucially, cross-linking `pubKey` references between tables/views.
*   **Pros:** Familiar UI. Excellent for detailed attribute viewing and structured filtering.
*   **Cons:** Poor at visualizing the *connections* and overall graph structure directly. Requires navigation effort to follow links.
*   **Relevance:** Essential for browsing and managing lists of entities (`Sumti`, `Selbri`, `Bridi`), complements graph views.

### 2.6. Combined Coordinated Views

*   **Concept:** Integrate multiple views that interact with each other (e.g., a graph view coordinated with a detail panel and a filterable list).
*   **Pros:** Leverages the strengths of different visualizations. Provides both overview and detail. Highly flexible.
*   **Cons:** More complex development. Requires careful design for layout and view coordination.
*   **Relevance:** Likely the most practical and powerful approach. Allows users to explore structure visually while accessing specific details efficiently.

## 3. Discussion & Comparison

*   **Graph Exploration:** Node-Link diagrams excel at showing the *structure* of relationships, which is currently lacking.
*   **Detail Inspection:** Enhanced Tables/Lists remain crucial for viewing specific data attributes and bulk browsing.
*   **Scalability:** For larger graphs, Node-Link diagrams need mitigation strategies (filtering, aggregation, focused views). Matrix views handle density better but are less intuitive.
*   **User Experience:** Combined Views offer the most flexibility, allowing users to switch between structural overviews and detailed inspection as needed.

## 4. Proposed Visualization Style & Architecture

A multi-faceted approach combining different visualization types seems most appropriate. The core interactive component could be:

**Option A: General Purpose Coordinated View (Initial Proposal)**

1.  **Primary Graph View (Node-Link):** General exploration using force-directed layout with Bridi reification (as described above).
2.  **Detail Panel:** Shows data for selected node/edge.
3.  **Enhanced List/Table Views:** For browsing/filtering.

**Option B: Sumti-Centric Radial View (Focused Exploration)**

This addresses the desire for a view centered on a specific entity.

1.  **Layout:** Strictly radial. The currently selected `Sumti` node is placed at the center.
2.  **First Ring (Relationships):** Nodes representing the `Bridi` instances that the central `Sumti` participates in are arranged in the first ring. These nodes should be visually distinct and potentially smaller than `Sumti` nodes (e.g., diamonds, small dots) to act as connection points.
3.  **Second Ring (Neighbors):** Nodes representing the *other* `Sumti` participating in the `Bridi` from the first ring are placed in the second ring (or subsequent rings if needed).
    *   **Neighbor Properties:** Key properties of these neighbor `Sumti` (e.g., their name fetched via HQL, or primary `datni.vasru`) should be displayed on or near the node.
4.  **Edges & Labeling:**
    *   An edge connects the **Center `Sumti`** to each **`Bridi` node** in the first ring. This edge is labeled with the *place* the center `Sumti` occupies in that `Bridi` (e.g., 'x1').
    *   Edges connect each **`Bridi` node** (first ring) to its corresponding **participant `Sumti` nodes** in the outer rings. These edges are labeled with the *place* the outer `Sumti` occupies (e.g., 'x2', 'x3').
5.  **Interaction:**
    *   Clicking any `Sumti` node (center or outer ring) re-centers the radial visualization on that `Sumti`.
    *   Clicking a `Bridi` node (first ring) highlights its connections and displays its full details (Selbri type, all participants) in the Detail Panel.
6.  **Detail Panel:** Complements the radial view, showing full details of the selected central `Sumti`, a selected `Bridi`, or a selected neighbor `Sumti`.
7.  **Data Fetching:** When a `Sumti` is selected, an HQL query fetches all `Bridi` it participates in (`traverse` with `*` or specific selbri/place) and resolves the *other* participants (`resolve`) along with their key properties.

**Combining Approaches:** The application could offer both the general force-directed view (Option A) for overview and the Sumti-centric radial view (Option B) for focused exploration, possibly toggling between them or using the radial view when a node is double-clicked in the general view.

---

*(Original points 2, 3, 4 about Detail Panel, List Views, Data Fetching, and Tech Considerations still apply to both options)*

2.  **Detail Panel:**
    *   A panel that displays the detailed `ckaji` and `datni` information for the `Sumti` or `Bridi` currently selected in the graph view or a list view.
    *   When a `Bridi` node is selected, clearly list all its participants (`x1`-`x5`) and their linked `Sumti`.
    *   When a `Sumti` node is selected, list the `Bridi` it participates in.
    *   This panel could also show direct relationships in a structured list format (similar to `NodesProps` but potentially cleaner).

3.  **Enhanced List/Table Views:**
    *   Maintain and enhance table-based views (like in `/hql`) for browsing all `Sumti`, `Selbri`, or `Bridi` (potentially filtered).
    *   Implement robust filtering and sorting.
    *   **Crucially:** Make all `pubKey` references clickable links that either:
        *   Focus the graph view on that entity.
        *   Navigate to the detail view/table row for that entity.

4.  **Data Fetching:**
    *   Visualization components will need to dynamically construct and execute LORO_HQL queries based on user interactions (e.g., selecting a node, requesting expansion).
    *   Queries should be optimized to fetch only the necessary data for the current view to maintain performance. For graph views, this might involve fetching a central node and then iteratively fetching neighbors via `traverse` or `resolve`.

**Technology Considerations:**

*   **Frontend:** Svelte/SvelteKit
*   **Graph Libs:** Cytoscape.js (feature-rich graph library), D3.js (lower-level control), Vis.js (easier setup for basic graphs).
*   **Table Libs:** Consider Svelte-specific table libraries or build custom components.

This combined architecture provides a powerful way to explore the Hominio data, balancing visual structure exploration with detailed data access. 

## 5. Achieving a Sumti-Centric View (Refinements)

*(This section is now largely covered by Option B above, but visual hierarchy techniques can still apply to Option A or B)*

While the reification approach (Bridi as node) accurately models the data, it can visually place relationships on par with entities. To emphasize the `Sumti` (entities) within *any* graph view:

*   **Visual Hierarchy:** De-emphasize the `Bridi` nodes relative to `Sumti` nodes. Make `Sumti` nodes larger, brighter, or use distinct icons. Render `Bridi` nodes as smaller dots or use muted colors. Use thinner/dashed lines for the `Bridi` <-> `Sumti` connections.
*   **Interaction-Based Simplification (Optional - Mainly for General View):**
    *   Initially, consider *hiding* the intermediate `Bridi` nodes.
    *   Draw conceptual edges directly between `Sumti` nodes that participate in the *same* `Bridi`.
    *   Associate the underlying `Bridi` data with these conceptual `Sumti-Sumti` edges.
    *   On hover/click of a conceptual edge (or a connected `Sumti`), reveal the actual intermediate `Bridi` node(s) and their precise `x1-x5` connections, or list details in the panel.
    *   This provides a cleaner initial view focused on entity connections, with details available on demand.
*   **Layout Choice:** For exploring a specific `Sumti`'s context, consider offering a Radial layout option where the selected `Sumti` is central.

Combining these refinements allows the visualization to prioritize `Sumti` while retaining the ability to inspect the detailed n-ary `Bridi` structure when necessary. 