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