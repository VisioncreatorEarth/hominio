# Refactoring Data Model: Schema, Leaf, Composite

## Conceptual Overview: Composite/Leaf Architecture

We are reframing our data model terminology to better reflect a composite/leaf architecture, drawing inspiration from Lojban's structure but using more standard English terms:

*   **Leaf (formerly Sumti):** Represents the fundamental building blocks – atomic data values (like strings, numbers) or conceptual entities that stand on their own. In Lojban terms, these are the arguments (`sumti`) filling the roles in a relation. They don't define relational structure themselves. (`metadata.type: 'Leaf'`)
*   **Schema (formerly Selbri/Gismu):** Defines the *template* for a relationship. It specifies the available places (e.g., `x1`, `x2`), their roles, and the overall meaning of the relationship, including multi-language translations. It corresponds conceptually to a Lojban `gismu`. (`metadata.type: 'Gismu'`)
*   **Composite (formerly Bridi):** Represents a concrete *instance* or *assertion* of a relationship defined by a Schema. It links specific Leaves together, filling the places defined in the Schema template. This corresponds to a Lojban `bridi`. (`metadata.type: 'Composite'`)

This shift clarifies that `Schemas` define the structure, `Leaves` provide the content, and `Composites` instantiate the relationships.

---

# Proposed Schema Definitions

This section outlines the proposed final structures for `SchemaRecord`, `LeafRecord`, and `CompositeRecord`.

## Schema Record (`SchemaRecord`)

Defines the template for a relationship.

```typescript
// Represents documentation for a single place (x1-x5) within a specific language
interface SchemaPlaceTranslation {
  title: string;       // Short, user-facing label (e.g., "worker", "Akteur")
  description: string; // Longer explanation of the place's role.
}

// Represents all documentation for a schema within a specific language
interface SchemaLanguageTranslation {
  // General Schema Info
  purpose?: string;    // High-level purpose/goal of the schema itself.
  prompt?: string;     // Contains usage examples and AI guidance.

  // Place Definitions (required per place used by the schema)
  places: {
    x1?: SchemaPlaceTranslation;
    x2?: SchemaPlaceTranslation;
    x3?: SchemaPlaceTranslation;
    x4?: SchemaPlaceTranslation;
    x5?: SchemaPlaceTranslation;
  };
}

// Type alias for Schema public key
type SchemaId = string;

// The main proposed SchemaRecord structure
export interface SchemaRecord {
    pubkey: SchemaId;
    metadata: {          // RENAMED from ckaji
        type: 'Schema';   // RENAMED from klesi. Represents a Schema template.
    };
    data: {              // RENAMED from datni
        schemaId: SchemaId; // RENAMED from gismu (Reference to its own pubkey)
        name: string;    // RENAMED from cneme. The canonical gismu name (e.g., "zukte", "gunka")

        // Defines the structural places the schema uses (e.g., x1, x2, x3)
        places: {        // RENAMED from sumti
            x1?: string; // Often contains the Lojban variable name (e.g., 'rutni')
            x2?: string;
            x3?: string;
            x4?: string;
            x5?: string;
        };

        // Contains all language-specific documentation.
        translations: {  // RENAMED from stidi
            en?: SchemaLanguageTranslation; // Use specific language codes
            de?: SchemaLanguageTranslation; // Use specific language codes
            // [languageCode: string]: SchemaLanguageTranslation; // Allow others if needed
        };
    }
}
```

## Leaf Record (`LeafRecord`)

Represents atomic data, concepts, or indices.

```typescript
// Type alias for Leaf public key
export type LeafId = string;
export type Pubkey = string; // Keep generic pubkey type maybe? Or consolidate? For now, keep both.

// Kinds of data values a Leaf can hold
export type LeafValueType = 'Concept' | 'LoroMap' | 'LoroText' | 'LoroList' | 'LoroMovableList' | 'LoroTree' | 'Index';

// Specific Leaf data structures based on type
type LeafValueMap = { type: 'LoroMap'; value: Record<string, unknown> };
type LeafValueText = { type: 'LoroText'; value: string };
type LeafValueList = { type: 'LoroList' | 'LoroMovableList'; value: unknown[] };
type LeafValueTree = { type: 'LoroTree'; value: unknown };
type LeafValueConcept = { type: 'Concept' }; // No 'value' field needed, capitalized type
type LeafValueIndex = { type: 'Index'; value: Record<Pubkey, true> }; // Represents a set of pubkeys, uses LoroMap internally but abstracted here.

export type LeafValue = LeafValueMap | LeafValueText | LeafValueList | LeafValueTree | LeafValueConcept | LeafValueIndex;

// The main proposed LeafRecord structure
export interface LeafRecord {
    pubkey: Pubkey;
    metadata: {           // RENAMED from ckaji
        type: 'Leaf';     // SIMPLIFIED: Only 'Leaf', Facki is now a data type 'Index'.
    };
    data: LeafValue;      // RENAMED from datni. Holds the actual value/type info.
}

```

