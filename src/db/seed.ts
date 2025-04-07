import { db } from './index';
import { randomBytes } from 'crypto';
import * as schema from './schema';
import { loroService } from '$lib/KERNEL/loro-service';

// Seed function to create a random Loro doc
export async function seedRandomLoroDoc() {
    try {
        // Use the LoroService to create a demo document
        const { snapshot, cid, pubKey, jsonState } = await loroService.createDemoDoc();

        // First, store the content
        const contentEntry: schema.InsertContent = {
            cid,
            type: 'snapshot',
            data: {
                binary: Array.from(snapshot), // Convert Uint8Array to regular array for JSON storage
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
            ownerId: randomBytes(16).toString('hex'), // Fake UUID for now
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

console.log('🌱 Seeding database with Loro documents...');

seedRandomLoroDoc()
    .then((result) => {
        console.log('✅ Successfully created Loro document:');
        console.log('  - Public Key:', result.doc.pubKey);
        console.log('  - Snapshot CID:', result.doc.snapshotCid);
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }); 