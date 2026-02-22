/**
 * GroupedToolBuilder — Fluent API for MCP Tool Construction
 *
 * The primary entry point for building grouped MCP tools. Consolidates
 * multiple related actions behind a single discriminator field, reducing
 * tool count and improving LLM routing accuracy.
 *
 * @example
 * ```typescript
 * import { createTool, success, error } from '@vinkius-core/mcp-fusion';
 * import { z } from 'zod';
 *
 * const projects = createTool<AppContext>('projects')
 *     .description('Manage workspace projects')
 *     .commonSchema(z.object({
 *         workspace_id: z.string().describe('Workspace identifier'),
 *     }))
 *     .action({
 *         name: 'list',
 *         readOnly: true,
 *         schema: z.object({ status: z.enum(['active', 'archived']).optional() }),
 *         handler: async (ctx, args) => {
 *             const projects = await ctx.db.projects.findMany({
 *                 where: { workspaceId: args.workspace_id, status: args.status },
 *             });
 *             return success(projects);
 *         },
 *     })
 *     .action({
 *         name: 'delete',
 *         destructive: true,
 *         schema: z.object({ project_id: z.string() }),
 *         handler: async (ctx, args) => {
 *             await ctx.db.projects.delete({ where: { id: args.project_id } });
 *             return success('Deleted');
 *         },
 *     });
 * ```
 *
 * @see {@link createTool} for the recommended factory function
 * @see {@link ToolRegistry} for registration and server attachment
 * @see {@link ActionGroupBuilder} for hierarchical group configuration
 *
 * @module
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { error } from '../response.js';
import {
    type ToolResponse,
    type ToolBuilder,
    type ActionMetadata,
    type InternalAction,
    type MiddlewareFn,
    type ActionConfig,
} from '../types.js';
import { type DebugObserverFn } from '../observability/DebugObserver.js';
import { type FusionTracer, SpanStatusCode } from '../observability/Tracing.js';
import { getActionRequiredFields } from '../schema/SchemaUtils.js';
import {
    parseDiscriminator, resolveAction, validateArgs, runChain,
    type ExecutionContext,
} from '../execution/ExecutionPipeline.js';
import { type ProgressSink } from '../execution/ProgressHelper.js';
import { compileToolDefinition } from './ToolDefinitionCompiler.js';
import {
    ActionGroupBuilder,
    type GroupConfigurator,
    mapConfigToActionFields,
} from './ActionGroupBuilder.js';

// ── Re-exports for Public API Compatibility ──────────────

export { ActionGroupBuilder } from './ActionGroupBuilder.js';
export type { GroupConfigurator } from './ActionGroupBuilder.js';

// ── Factory Function ─────────────────────────────────────

/**
 * Create a new grouped tool builder.
 *
 * This is the **recommended entry point** for building MCP tools.
 * Equivalent to `new GroupedToolBuilder<TContext>(name)` but more
 * concise and idiomatic.
 *
 * @typeParam TContext - Application context type passed to every handler.
 *   Use `void` (default) if your handlers don't need context.
 *
 * @param name - Tool name as it appears in the MCP `tools/list` response.
 *   Must be unique across all registered tools.
 *
 * @returns A new {@link GroupedToolBuilder} configured with the given name.
 *
 * @example
 * ```typescript
 * // Simple tool (no context)
 * const echo = createTool('echo')
 *     .action({
 *         name: 'say',
 *         schema: z.object({ message: z.string() }),
 *         handler: async (_ctx, args) => success(args.message),
 *     });
 *
 * // With application context
 * const users = createTool<AppContext>('users')
 *     .description('User management')
 *     .use(requireAuth)
 *     .action({
 *         name: 'list',
 *         readOnly: true,
 *         handler: async (ctx, _args) => success(await ctx.db.users.findMany()),
 *     });
 *
 * // With hierarchical groups
 * const platform = createTool<AppContext>('platform')
 *     .tags('core')
 *     .group('users', 'User management', g => {
 *         g.action({ name: 'list', readOnly: true, handler: listUsers });
 *     })
 *     .group('billing', 'Billing operations', g => {
 *         g.action({ name: 'refund', destructive: true, schema: refundSchema, handler: issueRefund });
 *     });
 * ```
 *
 * @see {@link GroupedToolBuilder} for the full builder API
 * @see {@link ToolRegistry.register} for tool registration
 */
