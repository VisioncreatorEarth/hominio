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

# Drop all tables (use with caution!)
bun db:drop
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

## Architecture

The application follows a modern full-stack architecture:

1. **Frontend Layer** (SvelteKit)
   - Server and client components
   - Real-time updates via Loro CRDT
   - Type-safe API calls
   - Responsive UI with Tailwind
   - PG-Lite for offline-capable storage
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

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
