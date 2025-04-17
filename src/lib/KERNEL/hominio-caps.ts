import type { Docs } from './hominio-db'; // Assuming Docs type is exported
import { GENESIS_HOMINIO } from '../../db/constants'; // Import from centralized constants
import { browser } from '$app/environment'; // <<< IMPORT BROWSER



const OFFLINE_OWNER_PLACEHOLDER = 'offline_owner'; // <<< Define placeholder constant

// --- Types ---

// Basic representation of a user for capability checks
export interface CapabilityUser {
    id: string;
    // Add other relevant user attributes like roles if needed later
}

// Define the core abilities within Hominio
export enum HominioAbility {
    READ = 'read',
    WRITE = 'write', // Encompasses create, update, delete for now
    DELETE = 'delete' // Add DELETE capability
}

// --- Core Check Function ---

/**
 * Checks if a user has a specific ability on a given document.
 * This function centralizes the core access control logic.
 *
 * @param user The user attempting the action, or null if anonymous.
 * @param ability The desired ability (e.g., HominioAbility.READ).
 * @param doc The target document object (must contain the 'owner' field).
 * @returns True if the action is permitted, false otherwise.
 */
export function can(
    user: CapabilityUser | null,
    ability: HominioAbility,
    doc: Pick<Docs, 'owner'> // Only require the 'owner' field from the Docs type
): boolean {

    // --- Offline Check --- <<< ADDED OFFLINE HANDLING
    if (browser && !navigator.onLine) {
        console.log(`[Caps Check] Offline mode detected. Allowing ability '${ability}' for doc owned by ${doc.owner}.`);
        return true; // Allow all operations locally when offline
    }
    // --------------------

    // --- Online Logic --- (Existing checks)
    const targetOwner = doc.owner;
    const userId = user?.id;

    const isOwner = !!userId && targetOwner === userId;
    const isGenesis = targetOwner === GENESIS_HOMINIO;

    switch (ability) {
        case HominioAbility.READ:
            // Allow reading if the user is the owner OR if it's a genesis document
            return isOwner || isGenesis;

        case HominioAbility.WRITE:
            // Allow writing ONLY if the user is the owner OR if pushing an offline-created doc
            // The server will assign the correct owner on initial creation.
            return isOwner || targetOwner === OFFLINE_OWNER_PLACEHOLDER;

        case HominioAbility.DELETE:
            // Allow deleting ONLY if the user is the owner
            return isOwner;

        // Add cases for other abilities here later

        default:
            // Default deny for unknown abilities
            console.warn(`Unknown ability check: ${ability}`);
            return false;
    }
}

// --- Helper Functions ---

/**
 * Convenience helper to check if a user can read a document.
 */
export function canRead(user: CapabilityUser | null, doc: Pick<Docs, 'owner'>): boolean {
    return can(user, HominioAbility.READ, doc);
}

/**
 * Convenience helper to check if a user can write to (update/delete) a document.
 */
export function canWrite(user: CapabilityUser | null, doc: Pick<Docs, 'owner'>): boolean {
    return can(user, HominioAbility.WRITE, doc);
}

/**
 * Convenience helper to check if a user can delete a document.
 */
export function canDelete(user: CapabilityUser | null, doc: Pick<Docs, 'owner'>): boolean {
    return can(user, HominioAbility.DELETE, doc);
}
