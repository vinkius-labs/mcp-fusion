/**
 * ActionGroupBuilder — Sub-builder for Hierarchical Action Groups
 *
 * Used within {@link GroupedToolBuilder.group} callbacks to register
 * actions under a named group. Supports group-scoped middleware and
 * generates compound keys (e.g., `"users.create"`).
 *
 * @typeParam TContext - Application context type
 * @typeParam TCommon - Common schema shape (inferred from parent builder)
 *
 * @example
 * ```typescript
 * createTool<AppContext>('platform')
 *     .group('users', 'User management', g => g
 *         .use(requireAdmin)
 *         .query('list', async (ctx) => success(await ctx.db.users.findMany()))
 *         .mutation('ban', async (ctx, args) => {
 *             await ctx.db.users.ban(args.user_id);
 *             return success('User banned');
 *         })
 *     );
 * ```
 *
 * @see {@link GroupedToolBuilder.group} for creating groups
 * @see {@link MiddlewareFn} for middleware signature
 *
 * @module
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import {
    type ToolResponse,
    type InternalAction,
    type MiddlewareFn,
    type ActionConfig,
} from '../types.js';
import { type MiddlewareDefinition, resolveMiddleware } from '../middleware/ContextDerivation.js';

/**
 * Callback for configuring actions within a group.
 *
 * Receives an {@link ActionGroupBuilder} to register actions and middleware.
 *
 * @typeParam TContext - Application context type
 * @typeParam TCommon - Common schema shape
 *
 * @example
 * ```typescript
 * const configure: GroupConfigurator<AppContext, { workspace_id: string }> = (g) => g
 *     .query('list', listHandler)
 *     .mutation('delete', deleteHandler);
 *
 * builder.group('users', 'User management', configure);
 * ```
 */
export type GroupConfigurator<TContext, TCommon extends Record<string, unknown>> =
    (group: ActionGroupBuilder<TContext, TCommon>) => void;

// ── Shared Config → InternalAction Mapper ────────────────

/**
 * Map `ActionConfig` properties to `InternalAction` base fields.
 *
 * Both `GroupedToolBuilder.action()` and `ActionGroupBuilder.action()`
 * perform this same mapping. Extracted here to eliminate duplication
 * and ensure a single source of truth.
 *
 * @param config - The action configuration from the public API
 * @param omitCommonFields - Resolved omitCommon fields (already merged/deduped)
 * @returns Base fields for building an `InternalAction`
 *
 * @internal
 */
export function mapConfigToActionFields<TContext>(
    config: ActionConfig<TContext>,
    omitCommonFields: string[] | undefined,
): Pick<InternalAction<TContext>,
    'actionName' | 'description' | 'schema' | 'destructive' |
    'idempotent' | 'readOnly' | 'handler' | 'omitCommonFields' | 'returns'
> {
    return {
        actionName: config.name,
        description: config.description ?? undefined,
        schema: config.schema ?? undefined,
        destructive: config.destructive ?? undefined,
        idempotent: config.idempotent ?? undefined,
        readOnly: config.readOnly ?? undefined,
        handler: config.handler,
        omitCommonFields: (omitCommonFields?.length ?? 0) > 0 ? omitCommonFields : undefined,
        returns: config.returns ?? undefined,
    };
}

// ── Handler type for semantic verbs ──────────────────────

/**
 * Handler function type for semantic verb shortcuts.
 * @typeParam TContext - Application context type
 */
