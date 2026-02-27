/**
 * FusionClient — Type-Safe MCP Client (tRPC-style)
 *
 * Provides end-to-end type safety from server to client.
 * The server exports its router type, and the client consumes it
 * with full autocomplete and compile-time validation.
 *
 * @example
 * ```typescript
 * // ── SERVER (mcp-server.ts) ──
 * export const registry = new ToolRegistry<AppContext>();
 * registry.register(projects);
 * registry.register(billing);
 * export type AppRouter = InferRouter<typeof registry>;
 *
 * // ── CLIENT (agent.ts) ──
 * import { createFusionClient } from '@vinkius-core/mcp-fusion/client';
 * import type { AppRouter } from './mcp-server';
 *
 * const client = createFusionClient<AppRouter>(transport);
 * const result = await client.execute('projects.create', { name: 'Vinkius V2' });
 * //                                   ^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^
 * //                                   autocomplete!       typed args!
 * ```
 *
 * @module
 */
import { type ToolResponse } from '../core/response.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Transport interface for the fusion client.
 * This abstracts the MCP transport layer (stdio, HTTP, WebSocket, etc.)
 */
export interface FusionTransport {
    /** Call a tool by name with arguments */
    callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse>;
}

/**
 * Router type inferred from a ToolRegistry.
 *
 * Maps tool names to their action names and argument shapes.
 * This type is used at compile-time only — zero runtime cost.
 *
 * @example
 * ```typescript
 * type MyRouter = {
 *     'projects.list': { workspace_id: string; status?: string };
 *     'projects.create': { workspace_id: string; name: string };
 *     'billing.refund': { invoice_id: string; amount: number };
 * };
 * ```
 */
export type RouterMap = Record<string, Record<string, unknown>>;

// ============================================================================
// Client Middleware (Interceptor Pattern)
// ============================================================================

/**
 * Client-side middleware for request/response interception.
 *
 * Follows the same onion model as server-side middleware:
 * each middleware wraps the next, forming a pipeline.
 *
 * Use cases: authentication injection, request logging,
 * retry logic, timeout enforcement, response transformation.
 *
 * @example
 * ```typescript
 * const authMiddleware: ClientMiddleware = async (action, args, next) => {
 *     const enrichedArgs = { ...args, _token: getToken() };
 *     return next(action, enrichedArgs);
 * };
 *
 * const retryMiddleware: ClientMiddleware = async (action, args, next) => {
 *     for (let i = 0; i < 3; i++) {
 *         const result = await next(action, args);
 *         if (!result.isError) return result;
 *     }
 *     return next(action, args);
 * };
 * ```
 */
export type ClientMiddleware = (
    action: string,
    args: Record<string, unknown>,
    next: (action: string, args: Record<string, unknown>) => Promise<ToolResponse>,
) => Promise<ToolResponse>;

// ============================================================================
// Structured Client Error
// ============================================================================

/**
 * Structured error parsed from a `<tool_error>` XML envelope.
 *
 * Provides typed access to self-healing fields so client code
 * can programmatically react to server errors without regex parsing.
 */
export class FusionClientError extends Error {
    /** Error code from the `code` attribute (e.g. `'NOT_FOUND'`). */
    readonly code: string;
    /** Recovery suggestion from `<recovery>` element. */
    readonly recovery?: string | undefined;
    /** Available actions from `<available_actions>` children. */
    readonly availableActions: readonly string[];
    /** Error severity from the `severity` attribute. */
    readonly severity: string;
    /** Raw ToolResponse that caused the error. */
    readonly raw: ToolResponse;

    constructor(
        message: string,
        code: string,
        raw: ToolResponse,
        options?: {
            recovery?: string | undefined;
            availableActions?: string[] | undefined;
            severity?: string | undefined;
        },
    ) {
        super(message);
        this.name = 'FusionClientError';
        this.code = code;
        this.raw = raw;
        this.recovery = options?.recovery;
        this.availableActions = Object.freeze(options?.availableActions ?? []);
        this.severity = options?.severity ?? 'error';
    }
}

// ============================================================================
// Client Options
// ============================================================================

/**
 * Options for creating a FusionClient.
 */
