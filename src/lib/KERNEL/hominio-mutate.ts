import { hominioDB, triggerDocChangeNotification } from './hominio-db';
import { type CapabilityUser } from './hominio-caps';
import { v4 as uuidv4 } from 'uuid';
import { hominioIndexing } from './hominio-indexing';

// Basic operation types
type CreateSumtiOperation = {
    op: 'create_sumti';
    temp_id?: string;
    pubkey?: string;
    ckaji: {
        klesi: string;
        [key: string]: unknown;
    };
    datni: {
        klesi: string;
        [key: string]: unknown;
    };
};

type CreateBridiOperation = {
    op: 'create_bridi';
    temp_id?: string;
    pubkey?: string;
    datni: {
        selbri: string;
        sumti: {
            [place: string]: string;
        };
    };
};

// Union of all operation types
type MutationOperation = CreateSumtiOperation | CreateBridiOperation;

// Main transaction type
type MutationTransaction = {
    transaction: MutationOperation[];
};

// Basic mutation service
class HominioMutate {
    private tempIdMap: Map<string, string> = new Map();

    // Selbri pubkeys
    private readonly PRENU_SELBRI = '0x687dba1d3d67122c33b082ac9ea4be59a85cedd3d3e3bf6ea15f475cb670a475';
    private readonly CNEME_SELBRI = '0x96360692ef7f876a32e1a3c46a15bd597da160e76ac9c4bfd96026cb4afe3412';

    constructor() {
        console.log('HominioMutate initialized');
    }

    /**
     * Execute a mutation transaction
     */
    async executeMutation(
        transaction: MutationTransaction,
        user: CapabilityUser
    ): Promise<{ success: boolean; message: string; createdDocs: string[] }> {
        this.tempIdMap.clear();
        const createdDocs: string[] = [];

        try {
            console.log('Executing mutation transaction:', transaction);

            // Process each operation in sequence
            for (const operation of transaction.transaction) {
                if (operation.op === 'create_sumti') {
                    const pubkey = await this.createSumti(operation, user);
                    createdDocs.push(pubkey);
                } else if (operation.op === 'create_bridi') {
                    const pubkey = await this.createBridi(operation, user);
                    createdDocs.push(pubkey);
                }
            }

            // Trigger change notification to update reactive queries
            triggerDocChangeNotification();

            // Request indexing for the created documents
            await hominioIndexing.startIndexingCycle();

            return {
                success: true,
                message: `Successfully created ${createdDocs.length} documents`,
                createdDocs
            };
        } catch (error) {
            console.error('Mutation transaction failed:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error during mutation',
                createdDocs
            };
        }
    }

    /**
     * Create a Sumti document
     */
    private async createSumti(operation: CreateSumtiOperation, user: CapabilityUser): Promise<string> {
        // Generate or use provided pubkey
        const pubkey = operation.pubkey || `sumti_${uuidv4()}`;

        try {
            // Create the document with options
            const createdPubkey = await hominioDB.createDocument(
                user,
                {
                    owner: user.id,
                    name: operation.ckaji.cmene as string || pubkey.substring(0, 10)
                }
            );

            // Get the document
            const doc = await hominioDB.getLoroDoc(createdPubkey);
            if (!doc) {
                throw new Error(`Failed to retrieve created Sumti document: ${createdPubkey}`);
            }

            // Set ckaji (metadata)
            const ckajiMap = doc.getMap('ckaji');
            Object.entries(operation.ckaji).forEach(([key, value]) => {
                ckajiMap.set(key, value);
            });

            // Set datni (data)
            const datniMap = doc.getMap('datni');
            Object.entries(operation.datni).forEach(([key, value]) => {
                datniMap.set(key, value);
            });

            // Commit the changes
            doc.commit();

            // Store temp_id mapping if provided
            if (operation.temp_id) {
                this.tempIdMap.set(operation.temp_id, createdPubkey);
            }

            console.log(`Created Sumti document: ${createdPubkey}`);
            return createdPubkey;
        } catch (error) {
            console.error(`Error creating Sumti document:`, error);
            throw error;
        }
    }

