# Hominio Architecture

## Overview

Hominio is a modern document system built on four distinct architectural layers:

1. **Storage Layer** (hominio-storage.ts)
2. **Content Layer** (hominio-db.ts)
3. **Sync Layer** (hominio-sync.ts)
4. **Query Layer** (hominio-ql.ts)

This separation of concerns provides clear boundaries, flexible implementation, and a powerful development model.

## Architectural Layers

### Storage Layer (KERNEL/hominio-storage.ts)

The lowest level of the system, providing adapters for actual data persistence.

#### Responsibilities:
- Abstract the underlying storage mechanism
- Provide a consistent interface for data operations
- Handle serialization/deserialization of binary data
- Manage basic CRUD operations on raw data

#### Key Abstractions:
- **StorageAdapter**: Interface for different storage backends
- **StorageTransaction**: Atomic operations across multiple items
- **StorageKey**: Abstraction for uniquely identifying stored items
- **StorageValue**: Generic container for binary data (Uint8Array)

#### Initial Implementation:
- IndexedDB adapter for client-side persistence
- Direct storage of LoroDoc binary data (Uint8Array)
- Svelte store integration for reactive UI updates that reflect the stored LoroDoc state

### Content Layer (KERNEL/hominio-db.ts)

The core document system, implementing the dual-layer addressing model with LoroDoc as the source of truth.

#### Responsibilities:
- Manage document identities via PubKeyMocked (similar to IPNS)
- Implement content addressing for document versions (similar to IPFS)
- Create, retrieve, update, and delete LoroDoc instances
- Track document versions through snapshotCids and updateCids
- Export/import LoroDoc documents as binary data
- Maintain document integrity through content hashing and verification

#### Key Abstractions:
- **Content**: LoroDoc instance with internal metadata and content
```typescript
// LoroDoc internal structure (JSON representation)
interface LoroDocStructure {
    metadata: {
        // No internal ID needed as the document is content-addressable
        schemaId: string;      // Reference to schema document by pubKey
        title: string;         // Document title
        description?: string;  // Optional description
        createdAt: number;     // Creation timestamp
        // Additional metadata fields
    },
    data: {
        // Actual document content depends on the schema
        // For example, a todo document might have:
        text: string;
        completed: boolean;
        // etc.
    }
}
```

- **Docs**: External registry of document references with mirrored metadata
```typescript
// External registry entry for tracking and searching documents
interface Docs {
    pubKeyMocked: string;    // Stable document identity (like IPNS), using mock implementation
    owner: string;          // Document owner
    updatedAt: string;      // Last update timestamp
    snapshotCid?: string;   // Content hash of latest snapshot (like IPFS)
    updateCids?: string[];  // Content hashes of incremental updates
    
    // Mirrored metadata from the content source of truth (latest snapshot)
    meta: {
        title: string;        // Title (mirrored from content)
        description?: string; // Description (mirrored from content)
        schemaId: string;     // Schema reference (mirrored from content)
        createdAt: string;    // Creation timestamp (mirrored from content)
    }
}
```

- **ContentItem**: Binary content with its content identifier
```typescript
// Storage of binary content
interface ContentItem {
    cid: string;           // Content identifier (hash)
    type: string;          // 'snapshot' or 'update'
    raw: Uint8Array;       // Raw binary data (serialized LoroDoc containing metadata+data)
    metadata?: Record<string, unknown>; // Additional storage metadata
}
```

#### Core Features:
- Document identity using docid-service.ts:
```typescript
// Example of PubKeyMocked generation for document identity
const pubKey = docIdService.generateDocId(); // Uses docIdService directly
```

- Content addressing using hash-service.ts:
```typescript
// Example of content addressing for snapshot/update hashing
const snapshotData = loroDoc.export({ mode: 'snapshot' });
const snapshotCid = await hashService.hashSnapshot(snapshotData);
```

- Document versioning through snapshots and updates:
```typescript
// HominioDB interface for snapshot/update management
interface HominioDB {
    // Create a new snapshot from current document state
    createSnapshot(pubKeyMocked: string): Promise<{ snapshotCid: string, data: Uint8Array }>;
    
    // Add an update to a document
    addUpdate(pubKeyMocked: string, updateData: Uint8Array): Promise<string>; // Returns updateCid
    
    // Get document with all updates applied
    getContent(pubKeyMocked: string): Promise<{ doc: LoroDoc, docs: Docs }>;
    
    // Export/import document data
    exportContent(pubKeyMocked: string, options?: { mode: 'snapshot' | 'update' }): Promise<Uint8Array>;
    
    // Import a single content snapshot or update
    importContent(data: Uint8Array): Promise<{ pubKeyMocked: string, snapshotCid: string }>;
    
    // Import a snapshot with multiple updates in batch
    importContentBatch(options: { 
        snapshot: Uint8Array, 
        updates?: Uint8Array[] 
    }): Promise<{ 
        pubKeyMocked: string, 
        snapshotCid: string, 
        updateCids: string[] 
    }>;
}
```

### Sync Layer (KERNEL/hominio-sync.ts)

The coordination layer responsible for synchronizing content across clients and servers, managing offline state, and ensuring eventual consistency.

#### Responsibilities:
- Synchronize content between client and server
- Track local changes that need to be synced
- Handle conflict resolution when necessary
- Manage sync state and error handling
- Provide reactive interfaces for sync status
- Implement batch operations for efficient network usage
- Support peer-to-peer and client-server synchronization modes

#### Key Abstractions:
- **SyncService**: Core service managing sync operations
```typescript
interface SyncService {
    // Status tracking with reactive Svelte store
    status: Readable<SyncStatus>;
    
    // Push local changes to remote (server or peer)
    pushToRemote(options?: { target?: 'server' | 'peer', peerId?: string }): Promise<SyncResult>;
    
    // Pull changes from remote (server or peer)
    pullFromRemote(options?: { source?: 'server' | 'peer', peerId?: string }): Promise<SyncResult>;
    
    // Get local documents that need syncing
    getDocumentsForSync(): Promise<{
        pubKeyMocked: string;
        localState: {
            snapshotCid?: string;
            updateCids: string[];
        };
    }[]>;
    
    // Check sync status for a specific document
    getSyncStatus(pubKeyMocked: string): Promise<DocumentSyncStatus>;
    
    // Subscribe to sync events
    subscribe(callback: (event: SyncEvent) => void): () => void;
}
```

