import { db } from './index';
import * as schema from './schema';
import { LoroDoc } from 'loro-crdt';
import { blake3 } from '@noble/hashes/blake3';
import b4a from 'b4a';
import { randomBytes } from 'crypto';

// Sample user ID for seed documents - use a real user ID from your BetterAuth database
const SAMPLE_USER_ID = "0DaaHRf7Khtw3UcBxcofmnTM4V27Dasd"; // Replace with a real user ID from your db

// Helper function to hash the snapshot data (simplified version of hashService)
async function hashSnapshot(snapshot: Uint8Array): Promise<string> {
    const hashBytes = blake3(snapshot);
    return b4a.toString(hashBytes, 'hex');
}

// Helper function to generate a public key
function generatePublicKey(): string {
    // Format: z + base64url encoding of 32 bytes
    return 'z' + randomBytes(32).toString('base64url');
}

// Seed function to create a random Loro doc
export async function seedRandomLoroDoc() {
    try {
        // Create a new LoroDoc directly (without loroService)
        const loroDoc = new LoroDoc();

        // Set a random peer ID
        loroDoc.setPeerId(Math.floor(Math.random() * 1000000));

        // Add some sample content
        loroDoc.getText('title').insert(0, 'Example Loro Document');
        loroDoc.getText('body').insert(0, 'This is a test document created with Loro CRDT library.');

        // Add metadata
        const meta = loroDoc.getMap('metadata');
        meta.set('author', 'SeedScript');
        meta.set('createdAt', new Date().toISOString());

        // Generate a pubKey
        const pubKey = generatePublicKey();

        // Export snapshot and generate hash
        const snapshot = loroDoc.exportSnapshot();
        const cid = await hashSnapshot(snapshot);
        const jsonState = loroDoc.toJSON();

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