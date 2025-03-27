import { z } from 'zod';

/**
 * Journal Entry schema definition
 * 
 * Defines the structure and behavior of Journal entries in the Loro document
 */
const journalEntrySchema = {
    name: 'journalEntry',
    docName: 'journal',
    collectionName: 'entries',
    containerType: 'map', // Use a LoroMap
    schema: z.object({
        id: z.string().uuid(),
        title: z.string().min(1),
        content: z.string().min(1),
        mood: z.string().optional(),
        createdAt: z.number(),
        tags: z.array(z.string()).default([])
    })
};

// Export the type derived from the schema
export type JournalEntry = z.infer<typeof journalEntrySchema.schema>;

// Export the schema as default for auto-discovery
export default journalEntrySchema; 