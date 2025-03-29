import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { neon } from '@neondatabase/serverless';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema';

// Backend: Neon PostgreSQL
const databaseUrl = process.env.SECRET_DATABASE_URL_HOMINIO;

if (!databaseUrl) {
    throw new Error('Database URL not found in environment variables');
}

const sql = neon(databaseUrl);
export const db = drizzleNeon({ client: sql, schema });

// Frontend: PGLite with IndexedDB persistence
export const createBrowserDb = () => {
    // Use IndexedDB for persistence with relaxed durability for better performance
    const client = new PGlite('idb://hominio-local');
    return drizzlePglite({ client, schema });
};

// Export types
export * from './schema'; 