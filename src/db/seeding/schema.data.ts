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
        pubkey: '@schema/zukte', // Updated pubkey
        metadata: { type: 'Schema' },
        data: {
            schemaId: '@schema/zukte', // Self-reference
            name: 'zukte', // from cneme
            places: { x1: 'rutni', x2: 'tutci/carna', x3: 'jidni/fanmo' }, // from sumti
            translations: { // from fanva and stidi
                en: {
                    purpose: 'Represents volitional action towards a specific goal. Connects an agent, their method, and their aim.',
                    prompt: `
*Details:*
    - x1: Must be capable of intention (person, group, AI, company).
    - x2: Can be an action, a tool, a strategy, a resource, or even a concept representing the means.
    - x3: The intended outcome or state the agent x1 aims to achieve through means x2.
*Usage Examples:*
    1. Simple Action: 'zukte(@person1, @method_agile, @purpose_build_website)' -> Person1 uses Agile methodology for the purpose of building the website.
    2. Tool Usage: 'zukte(@coder_bot, @tool_compiler, @purpose_check_code)' -> The coder bot uses the compiler tool for the purpose of checking the code.
    3. Abstract Means: 'zukte(@marketing_team, @strategy_social_media, @purpose_increase_engagement)' -> The marketing team employs the social media strategy for the purpose of increasing engagement.
    4. Omitted Purpose: 'zukte(@researcher, @method_experiment)' -> The researcher employs the experimental method (purpose implied or unknown).
                    `,
                    places: {
                        x1: { title: 'agent', description: 'volitional entity (agent/person/organization)' },
                        x2: { title: 'means/action', description: 'method/process' },
                        x3: { title: 'purpose/goal', description: 'objective/desired outcome' }
                    }
                },
                de: {
                    purpose: 'Repräsentiert willentliche Handlung auf ein spezifisches Ziel hin. Verbindet einen Akteur, seine Methode und sein Ziel.',
                    prompt: `
*Details:*
    - x1: Muss fähig zur Absicht sein (Person, Gruppe, KI, Firma).
    - x2: Kann eine Aktion, ein Werkzeug, eine Strategie, eine Ressource oder sogar ein Konzept sein, das die Mittel darstellt.
    - x3: Das beabsichtigte Ergebnis oder der Zustand, den der Akteur x1 durch Mittel x2 erreichen möchte.
*Anwendungsbeispiele:*
    1. Einfache Aktion: 'zukte(@person1, @method_agile, @purpose_build_website)' -> Person1 nutzt die Agile-Methodik zum Zweck des Website-Baus.
    2. Werkzeugnutzung: 'zukte(@coder_bot, @tool_compiler, @purpose_check_code)' -> Der Coder-Bot nutzt das Compiler-Werkzeug zum Zweck der Code-Überprüfung.
    3. Abstrakte Mittel: 'zukte(@marketing_team, @strategy_social_media, @purpose_increase_engagement)' -> Das Marketingteam setzt die Social-Media-Strategie zum Zweck der Engagement-Steigerung ein.
    4. Fehlender Zweck: 'zukte(@researcher, @method_experiment)' -> Der Forscher setzt die experimentelle Methode ein (Zweck impliziert oder unbekannt).
                    `,
                    places: {
                        x1: { title: 'Akteur', description: 'Akteur/Handelnder/Organisation' },
                        x2: { title: 'Mittel/Aktion', description: 'Methode/Prozess' },
                        x3: { title: 'Zweck/Ziel', description: 'Ergebnis' }
                    }
                }
            }
        }
    },
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
        pubkey: '@schema/ckaji', // Updated pubkey
        metadata: { type: 'Schema' },
        data: {
            schemaId: '@schema/ckaji',
            name: 'ckaji',
            places: { x1: 'selci\'a', x2: 'selckaji' },
            translations: {
                en: {
                    purpose: 'Assigns a property or characteristic to an entity. Fundamental for description.',
                    prompt: `
*Details:*
    - x1: The thing being described (object, person, concept, event).
    - x2: The property, attribute, quality, or state being assigned to x1. Can be a concept or a value.
*Usage Examples:*
    1. Simple Property: 'ckaji(@task1, @status_inprogress)' -> Task 1 has the property 'in-progress status'.
    2. Intrinsic Quality: 'ckaji(@sky, @color_blue)' -> The sky has the quality 'blue color'. (Assuming @color_blue exists)
    3. Linking Name: 'ckaji(@person1, @person1_name)' -> Person 1 has the property 'Name: Alice'. (Connects entity to its name node)
    4. Abstract Concept: 'ckaji(@philosophy_stoicism, @trait_resilience)' -> The philosophy of Stoicism has the characteristic 'resilience'.
                    `,
                    places: {
                        x1: { title: 'entity', description: 'object/concept being characterized' },
                        x2: { title: 'property/characteristic', description: 'value concept or attribute' }
                    }
                },
                de: {
                    purpose: 'Weist einer Entität eine Eigenschaft oder ein Merkmal zu. Grundlegend für Beschreibungen.',
                    prompt: `
*Details:*
    - x1: Das zu beschreibende Ding (Objekt, Person, Konzept, Ereignis).
    - x2: Die Eigenschaft, das Attribut, die Qualität oder der Zustand, der x1 zugewiesen wird. Kann ein Konzept oder ein Wert sein.
*Anwendungsbeispiele:*
    1. Einfache Eigenschaft: 'ckaji(@task1, @status_inprogress)' -> Aufgabe 1 hat die Eigenschaft 'Status: in Bearbeitung'.
    2. Intrinsische Qualität: 'ckaji(@sky, @color_blue)' -> Der Himmel hat die Qualität 'Farbe: blau'. (Angenommen @color_blue existiert)
    3. Namen verknüpfen: 'ckaji(@person1, @person1_name)' -> Person 1 hat die Eigenschaft 'Name: Alice'. (Verbindet Entität mit ihrem Namensknoten)
    4. Abstraktes Konzept: 'ckaji(@philosophy_stoicism, @trait_resilience)' -> Die Philosophie des Stoizismus hat das Merkmal 'Resilienz'.
                    `,
                    places: {
                        x1: { title: 'Entität', description: 'Objekt/Konzept' },
                        x2: { title: 'Eigenschaft/Merkmal', description: 'Attribut' }
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
                        x1: { title: 'entity being named', description: '' },
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
                        x1: { title: 'Entität die benannt wird', description: '' },
                        x2: { title: 'Namens-Leaf', description: '(Leaf, der den Namenstext enthält)' }
                    }
                }
            }
        }
    }
];
