import { z } from 'zod';

/**
 * Todo schema definition
 * 
 * Defines the structure and behavior of Todo items in the Loro document
 */
const todoSchema = {
    name: 'todo',
    docName: 'todos',
    collectionName: 'todoItems',
    containerType: 'map', // Use a LoroMap
    schema: z.object({
        id: z.string().regex(/^[0-9a-f]{64}$/i, { message: "ID must be a valid pubKey format" }),
        text: z.string().min(1),
        completed: z.boolean().default(false),
        createdAt: z.number(),
        tags: z.array(z.string()),
        docId: z.string()
    })
};

// Export the type derived from the schema
export type TodoItem = z.infer<typeof todoSchema.schema>;

// Export the schema as default for auto-discovery
export default todoSchema; 