- **SyncStatus**: Reactive state for sync operations
```typescript
interface SyncStatus {
    isSyncing: boolean;
    lastSynced: Date | null;
    syncError: string | null;
    pendingLocalChanges: number;
    pendingRemoteChanges: number;
    syncProgress?: {
        total: number;
        completed: number;
        operation: 'push' | 'pull';
    };
}
```

- **DocumentSyncStatus**: Per-document sync state
```typescript
interface DocumentSyncStatus {
    pubKeyMocked: string;
    lastSynced: Date | null;
    hasPendingLocalChanges: boolean;
    pendingLocalUpdates: number;
    hasLocalSnapshot: boolean;
    isSyncing: boolean;
}
```

#### How LocalState Tracking Works:

The Sync Layer maintains a `localState` property within each document that tracks changes that haven't been synced yet:

```typescript
interface Docs {
    // ... other fields as before ...
    
    // Local state tracking for sync
    localState?: {
        snapshotCid?: string;     // Local snapshot that needs syncing
        updateCids?: string[];    // Local updates that need syncing
    };
}
```

When content changes are made in the Content Layer:
1. Content Layer creates new snapshot/update with new CID
2. Content Layer stores binary data in Storage Layer
3. Sync Layer adds the CID to `localState.updateCids` for tracking
4. UI reflects pending sync state to user

During sync operations:
1. Sync Layer identifies documents with `localState` entries
2. For each document:
   - Uploads snapshot/updates to remote
   - Updates document to move CIDs from `localState` to main registry
   - Clears `localState` entries after successful sync

#### Example Synchronization Flow:

```typescript
// Pushing local changes to server
async function pushLocalChangesToServer() {
    // 1. Get documents with local changes
    const docsToSync = await getDocumentsForSync();
    
    for (const doc of docsToSync) {
        // 2. Handle local snapshot if exists
        if (doc.localState?.snapshotCid) {
            // Load binary data
            const snapshotData = await loadContent(doc.localState.snapshotCid);
            
            // Upload to server
            await uploadContent(doc.localState.snapshotCid, snapshotData);
            
            // Update document's main snapshotCid
            await updateDocRegistry(doc.pubKeyMocked, {
                snapshotCid: doc.localState.snapshotCid
            });
            
            // Clear from localState
            await clearLocalState(doc.pubKeyMocked, {
                snapshotCid: doc.localState.snapshotCid
            });
        }
        
        // 3. Handle local updates in batches
        if (doc.localState?.updateCids?.length) {
            // Load all update binaries
            const updates = await loadContentBatch(doc.localState.updateCids);
            
            // Upload in batch
            await uploadContentBatch(updates);
            
            // Register with document
            await registerUpdatesWithDoc(doc.pubKeyMocked, doc.localState.updateCids);
            
            // Clear from localState
            await clearLocalState(doc.pubKeyMocked, {
                updateCids: doc.localState.updateCids
            });
        }
    }
}
```

#### Integration with UI:

The Sync Layer provides reactive Svelte stores for UI integration:

```typescript
// In a Svelte component:
import { syncService } from '$lib/KERNEL/hominio-sync';

// Subscribe to sync status
const syncStatus = syncService.status;

// Sync operations
function handlePush() {
    syncService.pushToRemote();
}

function handlePull() {
    syncService.pullFromRemote();
}

// UI display
{#if $syncStatus.isSyncing}
    <span>Syncing... {$syncStatus.syncProgress?.completed}/{$syncStatus.syncProgress?.total}</span>
{:else if $syncStatus.syncError}
    <span>Error: {$syncStatus.syncError}</span>
{:else if $syncStatus.lastSynced}
    <span>Last synced: {new Date($syncStatus.lastSynced).toLocaleTimeString()}</span>
{/if}

// Pending changes indicator
{#if $syncStatus.pendingLocalChanges > 0}
    <span>{$syncStatus.pendingLocalChanges} pending changes</span>
{/if}
```

### Query Layer (KERNEL/hominio-ql.ts)

The semantic layer that provides meaning and relationships to documents, offering a high-level API for working with domain objects and their connections.

#### Responsibilities:
- Define and manage schemas (as LoroDoc documents)
- Create and traverse relationships (as LoroDoc documents)
- Provide a rich, graph-based query language
- Validate documents against schemas
- Implement the Lojban-inspired relationship model
- Abstract low-level HominioDB operations into domain-specific operations
- Serve as the unification layer between data and UI composites

#### JSON-Native Query Architecture

The Hominio Query Language is designed as a JSON-native query language with a unique, minimalist interface denoted by `o` and two primary operations:

1. **viska**: Retrieve data with JSON-based queries (always returns reactive Svelte stores)
2. **galfi**: Mutate data with JSON-based operations
3. **compose**: Load and render composite UI definitions from stored LoroDoc documents

All queries and mutations are expressed as JSON objects:

