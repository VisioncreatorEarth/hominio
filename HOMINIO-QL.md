# Hominio Query Language (HQL)

A universal, semantic query API for Hominio that implements the exact same interfaces as used in the Hominio semantic network implementation.

## Core Concepts

HQL provides a unified interface for interacting with docs and relationships in the Hominio semantic network:

1. **Docs** - Things identified by `@pubkey` identifiers (like `@01ab42c9d8ef7...`)
2. **Schemas** - Doc types defined as predicates with place structures
3. **Gismu Universal Model** - Everything is a gismu entity with a place structure, even schemata themselves.
4. **Schema Validation** - Formal validation rules for entities based on Lojban place structure logic

## Schema Definition and Validation System

HQL implements a formal schema definition system that allows for validation of entities while respecting Lojban's logical place structure.

```typescript
// Schema Definition System
type PlaceType = 'entity' | 'string' | 'number' | 'boolean' | 'any';

interface PlaceDefinition {
  type: PlaceType | PlaceType[]; // What type of value is allowed
                             // If 'entity' is included, composite (reference) is allowed
                             // If any primitive type is included, leaf values are allowed
  required: boolean;         // Is this place required for the entity to be valid?
  entitySchemas?: string[];  // If type includes 'entity', which schemas are allowed (by pubkey)
                             // If not specified, any entity schema is allowed
  validation?: {             // Optional validation rules for leaf values
    pattern?: string;        // Regex pattern for strings
    min?: number;            // Min value for numbers
    max?: number;            // Max value for numbers
    options?: any[];         // List of allowed values
  };
}

interface SchemaDefinition {
  pubkey: string;            // Public key identifier 
  schema: string | null;     // Schema reference or null for metaschema
  name: string;              // Lojban gismu name
  places: Record<string, PlaceDefinition>; // Place definitions
  translations: {            // Translations of the schema
    lang: string;            // Language code
    name: string;            // Translated name
    places: Record<string, string>; // Translated place descriptions
  }[];
}

// Validation function
function validateEntity(entity: any, schema: SchemaDefinition): ValidationResult {
  // Implementation would check that:
  // 1. All required places are present
  // 2. Each place value matches its defined type(s)
  // 3. Leaf values pass their validation rules
  // 4. Composite values reference valid entities
  // 5. Referenced schemas exist in the system
  // 6. Entity references point to entities with allowed schemas
}
```

## Core Schema Definitions

