/**
 * Framework Contracts & Shared Types
 *
 * Single-file type definitions following the consolidated contracts pattern.
 * All interfaces, type aliases, and shared contracts live here.
 *
 * This module has ZERO runtime code — only type declarations.
 * It may be imported by any module without circular dependency risk.
 *
 * @module
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ZodObject, type ZodRawShape } from 'zod';
import { type Presenter } from '../presenter/Presenter.js';
import { type ProgressSink } from './execution/ProgressHelper.js';

// ── Re-export from canonical source ──────────────────────

export type { ToolResponse } from './response.js';
import { type ToolResponse } from './response.js';

// ── Builder Contract (DIP) ───────────────────────────────

/**
 * Interface that all tool builders must implement.
 *
 * This is the abstraction that {@link ToolRegistry} depends on,
 * following the Dependency Inversion Principle. You can create
 * custom builders by implementing this interface.
 *
 * @typeParam TContext - Application context passed to every handler
 *
 * @example
 * ```typescript
 * // The built-in GroupedToolBuilder implements this interface:
 * const builder: ToolBuilder<AppContext> = new GroupedToolBuilder<AppContext>('projects');
 *
 * // Register with the registry:
 * const registry = new ToolRegistry<AppContext>();
 * registry.register(builder);
 * ```
 *
 * @see {@link GroupedToolBuilder} for the default implementation
 * @see {@link ToolRegistry} for registration and routing
 */
export interface ToolBuilder<TContext = void> {
    /** Get the tool name (used as the registration key) */
    getName(): string;

    /** Get the capability tags for selective exposure */
    getTags(): string[];

    /** Get all registered action keys */
    getActionNames(): string[];

    /** Get metadata for all registered actions */
    getActionMetadata(): ActionMetadata[];

    /** Build and return the MCP Tool definition. May cache internally. */
    buildToolDefinition(): McpTool;

    /** Execute a tool call with the given context and arguments */
    execute(ctx: TContext, args: Record<string, unknown>, progressSink?: ProgressSink, signal?: AbortSignal): Promise<ToolResponse>;

    /**
     * Preview the exact MCP prompt payload that the LLM will receive.
     *
     * Returns a formatted string showing the compiled tool definition
     * (name, description, input schema, annotations) with approximate
     * token count. Auto-calls buildToolDefinition() if needed.
     *
     * Use this to optimize token usage and verify LLM-facing grammar
     * without starting an MCP server.
     */
    previewPrompt(): string;

    // ── AST Reflection (optional, used by ExpositionCompiler) ──

    /** Get all registered internal actions. Used by Exposition Compiler for atomic tool expansion. */
    getActions?(): readonly InternalAction<TContext>[];
    /** Get the discriminator field name (e.g. `"action"`). */
    getDiscriminator?(): string;
    /** Get the common schema shared across all actions. */
    getCommonSchema?(): ZodObject<ZodRawShape> | undefined;
}

// ── Action Metadata (Observability) ──────────────────────

/**
 * Metadata for a single action within a grouped tool.
 *
 * Returned by {@link ToolBuilder.getActionMetadata} for
 * introspection, compliance audits, or dashboard generation.
 *
 * @example
 * ```typescript
 * const meta = builder.getActionMetadata();
 * for (const action of meta) {
 *     console.log(`${action.key}: destructive=${action.destructive}`);
 * }
 * // Output: "users.create: destructive=false"
 * //         "users.delete: destructive=true"
 * ```
 *
 * @see {@link GroupedToolBuilder.getActionMetadata}
 */
export interface ActionMetadata {
    /** Full action key (e.g. `"admin.create"` for grouped, `"list"` for flat) */
    readonly key: string;
    /** Action name within its group */
    readonly actionName: string;
    /** Group name (`undefined` for flat actions) */
    readonly groupName: string | undefined;
    /** Human-readable description */
    readonly description: string | undefined;
    /** Whether this action is destructive */
    readonly destructive: boolean;
    /** Whether this action is idempotent */
    readonly idempotent: boolean;
    /** Whether this action is read-only */
    readonly readOnly: boolean;
    /** Required field names from the Zod schema */
    readonly requiredFields: readonly string[];
    /** Whether this action has group/action-level middleware */
    readonly hasMiddleware: boolean;

    // ── Presenter Metadata (Introspection) ───────────────

    /** Presenter name (if MVA pattern is used via `returns: Presenter`) */
    readonly presenterName: string | undefined;
    /** Schema keys exposed by the Presenter (Zod shape keys) */
    readonly presenterSchemaKeys: readonly string[] | undefined;
    /** UI block types supported by the Presenter (e.g. 'echarts', 'mermaid') */
    readonly presenterUiBlockTypes: readonly string[] | undefined;
    /** Whether the Presenter has dynamic (context-aware) system rules */
    readonly presenterHasContextualRules: boolean | undefined;
}

// ── Internal Action (Strategy Input) ─────────────────────

/**
 * Internal representation of a registered action.
 *
 * This is the internal data structure used by the build-time
 * strategies. You typically don't interact with this directly.
 *
 * @internal
 */
