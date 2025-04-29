# Hominio Query Language (HQL - JSON Steps Format)

This document outlines the JSON Steps format for the Hominio Query Language (HQL), used to query graph data stored across multiple Loro documents.

## Overview

The JSON Steps format enables complex, sequential queries by defining an array of steps that are executed in order. It functions like a state machine, where the query's `context` (holding variables) is the state, and each step transitions the state.

## Core Concepts

*   **Generality:** The engine is designed to be generic. It works with any Lojban schema/composite/leaf structures defined according to `*.data.ts` files, relying on schema IDs and field paths provided in the query, not hardcoded values.
*   **Sequential Execution:** Queries are defined as an array of `steps`, executed in order.
*   **Context/Scope:** A context object (`ctx`) persists across steps, storing results and variables defined in one step for use in subsequent steps.
*   **Defined Actions:** Each step has a specific `action` (e.g., `find`, `get`, `select`, `setVar`).
*   **Variable Passing:** Steps can define variables (e.g., `resultVariable`, `variables`) that populate the context. Subsequent steps can reference these variables in their parameters (e.g., `target`, `from`).

## Type Definitions

These are the core TypeScript interfaces used in `src/lib/KERNEL/hominio-query.ts`.

```typescript
// Define possible step actions
type HqlStepAction = 'find' | 'get' | 'select' | 'setVar';

// Base interface for a query step
interface LoroHqlStepBase {
    action: HqlStepAction;
    resultVariable?: string; // Optional: Name to store the step's primary result array in context
}

// --- Utility Types ---
export type QueryContext = Record<string, unknown>;

export interface StepResultItem {
    _sourceKey?: unknown; // Key linking back to the source (e.g., composite pubkey, leaf pubkey)
    variables: Record<string, unknown>; // Extracted variables for this item
}

// --- Step Definitions ---

interface LoroHqlSetVarStep extends LoroHqlStepBase {
    action: 'setVar';
    variables: {
        [varName: string]: { literal: unknown };
    };
    resultVariable?: undefined;
}

interface LoroHqlFindStep extends LoroHqlStepBase {
    action: 'find';
    target: {
        schema: string | { variable: string }; // Schema pubkey (literal or variable reference)
        // Specific places to match (can be literals or variables)
        x1?: string | { variable: string };
        x2?: string | { variable: string };
        x3?: string | { variable: string };
        x4?: string | { variable: string };
        x5?: string | { variable: string };
        // OR generic place matching
        place?: '*';
        value?: string | { variable: string };
        // OR index matching (Future enhancement)
        // index?: string;
        // indexKey?: string | { variable: string };
    };
    variables?: { // Variables to extract from each found composite link
        [varName: string]: { source: 'link.x1' | 'link.x2' | 'link.x3' | 'link.x4' | 'link.x5' | 'link.pubkey' | 'link.schemaId' };
    };
    return?: 'first' | 'array'; // Default: 'array'
}

interface LoroHqlGetStep extends LoroHqlStepBase {
    action: 'get';
    from: 
        | { variable: string, sourceKey?: string, targetDocType?: 'Leaf' | 'Schema' | 'Composite' } // Get docs referenced in a variable array (using sourceKey from variables map)
        | { pubkey: string | string[] } // Get doc(s) by direct pubkey(s)
        | { type: 'Leaf' | 'Schema' | 'Composite' }; // Get all docs of a specific type (uses index)
    fields: { // Fields to extract from each fetched document
        [outputName: string]: { field: string }; // e.g., { field: 'self.data.value' } or { field: 'doc.pubkey' }
    };
    variables?: { // Optionally define new context variables based on extracted fields
        [varName: string]: { source: string }; // e.g., { source: 'result.value' } or { source: 'doc.pubkey' }
    };
    return?: 'first' | 'array'; // Default: 'array'
}

// Defines how to get a value for an output property in the select step
interface LoroHqlMapValue {
    field?: string;      // Direct field access from context/doc (e.g., "self.data.value") - Use with caution
    variable?: string; // Reference a variable from the final group context
    literal?: unknown; // Use a literal value
}

interface LoroHqlSelectStep extends LoroHqlStepBase {
    action: 'select';
    select: { // Defines the structure of the final output objects
        [outputKey: string]: LoroHqlMapValue;
    };
    // How to group/correlate results from previous steps
    groupBy?: string; // Variable name to group by (e.g., 'taskVar')
    // join?: { on: string; sources: string[]; type: 'inner' | 'left' }; // Future enhancement
    resultVariable?: undefined; // Select is terminal
}

// Union type for any step
type LoroHqlStep = LoroHqlSetVarStep | LoroHqlFindStep | LoroHqlGetStep | LoroHqlSelectStep;

// Top-level query structure
export interface LoroHqlQueryExtended {
    steps: LoroHqlStep[];
}

// Final query result type
export type QueryResult = Record<string, unknown>;
```