```typescript
const schemata: SchemaDefinition[] = [
    // Task schema definition
    { 
        pubkey: '0x7a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
        schema: '@0xmeta', // Reference to metaschema
        name: 'gunka',
        places: {
            x1: {
                description: 'le gunka (worker/laborer)',
                type: 'entity',
                required: true,
                entitySchemas: ['@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'] // Only prenu entities allowed
            },
            x2: {
                description: 'le se gunka (work/task/labor)',
                type: ['entity', 'string'],
                required: true,
                entitySchemas: ['@0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b'] // Only ckaji entities allowed when using an entity reference
            },
            x3: {
                description: 'le te gunka (purpose/goal/objective)',
                type: ['entity', 'string'],
                required: false
                // No entitySchemas specified, so any entity schema is allowed
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Work/Labor',
                description: 'x1 works/labors on x2 with goal x3',
                places: {
                    x1: 'worker/laborer',
                    x2: 'work/task/labor',
                    x3: 'purpose/goal/objective'
                }
            }
        ]
    },
    
    // Person schema definition
    { 
        pubkey: '0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d',
        schema: '@0xmeta',
        name: 'prenu',
        places: {
            x1: {
                description: 'le prenu (person/people)',
                type: 'entity',
                required: true,
                entitySchemas: ['@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'] // Self-referential: only prenu entities allowed
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Person',
                description: 'x1 is a person/people',
                places: {
                    x1: 'person/people'
                }
            }
        ]
    },
    
    // Status/state schema definition
    { 
        pubkey: '0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
        schema: '@0xmeta',
        name: 'tcini',
        places: {
            x1: {
                description: 'le tcini (state/situation/condition)',
                type: ['entity', 'string'],
                required: true
            },
            x2: {
                description: 'le se tcini (the object in that state/situation)',
                type: 'entity',
                required: false
                // Any entity can be in a state
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'State/Condition',
                description: 'x1 is a state/condition of x2',
                places: {
                    x1: 'state/condition',
                    x2: 'object in that state'
                }
            }
        ]
    },
    
    // Responsibility relationship schema definition
    { 
        pubkey: '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
        schema: '@0xmeta',
        name: 'turni',
        places: {
            x1: {
                description: 'le turni (governor/ruler/responsible entity)',
                type: 'entity',
                required: true,
                entitySchemas: ['@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'] // Only prenu entities can be responsible
            },
            x2: {
                description: 'le se turni (the governed/ruled/subject)',
                type: 'entity',
                required: true
                // Any entity can be governed/the subject of responsibility
            },
            x3: {
                description: 'le te turni (matter/sphere of responsibility)',
                type: ['entity', 'string'],
                required: false
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Responsible',
                description: 'x1 is responsible for x2 in sphere x3',
                places: {
                    x1: 'responsible entity',
                    x2: 'subject of responsibility',
                    x3: 'sphere/matter of responsibility'
                }
            }
        ]
    },
    
    // State transition schema definition
    { 
        pubkey: '0x3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e',
        schema: '@0xmeta',
        name: 'binxo',
                    places: {
            x1: {
                description: 'le binxo (the thing changing)',
                type: 'entity',
                required: true
                // Any entity can change
            },
            x2: {
                description: 'le se binxo (resulting state/form)',
                type: 'entity',
                required: true,
                entitySchemas: ['@0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f'] // Must be a tcini (state) entity
            },
            x3: {
                description: 'le te binxo (initial state/form)',
                type: 'entity',
                required: false,
                entitySchemas: ['@0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f'] // Must be a tcini (state) entity
            }
                    },
                    translations: [
                    {
                        lang: 'en',
                name: 'Change/Transform',
                description: 'x1 changes to x2 from x3',
                places: {
                    x1: 'thing changing',
                    x2: 'resulting state/form',
                    x3: 'initial state/form'
                }
            }
        ]
    },
    
    // Name/naming schema definition
    {
        pubkey: '0x2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d',
        schema: '@0xmeta',
        name: 'cmene',
                        places: {
            x1: {
                description: 'le cmene (name/title/tag)',
                type: 'string',
                required: true
            },
            x2: {
                description: 'le se cmene (the named/entitled/tagged)',
                type: 'entity',
                required: true
                // Any entity can have a name
            },
            x3: {
                description: 'le te cmene (namer/name-user)',
                type: 'entity',
                required: false,
                entitySchemas: ['@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'] // Only prenu (people) can name things
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Name',
                description: 'x1 is name of x2 used by x3',
                        places: {
                    x1: 'name/title/tag',
                    x2: 'named entity',
                    x3: 'namer/name-user'
                }
            }
        ]
    },

    // Property schema definition
    {
        pubkey: '0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b',
        schema: '@0xmeta',
        name: 'ckaji',
        places: {
            x1: {
                description: 'le ckaji (thing with property)',
                type: 'entity',
                required: true
                // Any entity can have properties
            },
            x2: {
                description: 'le se ckaji (property/quality/feature)',
                type: ['entity', 'string', 'number', 'boolean'],
                required: true,
                entitySchemas: [
                    '@0x2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b', // valsi (string entity)
                    '@0x8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e', // jetnu (boolean entity) 
                    '@0x4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c'  // namcu (number entity)
                ]
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Property/Quality',
                description: 'x1 has property x2',
                places: {
                    x1: 'thing with property',
                    x2: 'property/quality/feature'
                }
            }
        ]
    },
    
    // String primitive schema definition
    {
        pubkey: '0x2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
        schema: '@0xmeta',
        name: 'valsi',
        places: {
            x1: {
                description: 'le valsi (word/text)',
                type: 'string',
                required: true,
                validation: {
                    pattern: '.*' // Any string is valid
                }
            },
            x2: {
                description: 'le se valsi (meaning/concept)',
                type: ['entity', 'string'],
                required: false
            },
            x3: {
                description: 'le te valsi (language)',
                type: 'string',
                required: false,
                validation: {
                    options: ['en', 'loj', 'de', 'es', 'fr', 'zh', 'ja']
                }
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Word/Text',
                places: {
                    x1: 'word/text',
                    x2: 'meaning/concept',
                    x3: 'language'
                }
            }
        ]
    },

    // Boolean primitive schema definition
    {
        pubkey: '0x8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e',
        schema: '@0xmeta',
        name: 'jetnu',
        places: {
            x1: {
                description: 'le jetnu (truth value/proposition)',
                type: 'boolean',
                required: true
            },
            x2: {
                description: 'le se jetnu (standard/reference of truth)',
                type: ['entity', 'string'],
                required: false
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Truth/Boolean',
                places: {
                    x1: 'truth value',
                    x2: 'standard/reference'
                }
            }
        ]
    },
    
    // Number primitive schema definition
    {
        pubkey: '0x4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
        schema: '@0xmeta',
        name: 'namcu',
        places: {
            x1: {
                description: 'le namcu (number/quantity)',
                type: 'number',
                required: true
            },
            x2: {
                description: 'le se namcu (objects/units)',
                type: ['entity', 'string'],
                required: false
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Number',
                places: {
                    x1: 'number/quantity',
                    x2: 'objects/units'
                }
            }
        ]
    }
];
```