export interface FusionClientOptions {
    /**
     * Client-side middleware pipeline.
     *
     * Middleware execute in registration order (first = outermost).
     * Each middleware can modify the request, response, or both.
     *
     * @example
     * ```typescript
     * const client = createFusionClient<AppRouter>(transport, {
     *     middleware: [authMiddleware, loggingMiddleware],
     * });
     * ```
     */
    middleware?: ClientMiddleware[];

    /**
     * When `true`, `execute()` throws a {@link FusionClientError}
     * for responses with `isError: true`.
     *
     * When `false` (default), error responses are returned normally
     * and the caller must check `result.isError`.
     *
     * @default false
     */
    throwOnError?: boolean;
}

// ============================================================================
// Client Interface
// ============================================================================

/**
 * Type-safe client that provides autocomplete and compile-time
 * validation for MCP tool calls.
 *
 * @typeParam TRouter - The router map inferred from the server's registry
 */
export interface FusionClient<TRouter extends RouterMap> {
    /**
     * Execute a tool action with full type safety.
     *
     * @param action - Full action path (e.g. 'projects.create')
     * @param args - Typed arguments matching the action's schema
     * @returns The tool response
     */
    execute<TAction extends keyof TRouter & string>(
        action: TAction,
        args: TRouter[TAction],
    ): Promise<ToolResponse>;

    /**
     * Execute multiple tool actions concurrently.
     *
     * All calls run in parallel via `Promise.all`.
     * Use `{ sequential: true }` for ordered execution.
     *
     * @param calls - Array of `{ action, args }` objects
     * @param options - Optional execution mode
     * @returns Array of tool responses, one per call
     *
     * @example
     * ```typescript
     * const results = await client.executeBatch([
     *     { action: 'projects.list', args: { workspace_id: 'ws_1' } },
     *     { action: 'billing.balance', args: { account_id: 'acc_1' } },
     * ]);
     * ```
     */
    executeBatch<TActions extends ReadonlyArray<keyof TRouter & string>>(
        calls: { [K in keyof TActions]: { action: TActions[K]; args: TRouter[TActions[K] & keyof TRouter] } },
        options?: { sequential?: boolean | undefined } | undefined,
    ): Promise<ToolResponse[]>;

    /**
     * Fluent proxy for calling tools with dot-navigation.
     *
     * Builds the action path from chained property accesses,
     * then executes when invoked as a function.
     *
     * @example
     * ```typescript
     * // Equivalent to: client.execute('projects.create', { name: 'V2' })
     * await client.proxy.projects.create({ name: 'V2' });
     *
     * // Also works for deeper paths:
     * await client.proxy.platform.users.list({ limit: 10 });
     * ```
     */
    readonly proxy: FluentProxy<TRouter>;
}

// ── Fluent Proxy Type Utilities ──────────────────────────

/**
 * Splits a dotted key `'a.b.c'` into head `'a'` and tail `'b.c'`.
 * @internal
 */
type SplitKey<K extends string> =
    K extends `${infer Head}.${infer Tail}` ? [Head, Tail] : [K, never];

/**
 * Collects all first segments from the router keys.
 * @internal
 */
type FirstSegments<TRouter extends RouterMap> = {
    [K in keyof TRouter & string]: SplitKey<K>[0];
}[keyof TRouter & string];

/**
 * Given a segment prefix, collects remaining tails and their arg types.
 * @internal
 */
type SubRouter<TRouter extends RouterMap, Prefix extends string> = {
    [K in keyof TRouter & string as K extends `${Prefix}.${infer Rest}` ? Rest : never]: TRouter[K];
};

/**
 * Recursive proxy node type.
 *
 * - If the key resolves to a leaf action, it becomes callable.
 * - If it has further segments, it exposes another level of navigation.
 * @internal
 */
type ProxyNode<TRouter extends RouterMap> = {
    [Seg in FirstSegments<TRouter>]:
        // If `Seg` is a direct key in the router (leaf action), it's callable
        (Seg extends keyof TRouter
            ? ((args: TRouter[Seg]) => Promise<ToolResponse>)
            : unknown) &
        // If there are sub-keys, recursively expose them
        (string extends FirstSegments<SubRouter<TRouter, Seg>>
            ? unknown
            : FluentProxy<SubRouter<TRouter, Seg>>);
};

