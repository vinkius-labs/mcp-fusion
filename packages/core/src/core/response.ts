/**
 * Response Helpers
 *
 * Universal MCP response builders. No API coupling.
 * These produce the standard MCP ToolResponse format.
 *
 * @example
 * ```typescript
 * import { success, error, toonSuccess } from '@mcpfusion/core';
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
import { type StringifyFn } from './serialization/JsonSerializer.js';

/**
 * Non-enumerable brand symbol stamped on all helper-created ToolResponse objects.
 * Used by FluentToolBuilder to reliably distinguish framework responses from
 * domain data that coincidentally matches the ToolResponse shape ().
 *
 * @internal
 */
export const TOOL_RESPONSE_BRAND: unique symbol = Symbol.for('mcpfusion.ToolResponse');

// ============================================================================
// XML Safety
// ============================================================================

/**
 * Escape XML structural characters for element content.
 *
 * Only `&` and `<` are mandatory escapes in XML element content.
 * `>` is preserved for LLM readability (e.g. `>= 1`, `Must be > 0`).
 * Single and double quotes are also preserved since they have no
 * special meaning outside attribute values.
 *
 * @internal
 */
export function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;');
}

/**
 * Escape XML special characters for use inside attribute values.
 *
 * Attribute values are delimited by `"` or `'` and must also
 * escape `<`, `>`, and `&`. All 5 XML special characters are handled.
 *
 * @internal
 */
export function escapeXmlAttr(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ============================================================================
// Types
// ============================================================================

/**
 * Standard MCP tool response.
 *
 * Every handler in MCP Fusion must return this shape.
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
    /**
     * Content blocks returned to the client.
     *
     * MCP 2.0 (`2026-07-28`) supports multiple content types in tool results:
     * `text`, `image`, `audio`, `resource_link`, and `resource` (embedded).
     * See: https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool-result
     */
    readonly content: ReadonlyArray<TextContent | ImageContent | AudioContent | ResourceLinkContent | EmbeddedResourceContent>;
    readonly isError?: boolean;
    /**
     * Structured tool output conforming to the tool's `outputSchema`
     * (MCP 2.0 — `2026-07-28`).
     *
     * When provided, clients and LLMs can parse the structured data
     * directly instead of parsing the text content. The framework
     * also includes a JSON-serialized copy in a `text` content block
     * for backward compatibility with MCP 1.0 clients.
     *
     * @see https://modelcontextprotocol.io/specification/2026-07-28/server/tools#structured-content
     */
    readonly structuredContent?: unknown;
}

// ── MCP 2.0 Content Block Types ──────────────────────────

/**
 * Text content block (MCP 2.0).
 * The most common content type for natural language tool results.
 */
export interface TextContent {
    readonly type: 'text';
    readonly text: string;
}

/**
 * Image content block (MCP 2.0).
 * Base64-encoded image data with a MIME type.
 */
export interface ImageContent {
    readonly type: 'image';
    readonly data: string;
    readonly mimeType: string;
}

/**
 * Audio content block (MCP 2.0).
 * Base64-encoded audio data with a MIME type.
 */
export interface AudioContent {
    readonly type: 'audio';
    readonly data: string;
    readonly mimeType: string;
}

/**
 * Resource link content block (MCP 2.0).
 * A link to a resource that the client can fetch or subscribe to.
 * The linked resource is NOT embedded — the client must fetch it separately.
 */
export interface ResourceLinkContent {
    readonly type: 'resource_link';
    readonly uri: string;
    readonly name?: string;
    readonly description?: string;
    readonly mimeType?: string;
}

/**
 * Embedded resource content block (MCP 2.0).
 * The full resource content is embedded directly in the tool result.
 */