    /**
     * Create a Bridi (relationship) document
     */
    private async createBridi(operation: CreateBridiOperation, user: CapabilityUser): Promise<string> {
        // Generate or use provided pubkey
        const pubkey = operation.pubkey || `bridi_${uuidv4()}`;

        try {
            // Resolve temp IDs in sumti
            const resolvedSumti: Record<string, string> = {};
            for (const [place, value] of Object.entries(operation.datni.sumti)) {
                if (value.startsWith('$') && this.tempIdMap.has(value)) {
                    resolvedSumti[place] = this.tempIdMap.get(value) as string;
                } else {
                    resolvedSumti[place] = value;
                }
            }

            // Prepare bridi data for direct creation
            const initialBridiData = {
                gismu: 'bridi' as const,
                selbriRef: operation.datni.selbri,
                sumtiData: resolvedSumti,
                selbriJavni: undefined
            };

            // Create the document with initial bridi data
            const createdPubkey = await hominioDB.createDocument(
                user,
                { owner: user.id },
                initialBridiData
            );

            // Store temp_id mapping if provided
            if (operation.temp_id) {
                this.tempIdMap.set(operation.temp_id, createdPubkey);
            }

            console.log(`Created Bridi document: ${createdPubkey}`);
            return createdPubkey;
        } catch (error) {
            console.error(`Error creating Bridi document:`, error);
            throw error;
        }
    }

    /**
     * Convenience method to create a person (prenu) with a name
     */
    async createPrenuWithName(
        name: string,
        user: CapabilityUser
    ): Promise<{ success: boolean; prenuId?: string; error?: string }> {
        try {
            // Create a person (prenu) document
            const prenuDocId = await this.createSumti({
                op: 'create_sumti',
                temp_id: '$prenu',
                ckaji: {
                    klesi: 'Sumti',
                    cmene: `Person: ${name}`
                },
                datni: { klesi: 'concept' }
            }, user);

            // Create a relationship that this is a prenu (instance of prenu selbri)
            await this.createBridi({
                op: 'create_bridi',
                datni: {
                    selbri: this.PRENU_SELBRI,
                    sumti: {
                        x1: '$prenu'
                    }
                }
            }, user);

            // Create a name document
            const nameDocId = await this.createSumti({
                op: 'create_sumti',
                temp_id: '$name',
                ckaji: {
                    klesi: 'Sumti',
                    cmene: `Name: ${name}`
                },
                datni: {
                    klesi: 'LoroText',
                    vasru: name
                }
            }, user);

            // Create a relationship that this is a cneme (instance of cneme selbri)
            await this.createBridi({
                op: 'create_bridi',
                datni: {
                    selbri: this.CNEME_SELBRI,
                    sumti: {
                        x1: '$name'
                    }
                }
            }, user);

            // Store the actual name as sumti data
            await this.createSumti({
                op: 'create_sumti',
                temp_id: '$name_data',
                ckaji: {
                    klesi: 'Sumti',
                    cmene: `Name: ${name}`
                },
                datni: {
                    klesi: 'LoroText',
                    vasru: name
                }
            }, user);

            // Create relationship between person and name
            await this.createBridi({
                op: 'create_bridi',
                datni: {
                    selbri: this.CNEME_SELBRI,
                    sumti: {
                        x1: '$prenu',
                        x2: '$name'
                    }
                }
            }, user);

            console.log(`Created prenu with name "${name}", IDs: prenu=${prenuDocId}, name=${nameDocId}`);

            // Notify of document changes
            await triggerDocChangeNotification();

            return { success: true, prenuId: prenuDocId };
        } catch (error) {
            console.error('Failed to create prenu with name:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error creating prenu'
            };
        }
    }
}

// Export singleton instance
export const hominioMutate = new HominioMutate(); 