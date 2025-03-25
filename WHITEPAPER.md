# Hominio: A Universal CRDT-based Content System
## A Decentralized Data Layer for User-Sovereign Applications

### Abstract

In today's digital landscape, humans have become products rather than owners. Our money flows through banks, our data feeds corporate algorithms, our AI capabilities are locked in proprietary systems, our digital assets are controlled by platforms, and ultimately, our lives are shaped by systems we don't control.

We present Hominio, a revolutionary framework built on five fundamental pillars of digital sovereignty:

**Own Your Money**: Through Circles on Gnosis Chain, every individual creates and controls their own currency within trust-based networks, establishing true financial sovereignty.

**Own Your Data**: A hierarchical CRDT-based system ensures your information remains under your control while enabling seamless collaboration and sharing.

**Own Your AI-Agents**: Deploy and control multiple personal AI agents that work for you, learn from your data, and generate value while preserving your privacy.

**Own Your Assets**: Universal content addressing and trust networks, combined with Aztec's zero-knowledge layer, enable true ownership and private transfer of digital assets. This ensures complete privacy in asset transactions while maintaining verifiable ownership.

**Own Your Life**: When combined, these systems create complete digital sovereignty, returning control of our digital existence to its rightful owners - the people.

Our technical implementation combines:
- Circle-based trust networks for peer discovery and validation
- Three-layer document hierarchy for sovereign data management
- Personal AI Agent deployment and coordination
- Automatic conflict resolution through CRDTs
- Trust-based content discovery and verification
- Zero-knowledge proofs for private asset transactions

Through this design, Hominio creates a new paradigm where every individual becomes a sovereign entity, operating their own network of AI agents, managing their own data, and controlling their own digital assets within trust-based networks.

## Current Implementation

### 1. Core Components

#### 1.1 Document Structure
```typescript
// Basic Loro document with sync state
interface LoroDocument {
    meta: Map<string, any>;    // Document metadata
    content: Map<string, any>; // Actual content
    sync: {                    // Sync information
        currentHash: string;
        lastSyncedAt: number;
        peers: {
            client: PeerState;
            server: PeerState;
        }
    }
}

// Peer sync state tracking
interface PeerState {
    id: string;
    lastKnownHash: string;
    lastSyncedAt: number;
}
```

#### 1.2 Registry
```typescript
// Simple in-memory registry
const KERNEL_REGISTRY = {
    id: '0x0000',      // Basic identifier
    contentHash: ''    // Current content hash
};

// Document store (currently in-memory)
const docStore = new Map<string, LoroDoc>();
```

### 2. Current Implementation

#### 2.1 Document Creation
```typescript
function createHelloEarthDoc(): { doc: LoroDoc; hash: string } {
    // 1. Create new Loro document
    const doc = new LoroDoc();

    // 2. Add metadata
    doc.getMap('meta').set('@type', 'hello-earth');
    doc.getMap('meta').set('@created', new Date().toISOString());

    // 3. Add content
    const content = doc.getMap('content');
    content.set('message', 'Hello Earth!');
    content.set('description', 'First Loro-doc in Hominio kernel');

    // 4. Initialize sync state
    const docWithSync = syncService.initDocWithSyncState(doc);

    // 5. Generate content hash
    const hash = createContentHash(docWithSync);

    // 6. Update sync state for both peers
    syncService.updateSyncState(docWithSync, hash, CLIENT_PEER_ID);
    syncService.updateSyncState(docWithSync, hash, SERVER_PEER_ID);

    return { doc: docWithSync, hash };
}
```

#### 2.2 Sync Service
```typescript
class SyncService {
    // Initialize document with sync state
    initDocWithSyncState(doc: LoroDoc) {
        const sync = doc.getMap('sync');
        const clientPeer = doc.getMap('sync.peers.client');
        const serverPeer = doc.getMap('sync.peers.server');

        // Set initial states
        sync.set('currentHash', '');
        sync.set('lastSyncedAt', Date.now());
        
        // Initialize peers
        [clientPeer, serverPeer].forEach(peer => {
            peer.set('lastKnownHash', '');
            peer.set('lastSyncedAt', Date.now());
        });

        return doc;
    }

    // Update sync state when content changes
    updateSyncState(doc: LoroDoc, newHash: string, peerId: string) {
        const sync = doc.getMap('sync');
        const peer = doc.getMap(`sync.peers.${peerId === CLIENT_PEER_ID ? 'client' : 'server'}`);

        sync.set('currentHash', newHash);
        sync.set('lastSyncedAt', Date.now());
        peer.set('lastKnownHash', newHash);
        peer.set('lastSyncedAt', Date.now());
    }
}
```

#### 2.3 Content Hashing
```typescript
function createContentHash(doc: LoroDoc): string {
    const state = doc.toJSON();
    const stateBytes = new TextEncoder().encode(JSON.stringify(state));
    return bytesToHex(blake3(stateBytes));
}
```

