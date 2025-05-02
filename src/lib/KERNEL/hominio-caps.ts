import type { Docs } from './hominio-db'; // Assuming Docs type is exported
import { hominioDB } from './hominio-db'; // <-- Import hominioDB
import { GENESIS_HOMINIO } from '../../db/constants'; // Import from centralized constants
import type { LoroMap } from 'loro-crdt'; // <-- Import LoroMap for type casting
import type { LoroHqlQueryExtended } from '$lib/KERNEL/hominio-query'; // <-- Import type directly

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

// --- NEW ASYNC CHECK for Specific Business Logic ---

/**
 * Asynchronously checks if a user is allowed to create a new Person concept.
 * This involves:
 * 1. Basic CREATE capability check (logged in).
 * 2. Querying to see if the user ID already owns a person via @schema/ponse.
 * @param user The user attempting the action.
 * @returns Promise<boolean> True if creation is allowed, false otherwise.
 */
export async function canCreatePersonConcept(user: CapabilityUser | null): Promise<boolean> {
    // 1. Basic synchronous check
    if (!canCreate(user)) {
        console.log('[canCreatePersonConcept] Basic canCreate failed.');
        return false;
    }

    // Ensure user and user.id exist for the query
    if (!user?.id) {
        console.log('[canCreatePersonConcept] User or user ID missing.');
        return false; // Should be caught by canCreate, but double-check
    }
    const userId = user.id;

    // 2. Asynchronous ownership check via HQL query
    try {
        console.log(`[canCreatePersonConcept] Performing ownership check for user: ${userId}`);
        // Dynamic imports to mitigate circular dependency at module load time
        // Import values
        const queryModule = await import('$lib/KERNEL/hominio-query');
        const executeQuery = queryModule.executeQuery;
        const indexRegistryModule = await import('$lib/KERNEL/index-registry');
        const getIndexLeafPubKey = indexRegistryModule.getIndexLeafPubKey;
        // Import types needed for the query definition
        // REMOVED: type LoroHqlQueryExtended = queryModule.LoroHqlQueryExtended;
        // type IndexLeafType = indexRegistryModule.IndexLeafType; // Not strictly needed if only using getIndexLeafPubKey

        // Find the ponse schema ID first
        const schemasIndexKey = await getIndexLeafPubKey('schemas');
        if (!schemasIndexKey) throw new Error('Cannot find schemas index key');
        const schemaIndexDoc = await hominioDB.getLoroDoc(schemasIndexKey);
        if (!schemaIndexDoc) throw new Error('Cannot load schemas index doc');
        const schemaMap = schemaIndexDoc.getMap('data')?.get('value') as LoroMap | undefined;
        const ponseSchemaId = schemaMap?.get('ponse') as string | undefined;

        if (!ponseSchemaId) {
            throw new Error('Could not resolve @schema/ponse pubkey from index.');
        }

        // Construct the check query
        const checkQuery: LoroHqlQueryExtended = {
            steps: [
                {
                    action: 'find',
                    target: { schema: ponseSchemaId },
                    variables: { ownerLeafVar: { source: 'link.x1' } },
                    resultVariable: 'ponseLinks',
                    return: 'array'
                },
                {
                    action: 'get',
                    from: { variable: 'ponseLinks', sourceKey: 'ownerLeafVar', targetDocType: 'Leaf' },
                    fields: {
                        value: { field: 'self.data.value' }
                    },
                    resultVariable: 'ownerLeafValues'
                }
            ]
        };

        const checkResult = await executeQuery(checkQuery, user);

        let alreadyOwned = false;
        if (checkResult && Array.isArray(checkResult)) {
            console.log(`[canCreatePersonConcept DEBUG] Query Result Items:`, JSON.stringify(checkResult)); // Log the whole result
            for (const item of checkResult) {
                // Log the item being checked and the comparison result
                let valueToCheck: unknown = undefined;
                if (item && typeof item.variables === 'object' && item.variables !== null && 'value' in item.variables) {
                    valueToCheck = item.variables.value;
                }

                console.log(`[canCreatePersonConcept DEBUG] Checking item.variables.value: ${JSON.stringify(valueToCheck)} against userId: ${userId}. Match: ${valueToCheck === userId}`);
                if (valueToCheck === userId) {
                    alreadyOwned = true;
                    console.log(`[canCreatePersonConcept DEBUG] Found matching owned item.`);
                    break;
                }
            }
        } else {
            console.log(`[canCreatePersonConcept DEBUG] Query Result was null, not an array, or empty.`);
        }

        if (alreadyOwned) {
            console.log(`[canCreatePersonConcept] Check failed: User ${userId} already owns a person.`);
            return false; // User already owns a person
        }

        console.log(`[canCreatePersonConcept] Check passed: User ${userId} does not own a person.`);
        return true; // User is allowed to create

    } catch (error) {
        console.error('[canCreatePersonConcept] Error during ownership check:', error);
        // Fail safe: If the check errors, deny creation to prevent duplicates
        return false;
    }
}