## Execution Flow

The `executeQuery` function in `src/lib/KERNEL/hominio-query.ts` processes the query:

1.  Initializes an empty context `ctx = {}`.
2.  Iterates through `query.steps`.
3.  For each `step`:
    *   Resolves any input variables (e.g., `{ variable: 'someVar' }`) by looking up `someVar` in `ctx`.
    *   Executes the step's `action` (e.g., `findCompositeDocsBySchemaAndPlace`, `getLeafDoc`, `getSchemaDoc`, `getCompositeDoc`).
    *   Populates `ctx` with any `variables` defined by the step. Results from steps returning arrays are stored with associated source keys (`_sourceKey`) to enable correlation.
    *   If `resultVariable` is defined, stores the step's primary output array (or single object if `return: 'first'`) in `ctx[step.resultVariable]`.
4.  The final `select` step uses the populated `ctx` to construct the final `QueryResult[]`. It performs grouping based on the `groupBy` variable, correlating data from different `resultVariable` arrays stored in the context using the `_sourceKey` linkage.

## Example: Todos Query (`Todos.svelte`)

This query fetches tasks, their names, and their statuses.

**Schema Public Keys:**
*   `@schema/tcini`: `0xf4f64c16a96daf1d2b91269fe82946b21b7d1faa728ff20ed86a6c18dabc4943`
*   `@schema/cneme`: `0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96`

**Query:**

```json
{
  "steps": [
    {
      "action": "find",
      "target": {
        "schema": "0xf4f64c16a96daf1d2b91269fe82946b21b7d1faa728ff20ed86a6c18dabc4943" // tcini schema
      },
      "variables": {
        "taskVar": { "source": "link.x1" }, // Task Leaf ID
        "statusLeafVar": { "source": "link.x2" } // Status Leaf ID
      },
      "resultVariable": "taskStatusLinks", // Store results here
      "return": "array"
    },
    {
      "action": "find",
      "target": {
        "schema": "0xe936b2fc03557057b6c021a0c8e17d21312b7446ca11a46bc0d61d3bcd150a96" // cneme schema
      },
      "variables": {
        "entityVar": { "source": "link.x1" }, // Entity (Task) Leaf ID
        "nameLeafVar": { "source": "link.x2" } // Name Leaf ID
      },
      "resultVariable": "entityNameLinks", // Store results here
      "return": "array"
    },
    {
      "action": "get",
      "from": {
        "variable": "taskStatusLinks", // Source array
        "sourceKey": "statusLeafVar", // Get pubkey from this variable in each item
        "targetDocType": "Leaf" // Expecting a Leaf
      },
      "fields": {
        "statusValue": { "field": "self.data.value" } // Extract the status text
      },
      "variables": {
        "statusLeafKey": { "source": "doc.pubkey" } // Capture the actual leaf key fetched
      },
      "resultVariable": "statusDetails", // Store results here
      "return": "array"
    },
    {
      "action": "get",
      "from": {
        "variable": "entityNameLinks", // Source array
        "sourceKey": "nameLeafVar", // Get pubkey from this variable
        "targetDocType": "Leaf"
      },
      "fields": {
        "nameValue": { "field": "self.data.value" } // Extract the name text
      },
      "variables": {
        "nameLeafKey": { "source": "doc.pubkey" } // Capture the actual leaf key fetched
      },
      "resultVariable": "nameDetails", // Store results here
      "return": "array"
    },
    {
      "action": "select",
      "groupBy": "taskVar", // Group results by the task ID
      "select": {
        // Variables in select refer to keys available *within the grouped context*
        // The engine flattens correlated data (like 'status', 'name') based on the groupBy logic
        // and makes variables from intermediate steps available prefixed by resultVariable + _ + varName

        "taskId": { "variable": "taskVar" }, // The grouping key itself
        "statusLeafId": { "variable": "taskStatusLinks_statusLeafVar" }, // Status Leaf ID from the taskStatusLinks step
        "status": { "variable": "status" }, // Flattened status value (correlated via statusDetails)
        "name": { "variable": "name" }, // Flattened name value (correlated via entityNameLinks & nameDetails)
        "tciniCompositeId": { "variable": "taskStatusLinks__sourceKey" }, // Get pubkey of the source tcini link
        "cnemeCompositeId": { "variable": "entityNameLinks__sourceKey" }, // Get pubkey of the source cneme link
        "nameLeafId": { "variable": "entityNameLinks_nameLeafVar" } // Name Leaf ID from the entityNameLinks step
      }
    }
  ]
}
```

