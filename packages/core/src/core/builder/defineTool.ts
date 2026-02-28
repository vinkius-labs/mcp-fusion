/**
 * defineTool() — High-Level Tool Definition (Vercel/Stripe Style)
 *
 * The recommended entry point for building MCP tools. Write a plain
 * JSON-like config object — zero Zod imports, zero builder patterns.
 * The framework converts everything to Zod schemas internally.
 *
 * @example
 * ```typescript
 * import { defineTool, success } from '@vinkius-core/mcp-fusion';
 *
 * export const projects = defineTool('projects', {
 *     description: 'Manage workspace projects',
 *     shared: { workspace_id: 'string' },
 *     actions: {
 *         list:   { readOnly: true, handler: async (ctx, args) => success([]) },
 *         create: { params: { name: 'string' }, handler: async (ctx, args) => success(args.name) },
 *     },
 * });
 * ```
 *
 * @see {@link createTool} for the power-user builder API
 * @see {@link ToolRegistry} for registering tools
 *
 * @module
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { GroupedToolBuilder } from './GroupedToolBuilder.js';
import { type ToolResponse, type MiddlewareFn, type ActionConfig } from '../types.js';
import { type MiddlewareDefinition, resolveMiddleware } from '../middleware/ContextDerivation.js';
import { type Presenter } from '../../presenter/Presenter.js';
import {
    convertParamsToZod,
    type ParamsMap,
    type InferParams,
} from './ParamDescriptors.js';
import { isZodSchema } from '../schema/SchemaUtils.js';

// ============================================================================
// Config Types
// ============================================================================

/**
 * Action definition within a `defineTool()` config.
 *
 * When `params` is provided as a `ParamsMap`, the handler's `args` are
 * automatically typed as `InferParams<TParams> & TSharedArgs`.
 * When `params` is a ZodObject, use `z.infer<typeof schema>` for manual typing.
 *
 * @typeParam TContext - Application context type
 * @typeParam TSharedArgs - Shared args inherited from ToolConfig.shared
 * @typeParam TParams - Action-specific params (inferred from the params field)
 */
export interface ActionDef<TContext, TSharedArgs = Record<string, never>, TParams extends ParamsMap = ParamsMap> {
    /** Human-readable description for the LLM */
    description?: string;
    /** Parameter definitions (JSON descriptors or Zod schema) */
    params?: TParams | ZodObject<ZodRawShape>;
    /** Mark as read-only (no side effects) */
    readOnly?: boolean;
    /** Mark as destructive (irreversible) */
    destructive?: boolean;
    /** Mark as idempotent (safe to retry) */
    idempotent?: boolean;
    /** Common schema fields to omit for this action */
    omitCommon?: string[];
    /** MVA Presenter — when set, handler returns raw data instead of ToolResponse */
    returns?: Presenter<unknown>;
    /** The handler function — args are fully typed when params is specified */
    handler: (
        ctx: TContext,
        args: TParams extends ParamsMap
            ? (keyof TParams extends never ? TSharedArgs & Record<string, unknown> : InferParams<TParams> & TSharedArgs)
            : TSharedArgs & Record<string, unknown>,
    ) => Promise<ToolResponse>;
}

/**
 * Group definition within a `defineTool()` config.
 *
 * @typeParam TContext - Application context type
 * @typeParam TSharedArgs - Inferred shared args type
 */
export interface GroupDef<TContext, TSharedArgs = Record<string, never>> {
    /** Human-readable group description */
    description?: string;
    /** Common schema fields to omit for all actions in this group */
    omitCommon?: string[];
    /** Group-scoped middleware (accepts both MiddlewareFn and MiddlewareDefinition) */
    middleware?: (MiddlewareFn<TContext> | MiddlewareDefinition<TContext, Record<string, unknown>>)[];
    /** Actions within this group — each action's params are inferred independently */
    actions: { [K in string]: ActionDef<TContext, TSharedArgs> };
}

/**
 * Full `defineTool()` configuration.
 *
 * @typeParam TContext - Application context type
 * @typeParam TShared - Shared params map type
 */
export interface ToolConfig<TContext, TShared extends ParamsMap = ParamsMap> {
    /** Tool description for the LLM */
    description?: string;
    /** Capability tags for filtering */
    tags?: string[];
    /** Discriminator field name (default: 'action') */
    discriminator?: string;
    /** Use TOON-formatted descriptions */
    toonDescription?: boolean;
    /** Parameters shared across all actions */
    shared?: TShared | ZodObject<ZodRawShape>;
    /** Global middleware applied to all actions (accepts both MiddlewareFn and MiddlewareDefinition) */
    middleware?: (MiddlewareFn<TContext> | MiddlewareDefinition<TContext, Record<string, unknown>>)[];
    /** MCP tool annotations (e.g. `{ readOnlyHint: true, openWorldHint: true }`) */
    annotations?: Record<string, unknown>;
    /** Flat actions — each action's params are inferred independently */
    actions?: { [K in string]: ActionDef<TContext, InferParams<TShared>> };
    /** Hierarchical groups (mutually exclusive with `actions`) */
    groups?: { [K in string]: GroupDef<TContext, InferParams<TShared>> };
}

// ============================================================================
// TypeScript DX Utilities
// ============================================================================

/** Expected return type for handlers */
export type ExpectedHandlerReturnType = Promise<ToolResponse> | AsyncGenerator<unknown, ToolResponse, unknown>;

/**
 * Utility type to force a readable, localized TypeScript error if a handler
 * does not return exactly `ToolResponse` or `AsyncGenerator<..., ToolResponse, ...>`.
 */
