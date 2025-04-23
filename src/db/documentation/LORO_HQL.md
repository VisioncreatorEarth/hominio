# LORO_HQL: Loro Hyper-Query Language Definition

## Overview

LORO_HQL is a JSON-based query language designed to query graph data stored across multiple Loro documents, where each document represents a specific entity (`Sumti`), relationship (`Bridi`), predicate type (`Selbri`), or index (`Facki`). It leverages the Lojban-inspired structure defined in `db.ts`.

**Refactoring Note (Post meta/data removal):** The internal structure of standard Loro documents managed by HominioDB has been simplified. Instead of nesting application data under top-level `meta` and `data` maps, documents now typically have **`ckaji`** (metadata/classification) and **`datni`** (payload/content) as direct, top-level maps or containers within the LoroDoc root.

The goal is to provide a declarative way to fetch and structure data by specifying starting nodes, relationship traversal paths, and a direct mapping to the desired output format. The server handles the underlying Loro document lookups (using existence and relationship indexes for efficiency) and joins automatically.

**Important:** Entity names (for Projects, Tasks, People, etc.) should always be retrieved by traversing a `@selbri_ckaji` relationship to a dedicated `*_name` Sumti node and accessing the `self.datni` field of that node (assuming the name Sumti node stores the name text directly in its root `datni` text container).

## Core Concepts

1.  **Document Structure:** Each unique `pubkey` corresponds to a distinct `LoroDoc` instance. Inside the document, application data is primarily organized within two top-level Loro containers (usually Maps): `ckaji` and `datni`.
    *   `ckaji`: Typically holds metadata like `klesi` (class).
    *   `datni`: Holds the main payload, which could be simple values, nested maps (like `sumti` in Selbri/Bridi), or specific Loro container types (like a LoroText for a name Sumti).
2.  **Entry Points (`from`)**: Queries start from one or more specified `Sumti` or `Selbri` instances identified by their `pubkey`.
3.  **Output Mapping (`map`)**: Defines the structure of the result object for each starting node.
4.  **Data Sources (within `map`)**: Each value in the `map` specifies how to get data:
    *   `{ "field": "doc.pubkey" }`: Accesses the **external pubkey** of the current document (the ID known to the database and query engine). This is the preferred way to get a document's ID.
    *   `{ "field": "self.path.to.field" }`: Accesses a property from the current node's internal Loro data (`self`). Since `ckaji` and `datni` are top-level, paths now start directly with them (e.g., `self.datni.some_value`, `self.datni.sumti.x1`, `self.ckaji.klesi`).
    *   `{ "traverse": { ... } }`: Follows relationships (`Bridi`) to related nodes (typically starts from a `Sumti`).
5.  **Traversal (`traverse`)**: Defines how to navigate relationships:
    *   `bridi_where`: Specifies the `Selbri` type and the `place` the *current* node occupies.
    *   `map` (nested): Recursively defines the output structure for *each related* node found.
    *   `where_related` (optional): Filters the *related* nodes before they are mapped. Use `doc.pubkey` here for filtering related node IDs.
    *   `return`: Specifies whether to return an `'array'` (default) or just the `'first'` related node found.
6.  **Node/Place Targeting (within nested `map`)**: Inside a `traverse.map`, each mapping value must specify the `place` (e.g., `x1`, `x2`) within the connecting `Bridi` that holds the node from which data should be sourced (`field`) or further traversed (`traverse`).
7.  **Filtering (`where`, `where_related`)**: Apply conditions to filter results. Top-level `where` filters starting nodes; `where_related` filters nodes found during traversal.
8.  **Server-Side Joins & Indexing**: The query engine automatically resolves `SumtiId` references within `Bridi` records (using the `@facki_bridi` index) and checks node existence (using `@facki_sumti` / `@facki_selbri`) before fetching the corresponding Loro documents.

## Query Structure (JSON)

