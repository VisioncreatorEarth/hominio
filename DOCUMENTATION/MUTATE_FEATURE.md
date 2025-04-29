# Hominio Mutation Engine (MUTATE_HQL Concept)

This document outlines the design for a mutation engine to complement the LORO_HQL query language, enabling transactional modifications to the Hominio graph data.

## Goals

*   Provide a declarative, JSON-based way to express data modifications (create, update, delete).
*   Ensure **atomicity**: Mutations involving multiple steps (e.g., creating a Leaf and linking Composites) should succeed or fail as a single unit.
*   Integrate seamlessly with existing components:
    *   `@hominio-db.ts`: For underlying document/content storage operations.
    *   `@hominio-caps.ts`: For permission enforcement.
    *   `@hominio-indexing.ts`: To ensure indices are updated after successful mutations.
*   Respect the semantic structure defined by `@schema/` documents.

## Proposed JSON Structure (MUTATE_HQL)

A mutation request would be a JSON object containing a list of operations to be performed within a single transaction. Placeholders (`$$<name>`) can be used to reference entities created earlier in the same transaction.

```json
{
  "mutations": [
    {
      "operation": "create",
      "type": "Leaf",
      "placeholder": "$$newTaskLeaf", // Assign a temporary ID for later reference
      "data": { // Corresponds to LeafRecord.data structure
        "type": "Concept"
        // Value would be specified for LoroText, LoroMap etc.
      }
      // Optional: Specify owner, defaults to acting user
    },
    {
      "operation": "create",
      "type": "Leaf",
      "placeholder": "$$newTaskNameLeaf",
      "data": {
        "type": "LoroText",
        "value": "My New Awesome Task"
      }
    },
    {
      "operation": "create",
      "type": "Composite",
      "placeholder": "$$taskNameLink",
      "data": { // Corresponds to CompositeRecord.data structure
        "schemaId": "@schema/cneme", // Reference existing schema
        "places": {
          "x1": "$$newTaskLeaf",     // Reference the placeholder
          "x2": "$$newTaskNameLeaf"  // Reference the placeholder
        }
      }
    },
    {
      "operation": "create",
      "type": "Composite",
      "placeholder": "$$taskAssignment",
      "data": {
        "schemaId": "@schema/gunka",
        "places": {
          "x1": "@person1",        // Reference existing user leaf
          "x2": "$$newTaskLeaf",     // Reference the placeholder
          "x3": "@project1"       // Reference existing project leaf
        }
      }
    },
    {
      "operation": "create",
      "type": "Composite",
      "placeholder": "$$taskStatus",
      "data": {
          "schemaId": "@schema/ckaji",
          "places": {
              "x1": "$$newTaskLeaf",
              "x2": "@status_notstarted" // Reference existing status leaf
          }
      }
    },
    {
       "operation": "update",
       "type": "Composite",
       "targetPubKey": "@composite/task1_ckaji_status_inprogress", // Target specific existing composite
       "data": { // Only fields to update
           "places": { // Update specific places
               "x2": "@status_completed" // Change status reference
           }
       }
       // Alternative targeting: Use query/conditions to find the composite(s) to update? (More complex)
    },
    {
        "operation": "delete",
        "type": "Leaf", // Or "Composite" or "Schema"
        "targetPubKey": "@task3"
        // Note: Deleting requires careful handling of dangling references.
        // The engine might need a strategy:
        // 1. Fail if referenced by Composites.
        // 2. Cascade delete associated Composites (requires careful permission checks).
        // 3. Allow deletion and leave dangling refs (simplest, but query engine needs robustness).
    }
  ]
}
```

## Engine Logic (`@hominio-mutate.ts`)

A potential `executeMutation(mutationRequest: MUTATE_HQL, user: CapabilityUser)` function would:

1.  **Parse & Validate**:
    *   Check the JSON structure for validity.
    *   Verify `schemaId` references exist for Composites.
    *   Ensure data structures match the target type (Leaf/Composite/Schema).
    *   Resolve placeholders (`$$<name>`).

2.  **Plan Operations**:
    *   Create a sequence of low-level operations (`createDoc`, `updateDoc`, `deleteDoc`).
    *   Map placeholders to intermediate results (generated `pubKey`s).

3.  **Permission Check (Pre-flight)**:
    *   For each operation, check permissions using `@hominio-caps.ts`:
        *   `create`: Does the user have a general 'create document' permission? (Or based on context?)
        *   `update`: `canWrite(user, targetDoc)`
        *   `delete`: `canDelete(user, targetDoc)`
    *   **Crucially, perform all checks *before* starting any database modifications.** If any check fails, reject the entire transaction immediately.

4.  **Execute Transaction**:
    *   Initiate a conceptual (or actual database) transaction.
    *   Iterate through the planned operations:
        *   Call corresponding `@hominio-db.ts` methods (`createDocument`, `updateDocument`, `deleteDocument`). Pass the `user` for ownership/permission checks within DB methods if necessary (though pre-flight check is primary).
        *   Store generated `pubKey`s for placeholder resolution.
        *   If any DB operation fails, abort and roll back the transaction.

