# HQL Refactor: Graph Model with Loro Types & Bridi Patterns

## 1. Overview

This document outlines a proposed refactoring of the Hominio data model and HQL (Hominio Query Language) to adopt a graph-centric approach. This revised plan emphasizes:

-   **Pure References in Bridi:** Relationship (`bridi`) documents will *only* contain references (`@pubkey`) to `sumti` documents in their `data.sumti` map.
-   **Literals via Linked Sumti & Loro Types:** Literal values (like names, descriptions) are stored within dedicated `sumti` nodes, typically using appropriate Loro containers (`LoroText`, etc.) within their `data` map. These literal `sumti` nodes are linked to conceptual `sumti` nodes via specific relationship `bridi` (e.g., using a `@cmene_is` selbri).
-   **Bridi-Pattern Querying:** The query language will focus on matching native Lojbanic `bridi` patterns (selbri + x1-x5 places), not RDF triples.

The core goals remain:

-   Represent core entities/concepts distinctly from their relationships.
-   Enable cleaner modeling of many-to-many relationships.
-   Create a more flexible and extensible data structure.
-   Leverage Loro container types for rich literal data.
-   Implement a query language aligned with the bridi structure.

## 2. Core Concepts

The refactored model revolves around three main `meta.gismu` types: `sumti`, `selbri`, and `bridi`.

### 2.1. `sumti` Documents: The Nodes (Entities/Concepts/Literals)

-   **`meta.gismu = 'sumti'`**
-   Represents a unique node in the knowledge graph. This can be:
    -   A **Conceptual Entity:** e.g., a specific person (`@fiona`), task (`@task_buy_milk`), status (`@status_todo`). These usually have NO `data` map.
    -   A **Literal Value Holder:** e.g., the specific text "Fiona" (`@literal_fiona`), the text "Buy Oat Milk" (`@literal_buy_oat_milk`). These WILL have a `data` map, typically holding the value within a Loro container (e.g., `data.value: LoroText("Fiona")`).
-   **Primary Identifier:** The `pubKey` *is* the identifier.
-   **`meta.cmene`:** Can optionally have a `meta.cmene` for human-readability/debugging.
-   **`meta.type`:** An optional field to further categorize sumti nodes (e.g., `person`, `task`, `status`, `text_literal`, `number_literal`). Useful for validation and querying.

```json
// Example: Conceptual sumti for Fiona
{
  "pubKey": "0xfiona_sumti_pubkey...",
  "meta": {
    "gismu": "sumti",
    "type": "person", // Optional typing
    "cmene": "Fiona Concept Node",
    "owner": "..."
  }
  // NO "data" map
}

// Example: Literal sumti for the text "Fiona"
{
  "pubKey": "0xliteral_fiona_pubkey...",
  "meta": {
    "gismu": "sumti",
    "type": "text_literal", // Optional typing
    "cmene": "Literal 'Fiona'",
    "owner": "..."
  },
  "data": {
    // Value stored using LoroText
    "value": { "loro_container": "LoroText", "content": "Fiona" } // Pseudo-JSON for LoroText
  }
}
```

### 2.2. `selbri` Documents: The Relationship Types

-   **`meta.gismu = 'selbri'`**
-   Defines the *type* of a relationship (`bridi`).
-   **`data.sumti`:** Describes the role of each place (x1-x5).
-   **`data.javni`:** Defines validation rules for each place in a `bridi` using this `selbri`. Specifies:
    -   `required`: boolean
    -   `type`: string - Indicates the expected **type** (from `meta.type`) of the *referenced `sumti` node*. Examples: `"@person_sumti"`, `"@task_sumti"`, `"@text_literal_sumti"`, `"@any_sumti"`.

