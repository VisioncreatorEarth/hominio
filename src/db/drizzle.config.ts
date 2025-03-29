import type { Config } from 'drizzle-kit';

export default {
    schema: './schema.ts',
    out: './migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.SECRET_DATABASE_URL_HOMINIO || '',
    },
} satisfies Config; 