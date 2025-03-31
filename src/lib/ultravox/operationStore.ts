import { writable, get } from 'svelte/store';

export type OperationStatus = 'pending' | 'success' | 'error';

export interface Operation {
    id: string;
    type: string;
    status: OperationStatus;
    message: string;
    timestamp: number;
    data?: Record<string, unknown>;
}

// Create a store to track operations
export const operationStore = writable<Record<string, Operation>>({});

// Helper functions for operation management
export function trackOperation(type: string, id: string, message = ''): string {
    const operation: Operation = {
        id,
        type,
        status: 'pending',
        message,
        timestamp: Date.now()
    };

    operationStore.update(ops => {
        ops[id] = operation;
        return ops;
    });

    return id;
}

export function completeOperation(id: string, success = true, message = '', data?: Record<string, unknown>): void {
    operationStore.update(ops => {
        if (ops[id]) {
            ops[id] = {
                ...ops[id],
                status: success ? 'success' : 'error',
                message: message || ops[id].message,
                data
            };
        }
        return ops;
    });
}

export function getOperationStatus(id: string): OperationStatus | null {
    const operations = get(operationStore);
    return operations[id]?.status || null;
}

export function cleanupOperations(olderThanMinutes = 60): void {
    const now = Date.now();
    const threshold = now - (olderThanMinutes * 60 * 1000);

    operationStore.update(ops => {
        const newOps = { ...ops };
        Object.keys(newOps).forEach(id => {
            if (newOps[id].timestamp < threshold) {
                delete newOps[id];
            }
        });
        return newOps;
    });
}

// Set up event listeners for tool operations
if (typeof window !== 'undefined') {
    // Listen for journal entry events
    window.addEventListener('journal-entry-added', ((event: CustomEvent) => {
        const { transitionId, result } = event.detail;
        completeOperation(transitionId, result.success, result.message, result);
    }) as EventListener);

    window.addEventListener('journal-entry-error', ((event: CustomEvent) => {
        const { transitionId, error } = event.detail;
        completeOperation(transitionId, false, `Error: ${error?.message || 'Unknown error'}`);
    }) as EventListener);

    // Listen for todo events
    window.addEventListener('todo-created', ((event: CustomEvent) => {
        const { transitionId, result } = event.detail;
        completeOperation(transitionId, result.success, result.message, result);
    }) as EventListener);

    window.addEventListener('todo-error', ((event: CustomEvent) => {
        const { transitionId, error } = event.detail;
        completeOperation(transitionId, false, `Error: ${error?.message || 'Unknown error'}`);
    }) as EventListener);

    // Cleanup old operations every 15 minutes
    setInterval(() => {
        cleanupOperations(15);
    }, 15 * 60 * 1000);
} 