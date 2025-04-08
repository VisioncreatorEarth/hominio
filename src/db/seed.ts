import { db } from './index';
import * as schema from './schema';
import { loroService } from '$lib/KERNEL/loro-service';

// Sample user ID for seed documents - use a real user ID from your BetterAuth database
const SAMPLE_USER_ID = "0DaaHRf7Khtw3UcBxcofmnTM4V27Dasd"; // Replace with a real user ID from your db

// Seed function to create a random Loro doc
export async function seedRandomLoroDoc() {
    try {
        // Use the LoroService to create a demo document
        const { snapshot, cid, pubKey, jsonState } = await loroService.createDemoDoc();

        // First, store the content with BYTEA data
        const contentEntry: schema.InsertContent = {
            cid,
            type: 'snapshot',
            // Store binary data directly as Buffer
            data: Buffer.from(snapshot),
            // Store metadata separately as JSON
            metadata: {
                docState: jsonState // Store the JSON representation for easier debugging
            }
        };

        // Save the content
        const contentResult = await db.insert(schema.content)
            .values(contentEntry)
            .returning();

        console.log('Created content entry:', contentResult[0].cid);

        // Then create document entry that references the content
        const docEntry: schema.InsertDoc = {
            pubKey,
            snapshotCid: cid,
            updateCids: [],
            ownerId: SAMPLE_USER_ID, // Use the sample user ID for ownership
            title: 'Example Loro Document',
            description: 'A test document using Loro CRDT'
        };

        // Save the document entry
        const docResult = await db.insert(schema.docs)
            .values(docEntry)
            .returning();

        console.log('Created document entry:', docResult[0].pubKey);

        return {
            doc: docResult[0],
            content: contentResult[0]
        };
    } catch (error) {
        console.error('Error creating Loro doc:', error);
        throw error;
    }
}

// Self-executing code for when file is run directly
console.log('🌱 Seeding database with Loro documents...');

seedRandomLoroDoc()
    .then((result) => {
        console.log('✅ Successfully created Loro document:');
        console.log('  - Public Key:', result.doc.pubKey);
        console.log('  - Snapshot CID:', result.doc.snapshotCid);
        console.log('  - Owner ID:', result.doc.ownerId);
    })
    .catch((error) => {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }); 