```json
{
  "from": { // Specifies starting nodes
    "sumti_pubkeys": ["<pubkey1>", ...], // Optional: Start from Sumti
    "selbri_pubkeys": ["<pubkey2>", ...] // Optional: Start from Selbri
  },
  "map": { // Defines the output structure for *each* starting node
    // Key: Desired output property name
    "document_id": {
      "field": "doc.pubkey" // Example: Get ID using the external pubkey
    },
    // Example: Get name via traversal (if starting node is Sumti)
    "entity_name": { 
      "traverse": {
        "bridi_where": { "selbri": "@selbri_ckaji", "place": "x1" },
        "return": "first",
        "map": { "_value": { "place": "x2", "field": "self.datni" } }
      }
    },
    // Example: Get Selbri definition field (if starting node is Selbri)
    "selbri_x1_def": {
        "field": "self.datni.sumti.x1"
    },
    // ... other mapping or traversal definitions ...
  },
  "where": { // Optional: Filter the *starting* nodes
    "field": "doc.pubkey", // Filter on the external document ID
    "condition": { "equals": "..." }
  }
}
```

## Example Queries

### Example 1: Find all tasks assigned to 'Project: Website' (`@project1`) and their status.

```json
{
  "from": { "sumti_pubkeys": ["@project1"] },
  "map": {
    "project_name": { // Get project name via traversal
      "traverse": {
        "bridi_where": { "selbri": "@selbri_ckaji", "place": "x1" },
        "return": "first",
        "map": { "_value": { "place": "x2", "field": "self.datni" } }
      }
    },
    "tasks": { // Output array property
      "traverse": {
        "bridi_where": { "selbri": "@selbri_gunka", "place": "x3" }, // @project1 is x3 in gunka
        "return": "array", // Expect multiple tasks
        "map": { // Define structure for each related node object (task and worker info)
          "task_id":    { "place": "x2", "field": "doc.pubkey" }, // Get task ID (task is x2 in gunka)
          "task_name":  { // Get task name via traversal
            "place": "x2",
            "traverse": {
              "bridi_where": { "selbri": "@selbri_ckaji", "place": "x1" },
              "return": "first",
              "map": { "_value": { "place": "x2", "field": "self.datni" } }
            }
          },
          "worker": { /* ... worker details, using doc.pubkey for ID ... */ },
          "status": { /* ... status traversal, gets datni ... */ }
        }
      }
    }
  }
}
```

### Example 2: Find who is working on tasks tagged 'frontend'.

```json
{
  "from": { "sumti_pubkeys": ["@tag_frontend"] },
  "map": {
    "tag_value": { "field": "self.datni" }, // Get the tag value
    "tagged_tasks": {
      "traverse": {
        "bridi_where": { "selbri": "@selbri_ckaji", "place": "x2" }, // Tag is x2
        "return": "array",
        "map": { // Map the task node (x1)
          "task_id":   { "place": "x1", "field": "doc.pubkey" }, // Get task ID
          "task_name": { // Get task name via traversal
            "place": "x1",
            "traverse": {
              "bridi_where": { "selbri": "@selbri_ckaji", "place": "x1" },
              "return": "first",
              "map": { "_value": { "place": "x2", "field": "self.datni" } }
            }
          },
          // Nested traverse: Find the worker and their actual name
          "worker": { /* ... worker details, using doc.pubkey for ID ... */ }
        }
      }
    }
  }
}
```

### Example 3: Get the definition details for specific Selbri.

```json
{
  "from": { "selbri_pubkeys": ["@selbri_gunka", "@selbri_ckaji"] },
  "map": {
    "selbri_id": { "field": "doc.pubkey" }, // Get Selbri ID
    "x1_definition": { "field": "self.datni.sumti.x1" },
    "x2_definition": { "field": "self.datni.sumti.x2" },
    "x3_definition": { "field": "self.datni.sumti.x3" }
    // ... include x4, x5 if needed
  }
}
```

## Server-Side Implementation Considerations

*   **Document Instantiation**: The server needs access to all relevant instantiated Loro documents.
*   **Indexing**: Efficiently finding `Bridi` records (via `@facki_bridi`) and checking node existence (via `@facki_sumti`, `@facki_selbri`) is crucial.
*   **Query Planning/Execution**: Parse the JSON, plan traversals, handle recursion, apply filters (`where`, `where_related`).
*   **Data Fetching**: Retrieve data from LoroDoc root maps (`ckaji`, `datni`).
*   **Security & Performance**: Standard considerations apply.

## Querying All Bridi Instances

The current LORO_HQL `from` clause does not directly support starting a query to retrieve *all* Bridi instances. To get a list of all Bridi *via HQL* would require extending the query language, for example, by allowing queries against the `@facki_bridi` index directly.

## Future Enhancements

