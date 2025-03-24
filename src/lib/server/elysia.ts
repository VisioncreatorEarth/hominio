import { Elysia } from 'elysia';
import { PGlite } from '@electric-sql/pglite';
import { docStore, KERNEL_REGISTRY, initializeKernel } from '../KERNEL/loro';

// Create an in-memory PGLite instance for storing snapshots
// Using 'memory://' creates an in-memory database
export const db = new PGlite('memory://');

// Initialize the kernel with hello earth doc and store its references
const { registryId, contentHash } = initializeKernel();
console.log(`Kernel initialized with Hello Earth doc:
  Registry ID: ${registryId}
  Content Hash: ${contentHash}
`);

// Create a shared Elysia instance with the peer prefix
export const app = new Elysia({ prefix: '/peer' })
    // Root endpoint returns the KERNEL registry
    .get('/', () => {
        return {
            status: 'ok',
            version: '0.1.0',
            registry: KERNEL_REGISTRY
        };
    })
    // Get a specific doc by its content hash
    .get('/docs/:cid', ({ params: { cid } }) => {
        const doc = docStore.get(cid);

        if (!doc) {
            return {
                status: 'error',
                message: `Document with hash ${cid} not found`
            };
        }

        return {
            status: 'ok',
            data: doc.toJSON()
        };
    });