export function createTool<TContext = void, TName extends string = string>(name: TName): GroupedToolBuilder<TContext, Record<string, never>, TName> {
    return new GroupedToolBuilder<TContext, Record<string, never>, TName>(name);
}

// ============================================================================
// GroupedToolBuilder
// ============================================================================

/**
 * Fluent builder for creating consolidated MCP tools.
 *
 * Groups multiple related operations behind a single discriminator field
 * (default: `"action"`), producing one MCP tool definition with a
 * union schema and auto-generated descriptions.
 *
 * @typeParam TContext - Application context passed to every handler
 * @typeParam TCommon - Shape of the common schema (inferred automatically)
 * @typeParam TName - Tool name literal (inferred by createTool)
 * @typeParam TRouterMap - Accumulated action entries for InferRouter (phantom type)
 *
 * @see {@link createTool} for the recommended factory function
 */
export class GroupedToolBuilder<TContext = void, TCommon extends Record<string, unknown> = Record<string, never>, TName extends string = string, TRouterMap extends Record<string, unknown> = Record<string, never>> implements ToolBuilder<TContext> {
    private readonly _name: string;
    private _description?: string;
    private _discriminator: string = 'action';
    private _annotations?: Record<string, unknown>;
    private _tags: string[] = [];
    private _commonSchema?: ZodObject<ZodRawShape>;
    private _middlewares: MiddlewareFn<TContext>[] = [];
    private _actions: InternalAction<TContext>[] = [];
    private _hasFlat = false;
    private _hasGroup = false;
    private _toonMode = false;
    private _frozen = false;
    private _debug?: DebugObserverFn;
    private _tracer?: FusionTracer;

    // Cached build result
    private _cachedTool?: McpTool;
    private _executionContext?: ExecutionContext<TContext>;

    constructor(name: string) {
        this._name = name;
    }

    // ── Configuration (fluent) ──────────────────────────

    /**
     * Set the discriminator field name.
     *
     * The discriminator is the field the LLM uses to select which action
     * to execute. Defaults to `"action"`.
     *
     * @param field - Field name for the discriminator enum
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * // Custom discriminator
     * const builder = createTool('projects')
     *     .discriminator('operation')
     *     .action({ name: 'list', handler: listProjects });
     * // LLM sends: { operation: 'list' }
     * ```
     *
     * @defaultValue `"action"`
     */
    discriminator(field: string): this {
        this._assertNotFrozen();
        this._discriminator = field;
        return this;
    }

    /**
     * Set the tool description.
     *
     * Appears as the first line in the auto-generated tool description
     * that the LLM sees.
     *
     * @param desc - Human-readable description of what this tool does
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool('projects')
     *     .description('Manage workspace projects')
     * ```
     */
    description(desc: string): this {
        this._assertNotFrozen();
        this._description = desc;
        return this;
    }

    /**
     * Set MCP tool annotations.
     *
     * Manual override for tool-level annotations. If not set,
     * annotations are automatically aggregated from per-action properties.
     *
     * @param a - Annotation key-value pairs
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool('admin')
     *     .annotations({ openWorldHint: true, returnDirect: false })
     * ```
     *
     * @see {@link https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations | MCP Tool Annotations}
     */
    annotations(a: Record<string, unknown>): this {
        this._assertNotFrozen();
        this._annotations = a;
        return this;
    }

    /**
     * Set capability tags for selective tool exposure.
     *
     * Tags control which tools the LLM sees via
     * {@link ToolRegistry.attachToServer}'s `filter` option.
     * Use tags to implement per-session context gating.
     *
     * @param tags - One or more string tags
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * const users = createTool<AppContext>('users').tags('core');
     * const admin = createTool<AppContext>('admin').tags('admin', 'internal');
     *
     * // Expose only 'core' tools to the LLM:
     * registry.attachToServer(server, { filter: { tags: ['core'] } });
     * ```
     *
     * @see {@link ToolRegistry.getTools} for filtered tool retrieval
     */
    tags(...tags: string[]): this {
        this._assertNotFrozen();
        this._tags = tags;
        return this;
    }