**Explanation:**

1.  **Find Task-Status Links:** Find all composites using the `tcini` schema. For each, extract the task (`link.x1` -> `taskVar`) and status leaf (`link.x2` -> `statusLeafVar`). Store these pairs in `taskStatusLinks`.
2.  **Find Entity-Name Links:** Find all composites using the `cneme` schema. For each, extract the entity (`link.x1` -> `entityVar`) and name leaf (`link.x2` -> `nameLeafVar`). Store these pairs in `entityNameLinks`.
3.  **Get Status Details:** For each `statusLeafVar` found in `taskStatusLinks`, fetch the corresponding Leaf document and extract its `self.data.value` into `statusValue`. Store these results (keyed by the original status leaf pubkey) in `statusDetails`.
4.  **Get Name Details:** For each `nameLeafVar` found in `entityNameLinks`, fetch the corresponding Leaf document and extract its `self.data.value` into `nameValue`. Store these results (keyed by the original name leaf pubkey) in `nameDetails`.
5.  **Select & Correlate:** Group all information by `taskVar`. For each task:
    *   Select the `taskVar` as `taskId`.
    *   Retrieve the corresponding `statusLeafVar` and `nameLeafVar` from the link results (e.g., `taskStatusLinks_statusLeafVar`).
    *   Retrieve the source composite IDs (e.g., `taskStatusLinks__sourceKey`).
    *   Retrieve the flattened `status` and `name` values that the engine correlated in the background using the results from the `get` steps.

## Other Examples (Illustrative)

These examples show potential queries for other components. They might need refinement based on exact schema IDs and required correlation logic.

### Fetch all Schemas

```json
{
  "steps": [
    {
      "action": "get",
      "resultVariable": "schemaDocs",
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
        // Assume select iterates through the 'schemaDocs' array from context
        "id": { "variable": "id" },
        "name": { "variable": "name" },
        "places": { "variable": "places" },
        "translations": { "variable": "translations" }
      }
    }
  ]
}
```

### Fetch all Leaves

```json
{
  "steps": [
    {
      "action": "get",
      "resultVariable": "leafDocs",
      "from": { "type": "Leaf" },
      "fields": {
        "id": { "field": "doc.pubkey" },
        "data": { "field": "self.data" }
      },
      "return": "array"
    },
    {
      "action": "select",
      "select": {
        "id": { "variable": "id" },
        "data": { "variable": "data" }
      }
    }
  ]
}
```

### Fetch composites involving a specific leaf (`selectedLeafId`)

*Note: This requires the `find` step to support searching across all places or using the `composites-by-component` index, which needs implementation.* Assuming a hypothetical `target: { value: "${selectedLeafId}" }` finds composites where the value appears in *any* place:

```json
{
  "steps": [
    {
      "action": "find",
      "resultVariable": "involvedComposites",
      "target": {
        "value": "${selectedLeafId}" // Hypothetical: Find composites involving this leaf in any place
      },
      "variables": {
        "compositePubKeyVar": { "source": "link.pubkey" },
        "schemaIdVar": { "source": "link.schemaId" },
        "x1Var": { "source": "link.x1" },
        "x2Var": { "source": "link.x2" },
        "x3Var": { "source": "link.x3" },
        "x4Var": { "source": "link.x4" },
        "x5Var": { "source": "link.x5" }
      },
      "return": "array"
    },
    // ... steps to get details for schemaIdVar, x1Var, x2Var, etc. ...
    {
      "action": "select",
      "groupBy": "compositePubKeyVar",
      "select": {
        "composite_id": { "variable": "compositePubKeyVar" },
        "schemaId": { "variable": "schemaIdVar" },
        // ... select resolved data for schema and places ...
      }
    }
  ]
}
```

</rewritten_file> 