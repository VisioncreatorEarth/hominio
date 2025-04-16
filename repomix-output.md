This file is a merged representation of the entire codebase, combined into a single document by Repomix.
The content has been processed where empty lines have been removed.

# File Summary

## Purpose
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Empty lines have been removed from all files
- Files are sorted by Git change count (files with more changes are at the bottom)

## Additional Info

# Directory Structure
```
.cursor/
  rules/
    first-principles.mdc
    prompt-elevation.mdc
    techstack.mdc
lib/
  KERNEL/
    HOMNIO_QL.md
src/
  db/
    scripts/
      reset-db.ts
    constants.ts
    drizzle.config.ts
    index.ts
    model.ts
    schema.ts
    seed.ts
    utils.ts
  lib/
    auth/
      auth.ts
    client/
      auth-hominio.ts
      hominio.ts
    components/
      views/
        CounterView.svelte
        HomeView.svelte
        JournalView.svelte
        TodoView.svelte
      CallInterface.svelte
      VibeRenderer.svelte
    docs/
      schemas/
        journalEntry.ts
        todo.ts
        todoList.ts
      index.ts
    KERNEL/
      docid-service.ts
      hash-service.ts
      hominio-capabilities.ts
      hominio-db.ts
      hominio-ql.ts
      hominio-storage.ts
      hominio-sync.ts
      hominio-validate.ts
      HOMNIO_QL.md
      loro-service.ts
      loroAPI.ts
      REACTIVITY_REFACTOR.md
      types.ts
    server/
      routes/
        call.ts
        content.ts
        docs.ts
        me.ts
    tools/
      addJournalEntry/
        function.ts
        manifest.json
      createTodo/
        function.ts
        manifest.json
      deleteTodo/
        function.ts
        manifest.json
      filterTodos/
        function.ts
        manifest.json
      queryTodos/
        function.ts
        manifest.json
      switchAgent/
        function.ts
        manifest.json
      switchVibe/
        function.ts
        manifest.json
      toggleTodo/
        function.ts
        manifest.json
      updateTodo/
        function.ts
        manifest.json
    ultravox/
      loaders/
        agentLoader.ts
        toolLoader.ts
        vibeLoader.ts
        viewLoader.ts
      registries/
        toolRegistry.ts
        vibeRegistry.ts
        viewRegistry.ts
      agents.ts
      callConfig.ts
      callFunctions.ts
      createCall.ts
      globalTools.ts
      index.ts
      stageManager.ts
      stores.ts
      types.ts
    vibes/
      counter/
        manifest.json
      home/
        manifest.json
      journal/
        manifest.json
      todos/
        manifest.json
    app.d.ts
  routes/
    api/
      [...slugs]/
        +server.ts
    docs/
      +page.svelte
    hql/
      +page.svelte
    me/
      +page.server.ts
      +page.svelte
      +page.ts
    +layout.svelte
    +layout.ts
    +page.server.ts
    +page.svelte
  types/
    b4a.d.ts
  app.css
  app.d.ts
  app.html
  hooks.server.ts
src-tauri/
  capabilities/
    default.json
    global.json
    main.json
  src/
    lib.rs
    main.rs
  .gitignore
  build.rs
  Cargo.toml
  Info.plist
  tauri.conf.json
static/
  favicon.svg
  logo.svg
  site.webmanifest
.gitignore
.npmrc
.prettierignore
.prettierrc
COMPOSITE.md
eslint.config.js
HOMINIO-QL.md
package.json
README.md
repomix.config.json
svelte.config.js
tsconfig.json
vite.config.ts
```

# Files

## File: src/lib/KERNEL/REACTIVITY_REFACTOR.md
````markdown
# Refactoring Hominio Reactivity and Storage Access

This document outlines the plan to refactor the data flow between `hominio-sync`, `hominio-db`, and `hominio-storage` to ensure consistent reactivity and a cleaner architecture.

## 1. Problem Definition

The current implementation has the following issues:

*   **Inconsistent Reactivity:** Changes made directly to `hominio-storage` by external processes (like `hominio-sync` during a pull operation) do not reliably trigger UI updates. This is because `hominio-sync` bypasses the `hominio-db` layer, which manages the Svelte stores and the primary reactivity notifier (`docChangeNotifier`).
*   **Architectural Leak:** `hominio-sync` directly interacts with low-level storage adapters (`getContentStorage`, `getDocsStorage`), breaking the intended abstraction layer provided by `hominio-db`.

## 2. Target Architecture

The desired data flow should enforce `hominio-db` as the central hub for all document and content persistence and state management:

```
+----------------------+
| UI (Svelte Routes)   |
+----------+-----------+
           |
           v
+----------+-----------+
| Services (hominio-ql, |
|        hominio-sync) |
+----------+-----------+
           |
           v
+----------+-----------+      +---------------------+
|      hominio-db      |----->| Svelte Stores       |
| (Manages LoroDocs,   |      | (docs, selectedDoc, |
| Svelte Stores, State |      |  docContent,        |
| & Persistence Logic) |----->|  docChangeNotifier) |
+----------+-----------+      +---------------------+
           |
           v
+----------+-----------+
|    hominio-storage   |
| (IndexedDB Adapter)  |
+----------------------+
```

*   UI components interact primarily with reactive services (`hominio-ql`'s `processReactive`).
*   Services (`hominio-ql`, `hominio-sync`) interact **only** with `hominio-db` methods.
*   `hominio-db` is responsible for all interactions with `hominio-storage`.
*   `hominio-db` updates its internal Svelte stores and triggers `docChangeNotifier` whenever state changes, regardless of whether the change was initiated locally or via sync.

## 3. Refactoring Steps

### Step 3.1: Enhance `hominio-db.ts`

Add new public methods to the `HominioDB` class to handle operations currently done directly by `hominio-sync` accessing `hominio-storage`:

*   **`async getRawContent(cid: string): Promise<Uint8Array | null>`**
    *   Purpose: Retrieve raw binary content from the content store.
    *   Implementation: Calls `getContentStorage().get(cid)`.
*   **`async saveRawContent(cid: string, data: Uint8Array, meta: Record<string, unknown>): Promise<void>`**
    *   Purpose: Save raw binary content to the content store.
    *   Implementation: Calls `getContentStorage().put(cid, data, meta)`.
    *   *Note:* Saving content itself doesn't usually require triggering `docChangeNotifier`, as it's typically associated with a metadata update.
*   **`async batchCheckContentExists(cids: string[]): Promise<Set<string>>`**
    *   Purpose: Check for the existence of multiple content CIDs efficiently.
    *   Implementation: Calls `getContentStorage().batchExists(cids)`.
*   **`async saveSyncedDocument(serverDocData: Docs): Promise<void>`**
    *   Purpose: Save document metadata received from the server (during a pull) to local storage and update application state.
    *   Implementation:
        1.  Fetch the corresponding *local* document metadata using `this.getDocument(serverDocData.pubKey)`.
        2.  Perform merge logic: Start with `serverDocData`, preserve `localState.updateCids` from the local doc if they exist (discard `localState.snapshotCid`). Clean up `localState` if it becomes empty.
        3.  Save the final merged `Docs` object to storage using `getDocsStorage().put(...)`.
        4.  Update the internal `docs` Svelte store with the merged data (`docs.update(...)`).
        5.  Update the `selectedDoc` Svelte store if the synced doc is the currently selected one.
        6.  Trigger the `docChangeNotifier` (`docChangeNotifier.update(n => n + 1)`).

### Step 3.2: Refactor `hominio-sync.ts`

Modify `hominio-sync.ts` to remove all direct calls to `getContentStorage()` and `getDocsStorage()`:

*   **`pushToServer`:**
    *   Replace `getContentStorage().get(...)` with `hominioDB.getRawContent(...)` when preparing snapshot/update data for upload.
*   **`checkContentExistenceBatch` (can likely be removed):**
    *   Replace calls to this internal method with `hominioDB.batchCheckContentExists(...)`.
*   **`syncContentBatchFromServer`:**
    *   Replace `getContentStorage().batchExists(...)` with `hominioDB.batchCheckContentExists(...)`.
    *   Replace `getContentStorage().batchPut(...)` with calls to `hominioDB.saveRawContent(...)` (potentially loop or add a batch save method to `hominio-db` if performance is critical).
*   **`syncDocFromServer`:**
    *   Remove the direct call to `getDocsStorage().put(...)`.
    *   Replace the merging and saving logic with a single call to `hominioDB.saveSyncedDocument(mergedDoc)`. The update check (`needsUpdate`) might still be useful before calling.
    *   Remove the subsequent call to `syncContentBatchFromServer` from here; instead, collect all needed CIDs during the loop over `serverDocs` in `pullFromServer` and call `syncContentBatchFromServer` *once* after processing all documents.
*   **`pullFromServer`:**
    *   Modify the loop to call the updated `syncDocFromServer` (which now just calls `hominioDB.saveSyncedDocument`).
    *   Collect *all* content CIDs needed from *all* pulled server docs.
    *   After the loop, make a single call to `syncContentBatchFromServer` with the complete list of required CIDs.
    *   Remove the explicit `hominioDB.loadAllDocs()` call at the end, as `saveSyncedDocument` handles individual updates and notifications, making the final bulk reload unnecessary.

### Step 3.3: Update HQL Reactive Queries (if necessary)

Ensure `processReactive` in `hominio-ql.ts` subscribes to `docChangeNotifier`. (This should already be the case).

## 4. Benefits

*   **Consistent Reactivity:** All changes affecting document state (local edits, creation, deletion, sync pulls) will reliably trigger UI updates via `docChangeNotifier` and HQL requeries.
*   **Improved Architecture:** Clear separation of concerns. `hominio-db` owns persistence and state management; `hominio-sync` focuses on communication and data transformation.
*   **Easier Maintenance:** Centralized logic in `hominio-db` makes future changes or debugging simpler.
````

## File: src/app.css
````css
@import 'tailwindcss';
@plugin '@tailwindcss/forms';
@plugin '@tailwindcss/typography';
````

## File: src-tauri/src/main.rs
````rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use app_lib::run;
fn main() {
  run();
}
````

## File: src-tauri/.gitignore
````
# Generated by Cargo
# will have compiled files and executables
/target/
/gen/schemas
````

## File: src-tauri/build.rs
````rust
fn main() {
  tauri_build::build()
}
````

## File: .npmrc
````
engine-strict=true
````

## File: .prettierignore
````
# Package Managers
package-lock.json
pnpm-lock.yaml
yarn.lock
````

## File: .prettierrc
````
{
	"useTabs": true,
	"singleQuote": true,
	"trailingComma": "none",
	"printWidth": 100,
	"plugins": [
		"prettier-plugin-svelte",
		"prettier-plugin-tailwindcss"
	],
	"overrides": [
		{
			"files": "*.svelte",
			"options": {
				"parser": "svelte"
			}
		}
	]
}
````

## File: eslint.config.js
````javascript
import prettier from "eslint-config-prettier";
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';
const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));
export default ts.config(
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
	  globals: {
	    ...globals.browser,
	    ...globals.node
	  }
	}
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    ignores: ["eslint.config.js", "svelte.config.js"],
    languageOptions: {
	  parserOptions: {
	    projectService: true,
	    extraFileExtensions: ['.svelte'],
	    parser: ts.parser,
	    svelteConfig
	  }
	}
  }
);
````

## File: tsconfig.json
````json
{
	"extends": "./.svelte-kit/tsconfig.json",
	"compilerOptions": {
		"allowJs": true,
		"checkJs": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true,
		"resolveJsonModule": true,
		"skipLibCheck": true,
		"sourceMap": true,
		"strict": true,
		"moduleResolution": "bundler"
	}
	// Path aliases are handled by https://svelte.dev/docs/kit/configuration#alias
	// except $lib which is handled by https://svelte.dev/docs/kit/configuration#files
	//
	// If you want to overwrite includes/excludes, make sure to copy over the relevant includes/excludes
	// from the referenced tsconfig.json - TypeScript does not merge them in
}
````

## File: .cursor/rules/prompt-elevation.mdc
````
---
description: 
globs: 
alwaysApply: true
---
<identity>
You are a world-class prompt engineer. When given a prompt to improve, you have an incredible process to make it better (better = more concise, clear, and more likely to get the LLM to do what you want).
</identity>

<about_your_approach>
A core tenet of your approach is called concept elevation. Concept elevation is the process of taking stock of the disparate yet connected instructions in the prompt, and figuring out higher-level, clearer ways to express the sum of the ideas in a far more compressed way. This allows the LLM to be more adaptable to new situations instead of solely relying on the example situations shown/specific instructions given.

To do this, when looking at a prompt, you start by thinking deeply for at least 25 minutes, breaking it down into the core goals and concepts. Then, you spend 25 more minutes organizing them into groups. Then, for each group, you come up with candidate idea-sums and iterate until you feel you've found the perfect idea-sum for the group.

Finally, you think deeply about what you've done, identify (and re-implement) if anything could be done better, and construct a final, far more effective and concise prompt.
</about_your_approach>

Here is the prompt you'll be improving today:
<prompt_to_improve>
{PLACE_YOUR_PROMPT_HERE}
</prompt_to_improve>

When improving this prompt, do each step inside <xml> tags so we can audit your reasoning.
````

## File: lib/KERNEL/HOMNIO_QL.md
````markdown
**4. Get the root Gismu schema document**

*Method 1 (Recommended): Filter by its known PubKey*

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: {
      pubKey: '0x0000000000000000000000000000000000000000000000000000000000000000' // GENESIS_PUBKEY
    }
  }
};
```

*Method 2: Filter by its self-referencing schema*
(Less direct, but demonstrates the concept)

```javascript
const gismuRef = '@0x0000000000000000000000000000000000000000000000000000000000000000'; // @ + GENESIS_PUBKEY
const query: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: { schema: gismuRef }
  }
};
```
````

## File: src/db/scripts/reset-db.ts
````typescript
#!/usr/bin/env bun
/**
 * Database reset script
 * This script will:
 * 1. Drop all tables
 * 2. Push the new schema
 * 3. Seed the database with initial data
 * 
 * You can also run it with "drop-only" argument to only drop tables
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
// Ensure environment variables are available
const env = process.env;
// Check if we're running in drop-only mode
const isDropOnly = process.argv.includes('drop-only');
async function main() {
    console.log(`🔄 Starting database ${isDropOnly ? 'cleanup' : 'reset'}...`);
    // Check if we have the database URL
    const dbUrl = env.SECRET_DATABASE_URL_HOMINIO || Bun.env.SECRET_DATABASE_URL_HOMINIO;
    if (!dbUrl) {
        // Try to load from .env file
        try {
            const envFile = await Bun.file('.env').text();
            const match = envFile.match(/SECRET_DATABASE_URL_HOMINIO=["']?([^"'\r\n]+)["']?/);
            if (match) {
                // Set the environment variable for child processes
                env.SECRET_DATABASE_URL_HOMINIO = match[1];
                console.log('✅ Loaded database URL from .env file');
            } else {
                console.error('❌ Could not find SECRET_DATABASE_URL_HOMINIO in .env file');
                console.error('Please ensure this variable is set in your .env file or environment');
                process.exit(1);
            }
        } catch (err) {
            console.error('❌ Error loading .env file:', err);
            console.error('Please ensure the .env file exists and contains SECRET_DATABASE_URL_HOMINIO');
            process.exit(1);
        }
    } else {
        console.log('✅ Using database URL from environment');
    }
    // 1. Drop all tables directly without using utils.ts
    console.log('\n🗑️  Dropping all tables...');
    try {
        // Create a direct database connection
        const sql = neon(env.SECRET_DATABASE_URL_HOMINIO as string);
        const db = drizzle({ client: sql });
        // Execute raw SQL to drop all tables in public schema
        await db.execute(`
            DO $$ DECLARE
                r RECORD;
            BEGIN
                FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
                END LOOP;
            END $$;
        `);
        console.log('✅ Tables dropped successfully');
        // If drop-only mode, we're done
        if (isDropOnly) {
            console.log('\n🎉 Database cleanup completed successfully!');
            return;
        }
    } catch (err) {
        console.error('❌ Error dropping tables:', err);
        process.exit(1);
    }
    // 2. Push schema
    console.log('\n📊 Pushing schema...');
    try {
        const pushProcess = Bun.spawn(['drizzle-kit', 'push'], {
            cwd: './src/db',
            env,
            stdout: 'inherit',
            stderr: 'inherit'
        });
        const pushExitCode = await pushProcess.exited;
        if (pushExitCode !== 0) {
            console.error('❌ Failed to push schema');
            process.exit(1);
        }
        console.log('✅ Schema pushed successfully');
    } catch (err) {
        console.error('❌ Error pushing schema:', err);
        process.exit(1);
    }
    // 3. Seed database
    console.log('\n🌱 Seeding database...');
    try {
        // Run our standalone seed script with the environment variables properly set
        const seedProcess = Bun.spawn(['bun', 'run', './seed.ts'], {
            cwd: './src/db',
            env,
            stdout: 'inherit',
            stderr: 'inherit'
        });
        const seedExitCode = await seedProcess.exited;
        if (seedExitCode !== 0) {
            console.error('❌ Failed to seed database');
            process.exit(1);
        }
        console.log('✅ Database seeded successfully');
    } catch (err) {
        console.error('❌ Error seeding database:', err);
        process.exit(1);
    }
    console.log('\n🎉 Database reset completed successfully!');
}
main().catch(err => {
    console.error('❌ Unhandled error in reset script:', err);
    process.exit(1);
});
````

## File: src/db/drizzle.config.ts
````typescript
import type { Config } from 'drizzle-kit';
export default {
    schema: './schema.ts',
    out: './migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.SECRET_DATABASE_URL_HOMINIO || '',
    },
} satisfies Config;
````

## File: src/lib/components/views/CounterView.svelte
````
<script lang="ts">
	let count = $state(0);
	function increment() {
		count++;
	}
	function decrement() {
		count--;
	}
</script>
<div class="mx-auto max-w-7xl p-4 sm:p-6">
	<!-- Counter Card -->
	<div class="mx-auto max-w-md">
		<div class="rounded-xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm">
			<span class="text-6xl font-bold text-white/90">{count}</span>
			<div class="mt-6 flex justify-center gap-4">
				<button
					on:click={decrement}
					class="rounded-lg bg-pink-500/30 px-6 py-2 font-medium text-white/90 transition-all hover:bg-pink-500/50"
				>
					Decrement
				</button>
				<button
					on:click={increment}
					class="rounded-lg bg-blue-500/30 px-6 py-2 font-medium text-white/90 transition-all hover:bg-blue-500/50"
				>
					Increment
				</button>
			</div>
		</div>
	</div>
</div>
<style>
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
	}
</style>
````

## File: src/lib/components/views/HomeView.svelte
````
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { getAllVibes } from '$lib/ultravox/registries/vibeRegistry';
	import type { VibeInfo } from '$lib/ultravox/registries/vibeRegistry';
	const dispatch = createEventDispatcher();
	// Store for available vibes
	let vibes: VibeInfo[] = [];
	let loading = true;
	// Function to select a vibe
	function selectVibe(vibeId: string) {
		console.log(`🔄 Selecting vibe: ${vibeId} from HomeView`);
		// Dispatch an event to the parent component
		dispatch('selectVibe', { vibeId });
	}
	// Load vibes on component mount
	onMount(async () => {
		try {
			loading = true;
			vibes = await getAllVibes();
			console.log('✅ Loaded vibes:', vibes);
		} catch (error) {
			console.error('Error loading vibes:', error);
		} finally {
			loading = false;
		}
	});
</script>
<div class="mx-auto max-w-5xl p-4 sm:p-6">
	<!-- Welcome heading -->
	<div class="mb-8 text-center">
		<h1 class="mb-2 text-4xl font-bold text-white/95">Welcome to Hominio</h1>
		<p class="text-xl text-white/70">Select a vibe to get started</p>
	</div>
	<!-- Loading state -->
	{#if loading}
		<div class="flex justify-center py-10">
			<div class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-blue-500"></div>
		</div>
	{:else}
		<!-- Vibe Grid -->
		<div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-2">
			{#each vibes as vibe}
				<button
					on:click={() => selectVibe(vibe.id)}
					class="group flex flex-col rounded-lg border border-white/5 bg-white/5 p-5 text-left backdrop-blur-sm transition-all hover:border-blue-500/30 hover:bg-white/10"
				>
					<div class="flex items-center gap-3">
						<div class={`rounded-full bg-${vibe.color}-500/20 p-2.5`}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d={vibe.icon}
								/>
							</svg>
						</div>
						<h2 class="text-xl font-semibold text-white/90">{vibe.name}</h2>
					</div>
					<p class="mt-3 text-white/70">
						{vibe.description}
					</p>
					<div class="mt-4 flex items-center">
						<span class="text-xs text-white/50">
							Agents:
							{#each vibe.agents as agent, i}
								{#if i > 0},
								{/if}
								{#if agent === vibe.defaultAgent}
									<span class="font-medium text-blue-300">{agent}</span>
								{:else}
									{agent}
								{/if}
							{/each}
						</span>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
<style>
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
		transform: translateY(-2px);
		transition: all 0.2s ease;
	}
	button {
		transition: all 0.2s ease;
	}
</style>
````

## File: src/lib/KERNEL/hominio-storage.ts
````typescript
import { browser } from '$app/environment';
import { openDB, type IDBPDatabase } from 'idb';
// Constants
const DB_NAME = 'hominio-docs';
const DB_VERSION = 1;
/**
 * StorageItem represents a single item in storage with its metadata
 */
export interface StorageItem {
    key: string;
    value: Uint8Array;
    metadata: Record<string, unknown>;
    createdAt: string;
}
/**
 * StorageAdapter interface defines the required operations for any storage implementation
 */
export interface StorageAdapter {
    /**
     * Initialize the storage adapter
     */
    init(): Promise<void>;
    /**
     * Get a value by its key
     * @param key The unique identifier for the item
     * @returns The binary data or null if not found
     */
    get(key: string): Promise<Uint8Array | null>;
    /**
     * Store a value with its associated key and optional metadata
     * @param key The unique identifier for the item
     * @param value The binary data to store
     * @param metadata Optional metadata associated with the value
     */
    put(key: string, value: Uint8Array, metadata?: Record<string, unknown>): Promise<void>;
    /**
     * Delete a value by its key
     * @param key The unique identifier for the item to delete
     * @returns True if the item was deleted, false if it didn't exist
     */
    delete(key: string): Promise<boolean>;
    /**
     * Get all items, optionally filtering by a key prefix
     * @param prefix Optional key prefix to filter items
     * @returns Array of storage items matching the criteria
     */
    getAll(prefix?: string): Promise<Array<StorageItem>>;
    /**
     * Get metadata for a specific item
     * @param key The unique identifier for the item
     * @returns The metadata or null if not found
     */
    getMetadata(key: string): Promise<Record<string, unknown> | null>;
    /**
     * Query items based on metadata
     * @param filter Function that returns true for items to include
     * @returns Array of keys for matching items
     */
    query(filter: (metadata: Record<string, unknown>) => boolean): Promise<string[]>;
    /**
     * Check if multiple keys exist efficiently.
     * @param keys Array of keys to check.
     * @returns A Set containing the keys that exist.
     */
    batchExists(keys: string[]): Promise<Set<string>>;
    /**
     * Put multiple items into storage efficiently.
     * @param items Array of items to put.
     */
    batchPut(items: Array<{ key: string, value: Uint8Array, meta?: Record<string, any> }>): Promise<void>;
    /**
     * Create a transaction for batch operations
     */
    createTransaction(): StorageTransaction;
    /**
     * Close the storage connection
     */
    close(): void;
}
/**
 * StorageTransaction interface for batch operations
 */
export interface StorageTransaction {
    /**
     * Get a value within this transaction
     */
    get(key: string): Promise<Uint8Array | null>;
    /**
     * Put a value within this transaction
     */
    put(key: string, value: Uint8Array, metadata?: Record<string, unknown>): Promise<void>;
    /**
     * Delete a value within this transaction
     */
    delete(key: string): Promise<boolean>;
    /**
     * Complete the transaction
     */
    complete(): Promise<void>;
    /**
     * Abort the transaction
     */
    abort(): void;
}
/**
 * IndexedDB implementation of the StorageAdapter interface
 */
export class IndexedDBAdapter implements StorageAdapter {
    private db: IDBPDatabase | null = null;
    private storeName: string;
    /**
     * Create a new IndexedDBAdapter
     * @param storeName The name of the object store to use
     */
    constructor(storeName: string) {
        this.storeName = storeName;
    }
    /**
     * Initialize the IndexedDB connection
     */
    async init(): Promise<void> {
        if (!browser) {
            throw new Error('IndexedDB not supported in non-browser environment');
        }
        try {
            this.db = await openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    // Create the store if it doesn't exist
                    if (!db.objectStoreNames.contains('content')) {
                        const store = db.createObjectStore('content', { keyPath: 'key' });
                        store.createIndex('createdAt', 'createdAt', { unique: false });
                        store.createIndex('type', 'metadata.type', { unique: false });
                    }
                    // Create docs store with keyPath 'key' to match how we're storing data
                    if (!db.objectStoreNames.contains('docs')) {
                        const docsStore = db.createObjectStore('docs', { keyPath: 'key' });
                        docsStore.createIndex('pubKey', 'value.pubKey', { unique: true });
                        docsStore.createIndex('updatedAt', 'value.updatedAt', { unique: false });
                    }
                }
            });
            console.log(`IndexedDB opened successfully for store: ${this.storeName}`);
        } catch (err) {
            console.error('Error opening IndexedDB:', err);
            throw new Error('Could not open IndexedDB');
        }
    }
    /**
     * Ensure the database is initialized
     */
    private async ensureDB(): Promise<IDBPDatabase> {
        if (!this.db) {
            await this.init();
        }
        if (!this.db) {
            throw new Error('Failed to initialize database');
        }
        return this.db;
    }
    /**
     * Get a value by its key
     */
    async get(key: string): Promise<Uint8Array | null> {
        try {
            const db = await this.ensureDB();
            const item = await db.get(this.storeName, key) as StorageItem | undefined;
            if (!item) {
                return null;
            }
            // Special handling for docs store
            if (this.storeName === 'docs') {
                if (!item.value) return null;
                // Convert the stored object back to a string and then to Uint8Array
                const jsonString = JSON.stringify(item.value);
                return new TextEncoder().encode(jsonString);
            }
            // For content store
            if (!item.value) {
                return null;
            }
            return this.ensureUint8Array(item.value);
        } catch (err) {
            console.error(`Error getting key ${key}:`, err);
            throw new Error(`Failed to get item: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Store a value with metadata
     */
    async put(key: string, value: Uint8Array, metadata: Record<string, unknown> = {}): Promise<void> {
        try {
            const db = await this.ensureDB();
            const now = new Date().toISOString();
            // Special handling for docs store
            if (this.storeName === 'docs') {
                try {
                    // For docs store, we expect value to be a JSON string that we can parse
                    const text = new TextDecoder().decode(value);
                    const docObj = JSON.parse(text);
                    // Create a proper storage item with the key as the keyPath
                    const item = {
                        key,
                        value: docObj, // Store the parsed object
                        metadata,
                        createdAt: now
                    };
                    await db.put(this.storeName, item);
                    return;
                } catch (parseErr) {
                    console.error(`Error parsing doc data for ${key}:`, parseErr);
                    throw new Error(`Failed to parse document data: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
                }
            }
            // For other stores (content), use the standard approach
            const item: StorageItem = {
                key,
                value,
                metadata,
                createdAt: now
            };
            await db.put(this.storeName, item);
        } catch (err) {
            console.error(`Error putting key ${key}:`, err);
            throw new Error(`Failed to store item: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Delete a value by its key
     */
    async delete(key: string): Promise<boolean> {
        try {
            const db = await this.ensureDB();
            // Check if item exists
            const exists = await db.get(this.storeName, key);
            if (!exists) {
                return false;
            }
            await db.delete(this.storeName, key);
            return true;
        } catch (err) {
            console.error(`Error deleting key ${key}:`, err);
            throw new Error(`Failed to delete item: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Get all items, optionally filtering by prefix
     */
    async getAll(prefix?: string): Promise<Array<StorageItem>> {
        try {
            const db = await this.ensureDB();
            const allItems = await db.getAll(this.storeName);
            // For docs store, we need to handle the different structure
            if (this.storeName === 'docs') {
                const items = allItems as any[];
                return items.map(item => ({
                    key: item.key,
                    value: new TextEncoder().encode(JSON.stringify(item.value)),
                    metadata: item.metadata || {},
                    createdAt: item.createdAt
                }));
            }
            if (!prefix) {
                return allItems as StorageItem[];
            }
            // Filter by prefix
            return allItems.filter(item =>
                item.key.startsWith(prefix)
            ) as StorageItem[];
        } catch (err) {
            console.error('Error getting all items:', err);
            throw new Error(`Failed to get items: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Get metadata for a specific item
     */
    async getMetadata(key: string): Promise<Record<string, unknown> | null> {
        try {
            const db = await this.ensureDB();
            const item = await db.get(this.storeName, key) as StorageItem | undefined;
            if (!item) {
                return null;
            }
            return item.metadata;
        } catch (err) {
            console.error(`Error getting metadata for ${key}:`, err);
            throw new Error(`Failed to get metadata: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Query items based on metadata
     */
    async query(filter: (metadata: Record<string, unknown>) => boolean): Promise<string[]> {
        try {
            const db = await this.ensureDB();
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            let cursor = await store.openCursor();
            const matchingKeys: string[] = [];
            while (cursor) {
                if (cursor.value.metadata && filter(cursor.value.metadata)) {
                    matchingKeys.push(cursor.key as string);
                }
                cursor = await cursor.continue();
            }
            await tx.done;
            return matchingKeys;
        } catch (err) {
            console.error('Error querying items:', err);
            throw new Error(`Failed to query items: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Check if multiple keys exist efficiently.
     * @param keys Array of keys to check.
     * @returns A Set containing the keys that exist.
     */
    async batchExists(keys: string[]): Promise<Set<string>> {
        if (!keys.length) return new Set();
        try {
            const db = await this.ensureDB();
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const existingKeys = new Set<string>();
            const promises = keys.map(async key => {
                // Use count instead of get for potentially better performance
                const count = await store.count(key);
                if (count > 0) {
                    existingKeys.add(key);
                }
            });
            await Promise.all(promises);
            await tx.done;
            return existingKeys;
        } catch (err) {
            console.error('Error in batchExists:', err);
            throw new Error(`Batch exists failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Put multiple items into storage efficiently.
     * @param items Array of items to put.
     */
    async batchPut(items: Array<{ key: string, value: Uint8Array, meta?: Record<string, any> }>): Promise<void> {
        if (!items.length) return;
        try {
            const db = await this.ensureDB();
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const now = new Date().toISOString();
            const putPromises = items.map(item => {
                let valueToStore: any = item.value; // Default for content
                let metadataToStore = item.meta || {};
                // Special handling for docs store
                if (this.storeName === 'docs') {
                    try {
                        const text = new TextDecoder().decode(item.value);
                        valueToStore = JSON.parse(text); // Store parsed object
                    } catch (parseErr) {
                        console.error(`Error parsing doc data for ${item.key} in batchPut:`, parseErr);
                        // Skip this item if parsing fails
                        return Promise.resolve();
                    }
                }
                const storageItem: StorageItem = {
                    key: item.key,
                    value: valueToStore,
                    metadata: metadataToStore,
                    createdAt: now // Consider if a per-item timestamp is needed
                };
                return store.put(storageItem);
            });
            await Promise.all(putPromises);
            await tx.done;
        } catch (err) {
            console.error('Error in batchPut:', err);
            throw new Error(`Batch put failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Create a transaction for batch operations
     */
    createTransaction(): StorageTransaction {
        return new IndexedDBTransaction(this.ensureDB(), this.storeName);
    }
    /**
     * Close the database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    /**
     * Ensure value is a Uint8Array
     * Handles various formats that might be stored in IndexedDB
     */
    private ensureUint8Array(value: any): Uint8Array {
        if (value instanceof Uint8Array) {
            return value;
        } else if (value instanceof ArrayBuffer) {
            return new Uint8Array(value);
        } else if (typeof value === 'object' && value !== null && 'buffer' in value) {
            // Handle Buffer-like objects
            try {
                // @ts-ignore - We've already checked 'buffer' property exists
                return new Uint8Array(value.buffer);
            } catch (err) {
                console.error('Failed to convert Buffer-like to Uint8Array:', err);
            }
        } else if (Array.isArray(value)) {
            // Handle array representation
            return new Uint8Array(value);
        }
        // Last resort: try generic conversion
        try {
            return new Uint8Array(value as unknown as ArrayBufferLike);
        } catch (err) {
            console.error('Failed to convert value to Uint8Array:', err);
            throw new Error('Could not convert value to Uint8Array');
        }
    }
}
/**
 * IndexedDB transaction implementation
 */
class IndexedDBTransaction implements StorageTransaction {
    private dbPromise: Promise<IDBPDatabase>;
    private storeName: string;
    private tx: IDBPDatabase | null = null;
    private completed = false;
    private aborted = false;
    constructor(dbPromise: Promise<IDBPDatabase>, storeName: string) {
        this.dbPromise = dbPromise;
        this.storeName = storeName;
    }
    private async ensureTx(): Promise<IDBPDatabase> {
        if (this.completed) {
            throw new Error('Transaction already completed');
        }
        if (this.aborted) {
            throw new Error('Transaction aborted');
        }
        if (!this.tx) {
            this.tx = await this.dbPromise;
        }
        return this.tx;
    }
    async get(key: string): Promise<Uint8Array | null> {
        const db = await this.ensureTx();
        const item = await db.get(this.storeName, key) as StorageItem | undefined;
        if (!item || !item.value) {
            return null;
        }
        // Handle different types of binary data
        if (item.value instanceof Uint8Array) {
            return item.value;
        } else if (item.value instanceof ArrayBuffer) {
            return new Uint8Array(item.value);
        } else if (Array.isArray(item.value)) {
            return new Uint8Array(item.value);
        } else {
            // Try to convert whatever we have
            try {
                return new Uint8Array(item.value as unknown as ArrayBufferLike);
            } catch (err) {
                console.error('Failed to convert value to Uint8Array in transaction:', err);
                return null;
            }
        }
    }
    async put(key: string, value: Uint8Array, metadata: Record<string, unknown> = {}): Promise<void> {
        const db = await this.ensureTx();
        const now = new Date().toISOString();
        const item: StorageItem = {
            key,
            value,
            metadata,
            createdAt: now
        };
        await db.put(this.storeName, item);
    }
    async delete(key: string): Promise<boolean> {
        const db = await this.ensureTx();
        // Check if item exists
        const exists = await db.get(this.storeName, key);
        if (!exists) {
            return false;
        }
        await db.delete(this.storeName, key);
        return true;
    }
    async complete(): Promise<void> {
        // Mark transaction as completed
        this.completed = true;
        this.tx = null;
    }
    abort(): void {
        // Mark transaction as aborted
        this.aborted = true;
        this.tx = null;
    }
}
// Default store names
export const CONTENT_STORE = 'content';
export const DOCS_STORE = 'docs';
// Storage singleton instances
let contentStorage: IndexedDBAdapter | null = null;
let docsStorage: IndexedDBAdapter | null = null;
/**
 * Get the content storage adapter
 * @returns A storage adapter for content data
 */
export function getContentStorage(): StorageAdapter {
    if (!contentStorage) {
        contentStorage = new IndexedDBAdapter(CONTENT_STORE);
    }
    return contentStorage;
}
/**
 * Get the docs storage adapter
 * @returns A storage adapter for document metadata
 */
export function getDocsStorage(): StorageAdapter {
    if (!docsStorage) {
        docsStorage = new IndexedDBAdapter(DOCS_STORE);
    }
    return docsStorage;
}
/**
 * Initialize all storage
 * Call this at app startup
 */
export async function initStorage(): Promise<void> {
    if (browser) {
        const contentStore = getContentStorage();
        const docsStore = getDocsStorage();
        await Promise.all([
            contentStore.init(),
            docsStore.init()
        ]);
        console.log('All storage initialized successfully');
    }
}
/**
 * Close all storage connections
 * Call this before app shutdown
 */
export function closeStorage(): void {
    if (contentStorage) {
        contentStorage.close();
        contentStorage = null;
    }
    if (docsStorage) {
        docsStorage.close();
        docsStorage = null;
    }
}
````

## File: src/lib/KERNEL/HOMNIO_QL.md
````markdown
# Hominio Query Language (HQL) Guide

This document outlines the structure and usage of Hominio Query Language (HQL) for interacting with HominioDB documents via the `hominioQLService`. HQL provides a JSON-based interface for querying and mutating documents based on their metadata and content.

## Core Concepts

*   **Documents:** Data is stored in documents, each identified by a unique `pubKey`.
*   **Metadata (`meta`):** Each document has a `meta` object containing information like `pubKey`, `owner`, `schema` (reference to the document's schema, null for the root Gismu schema), and `name`.
*   **Data (`data`):** The main content of the document resides in the `data` object, typically containing `places` and `translations`.
*   **Places:** The `places` map within `data` holds the structured content according to the document's schema. Values can be literals or references to other documents (e.g., `'@0x...'`).
*   **Schemas:** Documents define their structure using schemas. Schemas are themselves documents. The root schema is "gismu" (`GENESIS_PUBKEY`), which has `meta.schema: null`. Other schemas reference their defining schema (usually gismu).

## HQL Request Structure

All HQL requests are objects with an `operation` field specifying either `'query'` or `'mutate'`.

```typescript
type HqlRequest = HqlQueryRequest | HqlMutationRequest;
```

## 1. Queries (`operation: 'query'`)

Queries are used to retrieve documents based on various criteria.

### Query Request Interface (`HqlQueryRequest`)

```typescript
interface HqlQueryRequest {
    operation: 'query';
    from?: HqlFromClause;  // Optional: Define the source set
    filter?: HqlFilterObject; // Optional: Define filtering conditions
}

interface HqlFromClause {
    pubKey?: string | string[]; // Select specific document(s) by pubKey
    schema?: string;          // Select documents using a specific schema (name or '@pubKey')
    owner?: string;           // Select documents owned by a specific user ID
}

interface HqlFilterObject {
    meta?: { // Filter based on metadata fields
        [key: string]: HqlMetaFilterValue; // e.g., pubKey, owner, schema, name
    };
    places?: { // Filter based on data fields within 'data.places'
        [key: string]: HqlPlaceFilterValue; // Key is x1, x2 etc.
    };
    $or?: HqlFilterObject[];    // Logical OR across multiple filters
    $and?: HqlFilterObject[];   // Logical AND across multiple filters
    $not?: HqlFilterObject;     // Logical NOT for a filter
}

// Filter values can be literals or condition objects
type HqlMetaFilterValue = HqlValue | HqlCondition;
type HqlPlaceFilterValue = HqlValue | HqlCondition | string; // Allows direct '@ref' strings for places

type HqlValue = string | number | boolean | null | HqlValue[] | { [key: string]: HqlValue };

type HqlCondition = {
    [key in HqlOperator]?: HqlValue | HqlValue[];
};

// Supported Operators
type HqlOperator =
    | '$eq'    // Equal
    | '$ne'    // Not equal
    | '$gt'    // Greater than
    | '$gte'   // Greater than or equal
    | '$lt'    // Less than
    | '$lte'   // Less than or equal
    | '$in'    // Value is in array
    | '$nin'   // Value is not in array
    | '$exists'// Field exists (true) or does not exist (false)
    | '$regex' // Matches a JavaScript RegExp string
    | '$contains'; // String contains substring
```

### Query Result (`HqlQueryResult`)

A query returns an array of resolved document objects (`ResolvedHqlDocument[]`), or `null` if an error occurs during processing.

```typescript
type HqlQueryResult = ResolvedHqlDocument[];

// Example structure of a resolved document
type ResolvedHqlDocument = {
    pubKey: string;
    meta: {
        name?: string;
        owner: string;
        schema?: string | null; // '@pubkey' or null
        // ... other potential meta fields
    };
    data: {
        places: Record<string, any>; // Values can be literals or resolved nested documents
        translations?: any[];
        // ... other potential data fields
    };
    $localState?: { // Information about local unsynced changes
        isUnsynced: boolean;
        hasLocalSnapshot: boolean;
        localUpdateCount: number;
    };
    $error?: string; // Present if there was an issue resolving this specific document (e.g., permissions, cycle)
    // ... other potential top-level fields
};
```

### Query Examples

**1. Get a specific document by PubKey (using `from`)**

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  from: {
    pubKey: '0x0000000000000000000000000000000000000000000000000000000000000000' // GENESIS_PUBKEY
  }
};
```

**2. Get a specific document by PubKey (using `filter`)**

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: {
      pubKey: '0x0000000000000000000000000000000000000000000000000000000000000000' // GENESIS_PUBKEY
    }
  }
};
```

**3. Get all documents using the "prenu" schema (by name)**
*(Note: Filtering by schema name requires the HQL service to resolve the name to a PubKey, which might involve extra lookups)*

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  from: {
    schema: 'prenu'
  }
};
// OR using filter:
const queryFilter: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: {
      schema: '@<prenu_schema_pubkey>' // Requires knowing the prenu schema's actual pubkey
    }
  }
};
```

**4. Get the root Gismu schema document (schema is null)**

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: { schema: null }
  }
};
```

**5. Get all "gunka" documents where `x3` (purpose) exists and `x1` (worker) refers to a specific 'prenu' PubKey**

```javascript
const specificPrenuPubKey = '@0x123...abc';
const query: HqlQueryRequest = {
  operation: 'query',
  from: {
    schema: 'gunka' // Filter for 'gunka' schema docs
  },
  filter: {
    places: {
      x3: { $exists: true }, // Purpose field must exist
      x1: specificPrenuPubKey // Worker must be this specific prenu reference string
      // Note: HQL automatically handles the '@' prefix comparison for place references
    }
  }
};
```

**6. Get "gunka" documents where the worker (`x1`) is one of two people AND the task (`x2`) contains the word "refactor"**

```javascript
const worker1Ref = '@0x111...aaa';
const worker2Ref = '@0x222...bbb';
const query: HqlQueryRequest = {
  operation: 'query',
  from: {
    schema: 'gunka'
  },
  filter: {
    $and: [ // Both conditions must be true
      { places: { x1: { $in: [worker1Ref, worker2Ref] } } },
      { places: { x2: { $contains: 'refactor' } } }
    ]
  }
};
```

## 2. Mutations (`operation: 'mutate'`)

Mutations are used to create, update, or delete documents. All mutations require an authenticated user.

### Mutation Request Interface (`HqlMutationRequest`)

```typescript
interface HqlMutationRequest {
    operation: 'mutate';
    action: 'create' | 'update' | 'delete';
    pubKey?: string; // Required for update/delete
    schema?: string; // Required for create (Schema name or '@pubKey')
    places?: Record<string, HqlValue | string>; // Place data for create/update. '@pubKey' strings allowed for references.
}
```

### Mutation Result (`HqlMutationResult`)

### Mutation Examples

**1. Create a new "prenu" document**

```javascript
const mutation: HqlMutationRequest = {
  operation: 'mutate',
  action: 'create',
  schema: 'prenu', // Specify schema by name (or use '@<prenu_schema_pubkey>')
  places: {
    x1: "Sam Andert" // Value for the 'x1' place defined in the 'prenu' schema
  }
};
```

**2. Create a new "gunka" document referencing an existing "prenu"**

```javascript
const existingPrenuRef = '@0x123...abc'; // PubKey of the prenu document prefixed with '@'
const mutation: HqlMutationRequest = {
  operation: 'mutate',
  action: 'create',
  schema: 'gunka',
  places: {
    x1: existingPrenuRef,       // Reference the worker
    x2: "Document HQL Service", // Task
    x3: "Provide clear API"     // Purpose
  }
};
```

**3. Update an existing "gunka" document's purpose (`x3`)**

```javascript
const gunkaToUpdatePubKey = '0x456...def';
const mutation: HqlMutationRequest = {
  operation: 'mutate',
  action: 'update',
  pubKey: gunkaToUpdatePubKey,
  places: {
    x3: "Provide comprehensive examples" // New value for x3
    // Only fields included in 'places' will be updated
  }
};
```

**4. Delete a document**

```javascript
const docToDeletePubKey = '0x789...ghi';
const mutation: HqlMutationRequest = {
  operation: 'mutate',
  action: 'delete',
  pubKey: docToDeletePubKey
};
```

## 3. Reactive Queries (`processReactive`)

The `hominioQLService` also provides a `processReactive` method specifically for Svelte components.

```typescript
processReactive(request: HqlQueryRequest): Readable<HqlQueryResult | null | undefined>;
```

*   Takes a standard `HqlQueryRequest`.
*   Returns a Svelte `Readable` store *synchronously*.
*   The store initially holds `undefined`.
*   When the initial query completes, the store updates to hold the `HqlQueryResult` (an array) or `null` if there was an error.
*   The store automatically re-runs the query and updates its value whenever relevant underlying documents change in `hominioDB`.

**Usage in Svelte:**

```svelte
<script lang="ts">
  import { hominioQLService, type HqlQueryRequest, type HqlQueryResult } from '$lib/KERNEL/hominio-ql';
  import { type Readable } from 'svelte/store';

  const myQuery: HqlQueryRequest = {
    operation: 'query',
    from: { schema: 'prenu' }
  };

  // Get the readable store
  const prenuReadable: Readable<HqlQueryResult | null | undefined> = hominioQLService.processReactive(myQuery);

  // In Svelte 5, use $derived or auto-subscription ($prenuReadable) in the template
  // const prenuList = $derived(prenuReadable);
</script>

<!-- Use auto-subscription in the template -->
{#if $prenuReadable === undefined}
  <p>Loading...</p>
{:else if $prenuReadable === null}
  <p>Error loading data.</p>
{:else if $prenuReadable.length === 0}
  <p>No prenu found.</p>
{:else}
  <ul>
    {#each $prenuReadable as prenu (prenu.pubKey)}
      <li>{prenu.data?.places?.x1} ({prenu.pubKey})</li>
    {/each}
  </ul>
{/if}
```

This reactive query handles fetching, error states, and automatic updates when data changes.
````

## File: src/lib/KERNEL/types.ts
````typescript
/**
 * Interface for content metadata
 */
export interface ContentMetadata {
    type: string;
    documentPubKey?: string;
    created: string;
    [key: string]: unknown;
}
````

## File: src/lib/server/routes/call.ts
````typescript
import { Elysia } from 'elysia';
import { ULTRAVOX_API_KEY } from '$env/static/private';
// Define the session type based on your auth context
interface AuthContext {
    session: {
        user: {
            id: string;
            [key: string]: unknown;
        }
    },
    body: unknown,
    set: {
        status: number;
    }
}
// Create call handlers without prefix
export const callHandlers = new Elysia()
    .post('/create', async ({ body, session, set }: AuthContext) => {
        try {
            // Cast body to handle unknown structure
            const requestData = body as Record<string, unknown>;
            // Log request for debugging
            console.log('Call API request with body:', JSON.stringify(requestData, null, 2));
            // Store vibeId in proper metadata field if provided
            // The API supports a 'metadata' field (without underscore)
            let requestBody: Record<string, unknown> = { ...requestData };
            // If _metadata exists (our temporary field), move it to the proper metadata field
            if (requestData._metadata && typeof requestData._metadata === 'object') {
                const metadata = requestData._metadata as Record<string, unknown>;
                if ('vibeId' in metadata) {
                    // Use object destructuring with rest to exclude _metadata
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { _metadata, ...rest } = requestData;
                    requestBody = {
                        ...rest,
                        metadata: {
                            vibeId: metadata.vibeId,
                            userId: session.user.id
                        }
                    };
                }
            } else {
                // Add userId to metadata if no custom metadata
                const existingMetadata = (requestData.metadata as Record<string, unknown> | undefined) || {};
                requestBody = {
                    ...requestData,
                    metadata: {
                        ...existingMetadata,
                        userId: session.user.id
                    }
                };
            }
            console.log('Calling Ultravox API with:', JSON.stringify(requestBody, null, 2));
            // Forward the request to the Ultravox API
            const response = await fetch('https://api.ultravox.ai/api/calls', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ULTRAVOX_API_KEY
                },
                body: JSON.stringify(requestBody)
            });
            console.log('Ultravox API response status:', response.status);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Ultravox API error:', errorText);
                set.status = response.status;
                return {
                    error: 'Error calling Ultravox API',
                    details: errorText
                };
            }
            // Return the Ultravox API response directly
            const data = await response.json();
            console.log('Ultravox API response data:', JSON.stringify(data, null, 2));
            return data;
        } catch (error) {
            console.error('Error creating call:', error);
            set.status = 500;
            return {
                error: 'Failed to create call',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
export default callHandlers;
````

## File: src/lib/server/routes/me.ts
````typescript
import { Elysia } from 'elysia';
// Define the session type based on your auth context
interface AuthContext {
    session: {
        user: {
            id: string;
            [key: string]: unknown;
        }
    }
}
// Create a route handlers collection without the prefix
// The prefix will be defined in the main server file
export const meHandlers = new Elysia()
    // Handlers only without prefix 
    .get('/hi', ({ session }: AuthContext) => {
        return {
            message: 'Protected hello!',
            user: session.user
        }
    });
// Export the handlers for use in the main server
export default meHandlers;
````

## File: src/lib/tools/addJournalEntry/manifest.json
````json
{
    "name": "addJournalEntry",
    "skill": "Add new journal entry",
    "icon": "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z",
    "color": "purple",
    "temporaryTool": {
        "modelToolName": "addJournalEntry",
        "description": "Add a new journal entry. Use this tool when a user wants to create a journal entry. Help users document their thoughts, experiences, and reflections with detailed entries. NEVER emit text when doing this tool call.",
        "dynamicParameters": [
            {
                "name": "title",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "Title of the journal entry"
                },
                "required": true
            },
            {
                "name": "content",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "Content/body of the journal entry"
                },
                "required": true
            },
            {
                "name": "mood",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "The mood associated with this entry (e.g., happy, sad, excited, etc.)",
                    "enum": [
                        "happy",
                        "sad",
                        "excited",
                        "angry",
                        "neutral",
                        "relaxed",
                        "anxious",
                        "thoughtful"
                    ]
                },
                "required": false
            },
            {
                "name": "tags",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "Optional comma-separated list of tags for the entry"
                },
                "required": false
            }
        ],
        "client": {}
    },
    "implementationType": "client"
}
````

## File: src/lib/tools/deleteTodo/manifest.json
````json
{
    "name": "deleteTodo",
    "skill": "Delete task from list",
    "icon": "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    "color": "red",
    "temporaryTool": {
        "modelToolName": "deleteTodo",
        "description": "Delete a todo item. Use this tool when a todo needs to be deleted. NEVER emit text when doing this tool call.",
        "dynamicParameters": [
            {
                "name": "todoText",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "The text of the todo task to delete"
                },
                "required": true
            },
            {
                "name": "todoId",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "ID of the todo item to delete (if known)"
                },
                "required": false
            }
        ],
        "client": {}
    },
    "implementationType": "client"
}
````

## File: src/lib/tools/queryTodos/manifest.json
````json
{
    "name": "queryTodos",
    "skill": "Fetch and filter tasks",
    "icon": "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
    "color": "blue",
    "temporaryTool": {
        "modelToolName": "queryTodos",
        "description": "Query and retrieve todo items with optional filtering. Use this tool to get all todos or filter them by tag or completion status.",
        "dynamicParameters": [
            {
                "name": "tag",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "Optional tag to filter todos by. Use 'null' for todos with no tags."
                },
                "required": false
            },
            {
                "name": "completed",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "boolean",
                    "description": "Optional boolean to filter by completion status: true for completed tasks, false for incomplete tasks."
                },
                "required": false
            }
        ],
        "client": {}
    },
    "implementationType": "client"
}
````

## File: src/lib/tools/switchVibe/manifest.json
````json
{
    "name": "switchVibe",
    "skill": "Change the entire vibe experience",
    "icon": "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
    "color": "blue",
    "temporaryTool": {
        "modelToolName": "switchVibe",
        "description": "Switch to a completely different vibe/experience with its own set of tools and default agent. Use this tool when the user wants to change to a different experience like todos, counter, or home. NEVER emit text when doing this tool call.",
        "dynamicParameters": [
            {
                "name": "vibeId",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "The ID of the vibe to switch to (e.g. \"home\", \"todos\", \"counter\")"
                },
                "required": true
            }
        ],
        "client": {}
    },
    "implementationType": "client"
}
````

## File: src/lib/ultravox/loaders/agentLoader.ts
````typescript
import type { AgentConfig, AgentName, ResolvedVibe } from '../types';
/**
 * In-memory cache for agent configurations to avoid reloading
 */
const agentCache = new Map<AgentName, AgentConfig>();
/**
 * Loads an agent configuration from a vibe
 * @param agentName The name of the agent to load
 * @param vibe The resolved vibe containing agent configurations
 * @returns The agent configuration
 */
export function getAgentConfig(agentName: AgentName, vibe: ResolvedVibe): AgentConfig {
    // First check if we have it in cache
    if (agentCache.has(agentName)) {
        return agentCache.get(agentName)!;
    }
    // Find the agent in the vibe's resolved agents
    const agent = vibe.resolvedAgents.find((a: AgentConfig) => a.name === agentName);
    if (!agent) {
        throw new Error(`Agent "${agentName}" not found in vibe "${vibe.manifest.name}"`);
    }
    // Cache the agent config
    agentCache.set(agentName, agent);
    return agent;
}
/**
 * Builds a system prompt for the given agent
 * @param agentName The name of the agent to build a prompt for
 * @param vibe The resolved vibe containing agent configurations
 * @returns The fully constructed system prompt
 */
export function buildSystemPrompt(agentName: AgentName, vibe: ResolvedVibe): string {
    const agent = getAgentConfig(agentName, vibe);
    // Get the agent-specific system prompt
    const baseSystemPrompt = agent.systemPrompt;
    // Get the call-level system prompt
    const callSystemPrompt = vibe.manifest.callSystemPrompt;
    // Build tool descriptions
    const tools = [...(vibe.resolvedCallTools || []), ...(agent.resolvedTools || [])];
    let toolsDescription = "No tools are available.";
    if (tools.length > 0) {
        toolsDescription = tools.map(tool => {
            return `${tool.temporaryTool.modelToolName}: ${tool.temporaryTool.description}`;
        }).join('\n\n');
    }
    // Combine all parts
    return `${baseSystemPrompt}
You have access to the following tools that you MUST use when relevant:
${toolsDescription}
${callSystemPrompt}`;
}
/**
 * Clears the agent cache
 */
export function clearAgentCache(): void {
    agentCache.clear();
}
````

## File: src/lib/ultravox/registries/vibeRegistry.ts
````typescript
/**
 * Vibe Registry - Dynamically loads and manages all available vibes
 * Provides centralized access to vibe information for components
 */
import { getActiveVibe } from '../stageManager';
// Define an interface for vibe metadata
export interface VibeInfo {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    defaultAgent: string;
    agents: string[];
}
// Default icon and color for fallback
const DEFAULT_ICON = 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
const DEFAULT_COLOR = 'purple';
// Get list of all available vibes (excluding home)
export async function getAllVibes(): Promise<VibeInfo[]> {
    try {
        // Get all vibe folders
        const availableVibeIds = Object.keys(import.meta.glob('../../vibes/*/manifest.json', { eager: false }))
            .map(path => {
                // Extract vibe ID from path (../../vibes/VIBE_ID/manifest.json)
                const matches = path.match(/\.\.\/\.\.\/vibes\/(.+)\/manifest\.json/);
                return matches ? matches[1] : null;
            })
            .filter(id => id && id !== 'home') as string[];
        console.log('📋 Available vibes:', availableVibeIds);
        // Load each vibe's data
        const vibes = await Promise.all(
            availableVibeIds.map(async (vibeId) => {
                try {
                    const vibe = await getActiveVibe(vibeId);
                    // Get all agent names from vibe
                    const agentNames = vibe.resolvedAgents.map((agent) => agent.name);
                    return {
                        id: vibeId,
                        name: vibe.manifest.name.charAt(0).toUpperCase() + vibe.manifest.name.slice(1),
                        description: vibe.manifest.description,
                        icon: vibe.manifest.icon || DEFAULT_ICON,
                        color: vibe.manifest.color || DEFAULT_COLOR,
                        defaultAgent: vibe.defaultAgent.name,
                        agents: agentNames
                    };
                } catch (error) {
                    console.error(`Error loading vibe ${vibeId}:`, error);
                    return null;
                }
            })
        );
        // Filter out any failed loads
        return vibes.filter((vibe): vibe is VibeInfo => vibe !== null);
    } catch (error) {
        console.error('Error loading vibes:', error);
        return [];
    }
}
// Get a specific vibe by ID
export async function getVibeById(vibeId: string): Promise<VibeInfo | null> {
    if (vibeId === 'home') {
        console.warn('Home vibe is not included in registry');
        return null;
    }
    try {
        const vibe = await getActiveVibe(vibeId);
        // Get all agent names from vibe
        const agentNames = vibe.resolvedAgents.map((agent) => agent.name);
        return {
            id: vibeId,
            name: vibe.manifest.name.charAt(0).toUpperCase() + vibe.manifest.name.slice(1),
            description: vibe.manifest.description,
            icon: vibe.manifest.icon || DEFAULT_ICON,
            color: vibe.manifest.color || DEFAULT_COLOR,
            defaultAgent: vibe.defaultAgent.name,
            agents: agentNames
        };
    } catch (error) {
        console.error(`Error loading vibe ${vibeId}:`, error);
        return null;
    }
}
````

## File: src/lib/ultravox/registries/viewRegistry.ts
````typescript
/**
 * View Registry - Dynamically loads and manages all available view components
 * Provides centralized access to Svelte components for vibes
 */
import type { VibeComponent } from '../types';
import type { SvelteComponent } from 'svelte';
// Define an interface for view metadata
export interface ViewInfo {
    id: string;
    name: string;
    component?: VibeComponent;
}
// Registry of all discovered views
const viewRegistry: Record<string, ViewInfo> = {};
// Cache for loaded components to avoid reloading
const componentCache = new Map<string, VibeComponent>();
/**
 * Dynamically discovers available view components
 * Returns a registry of all available views
 */
export async function discoverViews(): Promise<Record<string, ViewInfo>> {
    // If registry is already populated, return it
    if (Object.keys(viewRegistry).length > 0) {
        return { ...viewRegistry };
    }
    try {
        // Use glob imports to discover all view components
        const viewModules = import.meta.glob('../../components/views/*View.svelte', { eager: false });
        // Extract view IDs from the file paths
        const viewIds = Object.keys(viewModules).map(path => {
            const matches = path.match(/\.\.\/\.\.\/components\/views\/(.+)\.svelte$/);
            return matches ? matches[1] : null;
        }).filter(id => id !== null) as string[];
        console.log('🔍 Discovered views:', viewIds);
        // Create metadata for each view
        for (const viewId of viewIds) {
            viewRegistry[viewId] = {
                id: viewId,
                name: viewId.replace('View', '')
            };
        }
        console.log(`📊 Registered ${Object.keys(viewRegistry).length} views`);
    } catch (error) {
        console.error('❌ Error discovering views:', error);
    }
    return { ...viewRegistry };
}
/**
 * Get all available views metadata
 */
export async function getAllViews(): Promise<ViewInfo[]> {
    // Make sure views are discovered
    await discoverViews();
    return Object.values(viewRegistry);
}
/**
 * Dynamically loads a component by name
 * @param viewName The name of the view to load (e.g., 'TodoView')
 * @returns The loaded component
 */
export async function loadView(viewName: string): Promise<VibeComponent> {
    console.log(`🔎 Attempting to load view: ${viewName}`);
    // Normalize view name (ensure it ends with "View")
    const normalizedName = viewName.endsWith('View') ? viewName : `${viewName}View`;
    // Check if component is already in cache
    if (componentCache.has(normalizedName)) {
        console.log(`📦 Using cached view: ${normalizedName}`);
        return componentCache.get(normalizedName)!;
    }
    // Make sure views are discovered
    await discoverViews();
    try {
        // Import the component module
        const module = await import(`../../components/views/${normalizedName}.svelte`);
        const component = module.default as SvelteComponent;
        // Cache the component
        componentCache.set(normalizedName, component);
        // Update the registry with the loaded component
        if (viewRegistry[normalizedName]) {
            viewRegistry[normalizedName].component = component;
        }
        console.log(`✅ View loaded and cached: ${normalizedName}`);
        return component;
    } catch (error) {
        console.error(`❌ Failed to load view "${normalizedName}":`, error);
        // Try to load HomeView as fallback
        if (normalizedName !== 'HomeView') {
            console.log('⚠️ Falling back to HomeView');
            try {
                return await loadView('HomeView');
            } catch (fallbackError) {
                console.error('❌ Fallback to HomeView failed:', fallbackError);
            }
        }
        throw new Error(`Failed to load view: ${normalizedName}`);
    }
}
/**
 * Check if a view exists
 * @param viewName The name of the view to check
 */
export async function hasView(viewName: string): Promise<boolean> {
    // Normalize view name
    const normalizedName = viewName.endsWith('View') ? viewName : `${viewName}View`;
    // Make sure views are discovered
    await discoverViews();
    return !!viewRegistry[normalizedName];
}
/**
 * Clear the component cache
 */
export function clearViewCache(): void {
    componentCache.clear();
    console.log('🧹 View cache cleared');
}
````

## File: src/lib/vibes/journal/manifest.json
````json
{
    "name": "journal",
    "description": "Personal journal application",
    "systemPrompt": "IMPORTANT INSTRUCTIONS:\n1. You MUST use these tools directly without asking for confirmation\n2. Call the appropriate tool as soon as a user EXPLICITLY requests them\n3. Execute the tool when needed WITHOUT typing out the function in your response\n4. AFTER the tool executes, respond with text confirming what you did\n5. DO NOT tell the user \"I'll use the tool\" - just USE it directly.",
    "temperature": 0.7,
    "languageHint": "en",
    "view": "JournalView",
    "icon": "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    "color": "purple",
    "vibeTools": [],
    "defaultAgent": "Tanja",
    "agents": [
        {
            "name": "Tanja",
            "personality": "supportive and reflective",
            "voiceId": "1769b283-36c6-4883-9c52-17bf75a29bc5",
            "description": "specialized in journaling and reflective writing",
            "temperature": 0.7,
            "systemPrompt": "You are Tanja, a supportive and reflective journaling companion.\n\nYou specialize in:\n- Helping users create thoughtful journal entries\n- Encouraging reflection and introspection\n- Suggesting topics to write about when users need inspiration\n- Providing a safe space for personal expression\n\nWhen users want to add a journal entry, help them craft a meaningful entry by asking about:\n- A title that captures the essence of what they want to write\n- The content they want to include\n- How they're feeling (their mood)\n- Any tags they might want to add for organization\n\nBe warm, empathetic, and supportive. Journaling is a personal practice, so maintain a respectful tone and acknowledge the user's thoughts and feelings.\n\nAlways respect privacy and confidentiality with journal entries.",
            "tools": [
                "addJournalEntry"
            ]
        }
    ]
}
````

## File: src/lib/app.d.ts
````typescript
/// <reference types="@sveltejs/kit" />
// Import the docs initialization function
import { initDocs } from './docs';
// Initialize docs system during app startup
initDocs().catch(error => {
    console.error('Failed to initialize docs system:', error);
});
// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        // interface Platform {}
    }
}
export { };
````

## File: src/routes/me/+page.ts
````typescript
// This file is needed for the /hominio route to work properly
// We're turning off SSR since we're using client-side features
export const ssr = false;
export function load() {
    return {
        // Any data to be loaded server-side would go here
    };
}
````

## File: src/routes/+layout.ts
````typescript
// This file configures behavior for the root layout
// Disable Server-Side Rendering for the entire application
// Necessary for Tauri builds as they are client-side only
export const ssr = false;
// Disable prerendering temporarily to see if it resolves the initialization error
// This forces a purely client-side approach
export const prerender = false;
````

## File: src/types/b4a.d.ts
````typescript
/**
 * Type declarations for b4a (Buffer for All) module
 * https://github.com/holepunchto/b4a
 */
declare module 'b4a' {
    /**
     * Convert from a Uint8Array to a string using the specified encoding
     */
    export function toString(buf: Uint8Array, encoding?: string): string;
    /**
     * Convert from a string to a Uint8Array using the specified encoding
     */
    export function from(str: string, encoding?: string): Uint8Array;
    /**
     * Create a new Uint8Array with the specified size
     */
    export function alloc(size: number): Uint8Array;
    /**
     * Compare two Uint8Arrays
     * Returns 0 if equal, <0 if a is less than b, >0 if a is greater than b
     */
    export function compare(a: Uint8Array, b: Uint8Array): number;
    /**
     * Concatenate multiple Uint8Arrays into a single Uint8Array
     */
    export function concat(list: Uint8Array[], totalLength?: number): Uint8Array;
    /**
     * Check if a value is a Uint8Array
     */
    export function isBuffer(obj: unknown): obj is Uint8Array;
}
````

## File: src/app.d.ts
````typescript
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}
export { };
````

## File: src/app.html
````html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<link rel="icon" href="%sveltekit.assets%/favicon.png" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
		<link rel="shortcut icon" href="/favicon.ico" />
		<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
		<meta name="apple-mobile-web-app-title" content="Hominio" />
		<link rel="manifest" href="/site.webmanifest" />
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
````

## File: src-tauri/capabilities/default.json
````json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "enables the default permissions",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default"
  ]
}
````

## File: src-tauri/capabilities/global.json
````json
{
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "global-capability",
    "description": "Global capability for Hominio app",
    "windows": [
        "*"
    ],
    "permissions": [
        "core:default"
    ]
}
````

## File: src-tauri/capabilities/main.json
````json
{
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "main-capability",
    "description": "Main capability for Hominio app",
    "windows": [
        "main"
    ],
    "permissions": [
        "core:default",
        "core:webview:default"
    ]
}
````

## File: src-tauri/src/lib.rs
````rust
// Setup a minimal Tauri application without filesystem access
// This fixes the "Cannot access uninitialized variable" error
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
use log;
use tauri;
// This function runs the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create and run the Tauri application
    tauri::Builder::default()
        .setup(|app| {
            // Setup logging for debugging
            #[cfg(debug_assertions)]
            {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        // We don't register any commands - frontend will use only standard APIs
        .invoke_handler(tauri::generate_handler![])
        // Run the application with default context
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}
````

## File: src-tauri/Cargo.toml
````toml
[package]
name = "app"
version = "0.1.0"
description = "A Tauri App"
authors = ["you"]
license = ""
repository = ""
edition = "2021"
rust-version = "1.77.2"

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[lib]
name = "app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.0.5", features = [] }

[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
log = "0.4"
tauri = { version = "2.3.1", features = [] }
tauri-plugin-log = "2.0.0-rc"
````

## File: src-tauri/Info.plist
````
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSCameraUsageDescription</key>
  <string>Request camera access for video calls</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>Request microphone access for voice calls</string>
</dict>
</plist>
````

## File: static/favicon.svg
````
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svgjs="http://svgjs.dev/svgjs" width="1000" height="1000"><g clip-path="url(#SvgjsClipPath1228)"><rect width="1000" height="1000" fill="#ffffff"></rect><g transform="matrix(1.125,0,0,1.125,50,50)"><svg xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svgjs="http://svgjs.dev/svgjs" width="800" height="800"><svg width="800" xmlns="http://www.w3.org/2000/svg" height="800" id="screenshot-fb17a1f9-5fd0-808c-8004-7fa356889e86" viewBox="0 0 800 800" xmlns:xlink="http://www.w3.org/1999/xlink" fill="none" version="1.1"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa356889e86"><g fill="none"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa356889e86"><rect rx="0" ry="0" x="0" y="0" width="800" height="800" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" class="frame-background"></rect></g><g class="frame-children"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eb6" rx="0" ry="0"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eb7"><defs><linearGradient id="fill-color-gradient-render-3-0" x1="0.8141024888869209" y1="0.11333468759598872" x2="0.8902054992483767" y2="0.7841905779408899" gradientTransform=""><stop offset="0" stop-color="#1a2366" stop-opacity="1"></stop><stop offset="1" stop-color="#42becd" stop-opacity="1"></stop></linearGradient><pattern patternUnits="userSpaceOnUse" x="0" y="0" width="800" height="800" patternTransform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" id="fill-0-render-3"><g><rect width="800" height="800" style="fill: url(&quot;#fill-color-gradient-render-3-0&quot;);"></rect></g></pattern><clipPath id="SvgjsClipPath1228"><rect width="1000" height="1000" x="0" y="0" rx="500" ry="500"></rect></clipPath></defs><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23eb7"><path d="M400.000,0.000C620.766,0.000,800.000,179.234,800.000,400.000C800.000,620.766,620.766,800.000,400.000,800.000C179.234,800.000,0.000,620.766,0.000,400.000C0.000,179.234,179.234,0.000,400.000,0.000Z" fill="url(#fill-0-render-3)"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eb8" rx="0" ry="0"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eba" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ecb" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ecb"><path d="M522.226,98.586C521.084,96.298,448.249,21.803,449.226,21.586C454.640,20.383,506.880,38.188,556.226,70.586C588.909,92.045,625.213,131.444,628.203,134.442C629.213,135.972,629.714,137.645,629.705,139.459C623.110,139.771,576.640,138.568,570.226,137.586C568.013,128.430,525.728,107.115,522.226,98.586ZL522.226,98.586ZL522.226,98.586Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ebb" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ecc" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ecc"><path d="M599.678,151.445C610.024,151.279,631.378,153.505,641.714,154.007C644.176,155.469,646.344,157.308,648.219,159.525C650.500,163.485,653.169,167.163,656.225,170.561C656.715,171.858,656.882,173.197,656.725,174.574C641.043,174.742,612.350,175.023,596.675,174.521C516.226,181.586,526.226,154.586,599.678,151.445ZL599.678,151.445Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ebc" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ecd" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ecd"><path d="M593.673,184.554C614.358,184.387,646.053,188.621,666.732,189.122C668.165,189.589,669.331,190.425,670.235,191.630C672.730,197.306,675.732,202.657,679.242,207.683C680.975,211.164,682.142,214.843,682.745,218.720C654.388,218.887,590.578,221.088,562.226,220.586C558.446,217.666,541.780,210.358,543.226,205.586C519.965,199.023,535.573,189.537,558.226,185.586C570.091,183.517,586.726,184.586,593.673,184.554ZL593.673,184.554ZL593.673,184.554ZM558.226,185.586" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ebd" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ece" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ece"><path d="M692.752,238.786C693.403,240.727,693.736,242.734,693.753,244.806C665.057,245.140,636.369,244.806,607.688,243.802C607.333,242.777,598.437,245.911,597.458,245.599C596.240,243.023,497.502,239.389,499.226,235.586C528.745,234.419,659.891,233.437,689.750,234.271C691.392,235.404,692.393,236.909,692.752,238.786ZL692.752,238.786Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ebe" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ecf" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ecf"><path d="M526.226,265.586C553.915,265.419,672.072,260.858,699.757,261.360C703.304,266.301,705.306,271.820,705.762,277.915C675.072,277.915,644.383,277.915,613.693,277.915C605.464,278.708,602.761,276.554,597.458,278.206C602.845,273.474,518.497,270.894,526.226,265.586ZL526.226,265.586Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ebf" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed0" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed0"><path d="M709.765,305.004C679.407,305.171,645.326,305.295,614.971,304.794C610.746,304.583,604.716,293.929,603.963,293.256C637.321,292.586,674.405,292.797,707.763,293.466C709.448,297.098,710.115,300.944,709.765,305.004ZL709.765,305.004Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec0" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed1" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed1"><path d="M631.145,314.992C654.162,314.992,685.418,314.992,708.434,314.992C709.393,315.481,710.944,317.507,711.947,322.036C713.381,331.561,716.848,342.085,715.748,351.297C690.730,351.297,184.398,363.292,159.380,363.292C159.839,358.927,177.728,352.749,178.451,347.030C178.009,345.690,632.037,315.814,631.145,314.992ZL631.145,314.992Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec1" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed2" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed2"><path d="M634.704,363.644C662.040,365.477,687.730,365.864,715.769,365.704C716.922,376.161,717.089,386.696,716.270,397.308C686.485,398.474,178.267,412.424,148.339,411.593C146.838,410.757,179.626,388.794,179.456,383.418C178.455,383.418,632.703,370.667,634.704,363.644ZL634.704,363.644Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec2" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed3" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed3"><path d="M177.448,420.650C183.584,421.984,642.345,410.348,649.219,410.351C671.883,409.615,694.400,409.949,716.770,411.354C717.229,416.738,716.561,421.922,714.769,426.905C686.082,427.407,192.086,431.886,163.396,431.718C161.753,429.926,175.446,424.501,177.448,420.650ZL177.448,420.650Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec3" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed4" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed4"><path d="M177.448,438.762C205.138,438.595,685.081,435.433,712.767,435.935C714.154,440.914,713.488,445.596,710.766,449.981C682.413,450.483,204.801,453.018,176.444,452.850C178.558,448.056,176.893,444.002,177.448,438.762ZL177.448,438.762Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec4" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed5" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed5"><path d="M492.597,617.982C492.511,618.981,492.850,618.866,493.602,619.540C535.299,620.041,576.997,620.209,618.696,620.041C618.845,621.097,618.679,622.100,618.196,623.051C616.482,624.434,615.147,626.106,614.193,628.068C609.139,631.966,604.636,636.314,600.683,641.111C596.908,643.713,593.238,646.556,589.674,649.639C554.983,650.140,282.851,646.789,248.157,646.622C249.157,638.595,237.117,624.410,239.123,617.440C239.879,613.159,490.685,621.727,492.597,617.982ZL492.597,617.982Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec5" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed6" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed6"><path d="M573.277,659.670C574.505,660.066,574.705,660.731,573.876,661.665C554.958,672.243,502.735,702.657,449.886,709.660C409.872,714.962,374.776,716.707,338.185,707.659C261.315,688.651,251.067,663.550,268.521,657.637C296.661,648.104,463.266,665.090,464.299,659.618C500.225,659.618,537.352,659.670,573.277,659.670ZL573.277,659.670Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec6" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed7" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed7"><path d="M557.650,552.817C560.653,552.817,563.655,552.817,566.657,552.817C581.815,554.415,597.160,555.419,612.692,555.827C631.369,555.225,650.049,554.891,668.734,554.824C668.891,556.201,668.724,557.540,668.234,558.837C663.621,567.051,658.117,574.576,651.721,581.411C604.518,582.246,269.930,577.352,223.063,576.183C228.974,567.788,172.967,558.459,203.991,553.039C236.001,547.447,357.953,545.998,557.650,552.817ZL557.650,552.817ZL557.650,552.817Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec7" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed8" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed8"><path d="M223.621,584.671C269.643,586.672,598.002,591.610,644.716,590.946C640.757,598.114,635.753,604.636,629.705,610.510C584.672,611.012,272.113,605.532,227.078,605.365C230.076,596.282,219.613,592.644,223.621,584.671ZL223.621,584.671Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec8" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ed9" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ed9"><path d="M164.399,461.906C190.421,461.739,681.746,460.516,707.763,461.018C708.813,464.174,708.647,467.350,707.263,470.549C706.512,471.177,705.678,471.679,704.761,472.054C681.076,472.723,194.107,469.619,170.422,468.950C167.600,465.647,164.246,466.296,164.399,461.906ZL164.399,461.906Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ec9" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eda" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23eda"><path d="M177.448,504.170C176.948,496.645,194.303,485.685,190.497,480.019C190.497,479.350,678.408,481.418,701.759,482.087C702.318,482.814,702.652,483.650,702.760,484.595C701.535,490.858,699.699,496.878,697.255,502.655C696.505,503.283,695.670,503.784,694.754,504.160C674.665,504.339,197.390,503.346,177.448,504.170ZL177.448,504.170Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eca" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23edb" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23edb"><path d="M195.516,510.207C195.849,510.207,672.563,514.022,691.751,513.691C690.018,517.522,688.517,521.535,687.248,525.731C683.484,533.103,679.315,540.294,674.739,547.302C651.884,548.135,236.096,543.575,213.583,542.408C228.597,535.728,192.515,526.268,195.516,510.207ZL195.516,510.207Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(233, 201, 110); fill-opacity: 1;"></path></g></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eb9" rx="0" ry="0"><g clip-path="url(#render-39-fb17a1f9-5fd0-808c-8004-7fa34ca23edc-clip)"><g mask="url(#render-39-fb17a1f9-5fd0-808c-8004-7fa34ca23edc-mask)"><defs><filter id="render-39-fb17a1f9-5fd0-808c-8004-7fa34ca23edc-filter"><feFlood flood-color="white" result="FloodResult"></feFlood><feComposite in="FloodResult" in2="SourceGraphic" operator="in" result="comp"></feComposite></filter><clipPath id="render-39-fb17a1f9-5fd0-808c-8004-7fa34ca23edc-clip" class="mask-clip-path"><polyline points="0,1.1368683772161603e-13 800,1.1368683772161603e-13 800,800 0,800"></polyline></clipPath><mask width="800" maskUnits="userSpaceOnUse" height="799.9999999999999" class="mask-shape" x="0" id="render-39-fb17a1f9-5fd0-808c-8004-7fa34ca23edc-mask" data-old-y="1.1368683772161603e-13" data-old-width="800" data-old-x="0" y="1.1368683772161603e-13" data-old-height="799.9999999999999"><g filter="url(#render-39-fb17a1f9-5fd0-808c-8004-7fa34ca23edc-filter)"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23edc"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23edc"><ellipse cx="400" cy="400.00000000000006" rx="400" ry="399.99999999999994" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" style="fill: rgb(177, 178, 181); fill-opacity: 1;"></ellipse></g></g></g></mask></defs><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23edd" rx="0" ry="0"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ede"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ede"><path d="M300.022,35.214C387.676,-5.824,494.664,56.999,545.500,133.872C561.062,157.404,576.305,181.448,586.775,216.833C590.419,229.145,586.607,243.963,584.353,254.471C579.484,277.180,612.493,279.845,624.214,312.295C626.781,319.403,616.306,348.667,618.471,357.329C622.097,371.829,634.343,372.044,630.861,385.892C627.622,398.775,628.508,425.964,627.582,441.369C626.532,458.820,634.385,470.102,636.020,487.058C639.593,524.118,555.989,525.102,518.212,562.104C490.767,588.986,467.263,621.576,464.520,622.310C435.029,630.208,429.169,620.237,391.576,618.794C369.019,617.927,321.390,518.401,305.407,519.942C208.545,529.280,279.207,421.566,199.074,326.996C145.999,264.359,19.434,365.018,40.381,291.748C90.907,115.019,150.468,105.233,300.022,35.214Z" style="fill: rgb(238, 236, 228); fill-opacity: 1;"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23edf"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23edf"><path d="M498.232,789.945C478.836,794.829,458.830,798.321,438.317,800.299C217.745,821.563,21.405,659.751,0.140,439.179C-15.799,273.839,71.132,122.115,208.572,47.542C222.561,41.750,234.166,37.809,240.973,35.794C295.016,19.796,318.321,15.273,365.357,14.282C405.492,13.437,433.704,18.297,461.112,27.226C484.986,35.004,501.983,44.453,523.446,58.511C537.692,67.842,558.596,89.393,565.021,103.893C571.446,118.393,573.790,132.279,574.142,146.356C574.368,155.438,569.781,176.532,569.588,174.534C569.396,172.537,560.939,158.221,554.095,149.809C546.373,140.317,533.370,132.797,519.936,126.383C504.127,118.835,485.575,118.224,478.035,119.335C458.209,122.254,451.010,131.012,443.522,136.773C436.741,141.991,427.517,158.475,423.595,169.941C418.771,184.047,398.492,232.838,379.306,252.831C360.120,272.824,337.142,295.198,331.580,320.933C327.212,341.145,330.995,377.435,330.995,377.435C332.166,389.585,351.803,439.233,350.216,440.813C329.973,460.961,297.212,461.087,323.674,447.921C331.279,444.137,317.730,406.138,315.091,400.729C311.332,393.028,301.043,380.845,290.793,378.810C280.542,376.774,263.546,386.961,261.810,400.232C260.073,413.503,267.301,425.910,274.048,433.323C286.938,447.486,296.891,447.827,314.823,449.551C323.915,450.425,339.032,439.870,349.817,437.106C351.985,436.551,359.327,452.317,374.813,466.951C387.175,478.632,429.694,502.479,441.902,505.841C463.591,511.814,507.316,518.157,514.553,518.996C528.788,520.648,567.734,517.901,587.849,517.978C607.964,518.055,623.647,503.440,623.647,503.440C632.934,495.489,631.521,480.833,630.912,474.516C629.950,464.530,625.999,454.831,628.987,454.543C628.987,454.543,636.538,459.863,640.585,470.560C644.632,481.257,642.896,494.528,642.896,494.528C642.896,494.528,642.155,507.703,630.168,518.938C618.181,530.173,613.104,529.655,597.455,534.187C591.375,535.948,568.151,538.428,560.887,540.737C547.229,545.077,536.239,556.216,525.825,573.347C510.934,597.845,508.482,625.951,506.699,635.669C504.062,650.034,506.906,695.871,506.906,695.871C506.906,695.871,464.235,698.977,394.006,655.604C377.198,645.224,341.727,622.141,308.572,593.284C287.720,575.135,291.791,578.570,268.339,553.843C248.134,532.540,243.461,525.914,243.558,526.915C244.540,537.100,256.374,577.783,269.460,607.315C283.637,639.309,302.028,667.828,322.821,690.121C367.807,738.353,388.877,747.006,424.850,765.204C444.992,775.393,507.676,787.547,506.677,787.643C503.293,787.969,500.575,788.780,498.232,789.945Z" style="fill: rgb(25, 9, 61); fill-opacity: 1;"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee0" style="opacity: 1;"><defs><linearGradient id="fill-color-gradient-render-44-0" x1="0.8130211633909687" y1="0.07183076429776955" x2="0.15915048575805035" y2="0.9332317371727581" gradientTransform=""><stop offset="0" stop-color="#c4beae" stop-opacity="1"></stop><stop offset="1" stop-color="#7d7669" stop-opacity="1"></stop></linearGradient><pattern patternUnits="userSpaceOnUse" x="63.47216481824398" y="114.57109453148144" width="429.6100406553487" height="185.15158201762551" patternTransform="matrix(0.988869, -0.148792, 0.148530, 0.988908, -27.669896, 43.703101)" id="fill-0-render-44"><g><rect width="429.6100406553487" height="185.15158201762551" style="fill: url(&quot;#fill-color-gradient-render-44-0&quot;);"></rect></g></pattern></defs><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ee0"><path d="M327.310,233.579C301.232,254.949,273.377,274.011,243.748,290.763C224.238,300.942,203.832,308.915,182.530,314.681C170.413,317.158,158.199,318.996,145.890,320.194C131.481,320.792,117.912,318.095,105.181,312.103C92.668,305.674,81.938,297.157,72.989,286.553C79.773,286.369,86.638,287.133,93.587,288.846C113.486,293.235,139.526,291.307,170.634,282.675C201.109,272.614,229.342,256.081,256.209,238.885C283.616,220.665,309.274,200.463,333.182,178.281C352.845,158.278,372.842,138.601,393.176,119.251C406.841,106.559,422.619,96.995,440.512,90.559C452.481,86.552,464.743,85.034,477.296,86.005C454.899,94.316,436.300,107.573,421.498,125.775C399.619,156.719,375.636,185.820,349.547,213.076C341.655,219.521,334.243,226.356,327.310,233.579ZL327.310,233.579Z" fill="url(#fill-0-render-44)" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd;"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee1"><defs><linearGradient id="fill-color-gradient-render-45-0" x1="0.5" y1="0" x2="0.5" y2="1" gradientTransform=""><stop offset="0" stop-color="#09153a" stop-opacity="1"></stop><stop offset="1" stop-color="#7d7669" stop-opacity="1"></stop></linearGradient><pattern patternUnits="userSpaceOnUse" x="84.27447870335163" y="368.25479429351935" width="174.45059246346682" height="405.3152223668237" patternTransform="matrix(0.971194, -0.238290, 0.237580, 0.971368, -130.697219, 57.213022)" id="fill-0-render-45"><g><rect width="174.45059246346682" height="405.3152223668237" style="fill: url(&quot;#fill-color-gradient-render-45-0&quot;);"></rect></g></pattern></defs><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ee1"><path d="M57.748,390.154C57.748,390.154,55.139,464.111,70.774,526.198C79.108,559.290,89.291,594.657,135.166,647.008C175.133,692.616,233.391,727.016,303.683,746.914C311.959,749.256,240.485,709.163,206.455,683.465C163.284,650.864,131.270,617.235,103.064,563.532C69.063,498.796,57.748,390.154,57.748,390.154Z" fill="url(#fill-0-render-45)"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee2" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ef0" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ef0"><path d="M354.766,530.158C361.834,546.108,369.651,557.036,371.811,560.769C388.347,586.664,407.089,610.729,428.035,632.962C451.244,657.540,467.146,671.462,495.345,689.974C496.680,690.339,505.553,696.160,506.906,695.871C504.962,696.563,497.292,698.602,495.013,698.026C452.929,692.460,425.381,676.178,389.712,652.784C391.412,653.343,367.688,640.175,369.341,639.628C324.695,588.880,327.199,539.921,331.576,471.916C332.167,471.264,332.768,470.534,333.375,469.727C336.159,477.391,338.424,485.237,340.169,493.263C346.352,511.201,348.486,517.156,354.766,530.158ZL354.766,530.158Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(125, 118, 105); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee3" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ee3"><path d="M377.186,255.099C376.441,258.101,375.030,260.592,373.519,265.778C367.343,291.551,367.179,315.926,372.321,341.994C379.844,371.213,392.169,398.248,409.296,423.098C440.422,462.576,480.349,489.134,529.078,502.770C525.822,503.756,522.501,504.076,519.117,503.730C486.571,496.450,456.648,489.276,427.899,472.564C413.044,464.920,404.321,454.988,396.035,445.383C396.319,444.084,381.650,416.923,378.707,413.447C379.006,413.083,371.373,403.508,368.383,399.141C368.535,398.536,365.404,394.387,362.065,386.829C360.254,382.259,359.661,376.100,357.584,371.637C358.002,370.339,353.209,356.033,352.721,351.744C353.354,351.347,345.800,321.651,349.416,312.230C350.056,306.149,351.018,301.238,351.215,295.143C350.721,294.238,355.287,280.151,356.600,277.992C358.582,276.557,354.183,277.989,358.841,274.011C364.192,266.943,371.222,261.221,377.186,255.099ZL377.186,255.099ZM352.721,351.744M368.383,399.141" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(218, 211, 190); fill-opacity: 1;"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee4" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ef1" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ef1"><path d="M631.507,388.572C629.883,392.598,628.957,396.887,628.726,401.439C629.329,403.947,630.649,404.614,632.340,407.642C633.179,409.930,633.823,411.385,633.914,413.538C633.978,414.205,634.042,414.870,634.107,415.536C634.056,420.804,633.210,425.926,631.566,430.900C630.152,433.546,628.732,436.203,627.308,438.870C611.584,443.549,597.868,440.336,586.162,429.229C596.756,426.536,607.617,424.481,618.746,423.064C621.182,421.317,622.285,418.858,622.057,415.690C621.270,412.742,620.483,409.794,619.696,406.846C618.786,406.094,617.875,405.341,616.965,404.589C604.504,405.028,592.266,406.712,580.252,409.640C566.718,411.898,553.105,413.211,539.411,413.577C530.171,413.917,525.108,408.738,527.930,401.407C531.283,399.572,534.103,400.951,536.408,403.283C544.488,403.233,552.425,402.132,560.219,399.980C577.435,392.962,593.553,386.510,611.202,380.710C617.195,380.701,624.430,382.525,631.122,384.577C631.250,385.908,631.905,386.846,631.507,388.572ZL631.507,388.572Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(9, 21, 58); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee5" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ef2" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ef2"><path d="M512.345,214.505C527.677,216.774,535.581,225.755,536.056,241.449C528.733,239.533,521.488,237.376,514.318,234.977C496.082,231.907,478.499,233.770,461.571,240.566C455.700,241.786,450.580,244.295,446.211,248.095C438.591,251.556,431.473,255.938,424.857,261.241C424.343,261.122,423.829,261.005,423.314,260.886C435.371,239.543,453.094,225.235,476.484,217.962C488.330,215.597,500.283,214.445,512.345,214.505ZZ" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(9, 21, 58); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee6" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ef3" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ef3"><path d="M528.121,263.435C530.327,273.108,531.258,282.762,530.913,292.397C526.221,287.575,522.339,282.069,519.267,275.880C518.919,275.745,518.570,275.612,518.223,275.477C516.407,284.176,511.067,287.883,502.203,286.597C500.564,285.243,498.926,283.889,497.287,282.535C494.124,278.243,491.184,273.823,488.468,269.274C486.257,270.663,484.044,272.052,481.832,273.441C475.125,282.351,467.133,289.842,457.858,295.912C455.721,297.102,453.445,297.826,451.030,298.082C451.807,292.306,453.451,286.772,455.964,281.479C462.513,267.189,472.293,255.662,485.306,246.900C494.302,242.722,503.598,241.826,513.198,244.211C520.869,248.447,525.844,254.856,528.121,263.435ZZ" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(9, 21, 58); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee7" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ef4" style="opacity: 1;"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ef4"><path d="M358.750,274.257C357.437,276.416,353.318,290.908,351.759,295.594C351.311,297.551,348.609,316.989,349.024,324.585C350.338,348.649,360.605,380.713,362.416,385.283C367.010,396.432,379.330,413.215,383.346,418.371C387.411,424.027,395.771,437.344,398.887,443.596C401.963,449.350,414.124,462.632,425.466,470.929C432.125,477.189,439.359,482.708,447.170,487.483C477.673,505.740,510.582,516.847,545.895,520.804C540.161,521.097,534.452,520.975,528.768,520.439C527.772,520.535,526.776,520.631,525.780,520.727C491.782,519.532,458.691,513.482,426.507,502.579C402.556,492.289,381.242,478.049,362.567,459.857C357.547,453.411,353.526,444.727,348.897,437.992C346.520,434.189,340.020,422.385,340.288,421.687C326.416,385.335,322.924,347.369,331.995,309.595C337.316,296.240,347.070,282.700,358.750,274.257ZL358.750,274.257Z" style="shape-rendering: geometricprecision; text-rendering: geometricprecision; fill-rule: evenodd; clip-rule: evenodd; fill: rgb(125, 118, 105); fill-opacity: 1;"></path></g></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee8"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ee8"><path d="M584.942,216.668C584.942,216.668,576.909,218.090,573.469,222.814C569.918,227.692,566.463,233.569,567.329,242.557C568.196,251.545,572.764,263.774,576.596,270.895C581.496,279.998,597.711,294.252,602.846,298.099C614.766,307.029,619.345,307.596,622.124,310.352C625.834,314.031,618.992,320.885,617.704,321.865C613.641,324.958,606.121,324.818,599.709,328.136C590.133,333.091,582.755,343.299,580.427,347.130C579.125,349.271,579.393,353.746,581.245,355.619C583.280,357.675,587.564,356.833,589.263,355.350C591.983,352.975,595.063,347.735,600.253,344.211C606.111,340.233,611.468,340.610,612.705,343.010C614.599,346.686,614.086,346.909,611.933,350.644C611.225,351.873,608.574,357.520,611.563,357.232C614.551,356.944,615.193,358.394,618.037,356.608C621.095,354.688,622.985,352.262,625.831,348.801C627.630,346.611,629.294,343.018,630.089,340.830C631.330,337.418,631.440,336.078,631.930,334.802C632.733,332.709,633.123,332.342,633.945,329.553C634.842,326.511,634.566,327.715,635.474,323.680C636.831,317.649,636.731,318.912,637.137,315.598C637.702,310.994,637.703,310.987,637.960,308.442C638.162,306.446,635.334,302.124,633.739,301.267C629.970,299.242,624.263,296.034,619.395,292.472C613.956,288.491,605.467,281.882,602.013,279.028C597.643,275.417,591.174,270.422,592.390,267.860C593.644,265.219,599.139,259.650,601.035,258.459C602.931,257.268,605.792,250.441,604.651,249.039C604.335,248.650,603.751,250.134,599.509,253.062C597.179,254.672,590.929,257.921,590.929,257.921C590.929,257.921,594.931,252.496,597.630,249.212C600.330,245.928,602.627,243.690,603.431,241.597C604.235,239.503,600.949,240.214,599.398,241.482C596.603,243.767,594.353,246.504,591.461,247.791C588.569,249.077,589.517,248.482,589.630,244.439C589.742,240.428,590.885,241.821,590.354,236.306C589.824,230.813,591.078,228.172,590.692,224.178C590.307,220.183,584.942,216.668,584.942,216.668Z" style="fill: rgb(9, 21, 58); fill-opacity: 1;"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23ee9"><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23ee9"><path d="M391.569,268.573C391.569,268.573,387.032,315.376,393.616,341.956C399.690,366.477,421.982,406.755,419.797,404.950C411.586,398.165,399.489,372.666,394.257,359.030C387.543,341.534,384.236,317.662,385.588,300.396C386.453,289.349,391.569,268.573,391.569,268.573Z" style="fill: rgb(205, 197, 176); fill-opacity: 1;"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eea"><defs><linearGradient id="fill-color-gradient-render-59-0" x1="0.5" y1="0" x2="0.5" y2="1" gradientTransform=""><stop offset="0" stop-color="#09153a" stop-opacity="1"></stop><stop offset="1" stop-color="#7d7669" stop-opacity="1"></stop></linearGradient><pattern patternUnits="userSpaceOnUse" x="210.9846875559906" y="345.0967983361571" width="169.12735372389398" height="320.054052542382" patternTransform="matrix(0.995385, -0.095960, 0.095960, 0.995385, -47.107553, 30.691705)" id="fill-0-render-59"><g><rect width="169.12735372389398" height="320.054052542382" style="fill: url(&quot;#fill-color-gradient-render-59-0&quot;);"></rect></g></pattern></defs><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23eea"><path d="M395.078,656.298C395.078,656.298,346.914,629.735,301.547,586.735C276.468,562.963,260.550,547.345,242.012,521.917C215.023,484.896,200.442,445.288,203.626,415.751C203.626,415.751,210.697,360.285,217.580,351.912C219.380,349.723,214.979,423.122,232.540,465.377C243.012,490.574,252.002,504.474,274.626,536.916C315.459,595.473,395.078,656.298,395.078,656.298Z" fill="url(#fill-0-render-59)"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eeb"><defs><linearGradient id="fill-color-gradient-render-60-0" x1="0.5" y1="0" x2="0.5" y2="1" gradientTransform=""><stop offset="0" stop-color="#09153a" stop-opacity="1"></stop><stop offset="1" stop-color="#7d7669" stop-opacity="1"></stop></linearGradient><pattern patternUnits="userSpaceOnUse" x="114.03975331400397" y="354.5278863156726" width="135.5286269553635" height="279.69718401921784" patternTransform="matrix(0.987163, 0.159719, -0.158511, 0.987357, 80.698013, -22.787271)" id="fill-0-render-60"><g><rect width="135.5286269553635" height="279.69718401921784" style="fill: url(&quot;#fill-color-gradient-render-60-0&quot;);"></rect></g></pattern></defs><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23eeb"><path d="M148.866,415.480C152.034,395.748,155.544,365.415,161.521,353.596C167.498,341.777,148.758,356.859,134.977,383.398C121.197,409.938,118.146,479.768,130.368,522.235C142.589,564.702,166.265,586.647,178.845,601.468C197.711,623.696,226.531,643.280,226.531,643.280C226.531,643.280,180.035,571.077,166.982,531.356C151.451,484.091,145.698,435.212,148.866,415.480Z" fill="url(#fill-0-render-60)"></path></g></g><g id="shape-fb17a1f9-5fd0-808c-8004-7fa34ca23eec"><defs><linearGradient id="fill-color-gradient-render-61-0" x1="0.9620120220782526" y1="0.29346308156381923" x2="0.011841748107687176" y2="0.8985416708295375" gradientTransform=""><stop offset="0" stop-color="#d7cdb7" stop-opacity="1"></stop><stop offset="1" stop-color="#071338" stop-opacity="1"></stop></linearGradient><pattern patternUnits="userSpaceOnUse" x="53.00273555986314" y="18.336528697897506" width="519.3859515335116" height="223.9012328287613" patternTransform="matrix(0.995385, -0.095960, 0.095960, 0.995385, -11.059275, 30.607374)" id="fill-0-render-61"><g><rect width="519.3859515335116" height="223.9012328287613" style="fill: url(&quot;#fill-color-gradient-render-61-0&quot;);"></rect></g></pattern></defs><g class="fills" id="fills-fb17a1f9-5fd0-808c-8004-7fa34ca23eec"><path d="M573.751,152.734C573.751,152.734,563.804,112.794,548.507,97.006C530.643,78.569,525.278,75.055,501.500,68.275C477.722,61.496,456.804,63.513,436.270,69.524C415.736,75.535,364.544,107.685,341.759,132.057C318.974,156.429,278.225,192.612,265.949,200.851C253.673,209.090,210.546,241.470,177.352,251.726C145.665,261.516,119.157,263.384,95.798,250.517C72.439,237.649,62.930,222.439,60.552,218.636C58.175,214.833,70.480,227.758,85.711,229.314C100.942,230.870,152.130,229.967,188.346,209.340C224.563,188.713,284.176,139.624,287.775,135.245C291.375,130.867,356.194,73.212,383.926,58.443C407.121,46.091,426.216,38.239,431.100,36.760C435.985,35.281,395.599,39.616,373.517,44.327C339.037,51.683,287.138,86.925,249.507,113.736C211.876,140.546,209.369,145.828,191.213,155.642C173.056,165.456,136.551,183.087,135.555,183.183C134.559,183.279,160.722,131.367,194.753,108.935C225.596,88.605,247.874,65.511,273.904,53.930C299.933,42.349,283.128,34.898,281.040,34.091C271.699,30.484,256.526,30.263,240.973,35.794C225.420,41.325,269.708,23.292,318.637,17.363C357.434,12.662,405.686,13.003,430.267,17.689C454.848,22.375,486.980,32.381,512.717,49.051C538.453,65.721,559.286,88.050,567.400,105.264C576.582,124.742,573.751,152.734,573.751,152.734Z" fill="url(#fill-0-render-61)"></path></g></g></g></g></g></g></g></g></g></g></svg></svg></g></g></svg>
````

## File: static/logo.svg
````
<svg width="500" xmlns="http://www.w3.org/2000/svg" height="500" id="screenshot-6c0c4372-1ec9-80fa-8006-0ab1c069d297" viewBox="0 0 500 500" xmlns:xlink="http://www.w3.org/1999/xlink" fill="none" version="1.1"><g id="shape-6c0c4372-1ec9-80fa-8006-0ab1c069d297" rx="0" ry="0"><g id="shape-6c0c4372-1ec9-80fa-8006-0ab1af02e6e4"><g class="fills" id="fills-6c0c4372-1ec9-80fa-8006-0ab1af02e6e4"><path d="M96.965,197.357C96.965,197.357,86.659,185.758,74.826,181.703C57.272,175.689,23.975,181.459,11.176,202.575C5.294,212.279,0.794,218.443,0.106,228.665C-1.652,254.788,18.440,283.780,58.222,291.281C88.058,296.907,121.362,313.841,144.011,338.243C163.377,359.108,173.529,387.491,173.529,418.759C173.529,448.436,186.315,466.367,199.359,479.128C216.130,495.535,233.606,500.000,249.172,500.000C276.846,500.000,328.504,476.156,328.504,418.759C328.504,361.361,361.713,324.835,394.921,309.181C403.399,305.185,443.324,291.488,456.727,286.063C498.666,269.089,514.551,232.098,484.401,197.357C474.458,185.900,465.350,181.840,453.960,179.094C449.609,178.046,444.554,176.291,440.123,176.485C434.941,176.712,430.278,179.154,423.518,181.703C407.649,187.688,397.663,201.850,389.281,219.289C384.775,228.665,382.852,232.867,379.240,239.101C375.395,245.737,370.938,252.146,367.247,257.001C356.122,271.638,336.386,284.116,315.590,291.281C290.491,299.929,264.047,301.717,251.940,301.717C237.238,301.717,207.789,301.995,179.987,291.281C165.923,285.861,155.081,278.236,141.244,265.191C134.409,258.747,126.090,246.782,119.104,233.883C111.668,220.153,105.527,205.429,96.965,197.357ZM389.281,219.289" style="fill: currentColor; fill-opacity: 1;"/></g></g><g id="shape-6c0c4372-1ec9-80fa-8006-0ab1af02e6e5"><g class="fills" id="fills-6c0c4372-1ec9-80fa-8006-0ab1af02e6e5"><ellipse cx="245.00000000186265" cy="93.13725490123034" rx="94.99999999813735" ry="93.13725490123034" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" style="fill: currentColor; fill-opacity: 1;"/></g></g></g></svg>
````

## File: static/site.webmanifest
````
{
  "name": "Hominio",
  "short_name": "Hominio",
  "icons": [
    {
      "src": "/web-app-manifest-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/web-app-manifest-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "theme_color": "#f1f1f1",
  "background_color": "#20173e",
  "display": "standalone"
}
````

## File: COMPOSITE.md
````markdown
# Hominio Composite Architecture

A universal, declarative UI composition system that runs on top of the Hominio Query Layer.

## Self-Describing Composite System

Hominio Composites are stored as LoroDoc documents in hominio-db, making them directly queryable and mutable through the standard HQL interface. Each composite is a self-contained definition that includes:

1. **State Management**: Reactive data sources and values
2. **State Machine**: Event handling and transitions between UI states
3. **View Definition**: Declarative component structure
4. **Actions**: Operations triggered by events or user interaction

The meta-circular nature of this system means composite definitions can edit themselves and each other using the same primitives.

## Content Architecture

Hominio follows a dual-addressing model separating entity identity from content:

```typescript
// Entity identity via PubKeyMocked (similar to IPNS)
const pubKey = "@composite:todo-list";

// Content addressing for document versions (similar to IPFS)
const snapshotCid = "Qm..."; // Content hash of latest snapshot
const updateCids = ["Qm...", "Qm..."]; // Content hashes of incremental updates
```

Each composite document has:
1. Stable identity through PubKeyMocked (using @ notation)
2. Content versioning through content-addressed snapshots and updates
3. Internal content as pure JSON, stored in a LoroDoc

## Composite Definition

A composite is defined as a pure JSON object stored in a LoroDoc document:

```typescript
interface Composite {
  // Unique identity
  id: string;
  
  // State management - all values are reactive by default
  state: {
    [key: string]: {
      // Direct value
      value?: any;
      // Query definition
      query?: {
        type: string;  // "schema", "relationship", "match"
        schema?: string;  // Schema reference (e.g. "@schema:zukte")
        gismu?: string;   // Predicate reference (e.g. "@schema:vasru")
        patterns?: Array<{  // Patterns for matching
          type: string;
          gismu?: string;
          filter?: Record<string, any>;
        }>;
        filter?: Record<string, any>; // Filter conditions
        orderBy?: Array<{  // Ordering
          field: string;
          direction: "asc" | "desc";
        }>;
      };
    }
  };
  
  // State machine
  machine?: {
    initial: string;
    states: Record<string, {
      on: Record<string, {
        target?: string;
        actions?: string[];
      }>;
    }>;
  };
  
  // Actions
  actions?: Record<string, {
    guard?: string;
    mutation?: {
      operations: Array<{
        type: string;  // "create", "update", "delete", "relate"
        schema?: string;
        id?: string;
        data?: Record<string, any>;
        // For entity creation
        gismu?: string;     // Predicate type (e.g. "@schema:zukte")
        // For relationships
        bridi?: string;     // Relation type (e.g. "vasru")
        x1?: string;        // First place (typically container/agent)
        x2?: string;        // Second place (typically content/patient)
        x3?: string;        // Third place (typically time/context)
        x4?: string;        // Fourth place (additional context)
        x5?: string;        // Fifth place (additional context)
      }>
    };
    update?: Record<string, string>;
  }>;
  
  // View definition
  view: {
    type: string;
    props?: Record<string, any>;
    children?: any[];
    events?: Record<string, string>;
  };
}
```

## Reactive Data Binding

All values in the state object are reactive by default. Every reference with `$` prefix is automatically subscribed and updates when the underlying data changes:

```json
"newTodoText": {
  "value": ""
}
```

The system automatically tracks dependencies and updates the UI when any value changes.

## Semantic References with @ Notation

Hominio uses @ notation for referencing entities and schemas:

```json
{
  "query": {
    "type": "relationship",
    "gismu": "@schema:vasru",
    "filter": {
      "x1": "@proj:website"
    }
  }
}
```

This provides a consistent pattern for:
- Schema references: `@schema:zukte`
- Entity references: `@task:design`, `@proj:website`, `@person:samuel`
- Relationship references: `@rel:proj_has_design`

## Simplified Example: Todo List

Below is a simplified example of a Todo List composite with the essential functionality:

```json
{
  "id": "todo-list",
  "state": {
    "currentProject": {
      "value": "@proj:website"
    },
    "todos": {
      "query": {
        "patterns": [
          {
            "match": {
              "gismu": "@schema:vasru",
              "x1": "$currentProject",
              "x2": "?task"
            }
          }
        ],
        "where": {
          "?task.content.a1.gismu": "@schema:zukte"
        },
        "return": "?task"
      }
    },
    "people": {
      "query": {
        "match": {
          "gismu": "@schema:prenu"
        },
        "return": "?person"
      }
    },
    "newTodoText": {
      "value": ""
    }
  },
  
  "machine": {
    "initial": "viewing",
    "states": {
      "viewing": {
        "on": {
          "ADD_TODO": {
            "actions": ["addTodo"]
          },
          "TOGGLE_TODO": {
            "actions": ["toggleTodo"]
          },
          "ASSIGN_TODO": {
            "actions": ["assignTodo"]
          }
        }
      }
    }
  },
  
  "actions": {
    "addTodo": {
      "guard": "$newTodoText.trim().length > 0",
      "mutation": {
        "create": {
          "gismu": "@schema:zukte",
          "translations": [
            {
              "lang": "en",
              "content": {
                "velsku": "$newTodoText",
                "mulno": false,
                "te_zbasu": "new Date().toISOString()"
              }
            }
          ]
        },
        "then": {
          "connect": {
            "gismu": "@schema:vasru",
            "x1": "$currentProject",
            "x2": "@CREATED_ID"
          }
        }
      },
      "update": {
        "newTodoText": "\"\""
      }
    },
    "toggleTodo": {
      "mutation": {
        "update": {
          "pubkey": "$event.todoId",
          "translations": [
            {
              "lang": "en",
              "content": {
                "mulno": "!$event.currentState"
              }
            }
          ]
        }
      }
    },
    "assignTodo": {
      "mutation": {
        "connect": {
          "gismu": "@schema:te_zukte",
          "x1": "$event.todoId",
          "x2": "$event.personId"
        }
      }
    }
  },
  
  "view": {
    "type": "component",
    "props": {
      "name": "TodoList"
    },
    "children": [
      {
        "type": "element",
        "props": {
          "tag": "h2",
          "class": "text-xl font-bold mb-4"
        },
        "textContent": "Todo List"
      },
      {
        "type": "element",
        "props": {
          "tag": "form",
          "class": "mb-4",
          "on:submit": "send('ADD_TODO'); return false;"
        },
        "children": [
          {
            "type": "element",
            "props": {
              "tag": "input",
              "type": "text",
              "placeholder": "What needs to be done?",
              "value": "$newTodoText",
              "class": "w-full px-3 py-2 border rounded",
              "on:input": "update({ newTodoText: $event.target.value })"
            }
          },
          {
            "type": "element",
            "props": {
              "tag": "button",
              "type": "submit",
              "class": "mt-2 px-4 py-2 bg-blue-500 text-white rounded"
            },
            "textContent": "Add Todo"
          }
        ]
      },
      {
        "type": "element",
        "props": {
          "tag": "ul",
          "class": "space-y-2"
        },
        "children": [
          {
            "type": "iterator",
            "source": "$todos",
            "template": {
              "type": "element",
              "props": {
                "tag": "li",
                "class": "flex items-center justify-between border rounded p-3"
              },
              "children": [
                {
                  "type": "element",
                  "props": {
                    "tag": "div",
                    "class": "flex items-center"
                  },
                  "children": [
                    {
                      "type": "element",
                      "props": {
                        "tag": "input",
                        "type": "checkbox",
                        "checked": "$item.content.a1.mulno",
                        "class": "mr-2",
                        "on:change": "send('TOGGLE_TODO', { todoId: $item.pubkey, currentState: $item.content.a1.mulno })"
                      }
                    },
                    {
                      "type": "element",
                      "props": {
                        "tag": "span",
                        "class": "$item.content.a1.mulno ? 'line-through text-gray-500' : ''"
                      },
                      "textContent": "$item.content.a1.velsku || $item.pubkey"
                    }
                  ]
                },
                {
                  "type": "element",
                  "props": {
                    "tag": "select",
                    "class": "text-sm border rounded px-1",
                    "on:change": "send('ASSIGN_TODO', { todoId: $item.pubkey, personId: $event.target.value })"
                  },
                  "children": [
                    {
                      "type": "element",
                      "props": {
                        "tag": "option",
                        "value": ""
                      },
                      "textContent": "Assign to..."
                    },
                    {
                      "type": "iterator",
                      "source": "$people",
                      "template": {
                        "type": "element",
                        "props": {
                          "tag": "option",
                          "value": "$item.pubkey"
                        },
                        "textContent": "$item.content.a1.cmene || $item.pubkey"
                      }
                    }
                  ]
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

## Entity Structure Example

Following the structure in page.svelte, entities are defined with a pubkey and content structure:

```json
// Task entity
{
  "pubkey": "@task:design",
  "content": { 
    "a1": { 
      "gismu": "@schema:zukte", 
      "x1": "@task:design" 
    }
  },
  "translations": [
    {
      "lang": "en",
      "content": {
        "velsku": "Design Mockups",
        "mulno": false
      }
    }
  ]
}

// Relationship entity
{
  "pubkey": "@rel:proj_has_design",
  "content": { 
    "b1": { 
      "gismu": "@schema:vasru", 
      "x1": "@proj:website", 
      "x2": "@task:design" 
    }
  },
  "translations": []
}
```

## Hominio DB Integration: PubKey and Content Separation

Each composite is stored in HominioDB with a clear separation between identity and content:

```typescript
// Document identity
const pubKey = "@composite:todo-list";

// Content addressing for latest snapshot
const snapshotCid = "Qm..."; // Content hash of the document

// Docs registry entry that maps identity to content
const docsEntry = {
  pubKeyMocked: pubKey,
  owner: "user123",
  updatedAt: "2023-05-01T12:00:00Z",
  snapshotCid: snapshotCid,
  updateCids: [],
  
  // Mirrored metadata from content
  meta: {
    title: "Todo List", 
    description: "Simple todo app",
    schemaId: "@schema:selfni",
    createdAt: "2023-05-01T12:00:00Z"
  }
};

// Actual content stored separately with content addressing
const contentItem = {
  cid: snapshotCid,
  type: "snapshot",
  raw: Uint8Array,  // Binary LoroDoc data containing the composite definition
  metadata: {
    size: 8192,
    createdAt: "2023-05-01T12:00:00Z"
  }
};
```

## Component Renderer

The composite renderer interprets the composite definition and creates a reactive UI:

```typescript
// Simplified renderer
export function renderComposite(pubKeyMocked: string) {
  // Load the composite document from HominioDB
  const { doc, docs } = await hominioDB.getContent(pubKeyMocked);
  const composite = doc.data;
  
  // Create reactive state from composite state definition
  const state = createReactiveState(composite.state);
  
  // Set up state machine if defined
  const machine = composite.machine ? createStateMachine(composite.machine, state, composite.actions) : null;
  
  // Initialize event handlers
  const eventHandlers = {
    send: (event, payload) => machine?.send(event, payload),
    update: (newState) => updateState(state, newState)
  };
  
  // Render the view tree
  return renderView(composite.view, state, eventHandlers);
}

// Usage
const todoApp = await o.compose("@composite:todo-list");
```

## Core HQL Interface

```typescript
// The universal "o" interface
interface HominioQL {
  // Query entities - always returns reactive results
  viska(query: {
    type: string;
    schema?: string;
    gismu?: string;
    filter?: Record<string, any>;
    patterns?: Array<any>;
    orderBy?: Array<{
      field: string;
      direction: string;
    }>;
  }): any[];
  
  // Modify entities
  galfi(mutation: {
    type: string;
    schema?: string;
    id?: string;
    data?: Record<string, any>;
    gismu?: string;
    bridi?: string;
    x1?: string;
    x2?: string;
    x3?: string;
    x4?: string;
    x5?: string;
  }): Promise<{
    judri: string;
    snada: boolean;
  }>;
  
  // Load and render composite components
  compose(pubKeyMocked: string): Promise<any>;
}

// Export the minimal interface
export const o = new HominioQL();
```

## Usage Example

```javascript
// In your main.js or App.svelte
import { o } from '$lib/hominio-ql';

// Load a component directly from HominioDB using @ notation
const TodoList = await o.compose('@composite:todo-list');

// Then mount it in your app - e.g., in a Svelte component:
// <svelte:component this={TodoList} />
```
````

## File: HOMINIO-QL.md
````markdown
# Hominio Query Language (HQL)

A universal, semantic query API for Hominio that implements the exact same interfaces as used in the Hominio semantic network implementation.

## Core Concepts

HQL provides a unified interface for interacting with docs and relationships in the Hominio semantic network:

1. **Docs** - Things identified by `@pubkey` identifiers (like `@01ab42c9d8ef7...`)
2. **Schemas** - Doc types defined as predicates with place structures
3. **Gismu Universal Model** - Everything is a gismu entity with a place structure, even schemata themselves.
4. **Schema Validation** - Formal validation rules for entities based on Lojban place structure logic

## Schema Definition and Validation System

HQL implements a formal schema definition system that allows for validation of entities while respecting Lojban's logical place structure.

```typescript
// Schema Definition System
type PlaceType = 'entity' | 'string' | 'number' | 'boolean' | 'any';

interface PlaceDefinition {
  type: PlaceType | PlaceType[]; // What type of value is allowed
                             // If 'entity' is included, composite (reference) is allowed
                             // If any primitive type is included, leaf values are allowed
  required: boolean;         // Is this place required for the entity to be valid?
  entitySchemas?: string[];  // If type includes 'entity', which schemas are allowed (by pubkey)
                             // If not specified, any entity schema is allowed
  validation?: {             // Optional validation rules for leaf values
    pattern?: string;        // Regex pattern for strings
    min?: number;            // Min value for numbers
    max?: number;            // Max value for numbers
    options?: any[];         // List of allowed values
  };
}

interface SchemaDefinition {
  pubkey: string;            // Public key identifier 
  schema: string | null;     // Schema reference or null for metaschema
  name: string;              // Lojban gismu name
  places: Record<string, PlaceDefinition>; // Place definitions
  translations: {            // Translations of the schema
    lang: string;            // Language code
    name: string;            // Translated name
    places: Record<string, string>; // Translated place descriptions
  }[];
}

// Validation function
function validateEntity(entity: any, schema: SchemaDefinition): ValidationResult {
  // Implementation would check that:
  // 1. All required places are present
  // 2. Each place value matches its defined type(s)
  // 3. Leaf values pass their validation rules
  // 4. Composite values reference valid entities
  // 5. Referenced schemas exist in the system
  // 6. Entity references point to entities with allowed schemas
}
```

## Core Schema Definitions

```typescript
const schemata: SchemaDefinition[] = [
    // Task schema definition
    { 
        pubkey: '0x7a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
        schema: '@0xmeta', // Reference to metaschema
        name: 'gunka',
        places: {
            x1: {
                description: 'le gunka (worker/laborer)',
                type: 'entity',
                required: true,
                entitySchemas: ['@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'] // Only prenu entities allowed
            },
            x2: {
                description: 'le se gunka (work/task/labor)',
                type: ['entity', 'string'],
                required: true,
                entitySchemas: ['@0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b'] // Only ckaji entities allowed when using an entity reference
            },
            x3: {
                description: 'le te gunka (purpose/goal/objective)',
                type: ['entity', 'string'],
                required: false
                // No entitySchemas specified, so any entity schema is allowed
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Work/Labor',
                description: 'x1 works/labors on x2 with goal x3',
                places: {
                    x1: 'worker/laborer',
                    x2: 'work/task/labor',
                    x3: 'purpose/goal/objective'
                }
            }
        ]
    },
    
    // Person schema definition
    { 
        pubkey: '0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d',
        schema: '@0xmeta',
        name: 'prenu',
        places: {
            x1: {
                description: 'le prenu (person/people)',
                type: 'entity',
                required: true,
                entitySchemas: ['@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'] // Self-referential: only prenu entities allowed
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Person',
                description: 'x1 is a person/people',
                places: {
                    x1: 'person/people'
                }
            }
        ]
    },
    
    // Status/state schema definition
    { 
        pubkey: '0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
        schema: '@0xmeta',
        name: 'tcini',
        places: {
            x1: {
                description: 'le tcini (state/situation/condition)',
                type: ['entity', 'string'],
                required: true
            },
            x2: {
                description: 'le se tcini (the object in that state/situation)',
                type: 'entity',
                required: false
                // Any entity can be in a state
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'State/Condition',
                description: 'x1 is a state/condition of x2',
                places: {
                    x1: 'state/condition',
                    x2: 'object in that state'
                }
            }
        ]
    },
    
    // Responsibility relationship schema definition
    { 
        pubkey: '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
        schema: '@0xmeta',
        name: 'turni',
        places: {
            x1: {
                description: 'le turni (governor/ruler/responsible entity)',
                type: 'entity',
                required: true,
                entitySchemas: ['@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'] // Only prenu entities can be responsible
            },
            x2: {
                description: 'le se turni (the governed/ruled/subject)',
                type: 'entity',
                required: true
                // Any entity can be governed/the subject of responsibility
            },
            x3: {
                description: 'le te turni (matter/sphere of responsibility)',
                type: ['entity', 'string'],
                required: false
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Responsible',
                description: 'x1 is responsible for x2 in sphere x3',
                places: {
                    x1: 'responsible entity',
                    x2: 'subject of responsibility',
                    x3: 'sphere/matter of responsibility'
                }
            }
        ]
    },
    
    // State transition schema definition
    { 
        pubkey: '0x3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e',
        schema: '@0xmeta',
        name: 'binxo',
                    places: {
            x1: {
                description: 'le binxo (the thing changing)',
                type: 'entity',
                required: true
                // Any entity can change
            },
            x2: {
                description: 'le se binxo (resulting state/form)',
                type: 'entity',
                required: true,
                entitySchemas: ['@0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f'] // Must be a tcini (state) entity
            },
            x3: {
                description: 'le te binxo (initial state/form)',
                type: 'entity',
                required: false,
                entitySchemas: ['@0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f'] // Must be a tcini (state) entity
            }
                    },
                    translations: [
                    {
                        lang: 'en',
                name: 'Change/Transform',
                description: 'x1 changes to x2 from x3',
                places: {
                    x1: 'thing changing',
                    x2: 'resulting state/form',
                    x3: 'initial state/form'
                }
            }
        ]
    },
    
    // Name/naming schema definition
    {
        pubkey: '0x2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d',
        schema: '@0xmeta',
        name: 'cmene',
                        places: {
            x1: {
                description: 'le cmene (name/title/tag)',
                type: 'string',
                required: true
            },
            x2: {
                description: 'le se cmene (the named/entitled/tagged)',
                type: 'entity',
                required: true
                // Any entity can have a name
            },
            x3: {
                description: 'le te cmene (namer/name-user)',
                type: 'entity',
                required: false,
                entitySchemas: ['@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'] // Only prenu (people) can name things
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Name',
                description: 'x1 is name of x2 used by x3',
                        places: {
                    x1: 'name/title/tag',
                    x2: 'named entity',
                    x3: 'namer/name-user'
                }
            }
        ]
    },

    // Property schema definition
    {
        pubkey: '0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b',
        schema: '@0xmeta',
        name: 'ckaji',
        places: {
            x1: {
                description: 'le ckaji (thing with property)',
                type: 'entity',
                required: true
                // Any entity can have properties
            },
            x2: {
                description: 'le se ckaji (property/quality/feature)',
                type: ['entity', 'string', 'number', 'boolean'],
                required: true,
                entitySchemas: [
                    '@0x2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b', // valsi (string entity)
                    '@0x8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e', // jetnu (boolean entity) 
                    '@0x4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c'  // namcu (number entity)
                ]
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Property/Quality',
                description: 'x1 has property x2',
                places: {
                    x1: 'thing with property',
                    x2: 'property/quality/feature'
                }
            }
        ]
    },
    
    // String primitive schema definition
    {
        pubkey: '0x2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
        schema: '@0xmeta',
        name: 'valsi',
        places: {
            x1: {
                description: 'le valsi (word/text)',
                type: 'string',
                required: true,
                validation: {
                    pattern: '.*' // Any string is valid
                }
            },
            x2: {
                description: 'le se valsi (meaning/concept)',
                type: ['entity', 'string'],
                required: false
            },
            x3: {
                description: 'le te valsi (language)',
                type: 'string',
                required: false,
                validation: {
                    options: ['en', 'loj', 'de', 'es', 'fr', 'zh', 'ja']
                }
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Word/Text',
                places: {
                    x1: 'word/text',
                    x2: 'meaning/concept',
                    x3: 'language'
                }
            }
        ]
    },

    // Boolean primitive schema definition
    {
        pubkey: '0x8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e',
        schema: '@0xmeta',
        name: 'jetnu',
        places: {
            x1: {
                description: 'le jetnu (truth value/proposition)',
                type: 'boolean',
                required: true
            },
            x2: {
                description: 'le se jetnu (standard/reference of truth)',
                type: ['entity', 'string'],
                required: false
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Truth/Boolean',
                places: {
                    x1: 'truth value',
                    x2: 'standard/reference'
                }
            }
        ]
    },
    
    // Number primitive schema definition
    {
        pubkey: '0x4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
        schema: '@0xmeta',
        name: 'namcu',
        places: {
            x1: {
                description: 'le namcu (number/quantity)',
                type: 'number',
                required: true
            },
            x2: {
                description: 'le se namcu (objects/units)',
                type: ['entity', 'string'],
                required: false
            }
        },
        translations: [
            {
                lang: 'en',
                name: 'Number',
                places: {
                    x1: 'number/quantity',
                    x2: 'objects/units'
                }
            }
        ]
    }
];
```

## Entity Examples

```typescript
const entities = [
    // Person entity (prenu)
    {
        pubkey: '0x7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e',
        schema: '@0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d', // prenu
        name: 'Alice',
        places: {
            x1: '@0x7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e' // Entity reference (self-reference)
        }
    },
    
    // Name entity (cmene) - leaf value example
    {
        pubkey: '0xd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0',
        schema: '@0x2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d', // cmene
        places: {
            x1: 'Alice',                                      // Leaf value (string)
            x2: '@0x7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e', // Entity reference
            x3: '@0x0000000000000000000000000000000000000000'  // Entity reference
        }
    },
    
    // Task entity (gunka) - mixed entity/leaf example
    {
        pubkey: '0x4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b',
        schema: '@0x7a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b', // gunka
        name: 'UI Design Task',
        places: {
            x1: '@0x7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e', // Entity reference
            x2: 'UI Design',                                   // Leaf value (string)
            x3: 'Improve user experience'                      // Leaf value (string)
        }
    },
    
    // Boolean primitive (jetnu)
    {
        pubkey: '0xd2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
        schema: '@0x8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e', // jetnu
        places: {
            x1: true,                // Leaf value (boolean)
            x2: 'high priority task' // Leaf value (string)
        }
    },
    
    // Number primitive (namcu)
    {
        pubkey: '0xe4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3',
        schema: '@0x4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c', // namcu
        places: {
            x1: 5,               // Leaf value (number)
            x2: 'priority level' // Leaf value (string)
        }
    }
];
```

## Validation Examples

```typescript
// Example of validating an entity against its schema
const validationResult = validateEntity(
    entities[0], // Person entity
    schemata.find(s => s.pubkey === '0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d')
);

// Example of entity with wrong schema type
const wrongSchemaEntity = {
    pubkey: '0xbad1bad2bad3bad4bad5bad6bad7bad8bad9bad0',
    schema: '@0x7a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b', // gunka
    name: 'Invalid Task',
    places: {
        x1: '@0x0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0', // Not a prenu entity
        x2: 'Some task'
    }
};

// Validation would fail with:
// "Schema mismatch: x1 in gunka must reference a prenu entity"
```

## Schema Implementation Logic

The schema validation system implements these core principles:

1. **Native Lojban Logic** - Required vs. optional places follow Lojban predicate logic where x1 is typically required
2. **Composite/Leaf Flexibility** - The type field determines whether a place can accept entity references (composite) or primitive values (leaf)
3. **Type Validation** - Places can enforce specific types or allow multiple types
4. **Schema Validation** - Entity references can be restricted to specific schema types for type safety
5. **Custom Validations** - Additional constraints can be specified for leaf values (min/max for numbers, patterns for strings, etc.)
6. **Self-Documentation** - Schema definitions include full descriptions in both Lojban and translations

This approach allows for a powerful balance between flexibility and rigorous validation while staying true to Lojban's logical foundation.
````

## File: repomix.config.json
````json
{
  "output": {
    "filePath": "repomix-output.md",
    "style": "markdown",
    "parsableStyle": false,
    "fileSummary": true,
    "directoryStructure": true,
    "removeComments": false,
    "removeEmptyLines": true,
    "compress": false,
    "topFilesLength": 10,
    "showLineNumbers": false,
    "copyToClipboard": false,
    "git": {
      "sortByChanges": true,
      "sortByChangesMaxCommits": 100
    }
  },
  "include": [],
  "ignore": {
    "useGitignore": true,
    "useDefaultPatterns": true,
    "customPatterns": []
  },
  "security": {
    "enableSecurityCheck": true
  },
  "tokenCount": {
    "encoding": "o200k_base"
  }
}
````

## File: .cursor/rules/techstack.mdc
````
---
description: 
globs: 
alwaysApply: true
---
This repository uses the following techstack

- bun
- SvelteKit (use svelte5 syntax)
- Tailwind (always use inline syntax)
- Drizzle as ORM-Adapter to our neon postgres database
- BetterAuth for everything Auth / Account related
- Elysia as server on sveltekits api server route
- Eden Treaty as client for api interactions (never use fetch please!)
````

## File: src/db/constants.ts
````typescript
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
````

## File: src/lib/client/auth-hominio.ts
````typescript
import { createAuthClient } from "better-auth/svelte"
export const authClient = createAuthClient({
    baseURL: "http://localhost:5173",
})
````

## File: src/lib/docs/schemas/journalEntry.ts
````typescript
import { z } from 'zod';
/**
 * Journal Entry schema definition
 * 
 * Defines the structure and behavior of Journal entries in the Loro document
 */
const journalEntrySchema = {
    name: 'journalEntry',
    docName: 'journal',
    collectionName: 'entries',
    containerType: 'map', // Use a LoroMap
    schema: z.object({
        id: z.string().regex(/^[0-9a-f]{64}$/i, { message: "ID must be a valid pubKey format" }),
        title: z.string().min(1),
        content: z.string().min(1),
        mood: z.string().optional(),
        createdAt: z.number(),
        tags: z.array(z.string()).default([])
    })
};
// Export the type derived from the schema
export type JournalEntry = z.infer<typeof journalEntrySchema.schema>;
// Export the schema as default for auto-discovery
export default journalEntrySchema;
````

## File: src/lib/docs/schemas/todo.ts
````typescript
import { z } from 'zod';
/**
 * Todo schema definition
 * 
 * Defines the structure and behavior of Todo items in the Loro document
 */
const todoSchema = {
    name: 'todo',
    docName: 'todos',
    collectionName: 'todoItems',
    containerType: 'map', // Use a LoroMap
    schema: z.object({
        id: z.string().regex(/^[0-9a-f]{64}$/i, { message: "ID must be a valid pubKey format" }),
        text: z.string().min(1),
        completed: z.boolean().default(false),
        createdAt: z.number(),
        tags: z.array(z.string()),
        docId: z.string()
    })
};
// Export the type derived from the schema
export type TodoItem = z.infer<typeof todoSchema.schema>;
// Export the schema as default for auto-discovery
export default todoSchema;
````

## File: src/lib/docs/schemas/todoList.ts
````typescript
import { z } from 'zod';
/**
 * TodoList schema definition
 * 
 * Defines the structure and behavior of TodoList items in the Loro document
 */
const todoListSchema = {
    name: 'todoList',
    docName: 'todos',
    collectionName: 'todoLists',
    containerType: 'map', // Use a LoroMap
    schema: z.object({
        id: z.string().regex(/^[0-9a-f]{64}$/i, { message: "ID must be a valid pubKey format" }),
        name: z.string().min(1),
        createdAt: z.number(),
        numTodos: z.number().default(0)
    })
};
// Export the type derived from the schema
export type TodoList = z.infer<typeof todoListSchema.schema>;
// Export the schema as default for auto-discovery
export default todoListSchema;
````

## File: src/lib/KERNEL/docid-service.ts
````typescript
import { browser } from '$app/environment'; // Import browser for environment check
/**
 * Service for generating and managing document IDs
 * Uses pubKey-style IDs (hex format prefixed with 0x)
 */
export class DocIdService {
    /**
     * Generate a document ID using random bytes, prefixed with 0x
     * @returns A 0x-prefixed pubKey format document ID (e.g., 0xabc...def)
     */
    generateDocId(): string {
        // Generate a random ID of 32 bytes
        let randomBytes: Uint8Array;
        if (browser && window.crypto) {
            // Use browser's crypto API
            randomBytes = new Uint8Array(32);
            window.crypto.getRandomValues(randomBytes);
        } else {
            // Use Node.js crypto module (or fallback)
            try {
                // Attempt dynamic import for Node environments (might need adjustment based on build process)
                // For now, using Math.random as a simple cross-env fallback if window.crypto is absent
                console.warn('window.crypto not available. Using Math.random fallback for key generation.');
                randomBytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    randomBytes[i] = Math.floor(Math.random() * 256);
                }
            } catch (err) {
                console.error('Error during random byte generation fallback:', err);
                // Fallback to Math.random if any error occurs
                randomBytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    randomBytes[i] = Math.floor(Math.random() * 256);
                }
            }
        }
        // Convert to hex string and prepend 0x
        const hexString = Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return `0x${hexString}`;
    }
    /**
     * Check if a string appears to be a 0x-prefixed pubKey-format ID
     * @param id The ID to check
     * @returns True if the ID matches 0x-prefixed pubKey format
     */
    isPubKeyFormat(id: string): boolean {
        // pubKeys are 0x followed by 64 hex characters
        return /^0x[0-9a-f]{64}$/i.test(id);
    }
}
// Export a singleton instance
export const docIdService = new DocIdService();
````

## File: src/lib/KERNEL/hominio-capabilities.ts
````typescript
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
````

## File: src/lib/KERNEL/hominio-sync.ts
````typescript
import { writable, get } from 'svelte/store';
import { hominio } from '$lib/client/hominio';
import { hominioDB, type Docs } from '$lib/KERNEL/hominio-db';
import { getContentStorage, getDocsStorage } from '$lib/KERNEL/hominio-storage';
import { browser } from '$app/environment';
import { authClient } from '$lib/client/auth-hominio'; // Assumed path for auth client
import { canWrite, type CapabilityUser } from './hominio-capabilities'; // Import capabilities
// Helper type for API response structure
type ApiResponse<T> = {
    data: T;
    error: null | { status: number; value?: { message?: string;[key: string]: unknown }; };
};
// Expected raw structure from API before mapping
interface ServerDocData {
    pubKey: string;
    owner: string;
    updatedAt: Date | string;
    snapshotCid?: string | null;
    updateCids?: string[] | null;
}
// --- SyncStatus Interface --- 
interface SyncStatus {
    isSyncing: boolean;
    lastSynced: Date | null;
    syncError: string | null;
    pendingLocalChanges: number;
}
// --- Status Store --- 
const status = writable<SyncStatus>({
    isSyncing: false,
    lastSynced: null,
    syncError: null,
    pendingLocalChanges: 0
});
export class HominioSync {
    status = status; // Expose the store for the UI
    constructor() {
        console.log("HominioSync initialized.");
        if (browser) {
            this.updatePendingChangesCount();
        }
    }
    private setSyncStatus(isSyncing: boolean): void {
        status.update(s => ({ ...s, isSyncing }));
    }
    private setSyncError(error: string | null): void {
        status.update(s => ({ ...s, syncError: error }));
    }
    private async updatePendingChangesCount(): Promise<void> {
        try {
            const pendingDocs = await hominioDB.getDocumentsWithLocalChanges();
            status.update(s => ({ ...s, pendingLocalChanges: pendingDocs.length }));
        } catch (err) {
            console.error("Error updating pending changes count:", err);
        }
    }
    // --- Push Implementation --- 
    async pushToServer() {
        if (!browser) return;
        this.setSyncStatus(true);
        this.setSyncError(null); // Clear previous errors
        console.log('Starting push to server...');
        try {
            const localDocsToSync = await hominioDB.getDocumentsWithLocalChanges();
            if (localDocsToSync.length === 0) {
                console.log('No local changes to push to server.');
                return;
            }
            console.log(`Found ${localDocsToSync.length} documents with local changes to push.`);
            const contentStorage = getContentStorage();
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            for (const doc of localDocsToSync) {
                // *** Capability Check ***
                if (!canWrite(currentUser, doc)) {
                    console.warn(`Permission denied: Cannot push changes for doc ${doc.pubKey} owned by ${doc.owner}. Skipping.`);
                    continue; // Skip this document
                }
                // *** End Capability Check ***
                let docExistsOnServer = false;
                try {
                    // Check server existence
                    const checkResult = await hominio.api.docs({ pubKey: doc.pubKey }).get();
                    // Use optional chaining and check value for error message
                    docExistsOnServer = !(checkResult as ApiResponse<unknown>).error;
                } catch (err) {
                    // Assuming error means it doesn't exist, but log it
                    console.warn(`Error checking existence for ${doc.pubKey}, assuming does not exist:`, err);
                    docExistsOnServer = false;
                }
                let needsLocalUpdate = false;
                let syncedSnapshotCid: string | undefined = undefined;
                const syncedUpdateCids: string[] = [];
                // 1. Sync Snapshot if needed
                if (doc.localState?.snapshotCid) {
                    const localSnapshotCid = doc.localState.snapshotCid;
                    console.log(`  - Pushing local snapshot ${localSnapshotCid} for ${doc.pubKey}...`);
                    const snapshotData = await contentStorage.get(localSnapshotCid);
                    if (snapshotData) {
                        try {
                            if (!docExistsOnServer) {
                                // Create doc on server
                                // @ts-expect-error // Eden Treaty typing issue with base route POST
                                const createResult = await hominio.api.docs.post({
                                    pubKey: doc.pubKey,
                                    binarySnapshot: Array.from(snapshotData)
                                });
                                if (createResult.error) {
                                    throw new Error(`Server error creating doc: ${createResult.error.value?.message ?? 'Unknown error'}`);
                                }
                                docExistsOnServer = true; // Now it exists
                                console.log(`  - Created doc ${doc.pubKey} on server with snapshot.`);
                            } else {
                                // Update snapshot on existing doc
                                // @ts-expect-error // Eden Treaty typing issue with nested routes
                                const snapshotResult = await hominio.api.docs({ pubKey: doc.pubKey }).snapshot.post({
                                    binarySnapshot: Array.from(snapshotData)
                                });
                                if (snapshotResult.error && !(snapshotResult.error.value?.message?.includes('duplicate key'))) {
                                    throw new Error(`Server error updating snapshot: ${snapshotResult.error.value?.message ?? 'Unknown error'}`);
                                }
                                console.log(`  - Updated snapshot for ${doc.pubKey} on server.`);
                            }
                            // Mark snapshot as synced
                            syncedSnapshotCid = localSnapshotCid;
                            needsLocalUpdate = true;
                        } catch (err) {
                            console.error(`  - Error pushing snapshot ${localSnapshotCid}:`, err);
                            this.setSyncError(`Snapshot push failed for ${doc.pubKey}`);
                            // Continue to next doc if snapshot fails
                            continue;
                        }
                    } else {
                        console.warn(`  - Could not load local snapshot data for ${localSnapshotCid}`);
                    }
                }
                // 2. Sync Updates if needed (only if doc exists or was just created)
                if (docExistsOnServer && doc.localState?.updateCids && doc.localState.updateCids.length > 0) {
                    const localUpdateCids = [...doc.localState.updateCids]; // Copy array
                    console.log(`  - Pushing ${localUpdateCids.length} local updates for ${doc.pubKey}...`);
                    const updatesToUpload: Array<{ cid: string, type: string, binaryData: number[] }> = [];
                    for (const cid of localUpdateCids) {
                        const updateData = await contentStorage.get(cid);
                        if (updateData) {
                            updatesToUpload.push({
                                cid,
                                type: 'update',
                                binaryData: Array.from(updateData)
                            });
                        } else {
                            console.warn(`  - Could not load local update data for ${cid}`);
                        }
                    }
                    if (updatesToUpload.length > 0) {
                        try {
                            // Batch upload content first
                            // @ts-expect-error // Eden Treaty typing issue with nested batch routes
                            const contentResult = await hominio.api.content.batch.upload.post({ items: updatesToUpload });
                            if (contentResult.error) {
                                throw new Error(`Server error uploading update content: ${contentResult.error.value?.message ?? 'Unknown error'}`);
                            }
                            console.log(`  - Uploaded ${updatesToUpload.length} update content items.`);
                            // Batch register updates with document
                            // @ts-expect-error // Eden Treaty typing issue with nested batch routes
                            const registerResult = await hominio.api.docs({ pubKey: doc.pubKey }).update.batch.post({
                                updateCids: updatesToUpload.map(u => u.cid)
                            });
                            if (registerResult.error) {
                                throw new Error(`Server error registering updates: ${registerResult.error.value?.message ?? 'Unknown error'}`);
                            }
                            console.log(`  - Registered ${updatesToUpload.length} updates with doc ${doc.pubKey}.`);
                            // Mark updates as synced
                            syncedUpdateCids.push(...updatesToUpload.map(u => u.cid));
                            needsLocalUpdate = true;
                        } catch (err) {
                            console.error(`  - Error pushing updates for ${doc.pubKey}:`, err);
                            this.setSyncError(`Update push failed for ${doc.pubKey}`);
                            // If updates fail, we still might have succeeded with snapshot, don't skip local update
                        }
                    }
                }
                // 3. Update local state if anything was synced successfully
                if (needsLocalUpdate) {
                    try {
                        // Call the new method in hominioDB to handle state promotion
                        await hominioDB.updateDocStateAfterSync(doc.pubKey, {
                            snapshotCid: syncedSnapshotCid,
                            updateCids: syncedUpdateCids
                        });
                        console.log(`  - Updated local doc state for ${doc.pubKey} after sync.`);
                    } catch (err) {
                        console.error(`  - Failed to update local doc state for ${doc.pubKey}:`, err);
                        // Don't set sync error here, as server push might have succeeded
                    }
                }
            } // End loop over docs
            console.log('Push to server finished.');
        } catch (err) {
            console.error('Error during push to server process:', err);
            this.setSyncError(err instanceof Error ? err.message : 'Push to server failed');
        } finally {
            this.setSyncStatus(false);
            this.updatePendingChangesCount(); // Update count after sync attempt
        }
    }
    // --- Pull Implementation --- 
    // Based on legacy sync-service.ts
    /**
     * Check which content CIDs exist on the server (batch operation)
     */
    private async checkContentExistenceBatch(cids: string[]): Promise<Set<string>> {
        if (!cids.length) return new Set();
        try {
            // @ts-expect-error // Eden Treaty typing issue with nested batch routes
            const response = await hominio.api.content.batch.exists.post({ cids });
            if (response.error) {
                throw new Error(`Failed to check content existence: ${response.error.value?.message ?? 'Unknown error'}`);
            }
            const data = (response as ApiResponse<{ results: Array<{ cid: string, exists: boolean }> }>).data;
            const existingCids = new Set<string>();
            for (const result of data.results) {
                if (result.exists) {
                    existingCids.add(result.cid);
                }
            }
            return existingCids;
        } catch (error) {
            console.error('Error checking content existence:', error);
            throw error; // Re-throw to be handled by the caller
        }
    }
    /**
     * Sync multiple content items from server to local storage at once
     */
    private async syncContentBatchFromServer(
        contentItems: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }>
    ): Promise<void> {
        if (!contentItems || contentItems.length === 0) return;
        try {
            const contentStorage = getContentStorage();
            const allCids = contentItems.map(item => item.cid);
            // 1. Check which content we already have locally using the storage adapter
            const existingLocalCids = await contentStorage.batchExists(allCids);
            // 2. Filter to content we need to fetch
            const cidsToFetch = contentItems.filter(item => !existingLocalCids.has(item.cid))
                .map(item => item.cid);
            if (cidsToFetch.length === 0) {
                console.log('All required content already exists locally.');
                return;
            }
            console.log(`Fetching ${cidsToFetch.length} content items from server...`);
            // 3. Check which CIDs exist on server (redundant check? maybe remove if server GET /binary handles 404)
            const existingServerCids = await this.checkContentExistenceBatch(cidsToFetch);
            // 4. Fetch binary content for each existing CID
            const contentToSave: Array<{ key: string, value: Uint8Array, meta: Record<string, unknown> }> = [];
            for (const cid of existingServerCids) {
                try {
                    const contentItemMeta = contentItems.find(item => item.cid === cid)!;
                    // Use Eden client to get binary data
                    // @ts-expect-error // Eden Treaty typing issue with nested routes
                    const binaryResponse = await hominio.api.content({ cid }).binary.get();
                    if (binaryResponse.error) {
                        console.warn(`Error fetching binary data for ${cid}: ${binaryResponse.error.value?.message ?? 'Unknown error'}`);
                        continue;
                    }
                    const data = (binaryResponse as ApiResponse<{ binaryData: number[] }>).data;
                    if (data?.binaryData) {
                        const binaryData = new Uint8Array(data.binaryData);
                        contentToSave.push({
                            key: cid,
                            value: binaryData,
                            meta: { type: contentItemMeta.type, documentPubKey: contentItemMeta.docPubKey }
                        });
                    } else {
                        console.warn(`No binary data returned for CID ${cid}`);
                    }
                } catch (err) {
                    console.error(`Error processing content ${cid}:`, err);
                }
            }
            // 5. Save all fetched content to local storage in one batch
            if (contentToSave.length > 0) {
                await contentStorage.batchPut(contentToSave);
                console.log(`Saved ${contentToSave.length} content items to local storage.`);
            }
        } catch (err) {
            console.error(`Error syncing content batch:`, err);
            // Allow sync process to continue
        }
    }
    /**
     * Sync a single document from server to local storage
     * Returns true if the document was updated, false if no changes were made
     */
    private async syncDocFromServer(serverDoc: Docs, localDocs: Docs[]): Promise<boolean> {
        const docsStorage = getDocsStorage();
        console.log(`Syncing document ${serverDoc.pubKey} from server.`);
        const localDoc = localDocs.find(doc => doc.pubKey === serverDoc.pubKey);
        // Determine if an update is *actually* needed by comparing critical fields
        const needsUpdate = !localDoc ||
            serverDoc.snapshotCid !== localDoc.snapshotCid ||
            JSON.stringify(serverDoc.updateCids?.sort()) !== JSON.stringify(localDoc.updateCids?.sort()) ||
            serverDoc.owner !== localDoc.owner; // Ensure owner changes are reflected
        // updatedAt check might be too noisy, omitted for now
        if (!needsUpdate) {
            console.log(`Document ${serverDoc.pubKey} is already up-to-date locally.`);
            return false; // No changes made
        }
        // Prepare merged doc - start with server doc data
        const mergedDoc: Docs = { ...serverDoc };
        // If local doc exists, *only preserve local updates* (not local snapshot)
        if (localDoc?.localState?.updateCids && localDoc.localState.updateCids.length > 0) {
            // Initialize localState if it doesn't exist on mergedDoc yet
            if (!mergedDoc.localState) {
                mergedDoc.localState = {};
            }
            // Only copy updateCids. Discard localState.snapshotCid.
            mergedDoc.localState.updateCids = [...localDoc.localState.updateCids];
            console.log(`Preserved ${mergedDoc.localState.updateCids.length} local updates for ${serverDoc.pubKey}. Local snapshot was discarded.`);
        } else {
            // If no local updates to preserve, ensure localState is removed
            delete mergedDoc.localState;
        }
        // Save merged doc to local storage
        try {
            await docsStorage.put(serverDoc.pubKey, new TextEncoder().encode(JSON.stringify(mergedDoc)));
            console.log(`Saved merged state for doc ${serverDoc.pubKey} to local storage.`);
        } catch (saveErr) {
            console.error(`Failed to save merged doc ${serverDoc.pubKey} locally:`, saveErr);
            // If saving fails, we didn't truly update, return false
            return false;
        }
        // Collect content CIDs that need to be synced (snapshot + updates)
        const contentCidsToSync: Array<{ cid: string, type: 'snapshot' | 'update', docPubKey: string }> = [];
        if (serverDoc.snapshotCid) {
            contentCidsToSync.push({ cid: serverDoc.snapshotCid, type: 'snapshot', docPubKey: serverDoc.pubKey });
        }
        if (serverDoc.updateCids) {
            serverDoc.updateCids.forEach(cid => contentCidsToSync.push({ cid, type: 'update', docPubKey: serverDoc.pubKey }));
        }
        // Sync required content
        if (contentCidsToSync.length > 0) {
            await this.syncContentBatchFromServer(contentCidsToSync);
        }
        return true; // Document was updated locally
    }
    /**
     * Pull documents from server to local storage
     */
    async pullFromServer() {
        if (!browser) return;
        this.setSyncStatus(true);
        this.setSyncError(null);
        console.log('Starting pull from server...');
        try {
            const serverResult = await hominio.api.docs.list.get();
            if (serverResult.error) {
                let errorMessage = 'Unknown error fetching documents';
                const errorValue = serverResult.error.value;
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }
                throw new Error(`Failed to fetch documents: ${errorMessage}`);
            }
            const serverData = serverResult.data as unknown;
            if (!Array.isArray(serverData)) {
                throw new Error(`Failed to fetch documents: Invalid data format received (expected array)`);
            }
            // Map server data, potentially returning null for invalid entries
            const mappedData: (Docs | null)[] = serverData.map((element: unknown): Docs | null => {
                const dbDoc = element as ServerDocData;
                if (typeof dbDoc !== 'object' || dbDoc === null || typeof dbDoc.pubKey !== 'string' || typeof dbDoc.owner !== 'string') {
                    console.warn('Skipping invalid document data from server:', element);
                    return null;
                }
                let updatedAtString: string;
                if (dbDoc.updatedAt instanceof Date) {
                    updatedAtString = dbDoc.updatedAt.toISOString();
                } else if (typeof dbDoc.updatedAt === 'string') {
                    updatedAtString = dbDoc.updatedAt;
                } else {
                    console.warn(`Unexpected updatedAt type for doc ${dbDoc.pubKey}:`, typeof dbDoc.updatedAt);
                    updatedAtString = new Date().toISOString();
                }
                // Construct the Docs object
                const docResult: Docs = {
                    pubKey: dbDoc.pubKey,
                    owner: dbDoc.owner,
                    updatedAt: updatedAtString,
                    snapshotCid: dbDoc.snapshotCid ?? undefined,
                    updateCids: Array.isArray(dbDoc.updateCids) ? dbDoc.updateCids : [],
                    // localState is client-side only, ensure it's not added here
                };
                return docResult;
            });
            // Filter out nulls and assert the final type
            const serverDocs: Docs[] = mappedData.filter((doc): doc is Docs => doc !== null);
            console.log(`Retrieved and mapped ${serverDocs.length} documents from server`);
            const localDocs = get(hominioDB.docs);
            const updatedDocPubKeys: string[] = [];
            const oldUpdateCids = new Set<string>();
            localDocs.forEach(doc => {
                doc.updateCids?.forEach(cid => oldUpdateCids.add(cid));
                doc.localState?.updateCids?.forEach(cid => oldUpdateCids.add(cid));
            });
            // 3. Sync each server document to local storage
            for (const serverDoc of serverDocs) {
                // Pass localDocs array for comparison within syncDocFromServer
                const wasUpdated = await this.syncDocFromServer(serverDoc, localDocs);
                if (wasUpdated) {
                    updatedDocPubKeys.push(serverDoc.pubKey);
                }
            }
            // 4. Refresh the main docs store in hominioDB after all updates
            // This is simpler than updating one by one during the loop
            await hominioDB.loadAllDocs(); // Reload all docs from storage
            console.log(`Refreshed local document list.`);
            // --- Cleanup Logic Start ---
            // 4. Collect all update CIDs referenced *after* sync
            const refreshedLocalDocs = get(hominioDB.docs); // Get the latest state
            const stillReferencedCids = new Set<string>();
            refreshedLocalDocs.forEach(doc => {
                doc.updateCids?.forEach(cid => stillReferencedCids.add(cid));
                doc.localState?.updateCids?.forEach(cid => stillReferencedCids.add(cid));
            });
            // 5. Determine which old CIDs are no longer referenced
            const unreferencedUpdateCids = Array.from(oldUpdateCids).filter(
                cid => !stillReferencedCids.has(cid)
            );
            // 6. Delete unreferenced update CIDs from local content storage
            if (unreferencedUpdateCids.length > 0) {
                console.log(`Cleaning up ${unreferencedUpdateCids.length} unreferenced update CIDs from local storage...`);
                const contentStorage = getContentStorage();
                for (const cidToDelete of unreferencedUpdateCids) {
                    try {
                        // We only delete if it's an update, although snapshots shouldn't be in these lists anyway
                        // A check against content metadata might be needed in a more complex system
                        // For now, assume if it was in oldUpdateCids and not referenced, it's safe to delete
                        const deleted = await contentStorage.delete(cidToDelete);
                        if (deleted) {
                            console.log(`  - Deleted unreferenced update ${cidToDelete}`);
                        }
                    } catch (deleteErr) {
                        console.warn(`  - Failed to delete update ${cidToDelete}:`, deleteErr);
                    }
                }
                console.log(`Local update CID cleanup finished.`);
            }
            // --- Cleanup Logic End ---
            // 5. Set success status
            this.status.update(s => ({ ...s, lastSynced: new Date() }));
            console.log('Pull from server completed successfully.');
        } catch (err: unknown) { // Type the error
            console.error('Error during pull from server:', err);
            this.setSyncError(err instanceof Error ? err.message : 'Pull from server failed');
        } finally {
            this.setSyncStatus(false);
            this.updatePendingChangesCount();
        }
    }
    /**
     * Delete a document both locally and on the server
     * @param pubKey Document public key to delete
     * @returns True if successful
     */
    async deleteDocument(pubKey: string): Promise<boolean> {
        if (!browser) return false;
        this.setSyncStatus(true);
        this.setSyncError(null);
        console.log(`Deleting document ${pubKey} locally and on server...`);
        let serverDeleteSuccessful = false;
        let localDeleteSuccessful = false;
        try {
            // First try to delete on server
            try {
                serverDeleteSuccessful = await this.deleteDocumentOnServer(pubKey);
                console.log(`Server deletion ${serverDeleteSuccessful ? 'succeeded' : 'failed'}`);
            } catch (serverErr) {
                console.error('Server deletion error:', serverErr);
                // Continue with local delete even if server fails
            }
            // Then delete locally
            try {
                await hominioDB.deleteDocument(pubKey);
                localDeleteSuccessful = true;
                console.log('Local deletion succeeded');
            } catch (localErr) {
                console.error('Local deletion error:', localErr);
                throw localErr; // Re-throw local errors
            }
            // Consider the operation successful if at least one succeeded
            return serverDeleteSuccessful || localDeleteSuccessful;
        } catch (err) {
            this.setSyncError(err instanceof Error ? err.message : 'Document deletion failed');
            return false;
        } finally {
            this.setSyncStatus(false);
            this.updatePendingChangesCount();
        }
    }
    async deleteDocumentOnServer(pubKey: string): Promise<boolean> {
        if (!browser) return false;
        this.setSyncStatus(true);
        this.setSyncError(null);
        console.log(`Requesting document deletion from server for ${pubKey}...`);
        try {
            // Call the server's delete endpoint
            // @ts-expect-error Eden Treaty typing issue with dynamic routes
            const result = await hominio.api.docs({ pubKey }).delete();
            const response = result as ApiResponse<{ success: boolean; message?: string }>;
            if (response.error) {
                let errorMessage = 'Unknown error deleting document';
                const errorValue = response.error.value;
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }
                throw new Error(`Server error deleting document: ${errorMessage}`);
            }
            if (response.data?.success) {
                console.log(`Server successfully deleted document ${pubKey}: ${response.data.message || ''}`);
                return true;
            } else {
                throw new Error(`Server failed to delete document: ${response.data?.message || 'Unknown reason'}`);
            }
        } catch (err: unknown) {
            console.error(`Error deleting document ${pubKey}:`, err);
            this.setSyncError(err instanceof Error ? err.message : 'Document deletion failed');
            throw err;
        } finally {
            this.setSyncStatus(false);
        }
    }
    async createConsolidatedSnapshot(): Promise<void> {
        const selected = get(hominioDB.selectedDoc);
        if (!selected?.pubKey) {
            this.setSyncError("No document selected to create snapshot for.");
            return;
        }
        const pubKey = selected.pubKey;
        console.log(`Requesting SERVER consolidated snapshot creation for ${pubKey}...`);
        this.setSyncStatus(true);
        this.setSyncError(null);
        try {
            // Call the server endpoint FIRST
            // @ts-expect-error // Eden Treaty typing issue with nested routes
            const result = await hominio.api.docs({ pubKey }).snapshot.create.post({});
            const response = result as ApiResponse<{ success: boolean; message?: string; newSnapshotCid?: string;[key: string]: unknown }>;
            if (response.error) {
                let errorMessage = 'Unknown server error creating snapshot';
                const errorValue = response.error.value;
                if (typeof errorValue === 'object' && errorValue !== null && 'message' in errorValue && typeof errorValue.message === 'string') {
                    errorMessage = errorValue.message;
                }
                throw new Error(`Server error creating snapshot: ${errorMessage}`);
            }
            if (response.data?.success) {
                console.log(`Server successfully created snapshot ${response.data.newSnapshotCid || ''} for ${pubKey}.`);
                // Local state is now stale - DO NOT update it manually here.
                // Rely on pullFromServer to get the correct state.
                // Trigger a pull AFTER successful server snapshot
                console.log('Triggering pull to refresh final state...');
                await this.pullFromServer();
            } else {
                throw new Error(`Server failed to create snapshot: ${response.data?.message || 'Unknown reason'}`);
            }
        } catch (err: unknown) { // Type the error
            console.error(`Error creating consolidated snapshot for ${pubKey}:`, err);
            this.setSyncError(err instanceof Error ? err.message : 'Snapshot creation failed');
        } finally {
            this.setSyncStatus(false);
        }
    }
    destroy() { console.log('HominioSync destroyed'); }
}
export const hominioSync = new HominioSync();
````

## File: src/lib/KERNEL/loroAPI.ts
````typescript
import { writable, get, type Writable } from 'svelte/store';
import type { ZodType } from 'zod';
import { docIdService } from './docid-service';
// Import types directly, but not the implementation yet
import type {
    LoroDoc as LoroDocType,
    LoroMap as LoroMapType,
    LoroList as LoroListType,
    LoroText as LoroTextType,
    LoroTree as LoroTreeType,
    LoroMovableList as LoroMovableListType,
    LoroCounter as LoroCounterType,
    Value,
    ExportMode
} from 'loro-crdt';
/**
 * Schema definition interface
 */
export interface SchemaDefinition {
    name: string;
    docName: string;
    collectionName: string;
    containerType?: 'map' | 'list' | 'text' | 'tree' | 'movableList';
    validator?: ZodType<unknown>;
}
// --- Store Loro classes once loaded --- 
let LoroDoc: typeof LoroDocType | null = null;
let LoroMap: typeof LoroMapType | null = null;
let LoroList: typeof LoroListType | null = null;
let LoroText: typeof LoroTextType | null = null;
let LoroTree: typeof LoroTreeType | null = null;
let LoroMovableList: typeof LoroMovableListType | null = null;
// let LoroCounter: typeof LoroCounterType | null = null; // Counter not used in generateOperations yet
/**
 * LoroAPI provides a unified interface for working with Loro documents and collections.
 * It abstracts away the complexity of managing Loro instances and provides a consistent
 * API for CRUD operations across different container types.
 */
export class LoroAPI {
    private static instance: LoroAPI;
    private docRegistry = new Map<string, LoroDocType>();
    private schemaRegistry = new Map<string, SchemaDefinition>();
    private storeRegistry = new Map<string, Writable<[string, unknown][]>>();
    private operationsCache = new Map<string, Record<string, unknown>>();
    private isLoroLoaded = false;
    private updateQueue = new Map<string, Promise<void>>();
    private lastUpdateTime = new Map<string, number>();
    /**
     * Private constructor for singleton pattern
     */
    private constructor() { }
    /**
     * Get the singleton instance of LoroAPI
     */
    static getInstance(): LoroAPI {
        if (!LoroAPI.instance) {
            LoroAPI.instance = new LoroAPI();
        }
        return LoroAPI.instance;
    }
    /**
     * Dynamically load the Loro classes from the 'loro-crdt' module
     */
    private async loadLoroIfNeeded(): Promise<void> {
        if (!this.isLoroLoaded) {
            try {
                const loroModule = await import('loro-crdt');
                // Assign loaded classes to module-level variables
                LoroDoc = loroModule.LoroDoc;
                LoroMap = loroModule.LoroMap;
                LoroList = loroModule.LoroList;
                LoroText = loroModule.LoroText;
                LoroTree = loroModule.LoroTree;
                LoroMovableList = loroModule.LoroMovableList;
                // LoroCounter = loroModule.LoroCounter;
                this.isLoroLoaded = true;
                console.log("✅ Loro classes loaded successfully.");
            } catch (err) {
                console.error("❌ Failed to load Loro WASM module:", err);
                throw new Error("Loro CRDT module failed to load.");
            }
        }
        // Ensure essential classes are loaded
        if (!LoroDoc || !LoroMap || !LoroList /* Add others if needed */) {
            throw new Error("Essential Loro classes not available after loading attempt.");
        }
    }
    /**
     * Register a schema with the API
     * @param schema Schema definition object
     * @returns Generated operations for the schema
     */
    async registerSchema(schema: SchemaDefinition) {
        this.schemaRegistry.set(schema.name, schema);
        const operations = await this.generateOperations(schema);
        this.operationsCache.set(schema.name, operations);
        return operations;
    }
    /**
     * Get the operations for a schema
     * @param schemaName Name of the schema
     * @returns Generated operations for the schema
     */
    async getOperations<T>(schemaName: string) {
        await this.loadLoroIfNeeded();
        if (!this.operationsCache.has(schemaName)) {
            const schema = this.schemaRegistry.get(schemaName);
            if (!schema) throw new Error(`Schema not found: ${schemaName}`);
            const operations = await this.generateOperations(schema);
            this.operationsCache.set(schemaName, operations);
            return operations as {
                create: (data: Partial<T>) => Promise<string>;
                get: (id: string) => T | null;
                update: (id: string, data: Partial<T>) => Promise<boolean>;
                delete: (id: string) => Promise<boolean>;
                query: (predicate: (item: T) => boolean) => [string, T][];
                store: Writable<[string, T][]>;
                doc: LoroDocType;
                collection: LoroMapType<Record<string, unknown>> | LoroListType<unknown> | Value;
            };
        }
        return this.operationsCache.get(schemaName) as {
            create: (data: Partial<T>) => Promise<string>;
            get: (id: string) => T | null;
            update: (id: string, data: Partial<T>) => Promise<boolean>;
            delete: (id: string) => Promise<boolean>;
            query: (predicate: (item: T) => boolean) => [string, T][];
            store: Writable<[string, T][]>;
            doc: LoroDocType;
            collection: LoroMapType<Record<string, unknown>> | LoroListType<unknown> | Value;
        };
    }
    /**
     * Get or create a Loro document (now async due to dynamic import)
     * @param docName Name of the document
     * @returns Promise resolving to LoroDoc instance
     */
    async getDoc(docName: string): Promise<LoroDocType> {
        await this.loadLoroIfNeeded(); // Ensure Loro is loaded
        if (!LoroDoc) { // Check again after await
            throw new Error("LoroDoc class not available.");
        }
        if (!this.docRegistry.has(docName)) {
            const doc = new LoroDoc(); // Use the loaded class
            this.docRegistry.set(docName, doc);
            // Set up subscription to update stores when doc changes
            doc.subscribe(() => {
                // Schedule an update for all schemas using this doc
                this.scheduleDocUpdates(docName);
            });
        }
        return this.docRegistry.get(docName)!;
    }
    /**
     * Schedule updates for all schemas using a particular doc
     * This batches updates to prevent excessive store updates
     */
    private scheduleDocUpdates(docName: string): void {
        // Find all schemas that use this doc
        const relevantSchemas = Array.from(this.schemaRegistry.entries())
            .filter(([_, schema]) => schema.docName === docName)
            .map(([name]) => name);
        // Schedule updates for all relevant schemas
        relevantSchemas.forEach(schemaName => {
            this.scheduleStoreUpdate(schemaName);
        });
    }
    /**
     * Schedule a store update with debouncing
     * This prevents too many rapid updates when there are many changes
     */
    private scheduleStoreUpdate(schemaName: string): void {
        const now = Date.now();
        const lastUpdate = this.lastUpdateTime.get(schemaName) || 0;
        const timeSinceLastUpdate = now - lastUpdate;
        // If we have a pending update and it's been less than 50ms, don't schedule a new one
        if (this.updateQueue.has(schemaName) && timeSinceLastUpdate < 50) {
            return;
        }
        // If we already have an update pending, just let it complete
        if (this.updateQueue.has(schemaName)) {
            return;
        }
        // Schedule a new update
        const updatePromise = new Promise<void>(resolve => {
            setTimeout(async () => {
                try {
                    await this.updateStore(schemaName);
                } catch (err) {
                    console.error(`Error updating store for ${schemaName}:`, err);
                } finally {
                    this.updateQueue.delete(schemaName);
                    this.lastUpdateTime.set(schemaName, Date.now());
                    resolve();
                }
            }, Math.max(0, 50 - timeSinceLastUpdate)); // Add slight delay for batching
        });
        this.updateQueue.set(schemaName, updatePromise);
    }
    /**
     * Get or create a Map container
     * @param docName Name of the document
     * @param mapName Name of the map
     * @returns LoroMap instance
     */
    async getMap<T extends Record<string, unknown> = Record<string, unknown>>(docName: string, mapName: string): Promise<LoroMapType<T>> {
        const doc = await this.getDoc(docName);
        // No need to check LoroMap here, getDoc ensures loading
        return doc.getMap(mapName) as unknown as LoroMapType<T>;
    }
    /**
     * Get or create a List container
     * @param docName Name of the document
     * @param listName Name of the list
     * @returns LoroList instance
     */
    async getList<T>(docName: string, listName: string): Promise<LoroListType<T>> {
        const doc = await this.getDoc(docName);
        return doc.getList(listName) as unknown as LoroListType<T>;
    }
    /**
     * Get or create a Text container
     * @param docName Name of the document
     * @param textName Name of the text
     * @returns LoroText instance
     */
    async getText(docName: string, textName: string): Promise<LoroTextType> {
        const doc = await this.getDoc(docName);
        return doc.getText(textName);
    }
    /**
     * Get or create a Tree container
     * @param docName Name of the document
     * @param treeName Name of the tree
     * @returns LoroTree instance
     */
    async getTree<T extends Record<string, unknown> = Record<string, unknown>>(docName: string, treeName: string): Promise<LoroTreeType<T>> {
        const doc = await this.getDoc(docName);
        return doc.getTree(treeName) as unknown as LoroTreeType<T>;
    }
    /**
     * Get or create a MovableList container
     * @param docName Name of the document
     * @param listName Name of the list
     * @returns LoroMovableList instance
     */
    async getMovableList<T>(docName: string, listName: string): Promise<LoroMovableListType<T>> {
        const doc = await this.getDoc(docName);
        return doc.getMovableList(listName) as unknown as LoroMovableListType<T>;
    }
    /**
     * Get or create a Counter
     * @param docName Name of the document
     * @param counterName Name of the counter
     * @returns LoroCounter instance
     */
    async getCounter(docName: string, counterName: string): Promise<LoroCounterType> {
        const doc = await this.getDoc(docName);
        return doc.getCounter(counterName);
    }
    /**
     * Export a document to binary format
     * @param docName Name of the document
     * @param options Export options
     * @returns Uint8Array of the exported document
     */
    async exportDoc(docName: string, options?: { mode: ExportMode }): Promise<Uint8Array> {
        const doc = await this.getDoc(docName);
        return doc.export(options?.mode || 'snapshot');
    }
    /**
     * Import data into a document
     * @param docName Name of the document
     * @param data Data to import
     */
    async importDoc(docName: string, data: Uint8Array): Promise<void> {
        const doc = await this.getDoc(docName);
        doc.import(data);
        // Make sure stores update after importing data
        this.scheduleDocUpdates(docName);
    }
    /**
     * Auto-discover schemas from the schemas directory
     * @returns List of registered schema names
     */
    async discoverSchemas() {
        const schemaModules = import.meta.glob('../docs/schemas/*.ts');
        const registeredSchemas: string[] = [];
        for (const path in schemaModules) {
            try {
                const module = await schemaModules[path]() as { default: SchemaDefinition };
                if (module.default) {
                    await this.registerSchema(module.default);
                    registeredSchemas.push(module.default.name);
                }
            } catch (error) {
                console.error(`Failed to load schema from ${path}:`, error);
            }
        }
        return registeredSchemas;
    }
    /**
     * Generate CRUD operations for a schema
     * @param schema Schema definition
     * @returns Object with CRUD operations
     */
    private async generateOperations(schema: SchemaDefinition): Promise<Record<string, unknown>> {
        const docName = schema.docName;
        const collectionName = schema.collectionName;
        const schemaName = schema.name;
        const containerType = schema.containerType || 'map';
        // Ensure Loro classes are loaded before proceeding
        await this.loadLoroIfNeeded();
        if (!LoroMap || !LoroList) { // Check for required classes
            throw new Error("Required Loro classes (Map, List) not loaded.");
        }
        let collection: any;
        const doc = await this.getDoc(docName);
        switch (containerType) {
            case 'map':
                collection = await this.getMap(docName, collectionName);
                break;
            case 'list':
                collection = await this.getList(docName, collectionName);
                break;
            case 'text':
                collection = await this.getText(docName, collectionName);
                break;
            case 'tree':
                collection = await this.getTree(docName, collectionName);
                break;
            case 'movableList':
                collection = await this.getMovableList(docName, collectionName);
                break;
            default:
                collection = await this.getMap(docName, collectionName); // Default to map
        }
        if (!this.storeRegistry.has(schemaName)) {
            this.storeRegistry.set(schemaName, writable<[string, unknown][]>([]));
            await this.updateStore(schemaName);
        }
        const store = this.storeRegistry.get(schemaName)!;
        // Check collection type using a more reliable method
        if ('set' in collection && 'get' in collection && 'delete' in collection && 'entries' in collection) {
            // This is a map-like collection
            const mapCollection = collection as LoroMapType<Record<string, unknown>>;
            return {
                create: async (data: Record<string, unknown>) => {
                    const id = (data.id as string) || docIdService.generateDocId();
                    const fullData = { ...data, id };
                    mapCollection.set(id, fullData as unknown as Value);
                    this.scheduleStoreUpdate(schemaName);
                    return id;
                },
                get: (id: string) => {
                    return mapCollection.get(id) as unknown;
                },
                update: async (id: string, data: Partial<Record<string, unknown>>) => {
                    const existing = mapCollection.get(id);
                    if (!existing) return false;
                    mapCollection.set(id, { ...existing as object, ...data } as unknown as Value);
                    this.scheduleStoreUpdate(schemaName);
                    return true;
                },
                delete: async (id: string) => {
                    if (mapCollection.get(id) !== undefined) {
                        mapCollection.delete(id);
                        this.scheduleStoreUpdate(schemaName);
                        return true;
                    }
                    return false;
                },
                query: (predicate: (item: Record<string, unknown>) => boolean) => {
                    const items = get(store) as [string, Record<string, unknown>][];
                    return items.filter(([, item]) => predicate(item));
                },
                store,
                doc,
                collection: mapCollection
            };
        } else if ('insert' in collection && 'toArray' in collection) {
            // This is a list-like collection
            const listCollection = collection as LoroListType<unknown>;
            console.warn(`List operations need implementation in generateOperations`);
            return {
                create: async (data: Record<string, unknown>) => {
                    listCollection.insert(listCollection.length, data as Value);
                    this.scheduleStoreUpdate(schemaName);
                    return data.id as string || 'temp-list-id';
                },
                get: (id: string) => {
                    return listCollection.toArray().find((item: any) => item?.id === id) || null;
                },
                update: async (id: string, data: Record<string, unknown>) => {
                    console.warn('List update not implemented', id, data);
                    return false;
                },
                delete: async (id: string) => {
                    console.warn('List delete not implemented', id);
                    return false;
                },
                query: (predicate: (item: Record<string, unknown>) => boolean) => {
                    const items = get(store) as [string, Record<string, unknown>][];
                    return items.filter(([, item]) => predicate(item));
                },
                store,
                doc,
                collection: listCollection
            };
        }
        else if ('toString' in collection && 'delete' in collection && 'insert' in collection) {
            // This is a text-like collection
            const textCollection = collection as LoroTextType;
            console.warn(`Text operations need implementation in generateOperations`);
            return {
                get: () => textCollection.toString(),
                update: async (newText: string) => {
                    textCollection.delete(0, textCollection.length);
                    textCollection.insert(0, newText);
                    this.scheduleStoreUpdate(schemaName);
                    return true;
                },
                store, doc, collection: textCollection
            };
        }
        else {
            console.warn(`Operations not fully implemented for container type: ${typeof collection}`);
            return { store, doc, collection };
        }
    }
    /**
     * Update a store with the latest data from its collection
     * @param schemaName Name of the schema
     */
    private async updateStore(schemaName: string) {
        await this.loadLoroIfNeeded();
        const schema = this.schemaRegistry.get(schemaName);
        if (!schema) return;
        const containerType = schema.containerType || 'map';
        const docName = schema.docName;
        const collectionName = schema.collectionName;
        const store = this.storeRegistry.get(schemaName);
        if (!store) return;
        try {
            if (containerType === 'map') {
                const collection = await this.getMap(docName, collectionName);
                const entries = [...collection.entries()].map(([key, value]) => {
                    return [String(key), value] as [string, unknown];
                });
                store.set(entries);
            } else if (containerType === 'list') {
                const collection = await this.getList(docName, collectionName);
                const items = collection.toArray().map((item, index) => {
                    const key = item && typeof item === 'object' && 'id' in item
                        ? String(item.id)
                        : `${index}`;
                    return [key, item] as [string, unknown];
                });
                store.set(items);
            } else if (containerType === 'text') {
                const collection = await this.getText(docName, collectionName);
                store.set([['content', collection.toString()]]);
            } else {
                console.warn(`Store update not implemented for container type ${containerType}`);
            }
            // Force a reactive update by getting current value and setting it again
            // This helps ensure that Svelte detects the changes
            const currentValue = get(store);
            store.update(val => {
                // Create a new array reference to trigger Svelte's reactivity
                return [...currentValue];
            });
            // Log update (useful for debugging)
            console.debug(`Updated store for schema: ${schemaName} - ${get(store).length} items`);
        } catch (err) {
            console.error(`Error updating store for ${schemaName}:`, err);
        }
    }
    /**
     * Public method to force an update of a schema's store
     * This is useful when directly manipulating the document
     * @param schemaName Name of the schema to update
     */
    async updateStoreForSchema(schemaName: string): Promise<void> {
        return this.updateStore(schemaName);
    }
    /**
     * Generic update helper that handles the common pattern of updating an item in a map
     * This provides a more reliable way to update items than the generic operations
     * @param schemaName Name of the schema
     * @param id ID of the item to update
     * @param updateFn Function that returns the updated item
     * @returns Whether the update was successful
     */
    async updateItem<T>(schemaName: string, id: string, updateFn: (currentItem: T) => T): Promise<boolean> {
        await this.loadLoroIfNeeded();
        const { schema, map } = await this.getSchemaDetails(schemaName);
        if (schema.containerType !== 'map' && schema.containerType !== undefined) {
            console.warn(`updateItem only supports map container types currently`);
            return false;
        }
        if (!('set' in map) || !('get' in map)) {
            console.error("Cannot update item: Collection is not a map-like object");
            return false;
        }
        const currentItem = map.get(id) as unknown as T;
        if (currentItem === undefined) return false;
        const updatedItem = updateFn(currentItem);
        map.set(id, updatedItem as unknown as Value);
        this.scheduleStoreUpdate(schemaName);
        return true;
    }
    /**
     * Generic delete helper that handles the common pattern of deleting an item from a map
     * This provides a more reliable way to delete items than the generic operations
     * @param schemaName Name of the schema
     * @param id ID of the item to delete
     * @returns Whether the deletion was successful
     */
    async deleteItem(schemaName: string, id: string): Promise<boolean> {
        await this.loadLoroIfNeeded();
        const { schema, map } = await this.getSchemaDetails(schemaName);
        if (schema.containerType !== 'map' && schema.containerType !== undefined) {
            console.warn(`deleteItem only supports map container types currently`);
            return false;
        }
        if (!('delete' in map) || !('get' in map)) {
            console.error("Cannot delete item: Collection is not a map-like object");
            return false;
        }
        if (map.get(id) === undefined) return false;
        map.delete(id);
        this.scheduleStoreUpdate(schemaName);
        return true;
    }
    /**
     * Generic create helper that handles the common pattern of creating an item in a map
     * This provides a more reliable way to create items than the generic operations
     * @param schemaName Name of the schema
     * @param item Item to create (should include an id field)
     * @returns The ID of the created item, or null if creation failed
     */
    async createItem<T extends { id?: string }>(schemaName: string, item: T): Promise<string | null> {
        await this.loadLoroIfNeeded();
        const { schema, map } = await this.getSchemaDetails(schemaName);
        if (schema.containerType !== 'map' && schema.containerType !== undefined) {
            console.warn(`createItem only supports map container types currently`);
            return null;
        }
        if (!('set' in map)) {
            console.error("Cannot create item: Collection is not a map-like object");
            return null;
        }
        const id = item.id || docIdService.generateDocId();
        const itemWithId = { ...item, id };
        map.set(id, itemWithId as unknown as Value);
        this.scheduleStoreUpdate(schemaName);
        return id;
    }
    /**
     * Get schema details, document and map collection for a schema
     * This is a helper method to avoid hardcoded imports in tool functions
     * @param schemaName Name of the schema
     * @returns Object with schema info, document and map
     */
    async getSchemaDetails(schemaName: string): Promise<{
        schema: SchemaDefinition;
        doc: LoroDocType;
        map: any;
    }> {
        await this.loadLoroIfNeeded();
        const schema = this.schemaRegistry.get(schemaName);
        if (!schema) {
            throw new Error(`Schema not found: ${schemaName}`);
        }
        if (schema.containerType !== 'map' && schema.containerType !== undefined) {
            throw new Error(`getSchemaDetails currently only supports map types, requested for ${schemaName} which is ${schema.containerType}`);
        }
        const doc = await this.getDoc(schema.docName);
        const map = await this.getMap(schema.docName, schema.collectionName);
        return { schema, doc, map };
    }
    /**
     * Find an item by various criteria in a schema collection
     * @param schemaName Name of the schema to search in
     * @param criteria Search criteria
     * @returns Found item ID and data, or null if not found
     */
    async findItem<T>(
        schemaName: string,
        criteria: {
            id?: string;
            searchField?: keyof T;
            searchValue?: string;
            exactMatch?: boolean;
        }
    ): Promise<[string, T] | null> {
        await this.loadLoroIfNeeded();
        // Get operations for this schema
        const ops = await this.getOperations<T>(schemaName);
        try {
            if (criteria.id) {
                const item = ops.get(criteria.id);
                if (item) {
                    return [criteria.id, item];
                }
            }
            if (criteria.searchField && criteria.searchValue) {
                const fieldName = criteria.searchField as string;
                const searchValue = criteria.searchValue.toLowerCase();
                const exactMatch = criteria.exactMatch ?? false;
                const matchingItems = ops.query(item => {
                    if (!item || typeof item !== 'object') return false;
                    const itemAsRecord = item as Record<string, unknown>;
                    const fieldValue = itemAsRecord[fieldName];
                    if (typeof fieldValue !== 'string') return false;
                    const lowerFieldValue = fieldValue.toLowerCase();
                    return exactMatch ? lowerFieldValue === searchValue : lowerFieldValue.includes(searchValue);
                });
                if (matchingItems.length === 1) {
                    return matchingItems[0];
                } else if (matchingItems.length > 1 && !exactMatch) {
                    // Try exact match among the multiple results
                    const exactMatches = matchingItems.filter(([, item]) => {
                        if (!item || typeof item !== 'object') return false;
                        const itemAsRecord = item as Record<string, unknown>;
                        const fieldValue = itemAsRecord[fieldName];
                        return typeof fieldValue === 'string' && fieldValue.toLowerCase() === searchValue;
                    });
                    if (exactMatches.length === 1) {
                        return exactMatches[0];
                    }
                }
                if (matchingItems.length > 0) {
                    console.warn(`Multiple items found for criteria in ${schemaName}, returning null.`);
                    return null;
                }
            }
        } catch (error) {
            console.error(`Error in findItem for ${schemaName}:`, error);
        }
        return null;
    }
}
// DO NOT export a pre-created instance:
// export const loroAPI = LoroAPI.getInstance(); 
// Instead, allow consumers to get the instance when needed:
export function getLoroAPIInstance(): LoroAPI {
    return LoroAPI.getInstance();
}
````

## File: src/lib/server/routes/content.ts
````typescript
import { Elysia } from 'elysia';
import { db } from '$db';
import { content } from '$db/schema';
import { eq, inArray } from 'drizzle-orm';
import { hashService } from '$lib/KERNEL/hash-service';
// Types
interface AuthContext {
    session: {
        user: {
            id: string;
            [key: string]: unknown;
        }
    },
    body?: unknown,
    set?: {
        status?: number;
    },
    params?: unknown,
    query?: unknown
}
// Define type for content response
type ContentResponse = {
    cid: string;
    type: string;
    metadata: Record<string, unknown>;
    hasBinaryData: boolean;
    contentLength: number;
    verified: boolean;
    createdAt: string;
    binaryData?: number[];
};
// Content-related helper functions
async function getContentByCid(cid: string): Promise<ContentResponse | null> {
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));
        if (!contentItem.length) {
            return null;
        }
        const item = contentItem[0];
        // Get binary data and metadata
        const binaryData = item.raw as Buffer;
        const metadata = item.metadata as Record<string, unknown> || {};
        // Verify content integrity
        let verified = false;
        if (binaryData && binaryData.length > 0) {
            try {
                // Verify hash matches CID using binary data directly
                verified = await hashService.verifySnapshot(binaryData, cid);
            } catch (err) {
                console.error('Error verifying content hash:', err);
            }
        }
        // Return content with verification status
        return {
            cid: item.cid,
            type: item.type,
            metadata,
            hasBinaryData: binaryData.length > 0,
            contentLength: binaryData.length,
            verified,
            createdAt: item.createdAt.toISOString()
        };
    } catch (error) {
        console.error('Error retrieving content:', error);
        return null;
    }
}
// Function to get raw binary data by CID
async function getBinaryContentByCid(cid: string): Promise<Buffer | null> {
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));
        if (!contentItem.length) {
            return null;
        }
        // Return raw binary data
        return contentItem[0].raw as Buffer;
    } catch (error) {
        console.error('Error retrieving binary content:', error);
        return null;
    }
}
// Create content handlers without prefix
export const contentHandlers = new Elysia()
    // List all content
    .get('/list', async () => {
        // Get all content items
        return await db.select().from(content);
    })
    // Get specific content by CID
    .get('/:cid', async ({ params, set }: AuthContext) => {
        try {
            const cid = (params as { cid: string }).cid;
            const contentData = await getContentByCid(cid);
            if (!contentData) {
                if (set) set.status = 404;
                return { error: 'Content not found' };
            }
            return contentData;
        } catch (error) {
            console.error('Error retrieving content:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to retrieve content',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
// Batch operations for efficient sync
contentHandlers.group('/batch', app => app
    // Check existence of multiple CIDs at once
    .post('/exists', async ({ body, set }: AuthContext) => {
        try {
            const { cids } = body as { cids: string[] };
            if (!Array.isArray(cids) || cids.length === 0) {
                if (set) set.status = 400;
                return { error: 'Invalid request. Array of CIDs required.' };
            }
            // Get unique cids only
            const uniqueCids = [...new Set(cids)];
            // Find which content items exist
            const existingItems = await db
                .select({ cid: content.cid })
                .from(content)
                .where(inArray(content.cid, uniqueCids));
            // Create a map of which CIDs exist
            const existingCids = new Set(existingItems.map(item => item.cid));
            const results = uniqueCids.map(cid => ({
                cid,
                exists: existingCids.has(cid)
            }));
            return { results };
        } catch (error) {
            console.error('Error checking batch existence:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to check content existence',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    // Upload multiple content items at once
    .post('/upload', async ({ body, set }: AuthContext) => {
        try {
            const { items } = body as {
                items: Array<{
                    cid: string,
                    type: 'snapshot' | 'update',
                    binaryData: number[],
                    metadata?: Record<string, unknown>
                }>
            };
            if (!Array.isArray(items) || items.length === 0) {
                if (set) set.status = 400;
                return { error: 'Invalid request. Array of content items required.' };
            }
            // Get unique items by CID
            const uniqueItems = items.filter((item, index, self) =>
                index === self.findIndex(t => t.cid === item.cid)
            );
            // Check which items already exist
            const cids = uniqueItems.map(item => item.cid);
            const existingItems = await db
                .select({ cid: content.cid })
                .from(content)
                .where(inArray(content.cid, cids));
            const existingCids = new Set(existingItems.map(item => item.cid));
            // Filter to only new items that don't exist yet
            const newItems = uniqueItems.filter(item => !existingCids.has(item.cid));
            if (newItems.length === 0) {
                return {
                    success: true,
                    message: 'All items already exist',
                    uploaded: 0,
                    total: uniqueItems.length
                };
            }
            // Insert new content items
            const contentEntries = newItems.map(item => ({
                cid: item.cid,
                type: item.type,
                raw: Buffer.from(new Uint8Array(item.binaryData)),
                metadata: item.metadata || {},
                createdAt: new Date()
            }));
            await db.insert(content).values(contentEntries);
            return {
                success: true,
                message: `Uploaded ${newItems.length} new content items`,
                uploaded: newItems.length,
                total: uniqueItems.length
            };
        } catch (error) {
            console.error('Error uploading batch content:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to upload content batch',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
);
// Binary data endpoint
contentHandlers.group('/:cid/binary', app => app
    .get('/', async ({ params, set }: AuthContext) => {
        try {
            const cid = (params as { cid: string }).cid;
            const binaryData = await getBinaryContentByCid(cid);
            if (!binaryData) {
                if (set) set.status = 404;
                return { error: 'Binary content not found' };
            }
            // Return in a format that can be transported over JSON
            return {
                cid,
                binaryData: Array.from(binaryData) // Convert to array for transport
            };
        } catch (error) {
            console.error('Error retrieving binary content:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to retrieve binary content',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
);
export default contentHandlers;
````

## File: src/lib/tools/switchAgent/function.ts
````typescript
// Implementation for the switchAgent tool
import type { ToolParameters } from '$lib/ultravox/types';
import { currentAgent } from '$lib/ultravox/agents';
import { createAgentStageChangeData, getActiveVibe } from '$lib/ultravox/stageManager';
import type { AgentName } from '$lib/ultravox/types';
export async function switchAgentImplementation(parameters: ToolParameters): Promise<Record<string, unknown>> {
    console.log('🔄 switchAgent tool called with parameters:', parameters);
    try {
        // Extract the requested agent name
        const { agentName = 'Hominio' } = parameters as { agentName?: string };
        // Normalize the agent name
        let normalizedName = agentName;
        // Map legacy names to new names if needed
        if (agentName.toLowerCase() === 'sam') {
            normalizedName = 'Oliver';
        }
        console.log(`🔄 Attempting to switch to agent: ${normalizedName}`);
        // Get the current vibe configuration
        const activeVibe = await getActiveVibe();
        // Get the list of available agents in this vibe
        const availableAgents = activeVibe.resolvedAgents.map(agent => agent.name);
        console.log(`🔍 Available agents in current vibe: ${availableAgents.join(', ')}`);
        // Check if the requested agent exists in the current vibe
        const validAgent = activeVibe.resolvedAgents.find(agent =>
            agent.name.toLowerCase() === normalizedName.toLowerCase()
        );
        // If agent not found, fallback to default agent
        const targetAgentName = validAgent ? validAgent.name : activeVibe.defaultAgent.name;
        console.log(`👤 ${validAgent ? 'Found' : 'Could not find'} agent "${normalizedName}", using: ${targetAgentName}`);
        // Update the current agent in the store
        currentAgent.set(targetAgentName as AgentName);
        // Create stage change data from the active vibe's agent
        const stageChangeData = await createAgentStageChangeData(targetAgentName as AgentName);
        // Add a message indicating the agent change
        stageChangeData.toolResultText = `I'm now switching you to ${targetAgentName}...`;
        // Make sure selected tools are properly formatted for the Ultravox API
        const sanitizedTools = stageChangeData.selectedTools.map(tool => {
            return {
                temporaryTool: {
                    modelToolName: tool.name,
                    description: tool.temporaryTool.description,
                    dynamicParameters: tool.temporaryTool.dynamicParameters,
                    client: {}
                }
            };
        });
        // Replace the tools with properly formatted ones
        stageChangeData.selectedTools = sanitizedTools;
        console.log(`✅ Agent switch prepared for: ${targetAgentName}`);
        // Return the stage change data to trigger a stage change in Ultravox
        return {
            responseType: 'new-stage',
            result: JSON.stringify(stageChangeData)
        };
    } catch (error) {
        console.error('❌ ERROR in switchAgent tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            message: `Error switching agent: ${errorMessage}`
        };
    }
}
````

## File: src/lib/tools/switchAgent/manifest.json
````json
{
    "name": "switchAgent",
    "skill": "Change who you're speaking with",
    "icon": "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    "color": "teal",
    "temporaryTool": {
        "modelToolName": "switchAgent",
        "description": "Switch the current agent to another agent. Use this tool when the user wants to talk to a different agent. NEVER emit text when doing this tool call.",
        "dynamicParameters": [
            {
                "name": "agentName",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "The name of the agent to switch to (e.g. \"Hominio\", \"Oliver\")"
                },
                "required": true
            }
        ],
        "client": {}
    },
    "implementationType": "client"
}
````

## File: src/lib/tools/switchVibe/function.ts
````typescript
// Implementation for the switchVibe tool
import type { ToolParameters } from '$lib/ultravox/types';
import { switchVibe, getActiveVibe } from '$lib/ultravox';
import { createAgentStageChangeData } from '$lib/ultravox/stageManager';
import type { AgentName } from '$lib/ultravox/types';
import { currentAgent } from '$lib/ultravox/agents';
import { getAllVibes } from '$lib/ultravox/registries/vibeRegistry';
/**
 * This tool allows switching to an entirely different vibe
 * It's more comprehensive than switchAgent because it changes:
 * 1. The entire vibe context
 * 2. All available tools
 * 3. The default agent for the new vibe
 */
export async function switchVibeImplementation(parameters: ToolParameters): Promise<Record<string, unknown>> {
    console.log('🔄 switchVibe tool called with parameters:', parameters);
    try {
        // Extract vibeId parameter
        const { vibeId = 'home' } = parameters as { vibeId?: string };
        // Dynamically get available vibes from the registry
        const availableVibes = await getAllVibes();
        const availableVibeIds = availableVibes.map(vibe => vibe.id.toLowerCase());
        // Always include 'home' as it's filtered out by getAllVibes()
        const validVibeIds = ['home', ...availableVibeIds];
        console.log(`🔍 Available vibe IDs: ${validVibeIds.join(', ')}`);
        // Validate and normalize vibeId
        const normalizedVibeId = validVibeIds.includes(vibeId.toLowerCase())
            ? vibeId.toLowerCase()
            : 'home';
        console.log(`🔄 Switching to vibe: ${normalizedVibeId}`);
        // Reset and load the new vibe
        await switchVibe(normalizedVibeId);
        // Get the fully loaded vibe
        const newVibe = await getActiveVibe(normalizedVibeId);
        // Get the default agent for this vibe and ensure it's a valid AgentName
        const defaultAgentName = newVibe.defaultAgent.name as AgentName;
        console.log(`👤 Using default agent for vibe: ${defaultAgentName}`);
        // Update the current agent in the store
        currentAgent.set(defaultAgentName);
        console.log(`🔄 Current agent updated to: ${defaultAgentName}`);
        // Create stage change data for the default agent of the new vibe
        const stageChangeData = await createAgentStageChangeData(defaultAgentName, normalizedVibeId);
        // Add a custom message indicating the vibe change
        stageChangeData.toolResultText = `I'm now switching you to the ${normalizedVibeId} vibe with ${defaultAgentName}...`;
        // Make sure selected tools are properly formatted for the Ultravox API
        // The API expects a specific format with only allowed fields
        const sanitizedTools = stageChangeData.selectedTools.map(tool => {
            // Only include fields expected by the API
            return {
                temporaryTool: {
                    modelToolName: tool.name,
                    description: tool.temporaryTool.description,
                    dynamicParameters: tool.temporaryTool.dynamicParameters,
                    client: {}
                }
            };
        });
        // Replace the tools with properly formatted ones
        stageChangeData.selectedTools = sanitizedTools;
        console.log('🔧 Stage change data prepared with sanitized tools');
        // Signal to the UI that vibe has changed
        if (typeof window !== 'undefined') {
            console.log(`🔔 Dispatching manual vibe-changed event for: ${normalizedVibeId}`);
            window.dispatchEvent(new CustomEvent('ultravox-vibe-changed', {
                detail: { vibeId: normalizedVibeId }
            }));
        }
        // Return the stage change data to trigger a stage change in Ultravox
        return {
            responseType: 'new-stage',
            result: JSON.stringify(stageChangeData)
        };
    } catch (error) {
        console.error('❌ ERROR in switchVibe tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            message: `Error switching vibe: ${errorMessage}`
        };
    }
}
````

## File: src/lib/tools/toggleTodo/manifest.json
````json
{
    "name": "toggleTodo",
    "skill": "Mark task complete/incomplete",
    "icon": "M5 13l4 4L19 7",
    "color": "green",
    "temporaryTool": {
        "modelToolName": "toggleTodo",
        "description": "Toggle a todo's completion status. Use this when a todo needs to be marked as done or undone. NEVER emit text when doing this tool call.",
        "dynamicParameters": [
            {
                "name": "todoText",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "The text of the todo task to toggle"
                },
                "required": true
            },
            {
                "name": "todoId",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "ID of the todo item to toggle (if known)"
                },
                "required": false
            }
        ],
        "client": {}
    },
    "implementationType": "client"
}
````

## File: src/lib/ultravox/registries/toolRegistry.ts
````typescript
/**
 * Tool Registry - Dynamically loads and manages all available tools
 * Provides centralized access to tool implementations for the application
 */
import type { ToolImplementation, ToolParameters, ToolResponse, ClientToolReturnType } from '../types';
// Define an interface for tool metadata
export interface ToolInfo {
    id: string;
    name: string;
    skill: string;
    icon: string;
    color: string;
    implementation?: ToolImplementation;
}
// Interface for tool manifest structure
interface ToolManifest {
    name: string;
    skill: string;
    icon: string;
    color: string;
    temporaryTool: unknown;
    implementationType: string;
}
// Default icon and color for fallback
const DEFAULT_ICON = 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
const DEFAULT_COLOR = 'amber';
// Registry of all loaded tools and their implementations
const toolRegistry: Record<string, ToolImplementation> = {};
const toolsMetadata: Record<string, ToolInfo> = {};
/**
 * Dynamically discovers and loads all tools from the tools directory
 * Returns a registry of all available tools
 */
export async function loadAllTools(): Promise<Record<string, ToolImplementation>> {
    const toolModules = import.meta.glob('../../tools/*/function.ts', { eager: false });
    const toolManifests = import.meta.glob<ToolManifest>('../../tools/*/manifest.json', { eager: true });
    // Create a map of tool IDs based on directory names
    const toolIds = Object.keys(toolModules).map(path => {
        const matches = path.match(/\.\.\/\.\.\/tools\/(.+)\/function\.ts/);
        return matches ? matches[1] : null;
    }).filter(id => id !== null) as string[];
    // Load each tool's implementation and metadata
    await Promise.all(
        toolIds.map(async (toolId) => {
            try {
                // Load the implementation
                const module = await import(`../../tools/${toolId}/function.ts`);
                const implementationName = `${toolId}Implementation`;
                if (typeof module[implementationName] === 'function') {
                    // The implementation function name pattern is {toolId}Implementation
                    toolRegistry[toolId] = module[implementationName];
                    // Get the manifest data (already loaded eagerly)
                    const manifestPath = `../../tools/${toolId}/manifest.json`;
                    const manifest = toolManifests[manifestPath];
                    // Store metadata
                    toolsMetadata[toolId] = {
                        id: toolId,
                        name: manifest?.name || toolId,
                        skill: manifest?.skill || `Use ${toolId}`,
                        icon: manifest?.icon || DEFAULT_ICON,
                        color: manifest?.color || DEFAULT_COLOR,
                        implementation: module[implementationName]
                    };
                } else {
                    console.error(`❌ Tool implementation ${implementationName} not found in module`);
                }
            } catch (error) {
                console.error(`❌ Failed to load tool ${toolId}:`, error);
            }
        })
    );
    return { ...toolRegistry };
}
/**
 * Gets all tool metadata (names, descriptions, icons, etc.)
 */
export async function getAllToolsMetadata(): Promise<ToolInfo[]> {
    // If tools aren't loaded yet, load them
    if (Object.keys(toolsMetadata).length === 0) {
        await loadAllTools();
    }
    return Object.values(toolsMetadata);
}
/**
 * Get a specific tool's metadata by ID
 */
export function getToolMetadata(toolId: string): ToolInfo | null {
    return toolsMetadata[toolId] || null;
}
/**
 * Expose a method to call a tool by ID with parameters
 */
export function callTool(toolId: string, params: ToolParameters): Promise<ToolResponse> {
    if (!toolRegistry[toolId]) {
        return Promise.reject(new Error(`Tool ${toolId} not found`));
    }
    try {
        return Promise.resolve(toolRegistry[toolId](params) as Promise<ToolResponse>);
    } catch (error) {
        return Promise.reject(error);
    }
}
/**
 * Get the raw tool implementation registry
 */
export function getToolRegistry(): Record<string, ToolImplementation> {
    return { ...toolRegistry };
}
/**
 * Register all tools with the Ultravox session
 * This attempts to register tools with the global Ultravox session
 */
export function registerToolsWithUltravox(): void {
    if (typeof window === 'undefined' || !window.__ULTRAVOX_SESSION) {
        console.warn('⚠️ Cannot register tools - Ultravox session not available');
        return;
    }
    const session = window.__ULTRAVOX_SESSION;
    const registeredTools: string[] = [];
    // Register each tool with the session
    for (const [toolName, implementation] of Object.entries(toolRegistry)) {
        try {
            // Cast to the expected type for Ultravox client
            const typedImplementation = implementation as (params: unknown) => ClientToolReturnType | Promise<ClientToolReturnType>;
            session.registerToolImplementation(toolName, typedImplementation);
            registeredTools.push(toolName);
        } catch (error) {
            console.error(`❌ Failed to register tool "${toolName}":`, error);
        }
    }
    // Mark as registered
    if (typeof window !== 'undefined') {
        window.__hominio_tools_registered = true;
    }
}
/**
 * Setup tools for use with Ultravox
 * This prepares the global registry and sets up event listeners
 */
export async function setupToolsForUltravox(): Promise<void> {
    if (typeof window === 'undefined') return;
    // Load all tools
    await loadAllTools();
    // Create or update the tools registry
    window.__hominio_tools = { ...toolRegistry };
    // Set up listener for Ultravox readiness
    window.addEventListener('ultravox-ready', () => {
        registerToolsWithUltravox();
    });
    // Also set up a listener for when Ultravox client is created
    window.addEventListener('ultravox-client-ready', () => {
        const event = new Event('ultravox-ready');
        window.dispatchEvent(event);
    });
}
````

## File: src/lib/ultravox/stores.ts
````typescript
/**
 * Ultravox Store Management
 * 
 * This file contains Svelte stores used by the Ultravox system
 */
import { writable } from 'svelte/store';
// Store for handling system errors
export const errorStore = writable<{ message: string; stack?: string } | null>(null);
export function setError(error: Error) {
    errorStore.set({ message: error.message, stack: error.stack });
}
export function clearError() {
    errorStore.set(null);
}
// Activity tracking
export const recentToolActivity = writable<{ action: string; message: string; timestamp: number; id?: string } | null>(null);
/**
 * Log a tool activity and show a notification
 * @param action The action performed
 * @param message The result message
 * @param success Whether the action was successful
 * @returns The result object
 */
export function logToolActivity(
    action: string,
    message: string,
    success = true
): { success: boolean; message: string } {
    const timestamp = Date.now();
    const activityId = crypto.randomUUID();
    // Show recent activity indicator in global state
    const activity = {
        id: activityId,
        action,
        message,
        timestamp
    };
    recentToolActivity.set(activity);
    // Clear the notification after 3 seconds
    setTimeout(() => {
        // Only clear if this is still the current notification
        recentToolActivity.update(current => {
            if (current?.id === activityId) {
                return null;
            }
            return current;
        });
    }, 3000);
    console.log(`Tool activity: ${action} - ${message} (${activityId})`);
    return { success, message };
}
````

## File: src/lib/vibes/home/manifest.json
````json
{
    "name": "home",
    "description": "Home screen for selecting vibes",
    "systemPrompt": "You are the Hominio assistant on the home screen. Help users navigate to different vibes.",
    "temperature": 0.7,
    "languageHint": "en",
    "view": "HomeView",
    "vibeTools": [],
    "defaultAgent": "Hominio",
    "agents": [
        {
            "name": "Hominio",
            "personality": "helpful and welcoming",
            "voiceId": "b0e6b5c1-3100-44d5-8578-9015aa3023ae",
            "description": "home screen assistant",
            "temperature": 0.7,
            "systemPrompt": "You are Hominio, welcoming users to the home screen. Help them navigate to different vibes like 'counter' or 'todos'. Let them know they can select a vibe from the grid displayed on the screen. You can also help them switch vibes directly using voice commands.",
            "tools": []
        }
    ]
}
````

## File: src/routes/me/+page.server.ts
````typescript
import { redirect } from '@sveltejs/kit';
import { getAuthClient } from '$lib/auth/auth';
import { building } from '$app/environment'; // Import building flag
export const load = async ({ request }) => {
    let session = null;
    // Only get session if not building/prerendering
    if (!building) {
        try {
            const auth = getAuthClient();
            session = await auth.api.getSession({
                headers: request.headers,
            });
        } catch (error) {
            console.error("Error getting session in /me page load:", error);
            // Fallback: Redirect to home if auth fails during runtime
            throw redirect(303, '/');
        }
    }
    // If user is not authenticated (or if building), redirect to home
    if (!session) {
        throw redirect(303, '/');
    }
    // Return the session data for the page
    return {
        session
    };
};
````

## File: src/routes/+page.server.ts
````typescript
import { redirect } from '@sveltejs/kit';
import { getAuthClient } from '$lib/auth/auth';
import { building } from '$app/environment'; // Import building flag
export const load = async ({ request }) => {
    let session = null;
    // Only get session if not building/prerendering
    if (!building) {
        try {
            const auth = getAuthClient();
            session = await auth.api.getSession({
                headers: request.headers,
            });
        } catch (error) {
            console.error("Error getting session in root page load:", error);
            // Proceed without session if auth fails
        }
    }
    // If user is authenticated, redirect to /me
    // This check should still happen, but relies on the session fetched above (or null)
    if (session) {
        throw redirect(303, '/me');
    }
    // Otherwise, allow access to the home page
    // Return null session if building or if auth failed
    return {
        session
    };
};
````

## File: src/hooks.server.ts
````typescript
import { getAuthClient } from "$lib/auth/auth";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from '$app/environment'; // Import building flag
export async function handle({ event, resolve }) {
    // IMPORTANT: Only run auth handler during runtime, not during build/prerender
    if (!building) {
        const auth = getAuthClient();
        // Use try-catch as a safety net in case getAuthClient throws due to missing env vars
        try {
            return svelteKitHandler({ event, resolve, auth });
        } catch (error) {
            console.error("Error initializing/using auth handler in hooks:", error);
            // Fallback to default resolve if auth fails
            return resolve(event);
        }
    }
    // During build/prerender, just resolve the request without auth
    return resolve(event);
}
````

## File: .gitignore
````
node_modules

# Output
.output
.vercel
.netlify
.wrangler
/.svelte-kit
/build

# OS
.DS_Store
Thumbs.db

# Env
.env
.env.*
!.env.example
!.env.test

# Vite
vite.config.js.timestamp-*
vite.config.ts.timestamp-*

:memory:

/hypercore-storage
````

## File: .cursor/rules/first-principles.mdc
````
---
description: 
globs: 
alwaysApply: false
---
You are a hyper-rational, first-principles problem solver with:
- Zero tolerance for excuses, rationalizations or bullshit
- Pure focus on deconstructing problems to fundamental truths 
- Relentless drive for actionable solutions and results
- No regard for conventional wisdom or "common knowledge"
- Absolute commitment to intellectual honesty

OPERATING PRINCIPLES:

1. DECONSTRUCTION
- Break everything down to foundational truths
- Challenge ALL assumptions ruthlessly
- Identify core variables and dependencies  
- Map causal relationships explicitly
- Find the smallest actionable units

2. SOLUTION ENGINEERING
- Design interventions at leverage points
- Prioritize by impact-to-effort ratio
- Create specific, measurable action steps
- Build feedback loops into every plan
- Focus on speed of execution

3. DELIVERY PROTOCOL  
- Call out fuzzy thinking immediately
- Demand specificity in all things
- Push back on vague goals/metrics
- Force clarity through pointed questions
- Insist on concrete next actions

4. INTERACTION RULES
- Never console or sympathize
- Cut off excuses instantly  
- Redirect all complaints to solutions
- Challenge limiting beliefs aggressively
- Push for better when given weak plans

RESPONSE FORMAT:

1. SITUATION ANALYSIS
- Core problem statement
- Key assumptions identified  
- First principles breakdown
- Critical variables isolated

2. SOLUTION ARCHITECTURE
- Strategic intervention points
- Specific action steps
- Success metrics
- Risk mitigation

3. EXECUTION FRAMEWORK  
- Immediate next actions
- Progress tracking method
- Course correction triggers
- Accountability measures

VOICE CHARACTERISTICS:
- Direct and unsparing
- Intellectually ruthless
- Solutions-obsessed
- Zero fluff or padding
- Pushes for excellence

KEY PHRASES:
"Let's break this down to first principles..."
"Your actual problem is..."
"That's an excuse. Here's what you need to do..."
"Be more specific. What exactly do you mean by..."
"Your plan is weak because..."
"Here's your action plan, starting now..."
"Let's identify your real constraints..."
"That assumption is flawed because..."

CONSTRAINTS:
- No motivational fluff
- No vague advice
- No social niceties
- No unnecessary context
- No theoretical discussions without immediate application

OBJECTIVE:
Transform any problem, goal or desire into:
1. Clear fundamental truths
2. Specific action steps  
3. Measurable outcomes
4. Immediate next actions
````

## File: src/db/model.ts
````typescript
import { t } from 'elysia'
import { docs, content } from './schema'
// Create models with type refinements matching hominio-db.ts interfaces
export const db = {
    insert: {
        // Matches Docs interface from hominio-db.ts (without localState for server)
        docs: t.Object({
            pubKey: t.String(),          // Stable document identity (like IPNS)
            owner: t.String(),           // Document owner (not ownerId)
            updatedAt: t.String(),       // Last update timestamp
            snapshotCid: t.Optional(t.String()), // Content hash of latest snapshot
            updateCids: t.Optional(t.Array(t.String())) // Content hashes of updates
        }),
        // Matches Content interface from hominio-db.ts
        content: t.Object({
            cid: t.String(),             // Content identifier (hash)
            type: t.String(),            // 'snapshot' or 'update'
            raw: t.Any(),                // Raw binary data (serialized LoroDoc)
            metadata: t.Record(t.String(), t.Any()), // Mirrored metadata for indexability
            createdAt: t.String()
        })
    },
    select: {
        docs,
        content
    }
} as const;
````

## File: src/lib/components/views/JournalView.svelte
````
<script lang="ts">
	import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
	import type { JournalEntry } from '$lib/docs/schemas/journalEntry';
	import { onMount } from 'svelte';
	import { writable, type Writable } from 'svelte/store';
	// Create a store to hold our journal entries
	const entries: Writable<[string, JournalEntry][]> = writable([]);
	// Initialize LoroAPI and set up subscriptions
	async function initJournal() {
		try {
			// Get the LoroAPI instance
			const loroAPI = getLoroAPIInstance();
			// Get operations for journal entry schema
			const ops = await loroAPI.getOperations<JournalEntry>('journalEntry');
			// Subscribe to the entries store
			ops.store.subscribe((value) => {
				entries.set(value);
			});
		} catch (error) {
			console.error('Error initializing journal:', error);
		}
	}
	// Sort entries by date (newest first)
	$: sortedEntries = [...$entries].sort(([, a], [, b]) => b.createdAt - a.createdAt);
	// Format date for display
	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
	// Mood colors map
	function getMoodColor(mood?: string): string {
		if (!mood) return 'bg-gray-500/30 text-gray-300';
		const colorMap: Record<string, string> = {
			happy: 'bg-yellow-500/30 text-yellow-200',
			sad: 'bg-blue-500/30 text-blue-200',
			excited: 'bg-pink-500/30 text-pink-200',
			angry: 'bg-red-500/30 text-red-200',
			neutral: 'bg-gray-500/30 text-gray-200',
			relaxed: 'bg-green-500/30 text-green-200',
			anxious: 'bg-purple-500/30 text-purple-200',
			thoughtful: 'bg-cyan-500/30 text-cyan-200'
		};
		return colorMap[mood.toLowerCase()] || 'bg-gray-500/30 text-gray-300';
	}
	// Get capitalized mood text
	function getMoodText(mood?: string): string {
		if (!mood) return '';
		return mood.charAt(0).toUpperCase() + mood.slice(1);
	}
	// Currently selected entry for detail view
	let selectedEntry: [string, JournalEntry] | null = null;
	// Flag to control detail view display
	let showDetail = false;
	// Select an entry to view in detail
	function viewEntry(entry: [string, JournalEntry]) {
		selectedEntry = entry;
		showDetail = true;
	}
	// Close detail view
	function closeDetail() {
		showDetail = false;
	}
	// Initialize when component mounts
	onMount(() => {
		initJournal();
	});
</script>
<div class="mx-auto max-w-7xl p-4 sm:p-6">
	<!-- Header Section -->
	<div class="mb-8 text-center">
		<h1 class="text-3xl font-bold tracking-tight text-white">Journal</h1>
		<p class="mt-2 text-lg text-white/70">Reflect on your thoughts and experiences</p>
	</div>
	<!-- Entry Detail Modal -->
	{#if showDetail && selectedEntry}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		>
			<div
				class="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-gray-900 p-6 shadow-xl"
			>
				<button
					on:click={closeDetail}
					class="absolute top-4 right-4 rounded-full bg-gray-800 p-2 text-white/70 hover:bg-gray-700 hover:text-white"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
				<div class="mt-2">
					<div class="mb-4 flex items-center">
						<h2 class="text-2xl font-semibold text-white">{selectedEntry[1].title}</h2>
						{#if selectedEntry[1].mood}
							<span
								class={`ml-3 rounded-lg px-3 py-1 text-base font-medium ${getMoodColor(selectedEntry[1].mood)}`}
							>
								{getMoodText(selectedEntry[1].mood)}
							</span>
						{/if}
					</div>
					<div class="mb-6 text-sm text-white/60">
						{formatDate(selectedEntry[1].createdAt)}
					</div>
					{#if selectedEntry[1].tags && selectedEntry[1].tags.length > 0}
						<div class="mb-4 flex flex-wrap gap-1.5">
							{#each selectedEntry[1].tags as tag}
								<span class="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
									{tag}
								</span>
							{/each}
						</div>
					{/if}
					<div class="prose prose-invert mt-6 max-w-none whitespace-pre-wrap">
						{selectedEntry[1].content}
					</div>
				</div>
			</div>
		</div>
	{/if}
	<!-- Journal Entries List -->
	<div class="space-y-4">
		{#if sortedEntries.length === 0}
			<div
				class="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-12 text-white/60 backdrop-blur-sm"
			>
				No journal entries yet. Start by saying "Add a journal entry about..."
			</div>
		{:else}
			{#each sortedEntries as entry (entry[0])}
				<div
					class="cursor-pointer rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors hover:bg-white/10"
					on:click={() => viewEntry(entry)}
				>
					<div class="p-5">
						<div class="mb-3 flex items-center justify-between">
							<div class="flex items-center">
								<h3 class="text-xl font-medium text-white/90">{entry[1].title}</h3>
								{#if entry[1].mood}
									<span
										class={`ml-3 rounded-lg px-3 py-1 text-base font-medium ${getMoodColor(entry[1].mood)}`}
									>
										{getMoodText(entry[1].mood)}
									</span>
								{/if}
							</div>
							<span class="text-xs text-white/40">
								{formatDate(entry[1].createdAt)}
							</span>
						</div>
						{#if entry[1].tags && entry[1].tags.length > 0}
							<div class="mb-3 flex flex-wrap gap-1.5">
								{#each entry[1].tags as tag}
									<span class="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
										{tag}
									</span>
								{/each}
							</div>
						{/if}
						<p class="whitespace-pre-wrap text-white/70">
							{entry[1].content}
						</p>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
<style>
	/* Add subtle transitions */
	.rounded-xl {
		transition: all 0.2s ease-in-out;
	}
	.rounded-xl:hover {
		transform: translateY(-2px);
		box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
	}
</style>
````

## File: src/lib/docs/index.ts
````typescript
/**
 * Loro Docs Module
 * 
 * This module provides a unified API for working with Loro documents and collections.
 */
import { getLoroAPIInstance, type LoroAPI } from '../KERNEL/loroAPI';
// Get the instance when needed, not at module load
const getLoroAPI = (): LoroAPI => getLoroAPIInstance();
// Re-export schema types
export type { TodoItem } from './schemas/todo';
export type { TodoList } from './schemas/todoList';
/**
 * Initialize the docs system and discover schemas
 */
export async function initDocs() {
    const api = getLoroAPI();
    return api.discoverSchemas();
}
/**
 * Export a document to binary format
 * @param docName Name of the document
 * @param options Export options
 * @returns Uint8Array of the exported document
 */
export function exportDoc(docName: string, options?: { mode: 'snapshot' | 'update' }) {
    const api = getLoroAPI();
    return api.exportDoc(docName, options);
}
/**
 * Import data into a document
 * @param docName Name of the document
 * @param data Data to import
 */
export function importDoc(docName: string, data: Uint8Array) {
    const api = getLoroAPI();
    api.importDoc(docName, data);
}
// Export default initialization function
export default initDocs;
// Export the getter function if direct access is needed elsewhere
export { getLoroAPI };
````

## File: src/lib/KERNEL/hash-service.ts
````typescript
import { blake3 } from '@noble/hashes/blake3';
import { LoroDoc } from 'loro-crdt';
import b4a from 'b4a';
export class HashService {
    /**
     * Generate Blake3 hash for a raw Loro document snapshot (Uint8Array).
     * Returns the hash as a hex string.
     */
    async hashSnapshot(snapshot: Uint8Array): Promise<string> {
        const hashBytes = blake3(snapshot);
        // Use b4a for efficient buffer-to-hex conversion
        return b4a.toString(hashBytes, 'hex');
    }
    /**
     * Verify a snapshot matches its hash.
     */
    async verifySnapshot(snapshot: Uint8Array, hashHex: string): Promise<boolean> {
        const computedHashHex = await this.hashSnapshot(snapshot);
        return computedHashHex === hashHex;
    }
    /**
     * Generate Blake3 hash for a full Loro document object.
     */
    async hashDoc(doc: LoroDoc): Promise<string> {
        // Exporting snapshot is more direct for hashing the canonical block content
        const snapshot = doc.exportSnapshot();
        return this.hashSnapshot(snapshot);
    }
    /**
     * Verify a Loro document object matches its hash.
     * Note: Generally prefer verifySnapshot.
     */
    async verifyDoc(doc: LoroDoc, hashHex: string): Promise<boolean> {
        const computedHashHex = await this.hashDoc(doc);
        return computedHashHex === hashHex;
    }
}
// Export singleton instance
export const hashService = new HashService();
````

## File: src/lib/KERNEL/hominio-ql.ts
````typescript
import { hominioDB, type Docs } from './hominio-db';
import { validateEntityJsonAgainstSchema } from './hominio-validate';
import { canRead, canDelete, type CapabilityUser, canWrite } from './hominio-capabilities';
// --- Add Svelte store imports for reactive queries ---
import { readable, type Readable, get } from 'svelte/store';
import { docChangeNotifier } from './hominio-db'; // Import the notifier
import { authClient } from '$lib/client/auth-hominio'; // Import authClient
// ---------------------------------------------------
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];
type HqlValue = LoroJsonValue;
type HqlOperator = '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' | '$in' | '$nin' | '$exists' | '$regex' | '$contains';
type HqlCondition = { [key in HqlOperator]?: HqlValue | HqlValue[] };
type HqlPlaceFilterValue = HqlValue | HqlCondition | string; // Allow direct @ref string
type HqlMetaFilterValue = HqlValue | HqlCondition;
// Export HQL interfaces used by the UI
export interface HqlFilterObject {
    meta?: {
        [key: string]: HqlMetaFilterValue;
    };
    places?: {
        [key: string]: HqlPlaceFilterValue; // Key is x1, x2 etc.
    };
    $or?: HqlFilterObject[];
    $and?: HqlFilterObject[];
    $not?: HqlFilterObject;
    // Internal marker, not part of public API
    $fromSchema?: string;
}
export interface HqlFromClause {
    pubKey?: string | string[];
    schema?: string; // Name or @pubKey
    owner?: string;
}
export interface HqlQueryRequest {
    operation: 'query';
    from?: HqlFromClause;
    filter?: HqlFilterObject;
}
export interface HqlMutationRequest {
    operation: 'mutate';
    action: 'create' | 'update' | 'delete';
    pubKey?: string; // Required for update/delete
    schema?: string; // Required for create (Name or @pubKey)
    places?: Record<string, LoroJsonValue | string>; // Place data for create/update (@pubKey strings allowed)
}
export type HqlRequest = HqlQueryRequest | HqlMutationRequest;
// Result Types (More specific)
// Export result types used by the UI
export type ResolvedHqlDocument = Record<string, unknown> & { pubKey: string };
export type HqlQueryResult = ResolvedHqlDocument[];
export type HqlMutationResult = Docs | { success: boolean };
export type HqlResult = HqlQueryResult | HqlMutationResult;
// --- HQL Service ---
class HominioQLService {
    private schemaJsonCache: Map<string, Record<string, unknown> | null>;
    constructor() {
        this.schemaJsonCache = new Map();
    }
    /**
     * Main entry point to process an HQL request (non-reactive).
     */
    async process(request: HqlRequest): Promise<HqlResult> {
        this.schemaJsonCache.clear(); // Clear JSON cache
        try {
            // Fetch user internally for this specific operation
            const user = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (request.operation === 'query') {
                return await this._handleQuery(request, user);
            } else if (request.operation === 'mutate') {
                return await this._handleMutate(request, user);
            } else {
                throw new Error(`Invalid HQL operation: ${(request as { operation: string }).operation}`);
            }
        } catch (error) {
            console.error("HQL Processing Error:", error);
            throw error instanceof Error ? error : new Error("An unknown error occurred during HQL processing.");
        }
    }
    // --- Query Handling ---
    private async _handleQuery(request: HqlQueryRequest, user: CapabilityUser | null): Promise<HqlQueryResult> {
        // 1. Fetch ALL document metadata
        const allDbDocsMetadata = await hominioDB.loadAllDocsReturn();
        // 2. Filter by Read Capability
        const accessibleDocsMetadata = allDbDocsMetadata.filter(docMeta => canRead(user, docMeta));
        // 3. Build Combined Filter Criteria
        const combinedFilter: HqlFilterObject = { ...(request.filter || {}) };
        if (request.from?.schema) {
            // Add schema from 'from' clause as an implicit filter condition
            // The actual matching logic is handled within _applyFilter based on $fromSchema marker
            combinedFilter.$fromSchema = request.from.schema;
        }
        if (request.from?.owner) {
            // Add owner from 'from' clause as an implicit meta filter
            combinedFilter.meta = { ...(combinedFilter.meta || {}), owner: request.from.owner };
        }
        if (request.from?.pubKey) {
            // Add pubKey from 'from' clause as an implicit meta filter
            // Note: This simplistic merge assumes pubKey isn't already complexly filtered in request.filter.meta
            // A more robust merge might be needed for complex cases.
            const keys = Array.isArray(request.from.pubKey) ? request.from.pubKey : [request.from.pubKey];
            combinedFilter.meta = { ...(combinedFilter.meta || {}), pubKey: { $in: keys } };
        }
        // 4. Apply Combined Filter
        // Pass the metadata list and the combined filter object.
        // _applyFilter will fetch JSON data internally only for docs that need content inspection.
        const filteredDocsMetadata = await this._applyFilter(accessibleDocsMetadata, combinedFilter);
        // 5. Resolve References (if needed) and Format Results
        // Pass the metadata of the filtered docs.
        const resolvedResults = await this._resolveReferencesAndFormat(filteredDocsMetadata, user);
        return resolvedResults;
    }
    // Removed _filterInitialSet as its logic is merged into _handleQuery/combinedFilter
    // Renamed and refactored _applyFilter
    private async _applyFilter(docsMetadata: Docs[], filter: HqlFilterObject): Promise<Docs[]> {
        const results: Docs[] = [];
        // Extract schema filter early if present
        const fromSchemaFilter = filter.$fromSchema;
        const actualContentFilter = { ...filter };
        delete actualContentFilter.$fromSchema; // Don't evaluate the marker directly in _evaluateFilter
        const hasContentFilter = Object.keys(actualContentFilter).length > 0;
        for (const docMeta of docsMetadata) {
            let matches = true;
            // --- Pre-filter based on metadata available in docMeta (optimization) ---
            // Example: If filter has { meta: { owner: '...' } }, check docMeta.owner first
            // For simplicity, this pre-filtering is omitted here, but could be added.
            // We currently check owner/pubKey via combinedFilter logic before calling _applyFilter,
            // but deeper meta checks could happen here before fetching JSON.
            // --- Check Schema Match (using $fromSchema marker) --- Needs JSON meta.schema
            if (fromSchemaFilter) {
                // Fetch JSON only if schema filtering is needed
                const jsonData = await hominioDB.getDocumentDataAsJson(docMeta.pubKey);
                if (!jsonData) {
                    console.warn(`[HQL ApplyFilter] Could not load JSON for schema check on ${docMeta.pubKey}. Skipping.`);
                    matches = false;
                } else {
                    const meta = jsonData?.meta as Record<string, unknown> | undefined;
                    const schemaRef = meta?.schema as string | null | undefined;
                    // Handle potential name vs @pubkey
                    const schemaFilterPubKey = fromSchemaFilter.startsWith('@') ? fromSchemaFilter.substring(1) : null;
                    const schemaFilterName = !fromSchemaFilter.startsWith('@') ? fromSchemaFilter : null;
                    if (schemaFilterPubKey) {
                        // Compare based on PubKey reference (e.g., meta.schema = "@0x123")
                        const entitySchemaPubKeyRef = typeof schemaRef === 'string' && schemaRef.startsWith('@') ? schemaRef.substring(1) : null;
                        matches = entitySchemaPubKeyRef === schemaFilterPubKey;
                    } else if (schemaFilterName) {
                        // Filtering by schema *name* - requires fetching schema doc itself to compare names (NOT IMPLEMENTED - ASSUME MISMATCH)
                        console.warn(`[HQL ApplyFilter] Filtering by schema name ('${schemaFilterName}') is not robustly implemented. Assuming mismatch for doc ${docMeta.pubKey}.`);
                        matches = false;
                    } else {
                        // Invalid fromSchemaFilter format?
                        matches = false;
                    }
                }
            }
            // --- Check Content Filter (if schema matched and content filter exists) ---
            if (matches && hasContentFilter) {
                // Fetch JSON only if needed (if not already fetched for schema check)
                // This assumes getDocumentDataAsJson is efficient enough or cached by hominioDB layer.
                const jsonData = await hominioDB.getDocumentDataAsJson(docMeta.pubKey);
                if (!jsonData) {
                    console.warn(`[HQL ApplyFilter] Could not load JSON data for content filter on ${docMeta.pubKey}. Skipping.`);
                    matches = false;
                } else {
                    // Evaluate the rest of the filter against the JSON content
                    matches = this._evaluateFilter(jsonData, actualContentFilter);
                }
            }
            if (matches) {
                results.push(docMeta); // Add the *metadata* object
            }
        }
        return results;
    }
    private _evaluateFilter(data: Record<string, unknown>, filter: HqlFilterObject): boolean {
        if (!filter || Object.keys(filter).length === 0) return true;
        for (const key in filter) {
            const filterKey = key as keyof HqlFilterObject;
            const filterValue = filter[filterKey];
            let match = true;
            if (filterKey === '$or' && Array.isArray(filterValue)) {
                match = filterValue.some(subFilter => this._evaluateFilter(data, subFilter));
            } else if (filterKey === '$and' && Array.isArray(filterValue)) {
                match = filterValue.every(subFilter => this._evaluateFilter(data, subFilter));
            } else if (filterKey === '$not' && typeof filterValue === 'object' && filterValue !== null) {
                match = !this._evaluateFilter(data, filterValue as HqlFilterObject);
            } else if (filterKey === 'meta' && typeof filterValue === 'object' && filterValue !== null) {
                match = this._checkFields(data?.meta, filterValue as Record<string, HqlMetaFilterValue>);
            } else if (filterKey === 'places' && typeof filterValue === 'object' && filterValue !== null) {
                const dataField = data?.data as Record<string, unknown> | undefined;
                match = this._checkFields(dataField?.places, filterValue as Record<string, HqlPlaceFilterValue>);
            }
            if (!match) return false;
        }
        return true;
    }
    private _checkFields(dataObject: unknown, conditions: Record<string, unknown>): boolean {
        if (typeof dataObject !== 'object' || dataObject === null) return false;
        const obj = dataObject as Record<string, unknown>; // Cast for access
        for (const field in conditions) {
            const condition = conditions[field];
            const actualValue = obj[field];
            let fieldMatch = false;
            if (typeof condition === 'object' && condition !== null && Object.keys(condition).length > 0 && Object.keys(condition)[0].startsWith('$')) {
                const operator = Object.keys(condition)[0] as HqlOperator;
                const operand = (condition as HqlCondition)[operator];
                fieldMatch = this._applyOperator(actualValue, operator, operand);
            } else {
                if (typeof condition === 'string' && condition.startsWith('@') && typeof actualValue === 'string' && actualValue.startsWith('@')) {
                    fieldMatch = condition === actualValue || condition.substring(1) === actualValue.substring(1);
                } else if (typeof condition === 'string' && condition.startsWith('@')) {
                    fieldMatch = actualValue === condition.substring(1);
                } else if (typeof actualValue === 'string' && actualValue.startsWith('@')) {
                    fieldMatch = condition === actualValue.substring(1);
                } else {
                    fieldMatch = this._applyOperator(actualValue, '$eq', condition);
                }
            }
            if (!fieldMatch) return false;
        }
        return true;
    }
    private _applyOperator(value: unknown, operator: HqlOperator, operand: unknown): boolean {
        // Need more robust type checks here potentially
        switch (operator) {
            case '$eq': return value === operand;
            case '$ne': return value !== operand;
            case '$gt': return typeof value === 'number' && typeof operand === 'number' && value > operand;
            case '$gte': return typeof value === 'number' && typeof operand === 'number' && value >= operand;
            case '$lt': return typeof value === 'number' && typeof operand === 'number' && value < operand;
            case '$lte': return typeof value === 'number' && typeof operand === 'number' && value <= operand;
            case '$in': return Array.isArray(operand) && operand.includes(value);
            case '$nin': return Array.isArray(operand) && !operand.includes(value);
            case '$exists': return operand ? value !== undefined : value === undefined;
            case '$contains': return typeof value === 'string' && typeof operand === 'string' && value.includes(operand);
            case '$regex':
                try {
                    return typeof value === 'string' && typeof operand === 'string' && new RegExp(operand).test(value);
                } catch { return false; }
            default: return false;
        }
    }
    // Renamed _resolveReferences to reflect its new role
    private async _resolveReferencesAndFormat(docsMetadata: Docs[], user: CapabilityUser | null): Promise<HqlQueryResult> {
        const resolvedDocs: ResolvedHqlDocument[] = [];
        const visited = new Set<string>();
        // Keep schema cache within the request lifecycle
        const schemaFetcher = async (schemaRef: string) => {
            if (this.schemaJsonCache.has(schemaRef)) {
                return this.schemaJsonCache.get(schemaRef) || null;
            }
            const schemaJson = await hominioDB.getSchemaDataAsJson(schemaRef);
            this.schemaJsonCache.set(schemaRef, schemaJson);
            return schemaJson;
        };
        for (const docMeta of docsMetadata) {
            visited.clear();
            // Get the current JSON state (includes local updates)
            const jsonData = await hominioDB.getDocumentDataAsJson(docMeta.pubKey);
            if (!jsonData) {
                console.warn(`[HQL ResolveRefs] Could not load JSON data for final result ${docMeta.pubKey}.`);
                // Include basic info even if content fails
                resolvedDocs.push({
                    pubKey: docMeta.pubKey,
                    $error: "Failed to load document content",
                    $localState: { // Add local state info from metadata
                        isUnsynced: !!docMeta.localState,
                        hasLocalSnapshot: !!docMeta.localState?.snapshotCid,
                        localUpdateCount: docMeta.localState?.updateCids?.length ?? 0
                    }
                } as unknown as ResolvedHqlDocument);
                continue;
            }
            // Resolve references within the JSON data
            const resolvedJson = await this._resolveNode(jsonData, user, visited, schemaFetcher);
            // Add local state information to the final resolved document
            resolvedJson.$localState = {
                isUnsynced: !!docMeta.localState,
                hasLocalSnapshot: !!docMeta.localState?.snapshotCid,
                localUpdateCount: docMeta.localState?.updateCids?.length ?? 0
            };
            resolvedDocs.push(resolvedJson);
        }
        return resolvedDocs;
    }
    // _resolveNode remains largely the same, operating on JSON
    private async _resolveNode(
        currentNodeJson: Record<string, unknown>,
        user: CapabilityUser | null,
        visited: Set<string>,
        schemaFetcher: (schemaRef: string) => Promise<Record<string, unknown> | null>
    ): Promise<ResolvedHqlDocument> {
        const pubKey = currentNodeJson.pubKey as string;
        if (!pubKey) {
            // Attempt to find pubKey if missing (e.g., from nested resolution)
            // This part might need review based on how data is structured.
            console.warn("[HQL ResolveNode] Node JSON missing pubKey.");
            // Add placeholder if truly missing
            return { ...currentNodeJson, $error: "Missing pubKey during resolution" } as unknown as ResolvedHqlDocument;
        }
        if (visited.has(pubKey)) {
            return { pubKey, $ref: pubKey, $error: "Cycle detected" } as ResolvedHqlDocument;
        }
        visited.add(pubKey);
        const resolvedJson = { ...currentNodeJson };
        const meta = resolvedJson.meta as Record<string, unknown> | undefined;
        const data = resolvedJson.data as Record<string, unknown> | undefined;
        const metaSchemaRef = meta?.schema as string | undefined;
        let schemaJson: Record<string, unknown> | null = null;
        if (metaSchemaRef) {
            schemaJson = await schemaFetcher(metaSchemaRef);
        }
        if (schemaJson && data?.places && typeof data.places === 'object') {
            const schemaData = schemaJson.data as Record<string, unknown> | undefined;
            const schemaPlacesDef = schemaData?.places as Record<string, unknown> | undefined;
            if (schemaPlacesDef) {
                const resolvedPlaces: Record<string, unknown> = {};
                const currentPlaces = data.places as Record<string, unknown>;
                for (const placeKey in currentPlaces) {
                    const placeValue = currentPlaces[placeKey];
                    if (typeof placeValue === 'string' && placeValue.startsWith('@')) {
                        const refPubKey = placeValue.substring(1);
                        const refDocMeta = await hominioDB.getDocument(refPubKey);
                        if (refDocMeta && canRead(user, refDocMeta)) {
                            const refJsonData = await hominioDB.getDocumentDataAsJson(refPubKey);
                            if (refJsonData) {
                                resolvedPlaces[placeKey] = await this._resolveNode(refJsonData, user, visited, schemaFetcher);
                            } else {
                                resolvedPlaces[placeKey] = { pubKey: refPubKey, $ref: placeValue, $error: "Referenced document data could not be loaded" };
                            }
                        } else {
                            resolvedPlaces[placeKey] = { pubKey: refPubKey, $ref: placeValue, $error: "Permission denied or referenced document not found" };
                        }
                    } else {
                        resolvedPlaces[placeKey] = placeValue;
                    }
                }
                data.places = resolvedPlaces;
            }
        }
        visited.delete(pubKey);
        return resolvedJson as ResolvedHqlDocument;
    }
    // --- Mutation Handling (To be refactored next) ---
    private async _handleMutate(request: HqlMutationRequest, user: CapabilityUser | null): Promise<HqlMutationResult> {
        if (!user) {
            throw new Error("Authentication required for mutations.");
        }
        if (request.action === 'create') {
            return this._handleCreate(request, user);
        } else if (request.action === 'update') {
            return this._handleUpdate(request, user);
        } else if (request.action === 'delete') {
            return this._handleDelete(request, user);
        } else {
            throw new Error(`Invalid mutation action: ${request.action}`);
        }
    }
    private async _handleCreate(request: HqlMutationRequest, user: CapabilityUser): Promise<Docs> {
        if (!request.schema) throw new Error("HQL Create: Schema reference (@pubKey) is required.");
        if (!request.places) throw new Error("HQL Create: Places data is required.");
        // 1. Fetch Schema JSON
        const schemaJson = await hominioDB.getSchemaDataAsJson(request.schema);
        if (!schemaJson) {
            throw new Error(`HQL Create: Schema ${request.schema} not found or not accessible.`);
        }
        // 2. Construct Temporary Entity JSON for Validation
        const tempEntityJson = {
            meta: {
                schema: request.schema,
                name: `New ${(schemaJson.meta as Record<string, unknown>)?.name ?? 'Entity'}`
            },
            data: {
                places: request.places
            }
        };
        // 3. Validate the proposed entity data against the schema JSON
        const validationResult = validateEntityJsonAgainstSchema(tempEntityJson, schemaJson);
        if (!validationResult.isValid) {
            throw new Error(`HQL Create: Validation failed: ${validationResult.errors.join(', ')}`);
        }
        // 4. Extract schema pubKey (without @)
        const schemaPubKey = request.schema.substring(1);
        // 5. Call hominioDB to perform the actual creation
        console.log(`[HQL Create] Validation passed for schema ${request.schema}. Calling hominioDB.createEntity...`);
        const newDbDoc = await hominioDB.createEntity(
            schemaPubKey,
            request.places as Record<string, LoroJsonValue>, // Cast needed
            user.id
        );
        return newDbDoc;
    }
    private async _handleUpdate(request: HqlMutationRequest, user: CapabilityUser): Promise<Docs> {
        const pubKey = request.pubKey;
        if (!pubKey) throw new Error("HQL Update: pubKey is required.");
        if (!request.places || Object.keys(request.places).length === 0) {
            console.log("[HQL Update] No places data provided, returning current doc metadata.");
            const currentDocMeta = await hominioDB.getDocument(pubKey);
            if (!currentDocMeta) throw new Error(`HQL Update: Document ${pubKey} not found.`);
            return currentDocMeta;
        }
        // 1. Fetch Current Entity JSON and Metadata
        const currentEntityJson = await hominioDB.getDocumentDataAsJson(pubKey);
        if (!currentEntityJson) {
            throw new Error(`HQL Update: Failed to load current data for document ${pubKey}.`);
        }
        const currentDocMeta = await hominioDB.getDocument(pubKey);
        if (!currentDocMeta) {
            // Should not happen if getDocumentDataAsJson succeeded, but check defensively
            throw new Error(`HQL Update: Failed to load metadata for document ${pubKey}.`);
        }
        // 2. Capability Check
        if (!canWrite(user, currentDocMeta)) {
            throw new Error(`HQL Update: Permission denied to update document ${pubKey}.`);
        }
        // 3. Fetch Schema JSON
        const schemaRef = (currentEntityJson.meta as Record<string, unknown>)?.schema as string | undefined;
        if (!schemaRef) {
            throw new Error(`HQL Update: Document ${pubKey} is missing schema reference in meta.`);
        }
        const schemaJson = await hominioDB.getSchemaDataAsJson(schemaRef);
        if (!schemaJson) {
            throw new Error(`HQL Update: Schema ${schemaRef} not found or not accessible for validation.`);
        }
        // 4. Construct Merged Entity JSON for Validation
        const currentPlaces = ((currentEntityJson.data as Record<string, unknown>)?.places as Record<string, LoroJsonValue>) || {};
        const mergedPlaces = { ...currentPlaces, ...(request.places as Record<string, LoroJsonValue>) };
        // Create the new data object separately
        const existingData = (typeof currentEntityJson.data === 'object' && currentEntityJson.data !== null)
            ? currentEntityJson.data as Record<string, unknown>
            : {};
        const newData = {
            ...existingData,
            places: mergedPlaces
        };
        // Construct the final merged JSON
        const mergedEntityJson = {
            ...currentEntityJson, // Spread the original entity
            data: newData        // Assign the separately created data object
        };
        // 5. Validate the merged entity data against the schema JSON
        const validationResult = validateEntityJsonAgainstSchema(mergedEntityJson, schemaJson);
        if (!validationResult.isValid) {
            throw new Error(`HQL Update: Validation failed: ${validationResult.errors.join(', ')}`);
        }
        // 6. Call hominioDB to perform the actual update
        console.log(`[HQL Update] Validation passed for doc ${pubKey}. Calling hominioDB.updateEntityPlaces...`);
        const updatedDbDoc = await hominioDB.updateEntityPlaces(
            pubKey,
            request.places as Record<string, LoroJsonValue> // Pass only the changes
        );
        return updatedDbDoc;
    }
    private async _handleDelete(request: HqlMutationRequest, user: CapabilityUser): Promise<{ success: boolean }> {
        const pubKey = request.pubKey;
        if (!pubKey) throw new Error("HQL Delete: pubKey is required.");
        const docToDelete = await hominioDB.getDocument(pubKey);
        if (!docToDelete) {
            // Allow delete requests for non-existent docs? Return success? For now, error.
            throw new Error(`HQL Delete: Document ${pubKey} not found.`);
        }
        if (!canDelete(user, docToDelete)) {
            throw new Error(`HQL Delete: Permission denied to delete document ${pubKey}.`);
        }
        await hominioDB.deleteDocument(pubKey);
        console.log(`[HQL Delete] Successfully deleted document ${pubKey}`);
        return { success: true };
    }
    // --- Reactive Query Handling ---
    processReactive(
        request: HqlQueryRequest
    ): Readable<HqlQueryResult | null | undefined> {
        // Define the actual query execution function
        const executeQuery = async (): Promise<HqlQueryResult | null> => {
            console.log(`[HQL Requery] Running query:`, request);
            try {
                // Fetch user internally EACH time query runs for capability checks
                const user = get(authClient.useSession()).data?.user as CapabilityUser | null;
                const result = await this._handleQuery(request, user); // Pass user to internal handler
                return result;
            } catch (error) {
                console.error('[HQL Requery] Query failed:', error);
                return null; // Return null on error
            }
        };
        // Create the readable store
        const store = readable<HqlQueryResult | null | undefined>(undefined, (set) => { // Start as undefined
            console.log(`[HQL Reactive Store] Subscribed:`, request);
            let isMounted = true;
            let initialLoadComplete = false;
            // Initial fetch
            executeQuery().then(initialResult => {
                if (isMounted) {
                    set(initialResult); // Set initial result (or null if error)
                    initialLoadComplete = true;
                    console.log(`[HQL Reactive Store] Initial load complete.`);
                }
            });
            // Subscribe to changes - *after* initial load starts
            const unsubscribeNotifier = docChangeNotifier.subscribe(async () => {
                // Avoid requery if initial load hasn't finished or component unmounted
                if (!isMounted || !initialLoadComplete) return;
                console.log(`[HQL Reactive Store] Notifier triggered, re-querying:`, request);
                const newResult = await executeQuery();
                if (isMounted) { // Check again after await
                    set(newResult); // Set new result (or null if error)
                }
            });
            // Cleanup
            return () => {
                console.log(`[HQL Reactive Store] Unsubscribed:`, request);
                isMounted = false;
                unsubscribeNotifier();
            };
        });
        return store; // Return the readable store SYNCHRONOUSLY
    }
} // End of HominioQLService class
// Export singleton instance
export const hominioQLService = new HominioQLService();
````

## File: src/lib/KERNEL/hominio-validate.ts
````typescript
import { GENESIS_PUBKEY } from '../../db/constants'; // Import from new constants file
// Define the genesis pubkey constant with 0x prefix - REMOVED, now imported
// export const GENESIS_PUBKEY = `0x${'0'.repeat(64)}`;
const GISMU_SCHEMA_REF = `@${GENESIS_PUBKEY}`; // Reference uses the imported constant
// --- Utility Types ---
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];
// --- Interfaces for expected Schema Document Structure (Simplified) ---
// These are for validation logic, not exhaustive type definitions
interface PlaceDefinitionStructure {
    description: string;
    required: boolean;
    validation?: Record<string, unknown> | null;
}
interface TranslationPlaceStructure {
    [key: string]: string;
}
interface TranslationStructure {
    lang: string;
    name: string;
    description: string;
    places: TranslationPlaceStructure;
}
/**
 * Validates the basic structure of a Schema Definition *represented as JSON*.
 *
 * Checks for:
 * - Presence and type of required meta fields (name, schema).
 * - Correct schema reference (@GENESIS_PUBKEY (0x...) for non-gismu, null for gismu).
 * - Presence and type of required data fields (places, translations).
 * - Basic structure of places (x1-x5 keys, required fields within each place).
 * - Basic structure of translations (lang, name, description, places).
 *
 * @param schemaJson The schema definition as a JSON object.
 * @returns An object containing `isValid` (boolean) and an array of `errors` (string[]).
 */
export function validateSchemaJsonStructure(schemaJson: Record<string, unknown>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    let isValid = true;
    // Access data directly from JSON object
    const meta = schemaJson.meta as Record<string, unknown> | undefined;
    const data = schemaJson.data as Record<string, unknown> | undefined;
    // --- Meta Validation ---
    if (!meta) {
        errors.push("Missing 'meta' map.");
        isValid = false;
    } else {
        // No need for .toJSON()
        const name = meta.name;
        const schemaRef = meta.schema;
        if (typeof name !== 'string' || name.trim() === '') {
            errors.push("Invalid or missing 'meta.name' (must be a non-empty string).");
            isValid = false;
        }
        if (name === 'gismu') {
            // Gismu schema must reference itself
            if (schemaRef !== GISMU_SCHEMA_REF) {
                errors.push(`Invalid 'meta.schema' for gismu (must be "${GISMU_SCHEMA_REF}"). Found: ${schemaRef}`);
                isValid = false;
            }
        } else {
            // Other schemas must reference Gismu
            if (typeof schemaRef !== 'string' || schemaRef !== GISMU_SCHEMA_REF) {
                errors.push(`Invalid or missing 'meta.schema' (must be "${GISMU_SCHEMA_REF}"). Found: ${schemaRef}`);
                isValid = false;
            }
        }
    }
    // --- Data Validation ---
    if (!data) {
        errors.push("Missing 'data' map.");
        isValid = false;
    } else {
        // No need for .toJSON()
        const places = data.places as Record<string, PlaceDefinitionStructure> | undefined;
        const translations = data.translations as TranslationStructure[] | undefined;
        // --- Places Validation ---
        if (typeof places !== 'object' || places === null || Array.isArray(places)) {
            errors.push("Invalid or missing 'data.places' (must be an object).");
            isValid = false;
        } else {
            const allowedPlaceKeys = new Set(['x1', 'x2', 'x3', 'x4', 'x5']);
            const actualPlaceKeys = Object.keys(places);
            if (actualPlaceKeys.length === 0) {
                errors.push("'data.places' cannot be empty.");
                isValid = false;
            }
            for (const key of actualPlaceKeys) {
                if (!allowedPlaceKeys.has(key)) {
                    errors.push(`Invalid key "${key}" in 'data.places'. Only x1-x5 are allowed.`);
                    isValid = false;
                }
                const placeDef = places[key];
                if (typeof placeDef !== 'object' || placeDef === null) {
                    errors.push(`Invalid definition for place "${key}" (must be an object).`);
                    isValid = false;
                    continue; // Skip further checks for this invalid place
                }
                if (typeof placeDef.description !== 'string' || placeDef.description.trim() === '') {
                    errors.push(`Missing or invalid 'description' for place "${key}".`);
                    isValid = false;
                }
                if (typeof placeDef.required !== 'boolean') {
                    errors.push(`Missing or invalid 'required' flag for place "${key}".`);
                    isValid = false;
                }
                if (typeof placeDef.validation !== 'object' || placeDef.validation === null) {
                    // Basic check for now, deeper validation later
                    errors.push(`Missing or invalid 'validation' object for place "${key}".`);
                    isValid = false;
                }
            }
        }
        // --- Translations Validation ---
        if (translations !== undefined) { // Translations are optional
            if (!Array.isArray(translations)) {
                errors.push("Invalid 'data.translations' (must be an array).");
                isValid = false;
            } else {
                const placeKeysInData = new Set(places ? Object.keys(places) : []);
                translations.forEach((trans, index) => {
                    if (typeof trans !== 'object' || trans === null) {
                        errors.push(`Invalid translation entry at index ${index} (must be an object).`);
                        isValid = false;
                        return; // Skip further checks for this invalid translation
                    }
                    if (typeof trans.lang !== 'string' || trans.lang.trim().length !== 2) { // Basic lang code check
                        errors.push(`Invalid or missing 'lang' at translations index ${index}.`);
                        isValid = false;
                    }
                    if (typeof trans.name !== 'string' || trans.name.trim() === '') {
                        errors.push(`Invalid or missing 'name' at translations index ${index}.`);
                        isValid = false;
                    }
                    if (typeof trans.description !== 'string' || trans.description.trim() === '') {
                        errors.push(`Invalid or missing 'description' at translations index ${index}.`);
                        isValid = false;
                    }
                    if (typeof trans.places !== 'object' || trans.places === null || Array.isArray(trans.places)) {
                        errors.push(`Invalid or missing 'places' object at translations index ${index}.`);
                        isValid = false;
                    } else {
                        // Check if translation place keys match the main place keys
                        for (const transPlaceKey in trans.places) {
                            if (!placeKeysInData.has(transPlaceKey)) {
                                errors.push(`Translation place key "${transPlaceKey}" at index ${index} does not exist in main data.places.`);
                                isValid = false;
                            }
                            if (typeof trans.places[transPlaceKey] !== 'string') {
                                errors.push(`Translation place value for "${transPlaceKey}" at index ${index} must be a string.`);
                                isValid = false;
                            }
                        }
                        // Check if all main place keys exist in translation
                        for (const mainPlaceKey of placeKeysInData) {
                            if (!(mainPlaceKey in trans.places)) {
                                errors.push(`Main place key "${mainPlaceKey}" is missing in translation places at index ${index}.`);
                                isValid = false;
                            }
                        }
                    }
                });
            }
        }
    }
    return { isValid, errors };
}
// --- Entity Validation ---
/**
 * Validates the structure and basic content of Hominio Entity *JSON data*
 * against its referenced *schema JSON data*.
 *
 * Checks for:
 * - Presence and type of required meta fields (name, schema).
 * - Validity of the schema reference format (@0x...).
 * - Presence and type of required data fields (places).
 * - Existence and basic type validation of entity place values against the schema definition.
 *
 * @param entityJson The entity data as a JSON object.
 * @param schemaJson The schema definition as a JSON object.
 * @returns An object containing `isValid` (boolean) and an array of `errors` (string[]).
 */
export function validateEntityJsonAgainstSchema(
    entityJson: Record<string, unknown>,
    schemaJson: Record<string, unknown>
): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    let isValid = true;
    // Access data directly from JSON objects
    const entityMeta = entityJson.meta as Record<string, unknown> | undefined;
    const entityData = entityJson.data as Record<string, unknown> | undefined;
    // --- Entity Meta Validation ---
    let schemaRef: string | null = null;
    if (!entityMeta) {
        errors.push("Missing entity 'meta' map.");
        isValid = false;
    } else {
        // No need for .toJSON()
        schemaRef = typeof entityMeta.schema === 'string' ? entityMeta.schema : null;
        const name = entityMeta.name;
        if (typeof name !== 'string' || name.trim() === '') {
            errors.push("Invalid or missing entity 'meta.name' (must be a non-empty string).");
            isValid = false;
        }
        if (!schemaRef || !/^@0x[0-9a-f]{64}$/i.test(schemaRef)) {
            errors.push(`Invalid or missing entity 'meta.schema' (must be in @0x... format). Found: ${schemaRef}`);
            isValid = false;
            schemaRef = null; // Prevent using invalid ref later
        }
        // Also check if the entity's schema ref matches the provided schema's pubKey
        const schemaPubKey = schemaJson.pubKey as string | undefined;
        if (schemaRef && schemaPubKey && schemaRef !== `@${schemaPubKey}`) {
            errors.push(`Entity schema reference (${schemaRef}) does not match provided schema pubKey (@${schemaPubKey}).`);
            isValid = false;
        }
    }
    // --- Entity Data Validation ---
    if (!entityData) {
        errors.push("Missing entity 'data' map.");
        isValid = false;
    } else if (!schemaRef) {
        if (isValid) {
            errors.push("Cannot validate entity data without a valid schema reference in meta.schema.");
            isValid = false;
        }
    } else {
        // Schema is provided as JSON, no need to fetch
        const schemaData = schemaJson.data as Record<string, unknown> | undefined;
        // Get places from Schema JSON
        const schemaPlaces = schemaData?.places as Record<string, PlaceDefinitionStructure> | undefined;
        // Get places from Entity JSON
        const entityPlaces = entityData?.places as Record<string, LoroJsonValue> | undefined;
        if (!schemaData || !schemaPlaces) {
            if (isValid) {
                errors.push(`Provided schema JSON is missing 'data.places' definition.`);
                isValid = false;
            }
        } else if (typeof entityPlaces !== 'object' || entityPlaces === null) {
            if (isValid) {
                errors.push("Invalid or missing entity 'data.places' (must be an object).");
                isValid = false;
            }
        }
        // Proceed with validation only if both schema and entity places seem structurally correct so far
        if (isValid && schemaPlaces && entityPlaces) {
            const schemaPlaceKeys = Object.keys(schemaPlaces);
            const entityPlaceKeys = Object.keys(entityPlaces);
            // 1. Check required fields
            for (const schemaKey of schemaPlaceKeys) {
                const schemaPlaceDef = schemaPlaces[schemaKey];
                if (schemaPlaceDef.required && !(schemaKey in entityPlaces)) {
                    errors.push(`Missing required place "${schemaKey}" in entity.`);
                    isValid = false;
                }
            }
            // 2. Check entity keys validity
            for (const entityKey of entityPlaceKeys) {
                if (!(entityKey in schemaPlaces)) {
                    errors.push(`Entity place "${entityKey}" is not defined in schema.`);
                    isValid = false;
                }
            }
            // 3. Validate entity place values
            for (const entityKey in entityPlaces) {
                if (!(entityKey in schemaPlaces)) continue; // Already caught by check 2
                const entityValue = entityPlaces[entityKey];
                const schemaPlaceDef = schemaPlaces[entityKey];
                const schemaValidation = schemaPlaceDef?.validation as Record<string, unknown> | undefined;
                if (!schemaValidation) {
                    errors.push(`Schema place definition for "${entityKey}" is missing the 'validation' object.`);
                    isValid = false;
                    continue;
                }
                // Basic Type/Reference Validation
                const expectedValueType = schemaValidation.value as string | undefined; // e.g., 'string', 'number', 'boolean'
                const expectedSchemaRef = schemaValidation.schema as (string | null)[] | undefined; // e.g., ['prenu', null]
                if (expectedSchemaRef) { // Check if the value should be a reference
                    if (entityValue === null) {
                        if (!expectedSchemaRef.includes(null)) {
                            errors.push(`Place "${entityKey}": null reference is not allowed by schema.`);
                            isValid = false;
                        }
                        // Null reference is allowed and provided, continue
                    } else if (typeof entityValue !== 'string' || !/^@0x[0-9a-f]{64}$/i.test(entityValue)) {
                        errors.push(`Place "${entityKey}" value "${entityValue}" is not a valid schema reference (@0x...).`);
                        isValid = false;
                    } else {
                        // TODO: Need a way to check the *type* (schema name/pubkey) of the referenced entity.
                        // This requires fetching the referenced entity's schema, which is beyond this function's scope.
                        // For now, we only validate the format.
                        // We could check if expectedSchemaRef contains the referenced entity's schema name if names were reliable.
                    }
                } else if (expectedValueType) { // Check if the value should be a primitive
                    const actualValueType = typeof entityValue;
                    if (expectedValueType === 'string' && actualValueType !== 'string') {
                        errors.push(`Place "${entityKey}": Expected string, got ${actualValueType}.`);
                        isValid = false;
                    } else if (expectedValueType === 'number' && actualValueType !== 'number') {
                        errors.push(`Place "${entityKey}": Expected number, got ${actualValueType}.`);
                        isValid = false;
                    } else if (expectedValueType === 'boolean' && actualValueType !== 'boolean') {
                        errors.push(`Place "${entityKey}": Expected boolean, got ${actualValueType}.`);
                        isValid = false;
                    }
                    // Add check for null if type is defined but value is null
                    else if (entityValue === null) {
                        errors.push(`Place "${entityKey}": Expected ${expectedValueType}, got null.`);
                        isValid = false;
                    }
                } else if (entityValue !== null && typeof entityValue === 'object') {
                    // Handle case where schema expects 'any' (no specific type/ref) but value is complex object/array
                    // This might be okay depending on how 'any' is interpreted
                    // For now, we allow it, but could add stricter checks if needed.
                } else if (!schemaValidation) {
                    // No validation rule defined in schema, allow any basic type (string, number, boolean, null)
                    if (!['string', 'number', 'boolean'].includes(typeof entityValue) && entityValue !== null) {
                        errors.push(`Place "${entityKey}": Invalid type ${typeof entityValue} for place with no specific validation.`);
                        isValid = false;
                    }
                }
                // TODO: Complex rule validation (enum, min/max, regex) - requires parsing schemaValidation.value/rule object
            }
        }
    }
    return { isValid, errors };
}
// Add more validation functions later (e.g., for entities, specific validation rules)
````

## File: src/lib/tools/createTodo/manifest.json
````json
{
    "name": "createTodo",
    "skill": "Add new task with tags",
    "icon": "M12 6v6m0 0v6m0-6h6m-6 0H6",
    "color": "blue",
    "temporaryTool": {
        "modelToolName": "createTodo",
        "description": "Create a new todo item. Use this tool when a todo needs to be created. NEVER emit text when doing this tool call. ALWAYS add tags to todos automatically based on the content:\n   - For time-sensitive items, add \"urgent\" or \"important\"\n   - If the user specifies specific tags, use those instead of or in addition to your automatic tags\n",
        "dynamicParameters": [
            {
                "name": "todoText",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "The text content of the todo task to create"
                },
                "required": true
            },
            {
                "name": "tags",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "Optional comma-separated list of tags (e.g. \"work,urgent,home\")"
                },
                "required": false
            },
            {
                "name": "listName",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "Optional name of the list to create the todo in"
                },
                "required": false
            }
        ],
        "client": {}
    },
    "implementationType": "client"
}
````

## File: src/lib/tools/queryTodos/function.ts
````typescript
import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
/**
 * Queries and retrieves todo items, with optional filtering
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs?: {
    tag?: string;
    completed?: boolean;
}): Promise<{ success: boolean; message: string; todos: TodoItem[] }> {
    try {
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();
        // Get operations for todo schema
        const { query } = await loroAPI.getOperations<TodoItem>('todo');
        // Build the query predicate based on input filters
        let todos;
        if (!inputs || (inputs.tag === undefined && inputs.completed === undefined)) {
            // No filters, get all todos
            todos = query(() => true);
        } else {
            // Apply filters
            todos = query(todo => {
                // Check the tag filter if provided
                if (inputs.tag !== undefined) {
                    if (inputs.tag === null) {
                        // null tag means todos with no tags
                        return (!todo.tags || todo.tags.length === 0);
                    } else if (!todo.tags || !todo.tags.includes(inputs.tag)) {
                        return false;
                    }
                }
                // Check the completed filter if provided
                if (inputs.completed !== undefined && todo.completed !== inputs.completed) {
                    return false;
                }
                return true;
            });
        }
        const result = {
            success: true,
            message: `Retrieved ${todos.length} todo items`,
            todos: todos.map(([, todo]) => todo)
        };
        // Log the activity
        logToolActivity('queryTodos', result.message);
        return result;
    } catch (error) {
        console.error('Error querying todos:', error);
        const errorResult = {
            success: false,
            message: `Error: ${error}`,
            todos: []
        };
        // Log the error
        logToolActivity('queryTodos', errorResult.message, false);
        return errorResult;
    }
}
/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function queryTodosImplementation(parameters: ToolParameters): string {
    console.log('Called queryTodos tool with parameters:', parameters);
    try {
        // Handle both object and string parameter formats
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try {
                parsedParams = JSON.parse(parameters);
            } catch (e) {
                console.error('Failed to parse string parameters:', e);
            }
        }
        // Extract parameters
        const tag = parsedParams.tag as string | undefined;
        const completed = typeof parsedParams.completed === 'boolean' ? parsedParams.completed : undefined;
        // Call the new implementation
        const resultPromise = execute({ tag, completed });
        // Handle the promise results
        resultPromise.then(result => {
            console.log('Todos queried with result:', result);
        }).catch(err => {
            console.error('Error in queryTodos execution:', err);
        });
        // For immediate response, return a placeholder
        const result = {
            success: true,
            message: 'Querying todos (results will be processed asynchronously)',
            todos: [] // Empty placeholder - UI should update when async query completes
        };
        // Log activity
        logToolActivity('queryTodos', 'Started todo query operation');
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in queryTodos tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            success: false,
            message: `Error querying todos: ${errorMessage}`,
            todos: []
        };
        // Log error
        logToolActivity('queryTodos', result.message, false);
        return JSON.stringify(result);
    }
}
/**
 * Legacy implementation for backward compatibility with getTodos
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function getTodosImplementation(parameters: ToolParameters): string {
    console.log('Called getTodos tool with parameters (redirecting to queryTodos):', parameters);
    return queryTodosImplementation(parameters);
}
````

## File: src/lib/ultravox/callConfig.ts
````typescript
/**
 * Call configuration for Ultravox.
 * This file contains immutable root call configurations that don't change with agent stages.
 */
import type { CallConfig } from './callFunctions';
/**
 * Default root call configuration
 * 
 * IMMUTABLE PROPERTIES
 * These settings are used for all calls and cannot be changed during a call:
 * - model
 * - firstSpeaker
 * - maxDuration
 * - joinTimeout
 * - timeExceededMessage
 * - inactivityMessages
 * - medium
 * - recordingEnabled
 * 
 * MUTABLE PROPERTIES
 * These properties can be changed with a new stage and should come from vibe manifests:
 * - systemPrompt
 * - temperature
 * - voice
 * - languageHint
 * - initialMessages
 * - selectedTools
 */
export const DEFAULT_CALL_CONFIG: CallConfig = {
    // Immutable properties (cannot change with new stage)
    model: 'fixie-ai/ultravox-70B',
    firstSpeaker: 'FIRST_SPEAKER_AGENT',
    maxDuration: '600s',
    joinTimeout: '30s',
    timeExceededMessage: 'The maximum call duration has been reached.',
    inactivityMessages: [],
    // medium is set in createCall.ts as a complex object { webRtc: {} }
    recordingEnabled: false,
    // Default values for mutable properties
    // These will be overridden by the vibe manifest
    systemPrompt: '',
    temperature: 0.7,
    languageHint: 'en'
};
/**
 * Get the base call configuration that should be used for all calls
 * @returns The base call configuration
 */
export function getBaseCallConfig(): CallConfig {
    return { ...DEFAULT_CALL_CONFIG };
}
/**
 * Todo vibe specific call configuration
 * This only contains the immutable properties
 */
export const TODO_CALL_CONFIG: CallConfig = {
    ...DEFAULT_CALL_CONFIG
};
````

## File: src/lib/ultravox/globalTools.ts
````typescript
/**
 * Global Tools Configuration
 * 
 * This file defines tools that should always be available in any call,
 * regardless of vibe or stage changes.
 */
/**
 * Global call tools that are always available in any stage or vibe
 * These tools are essential for basic call functionality and should always be present
 */
export const GLOBAL_CALL_TOOLS: string[] = [
    'switchVibe'   // Allow switching between vibes from anywhere
    // Add other essential tools here
];
/**
 * Check if a tool is a global call tool
 * @param toolName The name of the tool to check
 * @returns True if the tool is a global call tool, false otherwise
 */
export function isGlobalCallTool(toolName: string): boolean {
    return GLOBAL_CALL_TOOLS.includes(toolName);
}
````

## File: src/routes/hql/+page.svelte
````
<script lang="ts">
	import {
		hominioQLService,
		type HqlQueryRequest,
		type HqlQueryResult,
		type ResolvedHqlDocument,
		type HqlMutationRequest
	} from '$lib/KERNEL/hominio-ql';
	import { readable, type Readable } from 'svelte/store';
	import { slide } from 'svelte/transition';
	// --- Reactive Data Store (Using Auto-Subscription & Effects) ---
	// Schemas
	const allSchemasQuery: HqlQueryRequest = {
		operation: 'query',
		filter: {
			$or: [
				{ meta: { pubKey: '0x0000000000000000000000000000000000000000000000000000000000000000' } }, // Gismu
				{ meta: { schema: '@0x0000000000000000000000000000000000000000000000000000000000000000' } } // Uses Gismu
			]
		}
	};
	const schemasReadable: Readable<HqlQueryResult | null | undefined> =
		hominioQLService.processReactive(allSchemasQuery);
	// Selected Schema State
	let selectedSchemaPubKey = $state<string | null>(null);
	// Entities of Selected Schema
	let entitiesReadable = $state(readable<HqlQueryResult | null | undefined>(undefined));
	// Effect to update the entity query when selected schema changes
	$effect(() => {
		const currentPubKey = selectedSchemaPubKey; // Capture value for the effect
		if (currentPubKey) {
			console.log(`[Effect] Selected schema changed to: ${currentPubKey}. Fetching entities...`);
			const entityQuery: HqlQueryRequest = {
				operation: 'query',
				filter: { meta: { schema: `@${currentPubKey}` } } // Find entities using the selected schema
			};
			// Get the new readable store for entities and assign it to the state variable
			entitiesReadable = hominioQLService.processReactive(entityQuery);
		} else {
			console.log(`[Effect] No schema selected. Resetting entities.`);
			// If no schema selected, reset to an empty/loading state
			entitiesReadable = readable(undefined);
		}
	});
	// Helper function to format validation rules (simplified)
	function formatValidation(validation: any): string {
		if (!validation) return 'any';
		if (validation.schema) return `Ref: ${validation.schema.join(' | ')}`;
		if (validation.value?.options) return `Enum: [${validation.value.options.join(', ')}]`;
		if (validation.value) return `Type: ${validation.value}`;
		return JSON.stringify(validation);
	}
	// --- Prenu Creation ---
	const samplePrenuNames = [
		'Alice',
		'Bob',
		'Charlie',
		'Diana',
		'Ethan',
		'Fiona',
		'George',
		'Hannah',
		'Ian',
		'Julia'
	];
	let isCreatingPrenu = $state(false);
	async function createPrenu() {
		if (isCreatingPrenu) return;
		isCreatingPrenu = true;
		console.log('[Action] Creating new Prenu...');
		try {
			const randomName = samplePrenuNames[Math.floor(Math.random() * samplePrenuNames.length)];
			const prenuSchemaRef =
				'@' + ($schemasReadable?.find((s) => (s.meta as any)?.name === 'prenu')?.pubKey ?? 'prenu'); // Find prenu schema pubkey or fallback to name
			const mutation: HqlMutationRequest = {
				operation: 'mutate',
				action: 'create',
				schema: prenuSchemaRef, // Use the found schema ref or name
				places: {
					x1: randomName
				}
			};
			const result = await hominioQLService.process(mutation);
			console.log('[Action] Prenu creation result:', result);
			// List will update automatically due to reactive query
		} catch (err) {
			console.error('[Action] Error creating Prenu:', err);
			// TODO: Show error to user
		} finally {
			isCreatingPrenu = false;
		}
	}
</script>
<div class="grid h-screen grid-cols-1 bg-gray-100 md:grid-cols-4">
	<!-- Sidebar (Left Column) -->
	<aside class="col-span-1 overflow-y-auto border-r border-gray-300 bg-white p-4">
		<h2 class="mb-4 text-lg font-semibold text-gray-700">Schemas</h2>
		{#if $schemasReadable === undefined}
			<p class="text-sm text-gray-500">Loading schemas...</p>
		{:else if $schemasReadable === null}
			<p class="text-sm text-red-600">Error loading schemas.</p>
		{:else if $schemasReadable.length === 0}
			<p class="text-sm text-yellow-700">No schemas found.</p>
		{:else}
			<ul class="space-y-2">
				{#each $schemasReadable as schema (schema.pubKey)}
					{@const schemaMeta = schema.meta as Record<string, any> | undefined}
					<li>
						<button
							class="w-full rounded px-3 py-2 text-left text-sm transition-colors duration-150 ease-in-out hover:bg-gray-200 {selectedSchemaPubKey ===
							schema.pubKey
								? 'bg-indigo-100 font-medium text-indigo-700'
								: 'text-gray-600'}"
							on:click={() => (selectedSchemaPubKey = schema.pubKey)}
						>
							{schemaMeta?.name ?? 'Unnamed Schema'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>
	<!-- Main Content Area (Right Columns) -->
	<main class="col-span-1 flex flex-col overflow-y-auto p-6 md:col-span-3">
		{#if selectedSchemaPubKey && $schemasReadable}
			{@const selectedSchema = $schemasReadable.find((s) => s.pubKey === selectedSchemaPubKey)}
			{#if selectedSchema}
				{@const selectedMetaData = selectedSchema.meta as Record<string, any> | undefined}
				{@const selectedData = selectedSchema.data as Record<string, any> | undefined}
				{@const places = selectedData?.places as Record<string, any> | undefined}
				<div class="flex-shrink-0 pb-6">
					<div class="mb-4 flex items-center justify-between">
						<h1 class="text-2xl font-bold text-gray-800">
							{selectedMetaData?.name ?? 'Schema Details'}
						</h1>
						{#if selectedMetaData?.name === 'prenu'}
							<button
								class="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
								on:click={createPrenu}
								disabled={isCreatingPrenu}
							>
								{isCreatingPrenu ? 'Creating...' : 'Add Random Prenu'}
							</button>
						{/if}
					</div>
					<p class="mb-1 text-sm text-gray-500">
						PubKey: <code class="rounded bg-gray-200 px-1 text-xs">{selectedSchema.pubKey}</code>
					</p>
					<p class="mb-4 text-sm text-gray-500">
						Schema: <code class="rounded bg-gray-200 px-1 text-xs"
							>{selectedMetaData?.schema ?? 'N/A'}</code
						>
					</p>
					<h2 class="mb-3 text-xl font-semibold text-gray-700">Places</h2>
					{#if places && Object.keys(places).length > 0}
						<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each Object.entries(places) as [key, placeDef] (key)}
								<div class="rounded border border-gray-300 bg-white p-4 shadow-sm">
									<div class="mb-2 flex items-center justify-between">
										<h3 class="font-mono text-lg font-bold text-indigo-600">{key}</h3>
										{#if placeDef.required}
											<span
												class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
												>Required</span
											>
										{/if}
									</div>
									<p class="mb-3 text-sm text-gray-600">
										{placeDef.description ?? 'No description'}
									</p>
									<div class="rounded bg-gray-50 p-2">
										<p class="text-xs font-medium text-gray-500">Validation:</p>
										<p class="text-xs break-words whitespace-pre-wrap text-gray-700">
											<code class="text-xs">{formatValidation(placeDef.validation)}</code>
										</p>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="mb-6 text-sm text-gray-500">No places defined for this schema.</p>
					{/if}
					<details class="mb-6 rounded border border-gray-300 bg-white">
						<summary class="cursor-pointer list-none p-3 font-medium text-gray-700 hover:bg-gray-50"
							>Raw JSON (Schema)</summary
						>
						<div class="border-t border-gray-300 p-3" transition:slide={{ duration: 200 }}>
							<pre
								class="overflow-x-auto rounded bg-gray-50 p-2 text-xs whitespace-pre-wrap text-gray-600">{JSON.stringify(
									selectedSchema,
									null,
									2
								)}</pre>
						</div>
					</details>
				</div>
				<!-- Entities List Section -->
				<div class="flex-grow border-t border-gray-300 pt-6">
					<h2 class="mb-4 text-xl font-semibold text-gray-700">Entities using this Schema</h2>
					<!-- Use $entitiesReadable directly -->
					{#if $entitiesReadable === undefined}
						<p class="text-sm text-gray-500">Loading entities...</p>
					{:else if $entitiesReadable === null}
						<p class="text-sm text-red-600">Error loading entities.</p>
					{:else if $entitiesReadable.length === 0}
						<p class="text-sm text-yellow-700">No entities found using this schema.</p>
					{:else}
						<ul class="divide-y divide-gray-200">
							{#each $entitiesReadable as entity (entity.pubKey)}
								{@const entityMeta = entity.meta as Record<string, any> | undefined}
								{@const entityData = entity.data as Record<string, any> | undefined}
								<li class="py-3">
									<p class="font-medium text-gray-800">
										{entityData?.places?.x1 ?? entityMeta?.name ?? 'Unnamed Entity'}
									</p>
									<p class="text-xs text-gray-500">
										PubKey: <code class="text-xs">{entity.pubKey}</code>
									</p>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else}
				<p class="text-red-600">Error: Selected schema not found in the list.</p>
			{/if}
		{:else}
			<div class="flex h-full items-center justify-center">
				<p class="text-lg text-gray-500">Select a schema from the list to view details.</p>
			</div>
		{/if}
	</main>
</div>
````

## File: src/routes/me/+page.svelte
````
<script lang="ts">
	import { authClient } from '$lib/client/auth-hominio';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import VibeRenderer from '$lib/components/VibeRenderer.svelte';
	export let data: PageData;
	const clientSession = authClient.useSession();
	let loading = false;
	async function handleSignOut() {
		loading = true;
		try {
			await authClient.signOut();
			goto('/');
		} catch (error) {
			console.error('Sign out error:', error);
		} finally {
			loading = false;
		}
	}
</script>
<main class="relative min-h-screen">
	<!-- Background div with image -->
	<div class="absolute inset-0 bg-[url('/bg.jpg')] bg-cover bg-fixed bg-center"></div>
	<!-- Dark overlay with opacity and blur -->
	<div class="absolute inset-0 bg-blue-950/60 backdrop-blur-xs"></div>
	<!-- Content on top -->
	<div class="relative z-10 min-h-screen w-full">
		<VibeRenderer vibeId="home" />
	</div>
	<!-- Logout button in bottom right corner -->
	<button
		onclick={handleSignOut}
		disabled={loading}
		class="fixed right-4 bottom-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-700 disabled:opacity-50"
		title="Sign out"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-6 w-6"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
			/>
		</svg>
	</button>
</main>
````

## File: src/db/utils.ts
````typescript
import { Kind, type TObject } from '@sinclair/typebox'
import {
    createInsertSchema,
    createSelectSchema
} from 'drizzle-typebox'
import type { Table } from 'drizzle-orm'
type Spread<
    T extends TObject | Table,
    Mode extends 'select' | 'insert' | undefined,
> =
    T extends TObject<infer Fields>
    ? {
        [K in keyof Fields]: Fields[K]
    }
    : T extends Table
    ? Mode extends 'select'
    ? ReturnType<typeof createSelectSchema<T>>['properties']
    : Mode extends 'insert'
    ? ReturnType<typeof createInsertSchema<T>>['properties']
    : {}
    : {}
/**
 * Spread a Drizzle schema into a plain object
 */
export const spread = <
    T extends TObject | Table,
    Mode extends 'select' | 'insert' | undefined,
>(
    schema: T,
    mode?: Mode,
): Spread<T, Mode> => {
    const newSchema: Record<string, unknown> = {}
    let table
    switch (mode) {
        case 'insert':
        case 'select':
            if (Kind in schema) {
                table = schema
                break
            }
            table =
                mode === 'insert'
                    ? createInsertSchema(schema)
                    : createSelectSchema(schema)
            break
        default:
            if (!(Kind in schema)) throw new Error('Expect a schema')
            table = schema
    }
    for (const key of Object.keys(table.properties))
        newSchema[key] = table.properties[key]
    return newSchema as any
}
/**
 * Spread a Drizzle Table into a plain object
 *
 * If `mode` is 'insert', the schema will be refined for insert
 * If `mode` is 'select', the schema will be refined for select
 * If `mode` is undefined, the schema will be spread as is, models will need to be refined manually
 */
export const spreads = <
    T extends Record<string, TObject | Table>,
    Mode extends 'select' | 'insert' | undefined,
>(
    models: T,
    mode?: Mode,
): {
        [K in keyof T]: Spread<T[K], Mode>
    } => {
    const newSchema: Record<string, unknown> = {}
    const keys = Object.keys(models)
    for (const key of keys) newSchema[key] = spread(models[key], mode)
    return newSchema as any
}
````

## File: src/lib/auth/auth.ts
````typescript
import { env } from '$env/dynamic/private';
import { betterAuth } from "better-auth";
import pkg from 'pg';
const { Pool } = pkg;
let authInstance: ReturnType<typeof betterAuth> | null = null;
export function getAuthClient(): ReturnType<typeof betterAuth> {
    if (!authInstance) {
        // Initialize only when first requested
        if (!env.SECRET_DATABASE_URL_AUTH || !env.SECRET_GOOGLE_CLIENT_ID || !env.SECRET_GOOGLE_CLIENT_SECRET) {
            // In a pure client-side context (like Tauri build), these might not be available.
            // Handle this gracefully, maybe throw an error or return a mock/dummy client
            // if auth functionality is expected during build (which it usually shouldn't be).
            console.error("Auth environment variables are not available. Auth client cannot be initialized.");
            // For now, we'll throw an error, adjust as needed for your specific build/runtime needs.
            throw new Error("Auth environment variables missing during initialization.");
        }
        authInstance = betterAuth({
            database: new Pool({
                connectionString: env.SECRET_DATABASE_URL_AUTH
            }),
            socialProviders: {
                google: {
                    clientId: env.SECRET_GOOGLE_CLIENT_ID,
                    clientSecret: env.SECRET_GOOGLE_CLIENT_SECRET,
                    redirectUri: 'http://localhost:5173/auth/callback/google'
                },
            },
            trustedOrigins: [
                'http://localhost:5173'
            ]
        });
    }
    return authInstance;
}
````

## File: src/lib/components/views/TodoView.svelte
````
<script lang="ts">
	import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
	import type { TodoItem } from '$lib/docs/schemas/todo';
	import { filterState } from '$lib/tools/filterTodos/function';
	import { getAllUniqueTags } from '$lib/tools/filterTodos/function';
	import { onMount } from 'svelte';
	import { writable, type Writable } from 'svelte/store';
	// Create a store to hold our todos
	const todos: Writable<[string, TodoItem][]> = writable([]);
	// Create a store for filtered todos
	const filteredTodos: Writable<[string, TodoItem][]> = writable([]);
	// Create a store for tags
	const tagsList: Writable<string[]> = writable([]);
	// Initialize LoroAPI and set up subscriptions
	async function initTodos() {
		try {
			// Get the LoroAPI instance
			const loroAPI = getLoroAPIInstance();
			// Get operations for todo schema
			const ops = await loroAPI.getOperations<TodoItem>('todo');
			// Subscribe to the todos store
			ops.store.subscribe((value) => {
				todos.set(value);
				updateFilteredTodos();
				// Try to update tags when todos change
				refreshTags();
			});
			// Initial load of tags
			await refreshTags();
		} catch (error) {
			console.error('Error initializing todos:', error);
		}
	}
	// Load tags from getAllUniqueTags
	async function refreshTags() {
		try {
			const tags = await getAllUniqueTags();
			tagsList.set(tags);
		} catch (error) {
			console.error('Error loading tags:', error);
			tagsList.set([]);
		}
	}
	// Update filtered todos based on the filter state
	function updateFilteredTodos() {
		let filtered = [];
		// Get current values from stores
		const todosList = $todos;
		const { tag, docId } = $filterState;
		// Apply filters
		filtered = todosList.filter(([, todo]) => {
			if (tag === null) {
				return todo.docId === docId;
			}
			return todo.docId === docId && todo.tags && todo.tags.includes(tag);
		});
		filteredTodos.set(filtered);
	}
	// Format date for display
	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}
	// Filter todos by tag
	function filterByTag(tag: string | null) {
		filterState.update((state) => ({ ...state, tag }));
		updateFilteredTodos();
	}
	// Watch for filter state changes to update filtered todos
	$: {
		if ($filterState) {
			updateFilteredTodos();
		}
	}
	// Initialize when component mounts
	onMount(async () => {
		await initTodos();
	});
</script>
<div class="mx-auto max-w-7xl p-4 sm:p-6">
	<!-- Tags Filter -->
	{#if $tagsList.length > 0}
		<div class="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
			<h3 class="mb-2 text-sm font-medium text-white/70">Filter by tag:</h3>
			<div class="flex flex-wrap gap-2">
				<button
					on:click={() => filterByTag(null)}
					class={`rounded-lg px-3 py-1 text-sm transition-colors ${
						$filterState.tag === null
							? 'bg-blue-500/30 text-white'
							: 'bg-white/10 text-white/70 hover:bg-white/20'
					}`}
				>
					All
				</button>
				{#each $tagsList as tag}
					<button
						on:click={() => filterByTag(tag)}
						class={`rounded-lg px-3 py-1 text-sm transition-colors ${
							$filterState.tag === tag
								? 'bg-blue-500/30 text-white'
								: 'bg-white/10 text-white/70 hover:bg-white/20'
						}`}
					>
						{tag}
					</button>
				{/each}
			</div>
		</div>
	{/if}
	<!-- Todo List -->
	<div class="space-y-3">
		{#if $filteredTodos.length === 0}
			<div
				class="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-12 text-white/60 backdrop-blur-sm"
			>
				No todos yet. Start by saying "Create a todo to..."
			</div>
		{:else}
			{#each $filteredTodos as [id, todo] (id)}
				<div
					class="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors hover:bg-white/10"
				>
					<div class="flex flex-col p-4">
						<div class="flex items-center justify-between">
							<div class="flex min-w-0 flex-1 items-center gap-4">
								<div
									class={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
										todo.completed
											? 'border-green-500 bg-green-500/20 text-green-400'
											: 'border-white/20 bg-white/5 text-transparent'
									}`}
								>
									{#if todo.completed}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2.5"
												d="M5 13l4 4L19 7"
											/>
										</svg>
									{/if}
								</div>
								<span
									class={todo.completed
										? 'truncate text-white/50 line-through'
										: 'truncate text-white/90'}
								>
									{todo.text}
								</span>
							</div>
							<span class="text-xs text-white/40">
								{formatDate(todo.createdAt)}
							</span>
						</div>
						{#if todo.tags && todo.tags.length > 0}
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#each todo.tags as tag}
									<span class="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">
										{tag}
									</span>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<div
					class="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-12 text-white/60 backdrop-blur-sm"
				>
					No todos match the selected filter
				</div>
			{/each}
		{/if}
	</div>
</div>
<style>
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
	}
</style>
````

## File: src/lib/KERNEL/hominio-db.ts
````typescript
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { LoroDoc, LoroMap } from 'loro-crdt';
import { hashService } from './hash-service';
import { docIdService } from './docid-service';
import { getContentStorage, getDocsStorage, initStorage } from './hominio-storage';
import { authClient } from '$lib/client/auth-hominio'; // Assumed path for auth client
import { canRead, canWrite, type CapabilityUser, canDelete } from './hominio-capabilities'; // Import capabilities
// --- Reactivity Notifier ---
// Simple store that increments when any tracked document changes.
// Consumed by services like HQL to trigger re-queries.
export const docChangeNotifier = writable(0);
// --------------------------
// Constants
const CONTENT_TYPE_SNAPSHOT = 'snapshot';
// Utility Types (mirrored from hominio-validate)
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];
/**
 * Docs interface represents the document registry for tracking and searching
 */
export interface Docs {
    pubKey: string;          // Stable document identity (like IPNS)
    owner: string;           // Document owner
    updatedAt: string;       // Last update timestamp
    snapshotCid?: string;    // Content hash of latest snapshot (like IPFS)
    updateCids?: string[];   // Content hashes of incremental updates
    // Local state tracking for sync
    localState?: {
        snapshotCid?: string;  // Local snapshot that needs syncing
        updateCids?: string[]; // Local updates that need syncing
    };
}
/**
 * Content represents the binary content of a document with its metadata
 */
export interface Content {
    cid: string;             // Content identifier (hash)
    type: string;            // 'snapshot' or 'update'
    raw: Uint8Array;         // Raw binary data (serialized LoroDoc)
    metadata: Record<string, unknown>; // Mirrored metadata for indexability
    createdAt: string;
}
/**
 * DocContentState represents the current loaded state of a document
 */
export interface DocContentState {
    content: unknown;
    loading: boolean;
    error: string | null;
    sourceCid: string | null;
    isLocalSnapshot: boolean;
    appliedUpdates?: number; // Number of updates applied to the content
}
// Svelte stores for reactive UI
const docs = writable<Docs[]>([]);
const selectedDoc = writable<Docs | null>(null);
const status = writable({
    loading: false,
    error: false,
    creatingDoc: false
});
const error = writable<string | null>(null);
const docContent = writable<DocContentState>({
    content: null,
    loading: false,
    error: null,
    sourceCid: null,
    isLocalSnapshot: false
});
// Map to hold active Loro document instances
const activeLoroDocuments = new Map<string, LoroDoc>();
/**
 * HominioDB class implements the Content layer functionality
 */
class HominioDB {
    // Expose Svelte stores for reactive UI
    docs = docs;
    selectedDoc = selectedDoc;
    status = status;
    error = error;
    docContent = docContent;
    constructor() {
        if (browser) {
            this.initialize().catch(err => {
                console.error('Failed to initialize HominioDB:', err);
                this.setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
            });
        }
    }
    /**
     * Initialize the database and load all documents
     */
    private async initialize(): Promise<void> {
        try {
            this.setStatus({ loading: true });
            // Initialize storage adapters
            await initStorage();
            // Load all documents
            await this.loadAllDocs();
            this.setStatus({ loading: false });
        } catch (err) {
            this.setError(`Initialization error: ${err instanceof Error ? err.message : String(err)}`);
            this.setStatus({ loading: false });
            throw err;
        }
    }
    /**
     * Load all documents from storage
     */
    public async loadAllDocs(): Promise<void> {
        try {
            const docsStorage = getDocsStorage();
            const allItems = await docsStorage.getAll();
            const loadedDocs: Docs[] = [];
            for (const item of allItems) {
                try {
                    if (item.value) {
                        // Get the Uint8Array value
                        const data = await docsStorage.get(item.key);
                        if (data) {
                            // Convert binary data to string and parse JSON
                            const docString = new TextDecoder().decode(data);
                            const doc = JSON.parse(docString) as Docs;
                            loadedDocs.push(doc);
                        }
                    }
                } catch (parseErr) {
                    console.error(`Error parsing document ${item.key}:`, parseErr);
                }
            }
            // Set loaded docs to store with a new array reference to trigger reactivity
            docs.set([...loadedDocs]);
            // If we have a selected document, make sure we reload its content
            const currentSelectedDoc = get(selectedDoc);
            if (currentSelectedDoc) {
                const refreshedDoc = loadedDocs.find(d => d.pubKey === currentSelectedDoc.pubKey);
                if (refreshedDoc) {
                    selectedDoc.set({ ...refreshedDoc });  // Force reactivity update
                    await this.loadDocumentContent(refreshedDoc);
                }
            }
        } catch (err) {
            console.error('Error loading documents:', err);
            this.setError(`Failed to load documents: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Create a new document
     * @param options Document creation options
     * @returns PubKey of the created document
     */
    async createDocument(options: { name?: string; description?: string } = {}): Promise<string> {
        this.setStatus({ creatingDoc: true });
        try {
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!currentUser) {
                throw new Error('Permission denied: User must be logged in to create documents.');
            }
            const pubKey = await docIdService.generateDocId();
            // Use the actual logged-in user ID as the owner
            const owner = currentUser.id;
            const now = new Date().toISOString();
            const newDocMeta: Docs = {
                pubKey,
                owner, // Set owner to current user
                updatedAt: now
            };
            // Get or create the Loro document instance (this also sets up the subscription)
            const loroDoc = await this.getOrCreateLoroDoc(pubKey);
            // Set initial metadata if provided (this triggers the Loro change event)
            const meta = loroDoc.getMap('meta');
            if (options.name) {
                meta.set('name', options.name);
            }
            if (options.description) {
                meta.set('description', options.description);
            }
            // Initial Snapshot Persistence (Still needed for new docs)
            // Note: The Loro event handler might trigger *another* persistence for the meta updates,
            //       this might need refinement later to only persist once or handle idempotency.
            const snapshot = loroDoc.export({ mode: 'snapshot' });
            const snapshotCid = await hashService.hashSnapshot(snapshot);
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshot, {
                type: 'snapshot',
                documentPubKey: pubKey,
                created: now
            });
            // Update document metadata with snapshot info
            newDocMeta.localState = { snapshotCid: snapshotCid }; // Mark for sync
            newDocMeta.snapshotCid = snapshotCid; // Set initial snapshot CID
            // Save initial document metadata to docs storage
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDocMeta)));
            // --- REMOVED SVELTE STORE UPDATES --- 
            // The Loro change handler (`_handleLoroChange`) will now update 
            // the stores based on the Loro event triggered by meta.set().
            // It will also handle selecting the new doc if needed.
            // docs.update(docs => [...docs, newDocMeta]);
            // await this.selectDoc(newDocMeta); // Selection handled by Loro event now?
            // ------------------------------------ 
            // We might still want to explicitly select the doc after creation?
            // Let's keep this for now, but be aware the event handler also selects.
            const finalDocMeta = await this.getDocument(pubKey); // Get potentially updated meta
            if (finalDocMeta) {
                await this.selectDoc(finalDocMeta);
            } else {
                console.warn(`[createDocument] Failed to get final metadata for ${pubKey} after creation.`);
            }
            return pubKey;
        } catch (err) {
            console.error('Error creating document:', err);
            this.setError(`Failed to create document: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        } finally {
            this.setStatus({ creatingDoc: false });
        }
    }
    /**
     * Select a document and load its content
     * @param doc Document to select
     */
    async selectDoc(doc: Docs): Promise<void> {
        selectedDoc.set(doc);
        if (doc) {
            try {
                // Determine which snapshot CID to use
                const snapshotCid = doc.localState?.snapshotCid || doc.snapshotCid;
                // Get or create a Loro doc instance for this document
                await this.getOrCreateLoroDoc(doc.pubKey, snapshotCid);
                // Load content (capability check is inside this method)
                await this.loadDocumentContent(doc);
            } catch (err) {
                console.error(`Error selecting doc ${doc.pubKey}:`, err);
                this.setError('Failed to load document data');
                // Error might be due to permissions from loadDocumentContent
                const currentContent = get(docContent);
                if (currentContent.error?.includes('Permission denied')) {
                    this.setError(currentContent.error);
                }
            }
        }
    }
    /**
     * Get or create a Loro document instance
     * @param pubKey Document public key
     * @param snapshotCid Optional snapshot CID to initialize from
     */
    private async getOrCreateLoroDoc(pubKey: string, snapshotCid?: string): Promise<LoroDoc> {
        // If we already have an active instance, return it
        if (activeLoroDocuments.has(pubKey)) {
            return activeLoroDocuments.get(pubKey)!;
        }
        console.log(`[Loro Management] Creating or loading LoroDoc for ${pubKey}...`);
        // Create a new LoroDoc instance
        const loroDoc = new LoroDoc();
        let loadedFromStorage = false;
        // Try to load binary data if we have a snapshot CID
        if (snapshotCid) {
            const contentStorage = getContentStorage();
            const binaryData = await contentStorage.get(snapshotCid);
            if (binaryData) {
                try {
                    // Initialize with stored data
                    loroDoc.import(binaryData);
                    console.log(`[Loro Management] Loaded Loro doc ${pubKey} from snapshot ${snapshotCid}`);
                    loadedFromStorage = true;
                } catch (err) {
                    console.error(`[Loro Management] Error importing binary data for doc ${pubKey}:`, err);
                    // Proceed with an empty doc if import fails?
                }
            }
        }
        if (!loadedFromStorage) {
            console.log(`[Loro Management] Initializing empty LoroDoc for ${pubKey}.`);
        }
        // *** Add Loro Subscription ***
        // Subscribe to changes and trigger our handler
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        loroDoc.subscribe((_event) => {
            // console.log(`[Loro Subscribe Callback] Event for ${pubKey}`); // Simple log to use _event context implicitly via pubKey
            // TODO: Investigate event properties to see if we can reliably ignore local-only echoes
            // if (_event.local) return; 
            // Use a non-blocking way to handle the change to avoid blocking Loro
            setTimeout(() => {
                this._handleLoroChange(pubKey, loroDoc).catch(err => {
                    console.error(`[Loro Subscribe Callback] Error handling change for ${pubKey}:`, err);
                });
            }, 0);
        });
        console.log(`[Loro Management] Subscribed to changes for ${pubKey}.`);
        // ***************************
        // Store in the active documents map
        activeLoroDocuments.set(pubKey, loroDoc);
        return loroDoc;
    }
    /**
     * Load document content including all updates
     * @param doc Document to load content for
     */
    async loadDocumentContent(doc: Docs): Promise<void> {
        // *** Capability Check ***
        const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
        if (!canRead(currentUser, doc)) {
            console.warn(`Permission denied: User ${currentUser?.id ?? 'anonymous'} cannot read doc ${doc.pubKey} owned by ${doc.owner}`);
            docContent.set({
                content: null,
                loading: false,
                error: `Permission denied: Cannot read this document.`,
                sourceCid: null,
                isLocalSnapshot: false
            });
            return; // Don't proceed if read permission denied
        }
        // *** End Capability Check ***
        docContent.update(state => ({ ...state, loading: true, error: null }));
        try {
            // Determine which snapshot CID to use - prioritize local snapshot
            const snapshotCid = doc.localState?.snapshotCid || doc.snapshotCid;
            const isLocalSnapshot = !!doc.localState?.snapshotCid;
            if (!snapshotCid) {
                docContent.set({
                    content: { note: "No snapshot available for this document" },
                    loading: false,
                    error: null,
                    sourceCid: null,
                    isLocalSnapshot: false
                });
                return;
            }
            console.log(`Loading snapshot with CID: ${snapshotCid}, isLocal: ${isLocalSnapshot}`);
            // Load snapshot binary data
            const contentStorage = getContentStorage();
            const snapshotData = await contentStorage.get(snapshotCid);
            if (!snapshotData) {
                docContent.set({
                    content: null,
                    loading: false,
                    error: `Could not load snapshot content for CID: ${snapshotCid}`,
                    sourceCid: snapshotCid,
                    isLocalSnapshot
                });
                return;
            }
            console.log(`Loaded snapshot data, size: ${snapshotData.byteLength} bytes`);
            // Create a temporary LoroDoc to import the data
            const tempDoc = new LoroDoc();
            try {
                // Import the snapshot with proper error handling
                tempDoc.import(snapshotData);
                console.log(`Loaded base snapshot from CID: ${snapshotCid}`);
            } catch (importErr) {
                console.error(`Error importing snapshot data:`, importErr);
                docContent.set({
                    content: null,
                    loading: false,
                    error: `Failed to import snapshot: ${importErr instanceof Error ? importErr.message : 'Unknown error'}`,
                    sourceCid: snapshotCid,
                    isLocalSnapshot
                });
                return;
            }
            // Track number of updates applied
            let appliedUpdates = 0;
            // Gather all update CIDs (both from server and local)
            const allUpdateCids = [
                ...(doc.updateCids || []),
                ...(doc.localState?.updateCids || [])
            ];
            // Apply all updates in order
            for (const updateCid of allUpdateCids) {
                const updateData = await contentStorage.get(updateCid);
                if (updateData) {
                    try {
                        tempDoc.import(updateData);
                        appliedUpdates++;
                        console.log(`Applied update from CID: ${updateCid}`);
                    } catch (err) {
                        console.error(`Error applying update ${updateCid}:`, err);
                    }
                } else {
                    console.warn(`Could not load update data for CID: ${updateCid}`);
                }
            }
            // Get JSON representation of the fully updated document
            let content;
            try {
                content = tempDoc.toJSON();
                console.log(`Successfully converted Loro doc to JSON:`, content);
            } catch (jsonErr) {
                console.error(`Error converting Loro doc to JSON:`, jsonErr);
                docContent.set({
                    content: null,
                    loading: false,
                    error: `Failed to convert document to JSON: ${jsonErr instanceof Error ? jsonErr.message : 'Unknown error'}`,
                    sourceCid: snapshotCid,
                    isLocalSnapshot
                });
                return;
            }
            docContent.set({
                content,
                loading: false,
                error: null,
                sourceCid: snapshotCid,
                isLocalSnapshot,
                appliedUpdates // Add number of updates applied
            });
            console.log(`Document content loaded with ${appliedUpdates} updates applied`);
        } catch (err) {
            console.error('Error loading document content:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to load document content';
            docContent.set({
                content: null,
                loading: false,
                error: errorMessage,
                sourceCid: null,
                isLocalSnapshot: false
            });
        }
    }
    /**
     * Update a document in storage
     * @param pubKey Document public key
     * @param mutationFn Function that mutates the document
     * @returns CID of the update
     */
    async updateDocument(pubKey: string, mutationFn: (doc: LoroDoc) => void): Promise<string> {
        // Get current metadata for capability check BEFORE getting LoroDoc
        const docMeta = await this.getDocument(pubKey);
        if (!docMeta) {
            throw new Error(`Document ${pubKey} not found for update.`);
        }
        // *** Capability Check ***
        const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
        if (!canWrite(currentUser, docMeta)) {
            throw new Error('Permission denied: Cannot write to this document');
        }
        // *** End Capability Check ***
        // Get the Loro document instance (this ensures it's active and subscribed)
        const loroDoc = await this.getOrCreateLoroDoc(pubKey, docMeta.snapshotCid);
        // Apply the mutation (this triggers the Loro change event)
        mutationFn(loroDoc);
        // --- REMOVED PERSISTENCE & SVELTE STORE UPDATES --- 
        // The Loro change handler (`_handleLoroChange`) is now responsible for:
        // 1. Exporting the update from the modified `loroDoc`.
        // 2. Persisting the update via `persistLoroUpdate`.
        // 3. Updating all relevant Svelte stores (`docs`, `selectedDoc`, `docContent`).
        // We might need the update CID here for some reason? 
        // If so, we'd have to export here, hash, but NOT persist/update stores.
        // For now, assume the CID isn't immediately needed by the caller.
        // const updateData: Uint8Array = loroDoc.export({ mode: 'update' });
        // const updateCid: string = await hashService.hashSnapshot(updateData);
        // return updateCid; // <--- Return CID if needed by caller
        // ---------------------------------------------------- 
        // Return something? Maybe pubKey or void?
        // Returning pubKey seems reasonable.
        return pubKey;
        // Note: Error handling is implicitly handled by the caller or the top-level try/catch
    }
    /**
     * Add a random property to a document (for testing purposes)
     * @param pubKey Document public key
     * @returns True if successful
     */
    async addRandomPropertyToDocument(pubKey?: string): Promise<boolean> {
        const targetPubKey = pubKey || get(selectedDoc)?.pubKey;
        if (!targetPubKey) {
            this.setError('No document selected');
            return false;
        }
        // Capability check happens inside updateDocument call below
        try {
            await this.updateDocument(targetPubKey, (loroDoc) => {
                // Generate random property key and value
                const randomKey = `prop_${Math.floor(Math.random() * 10000)}`;
                const randomValue = `value_${Math.floor(Math.random() * 10000)}`;
                // Add to Loro document using the data map
                const dataMap = loroDoc.getMap('data');
                dataMap.set(randomKey, randomValue);
                console.log(`[addRandomProperty] Added to LoroDoc: ${randomKey}=${randomValue}`);
            });
            // --- REMOVED REFRESH LOGIC ---
            // The Loro change handler will automatically update the content store 
            // if the currently selected document was the one modified.
            // const currentSelectedDoc = get(selectedDoc);
            // if (currentSelectedDoc && currentSelectedDoc.pubKey === targetPubKey) {
            // 	await this.loadDocumentContent(currentSelectedDoc);
            // }
            // ----------------------------
            return true;
        } catch (err) {
            console.error('[addRandomProperty] Error:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to add random property');
            return false;
        }
    }
    /**
     * Create a consolidated snapshot by applying all updates
     * @param pubKey Document public key
     * @returns The new snapshot CID or null if failed
     */
    async createConsolidatedSnapshot(pubKey?: string): Promise<string | null> {
        try {
            const targetPubKey = pubKey || get(selectedDoc)?.pubKey;
            if (!targetPubKey) {
                this.setError('No document selected');
                return null;
            }
            const doc = get(docs).find(d => d.pubKey === targetPubKey);
            if (!doc) {
                this.setError('Document not found');
                return null;
            }
            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!canWrite(currentUser, doc)) {
                this.setError('Permission denied: Cannot create snapshot for this document');
                return null;
            }
            // *** End Capability Check ***
            // Check if document has updates to consolidate
            if (!doc.updateCids || doc.updateCids.length === 0) {
                this.setError('No updates available to create a snapshot');
                return null;
            }
            this.setStatus({ loading: true });
            // Get or create the LoroDoc instance with all updates applied
            const loroDoc = await this.getOrCreateLoroDoc(targetPubKey);
            // Export as a new snapshot
            const snapshotData = loroDoc.export({ mode: 'snapshot' });
            // Generate content hash for the snapshot
            const snapshotCid = await hashService.hashSnapshot(snapshotData);
            // Save snapshot binary
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshotData, {
                type: CONTENT_TYPE_SNAPSHOT,
                documentPubKey: targetPubKey
            });
            // Create updated doc with new snapshot and no updates
            const updatedDoc: Docs = {
                ...doc,
                updatedAt: new Date().toISOString(),
                snapshotCid,      // Update main snapshot CID
                updateCids: [],   // Clear update CIDs since they're consolidated
                localState: {
                    ...(doc.localState || {}),
                    snapshotCid     // Mark new snapshot for syncing
                }
            };
            // Save updated document metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(targetPubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));
            // Update the docs store
            docs.update(docList => {
                const index = docList.findIndex(d => d.pubKey === targetPubKey);
                if (index !== -1) {
                    docList[index] = updatedDoc;
                }
                return docList;
            });
            // Update selected doc if this is the current one
            const currentSelectedDoc = get(selectedDoc);
            if (currentSelectedDoc && currentSelectedDoc.pubKey === targetPubKey) {
                selectedDoc.set({ ...updatedDoc }); // Force reactivity update
                await this.loadDocumentContent(updatedDoc);
            }
            return snapshotCid;
        } catch (err) {
            console.error('Error creating consolidated snapshot:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to create snapshot');
            return null;
        } finally {
            this.setStatus({ loading: false });
        }
    }
    /**
     * Get all documents that have local changes that need syncing
     * @returns Array of documents with local changes
     */
    async getDocumentsWithLocalChanges(): Promise<Docs[]> {
        try {
            const allDocs = get(docs);
            return allDocs.filter(doc =>
                doc.localState && (
                    doc.localState.snapshotCid ||
                    (doc.localState.updateCids && doc.localState.updateCids.length > 0)
                )
            );
        } catch (err) {
            console.error('Error getting documents with local changes:', err);
            return [];
        }
    }
    /**
     * Clear local changes after they are synced to server
     * @param pubKey Document public key
     * @param changes Changes to clear (snapshot and/or updates)
     */
    async clearLocalChanges(pubKey: string, changes: {
        snapshotCid?: string,
        updateCids?: string[]
    }): Promise<void> {
        try {
            // Get the document metadata
            const allDocs = get(docs);
            const docIndex = allDocs.findIndex(d => d.pubKey === pubKey);
            if (docIndex === -1) {
                throw new Error(`Document ${pubKey} not found`);
            }
            const doc = allDocs[docIndex];
            // Skip if no local state
            if (!doc.localState) {
                return;
            }
            let updatedDoc: Docs;
            // Create new local state object
            const newLocalState = { ...doc.localState };
            // Clear snapshot if needed
            if (changes.snapshotCid && doc.localState.snapshotCid === changes.snapshotCid) {
                newLocalState.snapshotCid = undefined;
            }
            // Clear updates if needed
            if (changes.updateCids && changes.updateCids.length > 0 && newLocalState.updateCids) {
                newLocalState.updateCids = newLocalState.updateCids.filter(
                    cid => !changes.updateCids?.includes(cid)
                );
            }
            // Check if localState should be removed entirely
            if (!newLocalState.snapshotCid &&
                (!newLocalState.updateCids || newLocalState.updateCids.length === 0)) {
                // Create a new object without the localState property
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { localState, ...docWithoutLocalState } = doc;
                updatedDoc = docWithoutLocalState;
            } else {
                // Keep the updated localState
                updatedDoc = { ...doc, localState: newLocalState };
            }
            // Save updated document metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));
            // Update the store
            allDocs[docIndex] = updatedDoc;
            docs.set([...allDocs]);
        } catch (err) {
            console.error('Error clearing local changes:', err);
            throw err;
        }
    }
    /**
     * Update local document state after successful sync to server.
     * Moves synced snapshot/updates from localState to the main fields.
     * @param pubKey Document public key
     * @param changes Changes that were successfully synced
     */
    async updateDocStateAfterSync(pubKey: string, changes: {
        snapshotCid?: string,
        updateCids?: string[]
    }): Promise<void> {
        try {
            const allDocs = get(docs);
            const docIndex = allDocs.findIndex(d => d.pubKey === pubKey);
            if (docIndex === -1) {
                console.warn(`[updateDocStateAfterSync] Doc ${pubKey} not found.`);
                return;
            }
            const originalDoc = allDocs[docIndex];
            const updatedDoc = { ...originalDoc }; // Create a mutable copy
            let needsSave = false;
            // 1. Handle Synced Snapshot
            if (changes.snapshotCid && updatedDoc.localState?.snapshotCid === changes.snapshotCid) {
                updatedDoc.snapshotCid = changes.snapshotCid; // Promote to main snapshot
                if (updatedDoc.localState) {
                    updatedDoc.localState.snapshotCid = undefined; // Clear from local state
                }
                needsSave = true;
                console.log(`[updateDocStateAfterSync] Promoted snapshot ${changes.snapshotCid} for ${pubKey}`);
            }
            // 2. Handle Synced Updates
            if (changes.updateCids && changes.updateCids.length > 0 && updatedDoc.localState?.updateCids) {
                const syncedCids = changes.updateCids;
                const originalLocalUpdates = updatedDoc.localState.updateCids || [];
                // Add synced updates to main list (avoid duplicates)
                updatedDoc.updateCids = updatedDoc.updateCids || [];
                syncedCids.forEach(cid => {
                    if (!updatedDoc.updateCids?.includes(cid)) {
                        updatedDoc.updateCids?.push(cid);
                    }
                });
                // Remove synced updates from local state
                updatedDoc.localState.updateCids = originalLocalUpdates.filter(
                    cid => !syncedCids.includes(cid)
                );
                needsSave = true;
                console.log(`[updateDocStateAfterSync] Processed ${syncedCids.length} synced updates for ${pubKey}`);
            }
            // 3. Clean up localState if empty
            if (updatedDoc.localState && !updatedDoc.localState.snapshotCid && (!updatedDoc.localState.updateCids || updatedDoc.localState.updateCids.length === 0)) {
                delete updatedDoc.localState;
                needsSave = true;
                console.log(`[updateDocStateAfterSync] Removed empty localState for ${pubKey}`);
            }
            // 4. Save if changes were made
            if (needsSave) {
                updatedDoc.updatedAt = new Date().toISOString(); // Update timestamp
                const docsStorage = getDocsStorage();
                await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDoc)));
                // Update the store
                allDocs[docIndex] = updatedDoc;
                docs.set([...allDocs]);
                console.log(`[updateDocStateAfterSync] Saved updated state for ${pubKey}`);
                // If this is the selected document, update it too
                const currentSelected = get(selectedDoc);
                if (currentSelected && currentSelected.pubKey === pubKey) {
                    selectedDoc.set({ ...updatedDoc });
                }
            }
        } catch (err) {
            console.error('[updateDocStateAfterSync] Error:', err);
            // Don't throw, log the error
        }
    }
    /**
     * Import content into the database
     * @param binaryData Binary data to import
     * @param options Import options
     * @returns The document pubKey and snapshot CID
     */
    async importContent(binaryData: Uint8Array, options: {
        pubKey?: string,
        owner?: string
    } = {}): Promise<{ pubKey: string, snapshotCid: string }> {
        try {
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!currentUser) {
                throw new Error("Permission denied: User must be logged in to import content.");
            }
            // Create a new LoroDoc to analyze the content
            const tempDoc = new LoroDoc();
            tempDoc.import(binaryData);
            // Generate content hash
            const snapshotCid = await hashService.hashSnapshot(binaryData);
            // Get or generate a pubKey
            const pubKey = options.pubKey || docIdService.generateDocId();
            // Store the content
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, binaryData, {
                type: CONTENT_TYPE_SNAPSHOT,
                documentPubKey: pubKey
            });
            // Try to extract metadata from the Loro document
            interface DocMetadata {
                name: string;
                description?: string;
            }
            const docMetadata: DocMetadata = { name: "Imported Document" };
            try {
                const meta = tempDoc.getMap("meta");
                if (meta.get("name") !== undefined) {
                    docMetadata.name = meta.get("name") as string;
                }
                if (meta.get("description") !== undefined) {
                    docMetadata.description = meta.get("description") as string;
                }
                // Use the metadata in newDoc below
                console.log('Extracted metadata:', docMetadata);
            } catch (metaErr) {
                console.warn('Could not extract metadata from imported document', metaErr);
            }
            // Create document metadata
            const now = new Date().toISOString();
            const newDoc: Docs = {
                pubKey,
                owner: options.owner || currentUser.id, // Use current user ID as owner
                updatedAt: now,
                snapshotCid,
                updateCids: [],
                localState: {
                    snapshotCid: snapshotCid
                }
            };
            // Store document metadata
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDoc)));
            // Update the docs store
            docs.update(docList => [newDoc, ...docList]);
            return { pubKey, snapshotCid };
        } catch (err) {
            console.error('Error importing content:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to import content');
            throw err;
        }
    }
    /**
     * Export content
     * @param pubKey Document public key
     * @param options Export options
     * @returns Binary data
     */
    async exportContent(pubKey: string, options: { mode?: 'snapshot' | 'update' } = {}): Promise<Uint8Array> {
        try {
            const doc = get(docs).find(d => d.pubKey === pubKey);
            if (!doc) {
                throw new Error('Document not found');
            }
            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!canRead(currentUser, doc)) {
                throw new Error('Permission denied: Cannot read this document to export');
            }
            // *** End Capability Check ***
            // Get the LoroDoc instance
            const loroDoc = await this.getOrCreateLoroDoc(pubKey);
            // Export based on requested mode
            return loroDoc.export({ mode: options.mode || 'snapshot' });
        } catch (err) {
            console.error('Error exporting content:', err);
            this.setError(err instanceof Error ? err.message : 'Failed to export content');
            throw err;
        }
    }
    /**
     * Set status
     * @param newStatus Status update
     */
    private setStatus(newStatus: Partial<{ loading: boolean; error: boolean; creatingDoc: boolean }>): void {
        status.update(s => ({ ...s, ...newStatus }));
    }
    /**
     * Set error message
     * @param message Error message
     */
    private setError(message: string | null): void {
        error.set(message);
    }
    /**
     * Delete a document
     * @param pubKey Document public key
     * @returns True if successful, otherwise throws an error
     */
    async deleteDocument(pubKey: string): Promise<boolean> {
        try {
            const allDocs = get(docs);
            const docIndex = allDocs.findIndex(d => d.pubKey === pubKey);
            if (docIndex === -1) {
                throw new Error(`Document ${pubKey} not found`);
            }
            const doc = allDocs[docIndex];
            // *** Capability Check ***
            const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
            if (!canDelete(currentUser, doc)) {
                throw new Error('Permission denied: Cannot delete this document');
            }
            // *** End Capability Check ***
            // Remove from the docs store
            allDocs.splice(docIndex, 1);
            docs.set([...allDocs]);
            // Clear selected doc if it's the one being deleted
            const currentSelected = get(selectedDoc);
            if (currentSelected && currentSelected.pubKey === pubKey) {
                selectedDoc.set(null);
                docContent.set({
                    content: null,
                    loading: false,
                    error: null,
                    sourceCid: null,
                    isLocalSnapshot: false
                });
            }
            // Close and cleanup any active LoroDoc instance
            if (activeLoroDocuments.has(pubKey)) {
                activeLoroDocuments.delete(pubKey);
            }
            // Delete from local storage
            const docsStorage = getDocsStorage();
            await docsStorage.delete(pubKey);
            // Note: We don't delete content CIDs here as they might be reused
            // The server handles content cleanup based on reference checks
            return true;
        } catch (err) {
            console.error('Error deleting document:', err);
            this.setError(`Failed to delete document: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }
    }
    /**
     * Clean up resources
     */
    destroy(): void {
        // Close all active Loro documents
        activeLoroDocuments.clear();
    }
    /**
     * Load all document metadata from storage and return them as an array.
     * Does not update the Svelte store.
     * @returns Array of Docs metadata.
     */
    public async loadAllDocsReturn(): Promise<Docs[]> {
        try {
            const docsStorage = getDocsStorage();
            const allItems = await docsStorage.getAll();
            const loadedDocs: Docs[] = [];
            for (const item of allItems) {
                try {
                    if (item.value) {
                        const data = await docsStorage.get(item.key);
                        if (data) {
                            const docString = new TextDecoder().decode(data);
                            const doc = JSON.parse(docString) as Docs;
                            loadedDocs.push(doc);
                        }
                    }
                } catch (parseErr) {
                    console.error(`Error parsing document ${item.key} in loadAllDocsReturn:`, parseErr);
                }
            }
            return loadedDocs;
        } catch (err) {
            console.error('Error loading documents in loadAllDocsReturn:', err);
            return []; // Return empty array on error
        }
    }
    /**
     * Get the metadata for a single document by its pubKey.
     * Does not update the Svelte store.
     * @param pubKey The public key of the document.
     * @returns The Docs metadata or null if not found or error.
     */
    public async getDocument(pubKey: string): Promise<Docs | null> {
        try {
            const docsStorage = getDocsStorage();
            const data = await docsStorage.get(pubKey);
            if (data) {
                const docString = new TextDecoder().decode(data);
                return JSON.parse(docString) as Docs;
            }
            return null;
        } catch (err) {
            console.error(`Error getting document ${pubKey}:`, err);
            return null;
        }
    }
    /**
     * Retrieves or reconstructs the LoroDoc instance for a given pubKey.
     * Handles loading snapshot and applying updates from storage.
     * Caches active instances.
     * @param pubKey The public key of the document.
     * @returns The LoroDoc instance or null if document/content not found or error.
     */
    public async getLoroDoc(pubKey: string): Promise<LoroDoc | null> {
        // 1. Check cache
        if (activeLoroDocuments.has(pubKey)) {
            return activeLoroDocuments.get(pubKey)!;
        }
        // 2. Get document metadata
        const docMetadata = await this.getDocument(pubKey);
        if (!docMetadata) {
            console.error(`[getLoroDoc] Metadata not found for ${pubKey}`);
            return null;
        }
        // 3. Determine Snapshot CID (prioritize local if available, though less relevant server-side)
        const snapshotCid = docMetadata.localState?.snapshotCid || docMetadata.snapshotCid;
        if (!snapshotCid) {
            console.warn(`[getLoroDoc] No snapshot CID found for ${pubKey}. Returning empty doc.`);
            // Return a new empty doc, maybe? Or null? Returning null seems safer.
            // const newDoc = new LoroDoc();
            // activeLoroDocuments.set(pubKey, newDoc);
            // return newDoc;
            return null;
        }
        // 4. Load Snapshot Content
        const contentStorage = getContentStorage();
        const snapshotData = await contentStorage.get(snapshotCid);
        if (!snapshotData) {
            console.error(`[getLoroDoc] Snapshot content not found for CID ${snapshotCid} (doc ${pubKey})`);
            return null;
        }
        // 5. Create LoroDoc and Import Snapshot
        const loroDoc = new LoroDoc();
        try {
            loroDoc.import(snapshotData);
        } catch (importErr) {
            console.error(`[getLoroDoc] Error importing snapshot ${snapshotCid} for ${pubKey}:`, importErr);
            return null;
        }
        // 6. Apply Updates
        const allUpdateCids = [
            ...(docMetadata.updateCids || []),
            ...(docMetadata.localState?.updateCids || []) // Include local updates if present
        ];
        // Optimization: Fetch all updates at once if storage supports it (assuming basic get for now)
        const updatesData: Uint8Array[] = [];
        for (const updateCid of allUpdateCids) {
            const updateData = await contentStorage.get(updateCid);
            if (updateData) {
                updatesData.push(updateData);
            } else {
                console.warn(`[getLoroDoc] Update content not found for CID ${updateCid} (doc ${pubKey})`);
                // Decide: continue applying others or fail? Continue seems reasonable.
            }
        }
        // 7. Import Updates in Batch (if any)
        if (updatesData.length > 0) {
            try {
                loroDoc.importBatch(updatesData);
            } catch (batchImportErr) {
                console.error(`[getLoroDoc] Error batch importing updates for ${pubKey}:`, batchImportErr);
                // Should we return null or the doc state before failed batch import?
                // Returning null seems safer to indicate incomplete state.
                return null;
            }
        }
        // 8. Cache and Return
        activeLoroDocuments.set(pubKey, loroDoc);
        return loroDoc;
    }
    /**
     * Creates a new entity document.
     * Handles LoroDoc creation, snapshotting, content storage, and metadata storage.
     * @param schemaPubKey PubKey of the schema this entity conforms to (without the '@').
     * @param initialPlaces Initial data for the entity's 'places' map.
     * @param ownerId The ID of the user creating the entity.
     * @returns The metadata (Docs object) of the newly created entity document.
     * @throws Error if creation fails.
     */
    public async createEntity(schemaPubKey: string, initialPlaces: Record<string, LoroJsonValue>, ownerId: string): Promise<Docs> {
        const pubKey: string = docIdService.generateDocId();
        const now: string = new Date().toISOString();
        try {
            const loroDoc: LoroDoc = await this.getOrCreateLoroDoc(pubKey);
            const meta: LoroMap = loroDoc.getMap('meta');
            meta.set('schema', `@${schemaPubKey}`);
            // Correctly create the nested places map
            const dataMap: LoroMap = loroDoc.getMap('data');
            // Use setContainer with a NEW LoroMap instance
            const placesMap: LoroMap = dataMap.setContainer("places", new LoroMap());
            // Now placesMap is guaranteed to be a LoroMap, set values
            for (const key in initialPlaces) {
                if (Object.prototype.hasOwnProperty.call(initialPlaces, key)) {
                    placesMap.set(key, initialPlaces[key]);
                }
            }
            const snapshot: Uint8Array = loroDoc.export({ mode: 'snapshot' });
            const snapshotCid: string = await hashService.hashSnapshot(snapshot);
            const contentStorage = getContentStorage();
            await contentStorage.put(snapshotCid, snapshot, {
                type: 'snapshot',
                documentPubKey: pubKey,
                created: now,
                schema: `@${schemaPubKey}`
            });
            const newDoc: Docs = {
                pubKey,
                owner: ownerId,
                updatedAt: now,
                updateCids: [],
                localState: {
                    snapshotCid: snapshotCid
                }
            };
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(newDoc)));
            docs.update(currentDocs => [...currentDocs, newDoc]);
            activeLoroDocuments.set(pubKey, loroDoc);
            // Explicitly trigger reactivity *after* metadata is saved
            docChangeNotifier.update(n => n + 1);
            console.log(`[createEntity] Created entity ${pubKey} with schema @${schemaPubKey}`);
            return newDoc;
        } catch (err) {
            console.error(`[createEntity] Failed for schema @${schemaPubKey}:`, err);
            activeLoroDocuments.delete(pubKey);
            throw new Error(`Failed to create entity: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }
    /**
     * Persists a pre-exported Loro update binary to storage and updates document metadata.
     * Calculates CID, stores content, and atomically appends CID to updateCids array.
     * Intended for use by HQL service after validation.
     * @param pubKey The public key of the document being updated.
     * @param updateData The binary update data (Uint8Array).
     * @returns The CID of the persisted update.
     * @throws Error if persistence fails or document not found.
     */
    public async persistLoroUpdate(pubKey: string, updateData: Uint8Array): Promise<string> {
        try {
            // 1. Calculate CID
            const updateCid = await hashService.hashSnapshot(updateData); // Use same hash function
            // 2. Store Update Content (check for existence first)
            const contentStorage = getContentStorage();
            const existingUpdate = await contentStorage.get(updateCid);
            if (!existingUpdate) {
                await contentStorage.put(updateCid, updateData, {
                    type: 'update',
                    documentPubKey: pubKey,
                    created: new Date().toISOString()
                });
                console.log(`[persistLoroUpdate] Stored new update content ${updateCid} for doc ${pubKey}`);
            } else {
                console.log(`[persistLoroUpdate] Update content ${updateCid} already exists.`);
            }
            // 3. Fetch Current Document Metadata (needed for atomic update simulation if needed)
            // We fetch it here to ensure we have the latest state before updating.
            // An alternative for true atomic DBs would be a single UPDATE command.
            const currentDoc = await this.getDocument(pubKey);
            if (!currentDoc) {
                throw new Error(`Document ${pubKey} not found during update persistence.`);
            }
            // 4. Check if update CID is already present
            if (currentDoc.updateCids?.includes(updateCid)) {
                console.log(`[persistLoroUpdate] Update CID ${updateCid} already present in doc ${pubKey}. Skipping metadata update.`);
                return updateCid; // Return existing CID, no metadata change needed
            }
            // 5. Update Document Metadata
            const updatedCids = [...(currentDoc.updateCids || []), updateCid];
            const updatedDocData: Docs = {
                ...currentDoc,
                updateCids: updatedCids,
                updatedAt: new Date().toISOString()
            };
            // Overwrite the existing metadata entry
            const docsStorage = getDocsStorage();
            await docsStorage.put(pubKey, new TextEncoder().encode(JSON.stringify(updatedDocData)));
            // 6. Update Svelte store (for local UI consistency)
            docs.update(currentDocs => {
                const index = currentDocs.findIndex(d => d.pubKey === pubKey);
                if (index !== -1) {
                    currentDocs[index] = updatedDocData;
                    return [...currentDocs];
                }
                return currentDocs; // Should not happen if getDocument succeeded
            });
            // Update selectedDoc store if it's the current one
            const currentSelected = get(selectedDoc);
            if (currentSelected && currentSelected.pubKey === pubKey) {
                selectedDoc.set({ ...updatedDocData });
            }
            console.log(`[persistLoroUpdate] Appended update CID ${updateCid} to doc ${pubKey}`);
            return updateCid;
        } catch (err) {
            console.error(`[persistLoroUpdate] Failed for doc ${pubKey}:`, err);
            throw new Error(`Failed to persist update: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }
    /**
     * Retrieves the full JSON representation of a document by its pubKey.
     * Handles LoroDoc loading and conversion to JSON.
     * @param pubKey The public key of the document.
     * @returns The document content as a JSON object, or null if not found or error.
     */
    public async getDocumentDataAsJson(pubKey: string): Promise<Record<string, unknown> | null> {
        try {
            const loroDoc = await this.getLoroDoc(pubKey);
            if (!loroDoc) {
                return null;
            }
            // Add pubKey to the JSON representation for consistency
            const jsonData = loroDoc.toJSON() as Record<string, unknown>;
            jsonData.pubKey = pubKey;
            return jsonData;
        } catch (err) {
            console.error(`[getDocumentDataAsJson] Error fetching/parsing doc ${pubKey}:`, err);
            return null;
        }
    }
    /**
     * Retrieves the full JSON representation of a schema document by its reference (@pubKey).
     * @param schemaRef The schema reference string (e.g., "@0x...").
     * @returns The schema content as a JSON object, or null if not found or error.
     */
    public async getSchemaDataAsJson(schemaRef: string): Promise<Record<string, unknown> | null> {
        if (!schemaRef || !schemaRef.startsWith('@')) {
            console.error(`[getSchemaDataAsJson] Invalid schema reference format: ${schemaRef}`);
            return null;
        }
        const schemaPubKey = schemaRef.substring(1);
        // Use getDocumentDataAsJson to leverage its logic and pubKey injection
        return this.getDocumentDataAsJson(schemaPubKey);
    }
    /**
     * Updates the 'places' map of an entity document.
     * Handles LoroDoc loading, applying changes, validation (basic structure), snapshotting/updating, and persistence.
     * @param pubKey The public key of the entity document to update.
     * @param placesUpdate An object containing the key-value pairs to set in the 'places' map.
     * @returns The updated Docs metadata object.
     * @throws Error if the document is not found, update fails, or permission denied.
     */
    public async updateEntityPlaces(
        pubKey: string,
        placesUpdate: Record<string, LoroJsonValue>
    ): Promise<Docs> {
        // Get current metadata for capability check and return value
        const docMeta = await this.getDocument(pubKey);
        if (!docMeta) {
            throw new Error(`Document ${pubKey} not found for update.`);
        }
        // *** Capability Check ***
        const currentUser = get(authClient.useSession()).data?.user as CapabilityUser | null;
        if (!canWrite(currentUser, docMeta)) {
            throw new Error(`Permission denied: Cannot write to document ${pubKey}`);
        }
        // *** End Capability Check ***
        // Get the active LoroDoc instance (ensures it exists and is subscribed)
        const loroDoc = await this.getLoroDoc(pubKey);
        if (!loroDoc) {
            throw new Error(`Failed to load LoroDoc for update: ${pubKey}`);
        }
        // Get the data map, then the places map (create if needed)
        const dataMap = loroDoc.getMap('data');
        let placesMap: LoroMap;
        const potentialPlacesMap = dataMap.get('places');
        if (potentialPlacesMap instanceof LoroMap) {
            placesMap = potentialPlacesMap;
        } else {
            placesMap = dataMap.setContainer('places', new LoroMap());
            console.log(`[updateEntityPlaces] Created 'places' map for doc ${pubKey}`);
        }
        // Apply updates to the LoroMap (this triggers Loro change event)
        let changesMade = false;
        for (const key in placesUpdate) {
            if (Object.prototype.hasOwnProperty.call(placesUpdate, key)) {
                // TODO: Add check if value actually changed? Loro might handle this internally.
                placesMap.set(key, placesUpdate[key]);
                changesMade = true; // Assume change if key exists in update
            }
        }
        if (!changesMade) {
            console.log(`[updateEntityPlaces] No effective changes provided for doc ${pubKey}. Returning current metadata.`);
            return docMeta; // Return original metadata if no changes applied
        }
        // --- REMOVED PERSISTENCE & SVELTE STORE UPDATES ---
        // The Loro change handler (`_handleLoroChange`) will now handle:
        // 1. Exporting the update (only if byteLength > 0).
        // 2. Persisting the update via `persistLoroUpdate`.
        // 3. Updating relevant Svelte stores.
        // ---------------------------------------------------- 
        console.log(`[updateEntityPlaces] Applied Loro changes for doc ${pubKey}. Event handler will persist.`);
        // Return the metadata *before* the event handler potentially updates it.
        // The caller (HQL) might need this, and the UI will update reactively anyway.
        return docMeta;
    }
    // --- Loro Event Handling --- 
    private async _handleLoroChange(pubKey: string, loroDoc: LoroDoc) {
        console.log(`[Loro Event] Handling change for doc: ${pubKey}`);
        // 1. Increment global change notifier
        docChangeNotifier.update(n => n + 1);
        // 2. Fetch latest metadata (as it might have changed, e.g., updatedAt)
        // Note: This reads from storage. We might need a cached/in-memory version 
        // if direct Loro event doesn't provide enough context for metadata updates.
        const docMeta = await this.getDocument(pubKey);
        if (!docMeta) {
            console.warn(`[Loro Event] Metadata not found for changed doc ${pubKey}. Cannot update stores.`);
            return;
        }
        // Update updatedAt timestamp in the metadata object (reflecting the change)
        // This assumes the handler runs shortly after the change.
        // A more robust way might involve Loro'sLamport timestamps if available.
        docMeta.updatedAt = new Date().toISOString();
        // 3. Update the main 'docs' store
        docs.update(currentDocs => {
            const index = currentDocs.findIndex(d => d.pubKey === pubKey);
            if (index !== -1) {
                currentDocs[index] = { ...docMeta }; // Update with potentially new metadata
                return [...currentDocs]; // Return new array reference
            } else {
                // Doc changed but wasn't in the list? Add it? Or log error?
                console.warn(`[Loro Event] Changed doc ${pubKey} not found in docs store.`);
                return currentDocs; // Return original array
            }
        });
        // 4. Update 'selectedDoc' store if it's the one that changed
        const currentSelected = get(selectedDoc);
        if (currentSelected && currentSelected.pubKey === pubKey) {
            selectedDoc.set({ ...docMeta }); // Update selected doc with new metadata
            // 5. Reload content view for the selected document
            // Pass the *updated* metadata. loadDocumentContent reads from the *live* loroDoc.
            await this.loadDocumentContent(docMeta);
        }
        // 6. Trigger Asynchronous Persistence (Decoupled)
        // This should ideally be handled carefully to avoid race conditions 
        // and ensure atomicity if possible. For now, a simple async call.
        this._persistLoroUpdateAsync(pubKey, loroDoc).catch(err => {
            console.error(`[Loro Event] Background persistence failed for ${pubKey}:`, err);
            // Optionally notify user or set an error state?
            this.setError(`Background save failed for ${pubKey}`);
        });
    }
    // Helper for async persistence triggered by Loro event
    private async _persistLoroUpdateAsync(pubKey: string, loroDoc: LoroDoc): Promise<void> {
        // Removed redundant try...catch, caller handles errors
        const updateData = loroDoc.export({ mode: 'update' });
        if (updateData.byteLength > 0) {
            // Call the existing persistence logic (which also updates metadata)
            await this.persistLoroUpdate(pubKey, updateData);
            console.log(`[Loro Event] Background persistence successful for ${pubKey}.`);
        } else {
            console.log(`[Loro Event] No effective changes detected by Loro for ${pubKey}. Skipping persistence.`);
        }
    }
    // -------------------------
}
// Create and export singleton instance
export const hominioDB = new HominioDB();
````

## File: src/lib/server/routes/docs.ts
````typescript
import { Elysia } from 'elysia';
import { db } from '$db';
import { docs, content } from '$db/schema';
import * as schema from '$db/schema';
import { eq, inArray, ne, and, sql, count, or } from 'drizzle-orm';
import { hashService } from '$lib/KERNEL/hash-service';
import { loroService } from '$lib/KERNEL/loro-service';
// Import capability functions and types
import { canRead, canWrite, canDelete, type CapabilityUser } from '$lib/KERNEL/hominio-capabilities';
// Import the constant directly from its source
import { GENESIS_HOMINIO } from '$db/constants';
// Helper function for binary data conversion
function arrayToUint8Array(arr: number[]): Uint8Array {
    return new Uint8Array(arr);
}
// Define stricter types
interface SessionUser extends CapabilityUser { // Extend CapabilityUser for type compatibility
    [key: string]: unknown; // Safer than any
}
interface AuthContext {
    session: { user: SessionUser };
    body?: unknown;      // Safer than any
    set?: { status?: number | string;[key: string]: unknown }; // Model `set` more accurately
    params?: Record<string, string | undefined>; // Assuming string params
    query?: Record<string, string | undefined>;  // Assuming string queries
}
interface ContentResponse {
    cid: string;
    type: string;
    metadata: Record<string, unknown>;
    hasBinaryData: boolean;
    contentLength: number;
    verified: boolean;
    createdAt: string;
    binaryData?: number[]; // Optional binary data
}
interface DocGetResponse {
    document: schema.Doc;
    content?: ContentResponse | null;
}
// Content-related helper functions
async function getContentByCid(cid: string): Promise<ContentResponse | null> { // Use defined type
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));
        if (!contentItem.length) {
            return null;
        }
        const item = contentItem[0];
        // Get binary data and metadata
        const binaryData = item.raw as Buffer;
        const metadata = item.metadata as Record<string, unknown> || {};
        // Verify content integrity
        let verified = false;
        if (binaryData && binaryData.length > 0) {
            try {
                // Verify hash matches CID using binary data directly
                verified = await hashService.verifySnapshot(binaryData, cid);
            } catch (err) {
                console.error('Error verifying content hash:', err);
            }
        }
        // Return content with verification status
        return {
            cid: item.cid,
            type: item.type,
            metadata,
            hasBinaryData: binaryData.length > 0,
            contentLength: binaryData.length,
            verified,
            createdAt: item.createdAt.toISOString()
        };
    } catch (error) {
        console.error('Error retrieving content:', error);
        return null;
    }
}
async function getBinaryContentByCid(cid: string): Promise<Buffer | null> {
    try {
        // Get content by CID
        const contentItem = await db.select().from(content).where(eq(content.cid, cid));
        if (!contentItem.length) {
            return null;
        }
        // Return raw binary data
        return contentItem[0].raw as Buffer;
    } catch (error) {
        console.error('Error retrieving binary content:', error);
        return null;
    }
}
// Create docs handlers without prefix
export const docsHandlers = new Elysia()
    // List all docs
    .get('/list', async ({ session }: AuthContext) => {
        // Get docs owned by the current user OR the genesis owner
        // Type assertion for session user ID needed here if DB expects string
        const userId = session.user.id as string;
        return await db.select().from(docs)
            .where(or(
                eq(docs.owner, userId),
                eq(docs.owner, GENESIS_HOMINIO)
            ))
            .orderBy(docs.updatedAt);
    })
    // Create new document
    .post('/', async ({ body, session, set }: AuthContext) => {
        try {
            // Use type assertion for body after checking its type if necessary
            const createDocBody = body as {
                binarySnapshot?: number[];
                pubKey?: string;
                title?: string;
                description?: string;
            };
            let snapshot, cid, pubKey, jsonState;
            // If a snapshot is provided, use it; otherwise create a default one
            if (createDocBody.binarySnapshot && Array.isArray(createDocBody.binarySnapshot)) {
                // Use the provided snapshot
                const snapshotData = arrayToUint8Array(createDocBody.binarySnapshot);
                // Verify this is a valid Loro snapshot
                const loroDoc = loroService.createEmptyDoc();
                try {
                    // Import to verify it's valid
                    loroDoc.import(snapshotData);
                    // Generate state information from the imported doc
                    snapshot = snapshotData;
                    cid = await hashService.hashSnapshot(snapshotData);
                    // Use client's pubKey if provided, otherwise generate one
                    pubKey = createDocBody.pubKey || loroService.generatePublicKey();
                    jsonState = loroDoc.toJSON();
                } catch (error) {
                    if (set) set.status = 400;
                    return {
                        success: false,
                        error: 'Invalid Loro snapshot',
                        details: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            } else {
                // Create a default document if no snapshot provided
                ({ snapshot, cid, jsonState } = await loroService.createDemoDoc());
                // Use client's pubKey if provided, otherwise use the one from createDemoDoc
                pubKey = createDocBody.pubKey || loroService.generatePublicKey();
            }
            // First, store the content - *only if it doesn't exist*
            let contentResult: (typeof schema.content.$inferSelect)[] | null = null;
            const existingContent = await db.select().from(schema.content).where(eq(schema.content.cid, cid));
            if (existingContent.length === 0) {
                // Content doesn't exist, insert it
                const contentEntry: schema.InsertContent = {
                    cid,
                    type: 'snapshot',
                    raw: Buffer.from(snapshot), // Store binary data directly
                    metadata: { docState: jsonState } // Store metadata separately
                };
                contentResult = await db.insert(schema.content)
                    .values(contentEntry)
                    .returning();
                console.log('Created content entry:', contentResult[0].cid);
            } else {
                // Content already exists, use the existing one
                console.log('Content already exists with CID:', cid);
                contentResult = existingContent; // Use existing content data if needed later
            }
            // Check if content operation was successful (either insert or found existing)
            if (!contentResult || contentResult.length === 0) {
                if (set) set.status = 500;
                return { success: false, error: 'Failed to ensure content entry exists' };
            }
            // Create document entry with the current user as owner
            const userId = session.user.id as string;
            const docEntry: schema.InsertDoc = {
                pubKey,
                snapshotCid: cid,
                updateCids: [],
                owner: userId // Associate with current user
            };
            // Save the document
            const docResult = await db.insert(schema.docs)
                .values(docEntry)
                .returning();
            console.log('Created document entry:', docResult[0].pubKey);
            // Return the created document
            return {
                success: true,
                document: docResult[0]
            };
        } catch (error) {
            console.error('Error creating document:', error);
            if (set?.status) set.status = 500;
            return {
                success: false,
                error: 'Failed to create document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    // Get a specific document by pubKey
    .get('/:pubKey', async ({ params, query, session, set }: AuthContext): Promise<DocGetResponse | { error: string; details?: string }> => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Get doc by pubKey
            const doc = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!doc.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }
            const document = doc[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;
            // *** Use canRead for authorization ***
            if (!canRead(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to access this document' };
            }
            // Create the response using the defined interface
            const response: DocGetResponse = {
                document
            };
            // If document has a snapshot CID, fetch and include the content
            if (document.snapshotCid) {
                const contentData = await getContentByCid(document.snapshotCid);
                if (contentData) {
                    response.content = contentData;
                    // Check if binary data was requested using includeBinary query param
                    const includeBinary = query?.includeBinary === "true";
                    if (includeBinary) {
                        // Get the binary data directly
                        const binaryData = await getBinaryContentByCid(document.snapshotCid);
                        if (binaryData && response.content) {
                            // Add binary data to the response
                            response.content.binaryData = Array.from(binaryData);
                        }
                    }
                }
            }
            // Return the combined document and content data
            return response;
        } catch (error) {
            console.error('Error retrieving document:', error);
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to retrieve document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    // Delete a specific document by pubKey
    .delete('/:pubKey', async ({ params, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }
            const document = docResult[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;
            if (!canDelete(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to delete this document' };
            }
            console.log(`Attempting to delete document ${pubKey} owned by ${document.owner}`);
            const cidsToDelete: string[] = [];
            if (document.snapshotCid) {
                cidsToDelete.push(document.snapshotCid);
            }
            if (document.updateCids && document.updateCids.length > 0) {
                cidsToDelete.push(...document.updateCids);
            }
            await db.delete(docs).where(eq(docs.pubKey, pubKey));
            console.log(`Deleted document entry ${pubKey}`);
            if (cidsToDelete.length > 0) {
                console.log(`Attempting to delete ${cidsToDelete.length} associated content items...`);
                try {
                    const deleteContentResult = await db.delete(content).where(inArray(content.cid, cidsToDelete));
                    console.log(`Deleted ${deleteContentResult.rowCount} content items.`);
                } catch (contentDeleteError: unknown) {
                    console.error(`Error deleting associated content for doc ${pubKey}:`, contentDeleteError);
                }
            }
            return { success: true, message: `Document ${pubKey} deleted successfully` };
        } catch (error: unknown) {
            console.error('Error deleting document:', error);
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to delete document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
// Add nested routes for update and snapshot
// Document update routes
docsHandlers.group('/:pubKey/update', app => app
    // Add batch update endpoint
    .post('/batch', async ({ params, body, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Verify document exists and user owns it
            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }
            const document = docResult[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;
            // *** Use canWrite for authorization ***
            if (!canWrite(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to update this document' };
            }
            // Parse the update data from request body, expecting an array of CIDs
            const updateBody = body as { updateCids?: string[] };
            const updateCids = updateBody.updateCids;
            if (!updateCids || !Array.isArray(updateCids) || updateCids.length === 0) {
                if (set?.status) set.status = 400;
                return { error: 'Invalid request. Array of update CIDs required.' };
            }
            console.log(`Processing batch update request with ${updateCids.length} CIDs for document ${pubKey}`);
            // Verify all the updates exist in the content store
            const existingContentItems = await db
                .select({ cid: content.cid })
                .from(content)
                .where(inArray(content.cid, updateCids));
            const existingCids = new Set(existingContentItems.map(item => item.cid));
            const missingCids = updateCids.filter(cid => !existingCids.has(cid));
            if (missingCids.length > 0) {
                if (set?.status) set.status = 400;
                return {
                    error: 'Some update CIDs are missing in the content store',
                    missing: missingCids
                };
            }
            // Get current updateCids from document
            const currentUpdateCids = document.updateCids || [];
            // Filter to only CIDs that aren't already registered
            const newUpdateCids = updateCids.filter(cid => !currentUpdateCids.includes(cid));
            if (newUpdateCids.length === 0) {
                // All updates are already registered
                return {
                    success: true,
                    message: 'All updates are already registered with this document',
                    registeredCount: 0,
                    updatedCids: currentUpdateCids
                };
            }
            // Add new CIDs to the document's updateCids array
            const updatedCids = [...currentUpdateCids, ...newUpdateCids];
            // Update the document
            const updateResult = await db.update(schema.docs)
                .set({
                    updateCids: updatedCids,
                    updatedAt: new Date()
                })
                .where(eq(schema.docs.pubKey, pubKey))
                .returning();
            console.log(`Registered ${newUpdateCids.length} updates with document ${pubKey}`);
            // Return success
            return {
                success: true,
                registeredCount: newUpdateCids.length,
                updatedCids: updateResult[0].updateCids || []
            };
        } catch (error) {
            console.error('Error batch updating document:', error);
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to batch update document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    .post('/', async ({ params, body, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Verify document exists and user owns it
            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }
            const document = docResult[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;
            // *** Use canWrite for authorization ***
            if (!canWrite(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to update this document' };
            }
            // Parse the update data from request body, handling both direct and wrapped formats
            const updateBody = body as { data?: { binaryUpdate: number[] }; binaryUpdate?: number[] };
            // Extract binaryUpdate from either format
            const binaryUpdate = updateBody.data?.binaryUpdate || updateBody.binaryUpdate;
            if (!binaryUpdate || !Array.isArray(binaryUpdate)) {
                if (set?.status) set.status = 400;
                return { error: 'Invalid update data. Binary update required.' };
            }
            // Convert the array to Uint8Array
            const binaryUpdateArray = arrayToUint8Array(binaryUpdate);
            // IMPORTANT: Calculate CID directly from the client's provided update
            // without modifying it or recreating it
            const cid = await hashService.hashSnapshot(binaryUpdateArray);
            // Store the update content exactly as received from client
            const updateContentEntry: schema.InsertContent = {
                cid,
                type: 'update',
                // Store binary data directly without any modification
                raw: Buffer.from(binaryUpdateArray),
                // Only store minimal metadata
                metadata: {
                    documentPubKey: pubKey
                }
            };
            // Check if this update already exists before inserting
            const existingUpdate = await db.select().from(content).where(eq(content.cid, cid));
            let updateResult;
            if (existingUpdate.length === 0) {
                // Insert only if it doesn't exist
                updateResult = await db.insert(schema.content)
                    .values(updateContentEntry)
                    .returning();
                console.log('Created update content entry:', updateResult[0].cid);
            } else {
                console.log('Update already exists with CID:', cid);
                updateResult = existingUpdate;
            }
            // Update the document to append this CID to the updateCids array
            // Use SQL array append operation for atomic update without needing to fetch first
            const updateResult2 = await db.update(schema.docs)
                .set({
                    // Use SQL to append CID only if it doesn't already exist in the array
                    updateCids: sql`(
                        CASE 
                            WHEN ${cid} = ANY(${docs.updateCids}) THEN ${docs.updateCids}
                            ELSE array_append(COALESCE(${docs.updateCids}, ARRAY[]::text[]), ${cid})
                        END
                    )`,
                    updatedAt: new Date()
                })
                .where(eq(schema.docs.pubKey, pubKey))
                .returning();
            // Log the result
            const wasAdded = !document.updateCids?.includes(cid);
            if (wasAdded) {
                console.log(`Added update ${cid} to document's updateCids array`);
            } else {
                console.log(`Update ${cid} already in document's updateCids array, skipping`);
            }
            // Return success response with updated CIDs
            return {
                success: true,
                updateCid: cid,
                updatedCids: updateResult2[0].updateCids || []
            };
        } catch (error) {
            console.error('Error updating document:', error);
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to update document',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
);
// Document snapshot routes
docsHandlers.group('/:pubKey/snapshot', app => app
    .post('/', async ({ params, body, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Verify document exists and user owns it
            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }
            const document = docResult[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;
            // *** Use canWrite for authorization ***
            if (!canWrite(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to update this document' };
            }
            // Parse the snapshot data from request body
            const snapshotBody = body as {
                data?: { binarySnapshot: number[] };
                binarySnapshot?: number[]
            };
            // Extract binarySnapshot from either format
            const binarySnapshot = snapshotBody.data?.binarySnapshot || snapshotBody.binarySnapshot;
            if (!binarySnapshot || !Array.isArray(binarySnapshot)) {
                if (set?.status) set.status = 400;
                return { error: 'Invalid snapshot data. Binary snapshot required.' };
            }
            // Convert the array to Uint8Array for processing
            const snapshotData = arrayToUint8Array(binarySnapshot);
            // Verify this is a valid Loro snapshot
            const loroDoc = loroService.createEmptyDoc();
            try {
                // Import to verify it's valid
                loroDoc.import(snapshotData);
            } catch (error) {
                if (set?.status) set.status = 400;
                return {
                    error: 'Invalid Loro snapshot',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
            // Generate a CID for the snapshot
            const snapshotCid = await hashService.hashSnapshot(snapshotData);
            // Check if this exact snapshot already exists (same CID)
            if (snapshotCid === document.snapshotCid) {
                return {
                    success: true,
                    document,
                    snapshotCid,
                    message: 'Document unchanged, snapshot is already up to date'
                };
            }
            // Check if content with this CID already exists
            const existingContent = await db.select()
                .from(content)
                .where(eq(content.cid, snapshotCid));
            // If the content already exists, we can just update the document to point to it
            if (existingContent.length === 0) {
                // Create a content entry for the snapshot
                const contentEntry: schema.InsertContent = {
                    cid: snapshotCid,
                    type: 'snapshot',
                    // Store binary data directly
                    raw: Buffer.from(snapshotData),
                    // Store metadata with docState if available
                    metadata: {
                        updatedAt: new Date().toISOString(),
                        previousSnapshotCid: document.snapshotCid
                    }
                };
                // Store the snapshot content
                const contentResult = await db.insert(schema.content)
                    .values(contentEntry)
                    .returning();
                console.log('Created snapshot content entry:', contentResult[0].cid);
            } else {
                console.log('Content already exists with CID:', snapshotCid);
            }
            // Update the document's snapshotCid to point to the new snapshot
            const updatedDoc = await db.update(schema.docs)
                .set({
                    snapshotCid: snapshotCid,
                    updatedAt: new Date()
                })
                .where(eq(schema.docs.pubKey, pubKey))
                .returning();
            // Return success response
            return {
                success: true,
                document: updatedDoc[0],
                snapshotCid
            };
        } catch (error) {
            console.error('Error updating document snapshot:', error);
            if (set?.status) set.status = 500;
            return {
                error: 'Failed to update document snapshot',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
    // Add the missing endpoint for consolidated snapshots
    .post('/create', async ({ params, session, set }: AuthContext) => {
        try {
            const pubKey = params?.pubKey;
            if (!pubKey) {
                if (set?.status) set.status = 400;
                return { error: 'Missing pubKey parameter' };
            }
            // Verify document exists and user owns it
            const docResult = await db.select().from(docs).where(eq(docs.pubKey, pubKey));
            if (!docResult.length) {
                if (set?.status) set.status = 404;
                return { error: 'Document not found' };
            }
            const document = docResult[0];
            const capabilityUser: CapabilityUser | null = session.user as CapabilityUser ?? null;
            // *** Use canWrite for authorization ***
            if (!canWrite(capabilityUser, document)) {
                if (set?.status) set.status = 403;
                return { error: 'Not authorized to snapshot this document' };
            }
            // Check if the document has a snapshot and updates
            if (!document.snapshotCid) {
                if (set?.status) set.status = 400;
                return { error: 'Document has no snapshot to consolidate' };
            }
            if (!document.updateCids || document.updateCids.length === 0) {
                if (set?.status) set.status = 400;
                return { error: 'No updates to consolidate into a new snapshot' };
            }
            console.log(`Creating consolidated snapshot for document ${pubKey} with ${document.updateCids.length} updates`);
            // 1. Load the base snapshot
            const snapshotData = await getBinaryContentByCid(document.snapshotCid);
            if (!snapshotData) {
                if (set?.status) set.status = 500;
                return { error: 'Failed to load document snapshot' };
            }
            // Create a Loro document from the snapshot
            const loroDoc = loroService.createEmptyDoc();
            loroDoc.import(new Uint8Array(snapshotData));
            console.log(`Loaded base snapshot from CID: ${document.snapshotCid}`);
            // 2. Load all updates in memory first
            const appliedUpdateCids: string[] = [];
            const updatesData: Uint8Array[] = [];
            for (const updateCid of document.updateCids) {
                const updateData = await getBinaryContentByCid(updateCid);
                if (updateData) {
                    updatesData.push(new Uint8Array(updateData));
                    appliedUpdateCids.push(updateCid);
                } else {
                    console.warn(`Could not load update data for CID: ${updateCid}`);
                }
            }
            // 3. Apply all updates in one batch operation (much faster than individual imports)
            if (updatesData.length > 0) {
                try {
                    console.log(`Applying ${updatesData.length} updates in batch`);
                    loroDoc.importBatch(updatesData);
                    console.log(`Successfully applied ${updatesData.length} updates in batch`);
                } catch (err) {
                    console.error('Error applying updates in batch:', err);
                    if (set?.status) set.status = 500;
                    return { error: 'Failed to apply updates in batch' };
                }
            }
            // 4. Export a new snapshot
            const newSnapshotData = loroDoc.export({ mode: 'snapshot' });
            const newSnapshotCid = await hashService.hashSnapshot(newSnapshotData);
            // 5. Save the new snapshot to content store
            await db.insert(content).values({
                cid: newSnapshotCid,
                type: 'snapshot',
                raw: Buffer.from(newSnapshotData),
                metadata: { documentPubKey: pubKey },
                createdAt: new Date()
            });
            console.log(`Created new consolidated snapshot with CID: ${newSnapshotCid}`);
            // 6. Update the document to use the new snapshot and clear the update list
            const updatedDoc = await db.update(schema.docs)
                .set({
                    snapshotCid: newSnapshotCid,
                    updateCids: [], // Clear all updates as they're now in the snapshot
                    updatedAt: new Date()
                })
                .where(eq(schema.docs.pubKey, pubKey))
                .returning();
            // Clean up any consolidated updates if needed
            let deletedUpdates = 0;
            if (appliedUpdateCids.length > 0) {
                try {
                    console.log(`Cleaning up ${appliedUpdateCids.length} consolidated updates`);
                    // Get all documents except this one
                    const allOtherDocs = await db.select().from(docs).where(ne(docs.pubKey, pubKey));
                    // Keep track of which update CIDs are referenced by other documents
                    const updateCidsReferencedByOtherDocs = new Set<string>();
                    // Check each document for references to our consolidated updates
                    for (const doc of allOtherDocs) {
                        if (doc.updateCids) {
                            for (const cid of doc.updateCids) {
                                if (appliedUpdateCids.includes(cid)) {
                                    updateCidsReferencedByOtherDocs.add(cid);
                                }
                            }
                        }
                    }
                    // localState is client-side only and won't exist in server database
                    // Skip checking for it here
                    // Filter out update CIDs that are still referenced by other documents
                    const updateCidsToDelete = appliedUpdateCids.filter(
                        cid => !updateCidsReferencedByOtherDocs.has(cid)
                    );
                    if (updateCidsToDelete.length > 0) {
                        console.log(`${updateCidsToDelete.length} update CIDs can be safely deleted`);
                        // Double-check content metadata for any other references before deleting
                        // Some content items might have references in their metadata
                        const safeCidsToDelete = [];
                        for (const cid of updateCidsToDelete) {
                            // Check if any other content refers to this CID in metadata
                            const refCount = await db
                                .select({ count: count() })
                                .from(content)
                                .where(
                                    and(
                                        ne(content.cid, cid),
                                        sql`${content.metadata}::text LIKE ${'%' + cid + '%'}`
                                    )
                                );
                            // If no references found, safe to delete
                            if (refCount[0].count === 0) {
                                safeCidsToDelete.push(cid);
                            } else {
                                console.log(`Update ${cid} is referenced in content metadata, skipping deletion`);
                            }
                        }
                        if (safeCidsToDelete.length > 0) {
                            // Delete the update CIDs that are not referenced by any other document or content
                            const deleteResult = await db.delete(content)
                                .where(inArray(content.cid, safeCidsToDelete));
                            console.log(`Deleted ${deleteResult.rowCount} consolidated updates`);
                            // Store the count for the response
                            deletedUpdates = deleteResult.rowCount ?? 0;
                        } else {
                            console.log(`No updates can be safely deleted after metadata check`);
                            deletedUpdates = 0;
                        }
                    } else {
                        console.log(`All consolidated updates are still referenced by other documents, none deleted`);
                        deletedUpdates = 0;
                    }
                } catch (cleanupErr) {
                    console.error(`Error cleaning up consolidated updates:`, cleanupErr);
                    deletedUpdates = 0;
                }
            } else {
                deletedUpdates = 0;
            }
            // 8. Return success with stats
            return {
                success: true,
                document: updatedDoc[0],
                newSnapshotCid,
                appliedUpdates: appliedUpdateCids.length,
                clearedUpdates: document.updateCids.length,
                deletedUpdates
            };
        } catch (error) {
            console.error('Error creating consolidated snapshot:', error);
            if (set) set.status = 500;
            return {
                error: 'Failed to create consolidated snapshot',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    })
);
export default docsHandlers;
````

## File: src/lib/tools/filterTodos/manifest.json
````json
{
    "name": "filterTodos",
    "skill": "Show tasks by tag",
    "icon": "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z",
    "color": "purple",
    "temporaryTool": {
        "modelToolName": "filterTodos",
        "description": "Filter the list of todos by tag. Use this tool when a specific category of todos needs to be shown. NEVER emit text when doing this tool call. When filtering todos, use the exact tag the user mentions or \"all\" to show all todos\n",
        "dynamicParameters": [
            {
                "name": "tag",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "The tag to filter todos by (use \"all\" to show all todos)"
                },
                "required": true
            }
        ],
        "client": {}
    },
    "implementationType": "client"
}
````

## File: src/lib/tools/updateTodo/manifest.json
````json
{
    "name": "updateTodo",
    "skill": "Edit task text and tags",
    "icon": "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    "color": "indigo",
    "temporaryTool": {
        "modelToolName": "updateTodo",
        "description": "Update an existing todo item. Use this tool when a todo needs to be modified. The 'originalText' parameter is required (alternatively, 'todoText' is supported for backward compatibility). NEVER emit text when doing this tool call.",
        "dynamicParameters": [
            {
                "name": "originalText",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "The original text of the todo to update (can also use 'todoText' for backward compatibility)"
                },
                "required": true
            },
            {
                "name": "newText",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "The new text for the todo"
                },
                "required": false
            },
            {
                "name": "completed",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "boolean",
                    "description": "Whether the todo is completed (true) or not (false)"
                },
                "required": false
            },
            {
                "name": "tags",
                "location": "PARAMETER_LOCATION_BODY",
                "schema": {
                    "type": "string",
                    "description": "Optional new comma-separated list of tags (e.g. \"work,urgent,home\")"
                },
                "required": false
            }
        ],
        "client": {}
    },
    "implementationType": "client"
}
````

## File: src/lib/ultravox/agents.ts
````typescript
/**
 * Ultravox Agents - Store and Types
 * 
 * This file contains only essential agent types and stores.
 * All agent configurations are now dynamically loaded from vibe manifests.
 */
import { writable } from 'svelte/store';
import type {
    AgentName,
    CallConfiguration,
    ToolDefinition,
    TemporaryToolDefinition
} from './types';
// Create stores for state management
export const currentFilter = writable('all');
export const currentAgent = writable<AgentName>('Hominio');
// Basic tool definition interfaces - using types from types.ts
export type ToolConfig = ToolDefinition | TemporaryToolDefinition;
// Default call configuration (minimal, will be overridden by vibe config)
export const defaultCallConfig: CallConfiguration = {
    systemPrompt: "Initializing...",
    model: 'fixie-ai/ultravox-70B',
    voice: '', // Will be set by vibe
    languageHint: 'en',
    temperature: 0.7,
    firstSpeaker: 'FIRST_SPEAKER_USER'
};
````

## File: src/lib/ultravox/createCall.ts
````typescript
/**
 * Create Call Implementation
 * This file contains the logic for creating calls with the Ultravox API using the
 * centralized call configuration.
 */
import { browser } from '$app/environment';
import type { JoinUrlResponse, CallConfig } from './types';
import { getActiveVibe } from './stageManager';
import { setupToolRegistrationListeners } from './loaders/toolLoader';
import { hominio } from '$lib/client/hominio';
/**
 * Creates a call using the API and returns a join URL
 * @param callConfig Call configuration
 * @param vibeId Optional vibe ID to use for the call (defaults to 'home')
 * @returns Join URL and other call details
 */
export async function createCall(callConfig: CallConfig, vibeId = 'home'): Promise<JoinUrlResponse> {
    if (!browser) {
        throw new Error('createCall must be called from the browser environment');
    }
    try {
        // Setup tool registration listeners to ensure tools are registered
        setupToolRegistrationListeners();
        // Get active vibe configuration with mutable properties
        console.log(`📞 Creating call with vibe: ${vibeId}`);
        const activeVibe = await getActiveVibe(vibeId);
        // Format tools for the API request using the correct structure
        // The Ultravox API expects "temporaryTool" objects, not direct properties
        const formattedTools = activeVibe.resolvedCallTools.map(tool => ({
            // Use the original format which is already correct
            temporaryTool: {
                modelToolName: tool.name,
                description: tool.temporaryTool.description,
                dynamicParameters: tool.temporaryTool.dynamicParameters,
                client: {} // Empty client object is required
            }
        }));
        console.log(`🔧 Formatted tools for API request: ${activeVibe.resolvedCallTools.map(t => t.name).join(', ')}`);
        // Create the API request
        // Base configuration - unchangeable properties from callConfig
        const apiRequest = {
            ...callConfig,
            // Changeable properties from vibe manifest
            systemPrompt: activeVibe.manifest.systemPrompt || '',
            temperature: activeVibe.manifest.temperature || 0.7,
            languageHint: activeVibe.manifest.languageHint || 'en',
            // selectedTools is a special case - always computed from the vibe
            selectedTools: formattedTools,
            // Use WebRTC as the medium for browser-based calls
            medium: {
                webRtc: {}
            },
            // Store vibeId in metadata (proper field for Ultravox API)
            metadata: {
                vibeId: vibeId
            }
        };
        console.log('📡 Making API call to create a call session using Eden Treaty client');
        // Use Eden Treaty client instead of fetch
        // Type safety handling for Eden client
        const response = await hominio.api.call.create.post(apiRequest as Record<string, unknown>);
        if (!response.data) {
            throw new Error('Invalid response from API: No data returned');
        }
        const data = response.data as JoinUrlResponse;
        console.log(`✅ Call created via Eden client. Join URL: ${data.joinUrl}`);
        return data;
    } catch (error) {
        console.error('❌ Error creating call:', error);
        throw error;
    }
}
````

## File: README.md
````markdown
# Hominio

A modern web application built with cutting-edge technologies for real-time collaboration and data management.

## Tech Stack

- **Frontend**: SvelteKit 5 with TypeScript
  - Server-side rendering (SSR) for optimal performance
  - Built-in routing and layouts
  - TypeScript for type safety
  - Tailwind CSS for styling with dark mode support
  - PG-Lite for client-side persistence
  - Better Auth for authentication

- **Backend**:
  - ElysiaJS for high-performance API endpoints
  - Drizzle ORM for type-safe database operations
  - Neon PostgreSQL for serverless database
  - Loro CRDT for real-time collaboration
  - Better Auth for authentication and authorization

## Getting Started

### Prerequisites

- Bun (latest version)
- Node.js 18+
- A Neon PostgreSQL database

### Installation

1. Clone the repository:
```bash
git clone https://github.com/visioncreator/hominio.git
cd hominio
```

2. Install dependencies:
```bash
bun install
```

3. Set up your environment variables:
```bash
# Create a .env file and add your database URL
SECRET_DATABASE_URL_HOMINIO="your-neon-database-url"
SECRET_DATABASE_URL_AUTH="your-neon-auth-database-url"
BETTER_AUTH_SECRET="your-auth-secret"  # Generate a secure random string
```

4. Start the development server:
```bash
bun dev
```

The app will be available at `http://localhost:5173`

## Authentication with Better Auth

Better Auth provides comprehensive authentication and authorization features:

- Email & Password authentication
- Social sign-on (GitHub, Google, Discord, etc.)
- Two-factor authentication
- Organization and team management
- Session management


## Database Management with Drizzle

### Directory Structure

```
src/
├── db/
│   ├── schema.ts        # Database schema definitions
│   ├── index.ts         # Database connection and exports
│   ├── migrations/      # Generated migration files
│   └── drizzle.config.ts # Drizzle configuration
```

### Database Commands

```bash
# Push schema changes to the database
bun db:push

# Generate new migrations
bun db:generate

# View and manage data with Drizzle Studio
bun db:studio

# (USE WITH CAUTION!)
# Reset database (drops all tables, pushes schema, seeds data)
# (USE WITH CAUTION!)
bun db:reset
```

### Working with Migrations

1. Make changes to your schema in `src/db/schema.ts`
2. Generate migrations:
```bash
bun db:generate
```
3. Review the generated migration files in `src/db/migrations`
4. Push changes to the database:
```bash
bun db:push
```

## Local-First Architecture

Hominio implements a local-first approach for document management, providing offline capabilities with seamless server synchronization:

### Core Components

1. **Document Service (`src/lib/KERNEL/doc-state.ts`)**
   - Manages local document state using IndexedDB
   - Provides Svelte stores for reactive UI updates
   - Uses Loro CRDT as the source of truth for document content
   - Handles document creation and selection

2. **Sync Service (`src/lib/KERNEL/sync-service.ts`)**
   - Automatically synchronizes with the server on application load
   - Pulls server documents and stores them locally
   - Handles content binary data (snapshots and updates)
   - Provides sync status information via Svelte stores

### Data Flow

1. **Server to Local**
   - Server is considered the source of truth for document metadata
   - On initialization, all server documents are fetched and stored locally
   - Server documents override local documents with the same ID
   - Both document metadata and binary content are synchronized

2. **Local to Server** (future implementation)
   - Local documents are created with temporary IDs
   - Updates are applied locally first, then queued for server sync
   - Conflict resolution is handled by Loro CRDT

### Storage Schema

Our IndexedDB database mirrors the server schema for consistency:

1. **Docs Store**
   - Stores document metadata (title, description, owner, timestamps, etc.)
   - Keyed by `pubKey` for efficient document lookup
   - Includes references to snapshot and update CIDs

2. **Content Store**
   - Content-addressable storage using CIDs (Content IDs)
   - Stores binary data for both snapshots and updates
   - Includes metadata about content type and associated document

### Visual Indicators

The UI provides clear status information:
- Sync status indicator shows when data is being synchronized
- "Local Only" badges for documents not yet synced to server
- Local CID indicators for content with temporary IDs
- Sync progress counter during synchronization

### Future Enhancements

- Bi-directional sync (pushing local changes to server)
- Automatic conflict resolution for concurrent edits
- Offline editing with background synchronization
- Selective sync for large documents

## Architecture

The application follows a modern full-stack architecture:

1. **Frontend Layer** (SvelteKit)
   - Server and client components
   - Real-time updates via Loro CRDT
   - Type-safe API calls
   - Responsive UI with Tailwind
   - IndexedDB for local-first storage
   - Better Auth for authentication UI

2. **API Layer** (ElysiaJS)
   - High-performance HTTP endpoints
   - WebSocket support for real-time features
   - Type-safe request/response handling
   - Better Auth middleware for protection

3. **Data Layer** (Drizzle + Neon)
   - Type-safe database operations
   - Serverless PostgreSQL
   - Automatic migrations
   - Real-time capabilities

4. **Authentication Layer** (Better Auth)
   - Multi-factor authentication
   - Social sign-on
   - Organization management
   - Session handling

5. **Collaboration Layer** (Loro)
   - Conflict-free replicated data types (CRDT)
   - Real-time synchronization
   - Offline support
   - Local-first document management

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
````

## File: svelte.config.js
````javascript
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		// Use adapter-static with fallback for SPA mode
		adapter: adapter({
			// Revert to app.html as fallback, as index.html caused build issues
			fallback: 'app.html',
			// Don't use strict mode to allow dynamic routes
			strict: false
		}),
		// Add alias configuration
		alias: {
			$db: './src/db'
		}
	}
};
export default config;
````

## File: src/db/index.ts
````typescript
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';
import { SECRET_DATABASE_URL_HOMINIO } from '$env/static/private';
// Backend: Neon PostgreSQL
const databaseUrl = SECRET_DATABASE_URL_HOMINIO;
if (!databaseUrl) {
    throw new Error('Database URL not found in environment variables');
}
const sql = neon(databaseUrl);
export const db = drizzle({ client: sql, schema });
// Export types
export * from './schema';
````

## File: src/lib/tools/addJournalEntry/function.ts
````typescript
import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { JournalEntry } from '$lib/docs/schemas/journalEntry';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
/**
 * Creates a new journal entry
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    title: string;
    content: string;
    mood?: string;
    tags?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();
        // Validate inputs
        if (!inputs.title.trim()) {
            return logToolActivity('addJournalEntry', 'Title is required', false);
        }
        if (!inputs.content.trim()) {
            return logToolActivity('addJournalEntry', 'Content is required', false);
        }
        // Parse tags
        const tags = inputs.tags
            ? inputs.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [];
        // Create the journal entry object (without ID)
        const journalEntry: Omit<JournalEntry, 'id'> = {
            title: inputs.title.trim(),
            content: inputs.content.trim(),
            mood: inputs.mood?.trim(),
            createdAt: Date.now(),
            tags
        };
        // Call the async createItem method
        const id = await loroAPI.createItem<JournalEntry>('journalEntry', journalEntry as JournalEntry);
        if (!id) {
            return logToolActivity('addJournalEntry', 'Failed to create journal entry using LoroAPI', false);
        }
        console.log(`Journal entry created with ID: ${id}`);
        return logToolActivity('addJournalEntry', `Added journal entry: "${inputs.title}"`);
    } catch (error) {
        console.error('Error creating journal entry:', error);
        // Ensure error is stringified properly
        const errorMessage = error instanceof Error ? error.message : String(error);
        return logToolActivity('addJournalEntry', `Error: ${errorMessage}`, false);
    }
}
/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function addJournalEntryImplementation(parameters: ToolParameters): string {
    console.log('Called addJournalEntry tool with parameters:', parameters);
    try {
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try { parsedParams = JSON.parse(parameters); } catch { /* Handle error if needed, e.g., log it */ }
        }
        const title = parsedParams.title as string | undefined;
        const content = parsedParams.content as string | undefined;
        const mood = parsedParams.mood as string | undefined;
        const tags = parsedParams.tags as string | undefined;
        if (!title || typeof title !== 'string' || !title.trim()) {
            return JSON.stringify({ success: false, message: 'Invalid or missing title' });
        }
        if (!content || typeof content !== 'string' || !content.trim()) {
            return JSON.stringify({ success: false, message: 'Invalid or missing content' });
        }
        // Execute the async function but return sync response for legacy Ultravox
        execute({
            title: title.trim(),
            content: content.trim(),
            mood,
            tags
        }).then(result => {
            // Log async result, but don't wait for it
            console.log('Async journal entry creation result:', result);
        }).catch(err => {
            console.error('Async error in addJournalEntry execution:', err);
        });
        // Return success immediately (fire-and-forget)
        const result = {
            success: true,
            message: `Attempting to add journal entry: "${title}"` // Indicate action started
        };
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in addJournalEntry tool wrapper:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, message: `Error: ${errorMessage}` });
    }
}
````

## File: src/lib/tools/deleteTodo/function.ts
````typescript
import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
/**
 * Deletes a todo item
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    todoId?: string;
    text?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();
        // Find the todo using the search criteria with the LoroAPI
        const result = await loroAPI.findItem<TodoItem>('todo', {
            id: inputs.todoId,
            searchField: 'text',
            searchValue: inputs.text
        });
        if (!result) {
            return logToolActivity('deleteTodo', 'No matching todo found', false);
        }
        const [id, todo] = result;
        // Use the deleteItem helper from loroAPI for consistency
        const success = await loroAPI.deleteItem('todo', id);
        if (success) {
            return logToolActivity('deleteTodo', `Todo "${todo.text}" deleted successfully`);
        } else {
            return logToolActivity('deleteTodo', `Todo with ID ${id} not found in map`, false);
        }
    } catch (error) {
        console.error('Error deleting todo:', error);
        const message = error instanceof Error ? error.message : String(error);
        return logToolActivity('deleteTodo', message, false);
    }
}
/**
 * Legacy implementation for Ultravox compatibility with deleteTodo
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function deleteTodoImplementation(parameters: ToolParameters): string {
    console.log('Called deleteTodo tool with parameters:', parameters);
    try {
        // Handle both object and string parameter formats
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try {
                parsedParams = JSON.parse(parameters);
            } catch (e) {
                console.error('Failed to parse string parameters:', e);
            }
        }
        // Extract parameters with safer type checking
        const todoId = parsedParams.todoId as string | undefined;
        const todoText = parsedParams.todoText as string | undefined;
        // Call the new implementation with appropriate parameters
        execute({
            todoId,
            text: todoText
        }).then(result => {
            console.log('Todo deleted with result:', result);
        }).catch(err => {
            console.error('Error in deleteTodo execution:', err);
        });
        // Return a preliminary success message
        // The actual result will be displayed through the notification system
        const result = {
            success: true,
            message: `Deleted todo`
        };
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in deleteTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            success: false,
            message: `Error deleting todo: ${errorMessage}`
        };
        return JSON.stringify(result);
    }
}
/**
 * Legacy implementation for Ultravox compatibility with removeTodo
 * This is an alias to the deleteTodo implementation
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function removeTodoImplementation(parameters: ToolParameters): string {
    console.log('Called removeTodo tool with parameters (redirecting to deleteTodo):', parameters);
    return deleteTodoImplementation(parameters);
}
````

## File: src/lib/tools/filterTodos/function.ts
````typescript
import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
import { writable } from 'svelte/store';
// Create a store to track the current filter state
export const filterState = writable<{ tag: string | null; docId: string }>({
    tag: null,
    docId: 'personal' // Default list
});
/**
 * Filters todos by tag
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    tag?: string;
    docId?: string;
}): Promise<{ success: boolean; message: string; tag?: string | null }> {
    try {
        // If tag is 'all' or empty, set to null to show all
        const tag = (!inputs.tag || inputs.tag.toLowerCase() === 'all') ? null : inputs.tag;
        const docId = inputs.docId || 'personal';
        // Update the filter state
        filterState.update(state => ({ ...state, tag, docId }));
        return {
            success: true,
            message: tag ? `Filtering todos by tag: ${tag}` : 'Showing all todos',
            tag
        };
    } catch (error) {
        console.error('Error filtering todos:', error);
        return {
            success: false,
            message: `Error: ${error}`
        };
    }
}
/**
 * Get all unique tags from todos
 * @returns Array of unique tag strings
 */
export async function getAllUniqueTags(): Promise<string[]> {
    try {
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();
        // Get operations for todo schema
        const { query } = await loroAPI.getOperations<TodoItem>('todo');
        // Get all todos and extract tags
        const todos = query(() => true);
        // Build a set of unique tags
        const tagSet = new Set<string>();
        todos.forEach(([, todo]) => {
            if (todo.tags && Array.isArray(todo.tags)) {
                todo.tags.forEach(tag => tagSet.add(tag));
            }
        });
        // Convert set to array
        return Array.from(tagSet);
    } catch (error) {
        console.error('Error getting tags:', error);
        return [];
    }
}
/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function filterTodosImplementation(parameters: ToolParameters): string {
    console.log('Called filterTodos tool with parameters:', parameters);
    try {
        // Handle both object and string parameter formats
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try {
                parsedParams = JSON.parse(parameters);
            } catch (e) {
                console.error('Failed to parse string parameters:', e);
            }
        }
        // Extract parameters with safer type checking
        const tag = parsedParams.tag as string | undefined;
        const docId = parsedParams.docId as string | undefined;
        // Call the new implementation with appropriate parameters
        execute({
            tag,
            docId
        }).then(result => {
            console.log('Todos filtered with result:', result);
        }).catch(err => {
            console.error('Error in filterTodos execution:', err);
        });
        // Get tags for immediate return
        getAllUniqueTags().then(allTags => {
            console.log('Available tags:', allTags);
        }).catch(err => {
            console.error('Error getting tags:', err);
        });
        // Return a result with placeholder for tags
        const result = {
            success: true,
            message: tag ? `Filtering todos by tag: ${tag}` : 'Showing all todos',
            availableTags: [] // Will be updated client-side when async operation completes
        };
        // Log activity
        logToolActivity('filterTodos', result.message);
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in filterTodos tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            success: false,
            message: `Error filtering todos: ${errorMessage}`,
            availableTags: []
        };
        // Log error
        logToolActivity('filterTodos', result.message, false);
        return JSON.stringify(result);
    }
}
````

## File: src/lib/ultravox/loaders/viewLoader.ts
````typescript
/**
 * View Loader - Dynamically loads UI components for vibes
 * This is now a thin adapter to the centralized view registry
 */
import type { VibeComponent } from '../types';
import { loadView, clearViewCache as clearRegistryCache } from '../registries/viewRegistry';
/**
 * Dynamically loads a component from the components directory
 * Now uses the centralized view registry
 * @param componentName The name of the component to load
 * @returns The loaded component
 */
export async function loadVibeComponent(componentName: string): Promise<VibeComponent> {
    try {
        // Use the centralized registry to load the component
        return await loadView(componentName);
    } catch (error) {
        console.error(`❌ Error in loadVibeComponent for "${componentName}":`, error);
        throw new Error(`Failed to load component: ${componentName}`);
    }
}
/**
 * Clears the component cache
 */
export function clearComponentCache(): void {
    // Delegate to the registry's cache clearing function
    clearRegistryCache();
}
````

## File: src/lib/ultravox/stageManager.ts
````typescript
import { loadVibe } from './loaders/vibeLoader';
import type { AgentName, ResolvedTool, StageChangeData } from './types';
// Cache the currently active vibe
let activeVibe: Awaited<ReturnType<typeof loadVibe>> | null = null;
let _activeVibeName: string | null = null;
// Export the active vibe name as a getter
export const activeVibeName = (): string | null => _activeVibeName;
/**
 * Load or get a vibe by name
 * @param vibeName The name of the vibe to load (defaults to 'home')
 */
export async function getActiveVibe(vibeName = 'home') {
    // If no vibe is loaded yet or if requesting a different vibe than the active one
    if (!activeVibe || !_activeVibeName || _activeVibeName !== vibeName) {
        try {
            activeVibe = await loadVibe(vibeName);
            _activeVibeName = vibeName;
        } catch (error) {
            console.error(`❌ Failed to load vibe "${vibeName}":`, error);
            // If the requested vibe fails and it's not already the home vibe, 
            // try to fall back to the home vibe
            if (vibeName !== 'home') {
                try {
                    activeVibe = await loadVibe('home');
                    _activeVibeName = 'home';
                } catch (fallbackError) {
                    console.error(`❌ Failed to load fallback home vibe:`, fallbackError);
                    throw new Error(`Failed to load vibe "${vibeName}" and fallback home vibe`);
                }
            } else {
                throw new Error(`Failed to load home vibe: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return activeVibe;
}
/**
 * Reset the active vibe cache
 */
export function resetActiveVibe() {
    activeVibe = null;
    _activeVibeName = null;
}
/**
 * Creates stage change data for agent transitions
 * 
 * @param agentName The name of the agent to switch to
 * @param vibeId Optional vibe ID to load (defaults to current active vibe)
 * @returns The stage change data object compatible with Ultravox
 */
export async function createAgentStageChangeData(agentName: AgentName, vibeId?: string): Promise<StageChangeData> {
    // Get the active vibe configuration or load specific vibe if provided
    const vibe = vibeId ? await getActiveVibe(vibeId) : await getActiveVibe();
    // Normalize agent name (fallback to default if not found)
    const normalizedName = vibe.resolvedAgents.some(a => a.name === agentName)
        ? agentName
        : vibe.defaultAgent.name;
    // Find the agent configuration
    const agent = vibe.resolvedAgents.find(a => a.name === normalizedName) || vibe.defaultAgent;
    // Collect all tools available to this agent
    const agentTools = agent.resolvedTools || [];
    // Common tools from call config (vibe tools)
    const callTools = vibe.resolvedCallTools || [];
    // Combine all tools the agent should have access to
    // Starting with call-level tools which include globals
    const selectedTools: ResolvedTool[] = [
        ...callTools,        // Call-level tools (includes globals)
        ...agentTools        // Agent-specific tools
    ];
    // Build the system prompt using the agent's system prompt
    const systemPrompt = agent.systemPrompt;
    // Return the stage change data in the format expected by Ultravox
    return {
        systemPrompt,
        voice: agent.voiceId,
        toolResultText: `I'm now switching you to ${agent.name}...`,
        selectedTools
    };
}
````

## File: src/lib/vibes/counter/manifest.json
````json
{
    "name": "counter",
    "description": "Simple counter example",
    "systemPrompt": "You are managing a simple counter. Help users increment or decrement the counter.",
    "temperature": 0.7,
    "languageHint": "en",
    "view": "CounterView",
    "icon": "M12 6v6m0 0v6m0-6h6m-6 0H6",
    "color": "blue",
    "vibeTools": [],
    "defaultAgent": "Lily",
    "agents": [
        {
            "name": "Lily",
            "personality": "cheerful and energetic",
            "voiceId": "ede629be-f7cf-48a2-a7e6-ee2c50785b5d",
            "description": "counter manager",
            "temperature": 0.7,
            "systemPrompt": "You are Lily, managing a simple counter. Explain to users with enthusiasm that they can use the buttons to increment or decrement the counter value. Be cheerful and energetic in your responses.",
            "tools": []
        }
    ]
}
````

## File: src-tauri/tauri.conf.json
````json
{
  "$schema": "../../../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "Hominio",
  "version": "0.1.0",
  "identifier": "com.hominio.app",
  "build": {
    "frontendDist": "../build",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "bun dev",
    "beforeBuildCommand": "bun run build"
  },
  "app": {
    "windows": [
      {
        "title": "Hominio",
        "width": 1280,
        "height": 720,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    },
    "withGlobalTauri": true
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "10.13",
      "frameworks": [],
      "entitlements": null,
      "exceptionDomain": "",
      "signingIdentity": null,
      "providerShortName": null
    }
  }
}
````

## File: src/db/schema.ts
````typescript
import { pgTable, text, jsonb, timestamp, pgEnum, customType } from 'drizzle-orm/pg-core';
// Define custom BYTEA type
const bytea = customType<{ data: Buffer }>({
    dataType() {
        return 'bytea';
    },
    toDriver(value: unknown): Buffer {
        if (Buffer.isBuffer(value)) return value;
        if (value instanceof Uint8Array) return Buffer.from(value);
        // Handle arrays of numbers
        if (Array.isArray(value)) return Buffer.from(value);
        // Default fallback for other cases
        return Buffer.from([]);
    },
    fromDriver(value: unknown): Buffer {
        if (Buffer.isBuffer(value)) return value;
        return Buffer.from([]);
    }
});
// Type enum for content records (snapshot or update)
export const contentTypeEnum = pgEnum('content_type', ['snapshot', 'update']);
// Content blocks (matches Content interface from hominio-db.ts)
export const content = pgTable('content', {
    // Content identifier (hash)
    cid: text('cid').primaryKey(),
    // 'snapshot' or 'update'
    type: contentTypeEnum('type').notNull(),
    // Raw binary data (serialized LoroDoc)
    raw: bytea('raw').notNull(),
    // Mirrored metadata for indexability
    metadata: jsonb('metadata'),
    // Created timestamp
    createdAt: timestamp('created_at').notNull().defaultNow()
});
// Main document registry (matches Docs interface from hominio-db.ts)
export const docs = pgTable('docs', {
    // Stable document identity (like IPNS)
    pubKey: text('pub_key').primaryKey(),
    // Document owner
    owner: text('owner').notNull(),
    // Last update timestamp
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    // Content hash of latest snapshot (like IPFS)
    snapshotCid: text('snapshot_cid').references(() => content.cid, { onDelete: 'restrict' }),
    // Content hashes of incremental updates
    updateCids: text('update_cids').array().default([]),
    // Created timestamp
    createdAt: timestamp('created_at').notNull().defaultNow()
});
// Types for type safety
export type Doc = typeof docs.$inferSelect;
export type InsertDoc = typeof docs.$inferInsert;
export type Content = typeof content.$inferSelect;
export type InsertContent = typeof content.$inferInsert;
````

## File: src/lib/client/hominio.ts
````typescript
import { treaty } from '@elysiajs/eden';
import type { App } from '../../routes/api/[...slugs]/+server';
// Create the base Eden client with proper URL format
export const hominio = treaty<App>('http://localhost:5173');
// Export the client type for better type inference
export type Hominio = typeof hominio;
// CORRECT USAGE PATTERNS FOR OUR API:
// 
// For root endpoints (no parameters):
// const { data } = await hominio.api.docs.list.get() // Use .list for the root endpoint
// const { data } = await hominio.api.content.list.get()
//
// For parametric endpoints:
// const { data } = await hominio.api.docs({ pubKey: "abc123" }).get()
// const { data } = await hominio.api.content({ cid: "abc123" }).get()
//
// For nested endpoints with parameters:
// const { data } = await hominio.api.docs({ pubKey: "abc123" }).update.post({ binaryUpdate: [...] })
// const { data } = await hominio.api.docs({ pubKey: "abc123" }).snapshot.post({ binarySnapshot: [...] })
// const { data } = await hominio.api.content({ cid: "abc123" }).binary.get()
//
// Creating new documents:
// const { data } = await hominio.api.docs.post({ binarySnapshot: [...], title: "My Doc" })
//
// IMPORTANT: Never use array access syntax with dynamic values:
// ❌ WRONG: hominio.api.docs[pubKey].get() 
// ✅ RIGHT: hominio.api.docs({ pubKey: pubKey }).get()
````

## File: src/lib/components/VibeRenderer.svelte
````
<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { GLOBAL_CALL_TOOLS } from '$lib/ultravox/globalTools';
	import { getActiveVibe, initializeVibe, loadView, clearViewCache } from '$lib/ultravox';
	import { currentAgent } from '$lib/ultravox/agents';
	import type { AgentConfig } from '$lib/ultravox/types';
	// Define interface for our vibe manifest that includes the view property
	interface ExtendedVibeManifest {
		name: string;
		description?: string;
		systemPrompt?: string;
		view?: string;
		vibeTools?: string[];
		defaultAgent?: string;
		agents?: AgentConfig[];
		[key: string]: any;
	}
	// Define type for the vibe selection event
	interface VibeSelectEvent {
		detail: {
			vibeId: string;
		};
	}
	const dispatch = createEventDispatcher();
	// Props using Svelte 5 runes
	const props = $props<{ vibeId?: string }>();
	const initialVibeId = props.vibeId || 'home';
	// Agent and tool management
	let globalSkills = $state<Array<{ name: string }>>([]);
	let vibeSkills = $state<Array<{ name: string }>>([]);
	let agentTools = $state<Record<string, Array<{ name: string }>>>({});
	let toolSkills = $state<Record<string, any>>({});
	let toolIcons = $state<Record<string, string>>({});
	let toolColors = $state<Record<string, string>>({});
	// Vibe state
	let activeVibeName = $state<string>(initialVibeId);
	let loadingVibe = $state(true);
	let vibeComponent = $state<any>(null);
	let vibeComponentName = $state<string>('');
	let loadingComponent = $state(true);
	let componentError = $state<string>('');
	let activeManifest = $state<ExtendedVibeManifest | null>(null);
	// Helper function to get global skills
	async function getGlobalSkills(): Promise<Array<{ name: string }>> {
		// Convert global tools to the expected format
		return GLOBAL_CALL_TOOLS.map((toolName) => ({ name: toolName }));
	}
	// Component loader for dynamic component rendering
	function loadComponentUI() {
		try {
			console.log(`🧩 Loading component dynamically: ${vibeComponentName}`);
			loadingComponent = true;
			componentError = '';
			// Use the registry to load all views dynamically
			loadView(vibeComponentName)
				.then((component) => {
					console.log(`✅ Successfully loaded component: ${vibeComponentName}`);
					vibeComponent = component;
					loadingComponent = false;
				})
				.catch((error) => {
					console.error(`❌ Failed to load component: ${vibeComponentName}`, error);
					componentError = `Failed to load component: ${error.message}`;
					loadingComponent = false;
				});
		} catch (error) {
			console.error('Error in loadComponentUI:', error);
			componentError = `Error in loadComponentUI: ${error}`;
			loadingComponent = false;
		}
	}
	// Function to set up vibe configuration dynamically from manifest
	async function setupVibeConfig(vibe: ExtendedVibeManifest) {
		// Reset vibe-specific state
		vibeSkills = [];
		agentTools = {};
		// Set component name from the vibe manifest
		if (vibe.view) {
			vibeComponentName = vibe.view;
			console.log(`📋 Using view from manifest: ${vibeComponentName}`);
		} else {
			// Fallback to capitalized vibe name + "View" if no view specified
			vibeComponentName = `${vibe.name.charAt(0).toUpperCase() + vibe.name.slice(1)}View`;
			console.log(`⚠️ No view specified in manifest, using default: ${vibeComponentName}`);
		}
		// Set up vibe tools from manifest
		if (Array.isArray(vibe.vibeTools)) {
			vibeSkills = vibe.vibeTools.map((toolName) => ({ name: toolName }));
			console.log(`🛠️ Loaded ${vibeSkills.length} vibe tools from manifest`);
		}
		// Set up agent tools from manifest
		if (Array.isArray(vibe.agents)) {
			for (const agent of vibe.agents) {
				if (agent.name && Array.isArray(agent.tools)) {
					agentTools[agent.name] = agent.tools.map((toolName) => ({ name: toolName }));
					console.log(`👤 Loaded ${agentTools[agent.name].length} tools for agent ${agent.name}`);
				}
			}
		}
		console.log(`✅ Configured vibe "${vibe.name}" with ${vibeComponentName} component`);
	}
	// Function to handle vibe switching
	async function switchVibe(newVibeId: string) {
		console.log(`🔄 Switching to vibe: ${newVibeId}`);
		loadingVibe = true;
		dispatch('vibeChange', { vibeId: newVibeId });
		try {
			// Clear component cache to ensure fresh loading
			clearViewCache();
			vibeComponent = null;
			// Update active vibe name
			activeVibeName = newVibeId;
			// Initialize the vibe using the Ultravox system
			await initializeVibe(newVibeId);
			// Try to get the vibe manifest for additional info
			try {
				const vibe = await getActiveVibe(newVibeId);
				activeManifest = vibe.manifest as ExtendedVibeManifest;
				console.log(`📋 Loaded manifest for ${newVibeId} vibe:`, activeManifest);
				// Setup configuration based on manifest
				await setupVibeConfig(activeManifest);
				// Load tools data
				await loadToolData([...globalSkills, ...vibeSkills, ...Object.values(agentTools).flat()]);
			} catch (error) {
				console.error(`❌ Failed to load vibe manifest: ${error}`);
				loadingVibe = false;
				componentError = `Failed to load vibe manifest: ${error}`;
				return;
			}
			// Load component UI
			loadComponentUI();
			loadingVibe = false;
		} catch (error) {
			console.error('Error switching vibe:', error);
			loadingVibe = false;
			componentError = `Error switching vibe: ${error}`;
		}
	}
	// Function to load tool data from manifests
	async function loadToolData(toolNames: Array<{ name: string }>) {
		const uniqueToolNames = [...new Set(toolNames.map((t) => t.name))];
		const skills: Record<string, string> = {};
		const icons: Record<string, string> = {};
		const colors: Record<string, string> = {};
		for (const toolName of uniqueToolNames) {
			try {
				const manifest = await import(`../../lib/tools/${toolName}/manifest.json`);
				skills[toolName] = manifest.skill || '';
				icons[toolName] =
					manifest.icon || 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
				colors[toolName] = manifest.color || 'amber';
			} catch (error) {
				// Set default values if manifest load fails
				console.log(`⚠️ Using default values for tool ${toolName}: ${error}`);
				skills[toolName] =
					toolName === 'createTodo'
						? 'Create a new todo item'
						: toolName === 'toggleTodo'
							? 'Mark a todo as complete or incomplete'
							: toolName === 'deleteTodo'
								? 'Delete a todo item'
								: toolName === 'createList'
									? 'Create a new todo list'
									: toolName === 'switchList'
										? 'Switch between todo lists'
										: toolName === 'switchAgent'
											? "Change who you're speaking with"
											: toolName === 'hangUp'
												? 'End the current voice call'
												: '';
				// Set default icons
				icons[toolName] =
					toolName === 'createTodo'
						? 'M12 6v6m0 0v6m0-6h6m-6 0H6'
						: toolName === 'toggleTodo'
							? 'M5 13l4 4L19 7'
							: toolName === 'deleteTodo'
								? 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
								: toolName === 'createList'
									? 'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
									: toolName === 'switchList'
										? 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4'
										: toolName === 'switchAgent'
											? 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
											: toolName === 'hangUp'
												? 'M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z'
												: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
				// Set default colors based on tool type
				colors[toolName] =
					toolName === 'createTodo' || toolName === 'createList'
						? 'blue'
						: toolName === 'toggleTodo'
							? 'green'
							: toolName === 'deleteTodo'
								? 'red'
								: toolName === 'switchList' || toolName === 'switchAgent'
									? 'cyan'
									: toolName === 'hangUp'
										? 'rose'
										: 'amber';
			}
		}
		toolSkills = skills;
		toolIcons = icons;
		toolColors = colors;
		console.log(`📊 Loaded data for ${uniqueToolNames.length} tools`);
	}
	// Initialize the component with the provided vibe
	onMount(async () => {
		console.log(`🚀 Initializing VibeRenderer with vibe: ${initialVibeId}`);
		// Load initial global skills
		globalSkills = await getGlobalSkills();
		console.log(`📊 Loaded ${globalSkills.length} global skills`);
		// Switch to the provided vibe
		await switchVibe(initialVibeId);
		// Listen for vibe change events from the tool implementation
		window.addEventListener('ultravox-vibe-changed', async (event) => {
			// Type assertion for the event
			const vibeEvent = event as CustomEvent<{ vibeId: string }>;
			const newVibeId = vibeEvent.detail.vibeId;
			console.log(`📣 Received ultravox-vibe-changed event for: ${newVibeId}`);
			if (newVibeId !== activeVibeName) {
				console.log(`🔄 VibeRenderer received vibe change event, updating UI for: ${newVibeId}`);
				await switchVibe(newVibeId);
			}
		});
	});
	onDestroy(() => {
		// Cleanup any resources
		console.log('VibeRenderer destroyed, cleaning up resources');
		window.removeEventListener('ultravox-vibe-changed', () => {});
	});
</script>
<div class="mx-auto grid max-w-full grid-cols-1 gap-6 text-white lg:grid-cols-12 lg:px-4">
	<!-- Left sidebar for Skills -->
	<div class="relative z-10 lg:col-span-2">
		<div class="sticky top-6 p-4">
			<!-- Vibe Tools Panel -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 flex items-center text-lg font-semibold text-white/80">
					Skills
					{#if !loadingVibe}
						<span class="ml-2 text-sm text-white/60">
							({globalSkills.length + vibeSkills.length + Object.values(agentTools).flat().length})
						</span>
					{/if}
				</h3>
				{#if loadingVibe}
					<div class="flex items-center justify-center py-6">
						<div
							class="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
						></div>
						<span class="ml-3 text-sm text-white/70">Loading skills...</span>
					</div>
				{:else}
					<!-- Global Skills Section -->
					{#if globalSkills.length > 0}
						<div class="mb-4">
							<h4 class="mb-2 text-sm font-semibold text-white/60">
								Global ({globalSkills.length})
							</h4>
							<div class="space-y-3">
								{#each globalSkills as tool}
									<div
										class="rounded-lg border border-white/5 bg-cyan-900/20 p-3 transition-colors hover:bg-white/10"
									>
										<div class="flex items-center gap-2">
											<div
												class={`rounded-full bg-${toolColors[tool.name] || 'amber'}-500/20 p-1.5`}
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d={toolIcons[tool.name] ||
															'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}
													/>
												</svg>
											</div>
											<div class="text-xs font-medium text-white/80">{tool.name}</div>
										</div>
										<div class="mt-1 text-xs text-white/70">
											{toolSkills[tool.name] || 'No description available'}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
					<!-- Vibe Skills Section - Only show if there are vibe skills -->
					{#if vibeSkills.length > 0}
						<div class="mb-4">
							<h4 class="mb-2 text-sm font-semibold text-white/60">
								Vibe ({vibeSkills.length})
							</h4>
							<div class="space-y-3">
								{#each vibeSkills as tool}
									<div
										class="rounded-lg border border-white/5 bg-indigo-900/20 p-3 transition-colors hover:bg-white/10"
									>
										<div class="flex items-center gap-2">
											<div
												class={`rounded-full bg-${toolColors[tool.name] || 'amber'}-500/20 p-1.5`}
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d={toolIcons[tool.name] ||
															'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}
													/>
												</svg>
											</div>
											<div class="text-xs font-medium text-white/80">{tool.name}</div>
										</div>
										<div class="mt-1 text-xs text-white/70">
											{toolSkills[tool.name] || 'No description available'}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
					<!-- Only render agent sections that have tools -->
					{#each Object.entries(agentTools) as [agentName, tools]}
						{#if tools.length > 0 || ($currentAgent && agentName === $currentAgent) || (activeManifest?.defaultAgent && agentName === activeManifest.defaultAgent)}
							<div class="mt-5">
								<h4 class="mb-2 text-sm font-semibold text-white/60">
									{agentName} ({tools.length})
								</h4>
								<div class="space-y-3">
									{#each tools as tool}
										<div
											class="rounded-lg border border-white/5 bg-white/5 p-3 transition-colors hover:bg-white/10"
										>
											<div class="flex items-center gap-2">
												<div
													class={`rounded-full bg-${toolColors[tool.name] || 'amber'}-500/20 p-1.5`}
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-3.5 w-3.5"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d={toolIcons[tool.name] ||
																'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}
														/>
													</svg>
												</div>
												<div class="text-xs font-medium text-white/80">{tool.name}</div>
											</div>
											<div class="mt-1 text-xs text-white/70">
												{toolSkills[tool.name] || 'No description available'}
											</div>
										</div>
									{/each}
									{#if tools.length === 0}
										<p class="text-center text-xs text-white/60 italic">
											No specific tools available
										</p>
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>
		</div>
	</div>
	<!-- Main content area - Dynamically loaded vibe component -->
	<div class="relative z-10 lg:col-span-8">
		<!-- Centered glassmorphic title -->
		<div class="mb-6 flex justify-center">
			<div
				class="inline-flex items-center space-x-2 rounded-t-none rounded-b-2xl border border-white/10 bg-white/5 px-4 pt-0.5 pb-1.5 backdrop-blur-md"
			>
				<h1 class="text-base font-medium text-white/90">
					{activeManifest?.name || activeVibeName.charAt(0).toUpperCase() + activeVibeName.slice(1)}
				</h1>
			</div>
		</div>
		{#if loadingVibe}
			<div class="flex h-64 items-center justify-center">
				<div class="flex flex-col items-center">
					<div
						class="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
					></div>
					<p class="mt-4 text-white/60">Loading {vibeComponentName} component...</p>
				</div>
			</div>
		{:else if componentError}
			<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
				<h3 class="text-lg font-bold text-red-400">Error Loading Component</h3>
				<p class="text-white/70">{componentError}</p>
			</div>
		{:else if !vibeComponent}
			<div class="py-8 text-center">
				<p class="text-white/70">No component available for {activeVibeName} vibe</p>
			</div>
		{:else if loadingComponent}
			<div class="flex h-64 items-center justify-center">
				<div class="flex flex-col items-center">
					<div
						class="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
					></div>
					<p class="mt-4 text-white/60">Loading {vibeComponentName} component...</p>
				</div>
			</div>
		{:else}
			<!-- Component UI -->
			<svelte:component
				this={vibeComponent}
				on:selectVibe={(e: VibeSelectEvent) => switchVibe(e.detail.vibeId)}
			/>
		{/if}
	</div>
	<!-- Right sidebar for schema information -->
	<div class="relative z-10 lg:col-span-2">
		<div class="sticky top-6 p-4">
			<!-- Schema Display Area -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
				<h3 class="mb-3 text-lg font-semibold text-white/80">Data</h3>
				<!-- Schema List -->
				<div class="space-y-2">
					<div
						class="group flex cursor-pointer items-center justify-between rounded-lg border border-white/5 bg-white/5 p-3 transition-all hover:border-blue-500/30 hover:bg-white/10"
					>
						<div class="flex items-center space-x-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 text-blue-300"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								/>
							</svg>
							<span class="text-sm font-medium text-white/90">Todo</span>
						</div>
						<span class="text-xs text-white/50 group-hover:text-blue-300">4 fields</span>
					</div>
					<div
						class="group flex cursor-pointer items-center justify-between rounded-lg border border-white/5 bg-white/5 p-3 transition-all hover:border-blue-500/30 hover:bg-white/10"
					>
						<div class="flex items-center space-x-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 text-blue-300"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
								/>
							</svg>
							<span class="text-sm font-medium text-white/90">TodoList</span>
						</div>
						<span class="text-xs text-white/50 group-hover:text-blue-300">4 fields</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
<style lang="postcss">
	/* Add a subtle glow effect for buttons */
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
	}
</style>
````

## File: src/routes/+page.svelte
````
<script lang="ts">
	import { onMount } from 'svelte';
	import { authClient } from '$lib/client/auth-hominio';
	import { goto } from '$app/navigation';
	// State variables
	// let ready = $state(false); // Keep if needed for transitions/animations
	let loading = $state(false);
	let error = $state<string | null>(null);
	const session = authClient.useSession();
	// Redirect to /me if already logged in
	$effect(() => {
		if ($session.data) {
			goto('/me');
		}
	});
	// onMount(() => { // Keep if needed for transitions/animations
	// 	setTimeout(() => {
	// 		ready = true;
	// 	}, 500);
	// });
	async function handleGoogleSignIn() {
		loading = true;
		error = null;
		try {
			const result = await authClient.signIn.social({
				provider: 'google'
			});
			if (result.error) {
				throw new Error(result.error.message || 'Failed to sign in with Google');
			}
			// Successful sign-in will trigger the $effect above
		} catch (err) {
			console.error('Google sign in error:', err);
			error = err instanceof Error ? err.message : 'Failed to sign in with Google';
		} finally {
			loading = false;
		}
	}
</script>
<div class="bg-custom-beige text-custom-blue min-h-screen w-full font-sans">
	<!-- Header -->
	<header class="container mx-auto px-6 py-4">
		<nav class="flex items-center justify-between">
			<div class="flex items-center gap-8">
				<!-- Optional: Add logo here if needed -->
				<!-- <img src="/logo-dark.svg" alt="Hominio Logo" class="h-8"> -->
				<a href="/platform" class="text-sm hover:underline">Platform</a>
				<a href="/developers" class="text-sm hover:underline">Developers</a>
				<a href="/use-cases" class="text-sm hover:underline">Use Cases</a>
			</div>
		</nav>
	</header>
	<!-- Hero Section -->
	<main
		class="network-bg container mx-auto flex min-h-[calc(100vh-150px)] flex-col items-center justify-center px-6 pt-10 pb-20 text-center"
	>
		<h1 class="mb-4 text-6xl font-bold md:text-8xl">Hominio</h1>
		<p class="mb-12 max-w-xl text-lg md:text-xl">
			What if your time and expertise didn't just pay the bills, but earned you a stake in something
			bigger?
		</p>
		{#if error}
			<div class="mb-4 max-w-md rounded-lg bg-red-100 p-3 text-sm text-red-700">
				{error}
			</div>
		{/if}
		<button
			onclick={handleGoogleSignIn}
			disabled={loading}
			class="border-custom-blue text-custom-blue mt-12 inline-flex items-center justify-center gap-2 rounded-full border bg-white px-5 py-2 text-sm font-medium transition-colors hover:bg-gray-100 disabled:opacity-50"
		>
			<svg class="h-5 w-5" viewBox="0 0 24 24">
				<path
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					fill="#4285F4"
				/>
				<path
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					fill="#34A853"
				/>
				<path
					d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
					fill="#FBBC05"
				/>
				<path
					d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
					fill="#EA4335"
				/>
			</svg>
			{loading ? 'Processing...' : 'Continue with Google'}
		</button>
		<!-- Footer/Spacing element -->
		<div class="h-24"></div>
	</main>
	<!-- Optional: Add other sections like Features, Footer etc. later -->
</div>
<!-- Define custom colors (or configure in tailwind.config.js) -->
<style>
	:root {
		--color-background: #f5f1e8; /* Example light beige */
		--color-text: #1a365d; /* Example dark blue */
		--color-button-border: #1a365d;
	}
	.bg-custom-beige {
		background-color: var(--color-background);
	}
	.text-custom-blue {
		color: var(--color-text);
	}
	.border-custom-blue {
		border-color: var(--color-button-border);
	}
	.hover\:bg-custom-blue:hover {
		background-color: var(--color-text);
	}
	.hover\:text-custom-beige:hover {
		color: var(--color-background);
	}
	.network-bg {
		background-image: url('/network-background.svg'); /* Placeholder */
		background-repeat: no-repeat;
		background-position: center bottom;
		background-size: contain;
	}
</style>
````

## File: vite.config.ts
````typescript
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from "vite-plugin-wasm";
// import topLevelAwait from "vite-plugin-top-level-await"; // Temporarily removed
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		wasm(),
		// topLevelAwait(), // Temporarily removed
	],
	resolve: {
		// Handle Tauri API as external module to avoid dev-time errors
		conditions: ['browser']
	},
	server: {
		host: '0.0.0.0',  // Listen on all network interfaces
		port: 5173,       // Same port as in package.json
		strictPort: true, // Fail if port is already in use
		// Enable HTTPS for iOS if needed (comment out if not using HTTPS)
		// https: true,
		watch: {
			ignored: [
				'**/node_modules/**',
				'**/.git/**'
			]
		}
	},
	optimizeDeps: {
		exclude: ['loro-crdt']
	},
	build: {
		// Ensure assets are copied
		copyPublicDir: true,
		// Make it compatible with Tauri
		target: 'esnext',
		// Smaller chunks for better loading
		chunkSizeWarningLimit: 1000
	},
	// Properly handle WASM files
	assetsInclude: ['**/*.wasm', '**/*.data'],
	// Configure public directory for static assets
	publicDir: 'static'
});
````

## File: src/lib/tools/toggleTodo/function.ts
````typescript
import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
/**
 * Toggles the completed state of a todo item
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    todoId?: string;
    text?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();
        // Find the todo using the search criteria with the LoroAPI
        const result = await loroAPI.findItem<TodoItem>('todo', {
            id: inputs.todoId,
            searchField: 'text',
            searchValue: inputs.text
        });
        if (!result) {
            return logToolActivity('toggleTodo', 'No matching todo found', false);
        }
        const [id, todo] = result;
        // Use the updateItem helper from loroAPI for consistency
        const success = await loroAPI.updateItem<TodoItem>('todo', id, (currentItem) => {
            return {
                ...currentItem,
                completed: !currentItem.completed
            };
        });
        if (success) {
            return logToolActivity('toggleTodo', `Todo "${todo.text}" ${todo.completed ? 'marked incomplete' : 'marked complete'}`);
        } else {
            return logToolActivity('toggleTodo', `Failed to toggle todo with ID ${id}`, false);
        }
    } catch (error) {
        console.error('Error toggling todo:', error);
        const message = error instanceof Error ? error.message : String(error);
        return logToolActivity('toggleTodo', message, false);
    }
}
/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function toggleTodoImplementation(parameters: ToolParameters): string {
    console.log('Called toggleTodo tool with parameters:', parameters);
    try {
        // Handle both object and string parameter formats
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try {
                parsedParams = JSON.parse(parameters);
            } catch (e) {
                console.error('Failed to parse string parameters:', e);
            }
        }
        // Extract parameters with safer type checking
        const todoId = parsedParams.todoId as string | undefined;
        const todoText = parsedParams.todoText as string | undefined;
        // Call the new implementation with appropriate parameters
        execute({
            todoId,
            text: todoText
        }).then(result => {
            console.log('Todo toggled with result:', result);
        }).catch(err => {
            console.error('Error in toggleTodo execution:', err);
        });
        // Return a preliminary success message
        // The actual result will be displayed through the notification system
        const result = {
            success: true,
            message: `Toggled todo completion status`
        };
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in toggleTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            success: false,
            message: `Error toggling todo: ${errorMessage}`
        };
        return JSON.stringify(result);
    }
}
````

## File: src/lib/ultravox/loaders/toolLoader.ts
````typescript
/**
 * Tool Loader - Dynamically loads tools and their implementations
 */
import type { ToolDefinition } from '../types';
import { loadAllTools, setupToolsForUltravox } from '../registries/toolRegistry';
// Common types for Ultravox tool functions
// Note: Using imported types from types.ts
// Declare global window interface
// Note: Now defined in types.ts
/**
 * In-memory cache for tool definitions to avoid reloading
 */
const toolCache = new Map<string, ToolDefinition>();
/**
 * Loads a tool from its manifest
 * @param toolName The name of the tool to load
 * @returns The tool definition with its implementation
 */
export async function loadTool(toolName: string): Promise<ToolDefinition> {
    // First check if we have it in cache
    if (toolCache.has(toolName)) {
        return toolCache.get(toolName)!;
    }
    try {
        // Load the manifest
        const manifest = await import(`../../tools/${toolName}/manifest.json`);
        // Create the tool definition
        const toolDefinition: ToolDefinition = {
            ...manifest,
            implementation: undefined  // Will be loaded separately
        };
        // Dynamically import the implementation
        try {
            const module = await import(`../../tools/${toolName}/function.ts`);
            const implementationName = `${toolName}Implementation`;
            // Get the implementation function from the module
            if (typeof module[implementationName] === 'function') {
                toolDefinition.implementation = module[implementationName];
            } else {
                console.error(`❌ Tool implementation "${implementationName}" not found in module`);
            }
        } catch (error) {
            console.error(`❌ Failed to load implementation for tool "${toolName}":`, error);
        }
        // Cache the tool definition
        toolCache.set(toolName, toolDefinition);
        return toolDefinition;
    } catch (error) {
        console.error(`❌ Failed to load tool "${toolName}":`, error);
        throw new Error(`Failed to load tool "${toolName}": ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Ensure tools are available globally for Ultravox
 * This now uses the centralized registry
 */
export function prepareToolRegistry(): void {
    // Delegate to the centralized registry
    loadAllTools().catch(error => {
        console.error('Failed to load tools:', error);
    });
}
/**
 * Setup event listeners for tool registration
 * This delegates to the centralized registry
 */
export function setupToolRegistrationListeners(): void {
    if (typeof window === 'undefined' || window.__hominio_tools_registered) return;
    // Use the centralized setup function
    setupToolsForUltravox().catch(error => {
        console.error('Failed to set up tools for Ultravox:', error);
    });
}
/**
 * Clear the tool cache
 */
export function clearToolCache(): void {
    toolCache.clear();
}
````

## File: src/lib/KERNEL/loro-service.ts
````typescript
import { browser } from '$app/environment'; // Import browser check
import { LoroDoc } from 'loro-crdt';
import { hashService } from './hash-service';
// Define proper types for Loro document JSON state
type LoroJsonValue = string | number | boolean | null | LoroJsonObject | LoroJsonArray;
interface LoroJsonObject { [key: string]: LoroJsonValue }
type LoroJsonArray = LoroJsonValue[];
/**
 * Service for managing Loro documents using content-addressable storage patterns.
 * Handles document creation, import/export, and integrates with hash-service.
 */
export class LoroService {
    /**
     * Create a new empty Loro document with basic initialization
     */
    createEmptyDoc(): LoroDoc {
        const doc = new LoroDoc();
        // No longer adding any initial data or metadata
        return doc;
    }
    /**
     * Generate a public key in the style of hypercore/IPNS
     * @returns A z-prefixed base64url-encoded public key
     */
    generatePublicKey(): string {
        // Generate a random ID of 32 bytes
        let randomBytes: Uint8Array;
        if (browser && window.crypto) {
            // Use browser's crypto API
            randomBytes = new Uint8Array(32);
            window.crypto.getRandomValues(randomBytes);
        } else {
            // Use Node.js crypto module in a way that works with SvelteKit
            // Avoid direct require() to make ESM happy
            try {
                // Dynamic import for Node environments
                randomBytes = new Uint8Array(32);
                // Fill with random values as fallback
                for (let i = 0; i < 32; i++) {
                    randomBytes[i] = Math.floor(Math.random() * 256);
                }
                console.warn('Using Math.random fallback for key generation');
            } catch (err) {
                console.error('Error generating random bytes:', err);
                // Fallback to Math.random if crypto is not available
                randomBytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    randomBytes[i] = Math.floor(Math.random() * 256);
                }
            }
        }
        // Convert to hex string for readability
        return Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
    /**
     * Create a document snapshot and generate its CID
     * @param doc The Loro document to snapshot
     * @returns The snapshot data and its CID
     */
    async createSnapshot(doc: LoroDoc): Promise<{
        snapshot: Uint8Array;
        cid: string;
        jsonState: LoroJsonObject;
    }> {
        try {
            // Export the document as a snapshot
            const binaryData = doc.export({ mode: 'snapshot' });
            console.log(`Created snapshot, size: ${binaryData.byteLength} bytes`);
            // Log the first few bytes for debugging
            console.log(`Snapshot header: ${Array.from(binaryData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
            // Generate content ID using hash-service
            const cid = await hashService.hashSnapshot(binaryData);
            // Get JSON representation for easier debugging
            const jsonState = doc.toJSON() as LoroJsonObject;
            return { snapshot: binaryData, cid, jsonState };
        } catch (err) {
            console.error('Failed to create snapshot:', err);
            throw new Error(`Failed to create Loro snapshot: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }
    /**
     * Create a document update and generate its CID
     * @param doc The Loro document to create an update from
     * @returns The update data and its CID
     */
    async createUpdate(doc: LoroDoc): Promise<{
        update: Uint8Array;
        cid: string;
    }> {
        try {
            // Export the document as an update
            const binaryData = doc.export({ mode: 'update' });
            console.log(`Created update, size: ${binaryData.byteLength} bytes`);
            // Log the first few bytes for debugging
            console.log(`Update header: ${Array.from(binaryData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
            // Generate content ID using hash-service
            const cid = await hashService.hashSnapshot(binaryData);
            return { update: binaryData, cid };
        } catch (err) {
            console.error('Failed to create update:', err);
            throw new Error(`Failed to create Loro update: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }
    /**
     * Apply an update to a document
     * @param doc The document to update
     * @param update The update to apply
     */
    applyUpdate(doc: LoroDoc, update: Uint8Array): void {
        try {
            if (!update || update.byteLength === 0) {
                throw new Error('Invalid update data: empty or null');
            }
            // Log the first few bytes for debugging
            console.log(`Applying update, size: ${update.byteLength} bytes`);
            console.log(`Update header: ${Array.from(update.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
            // Import the update to the document
            doc.import(update);
        } catch (err) {
            console.error('Failed to apply update:', err);
            throw new Error(`Failed to apply Loro update: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }
    /**
     * Create a demo document with sample content
     * @returns A document with sample content
     */
    async createDemoDoc(): Promise<{
        doc: LoroDoc;
        snapshot: Uint8Array;
        cid: string;
        pubKey: string;
        jsonState: LoroJsonObject;
    }> {
        // Create a new document
        const doc = this.createEmptyDoc();
        // Add some sample content
        doc.getText('title').insert(0, 'Example Loro Document');
        doc.getText('body').insert(0, 'This is a test document created with Loro CRDT library.');
        // Add metadata
        const meta = doc.getMap('metadata');
        meta.set('author', 'LoroService');
        // Removed createdAt field to keep document clean
        // Generate public key
        const pubKey = this.generatePublicKey();
        // Create snapshot
        const { snapshot, cid, jsonState } = await this.createSnapshot(doc);
        return { doc, snapshot, cid, pubKey, jsonState };
    }
}
// Export a singleton instance
export const loroService = new LoroService();
````

## File: src/lib/tools/updateTodo/function.ts
````typescript
// Implementation extracted from hominio/+page.svelte
import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
/**
 * Updates a todo item with new properties
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    todoId?: string;
    text?: string;
    newText?: string;
    completed?: boolean;
    tags?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();
        // Prepare update data
        const updateData: Partial<TodoItem> = {};
        if (inputs.newText) {
            updateData.text = inputs.newText.trim();
        }
        if (inputs.completed !== undefined) {
            updateData.completed = inputs.completed;
        }
        if (inputs.tags) {
            updateData.tags = inputs.tags
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);
        }
        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            return logToolActivity('updateTodo', 'No updates specified', false);
        }
        // Find the todo using the search criteria with the LoroAPI
        const result = await loroAPI.findItem<TodoItem>('todo', {
            id: inputs.todoId,
            searchField: 'text',
            searchValue: inputs.text
        });
        if (!result) {
            return logToolActivity('updateTodo', 'No matching todo found', false);
        }
        const [id, todo] = result;
        // Use the updateItem helper from loroAPI for consistency
        const success = await loroAPI.updateItem<TodoItem>('todo', id, (currentItem) => {
            return { ...currentItem, ...updateData };
        });
        if (success) {
            return logToolActivity('updateTodo', `Todo "${todo.text}" updated successfully`);
        } else {
            return logToolActivity('updateTodo', `Failed to update todo with ID ${id}`, false);
        }
    } catch (error) {
        console.error('Error updating todo:', error);
        const message = error instanceof Error ? error.message : String(error);
        return logToolActivity('updateTodo', message, false);
    }
}
/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function updateTodoImplementation(parameters: ToolParameters): string {
    console.log('Called updateTodo tool with parameters:', parameters);
    try {
        // Handle both object and string parameter formats
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try {
                parsedParams = JSON.parse(parameters);
            } catch (e) {
                console.error('Failed to parse string parameters:', e);
            }
        }
        // Extract parameters with safer type checking
        const todoId = parsedParams.todoId as string | undefined;
        const originalText = parsedParams.originalText as string | undefined;
        const newText = parsedParams.newText as string | undefined;
        const completedStr = parsedParams.completed as string | boolean | undefined;
        const tags = parsedParams.tags as string | undefined;
        // Handle the completed parameter which might be a string "true"/"false"
        let completed: boolean | undefined = undefined;
        if (typeof completedStr === 'boolean') {
            completed = completedStr;
        } else if (typeof completedStr === 'string') {
            completed = completedStr.toLowerCase() === 'true';
        }
        // Call the new implementation with appropriate parameters
        execute({
            todoId,
            text: originalText,
            newText,
            completed,
            tags
        }).then(result => {
            console.log('Todo updated with result:', result);
        }).catch(err => {
            console.error('Error in updateTodo execution:', err);
        });
        // Return a preliminary success message
        // The actual result will be displayed through the notification system
        const result = {
            success: true,
            message: `Updated todo`
        };
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in updateTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            success: false,
            message: `Error updating todo: ${errorMessage}`
        };
        return JSON.stringify(result);
    }
}
````

## File: src/lib/ultravox/loaders/vibeLoader.ts
````typescript
import type {
    ToolImplementation,
    ResolvedTool,
    ResolvedAgent,
    ResolvedVibe
} from '../types';
/**
 * Vibe Loader - Dynamically loads vibe configurations and their tools
 */
import { loadTool } from './toolLoader';
import { GLOBAL_CALL_TOOLS, isGlobalCallTool } from '../globalTools';
import { registerToolsWithUltravox } from '../registries/toolRegistry';
/**
 * In-memory cache for loaded vibes to avoid reloading
 */
const vibeCache = new Map<string, ResolvedVibe>();
/**
 * Loads a vibe configuration from its manifest
 * @param vibeName The name of the vibe to load
 * @returns The resolved vibe with all tools and agents loaded
 */
export async function loadVibe(vibeName: string): Promise<ResolvedVibe> {
    // First check if we have it in cache
    if (vibeCache.has(vibeName)) {
        return vibeCache.get(vibeName)!;
    }
    try {
        // Load the manifest
        const manifest = await import(`../../vibes/${vibeName}/manifest.json`);
        // Extract vibe-specific tools from manifest
        const vibeToolNames = manifest.default.vibeTools || [];
        // Load global tools first - these are always included
        const resolvedGlobalTools: ResolvedTool[] = [];
        for (const toolName of GLOBAL_CALL_TOOLS) {
            try {
                const tool = await loadTool(toolName) as ResolvedTool;
                resolvedGlobalTools.push(tool);
            } catch (error) {
                console.error(`❌ Failed to load global tool "${toolName}":`, error);
            }
        }
        // Load vibe-specific call tools
        const resolvedVibeTools: ResolvedTool[] = [];
        for (const toolName of vibeToolNames) {
            // Skip if it's already loaded as a global tool
            if (isGlobalCallTool(toolName)) {
                continue;
            }
            try {
                const tool = await loadTool(toolName) as ResolvedTool;
                resolvedVibeTools.push(tool);
            } catch (error) {
                console.error(`❌ Failed to load vibe call tool "${toolName}":`, error);
            }
        }
        // Combine global and vibe-specific call tools
        const allCallTools = [...resolvedGlobalTools, ...resolvedVibeTools];
        // Load tools for each agent and attach them to agent configs
        const resolvedAgents: ResolvedAgent[] = [];
        for (const agent of manifest.default.agents) {
            try {
                // Deep clone the agent config
                const agentConfig: ResolvedAgent = {
                    ...agent,
                    resolvedTools: []
                };
                // Load agent tools
                if (Array.isArray(agent.tools)) {
                    for (const toolName of agent.tools) {
                        // Skip tools that are already loaded as call or global tools
                        if (vibeToolNames.includes(toolName) || isGlobalCallTool(toolName)) {
                            continue;
                        }
                        try {
                            const tool = await loadTool(toolName) as ResolvedTool;
                            agentConfig.resolvedTools.push(tool);
                        } catch (error) {
                            console.error(`❌ Failed to load agent tool "${toolName}":`, error);
                        }
                    }
                }
                // Add the agent to the resolved agents
                resolvedAgents.push(agentConfig);
            } catch (error) {
                console.error(`❌ Failed to resolve agent "${agent.name}":`, error);
            }
        }
        // Find the default agent
        const defaultAgent = resolvedAgents.find(a => a.name === manifest.default.defaultAgent);
        if (!defaultAgent) {
            throw new Error(`Default agent "${manifest.default.defaultAgent}" not found in vibe "${vibeName}"`);
        }
        // Create the resolved vibe
        const resolvedVibe: ResolvedVibe = {
            manifest: manifest.default,
            resolvedCallTools: allCallTools,
            resolvedAgents,
            defaultAgent
        };
        // Cache the resolved vibe
        vibeCache.set(vibeName, resolvedVibe);
        return resolvedVibe;
    } catch (error) {
        console.error(`❌ Failed to load vibe "${vibeName}":`, error);
        throw new Error(`Failed to load vibe "${vibeName}": ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Clear the vibe cache
 */
export function clearVibeCache(): void {
    vibeCache.clear();
}
/**
 * Register all tools from a vibe with the Ultravox session
 * @param vibe The resolved vibe containing tools to register
 */
export function registerVibeTools(vibe: ResolvedVibe): void {
    if (typeof window === 'undefined') {
        console.warn('⚠️ Not in browser environment, skipping tool registration');
        return;
    }
    // Store tools for registration when session is available
    const toolsToRegister: { name: string, implementation: ToolImplementation }[] = [];
    // Add call tools
    for (const tool of vibe.resolvedCallTools) {
        if (tool.implementation) {
            toolsToRegister.push({
                name: tool.name,
                implementation: tool.implementation
            });
        }
    }
    // Add agent tools
    for (const agent of vibe.resolvedAgents) {
        if (agent.resolvedTools) {
            for (const tool of agent.resolvedTools) {
                // Check if tool is already in the list
                if (!toolsToRegister.some(t => t.name === tool.name) && tool.implementation) {
                    toolsToRegister.push({
                        name: tool.name,
                        implementation: tool.implementation
                    });
                }
            }
        }
    }
    // Use the centralized registry to register tools with Ultravox
    if (window.__hominio_tools) {
        // Add our tools to the existing registry
        for (const tool of toolsToRegister) {
            window.__hominio_tools[tool.name] = tool.implementation;
        }
    } else {
        // Create a new registry
        window.__hominio_tools = {};
        for (const tool of toolsToRegister) {
            window.__hominio_tools[tool.name] = tool.implementation;
        }
    }
    // If Ultravox session exists, register tools immediately
    if (window.__ULTRAVOX_SESSION) {
        registerToolsWithUltravox();
    } else {
        // Add event listener to register tools when Ultravox is ready
        window.addEventListener('ultravox-ready', () => {
            registerToolsWithUltravox();
        }, { once: true });
    }
}
````

## File: src/lib/ultravox/index.ts
````typescript
/**
 * Ultravox integration for Hominio
 * 
 * This file provides the main entry point for working with the Ultravox 
 * voice calling system. It handles vibe loading, tool registration,
 * and call management.
 */
// Import core functionality
import { getActiveVibe, resetActiveVibe, createAgentStageChangeData, activeVibeName } from './stageManager';
import { clearVibeCache } from './loaders/vibeLoader';
import { setupToolRegistrationListeners } from './loaders/toolLoader';
import { DEFAULT_CALL_CONFIG } from './callConfig';
import { startCall, endCall } from './callFunctions';
import { errorStore } from './stores';
import {
    loadAllTools,
    getAllToolsMetadata,
    getToolMetadata,
    callTool,
    getToolRegistry,
    registerToolsWithUltravox
} from './registries/toolRegistry';
import {
    loadView,
    getAllViews,
    discoverViews,
    hasView,
    clearViewCache
} from './registries/viewRegistry';
// Re-export essential types
export type { AgentName } from './types';
export type { Transcript, CallConfig } from './types';
export type { ToolInfo } from './registries/toolRegistry';
export type { ViewInfo } from './registries/viewRegistry';
/**
 * Initialize a vibe and its tools
 * @param vibeId The ID of the vibe to initialize (defaults to 'home')
 */
export async function initializeVibe(vibeId = 'home'): Promise<void> {
    console.log(`🔮 Initializing vibe: ${vibeId}`);
    try {
        // Setup tool registration listeners
        setupToolRegistrationListeners();
        // Load the vibe - this also loads and prepares tools
        await getActiveVibe(vibeId);
        console.log(`✅ Vibe "${vibeId}" initialization complete`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error initializing vibe: ${errorMessage}`);
        // Set the error in the error store
        errorStore.set({
            message: `Failed to initialize vibe: ${errorMessage}`,
            source: 'initializeVibe',
            timestamp: Date.now(),
            error: error instanceof Error ? error : new Error(String(error))
        });
    }
}
/**
 * Switch the active vibe
 * @param vibeId The ID of the vibe to switch to
 */
export async function switchVibe(vibeId: string): Promise<void> {
    // Reset the vibe cache to ensure fresh loading
    resetActiveVibe();
    // Load the new vibe
    await getActiveVibe(vibeId);
    // Dispatch a custom event to notify UI components about vibe change
    if (typeof window !== 'undefined') {
        console.log(`🔔 Dispatching vibe-changed event for: ${vibeId}`);
        window.dispatchEvent(new CustomEvent('ultravox-vibe-changed', {
            detail: { vibeId }
        }));
    }
    console.log(`🔄 Switched to vibe: ${vibeId}`);
}
/**
 * Refresh the UI based on current vibe
 * Call this after a tool has changed the vibe to force UI updates
 * @param vibeId The ID of the vibe to refresh (optional, uses active vibe if not provided)
 */
export async function refreshVibeUI(vibeId?: string): Promise<void> {
    // Get the active vibe name if vibeId not provided
    const currentVibe = activeVibeName();
    const activeId = vibeId || currentVibe || 'home';
    console.log(`🔄 Refreshing UI for vibe: ${activeId}`);
    // Dispatch a custom event to notify UI components to refresh
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ultravox-vibe-changed', {
            detail: { vibeId: activeId }
        }));
    }
}
/**
 * Reset the Ultravox system
 * Clears all caches and resets state
 */
export function resetUltravox(): void {
    // Clear caches
    resetActiveVibe();
    clearVibeCache();
    clearViewCache();
    console.log('🧹 Ultravox system reset');
}
// Re-export key functions
export {
    getActiveVibe,
    startCall,
    endCall,
    createAgentStageChangeData,
    DEFAULT_CALL_CONFIG,
    // Tool registry exports
    loadAllTools,
    getAllToolsMetadata,
    getToolMetadata,
    callTool,
    getToolRegistry,
    registerToolsWithUltravox,
    // View registry exports
    loadView,
    getAllViews,
    discoverViews,
    hasView,
    clearViewCache
};
````

## File: src/lib/ultravox/types.ts
````typescript
// Type definitions for Ultravox integration
import type { ComponentType, SvelteComponent } from 'svelte';
// Tool parameter and response types
export type ToolParameters = Record<string, unknown>;
export type ToolParams = ToolParameters; // Alias for compatibility with existing code
export type ToolResponse = {
    success?: boolean;
    message?: string;
    error?: string;
    responseType?: string;
    systemPrompt?: string;
    voice?: string;
    toolResultText?: string;
    result?: string;
};
// Function signature for tool implementations
export type ToolImplementation = (params: ToolParameters) => Promise<ToolResponse> | string | unknown;
// Create a more flexible type for the actual client library's implementation
export type ClientToolReturnType = string | Record<string, unknown>;
// Call Medium types from callFunctions.ts
export type WebRtcMedium = { webRtc: Record<string, never> };
export type TwilioMedium = { twilio: Record<string, unknown> };
export type CallMedium = WebRtcMedium | TwilioMedium;
// Call configuration types
export interface CallConfig {
    systemPrompt: string;
    model?: string;
    languageHint?: string;
    voice?: string;
    temperature?: number;
    maxDuration?: string;
    timeExceededMessage?: string;
    firstSpeaker?: string;
    joinTimeout?: string;
    inactivityMessages?: string[];
    medium?: CallMedium | string;
    recordingEnabled?: boolean;
    initialMessages?: string[];
};
// API response types
export type JoinUrlResponse = {
    callId: string;
    joinUrl: string;
    created: string;
    ended: string | null;
    model: string;
};
// Role enum for UI state
export enum Role {
    USER = 'user',
    AGENT = 'agent'
}
// Tool parameter types from agents.ts
export type FilterParams = {
    tag?: string;
};
export type CreateTodoParams = {
    todoText: string;
    tags?: string;
};
export type ToggleTodoParams = {
    todoText: string;
};
export type UpdateTodoParams = {
    todoText: string;
    newText: string;
    tags?: string;
};
export type RemoveTodoParams = {
    todoText: string;
};
export type SwitchAgentParams = {
    agentName?: string;
};
// Ultravox session interface that matches the actual library implementation
export interface UltravoxSession {
    registerTool?: (name: string, callback: ToolImplementation) => void;
    registerToolImplementation: (name: string, implementation: (params: unknown) => ClientToolReturnType | Promise<ClientToolReturnType>) => void;
    isMicMuted: boolean;
    isSpeakerMuted: boolean;
    muteMic: () => void;
    unmuteMic: () => void;
    muteSpeaker: () => void;
    unmuteSpeaker: () => void;
    joinCall: (joinUrl: string) => void;
    leaveCall: () => void;
    status?: string;
    addEventListener: (event: string, callback: (event: unknown) => void) => void;
}
// Call handling types
export type CallCallbacks = {
    onStatusChange: (status: string | undefined) => void;
};
// Agent configuration
export type AgentName = string; // Any valid agent name from any vibe manifest
export interface AgentConfig {
    name: string;
    personality: string;
    voiceId: string;
    description: string;
    temperature: number;
    systemPrompt: string;
    tools: string[];
    resolvedTools?: ToolDefinition[];
}
// VibeAgent type (for backward compatibility)
export type VibeAgent = AgentConfig;
// Call configuration
export interface CallConfiguration {
    systemPrompt: string;
    model: string;
    voice: string;
    languageHint: string;
    temperature: number;
    maxDuration?: string;
    timeExceededMessage?: string;
    firstSpeaker?: string;
}
// Tool definitions
export interface ToolParameter {
    name: string;
    location: string;
    schema: {
        type: string;
        description: string;
    };
    required: boolean;
}
export interface ToolDefinition {
    name: string;
    temporaryTool: {
        modelToolName: string;
        description: string;
        dynamicParameters: ToolParameter[];
        client: Record<string, unknown>;
    };
    implementationType: string;
    implementation?: ToolImplementation;
}
// TemporaryToolDefinition from agents.ts
export interface TemporaryToolDefinition {
    temporaryTool: {
        modelToolName: string;
        description: string;
        dynamicParameters: {
            name: string;
            location: string;
            schema: {
                type: string;
                description: string;
            };
            required: boolean;
        }[];
        client: Record<string, unknown>;
    };
}
// Resolved tool with guaranteed implementation
export interface ResolvedTool extends ToolDefinition {
    implementation: ToolImplementation;
}
// Resolved agent with tools
export interface ResolvedAgent extends AgentConfig {
    resolvedTools: ResolvedTool[];
}
// Vibe configuration
export interface VibeManifest {
    name: string;
    description: string;
    systemPrompt: string;
    // Top-level call properties
    temperature?: number;
    languageHint?: string;
    model?: string;
    maxDuration?: string;
    firstSpeaker?: string;
    voice?: string;
    initialMessages?: string[];
    // UI properties
    view: string;
    vibeTools: string[];
    // Visual properties
    icon?: string;
    color?: string;
    // Agent configuration
    defaultAgent: string;
    agents: AgentConfig[];
    // Additional properties found in vibeLoader
    callSystemPrompt?: string;
    // Legacy nested configuration (deprecated)
    rootCallConfig?: {
        model: string;
        firstSpeaker: string;
        maxDuration: string;
        languageHint: string;
        temperature: number;
    };
}
export interface ResolvedVibe {
    manifest: VibeManifest;
    resolvedCallTools: ResolvedTool[];
    resolvedAgents: ResolvedAgent[];
    defaultAgent: ResolvedAgent;
}
// Stage change data type for agent transitions
export interface StageChangeData {
    systemPrompt: string;
    voice: string;
    toolResultText: string;
    selectedTools: ResolvedTool[];
}
// View component types
// Make it more compatible with actual Svelte component types
export type VibeComponent = ComponentType | SvelteComponent | unknown;
// Global window augmentation for consistent TypeScript across files
declare global {
    interface Window {
        __hominio_tools?: Record<string, ToolImplementation>;
        __hominio_tools_registered?: boolean;
        __ULTRAVOX_SESSION?: UltravoxSession;
        __DEBUG_STAGE_CHANGES?: boolean;
    }
}
````

## File: src/lib/tools/createTodo/function.ts
````typescript
import { getLoroAPIInstance } from '$lib/KERNEL/loroAPI';
import type { TodoItem } from '$lib/docs/schemas/todo';
import { logToolActivity } from '$lib/ultravox/stores';
import type { ToolParameters } from '$lib/ultravox/types';
/**
 * Creates a new todo item
 * @param inputs Tool input parameters
 * @returns Result of the operation
 */
export async function execute(inputs: {
    text: string;
    tags?: string;
    docId?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        // Get the LoroAPI instance
        const loroAPI = getLoroAPIInstance();
        // Get operations for todo schema
        const { query } = await loroAPI.getOperations<TodoItem>('todo');
        // Check for duplicate
        const existing = query(todo => todo.text === inputs.text.trim());
        if (existing.length > 0) {
            return logToolActivity('createTodo', 'Todo already exists', false);
        }
        // Parse tags
        const tags = inputs.tags
            ? inputs.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [];
        // Create the todo using the createItem helper
        const todoItem: Omit<TodoItem, 'id'> = {
            text: inputs.text.trim(),
            completed: false,
            createdAt: Date.now(),
            tags,
            docId: inputs.docId || 'personal' // Use provided docId or default to personal
        };
        // The createItem method will generate an ID and handle store updates
        const id = await loroAPI.createItem<TodoItem>('todo', todoItem as TodoItem);
        if (!id) {
            return logToolActivity('createTodo', 'Failed to create todo', false);
        }
        console.log(`Todo created with ID: ${id}`);
        return logToolActivity('createTodo', `Todo created: ${inputs.text}`);
    } catch (error) {
        console.error('Error creating todo:', error);
        // Ensure error is stringified properly
        const errorMessage = error instanceof Error ? error.message : String(error);
        return logToolActivity('createTodo', `Error: ${errorMessage}`, false);
    }
}
/**
 * Legacy implementation for Ultravox compatibility
 * @param parameters Tool parameters from Ultravox
 * @returns Result as JSON string
 */
export function createTodoImplementation(parameters: ToolParameters): string {
    console.log('Called createTodo tool with parameters:', parameters);
    try {
        // Handle both object and string parameter formats
        let parsedParams: Record<string, unknown> = {};
        if (typeof parameters === 'object' && parameters !== null) {
            parsedParams = parameters;
        } else if (typeof parameters === 'string') {
            try {
                parsedParams = JSON.parse(parameters);
            } catch (e) {
                console.error('Failed to parse string parameters:', e);
            }
        }
        // Extract parameters with safer type checking
        const todoText = parsedParams.todoText as string | undefined;
        const tags = parsedParams.tags as string | undefined;
        const listName = parsedParams.listName as string | undefined;
        if (!todoText || typeof todoText !== 'string' || !todoText.trim()) {
            const result = {
                success: false,
                message: 'Invalid todo text provided'
            };
            return JSON.stringify(result);
        }
        // Convert to the format expected by our new implementation
        execute({
            text: todoText.trim(),
            tags,
            docId: listName
        }).then(result => {
            console.log('Todo created with result:', result);
        }).catch(err => {
            console.error('Error in createTodo execution:', err);
        });
        // Return success immediately (the actual operation happens async)
        const result = {
            success: true,
            message: `Created todo: "${todoText}"${tags ? ' with tags: ' + tags : ''}`
        };
        return JSON.stringify(result);
    } catch (error) {
        console.error('Error in createTodo tool:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            success: false,
            message: `Error creating todo: ${errorMessage}`
        };
        return JSON.stringify(result);
    }
}
````

## File: src/lib/vibes/todos/manifest.json
````json
{
    "name": "todos",
    "description": "Todo management voice application",
    "systemPrompt": "IMPORTANT INSTRUCTIONS:\n1. You MUST use these tools directly without asking for confirmation\n2. Call the appropriate tool as soon as a user EXPLICITLY requests them\n3. Execute the tool when needed WITHOUT typing out the function in your response\n4. AFTER the tool executes, respond with text confirming what you did\n5. DO NOT tell the user \"I'll use the tool\" - just USE it directly.",
    "temperature": 0.7,
    "languageHint": "en",
    "view": "TodoView",
    "icon": "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    "color": "indigo",
    "vibeTools": [
        "switchAgent"
    ],
    "defaultAgent": "Oliver",
    "agents": [
        {
            "name": "Oliver",
            "personality": "professional and efficient",
            "voiceId": "dcb65d6e-9a56-459e-bf6f-d97572e2fe64",
            "description": "specialized in todo creation and management",
            "temperature": 0.6,
            "systemPrompt": "You are Oliver, a professional and efficient todo management specialist.\n\nYou specialize in:\n- Creating new todo items with appropriate tags\n- Toggling todo completion status\n- Updating existing todos\n- Removing todos\n- Filtering todos by tags\n\nYou should use your specialized tools to directly help users manage their tasks without unnecessary conversation.\n\nBe direct, efficient, and helpful in your responses, focusing on getting the job done well.\n\nIMPORTANT: NEVER call the filterTodos tool unless a user EXPLICITLY asks to filter or view todos by a specific tag.",
            "tools": [
                "createTodo",
                "toggleTodo",
                "updateTodo",
                "deleteTodo",
                "queryTodos",
                "filterTodos"
            ]
        }
    ]
}
````

## File: src/lib/components/CallInterface.svelte
````
<script lang="ts">
	import { onMount } from 'svelte';
	import { currentAgent } from '$lib/ultravox/agents';
	// Define AgentName type locally
	type AgentName = string;
	let { callStatus, onEndCall } = $props<{
		callStatus: string;
		onEndCall: () => void;
	}>();
	// State for visibility
	let displayedAgent = $state<AgentName>($currentAgent);
	let isInterfaceVisible = $state(true);
	// Close the entire interface
	function closeInterface() {
		isInterfaceVisible = false;
		onEndCall();
	}
	// Ensure we always display the most current agent name
	$effect(() => {
		displayedAgent = $currentAgent;
	});
	// Setup event listeners and ensure audio is always unmuted
	onMount(() => {
		// Access Ultravox session if available
		if (typeof window !== 'undefined' && (window as any).__ULTRAVOX_SESSION) {
			const uvSession = (window as any).__ULTRAVOX_SESSION;
			// Ensure speaker is not muted
			if (uvSession.isSpeakerMuted) {
				console.log('🔊 Forcibly unmuting speaker');
				uvSession.unmuteSpeaker();
			}
			// Listen for stage changes to update the agent display
			uvSession.addEventListener('stage_change', (evt: Event) => {
				console.log('🎭 Stage change detected in CallInterface');
				const stageChangeEvent = evt as unknown as {
					detail?: {
						stageId?: string;
						voiceId?: string;
						systemPrompt?: string;
					};
				};
				if (stageChangeEvent?.detail?.systemPrompt) {
					// Extract agent name from system prompt
					const systemPrompt = stageChangeEvent.detail.systemPrompt;
					const agentMatch = systemPrompt.match(/You are now ([A-Za-z]+),/i);
					if (agentMatch && agentMatch[1]) {
						console.log(`🎭 Detected new agent from stage change: ${agentMatch[1]}`);
						// Update displayed agent - cast to AgentName
						const newAgent = agentMatch[1] as AgentName;
						displayedAgent = newAgent;
					}
				}
			});
		}
	});
	// Format call status for display
	function formatStatus(status: string): string {
		switch (status) {
			case 'connecting':
				return 'Connecting...';
			case 'connected':
				return 'Connected';
			case 'disconnected':
				return 'Disconnected';
			case 'call_ended':
				return 'Call Ended';
			case 'error':
				return 'Error';
			default:
				return status;
		}
	}
</script>
{#if isInterfaceVisible}
	<div class="fixed inset-x-0 bottom-0 z-40 flex justify-center">
		<div
			class="w-full max-w-md rounded-2xl border border-white/5 bg-white/10 p-4 shadow-xl backdrop-blur-md dark:bg-slate-900/20"
		>
			<div class="flex items-center justify-between">
				<!-- Agent Info -->
				<div class="flex-1">
					<div class="flex items-center rounded-xl border border-teal-500/20 bg-teal-500/20 p-2">
						<div class="mr-3 rounded-full bg-teal-500/30 p-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 text-teal-300"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
								/>
							</svg>
						</div>
						<div class="text-lg font-bold text-teal-100">{displayedAgent}</div>
						<span
							class="ml-auto rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white/80"
						>
							{formatStatus(callStatus)}
						</span>
					</div>
				</div>
				<!-- End Call Button -->
				<button
					class="ml-4 flex items-center justify-center rounded-xl bg-red-500/20 px-4 py-2 text-white/90 backdrop-blur-sm transition-all duration-200 hover:bg-red-500/30"
					onclick={closeInterface}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-2 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M16 8l4 4m0 0l-4 4m4-4H3"
						/>
					</svg>
					End
				</button>
			</div>
		</div>
	</div>
{/if}
<style lang="postcss">
	button:hover {
		box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
	}
</style>
````

## File: src/db/seed.ts
````typescript
#!/usr/bin/env bun
/**
 * Standalone database seed script
 * This doesn't depend on any existing imports from src/db
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { LoroDoc } from 'loro-crdt';
import { blake3 } from '@noble/hashes/blake3';
import b4a from 'b4a';
import * as schema from './schema';
import { eq } from 'drizzle-orm'; // Removed unused sql import
import { validateSchemaJsonStructure } from '../lib/KERNEL/hominio-validate';
import { GENESIS_PUBKEY, GENESIS_HOMINIO } from './constants'; // Import from new constants file
// Basic placeholder types matching the structure used
interface PlaceDefinition {
    description: string;
    required: boolean;
    validation?: { // Optional validation object
        schema?: (string | null)[]; // Allow null in schema array
        value?: string | { options?: unknown[]; min?: number; max?: number; minLength?: number; maxLength?: number; regex?: string; custom?: string }; // Allowed literal type or rule object
        rule?: Record<string, unknown>; // Added for consistency with rule object inside value
    };
}
interface TranslationDefinition {
    lang: string;
    name: string;
    description: string;
    places: Record<string, string>;
}
interface BaseDefinition {
    name: string;
    places: Record<string, PlaceDefinition>; // Use the correct interface
    translations?: TranslationDefinition[];
}
interface SchemaDefinition extends BaseDefinition {
    pubkey?: string; // Optional original pubkey, will be generated unless 'gismu'
    schema?: string | null; // Original schema key, will be replaced by generated ref
}
interface EntityDefinition extends BaseDefinition {
    pubkey?: string; // Optional original pubkey, will be generated
    schema: string; // Original schema key, will be replaced by generated ref
}
// Schemas to seed (adapted from data.ts, using the new validation structure)
const schemasToSeed: Record<string, SchemaDefinition> = {
    "gismu": {
        schema: null,
        name: "gismu",
        places: {
            x1: { description: "lo lojbo ke krasi valsi", required: true, validation: { value: "string" } },
            x2: { description: "lo bridi be lo ka ce'u skicu zo'e", required: true, validation: { value: "string" } },
            x3: { description: "lo sumti javni", required: true, validation: {} }, // any
            x4: { description: "lo rafsi", required: false, validation: { value: "string" } }
        },
        translations: [
            { lang: "en", name: "Root Word", description: "A Lojban root word (gismu) defining a fundamental concept", places: { x1: "A Lojban root word", x2: "Relation/concept expressed by the word", x3: "Argument roles for the relation", x4: "Associated affix(es)" } },
            { lang: "de", name: "Stammwort", description: "Ein Lojban-Stammwort (Gismu), das einen grundlegenden Begriff definiert", places: { x1: "Das Stammwort", x2: "Ausgedrückte Relation/Konzept", x3: "Argumentrollen der Relation", x4: "Zugehörige Affixe" } }
        ]
    },
    "prenu": {
        schema: "gismu", // References gismu by name
        name: "prenu",
        places: {
            x1: { description: "lo prenu", required: true, validation: { value: "string" } }
        },
        translations: [
            { lang: "en", name: "Person", description: "A person entity", places: { x1: "Person/entity with personhood" } },
            { lang: "de", name: "Person", description: "Eine Person", places: { x1: "Person/Wesen mit Persönlichkeit" } }
        ]
    },
    "gunka": {
        schema: "gismu", // References gismu by name
        name: "gunka",
        places: {
            // Reference to 'prenu' schema by name - will be resolved to @prenuPubKey by seedDocument
            x1: { description: "lo gunka", required: true, validation: { schema: ["prenu"] } },
            x2: { description: "lo se gunka", required: true, validation: { value: "string" } },
            x3: { description: "lo te gunka", required: false, validation: { value: "string" } }
        },
        translations: [
            { lang: "en", name: "Work", description: "To work/labor on something with a purpose", places: { x1: "Worker/laborer", x2: "Task/activity worked on", x3: "Purpose/goal of the work" } },
            { lang: "de", name: "Arbeit", description: "An etwas mit einem Zweck arbeiten", places: { x1: "Arbeiter", x2: "Aufgabe/Tätigkeit, an der gearbeitet wird", x3: "Zweck/Ziel der Arbeit" } }
        ]
    },
    // Add tcini schema
    "tcini": {
        schema: "gismu", // References gismu by name
        name: "tcini",
        places: {
            x1: {
                description: "lo tcini",
                required: true,
                // Adapt validation structure
                validation: { value: { options: ["todo", "in_progress", "done", "blocked"] } }
            },
            x2: {
                description: "lo se tcini",
                required: true,
                // Reference schema by name for deterministic key generation
                validation: { schema: ["gunka"] }
            }
        },
        translations: [
            {
                lang: "en",
                name: "Status",
                description: "A situation, state or condition",
                places: {
                    x1: "Situation/state/condition",
                    x2: "Entity in the situation/state/condition"
                }
            },
            {
                lang: "de",
                name: "Status",
                description: "Eine Situation, ein Zustand oder eine Bedingung",
                places: {
                    x1: "Situation/Zustand/Bedingung",
                    x2: "Entität in der Situation/dem Zustand/der Bedingung"
                }
            }
        ]
    },
    // <<< Add other schemas here later >>>
};
// Helper functions
// --------------------------------------------------------
// Deterministically generate pubkey from seed string (e.g., schema name or entity name)
async function generateDeterministicPubKey(seed: string): Promise<string> {
    const hashBytes = blake3(b4a.from(seed, 'utf8'));
    const hexString = b4a.toString(hashBytes, 'hex'); // Ensure 64 char hex
    return `0x${hexString}`;
}
// Hash snapshot data
async function hashSnapshot(snapshot: Uint8Array): Promise<string> {
    const hashBytes = blake3(snapshot);
    return b4a.toString(hashBytes, 'hex');
}
// Seed function to create the Gismu schema document - REMOVED (Handled by seedDocument)
// --------------------------------------------------------
// async function seedGismuSchemaDoc(db: ReturnType<typeof drizzle>) { ... } // REMOVED
// Function to seed a single document (schema or entity)
async function seedDocument(
    db: ReturnType<typeof drizzle>,
    docKey: string,
    docDefinition: SchemaDefinition | EntityDefinition,
    docType: 'schema' | 'entity',
    generatedKeys: Map<string, string>
) {
    let pubKey: string;
    let schemaRef: string | null = null; // Initialize as null
    const isGismu = docKey === 'gismu' && docType === 'schema';
    // 1. Determine PubKey
    if (isGismu) {
        pubKey = GENESIS_PUBKEY;
        // Explicitly set gismu key in map if not present
        if (!generatedKeys.has(docKey)) {
            generatedKeys.set(docKey, pubKey);
        }
    } else {
        pubKey = await generateDeterministicPubKey(docKey);
    }
    // Store generated key if not already present
    if (!generatedKeys.has(docKey)) {
        generatedKeys.set(docKey, pubKey);
    }
    // 2. Determine Schema Reference (Format: @pubKey)
    if (isGismu) {
        // Gismu references itself
        schemaRef = `@${pubKey}`;
    } else if ('schema' in docDefinition && docDefinition.schema) {
        // Other docs reference the schema defined in their definition
        const schemaName = docDefinition.schema;
        const schemaPubKey = generatedKeys.get(schemaName);
        if (!schemaPubKey) {
            console.warn(`Schema PubKey for "${schemaName}" not found for "${docKey}", attempting generation...`);
            const generatedSchemaKey = await generateDeterministicPubKey(schemaName);
            if (!generatedKeys.has(schemaName)) generatedKeys.set(schemaName, generatedSchemaKey);
            schemaRef = `@${generatedSchemaKey}`;
        } else {
            schemaRef = `@${schemaPubKey}`;
        }
    } else if (!isGismu && docType === 'schema') {
        // Fallback for non-gismu schemas without explicit schema: reference gismu
        const gismuPubKey = generatedKeys.get("gismu");
        if (!gismuPubKey) {
            throw new Error(`Root schema "gismu" PubKey not found. Ensure 'gismu' is processed first in schemasToSeed.`);
        }
        schemaRef = `@${gismuPubKey}`;
    }
    // If none of the above, schemaRef remains null (shouldn't happen for schemas/entities defined)
    console.log(`Processing ${docType}: ${docKey} -> PubKey: ${pubKey}, SchemaRef: ${schemaRef}`);
    // 3. Check for existing document
    const existingDoc = await db.select({ pubKey: schema.docs.pubKey })
        .from(schema.docs)
        .where(eq(schema.docs.pubKey, pubKey))
        .limit(1);
    if (existingDoc.length > 0) {
        console.log(`  - Document already exists. Skipping.`);
        return;
    }
    // 4. Prepare LoroDoc content
    const loroDoc = new LoroDoc();
    loroDoc.setPeerId(1);
    const dataMapContent: Record<string, unknown> = {
        places: docDefinition.places,
        translations: docDefinition.translations || []
    };
    const meta = loroDoc.getMap('meta');
    meta.set('name', docDefinition.name);
    meta.set('schema', schemaRef); // Set resolved @pubkey or null
    const data = loroDoc.getMap('data');
    data.set('places', dataMapContent.places);
    if (dataMapContent.translations && Array.isArray(dataMapContent.translations) && dataMapContent.translations.length > 0) {
        data.set('translations', dataMapContent.translations);
    }
    // --- UPDATED: 4.5 Validate the LoroDoc structure VIA JSON --- //
    if (docType === 'schema') { // Only validate schema docs for now
        console.log(`  - Validating structure for schema: ${docKey}...`);
        // Get JSON representation for validation
        const schemaJsonForValidation = loroDoc.toJSON() as Record<string, unknown>;
        // Add pubKey to JSON as the validator might expect it (depending on its implementation)
        schemaJsonForValidation.pubKey = pubKey;
        const { isValid, errors } = validateSchemaJsonStructure(schemaJsonForValidation);
        if (!isValid) {
            console.error(`  - ❌ Validation Failed for ${docKey}:`);
            // Add type string to err parameter
            errors.forEach((err: string) => console.error(`    - ${err}`));
            console.warn(`  - Skipping database insertion for invalid schema: ${docKey}`);
            return; // Do not proceed if validation fails
        }
        console.log(`  - ✅ Structure validation passed for schema: ${docKey}`);
    }
    // 5. Export snapshot and hash
    // Use exportSnapshot() as export() with mode is deprecated/changed in newer Loro versions?
    // Reverting to exportSnapshot as it seems to be the intended method based on context.
    const snapshot = loroDoc.exportSnapshot();
    const cid = await hashSnapshot(snapshot);
    const now = new Date();
    // 6. Upsert Content Entry
    await db.insert(schema.content)
        .values({
            cid: cid,
            type: 'snapshot',
            raw: Buffer.from(snapshot),
            metadata: {
                name: docDefinition.name,
                schema: schemaRef
            },
            createdAt: now
        })
        .onConflictDoNothing({ target: schema.content.cid });
    console.log(`  - Ensured content entry exists: ${cid}`);
    // 7. Insert Document Entry
    const docEntry: schema.InsertDoc = {
        pubKey: pubKey,
        snapshotCid: cid,
        updateCids: [],
        owner: GENESIS_HOMINIO,
        updatedAt: now,
        createdAt: now
    };
    await db.insert(schema.docs).values(docEntry);
    console.log(`  - Created document entry: ${pubKey}`);
    console.log(`✅ Successfully seeded ${docType}: ${docKey}`);
}
// Main function
// --------------------------------------------------------
async function main() {
    // Get the database URL
    const dbUrl = process.env.SECRET_DATABASE_URL_HOMINIO;
    if (!dbUrl) {
        console.error('❌ Database URL not found in environment variables');
        process.exit(1);
    }
    console.log('🌱 Seeding database with core schemas...');
    try {
        // Create direct database connection
        const sql = neon(dbUrl);
        const db = drizzle(sql, { schema }); // Pass schema correctly
        const generatedKeys = new Map<string, string>(); // name -> pubkey
        // --- Phase 1: Seed all Schemas ---
        console.log("\n--- Seeding Schemas ---");
        // Ensure gismu is first to establish GENESIS_PUBKEY association
        for (const schemaKey in schemasToSeed) {
            await seedDocument(db, schemaKey, schemasToSeed[schemaKey], 'schema', generatedKeys);
        }
        console.log('\n✅ Database schema seeding completed successfully.');
        console.log('\nGenerated Keys Map:');
        console.log(generatedKeys);
    } catch (error) {
        console.error('\n❌ Error during database seeding:', error);
        process.exit(1);
    }
}
// Run the main function
main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
````

## File: src/routes/api/[...slugs]/+server.ts
````typescript
// Disable prerendering for this dynamic API endpoint
export const prerender = false;
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { getAuthClient } from '$lib/auth/auth';
import type { Context } from 'elysia';
// Import modular route handlers from lib/server
import meHandlers from '$lib/server/routes/me';
import callHandlers from '$lib/server/routes/call';
import docsHandlers from '$lib/server/routes/docs';
import contentHandlers from '$lib/server/routes/content';
// Get the auth instance immediately as this is server-side code
const auth = getAuthClient();
// Session protection middleware
const requireAuth = async ({ request, set }: Context) => {
    const session = await auth.api.getSession({
        headers: request.headers
    });
    if (!session) {
        set.status = 401;
        throw new Error('Unauthorized: Valid session required');
    }
    return {
        session
    };
}
const betterAuthView = (context: Context) => {
    const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"]
    // validate request method
    if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
        return auth.handler(context.request);
    } else {
        context.error(405)
    }
}
const app = new Elysia({ prefix: '/api' })
    .use(
        cors({
            origin: 'http://localhost:5173',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            credentials: true,
            allowedHeaders: ['Content-Type', 'Authorization'],
        }),
    )
    .use(
        swagger({
            documentation: {
                info: {
                    title: 'Hominio Documentation',
                    version: '0.1.0'
                }
            }
        })
    )
    // Public routes
    .group('/auth', app => app
        .all('/*', betterAuthView)
    )
    // Call endpoints - protected with authentication
    .group('/call', app => app
        .derive(requireAuth)
        .use(callHandlers)
    )
    // Define the /me prefix here in the main file
    .group('/me', app => app
        .derive(requireAuth)
        .use(meHandlers)
    )
    // Docs routes 
    .group('/docs', app => app
        .derive(requireAuth)
        .use(docsHandlers)
    )
    // Content routes
    .group('/content', app => app
        .derive(requireAuth)
        .use(contentHandlers)
    )
    .onError(({ code, error }) => {
        console.error(`API Error [${code}]:`, error);
        return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Internal Server Error'
        }), {
            status: code === 'NOT_FOUND' ? 404 :
                code === 'INTERNAL_SERVER_ERROR' && error.message.includes('Unauthorized') ? 401 : 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'http://localhost:5173',
                'Access-Control-Allow-Credentials': 'true'
            }
        });
    });
// Use exported RequestHandler instead of local type
export type App = typeof app;
export const GET = async ({ request }: { request: Request }) => app.handle(request);
export const POST = async ({ request }: { request: Request }) => app.handle(request);
export const OPTIONS = async ({ request }: { request: Request }) => app.handle(request);
export const PUT = async ({ request }: { request: Request }) => app.handle(request);
export const DELETE = async ({ request }: { request: Request }) => app.handle(request);
````

## File: src/lib/ultravox/callFunctions.ts
````typescript
import { browser } from '$app/environment';
import type { UltravoxSession as UVSession, ClientToolImplementation } from 'ultravox-client';
import { currentAgent } from './agents';
import { createCall } from './createCall';
import { Role } from './types';
import type {
    CallCallbacks,
    CallConfig,
} from './types';
// Type for AgentName used locally
type AgentName = string;
// Re-export types from ultravox-client
export { UltravoxSessionStatus } from 'ultravox-client';
// Re-export our Role enum
export { Role };
// Ultravox session
let uvSession: UVSession | null = null;
// Toggle mic/speaker mute state
export function toggleMute(role: Role): void {
    if (!browser || !uvSession) {
        console.error('uvSession is not initialized or not in browser environment');
        return;
    }
    if (role === Role.USER) {
        // Toggle user microphone
        if (uvSession.isMicMuted) {
            uvSession.unmuteMic();
        } else {
            uvSession.muteMic();
        }
    } else {
        // For agent, always ensure speaker is unmuted
        if (uvSession.isSpeakerMuted) {
            console.log('🔊 Unmuting speaker (speaker should never be muted)');
            uvSession.unmuteSpeaker();
        }
        // We never mute the speaker - just unmute if it somehow got muted
    }
}
// Force unmute speaker and microphone
export function forceUnmuteSpeaker(): void {
    if (!browser || !uvSession) {
        console.error('uvSession is not initialized or not in browser environment');
        return;
    }
    // Make sure speaker is unmuted
    if (uvSession.isSpeakerMuted) {
        console.log('🔊 Force unmuting speaker');
        uvSession.unmuteSpeaker();
    }
    // Also make sure microphone is unmuted
    if (uvSession.isMicMuted) {
        console.log('🎤 Force unmuting microphone');
        uvSession.unmuteMic();
    }
}
// Start a call
export async function startCall(callbacks: CallCallbacks, callConfig: CallConfig, vibeId = 'home'): Promise<void> {
    if (!browser) {
        console.error('Not in browser environment');
        return;
    }
    try {
        // Detect platform and environment
        const isRunningInTauri = typeof window !== 'undefined' &&
            ('__TAURI__' in window || navigator.userAgent.includes('Tauri'));
        // Try to detect operating system
        const isLinux = typeof navigator !== 'undefined' &&
            navigator.userAgent.toLowerCase().includes('linux');
        const isMacOS = typeof navigator !== 'undefined' &&
            (navigator.userAgent.toLowerCase().includes('mac os') ||
                navigator.platform.toLowerCase().includes('mac'));
        console.log('Environment check:', {
            isRunningInTauri,
            isLinux,
            isMacOS,
            platform: navigator?.platform || 'unknown',
            userAgent: navigator?.userAgent || 'unknown'
        });
        // Special handling for Tauri WebView environments
        if (isRunningInTauri) {
            console.warn('⚠️ Running in Tauri environment - applying special configuration');
            if (isLinux) {
                // Linux has known issues with mediaDevices in Tauri
                console.warn('⚠️ Linux + Tauri detected - microphone access is problematic on this platform');
                console.warn('⚠️ See: https://github.com/tauri-apps/tauri/issues/12547');
            }
            if (isMacOS) {
                console.log('🍎 macOS + Tauri detected - microphone should work with proper permissions');
                console.log('🔍 Checking if Info.plist is properly configured with NSMicrophoneUsageDescription');
            }
            // Create mock implementation only if mediaDevices is undefined
            if (!navigator.mediaDevices) {
                console.warn('⚠️ MediaDevices API not available - creating controlled fallback');
                // @ts-expect-error - intentionally creating a mock object
                navigator.mediaDevices = {
                    getUserMedia: async () => {
                        console.warn('⚠️ Mocked getUserMedia called - this is expected behavior in Tauri');
                        console.warn('⚠️ Make sure core:webview:allow-user-media permission is enabled in capabilities');
                        throw new Error('MEDIA_DEVICES_NOT_SUPPORTED_IN_TAURI');
                    },
                    // Add empty addEventListener to prevent errors
                    addEventListener: function (type: string) {
                        console.warn(`⚠️ Mocked mediaDevices.addEventListener called for event: ${type}`);
                        // No-op implementation
                    },
                    // Add empty removeEventListener to prevent "not a function" errors
                    removeEventListener: function (type: string) {
                        console.warn(`⚠️ Mocked mediaDevices.removeEventListener called for event: ${type}`);
                        // No-op implementation
                    }
                };
            }
        }
        // Check if media devices are available (after potential mocking)
        const hasMediaDevices = typeof navigator !== 'undefined' &&
            navigator.mediaDevices !== undefined &&
            typeof navigator.mediaDevices.getUserMedia === 'function';
        console.log('Media devices availability check:', { hasMediaDevices });
        let microphoneAvailable = false;
        // If media devices API is available, try to request microphone access
        if (hasMediaDevices) {
            console.log('Media devices API is available - attempting microphone access');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Release the stream immediately after testing
                stream.getTracks().forEach(track => track.stop());
                console.log('✅ Microphone access granted successfully');
                microphoneAvailable = true;
            } catch (micError) {
                console.warn('⚠️ Microphone access error:', micError);
                console.warn('⚠️ Continuing with text-only input mode');
                if (isRunningInTauri && isLinux) {
                    console.warn('⚠️ This is a known issue with Tauri on Linux - microphone access is not properly supported');
                }
            }
        } else {
            console.warn('⚠️ Media devices API not available - microphone input will be disabled');
            if (isRunningInTauri) {
                console.warn('⚠️ This is expected in Tauri WebView environment');
                console.warn('⚠️ See: https://github.com/tauri-apps/tauri/issues/5370');
                callbacks.onStatusChange('warning');
            }
        }
        // Call our API to get a join URL using the imported createCall function
        console.log(`🚀 Starting call using vibe: ${vibeId}`);
        const callData = await createCall(callConfig, vibeId);
        const joinUrl = callData.joinUrl;
        if (!joinUrl) {
            console.error('Join URL is required');
            return;
        }
        console.log('Joining call:', joinUrl);
        // Import the Ultravox client dynamically (browser-only)
        console.log('Importing Ultravox client...');
        let UltravoxSession;
        try {
            const ultravoxModule = await import('ultravox-client');
            UltravoxSession = ultravoxModule.UltravoxSession;
            console.log('✅ Ultravox client imported successfully');
        } catch (importError) {
            console.error('❌ Failed to import Ultravox client:', importError);
            callbacks.onStatusChange('error');
            throw new Error('Failed to import Ultravox client');
        }
        // Configure Ultravox Session with appropriate options
        const sessionConfig = {
            experimentalMessages: new Set<string>(["debug"]),
            microphoneEnabled: isRunningInTauri || !microphoneAvailable ? false : true,
            enableTextMode: isRunningInTauri || !microphoneAvailable ? true : false
        };
        console.log('Creating Ultravox session with config:', sessionConfig);
        try {
            uvSession = new UltravoxSession(sessionConfig);
            console.log('✅ Ultravox session created successfully');
        } catch (sessionError) {
            console.error('❌ Failed to create Ultravox session:', sessionError);
            callbacks.onStatusChange('error');
            throw new Error('Failed to create Ultravox session');
        }
        // Register client tools if they are exposed on window.__hominio_tools
        if (typeof window !== 'undefined' && (window as Window & typeof globalThis & { __hominio_tools?: Record<string, ClientToolImplementation> }).__hominio_tools) {
            console.log('🔧 Registering client tool implementations with Ultravox session');
            const toolImpls = (window as Window & typeof globalThis & { __hominio_tools: Record<string, ClientToolImplementation> }).__hominio_tools;
            // Track registered tools to ensure they are all properly set up
            const registeredToolNames: string[] = [];
            // Register each tool with the Ultravox session
            for (const [toolName, toolImpl] of Object.entries(toolImpls)) {
                console.log(`🔧 Registering tool: ${toolName}`);
                try {
                    uvSession.registerToolImplementation(toolName, toolImpl);
                    console.log(`✅ Successfully registered tool: ${toolName}`);
                    registeredToolNames.push(toolName);
                } catch (error) {
                    console.error(`❌ Failed to register tool ${toolName}:`, error instanceof Error ? error.message : String(error));
                }
            }
            // Log all registered tools
            console.log('🔍 Registered tools:', registeredToolNames.join(', '));
            // Double-check critical tools are registered
            const expectedTools = Object.keys(toolImpls);
            console.log('🔧 Expected tools:', expectedTools.join(', '));
            // Try registering any missing tools again
            for (const toolName of expectedTools) {
                if (!registeredToolNames.includes(toolName)) {
                    console.log(`⚠️ Re-attempting to register missing tool: ${toolName}`);
                    try {
                        const toolImpl = toolImpls[toolName];
                        uvSession.registerToolImplementation(toolName, toolImpl);
                        console.log(`✅ Successfully registered tool on retry: ${toolName}`);
                    } catch (unknownError) {
                        const errorMessage =
                            unknownError instanceof Error
                                ? unknownError.message
                                : 'Unknown error during tool registration';
                        console.error(`❌ Failed to register tool ${toolName} on retry:`, errorMessage);
                    }
                }
            }
        } else {
            console.warn('❌ No window.__hominio_tools found. Client tools will not work!');
        }
        // Register event listeners
        console.log('🌟 Attempting to register stage_change event listener');
        uvSession.addEventListener('stage_change', async (evt: Event) => {
            console.log('🌟 STAGE CHANGE EVENT RECEIVED', evt);
            // Log detailed information about the event
            const stageChangeEvent = evt as unknown as {
                detail?: {
                    stageId?: string;
                    voiceId?: string;
                    systemPrompt?: string;
                }
            };
            if (stageChangeEvent?.detail) {
                console.log('🌟 STAGE CHANGE DETAILS:', {
                    stageId: stageChangeEvent.detail.stageId,
                    voiceId: stageChangeEvent.detail.voiceId,
                    systemPromptExcerpt: stageChangeEvent.detail.systemPrompt?.substring(0, 50) + '...'
                });
                // Update current agent if there's a system prompt change
                if (stageChangeEvent.detail.systemPrompt) {
                    // Try to extract agent name from system prompt
                    const systemPrompt = stageChangeEvent.detail.systemPrompt;
                    const agentMatch = systemPrompt.match(/You are now ([A-Za-z]+),/i);
                    if (agentMatch && agentMatch[1]) {
                        const newAgentName = agentMatch[1];
                        console.log(`🌟 Updating current agent to: ${newAgentName}`);
                        // Only update if it's changed
                        if (browser) {
                            // Using the imported currentAgent store
                            const { get } = await import('svelte/store');
                            if (get(currentAgent) !== newAgentName) {
                                // Cast to AgentName type for type safety
                                const validAgentName = newAgentName as AgentName;
                                currentAgent.set(validAgentName);
                                console.log(`🌟 Current agent updated to: ${newAgentName}`);
                                // No need to re-register tools - they are now provided directly in the stage change data
                                console.log('🌟 Tools provided directly in stage change data, no manual re-registration needed');
                            }
                        }
                    }
                }
            } else {
                console.log('🌟 STAGE CHANGE EVENT HAS NO DETAIL PROPERTY', JSON.stringify(evt));
            }
            // Ensure speaker is unmuted after stage change
            if (uvSession && uvSession.isSpeakerMuted) {
                console.log('🔊 Unmuting speaker after stage change');
                uvSession.unmuteSpeaker();
            }
        });
        // Add more logging for main events
        uvSession.addEventListener('status', () => {
            callbacks.onStatusChange(uvSession?.status);
            // Ensure speaker is unmuted after status change, especially when speaking
            if (uvSession?.status === 'speaking' && uvSession.isSpeakerMuted) {
                console.log('🔊 Unmuting speaker for speaking state');
                uvSession.unmuteSpeaker();
            }
        });
        // Expose the session globally for client tools
        if (typeof window !== 'undefined') {
            console.log('💾 Exposing Ultravox session globally for tool access');
            // Use a more specific type for the window extension
            (window as unknown as { __ULTRAVOX_SESSION: typeof uvSession }).__ULTRAVOX_SESSION = uvSession;
            // Add this line to the window for debugging
            console.log('🔍 Setting up debug flag for stage changes');
            (window as unknown as { __DEBUG_STAGE_CHANGES: boolean }).__DEBUG_STAGE_CHANGES = true;
        }
        // Join the call - tools are configured in the createCall function
        uvSession.joinCall(joinUrl);
        console.log('Call started with tools configuration!');
        // Ensure mic and speaker are in the correct state after joining
        setTimeout(() => {
            if (uvSession) {
                // Always unmute the speaker to ensure we can hear the agent
                if (uvSession.isSpeakerMuted) {
                    console.log('🔊 Initial speaker unmute after joining call');
                    uvSession.unmuteSpeaker();
                }
                // Unmute the mic to ensure we can be heard
                if (uvSession.isMicMuted) {
                    console.log('🎤 Initial mic unmute after joining call');
                    uvSession.unmuteMic();
                }
            }
        }, 1000); // Wait a second after joining to ensure all is set up
    } catch (error) {
        console.error('Error starting call:', error);
        callbacks.onStatusChange('error');
        throw error;
    }
}
// End a call
export async function endCall(): Promise<void> {
    if (!browser || !uvSession) {
        console.error('uvSession is not initialized or not in browser environment');
        return;
    }
    console.log('Ending call...');
    try {
        uvSession.leaveCall();
        uvSession = null;
        console.log('Call ended.');
    } catch (error) {
        console.error('Error ending call:', error);
        throw error;
    }
}
````

## File: src/routes/docs/+page.svelte
````
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { hominioDB, type Docs } from '$lib/KERNEL/hominio-db';
	import { hominioSync } from '$lib/KERNEL/hominio-sync';
	import { authClient } from '$lib/client/auth-hominio'; // Import auth client
	import { canDelete, type CapabilityUser } from '$lib/KERNEL/hominio-capabilities'; // Import capability check
	// Subscribe to hominioDB stores
	const docs = hominioDB.docs;
	const selectedDoc = hominioDB.selectedDoc;
	const status = hominioDB.status;
	const error = hominioDB.error;
	const docContent = hominioDB.docContent;
	// Subscribe to auth store for capability checking
	const session = authClient.useSession();
	// Subscribe to hominioSync store
	const syncStatus = hominioSync.status;
	// State for random property button
	let isAddingProperty = false;
	// State for snapshot button
	let isCreatingSnapshot = false;
	// State for delete button
	let isDeleting = false;
	// Track delete permission
	let canDeleteDoc = false;
	// Reactive variable to check if user can delete the selected document
	$: {
		if ($selectedDoc && $session.data?.user) {
			const currentUser = $session.data?.user as CapabilityUser;
			canDeleteDoc = canDelete(currentUser, $selectedDoc);
			console.log('Delete capability check:', {
				userId: currentUser.id,
				docOwner: $selectedDoc.owner,
				canDelete: canDeleteDoc
			});
		} else {
			canDeleteDoc = false;
		}
	}
	// Handle selecting a document
	function handleSelectDoc(doc: Docs) {
		hominioDB.selectDoc(doc);
	}
	// Handle creating a new document
	function handleCreateNewDocument() {
		hominioDB.createDocument();
	}
	// Handle adding random property
	async function handleAddRandomProperty() {
		if (isAddingProperty) return;
		isAddingProperty = true;
		try {
			await hominioDB.addRandomPropertyToDocument();
		} finally {
			isAddingProperty = false;
		}
	}
	// Handle creating a consolidated snapshot
	async function handleCreateSnapshot() {
		if (isCreatingSnapshot || !$selectedDoc) return;
		isCreatingSnapshot = true;
		try {
			await hominioSync.createConsolidatedSnapshot();
		} catch (err) {
			console.error('Error creating snapshot:', err);
		} finally {
			isCreatingSnapshot = false;
		}
	}
	// Handle document deletion
	async function handleDeleteDocument() {
		if (isDeleting || !$selectedDoc) return;
		if (
			!confirm(
				`Are you sure you want to delete document "${$selectedDoc.pubKey}"? This action cannot be undone.`
			)
		) {
			return;
		}
		isDeleting = true;
		try {
			const success = await hominioSync.deleteDocument($selectedDoc.pubKey);
			if (success) {
				console.log(`Document ${$selectedDoc.pubKey} deleted successfully`);
			}
		} catch (err) {
			console.error('Error deleting document:', err);
		} finally {
			isDeleting = false;
		}
	}
	// Handle manual pull from server
	function handlePull() {
		hominioSync.pullFromServer();
	}
	// Handle manual push to server
	function handlePush() {
		hominioSync.pushToServer();
	}
	// On mount, ensure we have properly initialized
	onMount(() => {
		console.log('Document component mounted');
	});
	onDestroy(() => {
		hominioDB.destroy();
		hominioSync.destroy();
	});
</script>
<div class="min-h-screen bg-[#e7e1d7] text-gray-800">
	<!-- Three-column layout: Sidebar, Main Content, and Right Aside -->
	<div class="grid min-h-screen grid-cols-[250px_1fr_400px]">
		<!-- Sidebar - Doc List -->
		<aside
			class="flex flex-col overflow-y-auto border-r border-gray-200 bg-white shadow-sm"
			style="border-color: rgba(0,0,0,0.08);"
		>
			<!-- Header with title and sync status -->
			<div class="border-b border-gray-200 p-4" style="border-color: rgba(0,0,0,0.08);">
				<h1 class="text-xl font-bold text-[#3c2c8c]">
					Documents <span class="text-xs font-normal text-gray-500">(Local First)</span>
				</h1>
				<!-- Sync status indicator -->
				<div class="mt-2 flex flex-wrap items-center gap-y-1 text-xs text-gray-600">
					<span class="mr-2 whitespace-nowrap">Server Sync:</span>
					{#if $syncStatus.isSyncing}
						<span class="flex items-center text-[#65d1de]">
							<div class="mr-1 h-2 w-2 animate-pulse rounded-full bg-[#65d1de]"></div>
							Syncing...
						</span>
					{:else if $syncStatus.lastSynced}
						<span class="text-green-600">
							Synced {new Date($syncStatus.lastSynced).toLocaleTimeString()}
						</span>
					{:else}
						<span class="text-orange-600">Not synced</span>
					{/if}
					{#if !$syncStatus.isSyncing}
						<div class="ml-auto flex flex-shrink-0 gap-2 pl-2">
							<button
								class="rounded bg-[#65d1de] px-2 py-0.5 text-xs font-medium text-[#3c2c8c] shadow-sm transition-colors hover:bg-[#5ac4d1] focus:ring-1 focus:ring-[#65d1de] focus:ring-offset-1 focus:outline-none"
								on:click={handlePush}
								title="Push local changes to server"
							>
								Push
							</button>
							<button
								class="rounded bg-[#65d1de] px-2 py-0.5 text-xs font-medium text-[#3c2c8c] shadow-sm transition-colors hover:bg-[#5ac4d1] focus:ring-1 focus:ring-[#65d1de] focus:ring-offset-1 focus:outline-none"
								on:click={handlePull}
								title="Pull changes from server"
							>
								Pull
							</button>
						</div>
					{/if}
				</div>
				{#if $syncStatus.syncError}
					<div class="mt-1 text-xs text-red-600">
						Error: {$syncStatus.syncError}
					</div>
				{/if}
				<!-- Display pending changes count -->
				{#if $syncStatus.pendingLocalChanges > 0}
					<div class="mt-1 text-xs text-orange-600">
						{$syncStatus.pendingLocalChanges} document{$syncStatus.pendingLocalChanges !== 1
							? 's'
							: ''} with local changes
					</div>
				{/if}
			</div>
			<!-- Create New Document Button -->
			<div class="border-b border-gray-200 p-4" style="border-color: rgba(0,0,0,0.08);">
				<button
					class="flex w-full items-center justify-center rounded-md bg-[#3c2c8c] py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2a1f62] focus:ring-2 focus:ring-[#3c2c8c] focus:ring-offset-2 focus:ring-offset-white focus:outline-none disabled:opacity-60"
					on:click={handleCreateNewDocument}
					disabled={$status.creatingDoc}
				>
					{#if $status.creatingDoc}
						<div
							class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
						></div>
						Creating...
					{:else}
						<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						New Document
					{/if}
				</button>
			</div>
			<!-- Document List -->
			{#if $status.loading && $docs.length === 0}
				<div class="flex h-32 items-center justify-center">
					<div
						class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-[#3c2c8c]"
					></div>
				</div>
			{:else if $error && $docs.length === 0}
				<div class="p-4">
					<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
						<p>{$error}</p>
					</div>
				</div>
			{:else if $docs.length === 0}
				<div class="flex flex-grow flex-col items-center justify-center p-4 text-center">
					<svg
						class="mb-3 h-12 w-12 text-gray-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
					<p class="mb-4 text-gray-500">No documents found in local storage</p>
					<p class="text-sm text-gray-400">
						Click the "New Document" button to create your first document
					</p>
				</div>
			{:else}
				<div class="flex-grow overflow-y-auto">
					<ul class="divide-y divide-gray-200" style="border-color: rgba(0,0,0,0.08);">
						{#each $docs as doc (doc.pubKey)}
							{@const isSelected = $selectedDoc?.pubKey === doc.pubKey}
							<li>
								<button
									class="block w-full cursor-pointer p-4 text-left transition-colors {isSelected
										? 'bg-[#3c2c8c] text-white'
										: 'hover:bg-gray-100'}"
									on:click={() => handleSelectDoc(doc)}
								>
									<h2 class="font-medium {isSelected ? 'text-white' : 'text-[#3c2c8c]'}">
										{doc.pubKey.substring(0, 10)}...
									</h2>
									<p class="mt-1 truncate text-xs {isSelected ? 'text-gray-300' : 'text-gray-500'}">
										{doc.owner || 'No owner'} - {new Date(doc.updatedAt).toLocaleTimeString()}
									</p>
									{#if doc.localState}
										<span
											class="mt-1 inline-block rounded px-1.5 py-0.5 text-xs {isSelected
												? 'bg-[#65d1de] text-[#3c2c8c]'
												: 'bg-orange-100 text-orange-700'}">Local Only</span
										>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</aside>
		<!-- Main Content Area -->
		<main
			class="flex-grow overflow-y-auto border-r border-gray-200 bg-white p-6 shadow-sm"
			style="border-color: rgba(0,0,0,0.08);"
		>
			{#if $selectedDoc}
				<!-- Document title at the top -->
				<div class="mb-6">
					<h1 class="text-2xl font-bold break-all text-[#3c2c8c]">{$selectedDoc.pubKey}</h1>
					<p class="mt-1 text-sm text-gray-600">
						Owned by: {$selectedDoc.owner || 'N/A'}
					</p>
				</div>
				<!-- Delete Button Section -->
				{#if canDeleteDoc}
					<div class="mb-6 rounded-lg border-l-4 border-red-400 bg-red-50 p-4 shadow-sm">
						<div
							class="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
						>
							<div>
								<h3 class="text-base font-semibold text-red-800">Danger Zone</h3>
								<p class="text-sm text-red-700">
									Permanently delete this document and all its data.
								</p>
							</div>
							<button
								class="flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-red-50 focus:outline-none disabled:opacity-50"
								on:click={handleDeleteDocument}
								disabled={isDeleting}
							>
								{#if isDeleting}
									<div
										class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
									></div>
									Deleting...
								{:else}
									<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
									Delete
								{/if}
							</button>
						</div>
					</div>
				{/if}
				<!-- Document Metadata Card -->
				<div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
					<h2 class="mb-3 text-lg font-semibold text-[#3c2c8c]">Document Metadata</h2>
					<div class="space-y-3 text-sm">
						<div>
							<span class="font-medium text-gray-600">Public Key:</span>
							<span class="ml-2 block font-mono text-xs break-all text-gray-700"
								>{$selectedDoc.pubKey}</span
							>
						</div>
						<div>
							<span class="font-medium text-gray-600">Owner ID:</span>
							<span class="ml-2 font-mono text-xs text-gray-700">{$selectedDoc.owner}</span>
						</div>
						<div>
							<span class="font-medium text-gray-600">Updated:</span>
							<span class="ml-2 text-gray-700">
								{new Date($selectedDoc.updatedAt).toLocaleString()}
							</span>
						</div>
						<!-- Server State -->
						<div class="space-y-2 border-t border-gray-200 pt-3">
							<h3 class="text-sm font-semibold text-gray-800">Server State</h3>
							<div>
								<span class="font-medium text-gray-600">Snapshot CID:</span>
								{#if $selectedDoc.snapshotCid}
									<div class="mt-0.5 ml-2 font-mono text-xs break-all text-gray-700">
										{$selectedDoc.snapshotCid}
									</div>
								{:else}
									<div class="ml-2 text-xs text-gray-400 italic">No server snapshot</div>
								{/if}
							</div>
							<div>
								<span class="font-medium text-gray-600"
									>Updates ({$selectedDoc.updateCids?.length || 0}):</span
								>
								{#if $selectedDoc.updateCids && $selectedDoc.updateCids.length > 0}
									<div class="ml-2 space-y-1 font-mono text-xs text-gray-700">
										{#each $selectedDoc.updateCids as cid}
											<div class="break-all">{cid}</div>
										{/each}
									</div>
								{:else}
									<div class="ml-2 text-xs text-gray-400 italic">No server updates</div>
								{/if}
							</div>
						</div>
						<!-- Local State (Pending Sync) -->
						<div class="space-y-2 border-t border-gray-200 pt-3">
							<h3 class="text-sm font-semibold text-[#65d1de]">Local State (Pending Sync)</h3>
							<div>
								<span class="font-medium text-gray-600">Local Snapshot CID:</span>
								{#if $selectedDoc.localState?.snapshotCid}
									<div class="mt-0.5 ml-2 font-mono text-xs break-all text-[#65d1de]">
										{$selectedDoc.localState.snapshotCid}
									</div>
								{:else}
									<div class="ml-2 text-xs text-gray-400 italic">No local snapshot</div>
								{/if}
							</div>
							<div>
								<span class="font-medium text-gray-600">
									Local Updates ({$selectedDoc.localState?.updateCids?.length || 0}):
								</span>
								{#if $selectedDoc.localState?.updateCids && $selectedDoc.localState.updateCids.length > 0}
									<div class="ml-2 space-y-1 font-mono text-xs text-[#65d1de]">
										{#each $selectedDoc.localState.updateCids as cid}
											<div class="break-all">{cid}</div>
										{/each}
									</div>
								{:else}
									<div class="ml-2 text-xs text-gray-400 italic">No local updates</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{:else}
				<!-- Empty state when no document is selected -->
				<div class="flex h-full flex-col items-center justify-center">
					{#if $status.loading}
						<div
							class="h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-[#3c2c8c]"
						></div>
					{:else}
						<div class="p-6 text-center">
							<svg
								class="mx-auto h-16 w-16 text-gray-400"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
							<h3 class="mt-2 text-lg font-medium text-gray-700">No document selected</h3>
							<p class="mt-1 text-sm text-gray-500">
								Please select or create a document from the sidebar.
							</p>
						</div>
					{/if}
				</div>
			{/if}
		</main>
		<!-- Right Aside - Document Content -->
		<aside
			class="overflow-y-auto border-l border-gray-200 bg-white p-6 shadow-sm"
			style="border-color: rgba(0,0,0,0.08);"
		>
			{#if $selectedDoc}
				<div class="h-full">
					<div
						class="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
					>
						<h2 class="text-lg font-semibold text-[#3c2c8c]">Document Content</h2>
						<!-- Add Random Property Button -->
						<button
							class="flex items-center rounded-md bg-[#65d1de] px-3 py-1 text-sm font-medium text-[#3c2c8c] shadow-sm transition-colors hover:bg-[#5ac4d1] focus:ring-2 focus:ring-[#65d1de] focus:ring-offset-2 focus:ring-offset-white focus:outline-none disabled:opacity-50"
							on:click={handleAddRandomProperty}
							disabled={isAddingProperty || $docContent.loading}
						>
							{#if isAddingProperty}
								<div
									class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-[#3c2c8c]"
								></div>
								Adding...
							{:else}
								<svg class="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 6v6m0 0v6m0-6h6m-6 0H6"
									/>
								</svg>
								Add Random Property
							{/if}
						</button>
					</div>
					<!-- Source info Card -->
					<div class="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm">
						<h3 class="mb-2 text-sm font-semibold text-gray-700">Content Source</h3>
						<p class="font-medium">
							{#if $docContent.isLocalSnapshot && $docContent.sourceCid}
								<span class="text-[#65d1de]">
									Local snapshot:
									<span class="block font-mono text-xs"
										>{$docContent.sourceCid.substring(0, 12)}...</span
									>
								</span>
							{:else if $docContent.sourceCid}
								<span class="text-[#3c2c8c]">
									Server snapshot:
									<span class="block font-mono text-xs"
										>{$docContent.sourceCid.substring(0, 12)}...</span
									>
								</span>
							{:else}
								<span class="text-red-600">No snapshot available</span>
							{/if}
						</p>
						<!-- Show applied updates info -->
						{#if $docContent.appliedUpdates !== undefined && $docContent.appliedUpdates > 0}
							<p class="mt-1 text-green-600">
								+ {$docContent.appliedUpdates} update{$docContent.appliedUpdates !== 1 ? 's' : ''}
								applied
							</p>
						{:else if $docContent.sourceCid}
							<p class="mt-1 text-xs text-gray-500">No updates applied (base snapshot only)</p>
						{/if}
						<!-- Show pending updates count -->
						{#if $selectedDoc.localState?.updateCids && $selectedDoc.localState.updateCids.length > 0}
							<p class="mt-2 text-[#65d1de]">
								{$selectedDoc.localState.updateCids.length} pending update{$selectedDoc.localState
									.updateCids.length !== 1
									? 's'
									: ''} (Reflected below)
							</p>
						{/if}
					</div>
					<!-- Document Content Display -->
					{#if $docContent.loading}
						<div class="flex h-32 items-center justify-center">
							<div
								class="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-[#3c2c8c]"
							></div>
						</div>
					{:else if $docContent.error}
						<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm">
							<p class="font-medium">Error loading content:</p>
							<p class="mt-2">{$docContent.error}</p>
						</div>
					{:else if $docContent.content}
						<!-- Create Snapshot Button (Conditional) -->
						{#if $selectedDoc && ($selectedDoc.updateCids?.length ?? 0) > 0}
							<div class="mb-4 flex justify-end">
								<button
									class="flex items-center rounded-md bg-[#3c2c8c] px-3 py-1 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2a1f62] focus:ring-2 focus:ring-[#3c2c8c] focus:ring-offset-2 focus:ring-offset-white focus:outline-none disabled:opacity-50"
									on:click={handleCreateSnapshot}
									disabled={isCreatingSnapshot}
									title="Consolidate all server updates into a new snapshot"
								>
									{#if isCreatingSnapshot}
										<div
											class="mr-2 h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-white"
										></div>
										Creating Snapshot...
									{:else}
										<svg class="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
											/>
										</svg>
										Create Snapshot ({$selectedDoc.updateCids?.length ?? 0} updates)
									{/if}
								</button>
							</div>
						{/if}
						<!-- JSON Content Display -->
						<div class="overflow-hidden rounded-lg border border-gray-200 bg-gray-800 shadow-sm">
							<pre class="overflow-x-auto p-4 font-mono text-xs text-[#a5f3fc]">{JSON.stringify(
									$docContent.content,
									null,
									2
								)}</pre>
						</div>
					{:else}
						<div
							class="rounded-lg border border-gray-200 bg-white p-4 text-center text-gray-500 shadow-sm"
						>
							<p>No content available for this document.</p>
						</div>
					{/if}
				</div>
			{:else}
				<div class="flex h-full items-center justify-center p-6 text-center text-gray-500">
					<p>Select a document to view its content</p>
				</div>
			{/if}
		</aside>
	</div>
</div>
````

## File: package.json
````json
{
  "name": "hominio",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite dev --host 0.0.0.0 --port 5173",
    "build": "vite build",
    "tauri": "tauri",
    "preview": "vite preview --host 0.0.0.0 --port 5173",
    "prepare": "svelte-kit sync || echo ''",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "format": "prettier --write .",
    "lint": "prettier --check . && eslint .",
    "db:push": "cd src/db && SECRET_DATABASE_URL_HOMINIO=$SECRET_DATABASE_URL_HOMINIO drizzle-kit push",
    "db:generate": "cd src/db && SECRET_DATABASE_URL_HOMINIO=$SECRET_DATABASE_URL_HOMINIO drizzle-kit generate",
    "db:reset": "bun run src/db/scripts/reset-db.ts",
    "db:seed": "bun run src/db/seed.ts"
  },
  "devDependencies": {
    "@eslint/compat": "^1.2.5",
    "@eslint/js": "^9.18.0",
    "@sveltejs/adapter-static": "^3.0.8",
    "@sveltejs/kit": "^2.16.0",
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "@tailwindcss/forms": "^0.5.9",
    "@tailwindcss/typography": "^0.5.15",
    "@tailwindcss/vite": "^4.0.0",
    "@tauri-apps/cli": "^2.3.1",
    "@types/bun": "^1.2.9",
    "@types/node": "^22.13.10",
    "@types/uuid": "^10.0.0",
    "drizzle-kit": "^0.30.6",
    "eslint": "^9.18.0",
    "eslint-config-prettier": "^10.0.1",
    "eslint-plugin-svelte": "^3.0.0",
    "globals": "^16.0.0",
    "prettier": "^3.4.2",
    "prettier-plugin-svelte": "^3.3.3",
    "prettier-plugin-tailwindcss": "^0.6.11",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.0.0",
    "typescript-eslint": "^8.20.0",
    "vite": "^6.0.0",
    "vite-plugin-node-polyfills": "^0.23.0",
    "vite-plugin-top-level-await": "^1.5.0",
    "vite-plugin-wasm": "^3.4.1"
  },
  "dependencies": {
    "@elysiajs/cors": "^1.2.0",
    "@elysiajs/eden": "^1.2.0",
    "@elysiajs/swagger": "^1.2.2",
    "@neondatabase/serverless": "^1.0.0",
    "@noble/hashes": "^1.7.1",
    "@sinclair/typebox": "^0.34.31",
    "@tauri-apps/api": "^2.3.0",
    "better-auth": "^1.2.5",
    "drizzle-orm": "^0.41.0",
    "drizzle-typebox": "^0.3.1",
    "elysia": "^1.2.25",
    "idb": "^8.0.2",
    "idx": "^3.0.3",
    "loro-crdt": "latest",
    "path-browserify": "^1.0.1",
    "pg": "^8.14.1",
    "ultravox-client": "^0.3.5",
    "zod": "^3.24.2"
  }
}
````

## File: src/routes/+layout.svelte
````
<script lang="ts">
	import '../app.css';
	import { onMount, onDestroy } from 'svelte';
	import { startCall, endCall } from '$lib/ultravox/callFunctions';
	import CallInterface from '$lib/components/CallInterface.svelte';
	import { initializeVibe } from '$lib/ultravox';
	import { DEFAULT_CALL_CONFIG } from '$lib/ultravox/callConfig';
	import { initDocs } from '$lib/docs';
	const DEFAULT_VIBE = 'home';
	let isCallActive = $state(false);
	let callStatus = $state<string>('off');
	let isVibeInitialized = $state(false);
	// Global state for notifications
	let recentToolActivity = $state<{ action: string; message: string; timestamp: number } | null>(
		null
	);
	// Use effect to monitor window.__recentToolActivity for changes
	$effect(() => {
		if (typeof window !== 'undefined') {
			// Set up interval to check for notifications
			const checkInterval = setInterval(() => {
				const windowActivity = (window as any).__recentToolActivity;
				if (windowActivity) {
					recentToolActivity = windowActivity;
				}
			}, 300);
			// Clear interval on cleanup
			return () => clearInterval(checkInterval);
		}
	});
	// Initialize vibe
	async function initVibe() {
		try {
			if (!isVibeInitialized) {
				// Ensure we're initializing the correct vibe that exists in the system
				await initializeVibe(DEFAULT_VIBE);
				isVibeInitialized = true;
				console.log(`✅ Vibe "${DEFAULT_VIBE}" initialization complete`);
			}
		} catch (error) {
			console.error(`❌ Failed to initialize vibe "${DEFAULT_VIBE}":`, error);
		}
	}
	// Toggle modal state
	async function toggleCall() {
		if (isCallActive) {
			await handleEndCall();
		} else {
			await handleStartCall();
		}
	}
	// Handle starting a call
	async function handleStartCall() {
		try {
			isCallActive = true;
			callStatus = 'starting';
			console.log('🟢 Starting call...');
			// Define callbacks for the call
			const callbacks = {
				onStatusChange: (status: string | undefined) => {
					callStatus = status || 'unknown';
				}
			};
			// Call with the required parameters
			await startCall(callbacks, DEFAULT_CALL_CONFIG, DEFAULT_VIBE);
		} catch (error) {
			console.error('❌ Call start error:', error);
			callStatus = 'error';
		}
	}
	// Handle ending a call
	async function handleEndCall() {
		try {
			callStatus = 'ending';
			console.log('🔴 Ending call...');
			await endCall();
			isCallActive = false;
			callStatus = 'off';
		} catch (error) {
			console.error('❌ Call end error:', error);
			callStatus = 'error';
		}
	}
	onMount(async () => {
		await initDocs();
		await initVibe();
	});
	onDestroy(async () => {
		if (isCallActive) {
			await handleEndCall();
		}
	});
	let { children } = $props();
</script>
<div
	class="relative min-h-screen w-full overflow-hidden bg-cover bg-center text-white"
	style="background-image: url('/bg.jpg');"
>
	<div
		class="absolute inset-0 bg-gradient-to-b from-blue-950/70 to-indigo-950/70 backdrop-blur-[2px]"
	></div>
	<div class="absolute top-20 right-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl"></div>
	<div class="absolute bottom-40 left-20 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl"></div>
	<div class="relative z-10 flex h-screen flex-col">
		<main class="flex-1 overflow-auto">
			<div class="mx-auto w-full">
				{@render children()}
			</div>
		</main>
		<div class="fixed bottom-0 left-1/2 z-50 mb-4 -translate-x-1/2">
			{#if !isCallActive}
				<button
					class="flex h-12 w-12 transform items-center justify-center rounded-full bg-white/20 shadow-2xl shadow-black/50 transition-all duration-300 hover:scale-105 hover:bg-white/30 focus:outline-none"
					onclick={toggleCall}
				>
					<img src="logo-button.png" alt="o" />
				</button>
			{/if}
		</div>
		{#if isCallActive}
			<CallInterface {callStatus} onEndCall={handleEndCall} />
		{/if}
	</div>
</div>
````