### 3. Current Limitations

1. **Storage**: Currently in-memory only
2. **Peers**: Hardcoded client/server peers
3. **Registry**: Simple single-document registry
4. **Persistence**: No permanent storage implemented yet

### 4. Next Steps

1. Implement persistent storage
2. Add dynamic peer discovery
3. Expand registry capabilities
4. Add proper document identification

### 1. Introduction

#### 1.1 Understanding Circles and Trust Networks

At the foundation of Hominio lies Circles on Gnosis Chain, a system where individuals create and control their own currencies within trust-based networks. This isn't just about money—it's about establishing the base layer of digital sovereignty through trusted connections between peers.

In this system:
- Each person creates their own currency
- Trust relationships enable value exchange
- Networks form organically through trust
- Value flows through trusted pathways

We extend this proven trust infrastructure beyond currency to enable:
- Deployment and coordination of personal AI agents
- Sovereign data management and sharing
- Digital asset ownership and transfer
- Collaborative resource allocation

Key concepts we build upon:
1. **Personal Sovereignty**: Each user as an autonomous entity
2. **Trust Networks**: The foundation of all interactions
3. **Collective Growth**: Networks that enhance individual sovereignty

By building on Circles' trust framework, Hominio creates an ecosystem where individuals truly own and control every aspect of their digital existence.

#### 1.2 Background and Motivation

Current distributed storage systems like IPFS and Filecoin excel at content addressing for immutable data but face significant challenges with mutable content and user sovereignty. Traditional approaches rely on centralized coordination or complex consensus mechanisms, leading to scalability issues and reduced user autonomy. Additionally, existing systems often separate identity from content addressing, creating friction in user-owned data management.

Distributed systems face fundamental challenges in maintaining data consistency while enabling local-first operations. We propose a system that leverages CRDTs to achieve both, implementing a hierarchical document structure that ensures eventual consistency while maintaining local operation capability.

#### 1.2 Design Goals

1. **Universal Content Addressability**
   - Enable any data to be universally addressed while supporting mutability
   - Maintain referential integrity across distributed nodes
   - Support content-based discovery and verification
   - Enable efficient state synchronization

2. **User Data Sovereignty**
   - Ensure users maintain complete control over their data
   - Enable local-first operations with eventual consistency
   - Provide granular access control mechanisms
   - Support user-owned storage and computation

3. **Automatic Conflict Resolution**
   - Eliminate manual conflict resolution through CRDT properties
   - Ensure causal consistency across distributed updates
   - Maintain data integrity during concurrent modifications
   - Support offline-first operations

4. **Scalable Architecture**
   - Enable efficient peer discovery and synchronization
   - Support distributed storage and computation
   - Maintain performance under network partition
   - Ensure system-wide eventual consistency

#### 1.3 Circles and Trust Networks

At its core, Hominio implements a bottom-up distributed system where circles serve as the fundamental entry points for peer discovery and data colocation. Unlike traditional top-down hierarchical systems, circles emerge organically through peer relationships and trust connections.

### 2. Circle-Based Document Architecture

#### 2.1 Document Identity and Persistence

Each document in Hominio maintains permanent identity through three mechanisms:

1. **Root Registry** (Circles Address)
```typescript
const REGISTRY_ADDRESS = "0x4a9aFfA9249F36fd0629f342c182A4e94A13C2e0";
```

2. **Document Identity** (Lit Action)
```typescript
// 1. Create document identity rules
const documentRules = `
// Document Identity Rules
const go = async () => {
    // Immutable properties
    const identity = {
        owner: "${REGISTRY_ADDRESS}",
        created: "${new Date().toISOString()}",
        type: "hello-earth",
        version: 1
    };

    // Verify ownership
    const ownerSig = await Lit.checkSignature(identity.owner);
    if (!ownerSig.verified) throw new Error("Unauthorized");

    // Return permanent identity
    return identity;
};
`;

// 2. Deploy to Lit Network
const docId = await Lit.createAction(documentRules);
// Returns a permanent CID like "lit_1234..."
```

3. **Persistence Layer**
```typescript
interface PersistenceStrategy {
    // P2P replication
    peers: {
        [peerId: string]: {
            endpoint: string,
            lastSync: number
        }
    };
    
    // Local storage (PGlite)
    local: {
        docId: string,        // Lit Action CID
        currentHash: string,  // Current Loro state
        history: string[]     // Previous states
    };
    
    // Lit Network storage
    lit: {
        actionId: string,     // Permanent CID
        lastVerified: number  // Last verification
    }
}
```

#### 2.2 Document Lifecycle

