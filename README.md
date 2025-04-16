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

### Repomix whole git repository

```bash
bunx repomix
```

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