*   More complex filter conditions (`AND`, `OR`, `NOT`, comparisons like `gt`, `lt`, etc.).
*   Aggregation functions (`count`, `sum`, `avg`).
*   Sorting and limiting results.
*   Direct querying of index nodes (`@facki_*`).

---

## LORO_MQL: Loro Mutation Query Language (Draft)

### Overview

LORO_MQL provides a mechanism for performing atomic mutations (Create, Update, Delete) on the Loro graph data (Sumti, Bridi, Selbri) using a JSON-based format. It complements LORO_HQL by handling data modification. Key features include:

*   **Transactional Execution:** Multiple operations are bundled into a single transaction. The backend validates all operations first; if validation succeeds, all operations are applied. If any validation fails, *no* changes are applied to the underlying Loro documents.
*   **Dependency Management:** Operations within a transaction can reference nodes created in earlier steps of the *same* transaction using temporary identifiers.
*   **Declarative Syntax:** Aims for a clear JSON structure defining the desired changes.

### Core Concepts

1.  **Transaction:** A list of mutation operations submitted together. The entire list is treated as a single atomic unit from a validation perspective.
2.  **Operations:** Individual actions like creating, updating, or deleting a node (Sumti, Bridi, Selbri).
3.  **Temporary IDs:** A string prefixed with `$` (e.g., `"$newTask"`) used within a `create_*` operation. This ID can be used in subsequent operations within the same transaction to refer to the newly created node before its final `pubkey` is known or assigned. The backend resolves these during execution.
4.  **Updates:** Modifications target specific fields within a node's Loro container (Map, Text, etc.) using a path syntax.
5.  **Deletes:** Removes a node. Handling related Bridi requires careful consideration (see Considerations).
6.  **Atomicity Guarantee:** The primary guarantee is that if the entire transaction JSON is valid (all referenced existing nodes exist, structure is correct, temporary IDs resolve), all specified Loro operations will be attempted. If any part of the JSON is invalid *before* execution, no changes occur. True atomic rollback across potentially distributed Loro documents in case of unexpected *runtime* errors during Loro operations is complex and may not be guaranteed.

### Request Structure

A mutation request consists of a JSON object with a single key, `transaction`, containing an array of operation objects.

```json
{
  "transaction": [
    { /* Operation 1 */ },
    { /* Operation 2 */ },
    // ...
  ]
}
```

### Operations

#### 1. `create_sumti`

Creates a new Sumti node.

```json
{
  "op": "create_sumti",
  "temp_id": "$optionalTempId", // Optional: Define for later reference
  "pubkey": "optionalProvidedPubkey", // Optional: Provide if known and unique
  // --- Required ---
  "ckaji": { // Same structure as SumtiRecord.ckaji
    "klesi": "Sumti" // or "Facki"
    // "cmene" - Usually omitted, prefer linked name nodes
  },
  "datni": { // Same structure as SumtiRecord.datni
    "klesi": "concept" // or "LoroText", "LoroMap", etc.
    // "vasru" - Required if klesi is not 'concept'
  }
}
```

*   If `temp_id` is provided, it can be used in subsequent `sumti` maps within the same transaction.
*   If `pubkey` is not provided, the backend generates a unique one. If provided, it *must not* already exist.

#### 2. `update_sumti`

Updates fields within an existing Sumti node.

```json
{
  "op": "update_sumti",
  "pubkey": "@existingSumtiId", // Required: Target Sumti
  // --- Required ---
  "updates": [ // Array of changes to apply
    {
      "path": "datni.vasru.someKey", // Path to the field within the Sumti's datni.vasru (for LoroMap)
      "value": "new value"         // Value to set
    },
    {
      "path": "datni.vasru",         // Path to the value itself (for LoroText)
      "value": "complete new text"
    },
    {
      "path": "datni.vasru.keyToDelete", // Path to a key in a LoroMap
      "delete": true                  // Flag to remove the key
    }
    // Add rules for LoroList updates (insert, delete by index/value) if needed
  ]
}
```

*   `path` specifies the target within the Sumti's data structure. For Loro containers in `datni.vasru`, the path navigates within that container.
*   Requires specific handling based on the Sumti's `datni.klesi` (LoroMap, LoroText, etc.).

#### 3. `delete_sumti`

Deletes an existing Sumti node.

```json
{
  "op": "delete_sumti",
  "pubkey": "@sumtiToDelete" // Required: Target Sumti
  // "cascade_delete_bridi": false // Optional (Default: false): See Considerations
}
```