```json
// Example: selbri document for @cmene_is
// (Relates a concept to its literal name)
{
  "pubKey": "0xcmene_is_selbri_pubkey...",
  "meta": {
    "gismu": "selbri",
    "cmene": "cmene_is",
    "owner": "..."
  },
  "data": {
    "sumti": {
      "x1": { "description": "The sumti concept being named" },
      "x2": { "description": "The sumti node holding the literal name (text)" }
    },
    "javni": {
      "x1": { "required": true, "type": "@any_sumti" },       // Expects ref to any concept
      "x2": { "required": true, "type": "@text_literal_sumti" } // Expects ref to a text literal sumti
    }
  }
}

// Example: selbri document for @gunka
{
  "pubKey": "0xgunka_selbri_pubkey...",
  "meta": {
    "gismu": "selbri",
    "cmene": "gunka",
    "owner": "..."
  },
  "data": {
    "sumti": {
      "x1": { "description": "Worker concept (sumti)" },
      "x2": { "description": "Task concept (sumti)" },
      "x3": { "description": "List/Context concept (sumti)" }
    },
    "javni": {
      // All places expect references to appropriately typed sumti nodes
      "x1": { "required": true, "type": "@person_sumti" },
      "x2": { "required": true, "type": "@task_sumti" },
      "x3": { "required": false, "type": "@list_sumti" }
    }
  }
}
```

### 2.3. `bridi` Documents: The Relationships (Edges/Facts)

-   **`meta.gismu = 'bridi'`**
-   Represents an instance of a relationship, connecting `sumti` nodes.
-   **`data.selbri`:** Required reference (`@selbri_pubkey`) to the defining `selbri`.
-   **`data.sumti`:** Map (x1-x5) where **ALL values MUST be references (`@sumti_pubkey`)** to other `sumti` documents. The type of the referenced `sumti` should match the expectation in the `selbri`'s `javni`.

```json
// Example: bridi linking Fiona concept sumti to its literal name sumti
{
  "pubKey": "0xbridi_fiona_has_name_pubkey...",
  "meta": {
    "gismu": "bridi",
    "cmene": "Fiona Name Fact",
    "owner": "..."
  },
  "data": {
    "selbri": "@0xcmene_is_selbri_pubkey...",    // Link to @cmene_is selbri
    "sumti": {
      "x1": "@0xfiona_sumti_pubkey...",          // Ref to Fiona concept (javni.x1 = @any_sumti)
      "x2": "@0xliteral_fiona_pubkey..."       // Ref to literal sumti (javni.x2 = @text_literal_sumti)
    }
  }
}

// Example: bridi for Fiona works on Buy Milk Task in Main List
{
  "pubKey": "0xbridi_gunka_1_pubkey...",
  "meta": {
    "gismu": "bridi",
    "cmene": "Fiona Works on Milk",
    "owner": "..."
  },
  "data": {
    "selbri": "@0xgunka_selbri_pubkey...",        // Link to @gunka selbri
    "sumti": {
      // ALL values are references to sumti nodes
      "x1": "@0xfiona_sumti_pubkey...",          // Ref (javni.x1 = @person_sumti)
      "x2": "@0xtask_buy_milk_sumti_pubkey...",   // Ref (javni.x2 = @task_sumti)
      "x3": "@0xmain_list_sumti_pubkey..."       // Ref (javni.x3 = @list_sumti)
    }
  }
}
```

## 3. Example: Todos Refactored

**3.1. Seed Data:**

1.  **Seed `sumti` Nodes:**
    *   Conceptual: `@fiona`, `@main_list`, `@task_buy_milk`, `@task_feed_cat`, `@status_todo`, `@status_done` (all `gismu: sumti`, optional `meta.type`) - No `data` map.
    *   Literal: `@literal_fiona` (`data: { value: LoroText("Fiona") }`), `@literal_main` (`data: { value: LoroText("Main") }`), `@literal_buy_milk` (`data: { value: LoroText("Buy Oat Milk") }`), `@literal_feed_cat` (`data: { value: LoroText("Feed the cat") }`), `@literal_todo` (`data: { value: LoroText("todo") }`), `@literal_done` (`data: { value: LoroText("done") }`) (all `gismu: sumti`, `meta.type: text_literal`).

2.  **Seed `selbri` Nodes:**
    *   `@cmene_is` (javni: x1=@any_sumti, x2=@text_literal_sumti)
    *   `@description_is` (javni: x1=@any_sumti, x2=@text_literal_sumti)
    *   `@gunka` (javni: x1=@person_sumti, x2=@task_sumti, x3=@list_sumti)
    *   `@tcini` (javni: x1=@status_sumti, x2=@task_sumti) - Defines status relationship.

