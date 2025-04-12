import type { Entity, SchemaDefinition } from './types';

// Schema Definitions
export const schemas: Record<string, SchemaDefinition> = {
    // Meta-schema for all Lojban gismu (root words)
    "gismu": {
        pubkey: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
        schema: null, // Self-referential as the fundamental meta-schema
        name: "gismu",
        places: {
            x1: {
                description: "lo lojbo ke krasi valsi",
                type: "string",
                required: true
            },
            x2: {
                description: "lo bridi be lo ka ce'u skicu zo'e",
                type: "string",
                required: true
            },
            x3: {
                description: "lo sumti javni",
                type: "any",
                required: true
            },
            x4: {
                description: "lo rafsi",
                type: "string",
                required: false
            }
        },
        translations: [
            {
                lang: "en",
                name: "Root Word",
                description: "A Lojban root word (gismu) defining a fundamental concept",
                places: {
                    x1: "A Lojban root word",
                    x2: "Relation/concept expressed by the word",
                    x3: "Argument roles for the relation",
                    x4: "Associated affix(es)"
                }
            },
            {
                lang: "de",
                name: "Stammwort",
                description: "Ein Lojban-Stammwort (Gismu), das einen grundlegenden Begriff definiert",
                places: {
                    x1: "Das Stammwort",
                    x2: "Ausgedrückte Relation/Konzept",
                    x3: "Argumentrollen der Relation",
                    x4: "Zugehörige Affixe"
                }
            }
        ]
    },

    // prenu - person
    "prenu": {
        pubkey: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
        schema: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", // Reference to gismu
        name: "prenu",
        places: {
            x1: {
                description: "lo prenu",
                type: "string",
                required: true
            }
        },
        translations: [
            {
                lang: "en",
                name: "Person",
                description: "A person entity",
                places: {
                    x1: "Person/entity with personhood"
                }
            },
            {
                lang: "de",
                name: "Person",
                description: "Eine Person",
                places: {
                    x1: "Person/Wesen mit Persönlichkeit"
                }
            }
        ]
    },

    // gunka - work/labor
    "gunka": {
        pubkey: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c",
        schema: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", // Reference to gismu
        name: "gunka",
        places: {
            x1: {
                description: "lo gunka",
                type: "entity",
                required: true,
                entitySchemas: ["0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d"] // Reference to prenu
            },
            x2: {
                description: "lo se gunka",
                type: "string",
                required: true
            },
            x3: {
                description: "lo te gunka",
                type: "string",
                required: false
            }
        },
        translations: [
            {
                lang: "en",
                name: "Work",
                description: "To work/labor on something with a purpose",
                places: {
                    x1: "Worker/laborer",
                    x2: "Task/activity worked on",
                    x3: "Purpose/goal of the work"
                }
            },
            {
                lang: "de",
                name: "Arbeit",
                description: "An etwas mit einem Zweck arbeiten",
                places: {
                    x1: "Arbeiter",
                    x2: "Aufgabe/Tätigkeit, an der gearbeitet wird",
                    x3: "Zweck/Ziel der Arbeit"
                }
            }
        ]
    },

    // tcini - situation/condition/state
    "tcini": {
        pubkey: "0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e",
        schema: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", // Reference to gismu
        name: "tcini",
        places: {
            x1: {
                description: "lo tcini",
                type: "string",
                required: true,
                validation: {
                    options: ["todo", "in_progress", "done", "blocked"]
                }
            },
            x2: {
                description: "lo se tcini",
                type: "entity",
                required: true,
                entitySchemas: ["0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c"] // Reference to gunka
            }
        },
        translations: [
            {
                lang: "en",
                name: "Status",
                description: "A situation, state or condition",
                places: {
                    x1: "Situation/state/condition",
                    x2: "Entity in the situation/state/condition"
                }
            },
            {
                lang: "de",
                name: "Status",
                description: "Eine Situation, ein Zustand oder eine Bedingung",
                places: {
                    x1: "Situation/Zustand/Bedingung",
                    x2: "Entität in der Situation/dem Zustand/der Bedingung"
                }
            }
        ]
    },

    // ckaji - property/attribute/quality/characteristic
    "ckaji": {
        pubkey: "0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f",
        schema: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", // Reference to gismu
        name: "ckaji",
        places: {
            x1: {
                description: "lo se ckaji",
                type: ["entity", "string"],
                required: true
            },
            x2: {
                description: "lo ka ckaji",
                type: "string",
                required: true
            }
        },
        translations: [
            {
                lang: "en",
                name: "Property",
                description: "A property, characteristic, or attribute",
                places: {
                    x1: "Entity having the property",
                    x2: "Property/characteristic/attribute"
                }
            },
            {
                lang: "de",
                name: "Eigenschaft",
                description: "Eine Eigenschaft, ein Merkmal oder Attribut",
                places: {
                    x1: "Entität mit der Eigenschaft",
                    x2: "Eigenschaft/Merkmal/Attribut"
                }
            }
        ]
    },

    // valsi - word/name
    "valsi": {
        pubkey: "0x6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a",
        schema: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", // Reference to gismu
        name: "valsi",
        places: {
            x1: {
                description: "lo valsi",
                type: "string",
                required: true
            },
            x2: {
                description: "lo se valsi",
                type: "string",
                required: true
            },
            x3: {
                description: "lo te valsi",
                type: "string",
                required: false
            }
        },
        translations: [
            {
                lang: "en",
                name: "Word",
                description: "A word or name with meaning in a language",
                places: {
                    x1: "Word/name",
                    x2: "Meaning/definition",
                    x3: "Language"
                }
            },
            {
                lang: "de",
                name: "Wort",
                description: "Ein Wort oder Name mit Bedeutung in einer Sprache",
                places: {
                    x1: "Wort/Name",
                    x2: "Bedeutung/Definition",
                    x3: "Sprache"
                }
            }
        ]
    },

    // jetnu - truth
    "jetnu": {
        pubkey: "0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b",
        schema: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", // Reference to gismu
        name: "jetnu",
        places: {
            x1: {
                description: "lo jetnu",
                type: "boolean",
                required: true
            },
            x2: {
                description: "lo se jetnu",
                type: "string",
                required: false
            }
        },
        translations: [
            {
                lang: "en",
                name: "Truth",
                description: "Something that is true/actual by some standard",
                places: {
                    x1: "Truth/fact",
                    x2: "Standard of truth"
                }
            },
            {
                lang: "de",
                name: "Wahrheit",
                description: "Etwas, das nach einem bestimmten Standard wahr/tatsächlich ist",
                places: {
                    x1: "Wahrheit/Tatsache",
                    x2: "Wahrheitsstandard"
                }
            }
        ]
    },

    // namcu - number
    "namcu": {
        pubkey: "0x8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c",
        schema: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", // Reference to gismu
        name: "namcu",
        places: {
            x1: {
                description: "lo namcu",
                type: "number",
                required: true
            },
            x2: {
                description: "lo se namcu",
                type: "string",
                required: false
            },
            x3: {
                description: "lo te namcu",
                type: "string",
                required: false
            }
        },
        translations: [
            {
                lang: "en",
                name: "Number",
                description: "A number or quantity",
                places: {
                    x1: "Number/quantity",
                    x2: "Quantified object/abstraction",
                    x3: "Number system/scale"
                }
            },
            {
                lang: "de",
                name: "Zahl",
                description: "Eine Zahl oder Menge",
                places: {
                    x1: "Zahl/Menge",
                    x2: "Quantifiziertes Objekt/Abstraktion",
                    x3: "Zahlensystem/Skala"
                }
            }
        ]
    }
};