## Entity Examples

```typescript
const entities = [
    // Person entity (prenu)
    {
        pubkey: '0x7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e',
        schema: '@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d', // prenu
        name: 'Alice',
        places: {
            x1: '@0x7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e' // Entity reference (self-reference)
        }
    },
    
    // Name entity (cmene) - leaf value example
    {
        pubkey: '0xd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0',
        schema: '@0x2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d', // cmene
        places: {
            x1: 'Alice',                                      // Leaf value (string)
            x2: '@0x7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e', // Entity reference
            x3: '@0x0000000000000000000000000000000000000000'  // Entity reference
        }
    },
    
    // Task entity (gunka) - mixed entity/leaf example
    {
        pubkey: '0x4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b',
        schema: '@0x7a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b', // gunka
        name: 'UI Design Task',
        places: {
            x1: '@0x7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e', // Entity reference
            x2: 'UI Design',                                   // Leaf value (string)
            x3: 'Improve user experience'                      // Leaf value (string)
        }
    },
    
    // Boolean primitive (jetnu)
    {
        pubkey: '0xd2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
        schema: '@0x8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e', // jetnu
        places: {
            x1: true,                // Leaf value (boolean)
            x2: 'high priority task' // Leaf value (string)
        }
    },
    
    // Number primitive (namcu)
    {
        pubkey: '0xe4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3',
        schema: '@0x4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c', // namcu
        places: {
            x1: 5,               // Leaf value (number)
            x2: 'priority level' // Leaf value (string)
        }
    }
];
```

## Validation Examples

```typescript
// Example of validating an entity against its schema
const validationResult = validateEntity(
    entities[0], // Person entity
    schemata.find(s => s.pubkey === '0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d')
);

// Example of entity with wrong schema type
const wrongSchemaEntity = {
    pubkey: '0xbad1bad2bad3bad4bad5bad6bad7bad8bad9bad0',
    schema: '@0x7a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b', // gunka
    name: 'Invalid Task',
    places: {
        x1: '@0x0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0', // Not a prenu entity
        x2: 'Some task'
    }
};

// Validation would fail with:
// "Schema mismatch: x1 in gunka must reference a prenu entity"
```

## Schema Implementation Logic

The schema validation system implements these core principles:

1. **Native Lojban Logic** - Required vs. optional places follow Lojban predicate logic where x1 is typically required
2. **Composite/Leaf Flexibility** - The type field determines whether a place can accept entity references (composite) or primitive values (leaf)
3. **Type Validation** - Places can enforce specific types or allow multiple types
4. **Schema Validation** - Entity references can be restricted to specific schema types for type safety
5. **Custom Validations** - Additional constraints can be specified for leaf values (min/max for numbers, patterns for strings, etc.)
6. **Self-Documentation** - Schema definitions include full descriptions in both Lojban and translations

This approach allows for a powerful balance between flexibility and rigorous validation while staying true to Lojban's logical foundation.