```typescript
// Core Query interface - all queries are JSON-serializable
interface HQLQuery {
  klesi: "ckini" | "datni" | "pluta" | "simxu";  // relationship/schema/path/match types
  krasi?: string;            // source document
  bridi?: string;            // relation name
  cmavo?: "x1" | "x2" | "x3" | "x4" | "x5";  // position
  julne?: Record<string, any>; // filter
  cuxna?: string | string[]; // select
  jimte?: number;            // limit
  porsi?: {                  // orderBy
    ckaji: string;           // field
    dikni: "gapru" | "cnita"; // direction (asc/desc)
  }[];
  tarmi?: HQLQuery[];        // patterns
  
  // Self-contained translation array
  fanva?: Array<{
    bangu: string;           // language name
    iso: string;             // ISO code
    velski: {                // property translations
      klesi: string;         // "type"
      krasi: string;         // "source" 
      bridi: string;         // "relation"
      cmavo: string;         // "position"
      julne: string;         // "filter"
      cuxna: string;         // "select"
      jimte: string;         // "limit"
      porsi: string;         // "orderBy"
      tarmi: string;         // "patterns"
    }
  }>;
}

// Core mutation interface
interface HQLMutation {
  klesi: "zbasu" | "galfi" | "vimcu" | "ckini" | "nalckini";  // create/update/delete/relate/unrelate types
  datni?: string;            // schema
  judri?: string;            // id
  srera?: Record<string, any>; // data
  bridi?: string;            // relation name
  x1?: string;               // subject
  x2?: string;               // object
  x3?: string;               // additional context
  x4?: string;               // additional context
  x5?: string;               // additional context
  
  // Self-contained translation array
  fanva?: Array<{
    bangu: string;           // language name
    iso: string;             // ISO code
    velski: {                // property translations
      klesi: string;         // "type"
      datni: string;         // "schema"
      judri: string;         // "id"
      srera: string;         // "data"
      bridi: string;         // "relation"
      x1: string;            // "subject"
      x2: string;            // "object"
      x3: string;            // "context1"
      x4: string;            // "context2"
      x5: string;            // "context3"
    }
  }>;
}

// Composite definition interface
interface HQLComposite {
  judri: string;             // id
  tarmi: {                   // state
    [key: string]: any | { 
      preti?: HQLQuery;      // query
      gengau?: string;       // formula
    }
  };
  tekilfarvi?: {             // machine
    pablica: string;         // initial
    steci: Record<string, {  // states
      ja: Record<string, {   // on
        jarco?: string;      // target
        zumtadji?: string[]; // actions
      }>;
    }>;
  };
  tadji?: Record<string, {   // actions
    javni?: string;          // guard
    galfi?: HQLMutation;     // mutation
    cenba?: Record<string, any>; // update
  }>;
  jarco: object;             // view
  
  // Self-contained translation array
  fanva?: Array<{
    bangu: string;           // language name
    iso: string;             // ISO code
    velski: {                // property translations
      judri: string;         // "id"
      tarmi: string;         // "state"
      preti: string;         // "query"
      gengau: string;        // "formula"
      tekilfarvi: string;    // "machine"
      pablica: string;       // "initial"
      steci: string;         // "states"
      ja: string;            // "on"
      jarco: string;         // "target"
      zumtadji: string;      // "actions"
      tadji: string;         // "actions"
      javni: string;         // "guard"
      galfi: string;         // "mutation"
      cenba: string;         // "update"
      jarco_view: string;    // "view"
    }
  }>;
}

// Export the core interface with built-in translation support
export const o = new HominioQL();

// English translation helper for runtime use
export function enski(obj: any): any {
  if (!obj.fanva || !Array.isArray(obj.fanva)) return obj;
  
  // Find English translation
  const enTranslation = obj.fanva.find(t => t.iso === "en");
  if (!enTranslation) return obj;
  
  // Create translated object with English property names
  const result = {};
  
  for (const [lojbanKey, value] of Object.entries(obj)) {
    if (lojbanKey === "fanva") continue; // Skip translation array
    
    const englishKey = enTranslation.velski[lojbanKey] || lojbanKey;
    
    // Recursively translate nested objects
    if (value && typeof value === 'object' && 'fanva' in value) {
      result[englishKey] = enski(value);
    } else {
      result[englishKey] = value;
    }
  }
  
  return result;
}
```

#### Key Abstractions:
- **Datni**: Schema definition (itself a LoroDoc document)
```typescript
// Schema document structure
interface SchemaContent {
    metadata: {
        cmene: string;       // title: Schema title
        ve_skicu: string;    // description: Schema description
        porsi: string;       // version: Schema version
        te_zbasu: number;    // createdAt: Creation timestamp
    },
    data: {
        jsonDatni: object;   // jsonSchema: JSON Schema definition
    }
}
```

- **Ckini**: Connection between documents (itself a LoroDoc document)
```typescript
// Relationship document structure
interface RelationshipContent {
    metadata: {
        cmene: string;       // title: Relationship title
        te_zbasu: number;    // createdAt: Creation timestamp
    },
    data: {
        bridi: string;       // relation: The bridi (predicate)
        x1: string;          // Subject (source document's pubKeyMocked)
        x2: string;          // Object (target document's pubKeyMocked)
        x3?: string;         // Additional context
        x4?: string;         // Additional context
        x5?: string;         // Additional context
    }
}
```

- **Selfni**: Composite definition (itself a LoroDoc document)
```typescript
// Composite document structure
interface CompositeContent {
    metadata: {
        cmene: string;       // title: Composite title
        ve_skicu: string;    // description: Composite description
        te_zbasu: number;    // createdAt: Creation timestamp
    },
    data: HQLComposite;      // The full composite definition
}
```

- **HominioQL Core Interface**: Simplified, reactive interface for data and UI operations
```typescript
// Core HominioQL interface using minimalist design with o symbol
interface HominioQL {
    // JSON-native query execution (always returns reactive Svelte store)
    viska<T = any>(query: HQLQuery): Readable<T[]>;
    
    // JSON-native mutations
    galfi(mutation: HQLMutation): Promise<{ judri: string, snada: boolean }>;  // id -> judri, success -> snada
    
    // Load and render a composite from a LoroDoc document
    compose(pubKeyMocked: string): Promise<SvelteComponent>;
    
    // Register a new schema
    registerSchema(schema: SchemaContent): Promise<string>;
    
    // Register a relationship schema with translations
    registerRelationSchema(schema: RelationshipSchemaContent): Promise<string>;
    
    // Create a new composite definition
    registerComposite(composite: HQLComposite): Promise<string>;
}

// Export the core interface as the distinctive o symbol
export const o = new HominioQL();
```

