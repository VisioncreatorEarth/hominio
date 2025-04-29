# Refactoring JSON HQL Query Engine

This document outlines the plan to refactor the JSON-based HQL query engine (`hominio-query.ts`) to support more complex, multi-step queries similar to the capabilities of the HQL string syntax.

## 1. Status Quo Analysis

The current JSON HQL implementation, defined by the `LoroHqlQuery` interface and processed by `executeQuery` in `src/lib/KERNEL/hominio-query.ts`, has a significant limitation:

*   **Single Map Phase:** It operates by defining starting points (`from`) and applying a single, potentially nested `map` structure to each starting node.
*   **Limited Dependencies:** While `resolve` and `traverse` allow fetching related data *within* the map definition applied to a single starting node or its direct relations, there's no mechanism to perform sequential lookups where the result of one lookup (e.g., finding a specific composite) directly informs the parameters or conditions of a subsequent, independent lookup (e.g., fetching details based on a value extracted from the first lookup).
*   **Contrast with HQL String:** The HQL string syntax overcomes this by allowing variable definitions (`task: { var: tciniLink.x1 }`) and subsequent usage (`x1: task`) across different query clauses (`find`, `get`, `select`), implicitly handling the sequential dependency.
*   **Impact:** Components like `QueryEditor.svelte` that rely on the JSON format cannot execute queries requiring these dependent steps, such as resolving a task's name and status simultaneously when they are linked via separate composite types (`tcini` and `cneme`).

## 2. Target Architecture: Steps-Based JSON HQL

To enable complex, sequential queries in the JSON format, we propose migrating to a `steps`-based architecture. This architecture functions like a **state machine**, where the query's `context` (holding variables) is the state, and each step transitions the state.

**Core Concepts:**

*   **Generality:** The engine is designed to be generic. It works with any Lojban schema/composite/leaf structures defined according to `*.data.ts` files, relying on schema IDs and field paths provided in the query, not hardcoded values.
*   **Sequential Execution:** Queries will be defined as an array of `steps`, executed in order.
*   **Context/Scope:** A context object (`ctx`) will persist across steps, storing results and variables defined in one step for use in subsequent steps.
*   **Defined Actions:** Each step will have a specific `action` (e.g., `find`, `get`, `select`).
*   **Variable Passing:** Steps can define variables (e.g., `resultVariable`, `variables`) that populate the context. Subsequent steps can reference these variables in their parameters (e.g., `target`, `from`, `conditions`).

**Proposed Type Definitions (Illustrative):**

```typescript
// Define possible step actions
type HqlStepAction = 'find' | 'get' | 'select'; // Add more? 'aggregate'? 'filter'?

// Base interface for a query step
interface LoroHqlStepBase {
    action: HqlStepAction;
    // Optional: Name to store the result(s) of this step for later reference in the context
    resultVariable?: string;
}

// Find composites/links based on schema and place values (potentially variables)
interface LoroHqlFindStep extends LoroHqlStepBase {
    action: 'find';
    target: {
        schema: string; // Schema pubkey (literal or variable reference?)
        // Places can be literals or references to variables from context
        x1?: string | { variable: string };
        x2?: string | { variable: string };
        x3?: string | { variable: string };
        x4?: string | { variable: string };
        x5?: string | { variable: string };
        // OR a more generic way to find composites involving a leaf in any place:
        // place?: '*'; // Indicate wildcard place
        // value?: string | { variable: string }; // The value (e.g., leaf pubkey) to find in the wildcard place
        // OR find based on index:
        // index?: string; // Name of an index (e.g., 'composites-by-component')
        // indexKey?: string; // Key within the index (potentially built from variables)
    };
    // Define variables to extract from the found composite(s)
    variables: {
        [varName: string]: { source: 'link.x1' | 'link.x2' | 'link.x3' | 'link.x4' | 'link.x5' | 'link.pubkey' /* | 'link.schemaId' ? */ };
    };
    return?: 'first' | 'array'; // How many composites to process
}

// Get details from specific documents (identified by variables)
interface LoroHqlGetStep extends LoroHqlStepBase {
    action: 'get';
    from: { variable: string } | { pubkey: string | string[] } | { type: 'Leaf' | 'Schema' | 'Composite' } ; // Allow getting by variable, direct pubkey(s), or all of type
    // Define fields to extract into the step's result (and potentially new variables)
    fields: {
        [outputName: string]: { field: string }; // e.g., { field: 'self.data.value' } or { field: 'doc.pubkey' }
    };
    // Optionally define new variables based on the extracted fields
    variables?: {
        [varName: string]: { source: string }; // e.g., { source: 'result.value' } or { source: 'result.id' }
    };
     return?: 'first' | 'array'; // Handle multiple inputs/outputs
}

// Select and structure the final output from context variables
interface LoroHqlSelectStep extends LoroHqlStepBase {
    action: 'select';
    // Define how to combine variables from context into the final result structure
    // Requires careful design for joining/mapping results from different steps.
    select: {
        [outputKey: string]: { variable: string } | { literal: unknown } | LoroHqlMapValue; // Allow direct var mapping, literals, or the existing nested map/resolve structure for flexibility?
    };
    // Explicitly define how to group/correlate results if needed
    // Option 1: Group by a variable value
    groupBy?: string; // Variable name (e.g., 'taskVar')
    // Option 2: Define explicit join conditions
    // join?: { on: string; sources: string[]; type: 'inner' | 'left' }; // More complex
}

// Union type for any step
type LoroHqlStep = LoroHqlFindStep | LoroHqlGetStep | LoroHqlSelectStep; // Add other potential steps as needed

// Redefined top-level query using steps
export interface LoroHqlQueryExtended {
    steps: LoroHqlStep[];
}

// The main executeQuery function will need to accept LoroHqlQueryExtended
```

