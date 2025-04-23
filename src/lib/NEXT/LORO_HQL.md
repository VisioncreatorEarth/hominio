# LORO_HQL: Loro Hyper-Query Language Definition

## Overview

LORO_HQL is a JSON-based query language designed to query graph data stored across multiple Loro documents, where each document represents a specific entity (`Sumti`), relationship (`Bridi`), predicate type (`Selbri`), or index (`Facki`). It leverages the Lojban-inspired structure defined in `db.ts`.

The goal is to provide a declarative way to fetch and structure data by specifying starting nodes, relationship traversal paths, and a direct mapping to the desired output format. The server handles the underlying Loro document lookups (using existence and relationship indexes for efficiency) and joins automatically.

**Important:** Entity names (for Projects, Tasks, People, etc.) should always be retrieved by traversing a `@selbri_ckaji` relationship to a dedicated `*_name` Sumti node and accessing the `self.datni.vasru` field of that node. Direct access to `self.ckaji.cmene` for entity names is discouraged and may return `undefined`.

## Core Concepts

1.  **Entry Points (`from`)**: Queries start from one or more specified `Sumti` or `Selbri` instances identified by their `pubkey`.
2.  **Output Mapping (`map`)**: Defines the structure of the result object for each starting node.
3.  **Data Sources (within `map`)**: Each value in the `map` specifies how to get data:
    *   `{ "field": "path.to.field" }`: Accesses a property from the current node (`self`). Valid paths include `self.ckaji.pubkey` (for any node), `self.datni.vasru` (for value Sumti), or fields within `datni` for Selbri (e.g., `self.datni.sumti.x1`).
    *   `{ "traverse": { ... } }`: Follows relationships (`Bridi`) to related nodes (typically starts from a `Sumti`).
4.  **Traversal (`traverse`)**: Defines how to navigate relationships:
    *   `bridi_where`: Specifies the `Selbri` type and the `place` the *current* node occupies.
    *   `map` (nested): Recursively defines the output structure for *each related* node found.
    *   `where_related` (optional): Filters the *related* nodes before they are mapped.
    *   `return`: Specifies whether to return an `'array'` (default) or just the `'first'` related node found.
5.  **Node/Place Targeting (within nested `map`)**: Inside a `traverse.map`, each mapping value must specify the `place` (e.g., `x1`, `x2`) within the connecting `Bridi` that holds the node from which data should be sourced (`field`) or further traversed (`traverse`).
6.  **Filtering (`where`, `where_related`)**: Apply conditions to filter results. Top-level `where` filters starting nodes; `where_related` filters nodes found during traversal.
7.  **Server-Side Joins & Indexing**: The query engine automatically resolves `SumtiId` references within `Bridi` records (using the `@facki_bridi` index) and checks node existence (using `@facki_sumti` / `@facki_selbri` indexes) before fetching the corresponding Loro documents.
8.  **Document Mapping**: Each unique `pubkey` corresponds directly to a distinct `LoroDoc` instance.

## Query Structure (JSON)

```json
{
  "from": { // Specifies starting nodes
    "sumti_pubkeys": ["<pubkey1>", ...], // Optional: Start from Sumti
    "selbri_pubkeys": ["<pubkey2>", ...] // Optional: Start from Selbri
  },
  "map": { // Defines the output structure for *each* starting node
    // Key: Desired output property name
    "output_prop_A": {
      "field": "self.ckaji.pubkey" // Example: Get ID
    },
    // Example: Get name via traversal (if starting node is Sumti)
    "entity_name": { 
      "traverse": { /* ... name traversal ... */ }
    },
    // Example: Get Selbri definition field (if starting node is Selbri)
    "selbri_x1_def": {
        "field": "self.datni.sumti.x1"
    },
    // ... other mapping or traversal definitions ...
  },
  "where": { // Optional: Filter the *starting* nodes
    "field": "self.ckaji.pubkey", // Filter usually on ID or linked properties
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
        "map": { "_value": { "place": "x2", "field": "self.datni.vasru" } }
      }
    },
    "tasks": { // Output array property
      "traverse": {
        "bridi_where": { "selbri": "@selbri_gunka", "place": "x3" }, // @project1 is x3 in gunka
        "return": "array", // Expect multiple tasks
        "map": { // Define structure for each related node object (task and worker info)
          "task_id":    { "place": "x2", "field": "self.ckaji.pubkey" }, // Get task pubkey (task is x2 in gunka)
          "task_name":  { // Get task name via traversal
            "place": "x2",
            "traverse": {
              "bridi_where": { "selbri": "@selbri_ckaji", "place": "x1" },
              "return": "first",
              "map": { "_value": { "place": "x2", "field": "self.datni.vasru" } }
            }
          },
          "worker": { /* ... worker details, including name traversal ... */ },
          "status": { /* ... status traversal, gets datni.vasru ... */ }
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
    "tag_value": { "field": "self.datni.vasru" }, // Get the tag value
    "tagged_tasks": {
      "traverse": {
        "bridi_where": { "selbri": "@selbri_ckaji", "place": "x2" },
        "return": "array",
        "map": { // Map the task node (x1)
          "task_id":   { "place": "x1", "field": "self.ckaji.pubkey" },
          "task_name": { // Get task name via traversal
            "place": "x1",
            "traverse": {
              "bridi_where": { "selbri": "@selbri_ckaji", "place": "x1" },
              "return": "first",
              "map": { "_value": { "place": "x2", "field": "self.datni.vasru" } }
            }
          },
          // Nested traverse: Find the worker and their actual name
          "worker": { /* ... worker details, including name traversal ... */ }
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
    "selbri_id": { "field": "self.ckaji.pubkey" },
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
*   **Data Fetching**: Retrieve data from LoroDoc root maps.
*   **Security & Performance**: Standard considerations apply.

## Querying All Bridi Instances

The current LORO_HQL `from` clause does not directly support starting a query to retrieve *all* Bridi instances. To get a list of all Bridi *via HQL* would require extending the query language, for example, by allowing queries against the `@facki_bridi` index directly.

## Future Enhancements

*   More complex filter conditions (`AND`, `OR`, `NOT`, comparisons like `gt`, `