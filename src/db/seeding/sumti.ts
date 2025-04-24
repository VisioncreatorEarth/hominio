import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type SumtiId = string;
export type Pubkey = string;
export type SumtiValueKlesi = 'concept' | 'LoroMap' | 'LoroText' | 'LoroList' | 'LoroMovableList' | 'LoroTree';

type SumtiValueMap = { klesi: 'LoroMap'; vasru: Record<string, unknown> };
type SumtiValueText = { klesi: 'LoroText'; vasru: string };
type SumtiValueList = { klesi: 'LoroList' | 'LoroMovableList'; vasru: unknown[] };
type SumtiValueTree = { klesi: 'LoroTree'; vasru: unknown };
type SumtiValueConcept = { klesi: 'concept' };

export type SumtiValue = SumtiValueMap | SumtiValueText | SumtiValueList | SumtiValueTree | SumtiValueConcept;

export interface SumtiRecord {
    pubkey: Pubkey;
    ckaji: {
        klesi: 'Sumti' | 'Facki';
        cmene?: string;
    };
    datni: SumtiValue;
}

// Define static Sumti first
const staticSumti: SumtiRecord[] = [
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

    // Property Type Concepts
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
    {
        pubkey: '@prop_name',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'concept' }
    },

    // Property Value Concepts
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

    // Method concepts
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
    // Generic means
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

    // --- Name Sumti for Entities ---
    {
        pubkey: '@project1_name',
        ckaji: {
            klesi: 'Sumti'
        },
        datni: { klesi: 'LoroText', vasru: 'Project: Website' }
    },
    {
        pubkey: '@task1_name',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Task 1' }
    },
    {
        pubkey: '@task2_name',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Task 2' }
    },
    {
        pubkey: '@task3_name',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Task 3' }
    },
    {
        pubkey: '@person1_name',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Alice' }
    },
    {
        pubkey: '@person2_name',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Bob' }
    },
    {
        pubkey: '@person3_name',
        ckaji: { klesi: 'Sumti' },
        datni: { klesi: 'LoroText', vasru: 'Charlie' }
    },
];

const documentationPath = resolve(__dirname, '../documentation');
const promptSumtiRecords: SumtiRecord[] = [];

try {
    const files = readdirSync(documentationPath);
    const markdownFiles = files.filter(file => file.endsWith('.md'));

    for (const fileName of markdownFiles) {
        const filePath = resolve(documentationPath, fileName);
        const fileBaseName = parse(fileName).name; // Get filename without extension
        const pubkey = `@prompt_${fileBaseName.replace(/\s+/g, '_').toLowerCase()}`; // Create pubkey like @prompt_filename

        try {
            const content = readFileSync(filePath, 'utf-8');
            promptSumtiRecords.push({
                pubkey: pubkey,
                ckaji: { klesi: 'Sumti' }, // Treat prompts like named Sumti
                datni: {
                    klesi: 'LoroText',
                    vasru: content
                }
            });
            console.log(`Loaded prompt Sumti: ${pubkey}`);
        } catch (readError) {
            console.error(`Error reading prompt file at ${filePath}:`, readError);
            // Optionally create an error Sumti or skip
            promptSumtiRecords.push({
                pubkey: pubkey,
                ckaji: { klesi: 'Sumti' },
                datni: {
                    klesi: 'LoroText',
                    vasru: `# Error: Could not load content for ${fileName}.`
                }
            });
        }
    }
} catch (dirError) {
    console.error(`Error reading documentation directory at ${documentationPath}:`, dirError);
    // Handle the error appropriately, e.g., by adding a single error Sumti
    promptSumtiRecords.push({
        pubkey: '@prompt_load_error',
        ckaji: { klesi: 'Sumti' },
        datni: {
            klesi: 'LoroText',
            vasru: `# Error: Could not read documentation directory at ${documentationPath}.`
        }
    });
}

// Combine static and dynamic Sumti
export const initialSumti: SumtiRecord[] = [...staticSumti, ...promptSumtiRecords]; // Combine both arrays
