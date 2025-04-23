import { pgTable, text, jsonb, timestamp, pgEnum, customType } from 'drizzle-orm/pg-core';

// Define custom BYTEA type
const bytea = customType<{ data: Buffer }>({
    dataType() {
        return 'bytea';
    },
    toDriver(value: unknown): Buffer {
        if (Buffer.isBuffer(value)) return value;
        if (value instanceof Uint8Array) return Buffer.from(value);
        // Handle arrays of numbers
        if (Array.isArray(value)) return Buffer.from(value);
        // Default fallback for other cases
        return Buffer.from([]);
    },
    fromDriver(value: unknown): Buffer {
        if (Buffer.isBuffer(value)) return value;
        return Buffer.from([]);
    }
});

// Type enum for content records (snapshot or update)
export const contentTypeEnum = pgEnum('content_type', ['snapshot', 'update']);

// Content blocks (matches Content interface from hominio-db.ts)
export const content = pgTable('content', {
    // Content identifier (hash)
    cid: text('cid').primaryKey(),

    // 'snapshot' or 'update'
    type: contentTypeEnum('type').notNull(),

    // Raw binary data (serialized LoroDoc)
    raw: bytea('raw').notNull(),

    // Created timestamp
    createdAt: timestamp('created_at').notNull().defaultNow()
});

// Main document registry (matches Docs interface from hominio-db.ts)
export const docs = pgTable('docs', {
    // Stable document identity (like IPNS)
    pubKey: text('pub_key').primaryKey(),

    // Document owner
    owner: text('owner').notNull(),

    // Last update timestamp
    updatedAt: timestamp('updated_at').notNull().defaultNow(),

    // Content hash of latest snapshot (like IPFS)
    snapshotCid: text('snapshot_cid').references(() => content.cid, { onDelete: 'restrict' }),

    // Content hashes of incremental updates
    updateCids: text('update_cids').array().default([]),

    // Created timestamp
    createdAt: timestamp('created_at').notNull().defaultNow()
});

// Types for type safety
export type Doc = typeof docs.$inferSelect;
export type InsertDoc = typeof docs.$inferInsert;

export type Content = typeof content.$inferSelect;
export type InsertContent = typeof content.$inferInsert; 