// Types moved to hominio-types.ts
// import type { LeafId } from './hominio-types';
// import type { SchemaId } from './hominio-types';
import type { LeafId, SchemaId } from '$lib/KERNEL/hominio-types'; // Corrected Path

export type { LeafId, SchemaId }; // Re-export base types

// Keep initialComposites definition, it uses CompositeRecord which will be imported
// import type { CompositeRecord } from './hominio-types';
import type { CompositeRecord } from '$lib/KERNEL/hominio-types'; // Corrected Path
export type { CompositeRecord }; // Re-export main type

// --- Definition of Alice's Wallet related Composites ---
const aliceWalletComposites: CompositeRecord[] = [
    // 1. Classify the wallet concept using @schema/balji
    {
        pubkey: '@composite/alice_wallet_balji',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/balji',
            places: { x1: '@alice_wallet_concept' }
        }
    },
    // 2. Link Alice's Prenu (@person1) to her Wallet Concept using @schema/ponse (ownership)
    {
        pubkey: '@composite/alice_wallet_ponse_owner',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/ponse',
            places: { x1: '@person1', x2: '@alice_wallet_concept' }
        }
    },
    // 3. Link the Wallet Concept to its Address Leaf using @schema/cneme (identifier/name)
    {
        pubkey: '@composite/alice_wallet_cneme_address',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/cneme',
            places: { x1: '@alice_wallet_concept', x2: '@alice_wallet_address' }
        }
    }
];
// --- End Definition ---

export const initialComposites: CompositeRecord[] = [
    // Task Assignments (gunka) - Structure: x1=Worker, x2=Task, x3=Project
    {
        pubkey: '@composite/gunka_task1',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/gunka',
            places: { x1: '@person1', x2: '@task1', x3: '@goal1' }
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
        pubkey: '@composite/goal1_cneme_name',
        metadata: { type: 'Composite' },
        data: {
            schemaId: '@schema/cneme',
            places: { x1: '@goal1', x2: '@goal1_name' }
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
            places: { x1: '@task1', x2: '@status_notstarted' }
        }
    },
    // --- Link Tags to Task 1 using ckaji ---
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
    // --- End Tag Links ---
    ...aliceWalletComposites // Add Alice's wallet composites here
];
