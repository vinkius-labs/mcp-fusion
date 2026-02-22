/**
 * ServerAttachment — MCP Server Integration Strategy
 *
 * Handles attaching a ToolRegistry to an MCP Server by registering
 * request handlers for tools/list and tools/call.
 *
 * Supports both Server (low-level) and McpServer (high-level) via duck-typing.
 *
 * Pure-function module: receives dependencies, returns detach function.
 */
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ToolResponse, error } from '../response.js';
import { type ToolBuilder } from '../types.js';
import { type ProgressSink, type ProgressEvent } from '../execution/ProgressHelper.js';
import { resolveServer } from './ServerResolver.js';
import { type DebugObserverFn } from '../observability/DebugObserver.js';
import { type FusionTracer } from '../observability/Tracing.js';
import { StateSyncLayer } from '../state-sync/StateSyncLayer.js';
import { type StateSyncConfig } from '../state-sync/types.js';
import { type IntrospectionConfig } from '../introspection/types.js';
import { registerIntrospectionResource } from '../introspection/IntrospectionResource.js';

// ── Types ────────────────────────────────────────────────

/**
 * Typed interface for MCP SDK Server with overloaded setRequestHandler signatures.
 * ServerResolver returns the generic McpServerLike; we narrow it here for type-safe handler registration.
 */
interface McpServerTyped {
    setRequestHandler(schema: typeof ListToolsRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof CallToolRequestSchema, handler: (...args: never[]) => unknown): void;
}

/**
 * Duck-typed interface for the MCP SDK `extra` object passed to request handlers.
 * We only extract the fields needed for progress notification wiring.
 */
interface McpRequestExtra {
    /** Metadata from the original JSON-RPC request (contains progressToken) */
    _meta?: { progressToken?: string | number };
    /** Send a notification back to the client within the current request scope */
    sendNotification: (notification: unknown) => Promise<void>;
}

/** Options for attaching to an MCP Server */
export interface AttachOptions<TContext> {
    /** Only expose tools matching these tag filters */
    filter?: { tags?: string[]; anyTag?: string[]; exclude?: string[] };
    /**
     * Factory function to create a per-request context.
     * Receives the MCP `extra` object (session info, meta, etc.).
     * If omitted, `undefined` is used as context (suitable for `ToolRegistry<void>`).
     * Supports async factories (e.g. for token verification, DB connection).
     */
    contextFactory?: (extra: unknown) => TContext | Promise<TContext>;
    /**
     * Enable debug observability for ALL registered tools.
     *
     * When set, the observer is automatically propagated to every tool
     * builder, and registry-level routing events are also emitted.
     *
     * @example
     * ```typescript
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     debug: createDebugObserver(),
     * });
     * ```
     *
     * @see {@link createDebugObserver} for creating an observer
     */
    debug?: DebugObserverFn;

    /**
     * Enable State Sync to prevent LLM Temporal Blindness and Causal State Drift.
     *
     * When configured, Fusion automatically:
     * 1. Appends `[Cache-Control: X]` to tool descriptions during `tools/list`
     * 2. Prepends `[System: Cache invalidated...]` after successful mutations in `tools/call`
     *
     * Zero overhead when omitted — no state-sync code runs.
     *
     * @example
     * ```typescript
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     stateSync: {
     *         defaults: { cacheControl: 'no-store' },
     *         policies: [
     *             { match: 'sprints.update', invalidates: ['sprints.*'] },
     *             { match: 'tasks.update',   invalidates: ['tasks.*', 'sprints.*'] },
     *             { match: 'countries.*',     cacheControl: 'immutable' },
     *         ],
     *     },
     * });
     * ```
     *
     * @see {@link StateSyncConfig} for configuration options
     * @see {@link https://arxiv.org/abs/2510.23853 | "Your LLM Agents are Temporally Blind"}
     */
    stateSync?: StateSyncConfig;

    /**
     * Enable dynamic introspection manifest (MCP Resource).
     *
     * When enabled, the framework registers a `resources/list` and
     * `resources/read` handler exposing a structured manifest of all
     * registered tools, actions, and presenters.
     *
     * **Security**: Opt-in only. Never enabled silently.
     * **RBAC**: The `filter` callback allows dynamic per-session
     * manifest filtering. Unauthorized agents never see hidden tools.
     *
     * @example
     * ```typescript
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     introspection: {
     *         enabled: process.env.NODE_ENV !== 'production',
     *         uri: 'fusion://manifest.json',
     *         filter: (manifest, ctx) => {
     *             if (ctx.user.role !== 'admin') {
     *                 delete manifest.capabilities.tools['admin.delete_user'];
     *             }
     *             return manifest;
     *         },
     *     },
     * });
     * ```
     *
     * @see {@link IntrospectionConfig} for configuration options
     */
    introspection?: IntrospectionConfig<TContext>;

    /**
     * Enable OpenTelemetry-compatible tracing for ALL registered tools.
     *
     * When set, the tracer is automatically propagated to every tool
     * builder, and registry-level routing spans are also created.
     *
     * **Context propagation limitation**: Since MCP Fusion does not depend
     * on `@opentelemetry/api`, it cannot call `context.with(trace.setSpan(...))`.
     * Auto-instrumented downstream calls (Prisma, HTTP, Redis) inside tool
     * handlers will appear as **siblings**, not children, of the MCP span.
     * This is an intentional trade-off for zero runtime dependencies.
     *
     * @example
     * ```typescript
     * import { trace } from '@opentelemetry/api';
     *
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     tracing: trace.getTracer('mcp-fusion'),
     * });
     * ```
     *
     * @see {@link FusionTracer} for the tracer interface contract
     */
    tracing?: FusionTracer;

