# Loro-P2P Next: Hypercore-Based Architecture

## Abstract

This document outlines Loro-P2P Next, an architecture for peer-to-peer Loro document synchronization using Hypercore primitives. It utilizes Hypercore's append-only logs directly for document history, with each document identified uniquely by its Hypercore public key. Corestore manages log collections locally, while a centralized NeonDB registry maps Hypercore keys to owners and tracks the latest content hash (CID) for efficient updates. Hyperswarm handles peer discovery and connection management. This approach leverages P2P data structures for replication while ensuring clear, server-validated ownership.

## Introduction

### Problem Statement

Synchronizing collaborative documents (like Loro CRDTs) requires balancing:
1.  **Identity & Content:** Documents need a stable, unique identifier while their content evolves.
2.  **Ownership & Permissions:** A clear system must define who controls and can modify documents.
3.  **Efficient Replication:** Content changes must propagate efficiently between peers.
4.  **Persistence:** Document history must be reliably stored.

### Design Philosophy

Loro-P2P Next adheres to:
1.  **Direct Identification:** Use the Hypercore public key as the unique, stable identifier for each document log.
2.  **Leverage P2P Primitives:** Use Hypercore/Corestore/Hyperswarm for data storage, replication, and peer discovery.
3.  **Centralized Ownership:** Use a dedicated database (NeonDB) for managing ownership linked to Hypercore keys.
4.  **Separation:** Keep the ownership registry separate from the content logs (Corestore).
5.  **Append-Only History:** Store document evolution as snapshots in Hypercore (initially).
6.  **Simple Permissions:** Start with an owner-controls-all model.

### Architecture Overview

1.  **Registry DB (Central NeonDB - Server Only):**
    *   Stores mappings: `hypercorePublicKey -> { ownerId, currentCid }`.
    *   `hypercorePublicKey` is the primary key and the document's unique ID.
    *   Tracks the Blake3 hash (`currentCid`) of the *latest* snapshot for quick checks.
    *   Manages document ownership.

2.  **Corestore (Client & Server):**
    *   Manages local collections of Hypercores.
    *   Client: Uses browser-compatible storage (e.g., `random-access-web`).
    *   Server: Uses file system storage (e.g., `random-access-file`).

3.  **Hypercore (One per Loro Doc):**
    *   The append-only log for a single Loro document's history.
    *   **Identified uniquely by its public key.**
    *   Each block contains a full Loro document snapshot.

4.  **Hyperswarm (Client & Server):**
    *   Handles peer discovery and connection establishment.
    *   Peers find each other by joining "topics" derived from Hypercore discovery keys.
    *   Automatic connection management and multiplexing.

5.  **Peer Logic (`Peer` Class):**
    *   Encapsulates Corestore management, registry interaction, Hyperswarm setup, LoroDoc handling, and replication logic.

## Database Schemas

### Registry DB (NeonDB - Server Only)

```sql
-- Central registry mapping Hypercore keys to owners
CREATE TABLE registry (
  hypercore_key TEXT PRIMARY KEY, -- Public key (hex), unique ID for the doc log
  owner_id TEXT NOT NULL,         -- User ID of the owner (e.g., from BetterAuth)
  current_cid TEXT,           -- Blake3 hash of the latest snapshot (optional)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for finding docs owned by a user
CREATE INDEX registry_owner_id_idx ON registry(owner_id);
```

### Docs Storage (Corestore - Client & Server)

*   Managed by Corestore library.
*   Storage location configured per environment (browser/server).
*   Each document corresponds to a Hypercore identified by its public key.
*   Each block appended is a `Uint8Array` Loro snapshot.

## Key Concepts & Analogy Refined

*   **Hypercore Public Key:** The stable, unique identifier for the document AND its append-only log. **Analogy: A combined IPNS Name + permanent DNS record pointing directly to the data source.** It's the single ID you need.
*   **CID (Blake3 Hash):** Hash of a *specific* Loro snapshot (typically latest). Used for quick version checks via the registry. **Analogy: IPFS CID / Git Commit Hash.**

You refer to a document by its `hypercorePublicKey`. Replication uses this key. The registry confirms ownership and provides the `currentCid` for optimization.

## Peer Implementation (`Peer` Class Sketch)

