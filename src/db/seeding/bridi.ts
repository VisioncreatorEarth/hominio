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
        pubkey: '@bridi_proj1_ckaji_purpose_build',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@prop_purpose', x3: '@purpose_build_website' }
        }
    },
    {
        pubkey: '@bridi_proj1_ckaji_leader_person1',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@prop_leader', x3: '@person1' }
        }
    },
    {
        pubkey: '@bridi_proj1_ckaji_deadline_dec31',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@project1', x2: '@prop_deadline', x3: '@deadline_2024_12_31' }
        }
    },

    // Task Assignments (gunka) - Structure: x1=Worker, x2=Project, x3=Task
    {
        pubkey: '@bridi_gunka_task1',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_gunka',
            sumti: { x1: '@person2', x2: '@project1', x3: '@task1' }
        }
    },
    {
        pubkey: '@bridi_gunka_task2',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_gunka',
            sumti: { x1: '@person1', x2: '@project1', x3: '@task2' }
        }
    },
    {
        pubkey: '@bridi_gunka_task3',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_gunka',
            sumti: { x1: '@person3', x2: '@project1', x3: '@task3' }
        }
    },

    // Task Properties (ckaji: x1=Task, x2=PropType, x3=PropValue)
    {
        pubkey: '@bridi_task1_ckaji_skill_design',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@prop_skill', x3: '@skill_design' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_status_inprogress',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@prop_status', x3: '@status_inprogress' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_priority_high',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@prop_priority', x3: '@priority_high' }
        }
    },
    {
        pubkey: '@bridi_task1_ckaji_tag_frontend',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task1', x2: '@prop_tag', x3: '@tag_frontend' }
        }
    },

    {
        pubkey: '@bridi_task2_ckaji_skill_dev',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@prop_skill', x3: '@skill_dev' }
        }
    },
    {
        pubkey: '@bridi_task2_ckaji_status_notstarted',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@prop_status', x3: '@status_notstarted' }
        }
    },
    {
        pubkey: '@bridi_task2_ckaji_priority_medium',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task2', x2: '@prop_priority', x3: '@priority_medium' }
        }
    },

    {
        pubkey: '@bridi_task3_ckaji_skill_test',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@prop_skill', x3: '@skill_test' }
        }
    },
    {
        pubkey: '@bridi_task3_ckaji_status_notstarted',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@prop_status', x3: '@status_notstarted' }
        }
    },
    {
        pubkey: '@bridi_task3_ckaji_tag_qa',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_ckaji',
            sumti: { x1: '@task3', x2: '@prop_tag', x3: '@tag_qa' }
        }
    },

    // Person Name links (using @selbri_cneme: x1=Person, x2=Name Sumti)
    {
        pubkey: '@bridi_person1_cneme_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_cneme',
            sumti: { x1: '@person1', x2: '@person1_name' }
        }
    },
    {
        pubkey: '@bridi_person2_cneme_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_cneme',
            sumti: { x1: '@person2', x2: '@person2_name' }
        }
    },
    {
        pubkey: '@bridi_person3_cneme_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_cneme',
            sumti: { x1: '@person3', x2: '@person3_name' }
        }
    },

    // Name Bridi for Entities (using @selbri_cneme: x1=Entity, x2=Name Sumti)
    {
        pubkey: '@bridi_proj1_cneme_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_cneme',
            sumti: { x1: '@project1', x2: '@project1_name' }
        }
    },
    {
        pubkey: '@bridi_task1_cneme_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_cneme',
            sumti: { x1: '@task1', x2: '@task1_name' }
        }
    },
    {
        pubkey: '@bridi_task2_cneme_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_cneme',
            sumti: { x1: '@task2', x2: '@task2_name' }
        }
    },
    {
        pubkey: '@bridi_task3_cneme_name',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_cneme',
            sumti: { x1: '@task3', x2: '@task3_name' }
        }
    },

    // Person classification (using @selbri_prenu to classify entities as people)
    {
        pubkey: '@bridi_person1_prenu',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_prenu',
            sumti: { x1: '@person1' }
        }
    },
    {
        pubkey: '@bridi_person2_prenu',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_prenu',
            sumti: { x1: '@person2' }
        }
    },
    {
        pubkey: '@bridi_person3_prenu',
        ckaji: { klesi: 'Bridi' },
        datni: {
            selbri: '@selbri_prenu',
            sumti: { x1: '@person3' }
        }
    },
];