    /**
     * Server name used in the introspection manifest.
     * @defaultValue `'mcp-fusion-server'`
     */
    serverName?: string;
}

/** Function to detach the registry from the server */
export type DetachFn = () => void;

/** Delegate interface for the registry operations needed by ServerAttachment */
export interface RegistryDelegate<TContext> {
    getAllTools(): McpTool[];
    getTools(filter: { tags?: string[]; anyTag?: string[]; exclude?: string[] }): McpTool[];
    routeCall(ctx: TContext, name: string, args: Record<string, unknown>, progressSink?: ProgressSink): Promise<ToolResponse>;
    /** Propagate a debug observer to all registered builders (duck-typed) */
    enableDebug?(observer: DebugObserverFn): void;
    /** Propagate a tracer to all registered builders (duck-typed) */
    enableTracing?(tracer: FusionTracer): void;
    /** Get an iterable of all registered builders (for introspection) */
    getBuilders?(): Iterable<ToolBuilder<TContext>>;
}

// ── Attachment ───────────────────────────────────────────

/**
 * Attach a registry to an MCP Server.
 *
 * Resolves the server type, registers tools/list and tools/call handlers,
 * and returns a detach function to remove the handlers.
 *
 * @param server - Server or McpServer instance (duck-typed)
 * @param registry - Delegate providing tool listing and routing
 * @param options - Filter and context factory options
 * @returns A detach function to remove the handlers
 */
export function attachToServer<TContext>(
    server: unknown,
    registry: RegistryDelegate<TContext>,
    options: AttachOptions<TContext> = {},
): DetachFn {
    // Resolve the low-level Server instance via ServerResolver strategy
    const resolved = resolveServer(server) as McpServerTyped;

    const { filter, contextFactory, debug, tracing, stateSync, introspection, serverName } = options;

    // Propagate debug observer to all registered builders
    if (debug && registry.enableDebug) {
        registry.enableDebug(debug);
    }

    // Propagate tracer to all registered builders
    if (tracing && registry.enableTracing) {
        registry.enableTracing(tracing);
    }

    // Create State Sync layer (zero overhead when not configured)
    const syncLayer = stateSync ? new StateSyncLayer(stateSync) : undefined;

    // Register introspection resource (zero overhead when disabled)
    if (introspection?.enabled && registry.getBuilders) {
        registerIntrospectionResource(
            resolved,
            introspection,
            serverName ?? 'mcp-fusion-server',
            { values: () => registry.getBuilders!() },
            contextFactory,
        );
    }

    // ── tools/list handler ────────────────────────────────────────
    const listHandler = () => {
        const tools = filter
            ? registry.getTools(filter)
            : registry.getAllTools();
        return { tools: syncLayer ? syncLayer.decorateTools(tools) : tools };
    };

    // ── tools/call handler ────────────────────────────────────────
    const callHandler = async (
        request: { params: { name: string; arguments?: Record<string, unknown> } },
        extra: unknown,
    ) => {
        const { name, arguments: args = {} } = request.params;
        const ctx = contextFactory
            ? await contextFactory(extra)
            : (undefined as TContext);

        // Wire progress notifications: extract progressToken from MCP request
        // metadata and create a ProgressSink that sends notifications/progress.
        // Zero overhead when the client does not request progress.
        const progressSink = createProgressSink(extra);

        const result = await registry.routeCall(ctx, name, args, progressSink);
        return syncLayer ? syncLayer.decorateResult(name, result) : result;
    };

    // Register both handlers
    resolved.setRequestHandler(ListToolsRequestSchema, listHandler);
    resolved.setRequestHandler(CallToolRequestSchema, callHandler);

    // Return detach function
    return () => {
        resolved.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
        resolved.setRequestHandler(CallToolRequestSchema, () =>
            error('Tool handlers have been detached'),
        );
    };
}

// ── Progress Sink Factory ────────────────────────────────

/**
 * Duck-type check: the extra object from MCP SDK has _meta and sendNotification.
 */
function isMcpExtra(extra: unknown): extra is McpRequestExtra {
    return (
        typeof extra === 'object' &&
        extra !== null &&
        'sendNotification' in extra &&
        typeof (extra as McpRequestExtra).sendNotification === 'function'
    );
}

/**
 * Create a ProgressSink from the MCP request `extra` object.
 *
 * When the client includes `_meta.progressToken` in its `tools/call` request,
 * this factory returns a ProgressSink that maps each internal ProgressEvent
 * to the MCP `notifications/progress` protocol wire format:
 *
 * ```
 * ProgressEvent { percent: 50, message: 'Building...' }
 *   → notifications/progress { progressToken, progress: 50, total: 100, message: 'Building...' }
 * ```
 *
 * When no progressToken is present (client didn't opt in),
 * returns `undefined` — zero overhead.
 *
 * @param extra - The MCP request handler's extra argument (duck-typed)
 * @returns A ProgressSink or undefined
 */
function createProgressSink(extra: unknown): ProgressSink | undefined {
    if (!isMcpExtra(extra)) return undefined;

    const token = extra._meta?.progressToken;
    if (token === undefined) return undefined;

    const sendNotification = extra.sendNotification;

    return (event: ProgressEvent): void => {
        // Fire-and-forget: progress notifications are best-effort.
        // We intentionally do not await to avoid blocking the handler pipeline.
        void sendNotification({
            method: 'notifications/progress',
            params: {
                progressToken: token,
                progress: event.percent,
                total: 100,
                message: event.message,
            },
        });
    };
}
