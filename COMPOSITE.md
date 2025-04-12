# Hominio Composite Architecture

A universal, declarative UI composition system that runs on top of the Hominio Query Layer.

## Self-Describing Composite System

Hominio Composites are stored as LoroDoc documents in hominio-db, making them directly queryable and mutable through the standard HQL interface. Each composite is a self-contained definition that includes:

1. **State Management**: Reactive data sources and values
2. **State Machine**: Event handling and transitions between UI states
3. **View Definition**: Declarative component structure
4. **Actions**: Operations triggered by events or user interaction

The meta-circular nature of this system means composite definitions can edit themselves and each other using the same primitives.

## Content Architecture

Hominio follows a dual-addressing model separating entity identity from content:

```typescript
// Entity identity via PubKeyMocked (similar to IPNS)
const pubKey = "@composite:todo-list";

// Content addressing for document versions (similar to IPFS)
const snapshotCid = "Qm..."; // Content hash of latest snapshot
const updateCids = ["Qm...", "Qm..."]; // Content hashes of incremental updates
```

Each composite document has:
1. Stable identity through PubKeyMocked (using @ notation)
2. Content versioning through content-addressed snapshots and updates
3. Internal content as pure JSON, stored in a LoroDoc

## Composite Definition

A composite is defined as a pure JSON object stored in a LoroDoc document:

```typescript
interface Composite {
  // Unique identity
  id: string;
  
  // State management - all values are reactive by default
  state: {
    [key: string]: {
      // Direct value
      value?: any;
      // Query definition
      query?: {
        type: string;  // "schema", "relationship", "match"
        schema?: string;  // Schema reference (e.g. "@schema:zukte")
        gismu?: string;   // Predicate reference (e.g. "@schema:vasru")
        patterns?: Array<{  // Patterns for matching
          type: string;
          gismu?: string;
          filter?: Record<string, any>;
        }>;
        filter?: Record<string, any>; // Filter conditions
        orderBy?: Array<{  // Ordering
          field: string;
          direction: "asc" | "desc";
        }>;
      };
    }
  };
  
  // State machine
  machine?: {
    initial: string;
    states: Record<string, {
      on: Record<string, {
        target?: string;
        actions?: string[];
      }>;
    }>;
  };
  
  // Actions
  actions?: Record<string, {
    guard?: string;
    mutation?: {
      operations: Array<{
        type: string;  // "create", "update", "delete", "relate"
        schema?: string;
        id?: string;
        data?: Record<string, any>;
        // For entity creation
        gismu?: string;     // Predicate type (e.g. "@schema:zukte")
        // For relationships
        bridi?: string;     // Relation type (e.g. "vasru")
        x1?: string;        // First place (typically container/agent)
        x2?: string;        // Second place (typically content/patient)
        x3?: string;        // Third place (typically time/context)
        x4?: string;        // Fourth place (additional context)
        x5?: string;        // Fifth place (additional context)
      }>
    };
    update?: Record<string, string>;
  }>;
  
  // View definition
  view: {
    type: string;
    props?: Record<string, any>;
    children?: any[];
    events?: Record<string, string>;
  };
}
```

## Reactive Data Binding

All values in the state object are reactive by default. Every reference with `$` prefix is automatically subscribed and updates when the underlying data changes:

```json
"newTodoText": {
  "value": ""
}
```

The system automatically tracks dependencies and updates the UI when any value changes.

## Semantic References with @ Notation

Hominio uses @ notation for referencing entities and schemas:

```json
{
  "query": {
    "type": "relationship",
    "gismu": "@schema:vasru",
    "filter": {
      "x1": "@proj:website"
    }
  }
}
```

This provides a consistent pattern for:
- Schema references: `@schema:zukte`
- Entity references: `@task:design`, `@proj:website`, `@person:samuel`
- Relationship references: `@rel:proj_has_design`

## Simplified Example: Todo List

Below is a simplified example of a Todo List composite with the essential functionality:

```json
{
  "id": "todo-list",
  "state": {
    "currentProject": {
      "value": "@proj:website"
    },
    "todos": {
      "query": {
        "patterns": [
          {
            "match": {
              "gismu": "@schema:vasru",
              "x1": "$currentProject",
              "x2": "?task"
            }
          }
        ],
        "where": {
          "?task.content.a1.gismu": "@schema:zukte"
        },
        "return": "?task"
      }
    },
    "people": {
      "query": {
        "match": {
          "gismu": "@schema:prenu"
        },
        "return": "?person"
      }
    },
    "newTodoText": {
      "value": ""
    }
  },
  
  "machine": {
    "initial": "viewing",
    "states": {
      "viewing": {
        "on": {
          "ADD_TODO": {
            "actions": ["addTodo"]
          },
          "TOGGLE_TODO": {
            "actions": ["toggleTodo"]
          },
          "ASSIGN_TODO": {
            "actions": ["assignTodo"]
          }
        }
      }
    }
  },
  
  "actions": {
    "addTodo": {
      "guard": "$newTodoText.trim().length > 0",
      "mutation": {
        "create": {
          "gismu": "@schema:zukte",
          "translations": [
            {
              "lang": "en",
              "content": {
                "velsku": "$newTodoText",
                "mulno": false,
                "te_zbasu": "new Date().toISOString()"
              }
            }
          ]
        },
        "then": {
          "connect": {
            "gismu": "@schema:vasru",
            "x1": "$currentProject",
            "x2": "@CREATED_ID"
          }
        }
      },
      "update": {
        "newTodoText": "\"\""
      }
    },
    "toggleTodo": {
      "mutation": {
        "update": {
          "pubkey": "$event.todoId",
          "translations": [
            {
              "lang": "en",
              "content": {
                "mulno": "!$event.currentState"
              }
            }
          ]
        }
      }
    },
    "assignTodo": {
      "mutation": {
        "connect": {
          "gismu": "@schema:te_zukte",
          "x1": "$event.todoId",
          "x2": "$event.personId"
        }
      }
    }
  },
  
  "view": {
    "type": "component",
    "props": {
      "name": "TodoList"
    },
    "children": [
      {
        "type": "element",
        "props": {
          "tag": "h2",
          "class": "text-xl font-bold mb-4"
        },
        "textContent": "Todo List"
      },
      {
        "type": "element",
        "props": {
          "tag": "form",
          "class": "mb-4",
          "on:submit": "send('ADD_TODO'); return false;"
        },
        "children": [
          {
            "type": "element",
            "props": {
              "tag": "input",
              "type": "text",
              "placeholder": "What needs to be done?",
              "value": "$newTodoText",
              "class": "w-full px-3 py-2 border rounded",
              "on:input": "update({ newTodoText: $event.target.value })"
            }
          },
          {
            "type": "element",
            "props": {
              "tag": "button",
              "type": "submit",
              "class": "mt-2 px-4 py-2 bg-blue-500 text-white rounded"
            },
            "textContent": "Add Todo"
          }
        ]
      },
      {
        "type": "element",
        "props": {
          "tag": "ul",
          "class": "space-y-2"
        },
        "children": [
          {
            "type": "iterator",
            "source": "$todos",
            "template": {
              "type": "element",
              "props": {
                "tag": "li",
                "class": "flex items-center justify-between border rounded p-3"
              },
              "children": [
                {
                  "type": "element",
                  "props": {
                    "tag": "div",
                    "class": "flex items-center"
                  },
                  "children": [
                    {
                      "type": "element",
                      "props": {
                        "tag": "input",
                        "type": "checkbox",
                        "checked": "$item.content.a1.mulno",
                        "class": "mr-2",
                        "on:change": "send('TOGGLE_TODO', { todoId: $item.pubkey, currentState: $item.content.a1.mulno })"
                      }
                    },
                    {
                      "type": "element",
                      "props": {
                        "tag": "span",
                        "class": "$item.content.a1.mulno ? 'line-through text-gray-500' : ''"
                      },
                      "textContent": "$item.content.a1.velsku || $item.pubkey"
                    }
                  ]
                },
                {
                  "type": "element",
                  "props": {
                    "tag": "select",
                    "class": "text-sm border rounded px-1",
                    "on:change": "send('ASSIGN_TODO', { todoId: $item.pubkey, personId: $event.target.value })"
                  },
                  "children": [
                    {
                      "type": "element",
                      "props": {
                        "tag": "option",
                        "value": ""
                      },
                      "textContent": "Assign to..."
                    },
                    {
                      "type": "iterator",
                      "source": "$people",
                      "template": {
                        "type": "element",
                        "props": {
                          "tag": "option",
                          "value": "$item.pubkey"
                        },
                        "textContent": "$item.content.a1.cmene || $item.pubkey"
                      }
                    }
                  ]
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

## Entity Structure Example

Following the structure in page.svelte, entities are defined with a pubkey and content structure:

```json
// Task entity
{
  "pubkey": "@task:design",
  "content": { 
    "a1": { 
      "gismu": "@schema:zukte", 
      "x1": "@task:design" 
    }
  },
  "translations": [
    {
      "lang": "en",
      "content": {
        "velsku": "Design Mockups",
        "mulno": false
      }
    }
  ]
}

