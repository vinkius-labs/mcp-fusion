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
import { resolveServer } from './ServerResolver.js';
import { type DebugObserverFn } from '../observability/DebugObserver.js';
import { StateSyncLayer } from '../state-sync/StateSyncLayer.js';
import { type StateSyncConfig } from '../state-sync/types.js';

// ── Types ────────────────────────────────────────────────

/**
 * Typed interface for MCP SDK Server with overloaded setRequestHandler signatures.
 * ServerResolver returns the generic McpServerLike; we narrow it here for type-safe handler registration.
 */
interface McpServerTyped {
    setRequestHandler(schema: typeof ListToolsRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof CallToolRequestSchema, handler: (...args: never[]) => unknown): void;
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
}

/** Function to detach the registry from the server */
export type DetachFn = () => void;

/** Delegate interface for the registry operations needed by ServerAttachment */
export interface RegistryDelegate<TContext> {
    getAllTools(): McpTool[];
    getTools(filter: { tags?: string[]; anyTag?: string[]; exclude?: string[] }): McpTool[];
    routeCall(ctx: TContext, name: string, args: Record<string, unknown>): Promise<ToolResponse>;
    /** Propagate a debug observer to all registered builders (duck-typed) */
    enableDebug?(observer: DebugObserverFn): void;
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

    const { filter, contextFactory, debug, stateSync } = options;

    // Propagate debug observer to all registered builders
    if (debug && registry.enableDebug) {
        registry.enableDebug(debug);
    }

    // Create State Sync layer (zero overhead when not configured)
    const syncLayer = stateSync ? new StateSyncLayer(stateSync) : undefined;

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
        const result = await registry.routeCall(ctx, name, args);
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
