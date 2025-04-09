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

