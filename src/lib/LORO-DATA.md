# Loro Data Layer Architecture

## Overview

This document outlines the architecture for our Loro data management system, which provides:

1. A centralized doc registry with schema definitions
2. A unified CRUD API for Loro operations
3. Integration with tool functions
4. Support for future persistence mechanisms

## Architecture Components

```
src/lib/ultravox/
  ├── docs/
  │   ├── loroAPI.ts               # Core API with CRUD operations
  │   ├── persistence/             # Persistence adapters (future, don't implement yet)
  │   │   └── pgliteAdapter.ts     # PGLite adapter for Loro (future, don't implement yet)
  │   └── schemas/                 # Schema definitions
  │       ├── todo.ts              # Todo schema
  │       └── todoList.ts          # TodoList schema
  └── tools/                       # Tool implementations
      ├── createTodo/
      ├── toggleTodo/
      └── ...
```

## Core Components

### 1. LoroAPI (src/lib/ultravox/docs/loroAPI.ts)

A unified API layer that:
- Manages Loro document instances (LoroDoc)
- Registers schemas
- Generates CRUD operations
- Handles subscriptions
- Creates reactive stores
- Supports all Loro container types: Map, List, Text, Tree, MovableList, Counter

### 2. Schema Definitions (src/lib/ultravox/docs/schemas/*.ts)

TypeScript interfaces and metadata for data structures:
- Entity properties and types
- Document/collection mappings
- Container type specifications
- Validation rules (optional)

### 3. Direct Tool Integration

Tools directly use the LoroAPI for data operations:
- No separate operations layer
- Tool functions implement domain logic
- Reduced boilerplate
- Update each existing todo tool with the new architecture

## Implementation Plan

### Phase 1: Core Data Layer

1. **Create LoroAPI Class**
   - Implement singleton pattern
   - Document registry management
   - Schema registry
   - Store registry
   - CRUD operation generators
   - Support for all Loro container types

2. **Define Base Schemas**
   - Todo schema
   - TodoList schema

3. **Add Schema Auto-Discovery**
   - Auto-load schemas from directory in a schemaResgistry
   - Generate operations

### Phase 2: Tool Integration

1. **Update Tool Functions**
   - Refactor existing tools to use LoroAPI
   - Remove direct Loro interactions
   - Implement domain logic

2. **Add Type Definitions**
   - Ensure type safety across all operations
   - Add JSDoc comments

### Phase 3: Persistence (Future, dont do now)

1. **Design Adapter Interface**
   - Define persistence adapter interface
   - Create save/load/sync methods

2. **Implement PGLite Adapter**
   - Integration with @electric-sql/pglite
   - Document serialization/deserialization
   - Migration support

3. **Add Sync Capabilities**
   - Multi-device synchronization
   - Conflict resolution

## LoroAPI Implementation

