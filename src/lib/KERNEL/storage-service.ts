import { PGlite } from '@electric-sql/pglite';
import { LoroDoc } from 'loro-crdt';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface LoroDocData {
    [key: string]: Record<string, unknown>;
}

interface PGRow {
    content: string;
}

export class StorageService {
    private pg: PGlite;
    private initialized: boolean = false;
    private readonly DB_PATH: string;

    constructor() {
        // Store database in user's home directory
        this.DB_PATH = join(homedir(), '.hominio', 'db');
        this.pg = this.initializePGlite();
    }

    private async ensureDbDirectory(): Promise<void> {
        if (typeof process !== 'undefined' && process.versions?.node) {
            if (!existsSync(this.DB_PATH)) {
                await mkdir(this.DB_PATH, { recursive: true });
            }
        }
    }

    private initializePGlite(): PGlite {
        try {
            // Check environment and choose appropriate storage
            if (typeof process !== 'undefined' && process.versions?.node) {
                // Ensure directory exists (sync for constructor)
                if (!existsSync(this.DB_PATH)) {
                    mkdir(this.DB_PATH, { recursive: true });
                }
                // Node.js/Bun environment
                return new PGlite(join(this.DB_PATH, 'pglite'));
            } else {
                // Browser environment - use IndexedDB
                return new PGlite('idb://pglite', {
                    relaxedDurability: true // Better browser performance
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to initialize storage: ${message}`);
        }
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await this.ensureDbDirectory();

            // Create the docs table if it doesn't exist
            await this.pg.query(`
                CREATE TABLE IF NOT EXISTS docs (
                    content_hash TEXT PRIMARY KEY,
                    content TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            this.initialized = true;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to initialize storage schema: ${message}`);
        }
    }

    async store(contentHash: string, doc: LoroDoc): Promise<void> {
        await this.initialize();
        const content = JSON.stringify(doc.toJSON());

        try {
            await this.pg.query(
                'INSERT INTO docs (content_hash, content) VALUES ($1, $2) ON CONFLICT (content_hash) DO NOTHING',
                [contentHash, content]
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to store document ${contentHash}: ${message}`);
        }
    }

    async load(contentHash: string): Promise<LoroDoc | null> {
        await this.initialize();

        try {
            const result = await this.pg.query<PGRow>(
                'SELECT content FROM docs WHERE content_hash = $1',
                [contentHash]
            );

            if (result.rows.length === 0) return null;

            const content = result.rows[0].content;
            const doc = new LoroDoc();
            const parsedData = JSON.parse(content);

            if (typeof parsedData === 'object' && parsedData !== null) {
                const data = parsedData as LoroDocData;
                // Initialize doc with data
                Object.entries(data).forEach(([key, value]) => {
                    const container = doc.getMap(key);
                    if (typeof value === 'object' && value !== null) {
                        Object.entries(value).forEach(([subKey, subValue]) => {
                            if (subValue !== undefined) {
                                container.set(subKey, subValue);
                            }
                        });
                    }
                });
            }
            return doc;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to load document ${contentHash}: ${message}`);
        }
    }
}

// Export singleton instance
export const storageService = new StorageService(); 