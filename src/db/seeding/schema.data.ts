export type SchemaId = string;

// Represents documentation for a single place (x1-x5) within a specific language
export interface SchemaPlaceTranslation {
    title: string;       // Short, user-facing label (e.g., "worker", "Akteur")
    description: string; // Longer explanation of the place's role.
}

// Represents all documentation for a schema within a specific language
export interface SchemaLanguageTranslation {
    purpose?: string;    // High-level purpose/goal of the schema itself.
    prompt?: string;     // Contains usage examples and AI guidance.
    places: {
        x1?: SchemaPlaceTranslation;
        x2?: SchemaPlaceTranslation;
        x3?: SchemaPlaceTranslation;
        x4?: SchemaPlaceTranslation;
        x5?: SchemaPlaceTranslation;
    };
}

// The main proposed SchemaRecord structure
export interface SchemaRecord {
    pubkey: SchemaId;
    metadata: {          // RENAMED from ckaji
        type: 'Schema';   // RENAMED from klesi. Represents a Schema template.
    };
    data: {              // RENAMED from datni
        schemaId: SchemaId; // RENAMED from selbri/gismu (Reference to its own pubkey)
        name: string;    // RENAMED from cneme. The canonical gismu name (e.g., "zukte", "gunka")
        places: {        // RENAMED from sumti
            x1?: string; // Original Lojban variable name (e.g., 'rutni')
            x2?: string;
            x3?: string;
            x4?: string;
            x5?: string;
        };
        translations: {  // RENAMED from stidi
            en?: SchemaLanguageTranslation;
            de?: SchemaLanguageTranslation;
            // [languageCode: string]: SchemaLanguageTranslation; // Allow others if needed
        };
    }
}