## Composite Record (`CompositeRecord`)

Represents an instance of a relationship (Schema) linking specific Leaves.

```typescript
// Type alias for Composite public key
export type CompositeId = string;

// The main proposed CompositeRecord structure
export interface CompositeRecord {
    pubkey: CompositeId;
    metadata: {             // RENAMED from ckaji
        type: 'Composite';  // RENAMED from klesi
    };
    data: {                 // RENAMED from datni
        schemaId: SchemaId; // RENAMED from selbri. Reference to the Schema being instantiated.
        places: {           // RENAMED from sumti. Links places to Leaf pubkeys.
            x1?: LeafId;
            x2?: LeafId;
            x3?: LeafId;
            x4?: LeafId;
            x5?: LeafId;
        };
    };
}
```

---

# Mapping from Old (Selbri/Sumti/Bridi) to New (Schema/Leaf/Composite)

When migrating existing data:

1.  **Concepts & Files:**
    *   Selbri -> Schema (Concept)
    *   Sumti -> Leaf (Concept)
    *   Bridi -> Composite (Concept)
    *   Facki -> Leaf (Concept, where `LeafRecord.data.type` is `'Index'`)
    *   `selbri.ts` -> `schema.data.ts` (File - suggestion)
    *   `sumti.ts` -> `leaf.data.ts` (File - suggestion)
    *   `bridi.ts` -> `composite.data.ts` (File - suggestion)

2.  **Record Types:**
    *   `SelbriRecord` -> `SchemaRecord`
    *   `SumtiRecord` -> `LeafRecord`
    *   `BridiRecord` -> `CompositeRecord`

3.  **ID Types:**
    *   `SelbriId` -> `SchemaId`
    *   `SumtiId` -> `LeafId`
    *   `BridiId` -> `CompositeId`

4.  **Top-Level Property Names:**
    *   `ckaji` -> `metadata`
    *   `datni` -> `data`

5.  **Metadata Property Names:**
    *   `klesi` -> `type` (Value changes: `'Selbri'`->`'Schema'`, `'Sumti'`->`'Leaf'`, `'Bridi'`->`'Composite'`, `'Facki'`->`'Leaf'`)
    *   `cmene` -> `name` (In `LeafRecord.metadata` - REMOVED per user edit, but kept here for mapping reference if needed)

6.  **Data Property Names:**
    *   `selbri` (in old Bridi) -> `schemaId` (in `CompositeRecord.data`)
    *   `gismu` (in proposed Gismu) -> `schemaId` (in `SchemaRecord.data`)
    *   `sumti` (in old Bridi/Selbri) -> `places` (in `CompositeRecord.data` and `SchemaRecord.data`)
    *   `stidi` (in old/proposed Gismu) -> `translations` (in `SchemaRecord.data`)
    *   `fanva` (in old Selbri) -> Removed (data migrated to `translations.places`)
    *   `vasru` (in old Sumti) -> `value` (in `LeafRecord.data` for non-concept/non-index types)
    *   `klesi` (in old Sumti.datni) -> `type` (in `LeafRecord.data`)
    *   `cneme` (in old Selbri) -> `name` (in `SchemaRecord.data`)
    *   *Index Data:* Old Facki documents (like `FACKI_SUMTI_PUBKEY`) become `LeafRecord` where `metadata.type = 'Leaf'` and `data = { type: 'Index', value: { ... map of pubkeys ... } }`.

7.  **Translation Structure (`SchemaRecord.data.translations`):**
    *   Top-level keys are language codes (e.g., `en`, `de`).
    *   Each language object contains `purpose` (optional string), `prompt` (optional string), and `places` (object).
    *   The `places` object maps place names (`x1`, `x2`, etc.) to objects with `title` (string) and `description` (string).

