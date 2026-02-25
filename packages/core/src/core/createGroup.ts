/**
 * createGroup() — Functional Tool Group Compiler
 *
 * A lightweight, closure-based alternative to the class-heavy
 * `GroupedToolBuilder`. Instead of maintaining internal state via `this._x`,
 * it compiles a group config into a frozen object with pre-composed
 * middleware and an O(1) dispatch function.
 *
 * **Why Functional?**
 * - Closures minify 30-40% better than class methods (Terser can rename local vars)
 * - No prototype chain overhead — zero `this` binding issues
 * - Frozen return type prevents accidental mutation
 * - Compatible with Edge Runtimes (Cloudflare Workers, Deno Deploy)
 *
 * @example
 * ```typescript
 * import { createGroup, success } from '@vinkius-core/mcp-fusion';
 *
 * const billing = createGroup({
 *   name: 'billing',
 *   description: 'Invoice management',
 *   middleware: [requireAuth],
 *   actions: {
 *     get_invoice: {
 *       schema: z.object({ id: z.string() }),
 *       readOnly: true,
 *       handler: async (ctx, args) => success(await ctx.db.invoices.get(args.id)),
 *     },
 *     pay: {
 *       schema: z.object({ invoice_id: z.string(), amount: z.number() }),
 *       destructive: true,
 *       handler: async (ctx, args) => success(await ctx.db.payments.create(args)),
 *     },
 *   },
 * });
 *
 * // billing.execute(ctx, 'get_invoice', { id: '123' })
 * // billing.name === 'billing'
 * // billing.actionNames === ['get_invoice', 'pay']
 * ```
 *
 * @module
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { type ToolResponse } from '../core/response.js';
import { type MiddlewareFn } from '../core/types.js';

// ── Types ────────────────────────────────────────────────

/**
 * A single action definition within a group.
 */
export interface GroupAction<TContext> {
    /** Human-readable description for the LLM */
    readonly description?: string;
    /** Zod schema for input validation */
    readonly schema?: ZodObject<ZodRawShape>;
    /** Mark as read-only */
    readonly readOnly?: boolean;
    /** Mark as destructive */
    readonly destructive?: boolean;
    /** Mark as idempotent */
    readonly idempotent?: boolean;
    /** Per-action middleware */
    readonly middleware?: MiddlewareFn<TContext>[];
    /** Handler function */
    readonly handler: (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>;
}

/**
 * Full configuration for `createGroup()`.
 */
export interface GroupConfig<TContext> {
    /** Group/tool name */
    readonly name: string;
    /** Description for the LLM */
    readonly description?: string;
    /** Capability tags */
    readonly tags?: string[];
    /** Shared middleware applied to ALL actions (outermost layer) */
    readonly middleware?: MiddlewareFn<TContext>[];
    /** Action definitions keyed by action name */
    readonly actions: Record<string, GroupAction<TContext>>;
}

/**
 * A compiled, frozen group ready for execution.
 */
export interface CompiledGroup<TContext> {
    /** Group/tool name */
    readonly name: string;
    /** Description */
    readonly description: string | undefined;
    /** Tags */
    readonly tags: readonly string[];
    /** List of action names */
    readonly actionNames: readonly string[];
    /**
     * Execute an action by name.
     *
     * @param ctx - Application context
     * @param action - Action name
     * @param args - Input arguments
     * @returns Tool response
     * @throws If action name is unknown
     */
    readonly execute: (ctx: TContext, action: string, args: Record<string, unknown>) => Promise<ToolResponse>;
    /**
     * Get metadata for a specific action.
     */
    readonly getAction: (name: string) => Readonly<GroupAction<TContext>> | undefined;
}

// ── Middleware Composition ────────────────────────────────

/**
 * Compose an array of middleware into a single function.
 * Right-to-left composition: last middleware is innermost (closest to handler).
 * @internal
 */
function composeMiddleware<TContext>(
    globalMiddleware: MiddlewareFn<TContext>[],
    actionMiddleware: MiddlewareFn<TContext>[],
    handler: (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>,
): (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse> {
    const allMiddleware = [...globalMiddleware, ...actionMiddleware];

    if (allMiddleware.length === 0) {
        return handler;
    }

    // Build the chain from right to left
    return allMiddleware.reduceRight<(ctx: TContext, args: Record<string, unknown>) => Promise<unknown>>(
        (next, mw) =>
            (ctx: TContext, args: Record<string, unknown>) =>
                mw(ctx, args, () => next(ctx, args)),
        handler,
    ) as (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>;
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create a compiled, frozen tool group from a declarative config.
 *
 * The returned object has O(1) action dispatch via a pre-built Map.
 * All middleware chains are pre-composed at creation time — zero
 * runtime overhead on each call.
 *
 * @typeParam TContext - Application context type
 * @param config - Group configuration with actions
 * @returns A frozen {@link CompiledGroup} ready for execution
 *
 * @example
 * ```typescript
 * const tasks = createGroup({
 *   name: 'tasks',
 *   middleware: [logMiddleware],
 *   actions: {
 *     list: {
 *       readOnly: true,
 *       handler: async (ctx) => success(await ctx.db.tasks.findMany()),
 *     },
 *     create: {
 *       schema: z.object({ title: z.string() }),
 *       handler: async (ctx, args) => success(await ctx.db.tasks.create(args)),
 *     },
 *   },
 * });
 *
 * const result = await tasks.execute(ctx, 'create', { title: 'Buy milk' });
 * ```
 */
export function createGroup<TContext = void>(config: GroupConfig<TContext>): CompiledGroup<TContext> {
    const globalMiddleware = config.middleware ?? [];
    const actionNames = Object.keys(config.actions);

    // Pre-compose middleware chains for each action (O(1) dispatch)
    const dispatchMap = new Map<string, (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>>();

    for (const [name, action] of Object.entries(config.actions)) {
        const compiled = composeMiddleware(
            globalMiddleware,
            action.middleware ?? [],
            action.handler,
        );
        dispatchMap.set(name, compiled);
    }

    // Pre-validate action args using Zod schemas
    const schemaMap = new Map<string, ZodObject<ZodRawShape>>();
    for (const [name, action] of Object.entries(config.actions)) {
        if (action.schema) {
            schemaMap.set(name, action.schema);
        }
    }

    const execute = async (ctx: TContext, action: string, args: Record<string, unknown>): Promise<ToolResponse> => {
        const chain = dispatchMap.get(action);
        if (!chain) {
            throw new Error(`Unknown action "${action}" in group "${config.name}". Available: ${actionNames.join(', ')}`);
        }

        // Validate with Zod if schema is defined
        const schema = schemaMap.get(action);
        if (schema) {
            schema.strict().parse(args);
        }

        return chain(ctx, args);
    };

    const getAction = (name: string): Readonly<GroupAction<TContext>> | undefined => {
        return config.actions[name];
    };

    return Object.freeze({
        name: config.name,
        description: config.description,
        tags: Object.freeze(config.tags ?? []),
        actionNames: Object.freeze(actionNames),
        execute,
        getAction,
    });
}
