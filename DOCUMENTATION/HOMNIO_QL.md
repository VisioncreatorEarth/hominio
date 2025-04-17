# Hominio Query Language (HQL) Guide

This document outlines the structure and usage of Hominio Query Language (HQL) for interacting with HominioDB documents via the `hominioQLService`. HQL provides a JSON-based interface for querying and mutating documents based on their metadata and content.

## Core Concepts

*   **Documents:** Data is stored in documents, each identified by a unique `pubKey`.
*   **Metadata (`meta`):** Each document has a `meta` object containing information like `pubKey`, `owner`, `schema` (reference to the document's schema, null for the root Gismu schema), and `name`.
*   **Data (`data`):** The main content of the document resides in the `data` object, typically containing `places` and `translations`.
*   **Places:** The `places` map within `data` holds the structured content according to the document's schema. Values can be literals or references to other documents (e.g., `'@0x...'`).
*   **Schemas:** Documents define their structure using schemas. Schemas are themselves documents. The root schema is "gismu" (`GENESIS_PUBKEY`), which has `meta.schema: null`. Other schemas reference their defining schema (usually gismu).

## HQL Request Structure

All HQL requests are objects with an `operation` field specifying either `'query'` or `'mutate'`.

```typescript
type HqlRequest = HqlQueryRequest | HqlMutationRequest;
```

## 1. Queries (`operation: 'query'`)

Queries are used to retrieve documents based on various criteria.

### Query Request Interface (`HqlQueryRequest`)

```typescript
interface HqlQueryRequest {
    operation: 'query';
    from?: HqlFromClause;  // Optional: Define the source set
    filter?: HqlFilterObject; // Optional: Define filtering conditions
}

interface HqlFromClause {
    pubKey?: string | string[]; // Select specific document(s) by pubKey
    schema?: string;          // Select documents using a specific schema (name or '@pubKey')
    owner?: string;           // Select documents owned by a specific user ID
}

interface HqlFilterObject {
    meta?: { // Filter based on metadata fields
        [key: string]: HqlMetaFilterValue; // e.g., pubKey, owner, schema, name
    };
    places?: { // Filter based on data fields within 'data.places'
        [key: string]: HqlPlaceFilterValue; // Key is x1, x2 etc.
    };
    $or?: HqlFilterObject[];    // Logical OR across multiple filters
    $and?: HqlFilterObject[];   // Logical AND across multiple filters
    $not?: HqlFilterObject;     // Logical NOT for a filter
}

// Filter values can be literals or condition objects
type HqlMetaFilterValue = HqlValue | HqlCondition;
type HqlPlaceFilterValue = HqlValue | HqlCondition | string; // Allows direct '@ref' strings for places

type HqlValue = string | number | boolean | null | HqlValue[] | { [key: string]: HqlValue };

type HqlCondition = {
    [key in HqlOperator]?: HqlValue | HqlValue[];
};

// Supported Operators
type HqlOperator =
    | '$eq'    // Equal
    | '$ne'    // Not equal
    | '$gt'    // Greater than
    | '$gte'   // Greater than or equal
    | '$lt'    // Less than
    | '$lte'   // Less than or equal
    | '$in'    // Value is in array
    | '$nin'   // Value is not in array
    | '$exists'// Field exists (true) or does not exist (false)
    | '$regex' // Matches a JavaScript RegExp string
    | '$contains'; // String contains substring
```

### Query Result (`HqlQueryResult`)

A query returns an array of resolved document objects (`ResolvedHqlDocument[]`), or `null` if an error occurs during processing.

```typescript
type HqlQueryResult = ResolvedHqlDocument[];

// Example structure of a resolved document
type ResolvedHqlDocument = {
    pubKey: string;
    meta: {
        name?: string;
        owner: string;
        schema?: string | null; // '@pubkey' or null
        // ... other potential meta fields
    };
    data: {
        places: Record<string, any>; // Values can be literals or resolved nested documents
        translations?: any[];
        // ... other potential data fields
    };
    $localState?: { // Information about local unsynced changes
        isUnsynced: boolean;
        hasLocalSnapshot: boolean;
        localUpdateCount: number;
    };
    $error?: string; // Present if there was an issue resolving this specific document (e.g., permissions, cycle)
    // ... other potential top-level fields
};
```

### Query Examples

**1. Get a specific document by PubKey (using `from`)**

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  from: {
    pubKey: '0x0000000000000000000000000000000000000000000000000000000000000000' // GENESIS_PUBKEY
  }
};
```

**2. Get a specific document by PubKey (using `filter`)**

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: {
      pubKey: '0x0000000000000000000000000000000000000000000000000000000000000000' // GENESIS_PUBKEY
    }
  }
};
```

**3. Get all documents using the "prenu" schema (by name)**
*(Note: Filtering by schema name requires the HQL service to resolve the name to a PubKey, which might involve extra lookups)*

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  from: {
    schema: 'prenu'
  }
};
// OR using filter:
const queryFilter: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: {
      schema: '@<prenu_schema_pubkey>' // Requires knowing the prenu schema's actual pubkey
    }
  }
};
```

**4. Get the root Gismu schema document (schema is null)**

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: { schema: null }
  }
};
```