8.  **Parsing/Migration Specifics:**
    *   Old `fanva` data needs to be parsed (e.g., `"worker (person...)"`) into `title` ("worker") and `description` ("person...") under the correct language and place within the new `translations` structure.
    *   Old `stidi` markdown needs parsing to extract `purpose` and `examples` (which become the new `prompt`).

---

# Example: `@schema/name` (New Schema)

Here's how the previous `@selbri_cneme` / `@gismu_cneme` data would look using the final proposed schema and terminology:

```typescript
{
    pubkey: '@schema/name', // Example new pubkey format
    metadata: {
        type: 'Schema'
    },
    data: {
        schemaId: '@Schema', // RENAMED example value, was '@schema/name'
        name: 'cneme', // Canonical Lojban gismu name
        places: { x1: 'selci\'a', x2: 'cmene' }, // Original Lojban place descriptors
        translations: {
            en: { // English translations
                purpose: "Specifically links an entity (Leaf x1) to its corresponding name Leaf (x2).",
                prompt: `
*Usage Examples:*
    1. Linking Person Name: 'cneme(@person/alice, @leaf/name_alice)' -> Links Leaf @person/alice to the Leaf containing "Alice".
    2. Linking Project Name: 'cneme(@project/website, @leaf/name_website)' -> Links Leaf @project/website to the Leaf containing "Project: Website".
*AI Guidance:*
    - Use this schema to associate any entity (Leaf: person, place, concept, project ID) with its designated name Leaf.
    - Ensure place 'x2' points to a Leaf whose data.value contains the name string, not the string itself.
                `,
                places: {
                    x1: {
                        title: "entity being named",
                        description: "The Leaf (person, project, task, concept, etc.) that possesses the name."
                    },
                    x2: {
                        title: "name leaf",
                        description: "The Leaf whose 'data.value' field holds the actual name string for x1."
                    }
                }
            },
            de: { // German translations
                purpose: "Verknüpft spezifisch eine Entität (Leaf x1) mit ihrem entsprechenden Namens-Leaf (x2).",
                prompt: `
*Anwendungsbeispiele:*
    1. Verknüpfung Personenname: 'cneme(@person/alice, @leaf/name_alice)' -> Verknüpft Leaf @person/alice mit dem Leaf, das "Alice" enthält.
    2. Verknüpfung Projektname: 'cneme(@project/website, @leaf/name_website)' -> Verknüpft Leaf @project/website mit dem Leaf, das "Project: Website" enthält.
*AI Anleitung:*
    - Verwenden Sie dieses Schema, um eine beliebige Entität (Leaf: Person, Ort, Konzept, Projekt-ID) mit ihrem zugehörigen Namens-Leaf zu verknüpfen.
    - Stellen Sie sicher, dass Platz 'x2' auf ein Leaf zeigt, dessen data.value den Namenstext enthält, nicht den Text selbst.
                `,
                places: {
                    x1: {
                        title: "Entität die benannt wird",
                        description: "Das Leaf (Person, Projekt, Aufgabe, Konzept usw.), die den Namen besitzt."
                    },
                    x2: {
                        title: "Namens-Leaf",
                        description: "Das Leaf, dessen Feld 'data.value' den tatsächlichen Namenstext für x1 enthält."
                    }
                }
            }
            // Add other languages here following the same structure
        }
    }
}
```

This example demonstrates:
- Use of `SchemaRecord`, `SchemaId`, `LeafId`.
- Use of `metadata` and `data` top-level properties.
- Use of `metadata.type = 'Schema'`.
- Use of `data.name` for the canonical name.
- Use of `data.places` for place structure definition.
- Use of `data.translations` containing language-keyed objects (`en`, `de`).
- Within each language: `purpose`, `prompt`, and nested `places` with `title` and `description`.
- Updated terminology (Leaf, Schema) within the documentation strings.
- Example pubkey format change (e.g., `@schema/name`).

---

# Refactoring Project Plan: Schema / Leaf / Composite

This plan outlines the steps to refactor the codebase terminology and structure.

**Phase 1: Core Data & Seeding**

