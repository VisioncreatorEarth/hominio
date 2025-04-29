# Hominio Mutations (JSON Format)

This document describes how to perform create, update, and delete operations on Hominio documents (`Leaf`, `Schema`, `Composite`) using the JSON-based mutation system defined in `src/lib/KERNEL/hominio-mutate.ts`.

## Overview

Mutations are executed via the `executeMutation` function, which takes a `MutateHqlRequest` object and the acting `CapabilityUser`. It processes a batch of mutation operations atomically.

```typescript
import { executeMutation, type MutateHqlRequest } from '$lib/KERNEL/hominio-mutate';
import type { CapabilityUser } from '$lib/KERNEL/hominio-caps';

async function performMutations(request: MutateHqlRequest, user: CapabilityUser | null) {
    const result = await executeMutation(request, user);

    if (result.status === 'success') {
        console.log("Mutations successful:", result.generatedPubKeys);
        // result.generatedPubKeys maps placeholders like "$$newTask" to their final pubKeys
    } else {
        console.error("Mutation failed:", result.message, result.errorDetails);
    }
}
```

## Core Concepts

1.  **Atomic Execution:** All operations within a single `MutateHqlRequest` are treated as a single transaction. If any operation fails (due to permission errors, unresolved placeholders, etc.), the entire batch is rolled back (conceptually, as persistence only happens in phase 2).
2.  **Placeholders:** Use placeholders (e.g., `$$newTask`, `$$taskName`) to refer to documents created within the *same* mutation batch. This allows linking newly created documents together. Placeholders **must** be defined in a `create` operation before they are used in subsequent operations within the same request.
3.  **Two-Phase Commit (Conceptual):**
    *   **Phase 1 (Prepare & Validate):** Operations are processed in memory. Placeholders are resolved to temporary keys, permissions are checked, and LoroDocs are prepared.
    *   **Phase 2 (Commit):** Final pubKeys are generated for new documents, LoroDocs are updated with final keys, and changes (deletes, creates, updates) are persisted to storage using `hominioDB`. Indexing is triggered after successful commit.
4.  **Permissions:** Capability checks (`canCreate`, `canWrite`, `canDelete`) are performed based on the provided `CapabilityUser`.
5.  **Document Types:** Operations target specific document types: `'Leaf'`, `'Schema'`, or `'Composite'`.

## Mutation Request Structure

```typescript
export interface MutateHqlRequest {
    mutations: MutationOperation[]; // Array of individual operations
}

// Union type for any mutation operation
export type MutationOperation = CreateMutationOperation | UpdateMutationOperation | DeleteMutationOperation;
```

## Operation Types

### 1. `create` Operation

Creates a new `Leaf`, `Schema`, or `Composite` document.

```typescript
export interface CreateMutationOperation {
    operation: 'create';
    type: 'Leaf' | 'Schema' | 'Composite'; // Target document type
    placeholder?: string; // Optional: Temporary ID (e.g., "$$newLeaf") for intra-mutation refs
    // Data structure depends on 'type'
    data: LeafRecord['data'] | SchemaRecord['data'] | CompositeRecord['data'];
    owner?: string; // Optional: Defaults to the acting user's ID if available
}

// Example LeafRecord['data'] variants:
// { type: 'Concept' }
// { type: 'LoroText', value: 'Initial text' }
// { type: 'LoroMap', value: { key1: 'val1' } }
// { type: 'LoroList', value: [1, 2, 3] }
// { type: 'Index' } // Starts empty, value map created automatically

// Example SchemaRecord['data']:
// { name: 'cneme', places: { x1: 'entity', x2: 'name' }, translations: { ... } }

// Example CompositeRecord['data']:
// { schemaId: 'pubkey_or_$$placeholder', places: { x1: 'pubkey_or_$$placeholder', x2: '...' } }
```

**`create` Example (Adding a Todo Task):**