5.  **Commit & Indexing**:
    *   If all operations succeed, commit the transaction.
    *   After successful commit, update the `indexingState` for all created/modified documents in the `docs` table (e.g., set `needsReindex = true`). The `@hominio-db.ts` update/create methods could potentially handle this automatically upon successful commit.
    *   Optionally, trigger `hominioIndexing.startIndexingCycle()` *after* the commit.

6.  **Return Result**: Indicate success or failure. On success, potentially return the final `pubKey`s corresponding to the placeholders.

## Atomicity / Transactions

Achieving true atomicity is vital. Options include:

1.  **Database Transactions**: If the underlying database (Neon Postgres via Drizzle) supports transactions that span operations across the `docs` and `content` tables *and* these operations can be encapsulated within the Drizzle API, this is the most robust approach. All DB calls within `executeMutation` would run inside a single DB transaction block.
2.  **Compensating Actions**: If true DB transactions are not feasible or too complex to manage across `LoroDoc` creation/snapshotting and DB state, the engine could attempt to manually roll back changes. This is complex and error-prone (e.g., if deleting a compensating item fails). *Less preferred.*
3.  **Two-Phase Commit (Conceptual)**: Prepare all LoroDocs and DB changes without committing. Once all steps are verified as possible, commit everything. This still requires careful state management.

Using database-level transactions is the strongly preferred approach.

## Indexing Considerations

*   Changes must only be indexed *after* the transaction is successfully committed to avoid indexing partial or rolled-back states.
*   Updating `indexingState` within the transaction ensures that if the transaction succeeds, the documents are marked for the next indexing run.

## Examples (Todo App)

### 1. Create a New Task "Review PR #123" for Project 1 (Assigned to Person 2, Initial Status: Not Started)

```json
{
  "mutations": [
    // Create the main Task Leaf
    {
      "operation": "create",
      "type": "Leaf",
      "placeholder": "$$newTask",
      "data": { "type": "Concept" }
    },
    // Create the Name Leaf for the Task
    {
      "operation": "create",
      "type": "Leaf",
      "placeholder": "$$taskName",
      "data": { "type": "LoroText", "value": "Review PR #123" }
    },
    // Link Task and Name Leaf (@schema/cneme)
    {
      "operation": "create",
      "type": "Composite",
      "data": {
        "schemaId": "@schema/cneme",
        "places": { "x1": "$$newTask", "x2": "$$taskName" }
      }
    },
    // Assign Task to Person 2 within Project 1 (@schema/gunka)
    {
      "operation": "create",
      "type": "Composite",
      "data": {
        "schemaId": "@schema/gunka",
        "places": { "x1": "@person2", "x2": "$$newTask", "x3": "@project1" }
      }
    },
    // Set Initial Status (@schema/ckaji)
    {
      "operation": "create",
      "type": "Composite",
      "data": {
        "schemaId": "@schema/ckaji",
        "places": { "x1": "$$newTask", "x2": "@status_notstarted" }
      }
    }
  ]
}
```

### 2. Update Task 1 Status from 'in-progress' to 'completed'

*Assume the composite linking `@task1` and `@status_inprogress` via `@schema/ckaji` has `pubKey: '@composite/task1_ckaji_status_inprogress'`*

```json
{
  "mutations": [
    {
      "operation": "update",
      "type": "Composite",
      "targetPubKey": "@composite/task1_ckaji_status_inprogress",
      "data": {
        "places": {
          "x2": "@status_completed" // Change x2 to point to the 'completed' leaf
        }
      }
    }
  ]
}
```
*(Note: If the `targetPubKey` wasn't known, a more complex query-based update mechanism might be needed, or the client would query first to find the composite pubkey.)*

### 3. Delete Task 3 (and associated composites)

This requires a strategy for handling dependencies. Assuming a cascade-like approach (requires careful permission implementation):

```json
{
  "mutations": [
    // 1. Find Composites referencing @task3
    // (This step might need to happen *within* the engine based on the delete request)
    // Example Composites to delete (needs lookup):
    // - @composite/gunka_task3 (gunka: x2=@task3)
    // - @composite/task3_ckaji_skill_test (ckaji: x1=@task3)
    // - @composite/task3_ckaji_status_notstarted (ckaji: x1=@task3)
    // - @composite/task3_ckaji_tag_qa (ckaji: x1=@task3)
    // - @composite/task3_cneme_name (cneme: x1=@task3)

    // 2. Delete the referencing Composites
    { "operation": "delete", "type": "Composite", "targetPubKey": "@composite/gunka_task3" },
    { "operation": "delete", "type": "Composite", "targetPubKey": "@composite/task3_ckaji_skill_test" },
    { "operation": "delete", "type": "Composite", "targetPubKey": "@composite/task3_ckaji_status_notstarted" },
    { "operation": "delete", "type": "Composite", "targetPubKey": "@composite/task3_ckaji_tag_qa" },
    { "operation": "delete", "type": "Composite", "targetPubKey": "@composite/task3_cneme_name" },

    // 3. Delete the Name Leaf associated via cneme
    { "operation": "delete", "type": "Leaf", "targetPubKey": "@task3_name" }, // Found via cneme composite lookup

    // 4. Delete the Task Leaf itself
    { "operation": "delete", "type": "Leaf", "targetPubKey": "@task3" }
  ]
}
```
*(This cascade delete highlights complexity. The engine might need specific logic or rely on the user explicitly listing all items to delete after querying dependencies.)* 