3.  **Seed `bridi` Nodes (Relationships - All sumti values are @refs):**
    *   `@bridi_fiona_name` (selbri: `@cmene_is`, x1: `@fiona`, x2: `@literal_fiona`)
    *   `@bridi_main_list_name` (selbri: `@cmene_is`, x1: `@main_list`, x2: `@literal_main`)
    *   `@bridi_task1_desc` (selbri: `@description_is`, x1: `@task_buy_milk`, x2: `@literal_buy_milk`)
    *   `@bridi_task2_desc` (selbri: `@description_is`, x1: `@task_feed_cat`, x2: `@literal_feed_cat`)
    *   `@bridi_gunka_1` (selbri: `@gunka`, x1: `@fiona`, x2: `@task_buy_milk`, x3: `@main_list`)
    *   `@bridi_gunka_2` (selbri: `@gunka`, x1: `@fiona`, x2: `@task_feed_cat`, x3: `@main_list`)
    *   `@bridi_tcini_1` (selbri: `@tcini`, x1: `@status_todo`, x2: `@task_buy_milk`)
    *   `@bridi_tcini_2` (selbri: `@tcini`, x1: `@status_done`, x2: `@task_feed_cat`)

**3.2. Querying for Todos:**

Logic remains similar but involves more steps to resolve literals:

1.  Find `@main_list` sumti (e.g., query `cmene_is` bridi). -> `PK_MAIN_LIST`.
2.  Find `gunka` bridi where `x3` is `@PK_MAIN_LIST`. -> `GUNKA_BRIDIS`.
3.  For each `gunka_bridi`:
    *   Get task sumti pubkey from `x2`. -> `PK_TASK`.
    *   Find `description_is` bridi where `x1` is `@PK_TASK`. Get literal sumti pubkey from `x2` -> `PK_LITERAL_DESC`. Fetch `sumti @PK_LITERAL_DESC` and read `data.value` (LoroText).
    *   Find `tcini` bridi where `x2` is `@PK_TASK`. Get status sumti pubkey from `x1` -> `PK_STATUS`.
    *   Find `cmene_is` bridi where `x1` is `@PK_STATUS`. Get literal sumti pubkey from `x2` -> `PK_LITERAL_STATUS`. Fetch `sumti @PK_LITERAL_STATUS` and read `data.value` (LoroText).

**3.3. Creating a New Todo (User inputs "Task Text"):**

1.  Create conceptual sumti for task: `PK_NEW_TASK` (`gismu: sumti`, `type: task`).
2.  Create literal sumti for description: `PK_LITERAL_DESC` (`gismu: sumti`, `type: text_literal`, `data: { value: LoroText("Task Text") }`).
3.  Create `description_is` bridi: `PK_DESC_BRIDI` (selbri: `@description_is`, x1: `@PK_NEW_TASK`, x2: `@PK_LITERAL_DESC`).
4.  Create `gunka` bridi: `PK_GUNKA_BRIDI` (selbri: `@gunka`, x1: `@fiona`, x2: `@PK_NEW_TASK`, x3: `@main_list`).
5.  Create `tcini` bridi: `PK_TCINI_BRIDI` (selbri: `@tcini`, x1: `@status_todo`, x2: `@PK_NEW_TASK`).
    *(Requires finding @fiona, @main_list, @status_todo pubkeys first)*

**3.4. Toggling Status:**

1.  Find existing `tcini` bridi for the task (`PK_TASK`). -> `PK_OLD_TCINI`.
2.  Determine new status sumti (`@status_todo` or `@status_done`). -> `PK_NEW_STATUS`.
3.  Create *new* `tcini` bridi linking task to new status: `PK_NEW_TCINI` (selbri: `@tcini`, x1: `@PK_NEW_STATUS`, x2: `@PK_TASK`).
4.  Delete old `tcini` bridi: `PK_OLD_TCINI`.

## 4. HQL Changes

### 4.1. Query Language

