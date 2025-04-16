import { Elysia } from 'elysia';
import { db } from '$db';
import { docs, content } from '$db/schema';
import * as schema from '$db/schema';
import { eq, inArray, ne, and, sql, count, or } from 'drizzle-orm';
import { hashService } from '$lib/KERNEL/hash-service';
import { loroService } from '$lib/KERNEL/loro-service';
// Import capability functions and types
import { canRead, canWrite, canDelete, type CapabilityUser } from '$lib/KERNEL/hominio-caps';
// Import the constant directly from its source
import { GENESIS_HOMINIO } from '$db/constants';

// Helper function for binary data conversion
function arrayToUint8Array(arr: number[]): Uint8Array {
    return new Uint8Array(arr);
}

// Define stricter types
interface SessionUser extends CapabilityUser { // Extend CapabilityUser for type compatibility
    [key: string]: unknown; // Safer than any
}

interface AuthContext {
    session: { user: SessionUser };
    body?: unknown;      // Safer than any
    set?: { status?: number | string;[key: string]: unknown }; // Model `set` more accurately
    params?: Record<string, string | undefined>; // Assuming string params
    query?: Record<string, string | undefined>;  // Assuming string queries
}

interface ContentResponse {
    cid: string;
    type: string;
    metadata: Record<string, unknown>;
    hasBinaryData: boolean;
    contentLength: number;
    verified: boolean;
    createdAt: string;
    binaryData?: number[]; // Optional binary data
}

interface DocGetResponse {
    document: schema.Doc;
    content?: ContentResponse | null;
}

// Content-related helper functions
async function getContentByCid(cid: string): Promise<ContentResponse | null> { // Use defined type
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));

        if (!contentItem.length) {
            return null;
        }

        const item = contentItem[0];

        // Get binary data and metadata
        const binaryData = item.raw as Buffer;
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

async function getBinaryContentByCid(cid: string): Promise<Buffer | null> {
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));

        if (!contentItem.length) {
            return null;
        }

        // Return raw binary data
        return contentItem[0].raw as Buffer;
    } catch (error) {
        console.error('Error retrieving binary content:', error);
        return null;
    }
}

