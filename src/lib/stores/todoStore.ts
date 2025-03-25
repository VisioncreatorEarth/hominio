import { writable, get } from 'svelte/store';
import { LoroDoc, type Value } from 'loro-crdt';

// Define Todo interface
export interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    createdAt: number;
    tags: string[];
    docId: string; // Which document/list this todo belongs to
}

// Document interface
export interface TodoDocument {
    id: string;
    name: string;
    createdAt: number;
    numTodos: number;
}

// Create a simple store pattern for tool state
export interface ToolState {
    pendingAction: string | null;
    lastActionTimestamp: number;
    history: { action: string; success: boolean; message: string; timestamp: number }[];
    activeItem: TodoItem | null;
}

// Initialize LoroDoc for todos
const todoDoc = new LoroDoc();
const todoMap = todoDoc.getMap('todos');

// Create the stores
export const todos = writable<[string, TodoItem][]>([]);
export const todoState = writable<{
    activeDocId: string;
    selectedTag: string | null;
}>({
    activeDocId: 'personal',
    selectedTag: null
});
export const todoDocuments = writable<TodoDocument[]>([
    {
        id: 'personal',
        name: 'Personal List',
        createdAt: Date.now(),
        numTodos: 0
    }
]);
export const toolState = writable<ToolState>({
    pendingAction: null,
    lastActionTimestamp: 0,
    history: [],
    activeItem: null
});
export const recentToolActivity = writable<{ action: string; message: string; timestamp: number } | null>(null);

// Helper to update the todos store from the LoroDoc
export function updateTodoEntries() {
    const rawEntries = [...todoMap.entries()];
    const state = get(todoState);

    // Create properly typed entries with explicit casting
    const typedEntries: [string, TodoItem][] = rawEntries.map((entry) => {
        const key = entry[0] as string;
        const value = entry[1] as unknown as TodoItem;
        // Ensure docId exists (for backward compatibility)
        if (!value.docId) value.docId = 'personal';
        return [key, value];
    });

    // Filter for the active document and sort by creation date (newest first)
    const filteredEntries = typedEntries
        .filter(([_, todo]) => todo.docId === state.activeDocId)
        .sort((a, b) => b[1].createdAt - a[1].createdAt);

    // Update the store
    todos.set(filteredEntries);

    // Update document list counts
    updateDocuments();
}

// Update document list with counts
function updateDocuments() {
    const allEntries = [...todoMap.entries()].map(
        (entry) => [entry[0], entry[1] as unknown as TodoItem] as [string, TodoItem]
    );
    const docs = get(todoDocuments);

    // Count todos for each document
    const counts = new Map<string, number>();
    allEntries.forEach(([_, todo]) => {
        const docId = todo.docId || 'personal';
        const currentCount = counts.get(docId) || 0;
        counts.set(docId, currentCount + 1);
    });

    // Update the documents with the counts
    const updatedDocs = docs.map((doc) => ({
        ...doc,
        numTodos: counts.get(doc.id) || 0
    }));

    todoDocuments.set(updatedDocs);
}

// Set up subscribe to Loro doc changes
export function initTodoStore() {
    // Add a welcome todo if none exist
    const entries = [...todoMap.entries()];
    if (entries.length === 0) {
        addTodo('Welcome to Hominio Voice Todos! Ask the assistant to create or toggle tasks.');
    }

    // Set up Loro change listener and update stores
    const unsubscribe = todoDoc.subscribe(() => {
        updateTodoEntries();
    });

    updateTodoEntries();
    return unsubscribe;
}

// Helper for tracking tool usage for UI feedback
export function logToolActivity(action: string, message: string, success = true) {
    toolState.update(state => {
        const newState = {
            ...state,
            pendingAction: null,
            lastActionTimestamp: Date.now(),
            history: [
                { action, success, message, timestamp: Date.now() },
                ...state.history.slice(0, 9) // Keep last 10 entries
            ]
        };
        return newState;
    });

    // Show recent activity indicator in global state
    const activity = {
        action,
        message,
        timestamp: Date.now()
    };

    recentToolActivity.set(activity);

    // Clear the notification after 3 seconds
    setTimeout(() => {
        recentToolActivity.set(null);
    }, 3000);

    console.log(`Tool activity: ${action} - ${message}`);
    return { success, message };
}

// Core Todo functions
export function addTodo(text: string, tagsStr: string = '', docId: string = get(todoState).activeDocId): string {
    if (!text.trim()) return '';

    const todoId = crypto.randomUUID();
    const tags = tagsStr
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

    const todoItem: TodoItem = {
        id: todoId,
        text: text.trim(),
        completed: false,
        createdAt: Date.now(),
        tags,
        docId
    };

    todoMap.set(todoId, todoItem as unknown as Value);
    updateTodoEntries();
    return todoId;
}

export function toggleTodoById(id: string): boolean {
    const entries = [...todoMap.entries()];
    const todoEntry = entries.find((entry) => entry[0] === id);

    if (todoEntry) {
        const value = todoEntry[1] as unknown as TodoItem;
        todoMap.set(id, {
            ...value,
            completed: !value.completed
        } as unknown as Value);

        updateTodoEntries();
        return true;
    }

    return false;
}

export function findTodosByText(text: string): [string, TodoItem][] {
    const entries = [...todoMap.entries()];
    return entries
        .filter((entry) => {
            const todo = entry[1] as unknown as TodoItem;
            return todo.text.toLowerCase().includes(text.toLowerCase());
        })
        .map((entry) => [entry[0] as string, entry[1] as unknown as TodoItem]);
}

export function createLoroDocument(name: string): string {
    const normalizedName = name.trim();
    if (!normalizedName) return '';

    // Generate a slugified ID from the name
    const id = normalizedName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Check if a document with this ID already exists
    const docs = get(todoDocuments);
    if (docs.some((doc) => doc.id === id)) {
        console.log(`Document with ID ${id} already exists`);
        return id; // Return existing ID
    }

    // Create new document
    const newDoc = {
        id,
        name: normalizedName,
        createdAt: Date.now(),
        numTodos: 0
    };

    todoDocuments.update(docs => [...docs, newDoc]);
    return id;
}

export function switchToDocument(docId: string): boolean {
    const docs = get(todoDocuments);
    const targetDoc = docs.find((doc) => doc.id === docId);

    if (targetDoc) {
        // Update the active document
        todoState.update(state => ({ ...state, activeDocId: docId, selectedTag: null }));
        updateTodoEntries();
        return true;
    }

    return false;
}

export function filterTodosByTag(tag: string | null) {
    todoState.update(state => ({ ...state, selectedTag: tag }));
    updateTodoEntries();
}

export function getAllUniqueTags(): string[] {
    const uniqueTags = new Set<string>();
    const currentTodos = get(todos);

    currentTodos.forEach(([_, todo]) => {
        todo.tags.forEach((tag) => {
            if (tag) uniqueTags.add(tag);
        });
    });

    return Array.from(uniqueTags).sort();
}

// Returns the currently active document name
export function getActiveDocName(): string {
    const docs = get(todoDocuments);
    const state = get(todoState);
    const activeDoc = docs.find((doc) => doc.id === state.activeDocId);
    return activeDoc ? activeDoc.name : 'Personal List';
}

// Cleanup function to be called on component destroy
export function cleanupTodoStore() {
    // Nothing to clean up currently as the store persists
} 