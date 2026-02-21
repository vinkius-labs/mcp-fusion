/**
 * Response Helpers
 * 
 * Universal MCP response builders. No API coupling.
 * These produce the standard MCP ToolResponse format.
 */
import { encode, type EncodeOptions } from '@toon-format/toon';

// ============================================================================
// Types
// ============================================================================

/** Standard MCP tool response */
export interface ToolResponse {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
}

// ============================================================================
// Response Builders
// ============================================================================

/** Create a success response from text or a JSON-serializable object */
export function success(data: string | object): ToolResponse {
    const text = typeof data === 'string'
        ? (data || 'OK')
        : JSON.stringify(data, null, 2);
    return { content: [{ type: "text", text }] };
}

/** Create an error response */
export function error(message: string): ToolResponse {
    return { content: [{ type: "text", text: message }], isError: true };
}

/** Create a validation error for a missing required field */
export function required(field: string): ToolResponse {
    return { content: [{ type: "text", text: `Error: ${field} required` }], isError: true };
}

/**
 * Create a success response with TOON-encoded payload.
 *
 * Encodes structured data using TOON (Token-Oriented Object Notation)
 * for ~40-50% token reduction compared to JSON.stringify().
 * Ideal for list/tabular responses (arrays of uniform objects).
 *
 * @param data - Any JSON-serializable value (objects, arrays, primitives)
 * @param options - Optional TOON encode options (defaults: pipe delimiter)
 *
 * @example
 * ```typescript
 * // In a handler:
 * const users = await db.listUsers();
 * return toonSuccess(users);
 *
 * // With custom options:
 * return toonSuccess(data, { delimiter: ',' });
 * ```
 */
export function toonSuccess(data: unknown, options?: EncodeOptions): ToolResponse {
    const defaults: EncodeOptions = { delimiter: '|' };
    const text = encode(data, { ...defaults, ...options });
    return { content: [{ type: "text", text }] };
}
