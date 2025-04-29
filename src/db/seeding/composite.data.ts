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

    // --- NEW Task Statuses (tcini) ---
    {
        pubkey: '@composite/task1_tcini_status',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/tcini',
            places: { x1: '@task1', x2: '@status_inprogress' }
        }
    },
    {
        pubkey: '@composite/task2_tcini_status',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/tcini',
            places: { x1: '@task2', x2: '@status_notstarted' }
        }
    },
    {
        pubkey: '@composite/task3_tcini_status',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/tcini',
            places: { x1: '@task3', x2: '@status_notstarted' }
        }
    },
    // --- END NEW Task Statuses ---
];
