/**
 * defineMiddleware() — Context Derivation (tRPC-style)
 *
 * Middlewares that return data have that data merged into the context
 * for downstream handlers. TypeScript infers the derived context type
 * automatically, so removing a middleware causes a compile error
 * if the handler accesses properties that middleware provided.
 *
 * @example
 * ```typescript
 * const requireAuth = defineMiddleware(async (ctx: BaseCtx) => {
 *     const user = await db.getUser(ctx.token);
 *     if (!user) throw new Error('Unauthorized');
 *     return { user };  // ← TS infers: { user: User }
 * });
 *
 * const billing = defineTool('billing', {
 *     middleware: [requireAuth],
 *     actions: {
 *         refund: {
 *             handler: async (ctx, args) => {
 *                 // ctx.user EXISTS and is typed! ✅
 *                 return success(`Refunded by ${ctx.user.id}`);
 *             },
 *         },
 *     },
 * });
 * ```
 *
 * @module
 */
import { type MiddlewareFn } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A middleware definition that derives additional context.
 *
 * The `derive` function receives the current context and returns
 * an object whose properties are merged into the context for
 * downstream middleware and the final handler.
 *
 * @typeParam TContextIn - The input context type
 * @typeParam TDerived - The derived properties to merge
 */
export interface MiddlewareDefinition<TContextIn, TDerived extends Record<string, unknown>> {
    /** Brand for type discrimination */
    readonly __brand: 'MiddlewareDefinition';
    /** The derive function */
    readonly derive: (ctx: TContextIn) => Promise<TDerived> | TDerived;
    /**
     * Convert to a standard MiddlewareFn for use in existing pipelines.
     * The derived properties are merged into `ctx` before calling `next()`.
     */
    readonly toMiddlewareFn: () => MiddlewareFn<TContextIn>;
}

/**
 * Utility type: merge a base context with derived properties.
 *
 * @example
 * ```typescript
 * type Base = { token: string };
 * type Derived = { user: User };
 * type Result = MergeContext<Base, Derived>;
 * // Result = { token: string; user: User }
 * ```
 */
export type MergeContext<TBase, TDerived> = TBase & TDerived;

/**
 * Utility type: infer the output context from a MiddlewareDefinition.
 *
 * @example
 * ```typescript
 * const auth = defineMiddleware(async (ctx: Base) => ({ user }));
 * type Ctx = InferContextOut<Base, typeof auth>;
 * // Ctx = Base & { user: User }
 * ```
 */
export type InferContextOut<
    TContextIn,
    TMw extends MiddlewareDefinition<TContextIn, Record<string, unknown>>,
> = TMw extends MiddlewareDefinition<TContextIn, infer TDerived> ? TContextIn & TDerived : never;

// ============================================================================
// defineMiddleware()
// ============================================================================

/**
 * Define a context-deriving middleware.
 *
 * The returned object can be used in two ways:
 * 1. As a type-level constraint (the generics carry the derived context)
 * 2. As a runtime middleware via `.toMiddlewareFn()` (for the existing pipeline)
 *
 * @typeParam TContextIn - The input context type
 * @typeParam TDerived - Auto-inferred derived properties
 * @param derive - Function that inspects context and returns derived data
 * @returns A {@link MiddlewareDefinition} with the derived type encoded
 *
 * @example
 * ```typescript
 * // Auth middleware that derives `user`
 * const requireAuth = defineMiddleware(async (ctx: { token: string }) => {
 *     const user = await db.getUser(ctx.token);
 *     if (!user) throw new Error('Unauthorized');
 *     return { user };
 * });
 *
 * // Rate limit middleware that derives `rateLimitInfo`
 * const rateLimit = defineMiddleware(async (ctx: { ip: string }) => {
 *     const info = await checkRateLimit(ctx.ip);
 *     if (info.exceeded) throw new Error('Rate limited');
 *     return { rateLimitInfo: info };
 * });
 * ```
 *
 * @see {@link MiddlewareFn} for the standard middleware type
 */
export function defineMiddleware<
    TContextIn,
    TDerived extends Record<string, unknown>,
>(
    derive: (ctx: TContextIn) => Promise<TDerived> | TDerived,
): MiddlewareDefinition<TContextIn, TDerived> {
    const toMiddlewareFn = (): MiddlewareFn<TContextIn> => {
        return async (ctx, args, next) => {
            const derived = await derive(ctx);
            // Merge derived properties into ctx (mutate for zero-alloc)
            Object.assign(ctx as Record<string, unknown>, derived);
            return next();
        };
    };

    return {
        __brand: 'MiddlewareDefinition',
        derive,
        toMiddlewareFn,
    };
}

/**
 * Type guard: check if a value is a MiddlewareDefinition.
 *
 * Used internally to auto-convert MiddlewareDefinitions to MiddlewareFns
 * when passed to `defineTool({ middleware: [...] })`.
 *
 * @internal
 */
export function isMiddlewareDefinition<TContext>(
    value: unknown,
): value is MiddlewareDefinition<TContext, Record<string, unknown>> {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__brand' in value &&
        (value as { __brand: unknown }).__brand === 'MiddlewareDefinition'
    );
}

/**
 * Convert a middleware arg (either MiddlewareFn or MiddlewareDefinition) to MiddlewareFn.
 *
 * @internal
 */
export function resolveMiddleware<TContext>(
    mw: MiddlewareFn<TContext> | MiddlewareDefinition<TContext, Record<string, unknown>>,
): MiddlewareFn<TContext> {
    if (isMiddlewareDefinition<TContext>(mw)) {
        return mw.toMiddlewareFn();
    }
    return mw as MiddlewareFn<TContext>;
}