export interface InternalAction<TContext> {
    /** Full key: `"name"` (flat) or `"group.name"` (grouped) */
    readonly key: string;
    /** Group name (`undefined` for flat actions) */
    readonly groupName: string | undefined;
    /** Group description */
    readonly groupDescription: string | undefined;
    /** Action name within the group */
    readonly actionName: string;
    /** Description */
    readonly description: string | undefined;
    /** Zod schema */
    readonly schema: ZodObject<ZodRawShape> | undefined;
    /** Whether this action is destructive */
    readonly destructive: boolean | undefined;
    /** Whether this action is idempotent */
    readonly idempotent: boolean | undefined;
    /** Whether this action is read-only */
    readonly readOnly: boolean | undefined;
    /** Per-action/group middleware (applied after global middleware) */
    readonly middlewares: readonly MiddlewareFn<TContext>[] | undefined;
    /** Common schema fields to omit for this action (LLM won't see them, validation skips them) */
    readonly omitCommonFields: readonly string[] | undefined;
    /** Presenter for MVA pattern — transforms raw handler output into rich multi-block responses */
    readonly returns: Presenter<unknown> | undefined;
    /** Handler — returns ToolResponse (classic) or raw data (MVA with `returns: Presenter`) */
    readonly handler: (ctx: TContext, args: Record<string, unknown>) => Promise<unknown>;
}

// ── Middleware ────────────────────────────────────────────

/**
 * Middleware function signature.
 *
 * Follows the `next()` pattern (similar to Express/Koa). Middleware
 * can inspect/modify args, short-circuit with an error, or wrap
 * the handler with cross-cutting concerns.
 *
 * Middleware chains are **pre-compiled at build time** — there is
 * zero chain assembly or closure allocation per request.
 *
 * @typeParam TContext - Application context
 *
 * @example
 * ```typescript
 * // Authentication middleware
 * const requireAuth: MiddlewareFn<AppContext> = async (ctx, args, next) => {
 *     if (!ctx.user) return error('Unauthorized');
 *     return next();
 * };
 *
 * // Logging middleware
 * const logger: MiddlewareFn<AppContext> = async (ctx, args, next) => {
 *     const start = Date.now();
 *     const result = await next();
 *     console.log(`${args.action} took ${Date.now() - start}ms`);
 *     return result;
 * };
 *
 * // Apply to a builder
 * const builder = new GroupedToolBuilder<AppContext>('projects')
 *     .use(logger)        // Global: runs on every action
 *     .use(requireAuth);  // Global: runs after logger
 * ```
 *
 * @see {@link GroupedToolBuilder.use} for global middleware
 * @see {@link ActionGroupBuilder.use} for group-scoped middleware
 */
export type MiddlewareFn<TContext> = (
    ctx: TContext,
    args: Record<string, unknown>,
    next: () => Promise<unknown>
) => Promise<unknown>;

// ── Action Configuration ─────────────────────────────────

/**
 * Configuration for a single action within a grouped tool.
 *
 * Pass this to {@link GroupedToolBuilder.action} or
 * {@link ActionGroupBuilder.action} to register an action.
 *
 * @typeParam TContext - Application context
 *
 * @example
 * ```typescript
 * builder.action({
 *     name: 'create',
 *     description: 'Create a new project',
 *     schema: z.object({
 *         name: z.string().describe('Project name'),
 *         description: z.string().optional(),
 *     }),
 *     destructive: false,
 *     handler: async (ctx, args) => {
 *         const project = await ctx.db.projects.create(args);
 *         return success(project);
 *     },
 * });
 * ```
 *
 * @see {@link GroupedToolBuilder.action}
 */
export interface ActionConfig<TContext> {
    /** Action name (must not contain dots in flat mode) */
    name: string;
    /** Human-readable description of what this action does */
    description?: string;
    /** Zod schema for this action's specific parameters */
    schema?: ZodObject<ZodRawShape>;
    /**
     * Whether this action is destructive.
     * When `true`, appends `[DESTRUCTIVE]` to the LLM description.
     */
    destructive?: boolean;
    /**
     * Whether this action is idempotent.
     * Affects the aggregated `idempotentHint` annotation.
     */
    idempotent?: boolean;
    /**
     * Whether this action is read-only.
     * Affects the aggregated `readOnlyHint` annotation.
     */
    readOnly?: boolean;
    /**
     * Common schema fields to omit for this specific action.
     *
     * Use when an action derives a common field from context (e.g. middleware)
     * instead of requiring the LLM to provide it.
     *
     * @example
     * ```typescript
     * // workspace_id is derived from the JWT token for profile.me
     * .action({
     *     name: 'me',
     *     omitCommon: ['workspace_id'],
     *     handler: async (ctx, args) => success(ctx.user),
     * })
     * ```
     */
    omitCommon?: string[];
    /**
     * Presenter for the MVA (Model-View-Agent) pattern.
     *
     * When set, the handler's return type changes from `Promise<ToolResponse>`
     * to `Promise<TPresenterOutput>` (raw data). The framework intercepts the
     * raw return value, pipes it through the Presenter (schema validation,
     * system rules, UI blocks), and compiles the final multi-block response.
     *
     * @example
     * ```typescript
     * .action({
     *     name: 'get_invoice',
     *     returns: InvoicePresenter,
     *     handler: async (ctx, args) => {
     *         return await db.invoices.find(args.id); // Raw data
     *     },
     * })
     * ```
     *
     * @see {@link Presenter} for creating domain-level presenters
     */
    returns?: Presenter<unknown>;
    /** Handler function — return ToolResponse (classic) or raw data when using `returns: Presenter` */
    handler: (ctx: TContext, args: Record<string, unknown>) => Promise<unknown>;
}