```typescript
import Corestore from 'corestore';
import Hypercore from 'hypercore';
import Hyperswarm from 'hyperswarm';
import createStorage from 'your-storage-adapter'; // Placeholder for browser/node storage
import { LoroDoc } from 'loro-crdt';
import { hashService } from '$lib/KERNEL/hash-service'; // Assumes hashSnapshot method exists
import b4a from 'b4a'; // Buffer <=> Hex/String utilities

// Placeholder for NeonDB client type
type NeonDbClient = any; 

class Peer {
  userId: string;
  corestore: Corestore;
  registryDb?: NeonDbClient; // Server only
  swarm: Hyperswarm;
  joinedTopics: Set<string> = new Set(); // Track which discovery keys we've joined

  constructor(userId: string, storagePath: string, registryDb?: NeonDbClient) {
    this.userId = userId;
    this.corestore = new Corestore(createStorage(storagePath));
    this.registryDb = registryDb;
    
    // Initialize Hyperswarm for peer discovery
    this.swarm = new Hyperswarm();
    
    // Set up connection handler for peer connections
    this.swarm.on('connection', (connection, info) => {
      console.log('New peer connection from:', info.publicKey.toString('hex'));
      // Replicate the corestore with this peer
      this.corestore.replicate(connection);
      
      connection.on('error', err => {
        console.error('Connection error:', err);
      });
    });
  }

  /**
   * Creates a new Hypercore locally. Does NOT register it.
   * This should be called by the client that originates the document.
   */
  async createLocalDocCore(): Promise<{ hypercoreKey: string, initialSnapshot: Uint8Array }> {
    // Name is only used locally within this corestore instance before registration
    const localName = `doc-${crypto.randomUUID()}`;
    const docCore = this.corestore.get({ name: localName }); 
    await docCore.ready();
    const hypercoreKeyHex = b4a.toString(docCore.key, 'hex');

    // Initialize LoroDoc. Loro doesn't strictly need the ID passed here,
    // as the Hypercore key *is* the canonical ID in our system.
    const loroDoc = new LoroDoc(); 
    const initialSnapshot = loroDoc.snapshot();

    // Append the initial empty state
    await docCore.append(initialSnapshot);
    
    console.log(`Locally created Hypercore: ${hypercoreKeyHex}`);
    return { hypercoreKey: hypercoreKeyHex, initialSnapshot };
  }
  
  /**
   * Registers a new Hypercore in the central NeonDB registry.
   * Server-side action, typically called via an API request from the client.
   */
  async registerNewCore(hypercoreKey: string, ownerId: string, initialSnapshot: Uint8Array): Promise<void> {
      if (!this.registryDb) throw new Error("Registry operations are server-side only");

      const initialCid = await hashService.hashSnapshot(initialSnapshot);

      try {
          // Ensure the core is loaded in the server's corestore before registering
          const docCore = await this.getDocCore(hypercoreKey);

          await this.registryDb.query(`
            INSERT INTO registry (hypercore_key, owner_id, current_cid)
            VALUES ($1, $2, $3)
            ON CONFLICT (hypercore_key) DO NOTHING; -- Avoid duplicate registration errors
          `, [hypercoreKey, ownerId, initialCid]);
          
          // Join the swarm to make this core available
          await this.joinSwarmForDoc(hypercoreKey);
          
          console.log(`Registered Hypercore ${hypercoreKey} for owner ${ownerId}`);
      } catch (error) {
          console.error(`Failed to register Hypercore ${hypercoreKey}:`, error);
          throw error; 
      }
  }

  /**
   * Joins the swarm to discover peers for a specific document.
   */
  async joinSwarmForDoc(hypercoreKey: string): Promise<void> {
    const docCore = await this.getDocCore(hypercoreKey);
    const discoveryKey = docCore.discoveryKey.toString('hex');
    
    if (this.joinedTopics.has(discoveryKey)) {
      console.log(`Already joined swarm for ${hypercoreKey}`);
      return;
    }
    
    // Join the swarm for this discovery key
    this.swarm.join(docCore.discoveryKey);
    this.joinedTopics.add(discoveryKey);
    
    // Wait for the DHT announcement
    await this.swarm.flush();
    console.log(`Joined swarm for document: ${hypercoreKey}`);
  }
  
  /**
   * Leaves the swarm for a specific document.
   */
  async leaveSwarmForDoc(hypercoreKey: string): Promise<void> {
    const docCore = await this.getDocCore(hypercoreKey);
    const discoveryKey = docCore.discoveryKey.toString('hex');
    
    if (!this.joinedTopics.has(discoveryKey)) {
      console.log(`Not in swarm for ${hypercoreKey}`);
      return;
    }
    
    this.swarm.leave(docCore.discoveryKey);
    this.joinedTopics.delete(discoveryKey);
    console.log(`Left swarm for document: ${hypercoreKey}`);
  }

  /**
   * Appends a new snapshot to a document's Hypercore.
   * On the server, performs an ownership check before appending.
   */
  async appendUpdate(hypercoreKey: string, snapshot: Uint8Array, userIdMakingUpdate: string): Promise<void> {
    // Get the core using its public key
    const docCore = await this.getDocCore(hypercoreKey);

    // Server-side ownership check
    if (this.registryDb) {
      const owner = await this.getOwner(hypercoreKey);
      if (!owner) {
          throw new Error(`Hypercore ${hypercoreKey} not found in registry.`);
      }
      if (owner !== userIdMakingUpdate) {
        throw new Error(`User ${userIdMakingUpdate} is not the owner of ${hypercoreKey}`);
      }
    }
    
    // Append the new snapshot
    await docCore.append(snapshot);
    const newCid = await hashService.hashSnapshot(snapshot);
    console.log(`Appended update to ${hypercoreKey}, length ${docCore.length}, CID ${newCid}`);

    // Update CID in registry (server-side only)
    if (this.registryDb) {
        await this.registryDb.query(
          `UPDATE registry SET current_cid = $1, updated_at = now() WHERE hypercore_key = $2`,
          [newCid, hypercoreKey]
        );
    }
  }
  
  /**
   * Retrieves the owner ID from the registry.
   * Server-side only.
   */
  async getOwner(hypercoreKey: string): Promise<string | null> {
      if (!this.registryDb) {
          console.warn("Client cannot directly query ownership.");
          return null; 
      }
      const result = await this.registryDb.query(
          `SELECT owner_id FROM registry WHERE hypercore_key = $1`, 
          [hypercoreKey]
      );
      return result.rows[0]?.owner_id ?? null;
  }

  /**
   * Gets a Hypercore instance from the Corestore, ready for use.
   */
  async getDocCore(hypercoreKeyHex: string): Promise<Hypercore> {
    // Corestore caches instances, so this is efficient.
    const core = this.corestore.get({ 
        key: b4a.from(hypercoreKeyHex, 'hex'),
        valueEncoding: 'binary' // Treat blocks as raw buffers (snapshots)
    });
    await core.ready(); // Ensures the core is initialized
    return core;
  }

  /**
   * Retrieves the latest snapshot (latest block) from a given Hypercore.
   */
  async getLatestSnapshot(core: Hypercore): Promise<Uint8Array | null> {
      // core.update() fetches latest length info from peers/storage
      await core.update({ wait: false }); // Don't wait for full sync, just length
      if (core.length === 0) return null;
      try {
          // core.get() fetches the block if not available locally
          return await core.get(core.length - 1);
      } catch (err) {
          console.error(`Error getting block ${core.length - 1} for core ${b4a.toString(core.key, 'hex')}:`, err);
          return null;
      }
  }

  /**
   * Joins the swarm for all of a user's owned documents.
   * Server-side only.
   */
  async joinAllUserDocs(userId: string): Promise<void> {
      if (!this.registryDb) {
          console.warn("Client cannot query all user docs directly.");
          return;
      }
      
      const result = await this.registryDb.query(
          `SELECT hypercore_key FROM registry WHERE owner_id = $1`,
          [userId]
      );
      
      const cores = await Promise.all(
          result.rows.map(row => this.joinSwarmForDoc(row.hypercore_key))
      );
      
      console.log(`Joined swarm for ${cores.length} documents owned by ${userId}`);
  }
  
  /**
   * Clean up resources when the peer is no longer needed.
   */
  async destroy(): Promise<void> {
      // Leave all joined topics
      for (const discoveryKey of this.joinedTopics) {
          this.swarm.leave(Buffer.from(discoveryKey, 'hex'));
      }
      this.joinedTopics.clear();
      
      // Close the swarm
      await this.swarm.destroy();
      
      // Close the corestore
      await this.corestore.close();
      
      console.log('Peer resources cleaned up');
  }
}
```

