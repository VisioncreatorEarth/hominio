# LORO_HQL: Loro Hyper-Query Language Definition

## Overview

LORO_HQL is a JSON-based query language designed to query graph data stored across multiple Loro documents, where each document represents a specific entity (`Leaf`), relationship instance (`Composite`), relationship definition (`Schema`), or index (`Index Leaf`). It leverages the Composite/Leaf architecture defined in `SEMANTICS_REFACTOR.md`.

The goal is to provide a declarative way to fetch and structure data by specifying starting nodes, relationship traversal paths, and a direct mapping to the desired output format. The query engine handles the underlying Loro document lookups (using existence and relationship indexes for efficiency) and joins automatically.

**Important:** Entity names (for Projects, Tasks, People, etc.) should always be retrieved by traversing a `@schema/cneme` relationship (or similar schema like `@schema/ckaji` if `cneme` isn't used) to a dedicated `*_name` Leaf node and accessing the `self.data.value` field of that node (assuming the name Leaf node stores the name text in its `data.value`).

## Core Concepts

1.  **Document Structure:** Each unique `pubkey` corresponds to a distinct `LoroDoc` instance. Inside the document, application data is primarily organized within two top-level Loro containers: `metadata` and `data`.
    *   `metadata`: Holds metadata like `type` ('Leaf', 'Schema', 'Composite').
    *   `data`: Holds the main payload, which could be simple values (e.g., `{ type: 'LoroText', value: '...' }`, `{ type: 'Concept' }`) or nested maps (like `places` in Schema/Composite or `value` in a 'LoroMap' Leaf).
2.  **Entry Points (`from`)**: Queries start from one or more specified `Leaf`, `Schema`, or `Composite` instances identified by their `pubkey`. Keys available are:
    *   `leaf: string[]`: Start from Leaf nodes.
    *   `schema: string[]`: Start from Schema nodes. *(Note: 'gismu' is still used internally as the targetType for Schemas in `resolve`)*.
    *   `composite: string[]`: Start from Composite nodes.
    *   An empty array (e.g., `leaf: []`) signifies fetching all nodes of that type using the corresponding Index Leaf.
3.  **Output Mapping (`map`)**: Defines the structure of the result object for each starting node. Keys are desired output field names.
4.  **Data Sources (within `map`)**: Each value in the `map` specifies how to get data:
    *   `{ "field": "doc.pubkey" }`: Accesses the **external pubkey** of the current document. This is the preferred way to get a document's ID.
    *   `{ "field": "self.path.to.field" }`: Accesses a property from the current node's internal Loro data (`self`). Paths navigate the `metadata` and `data` maps (e.g., `self.metadata.type`, `self.data.value`, `self.data.name`, `self.data.places.x1`, `self.data.translations.en.purpose`).
    *   `{ "traverse": { ... } }`: Follows relationships (`Composite`) to related nodes (typically starts from a `Leaf` or `Schema`). See Section 5.
    *   `{ "resolve": { ... } }`: Resolves a pubkey found in a field to fetch the referenced document and map its data. See Section 6.
    *   `{ /* Nested Map Object */ }`: Allows creating nested JSON objects in the output.
5.  **Traversal (`traverse`)**: Defines how to navigate relationships via `Composite` documents.
    *   `composite_where: { schemaId: string | '*', place: PlaceKey | '*' }`: Identifies the relationship type (`schemaId` or '*' for any) and the `place` ('x1'-'x5' or '*') the *current* node occupies in that relationship. A wildcard `schemaId: '*'` requires the server to check all composites linked to the current node (potentially slow).
    *   `map` (nested): Recursively defines the output structure for *each related* node found. Inside this nested `map`, values must specify the `place` (e.g., 'x1', 'x2') within the connecting `Composite` that holds the node from which data should be sourced (`field`, `resolve`) or further traversed (`traverse`). Direct fields from the *Composite* document itself can also be accessed using `self.` or `doc.pubkey`.
    *   `where_related` (optional): Filters the related nodes *before* they are mapped. `place` refers to the related node's position in the `Composite`. `condition` examples: `{ in: [...] }`, `{ equals: 'value' }`. Use `doc.pubkey` for filtering related node IDs.
    *   `return: 'array' | 'first'`: Specifies whether to return an `'array'` (default) or just the `'first'` related node found.
6.  **Resolution (`resolve`)**: Resolves a Pubkey (or array of Pubkeys) found within a field of the *current* node.
    *   `fromField: string`: The path within the *current* node's data (`self.*`) that contains the Pubkey string to resolve (e.g., `self.data.places.x1`).
    *   `targetType: 'leaf' | 'gismu'`: Specifies the expected type of the target document ('leaf' is default, 'gismu' refers to Schema). The engine uses this to check the correct existence index before fetching.
    *   `map: { ... }`: The standard `map` definition to apply to the document fetched using the Pubkey from `fromField`. This nested map operates on the *resolved* document. If fetch or access check fails, the result is `null`.
7.  **Filtering (`where`, `where_related`)**: Apply conditions to filter results. Top-level `where` filters starting nodes; `where_related` filters nodes found during traversal. Conditions: `{ equals: ... }`, `{ in: [...] }`.
8.  **Server-Side Joins & Indexing**: The query engine automatically uses Index Leaves (`leaves`, `schemas`, `composites`, `composites_by_component`) to check node existence and find Composites efficiently.

## Query Structure (JSON)

```json
{
  "from": { // Specifies starting nodes
    "leaf": ["<pubkey1>", ...],      // Optional: Start from Leaf
    "schema": ["<pubkey2>", ...],     // Optional: Start from Schema
    "composite": ["<pubkey3>", ...] // Optional: Start from Composite
  },
  "map": { // Defines the output structure for *each* starting node
    // Key: Desired output property name
    "document_id": {
      "field": "doc.pubkey" // Get ID using the external pubkey
    },
    "metadata_type": {
        "field": "self.metadata.type" // Get the type from metadata
    },
    "leaf_value": {
        "field": "self.data.value" // Get the value from a Leaf's data
    },
    "schema_name": {
        "field": "self.data.name" // Get the name from a Schema's data
    },
    // Example: Get name via traversal (if starting node is Leaf)
    "entity_name": {
      "traverse": {
        "composite_where": { "schemaId": "@schema/cneme", "place": "x1" },
        "return": "first",
        "map": {
            // Resolve the Leaf referenced in x2 of the 'cneme' composite
            "resolved_name_leaf": {
                "place": "x2", // Target the node in place x2 of the composite
                "resolve": {
                    // Use the pubkey stored in the composite's x2 place
                    "fromField": "doc.pubkey", // NOTE: Using doc.pubkey of the x2 LEAF
                    "targetType": "leaf",
                    "map": { "_value": { "field": "self.data.value" } }
                }
            }
        }
      }
    },
    // Example: Resolve a Leaf referenced in a Composite's place
    "resolved_x1_data": {
        "resolve": {
            "fromField": "self.data.places.x1", // Path within the STARTING Composite
            "targetType": "leaf",
            "map": { "data": { "field": "self.data" } } // Map the data of the RESOLVED Leaf
        }
    },
    // ... other mapping or traversal definitions ...
  },
  "where": [ // Optional: Filter the *starting* nodes (Array of clauses)
    {
        "field": "self.metadata.type",
        "condition": { "equals": "Leaf" }
    },
    {
        "field": "self.data.type",
        "condition": { "equals": "Concept" }
    }
  ]
}
```

## Example Queries

### Example 1: Find all tasks assigned to 'Project: Website' (`@project1`) and their status.

```json
{
  "from": { "leaf": ["@project1"] }, // Start from the Project Leaf
  "map": {
    "project_id": { "field": "doc.pubkey"},
    "project_name": { // Get project name via traversal using @schema/cneme
      "traverse": {
        "composite_where": { "schemaId": "@schema/cneme", "place": "x1" },
        "return": "first",
        "map": {
          "resolved_name_leaf": {
            "place": "x2", // Target the node in x2 of the 'cneme' composite
            "resolve": {
              "fromField": "doc.pubkey", // Use the pubkey of the Leaf in place x2
              "targetType": "leaf",
              "map": { "_value": { "field": "self.data.value" } }
            }
          }
        }
      }
    },
    "tasks_assigned": { // Find composites where @project1 is x3 in @schema/gunka
      "traverse": {
        "composite_where": { "schemaId": "@schema/gunka", "place": "x3" },
        "return": "array",
        "map": { // Define structure for each related composite instance
          "composite_id": { "field": "doc.pubkey" }, // ID of the gunka composite
          "task": { // Resolve the Leaf in place x2 (the task)
            "place": "x2",
            "resolve": {
              "fromField": "doc.pubkey",
              "targetType": "leaf",
              "map": { // Map data from the resolved Task Leaf
                "id": { "field": "doc.pubkey" },
                "name": { /* Nested traversal/resolve to get task name via cneme */ },
                "status": { // Traverse from Task Leaf to find its status via ckaji
                  "traverse": {
                     "composite_where": { "schemaId": "@schema/ckaji", "place": "x1" },
                     // Filter where the related node (x2) is a status property
                     "where_related": [
                         { "place": "x2", "field": "doc.pubkey", "condition": { "in": ["@status_inprogress", "@status_notstarted", "@status_completed"] } }
                         // Alternative: Filter by a specific property type if available, e.g., "field": "self.data.propertyType", "condition": { "equals": "status" }
                     ],
                     "return": "first",
                     "map": {
                         // Resolve the status Leaf (x2) to get its value
                         "status_value": {
                           "place": "x2",
                           "resolve": {
                             "fromField": "doc.pubkey",
                             "targetType": "leaf",
                             "map": { "_value": { "field": "self.data.value" } }
                           }
                         }
                     }
                  }
                }
              }
            }
          },
          "worker": { // Resolve the Leaf in place x1 (the worker)
            "place": "x1",
            "resolve": { /* ... similar resolve logic for worker ... */ }
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
  "from": { "leaf": ["@tag_frontend"] }, // Start from the tag Leaf
  "map": {
    "tag_value": { "field": "self.data.value" }, // Get the tag value
    "tagged_tasks_and_workers": {
      "traverse": { // Find composites where tag is x2 in @schema/ckaji
        "composite_where": { "schemaId": "@schema/ckaji", "place": "x2" },
        "return": "array",
        "map": { // Map data from the ckaji composite
          "task_id": { // Resolve the Leaf in place x1 (the task)
            "place": "x1",
            "resolve": {
              "fromField": "doc.pubkey",
              "targetType": "leaf",
              "map": { "_value": { "field": "doc.pubkey" } } // Just get the task pubkey
            }
          },
          "task_name": { /* ... resolve task name ... */ },
          // Nested traverse: Find the worker for this task
          "worker": {
            "place": "x1", // Still targeting the task node (x1 of ckaji)
            "traverse": { // Now traverse from the task via gunka
              "composite_where": { "schemaId": "@schema/gunka", "place": "x2" }, // Task is x2 in gunka
              "return": "first", // Assume one worker per task for simplicity
              "map": { // Map data from the gunka composite
                "worker_info": { // Resolve the Leaf in place x1 (the worker)
                  "place": "x1",
                  "resolve": {
                    "fromField": "doc.pubkey",
                    "targetType": "leaf",
                    "map": {
                      "id": { "field": "doc.pubkey" },
                      "name": { /* ... resolve worker name ... */ }
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

### Example 3: Get the definition details for specific Schemas.

```json
{
  "from": { "schema": ["@schema/gunka", "@schema/ckaji"] },
  "map": {
    "schema_id": { "field": "doc.pubkey" }, // Get Schema ID
    "name": { "field": "self.data.name" },
    "place_definitions": { "field": "self.data.places" }, // Get the map of places
    "english_purpose": { "field": "self.data.translations.en.purpose" }, // Example specific translation
    "english_x1_title": { "field": "self.data.translations.en.places.x1.title" }
    // ... map other fields or translations as needed ...
  }
}
```

## Server-Side Implementation Considerations

*   **Document Instantiation**: The server needs access to all relevant instantiated Loro documents.
*   **Indexing**: Efficiently finding `Composite` records (via `composites` and `composites_by_component` Index Leaves) and checking node existence (via `leaves` and `schemas` Index Leaves) is crucial.
*   **Query Planning/Execution**: Parse the JSON, plan traversals, handle recursion, apply filters (`where`, `where_related`).
*   **Data Fetching**: Retrieve data from LoroDoc root maps (`metadata`, `data`). Use `getDataFromDoc`.
*   **Security & Performance**: Standard considerations apply.

## Querying All Composite Instances

The current LORO_HQL `from` clause *does* support retrieving all Composite instances by using `from: { "composite": [] }`. The engine will use the `composites` Index Leaf to get the list of all composite pubkeys.

## Future Enhancements

*   More complex filter conditions (`AND`, `OR`, `NOT`, comparisons like `gt`, `lt`, etc.).
*   Aggregation functions (`count`, `sum`, `avg`).
*   Sorting and limiting results.
*   Direct querying of Index Leaf contents beyond just getting all keys. 