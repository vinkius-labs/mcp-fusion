/**
 * ToolRegistry — Centralized Tool Registration & Routing
 * 
 * Supports selective exposure via tags for reducing LLM context.
 * Provides `attachToServer()` for 1-line MCP SDK integration.
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { type ToolResponse, error } from './ResponseHelper.js';
import { type ToolBuilder } from './ToolBuilder.js';

// ============================================================================
// Types
// ============================================================================

/** Filter options for getTools() */
export interface ToolFilter {
    /** Only include tools that have ALL these tags (AND logic) */
    tags?: string[];
    /** Only include tools that have at least ONE of these tags (OR logic) */
    anyTag?: string[];
    /** Exclude tools that have ANY of these tags */
    exclude?: string[];
}

/**
 * Duck-typed interface for MCP SDK Server.
 * Works with both `Server` (low-level) and `McpServer` (high-level).
 */
interface McpServerLike {
    setRequestHandler(schema: typeof ListToolsRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof CallToolRequestSchema, handler: (...args: never[]) => unknown): void;
}

/**
 * Options for attaching a ToolRegistry to an MCP Server.
 *
 * @template TContext - The context type used by the registry.
 */
export interface AttachOptions<TContext> {
    /** Only expose tools matching these tag filters */
    filter?: ToolFilter;
    /**
     * Factory function to create a per-request context.
     * Receives the MCP `extra` object (session info, meta, etc.).
     * If omitted, `undefined` is used as context (suitable for `ToolRegistry<void>`).
     */
    contextFactory?: (extra: unknown) => TContext;
}

/** Function to detach the registry from the server */
export type DetachFn = () => void;

// ============================================================================
// ToolRegistry
// ============================================================================

export class ToolRegistry<TContext = void> {
    private readonly _builders = new Map<string, ToolBuilder<TContext>>();

    /** Register a tool builder. Throws on duplicate name. */
    register(builder: ToolBuilder<TContext>): void {
        const name = builder.getName();
        if (this._builders.has(name)) {
            throw new Error(`Tool "${name}" is already registered.`);
        }
        // Ensure tool is built (triggers validation + caching)
        builder.buildToolDefinition();
        this._builders.set(name, builder);
    }

    /** Register multiple builders at once */
    registerAll(...builders: ToolBuilder<TContext>[]): void {
        for (const builder of builders) {
            this.register(builder);
        }
    }

    /** Get all tool definitions */
    getAllTools(): McpTool[] {
        return Array.from(this._builders.values())
            .map(b => b.buildToolDefinition());
    }

    /** Get tool definitions filtered by tags */
    getTools(filter: ToolFilter): McpTool[] {
        return Array.from(this._builders.values())
            .filter(builder => {
                const builderTags = builder.getTags();

                // AND logic: builder must have ALL of these tags
                if (filter.tags && filter.tags.length > 0) {
                    if (!filter.tags.every(t => builderTags.includes(t))) {
                        return false;
                    }
                }

                // OR logic: builder must have at least ONE of these tags
                if (filter.anyTag && filter.anyTag.length > 0) {
                    if (!filter.anyTag.some(t => builderTags.includes(t))) {
                        return false;
                    }
                }

                // Exclude: builder must not have ANY of these tags
                if (filter.exclude && filter.exclude.length > 0) {
                    if (filter.exclude.some(t => builderTags.includes(t))) {
                        return false;
                    }
                }

                return true;
            })
            .map(b => b.buildToolDefinition());
    }

    /** Route a call to the correct builder */
    async routeCall(
        ctx: TContext,
        name: string,
        args: Record<string, unknown>
    ): Promise<ToolResponse> {
        const builder = this._builders.get(name);
        if (!builder) {
            const available = Array.from(this._builders.keys()).join(', ');
            return error(
                `Unknown tool: "${name}". Available tools: ${available}`
            );
        }
        return builder.execute(ctx, args);
    }

    /**
     * Attach this registry to an MCP Server — 1-line integration.
     *
     * Supports both:
     * - `Server` (low-level): `import { Server } from '@modelcontextprotocol/sdk/server/index.js'`
     * - `McpServer` (high-level): `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'`
     *
     * @example
     * ```typescript
     * // Minimal — void context
     * registry.attachToServer(server);
     *
     * // With tag filtering
     * registry.attachToServer(server, { filter: { tags: ['public'] } });
     *
     * // With per-request context
     * registry.attachToServer(server, {
     *     contextFactory: (extra) => ({ session: extra })
     * });
     * ```
     *
     * @returns A detach function to remove the handlers.
     */
    attachToServer(
        server: unknown,
        options: AttachOptions<TContext> = {},
    ): DetachFn {
        // Resolve the low-level Server instance
        const resolved = this._resolveServer(server);

        const { filter, contextFactory } = options;

        // ── tools/list handler ────────────────────────────────────────
        const listHandler = () => {
            const tools = filter
                ? this.getTools(filter)
                : this.getAllTools();
            return { tools };
        };

        // ── tools/call handler ────────────────────────────────────────
        const callHandler = async (request: { params: { name: string; arguments?: Record<string, unknown> } }, extra: unknown) => {
            const { name, arguments: args = {} } = request.params;
            const ctx = contextFactory
                ? contextFactory(extra)
                : (undefined as TContext);
            return this.routeCall(ctx, name, args);
        };

        // Register both handlers
        resolved.setRequestHandler(ListToolsRequestSchema, listHandler);
        resolved.setRequestHandler(CallToolRequestSchema, callHandler);

        // Return detach function
        return () => {
            // Reset handlers to no-op
            resolved.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
            resolved.setRequestHandler(CallToolRequestSchema, () =>
                error('Tool handlers have been detached'),
            );
        };
    }

    /** Check if a tool is registered */
    has(name: string): boolean {
        return this._builders.has(name);
    }

    /** Remove all registered tools */
    clear(): void {
        this._builders.clear();
    }

    /** Get count of registered tools */
    get size(): number {
        return this._builders.size;
    }

    // ── Private ──────────────────────────────────────────────────────

    /**
     * Resolve the low-level Server instance from either a `Server` or `McpServer`.
     *
     * Uses duck-typing to detect the server type:
     * - `McpServer` has a `.server` property that exposes the low-level `Server`
     * - `Server` has `setRequestHandler` directly
     */
    private _resolveServer(server: unknown): McpServerLike {
        if (!server || typeof server !== 'object') {
            throw new Error(
                'attachToServer() requires a Server or McpServer instance.',
            );
        }

        // Direct Server with setRequestHandler
        if (this._isMcpServerLike(server)) {
            return server;
        }

        // McpServer high-level wrapper
        const wrapped = (server as Record<string, unknown>).server;
        if (wrapped && typeof wrapped === 'object' && this._isMcpServerLike(wrapped)) {
            return wrapped;
        }

        throw new Error(
            'attachToServer() requires a Server or McpServer instance. ' +
            'The provided object does not have setRequestHandler().',
        );
    }

    private _isMcpServerLike(obj: unknown): obj is McpServerLike {
        return typeof obj === 'object' && obj !== null && 'setRequestHandler' in obj;
    }
}
