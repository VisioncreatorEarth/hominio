import type { BetterAuthPlugin, BetterAuthClientPlugin } from 'better-auth';
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api';
import pkg from 'pg';
type QueryResult = pkg.QueryResult;
import type { BetterFetch } from '@better-fetch/fetch';

// Define the shape of the pkp_passkey object
interface PkpPasskey {
    rawId: string;
    pubKey: string; // This is the PKP Public Key
    passkeyVerifierContract?: string; // Address of the deployed EIP-1271 signer // RENAMED
    username: string; // Added username
    pubkeyCoordinates: { // Added passkey public key coordinates
        x: string; // hex format
        y: string; // hex format
    };
    pkpTokenId: string; // Added to store the PKP's own NFT token ID
}

// Define the shape of data your endpoints will handle
interface PasskeyInfoBody {
    pkp_passkey?: PkpPasskey;
}

// BetterAuth injects its options, including the database pool, into the context.
// The `getSessionFromCtx` utility expects `BetterAuthContext`.

// --- SERVER PLUGIN ---
export const pkpPasskeyServerPlugin = () => ({
    id: 'pkpPasskeyPlugin',
    schema: {
        user: { // Extending the existing 'user' table
            fields: {
                // Removed passkey_rawId and PKP_pubKey
                // Add the new pkp_passkey field, stored as a JSON string
                // The actual DB column type should be JSONB.
                // Uniqueness constraints on rawId/pubKey within the JSON should be handled at the DB level.
                pkp_passkey: {
                    type: 'string', // BetterAuth schema type; will store JSON string
                },
            },
        },
    },
    endpoints: {
        updateUserPasskeyInfo: createAuthEndpoint(
            '/pkp-passkey-plugin/update-user-passkey-info',
            { method: 'POST' },
            async (ctx: any) => { // Use any for now
                console.log('[pkpPasskeyPlugin:updateUserPasskeyInfo] Endpoint hit (POST)');
                let requestBody: PasskeyInfoBody | undefined;
                const db = ctx.context.options.database;

                if (!db) {
                    console.error('[pkpPasskeyPlugin:updateUserPasskeyInfo] Database pool not found');
                    throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, message: 'DB Configuration Error' });
                }
                try {
                    // With a more accurate CustomAuthContext, direct usage should be possible
                    const baSession = await getSessionFromCtx(ctx);
                    if (!baSession?.session?.userId) {
                        console.error('[pkpPasskeyPlugin:updateUserPasskeyInfo] Unauthorized - No session or userId');
                        throw new APIError('UNAUTHORIZED', { status: 401 });
                    }
                    const userId = baSession.session.userId;

                    console.log('[pkpPasskeyPlugin:updateUserPasskeyInfo] ctx.body type:', typeof ctx.body);
                    console.log('[pkpPasskeyPlugin:updateUserPasskeyInfo] ctx.body content (raw):', JSON.stringify(ctx.body, null, 2));

                    if (ctx.body && typeof ctx.body === 'object' && ctx.body !== null && ('pkp_passkey' in ctx.body)) {
                        console.log('[pkpPasskeyPlugin:updateUserPasskeyInfo] Using ctx.body as request body.');
                        requestBody = ctx.body as PasskeyInfoBody;
                    } else if (ctx.request) {
                        console.log('[pkpPasskeyPlugin:updateUserPasskeyInfo] Attempting to use ctx.request.json().');
                        try {
                            requestBody = await ctx.request.json() as PasskeyInfoBody;
                        } catch (e: unknown) {
                            const error = e as Error;
                            console.error('[pkpPasskeyPlugin:updateUserPasskeyInfo] Error parsing ctx.request.json():', error.message);
                            if (ctx.body) {
                                console.warn('[pkpPasskeyPlugin:updateUserPasskeyInfo] ctx.body existed but was not the expected shape or was not used (during parse attempt):', ctx.body);
                            }
                            throw new APIError('BAD_REQUEST', { status: 400, message: 'Invalid request body format.' });
                        }
                    } else {
                        console.error('[pkpPasskeyPlugin:updateUserPasskeyInfo] ctx.request is null and ctx.body is not suitable.');
                        throw new APIError('BAD_REQUEST', { status: 400, message: 'Request object not available and ctx.body not suitable.' });
                    }

                    if (!requestBody || !requestBody.pkp_passkey) { // Ensure pkp_passkey object itself exists
                        console.error('[pkpPasskeyPlugin:updateUserPasskeyInfo] Request body missing pkp_passkey object.');
                        throw new APIError('BAD_REQUEST', { status: 400, message: 'Request body missing pkp_passkey object.' });
                    }

                    const { pkp_passkey } = requestBody;
                    console.log('[pkpPasskeyPlugin:updateUserPasskeyInfo] Extracted pkp_passkey object for saving:', JSON.stringify(pkp_passkey, null, 2));

                    // Validate required fields in pkp_passkey
                    if (
                        typeof pkp_passkey.rawId !== 'string' ||
                        typeof pkp_passkey.pubKey !== 'string' ||
                        typeof pkp_passkey.username !== 'string' ||
                        !pkp_passkey.pubkeyCoordinates || // Check if object exists
                        typeof pkp_passkey.pubkeyCoordinates.x !== 'string' ||
                        typeof pkp_passkey.pubkeyCoordinates.y !== 'string' ||
                        typeof pkp_passkey.pkpTokenId !== 'string' // Added pkpTokenId validation
                    ) {
                        console.warn('[pkpPasskeyPlugin:updateUserPasskeyInfo] pkp_passkey object missing required fields (rawId, pubKey, username, pkpTokenId, pubkeyCoordinates.x, pubkeyCoordinates.y) or incorrect types.');
                        throw new APIError('BAD_REQUEST', { status: 400, message: 'pkp_passkey object must contain rawId, pubKey, username, pkpTokenId as strings, and pubkeyCoordinates object with x and y strings.' });
                    }
                    // passkeyVerifierContract is optional
                    if (pkp_passkey.passkeyVerifierContract !== undefined && typeof pkp_passkey.passkeyVerifierContract !== 'string') {
                        console.warn('[pkpPasskeyPlugin:updateUserPasskeyInfo] pkp_passkey passkeyVerifierContract, if provided, must be a string.');
                        throw new APIError('BAD_REQUEST', { status: 400, message: 'pkp_passkey passkeyVerifierContract, if provided, must be a string.' });
                    }

                    // Construct the object to be stringified for the DB, ensuring all intended fields are included.
                    const dataToStore: PkpPasskey = {
                        rawId: pkp_passkey.rawId,
                        pubKey: pkp_passkey.pubKey,
                        username: pkp_passkey.username,
                        pubkeyCoordinates: {
                            x: pkp_passkey.pubkeyCoordinates.x,
                            y: pkp_passkey.pubkeyCoordinates.y
                        },
                        pkpTokenId: pkp_passkey.pkpTokenId // Added pkpTokenId to stored data
                    };
                    if (pkp_passkey.passkeyVerifierContract) {
                        dataToStore.passkeyVerifierContract = pkp_passkey.passkeyVerifierContract;
                    }

                    const query = `UPDATE "user" SET "pkp_passkey" = $1 WHERE id = $2 RETURNING id, "pkp_passkey"`;
                    // Stringify the validated and structured pkp_passkey data
                    const values = [JSON.stringify(dataToStore), userId];
                    console.log(`[pkpPasskeyPlugin:updateUserPasskeyInfo] Executing query: ${query} with stringified pkp_passkey:`, values[0]);

                    const result: QueryResult = await db.query(query, values);
                    console.log('[pkpPasskeyPlugin:updateUserPasskeyInfo] Query result raw rows:', result.rows);

                    if (result.rowCount === 0) {
                        console.warn('[pkpPasskeyPlugin:updateUserPasskeyInfo] User not found or no update made');
                        throw new APIError('NOT_FOUND', { status: 404, message: 'User not found or no update made' });
                    }
                    // The pg driver automatically parses the JSONB pkp_passkey column back into an object.
                    // This object should conform to the PkpPasskey interface (rawId, pubKey, passkeyVerifierContract?)
                    const pkpDataFromDb = result.rows[0].pkp_passkey;
                    console.log('[pkpPasskeyPlugin:updateUserPasskeyInfo] pkp_passkey data from DB:', JSON.stringify(pkpDataFromDb, null, 2));

                    return {
                        user: {
                            id: result.rows[0].id,
                            pkp_passkey: result.rows[0].pkp_passkey // This should be the object from DB
                        }
                    };
                } catch (error: unknown) {
                    console.error('[pkpPasskeyPlugin:updateUserPasskeyInfo] Error in endpoint:', error);
                    if (error instanceof APIError) throw error;
                    const err = error as Error;
                    throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, cause: err, message: 'Failed to update user pkp_passkey info' });
                }
            }
        ),
        getUserPasskeyInfo: createAuthEndpoint(
            '/pkp-passkey-plugin/get-user-passkey-info',
            { method: 'GET' },
            async (ctx: any) => { // Use any for now
                const db = ctx.context.options.database;

                if (!db) {
                    console.error('[pkpPasskeyPlugin:getUserPasskeyInfo] Database pool not found');
                    throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, message: 'DB Configuration Error' });
                }
                try {
                    const baSession = await getSessionFromCtx(ctx);
                    if (!baSession?.session?.userId) {
                        console.error('[pkpPasskeyPlugin:getUserPasskeyInfo] Unauthorized - No session or userId');
                        throw new APIError('UNAUTHORIZED', { status: 401 });
                    }
                    const userId = baSession.session.userId;
                    const query = 'SELECT "pkp_passkey" FROM "user" WHERE id = $1';
                    const result: QueryResult = await db.query(query, [userId]);

                    if (result.rows.length === 0 || !result.rows[0].pkp_passkey) {
                        return { pkp_passkey: null }; // Explicitly return null for the field
                    }

                    // The pg driver automatically parses the JSONB pkp_passkey column into an object.
                    // This object should conform to the PkpPasskey interface (rawId, pubKey, passkeyVerifierContract?)
                    const pkpDataFromDb = result.rows[0].pkp_passkey;

                    return {
                        pkp_passkey: pkpDataFromDb
                    };
                } catch (error: unknown) {
                    console.error('[pkpPasskeyPlugin:getUserPasskeyInfo] Error in endpoint:', error);
                    if (error instanceof APIError) throw error;
                    const err = error as Error;
                    throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, cause: err, message: 'Failed to fetch user pkp_passkey info' });
                }
            }
        ),
        checkRawIdExists: createAuthEndpoint(
            '/pkp-passkey-plugin/check-rawid-exists',
            { method: 'POST' }, // Using POST to send rawId in body
            async (ctx: any) => { // Use any for now
                console.log('[pkpPasskeyPlugin:checkRawIdExists] Endpoint hit');
                let requestBody: { rawId?: string } | undefined;
                const db = ctx.context.options.database;

                if (!db) {
                    console.error('[pkpPasskeyPlugin:checkRawIdExists] Database pool not found');
                    throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, message: 'DB Configuration Error' });
                }

                try {
                    const baSession = await getSessionFromCtx(ctx);
                    if (!baSession?.session?.userId) {
                        console.error('[pkpPasskeyPlugin:checkRawIdExists] Unauthorized - No session or userId');
                        throw new APIError('UNAUTHORIZED', { status: 401, message: 'User session required to check RawID.' });
                    }
                    const currentUserId = baSession.session.userId;
                    console.log(`[pkpPasskeyPlugin:checkRawIdExists] Called by authenticated user: ${currentUserId}`);

                    // Parse request body for rawId
                    if (ctx.body && typeof ctx.body === 'object' && ctx.body !== null && ('rawId' in ctx.body)) {
                        requestBody = ctx.body as { rawId?: string };
                    } else if (ctx.request) {
                        try {
                            requestBody = await ctx.request.json() as { rawId?: string };
                        } catch (e: unknown) {
                            const error = e as Error;
                            console.error('[pkpPasskeyPlugin:checkRawIdExists] Error parsing ctx.request.json():', error.message);
                            throw new APIError('BAD_REQUEST', { status: 400, message: 'Invalid request body for rawId check.' });
                        }
                    } else {
                        throw new APIError('BAD_REQUEST', { status: 400, message: 'Request body with rawId expected.' });
                    }

                    if (!requestBody?.rawId || typeof requestBody.rawId !== 'string') {
                        console.error('[pkpPasskeyPlugin:checkRawIdExists] Missing or invalid rawId in request body.');
                        throw new APIError('BAD_REQUEST', { status: 400, message: 'Valid rawId string required in request body.' });
                    }
                    const rawIdToCheck = requestBody.rawId;
                    console.log(`[pkpPasskeyPlugin:checkRawIdExists] Checking for rawId: ${rawIdToCheck}`);

                    // Query to find if this rawId exists in any user's pkp_passkey JSONB field.
                    // Note: This query might be slow on large tables if pkp_passkey->>'rawId' is not indexed.
                    // Consider adding a GIN index on pkp_passkey or a specific functional index if performance becomes an issue.
                    const query = `SELECT id, pkp_passkey FROM "user" WHERE pkp_passkey->>'rawId' = $1 LIMIT 1`;
                    const result: QueryResult = await db.query(query, [rawIdToCheck]);

                    if (result.rows.length > 0) {
                        const foundUser = result.rows[0];
                        const existingPkpData = foundUser.pkp_passkey as PkpPasskey; // Cast to PkpPasskey
                        console.log(`[pkpPasskeyPlugin:checkRawIdExists] Found rawId ${rawIdToCheck} for user ${foundUser.id}. Data:`, existingPkpData);
                        return {
                            exists: true,
                            userId: foundUser.id, // The user ID who has this rawId registered
                            pkpPublicKey: existingPkpData.pubKey,
                            passkeyVerifierContract: existingPkpData.passkeyVerifierContract,
                            pkpTokenId: existingPkpData.pkpTokenId // Added pkpTokenId to response
                        };
                    } else {
                        console.log(`[pkpPasskeyPlugin:checkRawIdExists] rawId ${rawIdToCheck} not found.`);
                        return { exists: false };
                    }
                } catch (error: unknown) {
                    console.error('[pkpPasskeyPlugin:checkRawIdExists] Error in endpoint:', error);
                    if (error instanceof APIError) throw error;
                    const err = error as Error;
                    throw new APIError('INTERNAL_SERVER_ERROR', { status: 500, cause: err, message: 'Failed to check rawId existence.' });
                }
            }
        )
    },
} satisfies BetterAuthPlugin);