// Relationship entity
{
  "pubkey": "@rel:proj_has_design",
  "content": { 
    "b1": { 
      "gismu": "@schema:vasru", 
      "x1": "@proj:website", 
      "x2": "@task:design" 
    }
  },
  "translations": []
}
```

## Hominio DB Integration: PubKey and Content Separation

Each composite is stored in HominioDB with a clear separation between identity and content:

```typescript
// Document identity
const pubKey = "@composite:todo-list";

// Content addressing for latest snapshot
const snapshotCid = "Qm..."; // Content hash of the document

// Docs registry entry that maps identity to content
const docsEntry = {
  pubKeyMocked: pubKey,
  owner: "user123",
  updatedAt: "2023-05-01T12:00:00Z",
  snapshotCid: snapshotCid,
  updateCids: [],
  
  // Mirrored metadata from content
  meta: {
    title: "Todo List", 
    description: "Simple todo app",
    schemaId: "@schema:selfni",
    createdAt: "2023-05-01T12:00:00Z"
  }
};

// Actual content stored separately with content addressing
const contentItem = {
  cid: snapshotCid,
  type: "snapshot",
  raw: Uint8Array,  // Binary LoroDoc data containing the composite definition
  metadata: {
    size: 8192,
    createdAt: "2023-05-01T12:00:00Z"
  }
};
```

## Component Renderer

The composite renderer interprets the composite definition and creates a reactive UI:

```typescript
// Simplified renderer
export function renderComposite(pubKeyMocked: string) {
  // Load the composite document from HominioDB
  const { doc, docs } = await hominioDB.getContent(pubKeyMocked);
  const composite = doc.data;
  
  // Create reactive state from composite state definition
  const state = createReactiveState(composite.state);
  
  // Set up state machine if defined
  const machine = composite.machine ? createStateMachine(composite.machine, state, composite.actions) : null;
  
  // Initialize event handlers
  const eventHandlers = {
    send: (event, payload) => machine?.send(event, payload),
    update: (newState) => updateState(state, newState)
  };
  
  // Render the view tree
  return renderView(composite.view, state, eventHandlers);
}

// Usage
const todoApp = await o.compose("@composite:todo-list");
```

## Core HQL Interface

```typescript
// The universal "o" interface
interface HominioQL {
  // Query entities - always returns reactive results
  viska(query: {
    type: string;
    schema?: string;
    gismu?: string;
    filter?: Record<string, any>;
    patterns?: Array<any>;
    orderBy?: Array<{
      field: string;
      direction: string;
    }>;
  }): any[];
  
  // Modify entities
  galfi(mutation: {
    type: string;
    schema?: string;
    id?: string;
    data?: Record<string, any>;
    gismu?: string;
    bridi?: string;
    x1?: string;
    x2?: string;
    x3?: string;
    x4?: string;
    x5?: string;
  }): Promise<{
    judri: string;
    snada: boolean;
  }>;
  
  // Load and render composite components
  compose(pubKeyMocked: string): Promise<any>;
}

// Export the minimal interface
export const o = new HominioQL();
```

## Usage Example

```javascript
// In your main.js or App.svelte
import { o } from '$lib/hominio-ql';

// Load a component directly from HominioDB using @ notation
const TodoList = await o.compose('@composite:todo-list');

// Then mount it in your app - e.g., in a Svelte component:
// <svelte:component this={TodoList} />
```