    /**
     * Set a common schema shared by all actions.
     *
     * Fields from this schema are injected into every action's input
     * and marked as `(always required)` in the auto-generated description.
     * The return type narrows to propagate types to all handlers.
     *
     * @typeParam TSchema - Zod object schema type (inferred)
     * @param schema - A `z.object()` defining shared fields
     * @returns A narrowed builder with `TCommon` set to `TSchema["_output"]`
     *
     * @example
     * ```typescript
     * createTool<AppContext>('projects')
     *     .commonSchema(z.object({
     *         workspace_id: z.string().describe('Workspace identifier'),
     *     }))
     *     .action({
     *         name: 'list',
     *         handler: async (ctx, args) => {
     *             // ✅ args.workspace_id is typed as string
     *             const projects = await ctx.db.projects.findMany({
     *                 where: { workspaceId: args.workspace_id },
     *             });
     *             return success(projects);
     *         },
     *     });
     * ```
     */
    commonSchema<TSchema extends ZodObject<ZodRawShape>>(
        schema: TSchema,
    ): GroupedToolBuilder<TContext, TSchema["_output"], TName, TRouterMap> {
        this._assertNotFrozen();
        this._commonSchema = schema;
        return this as unknown as GroupedToolBuilder<TContext, TSchema["_output"], TName, TRouterMap>;
    }

    /**
     * Enable TOON-formatted descriptions for token optimization.
     *
     * Uses TOON (Token-Oriented Object Notation) to encode action metadata
     * in a compact tabular format, reducing description token count by ~30-50%.
     *
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool('projects')
     *     .toonDescription()  // Compact descriptions
     *     .action({ name: 'list', handler: listProjects })
     * ```
     *
     * @see {@link toonSuccess} for TOON-encoded responses
     */
    toonDescription(): this {
        this._assertNotFrozen();
        this._toonMode = true;
        return this;
    }

    /**
     * Add middleware to the execution chain.
     *
     * Middleware runs in **registration order** (first registered = outermost).
     * Chains are pre-compiled at build time — zero runtime assembly cost.
     *
     * @param mw - Middleware function following the `next()` pattern
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * const requireAuth: MiddlewareFn<AppContext> = async (ctx, args, next) => {
     *     if (!ctx.user) return error('Unauthorized');
     *     return next();
     * };
     *
     * createTool<AppContext>('projects')
     *     .use(requireAuth)  // Runs on every action
     *     .action({ name: 'list', handler: listProjects });
     * ```
     *
     * @see {@link MiddlewareFn} for the middleware signature
     * @see {@link ActionGroupBuilder.use} for group-scoped middleware
     */
    use(mw: MiddlewareFn<TContext>): this {
        this._assertNotFrozen();
        this._middlewares.push(mw);
        return this;
    }

    // ── Action Registration ─────────────────────────────

    /**
     * Register a flat action.
     *
     * Flat actions use simple keys (e.g. `"list"`, `"create"`).
     * Cannot be mixed with `.group()` on the same builder.
     *
     * When a `schema` is provided, the handler args are fully typed as
     * `TSchema["_output"] & TCommon` — no type assertions needed.
     *
     * @param config - Action configuration
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool<AppContext>('projects')
     *     .action({
     *         name: 'list',
     *         description: 'List all projects',
     *         readOnly: true,
     *         schema: z.object({ status: z.enum(['active', 'archived']).optional() }),
     *         handler: async (ctx, args) => {
     *             // args: { status?: 'active' | 'archived' } — fully typed
     *             return success(await ctx.db.projects.findMany({ where: args }));
     *         },
     *     })
     *     .action({
     *         name: 'delete',
     *         destructive: true,
     *         schema: z.object({ id: z.string() }),
     *         handler: async (ctx, args) => {
     *             await ctx.db.projects.delete({ where: { id: args.id } });
     *             return success('Deleted');
     *         },
     *     });
     * ```
     *
     * @see {@link ActionConfig} for all configuration options
     * @see {@link GroupedToolBuilder.group} for hierarchical grouping
     */
    action<TActionName extends string, TSchema extends ZodObject<ZodRawShape>, TOmit extends keyof TCommon = never>(config: {
        name: TActionName;
        description?: string;
        schema: TSchema;
        destructive?: boolean;
        idempotent?: boolean;
        readOnly?: boolean;
        omitCommon?: TOmit[];
        handler: (ctx: TContext, args: TSchema["_output"] & Omit<TCommon, TOmit>) => Promise<ToolResponse>;
    }): GroupedToolBuilder<TContext, TCommon, TName, TRouterMap & { [K in `${TName}.${TActionName}`]: TSchema["_output"] & Omit<TCommon, TOmit> }>;
    /** Register a flat action (untyped: no schema, args default to Record<string, unknown>) */
    action<TActionName extends string>(config: ActionConfig<TContext> & { name: TActionName }): GroupedToolBuilder<TContext, TCommon, TName, TRouterMap & { [K in `${TName}.${TActionName}`]: TCommon extends Record<string, never> ? Record<string, unknown> : TCommon }>;
    action(config: ActionConfig<TContext>): GroupedToolBuilder<TContext, TCommon, TName, TRouterMap & Record<string, unknown>> {
        this._assertNotFrozen();
        if (this._hasGroup) {
            throw new Error(
                `Cannot use .action() and .group() on the same builder "${this._name}". ` +
                `Use .action() for flat tools OR .group() for hierarchical tools.`
            );
        }
        this._hasFlat = true;
        if (config.name.includes('.')) {
            throw new Error(
                `Action name "${config.name}" must not contain dots. ` +
                `The framework uses dots internally for group.action compound keys.`
            );
        }
        this._actions.push({
            key: config.name,
            groupName: undefined,
            groupDescription: undefined,
            ...mapConfigToActionFields(
                config,
                (config.omitCommon?.length ?? 0) > 0 ? config.omitCommon : undefined,
            ),
            middlewares: undefined,
        });
        return this;
    }