// --- CLIENT PLUGIN ---
// Interface for the pkp_passkey object (matches server PkpPasskey)
export interface ClientPkpPasskey {
    rawId: string;
    pubKey: string;
    passkeyVerifierContract?: string; // RENAMED
    username: string; // Added username
    pubkeyCoordinates: { // Added passkey public key coordinates
        x: string; // hex format
        y: string; // hex format
    };
    pkpTokenId: string; // Added pkpTokenId
}

// Args for updateUserPasskeyInfo
export interface UpdatePasskeyInfoClientArgs {
    pkp_passkey: ClientPkpPasskey; // pkp_passkey is mandatory for update
}

// Expected response from updateUserPasskeyInfo
export interface UpdatePasskeyInfoClientResponse {
    user: {
        id: string;
        pkp_passkey: ClientPkpPasskey;
    };
    // Include other potential fields from APIError if $fetch handles errors this way
    error?: { message: string; code?: string; status?: number };
}

// Expected response from getUserPasskeyInfo
export interface GetUserPasskeyInfoClientResponse {
    pkp_passkey: ClientPkpPasskey | null;
    error?: { message: string; code?: string; status?: number };
}

// Args for checkRawIdExists
export interface CheckRawIdExistsClientArgs {
    rawId: string;
}

// Expected response from checkRawIdExists
export interface CheckRawIdExistsClientResponse {
    exists: boolean;
    userId?: string;
    pkpPublicKey?: string;
    passkeyVerifierContract?: string; // RENAMED
    pkpTokenId?: string; // Added pkpTokenId
    error?: { message: string; code?: string; status?: number };
}

