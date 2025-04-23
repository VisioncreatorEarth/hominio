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
        datni: { klesi: 'LoroText', vasru: 'Charlie' }
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

    // --- Name Sumti for Entities (Remain klesi: 'Sumti') ---
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

    // --- ADD AI Prompt Sumti ---
    {
        pubkey: '@prompt_loro_hql_syntax',
        ckaji: { klesi: 'Sumti' }, // Treat prompts like named Sumti for now
        datni: {
            klesi: 'LoroText',
            vasru: `# LORO_HQL Query Language Guide for AI

This guide explains how to construct LORO_HQL queries based on user requests. The query is always a JSON object with 'from' and 'map' keys.

## 1. \`from\` Clause (Starting Points)

*   **Purpose:** Specifies the initial set of nodes (Sumti or Selbri) from which the query begins.
*   **Keys:**
    *   \`sumti_pubkeys: string[]\`: An array of Pubkeys for the initial Sumti nodes.
    *   \`selbri_pubkeys: string[]\`: An array of Pubkeys for the initial Selbri definition nodes.
*   **Example:** \`from: { sumti_pubkeys: ['@project1', '/p/task5'] }\`

## 2. \`map\` Clause (Output Structure)

*   **Purpose:** Defines the structure of the JSON object(s) returned for *each* node specified in the \`from\` clause.
*   **Structure:** A JSON object where keys are the desired output field names, and values define how to get the data.
*   **Value Types:**
    *   \`{ field: 'doc.pubkey' }\`: Extracts the **external pubkey** of the current document (the one passed from the outside, not necessarily stored inside).
    *   \`{ field: 'self.<path>' }\`: Directly extracts a value from the current node's internal data (\`self\`). Paths navigate the node's Loro structure (e.g., \`self.datni.vasru\`, \`self.datni.cneme\`, \`self.datni.sumti.x1\`). Note: \`self.ckaji.pubkey\` is deprecated; use \`doc.pubkey\` instead.
    *   \`{ traverse: { ... } }\`: Follows relationships (Bridi) to related nodes. See Section 3.
    *   \`{ /* Nested Map Object */ }\`: Allows creating nested JSON objects in the output.

## 3. \`traverse\` Directive (Following Relationships)

*   **Purpose:** Navigates from the current node to related nodes via Bridi relationships. Used as the value in a \`map\` entry.
*   **Core Keys:**
    *   \`bridi_where: { selbri: string, place: string }\`: Identifies the relationship type (\`selbri\` Pubkey) and the place *this current node* occupies in that relationship (e.g., 'x1', 'x2').
    *   \`return: 'first' | 'array'\`: Specifies whether to return only the first related node found or all related nodes as an array.
    *   \`map: { ... }\`: Defines the output structure for *each related node found* by the traversal. Uses the same structure as the top-level \`map\`, including \`field\` and nested \`traverse\`. **Crucially, within this nested \`map\`, the \`place\` specified in \`field\` or \`bridi_where\` refers to the place of the *target related node* within the *connecting Bridi*.**
*   **Optional Keys:**
    *   \`where_related: [{ place: string, field: string, condition: { ... } }]\`: Filters the related nodes based on their properties *before* they are processed by the nested \`map\`. \`place\` refers to the related node's position in the Bridi. \`condition\` examples: \`{ in: [...] }\`, \`{ eq: 'value' }\`. Use \`doc.pubkey\` here instead of \`self.ckaji.pubkey\`.

## 4. Special Map Keys (within \`map\` or nested \`map\`)\n\n*   \`_value\`: If used as a key, the engine extracts the single value defined by its corresponding directive (e.g., \`{ field: 'self.datni.vasru' }\`) and uses *that value directly* instead of creating a key-value pair. Useful for returning primitive values directly.\n*   \`_tag\`: Similar to \`_value\`, but used when \`return: 'array'\`. Extracts the single value for each related item and adds it directly to the output array, rather than creating an array of objects.\n\n## Example Inference\n\n*   User: "What is the status of Task 1?"\n    *   Infer: Start \`from\` \`@task1\`. Need a property -> \`ckaji\`. Status is a specific type of property.\n    *   Query Thought: Traverse from \`@task1\` via \`ckaji\` where \`@task1\` is \`x1\`. Find the related node (\`x2\`) that represents status (e.g., \`@status_inprogress\`). Extract its value (\`vasru\`).\n*   User: "Who works on Project Website?"\n    *   Infer: Start \`from\` \`@project_website\`. Need workers -> \`gunka\`. Project is \`x3\` in \`gunka\`. Workers are \`x1\`. Get worker ID.\n    *   Query Thought: Traverse from \`@project_website\` via \`gunka\` where project is \`x3\`. For each result, map the node at place \`x1\` (the worker) using \`doc.pubkey\` to get the worker's ID. Potentially traverse again from the worker node to get their name via \`ckaji\`.\n\nUse the Selbri definitions provided to understand the place structures (\`x1\`, \`x2\`, etc.) for specific relationships (\`zukte\`, \`gunka\`, \`ckaji\`). Remember to use \`doc.pubkey\` for IDs.`
        }
    },
];
