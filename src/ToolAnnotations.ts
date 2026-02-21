/**
 * MCP Tool Annotations — hints for LLM behavior.
 */
export interface ToolAnnotations {
    readonly title?: string;
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
    readonly idempotentHint?: boolean;
    readonly openWorldHint?: boolean;
    readonly returnDirect?: boolean;
}

/** Create ToolAnnotations from partial properties. */
export function createToolAnnotations(props: ToolAnnotations = {}): ToolAnnotations {
    return { ...props };
}
