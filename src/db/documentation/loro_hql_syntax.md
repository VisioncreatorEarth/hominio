# LORO_HQL Query Language Guide for AI

This guide explains how to construct LORO_HQL queries based on user requests. The query is always a JSON object with 'from' and 'map' keys.

## 1. `from` Clause (Starting Points)

*   **Purpose:** Specifies the initial set of nodes (Sumti or Selbri) from which the query begins.
*   **Keys:**
    *   `sumti_pubkeys: string[]`: An array of Pubkeys for the initial Sumti nodes.
    *   `selbri_pubkeys: string[]`: An array of Pubkeys for the initial Selbri definition nodes.
*   **Example:** `from: { sumti_pubkeys: ['@project1', '/p/task5'] }`

## 2. `map` Clause (Output Structure)

*   **Purpose:** Defines the structure of the JSON object(s) returned for *each* node specified in the `from` clause.
*   **Structure:** A JSON object where keys are the desired output field names, and values define how to get the data.
*   **Value Types:**
    *   `{ field: 'doc.pubkey' }`: Extracts the **external pubkey** of the current document (the one passed from the outside, not necessarily stored inside).
    *   `{ field: 'self.<path>' }`: Directly extracts a value from the current node's internal data (`self`). Paths navigate the node's Loro structure (e.g., `self.datni.vasru`, `self.datni.cneme`, `self.datni.sumti.x1`). Note: `self.ckaji.pubkey` is deprecated; use `doc.pubkey` instead.
    *   `{ traverse: { ... } }`: Follows relationships (Bridi) to related nodes. See Section 3.
    *   `{ /* Nested Map Object */ }`: Allows creating nested JSON objects in the output.

## 3. `traverse` Directive (Following Relationships)

*   **Purpose:** Navigates from the current node to related nodes via Bridi relationships. Used as the value in a `map` entry.
*   **Core Keys:**
    *   `bridi_where: { selbri: string, place: string }`: Identifies the relationship type (`selbri` Pubkey) and the place *this current node* occupies in that relationship (e.g., 'x1', 'x2').
    *   `return: 'first' | 'array'`: Specifies whether to return only the first related node found or all related nodes as an array.
    *   `map: { ... }`: Defines the output structure for *each related node found* by the traversal. Uses the same structure as the top-level `map`, including `field` and nested `traverse`. **Crucially, within this nested `map`, the `place` specified in `field` or `bridi_where` refers to the place of the *target related node* within the *connecting Bridi*.**
*   **Optional Keys:**
    *   `where_related: [{ place: string, field: string, condition: { ... } }]`: Filters the related nodes based on their properties *before* they are processed by the nested `map`. `place` refers to the related node's position in the Bridi. `condition` examples: `{ in: [...] }`, `{ eq: 'value' }`. Use `doc.pubkey` here instead of `self.ckaji.pubkey`.

## 4. Special Map Keys (within `map` or nested `map`)

*   `_value`: If used as a key, the engine extracts the single value defined by its corresponding directive (e.g., `{ field: 'self.datni.vasru' }`) and uses *that value directly* instead of creating a key-value pair. Useful for returning primitive values directly.
*   `_tag`: Similar to `_value`, but used when `return: 'array'`. Extracts the single value for each related item and adds it directly to the output array, rather than creating an array of objects.

## Example Inference

*   User: "What is the status of Task 1?"
    *   Infer: Start `from` `@task1`. Need a property -> `ckaji`. Status is a specific type of property.
    *   Query Thought: Traverse from `@task1` via `ckaji` where `@task1` is `x1`. Find the related node (`x2`) that represents status (e.g., `@status_inprogress`). Extract its value (`vasru`).
*   User: "Who works on Project Website?"
    *   Infer: Start `from` `@project_website`. Need workers -> `gunka`. Project is `x3` in `gunka`. Workers are `x1`. Get worker ID.
    *   Query Thought: Traverse from `@project_website` via `gunka` where project is `x3`. For each result, map the node at place `x1` (the worker) using `doc.pubkey` to get the worker's ID. Potentially traverse again from the worker node to get their name via `ckaji`.

Use the Selbri definitions provided to understand the place structures (`x1`, `x2`, etc.) for specific relationships (`zukte`, `gunka`, `ckaji`). Remember to use `doc.pubkey` for IDs. 