export interface EmbeddedResourceContent {
    readonly type: 'resource';
    readonly resource: {
        readonly uri: string;
        readonly mimeType?: string;
        readonly text?: string;
        readonly blob?: string;
    };
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
export function success(data: string | object, compiledStringify?: StringifyFn): ToolResponse {
    const text = typeof data === 'string'
        ? (data || 'OK')
        : (compiledStringify ? compiledStringify(data) : JSON.stringify(data, null, 2));
    const resp: ToolResponse = { content: [{ type: "text", text }] };
    Object.defineProperty(resp, TOOL_RESPONSE_BRAND, { value: true });
    return resp;
}

/**
 * Create a structured success response with both text and structured content
 * (MCP 2.0 — `2026-07-28`).
 *
 * Returns a {@link ToolResponse} with `structuredContent` set to the raw
 * data object, plus a JSON-serialized copy in a `text` content block for
 * backward compatibility with MCP 1.0 clients.
 *
 * @param data - Any JSON-serializable value (object, array, primitive)
 * @param compiledStringify - Optional custom serializer for the text copy
 * @returns A {@link ToolResponse} with `structuredContent` populated
 *
 * @example
 * ```typescript
 * // Structured output — clients can parse structuredContent directly
 * return successStructured({ temperature: 22.5, conditions: 'Partly cloudy', humidity: 65 });
 * ```
 *
 * @see https://modelcontextprotocol.io/specification/2026-07-28/server/tools#structured-content
 */
export function successStructured(data: unknown, compiledStringify?: StringifyFn): ToolResponse {
    const text = compiledStringify ? compiledStringify(data) : JSON.stringify(data, null, 2);
    const resp: ToolResponse = {
        content: [{ type: "text", text }],
        structuredContent: data,
    };
    Object.defineProperty(resp, TOOL_RESPONSE_BRAND, { value: true });
    return resp;
}

/**
 * Create a resource link content block (MCP 2.0 — `2026-07-28`).
 *
 * Returns a link to a resource that the client can fetch or subscribe to.
 * The resource content is NOT embedded — the client must fetch it separately
 * via `resources/read`.
 *
 * @param uri - The resource URI (e.g. `file:///project/src/main.rs`)
 * @param opts - Optional name, description, and MIME type
 * @returns A {@link ResourceLinkContent} block
 *
 * @example
 * ```typescript
 * return {
 *     content: [
 *         { type: 'text', text: 'Found the file:' },
 *         resourceLink('file:///project/src/main.rs', { name: 'main.rs', mimeType: 'text/x-rust' }),
 *     ],
 * };
 * ```
 *
 * @see https://modelcontextprotocol.io/specification/2026-07-28/server/tools#resource-links
 */
export function resourceLink(
    uri: string,
    opts?: { name?: string; description?: string; mimeType?: string },
): ResourceLinkContent {
    return {
        type: 'resource_link',
        uri,
        ...(opts?.name ? { name: opts.name } : {}),
        ...(opts?.description ? { description: opts.description } : {}),
        ...(opts?.mimeType ? { mimeType: opts.mimeType } : {}),
    };
}

/**
 * Create an image content block (MCP 2.0 — `2026-07-28`).
 *
 * @param data - Base64-encoded image data
 * @param mimeType - MIME type (e.g. `image/png`, `image/jpeg`)
 * @returns An {@link ImageContent} block
 *
 * @example
 * ```typescript
 * return {
 *     content: [
 *         { type: 'text', text: 'Here is the chart:' },
 *         imageContent(base64Data, 'image/png'),
 *     ],
 * };
 * ```
 */
export function imageContent(data: string, mimeType: string): ImageContent {
    return { type: 'image', data, mimeType };
}

/**
 * Create an audio content block (MCP 2.0 — `2026-07-28`).
 *
 * @param data - Base64-encoded audio data
 * @param mimeType - MIME type (e.g. `audio/wav`, `audio/mpeg`)
 * @returns An {@link AudioContent} block
 */
export function audioContent(data: string, mimeType: string): AudioContent {
    return { type: 'audio', data, mimeType };
}

/**
 * Create an embedded resource content block (MCP 2.0 — `2026-07-28`).
 *
 * The full resource content is embedded directly in the tool result.
 *
 * @param uri - The resource URI
 * @param opts - Optional MIME type, text content, or base64 blob
 * @returns An {@link EmbeddedResourceContent} block
 */
export function embeddedResource(
    uri: string,
    opts?: { mimeType?: string; text?: string; blob?: string },
): EmbeddedResourceContent {
    return {
        type: 'resource',
        resource: {
            uri,
            ...(opts?.mimeType ? { mimeType: opts.mimeType } : {}),
            ...(opts?.text ? { text: opts.text } : {}),
            ...(opts?.blob ? { blob: opts.blob } : {}),
        },
    };
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
export function error(message: string, code?: ErrorCode): ToolResponse {
    const codeAttr = code !== undefined ? ` code="${escapeXmlAttr(code)}"` : '';
    const resp: ToolResponse = {
        content: [{ type: "text", text: `<tool_error${codeAttr}>\n<message>${escapeXml(message)}</message>\n</tool_error>` }],
        isError: true,
    };
    Object.defineProperty(resp, TOOL_RESPONSE_BRAND, { value: true });
    return resp;
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
    const f = escapeXml(field);
    const resp: ToolResponse = {
        content: [{
            type: "text",
            text: `<tool_error code="MISSING_REQUIRED_FIELD">\n<message>Required field "${f}" is missing.</message>\n<recovery>Provide the "${f}" parameter and retry.</recovery>\n</tool_error>`,
        }],
        isError: true,
    };
    Object.defineProperty(resp, TOOL_RESPONSE_BRAND, { value: true });
    return resp;
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
    const resp: ToolResponse = { content: [{ type: "text", text }] };
    Object.defineProperty(resp, TOOL_RESPONSE_BRAND, { value: true });
    return resp;
}

// ============================================================================
// Self-Healing Errors (AX — Agent Experience)
// ============================================================================

/**
 * Canonical error codes for deterministic agent self-correction.
 *
 * Provides compile-time autocomplete while allowing custom codes
 * via the `string` fallback. Constants cover the most common
 * failure modes in agentic pipelines.
 *
 * @example
 * ```typescript
 * return toolError('VALIDATION_ERROR', { message: '...' });
 * return toolError('RateLimited', { message: '...' }); // custom code — also valid
 * ```
 */
export type ErrorCode =
    | 'MISSING_DISCRIMINATOR'
    | 'UNKNOWN_ACTION'
    | 'VALIDATION_ERROR'
    | 'MISSING_REQUIRED_FIELD'
    | 'INTERNAL_ERROR'
    | 'RATE_LIMITED'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'TIMEOUT'
    | 'SERVER_BUSY'
    | 'DEPRECATED'
    | 'AUTH_REQUIRED'
    | 'HANDOFF_UPSTREAM_UNAVAILABLE'
    | 'HANDOFF_NAMESPACE_MISMATCH'
    | 'HANDOFF_CONNECTING'
    | (string & {}); // custom codes welcome — union preserves autocomplete

/**
 * Error severity level.
 *
 * - `'warning'`  — Non-fatal. The operation succeeded but with caveats
 *   (e.g. deprecated tool, partial results, soft quota approaching).
 * - `'error'`    — The operation failed. Agent should attempt recovery.
 * - `'critical'` — Unrecoverable. Agent should escalate to the user.
 */
export type ErrorSeverity = 'warning' | 'error' | 'critical';

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
    /**
     * Error severity.
     *
     * Defaults to `'error'` when omitted.
     *
     * @example `'warning'` for deprecation notices
     */
    severity?: ErrorSeverity;
    /**
     * Structured metadata about the error (e.g. the invalid value,
     * the entity ID that wasn't found, or constraint violations).
     *
     * Rendered as `<details>` child elements in the XML envelope.
     *
     * @example `{ entity_id: 'inv_123', expected_type: 'string' }`
     */
    details?: Record<string, string>;
    /**
     * Suggested retry delay in seconds for transient errors.
     *
     * Rendered as `<retry_after>{n} seconds</retry_after>` in the
     * XML envelope. Useful for rate-limit and concurrency errors.
     */
    retryAfter?: number;
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
export function toolError(code: ErrorCode, options: ToolErrorOptions): ToolResponse {
    const severity = options.severity ?? 'error';
    const parts: string[] = [
        `<tool_error code="${escapeXmlAttr(code)}" severity="${escapeXmlAttr(severity)}">`,
        `<message>${escapeXml(options.message)}</message>`,
    ];

    if (options.suggestion) {
        parts.push(`<recovery>${escapeXml(options.suggestion)}</recovery>`);
    }

    if ((options.availableActions?.length ?? 0) > 0) {
        parts.push('<available_actions>');
        for (const action of options.availableActions!) {
            parts.push(`  <action>${escapeXml(action)}</action>`);
        }
        parts.push('</available_actions>');
    }

    if (options.details != null && Object.keys(options.details).length > 0) {
        parts.push('<details>');
        for (const [key, value] of Object.entries(options.details)) {
            parts.push(`  <detail key="${escapeXmlAttr(key)}">${escapeXml(value)}</detail>`);
        }
        parts.push('</details>');
    }

    if (options.retryAfter !== undefined && Number.isFinite(options.retryAfter) && options.retryAfter > 0) {
        parts.push(`<retry_after>${options.retryAfter} seconds</retry_after>`);
    }

    parts.push('</tool_error>');

    // Warnings are non-fatal — do not set isError so the response
    // flows through the success path while still carrying guidance.
    const isError = severity !== 'warning';
    const resp: ToolResponse = { content: [{ type: "text", text: parts.join('\n') }], isError };
    Object.defineProperty(resp, TOOL_RESPONSE_BRAND, { value: true });
    return resp;
}

// ============================================================================
// Federated Handoff Protocol — f.handoff()
// ============================================================================

/**
 * Payload for a federated agent handoff.
 * Full type lives in `@mcpfusion/swarm` — this is the minimal shape needed by core.
 * @see `HandoffPayload` in `@mcpfusion/swarm`
 */
export interface HandoffPayload {
    target: string;
    carryOverState?: Record<string, unknown>;
    systemInstruction?: string;
    delegationToken?: string;
    reason?: string;
    modelHint?: 'fast' | 'balanced' | 'powerful';
}

/**
 * Discriminated response returned by `f.handoff()`.
 * Detected by `ServerAttachment` via `isHandoffResponse()` and routed
 * to the `SwarmGateway` instead of being forwarded to the LLM.
 */
export interface HandoffResponse {
    readonly _MCPFUSION_handoff: true;
    readonly isHandoff: true;
    readonly payload: HandoffPayload;
}

/**
 * Type-guard used by `ServerAttachment` to detect a `HandoffResponse`
 * without importing `@mcpfusion/swarm` (avoids circular dependency).
 */
export function isHandoffResponse(v: unknown): v is HandoffResponse {
    if (typeof v !== 'object' || v === null) return false;
    const r = v as Record<string, unknown>;
    return r['_MCPFUSION_handoff'] === true && r['isHandoff'] === true;
}

/**
 * Initiate a federated agent handoff from a tool handler.
 *
 * The `ServerAttachment` detects this response and activates the
 * `SwarmGateway` tunnel to the specified upstream server.
 *
 * @param target  - Target server URI (e.g. `'mcp://finance-agent.internal:8080'`)
 * @param options - Carry-over state, system instruction, and tracing hints
 *
 * @example
 * ```typescript
 * import { f } from '@mcpfusion/core';
 *
 * export const triage = f.tool('system.triage')
 *     .withEnum('domain', ['finance', 'devops'])
 *     .withString('context', 'What the user needs.')
 *     .handle(async (input) => f.handoff(`mcp://${input.domain}-agent`, {
 *         carryOverState: { intent: input.context },
 *         reason: `Triage → ${input.domain}`,
 *     }));
 * ```
 */
export function handoff(target: string, options?: Omit<HandoffPayload, 'target'>): HandoffResponse {
    const resp: HandoffResponse = {
        _MCPFUSION_handoff: true,
        isHandoff: true,
        payload: { target, ...options },
    };
    Object.defineProperty(resp, TOOL_RESPONSE_BRAND, { value: true });
    return resp;
}