#### Meta-Circular Architecture: HQL and Composites

The HQL layer serves as both the data query engine and the UI composition system, creating a meta-circular architecture:

1. **Composites as LoroDoc Documents**: All UI definitions are stored as LoroDoc documents in hominio-db
2. **HQL as Unified Query Language**: The same query/mutation language is used for both data and UI
3. **Direct LoroDoc References**: Composites can be loaded directly by their pubKeyMocked

```typescript
// Loading a composite UI directly from hominio-db
const todoAppComponent = await o.compose("pub-key-mocked-123");

// Querying for all available composites
const availableComposites = o.viska({
  type: "schema",     // type: "schema"
  datni: "selfni",    // schema: "composite"
  porsi: [{           // orderBy:
    ckaji: "te_zbasu",// field: "createdAt"
    dikni: "cnita"    // direction: "desc"
  }]
});

// Create a new composite and store it in hominio-db
const counterCompositeId = await o.galfi({
  type: "create",     // klesi: "zbasu" in Lojban
  datni: "selfni",    // schema: "composite" in Lojban
  data: {            // srera in Lojban
    id: "counter",
    state: {          // tarmi in Lojban
      count: 0
    },
    actions: {          // tadji in Lojban
      increment: {
        update: { count: "$count + 1" }
      }
    },
    view: {            // jarco in Lojban
      type: "component",
      name: "Counter",
      children: [
        {
          type: "element",
          tag: "button",
          attributes: {
            "on:click": "send('INCREMENT')"
          },
          textContent: "Count: $count"
        }
      ]
    }
  }
});
```

#### Relationship Definitions with Lojban and Translations

```typescript
// Register a relationship schema with Lojban predicate "vasru" (contains)
await o.registerRelationSchema({
  name: "vasru",  // cmene in Lojban - Lojban word for "contains/vessel/container"
  ve_skicu: {      // ve_skicu in Lojban - Lojban description
    jbo: "lo bridi poi ke'a vasru ty ny: ty cu diklo ny .i ty cu srana ny", // ve_skicu in Lojban - Lojban description
    en: "x1 contains x2 as a part or content",
    de: "x1 enthält x2 als Teil oder Inhalt"
  },
  fanva: {         // fanva in Lojban - translations
    en: "contains",
    de: "enthält"
  },
  jsonSchema: {     // jsonDatni in Lojban - jsonSchema
    type: "object",
    properties: {
      bridi: { type: "string", const: "vasru" },
      x1: { 
        type: "string", 
        ve_skicu: "Vasru",  // ve_skicu in Lojban - Lojban description
        fanva: {            // fanva in Lojban - translations
          en: "container",
          de: "Behälter"
        }
      },
      x2: { 
        type: "string", 
        ve_skicu: "Se vasru",  // ve_skicu in Lojban - Lojban description
        fanva: {               // fanva in Lojban - translations
          en: "content",
          de: "Inhalt"
        }
      },
      x3: { 
        type: "string", 
        format: "date-time",
        ve_skicu: "Te vasru",  // ve_skicu in Lojban - Lojban description
        fanva: {               // fanva in Lojban - translations
          en: "time added",
          de: "Zeit hinzugefügt"
        }
      }
    },
    required: ["bridi", "x1", "x2"]
  }
});

// Register relationship schema for "assigned" (Lojban "zukte")
await o.registerRelationSchema({
  name: "zukte",   // cmene in Lojban - name: Lojban concept for "act/perform/assigned"
  ve_skicu: {       // ve_skicu in Lojban - Lojban description
    jbo: "lo bridi poi ke'a zukte ty ny za sy: ty zukte sy lo ka ny", // ve_skicu in Lojban - Lojban description
    en: "x1 (task) is assigned to x2 (person) by x4 (assigner) at time x3",
    de: "x1 (Aufgabe) ist x2 (Person) durch x4 (Zuweiser) zum Zeitpunkt x3 zugewiesen"
  },
  fanva: {          // fanva in Lojban - translations
    en: "is assigned to",
    de: "ist zugewiesen an"
  },
  jsonSchema: {      // jsonDatni in Lojban - jsonSchema
    type: "object",
    properties: {
      bridi: { type: "string", const: "zukte" },  // bridi in Lojban - relation
      x1: { type: "string", ve_skicu: "Zukte" },  // ve_skicu in Lojban - Lojban description
      x2: { type: "string", ve_skicu: "Se zukte" },  // ve_skicu in Lojban - Lojban description
      x3: { type: "string", format: "date-time", ve_skicu: "Te zukte" },  // ve_skicu in Lojban - Lojban description
      x4: { type: "string", ve_skicu: "Ve zukte" }  // ve_skicu in Lojban - Lojban description
    },
    required: ["bridi", "x1", "x2"]
  }
});
```

#### Example Usage with Reactive Viska

