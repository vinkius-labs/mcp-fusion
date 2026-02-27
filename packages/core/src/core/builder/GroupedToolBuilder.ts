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
import { error, toolError } from '../response.js';
import {
    type ToolResponse,
    type ToolBuilder,
    type ActionMetadata,
    type InternalAction,
    type MiddlewareFn,
    type ActionConfig,
    type StateSyncHint,
} from '../types.js';
import { type DebugObserverFn } from '../../observability/DebugObserver.js';
import { type FusionTracer, SpanStatusCode } from '../../observability/Tracing.js';
import { getActionRequiredFields } from '../schema/SchemaUtils.js';
import {
    parseDiscriminator, resolveAction, validateArgs, runChain,
    type ExecutionContext,
} from '../execution/ExecutionPipeline.js';
import { type ProgressSink } from '../execution/ProgressHelper.js';
import { ConcurrencyGuard, type ConcurrencyConfig } from '../execution/ConcurrencyGuard.js';
import { applyEgressGuard } from '../execution/EgressGuard.js';
import { MutationSerializer } from '../execution/MutationSerializer.js';
import { computeResponseSize, type PipelineHooks } from '../execution/PipelineHooks.js';
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
    private _selectEnabled = false;
    private _frozen = false;
    private _debug?: DebugObserverFn;
    private _tracer?: FusionTracer;
    private _concurrencyGuard?: ConcurrencyGuard;
    private _egressMaxBytes?: number;
    private _mutationSerializer?: MutationSerializer;
    private readonly _stateSyncHints = new Map<string, StateSyncHint>();

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

    // ── State Sync (Fluent) ──────────────────────────────

    /**
     * Declare glob patterns invalidated when this tool succeeds.
     *
     * Eliminates manual `stateSync.policies` configuration —
     * the framework auto-collects hints from all builders.
     *
     * @param patterns - Glob patterns (e.g. `'sprints.*'`, `'tasks.*'`)
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool('tasks')
     *     .invalidates('tasks.*', 'sprints.*')
     *     .action({ name: 'update', handler: updateTask });
     * ```
     *
     * @see {@link StateSyncConfig} for centralized configuration
     */
    invalidates(...patterns: string[]): this {
        this._assertNotFrozen();
        // Store under tool-level key '*' — applies to all actions
        const existing = this._stateSyncHints.get('*');
        this._stateSyncHints.set('*', {
            ...existing,
            invalidates: [...(existing?.invalidates ?? []), ...patterns],
        });
        return this;
    }

    /**
     * Mark this tool's data as immutable (safe to cache forever).
     *
     * Use for reference data: countries, currencies, ICD-10 codes.
     * Equivalent to `cacheControl: 'immutable'` in manual policies.
     *
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool('countries')
     *     .cached()
     *     .action({ name: 'list', readOnly: true, handler: listCountries });
     * ```
     */
    cached(): this {
        return this._setCacheDirective('immutable');
    }

    /**
     * Mark this tool's data as volatile (never cache).
     *
     * Equivalent to `cacheControl: 'no-store'` in manual policies.
     * Use for dynamic data that changes frequently.
     *
     * @returns `this` for chaining
     */
    stale(): this {
        return this._setCacheDirective('no-store');
    }

    /** @internal */
    private _setCacheDirective(directive: 'immutable' | 'no-store'): this {
        this._assertNotFrozen();
        const existing = this._stateSyncHints.get('*');
        this._stateSyncHints.set('*', { ...existing, cacheControl: directive });
        return this;
    }

    /**
     * Enable `_select` reflection for context window optimization.
     *
     * When enabled, actions that use a Presenter with a Zod schema
     * expose an optional `_select` parameter in the input schema.
     * The AI can send `_select: ['status', 'amount']` to receive
     * only the specified top-level fields in the data payload,
     * reducing context window usage without developer effort.
     *
     * **Disabled by default** — opt-in to avoid changing existing
     * tool schemas.
     *
     * **Late Guillotine**: UI blocks, system rules, and action
     * suggestions are always computed with the **full** validated
     * data. Only the wire-facing data block is filtered.
     *
     * **Shallow (top-level only)**: Nested objects are returned
     * whole. If the AI selects `'user'`, it gets the entire `user`
     * object. No recursive GraphQL-style traversal.
     *
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool<AppContext>('invoices')
     *     .enableSelect()  // Expose _select in input schema
     *     .action({
     *         name: 'get',
     *         returns: InvoicePresenter,
     *         handler: async (ctx, args) => ctx.db.invoices.findUnique(args.id),
     *     });
     * // AI sends: { action: 'get', id: '123', _select: ['status'] }
     * // Returns: { status: 'paid' } instead of full invoice
     * ```
     *
     * @see {@link Presenter.getSchemaKeys} for introspection
     */
    enableSelect(): this {
        this._assertNotFrozen();
        this._selectEnabled = true;
        return this;
    }

    /**
     * Set concurrency limits for this tool (Semaphore + Queue pattern).
     *
     * Prevents thundering-herd scenarios where the LLM fires N
     * concurrent calls in the same millisecond. Implements a
     * semaphore with backpressure queue and load shedding.
     *
     * When all active slots are occupied, new calls enter the queue.
     * When the queue is full, calls are immediately rejected with
     * a self-healing `SERVER_BUSY` error.
     *
     * **MCP Spec Compliance**: The MCP specification requires servers
     * to rate-limit tool invocations. This method fulfills that requirement.
     *
     * **Zero overhead** when not configured — no semaphore exists.
     *
     * @param config - Concurrency configuration
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool<AppContext>('billing')
     *     .concurrency({ maxActive: 5, maxQueue: 20 })
     *     .action({ name: 'process_invoice', handler: processInvoice });
     * // 5 concurrent executions, 20 queued, rest rejected
     * ```
     *
     * @see {@link ConcurrencyConfig} for configuration options
     */
    concurrency(config: ConcurrencyConfig): this {
        this._assertNotFrozen();
        this._concurrencyGuard = new ConcurrencyGuard(config);
        return this;
    }

    /**
     * Set maximum payload size for tool responses (Egress Guard).
     *
     * Prevents oversized responses from crashing the Node process
     * with OOM or overflowing the LLM context window.
     *
     * When a response exceeds the limit, the text content is truncated
     * and a system intervention message is injected, forcing the LLM
     * to use pagination or filters.
     *
     * This is a **brute-force safety net**. For domain-aware truncation
     * with guidance, use Presenter `.agentLimit()` instead.
     *
     * **Zero overhead** when not configured.
     *
     * @param bytes - Maximum payload size in bytes
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * createTool<AppContext>('logs')
     *     .maxPayloadBytes(2 * 1024 * 1024) // 2MB
     *     .action({ name: 'search', handler: searchLogs });
     * ```
     *
     * @see {@link Presenter.agentLimit} for domain-level truncation
     */
    maxPayloadBytes(bytes: number): this {
        this._assertNotFrozen();
        this._egressMaxBytes = Math.max(1024, Math.floor(bytes));
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
            selectEnabled: this._selectEnabled,
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

        // Auto-create MutationSerializer if any action is destructive.
        // Converts `destructive: true` from a manifest hint into a
        // transactional isolation guarantee — concurrent mutations to
        // the same action key are serialized in FIFO order.
        if (this._actions.some(a => a.destructive === true)) {
            this._mutationSerializer = new MutationSerializer();
        }

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
     * @param signal - Optional AbortSignal from the MCP SDK protocol layer.
     *   Fired when the client sends `notifications/cancelled` or the connection drops.
     *   The framework checks this signal before handler execution and during
     *   generator iteration, aborting zombie operations immediately.
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
    async execute(ctx: TContext, args: Record<string, unknown>, progressSink?: ProgressSink, signal?: AbortSignal): Promise<ToolResponse> {
        if (!this._executionContext) {
            this.buildToolDefinition();
        }
        const execCtx = this._executionContext;
        if (!execCtx) {
            return error(`Builder "${this._name}" failed to initialize.`);
        }

        // ── Concurrency Gate (Semaphore + Queue) ──────────────────
        // Acquire a slot BEFORE entering the pipeline.
        // If acquire() returns null, load shedding kicks in.
        let release: (() => void) | undefined;
        if (this._concurrencyGuard) {
            const result = this._concurrencyGuard.acquire(signal);
            if (result === null) {
                // Load shedding: all slots occupied + queue full
                return toolError('SERVER_BUSY', {
                    message: `Tool "${this._name}" is at capacity (${this._concurrencyGuard.active} active, ${this._concurrencyGuard.queued} queued). Retry after a short delay.`,
                    suggestion: 'Reduce the number of concurrent calls to this tool. Send requests sequentially or in smaller batches.',
                });
            }
            try {
                release = await result;
            } catch {
                // Waiter was cancelled while queued (AbortSignal)
                return error(`[${this._name}] Request cancelled while waiting for execution slot.`);
            }
        }

        try {
            const response = await this._executeWithObservability(execCtx, ctx, args, progressSink, signal);

            // ── Egress Guard (Payload Size Limiter) ──────
            if (this._egressMaxBytes) {
                return applyEgressGuard(response, this._egressMaxBytes);
            }
            return response;
        } finally {
            release?.();
        }
    }

    /**
     * Internal: execute with the appropriate observability path.
     * Extracted to keep the concurrency/egress guards clean.
     */
    private async _executeWithObservability(
        execCtx: ExecutionContext<TContext>,
        ctx: TContext,
        args: Record<string, unknown>,
        progressSink?: ProgressSink,
        signal?: AbortSignal,
    ): Promise<ToolResponse> {
        // Traced path: wrap in try/catch for system error → graceful response
        if (this._tracer) {
            const hooks = this._buildTracedHooks();
            try {
                return await this._executePipeline(execCtx, ctx, args, progressSink, hooks, signal);
            } catch (err) {
                // System failure caught here — hooks already recorded it on the span
                const message = err instanceof Error ? err.message : String(err);
                const response = error(`[${this._name}] ${message}`);
                hooks.wrapResponse!(response); // finalize span
                return response;
            }
        }

        // Debug path: hooks with event emission
        if (this._debug) {
            return this._executePipeline(execCtx, ctx, args, progressSink, this._buildDebugHooks(), signal);
        }

        // Fast path: zero overhead (no hooks)
        return this._executePipeline(execCtx, ctx, args, progressSink, undefined, signal);
    }

    // ── Execution Paths (private) ────────────────────────

    /**
     * Pipeline hooks for observability instrumentation.
     *
     * Each hook is called at the corresponding pipeline step.
     * The fast path passes `undefined` (zero overhead).
     * Debug and traced paths supply their hooks via factory methods.
     */
    private async _executePipeline(
        execCtx: ExecutionContext<TContext>,
        ctx: TContext,
        args: Record<string, unknown>,
        progressSink?: ProgressSink,
        hooks?: PipelineHooks,
        signal?: AbortSignal,
    ): Promise<ToolResponse> {
        // Step 1: Route
        const disc = parseDiscriminator(execCtx, args);
        if (!disc.ok) {
            hooks?.onRouteError?.();
            return hooks?.wrapResponse?.(disc.response) ?? disc.response;
        }
        const actionName = disc.value;
        hooks?.onRouteOk?.(actionName);

        // Step 2: Resolve
        const resolved = resolveAction(execCtx, actionName);
        if (!resolved.ok) {
            hooks?.onResolveError?.(actionName);
            return hooks?.wrapResponse?.(resolved.response) ?? resolved.response;
        }

        // Step 3: Validate
        const validateStart = performance.now();
        const validationResult = validateArgs(execCtx, resolved.value, args);
        const validateMs = performance.now() - validateStart;

        if (!validationResult.ok) {
            hooks?.onValidateError?.(actionName, validateMs);
            return hooks?.wrapResponse?.(validationResult.response) ?? validationResult.response;
        }
        hooks?.onValidateOk?.(actionName, validateMs);

        const { validated, selectFields } = validationResult.value;

        // Step 4: Middleware info
        const actionMwCount = resolved.value.action.middlewares?.length ?? 0;
        const globalMwCount = this._middlewares.length;
        const chainLength = globalMwCount + actionMwCount;
        if (chainLength > 0) {
            hooks?.onMiddleware?.(actionName, chainLength);
        }

        // Step 5: Execute
        // If the action is destructive and a MutationSerializer exists,
        // wrap the execution in a per-key mutex to prevent concurrent
        // mutations (LLM hallucination anti-race-condition guard).
        //
        // _select is forwarded only when enableSelect() was called.
        const effectiveSelect = this._selectEnabled ? selectFields : undefined;
        const executeChain = () => runChain(
            execCtx, resolved.value, ctx, validated,
            progressSink, hooks?.rethrow, signal, effectiveSelect,
        );

        try {
            const isDestructive = resolved.value.action.destructive === true;
            const response = (isDestructive && this._mutationSerializer)
                ? await this._mutationSerializer.serialize(actionName, executeChain, signal)
                : await executeChain();

            hooks?.onExecuteOk?.(actionName, response);
            return hooks?.wrapResponse?.(response) ?? response;
        } catch (err) {
            hooks?.onExecuteError?.(actionName, err);
            if (hooks?.rethrow) throw err;
            // Convert MutationSerializer abort (or unexpected throws) to error response
            const message = err instanceof Error ? err.message : String(err);
            const response = error(`[${execCtx.toolName}/${actionName}] ${message}`);
            return hooks?.wrapResponse?.(response) ?? response;
        }
    }

    /**
     * Build debug hooks: lightweight event emission.
     */
    private _buildDebugHooks(): PipelineHooks {
        const debug = this._debug!;
        const toolName = this._name;
        const startTime = performance.now();

        return {
            onRouteError: () => {
                debug({ type: 'error', tool: toolName, action: '?', error: 'Missing discriminator', step: 'route', timestamp: Date.now() });
            },
            onRouteOk: (action) => {
                debug({ type: 'route', tool: toolName, action, timestamp: Date.now() });
            },
            onResolveError: (action) => {
                debug({ type: 'error', tool: toolName, action, error: `Unknown action "${action}"`, step: 'route', timestamp: Date.now() });
            },
            onValidateError: (action, durationMs) => {
                debug({ type: 'validate', tool: toolName, action, valid: false, error: 'Validation failed', durationMs, timestamp: Date.now() });
            },
            onValidateOk: (action, durationMs) => {
                debug({ type: 'validate', tool: toolName, action, valid: true, durationMs, timestamp: Date.now() });
            },
            onMiddleware: (action, chainLength) => {
                debug({ type: 'middleware', tool: toolName, action, chainLength, timestamp: Date.now() });
            },
            onExecuteOk: (action, response) => {
                const isErr = response.isError === true;
                debug({ type: 'execute', tool: toolName, action, durationMs: performance.now() - startTime, isError: isErr, timestamp: Date.now() });
            },
            onExecuteError: (action, err) => {
                const message = err instanceof Error ? err.message : String(err);
                debug({ type: 'error', tool: toolName, action, error: message, step: 'execute', timestamp: Date.now() });
            },
        };
    }

    /**
     * Build traced hooks: OpenTelemetry-compatible span creation.
     *
     * Creates ONE span per tool call with events for pipeline steps.
     * Uses wrapResponse for leak-proof span closure.
     * AI errors → UNSET, system errors → ERROR.
     */
    private _buildTracedHooks(): PipelineHooks {
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

        const finalizeSpan = (response?: ToolResponse) => {
            span.setAttribute('mcp.durationMs', performance.now() - startTime);
            if (response) {
                span.setAttribute('mcp.response_size', computeResponseSize(response));
            }
            span.setStatus(
                statusMessage !== undefined
                    ? { code: statusCode, message: statusMessage }
                    : { code: statusCode },
            );
            span.end();
        };

        return {
            rethrow: true,
            onRouteError: () => {
                span.setAttribute('mcp.error_type', 'missing_discriminator');
                span.setAttribute('mcp.isError', true);
            },
            onRouteOk: (action) => {
                span.setAttribute('mcp.action', action);
                span.addEvent?.('mcp.route');
            },
            onResolveError: () => {
                span.setAttribute('mcp.error_type', 'unknown_action');
                span.setAttribute('mcp.isError', true);
            },
            onValidateError: (_action, durationMs) => {
                span.setAttribute('mcp.error_type', 'validation_failed');
                span.setAttribute('mcp.isError', true);
                span.addEvent?.('mcp.validate', { 'mcp.valid': false, 'mcp.durationMs': durationMs });
            },
            onValidateOk: (_action, durationMs) => {
                span.addEvent?.('mcp.validate', { 'mcp.valid': true, 'mcp.durationMs': durationMs });
            },
            onMiddleware: (_action, chainLength) => {
                span.addEvent?.('mcp.middleware', { 'mcp.chainLength': chainLength });
            },
            onExecuteOk: (_action, response) => {
                const isErr = response.isError === true;
                statusCode = isErr ? SpanStatusCode.UNSET : SpanStatusCode.OK;
                if (isErr) span.setAttribute('mcp.error_type', 'handler_returned_error');
                span.setAttribute('mcp.isError', isErr);
            },
            onExecuteError: (_action, err) => {
                const message = err instanceof Error ? err.message : String(err);
                span.recordException(err instanceof Error ? err : message);
                span.setAttribute('mcp.error_type', 'system_error');
                span.setAttribute('mcp.isError', true);
                statusCode = SpanStatusCode.ERROR;
                statusMessage = message;
            },
            wrapResponse: (response) => {
                finalizeSpan(response);
                return response;
            },
        };
    }

    // ── Introspection ───────────────────────────────────

    /** Get the tool name. */
    getName(): string { return this._name; }

    /** Get a copy of the capability tags. */
    getTags(): string[] { return [...this._tags]; }

    /** Get all registered action keys (e.g. `["list", "create"]` or `["users.list", "users.ban"]`). */
    getActionNames(): string[] { return this._actions.map(a => a.key); }

    // ── AST Reflection (Exposition Compiler) ─────────────

    /** Get the discriminator field name (e.g. `"action"`). Used by the Exposition Compiler. */
    getDiscriminator(): string { return this._discriminator; }

    /**
     * Get all registered internal actions.
     * Used by the Exposition Compiler for atomic tool expansion.
     * @returns Read-only array of internal action definitions
     */
    getActions(): readonly InternalAction<TContext>[] { return this._actions; }

    /**
     * Get the common schema shared across all actions.
     * Used by the Exposition Compiler for schema purification.
     * @returns The common Zod schema, or undefined if not set
     */
    getCommonSchema(): ZodObject<ZodRawShape> | undefined { return this._commonSchema; }

    /** Check if `_select` reflection is enabled. Used by the Exposition Compiler. */
    getSelectEnabled(): boolean { return this._selectEnabled; }

    /** Get per-action state sync hints for auto-policy generation. */
    getStateSyncHints(): ReadonlyMap<string, StateSyncHint> { return this._stateSyncHints; }

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
