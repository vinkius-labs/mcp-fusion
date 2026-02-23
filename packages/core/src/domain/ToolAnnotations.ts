/**
 * MCP Tool Annotations — behavioral hints for LLMs.
 *
 * These annotations provide metadata that helps LLMs make safer
 * decisions about when and how to invoke a tool.
 *
 * @example
 * ```typescript
 * import { createToolAnnotations } from '@vinkius-core/mcp-fusion';
 *
 * const annotations = createToolAnnotations({
 *     title: 'File Reader',
 *     readOnlyHint: true,
 *     destructiveHint: false,
 *     idempotentHint: true,
 * });
 * ```
 *
 * @see {@link Tool} for usage on tool instances
 * @see {@link createToolAnnotations} for the factory function
 */
export interface ToolAnnotations {
    /** Human-readable display title for the tool */
    readonly title?: string;
    /** Hint that this tool only reads data (no side effects) */
    readonly readOnlyHint?: boolean;
    /** Hint that this tool may cause irreversible changes */
    readonly destructiveHint?: boolean;
    /** Hint that calling this tool multiple times has the same effect */
    readonly idempotentHint?: boolean;
    /** Hint that the tool may access external/uncontrolled systems */
    readonly openWorldHint?: boolean;
    /** Hint that the response should be returned directly to the user */
    readonly returnDirect?: boolean;
}

/**
 * Create ToolAnnotations from partial properties.
 *
 * @param props - Annotation properties (all optional)
 * @returns A ToolAnnotations instance
 *
 * @example
 * ```typescript
 * const ann = createToolAnnotations({ destructiveHint: true });
 * ```
 */
export function createToolAnnotations(props: ToolAnnotations = {}): ToolAnnotations {
    return { ...props };
}
