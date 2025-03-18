import { app, db } from '../elysia';
import { GENESIS_REGISTRY_DOC_ID } from '../seed';

// Health endpoint - will be accessible at /agent/health
app.get('/health', async () => {
    // Get database stats
    const dbStats: Record<string, unknown> = {
        initialized: false,
        error: null,
        snapshots: 0,
        documents: 0,
        registryExists: false
    };

    try {
        // Check if the database is initialized
        const tablesResult = await db.query(
            `SELECT name FROM sqlite_master 
             WHERE type='table' AND name='loro_snapshots'`
        );

        dbStats.initialized = tablesResult.rows.length > 0;

        // Get snapshot count if initialized
        if (dbStats.initialized) {
            interface CountResult {
                count: number;
            }

            const countResult = await db.query<CountResult>('SELECT COUNT(*) as count FROM loro_snapshots');
            if (countResult.rows.length > 0) {
                dbStats.snapshots = countResult.rows[0].count;
            }

            // Get document count
            const docCountResult = await db.query<CountResult>(
                'SELECT COUNT(DISTINCT doc_id) as count FROM loro_snapshots'
            );
            if (docCountResult.rows.length > 0) {
                dbStats.documents = docCountResult.rows[0].count;
            }

            // Check if registry exists
            const registryResult = await db.query(
                'SELECT EXISTS(SELECT 1 FROM loro_snapshots WHERE doc_id = $1) as exists',
                [GENESIS_REGISTRY_DOC_ID]
            );

            if (registryResult.rows.length > 0) {
                const row = registryResult.rows[0] as Record<string, unknown>;
                dbStats.registryExists = row.exists;
            }
        }
    } catch (error) {
        dbStats.error = String(error);
    }

    // Return a detailed health check response
    return {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: {
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
        },
        database: dbStats
    }
}); 