1.  - [x] **`src/db/seeding/schema.data.ts`**
    *   **Current State:** Defines `SelbriRecord`... `ckaji.klesi = 'Selbri'`. Old `fanva`/`stidi`.
    *   **Future State:** Defines `SchemaRecord`... `metadata.type = 'Schema'`. Uses new `translations` structure. Renamed internal fields.
    *   **Actions:** Rename file. Update type defs (`SchemaRecord`, `SchemaId`, `SchemaLanguageTranslation`, `SchemaPlaceTranslation`). Update interface props (`ckaji`->`metadata`, `datni`->`data`, `klesi`->`type`, `selbri`/`gismu`->`schemaId`, `cneme`->`name`, `sumti`->`places`, `stidi`->`translations`). Update `metadata.type` value to `'Schema'`. Rename export `initialSelbri` -> `initialSchemas`. **Manually refactor data** to new structure, parsing old `fanva`/`stidi`. Rename pubkeys. (Note: Manual data refactor needed)

2.  - [x] **`src/db/seeding/leaf.data.ts`**
    *   **Current State:** Defines `SumtiRecord`... `ckaji.klesi = 'Sumti'/'Facki'`. Uses `datni.vasru`, `datni.klesi`.
    *   **Future State:** Defines `LeafRecord`... `metadata.type = 'Leaf'`. Uses `data.value`, `data.type` (including `'Concept'`, `'Index'`). Renamed internal fields. Facki indices are now `LeafRecord`s with `data.type = 'Index'`.
    *   **Actions:** Rename file. Update type defs (`LeafRecord`, `LeafId`, `LeafValue...`, including `LeafValueIndex`, `LeafValueConcept` capitalization). Update interface props (`ckaji`->`metadata`, `datni`->`data`, `klesi`->`type`). Update `metadata.type` value to `'Leaf'` for *all* records. Update `data.klesi` -> `data.type`, and `data.vasru` -> `data.value`. Capitalize `concept` -> `Concept`. Convert Facki definitions to `LeafRecord`s with `data: { type: 'Index', value: {...} }`. Rename export `initialSumti` -> `initialLeaves`. Rename internal vars.

3.  - [x] **`src/db/seeding/composite.data.ts`**
    *   **Current State:** Defines `BridiRecord`... `ckaji.klesi = 'Bridi'`. Uses `datni.selbri`, `datni.sumti`.
    *   **Future State:** Defines `CompositeRecord`... `metadata.type = 'Composite'`. Uses `data.schemaId`, `data.places`.
    *   **Actions:** Rename file. Update type defs (`CompositeRecord`, `CompositeId`). Update interface props (`ckaji`->`metadata`, `datni`->`data`, `klesi`->`type`, `selbri`->`schemaId`, `sumti`->`places`). Update `metadata.type` value to `'Composite'`. Rename export `initialBridi` -> `initialComposites`. Rename pubkeys. Update `metadata.type` in all records. Update `data.schemaId` and `data.places` keys.

4.  - [] **`src/db/seed.ts`**
    *   **Current State:** Imports old names/types. Calls old seed functions. Creates Facki documents.
    *   **Future State:** Imports new names/types. Calls new seed functions. Creates Index Leaf documents.
    *   **Actions:** Update imports (`initialLeaves`, `initialSchemas`, `initialComposites` & types). Rename Facki semantic names to Index Leaf names (`INDEX_LEAF_PUBKEY_SCHEMAS`, etc.). Update `fackiRecordsToSeed` to `indexLeafRecordsToSeed` (or similar), ensure it creates `LeafRecord` with `data: { type: 'Index', value: {} }`. Rename seeding functions (`seedLeafDocument`, `seedSchemaDocument`, `seedCompositeDocument`). Update function definitions/calls to use new props (`metadata`, `data`, etc.). Update logs/comments. (Note: Logic needs to bu adapter but not hcnaged in its core seeding logic just new syntax *)

**Phase 2: Core Logic**

1.  - [x] **`src/lib/KERNEL/hominio-query.ts`**
    *   **Current State:** Uses old types. `from` keys are `sumti_pubkeys`, etc. Checks `targetType` `'schema'`. Uses `schema_resolved`. Uses Lojban field names (`ckaji`, `datni`...) internally. Fetches Index Leaf docs (`data.type === 'Index'`) for all.
    *   **Future State:** Uses new types (`LeafQueryResult`, etc.). `from` keys are `leaf_pubkeys`, etc. Checks `targetType` `'leaf'/'gismu'`. Uses `schema_resolved`. Uses English field names (`metadata`, `data`...) internally. Fetches Index Leaf docs (`data.type === 'Index'`) for all.
    *   **Actions:** Rename types. Rename `from` keys. Update `processResolve` `targetType`. Update HQL map definitions (`schema_resolved`, resolve map fields like `data.value`, etc.). Update internal field access (`selectFieldValue`, `processMap`, `processTraversal`, `evaluateSingleWhere`) to use `metadata.type`, `data.schemaId`, `data.places`, `data.value`, `data.type`, `data.translations`, etc. Update logic for `from: { leaf_pubkeys: [] }` (or schema/composite) to fetch the corresponding *Index Leaf* and read keys from `data.value`.