#### 4. `create_bridi`

Creates a new Bridi relationship node.

```json
{
  "op": "create_bridi",
  "temp_id": "$optionalTempBridiId", // Optional
  "pubkey": "optionalProvidedBridiPubkey", // Optional
  // --- Required ---
  "datni": { // Same structure as BridiRecord.datni
    "selbri": "@selbriPubkey", // Pubkey of the Selbri defining the relation
    "sumti": { // Map of places (x1, x2, ...) to Sumti pubkeys or temp IDs
      "x1": "@existingSumtiOr$tempSumti1",
      "x2": "$tempSumti2",
      // ... other places ...
    }
  }
}
```

*   References in the `sumti` map can be existing `pubkey`s or `temp_id`s from `create_sumti` operations earlier in the transaction.

#### 5. `delete_bridi`

Deletes an existing Bridi node.

```json
{
  "op": "delete_bridi",
  "pubkey": "@bridiToDelete" // Required: Target Bridi
}
```

*(Note: Operations for `Selbri` could be defined similarly if needed, but are often less dynamic).*

### Example Transaction: Create Task, Link Name, Assign

```json
{
  "transaction": [
    // 1. Create the core task concept Sumti
    {
      "op": "create_sumti",
      "temp_id": "$newTask",
      "ckaji": { "klesi": "Sumti" },
      "datni": { "klesi": "concept" }
    },
    // 2. Create a Sumti to hold the task's name
    {
      "op": "create_sumti",
      "temp_id": "$newTaskName",
      "ckaji": { "klesi": "Sumti" },
      "datni": { "klesi": "LoroText", "vasru": "Review Documentation" }
    },
    // 3. Create a Bridi linking the task to its name using ckaji
    {
      "op": "create_bridi",
      "temp_id": "$bridi_taskNameLink",
      "datni": {
        "selbri": "@selbri_ckaji",
        "sumti": { "x1": "$newTask", "x2": "$newTaskName" }
      }
    },
    // 4. Create a Sumti for the 'not-started' status (if it might not exist)
    //    Alternatively, assume status concepts exist and use "@status_notstarted" directly.
    //    This example assumes it might need creation or reference:
    {
      "op": "create_sumti",
      "pubkey": "@status_notstarted", // Use known pubkey, assumes it won't conflict or handles idempotency
      "ckaji": { "klesi": "Sumti"},
      "datni": { "klesi": "LoroText", "vasru": "not-started"}
      // Note: Add logic server-side to handle potential pre-existence if needed.
    },
    // 5. Create a Bridi linking the task to its status using ckaji
    {
      "op": "create_bridi",
      "temp_id": "$bridi_taskStatusLink",
      "datni": {
          "selbri": "@selbri_ckaji",
          "sumti": { "x1": "$newTask", "x2": "@status_notstarted" }
      }
    },
    // 6. Create a Bridi assigning the task to a person within a project using gunka
    {
      "op": "create_bridi",
      "temp_id": "$bridi_taskAssignment",
      "datni": {
        "selbri": "@selbri_gunka",
        "sumti": { "x1": "@person3", "x2": "$newTask", "x3": "@project1" }
      }
    }
  ]
}
```

### Considerations

*   **Error Handling:** The backend should return informative errors if validation fails, indicating which operation caused the issue.
*   **Idempotency:** For `create_*` operations, providing a known `pubkey` might require the backend to handle cases where the node already exists (e.g., treat as success/noop or fail, depending on desired behavior).
*   **Cascading Deletes:** Deleting a Sumti (`delete_sumti`) does *not* automatically delete Bridi nodes that reference it by default. Implementing a `cascade_delete_bridi: true` option would require the backend to query for all related Bridi and add corresponding `delete_bridi` operations implicitly, increasing complexity but potentially improving data integrity for certain use cases. For now, related Bridi should be deleted explicitly via `delete_bridi` operations within the transaction if desired.
*   **Automatic Indexing:** The mutation engine is responsible for automatically calling index update functions (like `populateBridiIndex` and `removeBridiIndex`) as part of the transaction execution for `create_bridi` and `delete_bridi` operations to keep relationship indexes consistent.
*   **Permissions:** The backend must enforce permissions, ensuring the user has the right to perform the requested mutations.

This LORO_MQL definition provides a foundational structure for transactional mutations. Further refinements, especially around complex updates and error handling, would be necessary during implementation.