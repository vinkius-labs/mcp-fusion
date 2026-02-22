/**
 * Response Helpers
 *
 * Universal MCP response builders. No API coupling.
 * These produce the standard MCP ToolResponse format.
 *
 * @example
 * ```typescript
 * import { success, error, toonSuccess } from '@vinkius-core/mcp-fusion';
 *
 * // String response
 * return success('Project created');
 *
 * // Object response (auto JSON.stringify)
 * return success({ id: '123', name: 'My Project' });
 *
 * // Error response
 * return error('Project not found');
 *
 * // TOON-encoded response (~40% fewer tokens)
 * return toonSuccess(users);
 * ```
 *
 * @see {@link ToolResponse} for the response shape
 * @see {@link toonSuccess} for token-optimized responses
 *
 * @module
 */
import { encode, type EncodeOptions } from '@toon-format/toon';

// ============================================================================
// Types
// ============================================================================

/**
 * Standard MCP tool response.
 *
 * Every handler in mcp-fusion must return this shape.
 * Use the helper functions ({@link success}, {@link error}, {@link toonSuccess})
 * instead of constructing this manually.
 *
 * @example
 * ```typescript
 * // ✅ Preferred — use helpers
 * return success({ id: '123', name: 'Acme' });
 *
 * // ⚠️ Manual construction (avoid unless custom content types needed)
 * const response: ToolResponse = {
 *     content: [{ type: 'text', text: 'Hello' }],
 * };
 * ```
 */
export interface ToolResponse {
    readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
    readonly isError?: boolean;
}

// ============================================================================
// Response Builders
// ============================================================================

/**
 * Create a success response from text or a JSON-serializable object.
 *
 * - Strings are returned verbatim (empty strings become `"OK"`)
 * - Objects are serialized with `JSON.stringify(data, null, 2)`
 *
 * @param data - A string message or any JSON-serializable object
 * @returns A {@link ToolResponse} with `isError` unset
 *
 * @example
 * ```typescript
 * // String response
 * return success('Task completed');
 *
 * // Object response (pretty-printed JSON)
 * const project = await db.projects.create({ name: 'Acme' });
 * return success(project);
 *
 * // Array response
 * const users = await db.users.findMany();
 * return success(users);
 * ```
 *
 * @see {@link error} for error responses
 * @see {@link toonSuccess} for token-optimized array responses
 */
export function success(data: string | object): ToolResponse {
    const text = typeof data === 'string'
        ? (data || 'OK')
        : JSON.stringify(data, null, 2);
    return { content: [{ type: "text", text }] };
}

/**
 * Create an error response.
 *
 * Sets `isError: true` so the MCP client and LLM recognize the failure.
 * The LLM will typically retry or ask the user for clarification.
 *
 * @param message - Human-readable error description
 * @returns A {@link ToolResponse} with `isError: true`
 *
 * @example
 * ```typescript
 * // Simple error
 * return error('Project not found');
 *
 * // Contextual error
 * return error(`User "${userId}" does not have access to workspace "${wsId}"`);
 *
 * // In a handler with early return
 * handler: async (ctx, args) => {
 *     const project = await ctx.db.projects.findUnique(args.id);
 *     if (!project) return error(`Project "${args.id}" not found`);
 *     return success(project);
 * }
 * ```
 *
 * @see {@link required} for missing field errors
 * @see {@link success} for success responses
 */
export function error(message: string): ToolResponse {
    return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Create a validation error for a missing required field.
 *
 * Convenience shortcut for `error(\`Error: ${field} required\`)`.
 * Typically used in handlers that accept dynamic or optional schemas.
 *
 * @param field - Name of the missing required field
 * @returns A {@link ToolResponse} with `isError: true`
 *
 * @example
 * ```typescript
 * handler: async (ctx, args) => {
 *     if (!args.workspace_id) return required('workspace_id');
 *     // ...
 * }
 * ```
 *
 * @see {@link error} for general error responses
 */
export function required(field: string): ToolResponse {
    return { content: [{ type: "text", text: `Error: ${field} required` }], isError: true };
}

/**
 * Create a success response with TOON-encoded payload.
 *
 * Encodes structured data using TOON (Token-Oriented Object Notation)
 * for ~40-50% token reduction compared to `JSON.stringify()`.
 * Ideal for list/tabular responses (arrays of uniform objects).
 *
 * @param data - Any JSON-serializable value (objects, arrays, primitives)
 * @param options - Optional TOON encode options (default: pipe delimiter)
 * @returns A {@link ToolResponse} with TOON-encoded text
 *
 * @example
 * ```typescript
 * // Array response — saves ~40% tokens vs JSON
 * const users = await db.users.findMany();
 * return toonSuccess(users);
 * // Output: "id|name|email\n1|Alice|alice@co.io\n2|Bob|bob@co.io"
 *
 * // With custom delimiter
 * return toonSuccess(data, { delimiter: ',' });
 *
 * // Single object (still valid, but savings are smaller)
 * return toonSuccess({ id: 1, name: 'Alice' });
 * ```
 *
 * @see {@link success} for standard JSON responses
 */
export function toonSuccess(data: unknown, options?: EncodeOptions): ToolResponse {
    const defaults: EncodeOptions = { delimiter: '|' };
    const text = encode(data, { ...defaults, ...options });
    return { content: [{ type: "text", text }] };
}

// ============================================================================
// Self-Healing Errors (AX — Agent Experience)
// ============================================================================

/**
 * Options for a self-healing error response.
 *
 * @see {@link toolError} for usage
 */
export interface ToolErrorOptions {
    /** Human-readable error description */
    message: string;
    /** Recovery suggestion for the LLM agent */
    suggestion?: string;
    /** Action names the agent should try instead */
    availableActions?: string[];
}

/**
 * Create a self-healing error response with recovery instructions.
 *
 * Unlike {@link error}, this provides structured guidance so the LLM
 * agent can self-correct instead of hallucinating or giving up.
 * The response includes an error code, message, suggestion, and
 * available actions — all formatted for optimal LLM comprehension.
 *
 * @param code - Short error code (e.g. `'ProjectNotFound'`, `'Unauthorized'`)
 * @param options - Error details and recovery instructions
 * @returns A {@link ToolResponse} with `isError: true` and recovery guidance
 *
 * @example
 * ```typescript
 * handler: async (ctx, args) => {
 *     const project = await ctx.db.get(args.project_id);
 *
 *     if (!project) {
 *         return toolError('ProjectNotFound', {
 *             message: `Project '${args.project_id}' does not exist.`,
 *             suggestion: 'Call projects.list first to get valid IDs, then retry.',
 *             availableActions: ['projects.list'],
 *         });
 *     }
 *
 *     return success(project);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Minimal usage (no suggestion)
 * return toolError('RateLimited', {
 *     message: 'Too many requests. Wait 30 seconds.',
 * });
 * ```
 *
 * @see {@link error} for simple error responses
 * @see {@link required} for missing field errors
 */
export function toolError(code: string, options: ToolErrorOptions): ToolResponse {
    const lines: string[] = [`[${code}] ${options.message}`];

    if (options.suggestion) {
        lines.push('', `💡 Suggestion: ${options.suggestion}`);
    }

    if (options.availableActions?.length) {
        lines.push('', `📋 Try: ${options.availableActions.join(', ')}`);
    }

    return { content: [{ type: "text", text: lines.join('\n') }], isError: true };
}
