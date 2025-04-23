# LORO_HQL: Loro Hyper-Query Language Definition

## Overview

LORO_HQL is a JSON-based query language designed to query graph data stored across multiple Loro documents, where each document represents a specific entity (`Sumti`), relationship (`Bridi`), or predicate type (`Selbri`). It leverages the Lojban-inspired structure defined in `db.ts`, particularly the `Selbri` definitions and the `x1`-`x5` sumti places within `Bridi` records.

The goal is to provide a declarative way to fetch and structure data by specifying starting nodes, relationship traversal paths, and a direct mapping to the desired output format. The server handles the underlying Loro document lookups and joins automatically.

**Important:** Entity names (for Projects, Tasks, People, etc.) should always be retrieved by traversing a `@selbri_ckaji` relationship to a dedicated `*_name` Sumti node and accessing the `self.datni.vasru` field of that node. Direct access to `self.ckaji.cmene` for entity names is discouraged and may return `undefined`.

## Core Concepts

1.  **Entry Points (`from`)**: Queries start from one or more specified `Sumti` instances identified by their `pubkey`.
2.  **Output Mapping (`map`)**: Defines the structure of the result object for each starting node. Keys in the `map` object become keys in the output.
3.  **Data Sources (within `map`)**: Each value in the `map` specifies how to get data:
    *   `{ "field": "path.to.field" }`: Accesses a property from the current node (`self`). Valid paths include `self.ckaji.pubkey` and `self.datni.vasru` (for value Sumti).
    *   `{ "traverse": { ... } }`: Follows relationships (`Bridi`) to related nodes.
4.  **Traversal (`traverse`)**: Defines how to navigate relationships:
    *   `bridi_where`: Specifies the `Selbri` type and the `place` the *current* node occupies.
    *   `map` (nested): Recursively defines the output structure for *each related* node found.
    *   `where_related` (optional): Filters the *related* nodes before they are mapped.
    *   `return`: Specifies whether to return an `'array'` (default) or just the `'first'` related node found.
5.  **Node/Place Targeting (within nested `map`)**: Inside a `traverse.map`, each mapping value must specify the `place` (e.g., `x1`, `x2`) within the connecting `Bridi` that holds the node from which data should be sourced (`field`) or further traversed (`traverse`).
6.  **Filtering (`where`, `where_related`)**: Apply conditions to filter results. Top-level `where` filters starting nodes; `where_related` filters nodes found during traversal.
7.  **Server-Side Joins**: The query engine automatically resolves `SumtiId` references within `Bridi` records to fetch the corresponding `Sumti` data from their respective Loro documents.
8.  **Document Mapping**: Each unique `pubkey` corresponds directly to a distinct `LoroDoc` instance.

## Query Structure (JSON)

