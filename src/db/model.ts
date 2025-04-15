import { t } from 'elysia'
import { docs, content } from './schema'

// Create models with type refinements matching hominio-db.ts interfaces
export const db = {
    insert: {
        // Matches Docs interface from hominio-db.ts (without localState for server)
        docs: t.Object({
            pubKey: t.String(),          // Stable document identity (like IPNS)
            owner: t.String(),           // Document owner (not ownerId)
            updatedAt: t.String(),       // Last update timestamp
            snapshotCid: t.Optional(t.String()), // Content hash of latest snapshot
            updateCids: t.Optional(t.Array(t.String())) // Content hashes of updates
        }),

        // Matches Content interface from hominio-db.ts
        content: t.Object({
            cid: t.String(),             // Content identifier (hash)
            type: t.String(),            // 'snapshot' or 'update'
            raw: t.Any(),                // Raw binary data (serialized LoroDoc)
            metadata: t.Record(t.String(), t.Any()), // Mirrored metadata for indexability
            createdAt: t.String()
        })
    },
    select: {
        docs,
        content
    }
} as const; 