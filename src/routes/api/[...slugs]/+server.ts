// Disable prerendering for this dynamic API endpoint
export const prerender = false;

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { getAuthClient } from '$lib/auth/auth';
import { db } from '$db';
import { docs, content } from '$db/schema';
import * as schema from '$db/schema';
import { eq, inArray, ne, and, sql, count } from 'drizzle-orm';
import type { Context } from 'elysia';
import { ULTRAVOX_API_KEY } from '$env/static/private';
import { hashService } from '$lib/KERNEL/hash-service';
import { loroService } from '$lib/KERNEL/loro-service';


// Get the auth instance immediately as this is server-side code
const auth = getAuthClient();

// Convert array-like object to Uint8Array
function arrayToUint8Array(arr: number[]): Uint8Array {
    return new Uint8Array(arr);
}

// Types for API responses
type ContentResponse = {
    cid: string;
    type: string;
    metadata?: Record<string, unknown>;
    hasBinaryData: boolean;
    contentLength: number;
    verified: boolean;
    createdAt: string;
    binaryData?: number[]; // Optional binary data as an array of numbers
};

// Combined document and content response
type DocWithContentResponse = {
    document: typeof docs.$inferSelect;
    content?: ContentResponse;
};

// Define interfaces for the API
interface SnapshotResponse {
    success: boolean;
    document?: any;
    newSnapshotCid?: string;
    appliedUpdates?: number;
    clearedUpdates?: number;
    deletedUpdates?: number;
    error?: string;
    details?: string;
}

const betterAuthView = (context: Context) => {
    const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"]
    // validate request method
    if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
        return auth.handler(context.request);
    } else {
        context.error(405)
    }
}

// Session protection middleware
const requireAuth = async ({ request, set }: Context) => {
    const session = await auth.api.getSession({
        headers: request.headers
    });

    if (!session) {
        set.status = 401;
        throw new Error('Unauthorized: Valid session required');
    }

    return {
        session
    };
}

// Function to fetch and verify content by CID
async function getContentByCid(cid: string): Promise<ContentResponse | null> {
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));

        if (!contentItem.length) {
            return null;
        }

        const item = contentItem[0];

        // Get binary data and metadata
        const binaryData = item.data as Buffer;
        const metadata = item.metadata as Record<string, unknown> || {};

        // Verify content integrity
        let verified = false;

        if (binaryData && binaryData.length > 0) {
            try {
                // Verify hash matches CID using binary data directly
                verified = await hashService.verifySnapshot(binaryData, cid);
            } catch (err) {
                console.error('Error verifying content hash:', err);
            }
        }

        // Return content with verification status
        return {
            cid: item.cid,
            type: item.type,
            metadata,
            hasBinaryData: binaryData.length > 0,
            contentLength: binaryData.length,
            verified,
            createdAt: item.createdAt.toISOString()
        };
    } catch (error) {
        console.error('Error retrieving content:', error);
        return null;
    }
}

// Function to get raw binary data by CID
async function getBinaryContentByCid(cid: string): Promise<Buffer | null> {
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));

        if (!contentItem.length) {
            return null;
        }

        // Return raw binary data
        return contentItem[0].data as Buffer;
    } catch (error) {
        console.error('Error retrieving binary content:', error);
        return null;
    }
}

