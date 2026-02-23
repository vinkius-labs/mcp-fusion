import { type Role } from './Role.js';

/**
 * Resource Annotations — audience, priority, and freshness metadata.
 *
 * Used on {@link Resource} instances to provide hints about who
 * should see the resource and how important it is.
 *
 * @example
 * ```typescript
 * import { createAnnotations, Role } from '@vinkius-core/mcp-fusion';
 *
 * const annotations = createAnnotations({
 *     audience: [Role.ASSISTANT],
 *     priority: 0.8,
 *     lastModified: '2025-01-15T10:30:00Z',
 * });
 * ```
 *
 * @see {@link Resource} for usage on resources
 * @see {@link createAnnotations} for the factory function
 */
export interface Annotations {
    /** Target audience roles for this resource */
    readonly audience?: readonly Role[];
    /** Priority weight (0.0 = lowest, 1.0 = highest) */
    readonly priority?: number;
    /** ISO 8601 timestamp of last modification */
    readonly lastModified?: string;
}

/**
 * Create Annotations from partial properties.
 *
 * @param props - Annotation properties (all optional)
 * @returns An Annotations instance
 *
 * @example
 * ```typescript
 * const ann = createAnnotations({ priority: 0.5 });
 * ```
 */
export function createAnnotations(props: Annotations = {}): Annotations {
    return { ...props };
}