export type ValidateActionDef<TAction> = TAction extends { handler: (...args: unknown[]) => infer R }
    ? [R] extends [ExpectedHandlerReturnType]
        ? TAction
        : Omit<TAction, 'handler'> & {
              handler: "❌ Type Error: handler must return ToolResponse. Use return success(data) or return error(msg).";
          }
    : TAction;

/**
 * Deep validation of the tool config to intercept handler return types
 * and provide readable errors without causing 50-line RecursiveBuilder issues.
 */
export type ValidateConfig<C> = C extends ToolConfig<infer _TContext, infer _TShared>
    ? {
          [K in keyof C]: K extends 'actions'
              ? { [A in keyof C['actions']]: ValidateActionDef<C['actions'][A]> }
              : K extends 'groups'
              ? {
                    [G in keyof C['groups']]: {
                        [GK in keyof C['groups'][G]]: GK extends 'actions'
                            ? { [A in keyof NonNullable<C['groups']>[G]['actions']]: ValidateActionDef<NonNullable<C['groups']>[G]['actions'][A]> }
                            : NonNullable<C['groups']>[G][GK];
                    };
                }
              : C[K];
      }
    : C;

// ============================================================================
// defineTool()
// ============================================================================

/**
 * Resolve params: if ParamsMap → convertParamsToZod, if ZodObject → passthrough.
 * @internal
 */
function resolveSchema(
    params: ParamsMap | ZodObject<ZodRawShape> | undefined,
): ZodObject<ZodRawShape> | undefined {
    if (!params) return undefined;
    if (isZodSchema(params)) return params;
    return convertParamsToZod(params);
}

/**
 * Define a tool using a high-level JSON-like config.
 *
 * This is the recommended entry point for most developers.
 * The framework handles all Zod schema creation, validation,
 * and MCP protocol details internally.
 *
 * @example
 * ```typescript
 * const echo = defineTool('echo', {
 *     actions: {
 *         say: {
 *             params: { message: 'string' },
 *             handler: async (ctx, args) => success(args.message),
 *         },
 *     },
 * });
 *
 * // Tool with shared params + groups + middleware
 * const platform = defineTool<AppContext>('platform', {
 *     description: 'Platform management',
 *     tags: ['admin'],
 *     shared: { workspace_id: { type: 'string', description: 'Workspace ID' } },
 *     middleware: [requireAuth],
 *     groups: {
 *         users: {
 *             description: 'User management',
 *             actions: {
 *                 list: { readOnly: true, handler: listUsers },
 *                 ban:  { destructive: true, params: { user_id: 'string' }, handler: banUser },
 *             },
 *         },
 *     },
 * });
 *
 * // Register normally
 * const registry = new ToolRegistry<AppContext>();
 * registry.register(platform);
 * ```
 *
 * @see {@link createTool} for the power-user builder API
 * @see {@link ToolRegistry.register} for registration
 */
export function defineTool<TContext = void>(
    name: string,
    config: ToolConfig<TContext>,
): GroupedToolBuilder<TContext> {
    const { description, tags, discriminator, toonDescription, annotations,
            shared, middleware, actions, groups } = config;

    // ── Guard: actions and groups are mutually exclusive ──
    if (actions && groups) {
        throw new Error(
            `defineTool("${name}"): "actions" and "groups" are mutually exclusive. ` +
            `Use "actions" for flat tools OR "groups" for hierarchical tools, not both.`
        );
    }

    const builder = new GroupedToolBuilder<TContext>(name);

    // ── Builder configuration (declarative) ──
    if (description) builder.description(description);
    if (tags != null && tags.length > 0) builder.tags(...tags);
    if (discriminator) builder.discriminator(discriminator);
    if (toonDescription) builder.toonDescription();
    if (annotations) builder.annotations(annotations);

    const sharedSchema = resolveSchema(shared);
    if (sharedSchema) builder.commonSchema(sharedSchema);

    middleware?.forEach(mw => builder.use(resolveMiddleware(mw)));

    // ── Register actions/groups ──
    if (actions) {
        for (const [actionName, actionDef] of Object.entries(actions)) {
            builder.action(buildActionConfig(actionName, actionDef));
        }
    }

    if (groups) {
        for (const [groupName, groupDef] of Object.entries(groups)) {
            registerGroup(builder, groupName, groupDef);
        }
    }

    return builder;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Build an ActionConfig from an ActionDef — single source of truth
 * for translating high-level descriptors to builder config.
 * @internal
 */
function buildActionConfig<TContext>(
    actionName: string,
    def: ActionDef<TContext, Record<string, unknown>>,
): ActionConfig<TContext> {
    const schema = resolveSchema(def.params);

    return {
        name: actionName,
        handler: def.handler,
        ...(def.description && { description: def.description }),
        ...(schema && { schema }),
        ...(def.readOnly !== undefined && { readOnly: def.readOnly }),
        ...(def.destructive !== undefined && { destructive: def.destructive }),
        ...(def.idempotent !== undefined && { idempotent: def.idempotent }),
        ...((def.omitCommon?.length ?? 0) > 0 && { omitCommon: def.omitCommon }),
        ...(def.returns && { returns: def.returns }),
    } as ActionConfig<TContext>;
}

/**
 * Register a group with its actions on a builder.
 * @internal
 */
function registerGroup<TContext>(
    builder: GroupedToolBuilder<TContext>,
    groupName: string,
    def: GroupDef<TContext, Record<string, unknown>>,
): void {
    builder.group(groupName, def.description ?? '', g => {
        if (def.omitCommon != null && def.omitCommon.length > 0) {
            g.omitCommon(...def.omitCommon);
        }

        def.middleware?.forEach(mw => g.use(resolveMiddleware(mw)));

        for (const [actionName, actionDef] of Object.entries(def.actions)) {
            g.action(buildActionConfig(actionName, actionDef));
        }
    });
}