## Client-Server Sync & API Flow

1.  **Client Creates Doc:**
    *   User action triggers `peer.createLocalDocCore()` -> gets `{ hypercoreKey, initialSnapshot }`.
    *   Client calls server API `POST /api/docs/register` with `{ hypercoreKey, initialSnapshot }` body.
2.  **Server Registers Doc (`POST /api/docs/register`):**
    *   Auth middleware provides `userId`.
    *   Server calls `peer.registerNewCore(hypercoreKey, userId, initialSnapshot)`.
    *   This loads the core in the server's corestore and joins the Hyperswarm topic for it.
    *   Responds with success/failure.
3.  **Client Joins Swarm:**
    *   After successful registration, client calls `peer.joinSwarmForDoc(hypercoreKey)`.
    *   Hyperswarm announces the client's interest in this topic to the DHT.
    *   Hyperswarm discovers and connects to other peers (including the server) interested in this topic.
    *   When connection is established, Corestore's replication protocol syncs the Hypercore.
4.  **Initial Sync / Loading Docs:**
    *   Client calls server API `GET /api/docs/my` to get a list of `{ hypercoreKey }` it owns.
    *   For each key, client calls `peer.getDocCore(key)` to load it into its Corestore.
    *   Client then calls `peer.joinSwarmForDoc(key)` to join the swarm for each document.
    *   Hyperswarm handles discovering and connecting to peers.
    *   Corestore replication automatically syncs blocks for these cores via Hyperswarm connections.
    *   Client calls `peer.getLatestSnapshot(core)` to load initial state into LoroDoc.