2.  - [x] **`src/lib/KERNEL/hominio-indexing.ts`**
    *   **Current State:** `switch (docType)` uses `'Schema'`, `'Selbri'`, `'Bridi'`. References Facki documents by pubkey. Uses Lojban field names.
    *   **Future State:** `switch (docType)` uses `'Leaf'`, `'Gismu'`, `'Composite'`. Identifies Index Leaves (`metadata.type === 'Leaf'` and `data.type === 'Index'`) by pubkey and updates their `data.value` map. Uses English field names.
    *   **Actions:** Update `switch` cases (`Selbri` -> `Schema`, `Bridi` -> `Composite`). Remove explicit Facki handling. Update logic to fetch *Index Leaf* documents by their pubkeys (e.g., `INDEX_LEAF_PUBKEY_SCHEMAS`). Update internal logic to read `metadata.type`, `data.type`, `data.schemaId`, `data.places`, `data.value`, etc. When updating an index, get the Leaf doc, check `data.type === 'Index'`, then modify `data.value` map (which should be a LoroMap). Update composite index keys (`schema:...`, `leaf:...`). Update `isFackiIndexDocument` helper -> `isIndexLeafDocument` using the new pubkeys/structure.

3.  - [x] **`src/lib/KERNEL/loro-engine.ts`**
    *   **Current State:** Uses old types and function names (`getSumtiDoc`, `getBridiDoc`, `getSelbriDoc`, `checkSumtiExists`, `checkSelbriExists`, `getBridiIndexList`, `findBridiDocsBySelbriAndPlace`, `findBridiDocsInvolvingSumti`). Refers to Facki index keys. Uses Lojban terms in keys/logs.
    *   **Future State:** Uses new types and function names (`getLeafDoc`, `getCompositeDoc`, `getSchemaDoc`, `checkLeafExists`, `checkSchemaExists`, `getCompositeIndexList`, `findCompositeDocsBySchemaAndPlace`, `findCompositeDocsInvolvingLeaf`). Refers to Index Leaf keys. Uses English terms.
    *   **Actions:**
        *   Rename functions (`getSumtiDoc`->`getLeafDoc`, `getBridiDoc`->`getCompositeDoc`, `getSelbriDoc`->`getSchemaDoc`).
        *   Rename existence check functions (`checkSumtiExists`->`checkLeafExists`, `checkSelbriExists`->`checkSchemaExists`). Update their internal logic if needed to check `metadata.type` or rely solely on the Index Leaf.
        *   Rename `getBridiIndexList` -> `getCompositeIndexList`. Update Facki key lookup (`bridi_by_component` -> `composite_by_component`). Update internal key format (`schema:${schemaId}:${place}:${leafId}`). Update logs.
        *   Rename `findBridiDocsBySelbriAndPlace` -> `findCompositeDocsBySchemaAndPlace`. Update params (`selbriId`->`schemaId`, `sumtiId`->`leafId`). Call renamed functions. Update composite key format. Update logs.
        *   Rename `findBridiDocsInvolvingSumti` -> `findCompositeDocsInvolvingLeaf`. Update params (`selbriId`->`schemaId`, `sumtiId`->`leafId`). Call renamed functions. Update composite key format. Update logs.
        *   Update internal type usage (`SelbriId`->`SchemaId`, `SumtiId`->`LeafId`, `BridiRecord`->`CompositeRecord`, `Pubkey`).
        *   Update all comments and log messages to reflect new terminology (Leaf, Schema, Composite).

4.  - [x] **`src/lib/components/BridiNode.svelte` -> `src/lib/components/CompositeNode.svelte`**
    *   **Current State:** Named `BridiNode`. Uses `data.fanva`.
    *   **Future State:** Renamed `CompositeNode`. Expects `data.translations`. Uses new terminology.
    *   **Actions:** Rename file. Rename CSS class. Update type `CompositeNodeData`. Update helpers/template to read from `data.translations.[lang].places.[place].title/description`. Update comments/text.