We will use the **Bridi-Pattern Matching** approach. The query engine needs to find combinations of `bridi` instances matching patterns specified in the `where` clause. Resolution of `@sumti_pubkey` references to get literal values will be a key part of processing results.

```typescript
// Bridi Pattern for Querying
interface HqlBridiPattern {
  selbri: string; // @selbri_pubkey
  x1?: string | Variable; // @sumti_pubkey or variable "?var"
  x2?: string | Variable;
  x3?: string | Variable;
  x4?: string | Variable;
  x5?: string | Variable;
  pubKey?: string | Variable; // Match the bridi's own pubkey
  // Note: No direct literal value matching here; match by reference
}

// Graph Query Request
interface HqlGraphQueryRequest {
    operation: 'graphQuery';
    select: Variable[]; // Variables to return (bound to @sumti_pubkeys)
    where: HqlBridiPattern[]; // Array of patterns to match
}
```

### 4.2. Mutation Language

Focus on creating/deleting `sumti` and `bridi` nodes.

```typescript
// Create Sumti (Conceptual or Literal)
interface HqlCreateSumtiRequest {
  operation: 'mutate';
  action: 'createSumti';
  meta?: { // Optional initial meta fields
    cmene?: string;
    type?: string;
    owner?: string;
  };
  data?: { // Optional initial data (for literal sumti)
    value?: string | number | boolean | null | object | any[]; // Value to store in Loro container
  };
}

// Create Bridi (Relationships)
interface HqlCreateBridiRequest {
  operation: 'mutate';
  action: 'createBridi';
  selbri: string; // @selbri_pubkey
  sumti: Record<string, string>; // Placeholders -> @sumti_pubkey references ONLY
  meta?: { // Optional bridi meta
      cmene?: string;
      owner?: string;
  };
}

// Delete (Sumti or Bridi)
interface HqlDeleteRequest {
  operation: 'mutate';
  action: 'deleteSumti' | 'deleteBridi';
  pubKey: string; // PubKey of the node/relationship to delete
}

type HqlMutationRequest = HqlCreateSumtiRequest | HqlCreateBridiRequest | HqlDeleteRequest;
```

**Note:** Complex actions like creating a todo now require orchestrating multiple `createSumti` and `createBridi` calls, likely within the application logic or a higher-level service layer.

## 5. Implementation Plan (High Level)

1.  **Update `seed.ts`:** Implement seeding for conceptual `sumti`, literal `sumti` (with Loro data), and `bridi` (with pure references).
2.  **Update `hominio-validate.ts`:**
    *   Add validation for `sumti` (conceptual vs. literal - data presence).
    *   Modify `validateSelbriDocStructure` (focus on `javni.type` format referencing sumti types).
    *   Rewrite `validateBridiDocAgainstSelbri` (check `data.sumti` values are `@pubkey` refs matching expected `sumti` types from `javni`).
3.  **Refactor `hominio-ql.ts`:**
    *   Implement graph query engine (`_handleGraphQuery`) using bridi patterns.
    *   Implement new mutation handlers (`_handleCreateSumti`, `_handleCreateBridi`, `_handleDeleteSumti`, `_handleDeleteBridi`). Handle Loro container creation for literal sumti.
    *   Update result resolution to follow references and extract literal values from linked sumti nodes.
4.  **Update Frontend:** Adapt queries, result processing (multi-step resolution), and mutation calls (multi-step actions).
5.  **`hominio-db.ts`:** Review `createDocument`/`updateDocument` to handle optional `data` map creation for literal sumti, ensuring Loro containers are used correctly.

## 6. Open Questions / Considerations

-   **Query Performance:** Joins/traversals for resolving literals add overhead. Indexing `bridi` by `selbri` and referenced `sumti` pubkeys becomes more important.
-   **Transactionality:** Still a challenge for multi-step mutations.
-   **Sumti Typing Enforcement:** How strictly to enforce `meta.type` matching between `javni` and referenced `sumti`? Start relaxed?
-   **Literal Representation:** Is `data.value` with a Loro container the best way for literal sumti? Are there cases for multiple properties on a literal node?
-   **Orchestration Layer:** Where should the logic for multi-step mutations (like `createTodo`) reside? In the frontend component? A dedicated service?