    /**
     * Register a group of actions under a namespace.
     *
     * Group actions use compound keys (e.g. `"users.create"`, `"billing.refund"`).
     * Cannot be mixed with `.action()` on the same builder.
     *
     * @param name - Group name (must not contain dots)
     * @param configure - Callback that receives an {@link ActionGroupBuilder}
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool<AppContext>('platform')
     *     .group('users', 'User management', g => {
     *         g.use(requireAdmin)  // Group-scoped middleware
     *          .action({ name: 'list', readOnly: true, handler: listUsers })
     *          .action({ name: 'ban', destructive: true, schema: banSchema, handler: banUser });
     *     })
     *     .group('billing', g => {
     *         g.action({ name: 'refund', destructive: true, schema: refundSchema, handler: issueRefund });
     *     });
     * // Discriminator enum: "users.list" | "users.ban" | "billing.refund"
     * ```
     *
     * @see {@link ActionGroupBuilder} for group-level configuration
     * @see {@link GroupedToolBuilder.action} for flat actions
     */
    group(name: string, configure: GroupConfigurator<TContext, TCommon>): this;
    group(name: string, description: string, configure: GroupConfigurator<TContext, TCommon>): this;
    group(
        name: string,
        descriptionOrConfigure: string | GroupConfigurator<TContext, TCommon>,
        maybeConfigure?: GroupConfigurator<TContext, TCommon>,
    ): this {
        this._assertNotFrozen();

        const description = typeof descriptionOrConfigure === 'string'
            ? descriptionOrConfigure
            : undefined;

        const configure = typeof descriptionOrConfigure === 'function'
            ? descriptionOrConfigure
            : maybeConfigure;

        if (!configure) {
            throw new Error(`Group "${name}" requires a configure callback.`);
        }

        if (this._hasFlat) {
            throw new Error(
                `Cannot use .group() and .action() on the same builder "${this._name}". ` +
                `Use .action() for flat tools OR .group() for hierarchical tools.`
            );
        }
        if (name.includes('.')) {
            throw new Error(`Group name "${name}" must not contain dots.`);
        }
        this._hasGroup = true;
        const groupBuilder = new ActionGroupBuilder<TContext, TCommon>(name, description);
        configure(groupBuilder);
        this._actions.push(...groupBuilder._actions);
        return this;
    }

    // ── Build (delegates to ToolDefinitionCompiler) ─────

    /**
     * Generate the MCP Tool definition.
     *
     * Compiles all actions into a single MCP tool with auto-generated
     * description, union schema, and aggregated annotations. Caches
     * the result and permanently freezes the builder.
     *
     * Called automatically by {@link execute} if not called explicitly.
     *
     * @returns The compiled MCP Tool object
     * @throws If no actions are registered
     *
     * @example
     * ```typescript
     * const tool = builder.buildToolDefinition();
     * console.log(tool.name);        // "projects"
     * console.log(tool.description); // Auto-generated
     * console.log(tool.inputSchema); // Union of all action schemas
     * ```
     */
    buildToolDefinition(): McpTool {
        if (this._cachedTool) return this._cachedTool;

        const result = compileToolDefinition({
            name: this._name,
            description: this._description,
            discriminator: this._discriminator,
            toonMode: this._toonMode,
            hasGroup: this._hasGroup,
            actions: this._actions,
            middlewares: this._middlewares,
            commonSchema: this._commonSchema,
            annotations: this._annotations,
        });

        this._cachedTool = result.tool;
        this._executionContext = result.executionContext;
        this._frozen = true;
        Object.freeze(this._actions);

        return result.tool;
    }

