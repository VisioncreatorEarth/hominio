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