type ActionHandler<TContext> = (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>;

// ── ActionGroupBuilder ───────────────────────────────────

export class ActionGroupBuilder<TContext, TCommon extends Record<string, unknown> = Record<string, never>> {
    /** @internal */
    readonly _actions: InternalAction<TContext>[] = [];
    private readonly _groupName: string;
    private readonly _groupDescription: string;
    private readonly _groupMiddlewares: MiddlewareFn<TContext>[] = [];
    private _groupOmitCommon: string[] = [];

    constructor(groupName: string, description?: string) {
        this._groupName = groupName;
        this._groupDescription = description || '';
    }

    /**
     * Add middleware scoped to this group only.
     *
     * Unlike {@link GroupedToolBuilder.use}, this middleware runs
     * only for actions within this group — not globally.
     *
     * Accepts both `MiddlewareDefinition` from `f.middleware()` and
     * raw `MiddlewareFn` functions.
     *
     * @param mw - Middleware function or MiddlewareDefinition
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * builder.group('admin', 'Admin operations', (g) => g
     *     .use(requireAdmin)
     *     .query('list', listHandler)
     *     .mutation('reset', resetHandler)
     * );
     * ```
     *
     * @see {@link MiddlewareFn} for the middleware signature
     */
    use(mw: MiddlewareFn<TContext> | MiddlewareDefinition<TContext, Record<string, unknown>>): this {
        this._groupMiddlewares.push(resolveMiddleware(mw));
        return this;
    }

    /**
     * Omit common schema fields for all actions in this group.
     *
     * Use when an entire group derives common fields from context
     * (e.g. a "profile" group that resolves `workspace_id` from the JWT).
     *
     * Per-action `omitCommon` merges with group-level omissions.
     *
     * @param fields - Common field names to omit
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * builder.group('profile', 'User profile', (g) => g
     *     .omitCommon('workspace_id')
     *     .query('me', meHandler)
     * );
     * ```
     */
    omitCommon(...fields: string[]): this {
        this._groupOmitCommon.push(...fields);
        return this;
    }

    // ── Semantic Verb Shortcuts ──────────────────────────

    /**
     * Register a **read-only** action (readOnly: true).
     *
     * Semantic shortcut — eliminates the need for config objects.
     * The action name is automatically prefixed with the group name
     * (e.g., `"list"` in group `"users"` → `"users.list"`).
     *
     * @param name - Action name (must not contain dots)
     * @param handler - Handler function
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * builder.group('users', 'User management', (g) => g
     *     .query('list', async (ctx) => success(await ctx.db.users.findMany()))
     *     .query('get', async (ctx, args) => success(await ctx.db.users.find(args.id)))
     * );
     * ```
     */
    query(name: string, handler: ActionHandler<TContext>): this {
        return this.action({ name, readOnly: true, handler });
    }

    /**
     * Register a **destructive** action (destructive: true).
     *
     * Semantic shortcut — eliminates the need for config objects.
     * Signals to the LLM that this action has irreversible side effects.
     *
     * @param name - Action name (must not contain dots)
     * @param handler - Handler function
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * builder.group('users', 'User management', (g) => g
     *     .mutation('ban', async (ctx, args) => {
     *         await ctx.db.users.ban(args.user_id);
     *         return success('User banned');
     *     })
     * );
     * ```
     */
    mutation(name: string, handler: ActionHandler<TContext>): this {
        return this.action({ name, destructive: true, handler });
    }

    // ── Full Action Registration ─────────────────────────

    /**
     * Register an action within this group.
     *
     * **As a 2-arg shortcut** `action(name, handler)`: registers a standard
     * action (neither read-only nor destructive). This completes the
     * semantic verb trio alongside `.query()` and `.mutation()`.
     *
     * **As a config object** `action({ name, schema, ... })`: full control
     * over all action properties (schema, description, omitCommon, etc.).
     *
     * The action key is automatically prefixed with the group name
     * (e.g., action `"create"` in group `"users"` becomes `"users.create"`).
     *
     * @param config - Action configuration OR action name (string)
     * @param handler - Handler function (only when first arg is a string)
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * builder.group('users', 'User management', (g) => g
     *     .query('list', listHandler)
     *     .action('invite', inviteHandler)
     *     .mutation('ban', banHandler)
     * );
     * ```
     *
     * @see {@link ActionGroupBuilder.query} — read-only actions
     * @see {@link ActionGroupBuilder.mutation} — destructive actions
     * @see {@link ActionConfig} for all configuration options
     */
    action<TSchema extends ZodObject<ZodRawShape>, TOmit extends keyof TCommon = never>(config: {
        name: string;
        description?: string;
        schema: TSchema;
        destructive?: boolean;
        idempotent?: boolean;
        readOnly?: boolean;
        omitCommon?: TOmit[];
        handler: (ctx: TContext, args: TSchema["_output"] & Omit<TCommon, TOmit>) => Promise<ToolResponse>;
    }): this;
    /** Register a standard action (2-arg shorthand: neither readOnly nor destructive) */
    action(name: string, handler: ActionHandler<TContext>): this;
    /** Register an action within this group (config object) */
    action(config: ActionConfig<TContext>): this;
    action(
        configOrName: ActionConfig<TContext> | string,
        maybeHandler?: ActionHandler<TContext>,
    ): this {
        // 2-arg shorthand: action('invite', inviteHandler)
        const config: ActionConfig<TContext> = typeof configOrName === 'string'
            ? { name: configOrName, handler: maybeHandler! }
            : configOrName;

        if (config.name.includes('.')) {
            throw new Error(
                `Action name "${config.name}" must not contain dots. ` +
                `The framework uses dots internally for group.action compound keys.`
            );
        }

        // Merge group-level + per-action omissions (deduped)
        const perAction = (config as { omitCommon?: string[] }).omitCommon ?? [];
        const mergedOmit = [...new Set([...this._groupOmitCommon, ...perAction])];

        this._actions.push({
            key: `${this._groupName}.${config.name}`,
            groupName: this._groupName,
            groupDescription: this._groupDescription,
            ...mapConfigToActionFields(config, mergedOmit),
            middlewares: this._groupMiddlewares.length > 0
                ? [...this._groupMiddlewares] : undefined,
        });
        return this;
    }
}

