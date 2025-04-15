/**
 * Interface for content metadata
 */
export interface ContentMetadata {
    type: string;
    documentPubKey?: string;
    created: string;
    [key: string]: unknown;
} 