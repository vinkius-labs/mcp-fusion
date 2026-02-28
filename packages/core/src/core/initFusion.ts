/**
 * initFusion() — tRPC-Style Context Initialization
 *
 * Eliminates the need to pass `<AppContext>` as a generic parameter
 * everywhere. Define your context type once, and every `f.query()`,
 * `f.mutation()`, `f.action()` call automatically inherits it.
 *
 * @example
 * ```typescript
 * // src/fusion.ts — defined once in the project
 * import { initFusion } from '@vinkius-core/mcp-fusion';
 *
 * interface AppContext {
 *   db: PrismaClient;
 *   user: { id: string; role: string };
 * }
 *
 * export const f = initFusion<AppContext>();
 *
 * // src/tools/billing.ts — clean fluent API
 * import { f } from '../fusion';
 *
 * export const getInvoice = f.query('billing.get_invoice')
 *     .describe('Get an invoice by ID')
 *     .withString('id', 'The invoice ID')
 *     .handle(async (input, ctx) => {
 *         return await ctx.db.invoices.findUnique(input.id);
 *     });
 * ```
 *
 * @module
 */
import { type ZodType, type ZodObject, type ZodRawShape } from 'zod';
import { GroupedToolBuilder } from './builder/GroupedToolBuilder.js';
import { type ToolResponse } from './response.js';
import { type MiddlewareFn } from './types.js';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { type Presenter } from '../presenter/Presenter.js';
import { definePresenter, type PresenterConfig } from '../presenter/definePresenter.js';
import { defineMiddleware, type MiddlewareDefinition } from './middleware/index.js';
import { defineTool, type ToolConfig } from './builder/defineTool.js';
import { definePrompt } from '../prompt/definePrompt.js';
import { FluentPromptBuilder } from '../prompt/FluentPromptBuilder.js';
import { type PromptBuilder, type PromptConfig } from '../prompt/types.js';
import {
    FluentToolBuilder,
    QUERY_DEFAULTS, MUTATION_DEFAULTS, ACTION_DEFAULTS,
} from './builder/FluentToolBuilder.js';
import { FluentRouter } from './builder/FluentRouter.js';
import { ErrorBuilder } from './builder/ErrorBuilder.js';
import { StateSyncBuilder } from '../state-sync/StateSyncBuilder.js';
import { type ErrorCode } from './response.js';
import { SandboxEngine, type SandboxConfig } from '../sandbox/SandboxEngine.js';
import { defaultSerializer, type JsonSerializer } from './serialization/JsonSerializer.js';

// ── Config Types ─────────────────────────────────────────

/**
 * The initialized Fusion instance.
 *
 * Provides context-typed factory methods for tools, presenters,
 * prompts, middleware, and registry. Every method automatically
 * inherits the `TContext` defined in `initFusion<TContext>()`.
 *
 * @typeParam TContext - The application context type
 */
export interface FusionInstance<TContext> {

    // ── Semantic Verbs (THE Fluent API) ──────────────────

    /**
     * Create a **read-only** query tool (readOnly: true by default).
     *
     * @param name - Tool name in `domain.action` format
     * @returns A type-chaining {@link FluentToolBuilder}
     *
     * @example
     * ```typescript
     * const listUsers = f.query('users.list')
     *     .describe('List users from the database')
     *     .withNumber('limit', 'Max results to return')
     *     .withOptionalEnum('status', ['active', 'inactive'], 'Filter by status')
     *     .handle(async (input, ctx) => {
     *         return ctx.db.user.findMany({ take: input.limit });
     *     });
     * ```
     */
    query(name: string): FluentToolBuilder<TContext>;

    /**
     * Create a **destructive** mutation tool (destructive: true by default).
     *
     * @param name - Tool name in `domain.action` format
     * @returns A type-chaining {@link FluentToolBuilder}
     *
     * @example
     * ```typescript
     * const deleteUser = f.mutation('users.delete')
     *     .describe('Delete a user permanently')
     *     .withString('id', 'User ID to delete')
     *     .handle(async (input, ctx) => {
     *         await ctx.db.user.delete({ where: { id: input.id } });
     *     });
     * ```
     */
    mutation(name: string): FluentToolBuilder<TContext>;