```typescript
// Create a todo list (mutation)
const { id: listId } = await o.galfi({
  type: "create",         // klesi: "zbasu" in Lojban
  schema: "todoList",     // datni: "todoList" in Lojban
  data: {                 // srera in Lojban
    title: "Shopping List",  // cmene in Lojban - title
    description: "Things to buy at the store",  // ve_skicu in Lojban - description
    createdAt: new Date().toISOString()  // te_zbasu in Lojban - createdAt
  }
});

// Create a todo item (mutation)
const { id: todoId } = await o.galfi({
  type: "create",         // klesi: "zbasu" in Lojban
  schema: "todoItem",     // datni: "todoItem" in Lojban
  data: {                 // srera in Lojban
    text: "Buy milk",     // velsku in Lojban - text
    completed: false,     // mulno in Lojban - completed
    priority: "high",     // vajni in Lojban - priority
    dueDate: new Date(Date.now() + 86400000).toISOString() // snada_detri in Lojban - dueDate: Tomorrow
  }
});

// Create a relationship using Lojban predicate
await o.galfi({
  type: "relate",         // klesi: "ckini" in Lojban
  relation: "vasru",      // bridi: "vasru" in Lojban (for "contains")
  x1: listId,             // todoList (container)
  x2: todoId,             // todoItem (content)
  x3: new Date().toISOString()  // When added
});

// Get todos in a list - always returns a reactive Svelte store
const todos = o.viska({
  type: "match",          // klesi: "simxu" in Lojban
  patterns: [             // tarmi in Lojban
    {
      type: "relationship", // klesi: "ckini" in Lojban
      relation: "vasru",    // bridi: "vasru" in Lojban (Using Lojban predicate)
      filter: {             // julne in Lojban
        x1: listId
      },
      bindAs: "todo"        // ckaji_cmene: "zukte" in Lojban
    }
  ],
  select: "todo"          // cuxna: "zukte" in Lojban
});

// In a Svelte component - using the reactive store directly
{#each $todos as todo (todo.id)}
  <TodoItem {todo} />
{/each}

// Create a task assignment using Lojban predicate
await o.galfi({
  type: "relate",         // klesi: "ckini" in Lojban
  relation: "zukte",      // bridi: "zukte" in Lojban (for "assigned")
  x1: todoId,             // The task
  x2: userId,             // The assignee
  x4: assignerId,         // The assigner
  x3: new Date().toISOString()  // When assigned
});
```

#### TodoList Example with Pure Lojban Relationship

```typescript
// Register the "vasru" (contains) relationship with TodoList example
await o.registerRelationSchema({
  // Primary identification using Lojban
  name: "vasru",     // Lojban word for container/contains
  
  // Pure Lojban root definition
  lojbanDefinition: {        // Lojban core definition
    predicate: "vasru",
    description: "lo bridi poi ke'a vasru ty ny: ty cu diklo ny .i ty cu srana ny",
    roles: {
      x1: { role: "vasru", description: "lo vasru" },
      x2: { role: "se vasru", description: "lo se vasru" }, 
      x3: { role: "te vasru", description: "lo te vasru" },
      x4: { role: "ve vasru", description: "lo ve vasru" },
      x5: { role: "xe vasru", description: "lo xe vasru" }
    }
  },
  
  // Self-contained translations as separate objects
  translations: [
    {
      language: "English",
      isoCode: "en",
      name: "contains",
      description: "x1 contains x2 as a part or content",
      roles: {
        x1: "container",
        x2: "contained item",
        x3: "time of containment",
        x4: "environment of containment",
        x5: "condition of containment"
      },
      examples: [
        "The TodoList contains TodoItems",
        "The folder contains documents"
      ]
    },
    {
      language: "Deutsch",
      isoCode: "de",
      name: "enthält",
      description: "x1 enthält x2 als Teil oder Inhalt",
      roles: {
        x1: "Behälter",
        x2: "Inhalt",
        x3: "Zeitpunkt des Enthaltens",
        x4: "Umgebung des Enthaltens",
        x5: "Bedingung des Enthaltens"
      },
      examples: [
        "Die Aufgabenliste enthält Aufgaben",
        "Der Ordner enthält Dokumente"
      ]
    }
  ],
  
  // JSON Schema for validation
  jsonSchema: {
    type: "object",
    properties: {
      predicate: { type: "string", const: "vasru" },
      x1: { type: "string", description: "Container (TodoList)" },
      x2: { type: "string", description: "Content (TodoItem)" },
      x3: { type: "string", format: "date-time", description: "When contained" },
      x4: { type: "string", description: "Containment environment" },
      x5: { type: "string", description: "Containment condition" }
    },
    required: ["predicate", "x1", "x2"]
  },
  
  // Semantic information
  semantics: {
    transitive: true,     // If A contains B and B contains C, then A contains C
    symmetrical: false,   // A contains B does not mean B contains A
    inverseOf: "selvau"   // Lojban for "is contained by" (fictional example)
  }
});
```

#### Integration with Composite UI

The HQL layer serves as the bridge between data relationships and UI composites:

```typescript
// Define a composite for a todo list UI using HQL for data
const todoCompositeId = await o.galfi({
  type: "create",           // klesi: "zbasu" in Lojban
  schema: "selfni",          // schema: "composite" in Lojban
  data: {                  // srera in Lojban
    id: "todo-list-view",
    state: {                // tarmi in Lojban
      todoListId: listId,   // ID of the todoList
      newTodoText: "",      // Text for new todos
      
      // HQL query defined directly in the composite
      todos: {
        query: {
          type: "match",   // klesi: "simxu" in Lojban
          patterns: [      // tarmi in Lojban
            {
              type: "relationship", // klesi: "ckini" in Lojban
              relation: "vasru",    // bridi: "vasru" in Lojban (Lojban contains)
              filter: {            // julne in Lojban
                x1: "$todoListId"
              }
            }
          ]
        }
      },
      
      // Computed formulas
      count: {
        formula: "$todos.length"
      },
      completedCount: {
        formula: "$todos.filter(t => t.mulno).length"
      },
      activeCount: {
        formula: "$count - $completedCount"
      }
    },
    // ... remaining composite definition ...
  }
});

// Load and render the composite directly
const TodoListApp = await o.compose(todoCompositeId);
```

#### The Ultimate Composite: Meta-Circular UI Builder

By storing composite definitions as LoroDoc documents, the system becomes meta-circular, allowing it to define and edit itself:

```typescript
// Define a composite to edit composites
const compositeEditorId = await o.galfi({
  type: "create",         // klesi: "zbasu" in Lojban
  schema: "selfni",        // schema: "composite" in Lojban
  data: {                // srera in Lojban
    id: "composite-editor",
    state: {              // tarmi in Lojban
      editingId: null,    // ID of composite being edited
      
      // Query all available composites
      composites: {
        query: {
          type: "schema", // klesi: "datni" in Lojban
          datni: "selfni" // schema: "composite" in Lojban
        }
      },
      
      // The currently edited composite
      current: {
        query: {
          type: "schema", // klesi: "datni" in Lojban
          julne: {        // julne in Lojban - filter:
            pubKeyMocked: "$editingId"
          }
        }
      }
    },
    // ... remaining editor UI definition ...
  }
});

// Load the meta editor and allow the system to modify itself
const CompositeEditor = await o.compose(compositeEditorId);
```