**5. Get all "gunka" documents where `x3` (purpose) exists and `x1` (worker) refers to a specific 'prenu' PubKey**

```javascript
const specificPrenuPubKey = '@0x123...abc';
const query: HqlQueryRequest = {
  operation: 'query',
  from: {
    schema: 'gunka' // Filter for 'gunka' schema docs
  },
  filter: {
    places: {
      x3: { $exists: true }, // Purpose field must exist
      x1: specificPrenuPubKey // Worker must be this specific prenu reference string
      // Note: HQL automatically handles the '@' prefix comparison for place references
    }
  }
};
```

**6. Get "gunka" documents where the worker (`x1`) is one of two people AND the task (`x2`) contains the word "refactor"**

```javascript
const worker1Ref = '@0x111...aaa';
const worker2Ref = '@0x222...bbb';
const query: HqlQueryRequest = {
  operation: 'query',
  from: {
    schema: 'gunka'
  },
  filter: {
    $and: [ // Both conditions must be true
      { places: { x1: { $in: [worker1Ref, worker2Ref] } } },
      { places: { x2: { $contains: 'refactor' } } }
    ]
  }
};
```

## 2. Mutations (`operation: 'mutate'`)

Mutations are used to create, update, or delete documents. All mutations require an authenticated user.

### Mutation Request Interface (`HqlMutationRequest`)

```typescript
interface HqlMutationRequest {
    operation: 'mutate';
    action: 'create' | 'update' | 'delete';
    pubKey?: string; // Required for update/delete
    schema?: string; // Required for create (Schema name or '@pubKey')
    places?: Record<string, HqlValue | string>; // Place data for create/update. '@pubKey' strings allowed for references.
}
```

### Mutation Result (`HqlMutationResult`)

### Mutation Examples

**1. Create a new "prenu" document**

```javascript
const mutation: HqlMutationRequest = {
  operation: 'mutate',
  action: 'create',
  schema: 'prenu', // Specify schema by name (or use '@<prenu_schema_pubkey>')
  places: {
    x1: "Sam Andert" // Value for the 'x1' place defined in the 'prenu' schema
  }
};
```

**2. Create a new "gunka" document referencing an existing "prenu"**

```javascript
const existingPrenuRef = '@0x123...abc'; // PubKey of the prenu document prefixed with '@'
const mutation: HqlMutationRequest = {
  operation: 'mutate',
  action: 'create',
  schema: 'gunka',
  places: {
    x1: existingPrenuRef,       // Reference the worker
    x2: "Document HQL Service", // Task
    x3: "Provide clear API"     // Purpose
  }
};
```

**3. Update an existing "gunka" document's purpose (`x3`)**

```javascript
const gunkaToUpdatePubKey = '0x456...def';
const mutation: HqlMutationRequest = {
  operation: 'mutate',
  action: 'update',
  pubKey: gunkaToUpdatePubKey,
  places: {
    x3: "Provide comprehensive examples" // New value for x3
    // Only fields included in 'places' will be updated
  }
};
```

**4. Delete a document**

```javascript
const docToDeletePubKey = '0x789...ghi';
const mutation: HqlMutationRequest = {
  operation: 'mutate',
  action: 'delete',
  pubKey: docToDeletePubKey
};
```

## 3. Reactive Queries (`processReactive`)

The `hominioQLService` also provides a `processReactive` method specifically for Svelte components.

```typescript
processReactive(request: HqlQueryRequest): Readable<HqlQueryResult | null | undefined>;
```

*   Takes a standard `HqlQueryRequest`.
*   Returns a Svelte `Readable` store *synchronously*.
*   The store initially holds `undefined`.
*   When the initial query completes, the store updates to hold the `HqlQueryResult` (an array) or `null` if there was an error.
*   The store automatically re-runs the query and updates its value whenever relevant underlying documents change in `hominioDB`.

**Usage in Svelte:**

```svelte
<script lang="ts">
  import { hominioQLService, type HqlQueryRequest, type HqlQueryResult } from '$lib/KERNEL/hominio-ql';
  import { type Readable } from 'svelte/store';

  const myQuery: HqlQueryRequest = {
    operation: 'query',
    from: { schema: 'prenu' }
  };

  // Get the readable store
  const prenuReadable: Readable<HqlQueryResult | null | undefined> = hominioQLService.processReactive(myQuery);

  // In Svelte 5, use $derived or auto-subscription ($prenuReadable) in the template
  // const prenuList = $derived(prenuReadable);
</script>

<!-- Use auto-subscription in the template -->
{#if $prenuReadable === undefined}
  <p>Loading...</p>
{:else if $prenuReadable === null}
  <p>Error loading data.</p>
{:else if $prenuReadable.length === 0}
  <p>No prenu found.</p>
{:else}
  <ul>
    {#each $prenuReadable as prenu (prenu.pubKey)}
      <li>{prenu.data?.places?.x1} ({prenu.pubKey})</li>
    {/each}
  </ul>
{/if}
```

This reactive query handles fetching, error states, and automatic updates when data changes. 