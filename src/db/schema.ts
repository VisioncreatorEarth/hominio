import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const docs = pgTable('docs', {
    id: uuid('id').defaultRandom().primaryKey(),
    content: jsonb('content').notNull(),
    metadata: jsonb('metadata').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow()
});

// Types for type safety
export type Doc = typeof docs.$inferSelect;
export type InsertDoc = typeof docs.$inferInsert; 