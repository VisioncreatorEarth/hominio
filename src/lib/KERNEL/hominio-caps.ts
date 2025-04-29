import type { Docs } from './hominio-db'; // Assuming Docs type is exported
import { GENESIS_HOMINIO } from '../../db/constants'; // Import from centralized constants

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
    DELETE = 'delete',
    CREATE = 'create' // Add CREATE capability
}

// --- Core Check Function --- UPDATED SIGNATURE & LOGIC

/**
 * Checks if a user has a specific ability on a given document.
 * This function centralizes the core access control logic.
 *
 * @param user The user object (must contain the 'id' field) or null.
 * @param ability The desired ability (e.g., HominioAbility.READ, HominioAbility.CREATE).
 * @param doc The target document object (must contain the 'owner' field) or null for CREATE check.
 * @returns True if the action is permitted, false otherwise.
 */
export function can(
    user: CapabilityUser | null, // <<< UPDATED: Accept user
    ability: HominioAbility,
    doc: Pick<Docs, 'owner'> | null // <<< UPDATED: Allow null for CREATE
): boolean {

    // --- REMOVED Internal session fetching ---
    // --- REMOVED Offline Check --- 

    // --- Simplified Online Logic --- 
    const targetOwner = doc?.owner;
    const userId = user?.id; // Use passed-in user

    const isOwner = !!userId && targetOwner === userId;
    const isGenesis = targetOwner === GENESIS_HOMINIO;

    switch (ability) {
        case HominioAbility.CREATE:
            // Create allowed if the user is authenticated (has an ID)
            return !!userId;

        case HominioAbility.READ:
            // Read allowed if owner OR if it's a genesis doc
            return !!doc && (isOwner || isGenesis);

        case HominioAbility.WRITE:
            // Write allowed if owner. Offline placeholder check is removed.
            // <<< TEMPORARY DEBUG: Allow write to genesis docs >>>
            return !!doc && (isOwner || isGenesis);

        case HominioAbility.DELETE:
            // Delete only allowed if owner (genesis docs shouldn't be deleted)
            return !!doc && isOwner;

        default:
            console.warn(`Unknown ability check: ${ability}`);
            return false;
    }
}

// --- Helper Functions --- UPDATED SIGNATURES

/**
 * Convenience helper to check if a user can read a document.
 */
export function canRead(user: CapabilityUser | null, doc: Pick<Docs, 'owner'>): boolean { // <<< ADD user
    return can(user, HominioAbility.READ, doc); // <<< Pass user
}

/**
 * Convenience helper to check if a user can write to (update/delete) a document.
 */
export function canWrite(user: CapabilityUser | null, doc: Pick<Docs, 'owner'>): boolean { // <<< ADD user
    return can(user, HominioAbility.WRITE, doc); // <<< Pass user
}

/**
 * Convenience helper to check if a user can delete a document.
 */
export function canDelete(user: CapabilityUser | null, doc: Pick<Docs, 'owner'>): boolean { // <<< ADD user
    return can(user, HominioAbility.DELETE, doc); // <<< Pass user
}

/**
 * Convenience helper to check if a user can create a document.
 */
export function canCreate(user: CapabilityUser | null): boolean {
    return can(user, HominioAbility.CREATE, null); // Pass null for doc
}
