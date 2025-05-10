import { writable, type Writable } from 'svelte/store';
import type { ComponentType } from 'svelte';
import SignerModal from '../components/SignerModal.svelte';

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
export type PKPSigningRequest = {
    type: 'transaction' | 'message';
    pkpEthAddress: string; // Address
    pkpPublicKey: string; // Hex
    sessionSigs: any;
    litNodeClient: any;
    // For transaction signing
    transaction?: any;
    // For message signing
    message?: string;
    // Optionally allow extra fields for future extensibility
    [key: string]: any;
};
export type PKPSigningResult = unknown;

let activePKPSignPromise: Promise<PKPSigningResult> | null = null;

function cleanup() {
    activePKPSignPromise = null;
}

export function requestPKPSignature(requestData: PKPSigningRequest): Promise<PKPSigningResult> {
    if (activePKPSignPromise) {
        return Promise.reject(new Error('A PKP signing request is already active.'));
    }
    activePKPSignPromise = new Promise((resolve, reject) => {
        openModal(SignerModal, {
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
            },
            onClose: () => {
                closeModal();
                reject(new Error('PKP signing cancelled by modal close.'));
                cleanup();
            }
        });
    });
    return activePKPSignPromise;
} 