### Query with Relationship Traversal
1. HominioQL receives a request to find all todos in a specific list
2. HominioQL queries relationship content with bridi="vasru" and x1=listPubKey
3. For each relationship, HominioQL extracts the x2 value (todo item pubKey)
4. HominioQL requests each todo from HominioDB by pubKey
5. HominioDB retrieves each LoroDoc, applies all updates, and returns the current state
6. HominioQL returns the collection of todo items as a reactive Svelte store

## The Lojban-Inspired Relationship Model

At the heart of the query layer is a systematic relationship model inspired by Lojban:

- **Bridi**: Predicate or relationship between entities
- **Sumti**: Arguments to a relationship (x1, x2, x3, x4, x5)

Every relationship follows the pattern:
```
relationship(x1, x2, x3, x4, x5)
```

Where:
- x1 typically represents the subject/agent
- x2 typically represents the object/patient
- x3, x4, x5 provide additional context (time, location, manner, etc.)

### Relationship Schema System

In Hominio's architecture, relationship predicates (bridi) are themselves defined as schema documents with pure Lojban at their core and comprehensive translations:

```typescript
// Enhanced relationship schema structure with pure Lojban definition
interface RelationshipSchemaContent {
  // Base identification using Lojban
  name: string;
  
  // Pure Lojban root definition
  sarxe: {                  // definition
    bridi: string;          // predicate name
    ve_skicu: string;       // description
    sumti: {                // arguments
      x1: { cabra: string; ve_skicu: string; }  // role, description
      x2: { cabra: string; ve_skicu: string; }
      x3?: { cabra: string; ve_skicu: string; }
      x4?: { cabra: string; ve_skicu: string; }
      x5?: { cabra: string; ve_skicu: string; }
    }
  },
  
  // Self-contained translation objects
  fanva: Array<{
    bangu: string;          // language
    iso: string;            // ISO code
    cmene: string;          // name
    ve_skicu: string;       // description
    sumti: {                // roles
      x1: string;           // role translation
      x2: string;
      x3?: string;
      x4?: string;
      x5?: string;
    },
    mupli?: string[];       // examples
    
    // Property name translations
    velski: {
      cmene: string;        // "name"
      sarxe: string;        // "definition"
      bridi: string;        // "predicate"
      ve_skicu: string;     // "description"
      sumti: string;        // "arguments"
      cabra: string;        // "role"
      fanva: string;        // "translations"
      bangu: string;        // "language"
      iso: string;          // "ISO code"
      mupli: string;        // "examples"
      datni: string;        // "schema"
      smuni: string;        // "semantics"
      fatne: string;        // "inverseOf"
      mintu: string;        // "symmetrical"
      tertau: string;       // "transitive"
    }
  }>,
  
  // JSON Schema for validation
  datni: {
    type: "object";
    properties: {
      bridi: { type: "string", const: string },
      x1: { type: "string", ve_skicu?: string },
      x2: { type: "string", ve_skicu?: string },
      x3?: { type: "string", ve_skicu?: string },
      x4?: { type: "string", ve_skicu?: string },
      x5?: { type: "string", ve_skicu?: string },
    },
    required: string[];
  },
  
  // Additional semantic information
  smuni?: {
    fatne?: string;         // inverseOf
    mintu?: boolean;        // symmetrical
    tertau?: boolean;       // transitive
  }
}
```

#### TodoList Example with Pure Lojban Relationship

```typescript
// Register the "vasru" (contains) relationship with TodoList example
await o.registerRelationSchema({
  // Primary identification using Lojban
  cmene: "vasru",
  
  // Pure Lojban root definition
  sarxe: {
    bridi: "vasru",
    ve_skicu: "lo bridi poi ke'a vasru ty ny: ty cu diklo ny .i ty cu srana ny",
    sumti: {
      x1: { cabra: "vasru", ve_skicu: "lo vasru" },
      x2: { cabra: "se vasru", ve_skicu: "lo se vasru" }, 
      x3: { cabra: "te vasru", ve_skicu: "lo te vasru" },
      x4: { cabra: "ve vasru", ve_skicu: "lo ve vasru" },
      x5: { cabra: "xe vasru", ve_skicu: "lo xe vasru" }
    }
  },
  
  // Self-contained translations
  fanva: [
    {
      bangu: "English",
      iso: "en",
      cmene: "contains",
      ve_skicu: "x1 contains x2 as a part or content",
      sumti: {
        x1: "container",
        x2: "contained item",
        x3: "time of containment",
        x4: "environment of containment",
        x5: "condition of containment"
      },
      mupli: [
        "The TodoList contains TodoItems",
        "The folder contains documents"
      ],
      velski: {
        cmene: "name",
        sarxe: "definition",
        bridi: "predicate",
        ve_skicu: "description",
        sumti: "arguments",
        cabra: "role",
        fanva: "translations",
        bangu: "language",
        iso: "isoCode",
        mupli: "examples",
        datni: "schema",
        smuni: "semantics",
        fatne: "inverseOf",
        mintu: "symmetrical", 
        tertau: "transitive"
      }
    },
    {
      bangu: "Deutsch",
      iso: "de",
      cmene: "enthält",
      ve_skicu: "x1 enthält x2 als Teil oder Inhalt",
      sumti: {
        x1: "Behälter",
        x2: "Inhalt",
        x3: "Zeitpunkt des Enthaltens",
        x4: "Umgebung des Enthaltens",
        x5: "Bedingung des Enthaltens"
      },
      mupli: [
        "Die Aufgabenliste enthält Aufgaben",
        "Der Ordner enthält Dokumente"
      ],
      velski: {
        cmene: "name",
        sarxe: "definition",
        bridi: "prädikat",
        ve_skicu: "beschreibung",
        sumti: "argumente",
        cabra: "rolle",
        fanva: "übersetzungen",
        bangu: "sprache",
        iso: "isoCode",
        mupli: "beispiele",
        datni: "schema",
        smuni: "semantik",
        fatne: "umgekehrtVon",
        mintu: "symmetrisch",
        tertau: "transitiv"
      }
    }
  ],
  
  // JSON Schema for validation
  datni: {
    type: "object",
    properties: {
      bridi: { type: "string", const: "vasru" },
      x1: { type: "string", ve_skicu: "Vasru (TodoList)" },
      x2: { type: "string", ve_skicu: "Se vasru (TodoItem)" },
      x3: { type: "string", format: "date-time", ve_skicu: "Te vasru detri" },
      x4: { type: "string", ve_skicu: "Ve vasru stuzi" },
      x5: { type: "string", ve_skicu: "Xe vasru ckaji" }
    },
    required: ["bridi", "x1", "x2"]
  },
  
  // Semantic information
  smuni: {
    tertau: true,
    mintu: false,
    fatne: "selvau"
  }
});
```

