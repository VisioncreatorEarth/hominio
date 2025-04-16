/**
 * The predefined public key for the root Gismu schema document.
 * Format: 0x followed by 64 zeros.
 */
export const GENESIS_PUBKEY = `0x${'0'.repeat(64)}`;

/**
 * The predefined owner identifier for documents created during initial seeding.
 * Represents the "system" or "genesis" owner.
 */
export const GENESIS_HOMINIO = `0xGENESIS${'0'.repeat(23)}`; 