// Renamed from initialSelbri
export const initialSchemas: SchemaRecord[] = [
    {
        pubkey: '@schema/gunka', // Updated pubkey
        metadata: { type: 'Schema' },
        data: {
            schemaId: '@schema/gunka',
            name: 'gunka',
            places: { x1: 'panka', x2: 'kandi/zukte', x3: 'jidni/kulnu zukte' },
            translations: {
                en: {
                    purpose: 'Describes the relationship between a worker, the specific task they are doing, and the larger context or goal it serves.',
                    prompt: `
*Details:*
    - x1: The agent performing the work (person, team, bot).
    - x2: The specific activity, task, or function being performed. Often a sub-component of x3.
    - x3: The larger project, goal, or reason for the work x2. Provides context.
*Usage Examples:*
    1. Task Assignment: 'gunka(@person2, @task1, @project1)' -> Person2 works on Task 1 for Project 1.
    2. Role Function: 'gunka(@support_agent, @duty_answer_calls, @dept_customer_service)' -> The support agent performs the duty of answering calls for the customer service department.
    3. Automated Process: 'gunka(@backup_script, @process_copy_files, @goal_data_redundancy)' -> The backup script performs the process of copying files for the goal of data redundancy.
    4. Omitted Goal: 'gunka(@artist, @activity_painting)' -> The artist works on the activity of painting (overall project/goal unspecified).
                    `,
                    places: {
                        x1: { title: 'worker', description: 'person/agent who performs the task' },
                        x2: { title: 'activity/task', description: 'specific work item being performed' },
                        x3: { title: 'goal/objective', description: 'project or higher-level purpose' }
                    }
                },
                de: {
                    purpose: 'Beschreibt die Beziehung zwischen einem Arbeiter, der spezifischen Aufgabe, die er ausführt, und dem größeren Kontext oder Ziel, dem sie dient.',
                    prompt: `
*Details:*
    - x1: Der Akteur, der die Arbeit ausführt (Person, Team, Bot).
    - x2: Die spezifische Aktivität, Aufgabe oder Funktion, die ausgeführt wird. Oft eine Teilkomponente von x3.
    - x3: Das größere Projekt, Ziel oder der Grund für die Arbeit x2. Gibt Kontext.
*Anwendungsbeispiele:*
    1. Aufgaben Zuweisung: 'gunka(@person2, @task1, @project1)' -> Person2 arbeitet an Aufgabe 1 für Projekt 1.
    2. Rollenfunktion: 'gunka(@support_agent, @duty_answer_calls, @dept_customer_service)' -> Der Support-Mitarbeiter erfüllt die Pflicht des Anrufannahme für die Kundendienstabteilung.
    3. Automatisierter Prozess: 'gunka(@backup_script, @process_copy_files, @goal_data_redundancy)' -> Das Backup-Skript führt den Prozess des Dateikopierens zum Ziel der Datenredundanz aus.
    4. Fehlendes Ziel: 'gunka(@artist, @activity_painting)' -> Der Künstler arbeitet an der Aktivität des Malens (Gesamtprojekt/Ziel unspezifiziert).
                    `,
                    places: {
                        x1: { title: 'Arbeiter', description: 'Bearbeiter' },
                        x2: { title: 'Aktivität/Aufgabe', description: '' }, // Note: German description was empty
                        x3: { title: 'Ziel/Projekt', description: 'Zweck' }
                    }
                }
            }
        }
    },
    {
        pubkey: '@schema/prenu', // Updated pubkey
        metadata: { type: 'Schema' },
        data: {
            schemaId: '@schema/prenu',
            name: 'prenu',
            places: { x1: 'remna' },
            translations: {
                en: {
                    purpose: "Classifies an entity as belonging to the category 'person'.",
                    prompt: `
*Details:*
    - x1: The entity being identified as a person.
*Usage Examples:*
    1. Direct Classification: 'prenu(@person1)' -> The entity identified by @person1 is a person.
    2. Type Check: Used implicitly in queries or rules, e.g., "Find all x1 such that 'prenu(x1)' and 'gunka(x1, @task_management, @project_alpha)'."
    3. Distinguishing from non-persons: Helps differentiate human agents from bots or organizations in complex models. Example: 'prenu(@alice)' vs 'organization(@corp_x)'
                    `,
                    places: {
                        x1: { title: 'person', description: 'human individual' }
                    }
                },
                de: {
                    purpose: "Klassifiziert eine Entität als zur Kategorie 'Person' gehörig.",
                    prompt: `
*Details:*
    - x1: Die Entität, die als Person identifiziert wird.
*Anwendungsbeispiele:*
    1. Direkte Klassifizierung: 'prenu(@person1)' -> Die durch @person1 identifizierte Entität ist eine Person.
    2. Typüberprüfung: Wird implizit in Abfragen oder Regeln verwendet, z.B. "Finde alle x1, sodass 'prenu(x1)' und 'gunka(x1, @task_management, @project_alpha)'."
    3. Unterscheidung von Nicht-Personen: Hilft bei der Unterscheidung menschlicher Akteure von Bots oder Organisationen in komplexen Modellen. Beispiel: 'prenu(@alice)' vs 'organization(@corp_x)'
                    `,
                    places: {
                        x1: { title: 'Person', description: 'Mensch' }
                    }
                }
            }
        }
    },
    {
        pubkey: '@schema/cneme', // Updated pubkey
        metadata: { type: 'Schema' },
        data: {
            schemaId: '@schema/cneme',
            name: 'cneme',
            places: { x1: 'selci\'a', x2: 'cmene' }, // Original Lojban place descriptors
            translations: {
                en: {
                    purpose: "Specifically links an entity (Leaf x1) to its corresponding name Leaf (x2).",
                    prompt: `
*Details:*
    - x1: The entity (person, project, task, etc.).
    - x2: The Leaf whose 'data.value' contains the actual name string.
*Usage Examples:*
    1. Linking Person Name: 'cneme(@person1, @person1_name)' -> Links person1 to the Leaf containing "Alice".
    2. Linking Project Name: 'cneme(@project1, @project1_name)' -> Links project1 to the Leaf containing "Project: Website".
                    `,
                    places: {
                        x1: { title: 'concept', description: 'Concept being named' },
                        x2: { title: 'name leaf', description: '(Leaf containing the name string)' }
                    }
                },
                de: {
                    purpose: "Verknüpft spezifisch eine Entität (Leaf x1) mit ihrem entsprechenden Namens-Leaf (x2).",
                    prompt: `
*Details:*
    - x1: Die Entität (Person, Projekt, Aufgabe usw.).
    - x2: Das Leaf, dessen 'data.value' den tatsächlichen Namenstext enthält.
*Anwendungsbeispiele:*
    1. Verknüpfung Personenname: 'cneme(@person1, @person1_name)' -> Verknüpft person1 mit dem Leaf, das "Alice" enthält.
    2. Verknüpfung Projektname: 'cneme(@project1, @project1_name)' -> Verknüpft project1 mit dem Leaf, das "Project: Website" enthält.
                    `,
                    places: {
                        x1: { title: 'Concept', description: 'concept being named' },
                        x2: { title: 'Namens-Leaf', description: '(Leaf, der den Namenstext enthält)' }
                    }
                }
            }
        }
    },
    {
        pubkey: '@schema/tcini',
        metadata: { type: 'Schema' },
        data: {
            schemaId: '@schema/tcini',
            name: 'tcini',
            places: { x1: 'selcia', x2: 'seltcini' }, // Corrected Lojban place strings
            translations: {
                en: {
                    purpose: 'Represents the condition or state of an entity.',
                    prompt: `
*Details:*
    - x1: The entity whose state is being described (e.g., task, project).
    - x2: The Leaf representing the specific condition or status (e.g., @status_inprogress, @status_completed).
*Usage Examples:*
    1. Task Status: 'tcini(@task1, @status_inprogress)' -> Task 1 has the status 'in-progress'.
    2. Project Condition: 'tcini(@project_alpha, @status_active)' -> Project Alpha has the condition 'active'.
                    `,
                    places: {
                        x1: { title: 'entity', description: 'The item whose state is described.' },
                        x2: { title: 'condition/status', description: 'The Leaf representing the state.' }
                    }
                },
                de: {
                    purpose: 'Repräsentiert den Zustand oder Status einer Entität.',
                    prompt: `
*Details:*
    - x1: Die Entität, deren Zustand beschrieben wird (z. B. Aufgabe, Projekt).
    - x2: Das Leaf, das den spezifischen Zustand oder Status repräsentiert (z. B. @status_inprogress, @status_completed).
*Anwendungsbeispiele:*
    1. Aufgabenstatus: 'tcini(@task1, @status_inprogress)' -> Aufgabe 1 hat den Status 'in Bearbeitung'.
    2. Projektzustand: 'tcini(@project_alpha, @status_active)' -> Projekt Alpha hat den Zustand 'aktiv'.
                    `,
                    places: {
                        x1: { title: 'Entität', description: 'Das Element, dessen Zustand beschrieben wird.' },
                        x2: { title: 'Zustand/Status', description: 'Das Leaf, das den Zustand repräsentiert.' }
                    }
                }
            }
        }
    }
];