**Execution Flow:**

1.  Initialize an empty context `ctx = {}`.
2.  Iterate through `query.steps`.
3.  For each `step`:
    *   Resolve any input variables (`{ variable: '...' }`) from `ctx`.
    *   Execute the step's `action` (e.g., perform `findCompositeDocsBySchemaAndPlace`, `getLeafDoc`, etc. based on the refined `target` structure).
    *   Populate `ctx` with any `variables` defined by the step. Store results indexed appropriately for later correlation (e.g., if results derive from an array variable, maintain that link).
    *   If `resultVariable` is defined, store the step's primary output (e.g., array of found composites, fetched leaf data) in `ctx[step.resultVariable]`.
4.  The final `select` step uses the populated `ctx` to construct the final `QueryResult[]`. This step **must contain logic** to handle potential one-to-many or many-to-many relationships accumulated in the context (e.g., using `groupBy` or other mechanisms to merge data based on a common identifier like a task ID).

## 3. Execution Plan

Refactoring the query engine requires changes across several parts of the codebase.

**Task Checklist:**

*   [ ] **Define Final Types:** Solidify the TypeScript interfaces for `LoroHqlQueryExtended` and all `LoroHqlStep` variants (including refined `find` target and `select` options) in `src/lib/KERNEL/hominio-query.ts`.
*   [ ] **Refactor `executeQuery`:** Rewrite the core logic of `executeQuery` in `src/lib/KERNEL/hominio-query.ts` to process the `steps` array sequentially, manage the context (`ctx`), handle variable resolution, and manage context structure for correlation.
*   [ ] **Implement `find` Step Logic:** Add logic within `executeQuery` to handle `action: 'find'`, supporting various `target` types (specific places, wildcard places with value, index lookups).
*   [ ] **Implement `get` Step Logic:** Add logic for `action: 'get'`, supporting fetching by variable, pubkey(s), or type. Extract fields using `selectFieldValue`.
*   [ ] **Implement `select` Step Logic:** Design and implement the final step (`action: 'select'`) to assemble the final results from the context. **Crucially, implement the chosen correlation/joining mechanism** (e.g., using `groupBy` or explicit joins) to correctly handle combining data from different steps based on shared variables.
*   [ ] **Define Error Handling:** Implement a strategy for handling errors within individual steps (e.g., stop execution, return partial results, allow optional steps).
*   [ ] **Update `processReactiveQuery`:** Modify `processReactiveQuery` in `src/lib/KERNEL/hominio-query.ts` to accept and correctly handle the new `LoroHqlQueryExtended` format (or maintain compatibility). Ensure reactivity works correctly with the potentially more complex/longer execution flow.
*   [ ] **Update Frontend Components:**
    *   [ ] **`QueryEditor.svelte`:** Update the component to accept/generate queries in the new JSON `steps` format. Adapt the UI if necessary.
    *   [ ] **Other Components:** Review components currently using `processReactiveQuery` or `executeQuery` with JSON queries (e.g., `SchemaQueries.svelte`, `LeafQueries.svelte`, `NodesProps.svelte`, `GraphView.svelte`, `IndexQueries.svelte`) and update their query definitions to the new format. Simple queries might translate easily, while more complex ones (like `NodesProps`) will need careful restructuring.