// Create docs handlers without prefix
export const docsHandlers = new Elysia()
    // List all docs
    .get('/list', async ({ session }: AuthContext) => {
        // Get docs owned by the current user OR the genesis owner
        // Type assertion for session user ID needed here if DB expects string
        const userId = session.user.id as string;
        return await db.select().from(docs)
            .where(or(
                eq(docs.owner, userId),
                eq(docs.owner, GENESIS_HOMINIO)
            ))
            .orderBy(docs.updatedAt);
    })
    // Create new document
    .post('/', async ({ body, session, set }: AuthContext) => {
        try {
            // Use type assertion for body after checking its type if necessary
            const createDocBody = body as {
                binarySnapshot?: number[];
                pubKey?: string;
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
                    if (set) set.status = 400;
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
                    raw: Buffer.from(snapshot), // Store binary data directly
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
                if (set) set.status = 500;
                return { success: false, error: 'Failed to ensure content entry exists' };
            }

            // Create document entry with the current user as owner
            const userId = session.user.id as string;
            const docEntry: schema.InsertDoc = {
                pubKey,
                snapshotCid: cid,
                updateCids: [],
                owner: userId // Associate with current user
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
            if (set?.status) set.status = 500;
            return {
                success: false,
                error: 'Failed to create document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    // Get a specific document by pubKey
    .get('/:pubKey', async ({ params, query, session, set }: AuthContext): Promise<DocGetResponse | { error: string; details?: string }> => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Get doc by pubKey
            const doc = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!doc.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }

            const document = doc[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;

            // *** Use canRead for authorization ***
            if (!canRead(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to access this document' };
            }

            // Create the response using the defined interface
            const response: DocGetResponse = {
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
                        if (binaryData && response.content) {
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
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to retrieve document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    // Delete a specific document by pubKey
    .delete('/:pubKey', async ({ params, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }

            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }
            const document = docResult[0];

            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;
            if (!canDelete(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to delete this document' };
            }

            console.log(`Attempting to delete document ${pubKey} owned by ${document.owner}`);

            const cidsToDelete: string[] = [];
            if (document.snapshotCid) {
                cidsToDelete.push(document.snapshotCid);
            }
            if (document.updateCids && document.updateCids.length > 0) {
                cidsToDelete.push(...document.updateCids);
            }

            await db.delete(docs).where(eq(docs.pubKey, pubKey));
            console.log(`Deleted document entry ${pubKey}`);

            if (cidsToDelete.length > 0) {
                console.log(`Attempting to delete ${cidsToDelete.length} associated content items...`);
                try {
                    const deleteContentResult = await db.delete(content).where(inArray(content.cid, cidsToDelete));
                    console.log(`Deleted ${deleteContentResult.rowCount} content items.`);
                } catch (contentDeleteError: unknown) {
                    console.error(`Error deleting associated content for doc ${pubKey}:`, contentDeleteError);
                }
            }

            return { success: true, message: `Document ${pubKey} deleted successfully` };

        } catch (error: unknown) {
            console.error('Error deleting document:', error);
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to delete document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });

// Add nested routes for update and snapshot
// Document update routes
docsHandlers.group('/:pubKey/update', app => app
    // Add batch update endpoint
    .post('/batch', async ({ params, body, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Verify document exists and user owns it
            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }

            const document = docResult[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;

            // *** Use canWrite for authorization ***
            if (!canWrite(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to update this document' };
            }

            // Parse the update data from request body, expecting an array of CIDs
            const updateBody = body as { updateCids?: string[] };
            const updateCids = updateBody.updateCids;

            if (!updateCids || !Array.isArray(updateCids) || updateCids.length === 0) {
                if (set?.status) set.status = 400;
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
                if (set?.status) set.status = 400;
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
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to batch update document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    .post('/', async ({ params, body, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Verify document exists and user owns it
            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }

            const document = docResult[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;

            // *** Use canWrite for authorization ***
            if (!canWrite(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to update this document' };
            }

            // Parse the update data from request body, handling both direct and wrapped formats
            const updateBody = body as { data?: { binaryUpdate: number[] }; binaryUpdate?: number[] };

            // Extract binaryUpdate from either format
            const binaryUpdate = updateBody.data?.binaryUpdate || updateBody.binaryUpdate;

            if (!binaryUpdate || !Array.isArray(binaryUpdate)) {
                if (set?.status) set.status = 400;
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
                raw: Buffer.from(binaryUpdateArray),
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
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to update document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
);

// Document snapshot routes
docsHandlers.group('/:pubKey/snapshot', app => app
    .post('/', async ({ params, body, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Verify document exists and user owns it
            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }

            const document = docResult[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;

            // *** Use canWrite for authorization ***
            if (!canWrite(capabilityUser, document)) {
                if (set?.status) set.status = 403;
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
                if (set?.status) set.status = 400;
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
                if (set?.status) set.status = 400;
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
                    raw: Buffer.from(snapshotData),
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
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to update document snapshot',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    // Add the missing endpoint for consolidated snapshots
    .post('/create', async ({ params, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Verify document exists and user owns it
            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }

            const document = docResult[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;

            // *** Use canWrite for authorization ***
            if (!canWrite(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to snapshot this document' };
            }

            // Check if the document has a snapshot and updates
            if (!document.snapshotCid) {
                if (set?.status) set.status = 400;
                return { error: 'Document has no snapshot to consolidate' };
            }

            if (!document.updateCids || document.updateCids.length === 0) {
                if (set?.status) set.status = 400;
                return { error: 'No updates to consolidate into a new snapshot' };
            }

            console.log(`Creating consolidated snapshot for document ${pubKey} with ${document.updateCids.length} updates`);

            // 1. Load the base snapshot
            const snapshotData = await getBinaryContentByCid(document.snapshotCid);
            if (!snapshotData) {
                if (set?.status) set.status = 500;
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
                    if (set?.status) set.status = 500;
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
                raw: Buffer.from(newSnapshotData),
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
                            deletedUpdates = deleteResult.rowCount ?? 0;
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
            return {
                success: true,
                document: updatedDoc[0],
                newSnapshotCid,
                appliedUpdates: appliedUpdateCids.length,
                clearedUpdates: document.updateCids.length,
                deletedUpdates
            };
        } catch (error) {
            console.error('Error creating consolidated snapshot:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to create consolidated snapshot',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
);

export default docsHandlers; 