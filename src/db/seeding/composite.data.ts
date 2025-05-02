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
    // Task Assignments (gunka) - Structure: x1=Worker, x2=Task, x3=Project
    {
        pubkey: '@composite/gunka_task1', // Renaming slightly for clarity
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/gunka',
            places: { x1: '@person1', x2: '@task1', x3: '@project1' } // Using person1
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

    // Person classification (using @schema/prenu: x1=Person)
    {
        pubkey: '@composite/person1_prenu',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/prenu',
            places: { x1: '@person1' }
        }
    },

    // --- Task Statuses (tcini) ---
    {
        pubkey: '@composite/task1_tcini_status',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/tcini',
            places: { x1: '@task1', x2: '@status_notstarted' } // Defaulting task1 to not started
        }
    },

    // --- NEW: Link Tags to Task 1 using ckaji ---
    {
        pubkey: '@ckaji/task1_urgent',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: {
                x1: '@task1',
                x2: '@tag/urgent'
            }
        }
    },
    {
        pubkey: '@ckaji/task1_frontend',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ckaji',
            places: {
                x1: '@task1',
                x2: '@tag/frontend'
            }
        }
    },
    // --- END NEW TAG LINKS ---
];