*   [ ] **Update `HQL.md` Documentation:** Update `DOCUMENTATION/HQL.md` to document the new JSON `steps` format alongside the existing string format, clearly explaining the steps, variables, and correlation logic.
*   [ ] **Testing:** Implement thorough tests for the refactored `executeQuery` with various step combinations, variable passing, correlation scenarios, and error conditions.
*   [ ] **Address Linter Errors:** Fix any TypeScript or Svelte linter errors introduced during the refactor.

## 4. Example: Todos Query in New JSON `steps` Format

This example shows how the query currently used in `Todos.svelte` (as an HQL string) could be represented using the proposed JSON `steps` format.

**Schema Public Keys (from seeding):**

*   `@schema/tcini`: `0xf4f64c16a96daf1d2b91269fe82946b21b7d1faa728ff20ed86a6c18dabc4943`
*   `@schema/cneme`: `0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96`

**Proposed JSON Query:**

```json
{
  "steps": [
    {
      "action": "find",
      "resultVariable": "tciniLinks", // Store the found tcini composite links
      "target": {
        "schema": "0xf4f64c16a96daf1d2b91269fe82946b21b7d1faa728ff20ed86a6c18dabc4943" // tcini schema
        // No place conditions, find all tcini links
      },
      "variables": {
        // Extract task and status leaf IDs for each link found
        "taskVar": { "source": "link.x1" },
        "statusLeafVar": { "source": "link.x2" },
        "tciniIdVar": { "source": "link.pubkey" } // Also get the composite's ID
      },
      "return": "array" // We expect multiple tasks
    },
    {
      "action": "get",
      "resultVariable": "statusDetails", // Store the fetched status leaf details
      "from": { "variable": "statusLeafVar" }, // Use the statusLeafVar from the previous step
      "fields": {
        "value": { "field": "self.data.value" }, // Get the LoroText value
        "statusLeafId": { "field": "doc.pubkey" } // Re-capture the leaf ID
      },
      "variables": {
        // Make the value easily accessible if needed later
         "statusValueVar": { "source": "result.value" }
      },
       "return": "array" // Input statusLeafVar might correspond to multiple links
    },
    {
      "action": "find",
      "resultVariable": "cnemeLinks", // Store the found cneme composite links
      "target": {
        "schema": "0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96", // cneme schema
        "x1": { "variable": "taskVar" } // Filter: Find cneme links WHERE x1 matches the taskVar from step 1
        // IMPORTANT: This assumes taskVar is unique enough to correlate correctly later.
      },
      "variables": {
        // Extract the name leaf ID for each matching link
        "nameLeafVar": { "source": "link.x2" },
        "cnemeIdVar": { "source": "link.pubkey" }
      },
      "return": "array" // Use array even if expecting one, easier join logic
    },
    {
      "action": "get",
      "resultVariable": "nameDetails", // Store the fetched name leaf details
      "from": { "variable": "nameLeafVar" }, // Use nameLeafVar from the previous step
      "fields": {
        "value": { "field": "self.data.value" }, // Get the LoroText value
        "nameLeafId": { "field": "doc.pubkey" } // Re-capture the leaf ID
      },
      "variables": {
         "nameValueVar": { "source": "result.value" }
       },
       "return": "array"
    },
    {
      // This step now explicitly groups by taskVar to correlate results
      "action": "select",
      "groupBy": "taskVar", // Key variable linking the results
      "select": {
         // These variables are available within each group
         "taskId": { "variable": "taskVar" }, // The grouping key
         "tciniCompositeId": { "variable": "tciniIdVar" }, // From tciniLinks group member
         "cnemeCompositeId": { "variable": "cnemeIdVar" }, // From cnemeLinks group member (assuming 1 per task)
         "nameLeafId": { "variable": "nameLeafVar" }, // From cnemeLinks group member
         "statusLeafId": { "variable": "statusLeafVar" }, // From tciniLinks group member
         "nameDetails": {
            // Value from the nameDetails result correlated by taskVar->nameLeafVar
            "value": { "variable": "nameValueVar" }
         },
         "statusDetails": {
            // Value from the statusDetails result correlated by taskVar->statusLeafVar
            "value": { "variable": "statusValueVar" }
         }
      }
    }
  ]
}
```

