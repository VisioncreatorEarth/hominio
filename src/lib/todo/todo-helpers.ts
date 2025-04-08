import { LoroDoc } from 'loro-crdt';
import { v4 as uuidv4 } from 'uuid';
import { DocState, createDocState, type ProcessedDocumentResult } from '$lib/KERNEL/doc-state';

/**
 * Type for document metadata from the API
 */
export interface DocMetadata {
    pubKey: string;
    name: string;
    type: string;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Type for API responses
 */
export interface ApiResponse<T = unknown> {
    data?: T;
    success?: boolean;
    message?: string;
    error?: string;
}

/**
 * Type for a Todo item
 */
export interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    createdAt: string;
}

/**
 * Type for a Todo list document 
 * This should match the TodoDocument in doc-state.ts
 */
export interface TodoDocument {
    title: string;
    todos: TodoItem[];
    meta: {
        description: string;
    };
}

/**
 * Result of processing a document with updates
 */
export interface ProcessedDocumentResult {
    success: boolean;
    document?: TodoDocument;
    updatesApplied: number;
    error?: string;
}

/**
 * Type for a Loro list with proper typing
 */
export interface LoroList<T> {
    length: number;
    get(index: number): T;
    push(value: T): void;
    set(index: number, value: T): void;
    delete(index: number, count: number): void;
}

/**
 * Add interface for Eden Treaty API client
 */
export interface ApiClient {
    docs: {
        post: (data: unknown) => Promise<{ data?: { success: boolean, document?: DocMetadata, error?: string } }>;
    } & {
        [pubKey: string]: {
            update: {
                post: (data: { binaryUpdate: number[] }) => Promise<{ data?: { success: boolean, error?: string, message?: string } }>;
            };
            snapshot: {
                post: (data: { binarySnapshot: number[] }) => Promise<{ data?: { success: boolean, error?: string, message?: string } }>;
            };
            get: (options?: { $query?: Record<string, string> }) => Promise<{ data?: { success: boolean, document?: DocMetadata, binary?: number[], error?: string } }>;
        };
    };
}

/**
 * Generate a random todo text
 */
function generateRandomTodoText(): string {
    const tasks = [
        'Buy groceries',
        'Call mom',
        'Fix the bug',
        'Write documentation',
        'Go for a run',
        'Read a book',
        'Learn a new language',
        'Cook dinner'
    ];

    return `Task ${Math.floor(Math.random() * 1000)}: ${tasks[Math.floor(Math.random() * tasks.length)]}`;
}

/**
 * Helper functions for Todo documents
 */
