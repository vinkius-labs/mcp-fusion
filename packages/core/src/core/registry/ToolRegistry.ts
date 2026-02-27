/**
 * ToolRegistry — Centralized Tool Registration & Routing
 *
 * The single place where all tool builders are registered and where
 * incoming MCP calls are routed to the correct handler.
 *
 * @example
 * ```typescript
 * import { ToolRegistry, createTool, success } from '@vinkius-core/mcp-fusion';
 *
 * const registry = new ToolRegistry<AppContext>();
 *
 * registry.register(
 *     createTool<AppContext>('projects').action({ name: 'list', handler: listProjects }),
 * );
 *
 * // Attach to any MCP server (duck-typed):
 * const detach = registry.attachToServer(server, {
 *     contextFactory: (extra) => createAppContext(extra),
 * });
 *
 * // Clean teardown (e.g. in tests):
 * detach();
 * ```
 *
 * @see {@link createTool} for building tools
 * @see {@link GroupedToolBuilder} for the builder API
 *
 * @module
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ToolResponse, toolError } from '../response.js';
import { type ToolBuilder } from '../types.js';
import { type DebugObserverFn } from '../../observability/DebugObserver.js';
import { type FusionTracer, SpanStatusCode } from '../../observability/Tracing.js';
import { filterTools, type ToolFilter } from './ToolFilterEngine.js';
import {
    attachToServer as attachToServerStrategy,
    type AttachOptions, type DetachFn,
} from '../../server/ServerAttachment.js';

import { type ProgressSink } from '../execution/ProgressHelper.js';

// ── Re-exports ───────────────────────────────────────────

export type { ToolFilter } from './ToolFilterEngine.js';
export type { AttachOptions, DetachFn } from '../../server/ServerAttachment.js';

// ============================================================================
// ToolRegistry
// ============================================================================

/**
 * Centralized registry for MCP tool builders.
 *
 * Manages tool registration, filtered retrieval, call routing,
 * and MCP server attachment.
 *
 * @typeParam TContext - Application context type shared across all tools
 *
 * @example
 * ```typescript
 * const registry = new ToolRegistry<AppContext>();
 *
 * // Register individually
 * registry.register(projectsTool);
 *
 * // Register multiple at once
 * registry.registerAll(usersTool, billingTool, adminTool);
 *
 * // Query registered tools
 * registry.has('projects');  // true
 * registry.size;             // 4
 * ```
 */
export class ToolRegistry<TContext = void> {
    private readonly _builders = new Map<string, ToolBuilder<TContext>>();
    private _debug?: DebugObserverFn;
    private _tracer?: FusionTracer;

    /**
     * Register a single tool builder.
     *
     * Validates that the tool name is unique and triggers
     * {@link GroupedToolBuilder.buildToolDefinition} to compile
     * the tool definition at registration time.
     *
     * @param builder - A built or unbuilt tool builder
     * @throws If a tool with the same name is already registered
     *
     * @example
     * ```typescript
     * registry.register(
     *     createTool<AppContext>('projects')
     *         .action({ name: 'list', handler: listProjects })
     * );
     * ```
     */
    register(builder: ToolBuilder<TContext>): void {
        const name = builder.getName();
        if (this._builders.has(name)) {
            throw new Error(`Tool "${name}" is already registered.`);
        }
        builder.buildToolDefinition();
        this._builders.set(name, builder);
    }

    /**
     * Register multiple tool builders at once.
     *
     * @param builders - One or more tool builders
     *
     * @example
     * ```typescript
     * registry.registerAll(usersTool, projectsTool, billingTool);
     * ```
     */
    registerAll(...builders: ToolBuilder<TContext>[]): void {
        for (const builder of builders) {
            this.register(builder);
        }
    }

    /**
     * Get all registered MCP tool definitions.
     *
     * Returns the compiled `McpTool` objects for all registered builders.
     *
     * @returns Array of MCP Tool objects
     */
    getAllTools(): McpTool[] {
        const tools: McpTool[] = [];
        for (const builder of this._builders.values()) {
            tools.push(builder.buildToolDefinition());
        }
        return tools;
    }

    /**
     * Get an iterable of all registered tool builders.
     *
     * Used by the introspection module to extract action
     * metadata and presenter information from each builder.
     *
     * @returns Iterable of registered ToolBuilder instances
     */
    getBuilders(): Iterable<ToolBuilder<TContext>> {
        return this._builders.values();
    }

    /**
     * Get tool definitions filtered by tags.
     *
     * Uses the {@link ToolFilter} to include/exclude tools
     * based on their capability tags.
     *
     * @param filter - Tag-based filter configuration
     * @returns Filtered array of MCP Tool objects
     *
     * @example
     * ```typescript
     * // Only core tools
     * const coreTools = registry.getTools({ tags: ['core'] });
     *
     * // Everything except internal tools
     * const publicTools = registry.getTools({ exclude: ['internal'] });
     * ```
     *
     * @see {@link ToolFilter} for filter options
     */
    getTools(filter: ToolFilter): McpTool[] {
        return filterTools(this._builders.values(), filter);
    }