This query breaks down the process:
1.  Find all `tcini` links, extracting `taskVar`, `statusLeafVar`, and `tciniIdVar` for each.
2.  Get details (`value`, `statusLeafId`) for each `statusLeafVar`.
3.  Find `cneme` links where `x1` matches the `taskVar` from step 1, extracting `nameLeafVar` and `cnemeIdVar`.
4.  Get details (`value`, `nameLeafId`) for each `nameLeafVar`.
5.  Select the final structure, explicitly grouping by `taskVar` to combine information from the different steps correctly.

## 5. Examples for Other Views

Here's how queries from other components might look in the new `steps` format. Note that simple queries might be representable in fewer steps, potentially even a single `get` or `select` if the engine supports fetching all of a type directly.

### `SchemaQueries.svelte`

**1. `allSchemaQuery` (Fetch all schemas)**

```json
{
  "steps": [
    {
      "action": "get",
      "resultVariable": "schemaDetails",
      "from": { "type": "Schema" }, // Use the generic 'get by type'
      "fields": {
        "id": { "field": "doc.pubkey" },
        "name": { "field": "self.data.name" },
        "places": { "field": "self.data.places" },
        "translations": { "field": "self.data.translations" }
      },
      "return": "array"
    },
    {
      "action": "select",
      "select": {
        // Select fields directly from the results of the 'get' step
        // Assumes the context variable 'schemaDetails' holds the array
        "id": { "variable": "schemaDetails.id" },
        "name": { "variable": "schemaDetails.name" },
        "places": { "variable": "schemaDetails.places" },
        "translations": { "variable": "schemaDetails.translations" }
      }
      // The 'select' step needs logic to iterate if 'schemaDetails' is an array
    }
  ]
}
```

**2. `createCompositeQueryForSchema(schemaId)` (Fetch composites for a schema)**

```json
{
  "steps": [
    {
      "action": "find",
      "resultVariable": "compositeLinks",
      "target": {
        "schema": "${schemaId}" // Input schemaId would be interpolated here
      },
      "variables": {
        "compositePubKeyVar": { "source": "link.pubkey" },
        "x1Var": { "source": "link.x1" },
        "x2Var": { "source": "link.x2" },
        "x3Var": { "source": "link.x3" },
        "x4Var": { "source": "link.x4" },
        "x5Var": { "source": "link.x5" }
      },
      "return": "array"
    },
    // --- Resolve x1 ---
    {
      "action": "get",
      "resultVariable": "x1Details",
      "from": { "variable": "x1Var" }, // Get doc using x1Var
      "fields": {
        "data": { "field": "self.data" },
        "pubkey": { "field": "doc.pubkey" }
      },
      "return": "array" // Handle multiple composites linking to same x1 leaf
    },
    // --- Resolve x2, x3, x4, x5 (similar) ---
    // ... steps for x2, x3, x4, x5 ...
    {
      "action": "select",
      "groupBy": "compositePubKeyVar", // Group by the found composite ID
      "select": {
        // Select from the context variables populated by previous steps
        // within the scope of the current composite group
      "action": "get",
      "resultVariable": "x2Details",
      "from": { "variable": "x2Var" },
      "fields": {
        "data": { "field": "self.data" },
        "pubkey": { "field": "doc.pubkey" }
      },
      "return": "array"
    },
    // --- Resolve x3, x4, x5 (similar) --- 
    // ... steps for x3, x4, x5 ...
    {
      "action": "select",
      // Join results based on compositePubKeyVar
      "select": {
        "id": { "variable": "compositePubKeyVar" },
        "schemaId": { "variable": "compositeDetails.schemaId" }, // From the get composite step
        "x1": { "variable": "x1Details" }, // Select the whole object from the get x1 step
        "x2": { "variable": "x2Details" },
        "x3": { "variable": "x3Details" }, // Assuming x3Details exists
        "x4": { "variable": "x4Details" }, // Assuming x4Details exists
        "x5": { "variable": "x5Details" }  // Assuming x5Details exists
      }
      // Requires joining/correlation logic in the engine
    }
  ]
}
```

### `NodesProps.svelte` / `GraphView.svelte`

These components fetch composites involving a *specific* leaf, using wildcards.

**`compositeQueryDefinition` / `getCompositeQuery(selectedLeafId)`**

