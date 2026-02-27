/**
 * initFusion() — tRPC-Style Context Initialization
 *
 * Eliminates the need to pass `<AppContext>` as a generic parameter
 * everywhere. Define your context type once, and every `f.tool()`,
 * `f.presenter()`, `f.prompt()`, and `f.middleware()` call
 * automatically inherits it.
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
 * // src/tools/billing.ts — daily usage, super clean
 * import { f } from '../fusion';
 * import { z } from 'zod';
 *
 * export const getInvoice = f.tool({
 *   name: 'billing.get_invoice',
 *   input: z.object({ id: z.string() }),
 *   handler: async ({ input, ctx }) => {
 *     // ctx is fully typed as AppContext!
 *     return await ctx.db.invoices.findUnique(input.id);
 *   },
 * });
 * ```
 *
 * @module
 */
import { type ZodType, type ZodObject, type ZodRawShape } from 'zod';
import { GroupedToolBuilder } from './builder/GroupedToolBuilder.js';
import { type ToolResponse, success } from './response.js';
import { type MiddlewareFn } from './types.js';
import { ToolRegistry } from './registry/ToolRegistry.js';
import { type Presenter } from '../presenter/Presenter.js';
import { definePresenter, type PresenterConfig } from '../presenter/definePresenter.js';
import { defineMiddleware, type MiddlewareDefinition } from './middleware/index.js';
import { defineTool, type ToolConfig } from './builder/defineTool.js';
import { definePrompt } from '../prompt/definePrompt.js';
import { FluentPromptBuilder } from '../prompt/FluentPromptBuilder.js';
import { type PromptBuilder, type PromptConfig } from '../prompt/types.js';
import { isZodSchema } from './schema/SchemaUtils.js';
import { convertParamsToZod, type ParamsMap, type InferParams } from './builder/ParamDescriptors.js';
import {
    FluentToolBuilder,
    QUERY_DEFAULTS, MUTATION_DEFAULTS, ACTION_DEFAULTS,
} from './builder/FluentToolBuilder.js';
import { FluentRouter } from './builder/FluentRouter.js';
import {
    FluentString, FluentNumber, FluentBoolean, FluentEnum, FluentArray,
} from './builder/FluentSchemaHelpers.js';
import { ErrorBuilder } from './builder/ErrorBuilder.js';
import { StateSyncBuilder } from '../state-sync/StateSyncBuilder.js';
import { type ErrorCode } from './response.js';

// ── Config Types ─────────────────────────────────────────

/**
 * Ergonomic tool config for `f.tool()`.
 *
 * The `handler` receives `{ input, ctx }` instead of `(ctx, args)` —
 * a more intuitive destructured pattern inspired by tRPC v11.
 *
 * @typeParam TContext - Application context (inherited from `initFusion`)
 * @typeParam TInput - Input schema type (inferred from `input`)
 */