/**
 * Top-level fluent proxy type.
 *
 * Provides dot-navigation for calling tools:
 * ```typescript
 * await client.proxy.projects.create({ name: 'V2' });
 * ```
 */
export type FluentProxy<TRouter extends RouterMap> = ProxyNode<TRouter>;

// ============================================================================
// XML Error Parser (Internal)
// ============================================================================

/**
 * Decode XML entities back to their original characters.
 *
 * Reverses the escaping applied by `escapeXml()` and `escapeXmlAttr()`
 * so that parsed error messages are human-readable.
 *
 * @internal
 */
function unescapeXml(str: string): string {
    return str
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&'); // &amp; must be last to avoid double-decode
}

/**
 * Parse a `<tool_error>` XML envelope into structured fields.
 *
 * Coupled to the output format of `toolError()` from `response.ts`.
 * Uses regex for lightweight parsing — acceptable since the XML is
 * self-produced by the framework, not user-authored.
 *
 * @internal
 */
function parseToolErrorXml(text: string): {
    code: string;
    message: string;
    recovery?: string | undefined;
    availableActions: string[];
    severity: string;
} | null {
    const codeMatch = text.match(/<tool_error\s[^>]*code="([^"]+)"/);
    const severityMatch = text.match(/<tool_error\s[^>]*severity="([^"]+)"/);
    const messageMatch = text.match(/<message>([\s\S]*?)<\/message>/);
    const recoveryMatch = text.match(/<recovery>([\s\S]*?)<\/recovery>/);

    if (!messageMatch) return null;

    const actions: string[] = [];
    const actionMatches = text.matchAll(/<action>([\s\S]*?)<\/action>/g);
    for (const m of actionMatches) {
        if (m[1]) actions.push(unescapeXml(m[1].trim()));
    }

    // Fallback: legacy comma-separated format
    if (actions.length === 0) {
        const legacyMatch = text.match(/<available_actions>([\s\S]*?)<\/available_actions>/);
        if (legacyMatch?.[1]) {
            actions.push(...legacyMatch[1].split(',').map(a => unescapeXml(a.trim())).filter(Boolean));
        }
    }

    const recovery = recoveryMatch?.[1] != null ? unescapeXml(recoveryMatch[1].trim()) : undefined;

    const result: {
        code: string;
        message: string;
        recovery?: string | undefined;
        availableActions: string[];
        severity: string;
    } = {
        code: codeMatch?.[1] != null ? unescapeXml(codeMatch[1]) : 'UNKNOWN',
        message: unescapeXml(messageMatch[1]!.trim()),
        availableActions: actions,
        severity: severityMatch?.[1] ?? 'error',
    };

    if (recovery !== undefined) {
        result.recovery = recovery;
    }

    return result;
}

// ============================================================================
// Middleware Chain Compiler (Internal)
// ============================================================================