    /**
     * Create a **neutral** action tool (no defaults applied).
     *
     * @param name - Tool name in `domain.action` format
     * @returns A type-chaining {@link FluentToolBuilder}
     *
     * @example
     * ```typescript
     * const updateUser = f.action('users.update')
     *     .describe('Update user profile')
     *     .idempotent()
     *     .withString('id', 'User ID')
     *     .withOptionalString('name', 'New display name')
     *     .handle(async (input, ctx) => {
     *         return ctx.db.user.update({ where: { id: input.id }, data: input });
     *     });
     * ```
     */
    action(name: string): FluentToolBuilder<TContext>;

    // ── MVA Presenter ────────────────────────────────────

    /**
     * Define a Presenter with the standard object-config API.
     *
     * @example
     * ```typescript
     * const InvoicePresenter = f.presenter({
     *   name: 'Invoice',
     *   schema: invoiceSchema,
     *   rules: ['CRITICAL: amount_cents is in CENTS.'],
     *   ui: (inv) => [ui.echarts({ ... })],
     * });
     * ```
     */
    presenter<TSchema extends ZodType>(
        config: PresenterConfig<TSchema['_output']> & { schema: TSchema },
    ): Presenter<TSchema['_output']>;

    // ── Prompts ──────────────────────────────────────────

    /**
     * Define a prompt — fluent builder.
     *
     * @example
     * ```typescript
     * const greet = f.prompt('greet')
     *     .describe('Greet a user')
     *     .withString('name', 'User name')
     *     .handler(async (ctx, { name }) => ({
     *         messages: [PromptMessage.user(`Hello ${name}!`)],
     *     }));
     * ```
     */
    prompt(name: string): FluentPromptBuilder<TContext>;
    prompt(name: string, config: Omit<PromptConfig<TContext>, 'handler'> & {
        handler: PromptConfig<TContext>['handler'];
    }): PromptBuilder<TContext>;

    // ── Middleware ────────────────────────────────────────

    /**
     * Define a context-derivation middleware.
     *
     * @example
     * ```typescript
     * const withUser = f.middleware(async (ctx) => ({
     *   user: await ctx.db.users.findUnique(ctx.userId),
     * }));
     * ```
     */
    middleware<TDerived extends Record<string, unknown>>(
        derive: (ctx: TContext) => TDerived | Promise<TDerived>,
    ): MiddlewareDefinition<TContext, TDerived>;

    // ── Registry ─────────────────────────────────────────

    /**
     * Create a pre-typed ToolRegistry ready for registration.
     *
     * @example
     * ```typescript
     * const registry = f.registry();
     * registry.register(listUsers);
     * ```
     */
    registry(): ToolRegistry<TContext>;

    // ── Router (Prefix Grouping) ─────────────────────────

    /**
     * Create a router that shares prefix, middleware, and tags.
     *
     * @param prefix - Common prefix for all tools (e.g. `'users'`)
     * @returns A {@link FluentRouter} for creating child tools
     *
     * @example
     * ```typescript
     * const users = f.router('users')
     *     .describe('User management')
     *     .use(requireAuth);
     *
     * const listUsers = users.query('list')
     *     .withNumber('limit', 'Max results')
     *     .handle(async (input) => { ... });
     * ```
     */
    router(prefix: string): FluentRouter<TContext>;

    // ── Error Builder ────────────────────────────────────

    /**
     * Create a fluent, self-healing error builder.
     *
     * @param code - Canonical error code
     * @param message - Human-readable error message
     * @returns A chaining {@link ErrorBuilder}
     *
     * @example
     * ```typescript
     * return f.error('NOT_FOUND', `Project "${id}" not found`)
     *     .suggest('Check the list for valid IDs')
     *     .actions('projects.list');
     * ```
     */
    error(code: ErrorCode, message: string): ErrorBuilder;

    // ── State Sync ───────────────────────────────────────

    /**
     * Create a fluent builder for centralized State Sync policies.
     */
    stateSync(): StateSyncBuilder;

    // ── Internal / Advanced ──────────────────────────────

    /**
     * Create a tool using the low-level `defineTool()` config.
     * For internal use and advanced scenarios only.
     * @internal
     */
    defineTool(name: string, config: ToolConfig<TContext>): GroupedToolBuilder<TContext>;

    // ── Sandbox (Zero-Trust V8 Compute) ─────────────