export interface FusionToolConfig<TContext, TInput extends ZodObject<ZodRawShape> | ParamsMap = ParamsMap> {
    /** Tool name — use `domain.action` convention for flat exposition */
    readonly name: string;
    /** Human-readable description for the LLM */
    readonly description?: string;
    /** Input schema (Zod object or JSON param descriptors) */
    readonly input?: TInput;
    /** Capability tags for filtering */
    readonly tags?: string[];
    /** MCP annotations */
    readonly annotations?: Record<string, unknown>;
    /** Mark as read-only (no side effects) */
    readonly readOnly?: boolean;
    /** Mark as destructive (irreversible) */
    readonly destructive?: boolean;
    /** Mark as idempotent (safe to retry) */
    readonly idempotent?: boolean;
    /** Global middleware */
    readonly middleware?: MiddlewareFn<TContext>[];
    /** MVA Presenter for automatic response formatting */
    readonly returns?: Presenter<unknown>;
    /** Handler function — receives destructured `{ input, ctx }` */
    readonly handler: (args: {
        input: TInput extends ZodObject<ZodRawShape>
            ? TInput['_output']
            : TInput extends ParamsMap
                ? InferParams<TInput>
                : Record<string, unknown>;
        ctx: TContext;
    }) => Promise<ToolResponse | unknown>;
}

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
    /**
     * Define a tool with automatic context typing.
     *
     * The handler receives `{ input, ctx }` where `ctx` is your `AppContext`
     * and `input` is fully typed from the `input` schema.
     *
     * @example
     * ```typescript
     * const myTool = f.tool({
     *   name: 'users.list',
     *   input: z.object({ limit: z.number().optional() }),
     *   readOnly: true,
     *   handler: async ({ input, ctx }) => {
     *     return await ctx.db.users.findMany({ take: input.limit });
     *   },
     * });
     * ```
     */
    tool<TInput extends ZodObject<ZodRawShape> | ParamsMap>(
        config: FusionToolConfig<TContext, TInput>,
    ): GroupedToolBuilder<TContext>;

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

    /**
     * Define a prompt — fluent or config-bag.
     *
     * **Fluent** (name only — returns chainable builder):
     * ```typescript
     * const greet = f.prompt('greet')
     *     .describe('Greet a user')
     *     .input({ name: f.string() })
     *     .handler(async (ctx, { name }) => ({
     *         messages: [PromptMessage.user(`Hello ${name}!`)],
     *     }));
     * ```
     *
     * **Config-bag** (backward compatible):
     * ```typescript
     * const greet = f.prompt('greet', {
     *     args: z.object({ name: z.string() }),
     *     handler: async (ctx, args) => ({ ... }),
     * });
     * ```
     */
    prompt(name: string): FluentPromptBuilder<TContext>;
    prompt(name: string, config: Omit<PromptConfig<TContext>, 'handler'> & {
        handler: PromptConfig<TContext>['handler'];
    }): PromptBuilder<TContext>;

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

    /**
     * Create a fully configured tool using the standard `defineTool()` config.
     * For power users who want the full `ToolConfig` API with context typing.
     *
     * @example
     * ```typescript
     * const platform = f.defineTool('platform', {
     *   shared: { workspace_id: 'string' },
     *   groups: { users: { actions: { list: { handler: listUsers } } } },
     * });
     * ```
     */
    defineTool(name: string, config: ToolConfig<TContext>): GroupedToolBuilder<TContext>;

    /**
     * Create a pre-typed ToolRegistry ready for registration.
     *
     * @example
     * ```typescript
     * const registry = f.registry();
     * registry.register(myTool);
     * ```
     */
    registry(): ToolRegistry<TContext>;

    // ── Semantic Verbs (Fluent API) ──────────────────────

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
     *     .input({ limit: f.number().min(1).max(100) })
     *     .resolve(async ({ input, ctx }) => {
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
     *     .input({ id: f.string() })
     *     .resolve(async ({ input, ctx }) => {
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
     *     .input({ id: f.string(), name: f.string().optional() })
     *     .resolve(async ({ input, ctx }) => {
     *         return ctx.db.user.update({ where: { id: input.id }, data: input });
     *     });
     * ```
     */
    action(name: string): FluentToolBuilder<TContext>;

    // ── Schema Helpers ───────────────────────────────────

    /** Create a fluent string parameter descriptor */
    string(): FluentString;
    /** Create a fluent number parameter descriptor */
    number(): FluentNumber;
    /** Create a fluent boolean parameter descriptor */
    boolean(): FluentBoolean;
    /** Create a fluent enum parameter descriptor */
    enum<V extends string>(...values: [V, ...V[]]): FluentEnum<V>;
    /** Create a fluent array parameter descriptor */
    array(itemType: 'string' | 'number' | 'boolean'): FluentArray;

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
     *     .input({ limit: f.number() })
     *     .resolve(async ({ input }) => { ... });
     * ```
     */
    router(prefix: string): FluentRouter<TContext>;

    /**
     * Create a fluent, self-healing error builder.
     *
     * @param code - Canonical error code (e.g. `'NOT_FOUND'`, `'VALIDATION_ERROR'`)
     * @param message - Human-readable error message
     * @returns A chaining {@link ErrorBuilder}
     *
     * @example
     * ```typescript
     * return f.error('NOT_FOUND', `Project "${id}" missing`)
     *     .suggest('Check the list for valid IDs')
     *     .actions('projects.list');
     * ```
     */
    error(code: ErrorCode, message: string): ErrorBuilder;

    /**
     * Create a fluent builder for centralized State Sync policies.
     * 
     * @example
     * ```typescript
     * const layer = f.stateSync()
     *     .defaults({ cacheControl: 'no-store' })
     *     .policy('billing.*', { cacheControl: 'no-store' })
     *     .build();
     * ```
     */
    stateSync(): StateSyncBuilder;
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
 * // Usage anywhere in the project
 * const tool = f.tool({ name: 'tasks.list', handler: ... });
 * const presenter = f.presenter({ name: 'Task', schema: taskSchema });
 * const registry = f.registry();
 * ```
 */
export function initFusion<TContext = void>(): FusionInstance<TContext> {
    return {
        tool<TInput extends ZodObject<ZodRawShape> | ParamsMap>(
            config: FusionToolConfig<TContext, TInput>,
        ): GroupedToolBuilder<TContext> {
            // Parse the tool name into group + action
            // Convention: 'domain.action' → tool named 'domain' with single action 'action'
            const dotIndex = config.name.indexOf('.');
            const toolName = dotIndex > 0 ? config.name.slice(0, dotIndex) : config.name;
            const actionName = dotIndex > 0 ? config.name.slice(dotIndex + 1) : 'default';

            // Resolve input schema
            let schema: ZodObject<ZodRawShape> | undefined;
            if (config.input) {
                schema = isZodSchema(config.input)
                    ? config.input as ZodObject<ZodRawShape>
                    : convertParamsToZod(config.input as ParamsMap);
            }

            // Wrap handler: { input, ctx } → (ctx, args)
            const wrappedHandler = async (ctx: TContext, args: Record<string, unknown>): Promise<ToolResponse> => {
                const result = await config.handler({ input: args as never, ctx });

                // Auto-wrap non-ToolResponse results
                if (
                    typeof result === 'object' &&
                    result !== null &&
                    'content' in result &&
                    Array.isArray((result as { content: unknown }).content)
                ) {
                    return result as ToolResponse;
                }

                return success(result as string | object);
            };

            // Build via defineTool for consistency
            const toolConfig: ToolConfig<TContext> = {
                ...(config.description ? { description: config.description } : {}),
                ...(config.tags && config.tags.length > 0 ? { tags: config.tags } : {}),
                ...(config.annotations ? { annotations: config.annotations } : {}),
                ...(config.middleware ? { middleware: config.middleware } : {}),
                actions: {
                    [actionName]: {
                        handler: wrappedHandler,
                        ...(schema ? { params: schema } : {}),
                        ...(config.readOnly !== undefined ? { readOnly: config.readOnly } : {}),
                        ...(config.destructive !== undefined ? { destructive: config.destructive } : {}),
                        ...(config.idempotent !== undefined ? { idempotent: config.idempotent } : {}),
                        ...(config.returns ? { returns: config.returns } : {}),
                    },
                },
            };

            return defineTool<TContext>(toolName, toolConfig);
        },

        presenter<TSchema extends ZodType>(
            config: PresenterConfig<TSchema['_output']> & { schema: TSchema },
        ): Presenter<TSchema['_output']> {
            return definePresenter(config);
        },

        prompt(name: string, config?: Omit<PromptConfig<TContext>, 'handler'> & {
            handler: PromptConfig<TContext>['handler'];
        }): PromptBuilder<TContext> | FluentPromptBuilder<TContext> {
            if (!config) {
                return new FluentPromptBuilder<TContext>(name);
            }
            return definePrompt<TContext>(name, config as never);
        },

        middleware<TDerived extends Record<string, unknown>>(
            derive: (ctx: TContext) => TDerived | Promise<TDerived>,
        ): MiddlewareDefinition<TContext, TDerived> {
            return defineMiddleware<TContext, TDerived>(derive);
        },

        defineTool(name: string, config: ToolConfig<TContext>): GroupedToolBuilder<TContext> {
            return defineTool<TContext>(name, config);
        },

        registry(): ToolRegistry<TContext> {
            return new ToolRegistry<TContext>();
        },

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

        // ── Schema Helpers ────────────────────────────────

        string(): FluentString { return new FluentString(); },
        number(): FluentNumber { return new FluentNumber(); },
        boolean(): FluentBoolean { return new FluentBoolean(); },
        enum<V extends string>(...values: [V, ...V[]]): FluentEnum<V> { return new FluentEnum(...values); },
        array(itemType: 'string' | 'number' | 'boolean'): FluentArray { return new FluentArray(itemType); },

        // ── Router ────────────────────────────────────────

        router(prefix: string): FluentRouter<TContext> {
            return new FluentRouter<TContext>(prefix);
        },

        error(code: ErrorCode, message: string): ErrorBuilder {
            return new ErrorBuilder(code, message);
        },

        stateSync(): StateSyncBuilder {
            return new StateSyncBuilder();
        },
    };
}
