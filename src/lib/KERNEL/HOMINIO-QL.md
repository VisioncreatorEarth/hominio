# Hominio QL (HQL) - JSON Interface v2.1 (Simplified)

This document outlines a simplified JSON-based interface for Hominio QL, designed to query and mutate documents managed by `hominio-db`, leveraging the relationship logic defined in HQL schemas.

**Core Principles:**

1.  **Universality:** Everything (schemas, entities) is a `doc`.
2.  **Schema-Driven:** Document structure, relationships, and **validation rules** are interpreted using schema definitions (identified via `meta.schema`).
3.  **Lojban Relationships:** Queries and mutations use Lojban places (`x1`, `x2`, etc.) defined in schemas for filtering, resolution, and validation.
4.  **Graph Nature:** Treats documents as nodes and place references (`@pubKey`) as typed edges, constrained by schema validation rules.

**Interaction Flow:**

Client sends JSON -> HominioQL service -> Parse -> Permissions -> Filter/Fetch Docs (`hominio-db`) -> Load LoroDocs -> **Validate (Mutations via `hominio-validate.ts`)** -> Process (Query/Mutate) -> Format Result JSON.

---

## Query Structure

Fetches documents and automatically resolves all entity relationships recursively.

```json
{
  "operation": "query",
  "from": { // Initial document set selection
    "pubKey": "@somePubKey",        // Optional: Specific document ID
    "schema": "gunka" | "@gunkaPubKey", // Optional: Filter by schema name or @pubKey
    "owner": "someHominioID"        // Optional: Filter by owner
    // Future: Add more filters (timestamps, etc.)
  },
  "filter": [ // Optional: Array of AND clauses to refine
    {
      "place": "x1",                // Target Lojban place in 'data.places'
      "is": "@entityPubKey" | "value" // Operator: equals (value or reference)
    },
    {
      "meta": "name",              // Target field in 'meta' map
      "contains": "Task"           // Operator: string contains
    }
    // Future: More operators, OR logic
  ],
  // "select": [], // SELECT IS IGNORED FOR NOW - Always returns full document data
  // RESOLUTION IS NOW AUTOMATIC AND RECURSIVE FOR ALL ENTITY REFERENCES
  "language": "en"              // Optional: Preferred language for translations
}
```

**Query Processing Notes:**

*   Uses `meta.schema` to find the schema definition for interpreting `filter` clauses and identifying entity-type places (places with `validation.schema` defined).
*   The `select` field is ignored. Queries return the full representation of matching documents.
*   **Automatic Recursive Resolution:** The engine automatically attempts to resolve *all* `@pubKey` references found within `data.places` fields where the corresponding schema place definition includes a `validation.schema` array. This resolution is recursive.
*   Resolved documents replace the `@pubKey` string within the results and are also returned in their full representation.
*   **Cycle detection** is implemented internally to prevent infinite loops.
*   **Performance Note:** Automatic deep resolution might be resource-intensive. Future versions might introduce controls to limit depth or specify paths.

---

## Mutation Structure

Creates, updates, or deletes documents.

```json
{
  "operation": "mutate",
  "action": "create" | "update" | "delete",
  "target": {
    "pubKey": "@somePubKey"   // Required for 'update' and 'delete'
  },
  "document": { // Required for 'create' and 'update'
    // --- Required for 'create' --- 
    "schema": "gunka" | "@gunkaPubKey", // Schema name or @pubKey this doc conforms to
    
    // --- Data for Loro 'data' map --- 
    "data": {                    
      "places": {                // Place values to set/update
        "x1": "@person2PubKey", // Set place x1 to reference person2
        "x2": "New Description"   // Set place x2 to a string value
        // Only include places being set/updated
      }
      // Optional: "translations": [...] 
    }
  }
}
```

**Mutation Processing Notes:**

*   All `create` and `update` mutations are validated against the relevant schema definition using a dedicated validation service (`hominio-validate.ts`, to be created) before changes are persisted.
*   **Create:** Requires `document.schema`. Validation uses this schema. Owner defaults to the current user. Generates a new `pubKey`.
*   **Update:** Requires `target.pubKey`. Fetches the document and its schema (`meta.schema`). Validation uses the fetched schema.
*   **Delete:** Requires `target.pubKey`. Checks `canDelete` permission and calls the delete function.
*   **Validation Logic (`hominio-validate.ts`):**
    *   Checks `required` fields defined in schema places.
    *   Uses the `validation` object within each schema place definition:
        *   If data is `@pubKey` reference: Verifies against `validation.schema` (allowed schema list).
        *   If data is literal: Verifies against `validation.value` (type or rule like "email").
        *   Handles cases where both reference and literal values are allowed.
        *   Throws detailed errors on validation failure.

---

## Schema Validation Definition

Validation rules for document places are defined within the `validation` object inside each place definition within a schema. This replaces the older `type` and `entitySchemas` properties.

**Structure:**