    /**
     * Create a standalone SandboxEngine for advanced use cases.
     *
     * Use when you need direct control over the sandbox lifecycle,
     * or when calling it from custom middleware/handlers.
     *
     * @param config - Optional sandbox configuration
     * @returns A new SandboxEngine instance
     *
     * @example
     * ```typescript
     * const sandbox = f.sandbox({ timeout: 3000, memoryLimit: 64 });
     * const result = await sandbox.execute(
     *     '(data) => data.filter(d => d.risk > 90)',
     *     records,
     * );
     * sandbox.dispose();
     * ```
     */
    sandbox(config?: SandboxConfig): SandboxEngine;

    // ── Serialization ─────────────────────────────────

    /**
     * AOT JSON serializer.
     *
     * Compile Zod schemas into hyper-fast stringify functions at boot time.
     * Used internally by Presenters; exposed here for advanced use cases.
     *
     * @example
     * ```typescript
     * const stringify = f.serializer.compile(myZodSchema);
     * if (stringify) {
     *     return success(data, stringify); // 2-5x faster
     * }
     * ```
     */
    readonly serializer: JsonSerializer;
}

// ── Factory ──────────────────────────────────────────────

/**
 * Initialize a Fusion instance with a fixed context type.
 *
 * Call once per project. All factory methods on the returned instance
 * automatically inherit the context type — zero generic repetition.
 *
 * @typeParam TContext - The application-level context type
 * @returns A {@link FusionInstance} with context-typed factories
 *
 * @example
 * ```typescript
 * // Single definition, typically in src/fusion.ts
 * export const f = initFusion<AppContext>();
 *
 * // Build tools with the Fluent API
 * const listUsers = f.query('users.list')
 *     .describe('List all users')
 *     .withOptionalNumber('limit', 'Max results (default: 50)')
 *     .handle(async (input, ctx) => {
 *         return ctx.db.users.findMany({ take: input.limit ?? 50 });
 *     });
 * ```
 */
export function initFusion<TContext = void>(): FusionInstance<TContext> {
    return {
        // ── Semantic Verbs ────────────────────────────────

        query(name: string): FluentToolBuilder<TContext> {
            return new FluentToolBuilder<TContext>(name, QUERY_DEFAULTS);
        },

        mutation(name: string): FluentToolBuilder<TContext> {
            return new FluentToolBuilder<TContext>(name, MUTATION_DEFAULTS);
        },

        action(name: string): FluentToolBuilder<TContext> {
            return new FluentToolBuilder<TContext>(name, ACTION_DEFAULTS);
        },

        // ── MVA Presenter ────────────────────────────────

        presenter<TSchema extends ZodType>(
            config: PresenterConfig<TSchema['_output']> & { schema: TSchema },
        ): Presenter<TSchema['_output']> {
            return definePresenter(config);
        },

        // ── Prompts ──────────────────────────────────────

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prompt(name: string, config?: any): any {
            if (!config) {
                return new FluentPromptBuilder<TContext>(name);
            }
            return definePrompt<TContext>(name, config as never);
        },

        // ── Middleware ───────────────────────────────────

        middleware<TDerived extends Record<string, unknown>>(
            derive: (ctx: TContext) => TDerived | Promise<TDerived>,
        ): MiddlewareDefinition<TContext, TDerived> {
            return defineMiddleware<TContext, TDerived>(derive);
        },

        // ── Registry ─────────────────────────────────────

        registry(): ToolRegistry<TContext> {
            return new ToolRegistry<TContext>();
        },

        // ── Router ───────────────────────────────────────

        router(prefix: string): FluentRouter<TContext> {
            return new FluentRouter<TContext>(prefix);
        },

        // ── Error Builder ────────────────────────────────

        error(code: ErrorCode, message: string): ErrorBuilder {
            return new ErrorBuilder(code, message);
        },

        // ── State Sync ───────────────────────────────────

        stateSync(): StateSyncBuilder {
            return new StateSyncBuilder();
        },

        // ── Internal / Advanced ──────────────────────────

        defineTool(name: string, config: ToolConfig<TContext>): GroupedToolBuilder<TContext> {
            return defineTool<TContext>(name, config);
        },

        // ── Sandbox ──────────────────────────────────────

        sandbox(config?: SandboxConfig): SandboxEngine {
            return new SandboxEngine(config);
        },

        // ── Serialization ────────────────────────────────

        serializer: defaultSerializer,
    };
}