5.  **Client Updates Doc:**
    *   User edits -> `localLoroDoc` changes -> `newSnapshot = localLoroDoc.snapshot()`.
    *   Client gets `hypercoreKey` associated with the `localLoroDoc`.
    *   Client calls server API `PUT /api/docs/:hypercoreKey/update` with `{ snapshot: newSnapshot }` body.
6.  **Server Stores Update (`PUT /api/docs/:key/update`):**
    *   Auth middleware provides `userId`.
    *   Server calls `peer.appendUpdate(hypercoreKey, snapshot, userId)` (includes ownership check).
    *   This appends the new block to the server's Hypercore.
    *   Responds success/failure.
7.  **Update Replication:**
    *   The server's `appendUpdate` triggers an update to its Hypercore.
    *   Via existing Hyperswarm connections, Corestore replication automatically propagates the new block to connected peers.
8.  **Client Receives Update:**
    *   Client has a Hypercore `'append'` event handler.
    *   On `'append'` for a specific `docCore`, client calls `peer.getLatestSnapshot(docCore)`.
    *   Imports the snapshot: `localLoroDoc.import(latestSnapshot)`.
    *   UI updates.

## Tech Stack Integration

*   **Dependencies:**
    *   `corestore`: Core dependency for managing Hypercores.
    *   `hypercore`: Core dependency for append-only logs.
    *   `hyperswarm`: Core dependency for peer discovery and connection management.
    *   `random-access-file` (Node.js/Server): For file system storage.
    *   `random-access-web` (Browser): For IndexedDB/browser storage.
    *   `b4a`: Buffer utilities.
    *   NeonDB client (Server).
*   **Client (`+page.svelte`):**
    *   Import and initialize `Peer` using `random-access-web`.
    *   Interact with server API (`/register`, `/update`, `/my`).
    *   Join swarms for documents.
    *   Load/Save LoroDocs, listen to Hypercore `append` events.
*   **Server (Elysia `+server.ts`):**
    *   Import and initialize `Peer` using `random-access-file` and NeonDB client.
    *   Implement API endpoints (`/register`, `/update`, `/my`) using auth middleware.
*   **Hashing (`hash-service.ts`):**
    *   Needs `hashSnapshot(snapshot: Uint8Array): Promise<string>` using Blake3.

## Revised Implementation Strategy: Iterative & Testable Milestones

This plan breaks down the implementation into smaller, verifiable steps. After each milestone, you can perform the specified manual tests to ensure stability before proceeding.

**Milestone 1: Foundational Setup (Local Only)**

*   **Goal:** Set up the basic project structure, dependencies, and create a local-only Hypercore for a document.
*   **Tasks:**
    1.  **Update `package.json`:** Add core dependencies (`corestore`, `hypercore`, `hyperswarm`, `b4a`, `random-access-web`, `random-access-file`). Run `bun install`.
    2.  **Setup `hash-service.ts`:** Implement `hashSnapshot(snapshot: Uint8Array): Promise<string>` using Blake3.
    3.  **Implement basic `Peer` class (Skeleton):**
        *   Create `src/lib/Peer.ts` (or similar).
        *   Implement the constructor (`userId`, `storagePath`, initializes `Corestore` with a basic adapter like `random-access-memory` for initial testing).
        *   Implement `createLocalDocCore()`: Creates a new Hypercore, appends an initial empty Loro snapshot, returns the hex `hypercoreKey` and `initialSnapshot`.
