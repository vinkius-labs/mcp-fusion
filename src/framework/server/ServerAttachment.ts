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
     */
    contextFactory?: (extra: unknown) => TContext;
}

/** Function to detach the registry from the server */
export type DetachFn = () => void;

/** Delegate interface for the registry operations needed by ServerAttachment */
export interface RegistryDelegate<TContext> {
    getAllTools(): McpTool[];
    getTools(filter: { tags?: string[]; anyTag?: string[]; exclude?: string[] }): McpTool[];
    routeCall(ctx: TContext, name: string, args: Record<string, unknown>): Promise<ToolResponse>;
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

    const { filter, contextFactory } = options;

    // ── tools/list handler ────────────────────────────────────────
    const listHandler = () => {
        const tools = filter
            ? registry.getTools(filter)
            : registry.getAllTools();
        return { tools };
    };

    // ── tools/call handler ────────────────────────────────────────
    const callHandler = async (
        request: { params: { name: string; arguments?: Record<string, unknown> } },
        extra: unknown,
    ) => {
        const { name, arguments: args = {} } = request.params;
        const ctx = contextFactory
            ? contextFactory(extra)
            : (undefined as TContext);
        return registry.routeCall(ctx, name, args);
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