```json
{
  "steps": [
    {
      "action": "find",
      "resultVariable": "involvedComposites",
      "target": {
        "schema": "*", // Wildcard schema
        // Check all places for the selected leaf ID
        "x1": "${selectedLeafId}", // Need OR logic or multiple find steps?
        "x2": "${selectedLeafId}", // OR target could support { place: '*', value: 'id' }
        "x3": "${selectedLeafId}",
        "x4": "${selectedLeafId}",
        "x5": "${selectedLeafId}"
        // ^^ This part is tricky. A single find step might need enhanced capabilities,
        // or we might need separate find steps for each place, then merge results.
        // Assuming find handles OR logic internally for this example:
        // Alternative target: { place: '*', value: '${selectedLeafId}' }
      },
      "variables": {
        "compositePubKeyVar": { "source": "link.pubkey" },
        "schemaIdVar": { "source": "link.schemaId" }, // Need schemaId directly if possible?
        "x1Var": { "source": "link.x1" },
        "x2Var": { "source": "link.x2" },
        "x3Var": { "source": "link.x3" },
        "x4Var": { "source": "link.x4" },
        "x5Var": { "source": "link.x5" }
      },
      "return": "array"
    },
    // --- Resolve Schema --- 
    {
      "action": "get",
      "resultVariable": "schemaDetails",
      "from": { "variable": "schemaIdVar" }, // Need schemaId from find step
      "fields": {
        "id": { "field": "doc.pubkey" },
        "name": { "field": "self.data.name" },
        "translations": { "field": "self.data.translations" }
      },
      "return": "array"
    },
    // --- Resolve x1 Leaf --- 
    {
      "action": "get",
      "resultVariable": "x1LeafDetails",
      "from": { "variable": "x1Var" },
      "fields": {
        "id": { "field": "doc.pubkey" },
        "data": { "field": "self.data" },
        "type": { "field": "self.data.type" }, // Specific fields for GraphView
        "value": { "field": "self.data.value" }
      },
      "return": "array"
    },
    // --- Resolve x2, x3, x4, x5 Leafs (similar) ---
    // ... steps for x2, x3, x4, x5 ...
    {
      "action": "select",
      // Join results based on compositePubKeyVar
      "select": {
        "composite_id": { "variable": "compositePubKeyVar" },
        "schemaId": { "variable": "schemaIdVar" },
        "schema_resolved": { "variable": "schemaDetails" }, // Select the resolved schema object
        "x1_resolved": { "variable": "x1LeafDetails" },   // Select resolved leaf object
        "x2_resolved": { "variable": "x2LeafDetails" },
        "x3_resolved": { "variable": "x3LeafDetails" },
        "x4_resolved": { "variable": "x4LeafDetails" },
        "x5_resolved": { "variable": "x5LeafDetails" }
      }
      // Again, requires engine correlation logic
    }
  ]
}
```

### `LeafQueries.svelte`

**`allLeafQuery` (Fetch all leaves)**

This is very simple, similar to `allSchemaQuery`.

*   **Option A (Using Index):**

```json
{
  "steps": [
    {
      "action": "find",
      "target": { "index": "leaves" },
      "variables": { "leafPubKeyVar": { "source": "link.pubkey" } },
      "return": "array"
    },
    {
      "action": "get",
      "resultVariable": "leafDetails",
      "from": { "variable": "leafPubKeyVar" },
      "fields": {
        "id": { "field": "doc.pubkey" },
        "data": { "field": "self.data" }
      },
      "return": "array"
    },
    {
      "action": "select",
      "select": {
        "id": { "variable": "leafDetails.id" },
        "data": { "variable": "leafDetails.data" }
      }
    }
  ]
}
```

### `IndexQueries.svelte`

**1. `metaIndexQuery` (Fetch meta index doc)**

```json
{
  "steps": [
    {
      "action": "get",
      "resultVariable": "metaIndexDoc",
      "from": { "pubkey": "${GENESIS_PUBKEY}" }, // Direct pubkey, maybe not variable
      "fields": {
        "id": { "field": "doc.pubkey" },
        "index_map": { "field": "self.data.value" } // Get the map directly
      },
      "return": "first"
    },
    {
      "action": "select",
      "select": {
        "id": { "variable": "metaIndexDoc.id" },
        "index_map": { "variable": "metaIndexDoc.index_map" }
      }
    }
  ]
}
```

**2. Fetch specific index content (e.g., `leaves` index)**

```json
{
  "steps": [
    {
      "action": "get",
      "resultVariable": "indexDoc",
      "from": { "pubkey": "${leavesIndexPubKey}" }, // Specific index pubkey
      "fields": {
        "id": { "field": "doc.pubkey" },
        "data": { "field": "self.data" } // Get the whole data object
      },
      "return": "first"
    },
    {
      "action": "select",
      "select": {
        "id": { "variable": "indexDoc.id" },
        "data": { "variable": "indexDoc.data" }
      }
    }
  ]
}
```

</rewritten_file> 