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
import { type ToolResponse, type MiddlewareFn } from '../types.js';
import {
    convertParamsToZod,
    type ParamsMap,
    type InferParams,
} from './ParamDescriptors.js';

// ============================================================================
// Config Types
// ============================================================================

/**
 * Action definition within a `defineTool()` config.
 *
 * @typeParam TContext - Application context type
 * @typeParam TArgs - Inferred args type (from params + shared)
 */
export interface ActionDef<TContext, TArgs = Record<string, never>> {
    /** Human-readable description for the LLM */
    description?: string;
    /** Parameter definitions (JSON descriptors or Zod schema) */
    params?: ParamsMap | ZodObject<ZodRawShape>;
    /** Mark as read-only (no side effects) */
    readOnly?: boolean;
    /** Mark as destructive (irreversible) */
    destructive?: boolean;
    /** Mark as idempotent (safe to retry) */
    idempotent?: boolean;
    /** Action-level middleware */
    middleware?: MiddlewareFn<TContext>[];
    /** The handler function */
    handler: (ctx: TContext, args: TArgs) => Promise<ToolResponse>;
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
    /** Group-scoped middleware */
    middleware?: MiddlewareFn<TContext>[];
    /** Actions within this group */
    actions: Record<string, ActionDef<TContext, TSharedArgs & Record<string, unknown>>>;
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
    /** Global middleware applied to all actions */
    middleware?: MiddlewareFn<TContext>[];
    /** Flat actions (mutually exclusive with `groups`) */
    actions?: Record<string, ActionDef<TContext, InferParams<TShared> & Record<string, unknown>>>;
    /** Hierarchical groups (mutually exclusive with `actions`) */
    groups?: Record<string, GroupDef<TContext, InferParams<TShared>>>;
}

// ============================================================================
// TypeScript DX Utilities
// ============================================================================

/** Expected return type for handlers */
export type ExpectedHandlerReturnType = Promise<ToolResponse> | AsyncGenerator<any, ToolResponse, any>;

/**
 * Utility type to force a readable, localized TypeScript error if a handler
 * does not return exactly `ToolResponse` or `AsyncGenerator<..., ToolResponse, ...>`.
 */
export type ValidateActionDef<TAction> = TAction extends { handler: (...args: any[]) => infer R }
    ? [R] extends [ExpectedHandlerReturnType]
        ? TAction
        : Omit<TAction, 'handler'> & {
              handler: "❌ Erro TypeScript: O handler deve retornar um ToolResponse. Utilize return success(data) ou return error(msg).";
          }
    : TAction;

/**
 * Deep validation of the tool config to intercept handler return types
 * and provide readable errors without causing 50-line RecursiveBuilder issues.
 */
export type ValidateConfig<C> = C extends ToolConfig<any, any>
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
 * Check if a value is a Zod schema (has `_def` property).
 * @internal
 */
function isZodSchema(value: unknown): value is ZodObject<ZodRawShape> {
    return typeof value === 'object' && value !== null && '_def' in value;
}

/**
 * Resolve params: if ParamsMap → convertParamsToZod, if ZodObject → passthrough.
 * @internal
 */
function resolveSchema(
    params: ParamsMap | ZodObject<ZodRawShape> | undefined,
): ZodObject<ZodRawShape> | undefined {
    if (!params) return undefined;
    if (isZodSchema(params)) return params;
    return convertParamsToZod(params as ParamsMap);
}

/**
 * Define a tool using a high-level JSON-like config.
 *
 * This is the recommended entry point for most developers.
 * The framework handles all Zod schema creation, validation,
 * and MCP protocol details internally.
 *
export function defineTool<
    TContext = void,
    TShared extends ParamsMap = ParamsMap,
    C extends ToolConfig<TContext, TShared> = ToolConfig<TContext, TShared>
>(
    name: string,
    config: C & ValidateConfig<C>,
): GroupedToolBuilder<TContext> {
    const builder = new GroupedToolBuilder<TContext>(name);
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
    const builder = new GroupedToolBuilder<TContext>(name);

    // ── Optional config ──
    if (config.description) builder.description(config.description);
    if (config.tags?.length) builder.tags(...config.tags);
    if (config.discriminator) builder.discriminator(config.discriminator);
    if (config.toonDescription) builder.toonDescription();

    // ── Shared params (commonSchema) ──
    const sharedSchema = resolveSchema(config.shared as ParamsMap | ZodObject<ZodRawShape> | undefined);
    if (sharedSchema) builder.commonSchema(sharedSchema);

    // ── Global middleware ──
    if (config.middleware) {
        for (const mw of config.middleware) {
            builder.use(mw);
        }
    }

    // ── Flat actions ──
    if (config.actions) {
        for (const [actionName, actionDef] of Object.entries(config.actions)) {
            registerAction(builder, actionName, actionDef);
        }
    }

    // ── Groups ──
    if (config.groups) {
        for (const [groupName, groupDef] of Object.entries(config.groups)) {
            registerGroup(builder, groupName, groupDef);
        }
    }

    return builder;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Register a single action on a builder from an ActionDef.
 * @internal
 */
function registerAction<TContext>(
    target: GroupedToolBuilder<TContext> | { action: GroupedToolBuilder<TContext>['action'] extends (...args: infer _A) => infer _R ? (...args: _A) => _R : never },
    actionName: string,
    def: ActionDef<TContext, Record<string, unknown>>,
): void {
    const schema = resolveSchema(def.params as ParamsMap | ZodObject<ZodRawShape> | undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (target as any).action({
        name: actionName,
        handler: def.handler,
        ...(def.description && { description: def.description }),
        ...(schema && { schema }),
        ...(def.readOnly !== undefined && { readOnly: def.readOnly }),
        ...(def.destructive !== undefined && { destructive: def.destructive }),
        ...(def.idempotent !== undefined && { idempotent: def.idempotent }),
    });
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
        if (def.middleware) {
            for (const mw of def.middleware) {
                g.use(mw);
            }
        }

        for (const [actionName, actionDef] of Object.entries(def.actions)) {
            const schema = resolveSchema(actionDef.params as ParamsMap | ZodObject<ZodRawShape> | undefined);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            g.action({
                name: actionName,
                handler: actionDef.handler,
                ...(actionDef.description && { description: actionDef.description }),
                ...(schema && { schema }),
                ...(actionDef.readOnly !== undefined && { readOnly: actionDef.readOnly }),
                ...(actionDef.destructive !== undefined && { destructive: actionDef.destructive }),
                ...(actionDef.idempotent !== undefined && { idempotent: actionDef.idempotent }),
            } as any);
        }
    });
}
