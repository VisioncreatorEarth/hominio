import { LoroDoc } from 'loro-crdt';

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
 */
export interface TodoDocument {
    title: string;
    meta: {
        description: string;
    };
    todos: TodoItem[];
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
                id: crypto.randomUUID(),
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
    }
}; 