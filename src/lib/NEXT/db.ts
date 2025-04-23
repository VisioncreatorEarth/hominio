import type { LoroMap, LoroText, LoroList, LoroMovableList, LoroTree } from 'loro-crdt';

export type SumtiId = string; // Keep this alias for clarity in Bridi sumti maps
export type Pubkey = string; // Unique ID for any node (formerly SumtiId)
export type SelbriId = string; // Unique ID for a selbri definition
export type BridiId = string; // Unique ID for a relationship instance

// Define the core meta types
export type MetaType = 'Sumti' | 'Bridi' | 'Selbri' | 'Facki';

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
        klesi: 'Sumti' | 'Facki';
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
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@task1',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@task2',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@task3',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@person1',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@person2',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@person3',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },

    // Property Type Concepts (Remove cmene)
    {
        pubkey: '@prop_status',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_skill',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_priority',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_tag',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_purpose',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_leader',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@prop_deadline',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },

    // Property Value Concepts (cmene already removed)
    {
        pubkey: '@status_inprogress',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'in-progress' }
    },
    {
        pubkey: '@status_notstarted',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'not-started' }
    },
    {
        pubkey: '@status_completed',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'completed' }
    },
    {
        pubkey: '@skill_design',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'design' }
    },
    {
        pubkey: '@skill_dev',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'development' }
    },
    {
        pubkey: '@skill_test',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'testing' }
    },
    {
        pubkey: '@priority_high',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'high' }
    },
    {
        pubkey: '@priority_medium',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'medium' }
    },
    {
        pubkey: '@priority_none',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'none' }
    },
    {
        pubkey: '@tag_frontend',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'frontend' }
    },
    {
        pubkey: '@tag_qa',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'qa' }
    },
    {
        pubkey: '@purpose_build_website',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Build website' }
    },
    {
        pubkey: '@deadline_2024_12_31',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: '2024-12-31' }
    },

    // Method concepts (cmene already removed)
    {
        pubkey: '@method_agile',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Agile methodology' }
    },
    {
        pubkey: '@method_waterfall',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Waterfall methodology' }
    },
    {
        pubkey: '@method_kanban',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Kanban system' }
    },
    {
        pubkey: '@method_scrum',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Scrum framework' }
    },
    // Generic means (Remove cmene)
    {
        pubkey: '@means_tasks',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },
    {
        pubkey: '@means_work',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },

    // --- System Index Sumti Definitions (Change klesi and pubkeys) ---
    {
        pubkey: '@facki_meta',
        ckaji: { klesi: 'Facki', cmene: 'Meta Index Registry' },
        datni: {
            klesi: 'LoroMap',
            vasru: {
                sumti: '@facki_sumti',
                selbri: '@facki_selbri',
                bridi: '@facki_bridi'
            }
        }
    },
    {
        pubkey: '@facki_sumti',
        ckaji: { klesi: 'Facki' },
        datni: { klesi: 'LoroMap', vasru: {} }
    },
    {
        pubkey: '@facki_selbri',
        ckaji: { klesi: 'Facki' },
        datni: { klesi: 'LoroMap', vasru: {} }
    },
    {
        pubkey: '@facki_bridi',
        ckaji: { klesi: 'Facki' },
        datni: { klesi: 'LoroMap', vasru: {} }
    },
    // ------------------------------------

    // --- Name Sumti for Entities (Remain klesi: 'Sumti') ---
    {
        pubkey: '@project1_name',
        ckaji: { klesi: 'Sumti', cmene: 'Project 1 Name' },
        datni: { klesi: 'LoroText', vasru: 'Project: Website' }
    },
    {
        pubkey: '@task1_name',
        ckaji: { klesi: 'Sumti', cmene: 'Task 1 Name' },
        datni: { klesi: 'LoroText', vasru: 'Task 1' }
    },
    {
        pubkey: '@task2_name',
        ckaji: { klesi: 'Sumti', cmene: 'Task 2 Name' },
        datni: { klesi: 'LoroText', vasru: 'Task 2' }
    },
    {
        pubkey: '@task3_name',
        ckaji: { klesi: 'Sumti', cmene: 'Task 3 Name' },
        datni: { klesi: 'LoroText', vasru: 'Task 3' }
    },
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
            klesi: 'Selbri'
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
            klesi: 'Selbri'
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
            klesi: 'Selbri'
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
            klesi: 'Selbri'
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
            klesi: 'Bridi'
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
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@purpose_build_website' }
        }
    },
    {
        pubkey: '@bridi_proj1_ckaji_leader',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@person1' }
        }
    },
    {
        pubkey: '@bridi_proj1_ckaji_deadline',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@deadline_2024_12_31' }
        }
    },

    // Task Assignments (gunka)
    {
        pubkey: '@bridi_gunka_task1',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_gunka',
            sumti: { x1: '@person2', x2: '@task1', x3: '@project1' }
        }
    },
    {
        pubkey: '@bridi_gunka_task2',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_gunka',
            sumti: { x1: '@person1', x2: '@task2', x3: '@project1' }
        }
    },
    {
        pubkey: '@bridi_gunka_task3',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_gunka',
            sumti: { x1: '@person3', x2: '@task3', x3: '@project1' }
        }
    },

    // Task Properties (ckaji: x1=Task, x2=Property Value Concept)
    {
        pubkey: '@bridi_task1_ckaji_skill',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@skill_design' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_status',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@status_inprogress' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_priority',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@priority_high' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_tag',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@tag_frontend' }
        }
    },

    {
        pubkey: '@bridi_task2_ckaji_skill',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@skill_dev' }
        }
    },
    {
        pubkey: '@bridi_task2_ckaji_status',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@status_notstarted' }
        }
    },
    {
        pubkey: '@bridi_task2_ckaji_priority',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@priority_medium' }
        }
    },

    {
        pubkey: '@bridi_task3_ckaji_skill',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@skill_test' }
        }
    },
    {
        pubkey: '@bridi_task3_ckaji_status',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@status_notstarted' }
        }
    },
    {
        pubkey: '@bridi_task3_ckaji_tag',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@tag_qa' }
        }
    },

    // Person Name links (ckaji: x1=Person, x2=Name Value Sumti)
    {
        pubkey: '@bridi_person1_ckaji_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@person1', x2: '@person1_name' }
        }
    },
    {
        pubkey: '@bridi_person2_ckaji_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@person2', x2: '@person2_name' }
        }
    },
    {
        pubkey: '@bridi_person3_ckaji_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@person3', x2: '@person3_name' }
        }
    },

    // --- ADD Name Bridi for Entities ---
    {
        pubkey: '@bridi_proj1_ckaji_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@project1_name' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@task1_name' }
        }
    },
    {
        pubkey: '@bridi_task2_ckaji_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@task2_name' }
        }
    },
    {
        pubkey: '@bridi_task3_ckaji_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@task3_name' }
        }
    },
];