// Entity Definitions
export const entities: Record<string, Entity> = {
    // Person entities
    "person1": {
        pubkey: "0xa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
        schema: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d", // Reference to prenu
        name: "Alice",
        places: {
            x1: "Alice Smith"
        }
    },
    "person2": {
        pubkey: "0xb1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c",
        schema: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d", // Reference to prenu
        name: "Bob",
        places: {
            x1: "Bob Johnson"
        }
    },

    // Task entities
    "task1": {
        pubkey: "0x9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d",
        schema: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c", // Reference to gunka
        name: "UI Design Task",
        places: {
            x1: "0xa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b", // Reference to Alice
            x2: "Design the new dashboard UI",
            x3: "Improve user experience for the application"
        }
    },
    "task2": {
        pubkey: "0xd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0",
        schema: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c", // Reference to gunka
        name: "API Integration",
        places: {
            x1: "0xb1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c", // Reference to Bob
            x2: "Integrate with payment API",
            x3: "Enable secure payment processing"
        }
    },
    "task3": {
        pubkey: "0xe2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1",
        schema: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c", // Reference to gunka
        name: "Testing",
        places: {
            x1: "0xa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b", // Reference to Alice
            x2: "Test new features in production",
            x3: "Ensure application stability"
        }
    },

    // Status entities
    "status1": {
        pubkey: "0xc2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d",
        schema: "0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e", // Reference to tcini
        name: "In Progress",
        places: {
            x1: "in_progress",
            x2: "0x9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d"  // UI Design Task
        }
    },
    "status2": {
        pubkey: "0xd3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e",
        schema: "0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e", // Reference to tcini
        name: "To Do",
        places: {
            x1: "todo",
            x2: "0xd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0"  // API Integration
        }
    },
    "status3": {
        pubkey: "0xe4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f",
        schema: "0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e", // Reference to tcini
        name: "Done",
        places: {
            x1: "done",
            x2: "0xe2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1"  // Testing
        }
    },
    "status4": {
        pubkey: "0xf5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a",
        schema: "0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e", // Reference to tcini
        name: "Blocked",
        places: {
            x1: "blocked",
            x2: null
        }
    }
};

// Get all HQL documents (both schemas and entities)
export function getAllDocuments() {
    // Convert schemas to documents
    const schemaDocuments = Object.entries(schemas).map(([, schema]) => ({
        pubkey: schema.pubkey,
        type: 'schema' as const,
        document: schema
    }));

    // Convert entities to documents
    const entityDocuments = Object.entries(entities).map(([, entity]) => ({
        pubkey: entity.pubkey,
        type: 'entity' as const,
        document: entity
    }));

    // Combine and return all documents
    return [...schemaDocuments, ...entityDocuments];
}

// Get a specific document by pubkey
export function getDocumentByPubkey(pubkey: string) {
    // Check schemas first
    const schema = Object.values(schemas).find(s => s.pubkey === pubkey);
    if (schema) {
        return {
            pubkey: schema.pubkey,
            type: 'schema' as const,
            document: schema
        };
    }

    // Then check entities
    const entity = Object.values(entities).find(e => e.pubkey === pubkey);
    if (entity) {
        return {
            pubkey: entity.pubkey,
            type: 'entity' as const,
            document: entity
        };
    }

    // Not found
    return null;
}

// Get all schemas
export function getAllSchemas() {
    return Object.values(schemas);
}

// Get all entities
export function getAllEntities(): Entity[] {
    // Ensure all entities have the required fields
    return Object.values(entities).map(entity => ({
        ...entity,
        // Provide empty translations if missing
        translations: entity.translations || { jbo: '', en: '', de: '' }
    }));
}

// Get entities by schema
export function getEntitiesBySchema(schemaPubkey: string) {
    return Object.values(entities).filter(entity => entity.schema === schemaPubkey);
} 