export interface CheckRawIdExistsClientResponseSuccess {
    exists: boolean;
    pkpPublicKey?: string;          // PKP Public Key (hex format, 0x prefixed)
    userId?: string;                // User ID if exists
    passkeyVerifierContract?: string; // Address of the deployed EIP-1271 signer (0x prefixed)
    pkpTokenId?: string; // Added pkpTokenId
}

export const pkpPasskeyClientPlugin = () => ({
    id: 'pkpPasskeyPlugin',
    $InferServerPlugin: {} as ReturnType<typeof pkpPasskeyServerPlugin>,
    pathMethods: {
        '/pkp-passkey-plugin/get-user-passkey-info': 'GET',
        '/pkp-passkey-plugin/update-user-passkey-info': 'POST',
        '/pkp-passkey-plugin/check-rawid-exists': 'POST' // Added new endpoint
    },
    getActions: ($fetch: BetterFetch) => {
        return {
            updateUserPasskeyInfo: async (data: UpdatePasskeyInfoClientArgs): Promise<UpdatePasskeyInfoClientResponse> => {
                return $fetch('/pkp-passkey-plugin/update-user-passkey-info', {
                    method: 'POST',
                    body: data,
                });
            },
            getUserPasskeyInfo: async (): Promise<GetUserPasskeyInfoClientResponse> => {
                return $fetch('/pkp-passkey-plugin/get-user-passkey-info', {
                    method: 'GET',
                });
            },
            checkRawIdExists: async (data: CheckRawIdExistsClientArgs): Promise<CheckRawIdExistsClientResponse> => {
                return $fetch('/pkp-passkey-plugin/check-rawid-exists', {
                    method: 'POST',
                    body: data,
                });
            }
        };
    }
} satisfies BetterAuthClientPlugin); 