import type { LoroMap, LoroText, LoroList, LoroMovableList, LoroTree } from 'loro-crdt';

export type SumtiId = string; // Keep this alias for clarity in Bridi sumti maps
export type Pubkey = string; // Unique ID for any node (formerly SumtiId)
export type SelbriId = string; // Unique ID for a selbri definition
export type BridiId = string; // Unique ID for a relationship instance

// Define the core meta types
export type MetaType = 'Sumti' | 'Bridi' | 'Selbri';

// Define Loro CRDT types aligned with their actual implementation
export type LoroDocType =
    | 'LoroMap'
    | 'LoroText'
    | 'LoroList'
    | 'LoroMovableList'
    | 'LoroTree';

export interface LoroValue {
    loroType: LoroDocType;
    content: Record<string, unknown> | string | unknown[] | unknown; // Use unknown instead of any
}

// Define Sumti value structures using a discriminated union based on type
export type SumtiValueKlesi = 'concept' | LoroDocType;

// Use 'vasru' for the contained content field
type SumtiValueMap = { klesi: 'LoroMap'; vasru: Record<string, unknown> };
type SumtiValueText = { klesi: 'LoroText'; vasru: string };
type SumtiValueList = { klesi: 'LoroList' | 'LoroMovableList'; vasru: unknown[] };
type SumtiValueTree = { klesi: 'LoroTree'; vasru: unknown };
type SumtiValueConcept = { klesi: 'concept' }; // No vasru property for concepts

export type SumtiValue = SumtiValueMap | SumtiValueText | SumtiValueList | SumtiValueTree | SumtiValueConcept;

export interface SumtiRecord {
    pubkey: Pubkey;
    ckaji: {
        klesi: 'Sumti';
        cmene?: string;
    };
    datni: SumtiValue;
}

// Example of how Loro capabilities would be implemented
// Using more specific types where possible
export interface LoroDocImplementation {
    // Core Loro doc methods returning specific container types
    getMap(key: string): LoroMap;
    getText(key: string): LoroText;
    getList(key: string): LoroList;
    getMovableList(key: string): LoroMovableList;
    getTree(key: string): LoroTree;

    // Export/import for sync - Blob type often Uint8Array or similar, using unknown for now
    export(options?: { mode: 'snapshot' | 'update' }): unknown; // Or Uint8Array
    import(blob: unknown): void; // Or Uint8Array

    // Version tracking
    commit(): void;
}

// Updated interface for BridiRecord to include Loro structure
export interface BridiRecord {
    pubkey: BridiId;
    ckaji: {
        klesi: 'Bridi';
        cmene?: string;
    }
    datni: {
        selbri: SelbriId;
        sumti: {
            x1?: SumtiId;
            x2?: SumtiId;
            x3?: SumtiId;
            x4?: SumtiId;
            x5?: SumtiId;
        };

    }
}

// Updated SelbriRecord to include Loro structure
export interface SelbriRecord {
    pubkey: SelbriId;
    ckaji: {
        klesi: 'Selbri';
        cmene?: string;
    };
    datni: {
        selbri: SelbriId
        sumti: { // Defines the expected types/roles for sumti places
            x1?: string; // Description or type constraint for x1
            x2?: string; // Description or type constraint for x2
            x3?: string; // Description or type constraint for x3
            x4?: string; // Description or type constraint for x4
            x5?: string; // Description or type constraint for x5
        };
    }

}