    // ── Debug (opt-in observability) ──────────────────────

    /**
     * Enable debug observability for this tool.
     *
     * When enabled, structured {@link DebugEvent} events are emitted at
     * each step of the execution pipeline.
     *
     * When disabled (the default), there is **zero runtime overhead** —
     * no conditionals, no timing, no object allocations in the hot path.
     *
     * @param observer - A {@link DebugObserverFn} created by `createDebugObserver()`
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * import { createTool, createDebugObserver, success } from '@vinkius-core/mcp-fusion';
     *
     * const debug = createDebugObserver();
     *
     * const tool = createTool<void>('users')
     *     .debug(debug)  // ← enable observability
     *     .action({ name: 'list', handler: async () => success([]) });
     * ```
     */
    debug(observer: DebugObserverFn): this {
        // No frozen check — debug is safe to attach after build
        this._debug = observer;
        return this;
    }

    /**
     * Enable OpenTelemetry-compatible tracing for this tool.
     *
     * When enabled, each `execute()` call creates a single span with
     * structured events for each pipeline step (`mcp.route`, `mcp.validate`,
     * `mcp.middleware`, `mcp.execute`).
     *
     * **Zero overhead** when disabled — the fast path has no conditionals.
     *
     * **OTel direct pass-through**: The `FusionTracer` interface is a
     * structural subtype of OTel's `Tracer`, so you can pass an OTel
     * tracer directly without any adapter:
     *
     * ```typescript
     * import { trace } from '@opentelemetry/api';
     *
     * const tool = createTool<AppContext>('projects')
     *     .tracing(trace.getTracer('mcp-fusion'))
     *     .action({ name: 'list', handler: listProjects });
     * ```
     *
     * **Error classification**:
     * - Validation failures → `SpanStatusCode.UNSET` + `mcp.error_type` attribute
     * - Handler exceptions → `SpanStatusCode.ERROR` + `recordException()`
     *
     * **Context propagation limitation**: Since MCP Fusion does not depend
     * on `@opentelemetry/api`, it cannot call `context.with(trace.setSpan(...))`.
     * Auto-instrumented downstream calls (Prisma, HTTP, Redis) inside handlers
     * will appear as siblings, not children, of the MCP span.
     *
     * @param tracer - A {@link FusionTracer} (or OTel `Tracer`) instance
     * @returns `this` for chaining
     *
     * @see {@link FusionTracer} for the interface contract
     * @see {@link SpanStatusCode} for status code semantics
     */
    tracing(tracer: FusionTracer): this {
        // No frozen check — tracing is safe to attach after build (like debug)
        this._tracer = tracer;
        return this;
    }

    // ── Execute (delegates to ExecutionPipeline) ────────

    /**
     * Route a tool call to the correct action handler.
     *
     * Pipeline: `parseDiscriminator → resolveAction → validateArgs → runChain`
     *
     * Auto-calls {@link buildToolDefinition} if not called yet.
     * If a debug observer is active, structured events are emitted
     * at each pipeline step with timing information.
     *
     * @param ctx - Application context
     * @param args - Raw arguments from the LLM (includes discriminator)
     * @param progressSink - Optional callback for streaming progress notifications.
     *   When attached via `attachToServer()`, this is automatically wired to
     *   MCP `notifications/progress`. When omitted, progress events are silently consumed.
     * @returns The handler's {@link ToolResponse}
     *
     * @example
     * ```typescript
     * // Direct execution (useful in tests)
     * const result = await builder.execute(ctx, {
     *     action: 'list',
     *     workspace_id: 'ws_123',
     * });
     * ```
     */
    async execute(ctx: TContext, args: Record<string, unknown>, progressSink?: ProgressSink): Promise<ToolResponse> {
        if (!this._executionContext) {
            this.buildToolDefinition();
        }
        const execCtx = this._executionContext;
        if (!execCtx) {
            return error(`Builder "${this._name}" failed to initialize.`);
        }

        // Path 1: Tracing — full span hierarchy (enterprise)
        if (this._tracer) {
            return this._executeTraced(execCtx, ctx, args, progressSink);
        }

        // Path 2: Debug — lightweight event emission (backward compat)
        if (this._debug) {
            return this._executeDebug(execCtx, ctx, args, progressSink);
        }

        // Path 3: Fast — zero overhead (no observability)
        return this._executeFast(execCtx, ctx, args, progressSink);
    }