*   **Manual Test & Verification (User Intervention):**
    *   **Can you instantiate the `Peer` class in a test script or temporary Svelte component?** (e.g., `new Peer('test-user', 'temp-storage')`). Check browser console for errors.
    *   **Can you call `peer.createLocalDocCore()` from the test component/script?** Does it run without errors? Check browser console.
    *   **Does `createLocalDocCore()` return a valid-looking hex string (`hypercoreKey`) and a `Uint8Array` (`initialSnapshot`)?** `console.log` these values to confirm their format in the browser console.
    *   *(No server, database, or networking involved yet)*.

**Milestone 2: Server Setup & Basic Registration API**

*   **Goal:** Set up the Elysia server, establish the NeonDB registry schema, and **modify the existing API** for document registration (without full Hyperswarm/Corestore logic yet).
*   **Tasks:**
    1.  **Set up Registry NeonDB Schema:** Execute the `CREATE TABLE registry ...` SQL in your NeonDB instance. Configure DB connection details securely (reuse existing `$db` client setup if appropriate).
    2.  **Server `Peer` Instance:** Configure the server to initialize a `Peer` instance on startup (using `random-access-file` for storage and passing the existing NeonDB client from `$db`).
    3.  **Modify `POST /api/docs` Endpoint (Basic Registration Logic):**
        *   Locate the existing `POST /api/docs` route in `+server.ts`.
        *   Ensure the `requireAuth` middleware is applied (already seems to be).
        *   Change the expected request body to accept `{ hypercoreKey: string, initialSnapshot: Uint8Array }` (update validation if needed, e.g., using `t.Object`).
        *   **Remove the old logic** that inserts directly into the `docs` table.
        *   Implement and call a *new*, simple server `Peer` method like `registerCoreInDb(hypercoreKey, ownerId, initialSnapshot)` which performs the NeonDB `INSERT` into the **new `registry` table** (using `current_cid` from `hash-service`).