```json
{
  "from": { // Specifies starting nodes
    "sumti_pubkeys": ["<pubkey1>", ...]
  },
  "map": { // Defines the output structure for *each* starting node
    // Key: Desired output property name
    "output_prop_A": {
      "field": "self.ckaji.pubkey" // Example: Get ID
    },
    "entity_name": { // Example: Get name via traversal
      "traverse": {
        "bridi_where": { "selbri": "@selbri_ckaji", "place": "x1" },
        "return": "first",
        "map": {
          "_value": { "place": "x2", "field": "self.datni.vasru" }
        }
      }
    },
    "output_prop_B": {
      // Option 2: Traverse a relationship
      "traverse": {
        "bridi_where": { // How to find the Bridi relationship(s)
          "selbri": "@selbri_type",
          "place": "xN" // Place the *current* node occupies in this Bridi
        },
        "return": "array" | "first", // Default: "array"
        // Filter the *related* nodes found via the Bridi
        "where_related": { // Optional filter applied *before* mapping
           // Filter conditions target properties of the related node(s)
           "place": "xM", // <-- Specify WHICH related node place to filter on
           "field": "self.ckaji.pubkey", // Field on that related node
           "condition": { "in": [...] }
           // Can add more conditions for other places if needed
        },
        // Define the output structure for *each qualifying related* node
        "map": { // Recursive use of 'map'
           // Key: Output property name for the related node object
           "related_output_1": {
             "place": "xM", // Node place in the Bridi
             "field": "self.ckaji.pubkey" // Example: Field from the node at place xM
           },
           "related_output_2": {
             "place": "xP", // Can be a different place
             "traverse": { // Nested traversal from node at place xP
               "bridi_where": { /* ... */ },
               "return": "first", // Example: only get the first nested result
               "map": { /* ... mapping for the nested related node ... */ }
               // "where_related": { /* ... */ } // Optional filter for nested level
             }
           }
        }
      }
    }
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

## Server-Side Implementation Considerations

*   **Document Instantiation**: The server needs access to all relevant instantiated Loro documents.
*   **Indexing**: Efficiently finding `Bridi` records based on `selbri` and `SumtiId` in specific places is crucial.
*   **Query Planning/Execution**: Parse the JSON, plan traversals, handle recursion, apply filters (`where`, `where_related`).
*   **Data Fetching**: Retrieve data from LoroDoc root maps.
*   **Security & Performance**: Standard considerations apply.

## Future Enhancements

*   More complex filter conditions (`AND`, `OR`, `NOT`, comparisons like `gt`, `lt`).
*   Filtering directly on Bridi properties.
*   Aggregation functions (`COUNT`, etc.).
*   Sorting results.
*   Schema validation for queries.
*   Authorization integration.

## Indexing Strategy (Initial Proposal)

To improve query performance, especially for graph traversals, an indexing mechanism is necessary. This avoids iterating through all Bridi documents for each step.

**Core Idea:** Maintain dedicated Loro documents (now with `klesi: 'Facki'`, identified by pubkeys starting with `@facki_`) to store index information.

**Proposed Index Documents:**

1.  **`@facki_meta` (LoroDoc, klesi: 'Facki'): Meta Index Registry**
    *   **Purpose:** Provides references to all other index documents.
    *   **Structure:** Root `LoroMap` (`datni.vasru`) containing:
        *   Key: `"sumti"`, Value: `"@facki_sumti"` (string)
        *   Key: `"selbri"`, Value: `"@facki_selbri"` (string)
        *   Key: `"bridi"`, Value: `"@facki_bridi"` (string)

2.  **`@facki_sumti` (LoroDoc, klesi: 'Facki'): Sumti Existence Index**
    *   **Purpose:** Quickly check if a Sumti pubkey exists.
    *   **Structure:** Root `LoroMap` (`datni.vasru`) where:
        *   Key: `pubkey` of a Sumti (e.g., `"@person1"`).
        *   Value: `true` (or minimal metadata).

3.  **`@facki_selbri` (LoroDoc, klesi: 'Facki'): Selbri Existence Index**
    *   **Purpose:** Quickly check if a Selbri pubkey exists.
    *   **Structure:** Root `LoroMap` (`datni.vasru`) where:
        *   Key: `pubkey` of a Selbri (e.g., `"@selbri_ckaji"`).
        *   Value: `true`.

4.  **`@facki_bridi` (LoroDoc, klesi: 'Facki'): Bridi Relationship Index**
    *   **Purpose:** Efficiently find Bridi pubkeys based on the `Selbri`, the `Place` a `Sumti` occupies, and the `Sumti`'s `pubkey`.
    *   **Structure:** Root `LoroMap` (`datni.vasru`) where:
        *   Key: A composite string `"<SelbriId>:<Place>:<SumtiId>"` (e.g., `"@selbri_gunka:x3:@project1"`).
        *   Value: A `LoroList` container holding the `pubkey` strings of all Bridi documents matching that relationship pattern.

**Maintenance:** Index documents need updates upon creation/update/deletion of corresponding data documents. `@facki_bridi` updates involve using the `LoroList` API.

**Query Engine Integration:** The engine uses `@facki_bridi` to find relevant Bridi pubkeys before fetching Bridi docs.

**(Note:** Implementation details will reside in `src/lib/NEXT/indexing.ts` later.) 