    // ── Execution Paths (private) ────────────────────────

    /** Fast path: zero overhead — no conditionals, no timing, no allocations. */
    private async _executeFast(
        execCtx: ExecutionContext<TContext>,
        ctx: TContext,
        args: Record<string, unknown>,
        progressSink?: ProgressSink,
    ): Promise<ToolResponse> {
        const disc = parseDiscriminator(execCtx, args);
        if (!disc.ok) return disc.response;

        const resolved = resolveAction(execCtx, disc.value);
        if (!resolved.ok) return resolved.response;

        const validated = validateArgs(execCtx, resolved.value, args);
        if (!validated.ok) return validated.response;

        return runChain(execCtx, resolved.value, ctx, validated.value, progressSink);
    }

    /** Debug path: emit structured DebugEvent at each step (unchanged from pre-tracing). */
    private async _executeDebug(
        execCtx: ExecutionContext<TContext>,
        ctx: TContext,
        args: Record<string, unknown>,
        progressSink?: ProgressSink,
    ): Promise<ToolResponse> {
        const debug = this._debug!;
        const startTime = performance.now();

        // Step 1: Route
        const disc = parseDiscriminator(execCtx, args);
        if (!disc.ok) {
            debug({ type: 'error', tool: this._name, action: '?', error: 'Missing discriminator', step: 'route', timestamp: Date.now() });
            return disc.response;
        }
        const actionName = disc.value;
        debug({ type: 'route', tool: this._name, action: actionName, timestamp: Date.now() });

        // Step 2: Resolve
        const resolved = resolveAction(execCtx, actionName);
        if (!resolved.ok) {
            debug({ type: 'error', tool: this._name, action: actionName, error: `Unknown action "${actionName}"`, step: 'route', timestamp: Date.now() });
            return resolved.response;
        }

        // Step 3: Validate
        const validateStart = performance.now();
        const validated = validateArgs(execCtx, resolved.value, args);
        const validateDuration = performance.now() - validateStart;

        if (!validated.ok) {
            debug({ type: 'validate', tool: this._name, action: actionName, valid: false, error: 'Validation failed', durationMs: validateDuration, timestamp: Date.now() });
            return validated.response;
        }
        debug({ type: 'validate', tool: this._name, action: actionName, valid: true, durationMs: validateDuration, timestamp: Date.now() });

        // Step 4: Middleware chain info (global + action-level)
        const actionMwCount = resolved.value.action.middlewares?.length ?? 0;
        const globalMwCount = this._middlewares.length;
        const chainLength = globalMwCount + actionMwCount;
        if (chainLength > 0) {
            debug({ type: 'middleware', tool: this._name, action: actionName, chainLength, timestamp: Date.now() });
        }

        // Step 5: Execute
        try {
            const response = await runChain(execCtx, resolved.value, ctx, validated.value, progressSink);
            const totalDuration = performance.now() - startTime;
            const isErr = response.isError === true;
            debug({ type: 'execute', tool: this._name, action: actionName, durationMs: totalDuration, isError: isErr, timestamp: Date.now() });
            return response;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            debug({ type: 'error', tool: this._name, action: actionName, error: message, step: 'execute', timestamp: Date.now() });
            throw err;
        }
    }

