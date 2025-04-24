export type SelbriId = string;

type SelbriPlaceTranslations = Record<string, string>;
type SelbriTranslationMap = Record<string, SelbriPlaceTranslations>;

export interface SelbriRecord {
    pubkey: SelbriId;
    ckaji: {
        klesi: 'Selbri';
    };
    datni: {
        selbri: SelbriId;
        cneme: string;
        sumti: {
            x1?: string;
            x2?: string;
            x3?: string;
            x4?: string;
            x5?: string;
        };
        fanva?: SelbriTranslationMap;
        stidi?: Record<string, string>;
    }
}

export const initialSelbri: SelbriRecord[] = [
    {
        pubkey: '@selbri_zukte',
        ckaji: { klesi: 'Selbri' },
        datni: {
            selbri: '@selbri_zukte',
            cneme: 'zukte',
            sumti: { x1: 'rutni', x2: 'tutci/carna', x3: 'jidni/fanmo' },
            fanva: {
                glico: {
                    x1: 'volitional entity (agent/person/organization)',
                    x2: 'means/action (method/process)',
                    x3: 'purpose/goal (objective/desired outcome)'
                },
                dotco: {
                    x1: 'Akteur/Handelnder/Organisation',
                    x2: 'Mittel/Aktion/Methode/Prozess',
                    x3: 'Zweck/Ziel/Ergebnis'
                }
            },
            stidi: {
                glico: `
                **zukte (x1, x2, x3)**: x1 (agent) acts/employs means x2 (action/method) for purpose x3 (goal/objective).
                *Purpose:* Represents volitional action towards a specific goal. Connects an agent, their method, and their aim.
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
                dotco: `
                **zukte (x1, x2, x3)**: x1 (Akteur) handelt/setzt Mittel x2 (Aktion/Methode) für Zweck x3 (Ziel/Absicht) ein.
                *Zweck:* Repräsentiert willentliche Handlung auf ein spezifisches Ziel hin. Verbindet einen Akteur, seine Methode und sein Ziel.
                *Details:*
                    - x1: Muss fähig zur Absicht sein (Person, Gruppe, KI, Firma).
                    - x2: Kann eine Aktion, ein Werkzeug, eine Strategie, eine Ressource oder sogar ein Konzept sein, das die Mittel darstellt.
                    - x3: Das beabsichtigte Ergebnis oder der Zustand, den der Akteur x1 durch Mittel x2 erreichen möchte.
                *Anwendungsbeispiele:*
                    1. Einfache Aktion: 'zukte(@person1, @method_agile, @purpose_build_website)' -> Person1 nutzt die Agile-Methodik zum Zweck des Website-Baus.
                    2. Werkzeugnutzung: 'zukte(@coder_bot, @tool_compiler, @purpose_check_code)' -> Der Coder-Bot nutzt das Compiler-Werkzeug zum Zweck der Code-Überprüfung.
                    3. Abstrakte Mittel: 'zukte(@marketing_team, @strategy_social_media, @purpose_increase_engagement)' -> Das Marketingteam setzt die Social-Media-Strategie zum Zweck der Engagement-Steigerung ein.
                    4. Fehlender Zweck: 'zukte(@researcher, @method_experiment)' -> Der Forscher setzt die experimentelle Methode ein (Zweck impliziert oder unbekannt).
                `
            }
        }
    },
    {
        pubkey: '@selbri_gunka',
        ckaji: { klesi: 'Selbri' },
        datni: {
            selbri: '@selbri_gunka',
            cneme: 'gunka',
            sumti: { x1: 'panka', x2: 'kandi/zukte', x3: 'jidni/kulnu zukte' },
            fanva: {
                glico: {
                    x1: 'worker (person/agent who performs the task)',
                    x2: 'activity/task (specific work item being performed)',
                    x3: 'goal/objective (project or higher-level purpose)'
                },
                dotco: {
                    x1: 'Arbeiter/Bearbeiter',
                    x2: 'Aktivität/Aufgabe',
                    x3: 'Ziel/Projekt/Zweck'
                }
            },
            stidi: {
                glico: `
                **gunka (x1, x2, x3)**: x1 (worker) works on/performs activity x2 (task/job) for purpose/project x3 (goal).
                *Purpose:* Describes the relationship between a worker, the specific task they are doing, and the larger context or goal it serves.
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
                dotco: `
                **gunka (x1, x2, x3)**: x1 (Arbeiter) arbeitet an/führt Aktivität x2 (Aufgabe/Job) für Zweck/Projekt x3 (Ziel) aus.
                *Zweck:* Beschreibt die Beziehung zwischen einem Arbeiter, der spezifischen Aufgabe, die er ausführt, und dem größeren Kontext oder Ziel, dem sie dient.
                *Details:*
                    - x1: Der Akteur, der die Arbeit ausführt (Person, Team, Bot).
                    - x2: Die spezifische Aktivität, Aufgabe oder Funktion, die ausgeführt wird. Oft eine Teilkomponente von x3.
                    - x3: Das größere Projekt, Ziel oder der Grund für die Arbeit x2. Gibt Kontext.
                *Anwendungsbeispiele:*
                    1. Aufgaben Zuweisung: 'gunka(@person2, @task1, @project1)' -> Person2 arbeitet an Aufgabe 1 für Projekt 1.
                    2. Rollenfunktion: 'gunka(@support_agent, @duty_answer_calls, @dept_customer_service)' -> Der Support-Mitarbeiter erfüllt die Pflicht des Anrufannahme für die Kundendienstabteilung.
                    3. Automatisierter Prozess: 'gunka(@backup_script, @process_copy_files, @goal_data_redundancy)' -> Das Backup-Skript führt den Prozess des Dateikopierens zum Ziel der Datenredundanz aus.
                    4. Fehlendes Ziel: 'gunka(@artist, @activity_painting)' -> Der Künstler arbeitet an der Aktivität des Malens (Gesamtprojekt/Ziel unspezifiziert).
                `
            }
        }
    },
    {
        pubkey: '@selbri_ckaji',
        ckaji: { klesi: 'Selbri' },
        datni: {
            selbri: '@selbri_ckaji',
            cneme: 'ckaji',
            sumti: { x1: 'selci\'a', x2: 'selckaji' },
            fanva: {
                glico: {
                    x1: 'entity (object/concept being characterized)',
                    x2: 'property/characteristic (value concept or attribute)'
                },
                dotco: {
                    x1: 'Entität/Objekt/Konzept',
                    x2: 'Eigenschaft/Merkmal/Attribut'
                }
            },
            stidi: {
                glico: `
                **ckaji (x1, x2)**: x1 (entity) has the quality/characteristic x2 (property).
                *Purpose:* Assigns a property or characteristic to an entity. Fundamental for description.
                *Details:*
                    - x1: The thing being described (object, person, concept, event).
                    - x2: The property, attribute, quality, or state being assigned to x1. Can be a concept or a value.
                *Usage Examples:*
                    1. Simple Property: 'ckaji(@task1, @status_inprogress)' -> Task 1 has the property 'in-progress status'.
                    2. Intrinsic Quality: 'ckaji(@sky, @color_blue)' -> The sky has the quality 'blue color'. (Assuming @color_blue exists)
                    3. Linking Name: 'ckaji(@person1, @person1_name)' -> Person 1 has the property 'Name: Alice'. (Connects entity to its name node)
                    4. Abstract Concept: 'ckaji(@philosophy_stoicism, @trait_resilience)' -> The philosophy of Stoicism has the characteristic 'resilience'.
                `,
                dotco: `
                **ckaji (x1, x2)**: x1 (Entität) hat die Qualität/Eigenschaft x2 (Merkmal).
                *Zweck:* Weist einer Entität eine Eigenschaft oder ein Merkmal zu. Grundlegend für Beschreibungen.
                *Details:*
                    - x1: Das zu beschreibende Ding (Objekt, Person, Konzept, Ereignis).
                    - x2: Die Eigenschaft, das Attribut, die Qualität oder der Zustand, der x1 zugewiesen wird. Kann ein Konzept oder ein Wert sein.
                *Anwendungsbeispiele:*
                    1. Einfache Eigenschaft: 'ckaji(@task1, @status_inprogress)' -> Aufgabe 1 hat die Eigenschaft 'Status: in Bearbeitung'.
                    2. Intrinsische Qualität: 'ckaji(@sky, @color_blue)' -> Der Himmel hat die Qualität 'Farbe: blau'. (Angenommen @color_blue existiert)
                    3. Namen verknüpfen: 'ckaji(@person1, @person1_name)' -> Person 1 hat die Eigenschaft 'Name: Alice'. (Verbindet Entität mit ihrem Namensknoten)
                    4. Abstraktes Konzept: 'ckaji(@philosophy_stoicism, @trait_resilience)' -> Die Philosophie des Stoizismus hat das Merkmal 'Resilienz'.
                `
            }
        }
    },
    {
        pubkey: '@selbri_prenu',
        ckaji: { klesi: 'Selbri' },
        datni: {
            selbri: '@selbri_prenu',
            cneme: 'prenu',
            sumti: { x1: 'remna' },
            fanva: {
                glico: {
                    x1: 'person (human individual)'
                },
                dotco: {
                    x1: 'Person/Mensch'
                }
            },
            stidi: {
                glico: `
                **prenu (x1)**: x1 is a person/human being.
                *Purpose:* Classifies an entity as belonging to the category 'person'.
                *Details:*
                    - x1: The entity being identified as a person.
                *Usage Examples:*
                    1. Direct Classification: 'prenu(@person1)' -> The entity identified by @person1 is a person.
                    2. Type Check: Used implicitly in queries or rules, e.g., "Find all x1 such that 'prenu(x1)' and 'gunka(x1, @task_management, @project_alpha)'."
                    3. Distinguishing from non-persons: Helps differentiate human agents from bots or organizations in complex models. Example: 'prenu(@alice)' vs 'organization(@corp_x)'
                `,
                dotco: `
                **prenu (x1)**: x1 ist eine Person/ein menschliches Wesen.
                *Zweck:* Klassifiziert eine Entität als zur Kategorie 'Person' gehörig.
                *Details:*
                    - x1: Die Entität, die als Person identifiziert wird.
                *Anwendungsbeispiele:*
                    1. Direkte Klassifizierung: 'prenu(@person1)' -> Die durch @person1 identifizierte Entität ist eine Person.
                    2. Typüberprüfung: Wird implizit in Abfragen oder Regeln verwendet, z.B. "Finde alle x1, sodass 'prenu(x1)' und 'gunka(x1, @task_management, @project_alpha)'."
                    3. Unterscheidung von Nicht-Personen: Hilft bei der Unterscheidung menschlicher Akteure von Bots oder Organisationen in komplexen Modellen. Beispiel: 'prenu(@alice)' vs 'organization(@corp_x)'
                `
            }
        }
    },
    {
        pubkey: '@selbri_cneme',
        ckaji: { klesi: 'Selbri' },
        datni: {
            selbri: '@selbri_cneme',
            cneme: 'cneme',
            sumti: { x1: 'selci\'a', x2: 'cmene sumti' },
            fanva: {
                glico: {
                    x1: 'entity being named',
                    x2: 'name (as a Sumti containing the name string)'
                },
                dotco: {
                    x1: 'Entität die benannt wird',
                    x2: 'Name (als Sumti, der den Namenstext enthält)'
                }
            },
            stidi: {
                glico: `
                **cneme (x1, x2)**: x1 (entity) has the name represented by Sumti x2.
                *Purpose:* Specifically links an entity to its corresponding name Sumti.
                *Details:*
                    - x1: The entity (person, project, task, etc.).
                    - x2: The Sumti whose 'datni.vasru' contains the actual name string.
                *Usage Examples:*
                    1. Linking Person Name: 'cneme(@person1, @person1_name)' -> Links person1 to the Sumti containing "Alice".
                    2. Linking Project Name: 'cneme(@project1, @project1_name)' -> Links project1 to the Sumti containing "Project: Website".
                `,
                dotco: `
                **cneme (x1, x2)**: x1 (Entität) hat den Namen, der durch Sumti x2 repräsentiert wird.
                *Zweck:* Verknüpft spezifisch eine Entität mit ihrem entsprechenden Namens-Sumti.
                *Details:*
                    - x1: Die Entität (Person, Projekt, Aufgabe usw.).
                    - x2: Das Sumti, dessen 'datni.vasru' den tatsächlichen Namenstext enthält.
                *Anwendungsbeispiele:*
                    1. Verknüpfung Personenname: 'cneme(@person1, @person1_name)' -> Verknüpft person1 mit dem Sumti, das "Alice" enthält.
                    2. Verknüpfung Projektname: 'cneme(@project1, @project1_name)' -> Verknüpft project1 mit dem Sumti, das "Project: Website" enthält.
                `
            }
        }
    }
];