5.  - [x] **`src/lib/components/GraphView.svelte`**
    *   **Current State:** Imports `BridiNode`. Types `ResolvedSumti`, `Relationship`. Uses `selbri_resolved`, `fanva`. Node type `bridiNode`. Helper `isLiteralSumti`.
    *   **Future State:** Imports `CompositeNode`. Types `ResolvedLeaf`, `CompositeInstanceData`. Uses `schema_resolved`, `translations`. Node type `compositeNode`. Helper `isLiteralLeaf`.
    *   **Actions:** Rename import. Update `nodeTypes`. Rename types. Update node creation (`type`, pass `translations` data). Rename helper `isLiteralLeaf`. Update logs/comments. Query `getRelationshipQuery` needs update (`sumti_pubkeys`->`leaf_pubkeys`, `selbri_resolved`->`schema_resolved`, map to `translations`, etc.).

6.  - [x] **`src/lib/components/SumtiQueries.svelte` -> `src/lib/components/LeafQueries.svelte`**
    *   **Current State:** Named `SumtiQueries`. Uses `SumtiQueryResult`, `selectedSumtiId`, etc. UI: "Sumti". Query uses `sumti_pubkeys`.
    *   **Future State:** Renamed `LeafQueries`. Uses `LeafQueryResult`, `selectedLeafId`, etc. UI: "Leaf". Query uses `leaf_pubkeys`.
    *   **Actions:** Rename file/component. Update types. Update query def. Update variables. Update UI labels.

7.  - [x] **`src/lib/components/SelbriQueries.svelte` -> `src/lib/components/SchemaQueries.svelte`**
    *   **Current State:** Named `SelbriQueries`. Uses `SelbriQueryResult`, `selectedSelbriId`, etc. UI: "Selbri"/"Schema". Query uses `selbri_pubkeys`, `fanva`, `stidi`.
    *   **Future State:** Renamed `SchemaQueries`. Uses `SchemaQueryResult`, `selectedSchemaId`, etc. UI: "Schema". Query uses `gismu_pubkeys` (or rename?), `translations`.
    *   **Actions:** Rename file/component. Update types. Update query def (`gismu_pubkeys`?, map `translations`). Update query fn `createCompositeQueryForSchema`. Update variables. Update UI labels. Update display logic for places/prompt from `translations`. Check `createRandomPrenu` pubkey ref.

8.  - [x] **`src/lib/components/NodesProps.svelte`**
    *   **Current State:** UI: "Sumti", "Relationships". Types `SumtiQueryResult`, `Relationship`. Query uses `sumti_pubkeys`, `selbri`.
    *   **Future State:** UI: "Leaf", "Composites". Types `LeafQueryResult`, `CompositeInstanceData`. Query uses `leaf_pubkeys`, `schemaId`.
    *   **Actions:** Update types. Update `relationshipQueryDefinition` (`leaf_pubkeys`, `schemaId`, `targetType: 'gismu'`). Update variables. Update UI text. Update rendering logic.

9.  - [ ] **`src/routes/hql/+page.svelte`**
    *   **Current State:** Imports old names. Uses old tab labels.
    *   **Future State:** Imports new names. Uses new tab labels.
    *   **Actions:** Update imports (`SchemaQueries`, `LeafQueries`). Update template usage. Update tab labels ("Schema", "Leaf").

---

**Execution Order:**

1.  Apply file renames (`schema.data.ts`, `leaf.data.ts`, `composite.data.ts`, etc.).
2.  Update types and data structures within the renamed seeding files (`schema.data.ts`, `leaf.data.ts`, `composite.data.ts`). **Crucially, manually refactor `initialSchemas` data and convert Facki to Index Leaves in `leaf.data.ts`.**
3.  Update `seed.ts` to create Index Leaves.
5.  Update core logic: `hominio-indexing.ts`, `hominio-query.ts`, `loro-engine.ts`.
6.  Refactor UI components (`CompositeNode.svelte`, `SchemaQueries.svelte`, `LeafQueries.svelte`, `NodesProps.svelte`, `GraphView.svelte`).
7.  Update main page `+page.svelte`.
