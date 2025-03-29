import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// Get database URL from environment
const databaseUrl = process.env.SECRET_DATABASE_URL_HOMINIO;

if (!databaseUrl) {
    throw new Error('Database URL not found in environment variables');
}

// Create a Neon client with server-side env variable
const sql = neon(databaseUrl);

// Create a Drizzle client with type safety from our schema
export const db = drizzle({ client: sql, schema });

// Export types
export * from './schema';

// Seed function to create a random doc
export async function seedRandomDoc() {
    const randomDoc: schema.InsertDoc = {
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

// Execute seed if this file is run directly
if (import.meta.url === import.meta.main) {
    seedRandomDoc()
        .then(() => console.log('Seeding completed'))
        .catch(console.error)
        .finally(() => process.exit());
} 