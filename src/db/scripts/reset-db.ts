#!/usr/bin/env bun
/**
 * Database reset script
 * This script will:
 * 1. Drop all tables
 * 2. Push the new schema
 * 3. Seed the database with initial data
 * 
 * You can also run it with "drop-only" argument to only drop tables
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Ensure environment variables are available
const env = process.env;

// Check if we're running in drop-only mode
const isDropOnly = process.argv.includes('drop-only');

async function main() {
    console.log(`🔄 Starting database ${isDropOnly ? 'cleanup' : 'reset'}...`);

    // Check if we have the database URL
    const dbUrl = env.SECRET_DATABASE_URL_HOMINIO || Bun.env.SECRET_DATABASE_URL_HOMINIO;

    if (!dbUrl) {
        // Try to load from .env file
        try {
            const envFile = await Bun.file('.env').text();
            const match = envFile.match(/SECRET_DATABASE_URL_HOMINIO=["']?([^"'\r\n]+)["']?/);

            if (match) {
                // Set the environment variable for child processes
                env.SECRET_DATABASE_URL_HOMINIO = match[1];
                console.log('✅ Loaded database URL from .env file');
            } else {
                console.error('❌ Could not find SECRET_DATABASE_URL_HOMINIO in .env file');
                console.error('Please ensure this variable is set in your .env file or environment');
                process.exit(1);
            }
        } catch (err) {
            console.error('❌ Error loading .env file:', err);
            console.error('Please ensure the .env file exists and contains SECRET_DATABASE_URL_HOMINIO');
            process.exit(1);
        }
    } else {
        console.log('✅ Using database URL from environment');
    }

    // 1. Drop all tables directly without using utils.ts
    console.log('\n🗑️  Dropping all tables...');
    try {
        // Create a direct database connection
        const sql = neon(env.SECRET_DATABASE_URL_HOMINIO as string);
        const db = drizzle({ client: sql });

        // Execute raw SQL to drop all tables in public schema
        await db.execute(`
            DO $$ DECLARE
                r RECORD;
            BEGIN
                FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
                END LOOP;
            END $$;
        `);

        console.log('✅ Tables dropped successfully');

        // If drop-only mode, we're done
        if (isDropOnly) {
            console.log('\n🎉 Database cleanup completed successfully!');
            return;
        }
    } catch (err) {
        console.error('❌ Error dropping tables:', err);
        process.exit(1);
    }

    // 2. Push schema
    console.log('\n📊 Pushing schema...');
    try {
        const pushProcess = Bun.spawn(['drizzle-kit', 'push'], {
            cwd: './src/db',
            env,
            stdout: 'inherit',
            stderr: 'inherit'
        });

        const pushExitCode = await pushProcess.exited;
        if (pushExitCode !== 0) {
            console.error('❌ Failed to push schema');
            process.exit(1);
        }

        console.log('✅ Schema pushed successfully');
    } catch (err) {
        console.error('❌ Error pushing schema:', err);
        process.exit(1);
    }

    // 3. Seed database
    console.log('\n🌱 Seeding database...');
    try {
        // Run our standalone seed script with the environment variables properly set
        const seedProcess = Bun.spawn(['bun', 'run', './seed.ts'], {
            cwd: './src/db',
            env,
            stdout: 'inherit',
            stderr: 'inherit'
        });

        const seedExitCode = await seedProcess.exited;
        if (seedExitCode !== 0) {
            console.error('❌ Failed to seed database');
            process.exit(1);
        }

        console.log('✅ Database seeded successfully');
    } catch (err) {
        console.error('❌ Error seeding database:', err);
        process.exit(1);
    }

    console.log('\n🎉 Database reset completed successfully!');
}

main().catch(err => {
    console.error('❌ Unhandled error in reset script:', err);
    process.exit(1);
}); 