```typescript
// src/lib/ultravox/docs/loroAPI.ts

import { LoroDoc, type Value, LoroMap, LoroList, LoroText, LoroTree, LoroMovableList, LoroCounter } from 'loro-crdt';
import { writable, get, type Writable } from 'svelte/store';

export class LoroAPI {
  private static instance: LoroAPI;
  private docRegistry = new Map<string, LoroDoc>();
  private schemaRegistry = new Map<string, any>();
  private storeRegistry = new Map<string, Writable<any>>();
  private operationsCache = new Map<string, any>();

  // Singleton pattern
  static getInstance(): LoroAPI {
    if (!LoroAPI.instance) {
      LoroAPI.instance = new LoroAPI();
    }
    return LoroAPI.instance;
  }

  // Register a schema
  registerSchema(schema: any) {
    this.schemaRegistry.set(schema.name, schema);
    
    // Generate operations for this schema
    const operations = this.generateOperations(schema);
    this.operationsCache.set(schema.name, operations);
    
    return operations;
  }

  // Get operations for a schema
  getOperations<T>(schemaName: string) {
    if (!this.operationsCache.has(schemaName)) {
      const schema = this.schemaRegistry.get(schemaName);
      if (!schema) throw new Error(`Schema not found: ${schemaName}`);
      
      const operations = this.generateOperations(schema);
      this.operationsCache.set(schemaName, operations);
    }
    
    return this.operationsCache.get(schemaName) as {
      create: (data: Partial<T>) => string;
      get: (id: string) => T | null;
      update: (id: string, data: Partial<T>) => boolean;
      delete: (id: string) => boolean;
      query: (predicate: (item: T) => boolean) => [string, T][];
      store: Writable<[string, T][]>;
      doc: LoroDoc;
      collection: LoroMap<Record<string, unknown>>;
    };
  }

  // Get a specific Loro document
  getDoc(docName: string): LoroDoc {
    if (!this.docRegistry.has(docName)) {
      const doc = new LoroDoc();
      this.docRegistry.set(docName, doc);
      
      // Set up subscription to update stores when doc changes
      doc.subscribe(() => {
        this.updateStoresForDoc(docName);
      });
    }
    return this.docRegistry.get(docName)!;
  }

  // Create specific container types
  getMap(docName: string, mapName: string) {
    const doc = this.getDoc(docName);
    return doc.getMap(mapName);
  }

  getList(docName: string, listName: string) {
    const doc = this.getDoc(docName);
    return doc.getList(listName);
  }

  getText(docName: string, textName: string) {
    const doc = this.getDoc(docName);
    return doc.getText(textName);
  }

  getTree(docName: string, treeName: string) {
    const doc = this.getDoc(docName);
    return doc.getTree(treeName);
  }

  getMovableList(docName: string, listName: string) {
    const doc = this.getDoc(docName);
    return doc.getMovableList(listName);
  }

  getCounter(docName: string, counterName: string) {
    const doc = this.getDoc(docName);
    return doc.getCounter(counterName);
  }

  // Auto-discover schemas
  async discoverSchemas() {
    const schemaModules = import.meta.glob('../docs/schemas/*.ts');
    const registeredSchemas: string[] = [];
    
    for (const path in schemaModules) {
      try {
        const module = await schemaModules[path]();
        if (module.default) {
          this.registerSchema(module.default);
          registeredSchemas.push(module.default.name);
        }
      } catch (error) {
        console.error(`Failed to load schema from ${path}:`, error);
      }
    }
    
    return registeredSchemas;
  }

  // Generate operations for a schema
  private generateOperations(schema: any) {
    const docName = schema.docName;
    const collectionName = schema.collectionName;
    const schemaName = schema.name;
    
    // Get or create LoroDoc
    const doc = this.getDoc(docName);
    
    // Get collection based on container type
    const containerType = schema.containerType || 'map';
    let collection;
    
    switch (containerType) {
      case 'map':
        collection = doc.getMap(collectionName);
        break;
      case 'list':
        collection = doc.getList(collectionName);
        break;
      // Other container types would need special handling for CRUD
      default:
        collection = doc.getMap(collectionName);
    }
    
    // Create store if needed
    if (!this.storeRegistry.has(schemaName)) {
      this.storeRegistry.set(schemaName, writable<[string, any][]>([]));
      this.updateStore(schemaName);
    }
    
    // Return operations based on container type
    if (containerType === 'map') {
      return {
        // Create operation
        create: (data: any) => {
          const id = data.id || crypto.randomUUID();
          const fullData = { ...data, id };
          
          collection.set(id, fullData as unknown as Value);
          this.updateStore(schemaName);
          
          return id;
        },
        
        // Get operation
        get: (id: string) => {
          return collection.get(id) as unknown as any;
        },
        
        // Update operation
        update: (id: string, data: any) => {
          const existing = collection.get(id);
          
          if (!existing) return false;
          
          collection.set(id, {
            ...existing as object,
            ...data
          } as unknown as Value);
          
          this.updateStore(schemaName);
          return true;
        },
        
        // Delete operation
        delete: (id: string) => {
          if (collection.has(id)) {
            collection.delete(id);
            this.updateStore(schemaName);
            return true;
          }
          
          return false;
        },
        
        // Query operation
        query: (predicate: (item: any) => boolean) => {
          const store = this.storeRegistry.get(schemaName);
          if (!store) return [];
          
          const items = get(store) as [string, any][];
          return items.filter(([, item]) => predicate(item));
        },
        
        // Reactive store
        store: this.storeRegistry.get(schemaName),
        
        // Access to raw doc and collection
        doc,
        collection
      };
    } else if (containerType === 'list') {
      // List-specific operations (would need different implementation)
      // This is simplified - a real implementation would need more work
      return {
        create: (data: any) => {
          const id = data.id || crypto.randomUUID();
          const fullData = { ...data, id };
          
          // For lists, we need to insert, not set
          collection.insert(collection.length(), fullData as unknown as Value);
          this.updateStore(schemaName);
          
          return id;
        },
        // ... other operations adapted for lists
        store: this.storeRegistry.get(schemaName),
        doc,
        collection
      };
    }
    
    // Default to map operations if container type isn't recognized
    return {
      // ... default map operations
      store: this.storeRegistry.get(schemaName),
      doc,
      collection
    };
  }
  
  // Update store with latest data
  private updateStore(schemaName: string) {
    const schema = this.schemaRegistry.get(schemaName);
    if (!schema) return;
    
    const containerType = schema.containerType || 'map';
    const docName = schema.docName;
    const collectionName = schema.collectionName;
    
    const doc = this.docRegistry.get(docName);
    if (!doc) return;
    
    const store = this.storeRegistry.get(schemaName);
    if (!store) return;
    
    if (containerType === 'map') {
      const collection = doc.getMap(collectionName);
      const entries = [...collection.entries()].map(([key, value]) => [key, value as unknown]);
      store.set(entries);
    } else if (containerType === 'list') {
      const collection = doc.getList(collectionName);
      // For lists, we need a different approach since they don't have key-value entries
      // This is simplified and would need more work in a real implementation
      const items = collection.toArray().map((item, index) => [`${index}`, item as unknown]);
      store.set(items);
    }
    // Other container types would need specific handling
  }
  
  // Update all stores for a specific doc
  private updateStoresForDoc(docName: string) {
    for (const [schemaName, schema] of this.schemaRegistry.entries()) {
      if (schema.docName === docName) {
        this.updateStore(schemaName);
      }
    }
  }
}

// Export a singleton instance
export const loroAPI = LoroAPI.getInstance();
```