1. **Creation and Identity**
```typescript
async function createDocument() {
    // 1. Deploy Lit Action for permanent identity
    const docId = await Lit.createAction(documentRules);
    
    // 2. Create Loro document
    const doc = new LoroDoc();
    doc.getMap('meta').set('litActionId', docId);
    
    // 3. Register in root registry
    registry.documents[docId] = {
        currentHash: createHash(doc),
        created: Date.now()
    };
    
    // 4. Initialize peer replication
    await initPeerReplication(docId, doc);
    
    return { docId, doc };
}
```

2. **Persistence and Replication**
```typescript
async function initPeerReplication(docId: string, doc: LoroDoc) {
    // 1. Store locally
    await localDB.store(docId, doc);
    
    // 2. Announce to peers
    const peers = await getPeerList(REGISTRY_ADDRESS);
    for (const peer of peers) {
        await peer.announce({
            docId,
            owner: REGISTRY_ADDRESS,
            hash: createHash(doc)
        });
    }
    
    // 3. Setup replication
    setupReplication(docId, peers);
}
```

3. **Verification and Access**
```typescript
async function verifyAndAccess(docId: string) {
    // 1. Verify document identity
    const litAction = await Lit.getAction(docId);
    const identity = await Lit.executeAction(litAction);
    
    // 2. Check ownership
    if (identity.owner !== REGISTRY_ADDRESS) {
        throw new Error("Invalid document owner");
    }
    
    // 3. Get latest state from peers
    const doc = await syncFromPeers(docId);
    
    // 4. Verify content integrity
    const isValid = await verifyContent(doc, identity);
    
    return isValid ? doc : null;
}
```

#### 2.3 Lit Actions Deep Dive

Lit Actions provide three key functions:

1. **Permanent Identity**
   - Content-addressed code deployment
   - Immutable execution environment
   - Verifiable ownership rules

2. **Access Control**
   ```typescript
   // Example Lit Action for document access
   const accessRules = `
   const go = async () => {
       // Check if user has access
       const { verified, payload } = await Lit.verifyJWT(userToken);
       if (!verified) return false;
       
       // Check document ownership
       const isOwner = payload.address === "${REGISTRY_ADDRESS}";
       
       // Return access level
       return {
           canRead: true,
           canWrite: isOwner
       };
   };
   `;
   ```

3. **State Verification**
   ```typescript
   // Example Lit Action for state verification
   const verifyState = `
   const go = async ({ oldState, newState, signature }) => {
       // Verify state transition
       const isValid = await Lit.verifyStateTransition({
           from: oldState,
           to: newState,
           sig: signature
       });
       
       return isValid;
   };
   `;
   ```

#### 2.4 Peer Network Configuration

The system operates across multiple peers:

```typescript
interface PeerConfig {
  local: {
    client: "http://localhost:5173/",
    server: "http://localhost:5173/peer"
  },
  production: {
    client: "https://hominio.andert.me",
    server: "https://hominio.andert.me/peer"
  }
}
```

#### 2.5 Sync Flow Example

1. **Initial Document Creation**
```typescript
// On localhost client
const helloEarth = new LoroDoc();
helloEarth.getMap('content').set('message', 'Hello Earth!');
const contentHash = createContentHash(helloEarth);

// Update registry
registry.documents['hello-earth'].contentDocHash = contentHash;
```

2. **Sync Process**
```
Local Client (5173) → Local Server (5173/peer)
                   ↓
Production Client  ← Production Server
```

3. **Update Propagation**
```
a. Content Update:
   1. Client makes change to HelloEarth content
   2. New content hash generated
   3. Metadata updated with new hash
   4. Registry updated to point to new metadata

b. Peer Discovery:
   1. Registry queried for active peers
   2. Each peer's sync state checked
   3. Updates propagated to out-of-date peers

c. State Verification:
   1. Each peer maintains last known hashes
   2. Peers compare states during sync
   3. Missing updates are requested and applied
```

4. **Example Sync Sequence**
```typescript
// 1. Local client updates content
localClient.updateContent("New message!");
const newHash = createContentHash(updatedDoc);

// 2. Metadata updates
metaDoc.sync.version++;
metaDoc.sync.lastUpdate = Date.now();
metaDoc.sync.peers[localClientId].lastKnownHash = newHash;

// 3. Other peers sync
for (const peer of activePeers) {
  if (peer.lastKnownHash !== newHash) {
    // Request updates
    const updates = await peer.requestUpdates(
      peer.lastKnownHash, 
      newHash
    );
    // Apply updates
    peer.applyUpdates(updates);
    // Update peer state
    peer.lastKnownHash = newHash;
    peer.lastSync = Date.now();
  }
}
```

5. **Conflict Resolution**
- All documents (Registry, Meta, Content) are Loro CRDTs
- Conflicts are automatically resolved using Loro's CRDT algorithms
- Each peer maintains a complete history for conflict resolution
- Updates are eventually consistent across all peers

This architecture ensures that:
1. The registry remains the stable entry point
2. Metadata tracks sync state across all peers
3. Content updates propagate efficiently
4. The system maintains consistency without central coordination
