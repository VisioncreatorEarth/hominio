import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// Backend: Neon PostgreSQL
const databaseUrl = process.env.SECRET_DATABASE_URL_HOMINIO;

if (!databaseUrl) {
    throw new Error('Database URL not found in environment variables');
}

const sql = neon(databaseUrl);
export const db = drizzle({ client: sql, schema });


// Export types
export * from './schema'; 