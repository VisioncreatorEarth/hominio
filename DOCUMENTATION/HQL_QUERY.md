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

interface LoroHqlJoinSource {
	variable: string; // Variable name in context holding the array
	key: string; // Variable name *within* the items' `variables` object to join on
}

interface LoroHqlJoinStep extends LoroHqlStepBase {
	action: 'join';
	left: LoroHqlJoinSource;
	right: LoroHqlJoinSource;
	type?: 'inner' | 'left'; // Optional: Type of join (default: 'inner')
	select: {
		// Output field name -> source variable name (e.g., { taskId: 'left.taskVar' })
		[outputKey: string]: { source: string };
	};
	resultVariable: string; // Required: Name for the array of joined items
}

// Union type for any step
type LoroHqlStep =
	| LoroHqlSetVarStep
	| LoroHqlFindStep
	| LoroHqlGetStep
	| LoroHqlSelectStep
	| LoroHqlIterateIndexStep
	| LoroHqlResolveStep
	| LoroHqlJoinStep; // Add Join step

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
5.  The `join` step takes two arrays from `ctx[left.variable]` and `ctx[right.variable]`, matching items where `left.key` equals `right.key`, and constructs new items containing fields specified in its `select` clause. The resulting array of combined items is stored in `ctx[resultVariable]`.
6.  The `resolve` step takes an array from `ctx[fromVariable]`, processes each item according to the `resolveFields` rules, and stores the enriched array in `ctx[resultVariable]`. Crucially:
    *   The `resolveLeafValue` rule now performs a secondary lookup via the `@schema/cneme` for any leaf whose type matches `excludeType` (e.g., `'Concept'`). If successful, it returns the resolved name; otherwise, it falls back to the original value specified by `fallbackVar`.
    *   The output items include the original item's fields plus the new resolved fields (e.g., `taskName`, `workerName`).
7.  The final result returned by `executeQuery` is typically the array stored in the `resultVariable` of the *last* step in the query definition.

## Example: Complex Todo Query (`QueryEditor.svelte` Default)

This query fetches tasks, their associated status, and their assigned worker, resolving the names/values for each.

**Input Variable (Assumed in Context):**
*   `selectedLeafId`: The public key of the leaf selected in the UI.
*   `tciniPubKey`: Pubkey for `@schema/tcini` (fetched dynamically).
*   `gunkaPubKey`: Pubkey for `@schema/gunka` (fetched dynamically).

**Query:**

```json
{
  "steps": [
    {
      "action": "find", // Step 1: Find Task Status Links
      "target": { "schema": "${tciniPubKey}" },
      "variables": {
        "taskVar": { "source": "link.x1" },
        "statusLeafVar": { "source": "link.x2" }
      },
      "return": "array",
      "resultVariable": "taskStatusLinks"
    },
    {
      "action": "find", // Step 2: Find Task Assignment Links
      "target": { "schema": "${gunkaPubKey}" },
      "variables": {
        "workerVar": { "source": "link.x1" },
        "assignedTaskVar": { "source": "link.x2" }
      },
      "return": "array",
      "resultVariable": "taskAssignmentLinks"
    },
    {
      "action": "join", // Step 3: Join status and assignments
      "left": { "variable": "taskStatusLinks", "key": "taskVar" },
      "right": { "variable": "taskAssignmentLinks", "key": "assignedTaskVar" },
      "select": {
        "taskId": { "source": "left.taskVar" }, 
        "statusLeafId": { "source": "left.statusLeafVar" },
        "workerId": { "source": "right.workerVar" }
      },
      "resultVariable": "joinedTaskInfo"
    },
    {
      "action": "resolve", // Step 4: Resolve names/values
      "fromVariable": "joinedTaskInfo",
      "resolveFields": {
        "taskName": { "type": "resolveLeafValue", "pubkeyVar": "taskId", "fallbackVar": "taskId", "excludeType": "Concept" },
        "workerName": { "type": "resolveLeafValue", "pubkeyVar": "workerId", "fallbackVar": "workerId", "excludeType": "Concept" },
        "status": { "type": "resolveLeafValue", "pubkeyVar": "statusLeafId", "fallbackVar": "statusLeafId", "valueField": "value" }
      },
      "resultVariable": "resolvedTodos" // Final results
    }
  ]
}
```

**Explanation:**

1.  **Find Task Status Links:** Find all `@schema/tcini` composites linking a task (`taskVar=link.x1`) to a status leaf (`statusLeafVar=link.x2`). Store results in `taskStatusLinks`.
2.  **Find Task Assignment Links:** Find all `@schema/gunka` composites linking a worker (`workerVar=link.x1`) to a task (`assignedTaskVar=link.x2`). Store results in `taskAssignmentLinks`.
3.  **Join:** Perform an inner join between `taskStatusLinks` and `taskAssignmentLinks` where `taskStatusLinks.taskVar` equals `taskAssignmentLinks.assignedTaskVar`. Select the task ID, status leaf ID, and worker ID into a new structure. Store results in `joinedTaskInfo`.
4.  **Resolve:** Process the `joinedTaskInfo` array:
    *   Resolve `taskId` (excluding `Concept` type to trigger `cneme` lookup) into `taskName`.
    *   Resolve `workerId` (excluding `Concept` type) into `workerName`.
    *   Resolve `statusLeafId` (getting the `value` field) into `status`.
    *   Store the final enriched items in the `resolvedTodos` array.

**Final Output Structure (`resolvedTodos` item):**

```typescript
{
  taskId: string; // Task Concept pubkey
  statusLeafId: string; // Status Leaf pubkey
  workerId: string; // Worker Concept pubkey
  taskName: string | null; // Resolved task name or original pubkey
  workerName: string | null; // Resolved worker name or original pubkey
  status: string | null; // Resolved status text value
}
```

</rewritten_file> 