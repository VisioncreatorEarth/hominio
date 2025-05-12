// Types moved to hominio-types.ts

// Import necessary types from the new central file
import type { LeafId, Pubkey, LeafValueType, LeafValue, LeafValueIndex, LeafRecord } from '$lib/KERNEL/hominio-types'; // Corrected Path
// Re-export types that might be used by other modules
export type { LeafId, Pubkey, LeafValueType, LeafValue, LeafValueIndex, LeafRecord };

// NO TYPE DEFINITIONS SHOULD BE HERE

// --- Updated Data --- (Keep data definitions)
// Define static Leaves first
const staticLeaves: LeafRecord[] = [
    // Entities (conceptual entities use 'Concept' type)
    {
        pubkey: '@goal1',
        metadata: { type: 'Leaf' }, // Updated metadata
        data: { type: 'Concept' }    // Updated data structure and type
    },
    {
        pubkey: '@task1',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@person1',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },

    // Property Value Concepts (now use LoroText)
    // Keep Status values
    {
        pubkey: '@status_inprogress',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'in-progress' } // Updated data structure
    },
    {
        pubkey: '@status_notstarted',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'not-started' }
    },
    {
        pubkey: '@status_completed',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'completed' }
    },

    // --- Name Leaves for Entities  ---
    {
        pubkey: '@goal1_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: "Learn Homino Query Language" }
    },
    {
        pubkey: '@task1_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Task 1' }
    },
    {
        pubkey: '@person1_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Alice' }
    },
    // --- NEW: Tag Leaves ---
    {
        pubkey: '@tag/urgent',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'urgent' }
    },
    {
        pubkey: '@tag/frontend',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'frontend' }
    }
    // --- END NEW TAGS ---
];

// --- Alice's Wallet related Leaves ---
const aliceWalletLeaves: LeafRecord[] = [
    // 1. The Wallet Concept Leaf (identifies the wallet as an entity)
    {
        pubkey: '@alice_wallet_concept', // New pubkey for Alice's wallet concept
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    // 2. The Wallet Address Leaf (stores the actual address string)
    {
        pubkey: '@alice_wallet_address', // New pubkey for Alice's wallet address
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: '0xAliceWalletAddress123abcDEF' } // Example Address
    }
];

// --- Dynamic Prompt Leaves ---
const promptLeafRecords: LeafRecord[] = []; // Renamed from promptSumtiRecords

/* <<< COMMENTED OUT DYNAMIC PROMPT LOADING
try {
    const files = readdirSync(documentationPath);
    const markdownFiles = files.filter(file => file.endsWith('.md'));

    for (const fileName of markdownFiles) {
        const filePath = resolve(documentationPath, fileName);
        const fileBaseName = parse(fileName).name; // Get filename without extension
        const pubkey = `@prompt/${fileBaseName.replace(/\s+/g, '_').toLowerCase()}`; // Updated pubkey format

        try {
            const content = readFileSync(filePath, 'utf-8');
            promptLeafRecords.push({
                pubkey: pubkey,
                metadata: { type: 'Leaf' }, // Updated metadata
                data: {                      // Updated data structure
                    type: 'LoroText',
                    value: content
                }
            });
            console.log(`Loaded prompt Leaf: ${pubkey}`);
        } catch (readError) {
            console.error(`Error reading prompt file at ${filePath}:`, readError);
            // Optionally create an error Leaf or skip
            promptLeafRecords.push({
                pubkey: pubkey,
                metadata: { type: 'Leaf' },
                data: {
                    type: 'LoroText',
                    value: `# Error: Could not load content for ${fileName}.`
                }
            });
        }
    }
} catch (dirError) {
    console.error(`Error reading documentation directory at ${documentationPath}:`, dirError);
    // Handle the error appropriately, e.g., by adding a single error Leaf
    promptLeafRecords.push({
        pubkey: '@prompt/load_error', // Updated pubkey format
        metadata: { type: 'Leaf' },
        data: {
            type: 'LoroText',
            value: `# Error: Could not read documentation directory at ${documentationPath}.`
        }
    });
}
>>> COMMENTED OUT DYNAMIC PROMPT LOADING */

// Combine static and dynamic Leaves
export const initialLeaves: LeafRecord[] = [
    ...staticLeaves,
    ...aliceWalletLeaves, // Add Alice's wallet leaves
    ...promptLeafRecords
];
// --- End Updated Data ---
