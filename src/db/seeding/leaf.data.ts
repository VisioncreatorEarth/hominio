import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
        type: 'Leaf'; // Simplified type
    };
    data: LeafValue; // Renamed from datni
}
// --- End Updated Types ---

// --- Updated Data ---
// Define static Leaves first (formerly staticSumti)
const staticLeaves: LeafRecord[] = [
    // Entities (conceptual entities use 'Concept' type)
    {
        pubkey: '@project1',
        metadata: { type: 'Leaf' }, // Updated metadata
        data: { type: 'Concept' }    // Updated data structure and type
    },
    {
        pubkey: '@task1',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@task2',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@task3',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@person1',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@person2',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@person3',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },

    // Property Type Concepts
    {
        pubkey: '@prop_status',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@prop_skill',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@prop_priority',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@prop_tag',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@prop_purpose',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@prop_leader',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@prop_deadline',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@prop_name',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },

    // Property Value Concepts (now use LoroText)
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
    {
        pubkey: '@skill_design',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'design' }
    },
    {
        pubkey: '@skill_dev',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'development' }
    },
    {
        pubkey: '@skill_test',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'testing' }
    },
    {
        pubkey: '@priority_high',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'high' }
    },
    {
        pubkey: '@priority_medium',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'medium' }
    },
    {
        pubkey: '@priority_none',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'none' }
    },
    {
        pubkey: '@tag_frontend',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'frontend' }
    },
    {
        pubkey: '@tag_qa',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'qa' }
    },
    {
        pubkey: '@purpose_build_website',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Build website' }
    },
    {
        pubkey: '@deadline_2024_12_31',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: '2024-12-31' }
    },

    // Method concepts
    {
        pubkey: '@method_agile',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Agile methodology' }
    },
    {
        pubkey: '@method_waterfall',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Waterfall methodology' }
    },
    {
        pubkey: '@method_kanban',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Kanban system' }
    },
    {
        pubkey: '@method_scrum',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Scrum framework' }
    },
    // Generic means
    {
        pubkey: '@means_tasks',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },
    {
        pubkey: '@means_work',
        metadata: { type: 'Leaf' },
        data: { type: 'Concept' }
    },

    // --- Name Leaves for Entities (formerly Name Sumti) ---
    {
        pubkey: '@project1_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Project: Website' }
    },
    {
        pubkey: '@task1_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Task 1' }
    },
    {
        pubkey: '@task2_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Task 2' }
    },
    {
        pubkey: '@task3_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Task 3' }
    },
    {
        pubkey: '@person1_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Alice' }
    },
    {
        pubkey: '@person2_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Bob' }
    },
    {
        pubkey: '@person3_name',
        metadata: { type: 'Leaf' },
        data: { type: 'LoroText', value: 'Charlie' }
    },
];

// --- Dynamic Prompt Leaves ---
const documentationPath = resolve(__dirname, '../documentation');
const promptLeafRecords: LeafRecord[] = []; // Renamed from promptSumtiRecords

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

// Combine static and dynamic Leaves
// Renamed export from initialSumti to initialLeaves
export const initialLeaves: LeafRecord[] = [...staticLeaves, ...promptLeafRecords];
// --- End Updated Data ---