const app = new Elysia({ prefix: '/api' })
    .use(
        cors({
            origin: 'http://localhost:5173',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            credentials: true,
            allowedHeaders: ['Content-Type', 'Authorization'],
        }),
    )
    .use(
        swagger({
            documentation: {
                info: {
                    title: 'Hominio Documentation',
                    version: '0.1.0'
                }
            }
        })
    )
    // Public routes
    .group('/auth', app => app
        .all('/*', betterAuthView)
    )
    // Call endpoints - protected with authentication
    .group('/call', app => app
        .derive(requireAuth)
        .post('/create', async ({ body, session, set }) => {
            try {
                // Cast body to handle unknown structure
                const requestData = body as Record<string, unknown>;

                // Log request for debugging
                console.log('Call API request with body:', JSON.stringify(requestData, null, 2));

                // Store vibeId in proper metadata field if provided
                // The API supports a 'metadata' field (without underscore)
                let requestBody: Record<string, unknown> = { ...requestData };

                // If _metadata exists (our temporary field), move it to the proper metadata field
                if (requestData._metadata && typeof requestData._metadata === 'object') {
                    const metadata = requestData._metadata as Record<string, unknown>;
                    if ('vibeId' in metadata) {
                        // Use object destructuring with rest to exclude _metadata
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { _metadata, ...rest } = requestData;
                        requestBody = {
                            ...rest,
                            metadata: {
                                vibeId: metadata.vibeId,
                                userId: session.user.id
                            }
                        };
                    }
                } else {
                    // Add userId to metadata if no custom metadata
                    const existingMetadata = (requestData.metadata as Record<string, unknown> | undefined) || {};
                    requestBody = {
                        ...requestData,
                        metadata: {
                            ...existingMetadata,
                            userId: session.user.id
                        }
                    };
                }

                console.log('Calling Ultravox API with:', JSON.stringify(requestBody, null, 2));

                // Forward the request to the Ultravox API
                const response = await fetch('https://api.ultravox.ai/api/calls', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': ULTRAVOX_API_KEY
                    },
                    body: JSON.stringify(requestBody)
                });

                console.log('Ultravox API response status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Ultravox API error:', errorText);
                    set.status = response.status;
                    return {
                        error: 'Error calling Ultravox API',
                        details: errorText
                    };
                }

                // Return the Ultravox API response directly
                const data = await response.json();
                console.log('Ultravox API response data:', JSON.stringify(data, null, 2));
                return data;
            } catch (error) {
                console.error('Error creating call:', error);
                set.status = 500;
                return {
                    error: 'Failed to create call',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
    )
    // Protected routes
    .group('/me', app => app
        .derive(requireAuth) // Use derive instead of use for type safety
        .get('/hi', ({ session }) => {
            return {
                message: 'Protected hello!',
                user: session.user
            }
        })
    )
    // Docs routes - restructured for better Eden Treaty compatibility
    .group('/docs', app => app
        .derive(requireAuth)
        // List all docs (root endpoint with dedicated path)
        .get('/list', async ({ session }) => {
            // Get only docs owned by the current user
            return await db.select().from(docs)
                .where(eq(docs.ownerId, session.user.id))
                .orderBy(docs.updatedAt);
        })
        // Create new document
        .post('/', async ({ body, session, set }) => {
            try {
                // Parse request body to extract optional snapshot
                const createDocBody = body as {
                    binarySnapshot?: number[];
                    pubKey?: string; // Accept pubKey from client
                    title?: string;
                    description?: string;
                };

                let snapshot, cid, pubKey, jsonState;

                // If a snapshot is provided, use it; otherwise create a default one
                if (createDocBody.binarySnapshot && Array.isArray(createDocBody.binarySnapshot)) {
                    // Use the provided snapshot
                    const snapshotData = arrayToUint8Array(createDocBody.binarySnapshot);

                    // Verify this is a valid Loro snapshot
                    const loroDoc = loroService.createEmptyDoc();
                    try {
                        // Import to verify it's valid
                        loroDoc.import(snapshotData);

                        // Generate state information from the imported doc
                        snapshot = snapshotData;
                        cid = await hashService.hashSnapshot(snapshotData);
                        // Use client's pubKey if provided, otherwise generate one
                        pubKey = createDocBody.pubKey || loroService.generatePublicKey();
                        jsonState = loroDoc.toJSON();
                    } catch (error) {
                        set.status = 400;
                        return {
                            success: false,
                            error: 'Invalid Loro snapshot',
                            details: error instanceof Error ? error.message : 'Unknown error'
                        };
                    }
                } else {
                    // Create a default document if no snapshot provided
                    ({ snapshot, cid, jsonState } = await loroService.createDemoDoc());
                    // Use client's pubKey if provided, otherwise use the one from createDemoDoc
                    pubKey = createDocBody.pubKey || loroService.generatePublicKey();
                }

                // First, store the content - *only if it doesn't exist*
                let contentResult: (typeof schema.content.$inferSelect)[] | null = null;
                const existingContent = await db.select().from(schema.content).where(eq(schema.content.cid, cid));

                if (existingContent.length === 0) {
                    // Content doesn't exist, insert it
                    const contentEntry: schema.InsertContent = {
                        cid,
                        type: 'snapshot',
                        data: Buffer.from(snapshot), // Store binary data directly
                        metadata: { docState: jsonState } // Store metadata separately
                    };
                    contentResult = await db.insert(schema.content)
                        .values(contentEntry)
                        .returning();
                    console.log('Created content entry:', contentResult[0].cid);
                } else {
                    // Content already exists, use the existing one
                    console.log('Content already exists with CID:', cid);
                    contentResult = existingContent; // Use existing content data if needed later
                }

                // Check if content operation was successful (either insert or found existing)
                if (!contentResult || contentResult.length === 0) {
                    set.status = 500;
                    return { success: false, error: 'Failed to ensure content entry exists' };
                }

                // Create document entry with the current user as owner
                const docEntry: schema.InsertDoc = {
                    pubKey,
                    snapshotCid: cid,
                    updateCids: [],
                    ownerId: session.user.id, // Associate with current user
                    title: createDocBody.title || 'New Loro Document',
                    description: createDocBody.description || 'Created on ' + new Date().toLocaleString()
                };

                // Save the document
                const docResult = await db.insert(schema.docs)
                    .values(docEntry)
                    .returning();

                console.log('Created document entry:', docResult[0].pubKey);

                // Return the created document
                return {
                    success: true,
                    document: docResult[0]
                };
            } catch (error) {
                console.error('Error creating document:', error);
                set.status = 500;
                return {
                    success: false,
                    error: 'Failed to create document',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
        // Get a specific document by pubKey
        .get('/:pubKey', async ({ params: { pubKey }, query, session, set }) => {
            try {
                // Get doc by pubKey
                const doc = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
                if (!doc.length) {
                    set.status = 404;
                    return { error: 'Document not found' };
                }

                const document = doc[0];

                // Verify the user owns this document
                if (document.ownerId !== session.user.id) {
                    set.status = 403;
                    return { error: 'Not authorized to access this document' };
                }

                // Create the response including document data
                const response: DocWithContentResponse = {
                    document
                };

                // If document has a snapshot CID, fetch and include the content
                if (document.snapshotCid) {
                    const contentData = await getContentByCid(document.snapshotCid);
                    if (contentData) {
                        response.content = contentData;

                        // Check if binary data was requested using includeBinary query param
                        const includeBinary = query?.includeBinary === "true";
                        if (includeBinary) {
                            // Get the binary data directly
                            const binaryData = await getBinaryContentByCid(document.snapshotCid);
                            if (binaryData) {
                                // Add binary data to the response
                                response.content.binaryData = Array.from(binaryData);
                            }
                        }
                    }
                }

                // Return the combined document and content data
                return response;
            } catch (error) {
                console.error('Error retrieving document:', error);
                set.status = 500;
                return {
                    error: 'Failed to retrieve document',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
        // Document update routes - grouped for clean Eden Treaty paths
        .group('/:pubKey/update', app => app
            .post('/', async ({ params: { pubKey }, body, session, set }) => {
                try {
                    // Verify document exists and user owns it
                    const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
                    if (!docResult.length) {
                        set.status = 404;
                        return { error: 'Document not found' };
                    }

                    const document = docResult[0];

                    // Verify the user owns this document
                    if (document.ownerId !== session.user.id) {
                        set.status = 403;
                        return { error: 'Not authorized to update this document' };
                    }

                    // Parse the update data from request body, handling both direct and wrapped formats
                    const updateBody = body as { data?: { binaryUpdate: number[] }; binaryUpdate?: number[] };

                    // Extract binaryUpdate from either format
                    const binaryUpdate = updateBody.data?.binaryUpdate || updateBody.binaryUpdate;

                    if (!binaryUpdate || !Array.isArray(binaryUpdate)) {
                        set.status = 400;
                        return { error: 'Invalid update data. Binary update required.' };
                    }

                    // Convert the array to Uint8Array
                    const binaryUpdateArray = arrayToUint8Array(binaryUpdate);

                    // IMPORTANT: Calculate CID directly from the client's provided update
                    // without modifying it or recreating it
                    const cid = await hashService.hashSnapshot(binaryUpdateArray);

                    // Store the update content exactly as received from client
                    const updateContentEntry: schema.InsertContent = {
                        cid,
                        type: 'update',
                        // Store binary data directly without any modification
                        data: Buffer.from(binaryUpdateArray),
                        // Only store minimal metadata
                        metadata: {
                            documentPubKey: pubKey
                        }
                    };

                    // Check if this update already exists before inserting
                    const existingUpdate = await db.select().from(content).where(eq(content.cid, cid));
                    let updateResult;

                    if (existingUpdate.length === 0) {
                        // Insert only if it doesn't exist
                        updateResult = await db.insert(schema.content)
                            .values(updateContentEntry)
                            .returning();
                        console.log('Created update content entry:', updateResult[0].cid);
                    } else {
                        console.log('Update already exists with CID:', cid);
                        updateResult = existingUpdate;
                    }

                    // Update the document to append this CID to the updateCids array
                    // Use SQL array append operation for atomic update without needing to fetch first
                    const updateResult2 = await db.update(schema.docs)
                        .set({
                            // Use SQL to append CID only if it doesn't already exist in the array
                            updateCids: sql`(
                                CASE 
                                    WHEN ${cid} = ANY(${docs.updateCids}) THEN ${docs.updateCids}
                                    ELSE array_append(COALESCE(${docs.updateCids}, ARRAY[]::text[]), ${cid})
                                END
                            )`,
                            updatedAt: new Date()
                        })
                        .where(eq(schema.docs.pubKey, pubKey))
                        .returning();

                    // Log the result
                    const wasAdded = !document.updateCids?.includes(cid);
                    if (wasAdded) {
                        console.log(`Added update ${cid} to document's updateCids array`);
                    } else {
                        console.log(`Update ${cid} already in document's updateCids array, skipping`);
                    }

                    // Return success response with updated CIDs
                    return {
                        success: true,
                        updateCid: cid,
                        updatedCids: updateResult2[0].updateCids || []
                    };
                } catch (error) {
                    console.error('Error updating document:', error);
                    set.status = 500;
                    return {
                        error: 'Failed to update document',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            })
            // Add batch update endpoint
            .post('/batch', async ({ params: { pubKey }, body, session, set }) => {
                try {
                    // Verify document exists and user owns it
                    const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
                    if (!docResult.length) {
                        set.status = 404;
                        return { error: 'Document not found' };
                    }

                    const document = docResult[0];

                    // Verify the user owns this document
                    if (document.ownerId !== session.user.id) {
                        set.status = 403;
                        return { error: 'Not authorized to update this document' };
                    }

                    // Parse the update data from request body, expecting an array of CIDs
                    const updateBody = body as { updateCids?: string[] };
                    const updateCids = updateBody.updateCids;

                    if (!updateCids || !Array.isArray(updateCids) || updateCids.length === 0) {
                        set.status = 400;
                        return { error: 'Invalid request. Array of update CIDs required.' };
                    }

                    console.log(`Processing batch update request with ${updateCids.length} CIDs for document ${pubKey}`);

                    // Verify all the updates exist in the content store
                    const existingContentItems = await db
                        .select({ cid: content.cid })
                        .from(content)
                        .where(inArray(content.cid, updateCids));

                    const existingCids = new Set(existingContentItems.map(item => item.cid));
                    const missingCids = updateCids.filter(cid => !existingCids.has(cid));

                    if (missingCids.length > 0) {
                        set.status = 400;
                        return {
                            error: 'Some update CIDs are missing in the content store',
                            missing: missingCids
                        };
                    }

                    // Get current updateCids from document
                    const currentUpdateCids = document.updateCids || [];

                    // Filter to only CIDs that aren't already registered
                    const newUpdateCids = updateCids.filter(cid => !currentUpdateCids.includes(cid));

                    if (newUpdateCids.length === 0) {
                        // All updates are already registered
                        return {
                            success: true,
                            message: 'All updates are already registered with this document',
                            registeredCount: 0,
                            updatedCids: currentUpdateCids
                        };
                    }

                    // Add new CIDs to the document's updateCids array
                    const updatedCids = [...currentUpdateCids, ...newUpdateCids];

                    // Update the document
                    const updateResult = await db.update(schema.docs)
                        .set({
                            updateCids: updatedCids,
                            updatedAt: new Date()
                        })
                        .where(eq(schema.docs.pubKey, pubKey))
                        .returning();

                    console.log(`Registered ${newUpdateCids.length} updates with document ${pubKey}`);

                    // Return success
                    return {
                        success: true,
                        registeredCount: newUpdateCids.length,
                        updatedCids: updateResult[0].updateCids || []
                    };
                } catch (error) {
                    console.error('Error batch updating document:', error);
                    set.status = 500;
                    return {
                        error: 'Failed to batch update document',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            })
        )
        // Document snapshot routes - grouped for clean Eden Treaty paths
        .group('/:pubKey/snapshot', app => app
            .post('/', async ({ params: { pubKey }, body, session, set }) => {
                try {
                    // Verify document exists and user owns it
                    const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
                    if (!docResult.length) {
                        set.status = 404;
                        return { error: 'Document not found' };
                    }

                    const document = docResult[0];

                    // Verify the user owns this document
                    if (document.ownerId !== session.user.id) {
                        set.status = 403;
                        return { error: 'Not authorized to update this document' };
                    }

                    // Parse the snapshot data from request body
                    const snapshotBody = body as {
                        data?: { binarySnapshot: number[] };
                        binarySnapshot?: number[]
                    };

                    // Extract binarySnapshot from either format
                    const binarySnapshot = snapshotBody.data?.binarySnapshot || snapshotBody.binarySnapshot;

                    if (!binarySnapshot || !Array.isArray(binarySnapshot)) {
                        set.status = 400;
                        return { error: 'Invalid snapshot data. Binary snapshot required.' };
                    }

                    // Convert the array to Uint8Array for processing
                    const snapshotData = arrayToUint8Array(binarySnapshot);

                    // Verify this is a valid Loro snapshot
                    const loroDoc = loroService.createEmptyDoc();
                    try {
                        // Import to verify it's valid
                        loroDoc.import(snapshotData);
                    } catch (error) {
                        set.status = 400;
                        return {
                            error: 'Invalid Loro snapshot',
                            details: error instanceof Error ? error.message : 'Unknown error'
                        };
                    }

                    // Generate a CID for the snapshot
                    const snapshotCid = await hashService.hashSnapshot(snapshotData);

                    // Check if this exact snapshot already exists (same CID)
                    if (snapshotCid === document.snapshotCid) {
                        return {
                            success: true,
                            document,
                            snapshotCid,
                            message: 'Document unchanged, snapshot is already up to date'
                        };
                    }

                    // Check if content with this CID already exists
                    const existingContent = await db.select()
                        .from(content)
                        .where(eq(content.cid, snapshotCid));

                    // If the content already exists, we can just update the document to point to it
                    if (existingContent.length === 0) {
                        // Create a content entry for the snapshot
                        const contentEntry: schema.InsertContent = {
                            cid: snapshotCid,
                            type: 'snapshot',
                            // Store binary data directly
                            data: Buffer.from(snapshotData),
                            // Store metadata with docState if available
                            metadata: {
                                updatedAt: new Date().toISOString(),
                                previousSnapshotCid: document.snapshotCid
                            }
                        };

                        // Store the snapshot content
                        const contentResult = await db.insert(schema.content)
                            .values(contentEntry)
                            .returning();

                        console.log('Created snapshot content entry:', contentResult[0].cid);
                    } else {
                        console.log('Content already exists with CID:', snapshotCid);
                    }

                    // Update the document's snapshotCid to point to the new snapshot
                    const updatedDoc = await db.update(schema.docs)
                        .set({
                            snapshotCid: snapshotCid,
                            updatedAt: new Date()
                        })
                        .where(eq(schema.docs.pubKey, pubKey))
                        .returning();

                    // Return success response
                    return {
                        success: true,
                        document: updatedDoc[0],
                        snapshotCid
                    };
                } catch (error) {
                    console.error('Error updating document snapshot:', error);
                    set.status = 500;
                    return {
                        error: 'Failed to update document snapshot',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            })
            // Consolidate snapshot route
            .post('/create', async ({ params: { pubKey }, session, set }) => {
                try {
                    // Verify document exists and user owns it
                    const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
                    if (!docResult.length) {
                        set.status = 404;
                        return { error: 'Document not found' };
                    }

                    const document = docResult[0];

                    // Verify the user owns this document
                    if (document.ownerId !== session.user.id) {
                        set.status = 403;
                        return { error: 'Not authorized to snapshot this document' };
                    }

                    // Check if the document has a snapshot and updates
                    if (!document.snapshotCid) {
                        set.status = 400;
                        return { error: 'Document has no snapshot to consolidate' };
                    }

                    if (!document.updateCids || document.updateCids.length === 0) {
                        set.status = 400;
                        return { error: 'No updates to consolidate into a new snapshot' };
                    }

                    console.log(`Creating consolidated snapshot for document ${pubKey} with ${document.updateCids.length} updates`);

                    // 1. Load the base snapshot
                    const snapshotData = await getBinaryContentByCid(document.snapshotCid);
                    if (!snapshotData) {
                        set.status = 500;
                        return { error: 'Failed to load document snapshot' };
                    }

                    // Create a Loro document from the snapshot
                    const loroDoc = loroService.createEmptyDoc();
                    loroDoc.import(new Uint8Array(snapshotData));
                    console.log(`Loaded base snapshot from CID: ${document.snapshotCid}`);

                    // 2. Load all updates in memory first
                    const appliedUpdateCids: string[] = [];
                    const updatesData: Uint8Array[] = [];

                    for (const updateCid of document.updateCids) {
                        const updateData = await getBinaryContentByCid(updateCid);
                        if (updateData) {
                            updatesData.push(new Uint8Array(updateData));
                            appliedUpdateCids.push(updateCid);
                        } else {
                            console.warn(`Could not load update data for CID: ${updateCid}`);
                        }
                    }

                    // 3. Apply all updates in one batch operation (much faster than individual imports)
                    if (updatesData.length > 0) {
                        try {
                            console.log(`Applying ${updatesData.length} updates in batch`);
                            loroDoc.importBatch(updatesData);
                            console.log(`Successfully applied ${updatesData.length} updates in batch`);
                        } catch (err) {
                            console.error('Error applying updates in batch:', err);
                            set.status = 500;
                            return { error: 'Failed to apply updates in batch' };
                        }
                    }

                    // 4. Export a new snapshot
                    const newSnapshotData = loroDoc.export({ mode: 'snapshot' });
                    const newSnapshotCid = await hashService.hashSnapshot(newSnapshotData);

                    // 5. Save the new snapshot to content store
                    await db.insert(content).values({
                        cid: newSnapshotCid,
                        type: 'snapshot',
                        data: Buffer.from(newSnapshotData),
                        metadata: { documentPubKey: pubKey },
                        createdAt: new Date()
                    });

                    console.log(`Created new consolidated snapshot with CID: ${newSnapshotCid}`);

                    // 6. Update the document to use the new snapshot and clear the update list
                    const updatedDoc = await db.update(schema.docs)
                        .set({
                            snapshotCid: newSnapshotCid,
                            updateCids: [], // Clear all updates as they're now in the snapshot
                            updatedAt: new Date()
                        })
                        .where(eq(schema.docs.pubKey, pubKey))
                        .returning();

                    // Clean up any consolidated updates if needed
                    let deletedUpdates = 0;
                    if (appliedUpdateCids.length > 0) {
                        try {
                            console.log(`Cleaning up ${appliedUpdateCids.length} consolidated updates`);

                            // Get all documents except this one
                            const allOtherDocs = await db.select().from(docs).where(ne(docs.pubKey, pubKey));

                            // Keep track of which update CIDs are referenced by other documents
                            const updateCidsReferencedByOtherDocs = new Set<string>();

                            // Check each document for references to our consolidated updates
                            for (const doc of allOtherDocs) {
                                if (doc.updateCids) {
                                    for (const cid of doc.updateCids) {
                                        if (appliedUpdateCids.includes(cid)) {
                                            updateCidsReferencedByOtherDocs.add(cid);
                                        }
                                    }
                                }
                            }

                            // localState is client-side only and won't exist in server database
                            // Skip checking for it here

                            // Filter out update CIDs that are still referenced by other documents
                            const updateCidsToDelete = appliedUpdateCids.filter(
                                cid => !updateCidsReferencedByOtherDocs.has(cid)
                            );

                            if (updateCidsToDelete.length > 0) {
                                console.log(`${updateCidsToDelete.length} update CIDs can be safely deleted`);

                                // Double-check content metadata for any other references before deleting
                                // Some content items might have references in their metadata
                                const safeCidsToDelete = [];
                                for (const cid of updateCidsToDelete) {
                                    // Check if any other content refers to this CID in metadata
                                    const refCount = await db
                                        .select({ count: count() })
                                        .from(content)
                                        .where(
                                            and(
                                                ne(content.cid, cid),
                                                sql`${content.metadata}::text LIKE ${'%' + cid + '%'}`
                                            )
                                        );

                                    // If no references found, safe to delete
                                    if (refCount[0].count === 0) {
                                        safeCidsToDelete.push(cid);
                                    } else {
                                        console.log(`Update ${cid} is referenced in content metadata, skipping deletion`);
                                    }
                                }

                                if (safeCidsToDelete.length > 0) {
                                    // Delete the update CIDs that are not referenced by any other document or content
                                    const deleteResult = await db.delete(content)
                                        .where(inArray(content.cid, safeCidsToDelete));

                                    console.log(`Deleted ${deleteResult.rowCount} consolidated updates`);

                                    // Store the count for the response
                                    deletedUpdates = deleteResult.rowCount;
                                } else {
                                    console.log(`No updates can be safely deleted after metadata check`);
                                    deletedUpdates = 0;
                                }
                            } else {
                                console.log(`All consolidated updates are still referenced by other documents, none deleted`);
                                deletedUpdates = 0;
                            }
                        } catch (cleanupErr) {
                            console.error(`Error cleaning up consolidated updates:`, cleanupErr);
                            deletedUpdates = 0;
                        }
                    } else {
                        deletedUpdates = 0;
                    }

                    // 8. Return success with stats
                    const response: SnapshotResponse = {
                        success: true,
                        document: updatedDoc[0],
                        newSnapshotCid,
                        appliedUpdates: appliedUpdateCids.length,
                        clearedUpdates: document.updateCids.length,
                        deletedUpdates
                    };

                    return response;
                } catch (error) {
                    console.error('Error creating consolidated snapshot:', error);
                    set.status = 500;
                    return {
                        error: 'Failed to create consolidated snapshot',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            })
        )
    )
    // Content routes - restructured for better Eden Treaty compatibility
    .group('/content', app => app
        .derive(requireAuth)
        // List all content (root endpoint with dedicated path)
        .get('/list', async () => {
            // Get all content items
            return await db.select().from(content);
        })
        // Batch operations for efficient sync
        .group('/batch', app => app
            // Check existence of multiple CIDs at once
            .post('/exists', async ({ body, set }) => {
                try {
                    const { cids } = body as { cids: string[] };

                    if (!Array.isArray(cids) || cids.length === 0) {
                        set.status = 400;
                        return { error: 'Invalid request. Array of CIDs required.' };
                    }

                    // Get unique cids only
                    const uniqueCids = [...new Set(cids)];

                    // Find which content items exist
                    const existingItems = await db
                        .select({ cid: content.cid })
                        .from(content)
                        .where(inArray(content.cid, uniqueCids));

                    // Create a map of which CIDs exist
                    const existingCids = new Set(existingItems.map(item => item.cid));
                    const results = uniqueCids.map(cid => ({
                        cid,
                        exists: existingCids.has(cid)
                    }));

                    return { results };
                } catch (error) {
                    console.error('Error checking batch existence:', error);
                    set.status = 500;
                    return {
                        error: 'Failed to check content existence',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            })
            // Upload multiple content items at once
            .post('/upload', async ({ body, set }) => {
                try {
                    const { items } = body as {
                        items: Array<{
                            cid: string,
                            type: 'snapshot' | 'update',
                            binaryData: number[],
                            metadata?: Record<string, unknown>
                        }>
                    };

                    if (!Array.isArray(items) || items.length === 0) {
                        set.status = 400;
                        return { error: 'Invalid request. Array of content items required.' };
                    }

                    // Get unique items by CID
                    const uniqueItems = items.filter((item, index, self) =>
                        index === self.findIndex(t => t.cid === item.cid)
                    );

                    // Check which items already exist
                    const cids = uniqueItems.map(item => item.cid);
                    const existingItems = await db
                        .select({ cid: content.cid })
                        .from(content)
                        .where(inArray(content.cid, cids));

                    const existingCids = new Set(existingItems.map(item => item.cid));

                    // Filter to only new items that don't exist yet
                    const newItems = uniqueItems.filter(item => !existingCids.has(item.cid));

                    if (newItems.length === 0) {
                        return {
                            success: true,
                            message: 'All items already exist',
                            uploaded: 0,
                            total: uniqueItems.length
                        };
                    }

                    // Insert new content items
                    const contentEntries = newItems.map(item => ({
                        cid: item.cid,
                        type: item.type,
                        data: Buffer.from(new Uint8Array(item.binaryData)),
                        metadata: item.metadata || {},
                        createdAt: new Date()
                    }));

                    await db.insert(content).values(contentEntries);

                    return {
                        success: true,
                        message: `Uploaded ${newItems.length} new content items`,
                        uploaded: newItems.length,
                        total: uniqueItems.length
                    };
                } catch (error) {
                    console.error('Error uploading batch content:', error);
                    set.status = 500;
                    return {
                        error: 'Failed to upload content batch',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            })
        )
        // Get specific content by CID
        .get('/:cid', async ({ params: { cid }, set }) => {
            try {
                const contentData = await getContentByCid(cid);

                if (!contentData) {
                    set.status = 404;
                    return { error: 'Content not found' };
                }

                return contentData;
            } catch (error) {
                console.error('Error retrieving content:', error);
                set.status = 500;
                return {
                    error: 'Failed to retrieve content',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        })
        // Binary data endpoint - clean Eden Treaty path
        .group('/:cid/binary', app => app
            .get('/', async ({ params: { cid }, set }) => {
                try {
                    const binaryData = await getBinaryContentByCid(cid);

                    if (!binaryData) {
                        set.status = 404;
                        return { error: 'Binary content not found' };
                    }

                    // Return in a format that can be transported over JSON
                    return {
                        cid,
                        binaryData: Array.from(binaryData) // Convert to array for transport
                    };
                } catch (error) {
                    console.error('Error retrieving binary content:', error);
                    set.status = 500;
                    return {
                        error: 'Failed to retrieve binary content',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            })
        )
    )
    .onError(({ code, error }) => {
        console.error(`API Error [${code}]:`, error);
        return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Internal Server Error'
        }), {
            status: code === 'NOT_FOUND' ? 404 :
                code === 'INTERNAL_SERVER_ERROR' && error.message.includes('Unauthorized') ? 401 : 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'http://localhost:5173',
                'Access-Control-Allow-Credentials': 'true'
            }
        });
    });

// Use exported RequestHandler instead of local type
export type App = typeof app;
export const GET = async ({ request }: { request: Request }) => app.handle(request);
export const POST = async ({ request }: { request: Request }) => app.handle(request);
export const OPTIONS = async ({ request }: { request: Request }) => app.handle(request);
export const PUT = async ({ request }: { request: Request }) => app.handle(request);
export const DELETE = async ({ request }: { request: Request }) => app.handle(request);
