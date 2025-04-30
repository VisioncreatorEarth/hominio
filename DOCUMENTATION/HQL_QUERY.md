# Hominio Query Language (HQL - JSON Steps Format)

This document outlines the JSON Steps format for the Hominio Query Language (HQL), used to query graph data stored across multiple Loro documents.

## Overview

The JSON Steps format enables complex, sequential queries by defining an array of steps that are executed in order. It functions like a state machine, where the query's `context` (holding variables) is the state, and each step transitions the state.

## Core Concepts

*   **Generality:** The engine is designed to be generic. It works with any schema/composite/leaf structures defined according to `*.data.ts` files, relying on schema IDs and field paths provided in the query, not hardcoded values.
*   **Sequential Execution:** Queries are defined as an array of `steps`, executed in order.
*   **Context/Scope:** A context object (`ctx`) persists across steps, storing results and variables defined in one step for use in subsequent steps.
*   **Defined Actions:** Each step has a specific `action` (e.g., `find`, `get`, `select`, `setVar`, `iterateIndex`, `resolve`).
*   **Variable Passing:** Steps can define variables (e.g., `resultVariable`, `variables`) that populate the context. Subsequent steps can reference these variables in their parameters (e.g., `target`, `from`).

## Type Definitions

These are the core TypeScript interfaces used in `src/lib/KERNEL/hominio-query.ts`.