export const TodoHelper = {
    /**
     * Add a todo item to a document
     */
    addTodo(doc: LoroDoc, text: string): TodoItem | null {
        try {
            // Try to get the todos list
            const todos = doc.getList('todos') as unknown as LoroList<TodoItem>;

            // Create the new todo
            const todo: TodoItem = {
                id: uuidv4(),
                text,
                completed: false,
                createdAt: new Date().toISOString()
            };

            // Add it to the list
            todos.push(todo);

            return todo;
        } catch (error) {
            console.error('Error adding todo:', error);
            return null;
        }
    },

    /**
     * Add a random todo item to a document
     */
    addRandomTodo(doc: LoroDoc): TodoItem | null {
        return this.addTodo(doc, generateRandomTodoText());
    },

    /**
     * Toggle a todo's completed state
     */
    toggleTodo(doc: LoroDoc, todoId: string): boolean {
        try {
            const todos = doc.getList('todos') as unknown as LoroList<TodoItem>;

            // Find the todo by ID
            for (let i = 0; i < todos.length; i++) {
                const todo = todos.get(i);
                if (todo.id === todoId) {
                    // Toggle the completed state
                    todos.set(i, {
                        ...todo,
                        completed: !todo.completed
                    });
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Error toggling todo:', error);
            return false;
        }
    },

    /**
     * Remove a todo from the document
     */
    removeTodo(doc: LoroDoc, todoId: string): boolean {
        try {
            const todos = doc.getList('todos') as unknown as LoroList<TodoItem>;

            // Find the todo by ID
            for (let i = 0; i < todos.length; i++) {
                const item = todos.get(i);
                if (item.id === todoId) {
                    // Remove the todo
                    todos.delete(i, 1);
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Error removing todo:', error);
            return false;
        }
    },

    /**
     * Create a new Todo list document
     */
    createTodoList(doc: LoroDoc, title = 'Todo List'): void {
        // Set the title
        doc.getText('title').insert(0, title);

        // Set the metadata
        doc.getMap('meta').set('description', 'A simple todo list using Loro CRDT');

        // Create an empty todos list
        doc.getList('todos');
    },

    /**
     * Create a new Todo list DocState
     */
    createTodoListDocState(): DocState<TodoDocument> {
        // Create a new document state
        const docState = createDocState<TodoDocument>();

        // Set up the document with todo list structure
        docState.update(doc => {
            this.createTodoList(doc);
        });

        return docState;
    },

    /**
     * Get the snapshot binary data for a new Todo list
     */
    createTodoListSnapshot(): {
        name: string;
        type: string;
        binarySnapshot: number[];
    } {
        // Create a new Loro document
        const doc = new LoroDoc();
        // Initialize the document structure
        doc.getList('todos');

        // Export the initial state as binary
        const binaryData = doc.exportSnapshot();

        // Convert binary to array for JSON serialization
        const binaryArray = Array.from(new Uint8Array(binaryData));

        return {
            name: 'Todo List',
            type: 'todo',
            binarySnapshot: binaryArray
        };
    },

    /**
     * Apply a random todo update to a document state and return the update binary
     */
    createRandomTodoUpdate(docState: DocState<TodoDocument>): number[] {
        // Add the todo to the document
        docState.update(doc => {
            this.addRandomTodo(doc);
        });

        // Export the update
        const updateBinary = docState.export('update');

        return Array.from(updateBinary);
    },

    /**
     * Create a new Todo list document via API
     * @param apiClient The Eden Treaty client
     * @returns The created document metadata or null if failed
     */
    async createTodoListDocument(options: { title?: string, description?: string }): Promise<DocMetadata | null> {
        try {
            // Create initial document snapshot
            const doc = new LoroDoc();

            // Set up the document with todo list structure
            const title = options.title || 'Todo List';
            doc.getText('title').insert(0, title);

            // Set the metadata
            const meta = doc.getMap('meta');
            meta.set('description', options.description || 'A simple todo list using Loro CRDT');

            // Create an empty todos list
            doc.getList('todos');

            // Export the initial state as binary
            const binaryData = doc.exportSnapshot();

            // Send to API
            const response = await fetch('/api/docs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: title,
                    type: 'todo',
                    binarySnapshot: Array.from(binaryData)
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to create document: ${response.statusText}`);
            }

            const result = await response.json();
            return result.document || null;
        } catch (error) {
            console.error('Error creating todo list document:', error);
            return null;
        }
    },

    /**
     * Add a random todo to a document via API
     * @param apiClient The Eden Treaty client
     * @param docState The document state
     * @param pubKey The document's public key
     * @returns Success status and message
     */
    async addRandomTodoViaApi(
        apiClient: ApiClient,
        docState: DocState<TodoDocument>,
        pubKey: string
    ): Promise<{ success: boolean, message: string }> {
        try {
            // Use the TodoHelper to create a random todo update
            const updateBinary = this.createRandomTodoUpdate(docState);

            // Send to server
            const updateResponse = await apiClient.docs[pubKey].update.post({
                binaryUpdate: updateBinary
            });

            if (updateResponse && updateResponse.data && updateResponse.data.success) {
                console.log('Server update response:', updateResponse.data);
                return {
                    success: true,
                    message: updateResponse.data.message || 'Todo added successfully!'
                };
            } else {
                return {
                    success: false,
                    message: `Server error: ${updateResponse?.data?.error || 'Unknown server error'}`
                };
            }
        } catch (error) {
            console.error('Error adding random todo:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    },

    /**
     * Create a snapshot of the current document state via API
     * @param apiClient The Eden Treaty client
     * @param docState The document state
     * @param pubKey The document's public key
     * @returns Success status and message
     */
    async createSnapshotViaApi(
        apiClient: ApiClient,
        docState: DocState<TodoDocument>,
        pubKey: string
    ): Promise<{ success: boolean, message: string }> {
        try {
            // Generate a complete snapshot from current doc state
            const snapshotBinary = docState.export('snapshot');

            // Send to server
            const snapshotResponse = await apiClient.docs[pubKey].snapshot.post({
                binarySnapshot: Array.from(snapshotBinary) // Convert Uint8Array to regular array for JSON
            });

            if (snapshotResponse && snapshotResponse.data) {
                if (snapshotResponse.data.success) {
                    console.log('Created snapshot:', snapshotResponse.data);

                    // Return success with message
                    return {
                        success: true,
                        message: snapshotResponse.data.message || 'Snapshot created successfully!'
                    };
                } else {
                    return {
                        success: false,
                        message: snapshotResponse.data.error || 'Failed to create snapshot'
                    };
                }
            } else {
                return {
                    success: false,
                    message: 'Invalid response from server'
                };
            }
        } catch (error) {
            console.error('Error creating snapshot:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    },

    /**
     * Process the full document state by applying all updates on top of the snapshot
     * @param fetchFn The fetch function to use for API calls
     * @param doc The document to process
     * @param docState The document state instance
     * @returns The processed document result
     */
    async processFullDocumentState(
        fetchFn: typeof fetch,
        doc: {
            pubKey: string;
            snapshotCid: string;
            updateCids: string[];
        },
        docState: DocState<TodoDocument>
    ): Promise<ProcessedDocumentResult> {
        if (!doc || !doc.snapshotCid) {
            return {
                success: false,
                updatesApplied: 0,
                error: 'No document or snapshot CID available'
            };
        }

        try {
            // Get binary snapshot data
            const snapshotResponse = await fetchFn(`/api/content/${doc.snapshotCid}/binary`, {
                method: 'GET'
            });

            if (!snapshotResponse.ok) {
                throw new Error(`Failed to fetch snapshot: ${snapshotResponse.statusText}`);
            }

            // Get the binary data as ArrayBuffer
            const snapshotArrayBuffer = await snapshotResponse.arrayBuffer();
            const snapshotData = new Uint8Array(snapshotArrayBuffer);

            // Import the snapshot to doc state
            docState.import(snapshotData);
            console.log('Snapshot imported successfully');

            // Apply each update sequentially
            let updatesApplied = 0;
            if (doc.updateCids && doc.updateCids.length > 0) {
                for (const updateCid of doc.updateCids) {
                    try {
                        // Get binary update data
                        const updateResponse = await fetchFn(`/api/content/${updateCid}/binary`, {
                            method: 'GET'
                        });

                        if (!updateResponse.ok) {
                            console.warn(`Skipping update ${updateCid}: ${updateResponse.statusText}`);
                            continue;
                        }

                        // Get the binary data as ArrayBuffer
                        const updateArrayBuffer = await updateResponse.arrayBuffer();
                        const updateData = new Uint8Array(updateArrayBuffer);

                        // Apply the update
                        docState.import(updateData);
                        updatesApplied++;
                        console.log(`Applied update ${updateCid}`);
                    } catch (error) {
                        console.warn(`Error applying update ${updateCid}:`, error);
                        // Continue with other updates even if one fails
                    }
                }
            }

            // Get the current state
            const currentState = docState.getState();

            // Convert to TodoDocument format
            const todoDocument: TodoDocument = {
                id: doc.pubKey,
                title: currentState?.title || 'Untitled',
                todos: Array.isArray(currentState?.todos) ? currentState.todos : [],
                meta: currentState?.meta || { description: '' }
            };

            return {
                success: true,
                document: todoDocument,
                updatesApplied
            };
        } catch (error) {
            console.error('Error processing document state:', error);
            return {
                success: false,
                updatesApplied: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
};

export interface TodoDocumentOptions {
    title?: string;
    description?: string;
}

/**
 * Adds a random todo to the specified document
 */
export async function addRandomTodo(docPubKey: string) {
    const randomVerbs = ['Build', 'Create', 'Design', 'Implement', 'Research', 'Review', 'Fix', 'Test', 'Deploy', 'Document'];
    const randomNouns = ['API', 'Component', 'Feature', 'Database', 'UI', 'Module', 'Bug', 'Documentation', 'Integration', 'Performance'];

    const verb = randomVerbs[Math.floor(Math.random() * randomVerbs.length)];
    const noun = randomNouns[Math.floor(Math.random() * randomNouns.length)];

    const newTodo = {
        id: uuidv4(),
        text: `${verb} the ${noun}`,
        completed: false,
        createdAt: new Date().toISOString()
    };

    const response = await fetch(`/api/docs/${docPubKey}/update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: 'addTodo',
            todo: newTodo
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to add todo: ${response.statusText}`);
    }

    return await response.json();
} 