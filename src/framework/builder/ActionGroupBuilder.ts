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
 *     .group('users', 'User management', g => {
 *         g.use(requireAdmin)  // Group-scoped middleware
 *          .action({
 *              name: 'list',
 *              readOnly: true,
 *              handler: async (ctx, _args) => success(await ctx.db.users.findMany()),
 *          })
 *          .action({
 *              name: 'ban',
 *              destructive: true,
 *              schema: z.object({ user_id: z.string() }),
 *              handler: async (ctx, args) => {
 *                  await ctx.db.users.ban(args.user_id);
 *                  return success('User banned');
 *              },
 *          });
 *     });
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
 * const configure: GroupConfigurator<AppContext, { workspace_id: string }> = (g) => {
 *     g.action({ name: 'list', handler: listHandler });
 * };
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
    'idempotent' | 'readOnly' | 'handler' | 'omitCommonFields'
> {
    return {
        actionName: config.name,
        description: config.description ?? undefined,
        schema: config.schema ?? undefined,
        destructive: config.destructive ?? undefined,
        idempotent: config.idempotent ?? undefined,
        readOnly: config.readOnly ?? undefined,
        handler: config.handler,
        omitCommonFields: omitCommonFields?.length ? omitCommonFields : undefined,
    };
}

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
     * @param mw - Middleware function
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * builder.group('admin', 'Admin operations', g => {
     *     g.use(requireAdmin)  // Only runs for admin.* actions
     *      .action({ name: 'reset', handler: resetHandler });
     * });
     * ```
     *
     * @see {@link MiddlewareFn} for the middleware signature
     */
    use(mw: MiddlewareFn<TContext>): this {
        this._groupMiddlewares.push(mw);
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
     * builder.group('profile', 'User profile', g => {
     *     g.omitCommon('workspace_id')  // All profile.* actions skip workspace_id
     *      .action({ name: 'me', readOnly: true, handler: meHandler });
     * });
     * ```
     */
    omitCommon(...fields: string[]): this {
        this._groupOmitCommon.push(...fields);
        return this;
    }

    /**
     * Register an action within this group.
     *
     * The action key is automatically prefixed with the group name
     * (e.g., action `"create"` in group `"users"` becomes `"users.create"`).
     *
     * @param config - Action configuration
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * builder.group('billing', 'Billing operations', g => {
     *     g.action({
     *         name: 'refund',
     *         description: 'Issue a refund',
     *         destructive: true,
     *         schema: z.object({
     *             invoice_id: z.string(),
     *             amount: z.number().positive(),
     *         }),
     *         handler: async (ctx, args) => {
     *             await ctx.billing.refund(args.invoice_id, args.amount);
     *             return success('Refund issued');
     *         },
     *     });
     * });
     * // Discriminator value: "billing.refund"
     * ```
     *
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
    /** Register an action within this group (untyped: no schema) */
    action(config: ActionConfig<TContext>): this;
    action(config: ActionConfig<TContext>): this {
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
