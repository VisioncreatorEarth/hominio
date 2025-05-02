import { writable, type Writable } from 'svelte/store';
import type { ComponentType } from 'svelte';

interface ModalState {
    isOpen: boolean;
    component: ComponentType | null;
    props: Record<string, unknown>;
}

const initialState: ModalState = {
    isOpen: false,
    component: null,
    props: {},
};

// Create the writable store
export const modalStore: Writable<ModalState> = writable(initialState);

// Helper function to open the modal
export function openModal(component: ComponentType, props: Record<string, unknown> = {}) {
    modalStore.set({
        isOpen: true,
        component: component,
        props: props,
    });
}

// Helper function to close the modal
export function closeModal() {
    modalStore.set(initialState);
} 