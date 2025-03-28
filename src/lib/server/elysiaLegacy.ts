import { Elysia } from 'elysia';
import type { Context } from "elysia";
import { hashService } from '$lib/KERNEL/hash-service';
import { storageService } from '$lib/KERNEL/storage-service';
import { LoroDoc } from 'loro-crdt';
import { auth } from "$lib/auth/auth";

const betterAuthView = async (context: Context) => {
    const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"]

    console.log('Auth Request:', {
        method: context.request.method,
        url: context.request.url,
        path: new URL(context.request.url).pathname
    });

    // validate request method
    if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
        try {
            const response = await auth.handler(context.request);
            console.log('Auth Response:', {
                status: response.status,
                ok: response.ok
            });
            return response;
        } catch (error) {
            console.error('Auth Error:', error);
            return new Response(JSON.stringify({ error: 'Authentication failed' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } else {
        console.log('Method not allowed:', context.request.method);
        context.error(405)
    }
}

// Initialize kernel registry
const kernelRegistry = new LoroDoc();
const meta = kernelRegistry.getMap('meta');
meta.set('type', 'kernel-registry');
meta.set('version', '1.0.0');

// Initialize registry content
const registry = kernelRegistry.getMap('registry');
registry.set('id', '0x000000000000000000');
registry.set('contentHash', ''); // Will be set after storing root doc

// Initialize root document
const rootDoc = new LoroDoc();
const rootMeta = rootDoc.getMap('meta');
rootMeta.set('type', 'kernel-root');
rootMeta.set('version', '1.0.0');

const rootContent = rootDoc.getMap('content');
rootContent.set('message', 'Hello Earth');

// Store root document and update registry
async function initializeKernel() {
    try {
        // Hash and store root document
        const rootHash = await hashService.hash(rootDoc);
        await storageService.store(rootHash, rootDoc);

        // Update registry with root hash
        registry.set('contentHash', rootHash);

        // Hash and store registry
        const registryHash = await hashService.hash(kernelRegistry);
        await storageService.store(registryHash, kernelRegistry);

        console.log('Kernel initialized successfully');
    } catch (error) {
        console.error('Failed to initialize kernel:', error);
    }
}

// Initialize kernel on startup
initializeKernel();

// Create Elysia app with CORS
export const app = new Elysia()
    .onError(({ code, error, set }) => {
        console.error(`Elysia Error [${code}]:`, error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: set.status,
            headers: { 'Content-Type': 'application/json' }
        });
    })
    .all("/api/auth/*", betterAuthView)
    .get('/peer', async () => {
        return {
            status: 'success',
            version: '0.1.0',
            registry: {
                id: registry.get('id'),
                contentHash: registry.get('contentHash')
            }
        };
    })
    .get('/peer/docs/:contentHash', async ({ params: { contentHash } }) => {
        try {
            const doc = await storageService.load(contentHash);
            if (!doc) {
                throw new Error('Document not found');
            }

            return {
                status: 'success',
                data: doc.toJSON()
            };
        } catch (error) {
            return {
                status: 'error',
                error: {
                    message: error instanceof Error ? error.message : 'Failed to load document'
                }
            };
        }
    });

