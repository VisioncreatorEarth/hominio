import { writable, type Writable } from 'svelte/store';
import type { ComponentType } from 'svelte';
import SignerModal from '../components/SignerModal.svelte';
import type { PKPSigningRequestData } from '$lib/wallet/modalTypes';

// Define the props type for SignerModal explicitly for clarity here
interface SignerModalProps {
    requestData: PKPSigningRequestData | null;
    onSign: ((result: PKPSigningResult) => void) | null;
    onCancel: (() => void) | null;
}

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

// Define types for PKP signing request and result
export type PKPSigningResult = unknown;

let activePKPSignPromise: Promise<PKPSigningResult> | null = null;

function cleanup() {
    activePKPSignPromise = null;
}

export function requestPKPSignature(requestData: PKPSigningRequestData): Promise<PKPSigningResult> {
    if (activePKPSignPromise) {
        return Promise.reject(new Error('A PKP signing request is already active.'));
    }
    activePKPSignPromise = new Promise((resolve, reject) => {
        const modalProps: SignerModalProps = {
            requestData,
            onSign: (result: PKPSigningResult) => {
                closeModal();
                resolve(result);
                cleanup();
            },
            onCancel: () => {
                closeModal();
                reject(new Error('PKP signing cancelled by user.'));
                cleanup();
            }
        };
        openModal(SignerModal, modalProps);
    });
    return activePKPSignPromise;
} 