    /**
     * Traced path: OpenTelemetry-compatible span creation.
     *
     * Creates ONE span per tool call with events for pipeline steps.
     * Uses `finally` for leak-proof span closure.
     * AI errors → UNSET, system errors → ERROR.
     */
    private async _executeTraced(
        execCtx: ExecutionContext<TContext>,
        ctx: TContext,
        args: Record<string, unknown>,
        progressSink?: ProgressSink,
    ): Promise<ToolResponse> {
        const tracer = this._tracer!;
        const startAttrs: Record<string, string | number | boolean | ReadonlyArray<string>> = {
            'mcp.system': 'fusion',
            'mcp.tool': this._name,
        };
        if (this._tags.length > 0) startAttrs['mcp.tags'] = this._tags;
        if (this._description) startAttrs['mcp.description'] = this._description;

        const span = tracer.startSpan(`mcp.tool.${this._name}`, { attributes: startAttrs });
        const startTime = performance.now();
        let statusCode: number = SpanStatusCode.UNSET;
        let statusMessage: string | undefined;
        let response: ToolResponse | undefined;

        try {
            // Route
            const disc = parseDiscriminator(execCtx, args);
            if (!disc.ok) {
                span.setAttribute('mcp.error_type', 'missing_discriminator');
                span.setAttribute('mcp.isError', true);
                return (response = disc.response);
            }
            span.setAttribute('mcp.action', disc.value);
            span.addEvent?.('mcp.route');

            // Resolve
            const resolved = resolveAction(execCtx, disc.value);
            if (!resolved.ok) {
                span.setAttribute('mcp.error_type', 'unknown_action');
                span.setAttribute('mcp.isError', true);
                return (response = resolved.response);
            }

            // Validate
            const validateStart = performance.now();
            const validated = validateArgs(execCtx, resolved.value, args);
            const validateMs = performance.now() - validateStart;

            if (!validated.ok) {
                span.setAttribute('mcp.error_type', 'validation_failed');
                span.setAttribute('mcp.isError', true);
                span.addEvent?.('mcp.validate', { 'mcp.valid': false, 'mcp.durationMs': validateMs });
                return (response = validated.response);
            }
            span.addEvent?.('mcp.validate', { 'mcp.valid': true, 'mcp.durationMs': validateMs });

            // Middleware info
            const actionMwCount = resolved.value.action.middlewares?.length ?? 0;
            const globalMwCount = this._middlewares.length;
            const chainLength = globalMwCount + actionMwCount;
            if (chainLength > 0) {
                span.addEvent?.('mcp.middleware', { 'mcp.chainLength': chainLength });
            }

            // Execute — rethrow=true so handler exceptions propagate to our catch block
            response = await runChain(execCtx, resolved.value, ctx, validated.value, progressSink, true);
            const isErr = response.isError === true;

            // AI error (handler returned error()) → UNSET, not ERROR
            statusCode = isErr ? SpanStatusCode.UNSET : SpanStatusCode.OK;
            if (isErr) span.setAttribute('mcp.error_type', 'handler_returned_error');
            span.setAttribute('mcp.isError', isErr);
            return response;
        } catch (err) {
            // System failure — THIS is a real SpanStatusCode.ERROR
            const message = err instanceof Error ? err.message : String(err);
            span.recordException(err instanceof Error ? err : message);
            span.setAttribute('mcp.error_type', 'system_error');
            span.setAttribute('mcp.isError', true);
            statusCode = SpanStatusCode.ERROR;
            statusMessage = message;
            // Return graceful error response — don't throw (would crash MCP server)
            return (response = error(`[${this._name}] ${message}`));
        } finally {
            span.setAttribute('mcp.durationMs', performance.now() - startTime);
            if (response) {
                // Response size in bytes — useful for billing/quota dashboards
                let size = 0;
                for (const c of response.content) {
                    if ('text' in c && typeof c.text === 'string') size += c.text.length;
                }
                span.setAttribute('mcp.response_size', size);
            }
            span.setStatus(statusMessage !== undefined ? { code: statusCode, message: statusMessage } : { code: statusCode });
            span.end(); // leak-proof: always called
        }
    }

    // ── Introspection ───────────────────────────────────

    /** Get the tool name. */
    getName(): string { return this._name; }

    /** Get a copy of the capability tags. */
    getTags(): string[] { return [...this._tags]; }

    /** Get all registered action keys (e.g. `["list", "create"]` or `["users.list", "users.ban"]`). */
    getActionNames(): string[] { return this._actions.map(a => a.key); }