#### Example Usage with Reactive Viska

```typescript
// Create a todo list (mutation)
const { judri: listId } = await o.galfi({
  klesi: "zbasu",
  datni: "todo-list-schema-id",
  srera: {
    cmene: "Shopping List",
    ve_skicu: "Things to buy at the store",
    te_zbasu: new Date().toISOString()
  },
  
  // Translation definition
  fanva: [
    {
      bangu: "English",
      iso: "en",
      velski: {
        klesi: "type",
        datni: "schema",
        srera: "data",
        cmene: "title",
        ve_skicu: "description",
        te_zbasu: "createdAt"
      }
    }
  ]
});

// Create a todo item (mutation)
const { judri: todoId } = await o.galfi({
  klesi: "zbasu",
  datni: "todo-item-schema-id",
  srera: {
    velsku: "Buy milk",
    mulno: false,
    vajni: "high",
    snada_detri: new Date(Date.now() + 86400000).toISOString()
  },
  
  // Translation definition
  fanva: [
    {
      bangu: "English",
      iso: "en",
      velski: {
        klesi: "type",
        datni: "schema",
        srera: "data",
        velsku: "text",
        mulno: "completed",
        vajni: "priority",
        snada_detri: "dueDate"
      }
    }
  ]
});

// Create a relationship using Lojban predicate
await o.galfi({
  klesi: "ckini",
  bridi: "vasru",
  x1: listId,
  x2: todoId,
  x3: new Date().toISOString(),
  
  // Translation definition
  fanva: [
    {
      bangu: "English",
      iso: "en",
      velski: {
        klesi: "type",
        bridi: "relation",
        x1: "container",
        x2: "content",
        x3: "time"
      }
    }
  ]
});

// Get todos in a list - always returns a reactive Svelte store
const todos = o.viska({
  klesi: "simxu",
  tarmi: [
    {
      klesi: "ckini",
      bridi: "vasru",
      julne: {
        x1: listId
      }
    }
  ],
  
  // Translation definition
  fanva: [
    {
      bangu: "English",
      iso: "en",
      velski: {
        klesi: "type",
        tarmi: "patterns",
        bridi: "relation",
        julne: "filter"
      }
    }
  ]
});

// In a Svelte component - using the reactive store directly
{#each $todos as todo (todo.judri)}
  <TodoItem {todo} />
{/each}

// Access with english properties at runtime if desired
const englishTodos = $todos.map(todo => enski(todo));
// Now you can use english property names:
// englishTodos[0].id, englishTodos[0].text, englishTodos[0].completed
```

// Define a composite for a todo list UI using HQL for data
const todoCompositeId = await o.galfi({
  klesi: "zbasu",
  datni: "composite-schema-id",
  srera: {
    judri: "todo-list-view",
    tarmi: {
      todoListId: listId,
      newTodoText: "",
      
      // Reactive query
      todos: {
        preti: {
          klesi: "simxu",
          tarmi: [
            {
              klesi: "ckini",
              bridi: "vasru",
              julne: {
                x1: "$todoListId"
              }
            }
          ]
        }
      },
      
      // Computed formulas
      count: {
        gengau: "$todos.length"
      },
      completedCount: {
        gengau: "$todos.filter(t => t.mulno).length"
      },
      activeCount: {
        gengau: "$count - $completedCount"
      }
    }
  },
  
  // Translation definition
  fanva: [
    {
      bangu: "English",
      iso: "en",
      velski: {
        klesi: "type",
        datni: "schema",
        srera: "data",
        judri: "id",
        tarmi: "state",
        preti: "query",
        gengau: "formula",
        mulno: "completed"
      }
    }
  ]
});
```

#### The Ultimate Composite: Meta-Circular UI Builder

By storing composite definitions as LoroDoc documents, the system becomes meta-circular, allowing it to define and edit itself:

```typescript
// Define a composite to edit composites
const compositeEditorId = await o.galfi({
  type: "create",         // klesi: "zbasu" in Lojban
  schema: "selfni",        // schema: "composite" in Lojban
  data: {                // srera in Lojban
    id: "composite-editor",
    state: {              // tarmi in Lojban
      editingId: null,    // ID of composite being edited
      
      // Query all available composites
      composites: {
        query: {
          type: "schema", // klesi: "datni" in Lojban
          datni: "selfni" // schema: "composite" in Lojban
        }
      },
      
      // The currently edited composite
      current: {
        query: {
          type: "schema", // klesi: "datni" in Lojban
          julne: {        // julne in Lojban - filter:
            pubKeyMocked: "$editingId"
          }
        }
      }
    },
    // ... remaining editor UI definition ...
  }
});

