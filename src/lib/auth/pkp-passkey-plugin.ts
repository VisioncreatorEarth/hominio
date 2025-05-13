import type { BetterAuthPlugin, BetterAuthClientPlugin } from 'better-auth';
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api';
import pkg from 'pg';
const { Pool } = pkg;
// Use InstanceType for Pool to satisfy linter if 'Pool' is seen as a value used as a type
type PoolInstance = InstanceType<typeof Pool>;
type QueryResult = pkg.QueryResult;
import type { BetterFetch } from '@better-fetch/fetch';

// Define the shape of data your endpoints will handle
interface PasskeyInfoBody {
    passkey_rawId?: string;
    PKP_pubKey?: string;
}

// BetterAuth injects its options, including the database pool, into the context.
// The `getSessionFromCtx` utility expects `BetterAuthContext`.

// --- SERVER PLUGIN ---
export const pkpPasskeyServerPlugin = () => ({
    id: 'pkpPasskeyPlugin',
    schema: {
        user: { // Extending the existing 'user' table
            fields: {
                passkey_rawId: { // Match actual DB column name (camelCase)
                    type: 'string',
                    unique: true,
                },
                PKP_pubKey: { // Match actual DB column name (camelCase)
                    type: 'string',
                    unique: true,
                },
            },
        },
    },
    endpoints: {
        updateUserPasskeyInfo: createAuthEndpoint(
            '/pkp-passkey-plugin/update-user-passkey-info',
            { method: 'POST' },
            async (ctx) => {
                console.log('[pkpPasskeyPlugin:updateUser] Endpoint hit (POST)');
                let sessionData;
                let requestBody: PasskeyInfoBody | undefined;
                let db: PoolInstance | undefined;
                try {
                    db = (ctx as any).context?.options?.database as PoolInstance;
                    if (!db) {
                        console.error('[pkpPasskeyPlugin:updateUser] Database pool not found');
                        throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, message: 'DB Configuration Error' });
                    }
                    sessionData = await getSessionFromCtx(ctx as any);
                    if (!sessionData?.session?.userId) {
                        console.error('[pkpPasskeyPlugin:updateUser] Unauthorized - No session or userId');
                        throw new APIError('UNAUTHORIZED', { status: 401 });
                    }
                    const userId = sessionData.session.userId;

                    // Check ctx.body first, then try ctx.request.json()
                    console.log('[pkpPasskeyPlugin:updateUser] ctx.body type:', typeof ctx.body);
                    console.log('[pkpPasskeyPlugin:updateUser] ctx.body content:', JSON.stringify(ctx.body, null, 2));

                    if (ctx.body && typeof ctx.body === 'object' && (('passkey_rawId' in ctx.body) || ('PKP_pubKey' in ctx.body))) {
                        console.log('[pkpPasskeyPlugin:updateUser] Using ctx.body as request body.');
                        requestBody = ctx.body as PasskeyInfoBody;
                    } else if (ctx.request) {
                        console.log('[pkpPasskeyPlugin:updateUser] Attempting to use ctx.request.json() as body may have been pre-parsed or request is null.');
                        try {
                            requestBody = await ctx.request.json() as PasskeyInfoBody;
                        } catch (e: any) {
                            console.error('[pkpPasskeyPlugin:updateUser] Error parsing ctx.request.json():', e.message);
                            // If ctx.body was something but not what we expected, log it again before failing
                            if (ctx.body) {
                                console.warn('[pkpPasskeyPlugin:updateUser] ctx.body existed but was not the expected shape or was not used:', ctx.body);
                            }
                            throw new APIError('BAD_REQUEST', { status: 400, message: 'Invalid request body format or body already read and ctx.body is not suitable.' });
                        }
                    } else {
                        console.error('[pkpPasskeyPlugin:updateUser] ctx.request is null and ctx.body is not suitable.');
                        throw new APIError('BAD_REQUEST', { status: 400, message: 'Request object not available and ctx.body not suitable.' });
                    }

                    if (!requestBody) {
                        console.error('[pkpPasskeyPlugin:updateUser] Request body could not be resolved.');
                        throw new APIError('BAD_REQUEST', { status: 400, message: 'Unable to resolve request body.' });
                    }

                    const { passkey_rawId, PKP_pubKey } = requestBody;
                    console.log('[pkpPasskeyPlugin:updateUser] Parsed body:', requestBody);

                    if (!passkey_rawId && !PKP_pubKey) {
                        console.warn('[pkpPasskeyPlugin:updateUser] Missing passkey_rawId or PKP_pubKey');
                        throw new APIError('BAD_REQUEST', { status: 400, message: 'Missing passkey_rawId or PKP_pubKey' });
                    }

                    const updates: string[] = [];
                    const values: (string | undefined)[] = [];
                    let paramCount = 1;
                    if (passkey_rawId) {
                        updates.push(`"passkey_rawId" = $${paramCount++}`);
                        values.push(passkey_rawId);
                    }
                    if (PKP_pubKey) {
                        updates.push(`"PKP_pubKey" = $${paramCount++}`);
                        values.push(PKP_pubKey);
                    }
                    if (updates.length === 0) {
                        console.log('[pkpPasskeyPlugin:updateUser] No updates provided by client.');
                        return { message: 'No updates provided' };
                    }
                    values.push(userId);
                    const query = `UPDATE "user" SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, "passkey_rawId", "PKP_pubKey"`;
                    console.log(`[pkpPasskeyPlugin:updateUser] Executing query: ${query} with values:`, values);
                    const result: QueryResult = await db.query(query, values.filter(v => v !== undefined) as string[]);
                    console.log('[pkpPasskeyPlugin:updateUser] Query result:', result);
                    if (result.rowCount === 0) {
                        console.warn('[pkpPasskeyPlugin:updateUser] User not found or no update made');
                        throw new APIError('NOT_FOUND', { status: 404, message: 'User not found or no update made' });
                    }
                    return {
                        user: {
                            id: result.rows[0].id,
                            passkey_rawId: result.rows[0].passkey_rawId,
                            PKP_pubKey: result.rows[0].PKP_pubKey
                        }
                    };
                } catch (error: any) {
                    console.error('[pkpPasskeyPlugin:updateUser] Error in endpoint:', error);
                    if (error instanceof APIError) throw error;
                    throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, cause: error, message: 'Failed to update user info' });
                }
            }
        ),
        getUserPasskeyInfo: createAuthEndpoint(
            '/pkp-passkey-plugin/get-user-passkey-info',
            { method: 'GET' },
            async (ctx) => {
                console.log('[pkpPasskeyPlugin:getUser] Endpoint hit');
                let sessionData;
                let db: PoolInstance | undefined;

                try {
                    db = (ctx as any).context?.options?.database as PoolInstance;
                    if (!db) {
                        console.error('[pkpPasskeyPlugin:getUser] Database pool not found');
                        throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, message: 'DB Configuration Error' });
                    }
                    sessionData = await getSessionFromCtx(ctx as any);
                    console.log('[pkpPasskeyPlugin:getUser] Session data:', sessionData);
                    if (!sessionData?.session?.userId) {
                        console.error('[pkpPasskeyPlugin:getUser] Unauthorized - No session or userId');
                        throw new APIError('UNAUTHORIZED', { status: 401 });
                    }
                    const userId = sessionData.session.userId;
                    const query = 'SELECT "passkey_rawId", "PKP_pubKey" FROM "user" WHERE id = $1';
                    console.log(`[pkpPasskeyPlugin:getUser] Executing query: ${query} for userId: ${userId}`);
                    const result: QueryResult = await db.query(query, [userId]);
                    console.log('[pkpPasskeyPlugin:getUser] Query result:', result);

                    if (result.rows.length === 0) {
                        console.log('[pkpPasskeyPlugin:getUser] No data found for user.');
                        return { passkey_rawId: null, PKP_pubKey: null };
                    }
                    console.log('[pkpPasskeyPlugin:getUser] Data found:', result.rows[0]);
                    return {
                        passkey_rawId: result.rows[0].passkey_rawId,
                        PKP_pubKey: result.rows[0].PKP_pubKey
                    };
                } catch (error: any) {
                    console.error('[pkpPasskeyPlugin:getUser] Error in endpoint:', error);
                    if (error instanceof APIError) throw error;
                    throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, cause: error, message: 'Failed to fetch user info' });
                }
            }
        ),
    },
} satisfies BetterAuthPlugin);

// --- CLIENT PLUGIN ---
interface UpdatePasskeyInfoArgs {
    passkey_rawId?: string;
    PKP_pubKey?: string;
}

export const pkpPasskeyClientPlugin = () => ({
    id: 'pkpPasskeyPlugin',
    $InferServerPlugin: {} as ReturnType<typeof pkpPasskeyServerPlugin>,
    pathMethods: {
        '/pkp-passkey-plugin/get-user-passkey-info': 'GET',
        '/pkp-passkey-plugin/update-user-passkey-info': 'POST'
    },
    getActions: ($fetch: BetterFetch) => {
        return {
            updateUserPasskeyInfo: async (data: UpdatePasskeyInfoArgs) => {
                return $fetch('/pkp-passkey-plugin/update-user-passkey-info', {
                    method: 'POST',
                    body: data,
                });
            },
            getUserPasskeyInfo: async () => {
                return $fetch('/pkp-passkey-plugin/get-user-passkey-info', {
                    method: 'GET',
                });
            }
        };
    }
} satisfies BetterAuthClientPlugin); 