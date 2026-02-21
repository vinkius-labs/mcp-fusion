import { type Role } from './Role.js';

/**
 * Resource Annotations — audience, priority, and freshness metadata.
 */
export interface Annotations {
    readonly audience?: readonly Role[];
    readonly priority?: number;
    readonly lastModified?: string;
}

/** Create Annotations from partial properties. */
export function createAnnotations(props: Annotations = {}): Annotations {
    return { ...props };
}