*   **Manual Test & Verification (User Intervention):**
    *   **Start the Elysia server.** Does it start without errors? Check server terminal logs.
    *   **Using a tool like `curl` or Hoppscotch/Postman, send a valid request to the modified `POST /api/docs` endpoint** (use the *new* expected body format). Ensure auth works.
    *   **Check the server terminal logs.** Did the request get processed by the *new* logic without errors?
    *   **Check your NeonDB `registry` table.** Was a new row inserted with the correct `hypercore_key`, `owner_id`, and `current_cid`?
    *   *(Client is not involved yet; Server Peer doesn't interact with Corestore/Hyperswarm for this milestone)*.

**Milestone 3: Server Core Loading & Basic Swarm Join**

*   **Goal:** Make the server load the registered Hypercore into its Corestore and attempt to join the Hyperswarm topic for it upon registration.
*   **Tasks:**
    1.  **Implement `Peer.getDocCore(hypercoreKey)`:** Ensure it correctly loads/creates a Hypercore instance using the provided key within the server's Corestore.
    2.  **Implement `Peer.joinSwarmForDoc(hypercoreKey)` (Basic):**
        *   Get the `docCore` using `getDocCore`.
        *   Get the `discoveryKey`.
        *   Initialize the `Hyperswarm` instance in the `Peer` constructor if not already done.
        *   Call `this.swarm.join(docCore.discoveryKey)` and `this.swarm.flush()`.
        *   Add logging to confirm joining attempts.
    3.  **Modify `POST /api/docs` Endpoint (Integrate Swarm Join):** In the logic modified in M2, **after** successfully inserting into the `registry` DB, call `peer.joinSwarmForDoc(hypercoreKey)`.
*   **Manual Test & Verification (User Intervention):**
    *   **Restart the server.**
    *   **Call the modified `POST /api/docs` endpoint again** (with a *new* `hypercoreKey`) using `curl` or similar tool.
    *   **Check the server terminal logs.** Do you see logs indicating:
        *   DB insertion succeeded?
        *   The Hypercore was loaded/retrieved via `getDocCore`?
        *   An attempt to join the swarm for the specific discovery key? (`Joined swarm for document: ...`)
    *   **Check the NeonDB `registry` table** to ensure registration still works.
    *   *(No actual P2P connection yet, just server-side setup)*.

**Milestone 4: Client Initialization & Swarm Join**

*   **Goal:** Set up the client `Peer` instance and make it join the Hyperswarm network for a document created locally.
*   **Tasks:**
    1.  **Client `Peer` Initialization:** In your Svelte component (`+page.svelte` or a dedicated service), initialize the `Peer` instance on mount (using `random-access-web`). Get the `userId` from your auth state.
    2.  **Implement Client Document Creation Flow:**
        *   Add a button "Create New Doc".
        *   On click:
            *   Call `peer.createLocalDocCore()` (from M1).
            *   Call the server `POST /api/docs/register` endpoint with the result.
            *   **Crucially:** If registration succeeds, call `peer.joinSwarmForDoc(hypercoreKey)` on the *client* side.
*   **Manual Test & Verification (User Intervention):**
    *   **Ensure the server is running.**
    *   **Open the client application in your browser.** Use the browser's developer console extensively.
    *   **Click the "Create New Doc" button.** Add temporary UI feedback (e.g., a status message like "Creating doc...").
    *   **Check Server Logs:** Does the server process the `POST /api/docs` request using the M3 logic (DB insert, logs joining swarm)?
    *   **Check Client Browser Console:**
        *   Does the client `console.log` the `hypercoreKey` from `createLocalDocCore`?
        *   Does the API call to `POST /api/docs` succeed (check Network tab)?
        *   Does the client `console.log` attempting to join the swarm (`Joined swarm for document: ...`) after successful registration?
        *   **Do you see Hyperswarm logs (often verbose) indicating a connection was established between the client and server?** Look for logs like `New peer connection from: ...` on both client console and server terminal, related to the document's discovery key.
    *   Update UI feedback on success/failure (e.g., "Doc Created & Syncing" or "Registration Failed").
    *   *(First actual P2P connection established! No data sync yet)*.

**Milestone 5: Basic Replication & Initial Load**

*   **Goal:** Sync the initial document snapshot from the server to the client via the established Hyperswarm connection after fetching owned documents.
*   **Tasks:**
    1.  **Implement `Peer.getLatestSnapshot(core)`:** Add this method to retrieve the last block from a Hypercore.
    2.  **Implement `GET /api/docs/my` Endpoint:**
        *   Create a **new route** `GET /api/docs/my` in `+server.ts` (or repurpose `GET /api/docs` if preferred, but a dedicated route is cleaner).
        *   Apply the `requireAuth` middleware.
        *   Query the **new `registry` table** using the authenticated `userId` (`owner_id`).
        *   Return a list of the user's owned `{ hypercoreKey: string }`.
    3.  **Implement Client Document Loading:**
        *   Client calls the **new `GET /api/docs/my`** endpoint on load.
        *   For each `hypercoreKey` received:
            *   Client calls `peer.getDocCore(key)`.
            *   Client calls `peer.joinSwarmForDoc(key)`.
            *   *After* joining the swarm, attempt to load the initial state: call `peer.getLatestSnapshot(docCore)` and log the result. (Replication happens automatically once peers connect and cores are loaded).
*   **Manual Test & Verification (User Intervention):**
    *   **Clear client storage (IndexedDB -> Application tab in DevTools) and restart server/client.**
    *   **Create a new document using the client UI** (verify with logs from M4).
    *   **Refresh the client page.**
    *   **Check Client Browser Console:**
        *   Does the client fetch the list of owned docs (check Network tab for **`GET /api/docs/my`** call and its response)?
        *   Does it `console.log` joining the swarm for the fetched document?
        *   After joining, does it successfully `console.log` the `Uint8Array` of the initial snapshot retrieved via `getLatestSnapshot`? (This confirms replication worked). You might log its length or a slice of it.
    *   Add simple UI feedback indicating documents are being loaded/synced.
    *   *(Client can now load the initial state of its documents)*.

**(Further Milestones will follow this pattern: Implement Server API -> Implement Client Interaction -> Test End-to-End Flow)**

*   **M6: Document Update API** (Modify existing Server `PUT /api/docs/:id` to become `PUT /api/docs/:hypercoreKey` using `peer.appendUpdate`)
*   **M7: Real-time Client Updates** (Client `append` listener, `getLatestSnapshot`, update LoroDoc)
*   **M8: Basic UI Integration** (Display docs, basic content view)
*   ... and so on.

## Future Enhancements

*   **Sparse Syncing:** Leverage Hypercore features to only download necessary blocks if full history isn't needed.
*   **Multi-Device:** Handle same user on multiple devices scenario.
*   **Batching:** Batch snapshot appends or API calls for efficiency.
*   **Client-to-Client Direct:** Enable direct client-to-client syncing.

This architecture using Hyperswarm from the beginning provides a more complete P2P experience while still maintaining the clear ownership model via the NeonDB registry.