## Data Usage Example for Tools

### CreateTodo Tool (src/lib/tools/createTodo/function.ts)

```typescript
import { loroAPI } from '../../ultravox/docs/loroAPI';
import type { TodoItem } from '../../ultravox/docs/schemas/todo';
import { logToolActivity } from '../../ultravox/stores';

export async function execute(inputs: { 
  text: string, 
  tags?: string 
}): Promise<{ success: boolean, message: string }> {
  try {
    // Get operations for todo schema
    const { create, query } = loroAPI.getOperations<TodoItem>('todo');
    
    // Check for duplicate
    const existing = query(todo => todo.text === inputs.text.trim());
    if (existing.length > 0) {
      return logToolActivity('createTodo', 'Todo already exists', false);
    }
    
    // Parse tags
    const tags = inputs.tags 
      ? inputs.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];
    
    // Create the todo
    const id = create({
      text: inputs.text.trim(),
      completed: false,
      createdAt: Date.now(),
      tags,
      docId: 'personal' // Default list
    });
    
    return logToolActivity('createTodo', `Todo created: ${inputs.text}`);
  } catch (error) {
    console.error('Error creating todo:', error);
    return logToolActivity('createTodo', `Error: ${error}`, false);
  }
}
```

### ToggleTodo Tool (src/lib/tools/toggleTodo/function.ts)

