# LORO_HQL: Loro Hyper-Query Language Definition

## Overview

LORO_HQL is a JSON-based query language designed to query graph data stored across multiple Loro documents, where each document represents a specific entity (`Sumti`), relationship (`Bridi`), or predicate type (`Selbri`). It leverages the Lojban-inspired structure defined in `db.ts`, particularly the `Selbri` definitions and the `x1`-`x5` sumti places within `Bridi` records.

The goal is to provide a declarative way to fetch and structure data by specifying starting nodes, relationship traversal paths, and a direct mapping to the desired output format. The server handles the underlying Loro document lookups and joins automatically.

## Core Concepts

1.  **Entry Points (`from`)**: Queries start from one or more specified `Sumti` instances identified by their `pubkey`.
2.  **Output Mapping (`map`)**: Defines the structure of the result object for each starting node. Keys in the `map` object become keys in the output.
3.  **Data Sources (within `map`)**: Each value in the `map` specifies how to get data:
    *   `{ "field": "path.to.field" }`: Accesses a property from the current node (`self`).
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
      "field": "self.path.to.field" // Option 1: Direct field access
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
             "field": "self.some.field" // Field from the node at place xM
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
    "field": "self.ckaji.cmene",
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
    "project_name": { "field": "self.ckaji.cmene" },
    "tasks": { // Output array property
      "traverse": {
        "bridi_where": { "selbri": "@selbri_gunka", "place": "x3" }, // @project1 is x3 in gunka
        "return": "array", // Expect multiple tasks
        "map": { // Define structure for each related node object (task and worker info)
          "task_id":    { "place": "x2", "field": "self.ckaji.pubkey" }, // Get task pubkey (task is x2 in gunka)
          "task_name":  { "place": "x2", "field": "self.ckaji.cmene" },  // Get task name
          "worker_id":  { "place": "x1", "field": "self.ckaji.pubkey" }, // Get worker pubkey (worker is x1)
          "status": { // Nested traversal to find the task's status
            "place": "x2", // Start traversal from the task node (x2)
            "traverse": {
              "bridi_where": { "selbri": "@selbri_ckaji", "place": "x1" }, // Task is x1 in ckaji relationship
              "return": "first", // Expecting only one status property
              // Filter the related property node *before* mapping
              "where_related": {
                 "place": "x2", // Filter the node at place x2 (the property value)
                 "field": "self.ckaji.pubkey", // Check its pubkey
                 "condition": { "in": ["@status_inprogress", "@status_notstarted", "@status_completed"] }
              },
              // Map the related property node (if found and passes filter)
              "map": {
                "value": { "place": "x2", "field": "self.datni.vasru" },
                "pubkey": { "place": "x2", "field": "self.ckaji.pubkey" } // Also get its pubkey
              }
            }
          }
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
    "tagged_tasks": {
      "traverse": {
        "bridi_where": { "selbri": "@selbri_ckaji", "place": "x2" },
        "return": "array",
        "map": { // Map the task node (x1)
          "task_id":   { "place": "x1", "field": "self.ckaji.pubkey" },
          "task_name": { "place": "x1", "field": "self.ckaji.cmene" },
          // Nested traverse: Find the worker and their actual name
          "worker": {
            "place": "x1", // Start from the task node (x1 in ckaji)
            "traverse": { // Find the gunka relationship involving the task
              "bridi_where": { "selbri": "@selbri_gunka", "place": "x2" }, // Task is x2 in gunka
              "return": "first", // Assume one worker per task assignment
              "map": { // Map the worker node (x1 in gunka)
                 // Directly map the worker's Sumti to resolve name
                 "worker_details": { // Create a nested object for worker
                   "place": "x1",
                   "map": {
                     "id": { "field": "self.ckaji.pubkey" },
                     "name": { // Traverse from worker to get name
                       "traverse": {
                         "bridi_where": { "selbri": "@selbri_ckaji", "place": "x1" },
                         "return": "first",
                         "map": {
                           "_value": { "place": "x2", "field": "self.datni.vasru" }
                         }
                       }
                     }
                   }
                 }
              }
            }
          }
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

**Core Idea:** Maintain dedicated Loro documents (identified by Sumti records starting with `@liste_`) to store index information.

**Proposed Index Documents:**

1.  **`@liste_meta` (LoroDoc): Meta Index Registry**
    *   **Purpose:** Provides references to all other index documents.
    *   **Structure:** Root `LoroMap` (`datni.vasru`) containing:
        *   Key: `"sumti"`, Value: `"@liste_sumti"` (string)
        *   Key: `"selbri"`, Value: `"@liste_selbri"` (string)
        *   Key: `"bridi"`, Value: `"@liste_bridi"` (string)

2.  **`@liste_sumti` (LoroDoc): Sumti Existence Index**
    *   **Purpose:** Quickly check if a Sumti pubkey exists.
    *   **Structure:** Root `LoroMap` (`datni.vasru`) where:
        *   Key: `pubkey` of a Sumti (e.g., `"@person1"`).
        *   Value: `true` (or minimal metadata).

3.  **`@liste_selbri` (LoroDoc): Selbri Existence Index**
    *   **Purpose:** Quickly check if a Selbri pubkey exists.
    *   **Structure:** Root `LoroMap` (`datni.vasru`) where:
        *   Key: `pubkey` of a Selbri (e.g., `"@selbri_ckaji"`).
        *   Value: `true`.

4.  **`@liste_bridi` (LoroDoc): Bridi Relationship Index**
    *   **Purpose:** Efficiently find Bridi pubkeys based on the `Selbri`, the `Place` a `Sumti` occupies, and the `Sumti`'s `pubkey`.
    *   **Structure:** Root `LoroMap` (`datni.vasru`) where:
        *   Key: A composite string `"<SelbriId>:<Place>:<SumtiId>"` (e.g., `"@selbri_gunka:x3:@project1"`).
        *   Value: A `LoroList` container holding the `pubkey` strings of all Bridi documents matching that relationship pattern.

**Maintenance:** Index documents need updates upon creation/update/deletion of corresponding data documents. `@liste_bridi` updates involve using the `LoroList` API.

**Query Engine Integration:** The engine uses `@liste_bridi` to find relevant Bridi pubkeys before fetching Bridi docs.

**(Note:** Implementation details will reside in `src/lib/NEXT/indexing.ts` later.) 