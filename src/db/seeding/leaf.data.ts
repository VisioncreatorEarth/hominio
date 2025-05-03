// Removed unused imports

// Helper to get __dirname in ES modules
// const __filename = fileURLToPath(import.meta.url); // Commented out as unused
// const __dirname = dirname(__filename); // Commented out as unused

// --- Updated Types ---
export type LeafId = string;
export type Pubkey = string;

export type LeafValueType = 'Concept' | 'LoroMap' | 'LoroText' | 'LoroList' | 'LoroMovableList' | 'LoroTree' | 'Index';

type LeafValueMap = { type: 'LoroMap'; value: Record<string, unknown> };
type LeafValueText = { type: 'LoroText'; value: string };
type LeafValueList = { type: 'LoroList' | 'LoroMovableList'; value: unknown[] };
type LeafValueTree = { type: 'LoroTree'; value: unknown };
type LeafValueConcept = { type: 'Concept' }; // Capitalized
export type LeafValueIndex = { type: 'Index'; value: Record<Pubkey, true> }; // New Index type

export type LeafValue = LeafValueMap | LeafValueText | LeafValueList | LeafValueTree | LeafValueConcept | LeafValueIndex;

export interface LeafRecord {
    pubkey: Pubkey;
    metadata: {
        type: 'Leaf' | 'Index'; // Allow both Leaf and Index types
    };
    data: LeafValue;
}
// --- End Updated Types ---

// --- Updated Data ---
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

// --- Dynamic Prompt Leaves ---
// const documentationPath = resolve(__dirname, '../../../DOCUMENTATION'); // Removed unused const
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
// Renamed export from initialSumti to initialLeaves
export const initialLeaves: LeafRecord[] = [...staticLeaves, ...promptLeafRecords]; // promptLeafRecords will be empty now
// --- End Updated Data ---
