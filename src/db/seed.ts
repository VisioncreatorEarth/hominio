import { db } from './index';
import type { InsertDoc } from './schema';
import * as schema from './schema';

// Seed function to create a random doc
export async function seedRandomDoc() {
    const randomDoc: InsertDoc = {
        content: {
            title: 'Sample Document',
            body: 'This is a randomly generated document for testing purposes.',
            version: 1,
            blocks: [
                {
                    type: 'paragraph',
                    text: 'Hello world!'
                },
                {
                    type: 'code',
                    language: 'typescript',
                    code: 'console.log("Hello from Hominio!");'
                }
            ]
        },
        metadata: {
            author: 'Seed Script',
            tags: ['sample', 'test'],
            createdBy: 'system',
            status: 'draft'
        }
    };

    try {
        const result = await db.insert(schema.docs).values(randomDoc).returning();
        console.log('Created random doc:', result[0]);
        return result[0];
    } catch (error) {
        console.error('Error creating random doc:', error);
        throw error;
    }
}

console.log('🌱 Seeding database...');

seedRandomDoc()
    .then((doc) => {
        console.log('✅ Successfully created doc:', doc.id);
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }); 