```typescript
"xN": {
  "description": "...",
  "required": true | false,
  "validation": {
    // Optional: Defines allowed schema types for @pubKey references
    "schema": ["@schema1PubKey", "@schema2PubKey", ...],

    // Optional: Defines allowed literal value type or rule
    "value": "string" | "number" | "boolean" | "email" | "url" | { /* rule object */ },

    // Optional: Advanced rule object for value validation (used if value is complex type)
    "rule": { /* min, max, minLength, maxLength, options, regex, etc. */ }
  }
}
```

**Interpretation:**

*   **Reference Only:** If only `validation.schema` is present, the place MUST be a `@pubKey` reference to an entity whose schema matches one in the list.
*   **Literal Only:** If only `validation.value` is present, the place MUST be a literal matching the specified type or rule.
*   **Reference OR Literal:** If *both* `validation.schema` and `validation.value` are present, the place can contain EITHER a valid reference OR a valid literal.
*   **Any:** If the `validation` object is missing or empty, the place accepts any value.

**Example Validation Rules:**

Using hypothetical `project` and `gunka` (task) schemas:

1.  **Project Name (`project.x1`): String Only**
    ```json
    "x1": {
      "description": "Project Name",
      "required": true,
      "validation": { "value": "string" }
    }
    ```

2.  **Project Status (`project.x2`): Enum String**
    ```json
    "x2": {
      "description": "Project Status",
      "required": false,
      "validation": {
        "value": "string",
        "rule": { "options": ["planning", "active", "completed", "on_hold"] }
      }
    }
    ```

3.  **Project Lead (`project.x3`): Reference Only (to 'prenu')**
    ```json
    "x3": {
      "description": "Project Lead",
      "required": false,
      "validation": { "schema": ["@prenuPubKey"] } // Must be a @pubKey linking to a 'prenu' doc
    }
    ```

4.  **Task Description (`gunka.x2`): String with Max Length**
    ```json
    "x2": {
      "description": "Task Description",
      "required": true,
      "validation": {
        "value": "string",
        "rule": { "maxLength": 200 }
      }
    }
    ```

5.  **Task Assignee/Contact (`gunka.x5` - hypothetical): Reference OR Email String**
    ```json
    "x5": {
      "description": "Assignee or Contact Email",
      "required": false,
      "validation": {
        "schema": ["@prenuPubKey"], // Can be a reference to a 'prenu' doc
        "value": "email"            // OR it can be a valid email string
      }
    }
    ```

The `hominio-validate.ts` service uses these definitions to ensure data integrity during mutations.

---

## Examples (Querying Task/Status Data)

Assuming placeholders like `@task1`, `@person1`, `@status1`, etc. represent actual `pubKey`s.

1.  **Find all tasks (schema 'gunka'):**
    ```json
    { "operation": "query", "from": { "schema": "gunka" } }
    ```
    *(Returns full document data for tasks, entity references in places remain as `@pubKey` strings as resolution wasn't requested implicitly by structure)*

2.  **Find task named "API Integration":**
    ```json
    { "operation": "query", "from": { "schema": "gunka" }, "filter": [ { "meta": "name", "is": "API Integration" } ] }
    ```
    *(Returns full document data for task2)*

3.  **Find tasks assigned to Alice (`@person1`):**
    ```json
    { "operation": "query", "from": { "schema": "gunka" }, "filter": [ { "place": "x1", "is": "@person1" } ] }
    ```
    *(Returns full document data for tasks assigned to Alice)*

4.  **Find the status of 'task1':**
    ```json
    { "operation": "query", "from": { "schema": "tcini" }, "filter": [ { "place": "x2", "is": "@task1" } ] }
    ```
    *(Returns full document data for status1, with place x2 automatically resolved to contain the full task1 data)*

5.  **Find tasks currently "in_progress" (indirectly - gets status docs first):**
    ```json
    { "operation": "query", "from": { "schema": "tcini" }, "filter": [ { "place": "x1", "is": "in_progress" } ] }
    ```
    *(Returns full status documents where x1 is "in_progress". Place x2 in each result will contain the fully resolved task document automatically. No subsequent query needed by the client for the task itself.)*

6.  **Find task1 (Resolution happens automatically):**
    ```json
    { "operation": "query", "from": { "pubKey": "@task1" } }
    ```
    *(Returns full data for task1. Since place x1 is defined as type 'entity', the engine automatically resolves `@person1` and replaces the string in the result with the full person1 document data.)*

7.  **Find status1 (Resolution happens automatically and recursively):**
    ```json
    { "operation": "query", "from": { "pubKey": "@status1" } }
    ```
    *(Returns full data for status1. Engine sees place x2 is type 'entity', resolves `@task1` to the full task1 document. It then examines the resolved task1 data, sees place x1 is type 'entity', resolves `@person1` to the full person1 document, and nests that within the task1 data inside the status1 result. Cycle detection prevents infinite loops.)*

---

## Future Considerations

*   Advanced filtering operators and OR logic.
*   Bulk operations.
*   Direct support for joining/linking concepts in queries.
*   Performance optimizations.
