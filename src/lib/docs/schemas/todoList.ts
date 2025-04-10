import { z } from 'zod';

/**
 * TodoList schema definition
 * 
 * Defines the structure and behavior of TodoList items in the Loro document
 */
const todoListSchema = {
    name: 'todoList',
    docName: 'todos',
    collectionName: 'todoLists',
    containerType: 'map', // Use a LoroMap
    schema: z.object({
        id: z.string().regex(/^[0-9a-f]{64}$/i, { message: "ID must be a valid pubKey format" }),
        name: z.string().min(1),
        createdAt: z.number(),
        numTodos: z.number().default(0)
    })
};

// Export the type derived from the schema
export type TodoList = z.infer<typeof todoListSchema.schema>;

// Export the schema as default for auto-discovery
export default todoListSchema; 