    /**
     * Route an incoming tool call to the correct builder.
     *
     * Looks up the builder by name and delegates to its `execute()` method.
     * Returns an error response if the tool is not found.
     *
     * @param ctx - Application context
     * @param name - Tool name from the incoming MCP call
     * @param args - Raw arguments from the LLM
     * @param progressSink - Optional callback for streaming progress notifications.
     *   When called from `attachToServer()`, this is automatically wired to
     *   MCP `notifications/progress`. When omitted, progress events are silently consumed.
     * @returns The handler's response
     *
     * @example
     * ```typescript
     * const response = await registry.routeCall(ctx, 'projects', {
     *     action: 'list',
     *     workspace_id: 'ws_123',
     * });
     * ```
     */
    async routeCall(
        ctx: TContext,
        name: string,
        args: Record<string, unknown>,
        progressSink?: ProgressSink,
        signal?: AbortSignal,
    ): Promise<ToolResponse> {
        const builder = this._builders.get(name);
        if (!builder) {
            if (this._tracer) {
                const span = this._tracer.startSpan(`mcp.tool.${name}`, {
                    attributes: { 'mcp.system': 'fusion', 'mcp.tool': name, 'mcp.error_type': 'unknown_tool' },
                });
                span.setStatus({ code: SpanStatusCode.UNSET, message: `Unknown tool: "${name}"` });
                span.end();
            }
            if (this._debug) {
                this._debug({ type: 'error', tool: name, action: '?', error: `Unknown tool: "${name}"`, step: 'route', timestamp: Date.now() });
            }
            return toolError('UNKNOWN_TOOL', {
                message: `Tool "${name}" does not exist.`,
                suggestion: 'Check the available tools and call a valid one.',
                availableActions: Array.from(this._builders.keys()),
            });
        }
        return builder.execute(ctx, args, progressSink, signal);
    }

    /**
     * Attach this registry to an MCP server.
     *
     * Registers `tools/list` and `tools/call` handlers on the server.
     * Supports both `McpServer` (high-level SDK) and `Server` (low-level SDK)
     * via duck-type detection.
     *
     * @param server - Any MCP server instance (duck-typed)
     * @param options - Attachment options (context factory, tag filter)
     * @returns A detach function for clean teardown
     *
     * @example
     * ```typescript
     * // Basic attachment
     * const detach = registry.attachToServer(server, {
     *     contextFactory: (extra) => createAppContext(extra),
     * });
     *
     * // With tag filtering
     * registry.attachToServer(server, {
     *     contextFactory: (extra) => createAppContext(extra),
     *     filter: { tags: ['core'] },
     * });
     *
     * // Clean teardown (e.g. in tests)
     * detach();
     * ```
     *
     * @see {@link DetachFn} for the teardown function type
     * @see {@link AttachOptions} for all options
     */
    async attachToServer(
        server: unknown,
        options: AttachOptions<TContext> = {},
    ): Promise<DetachFn> {
        return attachToServerStrategy(server, this, options);
    }

    /** Check if a tool with the given name is registered. */
    has(name: string): boolean { return this._builders.has(name); }

    /** Remove all registered tools. */
    clear(): void { this._builders.clear(); }

    /** Number of registered tools. */
    get size(): number { return this._builders.size; }

    /**
     * Enable debug observability for ALL registered tools.
     *
     * Propagates the debug observer to every registered builder that
     * supports it (duck-typed via `.debug()` method).
     *
     * Also enables registry-level debug events (unknown tool errors).
     *
     * @param observer - A {@link DebugObserverFn} created by `createDebugObserver()`
     *
     * @example
     * ```typescript
     * const debug = createDebugObserver();
     * registry.enableDebug(debug);
     * // Now ALL tools + registry routing emit debug events
     * ```
     */
    enableDebug(observer: DebugObserverFn): void {
        if (this._tracer) {
            console.warn('[mcp-fusion] Both tracing and debug are enabled. Tracing takes precedence; debug events will not be emitted.');
        }
        this._debug = observer;
        for (const builder of this._builders.values()) {
            // Duck-type: call .debug() if it exists on the builder
            if ('debug' in builder && typeof (builder as { debug: unknown }).debug === 'function') {
                (builder as { debug: (fn: DebugObserverFn) => void }).debug(observer);
            }
        }
    }

    /**
     * Enable OpenTelemetry-compatible tracing for ALL registered tools.
     *
     * Propagates the tracer to every registered builder that supports
     * it (duck-typed via `.tracing()` method).
     *
     * Also enables registry-level tracing for unknown tool routing errors.
     *
     * **Important**: When both `enableDebug()` and `enableTracing()` are active,
     * tracing takes precedence and debug events are NOT emitted from tool builders.
     *
     * @param tracer - A {@link FusionTracer} (or OTel `Tracer`) instance
     *
     * @example
     * ```typescript
     * import { trace } from '@opentelemetry/api';
     *
     * const tracer = trace.getTracer('mcp-fusion');
     * registry.enableTracing(tracer);
     * // Now ALL tools + registry routing emit OTel spans
     * ```
     *
     * @see {@link FusionTracer} for the tracer interface contract
     * @see {@link SpanStatusCode} for status code semantics
     */
    enableTracing(tracer: FusionTracer): void {
        if (this._debug) {
            console.warn('[mcp-fusion] Both tracing and debug are enabled. Tracing takes precedence; debug events will not be emitted.');
        }
        this._tracer = tracer;
        for (const builder of this._builders.values()) {
            // Duck-type: call .tracing() if it exists on the builder
            if ('tracing' in builder && typeof (builder as { tracing: unknown }).tracing === 'function') {
                (builder as { tracing: (t: FusionTracer) => void }).tracing(tracer);
            }
        }
    }
}
