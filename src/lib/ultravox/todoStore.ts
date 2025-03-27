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

// Track last logged activity to prevent duplicates
let lastLoggedActivity: { action: string; message: string; timestamp: number; id: string } | null = null;
const activityQueue: Set<string> = new Set(); // Track activities in progress

// Helper to update the todos store from the LoroDoc
export function updateTodoEntries() {
    const rawEntries = [...todoMap.entries()];
    const state = get(todoState);

    // Create properly typed entries with explicit casting
    const typedEntries: [string, TodoItem][] = rawEntries.map((entry) => {
        const key = entry[0] as string;
        const rawValue = entry[1] as unknown;
        // Ensure the value is an object before accessing properties
        const value = (typeof rawValue === 'object' && rawValue !== null ? rawValue : {}) as TodoItem;
        // Ensure docId exists (for backward compatibility)
        if (!value.docId) value.docId = 'personal';
        return [key, value];
    });

    // Filter for the active document and sort by creation date (newest first)
    const filteredEntries = typedEntries
        .filter(([, todo]) => todo.docId === state.activeDocId)
        .sort((a, b) => b[1].createdAt - a[1].createdAt);

    // Update the store
    todos.set(filteredEntries);

    // Update document list with counts
    updateDocuments();
}

// Update document list with counts
function updateDocuments() {
    const allEntries = [...todoMap.entries()];
    const docs = get(todoDocuments);

    // Count todos for each document
    const counts = new Map<string, number>();
    allEntries.forEach(([, todo]) => {
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

    // Set up Loro change listener and update stores
    const unsubscribe = todoDoc.subscribe(() => {
        updateTodoEntries();
    });

    updateTodoEntries();
    return unsubscribe;
}

// Helper for tracking tool usage for UI feedback
export function logToolActivity(action: string, message: string, success = true) {
    const timestamp = Date.now();
    const activityId = crypto.randomUUID(); // Generate unique ID for each activity

    // Check if this activity is already being processed
    const activityKey = `${action}-${message}`;
    if (activityQueue.has(activityKey)) {
        console.log('Activity already in progress:', { action, message });
        return { success, message };
    }

    // Add to queue and remove after processing
    activityQueue.add(activityKey);
    setTimeout(() => activityQueue.delete(activityKey), 3000);

    // Check if this is a duplicate activity within a short time window (1 second)
    if (lastLoggedActivity &&
        lastLoggedActivity.action === action &&
        lastLoggedActivity.message === message &&
        timestamp - lastLoggedActivity.timestamp < 1000) {
        console.log('Skipping duplicate activity:', { action, message });
        return { success, message };
    }

    // Update last logged activity
    lastLoggedActivity = { action, message, timestamp, id: activityId };

    toolState.update(state => {
        const newState = {
            ...state,
            pendingAction: null,
            lastActionTimestamp: timestamp,
            history: [
                { action, success, message, timestamp },
                ...state.history.slice(0, 9) // Keep last 10 entries
            ]
        };
        return newState;
    });

    // Show recent activity indicator in global state
    const activity = {
        id: activityId,
        action,
        message,
        timestamp
    };

    recentToolActivity.set(activity);

    // Clear the notification after 3 seconds
    setTimeout(() => {
        // Only clear if this is still the current notification
        recentToolActivity.update(current => {
            if (current?.id === activityId) {
                return null;
            }
            return current;
        });
    }, 3000);

    console.log(`Tool activity: ${action} - ${message} (${activityId})`);
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

// Function to find todo by exact or fuzzy match
export function findTodoForUpdate(originalText: string): [string, TodoItem] | null {
    const entries = [...todoMap.entries()];
    const state = get(todoState);

    // First try exact match (case insensitive)
    const exactMatch = entries.find(
        (entry) => {
            const todo = entry[1] as unknown as TodoItem;
            return (
                todo.docId === state.activeDocId &&
                todo.text.toLowerCase() === originalText.toLowerCase()
            );
        }
    );

    if (exactMatch) {
        return [exactMatch[0] as string, exactMatch[1] as unknown as TodoItem];
    }

    // Next, try substring match
    const substringMatches = entries.filter(
        (entry) => {
            const todo = entry[1] as unknown as TodoItem;
            return (
                todo.docId === state.activeDocId &&
                (
                    todo.text.toLowerCase().includes(originalText.toLowerCase()) ||
                    originalText.toLowerCase().includes(todo.text.toLowerCase())
                )
            );
        }
    );

    if (substringMatches.length === 1) {
        const [id, value] = substringMatches[0];
        return [id as string, value as unknown as TodoItem];
    }

    // If multiple matches, try to find the closest one
    if (substringMatches.length > 1) {
        // Sort by similarity (shorter difference in length = more similar)
        substringMatches.sort((a, b) => {
            const todoA = a[1] as unknown as TodoItem;
            const todoB = b[1] as unknown as TodoItem;
            const diffA = Math.abs(todoA.text.length - originalText.length);
            const diffB = Math.abs(todoB.text.length - originalText.length);
            return diffA - diffB;
        });

        const [id, value] = substringMatches[0];
        return [id as string, value as unknown as TodoItem];
    }

    return null;
}

// Function to update a todo with new text and tags
export function updateTodo(id: string, newText: string, tagsStr?: string): boolean {
    const todoEntry = todoMap.get(id);

    if (todoEntry) {
        const todo = todoEntry as unknown as TodoItem;
        const tags = tagsStr
            ? tagsStr
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0)
            : todo.tags;

        todoMap.set(id, {
            ...todo,
            text: newText.trim(),
            tags
        } as unknown as Value);

        updateTodoEntries();
        return true;
    }

    return false;
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
    const currentTodos = get(todos);
    const allTags = new Set<string>();

    currentTodos.forEach(([, todo]) => {
        todo.tags.forEach((tag) => allTags.add(tag));
    });

    return [...allTags];
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