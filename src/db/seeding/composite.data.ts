import type { LeafId } from './leaf.data';
import type { SchemaId } from './schema.data';

export type CompositeId = string;

export interface CompositeRecord {
    pubkey: CompositeId;
    metadata: {
        type: 'Composite';
    };
    data: {
        schemaId: SchemaId;
        places: {
            x1?: LeafId;
            x2?: LeafId;
            x3?: LeafId;
            x4?: LeafId;
            x5?: LeafId;
        };
    };
}

export const initialComposites: CompositeRecord[] = [
    // Zukte example: Person1 uses Agile to build website
    {
        pubkey: '@composite/zukte_person1_agile',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/zukte',
            places: {
                x1: '@person1',
                x2: '@method_agile',
                x3: '@purpose_build_website'
            }
        }
    },

    // Project 1 Info (using ckaji for properties)
    {
        pubkey: '@composite/proj1_ckaji_purpose_build',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@project1', x2: '@prop_purpose', x3: '@purpose_build_website' }
        }
    },
    {
        pubkey: '@composite/proj1_ckaji_leader_person1',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@project1', x2: '@prop_leader', x3: '@person1' }
        }
    },
    {
        pubkey: '@composite/proj1_ckaji_deadline_dec31',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@project1', x2: '@prop_deadline', x3: '@deadline_2024_12_31' }
        }
    },

    // Task Assignments (gunka) - Structure: x1=Worker, x2=Task, x3=Project (updated based on schema def)
    {
        pubkey: '@composite/gunka_task1',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/gunka',
            places: { x1: '@person2', x2: '@task1', x3: '@project1' }
        }
    },
    {
        pubkey: '@composite/gunka_task2',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/gunka',
            places: { x1: '@person1', x2: '@task2', x3: '@project1' }
        }
    },
    {
        pubkey: '@composite/gunka_task3',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/gunka',
            places: { x1: '@person3', x2: '@task3', x3: '@project1' }
        }
    },

    // Task Properties (ckaji: x1=Task, x2=PropValue)
    {
        pubkey: '@composite/task1_ckaji_skill_design',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task1', x2: '@skill_design' }
        }
    },
    {
        pubkey: '@composite/task1_ckaji_status_inprogress',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task1', x2: '@status_inprogress' }
        }
    },
    {
        pubkey: '@composite/task1_ckaji_priority_high',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task1', x2: '@priority_high' }
        }
    },
    {
        pubkey: '@composite/task1_ckaji_tag_frontend',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task1', x2: '@tag_frontend' }
        }
    },

    {
        pubkey: '@composite/task2_ckaji_skill_dev',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task2', x2: '@skill_dev' }
        }
    },
    {
        pubkey: '@composite/task2_ckaji_status_notstarted',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task2', x2: '@status_notstarted' }
        }
    },
    {
        pubkey: '@composite/task2_ckaji_priority_medium',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task2', x2: '@priority_medium' }
        }
    },

    {
        pubkey: '@composite/task3_ckaji_skill_test',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task3', x2: '@skill_test' }
        }
    },
    {
        pubkey: '@composite/task3_ckaji_status_notstarted',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task3', x2: '@status_notstarted' }
        }
    },
    {
        pubkey: '@composite/task3_ckaji_tag_qa',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: { x1: '@task3', x2: '@tag_qa' }
        }
    },

    // Person Name links (using @schema/cneme: x1=Person, x2=Name Leaf)
    {
        pubkey: '@composite/person1_cneme_name',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/cneme',
            places: { x1: '@person1', x2: '@person1_name' }
        }
    },
    {
        pubkey: '@composite/person2_cneme_name',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/cneme',
            places: { x1: '@person2', x2: '@person2_name' }
        }
    },
    {
        pubkey: '@composite/person3_cneme_name',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/cneme',
            places: { x1: '@person3', x2: '@person3_name' }
        }
    },

    // Name Composites for Entities (using @schema/cneme: x1=Entity, x2=Name Leaf)
    {
        pubkey: '@composite/proj1_cneme_name',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/cneme',
            places: { x1: '@project1', x2: '@project1_name' }
        }
    },
    {
        pubkey: '@composite/task1_cneme_name',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/cneme',
            places: { x1: '@task1', x2: '@task1_name' }
        }
    },
    {
        pubkey: '@composite/task2_cneme_name',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/cneme',
            places: { x1: '@task2', x2: '@task2_name' }
        }
    },
    {
        pubkey: '@composite/task3_cneme_name',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/cneme',
            places: { x1: '@task3', x2: '@task3_name' }
        }
    },

    // Person classification (using @schema/prenu: x1=Person)
    {
        pubkey: '@composite/person1_prenu',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/prenu',
            places: { x1: '@person1' }
        }
    },
    {
        pubkey: '@composite/person2_prenu',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/prenu',
            places: { x1: '@person2' }
        }
    },
    {
        pubkey: '@composite/person3_prenu',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/prenu',
            places: { x1: '@person3' }
        }
    },
];