// Load the meta editor and allow the system to modify itself
const CompositeEditor = await o.compose(compositeEditorId);
```

### Query with Relationship Traversal
1. HominioQL receives a request to find all todos in a specific list
2. HominioQL queries relationship content with bridi="vasru" and x1=listPubKey
3. For each relationship, HominioQL extracts the x2 value (todo item pubKey)
4. HominioQL requests each todo from HominioDB by pubKey
5. HominioDB retrieves each LoroDoc, applies all updates, and returns the current state
6. HominioQL returns the collection of todo items as a reactive Svelte store

## Source of Truth and State Management

### LoroDoc as Source of Truth
- All content is stored and managed as LoroDoc instances with their own internal metadata
- Binary representations of LoroDoc data are content-addressed and immutable
- Every mutation creates new content with a unique CID
- The document history is preserved through snapshotCids and updateCids

### Docs as Registry
- Docs serves as an external registry that maps PubKeyMocked to content CIDs
- It mirrors essential metadata from the content for efficient indexing and search
- When content metadata changes, Docs is updated to reflect these changes
- Additional tracking fields like updateCids are maintained at this level

### Sync State Management
The Sync Layer maintains a clear delineation between synced and unsynced state:

- **Synced State**: Represented by main document properties (`snapshotCid`, `updateCids`)
- **Unsynced State**: Tracked in `localState` property (`localState.snapshotCid`, `localState.updateCids`)

This dual-tracking approach enables:
1. **Offline-First Operation**: All changes work locally first without requiring server connection
2. **Sync Transparency**: UI can show sync status based on existence of `localState`
3. **Conflict Handling**: Changes can be reconciled by comparing local and remote versions
4. **Incremental Sync**: Partial sync operations can be resumed if interrupted
5. **Peer-to-Peer Capability**: The same mechanism works for server sync and direct peer sync

### Conflict Resolution Strategy
When conflicts occur (same document modified on multiple devices):

1. **Detection**: Sync compares timestamps and version histories
2. **Resolution**: 
   - For content conflicts: Use CRDT properties of LoroDoc
   - For metadata conflicts: Server version wins for field-level conflicts
   - Content addressing ensures no data loss even during conflicts
   
3. **Notification**: UI receives sync events to notify users when conflicts occur

### Svelte Stores as Reactive Views
- Svelte stores only reflect the state of LoroDoc instances
- When documents change, new binary data is generated and stored
- Stores subscribe to document changes and update the UI
- No state is maintained solely in stores

```typitten
// Example relationship between LoroDoc and Svelte stores
function initContentReactivity(pubKey: string) {
    // Create writable store for UI updates
    const contentStore = writable({ loading: true, data: null });
    
    // Subscribe to document changes
    hominioDB.subscribe(pubKey, (content) => {
        // Update store when content changes
        contentStore.set({ loading: false, data: content });
    });
    
    // Return store for component use
    return {
        subscribe: contentStore.subscribe,
        // Operations that modify the content go through HominioDB
        update: async (changes) => {
            await hominioDB.updateContent(pubKey, changes);
            // Store will be updated via subscription
        }
    };
}
```

## Data Flow Examples

### Content Creation Flow
1. HominioQL receives a request to create a document of a specific schema
2. HominioQL retrieves the schema using its pubKey
3. HominioQL validates the document data against the schema
4. HominioQL creates a new LoroDoc instance with metadata and data sections
5. HominioDB generates a PubKeyMocked using docIdService
6. HominioDB exports the LoroDoc to binary data
7. HominioDB calculates a content hash (snapshotCid) using hashService
8. HominioDB creates a Docs entry with the PubKeyMocked and mirrors metadata from the content
9. HominioDB stores both the Docs entry and binary content via the storage adapter

### Updating Content
1. HominioQL receives a request to update content
2. HominioDB retrieves the current LoroDoc instance
3. HominioDB applies the changes to the LoroDoc (metadata or data sections)
4. HominioDB exports an update binary using LoroDoc's export function
5. HominioDB calculates the update's content hash (updateCid) using hashService
6. HominioDB updates the Docs entry to mirror any changes in the LoroDoc's metadata
7. HominioDB adds the updateCid to the Docs entry
8. HominioDB stores the update binary and updated Docs entry

### Query with Relationship Traversal
1. HominioQL receives a request to find all todos in a specific list
2. HominioQL queries relationship content with bridi="vasru" and x1=listPubKey
3. For each relationship, HominioQL extracts the x2 value (todo item pubKey)
4. HominioQL requests each todo from HominioDB by pubKey
5. HominioDB retrieves each LoroDoc, applies all updates, and returns the current state
6. HominioQL returns the collection of todo items

### Syncing Content Across Devices
1. User makes changes to a document on Device A
2. Content Layer creates update with new CID
3. Sync Layer adds CID to `localState.updateCids`
4. User initiates sync (or auto-sync triggers)
5. Sync Layer uploads all content in `localState`
6. Upon successful upload, Sync Layer moves CIDs from `localState` to main registry
7. On Device B, user initiates pull or auto-sync triggers
8. Sync Layer on Device B fetches latest document registry from server
9. Sync Layer detects new update CIDs and downloads the binary content
10. Content Layer applies updates to the local LoroDoc instance
11. UI reflects the changes to the user

## Architectural Benefits

### 1. Data Integrity and Immutability
- Content addressing ensures data cannot be tampered with
- Each version of content has a unique cryptographic hash
- Document history is preserved through linked snapshots and updates

### 2. Clear Separation of Concerns
- Storage Layer: Where and how binary data is stored
- Content Layer: What the data is (identity and content addressing)
- Sync Layer: How data moves between nodes in the network
- Query Layer: What the data means and how it's related

### 3. Source of Truth Architecture
- LoroDoc instances and their binary representations are the source of truth
- Docs registry provides efficient access and search
- UI components react to changes in the underlying content
- All mutations create new content with clear version history

### 4. Rich Semantic Model
- Documents can be connected in meaningful ways via relationships
- Queries can follow complex paths through the content graph
- Schemas provide structured validation and type safety

### 5. Resilient Sync Architecture
- Offline-first approach with local operations prioritized
- Clear tracking of sync state through `localState`