    /**
     * Preview the exact MCP protocol payload that the LLM will receive.
     *
     * Builds the tool definition if not already built, then renders
     * a human-readable preview of the complete tool including:
     * - Tool name and description
     * - Input schema (JSON)
     * - Annotations (if any)
     * - Approximate token count (~4 chars per token, GPT-5.2 heuristic)
     *
     * Call this from your dev environment to optimize token usage
     * and verify the LLM-facing prompt without starting an MCP server.
     *
     * @returns Formatted string showing the exact MCP payload + token estimate
     *
     * @example
     * ```typescript
     * const projects = defineTool<AppContext>('projects', { ... });
     * console.log(projects.previewPrompt());
     *
     * // Output:
     * // ┌─────────────────────────────────────────┐
     * // │  MCP Tool Preview: projects              │
     * // ├─────────────────────────────────────────┤
     * // │  Name: projects                          │
     * // │  Actions: 3 (list, create, delete)       │
     * // │  Tags: api, admin                        │
     * // ├─── Description ─────────────────────────┤
     * // │  Manage workspace projects. ...          │
     * // ├─── Input Schema ────────────────────────┤
     * // │  { "type": "object", ...  }              │
     * // ├─── Annotations ─────────────────────────┤
     * // │  readOnlyHint: false                     │
     * // │  destructiveHint: true                   │
     * // ├─── Token Estimate ──────────────────────┤
     * // │  ~342 tokens (1,368 chars)               │
     * // └─────────────────────────────────────────┘
     * ```
     *
     * @see {@link buildToolDefinition} for the raw MCP Tool object
     */
    previewPrompt(): string {
        const tool = this.buildToolDefinition();

        const schemaJson = JSON.stringify(tool.inputSchema, null, 2);
        const annotations = (tool as { annotations?: Record<string, unknown> }).annotations;
        const annotationsJson = annotations
            ? JSON.stringify(annotations, null, 2)
            : undefined;

        // Calculate total char payload (what the MCP protocol transmits)
        const payloadParts = [
            tool.name,
            tool.description ?? '',
            schemaJson,
            annotationsJson ?? '',
        ];
        const totalChars = payloadParts.reduce((sum, part) => sum + part.length, 0);

        // GPT-5.2 heuristic: ~4 characters per token for English/code
        const estimatedTokens = Math.ceil(totalChars / 4);

        const W = 56;
        const divider = '─'.repeat(W);
        const line = (label: string, value: string): string =>
            `│  ${label}: ${value}`;

        const actionKeys = this._actions.map(a => a.key);
        const lines: string[] = [
            `┌${'─'.repeat(W)}┐`,
            `│  MCP Tool Preview: ${this._name}`,
            `├─── Summary ${'─'.repeat(W - 12)}┤`,
            line('Name', tool.name),
            line('Actions', `${actionKeys.length} (${actionKeys.join(', ')})`),
        ];

        if (this._tags.length > 0) {
            lines.push(line('Tags', this._tags.join(', ')));
        }

        lines.push(
            `├─── Description ${divider.slice(17)}┤`,
            `│  ${tool.description ?? '(none)'}`.split('\n').join('\n│  '),
            `├─── Input Schema ${divider.slice(18)}┤`,
            schemaJson.split('\n').map(l => `│  ${l}`).join('\n'),
        );

        if (annotationsJson) {
            lines.push(
                `├─── Annotations ${divider.slice(17)}┤`,
                annotationsJson.split('\n').map(l => `│  ${l}`).join('\n'),
            );
        }

        lines.push(
            `├─── Token Estimate ${divider.slice(20)}┤`,
            `│  ~${estimatedTokens} tokens (${totalChars.toLocaleString()} chars)`,
            `└${divider}┘`,
        );

        return lines.join('\n');
    }

    /**
     * Get metadata for all registered actions.
     *
     * Useful for programmatic documentation, compliance audits,
     * dashboard generation, or runtime observability.
     *
     * @returns Array of {@link ActionMetadata} objects
     *
     * @example
     * ```typescript
     * const meta = builder.getActionMetadata();
     * for (const action of meta) {
     *     console.log(`${action.key}: destructive=${action.destructive}, fields=${action.requiredFields}`);
     * }
     * ```
     *
     * @see {@link ActionMetadata} for the metadata shape
     */
    getActionMetadata(): ActionMetadata[] {
        return this._actions.map(a => {
            const presenter = a.returns;
            return {
                key: a.key,
                actionName: a.actionName,
                groupName: a.groupName,
                description: a.description,
                destructive: a.destructive ?? false,
                idempotent: a.idempotent ?? false,
                readOnly: a.readOnly ?? false,
                requiredFields: getActionRequiredFields(a),
                hasMiddleware: (a.middlewares?.length ?? 0) > 0,
                // Presenter metadata (introspection)
                presenterName: presenter?.name,
                presenterSchemaKeys: presenter?.getSchemaKeys(),
                presenterUiBlockTypes: presenter?.getUiBlockTypes(),
                presenterHasContextualRules: presenter?.hasContextualRules(),
            };
        });
    }

    // ── Private ─────────────────────────────────────────

    private _assertNotFrozen(): void {
        if (this._frozen) {
            throw new Error(
                `Builder "${this._name}" is frozen after buildToolDefinition(). ` +
                `Cannot modify a built tool.`
            );
        }
    }
}