```typescript
import { loroAPI } from '../../ultravox/docs/loroAPI';
import type { TodoItem } from '../../ultravox/docs/schemas/todo';
import { logToolActivity } from '../../ultravox/stores';

export async function execute(inputs: { todoId: string }): Promise<{ success: boolean, message: string }> {
  try {
    // Get operations for todo schema
    const { get, update } = loroAPI.getOperations<TodoItem>('todo');
    
    // Get the todo
    const todo = get(inputs.todoId);
    if (!todo) {
      return logToolActivity('toggleTodo', 'Todo not found', false);
    }
    
    // Toggle completed status
    const success = update(inputs.todoId, {
      completed: !todo.completed
    });
    
    if (success) {
      return logToolActivity('toggleTodo', `Todo ${todo.completed ? 'marked incomplete' : 'marked complete'}`);
    } else {
      return logToolActivity('toggleTodo', 'Failed to update todo', false);
    }
  } catch (error) {
    console.error('Error toggling todo:', error);
    return logToolActivity('toggleTodo', `Error: ${error}`, false);
  }
}
```

## Component Integration Example

### TodoView Integration (src/lib/components/views/TodoView.svelte)

```svelte
<script lang="ts">
  import { loroAPI } from '$lib/ultravox/docs/loroAPI';
  import type { TodoItem } from '$lib/ultravox/docs/schemas/todo';
  import { todoState } from '$lib/ultravox/stores';
  
  // Get todo operations and store
  const { store: todos, query } = loroAPI.getOperations<TodoItem>('todo');
  
  // Get all unique tags
  function getAllUniqueTags(): string[] {
    const allTags = new Set<string>();
    $todos.forEach(([, todo]) => {
      todo.tags.forEach(tag => allTags.add(tag));
    });
    return [...allTags];
  }
  
  // Filter todos by tag
  function filterTodosByTag(tag: string | null) {
    $todoState.selectedTag = tag;
  }
  
  // Format date for display
  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }
</script>

<!-- Keep the existing template -->
<!-- Just update the imports and functions as shown above -->
```

## Schema Definition Example

### Todo Schema (src/lib/ultravox/docs/schemas/todo.ts)

```typescript
import { z } from 'zod'; // Optional, for validation

export default {
  name: 'todo',
  docName: 'todos',
  collectionName: 'todoItems',
  containerType: 'map', // Use a LoroMap
  schema: z.object({
    id: z.string().uuid(),
    text: z.string().min(1),
    completed: z.boolean().default(false),
    createdAt: z.number(),
    tags: z.array(z.string()),
    docId: z.string()
  })
};

// Export the type
export type TodoItem = z.infer<typeof default.schema>;
```

### TodoList Schema (src/lib/ultravox/docs/schemas/todoList.ts)

```typescript
import { z } from 'zod'; // Optional, for validation

export default {
  name: 'todoList',
  docName: 'todos',
  collectionName: 'todoLists',
  containerType: 'map', // Use a LoroMap
  schema: z.object({
    id: z.string(),
    name: z.string().min(1),
    createdAt: z.number(),
    numTodos: z.number().default(0)
  })
};

// Export the type
export type TodoList = z.infer<typeof default.schema>;
```

## Future Considerations

### 1. Persistence Strategies

The current architecture allows for different persistence strategies:

- **In-memory**: Default, no persistence (current)
- **LocalStorage**: Simple browser persistence
- **PGLite**: SQL-based persistence with @electric-sql/pglite
- **Remote Sync**: Synchronization with backend services

### 2. Schema Evolution

As the application evolves, we need strategies for:

- Schema versioning
- Migration of existing data
- Backward compatibility

### 3. Performance Optimization

For larger datasets, consider:

- Pagination of results
- Indexed queries
- Lazy loading of data

### 4. Security

When implementing multi-user features:

- Access control for different documents
- Validation of input data
- Sanitization of outputs 