```typescript
// Define possible step actions
type HqlStepAction = 'find' | 'get' | 'select' | 'setVar' | 'iterateIndex' | 'resolve';

// Base interface for a query step
interface LoroHqlStepBase {
    action: HqlStepAction;
    resultVariable?: string; // Optional: Name to store the step's primary result array/object in context
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
        | { pubkey: string | string[], targetDocType?: 'Leaf' | 'Schema' | 'Composite' } // Get doc(s) by direct pubkey(s)
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
    resultVariable?: string; // Select MAY be terminal, or output to a variable
}

interface LoroHqlIterateIndexStep extends LoroHqlStepBase {
    action: 'iterateIndex';
    indexName: IndexLeafType; // Which index to iterate (e.g., 'schemas')
    variables: {
        key: string;   // Variable name to store the index key (e.g., schemaName)
        value: string; // Variable name to store the index value (e.g., schemaPubKey)
    };
    resultVariable: string; // Required: Name for the array of {keyVar, valueVar} results
}

// Rule for resolving a leaf's value conditionally based on its type
interface ResolveLeafValueRule {
    type: 'resolveLeafValue';
    pubkeyVar: string;      // Variable in the source item holding the leaf pubkey (e.g., 'x1')
    fallbackVar: string;    // Variable in the source item to use as fallback (e.g., 'x1')
    valueField?: string;     // Field in leaf data containing the value (default: 'value')
    typeField?: string;      // Field in leaf data containing the type (default: 'type')
    excludeType?: string;    // Type value to exclude (e.g., 'Concept'). If matched, attempts secondary lookup via cneme.
}

// Union of possible resolution rules (can be extended later)
type ResolveRule = ResolveLeafValueRule;

interface LoroHqlResolveStep extends LoroHqlStepBase {
    action: 'resolve';
    fromVariable: string; // Variable in context holding the array to process
    resolveFields: {
        [outputFieldName: string]: ResolveRule; // Map output names to resolution rules (e.g., x1Display)
    };
    resultVariable: string; // Required: Name for the array of resolved items
    // Output items will contain original fields plus the resolved fields (e.g., x1Display)
    // AND metadata fields indicating original type (e.g., x1ResolvedFromType)
}

// Union type for any step
type LoroHqlStep = LoroHqlSetVarStep | LoroHqlFindStep | LoroHqlGetStep | LoroHqlSelectStep | LoroHqlIterateIndexStep | LoroHqlResolveStep;

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
    *   Executes the step's `action`.
    *   Populates `ctx` with any `variables` defined by the step. Results from steps returning arrays are stored with associated source keys (`_sourceKey`) to enable correlation.
    *   If `resultVariable` is defined, stores the step's primary output array (or single object if `return: 'first'`) in `ctx[step.resultVariable]`.
4.  The `select` step uses the populated `ctx` to construct its result objects. It performs grouping based on the `groupBy` variable, correlating data from different `resultVariable` arrays stored in the context using the `_sourceKey` linkage.
5.  The `resolve` step takes an array from `ctx[fromVariable]`, processes each item according to the `resolveFields` rules, and stores the enriched array in `ctx[resultVariable]`. Crucially:
    *   The `resolveLeafValue` rule now performs a secondary lookup via the `@schema/cneme` for any leaf whose type matches `excludeType` (e.g., `'Concept'`). If successful, it returns the resolved name; otherwise, it falls back to the original value specified by `fallbackVar`.
    *   The output items include the original item's fields, the new resolved fields (e.g., `x1Display`), and additional metadata fields (e.g., `x1ResolvedFromType`) indicating the type of the leaf originally specified by `pubkeyVar`.
6.  The final result returned by `executeQuery` is typically the array stored in the `resultVariable` of the *last* step in the query definition.

## Example: `LeafQueries.svelte` Query

This query fetches composites related to a selected leaf, resolves their place values (displaying names for concepts), and includes schema names.

**Input Variable (Assumed in Context):**
*   `selectedLeafId`: The public key of the leaf selected in the UI.

**Query:**

```json
{
  "steps": [
    {
      "action": "find",
      "target": {
        "schema": "*", // Search across all schemas
        "place": "*", // Search in any place (x1-x5)
        "value": "${selectedLeafId}" // Use the selected leaf ID (variable interpolation not shown, done by component)
      },
      "variables": {
        "composite_key": { "source": "link.pubkey" },
        "schema_id": { "source": "link.schemaId" },
        "x1": { "source": "link.x1" },
        "x2": { "source": "link.x2" },
        "x3": { "source": "link.x3" },
        "x4": { "source": "link.x4" },
        "x5": { "source": "link.x5" }
      },
      "return": "array",
      "resultVariable": "foundComposites"
    },
    {
      "action": "get",
      "from": {
        "variable": "foundComposites",
        "sourceKey": "schema_id", // Use the extracted schema_id
        "targetDocType": "Schema"
      },
      "fields": {
        "name": { "field": "self.data.name" } // Fetch the schema name
      },
      "variables": {
        "retrieved_schema_id": { "source": "result._sourceKey" }
      },
      "resultVariable": "schemaInfo"
    },
    {
      "action": "select",
      "groupBy": "composite_key",
      "select": {
        "compositePubKey": { "variable": "composite_key" },
        "schemaName": { "variable": "correlated_schema_name" }, // Correlated in select step
        "x1": { "variable": "x1" },
        "x2": { "variable": "x2" },
        "x3": { "variable": "x3" },
        "x4": { "variable": "x4" },
        "x5": { "variable": "x5" }
      },
      "resultVariable": "selectedComposites"
    },
    {
      "action": "resolve",
      "fromVariable": "selectedComposites",
      "resolveFields": {
        "x1Display": { "type": "resolveLeafValue", "pubkeyVar": "x1", "fallbackVar": "x1", "excludeType": "Concept" },
        "x2Display": { "type": "resolveLeafValue", "pubkeyVar": "x2", "fallbackVar": "x2", "excludeType": "Concept" },
        "x3Display": { "type": "resolveLeafValue", "pubkeyVar": "x3", "fallbackVar": "x3", "excludeType": "Concept" },
        "x4Display": { "type": "resolveLeafValue", "pubkeyVar": "x4", "fallbackVar": "x4", "excludeType": "Concept" },
        "x5Display": { "type": "resolveLeafValue", "pubkeyVar": "x5", "fallbackVar": "x5", "excludeType": "Concept" }
      },
      "resultVariable": "resolvedComposites" // Final results array
    }
  ]
}
```

**Explanation:**

1.  **Find Related Composites:** Find all composites where `selectedLeafId` appears in any place (x1-x5). Extract the composite key, schema ID, and all place pubkeys. Store in `foundComposites`.
2.  **Get Schema Names:** For each unique `schema_id` from `foundComposites`, fetch the Schema document and get its name. Store in `schemaInfo`.
3.  **Select Initial Structure:** Group the `foundComposites` by `composite_key`. For each unique composite, correlate its `schemaName` from `schemaInfo`. Select the `compositePubKey`, `schemaName`, and the original place pubkeys (`x1` to `x5`). Store in `selectedComposites`.
4.  **Resolve Place Values:** Take the `selectedComposites` array. For each item:
    *   Apply the `resolveLeafValue` rule to the pubkey stored in `x1`, using `x1` itself as the fallback if resolution fails. Exclude `'Concept'` types from direct value lookup, triggering the secondary `cneme` lookup instead. Store the result (resolved name or fallback pubkey) in `x1Display`.
    *   Repeat for `x2` through `x5`, storing results in `x2Display` through `x5Display`.
    *   Implicitly (as implemented in `processResolveStep`), store the original data type ('Concept', 'LoroText', etc.) found for the `x1` pubkey into `x1ResolvedFromType`, and similarly for x2-x5.
    *   Store the final enriched items in the `resolvedComposites` array.

**Final Output Structure (`resolvedComposites` item):**

```typescript
{
  compositePubKey: string;  // e.g., "0x..."
  schemaName: string | null;   // e.g., "gunka"
  x1: string | null;           // Original pubkey from composite
  x2: string | null;
  // ... x3, x4, x5
  x1Display: unknown | null;   // Resolved name (e.g., "Bob") or original pubkey if fallback
  x2Display: unknown | null;   // e.g., "Task 1"
  // ... x3Display, x4Display, x5Display
  x1ResolvedFromType: string | null; // e.g., "Concept"
  x2ResolvedFromType: string | null; // e.g., "Concept"
  // ... x3ResolvedFromType, etc.
}
```

</rewritten_file> 