```typescript
// Assume CNEME_SCHEMA_ID and TCINI_SCHEMA_ID are defined
// Assume STATUS_NOT_STARTED_ID is the pubkey for the "Not Started" status leaf

const taskLeafOp: CreateMutationOperation = {
    operation: 'create',
    type: 'Leaf',
    placeholder: '$$newTask', // Define placeholder for the new task leaf
    data: { type: 'Concept' } // Simple concept leaf for the task itself
};

const taskNameLeafOp: CreateMutationOperation = {
    operation: 'create',
    type: 'Leaf',
    placeholder: '$$taskName', // Define placeholder for the name leaf
    data: { type: 'LoroText', value: 'My New Todo Text' }
};

// Link task to its name using cneme
const cnemeCompositeOp: CreateMutationOperation = {
    operation: 'create',
    type: 'Composite',
    placeholder: '$$cnemeLink',
    data: {
        schemaId: CNEME_SCHEMA_ID,
        places: {
            x1: '$$newTask',  // Use task placeholder
            x2: '$$taskName' // Use name placeholder
        }
    }
};

// Link task to its initial status using tcini
const tciniCompositeOp: CreateMutationOperation = {
    operation: 'create',
    type: 'Composite',
    placeholder: '$$tciniLink',
    data: {
        schemaId: TCINI_SCHEMA_ID,
        places: {
            x1: '$$newTask',          // Use task placeholder
            x2: STATUS_NOT_STARTED_ID // Use existing status leaf pubkey
        }
    }
};

const request: MutateHqlRequest = {
    mutations: [taskLeafOp, taskNameLeafOp, cnemeCompositeOp, tciniCompositeOp]
};

// await executeMutation(request, currentUser);
```

### 2. `update` Operation

Modifies an existing `Composite` document (currently only updating `places` is fully implemented).

```typescript
export interface UpdateMutationOperation {
    operation: 'update';
    type: 'Leaf' | 'Schema' | 'Composite'; // Target document type
    targetPubKey: string; // PubKey of the document to update
    // Partial data to update. Structure depends on 'type'
    // Currently, only Composite places update is fully supported:
    data: Partial<CompositeRecord['data']>;
    // Example for Composite: { places: { x2: 'new_status_leaf_pubkey' } }
    placeholder?: undefined; // Cannot use placeholder with update
}
```

**`update` Example (Changing Todo Status):**

```typescript
// Assume tciniCompositeId holds the pubkey of the Task-Status link to update
// Assume targetStatusLeafId holds the pubkey of the new status (e.g., @status_completed)

const updateStatusOp: UpdateMutationOperation = {
    operation: 'update',
    type: 'Composite',
    targetPubKey: tciniCompositeId, // ID of the specific tcini link
    data: {
        // Only specify the fields to change
        places: { x2: targetStatusLeafId } // Update place x2 to the new status leaf ID
    }
};

const request: MutateHqlRequest = {
    mutations: [updateStatusOp]
};

// await executeMutation(request, currentUser);
```

*(Note: Updating Leaf values or Schema definitions via this mechanism might require further implementation in `executeMutation`.)*

### 3. `delete` Operation

Deletes an existing `Leaf`, `Schema`, or `Composite` document.

```typescript
export interface DeleteMutationOperation {
    operation: 'delete';
    type: 'Leaf' | 'Schema' | 'Composite'; // Type of document being deleted
    targetPubKey: string; // PubKey of the document to delete
    placeholder?: undefined; // Cannot use placeholder with delete
    // Optional: Specify dependency handling strategy? (Not currently implemented)
    // cascade?: boolean;
}
```

**`delete` Example (Deleting a Todo Task and its Links):**

```typescript
// Assume taskId, tciniCompositeId, cnemeCompositeId, nameLeafId contain the relevant pubkeys

const deleteTciniLinkOp: DeleteMutationOperation = {
    operation: 'delete', type: 'Composite', targetPubKey: tciniCompositeId
};
const deleteCnemeLinkOp: DeleteMutationOperation = {
    operation: 'delete', type: 'Composite', targetPubKey: cnemeCompositeId
};
const deleteNameLeafOp: DeleteMutationOperation = {
    operation: 'delete', type: 'Leaf', targetPubKey: nameLeafId
};
const deleteTaskLeafOp: DeleteMutationOperation = {
    operation: 'delete', type: 'Leaf', targetPubKey: taskId
};

const request: MutateHqlRequest = {
    mutations: [
        deleteTciniLinkOp,
        deleteCnemeLinkOp,
        deleteNameLeafOp,
        deleteTaskLeafOp // Delete the core task leaf last
    ]
};

// await executeMutation(request, currentUser);
```

*(Note: Dependency checking (e.g., preventing deletion of a Leaf if Composites still reference it) is **not** currently implemented in `executeMutation` and should be handled by application logic or future enhancements.)*

## Return Value

The `executeMutation` function returns a `MutationResult`:

```typescript
export interface MutationSuccessResult {
    status: 'success';
    // Maps any placeholders used (e.g., "$$newTask") to their final generated pubKeys
    generatedPubKeys: Record<string, string>;
}

export interface MutationErrorResult {
    status: 'error';
    message: string; // Description of the error
    errorDetails?: unknown; // Optional additional error context
}

export type MutationResult = MutationSuccessResult | MutationErrorResult;
```
