declare module 'ipfs-only-hash' {
    export function of(data: string | Uint8Array | AsyncIterable<Uint8Array> | Iterable<Uint8Array>): Promise<string>;
    // Add other exports if used, 'of' is the primary one based on current usage.
} 