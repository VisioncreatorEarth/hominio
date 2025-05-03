/**
 * Barrel file for the Hominio Query Engine.
 * Exports the main execution function.
 */
export { executeQuery } from './execute';

// Optionally re-export core types if needed externally,
// but prefer importing directly from hominio-types.ts
// export type { LoroHqlQueryExtended, QueryResult } from '../hominio-types'; 