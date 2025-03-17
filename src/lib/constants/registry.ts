// Registry constants

// The Genesis Registry is the meta-registry that references all sub-registries
// Genesis is immutable, standalone and ownerless
export const GENESIS_REGISTRY_UUID = '00000000-0000-0000-0000-000000000000';
export const GENESIS_REGISTRY_DOMAIN = '♾️';
export const GENESIS_REGISTRY_NAME = '♾️';

// The HUMAN Registry UUID - Owned by Hominio DAO
export const HUMAN_REGISTRY_UUID = 'f8f7c5e4-d3a2-4b1c-9d0e-8f7c6b5a4d3e';
export const HUMAN_REGISTRY_DOMAIN = 'homin.io';
export const HUMAN_REGISTRY_NAME = 'HUMAN Registry';

// The DAO Registry UUID - Owned by Hominio DAO
export const DAO_REGISTRY_UUID = 'a1b2c3d4-e5f6-4708-b9c0-1234567890ab';
export const DAO_REGISTRY_DOMAIN = 'o.homin.io';
export const DAO_REGISTRY_NAME = 'DAO Registry';

// Visioncreator DAO constants - Owned by multiple owners
export const VISIONCREATOR_DAO_UUID = '7d8e9f0a-b1c2-43d4-95f6-87c8a9b0c1d2';
export const VISIONCREATOR_DAO_DOMAIN = 'visioncreator.o.homin.io';
export const VISIONCREATOR_DAO_NAME = 'Visioncreator DAO';

// Hominio DAO constants - Owned by Samuel
export const HOMINIO_DAO_UUID = 'b3c4d5e6-f708-49a0-91b2-c3d4e5f6a7b8';
export const HOMINIO_DAO_DOMAIN = 'hominio.o.homin.io';
export const HOMINIO_DAO_NAME = 'Hominio DAO';

// Samuel's constants - First HUMAN
export const SAMUEL_UUID = 'e2f3a4b5-c6d7-4e8f-90a1-b2c3d4e5f6a7';
export const SAMUEL_DOMAIN = 'samuel.homin.io';
export const SAMUEL_NAME = 'Samuel Andert';

// Chielo's constants - Second HUMAN
export const CHIELO_UUID = 'd1e2f3a4-b5c6-47d8-89e0-a1b2c3d4e5f6';
export const CHIELO_DOMAIN = 'chielo.homin.io';
export const CHIELO_NAME = 'Chielo Jairus';

// Yvonne's constants - Third HUMAN
export const YVONNE_UUID = 'c4d5e6f7-a8b9-4c0d-1e2f-3a4b5c6d7e8f';
export const YVONNE_DOMAIN = 'yvonne.homin.io';
export const YVONNE_NAME = 'Yvonne Müller';


// Document Metadata Types
export interface DocumentMetadata {
    name: string;
    domain: string;
    owner: string[] | string;  // UUID of the owner(s)
    createdAt: number;
}

// Initial Access Control Configuration
export const INITIAL_ACCESS_CONTROL: Record<string, DocumentMetadata> = {
    // Genesis Registry is immutable and ownerless
    [GENESIS_REGISTRY_UUID]: {
        name: GENESIS_REGISTRY_NAME,
        domain: GENESIS_REGISTRY_DOMAIN,
        owner: GENESIS_REGISTRY_UUID,
        createdAt: Date.now()
    },
    // HUMAN Registry owned by Hominio DAO
    [HUMAN_REGISTRY_UUID]: {
        name: HUMAN_REGISTRY_NAME,
        domain: HUMAN_REGISTRY_DOMAIN,
        owner: HOMINIO_DAO_UUID,
        createdAt: Date.now()
    },
    // DAO Registry owned by Hominio DAO
    [DAO_REGISTRY_UUID]: {
        name: DAO_REGISTRY_NAME,
        domain: DAO_REGISTRY_DOMAIN,
        owner: HOMINIO_DAO_UUID,
        createdAt: Date.now()
    },
    // Visioncreator DAO owned by multiple owners
    [VISIONCREATOR_DAO_UUID]: {
        name: VISIONCREATOR_DAO_NAME,
        domain: VISIONCREATOR_DAO_DOMAIN,
        owner: [YVONNE_UUID, SAMUEL_UUID, CHIELO_UUID],
        createdAt: Date.now()
    },
    // Hominio DAO owned by Samuel
    [HOMINIO_DAO_UUID]: {
        name: HOMINIO_DAO_NAME,
        domain: HOMINIO_DAO_DOMAIN,
        owner: SAMUEL_UUID,
        createdAt: Date.now()
    },
    // Samuel's document
    [SAMUEL_UUID]: {
        name: SAMUEL_NAME,
        domain: SAMUEL_DOMAIN,
        owner: SAMUEL_UUID,
        createdAt: Date.now()
    },
    // Chielo's document
    [CHIELO_UUID]: {
        name: CHIELO_NAME,
        domain: CHIELO_DOMAIN,
        owner: CHIELO_UUID,
        createdAt: Date.now()
    },
    // Yvonne's document
    [YVONNE_UUID]: {
        name: YVONNE_NAME,
        domain: YVONNE_DOMAIN,
        owner: YVONNE_UUID,
        createdAt: Date.now()
    }
};