/** @internal */
function compileClientMiddleware(
    middleware: ClientMiddleware[],
    terminal: (action: string, args: Record<string, unknown>) => Promise<ToolResponse>,
): (action: string, args: Record<string, unknown>) => Promise<ToolResponse> {
    let chain = terminal;

    // Wrap from right to left: first middleware in array = outermost
    for (let i = middleware.length - 1; i >= 0; i--) {
        const mw = middleware[i]!;
        const next = chain;
        chain = (action, args) => mw(action, args, next);
    }

    return chain;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a type-safe MCP client.
 *
 * The client provides full autocomplete for action names and
 * compile-time validation for arguments based on the server's
 * router type.
 *
 * @typeParam TRouter - The router map (use `InferRouter<typeof registry>`)
 * @param transport - The MCP transport layer
 * @param options - Client options (middleware, error handling)
 * @returns A typed {@link FusionClient}
 *
 * @example
 * ```typescript
 * import type { AppRouter } from './mcp-server';
 *
 * const client = createFusionClient<AppRouter>(transport);
 *
 * // Full autocomplete + type validation:
 * await client.execute('projects.create', { name: 'Vinkius V2' });
 *
 * // TS error: 'projects.nonexistent' is not a valid action
 * await client.execute('projects.nonexistent', {});
 *
 * // TS error: missing required arg 'name'
 * await client.execute('projects.create', {});
 * ```
 *
 * @example
 * ```typescript
 * // With client middleware and throwOnError
 * const client = createFusionClient<AppRouter>(transport, {
 *     throwOnError: true,
 *     middleware: [
 *         async (action, args, next) => {
 *             console.log(`[Client] calling ${action}`);
 *             const result = await next(action, args);
 *             console.log(`[Client] ${action} done`);
 *             return result;
 *         },
 *     ],
 * });
 * ```
 */
export function createFusionClient<TRouter extends RouterMap>(
    transport: FusionTransport,
    options?: FusionClientOptions,
): FusionClient<TRouter> {
    const throwOnError = options?.throwOnError ?? false;

    /** Terminal function: builds the MCP call from the dotted action path */
    function terminalCall(action: string, args: Record<string, unknown>): Promise<ToolResponse> {
        const dotIndex = action.indexOf('.');
        if (dotIndex === -1) {
            return transport.callTool(action, args);
        }

        const toolName = action.substring(0, dotIndex);
        const actionName = action.substring(dotIndex + 1);

        return transport.callTool(toolName, {
            action: actionName,
            ...args,
        });
    }

    // Compile middleware chain once at creation time
    const dispatch = (options?.middleware != null && options.middleware.length > 0)
        ? compileClientMiddleware(options.middleware, terminalCall)
        : terminalCall;

    /** Post-process: handle throwOnError */
    async function executeInternal(action: string, args: Record<string, unknown>): Promise<ToolResponse> {
        const result = await dispatch(action, args);

        if (throwOnError && result.isError) {
            const text = result.content
                .map(c => c.text)
                .join('\n');

            const parsed = parseToolErrorXml(text);
            if (parsed) {
                const opts: { recovery?: string | undefined; availableActions?: string[]; severity?: string } = {
                    availableActions: parsed.availableActions,
                    severity: parsed.severity,
                };
                if (parsed.recovery !== undefined) {
                    opts.recovery = parsed.recovery;
                }
                throw new FusionClientError(parsed.message, parsed.code, result, opts);
            }

            throw new FusionClientError(text || 'Unknown error', 'UNKNOWN', result);
        }

        return result;
    }

    return {
        async execute<TAction extends keyof TRouter & string>(
            action: TAction,
            args: TRouter[TAction],
        ): Promise<ToolResponse> {
            return executeInternal(action, args as Record<string, unknown>);
        },

        async executeBatch<TActions extends readonly (keyof TRouter & string)[]>(
            calls: { [K in keyof TActions]: { action: TActions[K]; args: TRouter[TActions[K] & keyof TRouter] } },
            batchOptions?: { sequential?: boolean | undefined } | undefined,
        ): Promise<ToolResponse[]> {
            const items = calls as unknown as Array<{ action: string; args: Record<string, unknown> }>;
            if (batchOptions?.sequential) {
                const results: ToolResponse[] = [];
                for (const call of items) {
                    results.push(await executeInternal(call.action, call.args));
                }
                return results;
            }

            return Promise.all(
                items.map(call => executeInternal(call.action, call.args)),
            );
        },

        proxy: buildFluentProxy(executeInternal) as FluentProxy<TRouter>,
    };
}

// ============================================================================
// Fluent Proxy Builder (Internal)
// ============================================================================

/**
 * Creates a recursive Proxy that accumulates path segments
 * and executes when invoked as a function.
 *
 * ```
 * proxy.projects.create({ name: 'V2' })
 * //   ^^^^^^^^ ^^^^^^  ^^^^^^^^^^^^^^^^
 * //   seg[0]   seg[1]  args → execute('projects.create', args)
 * ```
 *
 * @internal
 */
function buildFluentProxy(
    execute: (action: string, args: Record<string, unknown>) => Promise<ToolResponse>,
    segments: string[] = [],
): unknown {
    return new Proxy(function () {} as any, {
        get(_target: unknown, prop: string | symbol): unknown {
            if (typeof prop !== 'string' || prop === 'then') return undefined;
            return buildFluentProxy(execute, [...segments, prop]);
        },

        apply(_target: unknown, _thisArg: unknown, argsList: unknown[]): unknown {
            const action = segments.join('.');
            const args = (argsList[0] ?? {}) as Record<string, unknown>;
            return execute(action, args);
        },
    });
}
