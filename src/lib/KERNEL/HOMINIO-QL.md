# Hominio QL (HQL) - JSON Interface v3.2 (Graph-Focused)

This document outlines a streamlined JSON interface for Hominio QL, focusing on graph traversal and **entity manipulation** based on Lojban places (`xN`) defined in schemas.

**Core Principles:**

1.  **Universality:** Schemas and Entities are both `doc`s.
2.  **Schema-Driven:** Document structure, place meanings, relationships, and validation rules are defined by Schema documents (`meta.schema`).
3.  **Place-Centric:** Queries and mutations primarily operate on the relationships defined by Lojban places (`data.places.xN`).
4.  **Graph Traversal:** Treats documents as nodes and place references (`@pubKey`) as typed edges. Queries automatically resolve these references.
5.  **Centralized Validation:** All **entity mutations** are validated against their schema's rules by `hominio-validate.ts`.

**Interaction Flow:**

Client JSON -> HQL Service -> Parse -> Permissions (`hominio-capabilities`) -> Filter/Fetch Docs (`hominio-db`) -> Load LoroDocs -> **Validate Entities (via `hominio-validate.ts`)** -> Process -> Format Result JSON.

---

## Query Structure (v3.2)

Fetches **entity** documents based on place relationships and other criteria. Resolves references automatically and recursively.

```json
{
  "operation": "query",
  "from": { // Optional: Initial entity selection (if omitted, queries all accessible entities)
    "pubKey": "@entityPubKey" | ["@key1", "@key2"], // Optional: Specific entity ID(s)
    "schema": "gunka" | "@gunkaPubKey",         // Optional: Filter by entity's schema name or @pubKey
    "owner": "someHominioID"                   // Optional: Filter by entity owner
  },
  "filter": { // Optional: Filter object mirroring document structure (implicit AND)
    "meta": { // Optional: Filter on meta fields
      "name": { "$contains": "Task" },
      "owner": GENESIS_HOMINIO // Implicit $eq
    },
    "places": { // Optional: Filter on place values
      "x1": "@person1PubKey",             // Implicit $eq for reference
      "x2": { "$ne": null },               // Explicit operator
      "x3": { "$exists": true },
      "xN": "some_literal_value"          // Implicit $eq for literal
    },
    "$or": [ // Optional: Logical OR across conditions
      { "places": { "x1": "@person1PubKey" } },
      { "places": { "x4": "completed" } }
    ]
    // $and: [...] // Also possible, for complex groupings
  }
  // Note: Filtering directly on translation content is not supported in this version.
  // Resolution is automatic and deep by default.
}
```

**Query Processing Notes:**

*   Primarily designed to query **entities**. Fetching schemas should typically be done by known `pubKey` via direct DB access or a dedicated schema endpoint if needed, not complex HQL queries.
*   **`from`:** Selects the initial set of entities.
*   **`filter`:** Applies filtering logic using a structure that mirrors the document (`meta`, `places`).
    *   Top-level keys (`meta`, `places`, `$or`, `$and`) are implicitly `AND`ed.
    *   Operators (`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`, `$regex`, `$contains`) are applied as values to specific field keys (e.g., `meta.name`, `places.x1`). Providing a direct value implies `$eq`.
    *   Logical Operators: `$or`, `$and`, `$not` can contain arrays of filter objects matching this structure.
*   **Automatic Deep Resolution:** Resolves all `@pubKey` references in `places` recursively based on the entity's schema definition (`hominio-validate.ts` helps identify reference places). Cycle detection included.

---

## Mutation Structure (v3.2 - Unchanged from v3.1)

Creates, updates, or deletes **entity** documents. Schema mutations are **not** supported via this interface.

```json
{
  "operation": "mutate",
  "action": "create" | "update" | "delete", // Applies only to entities

  // --- Target & Identification ---
  "pubKey": "@entityPubKey",       // REQUIRED for 'update' & 'delete'. IGNORED for 'create'.
  "schema": "gunka" | "@gunkaPubKey", // REQUIRED for 'create'. Defines the entity's type.

  // --- Data Payload (for 'create' & 'update') ---
  "places": {                   // REQUIRED for 'create', OPTIONAL for 'update'.
    "x1": "@person2PubKey",      // Values to set/update.
    "x2": "New Description",
    "x3": null                  // Explicitly clear/unset an optional place.
    // 'update' only includes changed places.
  }
  // Note: Translations are defined in Schema documents and are not mutated here.
}
```