// --- Initial Data (Updated Structure) ---
export const initialSumti: SumtiRecord[] = [
    // Entities (conceptual entities use LoroMap as container)
    {
        pubkey: '@project1',
        ckaji: { klesi: 'Sumti', cmene: 'Project: Website' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@task1',
        ckaji: { klesi: 'Sumti', cmene: 'Task 1' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@task2',
        ckaji: { klesi: 'Sumti', cmene: 'Task 2' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@task3',
        ckaji: { klesi: 'Sumti', cmene: 'Task 3' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@person1',
        ckaji: { klesi: 'Sumti', cmene: 'Person 1' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@person2',
        ckaji: { klesi: 'Sumti', cmene: 'Person 2' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@person3',
        ckaji: { klesi: 'Sumti', cmene: 'Person 3' },
        datni: { klesi: 'concept' }
    },

    // Property Type Concepts (as concepts with LoroMap)
    {
        pubkey: '@prop_status',
        ckaji: { klesi: 'Sumti', cmene: 'Property Type: Status' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_skill',
        ckaji: { klesi: 'Sumti', cmene: 'Property Type: Skill' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_priority',
        ckaji: { klesi: 'Sumti', cmene: 'Property Type: Priority' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_tag',
        ckaji: { klesi: 'Sumti', cmene: 'Property Type: Tag' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_purpose',
        ckaji: { klesi: 'Sumti', cmene: 'Property Type: Purpose' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_leader',
        ckaji: { klesi: 'Sumti', cmene: 'Property Type: Leader' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_deadline',
        ckaji: { klesi: 'Sumti', cmene: 'Property Type: Deadline' },
        datni: { klesi: 'concept' }
    },

    // Property Value Concepts (using LoroText for values)
    {
        pubkey: '@status_inprogress',
        ckaji: { klesi: 'Sumti', cmene: 'in-progress' },
        datni: { klesi: 'LoroText', vasru: 'in-progress' }
    },
    {
        pubkey: '@status_notstarted',
        ckaji: { klesi: 'Sumti', cmene: 'not-started' },
        datni: { klesi: 'LoroText', vasru: 'not-started' }
    },
    {
        pubkey: '@status_completed',
        ckaji: { klesi: 'Sumti', cmene: 'completed' },
        datni: { klesi: 'LoroText', vasru: 'completed' }
    },
    {
        pubkey: '@skill_design',
        ckaji: { klesi: 'Sumti', cmene: 'design' },
        datni: { klesi: 'LoroText', vasru: 'design' }
    },
    {
        pubkey: '@skill_dev',
        ckaji: { klesi: 'Sumti', cmene: 'development' },
        datni: { klesi: 'LoroText', vasru: 'development' }
    },
    {
        pubkey: '@skill_test',
        ckaji: { klesi: 'Sumti', cmene: 'testing' },
        datni: { klesi: 'LoroText', vasru: 'testing' }
    },
    {
        pubkey: '@priority_high',
        ckaji: { klesi: 'Sumti', cmene: 'high' },
        datni: { klesi: 'LoroText', vasru: 'high' }
    },
    {
        pubkey: '@priority_medium',
        ckaji: { klesi: 'Sumti', cmene: 'medium' },
        datni: { klesi: 'LoroText', vasru: 'medium' }
    },
    {
        pubkey: '@priority_none',
        ckaji: { klesi: 'Sumti', cmene: 'none' },
        datni: { klesi: 'LoroText', vasru: 'none' }
    },
    {
        pubkey: '@tag_frontend',
        ckaji: { klesi: 'Sumti', cmene: 'frontend' },
        datni: { klesi: 'LoroText', vasru: 'frontend' }
    },
    {
        pubkey: '@tag_qa',
        ckaji: { klesi: 'Sumti', cmene: 'qa' },
        datni: { klesi: 'LoroText', vasru: 'qa' }
    },
    {
        pubkey: '@purpose_build_website',
        ckaji: { klesi: 'Sumti', cmene: 'Build website' },
        datni: { klesi: 'LoroText', vasru: 'Build website' }
    },
    {
        pubkey: '@deadline_2024_12_31',
        ckaji: { klesi: 'Sumti', cmene: '2024-12-31' },
        datni: { klesi: 'LoroText', vasru: '2024-12-31' }
    },

    // Method concepts for zukte relations (x2 in zukte) - using LoroText
    {
        pubkey: '@method_agile',
        ckaji: { klesi: 'Sumti', cmene: 'Agile methodology' },
        datni: { klesi: 'LoroText', vasru: 'Agile methodology' }
    },
    {
        pubkey: '@method_waterfall',
        ckaji: { klesi: 'Sumti', cmene: 'Waterfall methodology' },
        datni: { klesi: 'LoroText', vasru: 'Waterfall methodology' }
    },
    {
        pubkey: '@method_kanban',
        ckaji: { klesi: 'Sumti', cmene: 'Kanban system' },
        datni: { klesi: 'LoroText', vasru: 'Kanban system' }
    },
    {
        pubkey: '@method_scrum',
        ckaji: { klesi: 'Sumti', cmene: 'Scrum framework' },
        datni: { klesi: 'LoroText', vasru: 'Scrum framework' }
    },
    // Generic means for milestones and tasks - treat as concepts
    {
        pubkey: '@means_tasks',
        ckaji: { klesi: 'Sumti', cmene: 'Collection of tasks' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@means_work',
        ckaji: { klesi: 'Sumti', cmene: 'Work effort' },
        datni: { klesi: 'concept' }
    },

    // --- System Index Sumti Definitions (as specified in LORO_HQL.md) ---
    {
        pubkey: '@liste_meta',
        ckaji: { klesi: 'Sumti', cmene: 'Meta Index Registry' },
        datni: { // Pre-populated map linking to other indexes
            klesi: 'LoroMap',
            vasru: {
                sumti: '@liste_sumti',
                selbri: '@liste_selbri',
                bridi: '@liste_bridi'
            }
        }
    },
    {
        pubkey: '@liste_sumti',
        ckaji: { klesi: 'Sumti', cmene: 'Sumti Existence Index' },
        datni: { klesi: 'LoroMap', vasru: {} } // Initially empty map
    },
    {
        pubkey: '@liste_selbri',
        ckaji: { klesi: 'Sumti', cmene: 'Selbri Existence Index' },
        datni: { klesi: 'LoroMap', vasru: {} } // Initially empty map
    },
    {
        pubkey: '@liste_bridi',
        ckaji: { klesi: 'Sumti', cmene: 'Bridi Relationship Index' },
        datni: { klesi: 'LoroMap', vasru: {} } // Initially empty map
    },
    // ------------------------------------

    {
        pubkey: '@person1_name',
        ckaji: { klesi: 'Sumti', cmene: 'Person 1 Name' },
        datni: { klesi: 'LoroText', vasru: 'Alice' }
    },
    {
        pubkey: '@person2_name',
        ckaji: { klesi: 'Sumti', cmene: 'Person 2 Name' },
        datni: { klesi: 'LoroText', vasru: 'Bob' }
    },
    {
        pubkey: '@person3_name',
        ckaji: { klesi: 'Sumti', cmene: 'Person 3 Name' },
        datni: { klesi: 'LoroText', vasru: 'Charlie' }
    },
];

export const initialSelbri: SelbriRecord[] = [
    {
        pubkey: '@selbri_zukte',
        ckaji: {
            klesi: 'Selbri',
            cmene: 'zukte'
        },
        datni: {
            selbri: '@selbri_zukte',
            sumti: {
                x1: 'volitional entity (agent/person/organization)',
                x2: 'means/action (method/process)',
                x3: 'purpose/goal (objective/desired outcome)'
            }
        }
    },
    {
        pubkey: '@selbri_gunka',
        ckaji: {
            klesi: 'Selbri',
            cmene: 'gunka'
        },
        datni: {
            selbri: '@selbri_gunka',
            sumti: {
                x1: 'worker (person/agent who performs the task)',
                x2: 'activity/task (specific work item being performed)',
                x3: 'goal/objective (project or higher-level purpose)'
            }
        }
    },
    {
        pubkey: '@selbri_ckaji',
        ckaji: {
            klesi: 'Selbri',
            cmene: 'ckaji'
        },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: {
                x1: 'entity (object/concept being characterized)',
                x2: 'property/characteristic (value concept or attribute)'
            }
        }
    },
    {
        pubkey: '@selbri_prenu',
        ckaji: {
            klesi: 'Selbri',
            cmene: 'prenu'
        },
        datni: {
            selbri: '@selbri_prenu',
            sumti: {
                x1: 'person (human individual)'
            }
        }
    }
];

export const initialBridi: BridiRecord[] = [
    // Zukte example: Person1 uses Agile to build website
    {
        pubkey: '@bridi_zukte_person1_agile',
        ckaji: {
            klesi: 'Bridi',
            cmene: 'Person1 uses Agile methodology to build website'
        },
        datni: {
            selbri: '@selbri_zukte',
            sumti: {
                x1: '@person1',
                x2: '@method_agile',
                x3: '@purpose_build_website'
            }
        }
    },

    // Project 1 Info (using ckaji for properties)
    {
        pubkey: '@bridi_proj1_ckaji_purpose',
        ckaji: { klesi: 'Bridi', cmene: 'Project 1 Purpose' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@purpose_build_website' }
        }
    },
    {
        pubkey: '@bridi_proj1_ckaji_leader',
        ckaji: { klesi: 'Bridi', cmene: 'Project 1 Leader' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@person1' }
        }
    },
    {
        pubkey: '@bridi_proj1_ckaji_deadline',
        ckaji: { klesi: 'Bridi', cmene: 'Project 1 Deadline' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@deadline_2024_12_31' }
        }
    },

    // Task Assignments (gunka)
    {
        pubkey: '@bridi_gunka_task1',
        ckaji: { klesi: 'Bridi', cmene: 'Task 1 Assignment' },
        datni: {
            selbri: '@selbri_gunka',
            sumti: { x1: '@person2', x2: '@task1', x3: '@project1' }
        }
    },
    {
        pubkey: '@bridi_gunka_task2',
        ckaji: { klesi: 'Bridi', cmene: 'Task 2 Assignment' },
        datni: {
            selbri: '@selbri_gunka',
            sumti: { x1: '@person1', x2: '@task2', x3: '@project1' }
        }
    },
    {
        pubkey: '@bridi_gunka_task3',
        ckaji: { klesi: 'Bridi', cmene: 'Task 3 Assignment' },
        datni: {
            selbri: '@selbri_gunka',
            sumti: { x1: '@person3', x2: '@task3', x3: '@project1' }
        }
    },

    // Task Properties (ckaji: x1=Task, x2=Property Value Concept)
    {
        pubkey: '@bridi_task1_ckaji_skill',
        ckaji: { klesi: 'Bridi', cmene: 'Task 1 Skill' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@skill_design' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_status',
        ckaji: { klesi: 'Bridi', cmene: 'Task 1 Status' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@status_inprogress' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_priority',
        ckaji: { klesi: 'Bridi', cmene: 'Task 1 Priority' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@priority_high' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_tag',
        ckaji: { klesi: 'Bridi', cmene: 'Task 1 Tag' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@tag_frontend' }
        }
    },

    {
        pubkey: '@bridi_task2_ckaji_skill',
        ckaji: { klesi: 'Bridi', cmene: 'Task 2 Skill' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@skill_dev' }
        }
    },
    {
        pubkey: '@bridi_task2_ckaji_status',
        ckaji: { klesi: 'Bridi', cmene: 'Task 2 Status' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@status_notstarted' }
        }
    },
    {
        pubkey: '@bridi_task2_ckaji_priority',
        ckaji: { klesi: 'Bridi', cmene: 'Task 2 Priority' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@priority_medium' }
        }
    },

    {
        pubkey: '@bridi_task3_ckaji_skill',
        ckaji: { klesi: 'Bridi', cmene: 'Task 3 Skill' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@skill_test' }
        }
    },
    {
        pubkey: '@bridi_task3_ckaji_status',
        ckaji: { klesi: 'Bridi', cmene: 'Task 3 Status' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@status_notstarted' }
        }
    },
    {
        pubkey: '@bridi_task3_ckaji_tag',
        ckaji: { klesi: 'Bridi', cmene: 'Task 3 Tag' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@tag_qa' }
        }
    },

    // Person Name links (ckaji: x1=Person, x2=Name Value Sumti)
    {
        pubkey: '@bridi_person1_ckaji_name',
        ckaji: { klesi: 'Bridi', cmene: 'Person 1 has name' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@person1', x2: '@person1_name' }
        }
    },
    {
        pubkey: '@bridi_person2_ckaji_name',
        ckaji: { klesi: 'Bridi', cmene: 'Person 2 has name' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@person2', x2: '@person2_name' }
        }
    },
    {
        pubkey: '@bridi_person3_ckaji_name',
        ckaji: { klesi: 'Bridi', cmene: 'Person 3 has name' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@person3', x2: '@person3_name' }
        }
    }
];
