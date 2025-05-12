import { openModal } from '$lib/KERNEL/modalStore';
import PrenuModal from '$lib/components/PrenuModal.svelte'; // Assuming rename is done
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import type { ComponentType } from 'svelte';

/**
 * Tool implementation to open the Prenu creation modal.
 * @param parameters Tool parameters, potentially containing an optional 'name'.
 */
export function createPrenuImplementation(parameters: ToolParameters) {
    const suggestedName = parameters?.name as string | undefined;
    const props = suggestedName ? { name: suggestedName } : {};

    logToolActivity('createPrenu', `Opening Prenu creation modal${suggestedName ? ' with suggested name: ' + suggestedName : ''}.`);

    // Open PrenuModal.svelte, passing the optional name
    // Cast needed because Svelte component type is complex
    openModal(PrenuModal as unknown as ComponentType, props);

    // This tool doesn't return a value to the AI, it triggers UI
    // Return a standard success message or indication
    return JSON.stringify({ success: true, message: 'Opened set prenu / name modal, waiting for users confirmation' });
} 