**Mutation Processing Notes:**

*   **Entities Only:** This interface manages entity instances, not schema definitions.
*   **`create` (Entity):**
    *   Requires `schema` (to identify the governing schema) and `places`.
    *   Generates a new entity `pubKey`.
    *   Sets owner to the current user.
    *   **Validation:** Uses `hominio-validate.ts` -> `validateEntityDocument`, providing the entity data and a way to fetch the specified *Schema Document*. `validateEntityDocument` checks `places` data against the rules defined *within* that schema.
*   **`update` (Entity):**
    *   Requires `pubKey`. `places` is an optional patch.
    *   Fetches the entity to determine its schema (`meta.schema`).
    *   **Validation:** Uses `hominio-validate.ts` -> `validateEntityDocument`, providing the *updated* entity data and a way to fetch the entity's *Schema Document*. `validateEntityDocument` checks *changed* `places` values against the rules in the schema.
*   **`delete` (Entity):**
    *   Requires `pubKey`.
    *   Checks permission via `hominio-capabilities.ts`.

---

## Schema Validation Definition (v3.2 - Unchanged Definition)

(This section describes how validation rules *are defined* within **Schema** documents, which `hominio-validate.ts` reads when validating **Entities**).

**Structure:**
```typescript
// Inside a SCHEMA Document's data.places field:
"xN": {
  "description": "...",
  "required": true | false,
  "validation": {
    "schema": ["@schema1PubKey", ...], // Allowed reference types
    "value": "string" | "number" | { /* rule obj */ }, // Allowed literal types/rules
    "rule": { /* options, min/max, etc. */ }
  }
}
```
**Interpretation (by `hominio-validate.ts`):** Handles Reference Only, Lial Only, Reference OR Literal, Any cases. Applies rules.

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

---

## Examples (v3.2)

(Examples updated for v3.2 filter syntax).

1.  **Find tasks (schema 'gunka') assigned to Alice:**
    ```json
    {
      "operation": "query",
      "from": { "schema": "gunka" },
      "filter": {
        "places": { "x1": "@personAlicePubKey" }
      }
    }
    ```
    *(Returns gunka entities. `places.x1` is automatically resolved to the full Alice document).*

2.  **Find the status entity for 'task1':**
    ```json
    {
      "operation": "query",
      "from": { "schema": "tcini" },
      "filter": {
        "places": { "x2": "@task1" }
      }
    }
    ```
    *(Returns the tcini entity for task1. `places.x2` is automatically resolved to the full task1 document, which recursively resolves its own references).*

3.  **Find tasks assigned to Alice OR Bob:**
    ```json
    {
      "operation": "query",
      "from": { "schema": "gunka" },
      "filter": {
        "$or": [
          { "places": { "x1": "@personAlicePubKey" } },
          { "places": { "x1": "@personBobPubKey" } }
        ]
      }
    }
    ```

4.  **Create a new 'prenu' entity:**
    ```json
    {
      "operation": "mutate",
      "action": "create",
      "schema": "prenu", // Or "@prenuPubKey"
      "places": {
        "x1": "Charlie Root"
      }
    }
    ```

5.  **Update task1, changing description (x2) and assigning to Bob (x1):**
    ```json
    {
      "operation": "mutate",
      "action": "update",
      "pubKey": "@task1",
      "places": {
        "x1": "@personBobPubKey",
        "x2": "Integrate the new Payment Gateway API"
      }
    }
    ```

---

## Implementation Plan (HQL v3.2)

This section outlines the steps required to implement the HQL v3.2 interface defined above, emphasizing a clear separation of concerns: `hominio-db.ts` manages core storage and LoroDoc instances, while `hominio-ql.ts` orchestrates the complex HQL logic, validation, and permissions.

**1. Data Layer Enhancements (`src/lib/KERNEL/hominio-db.ts`)**

To serve as a clean foundation for the HQL service, `hominio-db.ts` requires specific methods for accessing document metadata, retrieving fully constituted LoroDoc instances, and handling entity creation/updates atomically. The focus is on providing essential building blocks, keeping complex logic out of this layer.

*   **`getDocument(pubKey: string): Promise<Docs | null>`:**
    *   **Action:** Implement method to fetch single `Docs` metadata record by `pubKey`.
    *   **Purpose:** Essential for HQL to check existence, owner, schema refs without loading full LoroDoc.
