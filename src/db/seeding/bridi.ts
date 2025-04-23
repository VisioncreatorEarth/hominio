import type { SumtiId } from './sumti';

export type BridiId = string;

export interface BridiRecord {
    pubkey: BridiId;
    ckaji: {
        klesi: 'Bridi';
    };
    datni: {
        selbri: string;
        sumti: {
            x1?: SumtiId;
            x2?: SumtiId;
            x3?: SumtiId;
            x4?: SumtiId;
            x5?: SumtiId;
        };
    };
}

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

    // Name Bridi for Entities
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
