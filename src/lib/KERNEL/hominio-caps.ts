import type { Docs } from './hominio-db'; // Assuming Docs type is exported
import { GENESIS_HOMINIO } from '../../db/constants'; // Import from centralized constants

// --- Constants ---

// MUST match the value used in src/db/seed.ts and src/lib/server/routes/docs.ts
// export const GENESIS_HOMINIO = "00000000000000000000000000000000";

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
    const targetOwner = doc.owner;
    const userId = user?.id;

    const isOwner = !!userId && targetOwner === userId;
    const isGenesis = targetOwner === GENESIS_HOMINIO;

    switch (ability) {
        case HominioAbility.READ:
            // Allow reading if the user is the owner OR if it's a genesis document
            return isOwner || isGenesis;

        case HominioAbility.WRITE:
            // Allow writing ONLY if the user is the owner
            return isOwner;

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

// --- (Optional) Future Extensions ---
// - Define Resource types (e.g., specific doc, type of doc)
// - Implement more complex capability objects combining resource + ability
// - Integrate role-based access control (RBAC)