*   **`getLoroDoc(pubKey: string): Promise<LoroDoc | null>`:**
    *   **Action:** Implement method to retrieve/reconstruct an active `LoroDoc` instance (snapshot + updates applied).
    *   **Logic:** Check cache, fetch metadata, load snapshot/updates from storage, instantiate, cache, return.
    *   **Purpose:** Provides HQL with the document state needed for filtering and validation.
*   **`createEntity(schemaPubKey: string, initialPlaces: Record<string, any>, ownerId: string): Promise<Docs>`:**
    *   **Action:** Implement dedicated method for entity creation.
    *   **Logic:** Generate `pubKey`, create `LoroDoc` with `meta`/`places`, create/store snapshot, create/store `Docs` metadata.
    *   **Purpose:** Provides a clean HQL interface for the `create` action.
*   **Refactor `updateDocument(pubKey: string, ...)`:**
    *   **Action:** Adapt this method (or create a new one like `persistLoroUpdate`) to accept a `pubKey` and the binary `updateData` (exported by HQL *after* validation).
    *   **Logic:** Calculate update CID, store update content, atomically append CID to `Docs.updateCids`, update `updatedAt`.
    *   **Purpose:** Provides a clean HQL interface for persisting validated changes from `update` actions.
*   **Refactor `deleteDocument(pubKey: string)`:**
    *   **Action:** Confirm `canDelete` check is performed internally *before* deletion.
    *   **Purpose:** Enforces permissions centrally.
*   **`loadAllDocsReturn(): Promise<Docs[]>`:**
    *   **Action:** Create variant of `loadAllDocs` returning the array.
    *   **Purpose:** Provides initial dataset for HQL queries.
*   **(Optional) Query Optimizations:** Consider DB/storage-level filtering by owner/schema.
*   **Decoupling:** Review methods to minimize direct Svelte store updates if intended purely for server-side HQL use.

**2. HQL Processor Implementation (`src/lib/KERNEL/hominio-ql.ts`)**

This new service is the brain of HQL processing.

*   **Action:** Create `hominio-ql.ts`.
*   **Logic:** Implement `HominioQLService` class with `process` method and private handlers (`_handleQuery`, `_handleMutate`, etc.) as detailed previously. Define HQL v3.2 interfaces. Implement filtering, resolution, validation calls, permission checks, and interaction with the new `hominio-db.ts` methods.
*   **Purpose:** Centralizes HQL parsing, validation orchestration, permission checks, data fetching/manipulation via `hominio-db`, and result formatting.

**3. Validation Layer (`src/lib/KERNEL/hominio-validate.ts`)**

*   **Action:** Review and complete the `validateEntityDocument` function.
*   **Logic:** Fully implement place value validation (required, keys, types, references) against the fetched schema definition, using the `SchemaFetcher` provided by `hominio-ql.ts`. Add TODOs for complex rule checks.
*   **Purpose:** Ensures entity data conforms to schema rules before persistence.

**4. Capabilities Layer (`src/lib/KERNEL/hominio-capabilities.ts`)**

*   **Action:** Review `canRead/Write/Delete`.
*   **Logic:** Ensure rules align with HQL needs, especially regarding read access to schemas vs. entities if differentiation is needed.
*   **Purpose:** Centralizes permission logic used by HQL and potentially `hominio-db`.

**5. Constants (`src/db/constants.ts`)**

*   **Action:** No changes needed.
*   **Purpose:** Single source of truth for `GENESIS_PUBKEY`, `GENESIS_HOMINIO`.

**6. Server Endpoint (e.g., `src/routes/api/hql/+server.ts`)**

*   **Action:** Create new endpoint.
*   **Logic:** Handle POST requests, authenticate user, parse HQL JSON, call `hominioQLService.process`, return result/error.
*   **Purpose:** Exposes HQL service via API.

**Suggested Order:** (Remains the same)
1.  `hominio-db.ts` enhancements.
2.  `hominio-ql.ts` core structure & query logic.
3.  `hominio-validate.ts` entity validation refinement.
4.  `hominio-ql.ts` mutation logic & validation integration.
5.  Server endpoint creation.
6.  Testing.

---

## Future Considerations
*   More complex filtering operators if needed for place values (e.g., numerical comparisons).
*   Bulk operations (`createMany`, `updateMany`).
*   Performance optimizations (potential re-introduction of `resolve` controls).
